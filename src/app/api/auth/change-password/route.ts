import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  getAuthenticatedSession,
  getAdminCredentials,
  getAdminCredentialsAsync,
  setAdminCredentials,
  setAdminCredentialsAsync,
  createSignedSessionToken,
  AUTH_COOKIE_NAME,
  recordSecurityAuditLog,
} from '@/lib/server-auth';
import {
  findEmployeeByUsername,
  findEmployeeByUsernameAsync,
  updateEmployeePassword,
  updateEmployeePasswordAsync,
} from '@/lib/employee-accounts';

export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized. Please login again.' }, { status: 401 });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';
  const userAgent = req.headers.get('user-agent') || 'Unknown Device';

  try {
    const body = await req.json().catch(() => ({}));
    const {
      currentPassword,
      newPassword,
      confirmPassword,
      newUsername,
      phone,
      employeeUsername,
      employeeId,
    } = body;

    const targetEmployeeId = employeeUsername || employeeId;

    // ====================================================
    // Case A: Employee changing their OWN password
    // ====================================================
    if (session.role === 'employee') {
      if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
        return NextResponse.json(
          { success: false, error: 'New password must be at least 6 characters long.' },
          { status: 400 }
        );
      }

      if (confirmPassword && newPassword !== confirmPassword) {
        return NextResponse.json(
          { success: false, error: 'New password and confirm password do not match.' },
          { status: 400 }
        );
      }

      // If current password provided, verify against current employee record
      const currentEmp = await findEmployeeByUsernameAsync(session.username);
      if (!currentEmp) {
        return NextResponse.json({ success: false, error: 'Staff account not found.' }, { status: 404 });
      }

      if (currentPassword && currentPassword.trim()) {
        const curBuf = Buffer.from(currentPassword.trim());
        const expectedBuf = Buffer.from(currentEmp.password);
        if (curBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(curBuf, expectedBuf)) {
          return NextResponse.json(
            { success: false, error: 'Current password is incorrect. Please verify and try again.' },
            { status: 400 }
          );
        }
      }

      const updateResult = await updateEmployeePasswordAsync(session.username, newPassword.trim());
      if (!updateResult.success) {
        return NextResponse.json(
          { success: false, error: updateResult.error || 'Failed to update employee password.' },
          { status: 500 }
        );
      }

      recordSecurityAuditLog({
        username: session.username,
        name: session.name,
        role: session.role,
        ip,
        user_agent: userAgent,
        status: 'password_changed',
        note: `Staff member @${session.username} updated their password`,
      });

      // Issue refreshed session token
      const newToken = createSignedSessionToken({
        username: session.username,
        name: session.name,
        role: 'employee',
      });

      const isHttps = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
      const res = NextResponse.json({
        success: true,
        message: 'Your staff password has been updated and recorded successfully!',
        username: session.username,
        token: newToken,
      });

      res.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: newToken,
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });

      return res;
    }

    // ====================================================
    // Case B: Admin changing an EMPLOYEE's password
    // ====================================================
    if (targetEmployeeId && typeof targetEmployeeId === 'string' && targetEmployeeId.trim()) {
      if (session.role !== 'admin') {
        return NextResponse.json(
          { success: false, error: 'Permission denied. Only Administrator can modify staff passwords.' },
          { status: 403 }
        );
      }

      if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
        return NextResponse.json(
          { success: false, error: 'New password must be at least 6 characters long.' },
          { status: 400 }
        );
      }

      const updateResult = await updateEmployeePasswordAsync(targetEmployeeId.trim(), newPassword.trim());
      if (!updateResult.success) {
        return NextResponse.json(
          { success: false, error: updateResult.error || 'Failed to update employee password.' },
          { status: 400 }
        );
      }

      recordSecurityAuditLog({
        username: session.username,
        name: session.name,
        role: session.role,
        ip,
        user_agent: userAgent,
        status: 'password_changed',
        note: `Admin updated password for staff member @${updateResult.employee?.username || targetEmployeeId}`,
      });

      return NextResponse.json({
        success: true,
        message: `Password for @${updateResult.employee?.username || targetEmployeeId} updated and recorded successfully!`,
        employee: updateResult.employee,
      });
    }

    // ====================================================
    // Case C: Admin changing Master Admin Password / Profile
    // ====================================================
    if (session.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Permission denied. Only Administrator can change admin password.' },
        { status: 403 }
      );
    }

    const adminCreds = await getAdminCredentialsAsync();
    const isProfileOnly = !newPassword && (phone !== undefined || newUsername !== undefined);

    // Case C1: Updating Admin Profile / Phone only (No password change required)
    if (isProfileOnly) {
      const targetUsername = (newUsername && typeof newUsername === 'string' && newUsername.trim())
        ? newUsername.trim().toLowerCase()
        : adminCreds.username;

      const targetPhone = phone && typeof phone === 'string' && phone.trim()
        ? phone.trim()
        : (adminCreds.phone || '+91 79773 95952');

      await setAdminCredentialsAsync(targetUsername, adminCreds.password, targetPhone);

      const newToken = createSignedSessionToken({
        username: targetUsername,
        name: 'Admin SH',
        role: 'admin',
      });

      const isHttps = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
      const res = NextResponse.json({
        success: true,
        message: 'Admin mobile number and contact details updated successfully!',
        username: targetUsername,
        phone: targetPhone,
        token: newToken,
      });

      res.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: newToken,
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });

      return res;
    }

    // Case C2: Changing Admin Password
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

    // If currentPassword was provided, verify it
    if (currentPassword && currentPassword.trim()) {
      const curBuf = Buffer.from(currentPassword.trim());
      const expectedBuf = Buffer.from(adminCreds.password);
      if (curBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(curBuf, expectedBuf)) {
        return NextResponse.json(
          { success: false, error: 'Current password is incorrect. Please verify and try again.' },
          { status: 400 }
        );
      }
    }

    // Determine target username & phone
    const targetUsername = (newUsername && typeof newUsername === 'string' && newUsername.trim())
      ? newUsername.trim().toLowerCase()
      : adminCreds.username;

    const targetPhone = phone && typeof phone === 'string' && phone.trim()
      ? phone.trim()
      : (adminCreds.phone || '+91 79773 95952');

    // Save updated credentials to persistent data storage (with awaited Firestore sync)
    await setAdminCredentialsAsync(targetUsername, newPassword.trim(), targetPhone);

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
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role === 'employee') {
    const emp = findEmployeeByUsername(session.username);
    return NextResponse.json({
      success: true,
      username: session.username,
      name: emp?.name || session.name,
      phone: emp?.phone || '',
      role: 'employee',
      po_prefix: emp?.po_prefix || '',
    });
  }

  const adminCreds = await getAdminCredentialsAsync();
  return NextResponse.json({
    success: true,
    username: adminCreds.username,
    phone: adminCreds.phone || '+91 79773 95952',
    updatedAt: adminCreds.updated_at || null,
  });
}
