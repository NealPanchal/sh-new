import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import { getEmployeeAccounts, saveEmployeeAccounts } from '@/lib/employee-accounts';
import { EmployeeAccount } from '@/types';

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session || session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Admin access required.' },
      { status: 403 }
    );
  }

  const accounts = getEmployeeAccounts();
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
        id: item.id || existing?.id || `emp_${idx + 1}`,
        username: (item.username || existing?.username || `staff${idx + 1}`).trim().toLowerCase(),
        name: (item.name || existing?.name || `Staff ${idx + 1}`).trim(),
        password: item.password || existing?.password || `staff${idx + 1}@sh26`,
        role: 'employee' as const,
        is_active: item.is_active !== undefined ? Boolean(item.is_active) : true,
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

