import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import { getAllQuotations, saveQuotationsAsync } from '@/lib/server-accounting';
import { syncFromFirestoreIfCold, invalidateDataCache } from '@/lib/server-storage';
import { deleteDocFromFirestoreRest } from '@/lib/server-firestore';
import { Quotation } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  invalidateDataCache('quotations.json');
  await syncFromFirestoreIfCold<Quotation[]>('quotations.json', []);

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customerId');
  const siteId = searchParams.get('siteId');
  const search = (searchParams.get('search') || '').toLowerCase().trim();

  let list = getAllQuotations();

  // Employee data visibility
  if (session && session.role === 'employee') {
    const uName = (session.name || '').toLowerCase().trim();
    const uUser = (session.username || '').toLowerCase().trim();
    list = list.filter((q) => {
      const pb = (q.prepared_by || '').toLowerCase();
      const cb = (q.created_by || '').toLowerCase();
      return (
        (uUser && (cb === uUser || pb.includes(uUser))) ||
        (uName && (pb.includes(uName) || cb.includes(uName)))
      );
    });
  }

  if (customerId) {
    list = list.filter((q) => q.customer_id === customerId);
  }

  if (siteId && siteId !== 'all') {
    list = list.filter((q) => q.site_id === siteId || q.site_name === siteId);
  }

  if (search) {
    list = list.filter(
      (q) =>
        q.quotation_number.toLowerCase().includes(search) ||
        q.customer_name.toLowerCase().includes(search) ||
        (q.site_name && q.site_name.toLowerCase().includes(search))
    );
  }

  return NextResponse.json(
    { success: true, quotations: list },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const incoming: Quotation | Quotation[] = body.quotation || body.quotations || body;

    let current = getAllQuotations();

    if (Array.isArray(incoming)) {
      const map = new Map<string, Quotation>();
      current.forEach((q) => map.set(q.id, q));
      incoming.forEach((q) => {
        if (q && q.id) map.set(q.id, q);
      });
      current = Array.from(map.values());
    } else if (incoming && typeof incoming === 'object' && incoming.id) {
      const idx = current.findIndex((q) => q.id === incoming.id);
      if (idx !== -1) {
        current[idx] = {
          ...current[idx],
          ...incoming,
          updated_at: new Date().toISOString(),
        };
      } else {
        current.unshift({
          ...incoming,
          created_at: incoming.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } else {
      return NextResponse.json({ success: false, error: 'Invalid quotation payload' }, { status: 400 });
    }

    await saveQuotationsAsync(current);
    invalidateDataCache('quotations.json');

    return NextResponse.json({
      success: true,
      quotation: Array.isArray(incoming) ? incoming[0] : incoming,
      quotations: current,
    });
  } catch (err: any) {
    console.error('Error saving quotation:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to save quotation' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ success: false, error: 'Quotation ID required' }, { status: 400 });
  }

  const current = getAllQuotations();
  const filtered = current.filter((q) => q.id !== id);

  await saveQuotationsAsync(filtered);
  invalidateDataCache('quotations.json');
  deleteDocFromFirestoreRest('quotations', id).catch(() => {});

  return NextResponse.json({ success: true, remaining: filtered.length });
}
