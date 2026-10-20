'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  Printer,
  Send,
  Download,
  Copy,
  X,
  Clock,
  CheckCircle2,
  Ban,
  ArrowRight,
} from 'lucide-react';
import { formatDateIndian, formatINR, cn } from '@/lib/utils';
import { Challan, ChallanStatus, ShareStatus } from '@/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { downloadChallanPDF, printChallanPDF } from '@/lib/pdf';
import { openWhatsApp, generateShareMessage } from '@/lib/whatsapp';

function StatusBadge({ status }: { status: ChallanStatus }) {
  const badgeClasses: Record<ChallanStatus, string> = {
    final: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    draft: 'bg-amber-50 text-amber-700 border-amber-200',
    cancelled: 'bg-red-50 text-red-700 border-red-200',
    void: 'bg-surface-100 text-surface-500 border-surface-200',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border',
        badgeClasses[status] || 'bg-surface-100 text-surface-600 border-surface-200'
      )}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function ChallansPage() {
  const router = useRouter();
  const {
    getChallans,
    profile,
    showToast,
    updateChallanStatus,
    updateShareStatus,
    duplicateChallan,
    isLoading,
  } = useApp();

  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [cancelModalChallan, setCancelModalChallan] = useState<Challan | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const challans = useMemo(() => {
    if (!mounted || isLoading) return [];
    return getChallans({
      search: search || undefined,
      status: statusFilter !== 'all' ? (statusFilter as ChallanStatus) : undefined,
    });
  }, [mounted, isLoading, getChallans, search, statusFilter]);

  // Statistics
  const counts = useMemo(() => {
    if (!mounted || isLoading) return { all: 0, final: 0, draft: 0, cancelled: 0 };
    const all = getChallans();
    return {
      all: all.length,
      final: all.filter((c) => c.status === 'final').length,
      draft: all.filter((c) => c.status === 'draft').length,
      cancelled: all.filter((c) => c.status === 'cancelled').length,
    };
  }, [mounted, isLoading, getChallans]);

  const handlePrint = (challan: Challan, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!profile) return;
    printChallanPDF({
      challan,
      items: challan.items || [],
      profile,
    });
    showToast(`Print opened for ${challan.challan_number}`);
  };

  const handleDownload = (challan: Challan, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!profile) return;
    downloadChallanPDF({
      challan,
      items: challan.items || [],
      profile,
    });
    showToast(`PDF downloaded for ${challan.challan_number}`);
  };

  const handleWhatsApp = (challan: Challan, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!profile) return;
    if (!challan.customer_phone) {
      showToast('Customer phone number not available', 'error');
      return;
    }
    const msg = generateShareMessage(challan, profile);
    openWhatsApp(challan.customer_phone, msg);
    updateShareStatus(challan.id, 'share_initiated');
    showToast(`Opening WhatsApp for ${challan.customer_name}`);
  };

  const handleDuplicate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const dup = duplicateChallan(id);
    if (dup) {
      showToast(`Duplicated: ${dup.challan_number}`);
      router.push(`/challans/${dup.id}`);
    }
  };

  const confirmCancel = () => {
    if (!cancelModalChallan) return;
    updateChallanStatus(cancelModalChallan.id, 'cancelled');
    showToast(`Challan ${cancelModalChallan.challan_number} marked as cancelled`);
    setCancelModalChallan(null);
  };

  if (!mounted || isLoading) {
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
          <h1 className="text-xl sm:text-2xl font-bold text-surface-900 tracking-tight">
            Delivery Challans
          </h1>
          <p className="text-xs text-surface-500 mt-0.5">
            Search, reprint, edit, or share customer challans
          </p>
        </div>

        <Link
          href="/challans/new"
          className="btn-primary py-2 px-3.5 text-xs font-semibold shadow-xs flex items-center gap-1.5"
        >
          <Plus size={16} />
          <span>New Challan</span>
        </Link>
      </div>

      {/* Search Bar & Status Tabs */}
      <div className="card p-2.5 sm:p-3 space-y-2.5">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search by challan #, customer name, phone, item..."
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

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'final', label: 'Final', count: counts.final },
            { id: 'draft', label: 'Drafts', count: counts.draft },
            { id: 'cancelled', label: 'Cancelled', count: counts.cancelled },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5',
                statusFilter === tab.id
                  ? 'bg-primary-500 text-white font-semibold'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  'text-[10px] px-1.5 py-0.2 rounded-full font-mono',
                  statusFilter === tab.id ? 'bg-primary-600 text-white' : 'bg-surface-200 text-surface-700'
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Challans List */}
      {challans.length === 0 ? (
        <div className="card p-8 sm:p-12 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-surface-100 flex items-center justify-center text-surface-400">
            <FileText size={24} />
          </div>
          <h3 className="text-base font-bold text-surface-800 mb-1">No challans found</h3>
          <p className="text-xs text-surface-500 max-w-xs mx-auto mb-4">
            {search || statusFilter !== 'all'
              ? 'Try clearing the search or changing status filter.'
              : 'Create your first delivery challan to get started.'}
          </p>
          {search || statusFilter !== 'all' ? (
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
              }}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Reset Filters
            </button>
          ) : (
            <Link href="/challans/new" className="btn-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5">
              <Plus size={15} />
              <span>Create Challan</span>
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Mobile Card List (Ultra-Responsive & Zero Horizontal Overflow) */}
          <div className="md:hidden space-y-2.5">
            {challans.map((challan) => (
              <div
                key={challan.id}
                onClick={() => router.push(`/challans/${challan.id}`)}
                className="card p-3 active:scale-[0.99] transition-transform shadow-xs hover:border-surface-300"
              >
                {/* Header row: Number, Date, Status */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-primary-600 text-sm">
                      {challan.challan_number}
                    </span>
                    <span className="text-[11px] text-surface-400">
                      • {formatDateIndian(challan.challan_date)}
                    </span>
                  </div>
                  <StatusBadge status={challan.status} />
                </div>

                {/* Customer name & Item snippet */}
                <div className="py-1.5 border-y border-surface-100">
                  <div className="font-semibold text-xs text-surface-900 truncate">
                    {challan.customer_name}
                  </div>
                  <div className="text-[11px] text-surface-500 truncate mt-0.5">
                    {challan.items && challan.items[0]?.item_description ? (
                      <span>
                        {challan.items[0].item_description}
                        {challan.items.length > 1 && ` (+${challan.items.length - 1} more)`}
                      </span>
                    ) : (
                      'No items specified'
                    )}
                  </div>
                </div>

                {/* Footer row: Total Quantity, Total Amount & 1-Tap Action Icons */}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-surface-800">
                      {challan.total_quantity}{' '}
                      <span className="font-normal text-[11px] text-surface-400">
                        {challan.items?.[0]?.unit || 'sheets'}
                      </span>
                    </span>
                    {challan.total_amount && challan.total_amount > 0 ? (
                      <span className="font-mono text-primary-700 bg-primary-50 border border-primary-200 px-1.5 py-0.5 rounded text-[11px] font-bold">
                        ₹{challan.total_amount.toLocaleString('en-IN')}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => handlePrint(challan, e)}
                      className="p-1.5 bg-surface-100 text-surface-700 rounded-md hover:bg-surface-200"
                      title="Print / PDF"
                    >
                      <Printer size={15} />
                    </button>
                    {challan.customer_phone && (
                      <button
                        onClick={(e) => handleWhatsApp(challan, e)}
                        className="p-1.5 bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100"
                        title="WhatsApp Share"
                      >
                        <Send size={15} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/challans/${challan.id}/edit`);
                      }}
                      className="p-1.5 bg-surface-100 text-surface-700 rounded-md hover:bg-surface-200"
                      title="Edit"
                    >
                      <Edit size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="card hidden md:block overflow-hidden shadow-xs">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Challan No.</th>
                    <th>Date</th>
                    <th>Customer Name</th>
                    <th>Items</th>
                    <th className="text-right">Total Qty</th>
                    <th className="text-right">Total Amount</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {challans.map((challan) => (
                    <tr
                      key={challan.id}
                      onClick={() => router.push(`/challans/${challan.id}`)}
                      className="cursor-pointer hover:bg-surface-50 transition-colors"
                    >
                      <td className="font-mono font-bold text-primary-600 text-xs">
                        {challan.challan_number}
                      </td>
                      <td className="whitespace-nowrap text-xs text-surface-600">
                        {formatDateIndian(challan.challan_date)}
                      </td>
                      <td className="text-xs">
                        <div className="font-semibold text-surface-900">{challan.customer_name}</div>
                        {challan.customer_phone && (
                          <div className="text-[11px] text-surface-400">{challan.customer_phone}</div>
                        )}
                      </td>
                      <td className="max-w-xs truncate text-xs text-surface-600">
                        {challan.items?.[0]?.item_description || '—'}
                        {challan.items && challan.items.length > 1 && (
                          <span className="text-[10px] text-surface-400 ml-1">
                            (+{challan.items.length - 1})
                          </span>
                        )}
                      </td>
                      <td className="text-right font-bold text-xs text-surface-900 whitespace-nowrap">
                        {challan.total_quantity}{' '}
                        <span className="font-normal text-[10px] text-surface-400">
                          {challan.items?.[0]?.unit || 'sheets'}
                        </span>
                      </td>
                      <td className="text-right font-mono font-bold text-xs text-surface-900 whitespace-nowrap">
                        {challan.total_amount && challan.total_amount > 0
                          ? `₹${challan.total_amount.toLocaleString('en-IN')}`
                          : '—'}
                      </td>
                      <td>
                        <StatusBadge status={challan.status} />
                      </td>
                      <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            title="View Challan"
                            onClick={() => router.push(`/challans/${challan.id}`)}
                            className="p-1.5 text-surface-500 hover:text-primary-600 hover:bg-surface-100 rounded-md transition-colors"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            title="Print Challan"
                            onClick={(e) => handlePrint(challan, e)}
                            className="p-1.5 text-surface-500 hover:text-primary-600 hover:bg-surface-100 rounded-md transition-colors"
                          >
                            <Printer size={15} />
                          </button>
                          <button
                            title="Download PDF"
                            onClick={(e) => handleDownload(challan, e)}
                            className="p-1.5 text-surface-500 hover:text-primary-600 hover:bg-surface-100 rounded-md transition-colors"
                          >
                            <Download size={15} />
                          </button>
                          {challan.customer_phone && (
                            <button
                              title="Share WhatsApp"
                              onClick={(e) => handleWhatsApp(challan, e)}
                              className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                            >
                              <Send size={15} />
                            </button>
                          )}
                          <button
                            title="Edit"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/challans/${challan.id}/edit`);
                            }}
                            className="p-1.5 text-surface-500 hover:text-surface-800 hover:bg-surface-100 rounded-md transition-colors"
                          >
                            <Edit size={15} />
                          </button>
                          <button
                            title="Duplicate"
                            onClick={(e) => handleDuplicate(challan.id, e)}
                            className="p-1.5 text-surface-400 hover:text-surface-700 hover:bg-surface-100 rounded-md transition-colors"
                          >
                            <Copy size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Results Count */}
          <div className="flex items-center justify-between text-[11px] text-surface-400 px-1">
            <span>Showing {challans.length} {challans.length === 1 ? 'challan' : 'challans'}</span>
            <span>Showhouse Challan System</span>
          </div>
        </>
      )}

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!cancelModalChallan}
        title="Cancel Challan?"
        message={`Are you sure you want to cancel challan ${cancelModalChallan?.challan_number}?`}
        variant="danger"
        confirmLabel="Yes, Cancel"
        onConfirm={confirmCancel}
        onCancel={() => setCancelModalChallan(null)}
      />
    </div>
  );
}
