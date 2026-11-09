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

    return NextResponse.json({ success: true, returnRecord: newReturn });
  } catch (err: any) {
    console.error('Error creating goods return:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}

