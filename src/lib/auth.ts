/**
 * Client-Side Authentication Adapter for Showhouse Admin Portal
 * All actual credential checks are strictly performed server-side via /api/auth/login
 */

import { UserRole } from '@/types';

const AUTH_STORAGE_KEY = 'showhouse_admin_authenticated';
const AUTH_TOKEN_KEY = 'showhouse_admin_token';

export interface LoginResult {
  success: boolean;
  requires_totp?: boolean;
  requires_totp_setup?: boolean;
  challenge_id?: string;
  qr_code_url?: string;
  manual_key?: string;
  provisioning_uri?: string;
  plain_backup_codes?: string[];
  expires_in_seconds?: number;
  token?: string;
  error?: string;
  is_backup_code?: boolean;
  user?: {
    username: string;
    name: string;
    role: UserRole;
  };
}

/**
 * Perform server-side login with credentials
 */
export async function loginAdmin(username: string, password: string): Promise<LoginResult> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Authentication failed. Please check credentials.',
      };
    }

    // Step 2: First-Time Setup Required
    if (data.requires_totp_setup) {
      return {
        success: true,
        requires_totp_setup: true,
        challenge_id: data.challenge_id,
        qr_code_url: data.qr_code_url,
        manual_key: data.manual_key,
        provisioning_uri: data.provisioning_uri,
        plain_backup_codes: data.plain_backup_codes || [],
        expires_in_seconds: data.expires_in_seconds || 300,
        user: data.user,
      };
    }

    // Step 3: Normal 2FA Verification Required
    if (data.requires_totp) {
      return {
        success: true,
        requires_totp: true,
        challenge_id: data.challenge_id,
        expires_in_seconds: data.expires_in_seconds || 300,
        user: data.user,
      };
    }

    return {
      success: true,
      user: data.user,
      token: data.token,
    };
  } catch {
    return {
      success: false,
      error: 'Network connection failed. Please check your internet or server.',
    };
  }
}

/**
 * Verify Google Authenticator 6-digit Code during Initial Setup
 */
export async function verifyTotpSetup(
  challenge_id: string,
  totp_code: string,
  username?: string
): Promise<LoginResult & { plain_backup_codes?: string[] }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_totp_setup', challenge_id, totp_code, username }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Invalid code from Google Authenticator. Please try again.',
      };
    }

    if (typeof window !== 'undefined') {
      if (data.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      }
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          authenticated: true,
          username: data.user?.username,
          name: data.user?.name || data.user?.username,
          role: data.user?.role || 'admin',
          loggedInAt: new Date().toISOString(),
        })
      );
    }

    return {
      success: true,
      user: data.user,
      token: data.token,
      plain_backup_codes: data.plain_backup_codes || [],
    };
  } catch {
    return {
      success: false,
      error: 'Network connection failed while verifying setup.',
    };
  }
}

/**
 * Verify Google Authenticator 6-digit Code (or single-use backup code) during Login
 */
export async function verifyLoginTotp(
  challenge_id: string,
  totp_code: string
): Promise<LoginResult> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_totp', challenge_id, totp_code }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Invalid 6-digit code. Please check your Authenticator app.',
      };
    }

    if (typeof window !== 'undefined') {
      if (data.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      }
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          authenticated: true,
          username: data.user?.username,
          name: data.user?.name || data.user?.username,
          role: data.user?.role || 'admin',
          loggedInAt: new Date().toISOString(),
        })
      );
    }

    return {
      success: true,
      user: data.user,
      token: data.token,
      is_backup_code: data.is_backup_code,
    };
  } catch {
    return {
      success: false,
      error: 'Network connection failed. Please check your internet or server.',
    };
  }
}

// Backward-compatibility alias
export const verifyLoginOtp = verifyLoginTotp;

/**
 * Logout and clear session
 */
export async function logoutAdmin(): Promise<void> {
  try {
    const token = getClientAuthToken();
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {}

  if (typeof window !== 'undefined') {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    try {
      sessionStorage.removeItem('sh_stealth_unlocked');
    } catch {}
    window.location.href = '/login';
  }
}

/**
 * Clear local session without redirect
 */
export function clearAdminSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    try {
      sessionStorage.removeItem('sh_stealth_unlocked');
    } catch {}
  }
}

/**
 * Get the current client auth token for API calls
 */
export function getClientAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Check if user is currently authenticated
 */
export function isAdminAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return false;
    const session = JSON.parse(raw);
    return Boolean(session?.authenticated);
  } catch {
    return false;
  }
}

export function getCurrentUser(): { username: string; name: string; role: UserRole } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.authenticated) return null;
    return {
      username: session.username || 'adminsh',
      name: session.name || (session.username === 'adminsh' ? 'Admin BO' : session.username),
      role: (session.role as UserRole) || 'admin',
    };
  } catch {
    return null;
  }
}

export function isEmployee(): boolean {
  const u = getCurrentUser();
  return u?.role === 'employee';
}

export function isAccountant(): boolean {
  const u = getCurrentUser();
  return u?.role === 'accountant';
}

export function isAdmin(): boolean {
  const u = getCurrentUser();
  return u?.role === 'admin' || !u; // default to true if legacy session
}

export function canManageAccounting(): boolean {
  const u = getCurrentUser();
  return u?.role === 'admin' || u?.role === 'accountant';
}

export function canManageTally(): boolean {
  const u = getCurrentUser();
  return u?.role === 'admin';
}

/**
 * Verify active session against server
 */
export async function verifySessionWithServer(): Promise<boolean> {
  try {
    const token = getClientAuthToken();
    const res = await fetch('/api/auth/session', {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      clearAdminSession();
      return false;
    }
    const data = await res.json();
    if (data.authenticated && typeof window !== 'undefined') {
      if (data.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      }
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          authenticated: true,
          username: data.user?.username,
          name: data.user?.name || data.user?.username,
          role: data.user?.role || 'admin',
          loggedInAt: new Date().toISOString(),
        })
      );
    }
    return Boolean(data.authenticated);
  } catch {
    // If offline, trust local session flag
    return isAdminAuthenticated();
  }
}
