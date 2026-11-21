import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import { findEmployeeByUsername } from '@/lib/employee-accounts';
import { AuthUser, UserRole } from '@/types';

export const AUTH_COOKIE_NAME = 'sh_admin_session';

const AUTH_SECRET = process.env.AUTH_SECRET || 'sh_secret_e8c4a179d63f25b901a884fc5710294e7b8c_showhouse_2026';
const DEFAULT_ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'adminsh').trim().toLowerCase();
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'showhouse@2026!';

const DATA_DIR = path.join(process.cwd(), 'data');
const ADMIN_CONFIG_FILE = path.join(DATA_DIR, 'admin_credentials.json');

export interface AdminCredentials {
  username: string;
  password: string;
  updated_at?: string;
}

let cachedAdminCreds: AdminCredentials | null = null;
let cachedMtime = 0;

export function getAdminCredentials(): AdminCredentials {
  try {
    if (fs.existsSync(ADMIN_CONFIG_FILE)) {
      const stat = fs.statSync(ADMIN_CONFIG_FILE);
      if (cachedAdminCreds && cachedMtime === stat.mtimeMs) {
        return cachedAdminCreds;
      }
      const raw = fs.readFileSync(ADMIN_CONFIG_FILE, 'utf-8');
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        cachedAdminCreds = {
          username: (parsed.username || DEFAULT_ADMIN_USERNAME).trim().toLowerCase(),
          password: parsed.password || DEFAULT_ADMIN_PASSWORD,
          updated_at: parsed.updated_at,
        };
        cachedMtime = stat.mtimeMs;
        return cachedAdminCreds;
      }
    }
  } catch (err) {
    console.error('Error reading admin_credentials.json:', err);
  }

  return {
    username: DEFAULT_ADMIN_USERNAME,
    password: DEFAULT_ADMIN_PASSWORD,
  };
}

export function setAdminCredentials(username: string, password: string): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const cleanUsername = username.trim().toLowerCase();
    const payload: AdminCredentials = {
      username: cleanUsername,
      password: password,
      updated_at: new Date().toISOString(),
    };
    fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    cachedAdminCreds = payload;
    try {
      cachedMtime = fs.statSync(ADMIN_CONFIG_FILE).mtimeMs;
    } catch {}
  } catch (err) {
    console.error('Error saving admin credentials:', err);
    throw err;
  }
}

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
): { valid: boolean; user?: AuthUser; error?: string } {
  if (!username || !pass) return { valid: false };

  const cleanUser = username.trim().toLowerCase();

  // 1. Check Admin Credentials
  const adminCreds = getAdminCredentials();
  if (cleanUser === adminCreds.username) {
    const passBuf = Buffer.from(pass);
    const adminBuf = Buffer.from(adminCreds.password);
    if (passBuf.length === adminBuf.length && crypto.timingSafeEqual(passBuf, adminBuf)) {
      return {
        valid: true,
        user: {
          username: adminCreds.username,
          name: 'Admin SH',
          role: 'admin',
        },
      };
    }
  }

  // 2. Check Employee Accounts (Staff Logins)
  const emp = findEmployeeByUsername(cleanUser);
  if (emp) {
    // If account has been banned or deactivated by admin
    if (emp.is_active === false || emp.is_banned) {
      return {
        valid: false,
        error: 'Your account has been banned by Administrator and is inaccessible to all tools.',
      };
    }

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
  role: UserRole;
  exp: number;
  iat: number;
}

export function createSignedSessionToken(
  user: { username: string; name?: string; role?: UserRole } | string = 'adminsh'
): string {
  const now = Math.floor(Date.now() / 1000);
  const username = typeof user === 'string' ? user : user.username;
  const role: UserRole = typeof user === 'string' ? 'admin' : (user.role || 'admin');
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
  let session: SessionPayload | null = null;

  // Check HttpOnly Cookie first
  const cookieToken = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (cookieToken) {
    session = verifySignedSessionToken(cookieToken);
  }

  // Fallback to Bearer token header if present
  if (!session) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      session = verifySignedSessionToken(token);
    }
  }

  if (!session) return null;

  // If this is an employee account, ensure they have not been banned
  if (session.role === 'employee') {
    const emp = findEmployeeByUsername(session.username);
    if (!emp || emp.is_active === false || emp.is_banned) {
      return null; // Banned employee session revoked
    }
  }

  return session;
}
