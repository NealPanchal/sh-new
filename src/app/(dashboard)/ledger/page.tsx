'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Calendar,
  Building2,
  Download,
  Printer,
  Search,
  WalletCards,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  User,
  CheckCircle2,
  AlertCircle,
  Plus,
  Edit2,
  Trash2,
  Check,
  ShieldCheck,
  ShieldAlert,
  Layers,
  ArrowLeft,
  RefreshCw,
  Clock,
  ArrowLeftRight,
  FileText,
  X,
  ExternalLink,
} from 'lucide-react';
import { Customer, CustomerSite, CustomerLedgerEntry, PaymentMode } from '@/types';
import { getClientAuthToken, getCurrentUser, isAdmin, canManageAccounting } from '@/lib/auth';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { exportLedgerToPDF } from '@/lib/pdf-ledger';
import { PaidRubberStamp } from '@/components/accounting/paid-rubber-stamp';

// Reusable accounting modules for the tabs
import SiteAccountingPage from '@/app/(dashboard)/accounting/sites/page';
import CreditControlPage from '@/app/(dashboard)/credit-control/page';
import TallyIntegrationPage from '@/app/(dashboard)/tally/page';

function formatDateDisplay(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()}-${months[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
  } catch {
    return dateStr;
  }
}

function formatAmountDisplay(val: number | undefined | null): string {
  if (val === undefined || val === null || val === 0) return '';
  return val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderPaymentTypeBadge(type?: string, isDebit?: boolean) {
  const t = (type || (isDebit ? 'Sales GST' : 'Receipt')).trim();
  const lower = t.toLowerCase();

  if (lower === 'upi') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-800 border border-purple-200">
        UPI
      </span>
    );
  }
  if (lower === 'cash') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
        Cash
      </span>
    );
  }
  if (lower === 'cheque') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
        Cheque
      </span>
    );
  }
  if (lower === 'bank transfer' || lower.includes('bank') || lower.includes('hdfc')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-800 border border-blue-200">
        Bank Transfer
      </span>
    );
  }
  if (lower === 'sales gst') {
    return <span className="text-surface-700 font-semibold">{t}</span>;
  }
  return <span className="text-surface-700 font-semibold">{t}</span>;
}

export default function MasterPartyLedgerPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'ledger' | 'sites' | 'credit' | 'tally'>('ledger');

  // Customer & Site lists
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('cust_rk_sales');

  // Filter toolbar
  const [fromDate, setFromDate] = useState('2024-02-01');
  const [toDate, setToDate] = useState('2027-03-31');
  const [typeFilter, setTypeFilter] = useState('all');
  const [siteFilter, setSiteFilter] = useState('all');
  const [searchChallanNo, setSearchChallanNo] = useState('');

  // Ledger computation results
  const [loading, setLoading] = useState(false);
  const [ledgerData, setLedgerData] = useState<{
    openingBalance: number;
    totalDebit: number;
    totalCredit: number;
    closingBalance: number;
    verifiedSiteDebits: number;
    verifiedSiteCredits: number;
    netVerifiedSiteAdjustment: number;
    verifiedClosingBalance: number;
    entries: CustomerLedgerEntry[];
    sites: CustomerSite[];
  }>({
    openingBalance: 27500,
    totalDebit: 0,
    totalCredit: 0,
    closingBalance: 0,
    verifiedSiteDebits: 0,
    verifiedSiteCredits: 0,
    netVerifiedSiteAdjustment: 0,
    verifiedClosingBalance: 0,
    entries: [],
    sites: [],
  });

  // Modal dialog states
  const [showAddSiteModal, setShowAddSiteModal] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteOpening, setNewSiteOpening] = useState('0');
  const [newSiteCredit, setNewSiteCredit] = useState('0');
  const [newSiteDebit, setNewSiteDebit] = useState('0');

  const [editingSite, setEditingSite] = useState<CustomerSite | null>(null);
  const [editSiteName, setEditSiteName] = useState('');
  const [editSiteOpening, setEditSiteOpening] = useState('0');
  const [editSiteCredit, setEditSiteCredit] = useState('0');
  const [editSiteDebit, setEditSiteDebit] = useState('0');

  const [showAddEntryModal, setShowAddEntryModal] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [entryParticulars, setEntryParticulars] = useState('');
  const [entryType, setEntryType] = useState<'Receipt' | 'Sales GST' | 'Payment' | 'Journal'>('Receipt');
  const [entryVoucherNo, setEntryVoucherNo] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [entrySiteName, setEntrySiteName] = useState('');

  const [showUnverifyModal, setShowUnverifyModal] = useState(false);
  const [unverifyTargetSite, setUnverifyTargetSite] = useState<CustomerSite | null>(null);
  const [unverifyReason, setUnverifyReason] = useState('');

  // Payment Received Modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<PaymentMode>('bank_transfer');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payRef, setPayRef] = useState('');
  const [paySiteName, setPaySiteName] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  // Toast / feedback message
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Check URL query parameters and user session on mount
  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'sites') setActiveTab('sites');
      else if (tab === 'credit') setActiveTab('credit');
      else if (tab === 'tally') setActiveTab('tally');
    }
  }, []);

  // Fetch customers on mount
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const token = getClientAuthToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch('/api/customers', { headers });
        if (res.ok) {
          const data = await res.json();
          const list: Customer[] = data.customers || [];
          setCustomers(list);
          if (list.length > 0 && !selectedCustomerId) {
            setSelectedCustomerId(list[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load customers:', err);
      }
    };
    fetchCustomers();
  }, []);

  // Fetch ledger data whenever selected customer, date filters, or triggers change
  const fetchLedger = async () => {
    if (!selectedCustomerId) return;
    try {
      setLoading(true);
      const token = getClientAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const params = new URLSearchParams({ customerId: selectedCustomerId });
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);
      if (typeFilter && typeFilter !== 'all') params.append('type', typeFilter);
      if (siteFilter && siteFilter !== 'all') params.append('siteName', siteFilter);

      const res = await fetch(`/api/ledger?${params.toString()}`, { headers });
      if (res.ok) {
        const d = await res.json();
        setLedgerData(d.ledger);
      }
    } catch (err) {
      console.error('Failed to load ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [selectedCustomerId, fromDate, toDate, typeFilter, siteFilter]);

  // Selected customer object
  const selectedCustomer = useMemo<Customer>(() => {
    return (
      customers.find((c) => c.id === selectedCustomerId || c.name === selectedCustomerId) || {
        id: 'cust_rk_sales',
        user_id: 'admin',
        name: 'R K Sales',
        business_name: 'R K Sales',
        company_name: 'R K Sales',
        contact_person: 'Ramesh Kumar',
        billing_address:
          '3rd Floor, Building No. A-4,\nFlat No 307,\nAvadh Complex, Kasheli Village,\nBhiwandi Railway Station,\nKasheli Bhiwandi\nThane-421302',
        delivery_address: 'Kasheli Bhiwandi, Thane-421302',
        phone: '02225387687',
        gstin: '27AABCR1234F1ZP',
        notes: null,
        is_active: true,
        created_at: '2024-02-01T00:00:00.000Z',
        updated_at: '2024-02-01T00:00:00.000Z',
      }
    );
  }, [customers, selectedCustomerId]);

  // Filtered entries by search input
  const displayEntries = useMemo(() => {
    let list = ledgerData.entries || [];
    if (searchChallanNo.trim()) {
      const q = searchChallanNo.trim().toLowerCase();
      list = list.filter(
        (e) =>
          (e.reference && e.reference.toLowerCase().includes(q)) ||
          (e.particulars && e.particulars.toLowerCase().includes(q))
      );
    }
    return list;
  }, [ledgerData.entries, searchChallanNo]);

  // Split entries into Period 1 (Feb 2024) and Period 2 (Apr 2024 onwards) if R K Sales
  const isRKSales =
    selectedCustomer.name?.toLowerCase().includes('r k sales') ||
    selectedCustomer.id === 'cust_rk_sales';

  const { period1Entries, period2Entries, period1TotalDebit, period1TotalCredit, period1Closing } =
    useMemo(() => {
      if (!isRKSales) {
        return {
          period1Entries: [],
          period2Entries: displayEntries,
          period1TotalDebit: 0,
          period1TotalCredit: 0,
          period1Closing: 0,
        };
      }

      const p1 = displayEntries.filter((e) => e.date < '2024-04-01');
      const p2 = displayEntries.filter((e) => e.date >= '2024-04-01');

      const d1 = p1.reduce((sum, e) => sum + (e.debit || 0), 0);
      const c1 = p1.reduce((sum, e) => sum + (e.credit || 0), 0);
      const closing1 = d1 - c1; // 68,500 - 41,000 = 27,500

      return {
        period1Entries: p1,
        period2Entries: p2,
        period1TotalDebit: d1,
        period1TotalCredit: c1,
        period1Closing: closing1,
      };
    }, [isRKSales, displayEntries]);

  // Period 2 calculations (with verified site adjustments added)
  const period2Calculations = useMemo(() => {
    const opening = period1Entries.length > 0 ? period1Closing : (ledgerData.openingBalance || 0);
    const debitEntries = period2Entries.reduce((sum, e) => sum + (e.debit || 0), 0);
    const creditEntries = period2Entries.reduce((sum, e) => sum + (e.credit || 0), 0);

    // Sum of verified site adjustments
    const verifiedNet = ledgerData.netVerifiedSiteAdjustment || 0;

    const totalDebits = opening + debitEntries;
    const totalCredits = creditEntries;
    const finalClosing = totalDebits - totalCredits + verifiedNet;
    const balancedTotal = Math.max(totalDebits, totalCredits + finalClosing);

    return {
      opening,
      debitEntries,
      creditEntries,
      verifiedNet,
      totalDebits,
      totalCredits,
      finalClosing,
      balancedTotal,
    };
  }, [isRKSales, period2Entries, ledgerData]);

  // Sites totals
  const sitesSummary = useMemo(() => {
    const list = ledgerData.sites || [];
    let sumOpening = 0;
    let sumCredit = 0;
    let sumDebit = 0;
    let sumCurrent = 0;

    list.forEach((s) => {
      const op = Number(s.opening_balance) || 0;
      const cr = Number(s.credit_adjustment) || 0;
      const db = Number(s.debit_adjustment) || 0;
      const cur = op + db - cr;

      sumOpening += op;
      sumCredit += cr;
      sumDebit += db;
      sumCurrent += cur;
    });

    return { sumOpening, sumCredit, sumDebit, sumCurrent };
  }, [ledgerData.sites]);

  // Handlers for Sites Balance Adjustments
  const handleVerifySite = async (site: CustomerSite) => {
    try {
      const token = getClientAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch('/api/sites', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ siteId: site.id, action: 'verify' }),
      });

      if (res.ok) {
        showToast(`Site "${site.site_name}" verified! Balances applied to Closing Balance.`);
        await fetchLedger();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to verify site', 'error');
      }
    } catch {
      showToast('Error verifying site', 'error');
    }
  };

  const handleOpenUnverifyModal = (site: CustomerSite) => {
    setUnverifyTargetSite(site);
    setUnverifyReason('');
    setShowUnverifyModal(true);
  };

  const handleConfirmUnverify = async () => {
    if (!unverifyTargetSite) return;
    try {
      const token = getClientAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch('/api/sites', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          siteId: unverifyTargetSite.id,
          action: 'unverify',
          reason: unverifyReason || 'Manual adjustment revision',
        }),
      });

      if (res.ok) {
        showToast(`Site "${unverifyTargetSite.site_name}" unverified. Ready for editing.`);
        setShowUnverifyModal(false);
        setUnverifyTargetSite(null);
        await fetchLedger();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to unverify site', 'error');
      }
    } catch {
      showToast('Error un-verifying site', 'error');
    }
  };

  const handleOpenEditSite = (site: CustomerSite) => {
    setEditingSite(site);
    setEditSiteName(site.site_name);
    setEditSiteOpening(String(site.opening_balance || 0));
    setEditSiteCredit(String(site.credit_adjustment || 0));
    setEditSiteDebit(String(site.debit_adjustment || 0));
  };

  const handleSaveEditSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSite) return;

    try {
      const token = getClientAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch('/api/sites', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          siteId: editingSite.id,
          site_name: editSiteName,
          opening_balance: Number(editSiteOpening) || 0,
          credit_adjustment: Number(editSiteCredit) || 0,
          debit_adjustment: Number(editSiteDebit) || 0,
        }),
      });

      if (res.ok) {
        showToast(`Site "${editSiteName}" balance updated!`);
        setEditingSite(null);
        await fetchLedger();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to update site', 'error');
      }
    } catch {
      showToast('Error updating site', 'error');
    }
  };

  const handleDeleteSite = async (site: CustomerSite) => {
    if (!confirm(`Are you sure you want to delete site "${site.site_name}"?`)) return;

    try {
      const token = getClientAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(`/api/sites?id=${site.id}`, {
        method: 'DELETE',
        headers,
      });

      if (res.ok) {
        showToast(`Site "${site.site_name}" removed`);
        await fetchLedger();
      } else {
        showToast('Failed to delete site', 'error');
      }
    } catch {
      showToast('Error deleting site', 'error');
    }
  };

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteName.trim()) {
      showToast('Site name is required', 'error');
      return;
    }

    try {
      const token = getClientAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch('/api/sites', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer_id: selectedCustomerId,
          site_name: newSiteName.trim(),
          opening_balance: Number(newSiteOpening) || 0,
          credit_adjustment: Number(newSiteCredit) || 0,
          debit_adjustment: Number(newSiteDebit) || 0,
        }),
      });

      if (res.ok) {
        showToast(`New site "${newSiteName}" added and verified!`);
        setShowAddSiteModal(false);
        setNewSiteName('');
        setNewSiteOpening('0');
        setNewSiteCredit('0');
        setNewSiteDebit('0');
        await fetchLedger();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to add site', 'error');
      }
    } catch {
      showToast('Error adding site', 'error');
    }
  };

  // Add Manual Ledger Entry
  const handleCreateManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(entryAmount);
    if (!numAmt || numAmt <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    let isDebit = entryType === 'Sales GST' || entryType === 'Payment';
    let formattedParticulars = entryParticulars.trim();
    if (isDebit && !formattedParticulars.toLowerCase().startsWith('to ')) {
      formattedParticulars = `To ${formattedParticulars}`;
    } else if (!isDebit && !formattedParticulars.toLowerCase().startsWith('by ')) {
      formattedParticulars = `By ${formattedParticulars}`;
    }

    try {
      const token = getClientAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch('/api/ledger', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer_id: selectedCustomerId,
          date: entryDate,
          particulars: formattedParticulars,
          payment_type: entryType,
          voucher_no: entryVoucherNo || `VCH-${Date.now().toString().slice(-4)}`,
          debit: isDebit ? numAmt : 0,
          credit: !isDebit ? numAmt : 0,
          site_name: entrySiteName || undefined,
        }),
      });

      if (res.ok) {
        showToast('Ledger entry added successfully!');
        setShowAddEntryModal(false);
        setEntryParticulars('');
        setEntryAmount('');
        setEntryVoucherNo('');
        await fetchLedger();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to add ledger entry', 'error');
      }
    } catch {
      showToast('Error adding ledger entry', 'error');
    }
  };

  // Calculated effective closing balance & settled status
  const effectiveClosingBalance = isRKSales
    ? period2Calculations.finalClosing
    : (ledgerData.verifiedClosingBalance ?? ledgerData.closingBalance ?? 0);
  const isAccountSettled =
    (isRKSales ? period2Calculations.totalDebits > 0 : (ledgerData.totalDebit || 0) > 0) &&
    effectiveClosingBalance <= 0;

  // Record Payment Received
  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(payAmount);
    if (!numAmt || numAmt <= 0) {
      showToast('Please enter a valid positive payment amount', 'error');
      return;
    }

    try {
      setIsRecordingPayment(true);
      const token = getClientAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer_id: selectedCustomerId,
          customer_name: selectedCustomer.name || selectedCustomer.business_name,
          site_name: paySiteName || undefined,
          amount: numAmt,
          payment_mode: payMode,
          payment_date: payDate,
          reference_no: payRef.trim() || undefined,
          notes: payNotes.trim() || undefined,
        }),
      });

      const d = await res.json();
      if (!res.ok || !d.success) {
        showToast(d.error || 'Failed to record payment', 'error');
        return;
      }

      showToast(`Payment of ₹${numAmt.toLocaleString('en-IN')} recorded & credited to ledger!`);
      setShowPaymentModal(false);
      setPayAmount('');
      setPayRef('');
      setPayNotes('');
      await fetchLedger();
    } catch {
      showToast('Network error recording payment', 'error');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  // Export PDF Handler
  const handleExportPDF = () => {
    if (!selectedCustomer) return;
    exportLedgerToPDF({
      customer: selectedCustomer,
      fromDate,
      toDate,
      openingBalance: isRKSales ? 27500 : ledgerData.openingBalance,
      totalDebit: ledgerData.totalDebit,
      totalCredit: ledgerData.totalCredit,
      closingBalance: effectiveClosingBalance,
      entries: displayEntries,
      sites: ledgerData.sites || [],
      isAccountPaid: isAccountSettled,
    });
    showToast(`PDF exported for ${selectedCustomer.name}!`);
  };

  // If user is employee, show restricted access
  if (currentUser?.role === 'employee') {
    return (
      <div className="card p-8 sm:p-12 text-center max-w-lg mx-auto my-12 space-y-4 shadow-sm border border-surface-200">
        <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
          <ShieldAlert size={28} />
        </div>
        <h2 className="text-lg font-bold text-surface-900">Ledger Restricted to Admin</h2>
        <p className="text-xs text-surface-500 max-w-sm mx-auto leading-relaxed">
          You are currently signed in as <b>{currentUser?.name}</b> (Staff Account).
          Party ledgers, double-entry financial statements, and site adjustments are only accessible by Showhouse Administrators and Accountants.
        </p>
        <Link
          href="/"
          className="btn-primary inline-flex items-center gap-1.5 text-xs py-2 px-4 shadow-xs mt-2"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-20 max-w-7xl mx-auto select-none print:p-0 print:m-0 print:max-w-none">
      {/* Toast Notification */}
      {toast && (
        <div
          className={cn(
            'fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold flex items-center gap-2 transition-all animate-in fade-in slide-in-from-top-2',
            toast.type === 'success'
              ? 'bg-emerald-900 text-white border-emerald-700'
              : toast.type === 'error'
              ? 'bg-rose-900 text-white border-rose-700'
              : 'bg-zinc-900 text-white border-zinc-700'
          )}
        >
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Accounting Hub Top Bar / Sub-tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-2.5 rounded-xl border border-surface-200 shadow-2xs print:hidden">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab('ledger')}
            className={cn(
              'px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer',
              activeTab === 'ledger'
                ? 'bg-zinc-950 text-white shadow-xs'
                : 'bg-surface-50 text-surface-600 hover:bg-surface-100 hover:text-surface-900'
            )}
          >
            <BookOpen size={14} className={activeTab === 'ledger' ? 'text-amber-400' : ''} />
            <span>Ledger Account (Tally)</span>
          </button>

          <button
            onClick={() => setActiveTab('sites')}
            className={cn(
              'px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer',
              activeTab === 'sites'
                ? 'bg-zinc-950 text-white shadow-xs'
                : 'bg-surface-50 text-surface-600 hover:bg-surface-100 hover:text-surface-900'
            )}
          >
            <Building2 size={14} className={activeTab === 'sites' ? 'text-amber-400' : ''} />
            <span>Site Accounting (+/-)</span>
          </button>

          <button
            onClick={() => setActiveTab('credit')}
            className={cn(
              'px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer',
              activeTab === 'credit'
                ? 'bg-zinc-950 text-white shadow-xs'
                : 'bg-surface-50 text-surface-600 hover:bg-surface-100 hover:text-surface-900'
            )}
          >
            <ShieldAlert size={14} className={activeTab === 'credit' ? 'text-amber-400' : ''} />
            <span>Credit Control (45-Day Limits)</span>
          </button>

          <button
            onClick={() => setActiveTab('tally')}
            className={cn(
              'px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer',
              activeTab === 'tally'
                ? 'bg-zinc-950 text-white shadow-xs'
                : 'bg-surface-50 text-surface-600 hover:bg-surface-100 hover:text-surface-900'
            )}
          >
            <ArrowLeftRight size={14} className={activeTab === 'tally' ? 'text-amber-400' : ''} />
            <span>Tally XML Sync</span>
          </button>
        </div>

        {/* Customer Selector Dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs font-bold text-surface-600 flex items-center gap-1">
            <User size={13} className="text-[#ea580c]" />
            <span className="hidden md:inline">Party:</span>
          </label>
          <select
            value={selectedCustomerId}
            onChange={(e) => {
              setSelectedCustomerId(e.target.value);
              setSiteFilter('all');
            }}
            className="input text-xs py-1.5 px-2.5 font-bold text-surface-900 bg-surface-50 border-surface-300 rounded-lg min-w-[210px]"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.business_name} {c.company_name ? `(${c.company_name})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Render Alternate Tabs if active */}
      {activeTab === 'sites' && (
        <div className="bg-white p-4 rounded-xl border border-surface-200">
          <SiteAccountingPage />
        </div>
      )}

      {activeTab === 'credit' && (
        <div className="bg-white p-4 rounded-xl border border-surface-200">
          <CreditControlPage />
        </div>
      )}

      {activeTab === 'tally' && (
        <div className="bg-white p-4 rounded-xl border border-surface-200">
          <TallyIntegrationPage />
        </div>
      )}

      {/* ============================================================ */}
      {/* PRIMARY TAB: LEDGER ACCOUNT (MATCHES REFERENCE PHOTO)        */}
      {/* ============================================================ */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          {/* Top Header Section (Matching Photo) */}
          <div className="bg-white p-5 rounded-xl border border-surface-200 shadow-2xs relative print:border-none print:shadow-none print:p-0">
            {/* Action Buttons: Responsive for Mobile & Desktop */}
            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5 mb-3 sm:mb-0 sm:absolute sm:top-4 sm:right-4 print:hidden">
              <Link
                href="/"
                className="px-2.5 py-1.5 text-xs font-semibold text-surface-700 bg-surface-100 hover:bg-surface-200 rounded-lg flex items-center gap-1 transition-colors border border-surface-200 active:scale-95"
              >
                <ArrowLeft size={13} />
                <span>Back</span>
              </Link>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setPayAmount(effectiveClosingBalance > 0 ? String(effectiveClosingBalance) : '');
                    setPaySiteName(siteFilter !== 'all' ? siteFilter : '');
                    setShowPaymentModal(true);
                  }}
                  className="px-2.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs active:scale-95 cursor-pointer"
                  title="Record Payment Received for this Customer"
                >
                  <WalletCards size={14} />
                  <span>Record Payment</span>
                </button>

                <button
                  onClick={() => window.print()}
                  className="px-2.5 py-1.5 text-xs font-semibold text-surface-700 bg-surface-100 hover:bg-surface-200 rounded-lg flex items-center gap-1.5 transition-colors border border-surface-200 active:scale-95 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Print</span>
                </button>

                <button
                  onClick={handleExportPDF}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-[#ea580c] hover:bg-[#c2410c] rounded-lg flex items-center gap-1.5 transition-colors shadow-xs active:scale-95 cursor-pointer"
                >
                  <Download size={14} />
                  <span>Export PDF</span>
                </button>
              </div>
            </div>

            {/* Company Masthead (Centered) */}
            <div className="text-center space-y-0.5 max-w-xl mx-auto pt-1">
              <h1 className="text-base sm:text-lg font-black text-surface-900 tracking-tight">
                Show House Concepts &amp; Designs LLP-(From 1 Apr-2023)
              </h1>
              <p className="text-[11px] font-bold text-surface-700 uppercase tracking-wide">
                VISHRAM BAUG
              </p>
              <p className="text-[11px] text-surface-600 uppercase">
                LBS ROAD, NEAR MAKHMALI TALAO
              </p>
              <p className="text-[11px] text-surface-600 uppercase">
                THANE (WEST)
              </p>
              <p className="text-[11px] text-surface-600">
                91-25387683/25387687
              </p>
              <p className="text-[11px] text-surface-600">
                Contact : 02225387687
              </p>
              <p className="text-[11px] text-surface-600 font-medium">
                E-Mail : accounts@showhousedecor.com
              </p>
            </div>

            <div className="w-full h-px bg-surface-200 my-4" />

            {/* Customer / Party Details (Centered) */}
            <div className="text-center space-y-0.5 max-w-md mx-auto">
              <h2 className="text-xl sm:text-2xl font-black text-surface-950 tracking-tight">
                {selectedCustomer.name || selectedCustomer.business_name || 'R K Sales'}
              </h2>
              <p className="text-xs font-bold text-surface-700">
                Ledger Account
              </p>
              <div className="text-[11px] text-surface-600 leading-snug whitespace-pre-line pt-0.5">
                {selectedCustomer.billing_address ||
                  '3rd Floor, Building No. A-4,\nFlat No 307,\nAvadh Complex, Kasheli Village,\nBhiwandi Railway Station,\nKasheli Bhiwandi\nThane-421302'}
              </div>
            </div>

            {/* Settled Rubber Stamp: Compact, Elegant & 100% Transparent */}
            {isAccountSettled && (
              <div className="absolute top-3 right-3 sm:top-4 sm:right-6 pointer-events-none select-none z-10 print:top-2 print:right-4">
                <PaidRubberStamp
                  size="sm"
                  title="PAID"
                  subtitle="SHOWHOUSE"
                  date={formatDateDisplay(new Date().toISOString())}
                  refNo="SETTLED"
                  color="emerald"
                  angle={-6}
                />
              </div>
            )}
          </div>

          {/* Filter Toolbar Card (Matching Photo) */}
          <div className="bg-white p-3.5 rounded-xl border border-surface-200 shadow-2xs space-y-2 print:hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 items-end">
              {/* From Date */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-surface-600">From Date</label>
                <div className="relative">
                  <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="input text-xs py-1.5 pl-8 pr-2 w-full font-medium"
                  />
                </div>
              </div>

              {/* To Date */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-surface-600">To Date</label>
                <div className="relative">
                  <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="input text-xs py-1.5 pl-8 pr-2 w-full font-medium"
                  />
                </div>
              </div>

              {/* Type Dropdown */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-surface-600">Type</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="input text-xs py-1.5 px-2.5 w-full font-medium"
                >
                  <option value="all">All</option>
                  <option value="Receipt">Receipt (All)</option>
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Sales GST">Sales GST</option>
                  <option value="Payment">Payment</option>
                  <option value="Goods Return">Goods Return</option>
                  <option value="Adjustment">Adjustment</option>
                </select>
              </div>

              {/* Site Dropdown */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-surface-600">Site</label>
                <select
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value)}
                  className="input text-xs py-1.5 px-2.5 w-full font-medium"
                >
                  <option value="all">All Sites</option>
                  {ledgerData.sites?.map((s) => (
                    <option key={s.id} value={s.site_name}>
                      {s.site_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Challan No. */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-surface-600">Challan No.</label>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchChallanNo}
                    onChange={(e) => setSearchChallanNo(e.target.value)}
                    placeholder="Search Challan No."
                    className="input text-xs py-1.5 pl-8 pr-2 w-full font-medium"
                  />
                </div>
              </div>

              {/* Apply & Add Entry Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchLedger}
                  className="btn-primary py-1.5 px-4 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-lg flex items-center justify-center gap-1.5 shadow-xs w-full sm:w-auto"
                >
                  <Search size={13} />
                  <span>Apply</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddEntryModal(true)}
                  className="btn-secondary py-1.5 px-3 text-xs font-bold text-surface-800 bg-surface-100 hover:bg-surface-200 rounded-lg flex items-center justify-center gap-1 whitespace-nowrap shadow-xs"
                  title="Record manual receipt, payment or adjustment"
                >
                  <Plus size={13} />
                  <span>Add Entry</span>
                </button>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* LEDGER TRANSACTION TABLE                                     */}
          {/* ============================================================ */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-2xs overflow-hidden">
            {/* Mobile Scroll Hint Banner */}
            <div className="sm:hidden px-3 py-1.5 bg-amber-50/70 border-b border-amber-200/50 flex items-center justify-between text-[11px] text-amber-800 font-medium">
              <span>← Scroll table horizontally →</span>
              <span className="text-[10px] text-surface-500">7 Columns</span>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-xs text-left border-collapse min-w-[680px]">
                <thead>
                  <tr className="bg-black text-white font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3 text-center w-14 border border-zinc-700">Sr. No.</th>
                    <th className="py-2.5 px-3 text-center w-24 border border-zinc-700">Date</th>
                    <th className="py-2.5 px-3 border border-zinc-700">Particulars</th>
                    <th className="py-2.5 px-3 text-center w-28 border border-zinc-700">Type</th>
                    <th className="py-2.5 px-3 text-center w-32 border border-zinc-700">Vch No.</th>
                    <th className="py-2.5 px-3 text-right w-32 border border-zinc-700">Debit (₹)</th>
                    <th className="py-2.5 px-3 text-right w-32 border border-zinc-700">Credit (₹)</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-surface-100 font-medium text-surface-800">
                  {/* If R K Sales: Render Period 1 then Period 2 */}
                  {isRKSales && period1Entries.length > 0 ? (
                    <>
                      {/* Period 1 Rows */}
                      {period1Entries.map((e, idx) => (
                        <tr key={e.id} className="hover:bg-surface-50/80 transition-colors">
                          <td className="py-2 px-3 text-center font-bold text-surface-500 border border-surface-200">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 text-center text-surface-600 whitespace-nowrap border border-surface-200">
                            {formatDateDisplay(e.date)}
                          </td>
                          <td className="py-2 px-3 font-semibold text-surface-900 border border-surface-200">
                            {e.particulars}
                          </td>
                          <td className="py-2 px-3 text-center border border-surface-200">
                            {renderPaymentTypeBadge(e.payment_type, e.debit > 0)}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold border border-surface-200">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {e.challan_id ? (
                                <Link
                                  href={`/challans/${e.challan_id}`}
                                  className="text-primary-600 hover:text-primary-800 hover:underline inline-flex items-center gap-1"
                                  title="Open official challan"
                                >
                                  <span>{e.reference}</span>
                                  <ExternalLink size={10} className="opacity-70" />
                                </Link>
                              ) : (
                                <span className="text-surface-700">{e.reference}</span>
                              )}
                              {e.is_paid && e.debit > 0 && (
                                <PaidRubberStamp size="xs" title="PAID" color="emerald" angle={-4} />
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-surface-900 border border-surface-200">
                            {formatAmountDisplay(e.debit)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-surface-900 border border-surface-200">
                            {formatAmountDisplay(e.credit)}
                          </td>
                        </tr>
                      ))}

                      {/* Period 1 Closing Balance Row */}
                      <tr className="bg-surface-50 font-bold text-surface-900 border-t border-b border-surface-300">
                        <td className="py-2 px-3 text-center border border-surface-200"></td>
                        <td className="py-2 px-3 text-center border border-surface-200"></td>
                        <td className="py-2 px-3 font-bold text-surface-950 border border-surface-200">
                          <span className="mr-6">By</span>
                          <span>Closing Balance</span>
                        </td>
                        <td className="py-2 px-3 border border-surface-200"></td>
                        <td className="py-2 px-3 border border-surface-200"></td>
                        <td className="py-2 px-3 text-right font-mono font-bold border border-surface-200">
                          {formatAmountDisplay(period1TotalDebit)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold border border-surface-200">
                          {formatAmountDisplay(period1TotalCredit)}
                        </td>
                      </tr>

                      {/* Period 1 Balanced Total Row */}
                      <tr className="bg-white font-black text-surface-950 border-b-2 border-surface-400">
                        <td className="py-2.5 px-3 border border-surface-200"></td>
                        <td className="py-2.5 px-3 border border-surface-200"></td>
                        <td className="py-2.5 px-3 border border-surface-200"></td>
                        <td className="py-2.5 px-3 border border-surface-200"></td>
                        <td className="py-2.5 px-3 border border-surface-200"></td>
                        <td className="py-2.5 px-3 text-right font-mono font-black border border-surface-200 border-t-2 border-b-2 border-surface-950">
                          {formatAmountDisplay(Math.max(period1TotalDebit, period1TotalCredit))}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black border border-surface-200 border-t-2 border-b-2 border-surface-950">
                          {formatAmountDisplay(Math.max(period1TotalDebit, period1TotalCredit))}
                        </td>
                      </tr>

                      {/* Period 2 Opening Balance Row */}
                      <tr className="bg-surface-50/50 hover:bg-surface-50 font-bold">
                        <td className="py-2 px-3 text-center font-bold text-surface-500 border border-surface-200">
                          {period1Entries.length + 1}
                        </td>
                        <td className="py-2 px-3 text-center text-surface-600 whitespace-nowrap border border-surface-200">
                          1-Apr-24
                        </td>
                        <td className="py-2 px-3 text-surface-950 font-bold border border-surface-200">
                          <span className="mr-6">To</span>
                          <span>Opening Balance</span>
                        </td>
                        <td className="py-2 px-3 text-center text-surface-400 border border-surface-200">—</td>
                        <td className="py-2 px-3 text-center text-surface-400 border border-surface-200">—</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-surface-900 border border-surface-200">
                          {formatAmountDisplay(period2Calculations.opening)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-surface-400 border border-surface-200"></td>
                      </tr>

                      {/* Period 2 Entries */}
                      {period2Entries.map((e, idx) => (
                        <tr key={e.id} className="hover:bg-surface-50/80 transition-colors">
                          <td className="py-2 px-3 text-center font-bold text-surface-500 border border-surface-200">
                            {period1Entries.length + 2 + idx}
                          </td>
                          <td className="py-2 px-3 text-center text-surface-600 whitespace-nowrap border border-surface-200">
                            {formatDateDisplay(e.date)}
                          </td>
                          <td className="py-2 px-3 font-semibold text-surface-900 border border-surface-200">
                            {e.particulars}
                          </td>
                          <td className="py-2 px-3 text-center border border-surface-200">
                            {renderPaymentTypeBadge(e.payment_type, e.debit > 0)}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold border border-surface-200">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {e.challan_id ? (
                                <Link
                                  href={`/challans/${e.challan_id}`}
                                  className="text-primary-600 hover:text-primary-800 hover:underline inline-flex items-center gap-1"
                                  title="Open official challan"
                                >
                                  <span>{e.reference}</span>
                                  <ExternalLink size={10} className="opacity-70" />
                                </Link>
                              ) : (
                                <span className="text-surface-700">{e.reference}</span>
                              )}
                              {e.is_paid && e.debit > 0 && (
                                <PaidRubberStamp size="xs" title="PAID" color="emerald" angle={-4} />
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-surface-900 border border-surface-200">
                            {formatAmountDisplay(e.debit)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-surface-900 border border-surface-200">
                            {formatAmountDisplay(e.credit)}
                          </td>
                        </tr>
                      ))}

                      {/* Period 2 Subtotal Row */}
                      <tr className="bg-surface-50 font-bold text-surface-800">
                        <td className="py-2 px-3 text-center border border-surface-200"></td>
                        <td className="py-2 px-3 text-center border border-surface-200"></td>
                        <td className="py-2 px-3 border border-surface-200"></td>
                        <td className="py-2 px-3 border border-surface-200"></td>
                        <td className="py-2 px-3 border border-surface-200"></td>
                        <td className="py-2 px-3 text-right font-mono font-bold border border-surface-200">
                          {formatAmountDisplay(period2Calculations.totalDebits)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold border border-surface-200">
                          {formatAmountDisplay(period2Calculations.totalCredits)}
                        </td>
                      </tr>

                      {/* Period 2 Closing Balance Row */}
                      <tr className={cn(
                        "font-black text-surface-950 border-t border-b border-surface-300",
                        isAccountSettled ? "bg-emerald-50/70" : "bg-amber-50/50"
                      )}>
                        <td className="py-2 px-3 text-center border border-surface-200"></td>
                        <td className="py-2 px-3 text-center border border-surface-200"></td>
                        <td className="py-2 px-3 font-bold text-surface-950 border border-surface-200">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="mr-6">By</span>
                            <span>Closing Balance</span>
                            {isAccountSettled ? (
                              <span className="text-[10px] text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded font-black tracking-wider uppercase inline-flex items-center gap-1">
                                <span>✓</span>
                                <span>PAID IN FULL / SETTLED</span>
                              </span>
                            ) : (
                              period2Calculations.verifiedNet !== 0 && (
                                <span className="text-[10px] text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded font-normal ml-2">
                                  Incl. Net Sites Adj: {period2Calculations.verifiedNet > 0 ? '+' : ''}₹{period2Calculations.verifiedNet.toLocaleString('en-IN')}
                                </span>
                              )
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 border border-surface-200"></td>
                        <td className="py-2 px-3 border border-surface-200"></td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-surface-400 border border-surface-200"></td>
                        <td className={cn(
                          "py-2 px-3 text-right font-mono font-black border border-surface-200",
                          isAccountSettled ? "text-emerald-700" : "text-surface-950"
                        )}>
                          {formatAmountDisplay(period2Calculations.finalClosing)}
                        </td>
                      </tr>

                      {/* Period 2 Balanced Total Row */}
                      <tr className="bg-white font-black text-surface-950 border-b-2 border-surface-400">
                        <td className="py-2.5 px-3 border border-surface-200"></td>
                        <td className="py-2.5 px-3 border border-surface-200"></td>
                        <td className="py-2.5 px-3 border border-surface-200"></td>
                        <td className="py-2.5 px-3 border border-surface-200"></td>
                        <td className="py-2.5 px-3 border border-surface-200"></td>
                        <td className="py-2.5 px-3 text-right font-mono font-black border border-surface-200 border-t-2 border-b-2 border-surface-950">
                          {formatAmountDisplay(period2Calculations.balancedTotal)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black border border-surface-200 border-t-2 border-b-2 border-surface-950">
                          {formatAmountDisplay(period2Calculations.balancedTotal)}
                        </td>
                      </tr>
                    </>
                  ) : (
                    /* Standard Customer Continuous Ledger View */
                    <>
                      {/* Opening Balance Row */}
                      <tr className="bg-surface-50 font-bold">
                        <td className="py-2 px-3 text-center font-bold text-surface-400 border border-surface-200">1</td>
                        <td className="py-2 px-3 text-center text-surface-600 whitespace-nowrap border border-surface-200">
                          {fromDate ? formatDateDisplay(fromDate) : '—'}
                        </td>
                        <td className="py-2 px-3 text-surface-950 font-bold border border-surface-200">
                          <span className="mr-6">To</span>
                          <span>Opening Balance</span>
                        </td>
                        <td className="py-2 px-3 text-center text-surface-400 border border-surface-200">—</td>
                        <td className="py-2 px-3 text-center text-surface-400 border border-surface-200">—</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-surface-900 border border-surface-200">
                          {formatAmountDisplay(ledgerData.openingBalance)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-surface-400 border border-surface-200"></td>
                      </tr>

                      {/* Transaction Rows */}
                      {displayEntries.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-xs text-surface-400">
                            No transactions recorded in this date range. Click "+ Add Entry" to record a voucher.
                          </td>
                        </tr>
                      ) : (
                        displayEntries.map((e, idx) => (
                          <tr key={e.id} className="hover:bg-surface-50/80 transition-colors">
                            <td className="py-2 px-3 text-center font-bold text-surface-500 border border-surface-200">
                              {idx + 2}
                            </td>
                            <td className="py-2 px-3 text-center text-surface-600 whitespace-nowrap border border-surface-200">
                              {formatDateDisplay(e.date)}
                            </td>
                            <td className="py-2 px-3 font-semibold text-surface-900 border border-surface-200">
                              {e.particulars}
                            </td>
                            <td className="py-2 px-3 text-center border border-surface-200">
                              {renderPaymentTypeBadge(e.payment_type, e.debit > 0)}
                            </td>
                            <td className="py-2 px-3 text-center font-mono font-bold border border-surface-200">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                {e.challan_id ? (
                                  <Link
                                    href={`/challans/${e.challan_id}`}
                                    className="text-primary-600 hover:text-primary-800 hover:underline inline-flex items-center gap-1"
                                    title="Open official challan"
                                  >
                                    <span>{e.reference}</span>
                                    <ExternalLink size={10} className="opacity-70" />
                                  </Link>
                                ) : (
                                  <span className="text-surface-700">{e.reference}</span>
                                )}
                                {e.is_paid && e.debit > 0 && (
                                  <PaidRubberStamp size="xs" title="PAID" color="emerald" angle={-4} />
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-surface-900 border border-surface-200">
                              {formatAmountDisplay(e.debit)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-surface-900 border border-surface-200">
                              {formatAmountDisplay(e.credit)}
                            </td>
                          </tr>
                        ))
                      )}

                      {/* Subtotal Row */}
                      <tr className="bg-surface-50 font-bold text-surface-900 border-t border-b border-surface-300">
                        <td className="py-2 px-3 text-center border border-surface-200"></td>
                        <td className="py-2 px-3 text-center border border-surface-200"></td>
                        <td className="py-2 px-3 font-bold text-surface-950 border border-surface-200">
                          Subtotal
                        </td>
                        <td className="py-2 px-3 border border-surface-200"></td>
                        <td className="py-2 px-3 border border-surface-200"></td>
                        <td className="py-2 px-3 text-right font-mono font-bold border border-surface-200">
                          {formatAmountDisplay(ledgerData.openingBalance + ledgerData.totalDebit)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold border border-surface-200">
                          {formatAmountDisplay(ledgerData.totalCredit)}
                        </td>
                      </tr>

                      {/* Closing Balance Row */}
                      <tr className={cn(
                        "font-black text-surface-950 border-t border-b border-surface-300",
                        isAccountSettled ? "bg-emerald-50/70" : "bg-amber-50/50"
                      )}>
                        <td className="py-2 px-3 text-center border border-surface-200"></td>
                        <td className="py-2 px-3 text-center border border-surface-200"></td>
                        <td className="py-2 px-3 font-bold text-surface-950 border border-surface-200">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="mr-6">By</span>
                            <span>Closing Balance</span>
                            {isAccountSettled ? (
                              <span className="text-[10px] text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded font-black tracking-wider uppercase inline-flex items-center gap-1">
                                <span>✓</span>
                                <span>PAID IN FULL / SETTLED</span>
                              </span>
                            ) : (
                              ledgerData.netVerifiedSiteAdjustment !== 0 && (
                                <span className="text-[10px] text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded font-normal ml-2">
                                  Incl. Net Sites Adj: {ledgerData.netVerifiedSiteAdjustment > 0 ? '+' : ''}₹{ledgerData.netVerifiedSiteAdjustment.toLocaleString('en-IN')}
                                </span>
                              )
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 border border-surface-200"></td>
                        <td className="py-2 px-3 border border-surface-200"></td>
                        <td className="py-2 px-3 text-right font-mono text-surface-400 border border-surface-200"></td>
                        <td className={cn(
                          "py-2 px-3 text-right font-mono font-black border border-surface-200",
                          isAccountSettled ? "text-emerald-700" : "text-surface-950"
                        )}>
                          {formatAmountDisplay(effectiveClosingBalance)}
                        </td>
                      </tr>

                      {/* Balanced Total Row */}
                      <tr className="bg-white font-black text-surface-950 border-b-2 border-surface-400">
                        <td className="py-2.5 px-3 border border-surface-200"></td>
                        <td className="py-2.5 px-3 border border-surface-200"></td>
                        <td className="py-2.5 px-3 border border-surface-200"></td>
                        <td className="py-2.5 px-3 border border-surface-200"></td>
                        <td className="py-2.5 px-3 border border-surface-200"></td>
                        <td className="py-2.5 px-3 text-right font-mono font-black border border-surface-200 border-t-2 border-b-2 border-surface-950">
                          {formatAmountDisplay(
                            Math.max(
                              ledgerData.openingBalance + ledgerData.totalDebit,
                              ledgerData.totalCredit + (ledgerData.verifiedClosingBalance || ledgerData.closingBalance)
                            )
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black border border-surface-200 border-t-2 border-b-2 border-surface-950">
                          {formatAmountDisplay(
                            Math.max(
                              ledgerData.openingBalance + ledgerData.totalDebit,
                              ledgerData.totalCredit + (ledgerData.verifiedClosingBalance || ledgerData.closingBalance)
                            )
                          )}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ============================================================ */}
          {/* SITES / BALANCE ADJUSTMENT SECTION (MATCHES REFERENCE PHOTO) */}
          {/* ============================================================ */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-2xs overflow-hidden mt-6">
            {/* Section Header Banner */}
            <div className="p-3.5 bg-surface-50/70 border-b border-surface-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-[#ea580c]/10 text-[#ea580c] rounded-md">
                  <Layers size={16} />
                </div>
                <h3 className="text-sm font-black text-surface-950 tracking-tight">
                  Sites / Balance Adjustment
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setShowAddSiteModal(true)}
                className="btn-primary py-1.5 px-3 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-lg flex items-center gap-1 shadow-xs print:hidden"
              >
                <Plus size={14} />
                <span>Add Site</span>
              </button>
            </div>

            {/* Sites Table */}
            {/* Mobile Scroll Hint Banner */}
            <div className="sm:hidden px-3 py-1.5 bg-amber-50/70 border-b border-amber-200/50 flex items-center justify-between text-[11px] text-amber-800 font-medium">
              <span>← Scroll sites horizontally →</span>
              <span className="text-[10px] text-surface-500">8 Columns</span>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-xs text-left border-collapse min-w-[680px]">
                <thead>
                  <tr className="bg-black text-white font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3 text-center w-14 border border-zinc-700">Sr. No.</th>
                    <th className="py-2.5 px-3 w-48 border border-zinc-700">Site</th>
                    <th className="py-2.5 px-3 text-right w-36 border border-zinc-700">Opening Balance (₹)</th>
                    <th className="py-2.5 px-3 text-right w-32 border border-zinc-700">Credit (+) (₹)</th>
                    <th className="py-2.5 px-3 text-right w-32 border border-zinc-700">Debit (-) (₹)</th>
                    <th className="py-2.5 px-3 text-right w-36 border border-zinc-700">Current Balance (₹)</th>
                    <th className="py-2.5 px-3 text-center w-28 border border-zinc-700">Verified</th>
                    <th className="py-2.5 px-3 text-center w-20 border border-zinc-700 print:hidden">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-surface-100 font-medium text-surface-800">
                  {ledgerData.sites && ledgerData.sites.length > 0 ? (
                    ledgerData.sites.map((site, idx) => {
                      const op = Number(site.opening_balance) || 0;
                      const cr = Number(site.credit_adjustment) || 0;
                      const db = Number(site.debit_adjustment) || 0;
                      const cur = op + db - cr;

                      return (
                        <tr key={site.id} className="hover:bg-surface-50/80 transition-colors">
                          <td className="py-2.5 px-3 text-center font-bold text-surface-500 border border-surface-200">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-surface-900 border border-surface-200">
                            {site.site_name}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-surface-800 border border-surface-200">
                            {op.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700 border border-surface-200">
                            + {cr.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-rose-700 border border-surface-200">
                            - {db.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-surface-950 border border-surface-200">
                            {cur.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-center border border-surface-200">
                            {site.is_verified ? (
                              <button
                                type="button"
                                onClick={() => handleOpenUnverifyModal(site)}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer"
                                title="Click to Unverify and revise adjustment"
                              >
                                <Check size={12} className="stroke-[2.5]" />
                                <span>Verified</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleVerifySite(site)}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer"
                                title="Verify this site balance adjustment"
                              >
                                <Clock size={12} />
                                <span>Verify</span>
                              </button>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center border border-surface-200 print:hidden">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditSite(site)}
                                className="p-1 text-surface-500 hover:text-surface-800 hover:bg-surface-100 rounded transition-colors"
                                title="Edit site balances"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSite(site)}
                                className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                title="Delete site"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-surface-400">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <Layers size={20} className="text-surface-300 stroke-[1.5]" />
                          <span className="font-semibold text-surface-600">No sites added for this customer</span>
                          <span className="text-[11px] text-surface-400">Click &quot;+ Add Site&quot; above to add a project site and record balance adjustments.</span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Sites Table Total Footer (shown when sites exist) */}
                  {ledgerData.sites && ledgerData.sites.length > 0 && (
                    <tr className="bg-[#fff8ee] font-bold text-surface-950 border-t-2 border-amber-300">
                      <td className="py-2.5 px-3 text-center border border-amber-200"></td>
                      <td className="py-2.5 px-3 font-black text-surface-950 border border-amber-200">
                        Total (Sites)
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-surface-900 border border-amber-200">
                        {sitesSummary.sumOpening.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800 border border-amber-200">
                        {sitesSummary.sumCredit.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-800 border border-amber-200">
                        {sitesSummary.sumDebit.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-surface-950 border border-amber-200">
                        {sitesSummary.sumCurrent.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 border border-amber-200"></td>
                      <td className="py-2.5 px-3 border border-amber-200 print:hidden"></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom-right info footnote (Matching Photo) */}
            <div className="p-2.5 bg-surface-50 border-t border-surface-200 flex items-center justify-end text-[11px] text-surface-600 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-[9px]">
                  i
                </span>
                <span>On Verify, the balance will be updated in the Closing Balance.</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: ADD NEW SITE                                         */}
      {/* ============================================================ */}
      {showAddSiteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-surface-200 p-4 sm:p-5 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-2 border-b border-surface-100">
              <h3 className="font-bold text-sm text-surface-900 flex items-center gap-1.5">
                <Building2 size={16} className="text-[#ea580c]" />
                <span>Add Site to Customer Ledger</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddSiteModal(false)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSite} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-surface-700">Site Name *</label>
                <input
                  type="text"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  placeholder="e.g. Kalpataru, Lodha, Regency"
                  className="input text-xs w-full font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="space-y-1">
                  <label className="font-bold text-surface-700">Opening (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newSiteOpening}
                    onChange={(e) => setNewSiteOpening(e.target.value)}
                    className="input text-xs w-full font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-emerald-700">Credit (+) (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newSiteCredit}
                    onChange={(e) => setNewSiteCredit(e.target.value)}
                    className="input text-xs w-full font-mono text-emerald-700"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-rose-700">Debit (-) (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newSiteDebit}
                    onChange={(e) => setNewSiteDebit(e.target.value)}
                    className="input text-xs w-full font-mono text-rose-700"
                  />
                </div>
              </div>

              <p className="text-[11px] text-surface-500 pt-1">
                Site adjustments will be created and verified automatically.
              </p>

              <div className="pt-3 border-t border-surface-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddSiteModal(false)}
                  className="btn-secondary py-1.5 px-3 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary py-1.5 px-4 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white"
                >
                  Save Site
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: EDIT SITE BALANCES                                    */}
      {/* ============================================================ */}
      {editingSite && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-surface-200 p-4 sm:p-5 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-2 border-b border-surface-100">
              <h3 className="font-bold text-sm text-surface-900 flex items-center gap-1.5">
                <Edit2 size={16} className="text-[#ea580c]" />
                <span>Edit Site Balances: {editingSite.site_name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingSite(null)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEditSite} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-surface-700">Site Name</label>
                <input
                  type="text"
                  value={editSiteName}
                  onChange={(e) => setEditSiteName(e.target.value)}
                  className="input text-xs w-full font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="space-y-1">
                  <label className="font-bold text-surface-700">Opening (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editSiteOpening}
                    onChange={(e) => setEditSiteOpening(e.target.value)}
                    className="input text-xs w-full font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-emerald-700">Credit (+) (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editSiteCredit}
                    onChange={(e) => setEditSiteCredit(e.target.value)}
                    className="input text-xs w-full font-mono text-emerald-700"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-rose-700">Debit (-) (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editSiteDebit}
                    onChange={(e) => setEditSiteDebit(e.target.value)}
                    className="input text-xs w-full font-mono text-rose-700"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-surface-50 rounded-lg text-[11px] text-surface-600 flex items-center justify-between">
                <span>Calculated Current Balance:</span>
                <span className="font-mono font-bold text-surface-900">
                  ₹{(
                    (Number(editSiteOpening) || 0) +
                    (Number(editSiteDebit) || 0) -
                    (Number(editSiteCredit) || 0)
                  ).toFixed(2)}
                </span>
              </div>

              <div className="pt-3 border-t border-surface-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSite(null)}
                  className="btn-secondary py-1.5 px-3 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary py-1.5 px-4 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: UNVERIFY SITE (AUDIT PROMPT)                          */}
      {/* ============================================================ */}
      {showUnverifyModal && unverifyTargetSite && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full border border-surface-200 p-4 sm:p-5 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center gap-2 text-amber-600">
              <Clock size={20} />
              <h3 className="font-bold text-sm text-surface-900">Unverify Site Balance</h3>
            </div>

            <p className="text-xs text-surface-600 leading-relaxed">
              Unverifying site <b>"{unverifyTargetSite.site_name}"</b> will remove its balance adjustment from the final closing balance until re-verified.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-bold text-surface-700">Reason for un-verification</label>
              <input
                type="text"
                value={unverifyReason}
                onChange={(e) => setUnverifyReason(e.target.value)}
                placeholder="e.g. Need to adjust credit note amount"
                className="input text-xs w-full"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUnverifyModal(false)}
                className="btn-secondary py-1.5 px-3 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnverify}
                className="btn-primary py-1.5 px-3.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
              >
                Confirm Unverify
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: ADD MANUAL LEDGER ENTRY                               */}
      {/* ============================================================ */}
      {showAddEntryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-surface-200 p-4 sm:p-5 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-2 border-b border-surface-100">
              <h3 className="font-bold text-sm text-surface-900 flex items-center gap-1.5">
                <BookOpen size={16} className="text-[#ea580c]" />
                <span>Add Ledger Transaction</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddEntryModal(false)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateManualEntry} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-surface-700">Date *</label>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="input text-xs w-full font-medium"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-surface-700">Transaction Type *</label>
                  <select
                    value={entryType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEntryType(val as any);
                      if (val === 'UPI') setEntryParticulars('By UPI');
                      else if (val === 'Cash') setEntryParticulars('By Cash');
                      else if (val === 'Cheque') setEntryParticulars('By Cheque');
                      else if (val === 'Bank Transfer') setEntryParticulars('By HDFC BANK-50200003880041');
                    }}
                    className="input text-xs w-full font-bold"
                  >
                    <option value="UPI">UPI (Receipt)</option>
                    <option value="Cash">Cash (Receipt)</option>
                    <option value="Bank Transfer">Bank Transfer (Receipt)</option>
                    <option value="Cheque">Cheque (Receipt)</option>
                    <option value="Receipt">Generic Receipt (Credit)</option>
                    <option value="Sales GST">Sales GST (Debit)</option>
                    <option value="Payment">Payment (Debit)</option>
                    <option value="Journal">Journal (Adjustment)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-surface-700">Particulars *</label>
                <input
                  type="text"
                  value={entryParticulars}
                  onChange={(e) => setEntryParticulars(e.target.value)}
                  placeholder="e.g. HDFC BANK-50200003880041 or SALE GST 18%"
                  className="input text-xs w-full font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-surface-700">Vch No. / Ref</label>
                  <input
                    type="text"
                    value={entryVoucherNo}
                    onChange={(e) => setEntryVoucherNo(e.target.value)}
                    placeholder="e.g. 2225 or 4652/23-24"
                    className="input text-xs w-full font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-surface-700">Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={entryAmount}
                    onChange={(e) => setEntryAmount(e.target.value)}
                    placeholder="10000.00"
                    className="input text-xs w-full font-mono font-bold text-surface-900"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-surface-700">Site Name (Optional)</label>
                <input
                  type="text"
                  value={entrySiteName}
                  onChange={(e) => setEntrySiteName(e.target.value)}
                  placeholder="e.g. Kalpataru, Lodha, Regency"
                  className="input text-xs w-full font-medium"
                />
              </div>

              <div className="pt-3 border-t border-surface-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddEntryModal(false)}
                  className="btn-secondary py-1.5 px-3 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary py-1.5 px-4 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white"
                >
                  Record Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: RECORD PAYMENT RECEIVED                                */}
      {/* ============================================================ */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-surface-200 p-4 sm:p-5 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-2 border-b border-surface-100">
              <h3 className="font-bold text-sm text-surface-900 flex items-center gap-2">
                <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-md">
                  <WalletCards size={16} />
                </div>
                <div>
                  <div>Record Payment Received</div>
                  <div className="text-[11px] font-normal text-surface-500">
                    Credits ledger and updates closing balance instantly
                  </div>
                </div>
              </h3>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Current Party & Outstanding Summary Box */}
            <div className="p-3 bg-surface-50 rounded-lg border border-surface-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-surface-500 block">Customer Party</span>
                <span className="font-bold text-surface-900 text-sm">
                  {selectedCustomer.name || selectedCustomer.business_name}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-surface-500 block">Current Balance</span>
                <span className={cn(
                  "font-mono font-black text-sm",
                  effectiveClosingBalance > 0 ? "text-rose-600" : "text-emerald-700"
                )}>
                  ₹{effectiveClosingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <form onSubmit={handleRecordPaymentSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-surface-700">Payment Amount (₹) *</label>
                  {effectiveClosingBalance > 0 && (
                    <button
                      type="button"
                      onClick={() => setPayAmount(String(effectiveClosingBalance))}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline"
                    >
                      Settle Full (₹{effectiveClosingBalance.toLocaleString('en-IN')})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="e.g. 14500.00"
                  className="input text-sm w-full font-mono font-bold text-surface-900 border-surface-300"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-surface-700">Payment Mode *</label>
                  <select
                    value={payMode}
                    onChange={(e) => setPayMode(e.target.value as any)}
                    className="input text-xs w-full font-bold"
                  >
                    <option value="bank_transfer">HDFC Bank Transfer</option>
                    <option value="upi">UPI / GPay / PhonePe</option>
                    <option value="cheque">Cheque</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-surface-700">Payment Date *</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="input text-xs w-full font-medium"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-surface-700">Cheque / UTR / Ref No.</label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="e.g. 2225 or UTR987654"
                    className="input text-xs w-full font-mono font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-surface-700">Site (Optional)</label>
                  <select
                    value={paySiteName}
                    onChange={(e) => setPaySiteName(e.target.value)}
                    className="input text-xs w-full font-medium"
                  >
                    <option value="">General Account</option>
                    {ledgerData.sites?.map((s) => (
                      <option key={s.id} value={s.site_name}>
                        {s.site_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-surface-700">Remarks / Notes</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="e.g. Full settlement against Feb billing"
                  className="input text-xs w-full font-medium"
                />
              </div>

              <div className="pt-3 border-t border-surface-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="btn-secondary py-1.5 px-3 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRecordingPayment}
                  className="btn-primary py-1.5 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-xs"
                >
                  {isRecordingPayment ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Post to Ledger</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
