import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import { getAllCustomers, saveCustomers, recordAuditLog } from '@/lib/server-accounting';
import { Customer } from '@/types';

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('search') || '').toLowerCase().trim();

  let list = getAllCustomers();
  if (search) {
    list = list.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(search)) ||
        (c.business_name && c.business_name.toLowerCase().includes(search)) ||
        (c.phone && c.phone.includes(search)) ||
        (c.billing_address && c.billing_address.toLowerCase().includes(search))
    );
  }

  return NextResponse.json({ success: true, customers: list });
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
      name,
      business_name,
      company_name,
      contact_person,
      phone,
      billing_address,
      delivery_address,
      gstin,
      opening_balance,
      credit_limit,
      credit_days,
      notes,
    } = body;

    const custName = (name || business_name || company_name || '').trim();
    if (!custName) {
      return NextResponse.json(
        { success: false, error: 'Customer name is required' },
        { status: 400 }
      );
    }

    const customers = getAllCustomers();
    const custId =
      id || `cust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const existingIdx = customers.findIndex((c) => c.id === custId);
    const record: Customer = {
      id: custId,
      user_id: session.username || 'admin',
      name: custName,
      business_name: custName,
      company_name: company_name ? company_name.trim() : custName,
      contact_person: contact_person ? contact_person.trim() : custName,
      phone: (phone || '').trim(),
      billing_address: (billing_address || '').trim(),
      delivery_address: (delivery_address || billing_address || '').trim(),
      gstin: gstin ? gstin.trim().toUpperCase() : null,
      opening_balance: Number(opening_balance) || 0,
      credit_limit: Number(credit_limit) || 200000,
      credit_days: Number(credit_days) || 45,
      notes: notes ? notes.trim() : null,
      is_active: true,
      created_at: existingIdx >= 0 ? customers[existingIdx].created_at : now,
      updated_at: now,
    };

    if (existingIdx >= 0) {
      customers[existingIdx] = record;
    } else {
      customers.push(record);
    }

    saveCustomers(customers);

    recordAuditLog({
      entity_type: 'customer',
      entity_id: record.id,
      user_id: session.username,
      user_name: session.name,
      action: existingIdx >= 0 ? 'UPDATE_CUSTOMER' : 'CREATE_CUSTOMER',
      updated_values: record,
      reason: `Customer "${custName}" ${existingIdx >= 0 ? 'updated' : 'created'} in party master`,
    });

    return NextResponse.json({ success: true, customer: record });
  } catch (err: any) {
    console.error('Error saving customer:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Server error' },
      { status: 500 }
    );
  }
}
