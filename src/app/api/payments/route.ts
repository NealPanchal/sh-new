import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import { getPayments, addPayment, recordAuditLog, updateChallanPayment } from '@/lib/server-accounting';
import { PaymentRecord, PaymentMode } from '@/types';

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customerId');
  const siteId = searchParams.get('siteId');

  let list = getPayments();
  if (customerId) {
    list = list.filter((p) => p.customer_id === customerId);
  }
  if (siteId) {
    list = list.filter((p) => p.site_id === siteId);
  }

  // Sort newest first
  list.sort((a, b) => new Date(b.payment_date || b.created_at).getTime() - new Date(a.payment_date || a.created_at).getTime());

  return NextResponse.json({ success: true, payments: list });
}

export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Check roles: Employees cannot record payments without permission
  if (session.role === 'employee') {
    return NextResponse.json(
      { success: false, error: 'Permission denied. Staff members cannot record payments without authorization.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      customer_id,
      customer_name,
      site_id,
      site_name,
      challan_id,
      challan_number,
      amount,
      payment_mode,
      payment_date,
      reference_no,
      notes,
    } = body;

    const numAmt = Number(amount);
    if (!numAmt || numAmt <= 0) {
      return NextResponse.json({ success: false, error: 'Valid payment amount is required' }, { status: 400 });
    }
    if (!customer_id || !customer_name) {
      return NextResponse.json({ success: false, error: 'Customer party is required' }, { status: 400 });
    }

    const payments = getPayments();
    const year = new Date().getFullYear();
    const seq = String(payments.length + 1).padStart(4, '0');
    const receipt_number = `BO/REC/${year}/${seq}`;

    // Prevent duplicate payment entry by reference number if provided
    if (reference_no && reference_no.trim()) {
      const dup = payments.find(
        (p) =>
          p.reference_no &&
          p.reference_no.trim().toLowerCase() === reference_no.trim().toLowerCase() &&
          p.customer_id === customer_id
      );
      if (dup) {
        return NextResponse.json(
          { success: false, error: `Duplicate payment detected with reference "${reference_no}"` },
          { status: 409 }
        );
      }
    }

    const newPayment: PaymentRecord = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      receipt_number,
      customer_id,
      customer_name,
      site_id: site_id || null,
      site_name: site_name || null,
      challan_id: challan_id || null,
      challan_number: challan_number || null,
      amount: numAmt,
      payment_mode: (payment_mode as PaymentMode) || 'cash',
      payment_date: payment_date || new Date().toISOString().slice(0, 10),
      reference_no: reference_no || null,
      notes: notes || null,
      created_by: session.name || session.username,
      created_at: new Date().toISOString(),
    };

    addPayment(newPayment);

    // If payment is linked to a challan, update challan payment status
    let updatedChallan = null;
    if (newPayment.challan_id || newPayment.challan_number) {
      updatedChallan = updateChallanPayment(
        newPayment.challan_id || newPayment.challan_number!,
        newPayment.amount,
        newPayment.payment_date
      );
    }

    // Record Audit Log
    recordAuditLog({
      entity_type: 'payment',
      entity_id: newPayment.id,
      reference_no: newPayment.receipt_number,
      user_id: session.username,
      user_name: session.name,
      action: 'RECORD_PAYMENT',
      updated_values: newPayment,
      reason: `Recorded payment of ₹${numAmt.toLocaleString('en-IN')} via ${payment_mode} for ${customer_name}`,
    });

    return NextResponse.json({
      success: true,
      payment: newPayment,
      challan: updatedChallan,
      is_challan_paid: updatedChallan?.payment_status === 'paid',
    });
  } catch (err: any) {
    console.error('Error creating payment:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}

