import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import {
  computeCustomerLedger,
  addManualLedgerEntry,
  deleteManualLedgerEntry,
  deleteLedgerEntry,
  recordAuditLog,
  ManualLedgerEntry,
} from '@/lib/server-accounting';

export async function GET(req: NextRequest) {
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
  const operatorName = session?.name || session?.username || 'Admin SH';

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
      created_by: operatorName,
    };

    addManualLedgerEntry(entry);

    // Auto-save site if provided
    if (site_name && site_name.trim() && customer_id) {
      try {
        const { getCustomerSites, addOrUpdateSite } = await import('@/lib/server-accounting');
        const sites = getCustomerSites();
        const cleanSite = site_name.trim();
        const existing = sites.find(
          (s) => (s.customer_id === customer_id || s.customer_id.toLowerCase() === customer_id.toLowerCase()) &&
                 s.site_name.toLowerCase() === cleanSite.toLowerCase()
        );
        if (!existing) {
          addOrUpdateSite({
            id: `site_${customer_id}_${cleanSite.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
            customer_id,
            site_name: cleanSite,
            site_address: `${cleanSite} Site`,
            opening_balance: 0,
            credit_adjustment: 0,
            debit_adjustment: 0,
            current_balance: 0,
            order_index: sites.length,
            is_verified: true,
            verified_at: new Date().toISOString(),
            verified_by: operatorName,
            is_active: true,
            created_at: new Date().toISOString(),
          });
        }
      } catch (siteErr) {
        console.warn('Auto-save site from manual entry note:', siteErr);
      }
    }

    recordAuditLog({
      entity_type: 'site_adjustment',
      entity_id: entry.id,
      user_id: session?.username || 'adminsh',
      user_name: operatorName,
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
  const operatorRole = session?.role || 'admin';
  const operatorName = session?.name || session?.username || 'Admin SH';

  // Permission check: only admin and accountant can delete ledger records
  if (operatorRole === 'employee') {
    return NextResponse.json(
      { success: false, error: 'Permission denied. Only Admins and Accountants can delete ledger entries.' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || searchParams.get('entryId');
    const sourceType = searchParams.get('sourceType');
    const challanId = searchParams.get('challanId');
    const paymentId = searchParams.get('paymentId');
    const returnId = searchParams.get('returnId');
    const manualId = searchParams.get('manualId');

    // Also parse JSON body if sent via body
    let bodyData: any = {};
    if (req.headers.get('content-type')?.includes('application/json')) {
      bodyData = await req.json().catch(() => ({}));
    }

    const targetId = id || bodyData.id || bodyData.entryId;
    const targetSourceType = sourceType || bodyData.sourceType;
    const targetChallanId = challanId || bodyData.challanId;
    const targetPaymentId = paymentId || bodyData.paymentId;
    const targetReturnId = returnId || bodyData.returnId;
    const targetManualId = manualId || bodyData.manualId;

    if (!targetId && !targetChallanId && !targetPaymentId && !targetReturnId && !targetManualId) {
      return NextResponse.json(
        { success: false, error: 'Entry identifier (id, challanId, paymentId, or manualId) is required' },
        { status: 400 }
      );
    }

    const userLabel = operatorName;
    const res = deleteLedgerEntry(
      {
        entryId: targetId,
        sourceType: targetSourceType,
        challanId: targetChallanId,
        paymentId: targetPaymentId,
        returnId: targetReturnId,
        manualId: targetManualId,
      },
      userLabel
    );

    return NextResponse.json({ success: res.success, deletedType: res.deletedType });
  } catch (err: any) {
    console.error('Error deleting ledger entry:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}
