'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Challan, ChallanItem } from '@/types';
import { useApp } from '@/lib/context';
import { getClientAuthToken } from '@/lib/auth';
import { X, RotateCcw, AlertCircle, CheckCircle2, PackageCheck } from 'lucide-react';
import { formatDateIndian } from '@/lib/utils';

interface ChallanGoodsReturnModalProps {
  challan: Challan;
  onClose: () => void;
  onSuccess?: (returnRecord: any, replacementChallan: any) => void;
}

export function ChallanGoodsReturnModal({
  challan,
  onClose,
  onSuccess,
}: ChallanGoodsReturnModalProps) {
  const router = useRouter();
  const { showToast } = useApp();

  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [returnReason, setReturnReason] = useState('Damaged goods / quality issue');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Selected items state
  const [selectedItems, setSelectedItems] = useState<
    Record<
      string,
      {
        selected: boolean;
        return_quantity: number;
        max_allowed: number;
        rate: number;
        unit: string;
        description: string;
      }
    >
  >(() => {
    const initial: Record<string, any> = {};
    (challan.items || []).forEach((item) => {
      const qty = Number(item.quantity) || 0;
      initial[item.id] = {
        selected: false,
        return_quantity: qty > 0 ? 1 : 0,
        max_allowed: qty,
        rate: Number(item.rate) || 0,
        unit: item.unit || 'sheets',
        description: item.item_description || '',
      };
    });
    return initial;
  });

  const handleToggleItem = (itemId: string) => {
    setSelectedItems((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      return {
        ...prev,
        [itemId]: {
          ...current,
          selected: !current.selected,
          return_quantity: !current.selected && current.return_quantity === 0 ? Math.min(1, current.max_allowed) : current.return_quantity,
        },
      };
    });
  };

  const handleQtyChange = (itemId: string, newQtyStr: string) => {
    const num = parseInt(newQtyStr, 10);
    const validNum = isNaN(num) ? 0 : Math.max(0, num);
    setSelectedItems((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      return {
        ...prev,
        [itemId]: {
          ...current,
          return_quantity: Math.min(validNum, current.max_allowed),
          selected: validNum > 0,
        },
      };
    });
  };

  // Calculations
  const { totalItemsToReturn, totalCreditAmount } = useMemo(() => {
    let itemsCount = 0;
    let creditAmt = 0;
    Object.values(selectedItems).forEach((it) => {
      if (it.selected && it.return_quantity > 0) {
        itemsCount += it.return_quantity;
        creditAmt += Math.round(it.return_quantity * it.rate * 100) / 100;
      }
    });
    return {
      totalItemsToReturn: itemsCount,
      totalCreditAmount: creditAmt,
    };
  }, [selectedItems]);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();

    const itemsToReturn = Object.entries(selectedItems)
      .filter(([_, it]) => it.selected && it.return_quantity > 0)
      .map(([origId, it]) => ({
        original_item_id: origId,
        description: it.description,
        return_quantity: Number(it.return_quantity),
        rate: it.rate,
        unit: it.unit,
      }));

    if (itemsToReturn.length === 0) {
      setError('Please select at least one item to return with quantity > 0');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const token = getClientAuthToken();

      const payload = {
        challan_id: challan.id,
        challan_number: challan.challan_number,
        customer_id: challan.customer_id,
        customer_name: challan.customer_name,
        site_id: challan.site_id || undefined,
        site_name: challan.site_name || undefined,
        return_date: returnDate,
        reason: returnRemarks ? `${returnReason}: ${returnRemarks}` : returnReason,
        items: itemsToReturn,
        auto_create_challan: true,
      };

      const res = await fetch('/api/goods-returns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to process goods return');
        return;
      }

      showToast(
        `✓ Goods return recorded! Credit note added to Party Ledger in RED.` +
          (data.replacementChallan?.challan_number
            ? ` Delivered materials challan ${data.replacementChallan.challan_number} created with remaining delivered items.`
            : ''),
        'success'
      );

      if (onSuccess) {
        onSuccess(data.returnRecord, data.replacementChallan);
      }

      onClose();

      // If replacement challan was created, navigate to it or refresh
      if (data.replacementChallan?.id) {
        router.push(`/challans/${data.replacementChallan.id}`);
      } else {
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || 'Network error processing goods return');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-surface-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-surface-50 border-b border-surface-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-xl font-bold">
              <RotateCcw size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-surface-900">
                Record Goods Return
              </h3>
              <p className="text-[11px] text-surface-500">
                Challan: <b className="font-mono text-surface-800">{challan.challan_number}</b> • {challan.customer_name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-200/60 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleConfirm} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Challan Info Banner */}
          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Party / Customer</span>
              <div className="font-bold text-surface-900">{challan.customer_name}</div>
            </div>
            {challan.site_name && (
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Site</span>
                <div className="font-semibold text-surface-800">📍 {challan.site_name}</div>
              </div>
            )}
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Challan Date</span>
              <div className="text-surface-700 font-medium">{formatDateIndian(challan.challan_date)}</div>
            </div>
          </div>

          {/* Products Table with Checkboxes */}
          <div>
            <label className="block text-xs font-bold text-surface-900 mb-1.5">
              Select Products to Return:
            </label>
            <div className="border border-surface-200 rounded-xl overflow-hidden shadow-2xs divide-y divide-surface-100">
              {(challan.items || []).map((item) => {
                const state = selectedItems[item.id];
                if (!state) return null;
                const creditVal = Math.round(state.return_quantity * state.rate * 100) / 100;

                return (
                  <div
                    key={item.id}
                    className={`p-3 flex items-start gap-3 transition-colors ${
                      state.selected ? 'bg-amber-50/50' : 'bg-white hover:bg-surface-50/60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      id={`chk_${item.id}`}
                      checked={state.selected}
                      onChange={() => handleToggleItem(item.id)}
                      className="mt-1 w-4 h-4 rounded text-amber-600 focus:ring-amber-400 cursor-pointer"
                    />

                    <div className="flex-1 min-w-0">
                      <label
                        htmlFor={`chk_${item.id}`}
                        className="font-bold text-surface-900 text-xs block cursor-pointer"
                      >
                        {item.item_description}
                      </label>
                      <div className="text-[11px] text-surface-500 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                        <span>Rate: <b className="font-mono">₹{state.rate.toLocaleString('en-IN')}</b></span>
                        <span>Delivered: <b>{state.max_allowed} {state.unit}</b></span>
                      </div>
                    </div>

                    {state.selected && (
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span className="text-[10px] text-surface-500 block">Return Qty:</span>
                          <input
                            type="number"
                            min="1"
                            max={state.max_allowed}
                            value={state.return_quantity}
                            onChange={(e) => handleQtyChange(item.id, e.target.value)}
                            className="input text-xs w-16 py-1 px-1.5 text-center font-bold"
                          />
                        </div>
                        <div className="text-right min-w-[70px]">
                          <span className="text-[10px] text-surface-500 block">Credit:</span>
                          <span className="font-mono font-bold text-red-600 text-xs">
                            -₹{creditVal.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Return Date & Reason */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-surface-700 mb-1">
                Return Date
              </label>
              <input
                type="date"
                required
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="input text-xs w-full py-1.5"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-surface-700 mb-1">
                Return Reason
              </label>
              <select
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="select text-xs w-full py-1.5"
              >
                <option value="Damaged goods / quality issue">Damaged goods / quality issue</option>
                <option value="Customer cancelled order / not required">Customer cancelled order / not required</option>
                <option value="Wrong item delivered">Wrong item delivered</option>
                <option value="Excess material returned">Excess material returned</option>
                <option value="Defective / cracked laminate">Defective / cracked laminate</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-surface-700 mb-1">
              Remarks (Optional)
            </label>
            <input
              type="text"
              value={returnRemarks}
              onChange={(e) => setReturnRemarks(e.target.value)}
              placeholder="e.g. 2 sheets chipped during site delivery"
              className="input text-xs w-full py-1.5"
            />
          </div>

          {/* Summary Box */}
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-between text-xs">
            <div>
              <div className="text-[10px] uppercase font-bold text-orange-800">Total Returning Items</div>
              <div className="font-black text-surface-900 text-sm mt-0.5">
                {totalItemsToReturn} {totalItemsToReturn === 1 ? 'unit' : 'units'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-orange-800">Party Credit Note Value</div>
              <div className="font-black font-mono text-red-600 text-base mt-0.5">
                -₹{totalCreditAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-surface-500 bg-surface-50 p-2.5 rounded-lg border border-surface-200 space-y-1">
            <p className="font-semibold text-surface-700">⚡ On Confirming:</p>
            <p>1. Return recorded in database &amp; visible in Goods Returns section.</p>
            <p>2. Automatically credited to Party Ledger in <b>RED</b> with return reference.</p>
            <p>3. New replacement challan automatically generated with return items.</p>
          </div>

          {/* ONLY 2 BUTTONS: CANCEL & CONFIRM */}
          <div className="pt-2 border-t border-surface-200 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="py-2 px-4 text-xs font-semibold text-surface-600 hover:text-surface-900 hover:bg-surface-100 rounded-xl cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || totalItemsToReturn === 0}
              className="py-2 px-5 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <span>Processing...</span>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>Confirm Return</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
