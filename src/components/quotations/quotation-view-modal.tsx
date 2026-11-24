'use client';

import React from 'react';
import Link from 'next/link';
import { Quotation } from '@/types';
import { useApp } from '@/lib/context';
import { X, Send, Download, ArrowRight, Building2, Calendar, User, Phone, MapPin, Layers } from 'lucide-react';
import { formatDateIndian, cn } from '@/lib/utils';
import { shareQuotationViaWhatsApp } from '@/lib/whatsapp';
import { exportQuotationToPDF } from '@/lib/pdf-quotation';

interface QuotationViewModalProps {
  quotation: Quotation | null;
  onClose: () => void;
}

export function QuotationViewModal({ quotation, onClose }: QuotationViewModalProps) {
  const { profile, showToast } = useApp();

  if (!quotation) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-surface-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-surface-50 border-b border-surface-200 flex items-center justify-between">
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
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-200/60 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Customer & Site Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-surface-50/70 border border-surface-200 rounded-xl">
            <div className="space-y-1">
              <div className="font-bold text-surface-900 text-sm flex items-center gap-1.5">
                <User size={13} className="text-[#ea580c]" />
                <span>{quotation.customer_name}</span>
              </div>
              {quotation.customer_phone && (
                <div className="text-surface-600 flex items-center gap-1.5">
                  <Phone size={12} className="text-surface-400" />
                  <span>{quotation.customer_phone}</span>
                </div>
              )}
              {quotation.customer_address && (
                <div className="text-surface-500 flex items-center gap-1.5">
                  <MapPin size={12} className="text-surface-400 shrink-0" />
                  <span className="truncate">{quotation.customer_address}</span>
                </div>
              )}
            </div>

            <div className="space-y-1 sm:text-right">
              <div className="text-[11px] text-surface-500 uppercase font-bold tracking-wider">
                Target Delivery Site
              </div>
              <div className="font-bold text-surface-900 inline-flex items-center gap-1 sm:justify-end">
                <Building2 size={13} className="text-[#ea580c]" />
                <span>{quotation.site_name || 'General Site'}</span>
              </div>
              {quotation.delivery_address && (
                <div className="text-surface-500 text-[11px] truncate">
                  {quotation.delivery_address}
                </div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="border border-surface-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-surface-100 text-surface-700 font-bold uppercase text-[10px] tracking-wider border-b border-surface-200">
                <tr>
                  <th className="py-2 px-2.5 w-10 text-center">#</th>
                  <th className="py-2 px-2.5">Particulars & Finish</th>
                  <th className="py-2 px-2.5 text-center w-20">Unit</th>
                  <th className="py-2 px-2.5 text-right w-16">Qty</th>
                  <th className="py-2 px-2.5 text-right w-24">Rate (₹)</th>
                  <th className="py-2 px-2.5 text-right w-24">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {quotation.items?.map((it, idx) => (
                  <tr key={it.id || idx} className="hover:bg-surface-50/60">
                    <td className="py-2 px-2.5 text-center text-surface-400 font-medium">{idx + 1}</td>
                    <td className="py-2 px-2.5">
                      <div className="font-bold text-surface-900">{it.item_description}</div>
                      {(it.brand || it.colour_finish || it.size) && (
                        <div className="text-[10px] text-surface-500 flex items-center gap-2 mt-0.5">
                          {it.brand && <span>Brand: {it.brand}</span>}
                          {it.colour_finish && <span>Finish: {it.colour_finish}</span>}
                          {it.size && <span>Size: {it.size}</span>}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2.5 text-center text-surface-600">{it.unit || 'sheets'}</td>
                    <td className="py-2 px-2.5 text-right font-bold text-surface-900">{it.quantity}</td>
                    <td className="py-2 px-2.5 text-right font-mono text-surface-700">
                      ₹{Number(it.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono font-bold text-surface-950">
                      ₹{Number(it.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pricing Breakdown */}
          <div className="p-3 bg-surface-50 border border-surface-200 rounded-xl space-y-1.5 font-medium">
            <div className="flex justify-between text-surface-600">
              <span>Items Subtotal:</span>
              <span className="font-mono">
                ₹{Number(quotation.subtotal_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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

            <div className="pt-2 border-t border-surface-200 flex justify-between font-black text-sm text-surface-950">
              <span>Total Estimated Amount:</span>
              <span className="font-mono text-[#ea580c] text-base">
                ₹{Number(quotation.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Notes if any */}
          {quotation.notes && (
            <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-amber-900 text-[11px]">
              <b>Notes:</b> {quotation.notes}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-surface-50 border-t border-surface-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="py-1.5 px-3 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Send size={13} />
              <span>WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="py-1.5 px-3 rounded-lg text-xs font-bold text-surface-700 bg-surface-100 hover:bg-surface-200 border border-surface-300 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download size={13} />
              <span>Download PDF</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-1.5 px-3 rounded-lg text-xs font-semibold text-surface-600 hover:bg-surface-200 cursor-pointer"
            >
              Close
            </button>
            <Link
              href={`/challans/new?customerId=${encodeURIComponent(quotation.customer_id)}&quotationId=${encodeURIComponent(quotation.id)}`}
              className="py-1.5 px-3 rounded-lg text-xs font-bold text-white bg-[#ea580c] hover:bg-[#c2410c] inline-flex items-center gap-1.5 shadow-xs transition-colors"
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
