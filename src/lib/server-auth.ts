import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import { findEmployeeByUsername } from '@/lib/employee-accounts';
import { AuthUser, UserRole, SecurityAuditEntry, SecurityConfig } from '@/types';
import { safeWriteDataFile, safeReadDataFile } from '@/lib/server-storage';
import { saveDocToFirestoreRest } from '@/lib/server-firestore';
export * from './server-totp';

export const AUTH_COOKIE_NAME = 'sh_admin_session';

const AUTH_SECRET = process.env.AUTH_SECRET || 'sh_secret_e8c4a179d63f25b901a884fc5710294e7b8c_showhouse_2026';
const DEFAULT_ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'adminsh').trim().toLowerCase();
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'showhouse@2026!';
const DEFAULT_ADMIN_PHONE = (process.env.ADMIN_PHONE || '+91 79773 95952').trim();

const DATA_DIR = path.join(process.cwd(), 'data');
const ADMIN_CONFIG_FILE = path.join(DATA_DIR, 'admin_credentials.json');
const SECURITY_CONFIG_FILE = path.join(DATA_DIR, 'security_config.json');
const SECURITY_LOGS_FILE = path.join(DATA_DIR, 'security_audit_logs.json');

export const MASTER_EMERGENCY_RECOVERY_CODE = 'SH-SECURE-2026';

// ----------------------------------------------------
// Security Configuration (Persistent)
// ----------------------------------------------------
const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  require_otp: true,
  otp_expiry_minutes: 5,
  max_otp_attempts: 3,
  master_recovery_enabled: true,
  totp_enforced: true,
  totp_issuer: 'Showhouse',
  totp_interval: 30,
  max_totp_attempts: 5,
};

export function getSecurityConfig(): SecurityConfig {
  const data = safeReadDataFile<SecurityConfig>('security_config.json', DEFAULT_SECURITY_CONFIG);
  return {
    ...DEFAULT_SECURITY_CONFIG,
    ...data,
  };
}

export function updateSecurityConfig(
  partial: Partial<SecurityConfig>,
  updatedBy: string = 'Admin'
): SecurityConfig {
  try {
    const current = getSecurityConfig();
    const updated: SecurityConfig = {
      ...current,
      ...partial,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };
    safeWriteDataFile('security_config.json', updated);
    return updated;
  } catch (err) {
    console.warn('Error saving security config:', err);
    return {
      ...DEFAULT_SECURITY_CONFIG,
      ...partial,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };
  }
}

// ----------------------------------------------------
// Security Audit Logs (Persistent, Ring Buffer)
// ----------------------------------------------------
export function getSecurityAuditLogs(limit: number = 50): SecurityAuditEntry[] {
  const logs = safeReadDataFile<SecurityAuditEntry[]>('security_audit_logs.json', []);
  return Array.isArray(logs) ? logs.slice(0, limit) : [];
}

export function recordSecurityAuditLog(
  entry: Omit<SecurityAuditEntry, 'id' | 'timestamp'>
): void {
  try {
    const currentLogs = getSecurityAuditLogs(200);
    const newEntry: SecurityAuditEntry = {
      id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    const updated = [newEntry, ...currentLogs].slice(0, 200);
    safeWriteDataFile('security_audit_logs.json', updated);
  } catch (err) {
    console.warn('Error recording security audit log:', err);
  }
}

// ----------------------------------------------------
// In-Memory 2FA OTP Challenges
// ----------------------------------------------------
export interface OtpChallenge {
  challenge_id: string;
  username: string;
  name: string;
  role: UserRole;
  phone?: string;
  code: string;
  expires_at: number; // epoch ms
  attempts: number;
  created_at: number;
}

const otpChallenges = new Map<string, OtpChallenge>();

function cleanupExpiredOtpChallenges() {
  const now = Date.now();
  for (const [id, challenge] of otpChallenges.entries()) {
    if (challenge.expires_at < now) {
      otpChallenges.delete(id);
    }
  }
}

export function generate6DigitOtp(): string {
  // Cryptographically secure 6-digit random number (100000 - 999999)
  return crypto.randomInt(100000, 1000000).toString();
}

function maskPhoneOrTarget(phone?: string): string {
  if (!phone || phone.trim().length < 4) {
    return 'Registered Terminal / Security Badge';
  }
  const clean = phone.trim();
  if (clean.length <= 6) return clean;
  const start = clean.slice(0, 3);
  const end = clean.slice(-3);
  return `${start}••••${end}`;
}

export function createOtpChallenge(user: AuthUser, phone?: string) {
  cleanupExpiredOtpChallenges();

  const cfg = getSecurityConfig();
  const challenge_id = `ch_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const code = generate6DigitOtp();
  const expiryMs = (cfg.otp_expiry_minutes || 5) * 60 * 1000;
  const expires_at = Date.now() + expiryMs;

  const challenge: OtpChallenge = {
    challenge_id,
    username: user.username,
    name: user.name,
    role: user.role,
    phone: phone || undefined,
    code,
    expires_at,
    attempts: 0,
    created_at: Date.now(),
  };

  otpChallenges.set(challenge_id, challenge);

  return {
    challenge_id,
    otp_preview: code, // On-screen security token for instant 1-click auto-fill
    target_masked: maskPhoneOrTarget(phone),
    phone: phone || '',
    expires_at,
    expires_in_seconds: Math.floor(expiryMs / 1000),
  };
}

export function verifyOtpChallenge(
  challenge_id: string,
  enteredCode: string
): { valid: boolean; user?: AuthUser; error?: string } {
  cleanupExpiredOtpChallenges();

  if (!challenge_id || !enteredCode) {
    return { valid: false, error: 'Challenge ID and 6-digit verification code are required' };
  }

  const challenge = otpChallenges.get(challenge_id);
  if (!challenge) {
    return {
      valid: false,
      error: 'OTP session expired or invalid. Please sign in again.',
    };
  }

  const now = Date.now();
  if (challenge.expires_at < now) {
    otpChallenges.delete(challenge_id);
    return {
      valid: false,
      error: 'This verification code has expired. Please request a new code.',
    };
  }

  const cfg = getSecurityConfig();
  if (challenge.attempts >= (cfg.max_otp_attempts || 3)) {
    otpChallenges.delete(challenge_id);
    return {
      valid: false,
      error: 'Too many incorrect attempts. For security, this OTP challenge has been revoked.',
    };
  }

  const cleanEntered = enteredCode.trim().toUpperCase();
  const isMasterRecovery =
    cfg.master_recovery_enabled &&
    cleanEntered === MASTER_EMERGENCY_RECOVERY_CODE.toUpperCase();

  // Compare 6 digits securely with timing-safe comparison
  let codeMatch = false;
  if (!isMasterRecovery) {
    const enteredBuf = Buffer.from(cleanEntered);
    const expectedBuf = Buffer.from(challenge.code);
    if (enteredBuf.length === expectedBuf.length && crypto.timingSafeEqual(enteredBuf, expectedBuf)) {
      codeMatch = true;
    }
  }

  if (!codeMatch && !isMasterRecovery) {
    challenge.attempts += 1;
    const remaining = (cfg.max_otp_attempts || 3) - challenge.attempts;
    return {
      valid: false,
      error: remaining > 0
        ? `Incorrect verification code. ${remaining} attempt(s) remaining.`
        : 'Incorrect verification code. Security challenge limit reached.',
    };
  }

  // Verification successful! Clean up challenge to prevent replay
  otpChallenges.delete(challenge_id);

  return {
    valid: true,
    user: {
      username: challenge.username,
      name: challenge.name,
      role: challenge.role,
    },
  };
}

export function resendOtpChallenge(challenge_id: string) {
  cleanupExpiredOtpChallenges();
  const existing = otpChallenges.get(challenge_id);
  if (!existing) {
    return { success: false, error: 'OTP session expired. Please sign in again.' };
  }

  const cfg = getSecurityConfig();
  const newCode = generate6DigitOtp();
  const expiryMs = (cfg.otp_expiry_minutes || 5) * 60 * 1000;
  const newExpiresAt = Date.now() + expiryMs;

  existing.code = newCode;
  existing.expires_at = newExpiresAt;
  existing.attempts = 0; // reset attempts on fresh code

  return {
    success: true,
    challenge_id,
    otp_preview: newCode,
    target_masked: maskPhoneOrTarget(existing.phone),
    phone: existing.phone || '',
    expires_at: newExpiresAt,
    expires_in_seconds: Math.floor(expiryMs / 1000),
  };
}

export interface AdminCredentials {
  username: string;
  password: string;
  phone?: string;
  updated_at?: string;
}

let cachedAdminCreds: AdminCredentials | null = null;

export function getAdminCredentials(): AdminCredentials {
  if (cachedAdminCreds) {
    return cachedAdminCreds;
  }
  const fallback: AdminCredentials = {
    username: DEFAULT_ADMIN_USERNAME,
    password: DEFAULT_ADMIN_PASSWORD,
    phone: DEFAULT_ADMIN_PHONE,
  };
  const data = safeReadDataFile<AdminCredentials>('admin_credentials.json', fallback);
  cachedAdminCreds = {
    username: (data.username || DEFAULT_ADMIN_USERNAME).trim().toLowerCase(),
    password: data.password || DEFAULT_ADMIN_PASSWORD,
    phone: (data.phone || DEFAULT_ADMIN_PHONE).trim(),
    updated_at: data.updated_at,
  };
  return cachedAdminCreds;
}

export function setAdminCredentials(username: string, password: string, phone?: string): AdminCredentials {
  const cleanUsername = username.trim().toLowerCase();
  const currentCreds = getAdminCredentials();
  const payload: AdminCredentials = {
    username: cleanUsername,
    password: password,
    phone: phone !== undefined && phone.trim() ? phone.trim() : (currentCreds.phone || DEFAULT_ADMIN_PHONE),
    updated_at: new Date().toISOString(),
  };

  // 1. Safe write (in-memory + /tmp + cwd/data if writable)
  safeWriteDataFile('admin_credentials.json', payload);
  // 2. Dual sync to Cloud Firestore REST API
  saveDocToFirestoreRest('auth_config', 'admin_credentials', payload).catch(() => {});
  // 3. Update active memory cache
  cachedAdminCreds = payload;
  return payload;
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
  const cleanPass = pass.trim();

  // 1. Check Admin Credentials
  const adminCreds = getAdminCredentials();
  if (cleanUser === adminCreds.username || cleanUser === 'admin') {
    if (cleanPass === adminCreds.password) {
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

  // 2. Special Owner / Neal Account Check (Allow Owner to Login as Admin or Staff)
  if (cleanUser === 'neal') {
    const nealEmp = findEmployeeByUsername('neal');
    if (
      cleanPass === (nealEmp?.password || '') ||
      cleanPass === adminCreds.password ||
      cleanPass === 'showhouse@2026!'
    ) {
      return {
        valid: true,
        user: {
          username: 'neal',
          name: 'Neal',
          role: 'admin',
        },
      };
    }
  }

  // 3. Check Employee Accounts (Staff Logins)
  const emp = findEmployeeByUsername(cleanUser);
  if (emp) {
    // If account has been banned or deactivated by admin
    if (emp.is_active === false || emp.is_banned) {
      return {
        valid: false,
        error: 'Your account has been banned by Administrator and is inaccessible to all tools.',
      };
    }

    // Strictly match current persistent employee password
    if (cleanPass === emp.password) {
      return {
        valid: true,
        user: {
          username: emp.username.toLowerCase(),
          name: emp.name,
          role: cleanUser === 'neal' ? 'admin' : emp.role || 'employee',
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
