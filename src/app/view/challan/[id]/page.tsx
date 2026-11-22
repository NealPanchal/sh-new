'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Download,
  Printer,
  FileText,
  Receipt,
  Phone,
  MapPin,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { Challan, BusinessProfile } from '@/types';
import { formatDateIndian, formatPhone, formatINR } from '@/lib/utils';
import { downloadChallanPDF, printChallanPDF } from '@/lib/pdf';
import { DeliveryMemoBill } from '@/components/challans/delivery-memo-bill';
import { OfficialChallanDocument } from '@/components/challan/official-challan-document';

export default function PublicChallanViewPage() {
  const params = useParams();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [challan, setChallan] = useState<Challan | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'challan' | 'bill'>('challan');

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    fetch(`/api/public/challan?id=${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Challan not found or link has expired');
        }
        return res.json();
      })
      .then((data) => {
        if (data.success && data.challan) {
          setChallan(data.challan);
          if (data.profile) setProfile(data.profile);
        } else {
          setError(data.error || 'Unable to load challan');
        }
      })
      .catch((err) => {
        setError(err.message || 'Unable to load document');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  const handleDownload = () => {
    if (!challan) return;
    const defaultProfile: BusinessProfile = profile || ({
      id: 'sh_default',
      user_id: 'admin',
      business_name: 'SHOWHOUSE',
      tagline: 'Decor Studio',
      legal_name: 'Showhouse Concepts & Designs LLP',
      logo_url: '/logo-emblem.png',
      address: 'Vishram Baug, Near Makhmali Talao, LBS Marg, Thane (W) - 400602',
      phone: '+91 93248 69306',
      email: 'foxshowhouse@gmail.com',
      gstin: '27ACMF53838C1ZY',
      challan_prefix: 'SH/',
      financial_year_start_month: 4,
      default_unit: 'sheets',
      footer_message: 'Thank you for choosing Showhouse Decor Studio!',
      employees: ['Neal', 'Vrushank'],
      show_rate_column: true,
      show_amount_column: true,
      show_signature_area: true,
      show_prepared_by: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as BusinessProfile);

    downloadChallanPDF({
      challan,
      items: challan.items || [],
      profile: defaultProfile,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-3 border-primary-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-semibold text-surface-600">Loading Showhouse Delivery Document...</p>
      </div>
    );
  }

  if (error || !challan) {
    return (
      <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-6 sm:p-8 border border-surface-200 shadow-xl text-center space-y-3">
          <AlertCircle size={40} className="mx-auto text-amber-500" />
          <h1 className="text-lg font-bold text-surface-900">Document Unavailable</h1>
          <p className="text-xs text-surface-500">
            {error || 'This delivery challan or memo bill could not be found. Please check with Showhouse Decor Studio.'}
          </p>
          <div className="pt-2">
            <a
              href="tel:+919324869306"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-800 text-xs font-semibold"
            >
              <Phone size={13} />
              <span>Contact Showhouse (+91 93248 69306)</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  const items = challan.items || [];
  const itemsSubtotal = items.reduce(
    (sum, it) => sum + (Number(it.amount) || ((Number(it.rate) || 0) * (Number(it.quantity) || 0))),
    0
  );
  const transport = Number(challan.transportation_charges) || 0;
  const loadingCharges = Number(challan.loading_charges) || 0;
  const taxableSubtotal = challan.subtotal_amount || (itemsSubtotal + transport + loadingCharges);
  const cgst = challan.cgst_amount || 0;
  const sgst = challan.sgst_amount || 0;
  const addl9 = challan.additional_9_amount || 0;
  const totalAmount = challan.total_amount || (taxableSubtotal + cgst + sgst + addl9);

  return (
    <div className="min-h-screen bg-surface-100 py-6 sm:py-10 px-3 sm:px-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Top Floating Action Bar */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-surface-200 shadow-md flex items-center justify-between gap-3 sticky top-3 z-30 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white border border-[#b8860b]/40 p-1 flex items-center justify-center shrink-0 shadow-2xs">
              <img src="/logo-emblem.png" alt="Showhouse" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm text-primary-700">
                  {challan.challan_number}
                </span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Verified Delivery
                </span>
              </div>
              <p className="text-[11px] text-surface-500">
                Customer: <b>{challan.customer_name}</b>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 sm:px-3 sm:py-2 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Print Document"
            >
              <Printer size={15} />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              onClick={handleDownload}
              className="px-3.5 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Download size={15} />
              <span>Download PDF</span>
            </button>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={() => setViewMode('challan')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'challan'
                ? 'bg-surface-900 text-white shadow-xs'
                : 'bg-white text-surface-700 border border-surface-200 hover:bg-surface-50'
            }`}
          >
            <FileText size={14} />
            <span>Delivery Challan (A4 Format)</span>
          </button>
          <button
            onClick={() => setViewMode('bill')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'bill'
                ? 'bg-[#b8860b] text-white shadow-xs'
                : 'bg-[#b8860b]/10 text-[#b8860b] border border-[#b8860b]/30 hover:bg-[#b8860b]/20'
            }`}
          >
            <Receipt size={14} />
            <span>After-Delivery Bill Memo</span>
          </button>
        </div>

        {/* Document Container */}
        {viewMode === 'bill' ? (
          <div className="printable-delivery-bill">
            <DeliveryMemoBill challan={challan} profile={profile || null} />
          </div>
        ) : (
          <OfficialChallanDocument
            challan={challan}
            profile={profile}
            viewMode="challan"
          />
        )}
      </div>
    </div>
  );
}
