'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import { Challan, ChallanItem } from '@/types';
import { formatDateIndian, formatPhone, cn } from '@/lib/utils';
import { openWhatsApp } from '@/lib/whatsapp';
import {
  Receipt,
  Search,
  Plus,
  Send,
  Eye,
  X,
  FileText,
  Building2,
  UserCheck,
  LayoutList,
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export default function DeliveryBillsPage() {
  const router = useRouter();
  const { getChallans, profile, deleteChallan, showToast, isLoading } = useApp();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [creatorFilter, setCreatorFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'company' | 'creator'>('list');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [deleteModalChallan, setDeleteModalChallan] = useState<Challan | null>(null);

  const confirmDelete = () => {
    if (!deleteModalChallan) return;
    const num = deleteModalChallan.reference_number || deleteModalChallan.challan_number;
    deleteChallan(deleteModalChallan.id);
    showToast(`Bill / Challan ${num} permanently deleted`, 'success');
    setDeleteModalChallan(null);
  };

  React.useEffect(() => {
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

  const filteredBills = useMemo(() => {
    if (!mounted || isLoading) return [];
    let list = getChallans({
      search: search.trim() || undefined,
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
  }, [mounted, isLoading, getChallans, search, companyFilter, creatorFilter]);

  // Grouped by Company
  const groupedByCompany = useMemo(() => {
    const map = new Map<string, { company: string; items: Challan[]; totalQty: number; totalAmount: number }>();
    filteredBills.forEach((c) => {
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
  }, [filteredBills]);

  // Grouped by Creator / Billed By
  const groupedByCreator = useMemo(() => {
    const map = new Map<string, { creator: string; items: Challan[]; totalQty: number; totalAmount: number }>();
    filteredBills.forEach((c) => {
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
  }, [filteredBills]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleWhatsApp = (c: Challan, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!profile || !c.customer_phone) {
      showToast('No customer phone recorded', 'error');
      return;
    }

    const memoNo =
      c.reference_number || c.challan_number.split('/').pop() || '0120';
    const businessName = profile.business_name || 'Showhouse';
    const totalAmt =
      c.total_amount ||
      (c.items || []).reduce(
        (sum: number, it: ChallanItem) =>
          sum + (Number(it.amount) || ((Number(it.rate) || 0) * (Number(it.quantity) || 0))),
        0
      );

    const message =
      `Hello ${c.customer_name},\n\n` +
      `Here is your *${businessName} Decor Studio Delivery Bill / Memo*.\n\n` +
      `*Memo No:* ${memoNo}\n` +
      `*Date:* ${c.challan_date}\n` +
      `*Total Amount:* ₹${totalAmt.toLocaleString('en-IN')}\n\n` +
      `Thank you for choosing Showhouse Decor Studio!\n` +
      `— Thane (W) | +91 93248 69306`;

    openWhatsApp(c.customer_phone, message);
    showToast(`Opening WhatsApp for ${c.customer_name}`);
  };

  const renderBillCard = (c: Challan) => {
    const memoNo = c.reference_number || c.challan_number.split('/').pop() || '0120';
    const itemsSub = (c.items || []).reduce(
      (sum: number, it: ChallanItem) =>
        sum + (Number(it.amount) || ((Number(it.rate) || 0) * (Number(it.quantity) || 0))),
      0
    );
    const transport = Number(c.transportation_charges) || 0;
    const loading = Number(c.loading_charges) || 0;
    const taxable = c.subtotal_amount || (itemsSub + transport + loading);
    const cgst = c.cgst_amount ?? (c.apply_gst && taxable > 0 ? Math.round(taxable * 0.09 * 100) / 100 : 0);
    const sgst = c.sgst_amount ?? (c.apply_gst && taxable > 0 ? Math.round(taxable * 0.09 * 100) / 100 : 0);
    const totalAmt = c.total_amount || (taxable + cgst + sgst);
    const creator = c.created_by || c.prepared_by || 'Rushank';

    return (
      <div
        key={c.id}
        onClick={() => router.push(`/challans/${c.id}/bill`)}
        className="card p-3 active:scale-[0.99] transition-transform shadow-xs hover:border-[#b8860b]/40 border border-surface-200"
      >
        {/* Header: Memo No & Date */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-black text-sm text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
              Memo #{memoNo}
            </span>
            <span className="text-[11px] text-surface-400">
              • {formatDateIndian(c.challan_date)}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-surface-100 text-surface-600 border border-surface-200">
              By {creator}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {c.apply_gst && (
              <span className="text-[9px] uppercase font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                GST 18%
              </span>
            )}
            <span className="text-[10px] uppercase font-bold text-[#b8860b] bg-[#b8860b]/10 px-2 py-0.5 rounded">
              Slip
            </span>
          </div>
        </div>

        {/* Customer & Item */}
        <div className="py-1.5 border-y border-surface-100">
          <div className="font-bold text-xs text-surface-900 truncate">
            {c.customer_name}
          </div>
          <div className="text-[11px] text-surface-500 truncate mt-0.5">
            {c.items && c.items[0]?.item_description ? (
              <span>
                {c.items[0].item_description}
                {c.items[0].rate && ` @ ₹${c.items[0].rate}`}
                {c.items.length > 1 && ` (+${c.items.length - 1} more)`}
              </span>
            ) : (
              'No items'
            )}
          </div>
        </div>

        {/* Footer: Amount & Actions */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <span className="text-[10px] text-surface-400 block uppercase">
              {c.apply_gst ? 'Grand Total (GST)' : 'Grand Total'}
            </span>
            <span className="font-mono font-extrabold text-sm text-surface-900">
              ₹{totalAmt.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {c.customer_phone && (
              <button
                onClick={(e) => handleWhatsApp(c, e)}
                className="p-1.5 bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100"
                title="WhatsApp Bill"
              >
                <Send size={15} />
              </button>
            )}
            <button
              onClick={() => router.push(`/challans/${c.id}/bill`)}
              className="btn-primary py-1.5 px-2.5 text-xs font-semibold flex items-center gap-1 bg-surface-900 hover:bg-surface-800"
            >
              <Eye size={13} />
              <span>View Slip</span>
            </button>
            <button
              onClick={() => setDeleteModalChallan(c)}
              className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-md border border-rose-200/60"
              title="Delete Bill"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
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
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-surface-900 tracking-tight">
              After-Delivery Bills & Memos
            </h1>
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#b8860b]/15 text-[#b8860b] border border-[#b8860b]/30">
              Slip Format
            </span>
          </div>
          <p className="text-xs text-surface-500 mt-0.5">
            Original Showhouse Decor Studio receipt memo pad layout
          </p>
        </div>

        <Link
          href="/challans/new"
          className="btn-primary py-2 px-3.5 text-xs font-semibold shadow-xs flex items-center gap-1.5"
        >
          <Plus size={16} />
          <span>New Bill</span>
        </Link>
      </div>

      {/* Filter and Search Card */}
      <div className="card p-2.5 sm:p-3 space-y-2.5 shadow-xs">
        {/* Search Bar */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search by Memo #, customer, item, phone..."
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

        {/* Segregation Dropdowns: Company & Creator */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-surface-100">
          {/* Company Filter Dropdown */}
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
                    {comp} ({count} bills)
                  </option>
                );
              })}
            </select>
          </div>

          {/* Creator Filter Dropdown */}
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
                    Billed by {creator} ({count} bills)
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* View Mode Segregation Switcher */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-surface-100">
          <span className="text-xs text-surface-500 font-medium">
            Showing <strong className="text-surface-800">{filteredBills.length}</strong> delivery slips
          </span>

          <div className="flex items-center gap-1 p-0.5 bg-surface-100 rounded-lg shrink-0">
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

      {/* Bills Content */}
      {filteredBills.length === 0 ? (
        <div className="card p-8 sm:p-12 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-surface-100 flex items-center justify-center text-surface-400">
            <Receipt size={24} />
          </div>
          <h3 className="text-base font-bold text-surface-800 mb-1">No Delivery Bills found</h3>
          <p className="text-xs text-surface-500 max-w-xs mx-auto mb-4">
            {search || companyFilter !== 'all' || creatorFilter !== 'all'
              ? 'Try resetting the filters or search query.'
              : 'Create a challan to generate its matching after-delivery paper memo slip.'}
          </p>
          {search || companyFilter !== 'all' || creatorFilter !== 'all' ? (
            <button
              onClick={() => {
                setSearch('');
                setCompanyFilter('all');
                setCreatorFilter('all');
              }}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Reset Filters
            </button>
          ) : (
            <Link href="/challans/new" className="btn-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5">
              <Plus size={15} />
              <span>Create New Challan</span>
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
              <span>Company-wise Delivery Slips ({groupedByCompany.length} Companies)</span>
            </span>
            <span>Total: {filteredBills.length} Bills</span>
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
                      {group.company.charAt(0).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <div className="font-bold text-xs sm:text-sm text-surface-900 truncate">
                        {group.company}
                      </div>
                      <div className="text-[11px] text-surface-500">
                        {group.items.length} bill{group.items.length !== 1 ? 's' : ''} • Total Qty: {group.totalQty}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] text-surface-400 uppercase block font-semibold">Total Amount</span>
                      <span className="font-mono font-black text-xs sm:text-sm text-surface-900">
                        ₹{group.totalAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <button className="p-1 text-surface-400 hover:text-surface-700">
                      {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Bills Grid */}
                {!isCollapsed && (
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 bg-surface-50/40">
                    {group.items.map((c) => renderBillCard(c))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : viewMode === 'creator' ? (
        /* ============================================================ */
        /* SEGREGATION VIEW: BY CREATOR / BILLED BY                     */
        /* ============================================================ */
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-surface-600">
            <span className="font-bold flex items-center gap-1.5 text-primary-600">
              <UserCheck size={15} />
              <span>Creator-wise Delivery Slips ({groupedByCreator.length} Creators)</span>
            </span>
            <span>Total: {filteredBills.length} Bills</span>
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
                  className="p-3 bg-primary-50/50 hover:bg-primary-50/80 transition-colors flex items-center justify-between cursor-pointer border-b border-primary-100"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary-500 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                      {group.creator.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <div className="font-bold text-xs sm:text-sm text-surface-900 truncate flex items-center gap-1.5">
                        <span>Billed By: {group.creator}</span>
                      </div>
                      <div className="text-[11px] text-surface-500">
                        {group.items.length} bill{group.items.length !== 1 ? 's' : ''} • Total Qty: {group.totalQty}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] text-surface-400 uppercase block font-semibold">Billed Total</span>
                      <span className="font-mono font-black text-xs sm:text-sm text-surface-900">
                        ₹{group.totalAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <button className="p-1 text-surface-400 hover:text-surface-700">
                      {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Bills Grid */}
                {!isCollapsed && (
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 bg-surface-50/40">
                    {group.items.map((c) => renderBillCard(c))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ============================================================ */
        /* STANDARD LIST VIEW (MOBILE CARDS + DESKTOP TABLE)            */
        /* ============================================================ */
        <>
          {/* Mobile Card List */}
          <div className="md:hidden space-y-2.5">
            {filteredBills.map((c) => renderBillCard(c))}
          </div>

          {/* Desktop Table View */}
          <div className="card hidden md:block overflow-hidden shadow-xs">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Memo No.</th>
                    <th>Challan #</th>
                    <th>Date</th>
                    <th>Client / Customer</th>
                    <th>Billed By</th>
                    <th>Items</th>
                    <th className="text-right">Total Qty</th>
                    <th className="text-right">Grand Total</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {filteredBills.map((c) => {
                    const memoNo =
                      c.reference_number || c.challan_number.split('/').pop() || '0120';
                    const itemsSub = (c.items || []).reduce(
                      (sum: number, it: ChallanItem) =>
                        sum + (Number(it.amount) || ((Number(it.rate) || 0) * (Number(it.quantity) || 0))),
                      0
                    );
                    const transport = Number(c.transportation_charges) || 0;
                    const loading = Number(c.loading_charges) || 0;
                    const taxable = c.subtotal_amount || (itemsSub + transport + loading);
                    const cgst = c.cgst_amount ?? (c.apply_gst && taxable > 0 ? Math.round(taxable * 0.09 * 100) / 100 : 0);
                    const sgst = c.sgst_amount ?? (c.apply_gst && taxable > 0 ? Math.round(taxable * 0.09 * 100) / 100 : 0);
                    const totalAmt = c.total_amount || (taxable + cgst + sgst);
                    const creator = c.created_by || c.prepared_by || 'Rushank';

                    return (
                      <tr
                        key={c.id}
                        onClick={() => router.push(`/challans/${c.id}/bill`)}
                        className="cursor-pointer hover:bg-surface-50 transition-colors"
                      >
                        <td>
                          <span className="font-mono font-black text-xs text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {memoNo}
                          </span>
                        </td>
                        <td className="font-mono text-xs text-surface-600">
                          {c.challan_number}
                        </td>
                        <td className="whitespace-nowrap text-xs text-surface-600">
                          {formatDateIndian(c.challan_date)}
                        </td>
                        <td className="text-xs">
                          <div className="font-semibold text-surface-900">{c.customer_name}</div>
                          {c.customer_phone && (
                            <div className="text-[11px] text-surface-400">{formatPhone(c.customer_phone)}</div>
                          )}
                        </td>
                        <td className="text-xs whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 font-semibold text-surface-700 bg-surface-100 px-2 py-0.5 rounded-full border border-surface-200 text-[11px]">
                            👤 {creator}
                          </span>
                        </td>
                        <td className="max-w-xs truncate text-xs text-surface-600">
                          {c.items?.[0]?.item_description || '—'}
                          {c.items && c.items.length > 1 && (
                            <span className="text-[10px] text-surface-400 ml-1">
                              (+{c.items.length - 1})
                            </span>
                          )}
                        </td>
                        <td className="text-right font-bold text-xs text-surface-900 whitespace-nowrap">
                          {c.total_quantity} {c.items?.[0]?.unit || 'sheets'}
                        </td>
                        <td className="text-right font-mono font-bold text-xs text-surface-900 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {c.apply_gst && (
                              <span className="text-[9px] uppercase font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded font-sans">
                                +18% GST
                              </span>
                            )}
                            <span>₹{totalAmt.toLocaleString('en-IN')}</span>
                          </div>
                        </td>
                        <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {c.customer_phone && (
                              <button
                                title="Share via WhatsApp"
                                onClick={(e) => handleWhatsApp(c, e)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                              >
                                <Send size={15} />
                              </button>
                            )}
                            <button
                              title="View Exact Memo Slip"
                              onClick={() => router.push(`/challans/${c.id}/bill`)}
                              className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 font-semibold"
                            >
                              <Receipt size={13} className="text-[#b8860b]" />
                              <span>View Slip</span>
                            </button>
                            <button
                              title="Delete Bill"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteModalChallan(c);
                              }}
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteModalChallan}
        title="Delete Delivery Bill?"
        message={`Are you sure you want to permanently delete delivery bill #${deleteModalChallan?.reference_number || deleteModalChallan?.challan_number}? This will permanently remove it from the system.`}
        variant="danger"
        confirmLabel="Yes, Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteModalChallan(null)}
      />
    </div>
  );
}
