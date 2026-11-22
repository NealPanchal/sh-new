import { NextRequest, NextResponse } from 'next/server';
import {
  verifyServerCredentials,
  createSignedSessionToken,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
  AUTH_COOKIE_NAME,
  getSecurityConfig,
  createOtpChallenge,
  verifyOtpChallenge,
  resendOtpChallenge,
  recordSecurityAuditLog,
  getAdminCredentials,
} from '@/lib/server-auth';
import { findEmployeeByUsername } from '@/lib/employee-accounts';

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'Unknown Device';

    // 1. Anti-Brute Force Rate Limiting Check
    const rateCheck = checkLoginRateLimit(ip);
    if (!rateCheck.allowed) {
      recordSecurityAuditLog({
        username: 'unknown',
        name: 'Rate Limited Client',
        role: 'employee',
        ip,
        user_agent: userAgent,
        status: 'rate_limited',
        note: `Rate limited. IP temporarily blocked for ${rateCheck.waitSeconds}s`,
      });

      return NextResponse.json(
        {
          success: false,
          error: `Too many failed login attempts from this network. Please wait ${rateCheck.waitSeconds} seconds before trying again.`,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { action, username, password, challenge_id, otp_code } = body;

    // ----------------------------------------------------
    // Scenario A: Resend 2FA OTP
    // ----------------------------------------------------
    if (action === 'resend_otp' && challenge_id) {
      const resendRes = resendOtpChallenge(challenge_id);
      if (!resendRes.success) {
        return NextResponse.json(
          { success: false, error: resendRes.error || 'Failed to resend code' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        challenge_id: resendRes.challenge_id,
        otp_preview: resendRes.otp_preview,
        target_masked: resendRes.target_masked,
        phone: resendRes.phone,
        expires_at: resendRes.expires_at,
        expires_in_seconds: resendRes.expires_in_seconds,
      });
    }

    // ----------------------------------------------------
    // Scenario B: Verify 2FA OTP Challenge
    // ----------------------------------------------------
    if (challenge_id && otp_code) {
      const verifyRes = verifyOtpChallenge(challenge_id, otp_code);

      if (!verifyRes.valid || !verifyRes.user) {
        recordSecurityAuditLog({
          username: 'challenge_user',
          name: 'Staff / Admin',
          role: 'employee',
          ip,
          user_agent: userAgent,
          status: 'otp_failed',
          note: verifyRes.error || 'Invalid 6-digit OTP code entered',
        });

        return NextResponse.json(
          { success: false, error: verifyRes.error || 'Invalid verification code' },
          { status: 400 }
        );
      }

      // Successful OTP Verification!
      resetLoginRateLimit(ip);
      const token = createSignedSessionToken(verifyRes.user);

      recordSecurityAuditLog({
        username: verifyRes.user.username,
        name: verifyRes.user.name,
        role: verifyRes.user.role,
        ip,
        user_agent: userAgent,
        status: 'success',
        note: 'Completed 2-Step OTP Verification successfully',
      });

      const isHttps =
        req.nextUrl.protocol === 'https:' ||
        req.headers.get('x-forwarded-proto') === 'https';

      const response = NextResponse.json({
        success: true,
        user: {
          username: verifyRes.user.username,
          name: verifyRes.user.name,
          role: verifyRes.user.role,
        },
        token,
      });

      response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: token,
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });

      return response;
    }

    // ----------------------------------------------------
    // Scenario C: Initial Credentials Login (Username + Password)
    // ----------------------------------------------------
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // Validate Credentials (Admin or Staff)
    const authResult = verifyServerCredentials(username, password);

    if (!authResult.valid || !authResult.user) {
      recordFailedLogin(ip);

      recordSecurityAuditLog({
        username: username.trim().toLowerCase(),
        name: 'Unauthenticated User',
        role: 'employee',
        ip,
        user_agent: userAgent,
        status: authResult.error?.includes('banned') ? 'banned_attempt' : 'failed',
        note: authResult.error || 'Invalid credentials attempt',
      });

      return NextResponse.json(
        {
          success: false,
          error:
            authResult.error ||
            'Invalid username or password. Please check your credentials.',
        },
        { status: 401 }
      );
    }

    // Check Security Configuration
    const secConfig = getSecurityConfig();

    // If 2FA OTP is required (Default is Enabled)
    if (secConfig.require_otp) {
      let targetPhone = '';
      if (authResult.user.role === 'employee') {
        const emp = findEmployeeByUsername(authResult.user.username);
        targetPhone = emp?.phone || '';
      } else {
        const adminCreds = getAdminCredentials();
        targetPhone = adminCreds.phone || '+91 79773 95952'; // Admin registered phone (7977395952)
      }

      const challenge = createOtpChallenge(authResult.user, targetPhone);

      recordSecurityAuditLog({
        username: authResult.user.username,
        name: authResult.user.name,
        role: authResult.user.role,
        ip,
        user_agent: userAgent,
        status: 'otp_challenge_issued',
        note: `2FA challenge issued to ${challenge.target_masked}`,
      });

      return NextResponse.json({
        success: true,
        requires_otp: true,
        challenge_id: challenge.challenge_id,
        target_masked: challenge.target_masked,
        phone: challenge.phone,
        otp_preview: challenge.otp_preview, // On-screen security token badge for 1-click convenience
        expires_at: challenge.expires_at,
        expires_in_seconds: challenge.expires_in_seconds,
        user: {
          username: authResult.user.username,
          name: authResult.user.name,
          role: authResult.user.role,
        },
      });
    }

    // If OTP is disabled by admin, issue session directly
    resetLoginRateLimit(ip);
    const token = createSignedSessionToken(authResult.user);

    recordSecurityAuditLog({
      username: authResult.user.username,
      name: authResult.user.name,
      role: authResult.user.role,
      ip,
      user_agent: userAgent,
      status: 'success',
      note: 'Direct login (OTP disabled in security settings)',
    });

    const isHttps =
      req.nextUrl.protocol === 'https:' ||
      req.headers.get('x-forwarded-proto') === 'https';

    const response = NextResponse.json({
      success: true,
      user: {
        username: authResult.user.username,
        name: authResult.user.name,
        role: authResult.user.role,
      },
      token,
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected authentication error occurred' },
      { status: 500 }
    );
  }
}
