import { NextRequest, NextResponse } from 'next/server';
import {
  verifyServerCredentials,
  createSignedSessionToken,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
  AUTH_COOKIE_NAME,
} from '@/lib/server-auth';

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';

    // 1. Rate Limiting Check
    const rateCheck = checkLoginRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many failed login attempts. Please wait ${rateCheck.waitSeconds} seconds before trying again.`,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // 2. Validate Credentials
    const isValid = verifyServerCredentials(username, password);

    if (!isValid) {
      recordFailedLogin(ip);
      return NextResponse.json(
        { success: false, error: 'Invalid admin username or password' },
        { status: 401 }
      );
    }

    // Reset rate limit on success
    resetLoginRateLimit(ip);

    // 3. Generate Signed Session Token
    const token = createSignedSessionToken(username.trim().toLowerCase());

    const isProd = process.env.NODE_ENV === 'production';
    const response = NextResponse.json({
      success: true,
      user: {
        username: username.trim().toLowerCase(),
        role: 'admin',
      },
      token, // Also return for client convenience / service worker
    });

    // 4. Set HttpOnly, Secure, SameSite Cookie
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isProd,
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
