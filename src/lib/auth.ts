/**
 * Client-Side Authentication Adapter for Showhouse Admin Portal
 * All actual credential checks are strictly performed server-side via /api/auth/login
 */

const AUTH_STORAGE_KEY = 'showhouse_admin_authenticated';
const AUTH_TOKEN_KEY = 'showhouse_admin_token';

export interface LoginResult {
  success: boolean;
  error?: string;
  user?: {
    username: string;
    role: string;
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

    if (typeof window !== 'undefined') {
      if (data.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      }
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          authenticated: true,
          username: data.user?.username || username,
          loggedInAt: new Date().toISOString(),
        })
      );
    }

    return {
      success: true,
      user: data.user,
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'Network connection failed. Please check your internet or server.',
    };
  }
}

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
 * Check if admin is currently authenticated
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
    if (data.authenticated && data.token && typeof window !== 'undefined') {
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    }
    return Boolean(data.authenticated);
  } catch {
    // If offline, trust local session flag
    return isAdminAuthenticated();
  }
}
