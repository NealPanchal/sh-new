'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  RotateCcw,
  Plus,
  Search,
  Filter,
  ArrowRight,
  PackageCheck,
  AlertCircle,
  FileText,
  Calendar,
  User,
  X,
  CheckCircle2,
  Printer,
  ChevronDown,
} from 'lucide-react';
import { GoodsReturn, Challan } from '@/types';
import { getClientAuthToken, getCurrentUser } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function GoodsReturnsPage() {
  const [returns, setReturns] = useState<GoodsReturn[]>([]);
  const [challans, setChallans] = useState<Challan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedChallanId, setSelectedChallanId] = useState('');
  const [challanSearchQuery, setChallanSearchQuery] = useState('');
  const [returnReason, setReturnReason] = useState('Damaged goods / quality issue');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedItems, setSelectedItems] = useState<{
    [itemId: string]: {
      selected: boolean;
      return_quantity: number;
      max_allowed: number;
      description: string;
      rate: number;
      unit: string;
      delivered_quantity: number;
    };
  }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Selected Return Detail Modal for Printing / Viewing
  const [viewReturn, setViewReturn] = useState<GoodsReturn | null>(null);

  const currentUser = getCurrentUser();

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const token = getClientAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [resReturns, resChallans] = await Promise.all([
        fetch('/api/goods-returns', { headers }),
        fetch('/api/challans', { headers }),
      ]);

      if (resReturns.ok) {
        const data = await resReturns.json();
        setReturns(data.returns || []);
      }
      if (resChallans.ok) {
        const data = await resChallans.json();
        setChallans(data.challans || []);
      }
    } catch (err) {
      console.error('Failed to load goods returns:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Filtered challans based on search query in return modal
  const matchingChallans = useMemo(() => {
    const list = challans.filter((c) => c.status !== 'cancelled' && c.status !== 'void');
    if (!challanSearchQuery.trim()) return list;
    const q = challanSearchQuery.trim().toLowerCase();
    return list.filter(
      (c) =>
        (c.challan_number && c.challan_number.toLowerCase().includes(q)) ||
        (c.reference_number && c.reference_number.toLowerCase().includes(q)) ||
        (c.customer_name && c.customer_name.toLowerCase().includes(q)) ||
        (c.site_name && c.site_name.toLowerCase().includes(q)) ||
        (c.pi_number && c.pi_number.toLowerCase().includes(q))
    );
  }, [challans, challanSearchQuery]);

  // When selected challan changes in modal, populate items
  const selectedChallan = useMemo(() => {
    return challans.find((c) => c.id === selectedChallanId) || null;
  }, [challans, selectedChallanId]);

  useEffect(() => {
    if (!selectedChallan) {
      setSelectedItems({});
      return;
    }

    // Determine previous returns for this challan
    const prevReturns = returns.filter((r) => r.challan_id === selectedChallan.id);
    const itemMap: typeof selectedItems = {};

    (selectedChallan.items || []).forEach((item) => {
      let alreadyReturned = 0;
      prevReturns.forEach((pr) => {
        const matched = pr.items.find((pri) => pri.original_item_id === item.id);
        if (matched) {
          alreadyReturned += Number(matched.return_quantity) || 0;
        }
      });

      const delivered = Number(item.quantity) || 0;
      const maxAllowed = Math.max(0, delivered - alreadyReturned);

      itemMap[item.id] = {
        selected: false,
        return_quantity: 0,
        max_allowed: maxAllowed,
        description: item.item_description || item.description || '',
        rate: Number(item.rate) || 0,
        unit: item.unit || 'Sheets',
        delivered_quantity: delivered,
      };
    });

    setSelectedItems(itemMap);
  }, [selectedChallan, returns]);

  // Compute calculated return total in modal
  const modalReturnTotal = useMemo(() => {
    let sum = 0;
    Object.values(selectedItems).forEach((item) => {
      if (item.selected && item.return_quantity > 0) {
        sum += item.return_quantity * item.rate;
      }
    });
    return Math.round(sum * 100) / 100;
  }, [selectedItems]);

  const modalReturnTotalQty = useMemo(() => {
    let sum = 0;
    Object.values(selectedItems).forEach((item) => {
      if (item.selected && item.return_quantity > 0) {
        sum += Number(item.return_quantity) || 0;
      }
    });
    return sum;
  }, [selectedItems]);

  const handleCreateReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChallan) {
      setSubmitError('Please select a challan');
      return;
    }

    const itemsToReturn = Object.entries(selectedItems)
      .filter(([_, it]) => it.selected && it.return_quantity > 0)
      .map(([origId, it]) => ({
        original_item_id: origId,
        description: it.description,
        delivered_quantity: it.delivered_quantity,
        return_quantity: Number(it.return_quantity),
        rate: it.rate,
        unit: it.unit,
      }));

    if (itemsToReturn.length === 0) {
      setSubmitError('Please select at least one item to return with a quantity greater than zero');
      return;
    }

    // Validate quantities against max allowed
    for (const it of itemsToReturn) {
      const orig = selectedItems[it.original_item_id];
      if (it.return_quantity > orig.max_allowed) {
        setSubmitError(`Cannot return ${it.return_quantity} for "${it.description}". Max available is ${orig.max_allowed}`);
        return;
      }
    }

    try {
      setSubmitting(true);
      setSubmitError('');
      const token = getClientAuthToken();

      const payload = {
        challan_id: selectedChallan.id,
        challan_number: selectedChallan.challan_number,
        customer_id: selectedChallan.customer_id,
        customer_name: selectedChallan.customer_name,
        site_id: selectedChallan.site_id || undefined,
        site_name: selectedChallan.site_name || undefined,
        return_date: returnDate,
        reason: returnRemarks ? `${returnReason}: ${returnRemarks}` : returnReason,
        items: itemsToReturn,
      };

      const res = await fetch('/api/goods-returns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubmitError(data.error || 'Failed to record return');
        return;
      }

      setIsModalOpen(false);
      setSelectedChallanId('');
      setReturnRemarks('');
      await fetchInitialData();
    } catch (err: any) {
      setSubmitError(err.message || 'Network error recording goods return');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter returns
  const filteredReturns = useMemo(() => {
    return returns.filter((r) => {
      const matchesSearch =
        r.return_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.challan_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.reason && r.reason.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCustomer =
        filterCustomer === 'all' || r.customer_name === filterCustomer;

      return matchesSearch && matchesCustomer;
    });
  }, [returns, searchTerm, filterCustomer]);

  // Overall Stats
  const totalReturnValue = useMemo(() => {
    return returns.reduce((acc, r) => acc + (Number(r.total_amount) || 0), 0);
  }, [returns]);

  const totalReturnQty = useMemo(() => {
    return returns.reduce((acc, r) => acc + (Number(r.total_quantity) || 0), 0);
  }, [returns]);

  const uniqueCustomers = useMemo(() => {
    return Array.from(new Set(returns.map((r) => r.customer_name).filter(Boolean)));
  }, [returns]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-600 rounded-lg">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">
                Goods Return Management
              </h1>
              <p className="text-xs text-zinc-500 font-medium">
                Record returns against delivered challans, auto-calculate credit notes & ledger balance updates
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setIsModalOpen(true);
            setSubmitError('');
            setChallanSearchQuery('');
            setSelectedChallanId('');
          }}
          className="btn-primary flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Record Goods Return</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Total Returns Logged
            </span>
            <div className="p-1.5 bg-zinc-100 rounded-md text-zinc-600">
              <RotateCcw size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-zinc-900 mt-2">{returns.length}</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">Across all client sites</p>
        </div>

        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Total Return Credit
            </span>
            <div className="p-1.5 bg-amber-50 rounded-md text-amber-600">
              <FileText size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 mt-2">
            {formatCurrency(totalReturnValue)}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">Credited to customer accounts</p>
        </div>

        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Total Units Returned
            </span>
            <div className="p-1.5 bg-emerald-50 rounded-md text-emerald-600">
              <PackageCheck size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-zinc-900 mt-2">
            {totalReturnQty.toLocaleString('en-IN')} <span className="text-sm font-normal text-zinc-500">items</span>
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">Physical stock restocked</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-surface-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-surface-400" />
          <input
            type="text"
            placeholder="Search return #, challan #, customer, reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-medium focus:outline-none focus:border-primary-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-surface-50 px-3 py-1.5 rounded-lg border border-surface-200 w-full md:w-auto">
            <User size={14} className="text-surface-400" />
            <select
              value={filterCustomer}
              onChange={(e) => setFilterCustomer(e.target.value)}
              className="bg-transparent text-xs font-medium focus:outline-none text-zinc-700 cursor-pointer w-full"
            >
              <option value="all">All Parties / Customers</option>
              {uniqueCustomers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {(searchTerm || filterCustomer !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterCustomer('all');
              }}
              className="text-xs text-red-600 hover:text-red-700 font-semibold px-2 py-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Returns List Table */}
      <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs min-w-[720px]">
            <thead className="bg-surface-50 border-b border-surface-200 text-surface-600 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-4 py-3">Return #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Original Challan</th>
                <th className="px-4 py-3">Party / Customer</th>
                <th className="px-4 py-3">Items Returned</th>
                <th className="px-4 py-3 text-right">Return Qty</th>
                <th className="px-4 py-3 text-right">Credit Amount</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-surface-400">
                    Loading goods returns records...
                  </td>
                </tr>
              ) : filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center text-zinc-400">
                      <RotateCcw className="w-10 h-10 mb-2 stroke-[1.5] text-zinc-300" />
                      <p className="font-semibold text-zinc-600">No goods return records found</p>
                      <p className="text-[11px] mt-0.5">Click "Record Goods Return" above to process an item return.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredReturns.map((ret) => (
                  <tr key={ret.id} className="hover:bg-surface-50/70 transition-colors">
                    <td className="px-4 py-3 font-bold text-zinc-900">{ret.return_number}</td>
                    <td className="px-4 py-3 text-surface-600">{formatDate(ret.return_date)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/challans/${ret.challan_id}`}
                        className="font-semibold text-primary-600 hover:underline inline-flex items-center gap-1"
                      >
                        {ret.challan_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-zinc-900 block">{ret.customer_name}</span>
                      {ret.site_name && (
                        <span className="text-[10px] text-zinc-400 block font-medium">
                          Site: {ret.site_name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-surface-700">
                      {ret.items.map((i) => `${i.description} (${i.return_quantity} ${i.unit || ''})`).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-zinc-800">
                      {ret.total_quantity}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-amber-600">
                      {formatCurrency(ret.total_amount)}
                    </td>
                    <td className="px-4 py-3 max-w-[160px] truncate text-surface-500 font-medium">
                      {ret.reason}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setViewReturn(ret)}
                        className="px-2.5 py-1 text-xs font-semibold text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors"
                      >
                        View Note
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Return Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-surface-200 max-h-[90vh] flex flex-col my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-surface-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-900">Record Goods Return</h3>
                  <p className="text-[11px] text-zinc-500">Return goods against original challan and credit party balance</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateReturn} className="flex-1 overflow-y-auto py-4 space-y-4">
              {submitError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Step 1: Find & Select Challan by Number or Party */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-700 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <span>1. Find Original Challan</span>
                    <span className="text-red-500">*</span>
                  </span>
                  {selectedChallan && (
                    <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      ✓ Selected: {selectedChallan.challan_number}
                    </span>
                  )}
                </label>

                {/* Direct Challan Number Search Box */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search Challan No. (e.g. 4652, 4765, SH/2026-27/0002) or customer name..."
                    value={challanSearchQuery}
                    onChange={(e) => setChallanSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (matchingChallans.length > 0) {
                          setSelectedChallanId(matchingChallans[0].id);
                        }
                      }
                    }}
                    className="w-full pl-9 pr-8 py-2 bg-white border border-surface-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[#ea580c] focus:ring-1 focus:ring-[#ea580c]"
                  />
                  {challanSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setChallanSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700 p-0.5"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Quick match dropdown list if user is typing */}
                {challanSearchQuery.trim() && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-surface-200 bg-white shadow-md divide-y divide-surface-100 text-xs">
                    {matchingChallans.length === 0 ? (
                      <div className="p-3 text-center text-surface-400 text-xs">
                        No challans match &quot;{challanSearchQuery}&quot;
                      </div>
                    ) : (
                      matchingChallans.slice(0, 10).map((c) => {
                        const isSel = c.id === selectedChallanId;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSelectedChallanId(c.id);
                            }}
                            className={`w-full text-left p-2.5 hover:bg-amber-50/60 flex items-center justify-between transition-colors ${
                              isSel ? 'bg-amber-100/60 font-bold border-l-4 border-[#ea580c]' : ''
                            }`}
                          >
                            <div>
                              <div className="font-bold text-surface-900 flex items-center gap-1.5">
                                <span className="text-[#ea580c] font-black">{c.challan_number}</span>
                                <span className="text-surface-400">•</span>
                                <span>{c.customer_name}</span>
                              </div>
                              <div className="text-[10px] text-surface-500 mt-0.5">
                                Date: {formatDate(c.challan_date)} {c.site_name ? `• Site: ${c.site_name}` : ''}
                              </div>
                            </div>
                            <div className="text-right font-mono font-bold text-surface-800">
                              ₹{Number(c.total_amount || 0).toLocaleString('en-IN')}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Standard Select Dropdown */}
                <select
                  value={selectedChallanId}
                  onChange={(e) => setSelectedChallanId(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[#ea580c] focus:bg-white cursor-pointer"
                  required
                >
                  <option value="">-- Or Choose Challan from List ({matchingChallans.length} available) --</option>
                  {matchingChallans.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.challan_number} — {c.customer_name} ({formatDate(c.challan_date)}) — Total: ₹{Number(c.total_amount || 0).toLocaleString('en-IN')}
                    </option>
                  ))}
                </select>
              </div>

              {selectedChallan && (
                <>
                  {/* Customer & Site Details Card */}
                  <div className="p-3 bg-surface-50 rounded-xl border border-surface-200 text-xs flex justify-between items-center">
                    <div>
                      <span className="text-zinc-400 font-medium block text-[10px] uppercase">Party / Customer</span>
                      <span className="font-bold text-zinc-900">{selectedChallan.customer_name}</span>
                      {selectedChallan.site_name && (
                        <span className="text-zinc-500 block text-[11px]">Site: {selectedChallan.site_name}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-zinc-400 font-medium block text-[10px] uppercase">Original Challan Date</span>
                      <span className="font-semibold text-zinc-800">{formatDate(selectedChallan.challan_date)}</span>
                    </div>
                  </div>

                  {/* Step 2: Line Items to Return */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-700 flex items-center justify-between">
                      <span>2. Select Products to Return</span>
                      <span className="text-[10px] text-zinc-400 font-normal">Rates automatically locked to original challan</span>
                    </label>

                    <div className="space-y-2 border border-surface-200 rounded-xl p-3 bg-zinc-50/50">
                      {Object.entries(selectedItems).map(([itemId, item]) => (
                        <div
                          key={itemId}
                          className={`p-3 rounded-lg border transition-all text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            item.selected
                              ? 'bg-white border-amber-400 shadow-2xs'
                              : 'bg-white/60 border-surface-200 opacity-80'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              disabled={item.max_allowed <= 0}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setSelectedItems((prev) => ({
                                  ...prev,
                                  [itemId]: {
                                    ...prev[itemId],
                                    selected: checked,
                                    return_quantity: checked ? Math.min(1, prev[itemId].max_allowed) : 0,
                                  },
                                }));
                              }}
                              className="mt-1 h-4 w-4 rounded text-primary-600 focus:ring-primary-500 border-surface-300 cursor-pointer disabled:cursor-not-allowed"
                            />
                            <div>
                              <p className="font-bold text-zinc-900">{item.description}</p>
                              <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                                <span>Rate: ₹{item.rate}</span>
                                <span>•</span>
                                <span>Delivered: {item.delivered_quantity} {item.unit}</span>
                                <span>•</span>
                                <span className={item.max_allowed > 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
                                  Available to return: {item.max_allowed}
                                </span>
                              </div>
                            </div>
                          </div>

                          {item.selected && (
                            <div className="flex items-center gap-3 self-end sm:self-center">
                              <div className="flex items-center gap-1.5">
                                <label className="text-[11px] font-semibold text-zinc-600">Return Qty:</label>
                                <input
                                  type="number"
                                  min="1"
                                  max={item.max_allowed}
                                  value={item.return_quantity || ''}
                                  onChange={(e) => {
                                    const val = Math.max(0, Math.min(item.max_allowed, Number(e.target.value) || 0));
                                    setSelectedItems((prev) => ({
                                      ...prev,
                                      [itemId]: {
                                        ...prev[itemId],
                                        return_quantity: val,
                                      },
                                    }));
                                  }}
                                  className="w-16 px-2 py-1 bg-surface-50 border border-surface-300 rounded font-bold text-center text-xs focus:outline-none focus:border-primary-500"
                                />
                                <span className="text-[11px] text-zinc-500">{item.unit}</span>
                              </div>

                              <div className="text-right min-w-[70px]">
                                <span className="text-[10px] text-zinc-400 block">Credit</span>
                                <span className="font-bold text-amber-600">
                                  ₹{(item.return_quantity * item.rate).toLocaleString('en-IN')}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Step 3: Date & Reason */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-700">Return Date</label>
                      <input
                        type="date"
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                        className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-medium focus:outline-none focus:border-primary-500"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-700">Return Category</label>
                      <select
                        value={returnReason}
                        onChange={(e) => setReturnReason(e.target.value)}
                        className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-medium focus:outline-none focus:border-primary-500"
                      >
                        <option value="Damaged goods / quality issue">Damaged goods / quality issue</option>
                        <option value="Wrong item / thickness / texture sent">Wrong item / thickness / texture sent</option>
                        <option value="Excess material returned by contractor">Excess material returned by contractor</option>
                        <option value="Site design changed / order cancelled">Site design changed / order cancelled</option>
                        <option value="Other / inspection rejection">Other / inspection rejection</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-700">Additional Remarks / Notes</label>
                    <input
                      type="text"
                      placeholder="e.g. 5 sheets chipped at corner upon site delivery"
                      value={returnRemarks}
                      onChange={(e) => setReturnRemarks(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-medium focus:outline-none focus:border-primary-500"
                    />
                  </div>

                  {/* Summary Footer in Modal */}
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex justify-between items-center">
                    <div>
                      <span className="text-[11px] font-semibold text-amber-800 block">Total Return Items</span>
                      <span className="text-xs text-amber-700 font-medium">
                        {modalReturnTotalQty} units to be credited back
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-semibold text-amber-800 block">Total Credit Value</span>
                      <span className="text-lg font-black text-amber-700">
                        {formatCurrency(modalReturnTotal)}
                      </span>
                    </div>
                  </div>
                </>
              )}

              <div className="pt-2 border-t border-surface-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-surface-600 hover:bg-surface-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || modalReturnTotalQty === 0}
                  className="btn-primary py-2 px-5 text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Recording...' : 'Confirm Goods Return & Update Ledger'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Return Detail & Print Modal */}
      {viewReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-surface-200">
            <div className="flex items-center justify-between pb-3 border-b border-surface-100">
              <div>
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Goods Return Voucher</span>
                <h3 className="font-bold text-lg text-zinc-900">{viewReturn.return_number}</h3>
              </div>
              <button
                onClick={() => setViewReturn(null)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-surface-50 p-3 rounded-xl border border-surface-200">
                <div>
                  <span className="text-zinc-400 text-[10px] uppercase font-semibold block">Customer</span>
                  <span className="font-bold text-zinc-900">{viewReturn.customer_name}</span>
                  {viewReturn.site_name && <span className="text-zinc-500 block text-[11px]">Site: {viewReturn.site_name}</span>}
                </div>
                <div>
                  <span className="text-zinc-400 text-[10px] uppercase font-semibold block">Original Challan</span>
                  <span className="font-bold text-primary-600">{viewReturn.challan_number}</span>
                  <span className="text-zinc-500 block text-[11px]">Date: {formatDate(viewReturn.return_date)}</span>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-zinc-700 block mb-1.5">Returned Items</span>
                <div className="border border-surface-200 rounded-xl overflow-hidden divide-y divide-surface-100">
                  {viewReturn.items.map((item, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between bg-white text-xs">
                      <div>
                        <p className="font-bold text-zinc-900">{item.description}</p>
                        <p className="text-[11px] text-zinc-500">
                          {item.return_quantity} {item.unit} @ ₹{item.rate}
                        </p>
                      </div>
                      <span className="font-bold text-amber-600">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 flex justify-between items-center">
                <span className="font-bold text-amber-900">Total Credit Credited</span>
                <span className="text-base font-black text-amber-700">{formatCurrency(viewReturn.total_amount)}</span>
              </div>

              <div className="text-zinc-500 text-[11px]">
                <span className="font-semibold text-zinc-700">Reason: </span>
                {viewReturn.reason}
              </div>
            </div>

            <div className="pt-3 border-t border-surface-100 flex justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-surface-100 hover:bg-surface-200 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Printer size={14} />
                <span>Print Voucher</span>
              </button>
              <button
                onClick={() => setViewReturn(null)}
                className="btn-primary py-2 px-4 text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

