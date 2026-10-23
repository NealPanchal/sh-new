'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import {
  FileText,
  Plus,
  CalendarDays,
  TrendingUp,
  Search,
  Eye,
  Printer,
  Send,
  Users,
  Package,
  ArrowRight,
  X,
  Receipt,
} from 'lucide-react';
import { formatDateIndian, formatINR, cn } from '@/lib/utils';
import { Challan, ChallanStatus } from '@/types';
import { printChallanPDF } from '@/lib/pdf';
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
        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border',
        badgeClasses[status] || 'bg-surface-100 text-surface-600 border-surface-200'
      )}
    >
      {status}
    </span>
  );
}

export default function DashboardPage() {
  const {
    getDashboardStats,
    getChallans,
    profile,
    showToast,
    updateShareStatus,
    isLoading,
    challans: liveChallans,
    dataVersion,
  } = useApp();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const stats = useMemo(() => {
    if (!mounted || isLoading) {
      return { totalChallans: 0, challansToday: 0, challansThisMonth: 0, recentChallans: [] };
    }
    return getDashboardStats();
  }, [mounted, isLoading, getDashboardStats, dataVersion, liveChallans]);

  const recentChallans = useMemo(() => {
    if (!mounted || isLoading) return [];
    return getChallans({
      search: search || undefined,
    }).slice(0, 10);
  }, [mounted, isLoading, getChallans, search, dataVersion, liveChallans]);

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

  const handleWhatsApp = (challan: Challan, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!profile) return;
    if (!challan.customer_phone) {
      showToast('No customer phone recorded', 'error');
      return;
    }
    const msg = generateShareMessage(challan, profile);
    openWhatsApp(challan.customer_phone, msg);
    updateShareStatus(challan.id, 'share_initiated');
    showToast(`Opening WhatsApp for ${challan.customer_name}`);
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
      {/* Top Banner / Shop Info */}
      <div className="flex items-center justify-between gap-3 pb-1">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white border border-[#b8860b]/30 p-1.5 shadow-2xs shrink-0 flex items-center justify-center">
            <img
              src="/logo-emblem.png"
              alt="Showhouse"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-surface-900 tracking-tight flex items-center gap-2">
              <span>{profile?.business_name || 'SHOWHOUSE'}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-[#b8860b] border border-amber-200/60 uppercase tracking-widest hidden sm:inline-block">
                Decor Studio
              </span>
            </h1>
            <p className="text-xs text-surface-500 mt-0.5">
              Laminates Delivery Challan System
            </p>
          </div>
        </div>

        <Link
          href="/challans/new"
          className="btn-primary py-2 px-3.5 text-xs font-semibold shadow-xs flex items-center gap-1.5"
        >
          <Plus size={16} />
          <span>New Challan</span>
        </Link>
      </div>

      {/* Compact Stat Cards (Zero Oversized Whitespace) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="card p-3 sm:p-4 bg-white border border-surface-200 shadow-xs">
          <div className="text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider truncate">
            Total Challans
          </div>
          <div className="text-xl sm:text-3xl font-extrabold text-surface-900 mt-1">
            {stats.totalChallans}
          </div>
        </div>

        <div className="card p-3 sm:p-4 bg-white border border-surface-200 shadow-xs">
          <div className="text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider truncate">
            Today
          </div>
          <div className="text-xl sm:text-3xl font-extrabold text-emerald-600 mt-1">
            {stats.challansToday}
          </div>
        </div>

        <div className="card p-3 sm:p-4 bg-white border border-surface-200 shadow-xs">
          <div className="text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider truncate">
            This Month
          </div>
          <div className="text-xl sm:text-3xl font-extrabold text-primary-600 mt-1">
            {stats.challansThisMonth}
          </div>
        </div>
      </div>

      {/* Fast Navigation Shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Link
          href="/challans/new"
          className="p-2.5 rounded-lg border border-primary-200 bg-primary-50/60 hover:bg-primary-100/70 transition-colors flex items-center gap-2"
        >
          <div className="w-8 h-8 rounded-md bg-primary-500 text-white flex items-center justify-center shrink-0">
            <Plus size={16} />
          </div>
          <div className="truncate">
            <span className="font-bold text-xs text-primary-900 block leading-tight">Create Challan</span>
            <span className="text-[10px] text-primary-700">Quick dispatch</span>
          </div>
        </Link>

        <Link
          href="/bills"
          className="p-2.5 rounded-lg border border-[#b8860b]/30 bg-[#b8860b]/10 hover:bg-[#b8860b]/20 transition-colors flex items-center gap-2"
        >
          <div className="w-8 h-8 rounded-md bg-[#b8860b] text-white flex items-center justify-center shrink-0">
            <Receipt size={16} />
          </div>
          <div className="truncate">
            <span className="font-bold text-xs text-surface-900 block leading-tight">Delivery Bills</span>
            <span className="text-[10px] text-[#b8860b] font-medium">Showhouse slips</span>
          </div>
        </Link>

        <Link
          href="/challans"
          className="p-2.5 rounded-lg border border-surface-200 bg-white hover:bg-surface-50 transition-colors flex items-center gap-2"
        >
          <div className="w-8 h-8 rounded-md bg-surface-100 text-surface-700 flex items-center justify-center shrink-0">
            <FileText size={16} />
          </div>
          <div className="truncate">
            <span className="font-bold text-xs text-surface-900 block leading-tight">All Challans</span>
            <span className="text-[10px] text-surface-400">Search & reprint</span>
          </div>
        </Link>

        <Link
          href="/customers"
          className="p-2.5 rounded-lg border border-surface-200 bg-white hover:bg-surface-50 transition-colors flex items-center gap-2"
        >
          <div className="w-8 h-8 rounded-md bg-surface-100 text-surface-700 flex items-center justify-center shrink-0">
            <Users size={16} />
          </div>
          <div className="truncate">
            <span className="font-bold text-xs text-surface-900 block leading-tight">Customers</span>
            <span className="text-[10px] text-surface-400">Customer records</span>
          </div>
        </Link>

        <Link
          href="/products"
          className="p-2.5 rounded-lg border border-surface-200 bg-white hover:bg-surface-50 transition-colors flex items-center gap-2"
        >
          <div className="w-8 h-8 rounded-md bg-surface-100 text-surface-700 flex items-center justify-center shrink-0">
            <Package size={16} />
          </div>
          <div className="truncate">
            <span className="font-bold text-xs text-surface-900 block leading-tight">Catalogue</span>
            <span className="text-[10px] text-surface-400">Laminates & mica</span>
          </div>
        </Link>
      </div>

      {/* Recent Challans Card */}
      <div className="card p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-primary-600" />
            <h2 className="text-sm font-bold text-surface-900">Recent Delivery Challans</h2>
          </div>

          <Link
            href="/challans"
            className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* Quick Search inside Dashboard */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Quick search recent challans..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 text-xs py-2 w-full"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 p-1"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Recent Challans Mobile Cards */}
        <div className="md:hidden space-y-2">
          {recentChallans.length === 0 ? (
            <div className="py-6 text-center text-xs text-surface-400">No recent challans found</div>
          ) : (
            recentChallans.map((c) => (
              <Link
                key={c.id}
                href={`/challans/${c.id}`}
                className="p-2.5 rounded-lg border border-surface-200 bg-surface-50/50 hover:bg-white block transition-colors shadow-2xs"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-bold text-xs text-primary-600">{c.challan_number}</span>
                  <StatusBadge status={c.status} />
                </div>
                <div className="font-semibold text-xs text-surface-900 truncate">{c.customer_name}</div>
                <div className="flex items-center justify-between text-[11px] text-surface-500 mt-1 pt-1 border-t border-surface-100">
                  <span>{formatDateIndian(c.challan_date)}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-surface-800">{c.total_quantity} sheets</span>
                    {c.total_amount && c.total_amount > 0 ? (
                      <span className="font-mono text-primary-700 font-bold bg-primary-50 px-1 rounded text-[10px]">
                        ₹{c.total_amount.toLocaleString('en-IN')}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Challan No.</th>
                <th>Date</th>
                <th>Customer</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Total Amount</th>
                <th>Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {recentChallans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-xs text-surface-400">
                    No challans recorded yet
                  </td>
                </tr>
              ) : (
                recentChallans.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-50 transition-colors">
                    <td>
                      <Link href={`/challans/${c.id}`} className="font-mono font-bold text-xs text-primary-600 hover:underline">
                        {c.challan_number}
                      </Link>
                    </td>
                    <td className="text-xs text-surface-600">{formatDateIndian(c.challan_date)}</td>
                    <td className="text-xs font-semibold text-surface-900">{c.customer_name}</td>
                    <td className="text-xs text-right font-bold text-surface-900">{c.total_quantity}</td>
                    <td className="text-xs text-right font-mono font-bold text-surface-900">
                      {c.total_amount && c.total_amount > 0 ? `₹${c.total_amount.toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/challans/${c.id}`}
                          className="p-1 text-surface-500 hover:text-primary-600 rounded"
                          title="View"
                        >
                          <Eye size={15} />
                        </Link>
                        <button
                          onClick={(e) => handlePrint(c, e)}
                          className="p-1 text-surface-500 hover:text-primary-600 rounded"
                          title="Print"
                        >
                          <Printer size={15} />
                        </button>
                        {c.customer_phone && (
                          <button
                            onClick={(e) => handleWhatsApp(c, e)}
                            className="p-1 text-emerald-600 hover:text-emerald-700 rounded"
                            title="WhatsApp"
                          >
                            <Send size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
