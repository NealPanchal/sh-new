'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Building2,
  Plus,
  Minus,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  User,
  MapPin,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  DollarSign,
  ShieldAlert,
} from 'lucide-react';
import { Customer, CustomerSite, SiteAdjustment, SiteAdjustmentType, SiteAccountingSummary } from '@/types';
import { getClientAuthToken, getCurrentUser, canManageAccounting } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function SiteAccountingPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sites, setSites] = useState<CustomerSite[]>([]);
  const [adjustments, setAdjustments] = useState<SiteAdjustment[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [siteSummary, setSiteSummary] = useState<SiteAccountingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal: Add Adjustment (+ or -)
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [adjType, setAdjType] = useState<SiteAdjustmentType>('plus');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjCategory, setAdjCategory] = useState('Extra Material Charges');
  const [adjReason, setAdjReason] = useState('');
  const [adjRef, setAdjRef] = useState('');
  const [adjDate, setAdjDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [adjSubmitting, setAdjSubmitting] = useState(false);
  const [adjError, setAdjError] = useState('');

  // Modal: Create New Site
  const [isNewSiteModalOpen, setIsNewSiteModalOpen] = useState(false);
  const [newSiteCustId, setNewSiteCustId] = useState('');
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteLocation, setNewSiteLocation] = useState('');
  const [newSiteIncharge, setNewSiteIncharge] = useState('');
  const [newSitePhone, setNewSitePhone] = useState('');
  const [newSiteSubmitting, setNewSiteSubmitting] = useState(false);
  const [newSiteError, setNewSiteError] = useState('');

  const currentUser = getCurrentUser();
  const canEdit = canManageAccounting();

  // Load initial data
  const loadData = async () => {
    try {
      setLoading(true);
      const token = getClientAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [resCust, resSites, resAdj] = await Promise.all([
        fetch('/api/customers', { headers }),
        fetch('/api/sites', { headers }),
        fetch('/api/sites/adjustments', { headers }),
      ]);

      if (resCust.ok) {
        const d = await resCust.json();
        const custList: Customer[] = d.customers || [];
        setCustomers(custList);
        if (custList.length > 0 && !selectedCustomerId) {
          setSelectedCustomerId(custList[0].id);
        }
      }
      if (resSites.ok) {
        const d = await resSites.json();
        setSites(d.sites || []);
      }
      if (resAdj.ok) {
        const d = await resAdj.json();
        setAdjustments(d.adjustments || []);
      }
    } catch (err) {
      console.error('Failed to load site accounting data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter sites for selected customer
  const customerSites = useMemo(() => {
    if (!selectedCustomerId) return [];
    return sites.filter((s) => s.customer_id === selectedCustomerId);
  }, [sites, selectedCustomerId]);

  // Set default selected site when customer changes
  useEffect(() => {
    if (customerSites.length > 0) {
      // Check if current selectedSiteId is valid for this customer
      const exists = customerSites.some((s) => s.id === selectedSiteId);
      if (!exists) {
        setSelectedSiteId(customerSites[0].id);
      }
    } else {
      setSelectedSiteId('');
    }
  }, [customerSites, selectedSiteId]);

  // Fetch Site Summary when selectedSiteId changes
  useEffect(() => {
    if (!selectedSiteId || !selectedCustomerId) {
      setSiteSummary(null);
      return;
    }

    const fetchSummary = async () => {
      try {
        const token = getClientAuthToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const activeSite = sites.find((s) => s.id === selectedSiteId);
        const activeCust = customers.find((c) => c.id === selectedCustomerId);

        const params = new URLSearchParams({
          siteId: selectedSiteId,
          siteName: activeSite?.name || '',
          customerId: selectedCustomerId,
          customerName: activeCust?.name || '',
          summary: 'true',
        });

        const res = await fetch(`/api/sites/adjustments?${params.toString()}`, { headers });
        if (res.ok) {
          const d = await res.json();
          setSiteSummary(d.summary);
        }
      } catch (err) {
        console.error('Failed to load site summary:', err);
      }
    };

    fetchSummary();
  }, [selectedSiteId, selectedCustomerId, sites, customers]);

  // Filter adjustments for the selected site
  const siteAdjustmentsList = useMemo(() => {
    if (!selectedSiteId) return [];
    return adjustments.filter((a) => a.site_id === selectedSiteId);
  }, [adjustments, selectedSiteId]);

  // Handle Create Adjustment
  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(adjAmount);
    if (!numAmt || numAmt <= 0) {
      setAdjError('Please enter a valid positive adjustment amount');
      return;
    }
    if (!adjReason.trim()) {
      setAdjError('Please provide a reason / justification for this adjustment');
      return;
    }

    const activeSite = sites.find((s) => s.id === selectedSiteId);
    const activeCust = customers.find((c) => c.id === selectedCustomerId);
    if (!activeSite || !activeCust) {
      setAdjError('Please select both a valid customer and site');
      return;
    }

    try {
      setAdjSubmitting(true);
      setAdjError('');
      const token = getClientAuthToken();

      const payload = {
        site_id: activeSite.id,
        site_name: activeSite.name,
        customer_id: activeCust.id,
        customer_name: activeCust.name,
        adjustment_type: adjType,
        amount: numAmt,
        category: adjCategory,
        reason: adjReason.trim(),
        reference_no: adjRef.trim() || undefined,
        entry_date: adjDate,
      };

      const res = await fetch('/api/sites/adjustments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const d = await res.json();
      if (!res.ok || !d.success) {
        setAdjError(d.error || 'Failed to record adjustment');
        return;
      }

      setIsAdjModalOpen(false);
      setAdjAmount('');
      setAdjReason('');
      setAdjRef('');
      await loadData();
    } catch (err: any) {
      setAdjError(err.message || 'Network error');
    } finally {
      setAdjSubmitting(false);
    }
  };

  // Handle Create New Site
  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteName.trim()) {
      setNewSiteError('Site name is required');
      return;
    }
    const custId = newSiteCustId || selectedCustomerId;
    const custObj = customers.find((c) => c.id === custId);
    if (!custObj) {
      setNewSiteError('Please select a customer');
      return;
    }

    try {
      setNewSiteSubmitting(true);
      setNewSiteError('');
      const token = getClientAuthToken();

      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          customer_id: custObj.id,
          customer_name: custObj.name,
          name: newSiteName.trim(),
          location: newSiteLocation.trim() || undefined,
          site_incharge: newSiteIncharge.trim() || undefined,
          contact_phone: newSitePhone.trim() || undefined,
          opening_balance: 0,
        }),
      });

      const d = await res.json();
      if (!res.ok || !d.success) {
        setNewSiteError(d.error || 'Failed to create site');
        return;
      }

      setIsNewSiteModalOpen(false);
      setNewSiteName('');
      setNewSiteLocation('');
      setNewSiteIncharge('');
      setNewSitePhone('');
      await loadData();
      if (d.site) {
        setSelectedSiteId(d.site.id);
      }
    } catch (err: any) {
      setNewSiteError(err.message || 'Network error');
    } finally {
      setNewSiteSubmitting(false);
    }
  };

  const activeCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  const activeSite = useMemo(() => {
    return sites.find((s) => s.id === selectedSiteId) || null;
  }, [sites, selectedSiteId]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-600 rounded-lg">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">
                Site-Wise PLUS / MINUS Accounting
              </h1>
              <p className="text-xs text-zinc-500 font-medium">
                Independent debit & credit adjustments per construction site, project & contractor
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <button
                onClick={() => {
                  setNewSiteCustId(selectedCustomerId);
                  setIsNewSiteModalOpen(true);
                  setNewSiteError('');
                }}
                className="px-3 py-2 text-xs font-semibold text-zinc-700 bg-surface-100 hover:bg-surface-200 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Plus size={14} />
                <span>New Site</span>
              </button>

              <button
                onClick={() => {
                  if (!selectedSiteId) {
                    alert('Please select or create a site first');
                    return;
                  }
                  setIsAdjModalOpen(true);
                  setAdjError('');
                }}
                className="btn-primary flex items-center justify-center gap-1.5 py-2 px-3.5 text-xs font-semibold shadow-xs"
              >
                <DollarSign size={15} />
                <span>Post Adjustment (+ / -)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Selectors Bar */}
      <div className="bg-white p-4 rounded-xl border border-surface-200 shadow-2xs grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Customer Selector */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
            <User size={13} className="text-primary-600" />
            <span>Select Customer / Builder / Contractor</span>
          </label>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-bold text-zinc-900 focus:outline-none focus:border-primary-500"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.company_name ? `(${c.company_name})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Site Selector */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-zinc-700 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Building2 size={13} className="text-primary-600" />
              <span>Select Active Project Site</span>
            </span>
            <span className="text-[11px] text-zinc-400 font-normal">
              {customerSites.length} site(s) registered
            </span>
          </label>
          {customerSites.length === 0 ? (
            <div className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800">
              <span>No sites registered for this party yet.</span>
              <button
                onClick={() => {
                  setNewSiteCustId(selectedCustomerId);
                  setIsNewSiteModalOpen(true);
                }}
                className="font-bold underline text-primary-600"
              >
                Add Site
              </button>
            </div>
          ) : (
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-bold text-zinc-900 focus:outline-none focus:border-primary-500"
            >
              {customerSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.location ? `— ${s.location}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Active Site Details Card & Formula Breakdown */}
      {siteSummary && activeSite && (
        <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-surface-100">
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-600 tracking-wider">
                Site Ledger Summary
              </span>
              <h2 className="text-lg font-black text-zinc-900 flex items-center gap-2">
                <span>{activeSite.name}</span>
                {activeSite.location && (
                  <span className="text-xs font-normal text-zinc-500 flex items-center gap-1">
                    <MapPin size={12} /> {activeSite.location}
                  </span>
                )}
              </h2>
            </div>
            <div className="text-right">
              <span className="text-xs text-zinc-400 block">Site Outstanding Balance</span>
              <span
                className={`text-2xl font-black ${
                  siteSummary.closingOutstandingBalance > 0
                    ? 'text-red-600'
                    : siteSummary.closingOutstandingBalance < 0
                    ? 'text-emerald-600'
                    : 'text-zinc-800'
                }`}
              >
                {formatCurrency(siteSummary.closingOutstandingBalance)}
              </span>
            </div>
          </div>

          {/* Formula Breakdown Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            {/* 1. Opening */}
            <div className="bg-surface-50 p-3 rounded-xl border border-surface-200">
              <span className="text-[10px] text-zinc-500 font-semibold uppercase block">Opening Balance</span>
              <p className="text-base font-black text-zinc-800 mt-1">
                {formatCurrency(siteSummary.openingBalance)}
              </p>
              <span className="text-[9px] text-zinc-400">b/f</span>
            </div>

            {/* 2. Challan Billed */}
            <div className="bg-surface-50 p-3 rounded-xl border border-surface-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-semibold uppercase block">Challans</span>
                <span className="text-amber-500 font-bold text-[11px]">(+)</span>
              </div>
              <p className="text-base font-black text-zinc-900 mt-1">
                {formatCurrency(siteSummary.totalChallanAmount)}
              </p>
              <span className="text-[9px] text-zinc-400">{siteSummary.challanCount} dispatch(es)</span>
            </div>

            {/* 3. PLUS Adjustments */}
            <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-amber-800 font-semibold uppercase block">PLUS (+) Adjs</span>
                <span className="text-amber-600 font-bold text-[11px]">(+)</span>
              </div>
              <p className="text-base font-black text-amber-700 mt-1">
                {formatCurrency(siteSummary.totalPlusAdjustments)}
              </p>
              <span className="text-[9px] text-amber-700">Extra material & charges</span>
            </div>

            {/* 4. Payments Received */}
            <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-emerald-800 font-semibold uppercase block">Payments</span>
                <span className="text-emerald-600 font-bold text-[11px]">(-)</span>
              </div>
              <p className="text-base font-black text-emerald-700 mt-1">
                {formatCurrency(siteSummary.totalPaymentsReceived)}
              </p>
              <span className="text-[9px] text-emerald-700">Collections credited</span>
            </div>

            {/* 5. Goods Returns */}
            <div className="bg-surface-50 p-3 rounded-xl border border-surface-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-semibold uppercase block">Goods Returns</span>
                <span className="text-zinc-500 font-bold text-[11px]">(-)</span>
              </div>
              <p className="text-base font-black text-zinc-800 mt-1">
                {formatCurrency(siteSummary.totalGoodsReturns)}
              </p>
              <span className="text-[9px] text-zinc-400">Restocked credit</span>
            </div>

            {/* 6. MINUS Adjustments */}
            <div className="bg-purple-500/10 p-3 rounded-xl border border-purple-500/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-purple-800 font-semibold uppercase block">MINUS (-) Adjs</span>
                <span className="text-purple-600 font-bold text-[11px]">(-)</span>
              </div>
              <p className="text-base font-black text-purple-700 mt-1">
                {formatCurrency(siteSummary.totalMinusAdjustments)}
              </p>
              <span className="text-[9px] text-purple-700">Discounts & credits</span>
            </div>
          </div>
        </div>
      )}

      {/* Adjustments History for this Site */}
      <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="px-4 py-3 bg-surface-50 border-b border-surface-200 flex items-center justify-between">
          <h3 className="font-bold text-xs text-zinc-800 uppercase tracking-wider">
            Site Plus (+) / Minus (-) Adjustment Entries
          </h3>
          <span className="text-xs text-zinc-500">{siteAdjustmentsList.length} entry(ies) recorded</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-50 border-b border-surface-200 text-surface-600 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Description / Reason</th>
                <th className="px-4 py-3">Reference #</th>
                <th className="px-4 py-3 text-right">Amount (₹)</th>
                <th className="px-4 py-3">Created By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {siteAdjustmentsList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-surface-400">
                    No Plus/Minus adjustments posted for this site.
                  </td>
                </tr>
              ) : (
                siteAdjustmentsList.map((adj) => (
                  <tr key={adj.id} className="hover:bg-surface-50/70 transition-colors">
                    <td className="px-4 py-3 text-surface-600">{formatDate(adj.entry_date)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${
                          adj.adjustment_type === 'plus'
                            ? 'bg-amber-50 text-amber-700 border-amber-300'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        }`}
                      >
                        {adj.adjustment_type === 'plus' ? (
                          <>
                            <Plus size={11} strokeWidth={3} /> PLUS (DEBIT)
                          </>
                        ) : (
                          <>
                            <Minus size={11} strokeWidth={3} /> MINUS (CREDIT)
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-zinc-900">{adj.category}</td>
                    <td className="px-4 py-3 text-surface-700 max-w-[240px] truncate">{adj.reason}</td>
                    <td className="px-4 py-3 font-mono text-zinc-600">{adj.reference_no || '—'}</td>
                    <td
                      className={`px-4 py-3 text-right font-black ${
                        adj.adjustment_type === 'plus' ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {adj.adjustment_type === 'plus' ? '+' : '-'} {formatCurrency(adj.amount)}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 font-medium">{adj.created_by}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Post Adjustment Modal */}
      {isAdjModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-surface-200">
            <div className="flex items-center justify-between pb-3 border-b border-surface-100">
              <div className="flex items-center gap-2">
                <div
                  className={`p-1.5 rounded-lg ${
                    adjType === 'plus' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                  }`}
                >
                  {adjType === 'plus' ? <Plus size={18} /> : <Minus size={18} />}
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-900">Post Site Adjustment</h3>
                  <p className="text-[11px] text-zinc-500">
                    Target Site: {activeSite?.name} ({activeCustomer?.name})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAdjModalOpen(false)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateAdjustment} className="py-4 space-y-4 text-xs">
              {adjError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{adjError}</span>
                </div>
              )}

              {/* Adjustment Type Switcher */}
              <div className="space-y-1">
                <label className="font-bold text-zinc-700 block">Select Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAdjType('plus');
                      setAdjCategory('Extra Material Charges');
                    }}
                    className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 font-bold transition-all ${
                      adjType === 'plus'
                        ? 'bg-amber-50 border-amber-500 text-amber-800 shadow-2xs'
                        : 'bg-surface-50 border-surface-200 text-zinc-500'
                    }`}
                  >
                    <Plus size={16} />
                    <span>PLUS (+) DEBIT</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdjType('minus');
                      setAdjCategory('Settlement Discount');
                    }}
                    className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 font-bold transition-all ${
                      adjType === 'minus'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-2xs'
                        : 'bg-surface-50 border-surface-200 text-zinc-500'
                    }`}
                  >
                    <Minus size={16} />
                    <span>MINUS (-) CREDIT</span>
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div className="space-y-1">
                <label className="font-bold text-zinc-700">Adjustment Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="e.g. 5000"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-bold text-zinc-900 focus:outline-none focus:border-primary-500"
                  required
                />
              </div>

              {/* Category */}
              <div className="space-y-1">
                <label className="font-bold text-zinc-700">Category</label>
                <select
                  value={adjCategory}
                  onChange={(e) => setAdjCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-medium focus:outline-none focus:border-primary-500"
                >
                  {adjType === 'plus' ? (
                    <>
                      <option value="Extra Material Charges">Extra Material Charges</option>
                      <option value="Additional Delivery Surcharge">Additional Delivery Surcharge</option>
                      <option value="Site Damage / Penalty">Site Damage / Penalty</option>
                      <option value="Debit Adjustment">Other Debit Adjustment</option>
                    </>
                  ) : (
                    <>
                      <option value="Settlement Discount">Settlement Discount</option>
                      <option value="Goods Return Adjustment">Goods Return Adjustment</option>
                      <option value="Payment Adjustment">Payment Adjustment</option>
                      <option value="Credit Note">Other Credit Note</option>
                    </>
                  )}
                </select>
              </div>

              {/* Date & Ref */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-700">Entry Date</label>
                  <input
                    type="date"
                    value={adjDate}
                    onChange={(e) => setAdjDate(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-medium focus:outline-none focus:border-primary-500"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-zinc-700">Ref / Slip #</label>
                  <input
                    type="text"
                    placeholder="e.g. MEMO-09"
                    value={adjRef}
                    onChange={(e) => setAdjRef(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-mono focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              {/* Reason */}
              <div className="space-y-1">
                <label className="font-bold text-zinc-700">Reason / Description *</label>
                <textarea
                  rows={2}
                  placeholder="Explain why this plus/minus adjustment is being posted..."
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-medium focus:outline-none focus:border-primary-500"
                  required
                />
              </div>

              <div className="pt-3 border-t border-surface-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdjModalOpen(false)}
                  className="px-4 py-2 font-semibold text-surface-600 hover:bg-surface-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjSubmitting}
                  className="btn-primary py-2 px-5 font-bold shadow-xs disabled:opacity-50"
                >
                  {adjSubmitting ? 'Posting...' : 'Post Site Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New Site Modal */}
      {isNewSiteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-surface-200">
            <div className="flex items-center justify-between pb-3 border-b border-surface-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary-50 text-primary-600 rounded-lg">
                  <Building2 size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-900">Add Customer Project Site</h3>
                  <p className="text-[11px] text-zinc-500">Party: {activeCustomer?.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewSiteModalOpen(false)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSite} className="py-4 space-y-3 text-xs">
              {newSiteError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{newSiteError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="font-bold text-zinc-700">Site / Project Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Site 1 – Thane Villa or Lodha Complex"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-bold text-zinc-900 focus:outline-none focus:border-primary-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-700">Location / Address</label>
                <input
                  type="text"
                  placeholder="e.g. Charai, Thane (W)"
                  value={newSiteLocation}
                  onChange={(e) => setNewSiteLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-medium focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-700">Site In-Charge</label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Site Supervisor"
                    value={newSiteIncharge}
                    onChange={(e) => setNewSiteIncharge(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-medium focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-zinc-700">Contact Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. +91 98200 12345"
                    value={newSitePhone}
                    onChange={(e) => setNewSitePhone(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-medium focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-surface-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewSiteModalOpen(false)}
                  className="px-4 py-2 font-semibold text-surface-600 hover:bg-surface-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={newSiteSubmitting}
                  className="btn-primary py-2 px-5 font-bold shadow-xs disabled:opacity-50"
                >
                  {newSiteSubmitting ? 'Creating...' : 'Create Site'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

