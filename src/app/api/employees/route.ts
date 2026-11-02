import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import { getEmployeeAccounts, saveEmployeeAccounts } from '@/lib/employee-accounts';
import { EmployeeAccount } from '@/types';

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  const accounts = getEmployeeAccounts();

  // If not admin, return public safe info (name, username, phone, po_prefix, is_active) WITHOUT passwords
  if (!session || session.role !== 'admin') {
    const publicAccounts = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      username: a.username,
      phone: a.phone || '',
      po_prefix: a.po_prefix || '',
      is_active: a.is_active,
      role: a.role,
    }));
    return NextResponse.json({ success: true, employees: publicAccounts });
  }

  // Admin gets full accounts including passwords for management
  return NextResponse.json({ success: true, employees: accounts });
}

export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session || session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Admin access required.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    if (!body || !Array.isArray(body.employees)) {
      return NextResponse.json(
        { success: false, error: 'employees array is required' },
        { status: 400 }
      );
    }

    const current = getEmployeeAccounts();
    const updated: EmployeeAccount[] = body.employees.map((item: any, idx: number) => {
      const existing = current.find((c) => c.id === item.id) || current[idx];
      return {
        id: item.id || existing?.id || `emp_${Date.now()}_${idx}`,
        username: (item.username || existing?.username || `staff${idx + 1}`).trim().toLowerCase(),
        name: (item.name || existing?.name || `Staff ${idx + 1}`).trim(),
        phone: item.phone !== undefined ? String(item.phone).trim() : (existing?.phone || ''),
        password: item.password || existing?.password || `staff${idx + 1}@sh26`,
        role: 'employee' as const,
        is_active: item.is_active !== undefined ? Boolean(item.is_active) : true,
        po_prefix: item.po_prefix ? String(item.po_prefix).trim().toUpperCase() : (existing?.po_prefix || `PO ST${idx + 1}`),
      };
    });

    const saved = saveEmployeeAccounts(updated);
    if (!saved) {
      return NextResponse.json({ success: false, error: 'Failed to write employees file' }, { status: 500 });
    }

    return NextResponse.json({ success: true, employees: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
