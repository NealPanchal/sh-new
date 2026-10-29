import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { findEmployeeByUsername } from '@/lib/employee-accounts';
import { AuthUser } from '@/types';

export const AUTH_COOKIE_NAME = 'sh_admin_session';

const AUTH_SECRET = process.env.AUTH_SECRET || 'sh_secret_e8c4a179d63f25b901a884fc5710294e7b8c_showhouse_2026';
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'adminsh').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'showhouse@2026!';

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days for mobile PWA usability

// ----------------------------------------------------
// In-Memory Rate Limiting for Login Attempts
// ----------------------------------------------------
interface RateLimitRecord {
  attempts: number;
  blockedUntil: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();

export function checkLoginRateLimit(ip: string): { allowed: boolean; waitSeconds?: number } {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (record && record.blockedUntil > now) {
    return {
      allowed: false,
      waitSeconds: Math.ceil((record.blockedUntil - now) / 1000),
    };
  }

  // Cleanup old records periodically
  if (rateLimitMap.size > 2000) {
    rateLimitMap.clear();
  }

  return { allowed: true };
}

export function recordFailedLogin(ip: string): void {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { attempts: 0, blockedUntil: 0 };
  record.attempts += 1;

  if (record.attempts >= 5) {
    // Block for 15 minutes after 5 consecutive failures
    record.blockedUntil = now + 15 * 60 * 1000;
  }
  rateLimitMap.set(ip, record);
}

export function resetLoginRateLimit(ip: string): void {
  rateLimitMap.delete(ip);
}

// ----------------------------------------------------
// Secure Password Verification (Admin + Staff Accounts)
// ----------------------------------------------------
export function verifyServerCredentials(
  username: string,
  pass: string
): { valid: boolean; user?: AuthUser } {
  if (!username || !pass) return { valid: false };

  const cleanUser = username.trim().toLowerCase();

  // 1. Check Admin Credentials
  if (cleanUser === ADMIN_USERNAME) {
    const passBuf = Buffer.from(pass);
    const adminBuf = Buffer.from(ADMIN_PASSWORD);
    if (passBuf.length === adminBuf.length && crypto.timingSafeEqual(passBuf, adminBuf)) {
      return {
        valid: true,
        user: {
          username: ADMIN_USERNAME,
          name: 'Admin SH',
          role: 'admin',
        },
      };
    }
  }

  // 2. Check Employee Accounts (10 Staff Logins)
  const emp = findEmployeeByUsername(cleanUser);
  if (emp && emp.is_active !== false) {
    const empPassBuf = Buffer.from(emp.password);
    const passBuf = Buffer.from(pass);
    if (empPassBuf.length === passBuf.length && crypto.timingSafeEqual(empPassBuf, passBuf)) {
      return {
        valid: true,
        user: {
          username: emp.username.toLowerCase(),
          name: emp.name,
          role: 'employee',
        },
      };
    }
  }

  return { valid: false };
}

// ----------------------------------------------------
// Cryptographically Signed HMAC Session Token
// ----------------------------------------------------
export interface SessionPayload {
  username: string;
  name: string;
  role: 'admin' | 'employee';
  exp: number;
  iat: number;
}

export function createSignedSessionToken(
  user: { username: string; name?: string; role?: 'admin' | 'employee' } | string = 'adminsh'
): string {
  const now = Math.floor(Date.now() / 1000);
  const username = typeof user === 'string' ? user : user.username;
  const role = typeof user === 'string' ? 'admin' : (user.role || 'admin');
  const name = typeof user === 'string' ? (username === 'adminsh' ? 'Admin SH' : username) : (user.name || username);

  const payload: SessionPayload = {
    username,
    name,
    role,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

export function verifySignedSessionToken(token: string | null | undefined): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;

  // Verify HMAC signature in constant time
  const expectedSig = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payloadB64)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const raw = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const payload: SessionPayload = JSON.parse(raw);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null; // Expired
    }

    if (!payload.name) {
      payload.name = payload.username === 'adminsh' ? 'Admin SH' : payload.username;
    }
    if (!payload.role) {
      payload.role = 'admin';
    }

    return payload;
  } catch {
    return null;
  }
}

// Extract and verify session from NextRequest cookies or Authorization header
export function getAuthenticatedSession(req: NextRequest): SessionPayload | null {
  // Check HttpOnly Cookie first
  const cookieToken = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (cookieToken) {
    const valid = verifySignedSessionToken(cookieToken);
    if (valid) return valid;
  }

  // Fallback to Bearer token header if present
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    return verifySignedSessionToken(token);
  }

  return null;
}
