'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import { Challan, ChallanItem } from '@/types';
import { formatDateIndian, formatPhone } from '@/lib/utils';
import { openWhatsApp } from '@/lib/whatsapp';
import {
  Receipt,
  Search,
  Plus,
  Printer,
  Send,
  Eye,
  X,
  FileText,
  ArrowRight,
} from 'lucide-react';

export default function DeliveryBillsPage() {
  const router = useRouter();
  const { getChallans, profile, showToast, isLoading } = useApp();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const filteredBills = useMemo(() => {
    if (!mounted || isLoading) return [];
    return getChallans({
      search: search.trim() || undefined,
    });
  }, [mounted, isLoading, getChallans, search]);

  const handleWhatsApp = (c: Challan, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!profile || !c.customer_phone) {
      showToast('No customer phone recorded', 'error');
      return;
    }

    const memoNo =
      c.reference_number || c.challan_number.split('/').pop() || '0120';
    const businessName = profile.business_name || 'Showhouse';
    const totalAmt =
      c.total_amount ||
      (c.items || []).reduce(
        (sum: number, it: ChallanItem) =>
          sum + (Number(it.amount) || ((Number(it.rate) || 0) * (Number(it.quantity) || 0))),
        0
      );

    const message =
      `Hello ${c.customer_name},\n\n` +
      `Here is your *${businessName} Decor Studio Delivery Bill / Memo*.\n\n` +
      `*Memo No:* ${memoNo}\n` +
      `*Date:* ${c.challan_date}\n` +
      `*Total Amount:* ₹${totalAmt.toLocaleString('en-IN')}\n\n` +
      `Thank you for choosing Showhouse Decor Studio!\n` +
      `— Thane (W) | +91 93248 69306`;

    openWhatsApp(c.customer_phone, message);
    showToast(`Opening WhatsApp for ${c.customer_name}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3.5 pb-20 sm:pb-8 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-surface-900 tracking-tight">
              After-Delivery Bills & Memos
            </h1>
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#b8860b]/15 text-[#b8860b] border border-[#b8860b]/30">
              Slip Format
            </span>
          </div>
          <p className="text-xs text-surface-500 mt-0.5">
            Original Showhouse Decor Studio receipt memo pad layout
          </p>
        </div>

        <Link
          href="/challans/new"
          className="btn-primary py-2 px-3.5 text-xs font-semibold shadow-xs flex items-center gap-1.5"
        >
          <Plus size={16} />
          <span>New Bill</span>
        </Link>
      </div>

      {/* Search Bar */}
      <div className="card p-2.5 sm:p-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search by Memo #, customer, item, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 pr-8 text-xs py-2 w-full"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 p-1"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Bills Cards List */}
      {filteredBills.length === 0 ? (
        <div className="card p-8 sm:p-12 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-surface-100 flex items-center justify-center text-surface-400">
            <Receipt size={24} />
          </div>
          <h3 className="text-base font-bold text-surface-800 mb-1">No Delivery Bills found</h3>
          <p className="text-xs text-surface-500 max-w-xs mx-auto mb-4">
            Create a challan to generate its matching after-delivery paper memo slip.
          </p>
          <Link href="/challans/new" className="btn-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5">
            <Plus size={15} />
            <span>Create New Challan</span>
          </Link>
        </div>
      ) : (
        <>
          {/* Mobile Card List */}
          <div className="md:hidden space-y-2.5">
            {filteredBills.map((c) => {
              const memoNo =
                c.reference_number || c.challan_number.split('/').pop() || '0120';
              const totalAmt =
                c.total_amount ||
                (c.items || []).reduce(
                  (sum: number, it: ChallanItem) =>
                    sum +
                    (Number(it.amount) ||
                      (Number(it.rate) || 0) * (Number(it.quantity) || 0)),
                  0
                );

              return (
                <div
                  key={c.id}
                  onClick={() => router.push(`/challans/${c.id}/bill`)}
                  className="card p-3 active:scale-[0.99] transition-transform shadow-xs hover:border-[#b8860b]/40 border border-surface-200"
                >
                  {/* Header: Memo No & Date */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-black text-sm text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        Memo #{memoNo}
                      </span>
                      <span className="text-[11px] text-surface-400">
                        • {formatDateIndian(c.challan_date)}
                      </span>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-[#b8860b] bg-[#b8860b]/10 px-2 py-0.5 rounded">
                      Delivery Bill
                    </span>
                  </div>

                  {/* Customer & Item */}
                  <div className="py-1.5 border-y border-surface-100">
                    <div className="font-bold text-xs text-surface-900 truncate">
                      {c.customer_name}
                    </div>
                    <div className="text-[11px] text-surface-500 truncate mt-0.5">
                      {c.items && c.items[0]?.item_description ? (
                        <span>
                          {c.items[0].item_description}
                          {c.items[0].rate && ` @ ₹${c.items[0].rate}`}
                          {c.items.length > 1 && ` (+${c.items.length - 1} more)`}
                        </span>
                      ) : (
                        'No items'
                      )}
                    </div>
                  </div>

                  {/* Footer: Amount & Actions */}
                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <span className="text-[10px] text-surface-400 block uppercase">
                        Grand Total
                      </span>
                      <span className="font-mono font-extrabold text-sm text-surface-900">
                        ₹{totalAmt.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {c.customer_phone && (
                        <button
                          onClick={(e) => handleWhatsApp(c, e)}
                          className="p-1.5 bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100"
                          title="WhatsApp Bill"
                        >
                          <Send size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => router.push(`/challans/${c.id}/bill`)}
                        className="btn-primary py-1.5 px-2.5 text-xs font-semibold flex items-center gap-1 bg-surface-900 hover:bg-surface-800"
                      >
                        <Eye size={13} />
                        <span>View Slip</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="card hidden md:block overflow-hidden shadow-xs">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Memo No.</th>
                    <th>Challan #</th>
                    <th>Date</th>
                    <th>Client / Customer</th>
                    <th>Items</th>
                    <th className="text-right">Total Qty</th>
                    <th className="text-right">Grand Total</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {filteredBills.map((c) => {
                    const memoNo =
                      c.reference_number || c.challan_number.split('/').pop() || '0120';
                    const totalAmt =
                      c.total_amount ||
                      (c.items || []).reduce(
                        (sum: number, it: ChallanItem) =>
                          sum +
                          (Number(it.amount) ||
                            (Number(it.rate) || 0) * (Number(it.quantity) || 0)),
                        0
                      );

                    return (
                      <tr
                        key={c.id}
                        onClick={() => router.push(`/challans/${c.id}/bill`)}
                        className="cursor-pointer hover:bg-surface-50 transition-colors"
                      >
                        <td>
                          <span className="font-mono font-black text-xs text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {memoNo}
                          </span>
                        </td>
                        <td className="font-mono text-xs text-surface-600">
                          {c.challan_number}
                        </td>
                        <td className="whitespace-nowrap text-xs text-surface-600">
                          {formatDateIndian(c.challan_date)}
                        </td>
                        <td className="text-xs">
                          <div className="font-semibold text-surface-900">{c.customer_name}</div>
                          {c.customer_phone && (
                            <div className="text-[11px] text-surface-400">{formatPhone(c.customer_phone)}</div>
                          )}
                        </td>
                        <td className="max-w-xs truncate text-xs text-surface-600">
                          {c.items?.[0]?.item_description || '—'}
                          {c.items && c.items.length > 1 && (
                            <span className="text-[10px] text-surface-400 ml-1">
                              (+{c.items.length - 1})
                            </span>
                          )}
                        </td>
                        <td className="text-right font-bold text-xs text-surface-900 whitespace-nowrap">
                          {c.total_quantity} {c.items?.[0]?.unit || 'sheets'}
                        </td>
                        <td className="text-right font-mono font-bold text-xs text-surface-900 whitespace-nowrap">
                          ₹{totalAmt.toLocaleString('en-IN')}
                        </td>
                        <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {c.customer_phone && (
                              <button
                                title="Share via WhatsApp"
                                onClick={(e) => handleWhatsApp(c, e)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                              >
                                <Send size={15} />
                              </button>
                            )}
                            <button
                              title="View Exact Memo Slip"
                              onClick={() => router.push(`/challans/${c.id}/bill`)}
                              className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 font-semibold"
                            >
                              <Receipt size={13} className="text-[#b8860b]" />
                              <span>View Slip</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
