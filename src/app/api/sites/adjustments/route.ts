import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import {
  getSiteAdjustments,
  addSiteAdjustment,
  computeSiteAccounting,
  recordAuditLog,
} from '@/lib/server-accounting';
import { SiteAdjustment, SiteAdjustmentType } from '@/types';

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get('siteId');
  const siteName = searchParams.get('siteName');
  const customerId = searchParams.get('customerId');
  const summaryOnly = searchParams.get('summary') === 'true';

  if (summaryOnly && siteId && customerId) {
    const summary = computeSiteAccounting(
      siteId,
      siteName || '',
      customerId,
      searchParams.get('customerName') || ''
    );
    return NextResponse.json({ success: true, summary });
  }

  let list = getSiteAdjustments();
  if (siteId) {
    list = list.filter((a) => a.site_id === siteId);
  }
  if (customerId) {
    list = list.filter((a) => a.customer_id === customerId);
  }

  list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return NextResponse.json({ success: true, adjustments: list });
}

export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Permissions check: Employee cannot add adjustments without Accountant/Admin role
  if (session.role === 'employee') {
    return NextResponse.json(
      { success: false, error: 'Permission denied. Only Accountants and Admins can add Plus/Minus adjustments.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { site_id, site_name, customer_id, customer_name, type, amount, reason, reference_no } = body;

    const numAmt = Number(amount);
    if (!numAmt || numAmt <= 0) {
      return NextResponse.json({ success: false, error: 'Valid adjustment amount is required' }, { status: 400 });
    }
    if (!type || (type !== 'plus' && type !== 'minus')) {
      return NextResponse.json({ success: false, error: 'Adjustment type must be either "plus" or "minus"' }, { status: 400 });
    }
    if (!reason || !reason.trim()) {
      return NextResponse.json({ success: false, error: 'Reason/Description is required for adjustment' }, { status: 400 });
    }
    if (!site_id || !site_name) {
      return NextResponse.json({ success: false, error: 'Site details are required' }, { status: 400 });
    }

    const adjustments = getSiteAdjustments();
    const year = new Date().getFullYear();
    const seq = String(adjustments.length + 1).padStart(4, '0');
    const prefix = type === 'plus' ? 'ADJ-PLS' : 'ADJ-MNS';
    const adjustment_number = `BO/${prefix}/${year}/${seq}`;

    const newAdjustment: SiteAdjustment = {
      id: `adj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      adjustment_number,
      site_id,
      site_name,
      customer_id,
      customer_name,
      type: type as SiteAdjustmentType,
      amount: numAmt,
      reason: reason.trim(),
      reference_no: reference_no ? reference_no.trim() : null,
      created_by: session.name || session.username,
      approved_by: session.role === 'admin' ? session.name : null,
      created_at: new Date().toISOString(),
    };

    addSiteAdjustment(newAdjustment);

    // Audit Log
    recordAuditLog({
      entity_type: 'site_adjustment',
      entity_id: newAdjustment.id,
      reference_no: newAdjustment.adjustment_number,
      user_id: session.username,
      user_name: session.name,
      action: type === 'plus' ? 'SITE_PLUS_ADJUSTMENT' : 'SITE_MINUS_ADJUSTMENT',
      updated_values: newAdjustment,
      reason: `${type.toUpperCase()} adjustment of ₹${numAmt.toLocaleString('en-IN')} for site "${site_name}": ${reason}`,
    });

    return NextResponse.json({ success: true, adjustment: newAdjustment });
  } catch (err: any) {
    console.error('Error adding site adjustment:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}

