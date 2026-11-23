import { NextRequest, NextResponse } from 'next/server';
import {
  verifyServerCredentials,
  createSignedSessionToken,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
  AUTH_COOKIE_NAME,
  recordSecurityAuditLog,
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
    const { username, password } = body;

    const isHttps =
      req.nextUrl.protocol === 'https:' ||
      req.headers.get('x-forwarded-proto') === 'https';

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // 2. Validate Credentials dynamically from storage (Admin or Staff)
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

    // 3. Login Succeeded! Direct authenticated session issued (No TOTP / Authenticator required)
    resetLoginRateLimit(ip);

    const userPayload = {
      username: authResult.user.username.toLowerCase(),
      name: authResult.user.name,
      role: authResult.user.role || 'employee',
    };

    const token = createSignedSessionToken(userPayload);

    recordSecurityAuditLog({
      username: userPayload.username,
      name: userPayload.name,
      role: userPayload.role,
      ip,
      user_agent: userAgent,
      status: 'success',
      note: `User @${userPayload.username} (${userPayload.role}) logged in successfully via Username + Password`,
    });

    const response = NextResponse.json({
      success: true,
      user: userPayload,
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
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected authentication error occurred' },
      { status: 500 }
    );
  }
}
