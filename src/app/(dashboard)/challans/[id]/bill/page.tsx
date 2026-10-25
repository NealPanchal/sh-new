'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import { Challan } from '@/types';
import { DeliveryMemoBill } from '@/components/challans/delivery-memo-bill';
import { openWhatsApp, shareChallanViaWhatsApp, resolveCustomerPhone } from '@/lib/whatsapp';
import { printChallanPDF, downloadChallanPDF } from '@/lib/pdf';
import {
  ArrowLeft,
  Printer,
  Download,
  Send,
  FileText,
  Edit2,
  Check,
  X,
} from 'lucide-react';

export default function ChallanBillPage() {
  const params = useParams();
  const router = useRouter();
  const { getChallan, updateChallan, profile, customers, showToast, dataVersion, challans: liveChallans, isLoading } = useApp();

  const challanId = params.id as string;
  const [challan, setChallan] = useState<Challan | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [memoNo, setMemoNo] = useState('');
  const [confirmBy, setConfirmBy] = useState('');
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');

  const initChallanFields = (c: Challan) => {
    setChallan(c);
    setMemoNo(
      c.reference_number ||
        c.challan_number.split('/').pop() ||
        '0120'
    );
    setConfirmBy(
      c.notes ||
        (c.created_by || c.prepared_by
          ? `Confirm By ${c.created_by || c.prepared_by}`
          : '')
    );
  };

  useEffect(() => {
    let isCancelled = false;

    async function loadChallan() {
      // 1. Try local cache
      const found = getChallan(challanId);
      if (found) {
        if (!isCancelled) {
          initChallanFields(found);
          setPageLoading(false);
        }
      }

      // 2. Fetch from Cloud Firestore
      try {
        const { fetchSingleChallanFromFirebase } = await import('@/lib/firebase-service');
        const remote = await fetchSingleChallanFromFirebase(challanId);
        if (remote && !isCancelled) {
          const { syncFromFirebase } = await import('@/lib/demo-store');
          syncFromFirebase([remote]);
          initChallanFields(remote);
          setPageLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Bill page direct Firestore fetch note:', err);
      }

      // 3. Fallback to server API
      try {
        const res = await fetch(`/api/challans?id=${encodeURIComponent(challanId)}`, {
          credentials: 'same-origin',
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.challan && !isCancelled) {
            const { syncFromFirebase } = await import('@/lib/demo-store');
            syncFromFirebase([json.challan]);
            initChallanFields(json.challan);
            setPageLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Bill page API fetch note:', err);
      }

      if (!isCancelled && !found) {
        setChallan(null);
        setPageLoading(false);
      }
    }

    if (challanId) {
      loadChallan();
    }

    return () => {
      isCancelled = true;
    };
  }, [challanId, getChallan, dataVersion, liveChallans]);

  if (pageLoading && !challan) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-xs text-surface-500">Loading memo bill...</p>
      </div>
    );
  }

  if (!challan) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm text-surface-500 mb-3">Challan bill not found</p>
        <Link href="/challans" className="btn-secondary text-xs">
          Back to Challans
        </Link>
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    if (!profile) return;
    downloadChallanPDF({
      challan,
      items: challan.items || [],
      profile,
    });
    showToast(`Downloading Bill / Memo PDF`);
  };

  const handleWhatsApp = async () => {
    if (!profile || !challan) return;
    const targetPhone = resolveCustomerPhone(challan, customers, liveChallans);
    if (!targetPhone) {
      setPhoneInput('');
      setShowPhoneModal(true);
      return;
    }

    await shareChallanViaWhatsApp({
      challan,
      phoneOverride: targetPhone,
      items: challan.items || [],
      profile,
      isBillMemo: true,
      memoNo,
      confirmBy,
      onToast: showToast,
    });

    if (!challan.customer_phone?.trim()) {
      updateChallan(challan.id, { customer_phone: targetPhone });
      setChallan({ ...challan, customer_phone: targetPhone });
    }
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challan || !phoneInput.trim() || !profile) return;
    const cleanNum = phoneInput.trim();
    setShowPhoneModal(false);
    const target = { ...challan, customer_phone: cleanNum };
    setChallan(target);

    await shareChallanViaWhatsApp({
      challan: target,
      phoneOverride: cleanNum,
      items: target.items || [],
      profile,
      isBillMemo: true,
      memoNo,
      confirmBy,
      onToast: showToast,
    });

    updateChallan(challan.id, { customer_phone: cleanNum });
  };

  const targetPhone = challan ? resolveCustomerPhone(challan, customers, liveChallans) : '';

  return (
    <div className="space-y-4 pb-20 sm:pb-8 max-w-4xl mx-auto">
      {/* Top Header & Actions - Hidden in Print */}
      <div className="card p-3 sm:p-4 space-y-3 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href={`/challans/${challan.id}`}
              className="p-1.5 rounded-lg text-surface-500 hover:text-surface-900 hover:bg-surface-100 transition-colors"
              title="Back to Challan"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-surface-900">
                  After-Delivery Bill / Memo
                </h1>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#b8860b]/10 text-[#b8860b] border border-[#b8860b]/30">
                  Memo #{memoNo}
                </span>
              </div>
              <p className="text-[11px] text-surface-500">
                Official Showhouse Decor Studio slip format matching paper memo pad
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            <button
              onClick={() => setIsEditingMeta(!isEditingMeta)}
              className="btn-secondary py-1.5 px-3 text-xs font-medium flex items-center gap-1.5"
              title="Edit Memo No. & Notes"
            >
              <Edit2 size={14} />
              <span>{isEditingMeta ? 'Done Editing' : 'Edit Memo #'}</span>
            </button>

            <button
              onClick={handleWhatsApp}
              className="btn-primary py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold flex items-center gap-1.5 shadow-xs text-white cursor-pointer"
              title={targetPhone ? `WhatsApp Share (${targetPhone})` : 'Enter Phone & Share WhatsApp'}
            >
              <Send size={14} />
              <span>WhatsApp</span>
            </button>

            <button
              onClick={handlePrint}
              className="btn-primary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 shadow-xs bg-surface-900 hover:bg-surface-800"
              title="Print Exact Bill Slip"
            >
              <Printer size={14} />
              <span>Print Bill</span>
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
              href={`/challans/${challan.id}`}
              className="btn-secondary py-1.5 px-3 text-xs font-medium flex items-center gap-1.5"
            >
              <FileText size={14} />
              <span>Challan View</span>
            </Link>
          </div>
        </div>

        {/* Quick Customization Bar when Editing */}
        {isEditingMeta && (
          <div className="pt-3 border-t border-surface-200 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-surface-50 p-2.5 rounded-lg">
            <div>
              <label className="text-[10px] font-semibold text-surface-500 uppercase block mb-1">
                Memo No. (Printed in blue/bold)
              </label>
              <input
                type="text"
                value={memoNo}
                onChange={(e) => setMemoNo(e.target.value)}
                placeholder="e.g. 0120"
                className="input text-xs py-1.5 font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-surface-500 uppercase block mb-1">
                Confirmation Note / Person
              </label>
              <input
                type="text"
                value={confirmBy}
                onChange={(e) => setConfirmBy(e.target.value)}
                placeholder="e.g. Confirm By Neal"
                className="input text-xs py-1.5"
              />
            </div>
          </div>
        )}
      </div>

      {/* The Exact Delivery Bill Slip Component */}
      <div className="printable-delivery-bill">
        <DeliveryMemoBill
          challan={challan}
          profile={profile}
          memoNumber={memoNo}
          confirmBy={confirmBy}
        />
      </div>

      {/* Phone Number Prompt Modal */}
      {showPhoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="card max-w-sm w-full p-4 space-y-3 bg-white shadow-xl rounded-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-surface-900">
                Share Bill via WhatsApp
              </h3>
              <button
                onClick={() => setShowPhoneModal(false)}
                className="text-surface-400 hover:text-surface-700 p-1"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-surface-600">
              Enter customer WhatsApp phone number for challan bill{' '}
              <b className="font-mono text-primary-600">
                {challan.challan_number}
              </b>:
            </p>
            <form onSubmit={handlePhoneSubmit} className="space-y-3">
              <div>
                <input
                  type="tel"
                  placeholder="e.g. 9820012345 or +91 98200 12345"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="input text-xs w-full py-2"
                  autoFocus
                  required
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowPhoneModal(false)}
                  className="btn-secondary text-xs py-1.5 px-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs py-1.5 px-3.5 bg-emerald-600 hover:bg-emerald-700 border-emerald-600 flex items-center gap-1.5 text-white"
                >
                  <Send size={13} />
                  <span>Send WhatsApp</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
