import { NextRequest, NextResponse } from 'next/server';

/**
 * Showhouse Edge Proxy
 * Passes requests cleanly to Next.js App Router.
 * Authentication is enforced client-side via AuthGuard and server-side via API route handlers,
 * preventing any infinite 307 redirect loops in Chromium/Brave.
 */
export async function proxy(req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json).*)',
  ],
};
