import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import { getAllQuotations, saveQuotationsAsync, getAllCustomers } from '@/lib/server-accounting';
import { syncFromFirestoreIfCold, invalidateDataCache } from '@/lib/server-storage';
import { deleteDocFromFirestoreRest } from '@/lib/server-firestore';
import { Quotation } from '@/types';
import { deduplicateMaterialRates } from '@/lib/utils';

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

  // Employee data visibility:
  // Employee sees quotations belonging to their assigned/created customers + any they prepared/created.
  // Admin sees all company quotations without restriction.
  if (session && session.role === 'employee') {
    const uName = (session.name || '').toLowerCase().trim();
    const uUser = (session.username || '').toLowerCase().trim();
    const allCusts = getAllCustomers();
    const empCustIds = new Set<string>();
    const empCustNames = new Set<string>();

    allCusts.forEach((c) => {
      const cr = (c.created_by || '').toLowerCase().trim();
      const crN = (c.creator_name || '').toLowerCase().trim();
      const uId = (c.user_id || '').toLowerCase().trim();
      const assId = ((c as any).assigned_staff_id || '').toLowerCase().trim();
      const assName = ((c as any).assigned_staff_name || '').toLowerCase().trim();
      const matches =
        (uUser && (cr === uUser || uId === uUser || assId === uUser)) ||
        (uName && (cr.includes(uName) || crN.includes(uName) || uId.includes(uName) || assName.includes(uName)));
      if (matches) {
        if (c.id) empCustIds.add(c.id);
        if (c.name) empCustNames.add(c.name.toLowerCase().trim());
        if (c.business_name) empCustNames.add(c.business_name.toLowerCase().trim());
      }
    });

    list = list.filter((q) => {
      // 1. Belongs to employee's customer
      if (q.customer_id && empCustIds.has(q.customer_id)) return true;
      const cName = (q.customer_name || '').toLowerCase().trim();
      if (cName && empCustNames.has(cName)) return true;

      // 2. Created or prepared by this employee
      const pb = (q.prepared_by || '').toLowerCase().trim();
      const cb = (q.created_by || '').toLowerCase().trim();
      if (uUser && (cb === uUser || pb === uUser || pb.includes(uUser))) return true;
      if (uName && (pb.includes(uName) || cb.includes(uName))) return true;

      return false;
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
  const operatorUsername = session?.username || 'admin';

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

    // Auto-sync quoted items into customer's material_rates
    try {
      const qList: Quotation[] = Array.isArray(incoming) ? incoming : [incoming];
      const { getAllCustomers, saveCustomersAsync } = await import('@/lib/server-accounting');
      const allCusts = getAllCustomers();
      let custsChanged = false;

      qList.forEach((q) => {
        if (!q.customer_id || !Array.isArray(q.items) || q.items.length === 0) return;
        const cIdx = allCusts.findIndex((c) => c.id === q.customer_id);
        if (cIdx === -1) return;

        const cust = allCusts[cIdx];
        const existingRates = Array.isArray(cust.material_rates) ? [...cust.material_rates] : [];
        const rateMap = new Map<string, any>();
        const getRateKey = (mr: any) => {
          const sKey = (mr.site_name || mr.site_id || '').trim().toLowerCase();
          const raw = (mr.particulars || mr.material || '').trim();
          const cleanParticulars = raw.replace(/^\s*\[\s*([^\]]+?)\s*\]\s*/, '').trim().toLowerCase();
          let r = (mr.room || 'general').trim().toLowerCase();
          const bracketMatch = raw.match(/^\s*\[\s*([^\]]+?)\s*\]\s*/);
          if (bracketMatch && r === 'general') {
            r = bracketMatch[1].trim().toLowerCase();
          }
          const cKey = (mr.code || '').trim().toLowerCase();
          return `${sKey}::${r}::${cleanParticulars}::${cKey}`;
        };

        existingRates.forEach((mr: any) => {
          if (mr && (mr.particulars || mr.material || mr.rate)) {
            const key = getRateKey(mr);
            const prev = rateMap.get(key);
            const raw = (mr.particulars || mr.material || '').trim();
            const cleanParticulars = raw.replace(/^\s*\[\s*([^\]]+?)\s*\]\s*/, '').trim();
            let room = mr.room || 'General';
            const bracketMatch = raw.match(/^\s*\[\s*([^\]]+?)\s*\]\s*/);
            if (bracketMatch && room === 'General') {
              room = bracketMatch[1].trim();
            }

            if (prev) {
              const preferredRoom = (mr.room && mr.room !== 'General') ? mr.room : (prev.room && prev.room !== 'General') ? prev.room : room;
              rateMap.set(key, {
                ...prev,
                particulars: cleanParticulars || prev.particulars,
                material: cleanParticulars || prev.material,
                room: preferredRoom,
                code: mr.code || prev.code || '',
                company_name: mr.company_name || prev.company_name || 'Showhouse',
                rate: Number(mr.rate) || Number(prev.rate) || 0,
              });
            } else {
              rateMap.set(key, {
                ...mr,
                particulars: cleanParticulars || mr.particulars,
                material: cleanParticulars || mr.material,
                room: room,
              });
            }
          }
        });

        q.items.forEach((it) => {
          let rawDesc = (it.item_description || '').trim();
          if (!rawDesc) return;
          const rate = Number(it.rate) || 0;
          if (rate <= 0) return;

          let extractedRoom: string | null = null;
          const roomMatch = rawDesc.match(/^\s*\[\s*([^\]]+?)\s*\]\s*/);
          if (roomMatch) {
            extractedRoom = roomMatch[1].trim();
            rawDesc = rawDesc.replace(/^\s*\[\s*([^\]]+?)\s*\]\s*/, '').trim();
          }

          const desc = rawDesc;
          const brand = (it.brand || '').trim();
          const sId = q.site_id || null;
          const sName = q.site_name || null;
          const sKey = (sName || sId || '').trim().toLowerCase();
          const rKey = (extractedRoom || 'General').toLowerCase();
          const mKey = desc.toLowerCase();
          const cKey = (it.colour_finish || '').trim().toLowerCase();
          const key = `${sKey}::${rKey}::${mKey}::${cKey}`;

          const prev = rateMap.get(key);
          if (prev) {
            rateMap.set(key, {
              ...prev,
              particulars: desc,
              material: desc,
              company_name: brand || prev.company_name || 'Showhouse',
              rate: rate,
              room: (prev.room && prev.room !== 'General') ? prev.room : (extractedRoom || prev.room || 'General'),
              code: it.colour_finish || prev.code || '',
              site_id: sId || prev.site_id,
              site_name: sName || prev.site_name,
            });
          } else {
            rateMap.set(key, {
              id: `mr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              site_id: sId,
              site_name: sName,
              material: desc,
              particulars: desc,
              room: extractedRoom || 'General',
              code: it.colour_finish || '',
              company_name: brand || 'Showhouse',
              rate: rate,
            });
          }
        });

        allCusts[cIdx] = {
          ...cust,
          material_rates: deduplicateMaterialRates(Array.from(rateMap.values()), cust.sites),
          updated_at: new Date().toISOString(),
        };
        custsChanged = true;
      });

      if (custsChanged) {
        await saveCustomersAsync(allCusts);
        invalidateDataCache('customers.json');
      }
    } catch (e) {
      console.warn('Quotation material sync error:', e);
    }

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

  // Employees cannot delete quotations; quotations must be preserved
  if (session.role === 'employee') {
    return NextResponse.json({ success: false, error: 'Employees cannot delete quotations. Quotations must be preserved.' }, { status: 403 });
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
