'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import { Challan } from '@/types';
import { DeliveryMemoBill } from '@/components/challans/delivery-memo-bill';
import { openWhatsApp } from '@/lib/whatsapp';
import { printChallanPDF, downloadChallanPDF } from '@/lib/pdf';
import {
  ArrowLeft,
  Printer,
  Download,
  Send,
  FileText,
  Edit2,
  Check,
} from 'lucide-react';

export default function ChallanBillPage() {
  const params = useParams();
  const router = useRouter();
  const { getChallan, profile, showToast, dataVersion, challans: liveChallans } = useApp();

  const challanId = params.id as string;
  const [challan, setChallan] = useState<Challan | null>(null);
  const [memoNo, setMemoNo] = useState('');
  const [confirmBy, setConfirmBy] = useState('');
  const [isEditingMeta, setIsEditingMeta] = useState(false);

  useEffect(() => {
    if (challanId) {
      const found = getChallan(challanId);
      if (found) {
        setChallan(found);
        setMemoNo(
          found.reference_number ||
            found.challan_number.split('/').pop() ||
            '0120'
        );
        setConfirmBy(found.notes || 'Confirm By Rushank');
      } else {
        setChallan(null);
      }
    }
  }, [challanId, getChallan, dataVersion, liveChallans]);

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

  const handleWhatsApp = () => {
    if (!profile || !challan.customer_phone) {
      showToast('No customer phone recorded', 'error');
      return;
    }

    const businessName = profile.business_name || 'Showhouse';
    const itemsList = (challan.items || [])
      .map(
        (it, idx) =>
          `${idx + 1}. ${it.item_description} - ${it.quantity} ${it.unit} @ ₹${
            it.rate || '—'
          } = ₹${it.amount ? Number(it.amount).toLocaleString('en-IN') : '—'}`
      )
      .join('\n');

    const totalAmt =
      challan.total_amount ||
      (challan.items || []).reduce(
        (sum, it) => sum + (Number(it.amount) || ((Number(it.rate) || 0) * (Number(it.quantity) || 0))),
        0
      );

    const message =
      `Hello ${challan.customer_name},\n\n` +
      `Here is your *${businessName} Decor Studio Delivery Bill / Memo*.\n\n` +
      `*Memo No:* ${memoNo}\n` +
      `*Date:* ${challan.challan_date}\n\n` +
      `*Particulars:*\n${itemsList}\n\n` +
      `*GRAND TOTAL:* ₹${totalAmt.toLocaleString('en-IN')}\n\n` +
      `*Note:* ${confirmBy}\n\n` +
      `Thank you for your business!\n` +
      `— ${businessName} Decor Studio\n` +
      `Thane (W) | +91 93248 69306`;

    openWhatsApp(challan.customer_phone, message);
    showToast(`Opening WhatsApp for ${challan.customer_name}`);
  };

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
                placeholder="e.g. Confirm By Rushank"
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
    </div>
  );
}
