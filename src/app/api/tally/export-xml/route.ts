import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import {
  getAllChallans,
  getPayments,
  getGoodsReturns,
  generateTallyPrimeXml,
  recordAuditLog,
} from '@/lib/server-accounting';
import fs from 'fs';
import path from 'path';

function getSettings() {
  try {
    const p = path.join(process.cwd(), 'data', 'settings.json');
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Permission denied. Administrator access required.' },
      { status: 403 }
    );
  }

  const settings = getSettings();
  const companyName = settings.tally_company_name || settings.business_name || 'SHOWHOUSE';

  const challans = getAllChallans().filter((c) => !c.is_deleted && c.status !== 'cancelled');
  const payments = getPayments();
  const goodsReturns = getGoodsReturns();

  const xml = generateTallyPrimeXml({
    challans,
    payments,
    goodsReturns,
    companyName,
  });

  recordAuditLog({
    entity_type: 'challan',
    entity_id: 'tally_export_xml',
    user_id: session.username,
    user_name: session.name,
    action: 'EXPORT_TALLY_XML',
    reason: `Generated and downloaded TallyPrime XML for ${companyName} (${challans.length} sales, ${payments.length} receipts, ${goodsReturns.length} credit notes)`,
  });

  const filename = `TallyPrime_Export_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xml`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

