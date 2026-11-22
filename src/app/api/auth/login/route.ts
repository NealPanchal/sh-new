import { NextRequest, NextResponse } from 'next/server';
import {
  verifyServerCredentials,
  createSignedSessionToken,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
  AUTH_COOKIE_NAME,
  recordSecurityAuditLog,
  isUserTotpEnrolled,
  createTotpSetupChallenge,
  activateTotpEnrollment,
  createTotpLoginChallenge,
  verifyTotpLoginCode,
  getUserTotpRecord,
} from '@/lib/server-auth';

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
    const { action, username, password, challenge_id, totp_code } = body;

    const isHttps =
      req.nextUrl.protocol === 'https:' ||
      req.headers.get('x-forwarded-proto') === 'https';

    // ----------------------------------------------------
    // Scenario A: Activate First-Time Google Authenticator Enrollment
    // ----------------------------------------------------
    if (action === 'verify_totp_setup') {
      if (!challenge_id || !totp_code) {
        return NextResponse.json(
          { success: false, error: 'Challenge ID and 6-digit Google Authenticator code are required' },
          { status: 400 }
        );
      }

      const activation = activateTotpEnrollment(challenge_id, totp_code);
      if (!activation.success) {
        recordSecurityAuditLog({
          username: username ? username.trim().toLowerCase() : 'setup_user',
          name: 'Enrollment Attempt',
          role: 'employee',
          ip,
          user_agent: userAgent,
          status: 'totp_failed',
          note: activation.error || 'Failed to verify initial TOTP enrollment code',
        });

        return NextResponse.json(
          { success: false, error: activation.error || 'Invalid verification code' },
          { status: 400 }
        );
      }

      // Enrollment Succeeded! Issue authenticated session
      resetLoginRateLimit(ip);

      const enrolledUsername = activation.username || (username ? username.trim().toLowerCase() : 'adminsh');
      const totpRecord = getUserTotpRecord(enrolledUsername);
      const userPayload = {
        username: enrolledUsername,
        name: enrolledUsername === 'adminsh' ? 'Admin SH' : enrolledUsername.toUpperCase(),
        role: activation.role || totpRecord?.role || 'employee',
      };

      const token = createSignedSessionToken(userPayload);

      recordSecurityAuditLog({
        username: enrolledUsername,
        name: userPayload.name,
        role: userPayload.role,
        ip,
        user_agent: userAgent,
        status: 'totp_enrolled',
        note: 'Completed Google Authenticator TOTP Enrollment & activated 2FA',
      });

      const response = NextResponse.json({
        success: true,
        user: userPayload,
        token,
        plain_backup_codes: activation.plainBackupCodes || [],
        backup_codes: activation.plainBackupCodes || [],
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
    // Scenario B: Verify Google Authenticator Code on Normal Login
    // ----------------------------------------------------
    if (action === 'verify_totp' || (challenge_id && totp_code)) {
      if (!challenge_id || !totp_code) {
        return NextResponse.json(
          { success: false, error: 'Challenge ID and 6-digit Authenticator code (or backup code) are required' },
          { status: 400 }
        );
      }

      const verifyRes = verifyTotpLoginCode(challenge_id, totp_code);

      if (!verifyRes.valid || !verifyRes.username) {
        recordSecurityAuditLog({
          username: verifyRes.username || 'challenge_user',
          name: 'Staff / Admin',
          role: verifyRes.role || 'employee',
          ip,
          user_agent: userAgent,
          status: 'totp_failed',
          note: verifyRes.error || 'Invalid Google Authenticator code entered',
        });

        return NextResponse.json(
          { success: false, error: verifyRes.error || 'Invalid verification code' },
          { status: 400 }
        );
      }

      // Successful 2FA Verification!
      resetLoginRateLimit(ip);

      const userPayload = {
        username: verifyRes.username,
        name: verifyRes.username === 'adminsh' ? 'Admin SH' : verifyRes.username.toUpperCase(),
        role: verifyRes.role || 'employee',
      };

      const token = createSignedSessionToken(userPayload);

      recordSecurityAuditLog({
        username: userPayload.username,
        name: userPayload.name,
        role: userPayload.role,
        ip,
        user_agent: userAgent,
        status: verifyRes.isBackupCode ? 'backup_code_used' : 'success',
        note: verifyRes.isBackupCode
          ? 'Completed login using Single-Use Backup Code'
          : 'Completed Google Authenticator TOTP verification successfully',
      });

      const response = NextResponse.json({
        success: true,
        user: userPayload,
        token,
        is_backup_code: Boolean(verifyRes.isBackupCode),
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

    const cleanUsername = authResult.user.username.toLowerCase();
    const isEnrolled = isUserTotpEnrolled(cleanUsername);

    // 1. If user has NOT enrolled in Google Authenticator yet -> Setup Challenge
    if (!isEnrolled) {
      const setupChallenge = await createTotpSetupChallenge(cleanUsername, authResult.user.role);

      recordSecurityAuditLog({
        username: cleanUsername,
        name: authResult.user.name,
        role: authResult.user.role,
        ip,
        user_agent: userAgent,
        status: 'totp_challenge_issued',
        note: 'First-time login: Google Authenticator enrollment challenge generated',
      });

      return NextResponse.json({
        success: true,
        requires_totp_setup: true,
        challenge_id: setupChallenge.challenge_id,
        qr_code_url: setupChallenge.qr_code_url,
        manual_key: setupChallenge.manual_key,
        provisioning_uri: setupChallenge.provisioning_uri,
        plain_backup_codes: setupChallenge.plain_backup_codes,
        expires_in_seconds: 300,
        user: {
          username: cleanUsername,
          name: authResult.user.name,
          role: authResult.user.role,
        },
      });
    }

    // 2. User IS already enrolled -> Normal TOTP Login Challenge
    const loginChallenge = createTotpLoginChallenge(cleanUsername, authResult.user.role);

    recordSecurityAuditLog({
      username: cleanUsername,
      name: authResult.user.name,
      role: authResult.user.role,
      ip,
      user_agent: userAgent,
      status: 'totp_challenge_issued',
      note: 'Credentials verified: Prompting for Google Authenticator OTP',
    });

    return NextResponse.json({
      success: true,
      requires_totp: true,
      challenge_id: loginChallenge.challenge_id,
      expires_in_seconds: 300,
      user: {
        username: cleanUsername,
        name: authResult.user.name,
        role: authResult.user.role,
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected authentication error occurred' },
      { status: 500 }
    );
  }
}
