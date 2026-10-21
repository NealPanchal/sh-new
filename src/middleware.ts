import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE_NAME = 'sh_admin_session';
const AUTH_SECRET = process.env.AUTH_SECRET || 'sh_secret_e8c4a179d63f25b901a884fc5710294e7b8c_showhouse_2026';

/**
 * Universal base64url encoder/decoder (Edge & Node runtime compatible)
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64url');
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseBase64UrlJson(str: string): any {
  if (typeof Buffer !== 'undefined') {
    return JSON.parse(Buffer.from(str, 'base64url').toString('utf-8'));
  }
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return JSON.parse(atob(base64));
}

/**
 * Web Crypto subtle HMAC verification compatible with Edge Runtime
 */
async function verifySessionToken(token: string | null | undefined): Promise<boolean> {
  if (!token || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payloadB64, signature] = parts;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(AUTH_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const expectedSigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
    const expectedSig = arrayBufferToBase64Url(expectedSigBuf);

    if (signature !== expectedSig) {
      return false;
    }

    const payload = parseBase64UrlJson(payloadB64);
    const now = Math.floor(Date.now() / 1000);

    if (!payload || !payload.exp || payload.exp < now) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Bypass public static assets and system routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/images') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.ico')
  ) {
    return NextResponse.next();
  }

  // 2. Bypass public authentication APIs
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  // Extract session token from cookie or Authorization header
  const cookieToken = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
  const token = cookieToken || bearerToken;

  const isAuthenticated = await verifySessionToken(token);

  // 3. Handle /login route
  if (pathname === '/login') {
    if (isAuthenticated) {
      // If already logged in, redirect straight to dashboard
      const dashboardUrl = new URL('/', req.url);
      return NextResponse.redirect(dashboardUrl);
    }
    return NextResponse.next();
  }

  // 4. Protect API routes (/api/*)
  if (pathname.startsWith('/api/')) {
    if (!isAuthenticated) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized. Valid Showhouse Admin session required.',
        },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // 5. Protect all application dashboard pages (/, /challans, /bills, /customers, /products, /settings, etc.)
  if (!isAuthenticated) {
    const loginUrl = new URL('/login', req.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('from', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and _next
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json).*)',
  ],
};
