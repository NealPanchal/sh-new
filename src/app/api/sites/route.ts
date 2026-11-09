import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import {
  getCustomerSites,
  getSitesByCustomerId,
  addOrUpdateSite,
  verifyCustomerSite,
  unverifyCustomerSite,
  updateCustomerSiteBalances,
  deleteCustomerSite,
  recordAuditLog,
} from '@/lib/server-accounting';
import { CustomerSite } from '@/types';

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customerId');

  let list: CustomerSite[] = [];
  if (customerId) {
    list = getSitesByCustomerId(customerId);
  } else {
    list = getCustomerSites();
  }

  return NextResponse.json({ success: true, sites: list });
}

export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      id,
      customer_id,
      site_name,
      site_address,
      contact_person,
      phone,
      opening_balance,
      credit_adjustment,
      debit_adjustment,
    } = body;

    if (!customer_id || !site_name) {
      return NextResponse.json(
        { success: false, error: 'Customer ID and Site Name are required' },
        { status: 400 }
      );
    }

    const siteId =
      id || `site_${customer_id}_${site_name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
    const opening = Number(opening_balance) || 0;
    const credit = Number(credit_adjustment) || 0;
    const debit = Number(debit_adjustment) || 0;

    const record: CustomerSite = {
      id: siteId,
      customer_id,
      site_name: site_name.trim(),
      site_address: (site_address || `${site_name} Site, Thane`).trim(),
      contact_person: contact_person ? contact_person.trim() : undefined,
      phone: phone ? phone.trim() : undefined,
      opening_balance: opening,
      credit_adjustment: credit,
      debit_adjustment: debit,
      current_balance: opening + debit - credit,
      is_verified: true, // Default verified on create so it directly applies
      verified_at: new Date().toISOString(),
      verified_by: session.name || session.username,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    const saved = addOrUpdateSite(record);

    recordAuditLog({
      entity_type: 'site_adjustment',
      entity_id: saved.id,
      user_id: session.username,
      user_name: session.name,
      action: id ? 'UPDATE_SITE' : 'CREATE_SITE',
      updated_values: saved,
      reason: `Saved site "${saved.site_name}" for customer ${customer_id}`,
    });

    return NextResponse.json({ success: true, site: saved });
  } catch (err: any) {
    console.error('Error saving site:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { siteId, action, reason, site_name, opening_balance, credit_adjustment, debit_adjustment } = body;

    if (!siteId) {
      return NextResponse.json({ success: false, error: 'Site ID is required' }, { status: 400 });
    }

    const userName = session.name || session.username;

    if (action === 'verify') {
      const site = verifyCustomerSite(siteId, userName);
      return NextResponse.json({ success: true, site });
    }

    if (action === 'unverify') {
      const site = unverifyCustomerSite(siteId, userName, reason);
      return NextResponse.json({ success: true, site });
    }

    // Direct balance update
    const site = updateCustomerSiteBalances(
      siteId,
      {
        site_name,
        opening_balance,
        credit_adjustment,
        debit_adjustment,
      },
      userName
    );

    return NextResponse.json({ success: true, site });
  } catch (err: any) {
    console.error('Error updating site balance:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get('id');

  if (!siteId) {
    return NextResponse.json({ success: false, error: 'Site ID is required' }, { status: 400 });
  }

  const ok = deleteCustomerSite(siteId, session.name || session.username);
  return NextResponse.json({ success: ok });
}
