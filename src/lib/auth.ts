/**
 * Admin Authentication for Showhouse Laminates
 * Only admin access allowed:
 * Username: adminsh
 * Password: showhouse@2026!
 */

const ADMIN_CREDENTIALS = {
  username: 'adminsh',
  password: 'showhouse@2026!',
};

const AUTH_STORAGE_KEY = 'showhouse_admin_authenticated';
const AUTH_COOKIE_NAME = 'sh_admin_auth';

export function verifyAdminCredentials(username: string, password: string): boolean {
  return (
    username.trim().toLowerCase() === ADMIN_CREDENTIALS.username &&
    password === ADMIN_CREDENTIALS.password
  );
}

export function setAdminSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      authenticated: true,
      username: ADMIN_CREDENTIALS.username,
      loggedInAt: new Date().toISOString(),
    }));
    // Also set cookie for SSR / middleware compatibility if needed
    document.cookie = `${AUTH_COOKIE_NAME}=true; path=/; max-age=2592000; SameSite=Lax`;
  }
}

export function clearAdminSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    document.cookie = `${AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

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
