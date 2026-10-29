import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession, createSignedSessionToken, AUTH_COOKIE_NAME } from '@/lib/server-auth';

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value || createSignedSessionToken(session);
  return NextResponse.json({
    authenticated: true,
    token,
    user: {
      username: session.username,
      name: session.name || (session.username === 'adminsh' ? 'Admin SH' : session.username),
      role: session.role || 'admin',
    },
  });
}

