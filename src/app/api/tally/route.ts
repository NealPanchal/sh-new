import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import {
  getTallyPartyMappings,
  saveTallyPartyMappings,
  getTallySyncLogs,
  addTallySyncLog,
  getAllChallans,
  getPayments,
  getGoodsReturns,
  generateTallyPrimeXml,
  recordAuditLog,
} from '@/lib/server-accounting';
import { TallyPartyMapping, TallySyncLog } from '@/types';
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

  // Tally Integration is Admin Only
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Permission denied. Tally Integration is restricted to Administrators.' },
      { status: 403 }
    );
  }

  const mappings = getTallyPartyMappings();
  const logs = getTallySyncLogs();
  const settings = getSettings();

  const challans = getAllChallans();
  const payments = getPayments();
  const returns = getGoodsReturns();

  // Summary counts
  const totalVouchers = challans.length + payments.length + returns.length;
  const syncedCount = logs.filter((l) => l.status === 'success').length;
  const pendingCount = Math.max(0, totalVouchers - syncedCount);
  const failedCount = logs.filter((l) => l.status === 'failed').length;

  return NextResponse.json({
    success: true,
    tallyConfig: {
      serverUrl: settings.tally_server_url || 'http://localhost:9000',
      companyName: settings.tally_company_name || settings.business_name || 'SHOWHOUSE',
    },
    mappings,
    logs: logs.slice(0, 100),
    stats: {
      totalVouchers,
      syncedCount,
      pendingCount,
      failedCount,
    },
  });
}

export async function POST(req: NextRequest) {
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

  try {
    const body = await req.json();
    const { action } = body;

    // Action 1: Map Customer to Tally Ledger
    if (action === 'map_party') {
      const { customer_id, customer_name, tally_ledger_name } = body;
      const mappings = getTallyPartyMappings();
      const existing = mappings.find((m) => m.customer_id === customer_id);

      if (existing) {
        existing.tally_ledger_name = tally_ledger_name;
        existing.last_synced_at = new Date().toISOString();
      } else {
        mappings.push({
          customer_id,
          customer_name,
          tally_ledger_name,
          is_synced: true,
          last_synced_at: new Date().toISOString(),
        });
      }

      saveTallyPartyMappings(mappings);
      return NextResponse.json({ success: true, mappings });
    }

    // Action 2: Trigger Direct Sync to Local Tally Server (HTTP XML)
    if (action === 'sync_tally') {
      const settings = getSettings();
      const tallyUrl = body.serverUrl || settings.tally_server_url || 'http://localhost:9000';
      const companyName = body.companyName || settings.tally_company_name || 'SHOWHOUSE';

      const challans = getAllChallans().filter((c) => !c.is_deleted && c.status !== 'cancelled');
      const payments = getPayments();
      const returns = getGoodsReturns();

      const xml = generateTallyPrimeXml({
        challans,
        payments,
        goodsReturns: returns,
        companyName,
      });

      let syncSuccess = false;
      let errorMessage = '';

      try {
        const response = await fetch(tallyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml;charset=utf-8',
          },
          body: xml,
          signal: AbortSignal.timeout(6000), // 6 seconds timeout
        });

        if (response.ok) {
          const respText = await response.text();
          syncSuccess = respText.includes('<STATUS>1</STATUS>') || respText.includes('<CREATED>') || respText.includes('RESPONSE');
          if (!syncSuccess) {
            errorMessage = 'Tally returned non-zero response status. Verify Company is open in TallyPrime.';
          }
        } else {
          errorMessage = `HTTP error from Tally: ${response.status} ${response.statusText}`;
        }
      } catch (err: any) {
        errorMessage = `Could not connect to Tally server at ${tallyUrl}. Ensure TallyPrime is running with ODBC/XML port enabled, or use "Export Tally XML" to import manually.`;
      }

      const logRecord: TallySyncLog = {
        id: `tlog_${Date.now()}`,
        timestamp: new Date().toISOString(),
        voucher_type: 'Sales',
        reference_no: `Batch_${new Date().toISOString().slice(0, 10)}`,
        party_name: 'All Parties',
        amount: challans.reduce((s, c) => s + (Number(c.total_amount) || 0), 0),
        status: syncSuccess ? 'success' : 'failed',
        error_message: errorMessage || null,
      };

      addTallySyncLog(logRecord);

      recordAuditLog({
        entity_type: 'challan',
        entity_id: 'tally_sync_job',
        user_id: session.username,
        user_name: session.name,
        action: 'TALLY_SYNC_ATTEMPT',
        updated_values: logRecord,
        reason: syncSuccess ? 'Synchronized vouchers with TallyPrime' : `Sync failed: ${errorMessage}`,
      });

      return NextResponse.json({
        success: syncSuccess,
        connected: syncSuccess,
        message: syncSuccess ? 'Successfully synchronized with TallyPrime!' : errorMessage,
        log: logRecord,
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('Error in Tally integration:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}

