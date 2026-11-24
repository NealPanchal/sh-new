import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import {
  getGoodsReturns,
  addGoodsReturn,
  getAllChallans,
  recordAuditLog,
} from '@/lib/server-accounting';
import { GoodsReturn, GoodsReturnItem } from '@/types';

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const challanId = searchParams.get('challanId');
  const customerId = searchParams.get('customerId');

  try {
    const { syncFromFirestoreIfCold } = await import('@/lib/server-storage');
    await syncFromFirestoreIfCold('goods_returns.json', []);
  } catch {}

  let list = getGoodsReturns();
  if (challanId) {
    list = list.filter((r) => r.challan_id === challanId);
  }
  if (customerId) {
    list = list.filter((r) => r.customer_id === customerId);
  }

  list.sort((a, b) => new Date(b.return_date || b.created_at).getTime() - new Date(a.return_date || a.created_at).getTime());

  return NextResponse.json({ success: true, returns: list });
}

export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      challan_id,
      challan_number,
      customer_id,
      customer_name,
      site_id,
      site_name,
      return_date,
      reason,
      items,
    } = body;

    if (!challan_id || !challan_number) {
      return NextResponse.json({ success: false, error: 'Original challan is required for returns' }, { status: 400 });
    }
    if (!reason || !reason.trim()) {
      return NextResponse.json({ success: false, error: 'Reason for goods return is required' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one item must be returned' }, { status: 400 });
    }

    // Fetch original challan to verify delivered quantities and rates
    const challans = getAllChallans();
    const originalChallan = challans.find((c) => c.id === challan_id);
    if (!originalChallan) {
      return NextResponse.json({ success: false, error: 'Original challan not found in database' }, { status: 404 });
    }

    // Fetch previous returns against this challan to ensure limit isn't exceeded
    const allReturns = getGoodsReturns();
    const previousReturns = allReturns.filter((r) => r.challan_id === challan_id);

    const returnId = `ret_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const returnYear = new Date().getFullYear();
    const returnSeq = String(allReturns.length + 1).padStart(4, '0');
    const return_number = `BO/RET/${returnYear}/${returnSeq}`;

    let totalQty = 0;
    let totalAmt = 0;

    const validatedItems: GoodsReturnItem[] = [];

    for (const it of items) {
      const origItem = (originalChallan.items || []).find((oi) => oi.id === it.original_item_id);
      const deliveredQty = origItem ? Number(origItem.quantity) || 0 : Number(it.delivered_quantity) || 0;
      const rate = origItem && origItem.rate != null ? Number(origItem.rate) : Number(it.rate) || 0;

      // Calculate previously returned quantity for this line item
      let prevReturned = 0;
      previousReturns.forEach((pr) => {
        const matchingRetItem = pr.items.find((pri) => pri.original_item_id === it.original_item_id);
        if (matchingRetItem) {
          prevReturned += Number(matchingRetItem.return_quantity) || 0;
        }
      });

      const maxAllowed = deliveredQty - prevReturned;
      const returnQty = Number(it.return_quantity) || 0;

      if (returnQty <= 0) continue;

      if (returnQty > maxAllowed) {
        return NextResponse.json(
          {
            success: false,
            error: `Return quantity (${returnQty}) exceeds remaining delivered balance (${maxAllowed}) for item: ${it.item_description}`,
          },
          { status: 400 }
        );
      }

      const itemAmt = Math.round(returnQty * rate * 100) / 100;
      totalQty += returnQty;
      totalAmt += itemAmt;

      validatedItems.push({
        id: `reti_${Date.now()}_${validatedItems.length + 1}`,
        return_id: returnId,
        original_item_id: it.original_item_id,
        item_description: it.item_description || origItem?.item_description || 'Laminate item',
        unit: it.unit || origItem?.unit || 'sheets',
        delivered_quantity: deliveredQty,
        previously_returned: prevReturned,
        return_quantity: returnQty,
        rate,
        return_amount: itemAmt,
      });
    }

    if (validatedItems.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid return items with quantity > 0 provided' }, { status: 400 });
    }

    const newReturn: GoodsReturn = {
      id: returnId,
      return_number,
      challan_id,
      challan_number,
      customer_id: customer_id || originalChallan.customer_id,
      customer_name: customer_name || originalChallan.customer_name,
      site_id: site_id || originalChallan.site_id || null,
      site_name: site_name || originalChallan.site_name || null,
      return_date: return_date || new Date().toISOString().slice(0, 10),
      reason,
      total_return_quantity: totalQty,
      total_return_amount: Math.round(totalAmt * 100) / 100,
      created_by: session.name || session.username,
      created_at: new Date().toISOString(),
      items: validatedItems,
    };

    addGoodsReturn(newReturn);

    // Update original challan with return tracking
    try {
      const { saveAllChallans } = await import('@/lib/server-accounting');
      const challanIdx = challans.findIndex((c) => c.id === challan_id);
      if (challanIdx >= 0) {
        const orig = challans[challanIdx];
        const prevRetAmt = Number((orig as any).returned_amount) || 0;
        const newRetAmt = prevRetAmt + Math.round(totalAmt * 100) / 100;
        const prevRetIds = Array.isArray((orig as any).return_ids) ? (orig as any).return_ids : [];
        (orig as any).has_returns = true;
        (orig as any).returned_amount = newRetAmt;
        (orig as any).return_ids = [...prevRetIds, newReturn.id];
        (orig as any).last_return_number = newReturn.return_number;
        (orig as any).last_return_date = newReturn.return_date;
        challans[challanIdx] = orig;
        saveAllChallans(challans);
      }
    } catch (e) {
      console.error('Error updating challan with return tracking:', e);
    }

    // Record Audit Log
    recordAuditLog({
      entity_type: 'goods_return',
      entity_id: newReturn.id,
      reference_no: newReturn.return_number,
      user_id: session.username,
      user_name: session.name,
      action: 'GOODS_RETURN',
      updated_values: newReturn,
      reason: `Processed goods return of ${totalQty} units (₹${totalAmt.toLocaleString('en-IN')}) against Challan ${challan_number}`,
    });

    // Auto-create Replacement Challan if requested (per user specification: Confirm creates new replacement challan with same returned details)
    let replacementChallan: any = null;
    if (body.auto_create_challan !== false) {
      try {
        const { saveAllChallans } = await import('@/lib/server-accounting');
        const { saveChallanToFirestoreRest } = await import('@/lib/server-firestore');
        const allChallans = getAllChallans();

        // Month prefix for challan numbering: SH/MM/XXX
        const targetDate = new Date();
        const monthPadded = String(targetDate.getMonth() + 1).padStart(2, '0');
        const prefix = 'SH/';
        const monthPattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${monthPadded}\\/(\\d+)$`, 'i');

        let maxSeq = 0;
        allChallans.forEach((c) => {
          if (!c.is_deleted && c.challan_number) {
            const m = c.challan_number.match(monthPattern);
            if (m && m[1]) {
              const n = parseInt(m[1], 10);
              if (!isNaN(n) && n > maxSeq) maxSeq = n;
            }
          }
        });

        let nextSeq = maxSeq + 1;
        while (
          allChallans.some(
            (c) =>
              c.challan_number === `${prefix}${monthPadded}/${String(nextSeq).padStart(3, '0')}` &&
              !c.is_deleted
          )
        ) {
          nextSeq++;
        }
        const nextChallanNumber = `${prefix}${monthPadded}/${String(nextSeq).padStart(3, '0')}`;

        // Create replacement / return challan containing the selected returned items
        const returnChallanItems = validatedItems.map((vi, idx) => {
          const origItem = (originalChallan.items || []).find(
            (oi: any) =>
              oi.id === vi.original_item_id ||
              oi.item_description?.trim().toLowerCase() === vi.item_description?.trim().toLowerCase()
          );
          return {
            id: `ch_item_${Date.now()}_${idx + 1}`,
            serial_number: idx + 1,
            item_description: vi.item_description || origItem?.item_description || 'Returned Item',
            brand: origItem?.brand || null,
            colour_finish: origItem?.colour_finish || null,
            size: origItem?.size || null,
            unit: vi.unit || origItem?.unit || 'sheets',
            quantity: vi.return_quantity,
            rate: vi.rate,
            amount: vi.return_amount,
            created_at: new Date().toISOString(),
          };
        });

        if (returnChallanItems.length > 0) {
          const subtotal = totalAmt;
          const applyGst = Boolean((originalChallan as any).apply_additional_9 || (originalChallan as any).cgst_amount);
          const cgst = applyGst ? Math.round(subtotal * 0.09 * 100) / 100 : 0;
          const sgst = applyGst ? Math.round(subtotal * 0.09 * 100) / 100 : 0;
          const totalAmount = Math.round((subtotal + cgst + sgst) * 100) / 100;

          const replId = `ch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          replacementChallan = {
            id: replId,
            user_id: session.username || 'adminsh',
            challan_number: nextChallanNumber,
            document_type: originalChallan.document_type || 'both',
            challan_date: newReturn.return_date,
            customer_id: newReturn.customer_id,
            customer_name: newReturn.customer_name,
            customer_phone: originalChallan.customer_phone || '',
            customer_address: originalChallan.customer_address || '',
            customer_gstin: originalChallan.customer_gstin || null,
            delivery_address: originalChallan.delivery_address || null,
            site_id: newReturn.site_id,
            site_name: newReturn.site_name,
            reference_number: `REPL/${originalChallan.challan_number}`,
            notes: `Goods Return for ${newReturn.return_number} (Ref: ${originalChallan.challan_number})`,
            prepared_by: session.name || 'Vrushank',
            created_by: session.username || 'admin',
            status: 'approved',
            is_goods_return: true,
            delivery_status: 'delivered',
            share_status: 'not_shared',
            is_delivered: true,
            total_quantity: totalQty,
            subtotal_amount: subtotal,
            transportation_charges: null,
            selection_charges: null,
            apply_additional_9: applyGst,
            cgst_amount: cgst,
            sgst_amount: sgst,
            total_amount: totalAmount,
            items: returnChallanItems,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          allChallans.unshift(replacementChallan);
          saveAllChallans(allChallans);

          // Update matching credit note manual entry with new replacement challan details
          try {
            const { getManualLedgerEntries, saveManualLedgerEntries } = await import('@/lib/server-accounting');
            const manualEntries = getManualLedgerEntries();
            const mIdx = manualEntries.findIndex((m) => m.id === `vch_gr_${newReturn.id}` || m.voucher_no === newReturn.return_number);
            if (mIdx >= 0) {
              (manualEntries[mIdx] as any).replacement_challan_id = replacementChallan.id;
              (manualEntries[mIdx] as any).replacement_challan_number = replacementChallan.challan_number;
              saveManualLedgerEntries(manualEntries);
            }
          } catch {}

          // Dual-sync to Firestore REST non-blockingly
          saveChallanToFirestoreRest(replacementChallan).catch((fErr) => {
            console.warn('Firestore replacement challan save note:', fErr);
          });

          // Record Audit Log for replacement challan
          recordAuditLog({
            entity_type: 'challan',
            entity_id: replacementChallan.id,
            reference_no: replacementChallan.challan_number,
            user_id: session.username,
            user_name: session.name,
            action: 'CREATE',
            updated_values: replacementChallan,
            reason: `Created Goods Return replacement challan ${replacementChallan.challan_number} for returned items against Challan ${challan_number}`,
          });
        }
      } catch (challanErr) {
        console.error('Error auto-creating replacement challan for return:', challanErr);
      }
    }

    return NextResponse.json({ success: true, returnRecord: newReturn, replacementChallan });
  } catch (err: any) {
    console.error('Error creating goods return:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}

