'use client';

import React from 'react';
import { Challan, BusinessProfile } from '@/types';
import { formatPhone, formatINR } from '@/lib/utils';
import { SHOWHOUSE_EMBLEM_BASE64 } from '@/lib/logo-data';
import { SHOWHOUSE_PAYMENT_QR_BASE64 } from '@/lib/payment-qr';
import { PaidRubberStamp } from '@/components/accounting/paid-rubber-stamp';

interface OfficialChallanDocumentProps {
  challan: Challan;
  profile?: BusinessProfile | null;
  viewMode?: 'challan' | 'pi' | 'slip';
  hideRate?: boolean;
}

export function OfficialChallanDocument({
  challan,
  profile,
  viewMode = 'challan',
  hideRate = false,
}: OfficialChallanDocumentProps) {
  const isPI = viewMode === 'pi' && !hideRate;
  const isPaid = challan.payment_status === 'paid';

  // Format Date (e.g. 21 NOVEMBER 2026)
  const rawDate = new Date(challan.challan_date);
  const formattedDate = !isNaN(rawDate.getTime())
    ? rawDate
        .toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })
        .toUpperCase()
    : (challan.challan_date || '').toUpperCase();

  // Calculations
  const transportCharges = Number(challan.transportation_charges) || 0;
  const loadingCharges = Number(challan.loading_charges) || 0;
  const applyGst = Boolean(challan.apply_gst);
  const applyAdditional9 = Boolean(challan.apply_additional_9);

  const items = challan.items || [];
  const itemsSubtotal = items.reduce(
    (sum, it) =>
      sum + (Number(it.amount) || (Number(it.rate) || 0) * (Number(it.quantity) || 0)),
    0
  );
  const taxableSubtotal = challan.subtotal_amount || (itemsSubtotal + transportCharges + loadingCharges);
  const cgstAmount =
    challan.cgst_amount ?? (applyGst && taxableSubtotal > 0 ? Math.round(taxableSubtotal * 0.09) : 0);
  const sgstAmount =
    challan.sgst_amount ?? (applyGst && taxableSubtotal > 0 ? Math.round(taxableSubtotal * 0.09) : 0);
  const additional9Amount =
    challan.additional_9_amount ??
    (applyAdditional9 && taxableSubtotal > 0 ? Math.round(taxableSubtotal * 0.09) : 0);
  const grandTotal =
    challan.total_amount || (taxableSubtotal + cgstAmount + sgstAmount + additional9Amount);

  // Staff and Client details
  const creator = (challan.created_by || challan.prepared_by || 'VRUSHANK').toUpperCase();
  const staffPhone =
    creator === 'VRUSHANK'
      ? '+91 93248 69306 / +91 81692 14522'
      : '+91 93248 69306';

  const clientName = (challan.customer_name || 'CLIENT').toUpperCase();
  const clientPhone = challan.customer_phone ? formatPhone(challan.customer_phone) : '';
  const clientAddress = (challan.delivery_address || challan.customer_address || '').toUpperCase();

  return (
    <div className="bg-white text-black p-5 sm:p-10 rounded-xl shadow-xs border border-surface-300 relative printable-challan font-sans max-w-4xl mx-auto">
      {/* Watermark in background */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.035] overflow-hidden">
        <img
          src="/logo-emblem-transparent.png"
          alt=""
          className="w-72 h-72 sm:w-96 sm:h-96 object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = SHOWHOUSE_EMBLEM_BASE64;
          }}
        />
      </div>

      {/* PAID Rubber Stamp Overlay */}
      {isPaid && (
        <div className="absolute top-4 right-6 sm:top-6 sm:right-12 pointer-events-none select-none z-20 print:top-3 print:right-6">
          <PaidRubberStamp
            size="md"
            title="PAID"
            subtitle="SHOWHOUSE"
            date={challan.paid_at ? formattedDate : formattedDate}
            amount={grandTotal}
            refNo={challan.challan_number}
            color="emerald"
            angle={-6}
          />
        </div>
      )}

      {/* 1. TOP HEADER SECTION */}
      <div className="flex flex-row justify-between items-start gap-4">
        {/* Left: Brand Logo & Title */}
        <div className="flex items-center gap-3 sm:gap-4">
          <img
            src="/logo-emblem-transparent.png"
            alt="Showhouse Emblem"
            className="w-12 h-12 sm:w-16 sm:h-16 object-contain shrink-0"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = SHOWHOUSE_EMBLEM_BASE64;
            }}
          />
          <div>
            <h1 className="font-serif font-black text-xl sm:text-2xl text-[#BE8E2A] tracking-wider leading-none">
              SHOWHOUSE
            </h1>
            <p className="font-serif text-xs sm:text-sm text-[#BE8E2A] tracking-normal mt-0.5 sm:mt-1">
              Decor Studio
            </p>
          </div>
        </div>

        {/* Right: Blue Pill Box & Document Metadata */}
        <div className="text-right flex flex-col items-end">
          <div className="border-2 border-[#2B5EA7] rounded-xl px-5 sm:px-7 py-1 bg-[#FCFEFF] text-[#2B5EA7] font-bold text-xs sm:text-sm tracking-wider uppercase inline-block text-center shadow-2xs">
            {hideRate ? 'DELIVERY SLIP' : isPI ? 'PROFORMA INVOICE' : 'DELIVERY CHALLAN'}
          </div>

          <div className="mt-2.5 sm:mt-3 space-y-0.5 text-right font-bold text-[11px] sm:text-xs text-black">
            <div>
              {isPI ? 'PI NO : ' : 'CHALLAN NO : '}
              <span className="font-mono">
                {isPI
                  ? challan.pi_number || challan.challan_number.replace(/^SH\//, 'PI/')
                  : challan.challan_number}
              </span>
            </div>
            {challan.reference_number && (
              <div>
                PO NO : <span className="font-mono">{challan.reference_number}</span>
              </div>
            )}
            <div>
              DATE : <span>{formattedDate}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CLIENT & COMPANY DETAILS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 text-[11px] sm:text-xs text-black leading-snug">
        {/* Left: Client Details */}
        <div className="space-y-0.5">
          <div className="font-bold text-black text-xs sm:text-sm uppercase tracking-tight">
            CLIENT NAME : {clientName}
          </div>
          {clientPhone && <div>Phone No: {clientPhone}</div>}
          {clientAddress && <div>Address: {clientAddress}</div>}
          {challan.customer_gstin && <div>GSTIN: {challan.customer_gstin}</div>}
        </div>

        {/* Right: Company Details */}
        <div className="sm:text-right space-y-0.5 sm:pl-4">
          <div className="font-bold text-black text-xs sm:text-sm">
            {profile?.legal_name || 'Showhouse Concept & Design LLP'}
          </div>
          <div>LBS marg Nr. Makhmali Talao Thane</div>
          <div>Phone : 022 2538 7683</div>
          <div>Mobile : +91 93248 69306</div>
          <div>Email : forshowhouse@gmail.com</div>
          <div>GST : {profile?.gstin || '27ACMF53838C1ZY'}</div>
        </div>
      </div>

      {/* 3. ITEMS TABLE (MATCHES PRINT FORMAT) */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse border border-black text-xs text-black">
          <thead>
            <tr className="border-b border-black text-black uppercase font-bold text-[11px] bg-surface-50/70">
              <th className="py-2 px-2 text-center border-r border-black w-12">S/N</th>
              <th className="py-2 px-3 text-left border-r border-black">DESCRIPTION</th>
              <th className="py-2 px-2 text-center border-r border-black w-24 sm:w-28">QTY</th>
              {!hideRate && (
                <th className="py-2 px-3 text-right border-r border-black w-28 sm:w-32 whitespace-pre-line leading-tight">
                  UNIT PRICE{'\n'}IN INR
                </th>
              )}
              {!hideRate && (
                <th className="py-2 px-3 text-right w-28 sm:w-32 whitespace-pre-line leading-tight">
                  TOTAL{'\n'}IN INR
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/30">
            {items.map((item, idx) => {
              let desc = (item.item_description || '').toUpperCase();
              if (item.brand) desc += ` [ ${item.brand.toUpperCase()} ]`;
              if (item.colour_finish) desc += ` - ${item.colour_finish.toUpperCase()}`;
              if (item.size) desc += ` ( ${item.size} )`;
              if (item.discount_amount && Number(item.discount_amount) > 0) {
                const discText =
                  item.discount_type === 'percent'
                    ? `${item.discount_value}%`
                    : `₹${item.discount_amount}`;
                desc += ` [ Disc: -${discText} ]`;
              }

              const unitStr =
                item.unit === 'running ft' ? 'RFT' : (item.unit || 'Sheets').toUpperCase();
              const rate = Number(item.rate) || 0;
              const amt = Number(item.amount) || (rate > 0 ? rate * Number(item.quantity) : 0);

              return (
                <tr key={idx} className="hover:bg-surface-50/40">
                  <td className="py-2.5 px-2 text-center border-r border-black/30 font-semibold">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3 border-r border-black/30 font-bold uppercase leading-snug">
                    {desc}
                  </td>
                  <td className="py-2.5 px-2 text-center border-r border-black/30 font-bold uppercase whitespace-nowrap">
                    {item.quantity} {unitStr}
                  </td>
                  {!hideRate && (
                    <td className="py-2.5 px-3 text-right border-r border-black/30 font-medium whitespace-nowrap font-mono">
                      {rate > 0 ? rate.toLocaleString('en-IN') : '—'}
                    </td>
                  )}
                  {!hideRate && (
                    <td className="py-2.5 px-3 text-right font-bold whitespace-nowrap font-mono">
                      {amt > 0 ? amt.toLocaleString('en-IN') : '—'}
                    </td>
                  )}
                </tr>
              );
            })}

            {/* Delivery Charges row */}
            {!hideRate && transportCharges > 0 && (
              <tr className="font-bold border-t border-black/30 bg-surface-50/30">
                <td className="py-2 px-2 text-center border-r border-black/30"></td>
                <td className="py-2 px-3 border-r border-black/30 uppercase">DELIVERY CHARGES</td>
                <td className="py-2 px-2 text-center border-r border-black/30"></td>
                <td className="py-2 px-3 text-right border-r border-black/30 font-mono">—</td>
                <td className="py-2 px-3 text-right whitespace-nowrap font-mono">
                  {transportCharges.toLocaleString('en-IN')}
                </td>
              </tr>
            )}

            {/* Loading / Unloading Charges row */}
            {!hideRate && loadingCharges > 0 && (
              <tr className="font-bold border-t border-black/30 bg-surface-50/30">
                <td className="py-2 px-2 text-center border-r border-black/30"></td>
                <td className="py-2 px-3 border-r border-black/30 uppercase">
                  LOADING / UNLOADING CHARGES
                </td>
                <td className="py-2 px-2 text-center border-r border-black/30"></td>
                <td className="py-2 px-3 text-right border-r border-black/30 font-mono">—</td>
                <td className="py-2 px-3 text-right whitespace-nowrap font-mono">
                  {loadingCharges.toLocaleString('en-IN')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 4. BOTTOM FRAMED BOX (BANKING, QR, TOTALS & SIGNATURES) */}
      <div className="mt-4 border border-black grid grid-cols-1 md:grid-cols-12 text-black text-xs">
        {/* Left Column (col-span-7) */}
        <div className="md:col-span-7 border-b md:border-b-0 md:border-r border-black flex flex-col justify-between">
          {/* Sub-row: Banking Info + Payment QR */}
          <div className="p-3 flex items-start justify-between gap-3">
            {/* Banking Details & Staff Prepared By */}
            <div className="space-y-1 text-[11px] leading-tight flex-1">
              <div className="font-bold uppercase tracking-tight text-black">
                BANKING &amp; PAYMENT DETAILS:
              </div>
              <div>
                <span className="font-bold">A/C NO : </span>
                <span className="font-mono font-bold">50200003880041</span>
              </div>
              <div>
                <span className="font-bold">RTGS / IFSC : </span>
                <span className="font-mono font-bold">HDFC0000146</span>
              </div>
              <div>BANK : HDFC BANK LTD, THANE</div>

              <div className="border-t border-black/20 my-2 pt-2 space-y-0.5 text-[10.5px]">
                <div className="font-bold uppercase">PREPARED BY : {creator}</div>
                <div>MOBILE : {staffPhone}</div>
                <div>EMAIL : forshowhouse@gmail.com</div>
              </div>
            </div>

            {/* Scannable Payment QR */}
            <div className="flex flex-col items-center justify-center shrink-0 border-l border-black/20 pl-3">
              <img
                src="/payment-qr.jpg"
                alt="Scan to Pay"
                className="w-20 h-20 sm:w-24 sm:h-24 object-contain border border-black/20"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = SHOWHOUSE_PAYMENT_QR_BASE64;
                }}
              />
              <span className="text-[9px] font-bold uppercase tracking-wider text-black mt-1">
                SCAN TO PAY
              </span>
            </div>
          </div>

          {/* Sub-row: Terms & Conditions */}
          <div className="border-t border-black/30 p-2.5 text-[10px] space-y-0.5 leading-snug">
            <div className="font-bold uppercase text-black">TERMS &amp; CONDITIONS :</div>
            <div>• Validity: 1 Week | Wallpaper &amp; Laminate rates include installation.</div>
            <div>• Delivery: within 2 days of confirmation | 50% advance, 50% on delivery.</div>
          </div>

          {/* Sub-row: Receiver's Signature */}
          <div className="border-t border-black/30 p-3 text-center">
            <div className="font-bold text-xs uppercase tracking-tight text-black">
              RECEIVER&apos;S SIGNATURE
            </div>
            <div className="text-[10px] italic text-black/70 mt-0.5">
              (Sign &amp; Stamp - Goods received in good condition)
            </div>
          </div>
        </div>

        {/* Right Column (col-span-5) */}
        <div className="md:col-span-5 flex flex-col justify-between">
          {/* Totals Table */}
          {hideRate ? (
            <div className="p-3 text-xs space-y-2 border-b border-black">
              <div className="font-bold text-center uppercase tracking-wider bg-surface-100 py-1 border border-black/30">
                DELIVERY ACKNOWLEDGMENT
              </div>
              <div className="flex justify-between font-bold pt-1">
                <span>TOTAL ITEMS :</span>
                <span>{items.length}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>TOTAL QUANTITY :</span>
                <span>{challan.total_quantity}</span>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-black text-xs font-bold">
              <div className="flex justify-between p-2">
                <span>SUB TOTAL</span>
                <span className="font-mono">{taxableSubtotal.toLocaleString('en-IN')}</span>
              </div>

              {applyGst && (
                <>
                  <div className="flex justify-between p-2">
                    <span>CGST 9%</span>
                    <span className="font-mono">{cgstAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between p-2">
                    <span>SGST 9%</span>
                    <span className="font-mono">{sgstAmount.toLocaleString('en-IN')}</span>
                  </div>
                </>
              )}

              {applyAdditional9 && (
                <div className="flex justify-between p-2">
                  <span>ADDITIONAL 9%</span>
                  <span className="font-mono">{additional9Amount.toLocaleString('en-IN')}</span>
                </div>
              )}

              <div className="flex justify-between p-2.5 text-xs sm:text-sm font-black bg-surface-100/90 border-t border-black">
                <span>GRAND TOTAL</span>
                <span className="font-mono">{grandTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}

          {/* For and on behalf of & Authorized Signatory */}
          <div className="p-4 text-center flex flex-col items-center justify-end flex-1 min-h-[110px]">
            <div className="text-[11px] font-bold text-black">For and on behalf of</div>
            <div className="text-xs font-bold text-black mt-0.5">
              {profile?.legal_name || 'Showhouse Concepts & Designs LLP'}
            </div>
            <div className="w-4/5 border-t border-black/40 mt-10 mb-1" />
            <div className="text-xs font-bold text-black">Authorized Signatory</div>
          </div>
        </div>
      </div>

      {/* 5. BOTTOM TAGLINE */}
      <div className="text-center font-serif font-bold italic text-xs sm:text-sm text-[#2B5EA7] tracking-widest mt-5">
        &quot; YOUR CONCEPTS, OUR DESIGNS &quot;
      </div>
    </div>
  );
}
