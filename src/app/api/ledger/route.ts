import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import {
  computeCustomerLedger,
  addManualLedgerEntry,
  deleteManualLedgerEntry,
  deleteLedgerEntry,
  recordAuditLog,
  ManualLedgerEntry,
} from '@/lib/server-accounting';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customerId');
  const siteId = searchParams.get('siteId') || undefined;
  const siteName = searchParams.get('siteName') || undefined;
  const fromDate = searchParams.get('fromDate') || undefined;
  const toDate = searchParams.get('toDate') || undefined;
  const typeFilter = searchParams.get('type') || undefined;

  if (!customerId) {
    return NextResponse.json({ success: false, error: 'Customer ID is required' }, { status: 400 });
  }

  try {
    const result = computeCustomerLedger(customerId, {
      siteId,
      siteName,
      fromDate,
      toDate,
      typeFilter,
    });

    return NextResponse.json({ success: true, ledger: result });
  } catch (err: any) {
    console.error('Error computing ledger:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  const operatorRole = session?.role || 'admin';
  const operatorName = session?.name || session?.username || 'Admin SH';

  if (operatorRole === 'employee') {
    return NextResponse.json(
      { success: false, error: 'Permission denied. Only Admins can add or record ledger entries.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();

    // 1-Click Rebuild customer ledger with all challans
    if (body.action === 'rebuild' || body.action === 'rebuild_customer_ledger') {
      const { customer_id } = body;
      if (!customer_id) {
        return NextResponse.json({ success: false, error: 'Customer ID is required' }, { status: 400 });
      }
      const { rebuildCustomerLedgerFromChallans } = await import('@/lib/server-accounting');
      const result = rebuildCustomerLedgerFromChallans(customer_id, operatorName);
      return NextResponse.json(result);
    }

    const { customer_id, date, particulars, payment_type, voucher_no, debit, credit, site_name, challan_id } = body;

    if (!customer_id || !particulars || (!debit && !credit)) {
      return NextResponse.json(
        { success: false, error: 'Customer, Particulars, and Debit/Credit amount are required' },
        { status: 400 }
      );
    }

    const entry: ManualLedgerEntry = {
      id: `mle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      customer_id,
      date: date || new Date().toISOString().slice(0, 10),
      particulars: particulars.trim(),
      payment_type: payment_type || (debit > 0 ? 'Sales GST' : 'Receipt'),
      voucher_no: voucher_no ? voucher_no.trim() : `VCH-${Date.now().toString().slice(-4)}`,
      debit: Number(debit) || 0,
      credit: Number(credit) || 0,
      site_name: site_name ? site_name.trim() : undefined,
      challan_id: challan_id ? challan_id.trim() : undefined,
      created_at: new Date().toISOString(),
      created_by: operatorName,
    };

    addManualLedgerEntry(entry);

    // Auto-save site if provided
    if (site_name && site_name.trim() && customer_id) {
      try {
        const { getCustomerSites, addOrUpdateSite } = await import('@/lib/server-accounting');
        const sites = getCustomerSites();
        const cleanSite = site_name.trim();
        const existing = sites.find(
          (s) => (s.customer_id === customer_id || s.customer_id.toLowerCase() === customer_id.toLowerCase()) &&
                 s.site_name.toLowerCase() === cleanSite.toLowerCase()
        );
        if (!existing) {
          addOrUpdateSite({
            id: `site_${customer_id}_${cleanSite.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
            customer_id,
            site_name: cleanSite,
            site_address: `${cleanSite} Site`,
            opening_balance: 0,
            credit_adjustment: 0,
            debit_adjustment: 0,
            current_balance: 0,
            order_index: sites.length,
            is_verified: true,
            verified_at: new Date().toISOString(),
            verified_by: operatorName,
            is_active: true,
            created_at: new Date().toISOString(),
          });
        }
      } catch (siteErr) {
        console.warn('Auto-save site from manual entry note:', siteErr);
      }
    }

    recordAuditLog({
      entity_type: 'site_adjustment',
      entity_id: entry.id,
      user_id: session?.username || 'adminsh',
      user_name: operatorName,
      action: 'ADD_LEDGER_ENTRY',
      updated_values: entry,
      reason: `Manual ledger entry [${entry.payment_type}] ${entry.voucher_no} - ₹${(entry.debit || entry.credit).toLocaleString('en-IN')}`,
    });

    return NextResponse.json({ success: true, entry });
  } catch (err: any) {
    console.error('Error adding ledger entry:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  const operatorName = session?.name || session?.username || 'Admin SH';
  const operatorRole = session?.role || 'admin';
  const operatorUsername = session?.username || 'adminsh';

  if (operatorRole === 'employee') {
    return NextResponse.json(
      { success: false, error: 'Permission denied. Only Admins can edit ledger data.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      id,
      customer_id,
      date,
      particulars,
      payment_type,
      voucher_no,
      debit,
      credit,
      site_name,
      challan_id,
      manual_id,
      source_type,
      reason,
    } = body;

    const targetId = id || manual_id || challan_id;
    if (!targetId) {
      return NextResponse.json({ success: false, error: 'Entry ID is required for editing' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const reasonText = (reason || '').trim() || 'Admin ledger adjustment / correction';

    const {
      getManualLedgerEntries,
      saveManualLedgerEntries,
      getAllChallans,
      saveAllChallans,
      addOrUpdateSite,
      getCustomerSites,
      recordAuditLog,
    } = await import('@/lib/server-accounting');

    let updatedRecord: any = null;
    const manualEntries = getManualLedgerEntries();
    const manualIdx = manualEntries.findIndex((m) => m.id === targetId || (manual_id && m.id === manual_id));

    if (manualIdx >= 0) {
      const prev = manualEntries[manualIdx];
      const diffs: string[] = [];
      if (Number(prev.debit) !== Number(debit)) diffs.push(`Debit: ₹${prev.debit} → ₹${debit}`);
      if (Number(prev.credit) !== Number(credit)) diffs.push(`Credit: ₹${prev.credit} → ₹${credit}`);
      if (prev.particulars !== particulars) diffs.push(`Particulars: "${prev.particulars}" → "${particulars}"`);
      if (prev.site_name !== site_name) diffs.push(`Site: "${prev.site_name || 'General'}" → "${site_name || 'General'}"`);

      const revisions = Array.isArray(prev.revision_history) ? [...prev.revision_history] : [];
      revisions.push({
        timestamp: now,
        edited_by: operatorName,
        reason: reasonText,
        changes: diffs,
      });

      manualEntries[manualIdx] = {
        ...prev,
        date: date || prev.date,
        particulars: particulars ? particulars.trim() : prev.particulars,
        payment_type: payment_type || prev.payment_type,
        voucher_no: voucher_no ? voucher_no.trim() : prev.voucher_no,
        debit: debit !== undefined ? Number(debit) || 0 : prev.debit,
        credit: credit !== undefined ? Number(credit) || 0 : prev.credit,
        site_name: site_name !== undefined ? (site_name ? site_name.trim() : undefined) : prev.site_name,
        last_updated: now,
        updated_by: operatorName,
        reason: reasonText,
        revision_history: revisions,
      };
      saveManualLedgerEntries(manualEntries);
      updatedRecord = manualEntries[manualIdx];
    } else {
      // Create manual entry override so changes to debit/credit, amounts, and sites persist in ledger
      const diffs: string[] = [];
      diffs.push(`Admin ledger update: ${Number(debit) > 0 ? 'Debit ₹' + debit : 'Credit ₹' + credit}`);
      if (particulars) diffs.push(`Particulars: "${particulars}"`);
      if (site_name) diffs.push(`Site: "${site_name}"`);

      const newEntry = {
        id: targetId.startsWith('mle_') ? targetId : `mle_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        customer_id: customer_id || '',
        date: date || now.slice(0, 10),
        particulars: particulars ? particulars.trim() : (Number(debit) > 0 ? 'To SALE GST 18%' : 'By Receipt'),
        payment_type: payment_type || 'Sales GST',
        voucher_no: voucher_no ? voucher_no.trim() : '',
        debit: Number(debit) || 0,
        credit: Number(credit) || 0,
        site_name: site_name ? site_name.trim() : undefined,
        challan_id: challan_id || (source_type === 'challan' ? targetId : undefined),
        source_type: 'manual' as const,
        last_updated: now,
        updated_by: operatorName,
        reason: reasonText,
        revision_history: [
          {
            timestamp: now,
            edited_by: operatorName,
            reason: reasonText,
            changes: diffs,
          },
        ],
        created_at: now,
      };
      manualEntries.push(newEntry);
      saveManualLedgerEntries(manualEntries);
      if (!updatedRecord) updatedRecord = newEntry;
    }

    // If it's linked to a challan (source_type === 'challan' or challan_id)
    if (challan_id || source_type === 'challan') {
      const challans = getAllChallans();
      const chIdx = challans.findIndex(
        (c) => c.id === (challan_id || targetId) || (c.challan_number && c.challan_number.toLowerCase() === (voucher_no || '').toLowerCase())
      );
      if (chIdx >= 0) {
        const prevCh = challans[chIdx];
        const diffs: string[] = [];
        if (Number(debit) > 0 && Number(prevCh.total_amount) !== Number(debit)) {
          diffs.push(`Challan Total: ₹${prevCh.total_amount} → ₹${debit}`);
        }
        if (site_name && prevCh.site_name !== site_name) {
          diffs.push(`Site: "${prevCh.site_name || 'General'}" → "${site_name}"`);
        }

        const revisions = Array.isArray(prevCh.revision_history) ? [...prevCh.revision_history] : [];
        revisions.push({
          timestamp: now,
          edited_by: operatorName,
          user_role: operatorRole,
          reason: reasonText,
          changes: diffs.length > 0 ? diffs : [`Ledger accounting effect updated to ${Number(debit) > 0 ? 'Debit' : 'Credit'}`],
          previous_total: prevCh.total_amount,
          new_total: Number(debit) > 0 ? Number(debit) : Number(credit),
        });

        challans[chIdx] = {
          ...prevCh,
          total_amount: Number(debit) > 0 ? Number(debit) : prevCh.total_amount,
          site_name: site_name ? site_name.trim() : prevCh.site_name,
          revision_history: revisions,
          updated_at: now,
        };
        saveAllChallans(challans);
        if (!updatedRecord) updatedRecord = challans[chIdx];
      }
    }

    // Auto-save / update site if provided
    if (site_name && site_name.trim() && customer_id) {
      try {
        const cleanSite = site_name.trim();
        const sites = getCustomerSites();
        const existing = sites.find(
          (s) => (s.customer_id === customer_id || s.customer_id.toLowerCase() === customer_id.toLowerCase()) &&
                 s.site_name.toLowerCase() === cleanSite.toLowerCase()
        );
        if (!existing) {
          addOrUpdateSite({
            id: `site_${customer_id}_${cleanSite.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
            customer_id,
            site_name: cleanSite,
            site_address: `${cleanSite} Site`,
            opening_balance: 0,
            credit_adjustment: 0,
            debit_adjustment: Number(debit) || 0,
            current_balance: Number(debit) || 0,
            order_index: sites.length,
            is_verified: true,
            verified_at: now,
            verified_by: operatorName,
            is_active: true,
            created_at: now,
          });
        }
      } catch (siteErr) {
        console.warn('Auto-save site note:', siteErr);
      }
    }

    recordAuditLog({
      entity_type: 'site_adjustment',
      entity_id: targetId,
      user_id: operatorUsername,
      user_name: operatorName,
      action: 'UPDATE_LEDGER_ENTRY',
      updated_values: { debit, credit, particulars, site_name, date, voucher_no },
      reason: `Ledger entry updated [${payment_type || 'Adjustment'}]: ${reasonText}`,
    });

    return NextResponse.json({
      success: true,
      entry: updatedRecord || { id: targetId, last_updated: now, updated_by: operatorName, reason: reasonText },
    });
  } catch (err: any) {
    console.error('Error updating ledger entry:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  const operatorRole = session?.role || 'admin';
  const operatorName = session?.name || session?.username || 'Admin SH';

  // Permission check: only admin and accountant can delete ledger records
  if (operatorRole === 'employee') {
    return NextResponse.json(
      { success: false, error: 'Permission denied. Only Admins and Accountants can delete ledger entries.' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || searchParams.get('entryId');
    const sourceType = searchParams.get('sourceType');
    const challanId = searchParams.get('challanId');
    const paymentId = searchParams.get('paymentId');
    const returnId = searchParams.get('returnId');
    const manualId = searchParams.get('manualId');

    // Also parse JSON body if sent via body
    let bodyData: any = {};
    if (req.headers.get('content-type')?.includes('application/json')) {
      bodyData = await req.json().catch(() => ({}));
    }

    const customerId = searchParams.get('customer_id') || bodyData.customer_id;
    const isClearAll = searchParams.get('clear_all') === 'true' || searchParams.get('all') === 'true' || bodyData.clear_all === true || bodyData.action === 'clear_all';

    // Wipe / Delete entire ledger for customer
    if (isClearAll && customerId) {
      const { clearCustomerLedger } = await import('@/lib/server-accounting');
      const clearRes = clearCustomerLedger(customerId, operatorName);
      return NextResponse.json({ ...clearRes });
    }

    const targetId = id || bodyData.id || bodyData.entryId;
    const targetSourceType = sourceType || bodyData.sourceType;
    const targetChallanId = challanId || bodyData.challanId;
    const targetPaymentId = paymentId || bodyData.paymentId;
    const targetReturnId = returnId || bodyData.returnId;
    const targetManualId = manualId || bodyData.manualId;

    if (!targetId && !targetChallanId && !targetPaymentId && !targetReturnId && !targetManualId) {
      return NextResponse.json(
        { success: false, error: 'Entry identifier (id, challanId, paymentId, or manualId) is required' },
        { status: 400 }
      );
    }

    const userLabel = operatorName;
    const res = deleteLedgerEntry(
      {
        entryId: targetId,
        sourceType: targetSourceType,
        challanId: targetChallanId,
        paymentId: targetPaymentId,
        returnId: targetReturnId,
        manualId: targetManualId,
      },
      userLabel
    );

    return NextResponse.json({ success: res.success, deletedType: res.deletedType });
  } catch (err: any) {
    console.error('Error deleting ledger entry:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}
