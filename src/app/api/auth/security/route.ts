import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedSession,
  getSecurityConfig,
  updateSecurityConfig,
  getSecurityAuditLogs,
  recordSecurityAuditLog,
  getAllUserTotpRecords,
  deleteUserTotpRecord,
} from '@/lib/server-auth';
import { getEmployeeAccounts } from '@/lib/employee-accounts';

export async function GET(req: NextRequest) {
  try {
    const session = getAuthenticatedSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Admin credentials required.' },
        { status: 403 }
      );
    }

    const config = getSecurityConfig();
    const logs = getSecurityAuditLogs(50);
    const totpRecords = getAllUserTotpRecords();
    const employees = getEmployeeAccounts();

    // Map each account to its Google Authenticator 2FA status
    const accounts2FA = [
      {
        username: 'adminsh',
        name: 'Admin SH',
        role: 'admin',
        is_enrolled: totpRecords.some((r) => r.username.toLowerCase() === 'adminsh' && r.totp_enabled),
        enrolled_at: totpRecords.find((r) => r.username.toLowerCase() === 'adminsh')?.totp_enrolled_at || null,
        backup_codes_left:
          10 - (totpRecords.find((r) => r.username.toLowerCase() === 'adminsh')?.backup_codes_used?.length || 0),
      },
      ...employees.map((emp) => {
        const rec = totpRecords.find((r) => r.username.toLowerCase() === emp.username.toLowerCase());
        return {
          username: emp.username,
          name: emp.name,
          role: emp.role,
          phone: emp.phone || '',
          is_enrolled: Boolean(rec && rec.totp_enabled),
          enrolled_at: rec?.totp_enrolled_at || null,
          backup_codes_left: rec ? Math.max(0, 10 - (rec.backup_codes_used?.length || 0)) : 10,
        };
      }),
    ];

    return NextResponse.json({
      success: true,
      config,
      logs,
      accounts: accounts2FA,
    });
  } catch (err: any) {
    console.error('Error fetching security config/logs:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to load security settings' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = getAuthenticatedSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Admin credentials required.' },
        { status: 403 }
      );
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'Unknown Device';

    const body = await req.json().catch(() => ({}));
    const { action, target_username, reason } = body;

    // Admin Reset of an Employee/Admin's Google Authenticator (e.g. lost phone)
    if (action === 'reset_totp' && target_username) {
      const cleanTarget = target_username.trim().toLowerCase();
      const removed = deleteUserTotpRecord(cleanTarget);

      recordSecurityAuditLog({
        username: session.username,
        name: session.name || session.username,
        role: 'admin',
        ip,
        user_agent: userAgent,
        status: 'totp_reset',
        note: `Admin reset Google Authenticator for user "${cleanTarget}". Reason: ${reason || 'Phone lost/reconfiguration'}`,
      });

      return NextResponse.json({
        success: true,
        message: `Google Authenticator reset for ${cleanTarget}. They will be prompted to scan a new QR code on their next login.`,
        removed,
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid security action' }, { status: 400 });
  } catch (err: any) {
    console.error('Error in security endpoint:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to process security request' },
      { status: 500 }
    );
  }
}
