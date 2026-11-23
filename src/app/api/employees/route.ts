import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession, recordSecurityAuditLog } from '@/lib/server-auth';
import {
  getEmployeeAccounts,
  getEmployeeAccountsAsync,
  saveEmployeeAccounts,
  saveEmployeeAccountsAsync,
  updateEmployeePassword,
  updateEmployeePasswordAsync,
} from '@/lib/employee-accounts';
import { invalidateDataCache } from '@/lib/server-storage';
import { EmployeeAccount } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  invalidateDataCache('employees.json');
  const accounts = await getEmployeeAccountsAsync();

  const noCacheHeaders = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };

  // If not admin, return public safe info (name, username, phone, po_prefix, is_active) WITHOUT passwords
  if (!session || session.role !== 'admin') {
    const publicAccounts = accounts.map((a) => {
      // If the caller is an employee, allow them to see their own password/profile
      const isSelf = session && session.role === 'employee' && session.username.toLowerCase() === a.username.toLowerCase();
      return {
        id: a.id,
        name: a.name,
        username: a.username,
        phone: a.phone || '',
        po_prefix: a.po_prefix || '',
        is_active: a.is_active,
        role: a.role,
        ...(isSelf ? { password: a.password } : {}),
      };
    });
    return NextResponse.json({ success: true, employees: publicAccounts }, { headers: noCacheHeaders });
  }

  // Admin gets full accounts including passwords for management
  return NextResponse.json({ success: true, employees: accounts }, { headers: noCacheHeaders });
}

export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Valid session required.' },
      { status: 401 }
    );
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';
  const userAgent = req.headers.get('user-agent') || 'Unknown Device';

  try {
    const body = await req.json();

    // Fast 1-click password update for a specific employee
    if (body.action === 'update_password') {
      const targetUser = body.employeeId || body.username;
      const newPassword = body.newPassword || body.password;

      if (!targetUser || !newPassword || String(newPassword).trim().length < 6) {
        return NextResponse.json(
          { success: false, error: 'Target employee and a new password (min. 6 chars) are required.' },
          { status: 400 }
        );
      }

      // Check permission: Admin can change anyone's password; Employee can ONLY change their own
      if (session.role !== 'admin') {
        const isSelf = session.username.trim().toLowerCase() === String(targetUser).trim().toLowerCase();
        if (!isSelf) {
          return NextResponse.json(
            { success: false, error: 'Permission denied. Staff can only change their own password.' },
            { status: 403 }
          );
        }
      }

      const updateResult = await updateEmployeePasswordAsync(targetUser, String(newPassword).trim());
      if (!updateResult.success) {
        return NextResponse.json({ success: false, error: updateResult.error }, { status: 400 });
      }

      invalidateDataCache('employees.json');

      recordSecurityAuditLog({
        username: session.username,
        name: session.name,
        role: session.role,
        ip,
        user_agent: userAgent,
        status: 'password_changed',
        note: `Password changed for employee @${updateResult.employee?.username || targetUser}`,
      });

      return NextResponse.json({
        success: true,
        message: `Password updated successfully for ${updateResult.employee?.name || targetUser}!`,
        employee: updateResult.employee,
      });
    }

    // Fast 1-click ban / unban action (Admin only)
    if (body.action === 'toggle_ban' && body.employeeId) {
      if (session.role !== 'admin') {
        return NextResponse.json(
          { success: false, error: 'Unauthorized. Admin access required.' },
          { status: 403 }
        );
      }

      const current = await getEmployeeAccountsAsync();
      const updated = current.map((emp) => {
        if (emp.id === body.employeeId || emp.username.toLowerCase() === String(body.employeeId).toLowerCase()) {
          const willBan = body.banned !== undefined ? Boolean(body.banned) : (emp.is_active !== false);
          return {
            ...emp,
            is_active: !willBan,
            is_banned: willBan,
          };
        }
        return emp;
      });
      await saveEmployeeAccountsAsync(updated);
      return NextResponse.json({ success: true, employees: updated });
    }

    // Full employee array update (Admin only)
    if (session.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    if (!body || !Array.isArray(body.employees)) {
      return NextResponse.json(
        { success: false, error: 'employees array is required' },
        { status: 400 }
      );
    }

    const current = await getEmployeeAccountsAsync();
    const updated: EmployeeAccount[] = body.employees.map((item: any, idx: number) => {
      const existing =
        current.find(
          (c) =>
            c.id === item.id ||
            c.username.toLowerCase() === (item.username || '').toLowerCase()
        ) || current[idx];

      const isActive = item.is_active !== undefined ? Boolean(item.is_active) : (existing?.is_active ?? true);
      const isBanned = item.is_banned !== undefined ? Boolean(item.is_banned) : (!isActive);

      // Determine password: if user provided a new trimmed password, take it; else fallback to existing
      const providedPassword =
        item.password !== undefined && String(item.password).trim() !== ''
          ? String(item.password).trim()
          : (existing?.password || `staff${idx + 1}@sh26`);

      return {
        id: item.id || existing?.id || `emp_${Date.now()}_${idx}`,
        username: (item.username || existing?.username || `staff${idx + 1}`).trim().toLowerCase(),
        name: (item.name || existing?.name || `Staff ${idx + 1}`).trim(),
        phone: item.phone !== undefined ? String(item.phone).trim() : (existing?.phone || ''),
        password: providedPassword,
        role: 'employee' as const,
        is_active: isActive && !isBanned,
        is_banned: isBanned,
        po_prefix: item.po_prefix ? String(item.po_prefix).trim().toUpperCase() : (existing?.po_prefix || `PO ST${idx + 1}`),
      };
    });

    const saved = await saveEmployeeAccountsAsync(updated);
    if (!saved) {
      return NextResponse.json({ success: false, error: 'Failed to write employees file' }, { status: 500 });
    }

    invalidateDataCache('employees.json');

    recordSecurityAuditLog({
      username: session.username,
      name: session.name,
      role: session.role,
      ip,
      user_agent: userAgent,
      status: 'success',
      note: `Admin updated employee accounts (${updated.length} members)`,
    });

    return NextResponse.json({ success: true, employees: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
