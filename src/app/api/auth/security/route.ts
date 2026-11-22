import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedSession,
  getSecurityConfig,
  updateSecurityConfig,
  getSecurityAuditLogs,
  recordSecurityAuditLog,
} from '@/lib/server-auth';

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
    const logs = getSecurityAuditLogs(40);

    return NextResponse.json({
      success: true,
      config,
      logs,
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
    const { require_otp, otp_expiry_minutes, max_otp_attempts, master_recovery_enabled } = body;

    const updated = updateSecurityConfig(
      {
        ...(typeof require_otp === 'boolean' ? { require_otp } : {}),
        ...(typeof otp_expiry_minutes === 'number' ? { otp_expiry_minutes } : {}),
        ...(typeof max_otp_attempts === 'number' ? { max_otp_attempts } : {}),
        ...(typeof master_recovery_enabled === 'boolean' ? { master_recovery_enabled } : {}),
      },
      session.name || session.username
    );

    recordSecurityAuditLog({
      username: session.username,
      name: session.name || session.username,
      role: 'admin',
      ip,
      user_agent: userAgent,
      status: 'success',
      note: `Security policies updated: OTP 2FA ${updated.require_otp ? 'Enabled' : 'Disabled'}`,
    });

    return NextResponse.json({
      success: true,
      config: updated,
    });
  } catch (err: any) {
    console.error('Error updating security config:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to update security configuration' },
      { status: 500 }
    );
  }
}
