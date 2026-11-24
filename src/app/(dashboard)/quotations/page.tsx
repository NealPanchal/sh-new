'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import {
  FileSpreadsheet,
  Plus,
  Search,
  Send,
  Download,
  Trash2,
  Calendar,
  Building2,
  ArrowRight,
  Eye,
  Edit,
} from 'lucide-react';
import { formatDateIndian, cn } from '@/lib/utils';
import { shareQuotationViaWhatsApp } from '@/lib/whatsapp';
import { exportQuotationToPDF } from '@/lib/pdf-quotation';
import { Quotation } from '@/types';
import { getCurrentUser } from '@/lib/auth';

export default function QuotationsPage() {
  const { quotations, deleteQuotation, profile, showToast } = useApp();
  const [search, setSearch] = useState('');
  const currentUser = useMemo(() => getCurrentUser(), []);
  const isEmp = currentUser?.role === 'employee';

  const filteredQuotations = useMemo(() => {
    let list = quotations || [];
    if (isEmp && currentUser) {
      const uName = (currentUser.name || '').toLowerCase();
      const uUser = (currentUser.username || '').toLowerCase();
      list = list.filter((q) => {
        const prep = (q.prepared_by || '').toLowerCase();
        const cr = (q.created_by || '').toLowerCase();
        return (uName && (prep.includes(uName) || cr.includes(uName))) ||
               (uUser && (prep === uUser || cr === uUser));
      });
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (item) =>
          item.quotation_number.toLowerCase().includes(q) ||
          item.customer_name.toLowerCase().includes(q) ||
          (item.site_name && item.site_name.toLowerCase().includes(q)) ||
          (item.customer_phone && item.customer_phone.includes(q))
      );
    }

    return list.sort(
      (a, b) => new Date(b.quotation_date || b.created_at || 0).getTime() - new Date(a.quotation_date || a.created_at || 0).getTime()
    );
  }, [quotations, search, isEmp, currentUser]);

  const handleDelete = (q: Quotation) => {
    if (!confirm(`Are you sure you want to delete quotation ${q.quotation_number}?`)) return;
    deleteQuotation(q.id);
    showToast(`Quotation ${q.quotation_number} deleted`, 'info');
  };

  const handleShareWhatsApp = (q: Quotation) => {
    shareQuotationViaWhatsApp({
      quotation: q,
      profile,
      onToast: showToast,
    });
  };

  const handleDownloadPDF = (q: Quotation) => {
    exportQuotationToPDF(q, profile, 'a4');
    showToast(`Downloaded Quotation ${q.quotation_number} PDF!`, 'success');
  };

  return (
    <div className="space-y-4 pb-20 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-surface-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
            <FileSpreadsheet size={20} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-surface-950 tracking-tight flex items-center gap-2">
              <span>Quotations &amp; Estimates</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-black bg-blue-100 text-blue-800">
                {filteredQuotations.length}
              </span>
            </h1>
            <p className="text-xs text-surface-500">
              Pre-challan customer quotations. Share via WhatsApp or convert to delivery challans.
            </p>
          </div>
        </div>

        <Link
          href="/quotations/new"
          className="py-2 px-3.5 text-xs font-black bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <Plus size={14} />
          <span>+ New Quotation</span>
        </Link>
      </div>

      {/* Filter / Search Bar */}
      <div className="card p-3 bg-white border border-surface-200">
        <div className="relative">
          <input
            type="text"
            className="input text-xs pl-8 pr-3 py-1.5 border-surface-300 w-full"
            placeholder="Search quotations by number, customer name, site, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
        </div>
      </div>

      {/* Quotations List */}
      {filteredQuotations.length === 0 ? (
        <div className="card p-12 text-center bg-white border border-dashed border-surface-200 space-y-3">
          <FileSpreadsheet className="w-12 h-12 mx-auto text-surface-300" />
          <div>
            <h3 className="text-sm font-bold text-surface-800">No quotations found</h3>
            <p className="text-xs text-surface-400 mt-1">
              {search
                ? 'Try a different search keyword.'
                : 'Create your first fast quotation by clicking "+ New Quotation" above.'}
            </p>
          </div>
          <Link
            href="/quotations/new"
            className="inline-flex items-center gap-1.5 py-1.5 px-3 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
          >
            <Plus size={13} />
            <span>+ Create Quotation</span>
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden bg-white border border-surface-200 shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-surface-50 border-b border-surface-200 text-surface-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Quotation No.</th>
                  <th className="py-2.5 px-2.5">Date</th>
                  <th className="py-2.5 px-3">Customer / Party</th>
                  <th className="py-2.5 px-2.5">Delivery Site</th>
                  <th className="py-2.5 px-2 text-right">Items</th>
                  <th className="py-2.5 px-3 text-right">Total Amount</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filteredQuotations.map((q) => (
                  <tr key={q.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="p-3 font-mono font-bold text-blue-700">
                      {q.quotation_number}
                    </td>
                    <td className="p-2.5 text-surface-600">
                      {formatDateIndian(q.quotation_date)}
                    </td>
                    <td className="p-3">
                      <div className="font-extrabold text-surface-900">
                        {q.customer_name}
                      </div>
                      {q.customer_phone && (
                        <div className="text-[10px] text-surface-500 font-mono">
                          📞 {q.customer_phone}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5">
                      {q.site_name ? (
                        <span className="px-1.5 py-0.5 rounded bg-orange-50 text-[#ea580c] text-[10px] font-bold border border-orange-200">
                          📍 {q.site_name}
                        </span>
                      ) : (
                        <span className="text-surface-400 italic text-[11px]">General</span>
                      )}
                    </td>
                    <td className="p-2 text-right font-medium text-surface-700">
                      {q.items?.length || 0} ({q.total_quantity} qty)
                    </td>
                    <td className="p-3 text-right font-mono font-black text-surface-950">
                      ₹{Number(q.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-center">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-bold uppercase border',
                          q.status === 'converted'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : q.status === 'approved'
                            ? 'bg-green-100 text-green-800 border-green-300'
                            : q.status === 'sent'
                            ? 'bg-blue-100 text-blue-800 border-blue-200'
                            : 'bg-amber-100 text-amber-800 border-amber-200'
                        )}
                      >
                        {q.status || 'draft'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* WhatsApp Send */}
                        <button
                          type="button"
                          onClick={() => handleShareWhatsApp(q)}
                          className="p-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                          title="Send to WhatsApp"
                        >
                          <Send size={13} />
                        </button>

                        {/* PDF Download */}
                        <button
                          type="button"
                          onClick={() => handleDownloadPDF(q)}
                          className="p-1.5 rounded-lg text-surface-700 bg-surface-100 hover:bg-surface-200 border border-surface-300 cursor-pointer"
                          title="Download PDF"
                        >
                          <Download size={13} />
                        </button>

                        {/* Convert to Challan */}
                        <Link
                          href={`/challans/new?customerId=${encodeURIComponent(q.customer_id)}&quotationId=${encodeURIComponent(q.id)}`}
                          className="p-1.5 rounded-lg text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 cursor-pointer inline-flex items-center gap-1 font-bold text-[10px]"
                          title="Convert to Delivery Challan"
                        >
                          <ArrowRight size={12} />
                          <span>Challan</span>
                        </Link>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleDelete(q)}
                          className="p-1.5 rounded-lg text-surface-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Delete Quotation"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
