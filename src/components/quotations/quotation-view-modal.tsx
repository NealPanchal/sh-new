'use client';

import React from 'react';
import Link from 'next/link';
import { Quotation } from '@/types';
import { useApp } from '@/lib/context';
import { X, Send, Download, ArrowRight, Building2, Calendar, User, Phone, MapPin, Layers, Edit } from 'lucide-react';
import { formatDateIndian, cn, resolveSiteInchargeDetails } from '@/lib/utils';
import { shareQuotationViaWhatsApp } from '@/lib/whatsapp';
import { exportQuotationToPDF } from '@/lib/pdf-quotation';

interface QuotationViewModalProps {
  quotation: Quotation | null;
  onClose: () => void;
  onEdit?: (quotation: Quotation) => void;
}

export function QuotationViewModal({ quotation, onClose, onEdit }: QuotationViewModalProps) {
  const { profile, showToast, customers } = useApp();

  if (!quotation) return null;

  const { inchargeName, inchargePhone } = resolveSiteInchargeDetails(quotation, customers);

  const handleShareWhatsApp = async () => {
    try {
      await shareQuotationViaWhatsApp({
        quotation,
        profile,
        onToast: showToast,
      });
    } catch {
      showToast('Error sharing quotation via WhatsApp', 'error');
    }
  };

  const handleDownloadPDF = () => {
    try {
      exportQuotationToPDF(quotation, profile);
      showToast('Downloading Quotation PDF...', 'info');
    } catch {
      showToast('Error generating Quotation PDF', 'error');
    }
  };

  const isConverted = quotation.status === 'converted';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] sm:max-h-[90vh] flex flex-col shadow-2xl border border-surface-200 overflow-hidden">
        {/* Header */}
        <div className="p-3 sm:p-4 bg-surface-50 border-b border-surface-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-orange-100 text-[#ea580c] rounded-xl font-bold">
              <Layers size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-surface-900 font-mono">
                  {quotation.quotation_number}
                </h3>
                <span
                  className={cn(
                    'text-[10px] uppercase font-bold px-2 py-0.5 rounded border',
                    isConverted
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : quotation.status === 'approved'
                      ? 'bg-green-100 text-green-800 border-green-300'
                      : quotation.status === 'sent'
                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                  )}
                >
                  {isConverted ? 'CONVERTED' : (quotation.status === 'draft' ? 'SAVED' : (quotation.status || 'SAVED').toUpperCase())}
                </span>
              </div>
              <p className="text-[11px] text-surface-500">
                Created: {formatDateIndian(quotation.quotation_date)}
                {quotation.prepared_by ? ` • Prepared by: ${quotation.prepared_by}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(quotation);
                }}
                className="py-1 px-2.5 rounded-lg text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 inline-flex items-center gap-1 cursor-pointer transition-colors"
                title="Edit Quotation"
              >
                <Edit size={13} />
                <span>Edit</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-200/60 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 text-xs">
          {/* Customer & Site Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 p-3 bg-surface-50/70 border border-surface-200 rounded-xl">
            <div className="space-y-1">
              <div className="font-bold text-surface-900 text-sm flex items-center gap-1.5">
                <User size={13} className="text-[#ea580c] shrink-0" />
                <span className="truncate">{quotation.customer_name}</span>
              </div>
              {quotation.customer_phone && (
                <div className="text-surface-600 flex items-center gap-1.5 font-mono text-[11px]">
                  <Phone size={12} className="text-surface-400 shrink-0" />
                  <span>{quotation.customer_phone}</span>
                </div>
              )}
              {quotation.customer_address && (
                <div className="text-surface-500 flex items-center gap-1.5 text-[11px]">
                  <MapPin size={12} className="text-surface-400 shrink-0" />
                  <span className="truncate">{quotation.customer_address}</span>
                </div>
              )}
            </div>

            <div className="space-y-1 sm:text-right pt-1.5 sm:pt-0 border-t sm:border-t-0 border-surface-200/60">
              <div className="text-[10px] sm:text-[11px] text-surface-500 uppercase font-bold tracking-wider">
                Target Delivery Site
              </div>
              <div className="font-bold text-surface-900 inline-flex items-center gap-1 sm:justify-end text-xs sm:text-sm">
                <Building2 size={13} className="text-[#ea580c] shrink-0" />
                <span>{quotation.site_name || 'General Site'}</span>
              </div>
              {quotation.delivery_address && (
                <div className="text-surface-500 text-[11px] truncate">
                  {quotation.delivery_address}
                </div>
              )}
              {(inchargeName || inchargePhone) && (
                <div className="text-[11px] font-medium text-surface-700">
                  Site Incharge: <span className="font-semibold text-surface-900">{inchargeName || ''}</span> {inchargePhone ? `(${inchargePhone})` : ''}
                </div>
              )}
            </div>
          </div>

          {/* Items List - Responsive: Cards on Mobile (< 640px), Full Table on Desktop (>= 640px) */}
          {/* 1. Mobile Cards Layout */}
          <div className="sm:hidden space-y-2">
            <div className="text-[10px] font-bold text-surface-500 uppercase tracking-wider px-0.5">
              Quotation Items ({quotation.items?.length || 0})
            </div>
            {quotation.items?.map((it, idx) => (
              <div
                key={it.id || idx}
                className="p-3 bg-white border border-surface-200 rounded-xl shadow-2xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <span className="w-5 h-5 rounded-md bg-surface-100 text-surface-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-surface-200">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-surface-900 text-xs leading-snug break-words">
                        {it.item_description}
                      </div>
                      {(it.brand || it.colour_finish || it.size) && (
                        <div className="text-[10px] text-surface-500 flex flex-wrap items-center gap-1.5 mt-1">
                          {it.brand && (
                            <span className="bg-surface-50 px-1.5 py-0.5 rounded border border-surface-200 font-medium">
                              Brand: {it.brand}
                            </span>
                          )}
                          {it.colour_finish && (
                            <span className="bg-surface-50 px-1.5 py-0.5 rounded border border-surface-200 font-medium">
                              Finish: {it.colour_finish}
                            </span>
                          )}
                          {it.size && (
                            <span className="bg-surface-50 px-1.5 py-0.5 rounded border border-surface-200 font-medium">
                              Size: {it.size}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-1">
                    <div className="font-mono font-black text-xs text-surface-950">
                      ₹{Number(it.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-surface-600 pt-1.5 border-t border-surface-100 font-medium">
                  <span>
                    Qty: <b className="text-surface-900 font-bold">{it.quantity}</b> {it.unit || 'sheets'}
                  </span>
                  <span>
                    Rate:{' '}
                    <span className="font-mono font-semibold text-surface-800">
                      ₹{Number(it.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* 2. Desktop Table Layout */}
          <div className="hidden sm:block border border-surface-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse min-w-[520px]">
                <thead className="bg-surface-100 text-surface-700 font-bold uppercase text-[10px] tracking-wider border-b border-surface-200">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3">Particulars & Finish</th>
                    <th className="py-2.5 px-3 text-center w-20">Unit</th>
                    <th className="py-2.5 px-3 text-right w-16">Qty</th>
                    <th className="py-2.5 px-3 text-right w-24">Rate (₹)</th>
                    <th className="py-2.5 px-3 text-right w-28">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 bg-white">
                  {quotation.items?.map((it, idx) => (
                    <tr key={it.id || idx} className="hover:bg-surface-50/60">
                      <td className="py-2.5 px-3 text-center text-surface-400 font-medium">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-surface-900">{it.item_description}</div>
                        {(it.brand || it.colour_finish || it.size) && (
                          <div className="text-[10px] text-surface-500 flex items-center gap-2 mt-0.5">
                            {it.brand && <span>Brand: {it.brand}</span>}
                            {it.colour_finish && <span>Finish: {it.colour_finish}</span>}
                            {it.size && <span>Size: {it.size}</span>}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center text-surface-600">{it.unit || 'sheets'}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-surface-900">{it.quantity}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-surface-700">
                        ₹{Number(it.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-surface-950">
                        ₹{Number(it.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pricing Breakdown */}
          {(() => {
            const itemsSum =
              quotation.items && quotation.items.length > 0
                ? quotation.items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0)
                : Number(quotation.subtotal_amount || 0);

            return (
              <div className="p-3 bg-surface-50 border border-surface-200 rounded-xl space-y-1.5 font-medium text-xs">
                <div className="flex justify-between text-surface-600">
                  <span>Items Subtotal:</span>
                  <span className="font-mono font-semibold">
                    ₹{Number(itemsSum).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {Number(quotation.transportation_charges || 0) > 0 && (
                  <div className="flex justify-between text-surface-600">
                    <span>Transportation Charges:</span>
                    <span className="font-mono">
                      +₹{Number(quotation.transportation_charges).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                {Number((quotation as any).loading_charges || quotation.loading_unloading_charges || quotation.selection_charges || 0) > 0 && (
                  <div className="flex justify-between text-surface-600">
                    <span>Loading / Unloading Charges:</span>
                    <span className="font-mono">
                      +₹{Number((quotation as any).loading_charges || quotation.loading_unloading_charges || quotation.selection_charges).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                {quotation.apply_gst && (
                  <div className="flex justify-between text-surface-600">
                    <span>GST (18% Total):</span>
                    <span className="font-mono text-emerald-700 font-bold">
                      +₹{((Number(quotation.cgst_amount || 0) + Number(quotation.sgst_amount || 0))).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-surface-200 flex justify-between items-center font-black text-xs sm:text-sm text-surface-950">
                  <span>Total Estimated Amount:</span>
                  <span className="font-mono text-[#ea580c] text-sm sm:text-base">
                    ₹{Number(quotation.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Notes if any */}
          {quotation.notes && (
            <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-amber-900 text-[11px]">
              <b>Notes:</b> {quotation.notes}
            </div>
          )}
        </div>

        {/* Footer Actions - Responsive on Mobile */}
        <div className="p-3 bg-surface-50 border-t border-surface-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="py-2 sm:py-1.5 px-3 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 inline-flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Send size={13} />
              <span>WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="py-2 sm:py-1.5 px-3 rounded-xl text-xs font-bold text-surface-700 bg-white sm:bg-surface-100 hover:bg-surface-200 border border-surface-300 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download size={13} />
              <span>Download PDF</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(quotation);
                }}
                className="py-2 sm:py-1.5 px-3 rounded-xl text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Edit Quotation"
              >
                <Edit size={13} />
                <span>Edit</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="py-2 sm:py-1.5 px-3 rounded-xl text-xs font-semibold text-surface-600 bg-surface-100 hover:bg-surface-200 border border-surface-200 text-center cursor-pointer"
            >
              Close
            </button>
            <Link
              href={`/challans/new?customerId=${encodeURIComponent(quotation.customer_id)}&quotationId=${encodeURIComponent(quotation.id)}`}
              className={cn(
                "py-2 sm:py-1.5 px-3.5 rounded-xl text-xs font-bold text-white bg-[#ea580c] hover:bg-[#c2410c] inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors",
                onEdit ? "col-span-2 sm:col-span-1" : ""
              )}
            >
              <ArrowRight size={13} />
              <span>Convert to Challan</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
