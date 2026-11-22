import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  getAuthenticatedSession,
  getAdminCredentials,
  setAdminCredentials,
  createSignedSessionToken,
  AUTH_COOKIE_NAME,
} from '@/lib/server-auth';

export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized. Please login again.' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Permission denied. Only Administrator can change admin password.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { currentPassword, newPassword, confirmPassword, newUsername, phone } = body;

    if (!currentPassword) {
      return NextResponse.json(
        { success: false, error: 'Current admin password is required.' },
        { status: 400 }
      );
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
      return NextResponse.json(
        { success: false, error: 'New password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: 'New password and confirm password do not match.' },
        { status: 400 }
      );
    }

    // Verify current password with constant-time equality
    const adminCreds = getAdminCredentials();
    const curBuf = Buffer.from(currentPassword);
    const expectedBuf = Buffer.from(adminCreds.password);

    if (curBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(curBuf, expectedBuf)) {
      return NextResponse.json(
        { success: false, error: 'Current password is incorrect. Please verify and try again.' },
        { status: 400 }
      );
    }

    // Determine target username
    const targetUsername = (newUsername && typeof newUsername === 'string' && newUsername.trim())
      ? newUsername.trim().toLowerCase()
      : adminCreds.username;

    const targetPhone = phone && typeof phone === 'string' && phone.trim()
      ? phone.trim()
      : (adminCreds.phone || '+91 79773 95952');

    // Save updated credentials to persistent data storage
    setAdminCredentials(targetUsername, newPassword.trim(), targetPhone);

    // Generate fresh session token with updated credentials
    const newToken = createSignedSessionToken({
      username: targetUsername,
      name: 'Admin SH',
      role: 'admin',
    });

    const isHttps = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
    const res = NextResponse.json({
      success: true,
      message: 'Admin password and security credentials updated successfully!',
      username: targetUsername,
      phone: targetPhone,
      token: newToken,
    });

    // Set updated session cookie
    res.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: newToken,
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return res;
  } catch (err: any) {
    console.error('Change password error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const adminCreds = getAdminCredentials();
  return NextResponse.json({
    success: true,
    username: adminCreds.username,
    phone: adminCreds.phone || '+91 79773 95952',
    updatedAt: adminCreds.updated_at || null,
  });
}
