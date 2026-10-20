'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import {
  ArrowLeft,
  Printer,
  Download,
  Send,
  Edit,
  Copy,
  Ban,
  CheckCircle2,
  Clock,
  Phone,
  MapPin,
  FileText,
  AlertCircle,
  Share2,
} from 'lucide-react';
import { formatDateIndian, formatINR, formatPhone, amountToWords, cn } from '@/lib/utils';
import { Challan, ChallanStatus } from '@/types';
import { downloadChallanPDF, printChallanPDF } from '@/lib/pdf';
import { openWhatsApp, generateShareMessage, tryNativeShare } from '@/lib/whatsapp';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export default function ChallanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const challanId = params.id as string;

  const {
    getChallan,
    profile,
    updateChallanStatus,
    updateShareStatus,
    duplicateChallan,
    showToast,
    isLoading,
  } = useApp();

  const [mounted, setMounted] = useState(false);
  const [challan, setChallan] = useState<Challan | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && challanId) {
      const found = getChallan(challanId);
      if (found) {
        setChallan(found);
      }
    }
  }, [mounted, challanId, getChallan]);

  const totalAmount = useMemo(() => {
    if (challan?.total_amount && challan.total_amount > 0) return challan.total_amount;
    if (!challan?.items) return 0;
    return challan.items.reduce((sum, item) => {
      const amt = Number(item.amount) || ((Number(item.quantity) || 0) * (Number(item.rate) || 0));
      return sum + amt;
    }, 0);
  }, [challan]);

  if (!mounted || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!challan) {
    return (
      <div className="card p-8 sm:p-12 text-center max-w-lg mx-auto">
        <AlertCircle size={36} className="mx-auto text-surface-400 mb-2" />
        <h2 className="text-lg font-bold text-surface-900 mb-1">Challan Not Found</h2>
        <p className="text-xs text-surface-500 mb-4">
          This challan does not exist or may have been deleted.
        </p>
        <Link href="/challans" className="btn-secondary text-xs py-2 px-3.5 inline-flex items-center gap-1.5">
          <ArrowLeft size={15} />
          Back to Challans
        </Link>
      </div>
    );
  }

  const handlePrint = () => {
    if (!profile) return;
    printChallanPDF({
      challan,
      items: challan.items || [],
      profile,
    });
    showToast(`Print dialog opened for ${challan.challan_number}`);
  };

  const handleDownload = () => {
    if (!profile) return;
    downloadChallanPDF({
      challan,
      items: challan.items || [],
      profile,
    });
    showToast(`PDF downloaded: ${challan.challan_number}`);
  };

  const handleWhatsApp = async () => {
    if (!profile) return;
    if (!challan.customer_phone) {
      showToast('Customer phone number is missing', 'error');
      return;
    }

    // Try native share if on mobile device, else wa.me
    const shared = await tryNativeShare({
      challan,
      items: challan.items || [],
      profile,
    });

    if (!shared) {
      const msg = generateShareMessage(challan, profile);
      openWhatsApp(challan.customer_phone, msg);
    }

    updateShareStatus(challan.id, 'user_marked_sent');
    const refreshed = getChallan(challan.id);
    if (refreshed) setChallan(refreshed);
    showToast('Challan shared with customer');
  };

  const handleDuplicate = () => {
    const dup = duplicateChallan(challan.id);
    if (dup) {
      showToast(`Duplicated to ${dup.challan_number}`);
      router.push(`/challans/${dup.id}`);
    }
  };

  const confirmCancel = () => {
    updateChallanStatus(challan.id, 'cancelled');
    const refreshed = getChallan(challan.id);
    if (refreshed) setChallan(refreshed);
    setShowCancelModal(false);
    showToast(`Challan ${challan.challan_number} marked as cancelled`);
  };

  return (
    <div className="space-y-4 pb-20 sm:pb-8 max-w-4xl mx-auto">
      {/* Top Header & Fast Action Bar */}
      <div className="card p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href="/challans"
              className="p-1.5 rounded-lg text-surface-500 hover:text-surface-900 hover:bg-surface-100 transition-colors"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-extrabold text-base sm:text-lg text-primary-600">
                  {challan.challan_number}
                </span>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                    challan.status === 'final'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : challan.status === 'draft'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  )}
                >
                  {challan.status}
                </span>
              </div>
              <p className="text-[11px] text-surface-500 mt-0.5">
                Date: {formatDateIndian(challan.challan_date)}
                {challan.reference_number && ` • Ref: ${challan.reference_number}`}
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {challan.customer_phone && (
              <button
                onClick={handleWhatsApp}
                className="btn-primary py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                title="Share via WhatsApp"
              >
                <Send size={14} />
                <span>WhatsApp</span>
              </button>
            )}

            <button
              onClick={handlePrint}
              className="btn-secondary py-1.5 px-3 text-xs font-medium flex items-center gap-1.5"
              title="Print Challan Document"
            >
              <Printer size={14} />
              <span>Print</span>
            </button>

            <button
              onClick={handleDownload}
              className="btn-secondary py-1.5 px-3 text-xs font-medium flex items-center gap-1.5"
              title="Download PDF"
            >
              <Download size={14} />
              <span>PDF</span>
            </button>

            <Link
              href={`/challans/${challan.id}/edit`}
              className="btn-secondary py-1.5 px-3 text-xs font-medium flex items-center gap-1.5"
            >
              <Edit size={14} />
              <span>Edit</span>
            </Link>

            <button
              onClick={handleDuplicate}
              className="btn-secondary py-1.5 px-2.5 text-xs font-medium text-surface-600"
              title="Duplicate"
            >
              <Copy size={14} />
            </button>

            {challan.status !== 'cancelled' && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="btn-ghost py-1.5 px-2 text-xs font-medium text-red-500 hover:bg-red-50"
                title="Cancel Challan"
              >
                <Ban size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Visual A4 Delivery Challan Card */}
      <div className="card p-4 sm:p-8 bg-white shadow-xs border border-surface-200 printable-challan">
        {/* Business Header */}
        <div className="border-b-2 border-primary-500 pb-4 mb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-surface-900 tracking-tight">
                {profile?.business_name || 'SHOWHOUSE'}
              </h2>
              <p className="text-[11px] font-semibold text-primary-600 tracking-wider uppercase mt-0.5">
                {profile?.tagline || 'Premium Laminates & Decorative Surfaces'}
              </p>
              {profile?.address && (
                <p className="text-xs text-surface-500 mt-1 whitespace-pre-line leading-relaxed max-w-sm">
                  {profile.address}
                </p>
              )}
            </div>

            <div className="text-left sm:text-right text-xs text-surface-600 space-y-0.5">
              {profile?.gstin && (
                <div>
                  <span className="text-surface-400">GSTIN: </span>
                  <span className="font-mono font-semibold text-surface-800">{profile.gstin}</span>
                </div>
              )}
              {profile?.phone && (
                <div>
                  <span className="text-surface-400">Phone: </span>
                  <span className="font-medium text-surface-800">{formatPhone(profile.phone)}</span>
                </div>
              )}
              {profile?.email && (
                <div>
                  <span className="text-surface-400">Email: </span>
                  <span>{profile.email}</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 text-center">
            <span className="inline-block bg-surface-900 text-white font-bold text-[11px] uppercase tracking-widest px-3 py-0.5 rounded">
              Delivery Challan
            </span>
          </div>
        </div>

        {/* Challan & Consignee Meta */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4 border-b border-surface-200 text-xs">
          {/* Challan Info */}
          <div className="bg-surface-50 p-3 rounded-lg border border-surface-100 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-surface-500">Challan No:</span>
              <span className="font-mono font-bold text-surface-900">{challan.challan_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-500">Date:</span>
              <span className="font-medium text-surface-800">{formatDateIndian(challan.challan_date)}</span>
            </div>
            {challan.reference_number && (
              <div className="flex justify-between">
                <span className="text-surface-500">Ref / Order No:</span>
                <span className="font-medium text-surface-800">{challan.reference_number}</span>
              </div>
            )}
          </div>

          {/* Consignee Info */}
          <div className="bg-surface-50 p-3 rounded-lg border border-surface-100 space-y-1">
            <span className="text-[10px] text-surface-400 font-semibold uppercase tracking-wider block">
              Consignee / Deliver To:
            </span>
            <div className="font-bold text-surface-900 text-sm">
              {challan.customer_name}
            </div>
            {challan.customer_phone && (
              <div className="text-surface-600 flex items-center gap-1 text-[11px]">
                <Phone size={12} className="text-surface-400" />
                <span>{formatPhone(challan.customer_phone)}</span>
              </div>
            )}
            {(challan.delivery_address || challan.customer_address) && (
              <div className="text-surface-600 flex items-start gap-1 text-[11px] pt-0.5">
                <MapPin size={12} className="text-surface-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{challan.delivery_address || challan.customer_address}</span>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Items View (Zero Horizontal Overflow) */}
        <div className="sm:hidden py-3 space-y-2">
          {challan.items?.map((item, idx) => {
            const lineRate = item.rate ? Number(item.rate) : null;
            const lineAmt = item.amount ? Number(item.amount) : (lineRate ? lineRate * item.quantity : null);
            return (
              <div key={idx} className="p-2.5 rounded-lg border border-surface-100 bg-surface-50/50 flex justify-between items-start text-xs">
                <div>
                  <span className="font-bold text-surface-900 block">{item.item_description}</span>
                  <span className="text-[11px] text-surface-500 block mt-0.5">
                    {[item.brand, item.colour_finish, item.size].filter(Boolean).join(' · ')}
                  </span>
                  {lineRate && (
                    <span className="text-[10px] text-surface-500 block font-mono mt-0.5">
                      Rate: ₹{lineRate.toLocaleString('en-IN')} / {item.unit}
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0 pl-2">
                  <span className="font-bold text-surface-900 text-sm block">
                    {item.quantity} {item.unit}
                  </span>
                  {lineAmt && (
                    <span className="text-xs text-primary-600 font-bold block font-mono mt-0.5">
                      ₹{lineAmt.toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop / Print Items Table */}
        <div className="hidden sm:block py-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-surface-200 text-surface-500 uppercase font-semibold">
                <th className="py-2 px-2 text-left w-10">#</th>
                <th className="py-2 px-2 text-left">Item Description</th>
                <th className="py-2 px-2 text-left">Brand / Spec</th>
                <th className="py-2 px-2 text-right">Quantity</th>
                <th className="py-2 px-2 text-left">Unit</th>
                {totalAmount > 0 && <th className="py-2 px-2 text-right">Rate (₹)</th>}
                {totalAmount > 0 && <th className="py-2 px-2 text-right">Amount (₹)</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {challan.items?.map((item, idx) => {
                const lineRate = item.rate ? Number(item.rate) : null;
                const lineAmt = item.amount ? Number(item.amount) : (lineRate ? lineRate * item.quantity : null);
                return (
                  <tr key={idx} className="hover:bg-surface-50/50">
                    <td className="py-2 px-2 text-surface-400 font-mono">{idx + 1}</td>
                    <td className="py-2 px-2 font-semibold text-surface-900">{item.item_description}</td>
                    <td className="py-2 px-2 text-surface-600">
                      {[item.brand, item.colour_finish, item.size].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-surface-900">{item.quantity}</td>
                    <td className="py-2 px-2 text-surface-500 capitalize">{item.unit}</td>
                    {totalAmount > 0 && (
                      <td className="py-2 px-2 text-right text-surface-600 font-mono">
                        {lineRate ? formatINR(lineRate) : '—'}
                      </td>
                    )}
                    {totalAmount > 0 && (
                      <td className="py-2 px-2 text-right font-semibold text-surface-900 font-mono">
                        {lineAmt ? formatINR(lineAmt) : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Total Summary Row */}
        <div className="py-3 px-3.5 bg-surface-50 rounded-lg border border-surface-200 flex items-center justify-between mt-2">
          <div>
            <span className="font-bold text-xs uppercase tracking-wider text-surface-700 block">
              Total Quantity
            </span>
            <span className="font-extrabold text-base text-surface-900">
              {challan.total_quantity} <span className="text-xs font-normal text-surface-500">{challan.items?.[0]?.unit || 'sheets'}</span>
            </span>
          </div>
          {totalAmount > 0 && (
            <div className="text-right">
              <span className="font-bold text-xs uppercase tracking-wider text-surface-700 block">
                Total Amount
              </span>
              <span className="font-mono font-extrabold text-lg text-primary-600">
                ₹{totalAmount.toLocaleString('en-IN')}
              </span>
            </div>
          )}
        </div>

        {totalAmount > 0 && (
          <div className="py-2 px-3 text-xs text-surface-600 mt-2">
            <span className="font-semibold text-surface-700">Amount in Words: </span>
            <span className="italic">{amountToWords(totalAmount)}</span>
          </div>
        )}

        {/* Terms & Signatures */}
        <div className="pt-6 mt-4 border-t border-surface-200 text-xs space-y-6">
          <div>
            <span className="text-[10px] font-bold text-surface-600 uppercase tracking-wider block mb-1">
              Terms & Conditions
            </span>
            <p className="text-[11px] text-surface-500 leading-relaxed">
              1. Goods received in good condition. 2. Discrepancies must be reported within 24 hours. 3. Non-tax delivery document.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-6">
            <div className="border-t border-dashed border-surface-300 pt-2 text-center text-xs">
              <span className="font-semibold text-surface-700 block">Receiver&apos;s Signature</span>
              <span className="text-[10px] text-surface-400 block mt-0.5">Goods Received</span>
            </div>
            <div className="border-t border-dashed border-surface-300 pt-2 text-center text-xs">
              <span className="font-semibold text-surface-700 block">
                For {profile?.business_name || 'SHOWHOUSE'}
              </span>
              <span className="text-[10px] text-surface-400 block mt-0.5">Authorized Signatory</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showCancelModal}
        title="Cancel Challan?"
        message={`Are you sure you want to mark challan ${challan.challan_number} as cancelled?`}
        variant="danger"
        confirmLabel="Yes, Cancel"
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelModal(false)}
      />
    </div>
  );
}
