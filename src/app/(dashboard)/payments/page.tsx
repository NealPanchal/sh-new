'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  WalletCards,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
  Building2,
  Printer,
  X,
  CreditCard,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { PaymentRecord, Customer, CustomerSite, Challan, PaymentMode } from '@/types';
import { getClientAuthToken, getCurrentUser, canManageAccounting } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sites, setSites] = useState<CustomerSite[]>([]);
  const [challans, setChallans] = useState<Challan[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [filterMode, setFilterMode] = useState('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [challanId, setChallanId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('upi');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Selected receipt for printing/viewing
  const [viewPayment, setViewPayment] = useState<PaymentRecord | null>(null);

  const currentUser = getCurrentUser();
  const canAddPayment = canManageAccounting();

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const token = getClientAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [resPay, resCust, resSites, resChallans] = await Promise.all([
        fetch('/api/payments', { headers }),
        fetch('/api/customers', { headers }),
        fetch('/api/sites', { headers }),
        fetch('/api/challans', { headers }),
      ]);

      if (resPay.ok) {
        const d = await resPay.json();
        setPayments(d.payments || []);
      }
      if (resCust.ok) {
        const d = await resCust.json();
        setCustomers(d.customers || []);
      }
      if (resSites.ok) {
        const d = await resSites.json();
        setSites(d.sites || []);
      }
      if (resChallans.ok) {
        const d = await resChallans.json();
        setChallans(d.challans || []);
      }
    } catch (err) {
      console.error('Failed to load payments data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Filtered sites based on customer selection in modal
  const customerSites = useMemo(() => {
    if (!customerId) return [];
    return sites.filter((s) => s.customer_id === customerId);
  }, [sites, customerId]);

  // Filtered challans based on customer selection in modal
  const customerChallans = useMemo(() => {
    if (!customerId) return [];
    return challans.filter((c) => c.customer_id === customerId && c.status !== 'cancelled');
  }, [challans, customerId]);

  const selectedCustomerObj = useMemo(() => {
    return customers.find((c) => c.id === customerId) || null;
  }, [customers, customerId]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerObj) {
      setSubmitError('Please select a customer');
      return;
    }
    const numAmt = Number(amount);
    if (!numAmt || numAmt <= 0) {
      setSubmitError('Please enter a valid positive payment amount');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError('');
      const token = getClientAuthToken();

      const selectedSiteObj = sites.find((s) => s.id === siteId);
      const selectedChallanObj = challans.find((c) => c.id === challanId);

      const payload = {
        customer_id: selectedCustomerObj.id,
        customer_name: selectedCustomerObj.name,
        site_id: selectedSiteObj?.id || undefined,
        site_name: selectedSiteObj?.name || undefined,
        challan_id: selectedChallanObj?.id || undefined,
        challan_number: selectedChallanObj?.challan_number || undefined,
        amount: numAmt,
        payment_mode: paymentMode,
        payment_date: paymentDate,
        reference_no: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubmitError(data.error || 'Failed to record payment');
        return;
      }

      setIsModalOpen(false);
      setCustomerId('');
      setSiteId('');
      setChallanId('');
      setAmount('');
      setReferenceNo('');
      setNotes('');
      await fetchInitialData();

      // Show receipt view modal immediately for the new payment
      if (data.payment) {
        setViewPayment(data.payment);
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Error communicating with server');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const matchesSearch =
        p.receipt_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.reference_no && p.reference_no.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.challan_number && p.challan_number.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCustomer = filterCustomer === 'all' || p.customer_name === filterCustomer;
      const matchesMode = filterMode === 'all' || p.payment_mode === filterMode;

      return matchesSearch && matchesCustomer && matchesMode;
    });
  }, [payments, searchTerm, filterCustomer, filterMode]);

  // Overall KPI metrics
  const totalCollected = useMemo(() => {
    return payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  }, [payments]);

  const thisMonthCollected = useMemo(() => {
    const curYearMonth = new Date().toISOString().substring(0, 7);
    return payments
      .filter((p) => (p.payment_date || p.created_at || '').startsWith(curYearMonth))
      .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  }, [payments]);

  const uniqueCustomers = useMemo(() => {
    return Array.from(new Set(payments.map((p) => p.customer_name).filter(Boolean)));
  }, [payments]);

  const getModeBadgeClass = (mode: PaymentMode) => {
    switch (mode) {
      case 'upi':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'bank_transfer':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'cheque':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'cash':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-zinc-50 text-zinc-700 border-zinc-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg">
              <WalletCards className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">
                Payment Collections & Receipts
              </h1>
              <p className="text-xs text-zinc-500 font-medium">
                Record party payments, generate official receipts, and credit site ledgers in real-time
              </p>
            </div>
          </div>
        </div>

        {canAddPayment && (
          <button
            onClick={() => {
              setIsModalOpen(true);
              setSubmitError('');
            }}
            className="btn-primary flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Record Payment Received</span>
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Total Collections
            </span>
            <div className="p-1.5 bg-emerald-50 rounded-md text-emerald-600">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-2">
            {formatCurrency(totalCollected)}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">Across {payments.length} receipts</p>
        </div>

        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              This Month Collection
            </span>
            <div className="p-1.5 bg-primary-50 rounded-md text-primary-600">
              <Calendar size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-zinc-900 mt-2">
            {formatCurrency(thisMonthCollected)}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">Current active billing month</p>
        </div>

        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Payment Methods
            </span>
            <div className="p-1.5 bg-purple-50 rounded-md text-purple-600">
              <CreditCard size={16} />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs">
            <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-bold text-[11px]">UPI</span>
            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[11px]">NEFT / RTGS</span>
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[11px]">Cash</span>
            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold text-[11px]">Cheque</span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-2">All modes integrated with Tally</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-surface-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-surface-400" />
          <input
            type="text"
            placeholder="Search receipt #, customer, reference no, challan #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-medium focus:outline-none focus:border-primary-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={filterCustomer}
            onChange={(e) => setFilterCustomer(e.target.value)}
            className="bg-surface-50 border border-surface-200 px-3 py-2 rounded-lg text-xs font-medium text-zinc-700 cursor-pointer"
          >
            <option value="all">All Parties</option>
            {uniqueCustomers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value)}
            className="bg-surface-50 border border-surface-200 px-3 py-2 rounded-lg text-xs font-medium text-zinc-700 cursor-pointer"
          >
            <option value="all">All Modes</option>
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cheque">Cheque</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>

          {(searchTerm || filterCustomer !== 'all' || filterMode !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterCustomer('all');
                setFilterMode('all');
              }}
              className="text-xs text-red-600 hover:text-red-700 font-semibold px-2 py-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs min-w-[720px]">
            <thead className="bg-surface-50 border-b border-surface-200 text-surface-600 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-4 py-3">Receipt #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer / Party</th>
                <th className="px-4 py-3">Site / Project</th>
                <th className="px-4 py-3 text-right">Amount Received</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Reference / Txn ID</th>
                <th className="px-4 py-3">Linked Challan</th>
                <th className="px-4 py-3 text-center">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-surface-400">
                    Loading payment records...
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center text-zinc-400">
                      <WalletCards className="w-10 h-10 mb-2 stroke-[1.5] text-zinc-300" />
                      <p className="font-semibold text-zinc-600">No payment receipts found</p>
                      <p className="text-[11px] mt-0.5">Click "Record Payment Received" to log a collection.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-50/70 transition-colors">
                    <td className="px-4 py-3 font-bold text-zinc-900">{p.receipt_number}</td>
                    <td className="px-4 py-3 text-surface-600">{formatDate(p.payment_date)}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-zinc-900 block">{p.customer_name}</span>
                    </td>
                    <td className="px-4 py-3 text-surface-600">
                      {p.site_name ? (
                        <span className="inline-flex items-center gap-1 font-medium text-zinc-700">
                          <Building2 size={12} className="text-surface-400" />
                          {p.site_name}
                        </span>
                      ) : (
                        <span className="text-surface-400 italic">Party General</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-emerald-600 text-sm">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${getModeBadgeClass(
                          p.payment_mode
                        )}`}
                      >
                        {p.payment_mode.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-surface-700">
                      {p.reference_no || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {p.challan_number ? (
                        <Link
                          href={`/challans/${p.challan_id}`}
                          className="font-semibold text-primary-600 hover:underline"
                        >
                          {p.challan_number}
                        </Link>
                      ) : (
                        <span className="text-surface-400 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setViewPayment(p)}
                        className="px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
                      >
                        Receipt
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-surface-200">
            <div className="flex items-center justify-between pb-3 border-b border-surface-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                  <WalletCards className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-900">Record Payment Received</h3>
                  <p className="text-[11px] text-zinc-500">Record collection and instantly credit ledger</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="py-4 space-y-4">
              {submitError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Customer Selector */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                  <span>Customer / Party</span>
                  <span className="text-red-500">*</span>
                </label>
                <select
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setSiteId('');
                    setChallanId('');
                  }}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-primary-500"
                  required
                >
                  <option value="">-- Select Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company_name ? `(${c.company_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Site Selector (Optional) */}
              {customerId && customerSites.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 flex items-center justify-between">
                    <span>Target Site / Project (Optional)</span>
                    <span className="text-[10px] text-zinc-400">Allocates to specific site ledger</span>
                  </label>
                  <select
                    value={siteId}
                    onChange={(e) => setSiteId(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-medium focus:outline-none focus:border-primary-500"
                  >
                    <option value="">-- Party General (All Sites) --</option>
                    {customerSites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.location ? `— ${s.location}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Linked Challan (Optional) */}
              {customerId && customerChallans.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 flex items-center justify-between">
                    <span>Link to Specific Challan (Optional)</span>
                    <span className="text-[10px] text-zinc-400">Direct bill settlement</span>
                  </label>
                  <select
                    value={challanId}
                    onChange={(e) => setChallanId(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-medium focus:outline-none focus:border-primary-500"
                  >
                    <option value="">-- General Account Settlement --</option>
                    {customerChallans.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.challan_number} ({formatDate(c.challan_date)}) — ₹{c.total_amount?.toLocaleString('en-IN')}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Amount & Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <span>Amount Received (₹)</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="e.g. 50000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-bold text-emerald-600 focus:outline-none focus:border-primary-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-primary-500"
                  >
                    <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                    <option value="bank_transfer">Bank Transfer (NEFT / RTGS / IMPS)</option>
                    <option value="cheque">Cheque</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other Adjustment</option>
                  </select>
                </div>
              </div>

              {/* Payment Date & Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700">Payment Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-medium focus:outline-none focus:border-primary-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700">
                    Reference / UTR / Cheque #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UTR12389472"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-mono focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700">Remarks / Memo</label>
                <input
                  type="text"
                  placeholder="e.g. Advance paid against order or site clearance"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-medium focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="pt-3 border-t border-surface-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-surface-600 hover:bg-surface-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary py-2 px-5 text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Recording...' : 'Generate Receipt & Update Ledger'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Payment Receipt Voucher Modal */}
      {viewPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-surface-200">
            <div className="flex items-center justify-between pb-3 border-b border-surface-100">
              <div>
                <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">
                  Official Payment Receipt
                </span>
                <h3 className="font-bold text-lg text-zinc-900">{viewPayment.receipt_number}</h3>
              </div>
              <button
                onClick={() => setViewPayment(null)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                <span className="text-[11px] text-emerald-800 font-semibold block uppercase">Amount Received</span>
                <p className="text-3xl font-black text-emerald-700 mt-1">
                  {formatCurrency(viewPayment.amount)}
                </p>
                <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-emerald-800 border border-emerald-300">
                  {viewPayment.payment_mode.replace('_', ' ').toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-surface-50 p-3 rounded-xl border border-surface-200">
                <div>
                  <span className="text-zinc-400 text-[10px] uppercase font-semibold block">Customer</span>
                  <span className="font-bold text-zinc-900">{viewPayment.customer_name}</span>
                  {viewPayment.site_name && (
                    <span className="text-zinc-500 block text-[11px]">Site: {viewPayment.site_name}</span>
                  )}
                </div>
                <div>
                  <span className="text-zinc-400 text-[10px] uppercase font-semibold block">Date Received</span>
                  <span className="font-bold text-zinc-900">{formatDate(viewPayment.payment_date)}</span>
                  {viewPayment.challan_number && (
                    <span className="text-primary-600 block text-[11px] font-semibold">
                      Challan: {viewPayment.challan_number}
                    </span>
                  )}
                </div>
              </div>

              {viewPayment.reference_no && (
                <div className="bg-surface-50 p-2.5 rounded-lg border border-surface-200 flex justify-between items-center">
                  <span className="text-zinc-500 font-semibold">Transaction / Ref:</span>
                  <span className="font-mono font-bold text-zinc-900">{viewPayment.reference_no}</span>
                </div>
              )}

              {viewPayment.notes && (
                <div className="text-zinc-600 text-[11px] italic bg-zinc-50 p-2.5 rounded-lg border border-surface-100">
                  "{viewPayment.notes}"
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-surface-100 flex justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-surface-100 hover:bg-surface-200 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Printer size={14} />
                <span>Print Receipt</span>
              </button>
              <button
                onClick={() => setViewPayment(null)}
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

