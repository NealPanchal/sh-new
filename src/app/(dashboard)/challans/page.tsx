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
  Receipt,
  Building2,
  UserCheck,
  ChevronDown,
  ChevronRight,
  LayoutList,
  Layers,
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
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [creatorFilter, setCreatorFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'company' | 'creator'>('list');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [cancelModalChallan, setCancelModalChallan] = useState<Challan | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const allChallans = useMemo(() => {
    if (!mounted || isLoading) return [];
    return getChallans();
  }, [mounted, isLoading, getChallans]);

  const uniqueCompanies = useMemo(() => {
    const names = Array.from(new Set(allChallans.map((c) => c.customer_name).filter(Boolean)));
    return names.sort();
  }, [allChallans]);

  const uniqueCreators = useMemo(() => {
    const names = Array.from(
      new Set(
        allChallans.map((c) => c.created_by || c.prepared_by || 'Rushank').filter(Boolean)
      )
    );
    return names.sort();
  }, [allChallans]);

  const challans = useMemo(() => {
    if (!mounted || isLoading) return [];
    let list = getChallans({
      search: search || undefined,
      status: statusFilter !== 'all' ? (statusFilter as ChallanStatus) : undefined,
    });
    if (companyFilter !== 'all') {
      list = list.filter((c) => c.customer_name.toLowerCase() === companyFilter.toLowerCase());
    }
    if (creatorFilter !== 'all') {
      list = list.filter((c) => {
        const creator = (c.created_by || c.prepared_by || 'Rushank').toLowerCase();
        return creator === creatorFilter.toLowerCase();
      });
    }
    return list;
  }, [mounted, isLoading, getChallans, search, statusFilter, companyFilter, creatorFilter]);

  // Grouped by Company
  const groupedByCompany = useMemo(() => {
    const map = new Map<string, { company: string; items: Challan[]; totalQty: number; totalAmount: number }>();
    challans.forEach((c) => {
      const comp = c.customer_name || 'Unknown Company';
      if (!map.has(comp)) {
        map.set(comp, { company: comp, items: [], totalQty: 0, totalAmount: 0 });
      }
      const group = map.get(comp)!;
      group.items.push(c);
      group.totalQty += c.total_quantity || 0;
      group.totalAmount += c.total_amount || 0;
    });
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [challans]);

  // Grouped by Creator / Billed By
  const groupedByCreator = useMemo(() => {
    const map = new Map<string, { creator: string; items: Challan[]; totalQty: number; totalAmount: number }>();
    challans.forEach((c) => {
      const creator = c.created_by || c.prepared_by || 'Rushank';
      if (!map.has(creator)) {
        map.set(creator, { creator, items: [], totalQty: 0, totalAmount: 0 });
      }
      const group = map.get(creator)!;
      group.items.push(c);
      group.totalQty += c.total_quantity || 0;
      group.totalAmount += c.total_amount || 0;
    });
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [challans]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Statistics
  const counts = useMemo(() => {
    if (!mounted || isLoading) return { all: 0, final: 0, draft: 0, cancelled: 0 };
    return {
      all: allChallans.length,
      final: allChallans.filter((c) => c.status === 'final').length,
      draft: allChallans.filter((c) => c.status === 'draft').length,
      cancelled: allChallans.filter((c) => c.status === 'cancelled').length,
    };
  }, [mounted, isLoading, allChallans]);

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

      {/* Search Bar, Segregation Filters & View Mode Tabs */}
      <div className="card p-2.5 sm:p-3 space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search by challan #, customer / company, phone, item, creator..."
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

        {/* Segregation Filters (Company + Creator Dropdowns) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-surface-100">
          {/* Company / Customer Segregation Filter */}
          <div className="flex items-center gap-1.5">
            <Building2 size={15} className="text-[#b8860b] shrink-0" />
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="input text-xs py-1.5 flex-1 bg-surface-50/60 font-medium"
            >
              <option value="all">🏢 All Companies / Clients ({uniqueCompanies.length})</option>
              {uniqueCompanies.map((comp) => {
                const count = allChallans.filter(
                  (c) => c.customer_name.toLowerCase() === comp.toLowerCase()
                ).length;
                return (
                  <option key={comp} value={comp}>
                    {comp} ({count} challans)
                  </option>
                );
              })}
            </select>
          </div>

          {/* Created By / Staff Segregation Filter */}
          <div className="flex items-center gap-1.5">
            <UserCheck size={15} className="text-primary-600 shrink-0" />
            <select
              value={creatorFilter}
              onChange={(e) => setCreatorFilter(e.target.value)}
              className="input text-xs py-1.5 flex-1 bg-surface-50/60 font-medium"
            >
              <option value="all">👤 All Creators / Billed By ({uniqueCreators.length})</option>
              {uniqueCreators.map((creator) => {
                const count = allChallans.filter(
                  (c) => (c.created_by || c.prepared_by || 'Rushank').toLowerCase() === creator.toLowerCase()
                ).length;
                return (
                  <option key={creator} value={creator}>
                    Billed by {creator} ({count} challans)
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* View Mode Switcher & Status Filter Pills */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1 border-t border-surface-100">
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
                  'px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5',
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

          {/* View Mode Segregation Buttons */}
          <div className="flex items-center gap-1 p-0.5 bg-surface-100 rounded-lg self-start sm:self-auto shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors',
                viewMode === 'list'
                  ? 'bg-white text-surface-900 shadow-2xs'
                  : 'text-surface-600 hover:text-surface-900'
              )}
            >
              <LayoutList size={13} />
              <span>List</span>
            </button>
            <button
              onClick={() => setViewMode('company')}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors',
                viewMode === 'company'
                  ? 'bg-[#b8860b] text-white shadow-2xs'
                  : 'text-surface-600 hover:text-[#b8860b]'
              )}
            >
              <Building2 size={13} />
              <span>By Company</span>
            </button>
            <button
              onClick={() => setViewMode('creator')}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors',
                viewMode === 'creator'
                  ? 'bg-primary-600 text-white shadow-2xs'
                  : 'text-surface-600 hover:text-primary-600'
              )}
            >
              <UserCheck size={13} />
              <span>By Creator</span>
            </button>
          </div>
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
      ) : viewMode === 'company' ? (
        /* ============================================================ */
        /* SEGREGATION VIEW: BY COMPANY / CLIENT                        */
        /* ============================================================ */
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-surface-600">
            <span className="font-bold flex items-center gap-1.5 text-[#b8860b]">
              <Building2 size={15} />
              <span>Company-wise Segregation ({groupedByCompany.length} Companies)</span>
            </span>
            <span>Total: {challans.length} Challans</span>
          </div>

          {groupedByCompany.map((group) => {
            const isCollapsed = Boolean(collapsedGroups[group.company]);
            return (
              <div
                key={group.company}
                className="card overflow-hidden border border-surface-200 shadow-2xs"
              >
                {/* Company Header Banner */}
                <div
                  onClick={() => toggleGroup(group.company)}
                  className="p-3 bg-surface-100/70 hover:bg-surface-100 transition-colors flex items-center justify-between cursor-pointer border-b border-surface-200"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#b8860b]/15 text-[#b8860b] flex items-center justify-center font-bold text-sm shrink-0">
                      🏢
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold text-sm text-surface-900 truncate">
                          {group.company}
                        </h2>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-white text-surface-700 border border-surface-200">
                          {group.items.length} {group.items.length === 1 ? 'challan' : 'challans'}
                        </span>
                      </div>
                      <span className="text-[11px] text-surface-500 block mt-0.5">
                        Total Quantity: <b>{group.totalQty}</b> sheets
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {group.totalAmount > 0 && (
                      <div className="text-right">
                        <span className="text-[9px] uppercase tracking-wider text-surface-400 block">
                          Company Total
                        </span>
                        <span className="font-mono font-bold text-sm text-surface-900">
                          ₹{group.totalAmount.toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                    <div className="p-1 text-surface-400">
                      {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </div>

                {/* Company Challans */}
                {!isCollapsed && (
                  <div className="p-2 sm:p-3 space-y-2 bg-white">
                    {group.items.map((challan) => (
                      <div
                        key={challan.id}
                        onClick={() => router.push(`/challans/${challan.id}`)}
                        className="p-2.5 rounded-lg border border-surface-100 hover:border-surface-300 hover:bg-surface-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer text-xs"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-primary-600">
                            {challan.challan_number}
                          </span>
                          <span className="text-surface-400">•</span>
                          <span className="text-surface-600">
                            {formatDateIndian(challan.challan_date)}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-100 text-surface-700 border border-surface-200 font-semibold">
                            By {challan.created_by || challan.prepared_by || 'Rushank'}
                          </span>
                          <StatusBadge status={challan.status} />
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          <span className="text-surface-600 font-medium">
                            {challan.total_quantity} {challan.items?.[0]?.unit || 'sheets'}
                          </span>
                          {challan.total_amount && challan.total_amount > 0 ? (
                            <span className="font-mono font-bold text-surface-900 bg-surface-50 border border-surface-200 px-1.5 py-0.5 rounded text-xs">
                              ₹{challan.total_amount.toLocaleString('en-IN')}
                            </span>
                          ) : null}
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => router.push(`/challans/${challan.id}/bill`)}
                              className="p-1 text-[#b8860b] hover:bg-[#b8860b]/10 rounded"
                              title="View Memo Bill Slip"
                            >
                              <Receipt size={14} />
                            </button>
                            <button
                              onClick={(e) => handlePrint(challan, e)}
                              className="p-1 text-surface-500 hover:bg-surface-100 rounded"
                              title="Print"
                            >
                              <Printer size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : viewMode === 'creator' ? (
        /* ============================================================ */
        /* SEGREGATION VIEW: BY CREATOR / STAFF (BILLED BY)             */
        /* ============================================================ */
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-surface-600">
            <span className="font-bold flex items-center gap-1.5 text-primary-600">
              <UserCheck size={15} />
              <span>Created-By / Staff Segregation ({groupedByCreator.length} Users)</span>
            </span>
            <span>Total: {challans.length} Challans</span>
          </div>

          {groupedByCreator.map((group) => {
            const isCollapsed = Boolean(collapsedGroups[group.creator]);
            return (
              <div
                key={group.creator}
                className="card overflow-hidden border border-surface-200 shadow-2xs"
              >
                {/* Creator Header Banner */}
                <div
                  onClick={() => toggleGroup(group.creator)}
                  className="p-3 bg-surface-100/70 hover:bg-surface-100 transition-colors flex items-center justify-between cursor-pointer border-b border-surface-200"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm shrink-0">
                      👤
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold text-sm text-surface-900 truncate">
                          Billed by: {group.creator}
                        </h2>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-white text-surface-700 border border-surface-200">
                          {group.items.length} {group.items.length === 1 ? 'challan' : 'challans'}
                        </span>
                      </div>
                      <span className="text-[11px] text-surface-500 block mt-0.5">
                        Total Quantity: <b>{group.totalQty}</b> sheets
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {group.totalAmount > 0 && (
                      <div className="text-right">
                        <span className="text-[9px] uppercase tracking-wider text-surface-400 block">
                          Total Billed
                        </span>
                        <span className="font-mono font-bold text-sm text-primary-700">
                          ₹{group.totalAmount.toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                    <div className="p-1 text-surface-400">
                      {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </div>

                {/* Creator Challans */}
                {!isCollapsed && (
                  <div className="p-2 sm:p-3 space-y-2 bg-white">
                    {group.items.map((challan) => (
                      <div
                        key={challan.id}
                        onClick={() => router.push(`/challans/${challan.id}`)}
                        className="p-2.5 rounded-lg border border-surface-100 hover:border-surface-300 hover:bg-surface-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer text-xs"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-primary-600">
                            {challan.challan_number}
                          </span>
                          <span className="text-surface-400">•</span>
                          <span className="font-semibold text-surface-900">
                            {challan.customer_name}
                          </span>
                          <span className="text-surface-400">•</span>
                          <span className="text-surface-500">
                            {formatDateIndian(challan.challan_date)}
                          </span>
                          <StatusBadge status={challan.status} />
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          <span className="text-surface-600 font-medium">
                            {challan.total_quantity} {challan.items?.[0]?.unit || 'sheets'}
                          </span>
                          {challan.total_amount && challan.total_amount > 0 ? (
                            <span className="font-mono font-bold text-surface-900 bg-surface-50 border border-surface-200 px-1.5 py-0.5 rounded text-xs">
                              ₹{challan.total_amount.toLocaleString('en-IN')}
                            </span>
                          ) : null}
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => router.push(`/challans/${challan.id}/bill`)}
                              className="p-1 text-[#b8860b] hover:bg-[#b8860b]/10 rounded"
                              title="View Memo Bill Slip"
                            >
                              <Receipt size={14} />
                            </button>
                            <button
                              onClick={(e) => handlePrint(challan, e)}
                              className="p-1 text-surface-500 hover:bg-surface-100 rounded"
                              title="Print"
                            >
                              <Printer size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
                      <span className="font-mono text-primary-700 bg-primary-50 border border-primary-200 px-1.5 py-0.5 rounded text-[11px] font-bold flex items-center gap-1">
                        {challan.apply_gst && (
                          <span className="text-[9px] uppercase font-bold text-emerald-700 bg-emerald-100/70 px-1 rounded">
                            GST
                          </span>
                        )}
                        ₹{challan.total_amount.toLocaleString('en-IN')}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/challans/${challan.id}/bill`);
                      }}
                      className="p-1.5 bg-[#b8860b]/10 text-[#b8860b] rounded-md hover:bg-[#b8860b]/20"
                      title="View After-Delivery Bill Slip"
                    >
                      <Receipt size={15} />
                    </button>
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
                        {challan.total_amount && challan.total_amount > 0 ? (
                          <div className="flex items-center justify-end gap-1.5">
                            {challan.apply_gst && (
                              <span className="text-[9px] uppercase font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded font-sans">
                                +18% GST
                              </span>
                            )}
                            <span>₹{challan.total_amount.toLocaleString('en-IN')}</span>
                          </div>
                        ) : (
                          '—'
                        )}
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
                            title="View After-Delivery Bill Slip"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/challans/${challan.id}/bill`);
                            }}
                            className="p-1.5 text-[#b8860b] hover:bg-[#b8860b]/10 rounded-md transition-colors"
                          >
                            <Receipt size={15} />
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
