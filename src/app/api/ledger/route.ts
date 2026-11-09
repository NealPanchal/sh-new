import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import {
  computeCustomerLedger,
  addManualLedgerEntry,
  deleteManualLedgerEntry,
  recordAuditLog,
  ManualLedgerEntry,
} from '@/lib/server-accounting';

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customerId');
  const siteId = searchParams.get('siteId') || undefined;
  const siteName = searchParams.get('siteName') || undefined;
  const fromDate = searchParams.get('fromDate') || undefined;
  const toDate = searchParams.get('toDate') || undefined;
  const typeFilter = searchParams.get('type') || undefined;

  if (!customerId) {
    return NextResponse.json({ success: false, error: 'Customer ID is required' }, { status: 400 });
  }

  try {
    const result = computeCustomerLedger(customerId, {
      siteId,
      siteName,
      fromDate,
      toDate,
      typeFilter,
    });

    return NextResponse.json({ success: true, ledger: result });
  } catch (err: any) {
    console.error('Error computing ledger:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { customer_id, date, particulars, payment_type, voucher_no, debit, credit, site_name, challan_id } = body;

    if (!customer_id || !particulars || (!debit && !credit)) {
      return NextResponse.json(
        { success: false, error: 'Customer, Particulars, and Debit/Credit amount are required' },
        { status: 400 }
      );
    }

    const entry: ManualLedgerEntry = {
      id: `mle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      customer_id,
      date: date || new Date().toISOString().slice(0, 10),
      particulars: particulars.trim(),
      payment_type: payment_type || (debit > 0 ? 'Sales GST' : 'Receipt'),
      voucher_no: voucher_no ? voucher_no.trim() : `VCH-${Date.now().toString().slice(-4)}`,
      debit: Number(debit) || 0,
      credit: Number(credit) || 0,
      site_name: site_name ? site_name.trim() : undefined,
      challan_id: challan_id ? challan_id.trim() : undefined,
      created_at: new Date().toISOString(),
      created_by: session.name || session.username,
    };

    addManualLedgerEntry(entry);

    recordAuditLog({
      entity_type: 'site_adjustment',
      entity_id: entry.id,
      user_id: session.username,
      user_name: session.name,
      action: 'ADD_LEDGER_ENTRY',
      updated_values: entry,
      reason: `Manual ledger entry [${entry.payment_type}] ${entry.voucher_no} - ₹${(entry.debit || entry.credit).toLocaleString('en-IN')}`,
    });

    return NextResponse.json({ success: true, entry });
  } catch (err: any) {
    console.error('Error adding ledger entry:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ success: false, error: 'Entry ID is required' }, { status: 400 });
  }

  const ok = deleteManualLedgerEntry(id);
  return NextResponse.json({ success: ok });
}
