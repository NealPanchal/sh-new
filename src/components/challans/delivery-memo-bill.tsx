'use client';

import React from 'react';
import { Challan, BusinessProfile } from '@/types';
import { formatPhone } from '@/lib/utils';
import { MapPin, Phone, Mail } from 'lucide-react';

interface DeliveryMemoBillProps {
  challan: Challan;
  profile: BusinessProfile | null;
  memoNumber?: string;
  confirmBy?: string;
}

export function DeliveryMemoBill({
  challan,
  profile,
  memoNumber,
  confirmBy,
}: DeliveryMemoBillProps) {
  // Memo number defaults to reference_number or last 4 digits of challan sequence
  const displayMemoNo =
    memoNumber ||
    challan.reference_number ||
    challan.challan_number.split('/').pop() ||
    '0120';

  const items = challan.items || [];
  const calculatedGrandTotal =
    challan.total_amount ||
    items.reduce(
      (sum, item) =>
        sum +
        (Number(item.amount) ||
          (Number(item.rate) || 0) * (Number(item.quantity) || 0)),
      0
    );

  // Ruled lines count to match physical memo paper (at least 9 total rows)
  const totalRuledRows = Math.max(9, items.length + 3);
  const emptyRowsCount = Math.max(0, totalRuledRows - items.length);

  // Format date like on the paper slip (e.g., 2/3/26 or standard)
  const parsedDate = new Date(challan.challan_date);
  const shortDate = !isNaN(parsedDate.getTime())
    ? `${parsedDate.getDate()}/${parsedDate.getMonth() + 1}/${String(
        parsedDate.getFullYear()
      ).slice(-2)}`
    : challan.challan_date;

  const noteText = confirmBy || challan.notes || 'Confirm By Rushank';

  return (
    <div className="w-full max-w-[680px] mx-auto bg-white border border-surface-300 shadow-md print:shadow-none print:border-none rounded-sm overflow-hidden text-surface-900 font-sans print:p-0">
      {/* Outer Paper Slip Box */}
      <div className="p-4 sm:p-6 bg-white relative">
        {/* Top Header */}
        <div className="flex items-start justify-between border-b-2 border-[#b8860b] pb-3 mb-2">
          {/* Left Brand */}
          <div className="flex items-start gap-2.5">
            {/* Logo Emblem Icon */}
            <div className="w-9 h-9 shrink-0 flex items-center justify-center text-[#b8860b]">
              <svg viewBox="0 0 40 40" className="w-9 h-9" fill="none">
                <circle cx="20" cy="20" r="18" stroke="#b8860b" strokeWidth="1.5" strokeDasharray="3 2" />
                <path
                  d="M14 26 C12 20, 18 14, 25 14 C27 14, 28 15, 27 17 C25 21, 15 23, 23 27 C26 28, 27 26, 27 24"
                  stroke="#b8860b"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx="26" cy="14" r="1.5" fill="#b8860b" />
              </svg>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[0.18em] text-surface-900 font-serif leading-none">
                SHOWHOUSE
              </h1>
              <p className="text-xs sm:text-sm font-semibold tracking-widest text-[#b8860b] uppercase mt-0.5">
                — Decor Studio —
              </p>
            </div>
          </div>

          {/* Right QR Code & Legal Name */}
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 border border-[#b8860b]/70 p-1 bg-white rounded-xs relative flex items-center justify-center shadow-2xs">
              {/* QR Code graphic */}
              <svg viewBox="0 0 24 24" className="w-full h-full text-surface-800" fill="currentColor">
                <rect x="2" y="2" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <rect x="4" y="4" width="2" height="2" />
                <rect x="16" y="2" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <rect x="18" y="4" width="2" height="2" />
                <rect x="2" y="16" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <rect x="4" y="18" width="2" height="2" />
                <rect x="10" y="3" width="2" height="4" />
                <rect x="13" y="2" width="1" height="3" />
                <rect x="10" y="10" width="4" height="4" />
                <rect x="16" y="10" width="2" height="2" />
                <rect x="19" y="12" width="3" height="2" />
                <rect x="10" y="17" width="2" height="5" />
                <rect x="14" y="16" width="3" height="2" />
                <rect x="18" y="18" width="4" height="4" />
              </svg>
            </div>
            <span className="text-[9px] font-semibold text-surface-600 mt-0.5 whitespace-nowrap">
              Showhouse Concept & Design LLP
            </span>
          </div>
        </div>

        {/* Customer & Memo Fields (Ruled Lines) */}
        <div className="space-y-1.5 text-xs text-surface-800 mb-3 pt-1">
          {/* Row 1: M/s. / Client */}
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-surface-600 shrink-0 text-[11px]">
              M/s. / Client:
            </span>
            <div className="flex-1 border-b border-surface-400 font-bold text-surface-900 pb-0.5 px-1 truncate">
              {challan.customer_name}
            </div>
          </div>

          {/* Row 2: Address */}
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-surface-600 shrink-0 text-[11px]">
              Address:
            </span>
            <div className="flex-1 border-b border-surface-400 text-surface-800 pb-0.5 px-1 truncate leading-tight">
              {challan.delivery_address ||
                challan.customer_address ||
                '314, 3rd floor, Blue Nile Commercial Complex, Thane (w).'}
            </div>
          </div>

          {/* Row 3: Mobile No., Date, Memo No. */}
          <div className="grid grid-cols-12 gap-2 items-baseline pt-0.5">
            {/* Mobile */}
            <div className="col-span-5 flex items-baseline gap-1">
              <span className="font-semibold text-surface-600 shrink-0 text-[11px]">
                Mobile No.:
              </span>
              <div className="flex-1 border-b border-surface-400 font-semibold text-surface-900 pb-0.5 px-1 truncate">
                {challan.customer_phone ? formatPhone(challan.customer_phone) : '9819098961'}
              </div>
            </div>

            {/* Date */}
            <div className="col-span-3 flex items-baseline gap-1">
              <span className="font-semibold text-surface-600 shrink-0 text-[11px]">
                Date:
              </span>
              <div className="flex-1 border-b border-surface-400 font-semibold text-surface-900 pb-0.5 px-1 text-center">
                {shortDate}
              </div>
            </div>

            {/* Memo No. */}
            <div className="col-span-4 flex items-baseline justify-end gap-1.5">
              <span className="font-semibold text-surface-600 shrink-0 text-[11px]">
                Memo No.
              </span>
              <div className="border-b-2 border-surface-900 font-mono font-black text-sm sm:text-base text-blue-900 px-2 tracking-wider">
                {displayMemoNo}
              </div>
            </div>
          </div>
        </div>

        {/* Ruled Ledger Table */}
        <div className="border-t-2 border-b-2 border-surface-800 text-xs">
          {/* Header */}
          <div className="grid grid-cols-12 border-b border-surface-400 font-bold text-surface-800 uppercase text-[10px] tracking-wider py-1.5 bg-surface-50/70">
            <div className="col-span-6 px-2 border-r border-surface-300">
              PARTICULARS
            </div>
            <div className="col-span-2 px-1 text-center border-r border-surface-300">
              QTY.
            </div>
            <div className="col-span-2 px-1 text-center border-r border-surface-300">
              RATE
            </div>
            <div className="col-span-2 px-2 text-right">
              AMOUNT
            </div>
          </div>

          {/* Table Items */}
          <div className="divide-y divide-sky-100 bg-[#fffdfa]/40">
            {items.map((item, idx) => {
              const lineRate = item.rate ? Number(item.rate) : null;
              const lineAmt =
                item.amount
                  ? Number(item.amount)
                  : lineRate
                  ? lineRate * item.quantity
                  : null;

              return (
                <div key={idx} className="grid grid-cols-12 min-h-[30px] items-center text-xs">
                  <div className="col-span-6 px-2 py-1 border-r border-surface-300 font-medium text-surface-900 truncate">
                    {item.item_description}
                    {[item.brand, item.colour_finish].filter(Boolean).length > 0 && (
                      <span className="text-[10px] text-surface-500 ml-1">
                        ({[item.brand, item.colour_finish].filter(Boolean).join(' · ')})
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 px-1 py-1 text-center border-r border-surface-300 font-semibold text-surface-800">
                    {item.quantity} {item.unit === 'running ft' ? 'ft.' : item.unit}
                  </div>
                  <div className="col-span-2 px-1 py-1 text-center border-r border-surface-300 font-mono text-surface-700">
                    {lineRate ? `${lineRate}/-` : '—'}
                  </div>
                  <div className="col-span-2 px-2 py-1 text-right font-mono font-bold text-surface-900">
                    {lineAmt ? lineAmt.toLocaleString('en-IN') : '—'}
                  </div>
                </div>
              );
            })}

            {/* Note row (e.g. Confirm By Rushank) if space or inside table */}
            {noteText && (
              <div className="grid grid-cols-12 min-h-[28px] items-center text-xs bg-surface-50/20">
                <div className="col-span-6 px-2 py-1 border-r border-surface-300 text-surface-600 italic">
                  <span className="inline-block px-1.5 py-0.5 rounded border border-surface-200 text-[11px] font-medium text-surface-700 bg-white">
                    ({noteText})
                  </span>
                </div>
                <div className="col-span-2 border-r border-surface-300" />
                <div className="col-span-2 border-r border-surface-300" />
                <div className="col-span-2 px-2" />
              </div>
            )}

            {/* Blank Ruled Paper Rows */}
            {Array.from({ length: emptyRowsCount }).map((_, i) => (
              <div key={`empty-${i}`} className="grid grid-cols-12 h-6 items-center">
                <div className="col-span-6 border-r border-surface-300 h-full" />
                <div className="col-span-2 border-r border-surface-300 h-full" />
                <div className="col-span-2 border-r border-surface-300 h-full" />
                <div className="col-span-2 h-full" />
              </div>
            ))}
          </div>

          {/* Grand Total Row */}
          <div className="grid grid-cols-12 border-t-2 border-surface-800 py-1.5 bg-surface-50 font-bold items-center">
            <div className="col-span-6 px-2 text-right uppercase text-[11px] text-surface-600">
              {/* Left blank */}
            </div>
            <div className="col-span-4 px-2 text-right uppercase text-[11px] font-extrabold tracking-wider text-surface-800">
              GRAND TOTAL
            </div>
            <div className="col-span-2 px-2 text-right font-mono font-black text-sm sm:text-base text-surface-900 border-l border-surface-300">
              {calculatedGrandTotal > 0
                ? calculatedGrandTotal.toLocaleString('en-IN')
                : '—'}
            </div>
          </div>
        </div>

        {/* Footer: Terms, Signatures & Address Bar */}
        <div className="pt-3 space-y-3">
          {/* Row with Terms & Signatures */}
          <div className="grid grid-cols-12 gap-3 items-end">
            {/* Left Terms & Conditions */}
            <div className="col-span-7 text-[9px] text-surface-500 leading-tight space-y-0.5">
              <p>• Interest @ 21% will be charged if the payment of the bill not made within 7 days</p>
              <p>• 18% GST applicable on all billing</p>
              <p>• Payment by A/C payee cheque only</p>
              <p>• Goods once sold will not be taken back or exchanged after 24hrs of delivery</p>
              <p>• Subject to Maharashtra Jurisdiction</p>
            </div>

            {/* Right Signatures */}
            <div className="col-span-5 grid grid-cols-3 gap-1 text-center text-[10px]">
              <div>
                <div className="h-9 border-b border-surface-300 mb-1" />
                <span className="font-semibold text-surface-600 block text-[9px] leading-tight">
                  Receiver&apos;s Signature
                </span>
              </div>
              <div>
                <div className="h-9 border-b border-surface-300 mb-1 flex items-center justify-center">
                  <span className="w-5 h-5 rounded-full border border-surface-400 text-[10px] text-surface-400 flex items-center justify-center font-serif">
                    ✓
                  </span>
                </div>
                <span className="font-semibold text-surface-600 block text-[9px] leading-tight">
                  Checked by
                </span>
              </div>
              <div>
                <div className="h-9 border-b border-surface-300 mb-1 flex items-center justify-center">
                  <span className="font-script text-xs text-blue-800 font-semibold italic">
                    Partner
                  </span>
                </div>
                <span className="font-semibold text-surface-600 block text-[9px] leading-tight">
                  Partner/Manager
                </span>
              </div>
            </div>
          </div>

          {/* Contact Details Footer Bar */}
          <div className="pt-2 border-t border-surface-200 text-[10px] text-surface-600 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-1 text-[9.5px]">
              <div className="flex items-center gap-1">
                <MapPin size={11} className="text-[#b8860b] shrink-0" />
                <span>
                  {profile?.address ||
                    'Vishram Baug, Near Makhmali Talao, LBS Marg, Thane (W) - 400602'}
                </span>
              </div>
              <div className="font-mono font-semibold text-surface-700">
                GSTIN: {profile?.gstin || '27ACMF53838C1ZY'}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[9.5px] text-surface-500">
              <div className="flex items-center gap-1">
                <Phone size={10} className="text-[#b8860b]" />
                <span>022 - 2538 7683 / 87  •  +91 93248 69306</span>
              </div>
              <div className="flex items-center gap-1">
                <Mail size={10} className="text-[#b8860b]" />
                <span>{profile?.email || 'foxshowhouse@gmail.com'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Golden Ribbon Bar with Categories */}
      <div className="bg-[#b8860b] text-white py-1.5 px-3 text-center uppercase tracking-widest text-[9px] sm:text-[10px] font-bold select-none">
        PLYWOOD &nbsp;|&nbsp; VENEER &nbsp;|&nbsp; LAMINATE &nbsp;|&nbsp; WOODEN FLOORING &nbsp;|&nbsp; WALL PAPER &nbsp;|&nbsp; HIGHLIGHTER
      </div>
    </div>
  );
}
