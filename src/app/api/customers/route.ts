import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import { getAllCustomers, saveCustomers, recordAuditLog } from '@/lib/server-accounting';
import { Customer } from '@/types';

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('search') || '').toLowerCase().trim();
  const creator = (searchParams.get('creator') || '').toLowerCase().trim();
  const type = (searchParams.get('type') || '').toLowerCase().trim();

  let list = getAllCustomers();

  // Strict employee data isolation
  if (session && session.role === 'employee') {
    const uName = (session.name || '').toLowerCase().trim();
    const uUser = (session.username || '').toLowerCase().trim();
    list = list.filter((c) => {
      const cr = (c.created_by || '').toLowerCase();
      const crN = (c.creator_name || '').toLowerCase();
      const uId = (c.user_id || '').toLowerCase();
      return (
        (uUser && (cr === uUser || uId === uUser)) ||
        (uName && (cr.includes(uName) || crN.includes(uName) || uId.includes(uName)))
      );
    });
  } else if (creator && creator !== 'all') {
    list = list.filter((c) => {
      const cr = (c.created_by || '').toLowerCase();
      const crN = (c.creator_name || '').toLowerCase();
      return cr === creator || crN === creator || crN.includes(creator);
    });
  }

  // Filter by customer type (e.g. 'architect' or 'client')
  if (type && type !== 'all') {
    if (type === 'architect') {
      list = list.filter((c) => c.customer_type === 'architect' || c.is_architect === true);
    } else if (type === 'client') {
      list = list.filter((c) => c.customer_type !== 'architect' && !c.is_architect);
    }
  }

  if (search) {
    list = list.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(search)) ||
        (c.business_name && c.business_name.toLowerCase().includes(search)) ||
        (c.contact_person && c.contact_person.toLowerCase().includes(search)) ||
        (c.phone && c.phone.includes(search)) ||
        (c.billing_address && c.billing_address.toLowerCase().includes(search)) ||
        (c.architect_firm && c.architect_firm.toLowerCase().includes(search))
    );
  }

  return NextResponse.json({ success: true, customers: list });
}

export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  const operatorName = session?.name || session?.username || 'Admin SH';
  const operatorUsername = session?.username || 'admin';

  try {
    const body = await req.json();
    const {
      id,
      name,
      business_name,
      company_name,
      contact_person,
      phone,
      email,
      customer_type,
      is_architect,
      architect_firm,
      created_by,
      creator_name,
      billing_address,
      delivery_address,
      gstin,
      opening_balance,
      credit_limit,
      credit_days,
      notes,
      material_rates,
      sites,
    } = body;

    const custName = (name || business_name || company_name || contact_person || '').trim();
    if (!custName) {
      return NextResponse.json(
        { success: false, error: 'Contact person or customer name is required' },
        { status: 400 }
      );
    }

    const customers = getAllCustomers();
    const custId =
      id || `cust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const existingIdx = customers.findIndex((c) => c.id === custId);
    const prevRecord = existingIdx >= 0 ? customers[existingIdx] : null;

    const assignedCreator = (created_by || prevRecord?.created_by || operatorUsername).trim();
    const assignedCreatorName = (creator_name || prevRecord?.creator_name || operatorName).trim();
    const isArch = Boolean(is_architect || customer_type === 'architect');

    const record: Customer = {
      id: custId,
      user_id: assignedCreator,
      created_by: assignedCreator,
      creator_name: assignedCreatorName,
      name: custName,
      business_name: custName,
      company_name: company_name ? company_name.trim() : custName,
      contact_person: contact_person ? contact_person.trim() : custName,
      phone: (phone || '').trim(),
      email: email ? email.trim() : prevRecord?.email || null,
      customer_type: isArch ? 'architect' : 'client',
      is_architect: isArch,
      architect_firm: isArch ? (architect_firm?.trim() || custName) : null,
      billing_address: (billing_address || '').trim(),
      delivery_address: (delivery_address || billing_address || '').trim(),
      gstin: gstin ? gstin.trim().toUpperCase() : null,
      opening_balance: Number(opening_balance) || 0,
      credit_limit: Number(credit_limit) || 200000,
      credit_days: Number(credit_days) || 45,
      notes: notes ? notes.trim() : null,
      sites: Array.isArray(sites)
        ? sites
        : existingIdx >= 0 && Array.isArray(customers[existingIdx].sites)
        ? customers[existingIdx].sites
        : undefined,
      material_rates: Array.isArray(material_rates)
        ? material_rates
        : existingIdx >= 0
        ? customers[existingIdx].material_rates
        : [],
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
      user_id: operatorUsername,
      user_name: operatorName,
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
