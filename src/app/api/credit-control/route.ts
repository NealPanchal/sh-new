import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import {
  checkCustomerCreditStatus,
  grantCreditException,
  getCreditExceptions,
  getAllChallans,
  recordAuditLog,
} from '@/lib/server-accounting';
import { CreditException, Customer } from '@/types';
import fs from 'fs';
import path from 'path';

function getCustomersFile(): Customer[] {
  try {
    const p = path.join(process.cwd(), 'data', 'customers.json');
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return [];
  }
}

function saveCustomersFile(custs: Customer[]): void {
  try {
    const p = path.join(process.cwd(), 'data', 'customers.json');
    fs.writeFileSync(p, JSON.stringify(custs, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving customers.json:', err);
  }
}

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customerId');

  const customers = getCustomersFile();
  const allChallans = getAllChallans();

  if (customerId) {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) {
      return NextResponse.json({
        success: true,
        status: {
          customerId,
          customerName: 'Unknown',
          creditDays: 45,
          creditLimit: 200000,
          totalOutstanding: 0,
          isOverdue: false,
          daysOverdue: 0,
          isOverLimit: false,
          isBlocked: false,
          hasException: false,
        },
      });
    }

    const status = checkCustomerCreditStatus(customer, allChallans);
    return NextResponse.json({ success: true, status });
  }

  // Evaluate status for all customers
  const list = customers.map((c) => checkCustomerCreditStatus(c, allChallans));
  const exceptions = getCreditExceptions();

  return NextResponse.json({
    success: true,
    statuses: list,
    exceptions,
  });
}

export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Only Admin can manage credit exceptions and blocks
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Permission denied. Only Administrators can manage credit limits and exceptions.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'grant_exception') {
      const { customer_id, customer_name, reason, expiry_days } = body;
      if (!customer_id || !reason) {
        return NextResponse.json({ success: false, error: 'Customer ID and reason are required' }, { status: 400 });
      }

      const days = Number(expiry_days) || 7; // Default 7 days temporary exception
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      const newException: CreditException = {
        id: `crex_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        customer_id,
        customer_name: customer_name || 'Customer',
        authorized_by: session.name || session.username,
        reason: reason.trim(),
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      };

      grantCreditException(newException);

      recordAuditLog({
        entity_type: 'credit_control',
        entity_id: customer_id,
        user_id: session.username,
        user_name: session.name,
        action: 'GRANT_CREDIT_EXCEPTION',
        updated_values: newException,
        reason: `Granted ${days}-day credit exception for ${customer_name}: ${reason}`,
      });

      return NextResponse.json({ success: true, exception: newException });
    }

    if (action === 'toggle_block') {
      const { customer_id, is_blocked, reason } = body;
      const customers = getCustomersFile();
      const idx = customers.findIndex((c) => c.id === customer_id);
      if (idx >= 0) {
        customers[idx].is_credit_blocked = Boolean(is_blocked);
        customers[idx].credit_block_reason = is_blocked ? reason || 'Administrative block' : undefined;
        saveCustomersFile(customers);

        recordAuditLog({
          entity_type: 'credit_control',
          entity_id: customer_id,
          user_id: session.username,
          user_name: session.name,
          action: is_blocked ? 'MANUAL_BLOCK_CUSTOMER' : 'MANUAL_UNBLOCK_CUSTOMER',
          reason: is_blocked ? `Blocked customer: ${reason}` : 'Unblocked customer',
        });

        return NextResponse.json({ success: true, customer: customers[idx] });
      }
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    if (action === 'update_limits') {
      const { customer_id, credit_days, credit_limit } = body;
      const customers = getCustomersFile();
      const idx = customers.findIndex((c) => c.id === customer_id);
      if (idx >= 0) {
        if (credit_days !== undefined) customers[idx].credit_days = Number(credit_days);
        if (credit_limit !== undefined) customers[idx].credit_limit = Number(credit_limit);
        saveCustomersFile(customers);

        recordAuditLog({
          entity_type: 'credit_control',
          entity_id: customer_id,
          user_id: session.username,
          user_name: session.name,
          action: 'UPDATE_CREDIT_LIMITS',
          updated_values: { credit_days, credit_limit },
          reason: `Updated credit terms: ${credit_days} days, limit ₹${Number(credit_limit).toLocaleString('en-IN')}`,
        });

        return NextResponse.json({ success: true, customer: customers[idx] });
      }
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('Error in credit control:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}

