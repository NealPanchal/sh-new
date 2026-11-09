'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Clock,
  Lock,
  Unlock,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Calendar,
  User,
  X,
  CreditCard,
  Building2,
} from 'lucide-react';
import { CustomerCreditStatus, CreditException } from '@/types';
import { getClientAuthToken, getCurrentUser, isAdmin } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function CreditControlPage() {
  const [statuses, setStatuses] = useState<CustomerCreditStatus[]>([]);
  const [exceptions, setExceptions] = useState<CreditException[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState<'all' | 'blocked' | 'overdue' | 'exception'>('all');

  // Modal: Grant Exception
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerCreditStatus | null>(null);
  const [isExceptionModalOpen, setIsExceptionModalOpen] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('Director / Management special approval');
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7); // Default 7 days
    return d.toISOString().split('T')[0];
  });
  const [maxAdditionalAmount, setMaxAdditionalAmount] = useState('100000');
  const [maxChallans, setMaxChallans] = useState('2');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Modal: Edit Limits
  const [isLimitsModalOpen, setIsLimitsModalOpen] = useState(false);
  const [editCreditLimit, setEditCreditLimit] = useState('');
  const [editCreditDays, setEditCreditDays] = useState('45');

  const currentUser = getCurrentUser();
  const isAdministrator = isAdmin();

  const loadData = async () => {
    try {
      setLoading(true);
      const token = getClientAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch('/api/credit-control', { headers });
      if (res.ok) {
        const d = await res.json();
        setStatuses(d.statuses || []);
        setExceptions(d.exceptions || []);
      }
    } catch (err) {
      console.error('Failed to load credit control data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter statuses
  const filteredStatuses = useMemo(() => {
    return statuses.filter((st) => {
      const matchesSearch = st.customerName.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      if (filterState === 'blocked') return st.isBlocked;
      if (filterState === 'overdue') return st.isOverdue;
      if (filterState === 'exception') return st.hasException;
      return true;
    });
  }, [statuses, searchTerm, filterState]);

  // Overall KPI metrics
  const totalBlocked = useMemo(() => statuses.filter((s) => s.isBlocked).length, [statuses]);
  const totalOverdue = useMemo(() => statuses.filter((s) => s.isOverdue).length, [statuses]);
  const activeExceptionsCount = useMemo(() => exceptions.filter((e) => e.is_active).length, [exceptions]);
  const totalReceivables = useMemo(
    () => statuses.reduce((acc, s) => acc + (s.totalOutstanding || 0), 0),
    [statuses]
  );

  // Handle Grant Temporary Exception
  const handleGrantException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    if (!exceptionReason.trim()) {
      setModalError('Please provide a reason / justification');
      return;
    }

    try {
      setModalSubmitting(true);
      setModalError('');
      const token = getClientAuthToken();

      const payload = {
        action: 'grant_exception',
        customer_id: selectedCustomer.customerId,
        reason: exceptionReason.trim(),
        valid_until: validUntil,
        max_additional_amount: Number(maxAdditionalAmount) || undefined,
        max_additional_challans: Number(maxChallans) || undefined,
      };

      const res = await fetch('/api/credit-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const d = await res.json();
      if (!res.ok || !d.success) {
        setModalError(d.error || 'Failed to grant exception');
        return;
      }

      setIsExceptionModalOpen(false);
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Network error');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Handle Toggle Manual Block
  const handleToggleBlock = async (st: CustomerCreditStatus) => {
    const targetAction = st.isBlocked ? 'unblock' : 'block';
    if (!confirm(`Are you sure you want to ${targetAction} party "${st.customerName}"?`)) {
      return;
    }

    try {
      const token = getClientAuthToken();
      const res = await fetch('/api/credit-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'toggle_block',
          customer_id: st.customerId,
          blocked: !st.isBlocked,
        }),
      });

      const d = await res.json();
      if (!res.ok || !d.success) {
        alert(d.error || 'Failed to update block status');
        return;
      }

      await loadData();
    } catch (err: any) {
      alert(err.message || 'Network error');
    }
  };

  // Handle Update Limits
  const handleUpdateLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    try {
      setModalSubmitting(true);
      setModalError('');
      const token = getClientAuthToken();

      const res = await fetch('/api/credit-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'update_credit_limits',
          customer_id: selectedCustomer.customerId,
          credit_limit: Number(editCreditLimit) || 0,
          credit_days: Number(editCreditDays) || 45,
        }),
      });

      const d = await res.json();
      if (!res.ok || !d.success) {
        setModalError(d.error || 'Failed to update credit limits');
        return;
      }

      setIsLimitsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Network error');
    } finally {
      setModalSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-500/10 text-red-600 rounded-lg">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">
                Party Credit Control & 45-Day Limits
              </h1>
              <p className="text-xs text-zinc-500 font-medium">
                Automatic company-wide billing block on 45-day overdue invoices with admin override exceptions
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Blocked Parties
            </span>
            <Lock size={15} className="text-red-600" />
          </div>
          <p className="text-2xl font-black text-red-600 mt-2">{totalBlocked}</p>
          <span className="text-[10px] text-zinc-400">Challan generation locked</span>
        </div>

        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Overdue (&gt;45 Days)
            </span>
            <Clock size={15} className="text-amber-600" />
          </div>
          <p className="text-2xl font-black text-amber-600 mt-2">{totalOverdue}</p>
          <span className="text-[10px] text-zinc-400">Payment past due threshold</span>
        </div>

        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Active Exceptions
            </span>
            <Unlock size={15} className="text-blue-600" />
          </div>
          <p className="text-2xl font-black text-blue-600 mt-2">{activeExceptionsCount}</p>
          <span className="text-[10px] text-zinc-400">Admin temporary overrides</span>
        </div>

        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Total Outstanding
            </span>
            <CreditCard size={15} className="text-zinc-600" />
          </div>
          <p className="text-2xl font-black text-zinc-900 mt-2">
            {formatCurrency(totalReceivables)}
          </p>
          <span className="text-[10px] text-zinc-400">Gross market receivable</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-surface-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-surface-400" />
          <input
            type="text"
            placeholder="Search customer party..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-medium focus:outline-none focus:border-primary-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterState('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterState === 'all'
                ? 'bg-zinc-900 text-white'
                : 'bg-surface-50 text-surface-600 hover:bg-surface-100'
            }`}
          >
            All Parties ({statuses.length})
          </button>
          <button
            onClick={() => setFilterState('blocked')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterState === 'blocked'
                ? 'bg-red-600 text-white'
                : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            Blocked ({totalBlocked})
          </button>
          <button
            onClick={() => setFilterState('overdue')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterState === 'overdue'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            &gt;45 Days ({totalOverdue})
          </button>
          <button
            onClick={() => setFilterState('exception')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterState === 'exception'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            Overrides ({activeExceptionsCount})
          </button>
        </div>
      </div>

      {/* Credit Control Table */}
      <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-50 border-b border-surface-200 text-surface-600 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-4 py-3">Party / Customer</th>
                <th className="px-4 py-3 text-right">Outstanding (₹)</th>
                <th className="px-4 py-3 text-right">Credit Limit (₹)</th>
                <th className="px-4 py-3 text-center">Credit Days</th>
                <th className="px-4 py-3">Payment Overdue Age</th>
                <th className="px-4 py-3 text-center">Dispatch Status</th>
                <th className="px-4 py-3 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-surface-400">
                    Evaluating customer credit limits and overdue aging...
                  </td>
                </tr>
              ) : filteredStatuses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-surface-400">
                    No customers found matching current filters.
                  </td>
                </tr>
              ) : (
                filteredStatuses.map((st) => (
                  <tr key={st.customerId} className="hover:bg-surface-50/70 transition-colors">
                    <td className="px-4 py-3 font-bold text-zinc-900">
                      <Link href={`/customers/${st.customerId}`} className="hover:text-primary-600">
                        {st.customerName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-black text-zinc-900">
                      {formatCurrency(st.totalOutstanding)}
                    </td>
                    <td className="px-4 py-3 text-right text-surface-600 font-medium">
                      {st.creditLimit > 0 ? formatCurrency(st.creditLimit) : 'No Limit'}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-zinc-700">
                      {st.creditDays} days
                    </td>
                    <td className="px-4 py-3">
                      {st.isOverdue ? (
                        <span className="inline-flex items-center gap-1 font-bold text-red-600">
                          <AlertTriangle size={13} />
                          {st.daysOverdue} days overdue
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-medium inline-flex items-center gap-1">
                          <CheckCircle2 size={13} /> Current
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {st.isBlocked ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-red-50 text-red-700 border border-red-300 shadow-2xs">
                          <Lock size={11} strokeWidth={2.5} /> BLOCKED
                        </span>
                      ) : st.hasException ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-300">
                          <Unlock size={11} strokeWidth={2.5} /> EXCEPTION ACTIVE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300">
                          <CheckCircle2 size={11} /> ALLOWED
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                      {isAdministrator && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedCustomer(st);
                              setEditCreditLimit(String(st.creditLimit || 0));
                              setEditCreditDays(String(st.creditDays || 45));
                              setIsLimitsModalOpen(true);
                              setModalError('');
                            }}
                            className="px-2 py-1 text-[11px] font-semibold text-zinc-700 bg-surface-100 hover:bg-surface-200 rounded-md transition-colors"
                          >
                            Limits
                          </button>

                          {st.isBlocked && (
                            <button
                              onClick={() => {
                                setSelectedCustomer(st);
                                setIsExceptionModalOpen(true);
                                setModalError('');
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
                            >
                              Grant Override
                            </button>
                          )}

                          <button
                            onClick={() => handleToggleBlock(st)}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
                              st.isBlocked
                                ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                                : 'text-red-700 bg-red-50 hover:bg-red-100 border border-red-200'
                            }`}
                          >
                            {st.isBlocked ? 'Unblock' : 'Block'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grant Exception Modal */}
      {isExceptionModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-surface-200">
            <div className="flex items-center justify-between pb-3 border-b border-surface-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                  <Unlock size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-900">Grant Temporary Billing Override</h3>
                  <p className="text-[11px] text-zinc-500">Party: {selectedCustomer.customerName}</p>
                </div>
              </div>
              <button
                onClick={() => setIsExceptionModalOpen(false)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleGrantException} className="py-4 space-y-3.5 text-xs">
              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-[11px]">
                This will temporarily bypass the 45-day overdue / credit limit lock for staff members to create challans for this party.
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-700">Valid Until Date *</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-medium focus:outline-none focus:border-primary-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-700">Max Allowed Amount (₹)</label>
                  <input
                    type="number"
                    value={maxAdditionalAmount}
                    onChange={(e) => setMaxAdditionalAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-medium focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-zinc-700">Max Allowed Challans</label>
                  <input
                    type="number"
                    value={maxChallans}
                    onChange={(e) => setMaxChallans(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-medium focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-700">Admin Justification / Reason *</label>
                <textarea
                  rows={2}
                  value={exceptionReason}
                  onChange={(e) => setExceptionReason(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-medium focus:outline-none focus:border-primary-500"
                  placeholder="e.g. Promissory cheque promised by tomorrow morning"
                  required
                />
              </div>

              <div className="pt-3 border-t border-surface-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsExceptionModalOpen(false)}
                  className="px-4 py-2 font-semibold text-surface-600 hover:bg-surface-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="btn-primary py-2 px-5 font-bold shadow-xs disabled:opacity-50"
                >
                  {modalSubmitting ? 'Approving...' : 'Authorize Override Exception'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Limits Modal */}
      {isLimitsModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-surface-200">
            <div className="flex items-center justify-between pb-3 border-b border-surface-100">
              <h3 className="font-bold text-base text-zinc-900">Set Credit Policy Limits</h3>
              <button
                onClick={() => setIsLimitsModalOpen(false)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateLimits} className="py-4 space-y-3.5 text-xs">
              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="font-bold text-zinc-700">Credit Days Allowed</label>
                <input
                  type="number"
                  min="0"
                  max="180"
                  value={editCreditDays}
                  onChange={(e) => setEditCreditDays(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-bold text-zinc-900"
                  required
                />
                <span className="text-[10px] text-zinc-400">Default standard is 45 days</span>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-700">Maximum Credit Limit (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={editCreditLimit}
                  onChange={(e) => setEditCreditLimit(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-bold text-zinc-900"
                />
                <span className="text-[10px] text-zinc-400">Leave 0 for no limit</span>
              </div>

              <div className="pt-3 border-t border-surface-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsLimitsModalOpen(false)}
                  className="px-4 py-2 font-semibold text-surface-600 hover:bg-surface-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="btn-primary py-2 px-5 font-bold shadow-xs disabled:opacity-50"
                >
                  {modalSubmitting ? 'Saving...' : 'Save Limits'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

