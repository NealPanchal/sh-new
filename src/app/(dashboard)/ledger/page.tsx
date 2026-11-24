'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
  FilePlus,
  Eye,
  X,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  CalendarClock,
  Copy,
  ArrowRight,
} from 'lucide-react';
import { Customer, CustomerSite, CustomerLedgerEntry, PaymentMode } from '@/types';
import { useApp } from '@/lib/context';
import { getClientAuthToken, getCurrentUser, isAdmin, canManageAccounting } from '@/lib/auth';
import { formatCurrency, formatDate, cn, cleanTallyParticulars } from '@/lib/utils';
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

function toInputDateFormat(val?: string | Date | null): string {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const trimmed = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (trimmed.includes('T')) return trimmed.slice(0, 10);
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const mMonth = trimmed.match(/^(\d{1,2})[-/ ]([a-zA-Z]{3})[-/ ](\d{2,4})$/);
  if (mMonth) {
    const day = mMonth[1].padStart(2, '0');
    const mon = months[mMonth[2].toLowerCase()] || '01';
    let yr = mMonth[3];
    if (yr.length === 2) yr = `20${yr}`;
    return `${yr}-${mon}-${day}`;
  }
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
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

interface LocalManualEntry {
  id: string;
  customer_id: string;
  customer_name?: string;
  date: string;
  particulars: string;
  payment_type: string;
  voucher_no: string;
  debit: number;
  credit: number;
  site_name?: string;
  challan_id?: string;
  created_at?: string;
  created_by?: string;
  reason?: string;
}

const LOCAL_MANUAL_ENTRIES_KEY = 'showhouse_manual_ledger_entries';

function getLocalManualEntries(): LocalManualEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_MANUAL_ENTRIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalManualEntry(entry: LocalManualEntry) {
  if (typeof window === 'undefined') return;
  try {
    const entries = getLocalManualEntries();
    // Strictly match by ID so distinct vouchers / payments never overwrite each other
    const idx = entries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) {
      entries[idx] = { ...entries[idx], ...entry };
    } else {
      entries.push(entry);
    }
    localStorage.setItem(LOCAL_MANUAL_ENTRIES_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn('saveLocalManualEntry note:', err);
  }
}

function removeLocalManualEntry(id: string, voucherNo?: string) {
  if (typeof window === 'undefined') return;
  try {
    const entries = getLocalManualEntries();
    const filtered = entries.filter((e) => e.id !== id);
    localStorage.setItem(LOCAL_MANUAL_ENTRIES_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('removeLocalManualEntry note:', err);
  }
}

function clearLocalManualEntriesForCustomer(customerId: string, customerName?: string) {
  if (typeof window === 'undefined') return;
  try {
    const entries = getLocalManualEntries();
    const targetId = (customerId || '').trim().toLowerCase();
    const targetName = (customerName || '').trim().toLowerCase();
    const filtered = entries.filter((e) => {
      const eId = (e.customer_id || '').trim().toLowerCase();
      const eName = (e.customer_name || '').trim().toLowerCase();
      if (targetId && (eId === targetId || eName === targetId)) return false;
      if (targetName && (eName === targetName || eId === targetName)) return false;
      return true;
    });
    localStorage.setItem(LOCAL_MANUAL_ENTRIES_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('clearLocalManualEntriesForCustomer note:', err);
  }
}

function MasterPartyLedgerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramParty = searchParams.get('party') || searchParams.get('customerId') || searchParams.get('customer');

  const { customers: contextCustomers, challans: contextChallans, deleteChallan, updateChallan, updateCustomer } = useApp();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'ledger' | 'sites' | 'credit' | 'tally'>('ledger');

  // Customer & Site lists
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('all');

  // Overall All Parties Summary Data
  const [allPartiesData, setAllPartiesData] = useState<{
    summary: {
      totalParties: number;
      totalDebit: number;
      totalCredit: number;
      totalOutstanding: number;
      totalReceivable: number;
      totalPayable: number;
    };
    parties: Array<{
      id: string;
      name: string;
      business_name: string;
      contact_person: string;
      phone: string;
      is_architect: boolean;
      credit_status: string;
      sites_count: number;
      sites: string[];
      opening_balance: number;
      total_debit: number;
      total_credit: number;
      closing_balance: number;
      last_activity_date?: string;
    }>;
  } | null>(null);
  const [allPartiesSearch, setAllPartiesSearch] = useState('');
  const [allPartiesFilter, setAllPartiesFilter] = useState<'all' | 'pending' | 'settled'>('all');

  // Clear Ledger state
  const [showDeleteEntireLedgerModal, setShowDeleteEntireLedgerModal] = useState(false);
  const [isDeletingEntireLedger, setIsDeletingEntireLedger] = useState(false);

  // Filter toolbar
  const [fromDate, setFromDate] = useState('');
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
    openingBalance: 0,
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
  const [editingOpeningBalance, setEditingOpeningBalance] = useState(false);
  const [tempOpeningBalance, setTempOpeningBalance] = useState('');
  const [savingOpeningBalance, setSavingOpeningBalance] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteOpening, setNewSiteOpening] = useState('0');
  const [newSiteCredit, setNewSiteCredit] = useState('0');
  const [newSiteDebit, setNewSiteDebit] = useState('0');
  const [addSiteChallanId, setAddSiteChallanId] = useState('');
  const [addSiteChallanNumber, setAddSiteChallanNumber] = useState('');

  const [editingSite, setEditingSite] = useState<CustomerSite | null>(null);
  const [editSiteName, setEditSiteName] = useState('');
  const [editSiteOpening, setEditSiteOpening] = useState('0');
  const [editSiteCredit, setEditSiteCredit] = useState('0');
  const [editSiteDebit, setEditSiteDebit] = useState('0');
  const [editSiteChallanId, setEditSiteChallanId] = useState('');
  const [editSiteChallanNumber, setEditSiteChallanNumber] = useState('');

  // Delete ledger entry modal state
  const [entryToDelete, setEntryToDelete] = useState<CustomerLedgerEntry | null>(null);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);

  // Customer challans list for attaching & party challans view
  const [customerChallans, setCustomerChallans] = useState<
    Array<{
      id: string;
      challan_number: string;
      date: string;
      amount: number;
      status?: string;
      items_count?: number;
      site_name?: string;
    }>
  >([]);
  const [showPartyChallansModal, setShowPartyChallansModal] = useState(false);
  const [partyChallansSearch, setPartyChallansSearch] = useState('');

  const [showAddEntryModal, setShowAddEntryModal] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [entryParticulars, setEntryParticulars] = useState('');
  const [entryType, setEntryType] = useState<
    'Receipt' | 'Sales GST' | 'Payment' | 'Journal' | 'Party Challan' | 'UPI' | 'Bank Transfer' | 'Cash' | 'Cheque'
  >('Receipt');
  const [entryVoucherNo, setEntryVoucherNo] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [entrySiteName, setEntrySiteName] = useState('');
  const [selectedChallanForEntry, setSelectedChallanForEntry] = useState('');
  const [entryDebitOrCredit, setEntryDebitOrCredit] = useState<'debit' | 'credit'>('debit');

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

  // Edit Ledger Entry Modal states
  const [showEditEntryModal, setShowEditEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CustomerLedgerEntry | null>(null);
  const [editEntryDate, setEditEntryDate] = useState('');
  const [editEntryParticulars, setEditEntryParticulars] = useState('');
  const [editEntryType, setEditEntryType] = useState('Sales GST');
  const [editEntryDebitOrCredit, setEditEntryDebitOrCredit] = useState<'debit' | 'credit'>('debit');
  const [editEntryVoucherNo, setEditEntryVoucherNo] = useState('');
  const [editEntryAmount, setEditEntryAmount] = useState('');
  const [editEntrySiteName, setEditEntrySiteName] = useState('');
  const [editEntryReason, setEditEntryReason] = useState('');
  const [isUpdatingEntry, setIsUpdatingEntry] = useState(false);

  // Transaction Update & Revision History Modal state
  const [selectedEntryForHistory, setSelectedEntryForHistory] = useState<CustomerLedgerEntry | null>(null);

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

  // Fetch customers on mount and merge with context customers
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const token = getClientAuthToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch('/api/customers', { headers });
        if (res.ok) {
          const data = await res.json();
          const list: Customer[] = data.customers || [];
          const map = new Map<string, Customer>();

          list.forEach((c) => {
            const key = (c.id || c.name || '').trim().toLowerCase();
            if (key) map.set(key, c);
          });

          (contextCustomers || []).forEach((c) => {
            const key = (c.id || c.name || '').trim().toLowerCase();
            if (key && !map.has(key)) map.set(key, c);
          });

          const merged = Array.from(map.values());
          if (merged.length > 0) {
            setCustomers(merged);
            if (!paramParty && !selectedCustomerId) {
              setSelectedCustomerId('all');
            }
          }
        } else if (contextCustomers && contextCustomers.length > 0) {
          setCustomers(contextCustomers);
        }
      } catch (err) {
        console.error('Failed to load customers:', err);
        if (contextCustomers && contextCustomers.length > 0) {
          setCustomers(contextCustomers);
        }
      }
    };
    fetchCustomers();
  }, [contextCustomers]);

  // Fallback to context customers if customers list is initially empty
  useEffect(() => {
    if (customers.length === 0 && contextCustomers && contextCustomers.length > 0) {
      setCustomers(contextCustomers);
    }
  }, [contextCustomers, customers.length]);

  // Handle customer ID from URL search params (e.g. ?customerId=XYZ or ?party=XYZ)
  useEffect(() => {
    if (paramParty) {
      const lower = paramParty.toLowerCase();
      const matched = customers.find(
        (c) =>
          c.id === paramParty ||
          c.id.toLowerCase() === lower ||
          c.name?.toLowerCase() === lower ||
          c.business_name?.toLowerCase() === lower ||
          (c.name && c.name.toLowerCase().includes(lower))
      );
      if (matched) {
        setSelectedCustomerId(matched.id);
      } else {
        setSelectedCustomerId(paramParty);
      }
    }
  }, [paramParty, customers]);

  // Stable refs to prevent cascading re-render and re-fetch loops
  const customersRef = React.useRef(customers);
  const contextCustomersRef = React.useRef(contextCustomers);
  const contextChallansRef = React.useRef(contextChallans);

  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  useEffect(() => {
    contextCustomersRef.current = contextCustomers;
  }, [contextCustomers]);

  useEffect(() => {
    contextChallansRef.current = contextChallans;
  }, [contextChallans]);

  // Fetch ledger data whenever selected customer, date filters, or triggers change
  const fetchLedger = async (silent: boolean = false) => {
    if (!selectedCustomerId) return;
    try {
      if (!silent && (!ledgerData.entries || ledgerData.entries.length === 0)) {
        setLoading(true);
      }
      const token = getClientAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      // Overall Summary for All Parties
      if (selectedCustomerId === 'all') {
        try {
          const res = await fetch('/api/ledger?summary=all', { headers });
          if (res.ok) {
            const d = await res.json();
            if (d.success && d.allPartiesSummary) {
              setAllPartiesData(d.allPartiesSummary);
            }
          }
        } catch (err) {
          console.warn('All parties summary fetch note:', err);
        } finally {
          setLoading(false);
        }
        return;
      }

      const currentCustomers = customersRef.current || [];
      const currentContextCusts = contextCustomersRef.current || [];
      const currentContextChallans = contextChallansRef.current || [];

      const custObj =
        currentCustomers.find((c) => c.id === selectedCustomerId || c.name === selectedCustomerId) ||
        currentContextCusts.find((c: Customer) => c.id === selectedCustomerId || c.name === selectedCustomerId) ||
        selectedCustomer;
      const custName = custObj?.name || custObj?.business_name || '';
      const targetId = (selectedCustomerId || '').trim().toLowerCase();
      const targetName = (custName || '').trim().toLowerCase();

      // Find all matching DELIVERED challans from local contextChallans
      const matchingContextChallans = currentContextChallans.filter((c: any) => {
        if (c.is_deleted || c.status === 'cancelled' || c.status === 'void') return false;
        // Delivery / Approval Gate: Only challans marked as approved or delivered enter the ledger
        const isApprovedOrDelivered = c.status === 'approved' || Boolean(c.is_approved) || c.status === 'delivered' || c.delivery_status === 'delivered' || Boolean(c.is_delivered);
        if (!isApprovedOrDelivered) return false;

        const cId = (c.customer_id || '').toLowerCase();
        const cName = (c.customer_name || '').toLowerCase();
        if (targetId && (cId === targetId || cName === targetId)) return true;
        if (targetName && (cName === targetName || cName.includes(targetName) || targetName.includes(cName))) return true;
        if (
          (targetId === 'cust_rk_sales' || targetId.includes('rk') || targetName.includes('rk')) &&
          (cName.includes('r k') || cName.includes('rk sales'))
        ) {
          return true;
        }
        return false;
      });

      const params = new URLSearchParams({ customerId: selectedCustomerId });
      if (custName) params.append('customerName', custName);
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);
      if (typeFilter && typeFilter !== 'all') params.append('type', typeFilter);
      if (siteFilter && siteFilter !== 'all') params.append('siteName', siteFilter);

      let baseLedger: any = null;
      try {
        const res = await fetch(`/api/ledger?${params.toString()}`, { headers });
        if (res.ok) {
          const d = await res.json();
          baseLedger = d.ledger;
        }
      } catch (e) {
        console.warn('Server ledger fetch note:', e);
      }

      if (!baseLedger) {
        baseLedger = {
          openingBalance: Number(custObj?.opening_balance) || 0,
          totalDebit: 0,
          totalCredit: 0,
          closingBalance: 0,
          verifiedSiteDebits: 0,
          verifiedSiteCredits: 0,
          netVerifiedSiteAdjustment: 0,
          verifiedClosingBalance: 0,
          entries: [],
          sites: [],
        };
      }

      // Sync any manual entries returned from server into local persistence
      (baseLedger.entries || []).forEach((e: any) => {
        if (e.source_type === 'manual') {
          saveLocalManualEntry({
            id: e.id,
            customer_id: selectedCustomerId,
            customer_name: custName,
            date: e.date,
            particulars: e.particulars,
            payment_type: e.payment_type || (e.debit > 0 ? 'Sales GST' : 'Receipt'),
            voucher_no: e.reference,
            debit: e.debit,
            credit: e.credit,
            site_name: e.site_name,
            challan_id: e.challan_id,
          });
        }
      });

      // Merge any client-side delivered challans that are not yet in baseLedger.entries
      const existingRefKeys = new Set(
        (baseLedger.entries || []).map((e: any) => (e.reference || '').trim().toLowerCase())
      );
      const existingChallanIds = new Set(
        (baseLedger.entries || []).map((e: any) => (e.challan_id || '').toLowerCase()).filter(Boolean)
      );

      let mergedEntries = [...(baseLedger.entries || [])];

      // Merge local manual entries for this customer so transactions never vanish
      const localEntries = getLocalManualEntries();
      localEntries.forEach((lme) => {
        const lId = (lme.customer_id || '').trim().toLowerCase();
        const lName = (lme.customer_name || '').trim().toLowerCase();
        let matches = false;
        if (targetId && (lId === targetId || lName === targetId)) matches = true;
        if (targetName && (lName === targetName || lId === targetName || lName.includes(targetName) || targetName.includes(lName))) matches = true;

        if (!matches) return;

        // Auto-heal any legacy entry that had "To By Cash" or "Cash" with debit > 0
        const isCashOrReceipt =
          (lme.payment_type && ['cash', 'upi', 'cheque', 'bank transfer', 'receipt'].includes(lme.payment_type.toLowerCase())) ||
          (lme.particulars && /by\s+(cash|upi|cheque|bank|hdfc)/i.test(lme.particulars));

        if (isCashOrReceipt && Number(lme.debit) > 0 && Number(lme.credit) === 0) {
          lme.credit = Number(lme.debit);
          lme.debit = 0;
          lme.particulars = cleanTallyParticulars(lme.particulars, false);
          saveLocalManualEntry(lme);
        }

        const refKey = (lme.voucher_no || '').trim().toLowerCase();
        const isLmeDebit = (Number(lme.debit) || 0) > 0;

        // Match existing entry strictly with same debit/credit polarity so a receipt never wipes out a challan
        const existingIdx = mergedEntries.findIndex(
          (e: any) =>
            (e.id && e.id === lme.id) ||
            (lme.challan_id && e.challan_id && e.challan_id === lme.challan_id && ((Number(e.debit) > 0) === isLmeDebit)) ||
            (refKey && e.reference && e.reference.trim().toLowerCase() === refKey && ((Number(e.debit) > 0) === isLmeDebit))
        );

        if (existingIdx >= 0) {
          // Preserve user edited particulars, site, and values!
          if (lme.particulars) {
            mergedEntries[existingIdx].particulars = cleanTallyParticulars(lme.particulars, isLmeDebit);
          }
          if (lme.site_name) {
            mergedEntries[existingIdx].site_name = lme.site_name;
          }
          if (lme.date) {
            mergedEntries[existingIdx].date = toInputDateFormat(lme.date);
          }
          if (Number(lme.debit) > 0 || Number(lme.credit) > 0) {
            mergedEntries[existingIdx].debit = Number(lme.debit) || 0;
            mergedEntries[existingIdx].credit = Number(lme.credit) || 0;
          }
        } else {
          mergedEntries.push({
            id: lme.id,
            date: toInputDateFormat(lme.date),
            particulars: cleanTallyParticulars(lme.particulars, isLmeDebit),
            reference: lme.voucher_no,
            voucher_type: isLmeDebit ? 'sales_gst' : 'receipt',
            source_type: 'manual',
            payment_type: (lme.payment_type as any) || (isLmeDebit ? 'Sales GST' : 'Receipt'),
            site_name: lme.site_name || undefined,
            debit: Number(lme.debit) || 0,
            credit: Number(lme.credit) || 0,
            running_balance: 0,
            challan_id: lme.challan_id || undefined,
            is_paid: !isLmeDebit,
          });
        }
      });

      matchingContextChallans.forEach((c: any) => {
        const vch = (c.challan_number || c.reference_number || '').trim().toLowerCase();
        const cId = (c.id || '').toLowerCase();
        if ((vch && existingRefKeys.has(vch)) || (cId && existingChallanIds.has(cId))) {
          return;
        }
        if (c.is_deleted || c.status === 'cancelled' || c.status === 'void') return;

        // Delivery & Admin Approval Gate:
        // Only challans approved by Admin (confirming delivered) enter the party ledger.
        const isApproved = Boolean(c.is_approved) || c.status === 'approved' || c.delivery_status === 'approved';
        const isDelivered = Boolean(c.is_delivered) || c.status === 'delivered' || c.delivery_status === 'delivered';
        const isApprovedAndDelivered = isApproved && (isDelivered || Boolean((c as any).approved_at));
        if (!isApprovedAndDelivered) return;

        const amt = Number(c.total_amount) || 0;
        if (amt <= 0) return;

        if (vch) existingRefKeys.add(vch);
        if (cId) existingChallanIds.add(cId);

        const itemsCount = Array.isArray(c.items) ? c.items.length : 0;
        let itemSummary = '';
        if (Array.isArray(c.items) && c.items.length > 0) {
          const itemNames = c.items
            .map((it: any) => {
              const name = (it.item_description || it.name || it.brand || '').trim();
              const qty = it.quantity ? ` (${it.quantity} ${it.unit || ''})`.trim() : '';
              return `${name}${qty}`.trim();
            })
            .filter(Boolean);
          if (itemNames.length > 0) {
            itemSummary = itemNames.slice(0, 3).join(', ') + (itemNames.length > 3 ? ` +${itemNames.length - 3} more` : '');
          }
        }
        const basePrefix = c.apply_gst ? 'To SALE GST 18%' : 'To SALE';
        const particulars = (c as any).particulars && (c as any).particulars.trim()
          ? (c as any).particulars.trim()
          : itemSummary
          ? `${basePrefix}: ${itemSummary}`
          : `${basePrefix} (${itemsCount} items)`;

        mergedEntries.push({
          id: `entry_ch_${c.id}`,
          date: toInputDateFormat(c.challan_date || c.created_at),
          particulars,
          reference: c.challan_number || c.reference_number || 'CH',
          voucher_type: 'sales_gst',
          source_type: 'challan',
          payment_type: 'Sales GST',
          site_name: c.site_name || c.delivery_address || undefined,
          debit: amt,
          credit: 0,
          running_balance: 0,
          challan_id: c.id,
          is_paid: c.payment_status === 'paid',
          paid_amount: Number(c.paid_amount) || 0,
          payment_status: c.payment_status || 'unpaid',
          created_at: c.created_at || c.challan_date,
        });
      });

      // Merge sites strictly from delivered challans
      let mergedSites = [...(baseLedger.sites || [])];
      const existingSiteNames = new Set(
        mergedSites.map((s: any) => (s.site_name || '').trim().toLowerCase())
      );

      matchingContextChallans.forEach((c: any) => {
        if (c.is_deleted || c.status === 'cancelled' || c.status === 'void') return;
        const isApprovedOrDelivered = c.status === 'approved' || Boolean(c.is_approved) || c.status === 'delivered' || c.delivery_status === 'delivered' || Boolean(c.is_delivered);
        if (!isApprovedOrDelivered) return;

        let siteName = (c.site_name || '').trim();
        if (!siteName && c.delivery_address && c.delivery_address.trim()) {
          siteName = c.delivery_address.split(',')[0].trim();
        }
        if (!siteName) siteName = 'General Account';

        const lowerSName = siteName.toLowerCase();
        const alreadyExists = mergedSites.some((s: any) => {
          const existing = (s.site_name || '').trim().toLowerCase();
          return existing === lowerSName ||
                 (existing.length >= 4 && (lowerSName.startsWith(existing) || existing.startsWith(lowerSName))) ||
                 (s.challan_id && s.challan_id === c.id) ||
                 (s.challan_number && c.challan_number && s.challan_number === c.challan_number);
        });

        if (!alreadyExists && !existingSiteNames.has(lowerSName)) {
          existingSiteNames.add(lowerSName);
          mergedSites.push({
            id: `site_${selectedCustomerId}_${lowerSName.replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
            customer_id: selectedCustomerId,
            site_name: siteName,
            site_address: c.delivery_address || `${siteName} Site`,
            opening_balance: 0,
            credit_adjustment: 0,
            debit_adjustment: Number(c.total_amount) || 0,
            current_balance: Number(c.total_amount) || 0,
            challan_id: c.id,
            challan_number: c.challan_number,
            order_index: mergedSites.length,
            is_verified: true,
            verified_at: new Date().toISOString(),
            verified_by: 'Auto (Challan)',
            is_active: true,
            created_at: c.challan_date || new Date().toISOString(),
          });
        }
      });

      // Recalculate entries and running balance chronologically downwards (oldest top, newest bottom)
      // On same date: Debit first, then Credit below it
      mergedEntries.sort((a, b) => {
        const da = new Date(a.date).getTime() || 0;
        const db = new Date(b.date).getTime() || 0;
        if (da !== db) return da - db;
        const aWeight = (a.debit || 0) > 0 ? 0 : 1;
        const bWeight = (b.debit || 0) > 0 ? 0 : 1;
        if (aWeight !== bWeight) return aWeight - bWeight;
        return new Date(a.created_at || a.date).getTime() - new Date(b.created_at || b.date).getTime();
      });
      let running = baseLedger.openingBalance || 0;
      let totDebit = 0;
      let totCredit = 0;
      mergedEntries = mergedEntries.map((e) => {
        running = Math.round((running + e.debit - e.credit) * 100) / 100;
        totDebit += e.debit;
        totCredit += e.credit;
        return { ...e, running_balance: running };
      });

      baseLedger = {
        ...baseLedger,
        totalDebit: Math.round(totDebit * 100) / 100,
        totalCredit: Math.round(totCredit * 100) / 100,
        closingBalance: running,
        verifiedClosingBalance: running,
        entries: mergedEntries,
        sites: mergedSites,
      };

      setLedgerData(baseLedger);
    } catch (err) {
      console.error('Failed to load ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerChallans = async (custId: string) => {
    if (!custId) return;
    try {
      const token = getClientAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const currentCustomers = customersRef.current || [];
      const currentContextCusts = contextCustomersRef.current || [];
      const currentContextChallans = contextChallansRef.current || [];

      const custObj =
        currentCustomers.find((c) => c.id === custId || c.name === custId) ||
        currentContextCusts.find((c: Customer) => c.id === custId || c.name === custId);
      const custName = custObj?.name || custObj?.business_name || (custId.length < 30 ? custId : '');

      const queryParams = new URLSearchParams({ customerId: custId });
      if (custName) queryParams.set('customerName', custName);

      const targetId = custId.toLowerCase();
      const targetName = custName.toLowerCase();

      // Immediate pre-population from in-memory contextChallans so UI is NEVER empty
      const localMatches = currentContextChallans.filter((c: any) => {
        if (c.is_deleted || c.status === 'cancelled' || c.status === 'void') return false;
        const isApproved = Boolean(c.is_approved) || c.status === 'approved' || c.delivery_status === 'approved';
        const isDelivered = Boolean(c.is_delivered) || c.status === 'delivered' || c.delivery_status === 'delivered';
        const isApprovedAndDelivered = isApproved && (isDelivered || Boolean(c.approved_at));
        if (!isApprovedAndDelivered) return false;

        const cId = (c.customer_id || '').toLowerCase();
        const cName = (c.customer_name || '').toLowerCase();
        if (targetId && (cId === targetId || cName === targetId)) return true;
        if (targetName && (cName === targetName || cName.includes(targetName))) return true;
        if (
          (targetId === 'cust_rk_sales' || targetId.includes('rk') || targetName.includes('rk')) &&
          (cName.includes('r k') || cName.includes('rk sales'))
        ) {
          return true;
        }
        return false;
      }).map((c: any) => ({
        id: c.id,
        challan_number: c.challan_number || c.reference_number || 'CH',
        date: c.challan_date || c.created_at,
        amount: Number(c.total_amount) || 0,
        status: c.status || 'delivered',
        items_count: Array.isArray(c.items) ? c.items.length : 0,
        site_name: c.site_name || c.delivery_address || '',
      }));

      if (localMatches.length > 0) {
        setCustomerChallans(localMatches);
      }

      // Fetch from API to get all latest server-side challans
      const res = await fetch(`/api/challans?${queryParams.toString()}`, { headers });
      if (res.ok) {
        const d = await res.json();
        const serverList = (d.challans || [])
          .filter((c: any) => {
            if (c.is_deleted || c.status === 'cancelled' || c.status === 'void') return false;
            const isApproved = Boolean(c.is_approved) || c.status === 'approved' || c.delivery_status === 'approved';
            const isDelivered = Boolean(c.is_delivered) || c.status === 'delivered' || c.delivery_status === 'delivered';
            const isApprovedAndDelivered = isApproved && (isDelivered || Boolean(c.approved_at));
            if (!isApprovedAndDelivered) return false;

            const cId = (c.customer_id || '').toLowerCase();
            const cName = (c.customer_name || '').toLowerCase();
            if (targetId && (cId === targetId || cName === targetId)) return true;
            if (targetName && (cName === targetName || cName.includes(targetName))) return true;
            if (
              (targetId === 'cust_rk_sales' || targetId.includes('rk') || targetName.includes('rk')) &&
              (cName.includes('r k') || cName.includes('rk sales'))
            ) {
              return true;
            }
            return false;
          })
          .map((c: any) => ({
            id: c.id,
            challan_number: c.challan_number || c.reference_number || 'CH',
            date: c.challan_date || c.created_at,
            amount: Number(c.total_amount) || 0,
            status: c.status || 'delivered',
            items_count: Array.isArray(c.items) ? c.items.length : 0,
            site_name: c.site_name || c.delivery_address || '',
          }));

        // Merge serverList and localMatches by unique ID
        const chMap = new Map<string, any>();
        localMatches.forEach((c: any) => chMap.set(c.id, c));
        serverList.forEach((c: any) => chMap.set(c.id, c));
        setCustomerChallans(Array.from(chMap.values()));
      }
    } catch (err) {
      console.warn('Failed to fetch customer challans:', err);
    }
  };

  // Only trigger on actual filter / customer changes - NEVER on fluctuating array references
  useEffect(() => {
    fetchLedger();
    if (selectedCustomerId) {
      fetchCustomerChallans(selectedCustomerId);
    }
  }, [selectedCustomerId, fromDate, toDate, typeFilter, siteFilter]);

  // Selected customer object
  const selectedCustomer = useMemo<Customer>(() => {
    if (selectedCustomerId === 'all') {
      return {
        id: 'all',
        user_id: '',
        name: 'All Parties (Overall Summary)',
        business_name: 'All Parties (Overall Summary)',
        company_name: '',
        contact_person: '',
        billing_address: '',
        delivery_address: '',
        phone: '',
        gstin: '',
        notes: null,
        is_active: true,
        created_at: '',
        updated_at: '',
      };
    }
    const found =
      customers.find((c) => c.id === selectedCustomerId || c.name === selectedCustomerId) ||
      (contextCustomers || []).find((c: Customer) => c.id === selectedCustomerId || c.name === selectedCustomerId);
    if (found) return found;
    if (customers.length > 0) return customers[0];
    if (contextCustomers && contextCustomers.length > 0) return contextCustomers[0];
    return {
      id: '',
      user_id: '',
      name: '',
      business_name: '',
      company_name: '',
      contact_person: '',
      billing_address: '',
      delivery_address: '',
      phone: '',
      gstin: '',
      notes: null,
      is_active: false,
      created_at: '',
      updated_at: '',
    };
  }, [customers, contextCustomers, selectedCustomerId]);

  // Filtered entries by site and search input
  const displayEntries = useMemo(() => {
    let list = ledgerData.entries || [];
    if (siteFilter && siteFilter !== 'all') {
      const sf = siteFilter.trim().toLowerCase();
      list = list.filter((e) => {
        const sName = (e.site_name || '').trim().toLowerCase();
        const part = (e.particulars || '').toLowerCase();
        return sName === sf || sName.includes(sf) || part.includes(sf);
      });
    }
    if (searchChallanNo.trim()) {
      const q = searchChallanNo.trim().toLowerCase();
      list = list.filter(
        (e) =>
          (e.reference && e.reference.toLowerCase().includes(q)) ||
          (e.particulars && e.particulars.toLowerCase().includes(q))
      );
    }
    return list;
  }, [ledgerData.entries, siteFilter, searchChallanNo]);

  // Site-specific summary metrics when site filter is active
  const siteFilteredSummary = useMemo(() => {
    if (siteFilter === 'all') return null;
    const siteDebits = displayEntries.reduce((sum, e) => sum + (Number(e.debit) || 0), 0);
    const siteCredits = displayEntries.reduce((sum, e) => sum + (Number(e.credit) || 0), 0);
    return {
      siteName: siteFilter,
      totalDebit: siteDebits,
      totalCredit: siteCredits,
      balance: siteDebits - siteCredits,
      entryCount: displayEntries.length,
    };
  }, [siteFilter, displayEntries]);

  // Filtered list of all parties in Overall Summary mode
  const filteredAllParties = useMemo(() => {
    if (!allPartiesData?.parties) return [];
    let list = allPartiesData.parties;

    if (allPartiesFilter === 'pending') {
      list = list.filter((p) => p.closing_balance > 0);
    } else if (allPartiesFilter === 'settled') {
      list = list.filter((p) => p.closing_balance <= 0);
    }

    if (allPartiesSearch.trim()) {
      const q = allPartiesSearch.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.business_name.toLowerCase().includes(q) ||
          p.contact_person.toLowerCase().includes(q) ||
          p.phone.includes(q) ||
          p.sites.some((s) => s.toLowerCase().includes(q))
      );
    }

    return list;
  }, [allPartiesData?.parties, allPartiesFilter, allPartiesSearch]);


  // Comprehensive Customer Transactions & Challans for Auto-Fill
  const availableCustomerTransactions = useMemo(() => {
    const list: Array<{
      id: string;
      label: string;
      voucher_no: string;
      date: string;
      amount: number;
      particulars: string;
      site_name?: string;
      type: 'Party Challan' | 'Sales GST' | 'Receipt' | 'Payment' | 'UPI' | 'Bank Transfer' | 'Cash' | 'Cheque';
      effect: 'debit' | 'credit';
      isChallan: boolean;
    }> = [];
    const seen = new Set<string>();

    const targetId = (selectedCustomerId || '').trim().toLowerCase();
    const custName = (selectedCustomer?.name || '').trim().toLowerCase();
    const custBiz = (selectedCustomer?.business_name || '').trim().toLowerCase();

    const isMatchThisCust = (cId?: string | null, cName?: string | null) => {
      const cid = (cId || '').trim().toLowerCase();
      const cname = (cName || '').trim().toLowerCase();
      if (targetId && (cid === targetId || cname === targetId)) return true;
      if (custName && (cname === custName || cname.includes(custName))) return true;
      if (custBiz && (cname === custBiz || cname.includes(custBiz))) return true;
      if (
        (targetId === 'cust_rk_sales' || targetId.includes('rk') || custName.includes('rk')) &&
        (cname.includes('r k') || cname.includes('rk sales'))
      ) {
        return true;
      }
      return false;
    };

    // 1. From customerChallans (API fetched)
    customerChallans.forEach((c) => {
      const key = `ch_${c.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        const vch = c.challan_number || 'CH';
        const dStr = c.date ? formatDateDisplay(c.date) : 'No date';
        list.push({
          id: c.id,
          label: `Challan #${vch} — ₹${Number(c.amount).toLocaleString('en-IN')} (${dStr}) [Debit]`,
          voucher_no: vch,
          date: toInputDateFormat(c.date),
          amount: Number(c.amount) || 0,
          particulars: `To SALE GST 18% - Challan ${vch}`,
          site_name: c.site_name || '',
          type: 'Party Challan',
          effect: 'debit',
          isChallan: true,
        });
      }
    });

    // 2. From contextChallans (useApp / client store)
    (contextChallans || []).forEach((c) => {
      if (isMatchThisCust(c.customer_id, c.customer_name) && !c.is_deleted && c.status !== 'void') {
        const key = `ch_${c.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          const vch = c.challan_number || c.reference_number || 'CH';
          const amt = Number(c.total_amount) || 0;
          const dStr = c.challan_date ? formatDateDisplay(c.challan_date) : 'No date';
          list.push({
            id: c.id,
            label: `Challan #${vch} — ₹${amt.toLocaleString('en-IN')} (${dStr}) [Debit]`,
            voucher_no: vch,
            date: toInputDateFormat(c.challan_date),
            amount: amt,
            particulars: c.apply_gst ? `To SALE GST 18% - Challan ${vch}` : `To SALE - Challan ${vch}`,
            site_name: c.site_name || c.delivery_address || '',
            type: 'Party Challan',
            effect: 'debit',
            isChallan: true,
          });
        }
      }
    });

    // 3. From ledgerData.entries (existing sales, receipts, payments, vouchers)
    (ledgerData.entries || []).forEach((e) => {
      const isSales = e.voucher_type === 'sales_gst' || (e.debit > 0 && e.credit === 0);
      const isReceipt = e.voucher_type === 'receipt' || (e.credit > 0 && e.debit === 0);
      const amt = isSales ? e.debit : e.credit;
      const ref = e.reference || e.particulars || 'VCH';
      const key = `entry_${e.id || ref}_${amt}`;

      if (!seen.has(key) && (amt > 0 || ref)) {
        seen.add(key);
        const tag = isSales ? 'Sales / Challan' : 'Payment / Receipt';
        const eff = isSales ? 'Debit' : 'Credit';
        const dStr = e.date ? formatDateDisplay(e.date) : '';
        list.push({
          id: e.id || key,
          label: `[${tag}] ${ref} — ₹${Number(amt).toLocaleString('en-IN')} (${dStr}) [${eff}]`,
          voucher_no: e.reference || '',
          date: toInputDateFormat(e.date),
          amount: Number(amt) || 0,
          particulars: e.particulars || (isSales ? `To SALE GST 18% - ${ref}` : `By Payment - ${ref}`),
          site_name: e.site_name || '',
          type: isSales ? 'Sales GST' : 'Receipt',
          effect: isSales ? 'debit' : 'credit',
          isChallan: isSales,
        });
      }
    });

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [customerChallans, contextChallans, ledgerData.entries, selectedCustomerId, selectedCustomer]);

  // Customer Challans for attaching to Sites
  const availableChallans = useMemo(() => {
    const list: Array<{ id: string; challan_number: string; date: string; amount: number; site_name?: string }> = [];
    const seen = new Set<string>();

    availableCustomerTransactions
      .filter((t) => t.isChallan)
      .forEach((t) => {
        const key = (t.voucher_no || t.id).trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            id: t.id,
            challan_number: t.voucher_no,
            date: t.date,
            amount: t.amount,
            site_name: t.site_name,
          });
        }
      });

    return list;
  }, [availableCustomerTransactions]);

  // Unique available sites for filter dropdown (deduplicated across customer profile sites, ledger sites, and challans)
  const availableSites = useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(selectedCustomer?.sites)) {
      selectedCustomer.sites.forEach((s) => {
        if (s.site_name && s.site_name.trim()) set.add(s.site_name.trim());
      });
    }
    (ledgerData.sites || []).forEach((s) => {
      if (s.site_name && s.site_name.trim()) set.add(s.site_name.trim());
    });
    customerChallans.forEach((c) => {
      if (c.site_name && c.site_name.trim()) {
        const s = c.site_name.split(',')[0].trim();
        if (s) set.add(s);
      }
    });
    return Array.from(set);
  }, [selectedCustomer?.sites, ledgerData.sites, customerChallans]);

  // Split entries into Period 1 (Feb 2024) and Period 2 (Apr 2024 onwards) if R K Sales
  const isRKSales =
    selectedCustomer.name?.toLowerCase().includes('r k sales') ||
    selectedCustomer.id === 'cust_rk_sales';

  // Synchronize fromDate to customer creation date (or 2024-02-01 for R K Sales)
  useEffect(() => {
    if (!selectedCustomer || !selectedCustomer.id) return;
    const isRK =
      selectedCustomer.id === 'cust_rk_sales' ||
      selectedCustomer.name?.toLowerCase().includes('r k sales') ||
      (selectedCustomer.business_name && selectedCustomer.business_name.toLowerCase().includes('r k sales'));
    if (isRK) {
      setFromDate('2024-02-01');
    } else if (selectedCustomer.created_at) {
      setFromDate(toInputDateFormat(selectedCustomer.created_at));
    } else {
      setFromDate(toInputDateFormat(new Date()));
    }
  }, [selectedCustomer?.id, selectedCustomer?.created_at, selectedCustomer?.name, selectedCustomer?.business_name]);

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

  // Period 2 calculations (for historical split when customer has multi-period accounting)
  const period2Calculations = useMemo(() => {
    const opening = period1Entries.length > 0 ? period1Closing : (ledgerData.openingBalance || 0);
    const debitEntries = period2Entries.reduce((sum, e) => sum + (e.debit || 0), 0);
    const creditEntries = period2Entries.reduce((sum, e) => sum + (e.credit || 0), 0);

    const totalDebits = opening + debitEntries;
    const totalCredits = creditEntries;
    const finalClosing = Math.round((totalDebits - totalCredits) * 100) / 100;
    const balancedTotal = Math.max(totalDebits, totalCredits + finalClosing);

    return {
      opening,
      debitEntries,
      creditEntries,
      verifiedNet: 0,
      totalDebits,
      totalCredits,
      finalClosing,
      balancedTotal,
    };
  }, [isRKSales, period1Entries, period1Closing, period2Entries, ledgerData]);

  // Reconciled Sites Breakdown - 100% Mathematically Reconciled with Ledger View
  const { reconciledSites, sitesSummary } = useMemo(() => {
    // 1. Determine active scope based on customer and period
    const activeEntries = isRKSales ? period2Entries : displayEntries;
    const activeOpening = isRKSales ? period1Closing : (ledgerData.openingBalance || 0);

    const targetCustId = (selectedCustomerId || '').trim().toLowerCase();
    const custName = (selectedCustomer?.name || '').trim().toLowerCase();

    // 2. Collect all active customer challans
    const activeChallans = (contextChallans || []).filter((c: any) => {
      const cId = (c.customer_id || '').toLowerCase();
      const cName = (c.customer_name || '').toLowerCase();
      const matchCust = (targetCustId && (cId === targetCustId || cName === targetCustId)) ||
                        (custName && (cName === custName || cName.includes(custName)));
      return matchCust && !c.is_deleted && c.status !== 'cancelled' && c.status !== 'void';
    });

    const allChallanMap = new Map<string, any>();
    activeChallans.forEach((c: any) => allChallanMap.set(c.id || c.challan_number, c));
    (customerChallans || []).forEach((c: any) => {
      if (!allChallanMap.has(c.id) && !allChallanMap.has(c.challan_number)) {
        allChallanMap.set(c.id || c.challan_number, c);
      }
    });
    const combinedChallans = Array.from(allChallanMap.values());

    // 3. Normalize & Deduplicate Site Buckets
    interface SiteBucket extends CustomerSite {
      aliases: Set<string>;
    }

    const siteBuckets: SiteBucket[] = [];

    const findBucket = (rawName: string): SiteBucket | undefined => {
      if (!rawName) return undefined;
      const lower = rawName.trim().toLowerCase();
      return siteBuckets.find(
        (b) =>
          b.site_name.toLowerCase() === lower ||
          b.aliases.has(lower) ||
          (lower.length >= 4 && b.site_name.toLowerCase().startsWith(lower)) ||
          (b.site_name.length >= 4 && lower.startsWith(b.site_name.toLowerCase()))
      );
    };

    const getOrCreateBucket = (name: string, address?: string, challanId?: string, challanNo?: string): SiteBucket => {
      const cleanName = (name || 'General Account').trim();
      let bucket = findBucket(cleanName);
      if (!bucket) {
        bucket = {
          id: `reconciled_site_${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          customer_id: selectedCustomerId,
          site_name: cleanName,
          site_address: address || `${cleanName} Site`,
          challan_id: challanId,
          challan_number: challanNo,
          attached_challans: [],
          opening_balance: 0,
          credit_adjustment: 0,
          debit_adjustment: 0,
          current_balance: 0,
          is_verified: true,
          order_index: siteBuckets.length,
          created_at: new Date().toISOString(),
          aliases: new Set([cleanName.toLowerCase()]),
        };
        siteBuckets.push(bucket);
      } else {
        bucket.aliases.add(cleanName.toLowerCase());
        if (address && (!bucket.site_address || bucket.site_address.endsWith('Site'))) {
          bucket.site_address = address;
        }
        if (cleanName.length > bucket.site_name.length && cleanName.toLowerCase().includes(bucket.site_name.toLowerCase())) {
          bucket.aliases.add(bucket.site_name.toLowerCase());
          bucket.site_name = cleanName;
        }
      }
      return bucket;
    };

    // Populate buckets from persisted ledgerData.sites
    (ledgerData.sites || []).forEach((s) => {
      const b = getOrCreateBucket(s.site_name, s.site_address, s.challan_id, s.challan_number);
      b.id = s.id;
      b.is_verified = s.is_verified !== false;
      b.order_index = s.order_index ?? b.order_index;
    });

    // Populate buckets from combinedChallans
    combinedChallans.forEach((c: any) => {
      let sName = (c.site_name || '').trim();
      if (!sName && c.delivery_address) {
        sName = c.delivery_address.split(',')[0].trim();
      }
      if (sName) {
        const b = getOrCreateBucket(sName, c.delivery_address, c.id, c.challan_number);
        const chNo = c.challan_number || c.reference_number;
        if (chNo && !b.attached_challans!.some((ch) => ch.challan_number === chNo)) {
          b.attached_challans!.push({
            id: c.id,
            challan_number: chNo,
            amount: Number(c.total_amount) || 0,
          });
        }
      }
    });

    // Populate buckets from active ledger entries (e.g. SH/11/003 or custom sites)
    activeEntries.forEach((e) => {
      if (e.site_name && e.site_name.trim()) {
        getOrCreateBucket(e.site_name.trim());
      }
    });

    if (siteBuckets.length === 0) {
      getOrCreateBucket('General Account', selectedCustomer?.billing_address || 'Main Office');
    }

    // Associate unattached challans
    combinedChallans.forEach((c: any) => {
      const chNo = c.challan_number || c.reference_number;
      if (!chNo) return;
      const alreadyAttached = siteBuckets.some((b) => b.attached_challans?.some((ch) => ch.challan_number === chNo));
      if (!alreadyAttached) {
        let sName = (c.site_name || '').trim();
        if (!sName && c.delivery_address) sName = c.delivery_address.split(',')[0].trim();
        const b = findBucket(sName) || siteBuckets[0];
        b.attached_challans!.push({
          id: c.id,
          challan_number: chNo,
          amount: Number(c.total_amount) || 0,
        });
      }
    });

    // Partition active entries across buckets
    activeEntries.forEach((e) => {
      let targetBucket: SiteBucket | undefined;

      if (e.site_name && e.site_name.trim()) {
        targetBucket = findBucket(e.site_name.trim());
      }

      if (!targetBucket && e.reference) {
        const refClean = e.reference.trim().toLowerCase();
        targetBucket = siteBuckets.find((b) =>
          b.attached_challans?.some((ch) => ch.challan_number.toLowerCase() === refClean) ||
          (b.challan_number && b.challan_number.toLowerCase() === refClean)
        );
      }

      if (!targetBucket && e.particulars) {
        const partClean = e.particulars.toLowerCase();
        targetBucket = siteBuckets.find((b) =>
          partClean.includes(b.site_name.toLowerCase()) ||
          b.attached_challans?.some((ch) => partClean.includes(ch.challan_number.toLowerCase()))
        );
      }

      if (!targetBucket) {
        targetBucket = siteBuckets[0];
      }

      if (e.debit > 0) {
        targetBucket.debit_adjustment = (targetBucket.debit_adjustment || 0) + (Number(e.debit) || 0);
        if (e.reference && (e.reference.includes('/') || e.reference.startsWith('SH') || e.reference.startsWith('CH'))) {
          if (!targetBucket.attached_challans!.some((ch) => ch.challan_number === e.reference)) {
            targetBucket.attached_challans!.push({
              id: e.challan_id,
              challan_number: e.reference,
              amount: Number(e.debit) || 0,
            });
          }
        }
      }

      if (e.credit > 0) {
        targetBucket.credit_adjustment = (targetBucket.credit_adjustment || 0) + (Number(e.credit) || 0);
      }
    });

    // Allocate Active Opening Balance to the primary site
    if (siteBuckets.length > 0) {
      siteBuckets[0].opening_balance = activeOpening;
    }

    siteBuckets.forEach((b) => {
      b.opening_balance = Math.round((b.opening_balance || 0) * 100) / 100;
      b.debit_adjustment = Math.round((b.debit_adjustment || 0) * 100) / 100;
      b.credit_adjustment = Math.round((b.credit_adjustment || 0) * 100) / 100;
      b.current_balance = Math.round(((b.opening_balance || 0) + (b.debit_adjustment || 0) - (b.credit_adjustment || 0)) * 100) / 100;
    });

    let finalSites: CustomerSite[] = siteBuckets.filter((b, idx) => {
      if (idx === 0) return true;
      return (
        b.opening_balance !== 0 ||
        b.debit_adjustment !== 0 ||
        b.credit_adjustment !== 0 ||
        (b.attached_challans && b.attached_challans.length > 0)
      );
    });

    if (finalSites.length === 0) {
      finalSites = siteBuckets;
    }

    let sumOpening = 0;
    let sumCredit = 0;
    let sumDebit = 0;
    let sumCurrent = 0;

    finalSites.forEach((s) => {
      sumOpening += s.opening_balance || 0;
      sumCredit += s.credit_adjustment || 0;
      sumDebit += s.debit_adjustment || 0;
      sumCurrent += s.current_balance || 0;
    });

    sumOpening = Math.round(sumOpening * 100) / 100;
    sumCredit = Math.round(sumCredit * 100) / 100;
    sumDebit = Math.round(sumDebit * 100) / 100;
    sumCurrent = Math.round(sumCurrent * 100) / 100;

    return {
      reconciledSites: finalSites,
      sitesSummary: { sumOpening, sumCredit, sumDebit, sumCurrent },
    };
  }, [
    isRKSales,
    period2Entries,
    displayEntries,
    period1Closing,
    ledgerData.openingBalance,
    ledgerData.closingBalance,
    ledgerData.sites,
    selectedCustomerId,
    selectedCustomer,
    contextChallans,
    customerChallans,
    period2Calculations,
  ]);

  const isAdminUser = currentUser?.role === 'admin' || !currentUser || currentUser?.role !== 'employee';

  // ----------------------------------------------------
  // PENDING OUTSTANDINGS (MONTHLY AGING)
  // Matching user requested format:
  // Rs. 96,061/- (JULY)
  // Rs. 42,300/- (AUG)
  // Rs. 41,493/- (SEP)
  // Rs. 2,01,486/- (OCT)
  //
  // Rs. 3,81,340/-(Total as on DD.MM.YY)
  // ----------------------------------------------------
  const monthlyOutstandings = useMemo(() => {
    const entries = [...(ledgerData.entries || displayEntries || [])];
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let availableCredit = entries.reduce((sum, e) => sum + (Number(e.credit) || 0), 0);

    interface DebitItem {
      date: string;
      monthKey: string;
      monthName: string;
      amount: number;
      unpaid: number;
    }

    const debits: DebitItem[] = [];

    if (ledgerData.openingBalance > 0) {
      const opDate = fromDate || '2024-04-01';
      const d = new Date(opDate);
      const mName = !isNaN(d.getTime()) ? d.toLocaleString('en-IN', { month: 'short' }).toUpperCase() : 'APR';
      debits.push({
        date: opDate,
        monthKey: opDate.slice(0, 7),
        monthName: mName,
        amount: ledgerData.openingBalance,
        unpaid: ledgerData.openingBalance,
      });
    }

    entries.forEach((e) => {
      const dVal = Number(e.debit) || 0;
      if (dVal > 0) {
        const d = new Date(e.date);
        const mName = !isNaN(d.getTime())
          ? d.toLocaleString('en-IN', { month: 'short' }).toUpperCase()
          : 'GEN';
        debits.push({
          date: e.date,
          monthKey: e.date.slice(0, 7),
          monthName: mName,
          amount: dVal,
          unpaid: dVal,
        });
      }
    });

    // FIFO allocation of credits against debits
    for (const item of debits) {
      if (availableCredit <= 0) break;
      if (availableCredit >= item.unpaid) {
        availableCredit -= item.unpaid;
        item.unpaid = 0;
      } else {
        item.unpaid -= availableCredit;
        availableCredit = 0;
      }
    }

    // Group remaining unpaid amounts by month
    const map = new Map<string, { monthName: string; amount: number }>();
    debits.forEach((d) => {
      if (d.unpaid > 0) {
        const existing = map.get(d.monthKey);
        if (existing) {
          existing.amount += d.unpaid;
        } else {
          map.set(d.monthKey, {
            monthName: d.monthName,
            amount: d.unpaid,
          });
        }
      }
    });

    const items = Array.from(map.entries()).map(([key, val]) => ({
      key,
      monthName: val.monthName,
      amount: Math.round(val.amount),
    }));

    const totalUnpaid = items.reduce((sum, i) => sum + i.amount, 0);

    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yy = String(today.getFullYear()).slice(-2);
    const dateFormatted = `${dd}.${mm}.${yy}`;

    return {
      items,
      totalUnpaid,
      dateFormatted,
    };
  }, [displayEntries, ledgerData.entries, ledgerData.openingBalance, fromDate]);

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
    setEditSiteChallanId(site.challan_id || '');
    setEditSiteChallanNumber(site.challan_number || '');
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
          site_name: editSiteName.trim(),
          opening_balance: Number(editSiteOpening) || 0,
          credit_adjustment: Number(editSiteCredit) || 0,
          debit_adjustment: Number(editSiteDebit) || 0,
          challan_id: editSiteChallanId || undefined,
          challan_number: editSiteChallanNumber || undefined,
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

  // Move Site Up (Reorder)
  const handleMoveSiteUp = async (index: number) => {
    if (!ledgerData.sites || index <= 0) return;
    const newSites = [...ledgerData.sites];
    const temp = newSites[index];
    newSites[index] = newSites[index - 1];
    newSites[index - 1] = temp;

    // Instant local UI update
    setLedgerData((prev) => ({ ...prev, sites: newSites }));

    try {
      const token = getClientAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      await fetch('/api/sites', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          action: 'reorder',
          customerId: selectedCustomerId,
          siteIds: newSites.map((s) => s.id),
        }),
      });
      showToast(`Site "${temp.site_name}" moved up`);
    } catch {
      showToast('Error saving reordered sites', 'error');
    }
  };

  // Move Site Down (Reorder)
  const handleMoveSiteDown = async (index: number) => {
    if (!ledgerData.sites || index >= ledgerData.sites.length - 1) return;
    const newSites = [...ledgerData.sites];
    const temp = newSites[index];
    newSites[index] = newSites[index + 1];
    newSites[index + 1] = temp;

    // Instant local UI update
    setLedgerData((prev) => ({ ...prev, sites: newSites }));

    try {
      const token = getClientAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      await fetch('/api/sites', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          action: 'reorder',
          customerId: selectedCustomerId,
          siteIds: newSites.map((s) => s.id),
        }),
      });
      showToast(`Site "${temp.site_name}" moved down`);
    } catch {
      showToast('Error saving reordered sites', 'error');
    }
  };

  // Confirm delete of any transaction entry from Ledger Table
  const handleConfirmDeleteEntry = async () => {
    if (!entryToDelete) return;
    const toDelete = entryToDelete;
    try {
      setIsDeletingEntry(true);

      // 1. Optimistic removal from local UI immediately
      setLedgerData((prev) => {
        const remaining = prev.entries.filter(
          (e) => e.id !== toDelete.id && (!toDelete.reference || e.reference !== toDelete.reference)
        );
        let running = prev.openingBalance || 0;
        let totDebit = 0;
        let totCredit = 0;
        const recomputed = remaining.map((e) => {
          running = Math.round((running + e.debit - e.credit) * 100) / 100;
          totDebit += e.debit;
          totCredit += e.credit;
          return { ...e, running_balance: running };
        });
        return {
          ...prev,
          totalDebit: Math.round(totDebit * 100) / 100,
          totalCredit: Math.round(totCredit * 100) / 100,
          closingBalance: running,
          verifiedClosingBalance: running,
          entries: recomputed,
        };
      });

      // 2. Client context deletion if challan
      const chId = toDelete.challan_id || (toDelete.id.startsWith('entry_ch_') ? toDelete.id.replace(/^entry_ch_/, '') : '');
      if (chId && deleteChallan) {
        await deleteChallan(chId);
      }

      // Remove from local persistence
      removeLocalManualEntry(toDelete.id, toDelete.reference);

      setEntryToDelete(null);

      // 3. API deletion call
      const token = getClientAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch('/api/ledger', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({
          id: toDelete.id,
          sourceType: toDelete.source_type,
          challanId: chId || toDelete.challan_id,
          paymentId: toDelete.payment_id,
          returnId: toDelete.return_id,
          manualId: toDelete.manual_id,
        }),
      });

      if (res.ok) {
        showToast(`Voucher ${toDelete.reference || ''} permanently removed from ledger`, 'success');
        await fetchLedger(true);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to delete ledger entry', 'error');
        await fetchLedger(true);
      }
    } catch {
      showToast('Error deleting ledger entry', 'error');
    } finally {
      setIsDeletingEntry(false);
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
          challan_id: addSiteChallanId || undefined,
          challan_number: addSiteChallanNumber || undefined,
        }),
      });

      if (res.ok) {
        showToast(`New site "${newSiteName}" added and verified!`);
        setShowAddSiteModal(false);
        setNewSiteName('');
        setNewSiteOpening('0');
        setNewSiteCredit('0');
        setNewSiteDebit('0');
        setAddSiteChallanId('');
        setAddSiteChallanNumber('');
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
  const handleCreateManualEntry = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    const numAmt = Number(entryAmount);
    if (!numAmt || numAmt <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    const isDebit = entryDebitOrCredit === 'debit';
    const formattedParticulars = cleanTallyParticulars(entryParticulars, isDebit);

    const safeDate = toInputDateFormat(entryDate);
    const safeVoucher = (entryVoucherNo || '').trim() || (isDebit ? `VCH-${Date.now().toString().slice(-4)}` : `REC-${Date.now().toString().slice(-4)}`);
    const safeSite = (entrySiteName || '').trim();
    const safeType = entryType === 'Party Challan' ? 'Sales GST' : entryType;
    const custId = selectedCustomer?.id || selectedCustomerId;

    // 1. Immediate optimistic UI update
    const newEntry: CustomerLedgerEntry = {
      id: `mle_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      date: safeDate,
      particulars: formattedParticulars,
      reference: safeVoucher,
      voucher_type: isDebit ? 'sales_gst' : 'receipt',
      source_type: 'manual',
      payment_type: safeType,
      site_name: safeSite || undefined,
      debit: isDebit ? numAmt : 0,
      credit: !isDebit ? numAmt : 0,
      running_balance: 0,
      challan_id: selectedChallanForEntry || undefined,
      is_paid: !isDebit,
      created_at: new Date().toISOString(),
    };

    // Close modal & reset fields
    setShowAddEntryModal(false);
    setEntryParticulars('');
    setEntryAmount('');
    setEntryVoucherNo('');
    setSelectedChallanForEntry('');
    setEntrySiteName('');
    showToast('Ledger entry added successfully!');

    // Update local state right away so user sees it instantly
    setLedgerData((prev) => {
      const updatedEntries = [...prev.entries, newEntry].sort((a, b) => {
        const da = new Date(a.date).getTime() || 0;
        const db = new Date(b.date).getTime() || 0;
        if (da !== db) return da - db;
        const aWeight = (a.debit || 0) > 0 ? 0 : 1;
        const bWeight = (b.debit || 0) > 0 ? 0 : 1;
        if (aWeight !== bWeight) return aWeight - bWeight;
        return new Date(a.created_at || a.date).getTime() - new Date(b.created_at || b.date).getTime();
      });
      let running = prev.openingBalance || 0;
      let totDebit = 0;
      let totCredit = 0;
      const recomputed = updatedEntries.map((item) => {
        running = Math.round((running + item.debit - item.credit) * 100) / 100;
        totDebit += item.debit;
        totCredit += item.credit;
        return { ...item, running_balance: running };
      });

      // Auto-add site if provided and not yet present
      let updatedSites = [...prev.sites];
      if (safeSite && !updatedSites.some((s) => s.site_name.toLowerCase() === safeSite.toLowerCase())) {
        updatedSites.push({
          id: `site_${custId}_${safeSite.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
          customer_id: custId,
          site_name: safeSite,
          site_address: `${safeSite} Site`,
          opening_balance: 0,
          credit_adjustment: 0,
          debit_adjustment: 0,
          current_balance: 0,
          order_index: updatedSites.length,
          is_verified: true,
          verified_at: new Date().toISOString(),
          verified_by: 'Manual Entry',
          is_active: true,
          created_at: new Date().toISOString(),
        });
      }

      return {
        ...prev,
        totalDebit: Math.round(totDebit * 100) / 100,
        totalCredit: Math.round(totCredit * 100) / 100,
        closingBalance: running,
        verifiedClosingBalance: running,
        entries: recomputed,
        sites: updatedSites,
      };
    });

    const custName = (selectedCustomer?.name || selectedCustomer?.business_name || '').trim();

    // 2. Persist to local storage immediately so entries NEVER vanish
    saveLocalManualEntry({
      id: newEntry.id,
      customer_id: custId,
      customer_name: custName || undefined,
      date: safeDate,
      particulars: formattedParticulars,
      payment_type: safeType,
      voucher_no: safeVoucher,
      debit: isDebit ? numAmt : 0,
      credit: !isDebit ? numAmt : 0,
      site_name: safeSite || undefined,
      challan_id: selectedChallanForEntry || undefined,
    });

    // 3. Persist to server API in background
    try {
      const token = getClientAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      await fetch('/api/ledger', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer_id: custId,
          customer_name: custName || undefined,
          date: safeDate,
          particulars: formattedParticulars,
          payment_type: safeType,
          voucher_no: safeVoucher,
          debit: isDebit ? numAmt : 0,
          credit: !isDebit ? numAmt : 0,
          site_name: safeSite || undefined,
          challan_id: selectedChallanForEntry || undefined,
        }),
      });

      await fetchLedger(true);
    } catch (err) {
      console.warn('Server ledger save note:', err);
    }
  };

  // Edit Ledger Entry Handler
  const handleOpenEditEntry = (entry: CustomerLedgerEntry) => {
    setEditingEntry(entry);
    setEditEntryDate(toInputDateFormat(entry.date));
    setEditEntryType(entry.payment_type || (entry.debit > 0 ? 'Sales GST' : 'Receipt'));
    const isPaymentType =
      (entry.payment_type && ['cash', 'upi', 'cheque', 'bank transfer', 'receipt', 'credit adjustment', 'generic receipt (credit)'].includes(entry.payment_type.toLowerCase())) ||
      (entry.particulars && /^(to\s+by|by)\s+(cash|upi|cheque|bank|hdfc|receipt)/i.test(entry.particulars));
    const isCr = Number(entry.credit) > 0 || (isPaymentType && Number(entry.debit) > 0);
    setEditEntryDebitOrCredit(isCr ? 'credit' : 'debit');
    setEditEntryVoucherNo(entry.reference || '');
    const amt = isCr ? (Number(entry.credit) > 0 ? entry.credit : entry.debit) : entry.debit;
    setEditEntryAmount(String(amt || ''));
    setEditEntryParticulars(cleanTallyParticulars(entry.particulars, !isCr));
    setEditEntrySiteName(entry.site_name || '');
    setEditEntryReason(entry.reason || '');
    setShowEditEntryModal(true);
  };

  const handleUpdateEntrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;

    const numAmt = Number(editEntryAmount);
    if (isNaN(numAmt) || numAmt < 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    const isDebit = editEntryDebitOrCredit === 'debit';
    const formattedParticulars = cleanTallyParticulars(editEntryParticulars, isDebit);
    const reasonText = editEntryReason.trim() || 'Admin ledger adjustment / rate correction';

    try {
      setIsUpdatingEntry(true);

      // 1. Optimistic local update
      setLedgerData((prev) => {
        const updated = prev.entries.map((item) => {
          if (item.id === editingEntry.id) {
            return {
              ...item,
              date: toInputDateFormat(editEntryDate),
              particulars: formattedParticulars,
              payment_type: editEntryType,
              reference: editEntryVoucherNo.trim(),
              debit: isDebit ? numAmt : 0,
              credit: !isDebit ? numAmt : 0,
              site_name: editEntrySiteName.trim() || undefined,
            };
          }
          return item;
        });
        let running = prev.openingBalance || 0;
        let totDebit = 0;
        let totCredit = 0;
        const recomputed = updated.map((e) => {
          running = Math.round((running + e.debit - e.credit) * 100) / 100;
          totDebit += e.debit;
          totCredit += e.credit;
          return { ...e, running_balance: running };
        });
        return {
          ...prev,
          totalDebit: Math.round(totDebit * 100) / 100,
          totalCredit: Math.round(totCredit * 100) / 100,
          closingBalance: running,
          verifiedClosingBalance: running,
          entries: recomputed,
        };
      });

      // 2. Client context store update if challan
      const chId = editingEntry.challan_id || (editingEntry.id.startsWith('entry_ch_') ? editingEntry.id.replace(/^entry_ch_/, '') : '');
      if (chId && updateChallan) {
        await updateChallan(chId, {
          total_amount: isDebit ? numAmt : undefined,
          site_name: editEntrySiteName.trim() || undefined,
          reference_number: editEntryVoucherNo.trim() || undefined,
        });
      }

      // Update local storage persistence
      saveLocalManualEntry({
        id: editingEntry.id,
        customer_id: selectedCustomer?.id || selectedCustomerId,
        customer_name: (selectedCustomer?.name || selectedCustomer?.business_name || '').trim() || undefined,
        date: toInputDateFormat(editEntryDate),
        particulars: formattedParticulars,
        payment_type: editEntryType,
        voucher_no: editEntryVoucherNo.trim(),
        debit: isDebit ? numAmt : 0,
        credit: !isDebit ? numAmt : 0,
        site_name: editEntrySiteName.trim() || undefined,
        challan_id: editingEntry.challan_id,
      });

      const token = getClientAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch('/api/ledger', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          id: editingEntry.id,
          customer_id: selectedCustomer?.id || selectedCustomerId,
          date: toInputDateFormat(editEntryDate),
          particulars: formattedParticulars,
          payment_type: editEntryType,
          voucher_no: editEntryVoucherNo.trim(),
          debit: isDebit ? numAmt : 0,
          credit: !isDebit ? numAmt : 0,
          site_name: editEntrySiteName.trim() || undefined,
          challan_id: editingEntry.challan_id,
          manual_id: editingEntry.manual_id,
          source_type: editingEntry.source_type,
          reason: reasonText,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Failed to update ledger entry', 'error');
        return;
      }

      showToast('Ledger entry updated successfully!');
      setShowEditEntryModal(false);
      setEditingEntry(null);
      await fetchLedger(true);
    } catch {
      showToast('Network error updating ledger entry', 'error');
    } finally {
      setIsUpdatingEntry(false);
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

      // Persist payment receipt to local storage so payments never vanish
      saveLocalManualEntry({
        id: d.payment?.id || `pay_${Date.now()}`,
        customer_id: selectedCustomerId,
        customer_name: (selectedCustomer.name || selectedCustomer.business_name || '').trim() || undefined,
        date: payDate,
        particulars: `By ${payMode.toUpperCase()} PAYMENT${payRef.trim() ? ` [${payRef.trim()}]` : ''}`,
        payment_type: payMode.toUpperCase(),
        voucher_no: d.payment?.receipt_number || `REC-${Date.now().toString().slice(-4)}`,
        debit: 0,
        credit: numAmt,
        site_name: paySiteName || undefined,
      });

      showToast(`Payment of ₹${numAmt.toLocaleString('en-IN')} recorded & credited to ledger!`);
      setShowPaymentModal(false);
      setPayAmount('');
      setPayRef('');
      setPayNotes('');
      await fetchLedger(true);
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
      openingBalance: isRKSales ? 27500 : (Number(ledgerData.openingBalance) || 0),
      totalDebit: isRKSales ? period2Calculations.totalDebits : ledgerData.totalDebit,
      totalCredit: isRKSales ? period2Calculations.totalCredits : ledgerData.totalCredit,
      closingBalance: effectiveClosingBalance,
      entries: displayEntries,
      sites: reconciledSites.map((s) => ({
        ...s,
        challan_number: s.attached_challans?.map((c) => c.challan_number).join(', ') || s.challan_number || '',
      })),
      isAccountPaid: isAccountSettled,
    });
    showToast(`PDF exported for ${selectedCustomer.name}!`);
  };

  // Clear Ledger Handler (45-Day Retention Policy)
  const handleDeleteEntireLedger = async () => {
    if (!selectedCustomerId) return;
    try {
      setIsDeletingEntireLedger(true);
      const token = getClientAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`/api/ledger?customer_id=${encodeURIComponent(selectedCustomerId)}&clear_all=true`, {
        method: 'DELETE',
        headers,
      });

      if (res.ok) {
        clearLocalManualEntriesForCustomer(selectedCustomerId, selectedCustomer?.name);
        showToast(`Ledger cleared for ${selectedCustomer?.name || 'Customer'}. Records retained for 45 days before permanent auto-deletion.`, 'success');
        setShowDeleteEntireLedgerModal(false);
        const initialOpening = Number(selectedCustomer?.opening_balance) || 0;
        setLedgerData({
          openingBalance: initialOpening,
          totalDebit: 0,
          totalCredit: 0,
          closingBalance: initialOpening,
          verifiedSiteDebits: 0,
          verifiedSiteCredits: 0,
          netVerifiedSiteAdjustment: 0,
          verifiedClosingBalance: initialOpening,
          entries: [],
          sites: [],
        });
        setCustomerChallans([]);
        await fetchLedger(true);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to clear ledger', 'error');
      }
    } catch {
      showToast('Error clearing customer ledger', 'error');
    } finally {
      setIsDeletingEntireLedger(false);
    }
  };

  const isEmployee = currentUser?.role === 'employee';

  // Strict employee customer filtering: employees can only see their own assigned customers
  const visibleCustomers = useMemo(() => {
    if (!isEmployee) return customers;
    const uName = (currentUser?.name || '').toLowerCase().trim();
    const uUser = (currentUser?.username || '').toLowerCase().trim();
    return customers.filter((c) => {
      const cr = (c.created_by || '').toLowerCase();
      const crN = (c.creator_name || '').toLowerCase();
      const uId = (c.user_id || '').toLowerCase();
      return (
        (uUser && (cr === uUser || uId === uUser)) ||
        (uName && (cr.includes(uName) || crN.includes(uName) || uId.includes(uName)))
      );
    });
  }, [customers, isEmployee, currentUser]);

  return (
    <div className="pb-20 max-w-7xl mx-auto select-none print:p-0 print:m-0 print:max-w-none">
      {/* ============================================================ */}
      {/* AUTHENTIC TALLY PRINT CONTAINER (VISIBLE ONLY ON PRINT)      */}
      {/* EXACT MATCH TO USER PHOTO (media_1795379011933_1d73ba0d.jpg)*/}
      {/* ============================================================ */}
      <div className="hidden print:block printable-tally-ledger text-black bg-white w-full max-w-[190mm] mx-auto text-[11px] leading-tight font-sans">
        {/* 1. Centered Company Masthead */}
        <div className="text-center pt-2 pb-2 space-y-0.5">
          <div className="font-bold text-[13px] tracking-tight">Show House Concepts &amp; Designs LLP-(From 1 Apr-2023)</div>
          <div className="text-[10.5px]">VISHRAM BAUG</div>
          <div className="text-[10.5px]">LBS ROAD, NEAR MAKHMALI TALAO</div>
          <div className="text-[10.5px]">THANE (WEST)</div>
          <div className="text-[10.5px]">91-25387683/25387687</div>
          <div className="text-[10.5px]">Contact : 02225387687</div>
          <div className="text-[10.5px]">E-Mail : accounts@showhousedecor.com</div>
        </div>

        {/* 2. Centered Customer Details */}
        <div className="text-center pt-2 pb-2 space-y-0.5">
          <div className="font-bold text-[13.5px]">
            {(selectedCustomer.name || '').trim() ||
              (selectedCustomer.business_name || '').trim() ||
              'Customer Ledger'}
          </div>
          <div className="text-[11px]">Ledger Account</div>
          {(selectedCustomer.billing_address || selectedCustomer.delivery_address || 'Thane')
            .split('\n')
            .map((l: string) => l.trim())
            .filter(Boolean)
            .map((line: string, i: number) => (
              <div key={i} className="text-[10.5px] leading-tight">{line}</div>
            ))}
          <div className="pt-2 text-[11px]">
            {isRKSales
              ? '1-Feb-24'
              : (selectedCustomer?.created_at
                  ? formatDateDisplay(selectedCustomer.created_at)
                  : (fromDate ? formatDateDisplay(fromDate) : '1-Apr-24'))
            } to {toDate ? formatDateDisplay(toDate) : '31-Mar-27'}
          </div>
          <div className="pt-1.5 text-[11px] font-bold">
            Opening Balance: ₹{formatAmountDisplay(Math.abs(Number(ledgerData.openingBalance) || 0))} {Number(ledgerData.openingBalance) >= 0 ? 'Dr' : 'Cr'}
          </div>
        </div>

        {/* 3. Page 1 right-aligned */}
        <div className="text-right text-[10px] pr-1 pb-1">Page 1</div>

        {/* 4. Table */}
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr className="border-t border-b border-black font-bold">
              <th className="py-1 px-1.5 text-left font-bold w-[75px]">Date</th>
              <th className="py-1 px-1.5 text-left font-bold">Particulars</th>
              <th className="py-1 px-1.5 text-left font-bold w-[80px]">Vch Type</th>
              <th className="py-1 px-1.5 text-center font-bold w-[75px]">Vch No.</th>
              <th className="py-1 px-1.5 text-right font-bold w-[80px]">Debit</th>
              <th className="py-1 px-1.5 text-right font-bold w-[80px]">Credit</th>
            </tr>
          </thead>
          <tbody>
            {isRKSales ? (
              <>
                {/* Period 1 Entries */}
                {period1Entries.map((e) => {
                  const isDr = (Number(e.debit) || 0) > 0;
                  return (
                    <tr key={e.id} className="leading-snug">
                      <td className="py-0.5 px-1.5 text-left whitespace-nowrap">{e.date ? formatDateDisplay(e.date) : ''}</td>
                      <td className="py-0.5 px-1.5 text-left">{cleanTallyParticulars(e.particulars, isDr)}</td>
                      <td className="py-0.5 px-1.5 text-left whitespace-nowrap">{e.payment_type || (isDr ? 'Sales GST' : 'Receipt')}</td>
                      <td className="py-0.5 px-1.5 text-center">{e.reference || ''}</td>
                      <td className="py-0.5 px-1.5 text-right font-mono">{Number(e.debit) > 0 ? formatAmountDisplay(e.debit) : ''}</td>
                      <td className="py-0.5 px-1.5 text-right font-mono">{Number(e.credit) > 0 ? formatAmountDisplay(e.credit) : ''}</td>
                    </tr>
                  );
                })}
                {/* Period 1 Subtotal */}
                <tr className="leading-snug">
                  <td colSpan={4}></td>
                  <td className="py-0.5 px-1.5 text-right font-mono border-t border-black">{formatAmountDisplay(period1TotalDebit)}</td>
                  <td className="py-0.5 px-1.5 text-right font-mono border-t border-black">{formatAmountDisplay(period1TotalCredit)}</td>
                </tr>
                {/* Period 1 Closing Balance */}
                <tr className="leading-snug">
                  <td></td>
                  <td className="py-0.5 px-1.5 text-left">By &nbsp;&nbsp;&nbsp;&nbsp; Closing Balance</td>
                  <td colSpan={3}></td>
                  <td className="py-0.5 px-1.5 text-right font-mono">{formatAmountDisplay(period1Closing)}</td>
                </tr>
                {/* Period 1 Balanced Total */}
                <tr className="leading-snug">
                  <td colSpan={4}></td>
                  <td className="py-0.5 px-1.5 text-right font-mono border-t border-black border-b-4 border-double border-black">
                    {formatAmountDisplay(period1TotalDebit)}
                  </td>
                  <td className="py-0.5 px-1.5 text-right font-mono border-t border-black border-b-4 border-double border-black">
                    {formatAmountDisplay(period1TotalDebit)}
                  </td>
                </tr>
                {/* Empty Separator */}
                <tr><td colSpan={6} className="h-4"></td></tr>
                {/* Period 2 Opening Balance */}
                <tr className="leading-snug">
                  <td className="py-0.5 px-1.5 text-left whitespace-nowrap">1-Apr-24</td>
                  <td className="py-0.5 px-1.5 text-left">To Opening Balance</td>
                  <td colSpan={2}></td>
                  <td className="py-0.5 px-1.5 text-right font-mono">{formatAmountDisplay(period1Closing)}</td>
                  <td></td>
                </tr>
                {/* Period 2 Entries */}
                {period2Entries.map((e) => {
                  const isDr = (Number(e.debit) || 0) > 0;
                  return (
                    <tr key={e.id} className="leading-snug">
                      <td className="py-0.5 px-1.5 text-left whitespace-nowrap">{e.date ? formatDateDisplay(e.date) : ''}</td>
                      <td className="py-0.5 px-1.5 text-left">{cleanTallyParticulars(e.particulars, isDr)}</td>
                      <td className="py-0.5 px-1.5 text-left whitespace-nowrap">{e.payment_type || (isDr ? 'Sales GST' : 'Receipt')}</td>
                      <td className="py-0.5 px-1.5 text-center">{e.reference || ''}</td>
                      <td className="py-0.5 px-1.5 text-right font-mono">{Number(e.debit) > 0 ? formatAmountDisplay(e.debit) : ''}</td>
                      <td className="py-0.5 px-1.5 text-right font-mono">{Number(e.credit) > 0 ? formatAmountDisplay(e.credit) : ''}</td>
                    </tr>
                  );
                })}
                {/* Period 2 Subtotal */}
                <tr className="leading-snug">
                  <td colSpan={4}></td>
                  <td className="py-0.5 px-1.5 text-right font-mono border-t border-black">{formatAmountDisplay(period2Calculations.totalDebits)}</td>
                  <td className="py-0.5 px-1.5 text-right font-mono border-t border-black">{formatAmountDisplay(period2Calculations.totalCredits)}</td>
                </tr>
                {/* Period 2 Closing Balance */}
                <tr className="leading-snug">
                  <td></td>
                  <td className="py-0.5 px-1.5 text-left">By &nbsp;&nbsp;&nbsp;&nbsp; Closing Balance</td>
                  <td colSpan={3}></td>
                  <td className="py-0.5 px-1.5 text-right font-mono">{formatAmountDisplay(period2Calculations.finalClosing)}</td>
                </tr>
                {/* Period 2 Balanced Total */}
                <tr className="leading-snug">
                  <td colSpan={4}></td>
                  <td className="py-0.5 px-1.5 text-right font-mono border-t border-black border-b-4 border-double border-black">
                    {formatAmountDisplay(period2Calculations.balancedTotal)}
                  </td>
                  <td className="py-0.5 px-1.5 text-right font-mono border-t border-black border-b-4 border-double border-black">
                    {formatAmountDisplay(period2Calculations.balancedTotal)}
                  </td>
                </tr>
              </>
            ) : (
              <>
                {/* Standard Customer Continuous View */}
                <tr className="leading-snug">
                  <td className="py-0.5 px-1.5 text-left whitespace-nowrap">
                    {selectedCustomer?.created_at ? formatDateDisplay(selectedCustomer.created_at) : (fromDate ? formatDateDisplay(fromDate) : '')}
                  </td>
                  <td className="py-0.5 px-1.5 text-left">
                    {Number(ledgerData.openingBalance) >= 0 ? 'To Opening Balance' : 'By Opening Balance'}
                  </td>
                  <td colSpan={2}></td>
                  <td className="py-0.5 px-1.5 text-right font-mono">
                    {Number(ledgerData.openingBalance) >= 0 ? formatAmountDisplay(ledgerData.openingBalance) : ''}
                  </td>
                  <td className="py-0.5 px-1.5 text-right font-mono">
                    {Number(ledgerData.openingBalance) < 0 ? formatAmountDisplay(Math.abs(ledgerData.openingBalance)) : ''}
                  </td>
                </tr>
                {displayEntries.map((e) => {
                  const isDr = (Number(e.debit) || 0) > 0;
                  const isGoodsReturn =
                    e.voucher_type === 'goods_return' ||
                    e.source_type === 'goods_return' ||
                    (e.particulars && /goods return/i.test(e.particulars));
                  return (
                    <tr key={e.id} className={cn("leading-snug", isGoodsReturn && "text-red-600 font-bold")}>
                      <td className="py-0.5 px-1.5 text-left whitespace-nowrap">{e.date ? formatDateDisplay(e.date) : ''}</td>
                      <td className={cn("py-0.5 px-1.5 text-left", isGoodsReturn && "text-red-600 font-bold")}>
                        {cleanTallyParticulars(e.particulars, isDr)}
                        {isGoodsReturn && <span className="ml-1 text-[9px] uppercase font-bold text-red-700">[RETURN]</span>}
                      </td>
                      <td className="py-0.5 px-1.5 text-left whitespace-nowrap">{e.payment_type || (isDr ? 'Sales GST' : 'Receipt')}</td>
                      <td className={cn("py-0.5 px-1.5 text-center font-mono", isGoodsReturn && "text-red-600 font-bold")}>{e.reference || ''}</td>
                      <td className="py-0.5 px-1.5 text-right font-mono">{Number(e.debit) > 0 ? formatAmountDisplay(e.debit) : ''}</td>
                      <td className={cn("py-0.5 px-1.5 text-right font-mono", isGoodsReturn && "text-red-600 font-bold")}>{Number(e.credit) > 0 ? formatAmountDisplay(e.credit) : ''}</td>
                    </tr>
                  );
                })}
                {/* Subtotal */}
                <tr className="leading-snug">
                  <td colSpan={4}></td>
                  <td className="py-0.5 px-1.5 text-right font-mono border-t border-black">
                    {formatAmountDisplay(
                      (Number(ledgerData.openingBalance) > 0 ? Number(ledgerData.openingBalance) : 0) + ledgerData.totalDebit
                    )}
                  </td>
                  <td className="py-0.5 px-1.5 text-right font-mono border-t border-black">
                    {formatAmountDisplay(
                      (Number(ledgerData.openingBalance) < 0 ? Math.abs(Number(ledgerData.openingBalance)) : 0) + ledgerData.totalCredit
                    )}
                  </td>
                </tr>
                {/* Closing Balance & Balanced Total */}
                {(() => {
                  const totalDr = (Number(ledgerData.openingBalance) > 0 ? Number(ledgerData.openingBalance) : 0) + ledgerData.totalDebit;
                  const totalCr = (Number(ledgerData.openingBalance) < 0 ? Math.abs(Number(ledgerData.openingBalance)) : 0) + ledgerData.totalCredit;
                  const netBal = totalDr - totalCr;
                  const isNetDr = netBal >= 0;
                  const closingAmt = Math.abs(netBal);
                  const balancedAmt = Math.max(totalDr, totalCr + (isNetDr ? closingAmt : 0));
                  return (
                    <>
                      <tr className="leading-snug">
                        <td></td>
                        <td className="py-0.5 px-1.5 text-left">
                          {isNetDr ? 'By      Closing Balance' : 'To      Closing Balance'}
                        </td>
                        <td colSpan={3}></td>
                        <td className="py-0.5 px-1.5 text-right font-mono">
                          {isNetDr && closingAmt > 0 ? formatAmountDisplay(closingAmt) : ''}
                        </td>
                      </tr>
                      <tr className="leading-snug">
                        <td colSpan={4}></td>
                        <td className="py-0.5 px-1.5 text-right font-mono border-t border-black border-b-4 border-double border-black">
                          {formatAmountDisplay(balancedAmt)}
                        </td>
                        <td className="py-0.5 px-1.5 text-right font-mono border-t border-black border-b-4 border-double border-black">
                          {formatAmountDisplay(balancedAmt)}
                        </td>
                      </tr>
                    </>
                  );
                })()}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Screen Interactive Layout (Hidden on Print) */}
      <div className="print:hidden space-y-5">
      {/* Staff View (Read-Only Mode) Notice Banner */}
      {isEmployee && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900 font-medium print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg shrink-0">
              <ShieldCheck size={16} />
            </div>
            <div>
              <span className="font-bold">Staff Read-Only Access Active:</span> You can view party ledger statements, attached delivery sites, search transactions, and export PDF / print. Modifications, settlements, and entry creation require Administrator privileges.
            </div>
          </div>
          <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-blue-200/80 text-blue-900 uppercase tracking-wider shrink-0 ml-3">
            Read Only
          </span>
        </div>
      )}

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
            <option value="all">
              {isEmployee ? `📊 My Parties (${visibleCustomers.length})` : '📊 All Parties (Overall Filter & Total Calculation)'}
            </option>
            {visibleCustomers.length === 0 ? (
              <option value="">No parties assigned</option>
            ) : (
              visibleCustomers.map((c) => {
                const custTitle = c.name || c.business_name || 'Customer';
                const showComp =
                  c.company_name &&
                  c.company_name.trim().toLowerCase() !== custTitle.trim().toLowerCase();
                return (
                  <option key={c.id} value={c.id}>
                    {custTitle} {showComp ? `(${c.company_name})` : ''}
                  </option>
                );
              })
            )}
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
      {activeTab === 'ledger' && selectedCustomerId === 'all' && (
        <div className="space-y-4">
          {/* Top Banner & Refresh */}
          <div className="bg-white p-5 rounded-xl border border-surface-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-surface-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-orange-100 text-[#ea580c]">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-black text-surface-950 tracking-tight">
                    Master Party Ledger &amp; Total Calculation
                  </h1>
                  <p className="text-xs text-surface-500">
                    Consolidated financial summary across all parties. Click on any party to open their detailed ledger.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchLedger()}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-bold text-surface-700 bg-surface-100 hover:bg-surface-200 rounded-lg flex items-center gap-1.5 border border-surface-300 cursor-pointer active:scale-95 disabled:opacity-50"
                  title="Refresh All Calculations"
                >
                  <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 text-xs font-semibold text-surface-700 bg-surface-100 hover:bg-surface-200 rounded-lg flex items-center gap-1.5 border border-surface-300 cursor-pointer active:scale-95"
                >
                  <Printer size={13} />
                  <span>Print</span>
                </button>
              </div>
            </div>

            {/* Total Calculation 4-Stat Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Stat 1: Total Parties */}
              <div className="p-3.5 rounded-xl bg-surface-50 border border-surface-200 space-y-1">
                <div className="text-[11px] font-bold text-surface-500 uppercase tracking-wider flex items-center gap-1">
                  <User size={13} className="text-surface-400" />
                  <span>Total Parties</span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-surface-900">
                  {allPartiesData?.summary.totalParties || customers.length || 0}
                </div>
                <div className="text-[10px] text-surface-400">
                  Registered accounts
                </div>
              </div>

              {/* Stat 2: Total Debit (Sales) */}
              <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/80 space-y-1">
                <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1">
                  <ArrowUpRight size={13} className="text-blue-600" />
                  <span>Total Sales (Debit)</span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-blue-900 font-mono">
                  ₹{formatAmountDisplay(allPartiesData?.summary.totalDebit || 0) || '0.00'}
                </div>
                <div className="text-[10px] text-blue-700/80">
                  Billed delivery challans
                </div>
              </div>

              {/* Stat 3: Total Credit (Received) */}
              <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 space-y-1">
                <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                  <ArrowDownLeft size={13} className="text-emerald-600" />
                  <span>Total Received (Credit)</span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-emerald-900 font-mono">
                  ₹{formatAmountDisplay(allPartiesData?.summary.totalCredit || 0) || '0.00'}
                </div>
                <div className="text-[10px] text-emerald-700/80">
                  Payments &amp; receipts
                </div>
              </div>

              {/* Stat 4: Net Outstanding */}
              <div className="p-3.5 rounded-xl bg-orange-50 border border-orange-200 space-y-1">
                <div className="text-[11px] font-bold text-[#ea580c] uppercase tracking-wider flex items-center gap-1">
                  <WalletCards size={13} />
                  <span>Net Outstanding Balance</span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-[#c2410c] font-mono">
                  ₹{formatAmountDisplay(Math.abs(allPartiesData?.summary.totalOutstanding || 0)) || '0.00'}{' '}
                  <span className="text-xs font-bold font-sans">
                    {(allPartiesData?.summary.totalOutstanding || 0) >= 0 ? 'Dr' : 'Cr'}
                  </span>
                </div>
                <div className="text-[10px] text-orange-800/80">
                  {(allPartiesData?.summary.totalOutstanding || 0) >= 0 ? 'Pending collection from clients' : 'Advance received'}
                </div>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Search party by name, site, phone, or contact person..."
                  value={allPartiesSearch}
                  onChange={(e) => setAllPartiesSearch(e.target.value)}
                  className="input pl-8 pr-3 py-1.5 text-xs border-surface-300 w-full"
                />
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
                {allPartiesSearch && (
                  <button
                    type="button"
                    onClick={() => setAllPartiesSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-surface-400 hover:text-surface-700"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setAllPartiesFilter('all')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer',
                    allPartiesFilter === 'all'
                      ? 'bg-zinc-900 text-white'
                      : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                  )}
                >
                  All ({allPartiesData?.parties.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setAllPartiesFilter('pending')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer',
                    allPartiesFilter === 'pending'
                      ? 'bg-[#ea580c] text-white'
                      : 'bg-orange-50 text-orange-800 border border-orange-200 hover:bg-orange-100'
                  )}
                >
                  Pending Outstanding ({allPartiesData?.parties.filter((p) => p.closing_balance > 0).length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setAllPartiesFilter('settled')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer',
                    allPartiesFilter === 'settled'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  )}
                >
                  Settled / Nil ({allPartiesData?.parties.filter((p) => p.closing_balance <= 0).length || 0})
                </button>
              </div>
            </div>
          </div>

          {/* Master Table of All Parties */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-surface-50 border-b border-surface-200 text-surface-700 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3">Party Name</th>
                    <th className="py-2.5 px-3">Contact &amp; WhatsApp</th>
                    <th className="py-2.5 px-2.5">Delivery Sites</th>
                    <th className="py-2.5 px-3 text-right">Opening (₹)</th>
                    <th className="py-2.5 px-3 text-right">Total Debit / Sales (₹)</th>
                    <th className="py-2.5 px-3 text-right">Total Credit / Paid (₹)</th>
                    <th className="py-2.5 px-3 text-right">Closing Balance (₹)</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {filteredAllParties.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-surface-400 space-y-1">
                        <User className="w-10 h-10 mx-auto text-surface-300 mb-1" />
                        <p className="font-bold text-surface-700 text-sm">No matching parties found</p>
                        <p className="text-xs">Try adjusting your search query or reset filter.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredAllParties.map((p, idx) => {
                      const isDr = p.closing_balance > 0;
                      const isCr = p.closing_balance < 0;
                      return (
                        <tr
                          key={p.id || idx}
                          onClick={() => {
                            setSelectedCustomerId(p.id);
                            setSiteFilter('all');
                          }}
                          className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                        >
                          <td className="p-3 text-center font-bold text-surface-400">
                            {idx + 1}
                          </td>
                          <td className="p-3">
                            <div className="font-extrabold text-surface-900 group-hover:text-primary-600 flex items-center gap-1.5">
                              <span>{p.business_name || p.name}</span>
                              {p.is_architect && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-purple-100 text-purple-800 border border-purple-200">
                                  Arch
                                </span>
                              )}
                            </div>
                            {p.contact_person && p.contact_person !== p.business_name && (
                              <div className="text-[10px] text-surface-500">
                                Contact: {p.contact_person}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-surface-700 whitespace-nowrap">
                            {p.phone ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-xs">{p.phone}</span>
                              </div>
                            ) : (
                              <span className="text-surface-400 italic text-[11px]">—</span>
                            )}
                          </td>
                          <td className="p-2.5">
                            {p.sites && p.sites.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-[180px]">
                                {p.sites.slice(0, 2).map((s, sIdx) => (
                                  <span
                                    key={sIdx}
                                    className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-orange-50 text-[#ea580c] border border-orange-200"
                                  >
                                    📍 {s}
                                  </span>
                                ))}
                                {p.sites.length > 2 && (
                                  <span className="text-[10px] text-surface-400">
                                    +{p.sites.length - 2} more
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-surface-400 italic text-[11px]">Primary</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono text-surface-700">
                            {p.opening_balance !== 0 ? `₹${formatAmountDisplay(p.opening_balance)}` : '—'}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-surface-900">
                            {p.total_debit > 0 ? `₹${formatAmountDisplay(p.total_debit)}` : '—'}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-700">
                            {p.total_credit > 0 ? `₹${formatAmountDisplay(p.total_credit)}` : '—'}
                          </td>
                          <td className="p-3 text-right font-mono font-black text-xs whitespace-nowrap">
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full inline-block',
                                isDr
                                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                  : isCr
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-surface-100 text-surface-600'
                              )}
                            >
                              ₹{formatAmountDisplay(Math.abs(p.closing_balance))} {isDr ? 'Dr' : isCr ? 'Cr' : ''}
                            </span>
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCustomerId(p.id);
                                setSiteFilter('all');
                              }}
                              className="px-2.5 py-1 text-xs font-bold text-white bg-black hover:bg-zinc-800 rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer ml-auto transition-colors"
                              title="Open complete detailed ledger"
                            >
                              <span>Open Ledger</span>
                              <ArrowRight size={12} className="text-[#ea580c]" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PRIMARY TAB: LEDGER ACCOUNT (FOR SINGLE SELECTED PARTY) */}
      {activeTab === 'ledger' && selectedCustomerId !== 'all' && (
        <div className="space-y-4">
          {/* Top Header Section (Matching Photo) */}
          <div className="bg-white p-5 rounded-xl border border-surface-200 shadow-2xs relative print:border-none print:shadow-none print:p-0">
            {/* Action Buttons: Responsive for Mobile & Desktop */}
            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5 mb-3 sm:mb-0 sm:absolute sm:top-4 sm:right-4 print:hidden">
              <button
                type="button"
                onClick={() => setSelectedCustomerId('all')}
                className="px-2.5 py-1.5 text-xs font-bold text-[#ea580c] bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg flex items-center gap-1 transition-colors shadow-2xs active:scale-95 cursor-pointer"
                title="Back to All Parties Summary Overview"
              >
                <BookOpen size={13} />
                <span>All Parties Overview</span>
              </button>

              <Link
                href="/"
                className="px-2.5 py-1.5 text-xs font-semibold text-surface-700 bg-surface-100 hover:bg-surface-200 rounded-lg flex items-center gap-1 transition-colors border border-surface-200 active:scale-95"
              >
                <ArrowLeft size={13} />
                <span>Back</span>
              </Link>

              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Party Challans Drawer/Modal Button */}
                <button
                  type="button"
                  onClick={() => setShowPartyChallansModal(true)}
                  className="px-2.5 py-1.5 text-xs font-bold text-surface-800 bg-surface-100 hover:bg-surface-200 border border-surface-300 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs active:scale-95 cursor-pointer"
                  title="View all delivery challans for this customer"
                >
                  <FileText size={14} className="text-[#ea580c]" />
                  <span>Party Challans</span>
                  {customerChallans.length > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.2 bg-[#ea580c] text-white font-black rounded-full text-[10px]">
                      {customerChallans.length}
                    </span>
                  )}
                </button>

                {/* Create New Party Challan Shortcut */}
                <Link
                  href={`/challans/new?customerId=${encodeURIComponent(selectedCustomer.id || selectedCustomerId)}`}
                  className="px-2.5 py-1.5 text-xs font-bold text-white bg-black hover:bg-zinc-800 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs active:scale-95 cursor-pointer"
                  title="Create new delivery challan for this party"
                >
                  <FilePlus size={14} className="text-[#ea580c]" />
                  <span>+ Party Challan</span>
                </Link>

                {isAdminUser && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteEntireLedgerModal(true)}
                    className="px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs active:scale-95 cursor-pointer"
                    title="Clear Outstanding & Settle Ledger (45-Day Retention)"
                  >
                    <Trash2 size={13} />
                    <span>Clear Ledger</span>
                  </button>
                )}

                {isAdminUser && (
                  <button
                    type="button"
                    onClick={() => {
                      setPayAmount(effectiveClosingBalance > 0 ? String(effectiveClosingBalance) : '');
                      setPaySiteName(siteFilter !== 'all' ? siteFilter : '');
                      setPayDate(toInputDateFormat(new Date()));
                      setShowPaymentModal(true);
                    }}
                    className="px-2.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs active:scale-95 cursor-pointer"
                    title="Record Payment Received for this Customer"
                  >
                    <WalletCards size={14} />
                    <span>Record Payment</span>
                  </button>
                )}

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
                {(selectedCustomer.name || '').trim() ||
                  (selectedCustomer.business_name || '').trim() ||
                  (selectedCustomer.contact_person || '').trim() ||
                  'Customer Ledger'}
              </h2>
              <p className="text-xs font-bold text-surface-700">
                Ledger Account
              </p>
              <div className="text-[11px] text-surface-600 leading-snug whitespace-pre-line pt-0.5">
                {selectedCustomer.billing_address ||
                  selectedCustomer.delivery_address ||
                  'LBS marg Nr. Makhmali Talao Thane'}
              </div>
              <div className="pt-1.5 text-xs font-bold text-surface-800">
                {isRKSales
                  ? '1-Feb-24'
                  : (selectedCustomer?.created_at
                      ? formatDateDisplay(selectedCustomer.created_at)
                      : (fromDate ? formatDateDisplay(fromDate) : '1-Apr-24'))
                } to {toDate ? formatDateDisplay(toDate) : '31-Mar-27'}
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
                  <option value="Party Challan">Party Challan (Sales)</option>
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
                  {availableSites.map((sName) => (
                    <option key={sName} value={sName}>
                      {sName}
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
                  onClick={() => fetchLedger()}
                  className="btn-primary py-1.5 px-4 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-lg flex items-center justify-center gap-1.5 shadow-xs w-full sm:w-auto"
                >
                  <Search size={13} />
                  <span>Apply</span>
                </button>

                {isAdminUser && (
                  <button
                    type="button"
                    onClick={() => {
                      setEntryDate(toInputDateFormat(new Date()));
                      setShowAddEntryModal(true);
                    }}
                    className="btn-secondary py-1.5 px-3 text-xs font-bold text-surface-800 bg-surface-100 hover:bg-surface-200 rounded-lg flex items-center justify-center gap-1 whitespace-nowrap shadow-xs"
                    title="Record manual receipt, payment or adjustment"
                  >
                    <Plus size={13} />
                    <span>Add Entry</span>
                  </button>
                )}

                <Link
                  href={`/challans/new?customerId=${encodeURIComponent(selectedCustomer.id || selectedCustomerId)}`}
                  className="py-1.5 px-3 text-xs font-bold text-[#ea580c] bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg flex items-center justify-center gap-1 whitespace-nowrap shadow-xs active:scale-95 transition-colors"
                  title="Create new delivery challan for this party"
                >
                  <FilePlus size={13} />
                  <span>+ Party Challan</span>
                </Link>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* LEDGER TRANSACTION TABLE                                     */}
          {/* ============================================================ */}
          {siteFilteredSummary && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl flex flex-wrap items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 bg-[#ea580c] text-white rounded-lg text-xs font-bold shrink-0">📍 Site Filter</span>
                <div>
                  <div className="text-xs font-black text-surface-900">
                    Showing entries for site: <span className="text-[#ea580c] font-bold">{siteFilteredSummary.siteName}</span> ({siteFilteredSummary.entryCount} {siteFilteredSummary.entryCount === 1 ? 'entry' : 'entries'})
                  </div>
                  <div className="text-[11px] text-surface-600 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 font-mono">
                    <span>Site Debits: <b>₹{siteFilteredSummary.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b></span>
                    <span>Site Credits: <b>₹{siteFilteredSummary.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b></span>
                    <span>Site Net Balance: <b className={siteFilteredSummary.balance > 0 ? "text-rose-700 font-bold" : "text-emerald-700 font-bold"}>₹{siteFilteredSummary.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b></span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSiteFilter('all')}
                className="text-xs font-bold text-orange-700 hover:text-orange-900 bg-white border border-orange-300 rounded-lg px-2.5 py-1 shadow-2xs hover:bg-orange-50 cursor-pointer"
              >
                ✕ Clear (View All Sites)
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-surface-200 shadow-2xs overflow-hidden">
            {/* Mobile Scroll Hint Banner */}
            <div className="sm:hidden px-3 py-1.5 bg-amber-50/70 border-b border-amber-200/50 flex items-center justify-between text-[11px] text-amber-800 font-medium">
              <span>← Scroll table horizontally →</span>
              <span className="text-[10px] text-surface-500">8 Columns</span>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-xs text-left border-collapse min-w-[680px]">
                <thead>
                  <tr className="bg-black text-white font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3 text-center w-14 border border-zinc-700">Sr. No.</th>
                    <th className="py-2.5 px-3 text-center w-24 border border-zinc-700">Date</th>
                    <th className="py-2.5 px-3 border border-zinc-700">Particulars</th>
                    <th className="py-2.5 px-3 text-center w-28 border border-zinc-700">Site</th>
                    <th className="py-2.5 px-3 text-center w-32 border border-zinc-700">Vch No.</th>
                    <th className="py-2.5 px-3 text-right w-32 border border-zinc-700">Debit (₹)</th>
                    <th className="py-2.5 px-3 text-right w-32 border border-zinc-700">Credit (₹)</th>
                    <th className="py-2.5 px-3 text-center w-14 border border-zinc-700 print:hidden">Actions</th>
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
                            <div className="flex items-center justify-between gap-1.5">
                              <span>{cleanTallyParticulars(e.particulars, (Number(e.debit) || 0) > 0)}</span>
                              {(e.last_updated || e.reason || (e.revision_history && e.revision_history.length > 0)) && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedEntryForHistory(e)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-bold tracking-tight cursor-pointer shadow-2xs whitespace-nowrap"
                                  title="Click to view update history and reason"
                                >
                                  <Clock size={10} className="stroke-[2.5]" />
                                  <span>Updated</span>
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center border border-surface-200">
                            {e.site_name ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-100 text-surface-800 border border-surface-200 max-w-[120px] truncate" title={e.site_name}>
                                {e.site_name}
                              </span>
                            ) : (
                              <span className="text-[11px] text-surface-400 font-mono">—</span>
                            )}
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
                          <td className="py-2 px-3 text-center border border-surface-200 print:hidden">
                            {isAdminUser ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditEntry(e)}
                                  className="p-1 text-surface-500 hover:text-surface-900 hover:bg-surface-100 rounded transition-colors cursor-pointer"
                                  title="Edit entry (Debit/Credit, Amount, Site, Reason)"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEntryToDelete(e)}
                                  className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                  title="Delete entry from ledger"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-surface-400 font-mono">—</span>
                            )}
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
                        <td className="py-2 px-3 border border-surface-200 print:hidden"></td>
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
                        <td className="py-2.5 px-3 border border-surface-200 print:hidden"></td>
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
                        <td className="py-2 px-3 border border-surface-200 print:hidden"></td>
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
                            <div className="flex items-center justify-between gap-1.5">
                              <span>{cleanTallyParticulars(e.particulars, (Number(e.debit) || 0) > 0)}</span>
                              {(e.last_updated || e.reason || (e.revision_history && e.revision_history.length > 0)) && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedEntryForHistory(e)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-bold tracking-tight cursor-pointer shadow-2xs whitespace-nowrap"
                                  title="Click to view update history and reason"
                                >
                                  <Clock size={10} className="stroke-[2.5]" />
                                  <span>Updated</span>
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center border border-surface-200">
                            {e.site_name ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-100 text-surface-800 border border-surface-200 max-w-[120px] truncate" title={e.site_name}>
                                {e.site_name}
                              </span>
                            ) : (
                              <span className="text-[11px] text-surface-400 font-mono">—</span>
                            )}
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
                          <td className="py-2 px-3 text-center border border-surface-200 print:hidden">
                            {isAdminUser ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditEntry(e)}
                                  className="p-1 text-surface-500 hover:text-surface-900 hover:bg-surface-100 rounded transition-colors cursor-pointer"
                                  title="Edit entry (Debit/Credit, Amount, Site, Reason)"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEntryToDelete(e)}
                                  className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                  title="Delete entry from ledger"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-surface-400 font-mono">—</span>
                            )}
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
                        <td className="py-2 px-3 border border-surface-200 print:hidden"></td>
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
                        <td className="py-2 px-3 border border-surface-200 print:hidden"></td>
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
                        <td className="py-2.5 px-3 border border-surface-200 print:hidden"></td>
                      </tr>
                    </>
                  ) : (
                    /* Standard Customer Continuous Ledger View */
                    <>
                      {/* Opening Balance Row: Always displayed as Row 1 before any challan transactions */}
                      <tr className="bg-surface-50/90 font-bold border-b border-surface-200">
                        <td className="py-2 px-3 text-center font-bold text-surface-400 border border-surface-200">1</td>
                        <td className="py-2 px-3 text-center text-surface-600 whitespace-nowrap border border-surface-200">
                          {selectedCustomer?.created_at
                            ? formatDateDisplay(selectedCustomer.created_at)
                            : (fromDate ? formatDateDisplay(fromDate) : '—')}
                        </td>
                        <td className="py-2 px-3 text-surface-950 font-bold border border-surface-200">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="mr-6">{Number(ledgerData.openingBalance) < 0 ? 'By' : 'To'}</span>
                              <span>Opening Balance</span>
                            </div>
                            {isAdminUser && !editingOpeningBalance && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTempOpeningBalance(String(ledgerData.openingBalance || ''));
                                  setEditingOpeningBalance(true);
                                }}
                                className="text-[10px] text-primary-600 hover:text-primary-800 underline font-semibold cursor-pointer print:hidden px-1.5 py-0.5 rounded bg-primary-50 hover:bg-primary-100"
                                title="Click to adjust customer opening balance"
                              >
                                Edit Opening Balance
                              </button>
                            )}
                          </div>
                          {editingOpeningBalance && (
                            <div className="mt-1.5 flex items-center gap-2 p-1.5 bg-white border border-primary-200 rounded-md print:hidden">
                              <span className="text-[11px] font-bold text-surface-600">Opening Balance ₹:</span>
                              <input
                                type="number"
                                step="any"
                                value={tempOpeningBalance}
                                onChange={(e) => setTempOpeningBalance(e.target.value)}
                                placeholder="0.00"
                                className="input text-xs py-0.5 px-2 font-mono w-28 bg-surface-50"
                                autoFocus
                              />
                              <button
                                type="button"
                                disabled={savingOpeningBalance}
                                onClick={async () => {
                                  if (!selectedCustomer) return;
                                  const val = Number(tempOpeningBalance) || 0;
                                  setSavingOpeningBalance(true);
                                  try {
                                    updateCustomer(selectedCustomer.id, { opening_balance: val });
                                    setLedgerData((prev) => ({
                                      ...prev,
                                      openingBalance: val,
                                    }));
                                    setEditingOpeningBalance(false);
                                    showToast(`Opening Balance saved as ₹${val.toLocaleString('en-IN')}`, 'success');
                                  } catch {
                                    showToast('Failed to save opening balance', 'error');
                                  } finally {
                                    setSavingOpeningBalance(false);
                                  }
                                }}
                                className="px-2 py-0.5 text-[11px] font-bold bg-primary-600 text-white rounded hover:bg-primary-700 cursor-pointer"
                              >
                                {savingOpeningBalance ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingOpeningBalance(false)}
                                className="px-1.5 py-0.5 text-[11px] font-medium text-surface-500 hover:text-surface-700 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center text-surface-400 border border-surface-200">—</td>
                        <td className="py-2 px-3 text-center text-surface-400 border border-surface-200">—</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-surface-900 border border-surface-200">
                          {Number(ledgerData.openingBalance) >= 0 ? formatAmountDisplay(ledgerData.openingBalance) : ''}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-surface-900 border border-surface-200">
                          {Number(ledgerData.openingBalance) < 0 ? formatAmountDisplay(Math.abs(ledgerData.openingBalance)) : ''}
                        </td>
                        <td className="py-2 px-3 border border-surface-200 print:hidden"></td>
                      </tr>

                      {/* Transaction Rows */}
                      {displayEntries.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-xs text-surface-400">
                            No transactions recorded in this date range. Click "+ Add Entry" to record a voucher.
                          </td>
                        </tr>
                      ) : (
                        displayEntries.map((e, idx) => {
                          const isGoodsReturn =
                            e.voucher_type === 'goods_return' ||
                            e.source_type === 'goods_return' ||
                            (e.particulars && /goods return/i.test(e.particulars)) ||
                            (e.payment_type && /goods return/i.test(e.payment_type));

                          return (
                          <tr key={e.id} className={cn("hover:bg-surface-50/80 transition-colors", isGoodsReturn && "bg-red-50/30 hover:bg-red-50/60")}>
                            <td className="py-2 px-3 text-center font-bold text-surface-500 border border-surface-200">
                              {idx + 2}
                            </td>
                            <td className="py-2 px-3 text-center text-surface-600 whitespace-nowrap border border-surface-200">
                              {formatDateDisplay(e.date)}
                            </td>
                            <td className={cn("py-2 px-3 font-semibold border border-surface-200", isGoodsReturn ? "text-red-600 font-bold" : "text-surface-900")}>
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span>{cleanTallyParticulars(e.particulars, (Number(e.debit) || 0) > 0)}</span>
                                  {isGoodsReturn && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-red-100 text-red-700 border border-red-300 shadow-2xs whitespace-nowrap">
                                      CREDIT NOTE
                                    </span>
                                  )}
                                </div>
                                {(e.last_updated || e.reason || (e.revision_history && e.revision_history.length > 0)) && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedEntryForHistory(e)}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-bold tracking-tight cursor-pointer shadow-2xs whitespace-nowrap"
                                    title="Click to view update history and reason"
                                  >
                                    <Clock size={10} className="stroke-[2.5]" />
                                    <span>Updated</span>
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-center border border-surface-200">
                              {e.site_name ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-100 text-surface-800 border border-surface-200 max-w-[120px] truncate" title={e.site_name}>
                                  {e.site_name}
                                </span>
                              ) : (
                                <span className="text-[11px] text-surface-400 font-mono">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center font-mono font-bold border border-surface-200">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                {e.challan_id ? (
                                  <Link
                                    href={`/challans/${e.challan_id}`}
                                    className={cn(
                                      "hover:underline inline-flex items-center gap-1",
                                      isGoodsReturn ? "text-red-600 hover:text-red-800 font-bold" : "text-primary-600 hover:text-primary-800"
                                    )}
                                    title="Open official challan"
                                  >
                                    <span>{e.reference}</span>
                                    <ExternalLink size={10} className="opacity-70" />
                                  </Link>
                                ) : (
                                  <span className={isGoodsReturn ? "text-red-600 font-bold" : "text-surface-700"}>{e.reference}</span>
                                )}
                                {e.is_paid && e.debit > 0 && (
                                  <PaidRubberStamp size="xs" title="PAID" color="emerald" angle={-4} />
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-surface-900 border border-surface-200">
                              {formatAmountDisplay(e.debit)}
                            </td>
                            <td className={cn("py-2 px-3 text-right font-mono font-bold border border-surface-200", isGoodsReturn ? "text-red-600 font-bold bg-red-50/50" : "text-surface-900")}>
                              {isGoodsReturn && Number(e.credit) > 0 ? (
                                <span className="text-red-600 font-bold">-{formatAmountDisplay(e.credit)}</span>
                              ) : (
                                formatAmountDisplay(e.credit)
                              )}
                            </td>
                            <td className="py-2 px-3 text-center border border-surface-200 print:hidden">
                              {isAdminUser ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditEntry(e)}
                                    className="p-1 text-surface-500 hover:text-surface-900 hover:bg-surface-100 rounded transition-colors cursor-pointer"
                                    title="Edit entry (Debit/Credit, Amount, Site, Reason)"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEntryToDelete(e)}
                                    className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                    title="Delete entry from ledger"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-surface-400 font-mono">—</span>
                              )}
                            </td>
                          </tr>
                        );
                        })
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
                        <td className="py-2 px-3 border border-surface-200 print:hidden"></td>
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
                        <td className="py-2 px-3 border border-surface-200 print:hidden"></td>
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
                        <td className="py-2.5 px-3 border border-surface-200 print:hidden"></td>
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
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded inline-flex items-center gap-1">
                  <Check size={11} className="stroke-[2.5]" />
                  <span>Auto-Reconciled</span>
                </span>
              </div>

              {isAdminUser && (
                <button
                  type="button"
                  onClick={() => setShowAddSiteModal(true)}
                  className="btn-primary py-1.5 px-3 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-lg flex items-center gap-1 shadow-xs print:hidden"
                >
                  <Plus size={14} />
                  <span>Add Site</span>
                </button>
              )}
            </div>

            {/* Sites Table */}
            {/* Mobile Scroll Hint Banner */}
            <div className="sm:hidden px-3 py-1.5 bg-amber-50/70 border-b border-amber-200/50 flex items-center justify-between text-[11px] text-amber-800 font-medium">
              <span>← Scroll sites horizontally →</span>
              <span className="text-[10px] text-surface-500">9 Columns</span>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-xs text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-black text-white font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3 text-center w-12 border border-zinc-700">Sr. No.</th>
                    <th className="py-2.5 px-3 w-40 border border-zinc-700">Site</th>
                    <th className="py-2.5 px-3 w-36 border border-zinc-700">Attached Challan</th>
                    <th className="py-2.5 px-3 text-right w-32 border border-zinc-700">Opening Balance (₹)</th>
                    <th className="py-2.5 px-3 text-right w-28 border border-zinc-700">Credit (+) (₹)</th>
                    <th className="py-2.5 px-3 text-right w-28 border border-zinc-700">Debit (-) (₹)</th>
                    <th className="py-2.5 px-3 text-right w-32 border border-zinc-700">Current Balance (₹)</th>
                    <th className="py-2.5 px-3 text-center w-24 border border-zinc-700">Verified</th>
                    <th className="py-2.5 px-3 text-center w-28 border border-zinc-700 print:hidden">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-surface-100 font-medium text-surface-800">
                  {reconciledSites && reconciledSites.length > 0 ? (
                    reconciledSites.map((site, idx) => {
                      const op = Number(site.opening_balance) || 0;
                      const cr = Number(site.credit_adjustment) || 0;
                      const db = Number(site.debit_adjustment) || 0;
                      const cur = Number(site.current_balance) || 0;

                      return (
                        <tr key={site.id} className="hover:bg-surface-50/80 transition-colors">
                          <td className="py-2.5 px-3 text-center font-bold text-surface-500 border border-surface-200">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-surface-900 border border-surface-200">
                            <div>{site.site_name}</div>
                            {site.site_address && site.site_address !== `${site.site_name} Site` && (
                              <div className="text-[10px] text-surface-400 font-normal truncate max-w-[180px]">{site.site_address}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 border border-surface-200">
                            {site.attached_challans && site.attached_challans.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                {site.attached_challans.map((ch, cIdx) => (
                                  <div key={cIdx} className="inline-flex items-center gap-1 font-mono font-bold text-primary-600">
                                    {ch.id ? (
                                      <Link
                                        href={`/challans/${ch.id}`}
                                        className="hover:text-primary-800 hover:underline inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-50 border border-primary-200"
                                        title={`View attached challan ${ch.challan_number}`}
                                      >
                                        <span>{ch.challan_number}</span>
                                        <ExternalLink size={10} className="opacity-70" />
                                      </Link>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded bg-surface-100 border border-surface-200 text-surface-800">
                                        {ch.challan_number}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : site.challan_number ? (
                              <div className="flex items-center gap-1 font-mono font-bold text-primary-600">
                                {site.challan_id ? (
                                  <Link
                                    href={`/challans/${site.challan_id}`}
                                    className="hover:text-primary-800 hover:underline inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-50 border border-primary-200"
                                    title="View attached challan"
                                  >
                                    <span>{site.challan_number}</span>
                                    <ExternalLink size={10} className="opacity-70" />
                                  </Link>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-surface-100 border border-surface-200 text-surface-800">{site.challan_number}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-surface-400 font-medium italic text-[11px]">— (General)</span>
                            )}
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
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => handleMoveSiteUp(idx)}
                                disabled={idx === 0}
                                className="p-1 text-surface-500 hover:text-surface-800 hover:bg-surface-100 rounded transition-colors disabled:opacity-20 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
                                title="Move Site Up"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveSiteDown(idx)}
                                disabled={idx === (reconciledSites?.length || 0) - 1}
                                className="p-1 text-surface-500 hover:text-surface-800 hover:bg-surface-100 rounded transition-colors disabled:opacity-20 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
                                title="Move Site Down"
                              >
                                <ChevronDown size={14} />
                              </button>
                              {isAdminUser && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditSite(site)}
                                    className="p-1 text-surface-500 hover:text-surface-800 hover:bg-surface-100 rounded transition-colors cursor-pointer"
                                    title="Edit site details & balances"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSite(site)}
                                    className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                    title="Delete site"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-xs text-surface-400">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <Layers size={20} className="text-surface-300 stroke-[1.5]" />
                          <span className="font-semibold text-surface-600">No sites added for this customer</span>
                          <span className="text-[11px] text-surface-400">Click &quot;+ Add Site&quot; above to add a project site and record balance adjustments.</span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Sites Table Total Footer (shown when sites exist) */}
                  {reconciledSites && reconciledSites.length > 0 && (
                    <tr className="bg-[#fff8ee] font-bold text-surface-950 border-t-2 border-amber-300">
                      <td className="py-2.5 px-3 text-center border border-amber-200"></td>
                      <td className="py-2.5 px-3 font-black text-surface-950 border border-amber-200">
                        <div className="flex items-center gap-2">
                          <span>Total (Sites)</span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded shadow-2xs">
                            <Check size={11} className="stroke-[2.5]" />
                            <span>Reconciled with Ledger</span>
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 border border-amber-200"></td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-surface-900 border border-amber-200">
                        {sitesSummary.sumOpening.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800 border border-amber-200">
                        + {sitesSummary.sumCredit.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-800 border border-amber-200">
                        - {sitesSummary.sumDebit.toFixed(2)}
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
      {/* PENDING OUTSTANDINGS (MONTHLY) - MATCHING EXACT USER SPEC    */}
      {/* ============================================================ */}
      {selectedCustomerId && (
        <div className="bg-white rounded-xl border border-surface-200 shadow-2xs overflow-hidden mt-6">
          <div className="p-4 bg-surface-50/80 border-b border-surface-200 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200">
                <CalendarClock size={16} />
              </div>
              <div>
                <h3 className="text-sm font-black text-surface-950 tracking-tight uppercase">
                  Pending Outstandings (Monthly)
                </h3>
                <p className="text-[11px] text-surface-500 font-medium">
                  FIFO-aged debit outstandings for {selectedCustomer?.name || 'Customer'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const lines = monthlyOutstandings.items.map(
                  (m) => `Rs. ${m.amount.toLocaleString('en-IN')}/- (${m.monthName})`
                );
                const text = [
                  `SHOWHOUSE DECOR STUDIO`,
                  `PENDING OUTSTANDINGS`,
                  `Client: ${selectedCustomer?.name || 'Customer'}`,
                  ``,
                  ...(lines.length > 0 ? lines : ['Rs. 0/- (All dues cleared)']),
                  ``,
                  `Rs. ${monthlyOutstandings.totalUnpaid.toLocaleString('en-IN')}/-(Total as on ${monthlyOutstandings.dateFormatted})`,
                ].join('\n');
                navigator.clipboard.writeText(text);
                showToast('Copied pending outstandings to clipboard!', 'success');
              }}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer shadow-2xs hover:bg-surface-100"
              title="Copy monthly outstanding summary in exact format"
            >
              <Copy size={13} />
              <span>Copy Summary</span>
            </button>
          </div>

          <div className="p-5">
            {monthlyOutstandings.items.length === 0 ? (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-semibold">
                <Check size={16} className="text-emerald-600 stroke-[2.5]" />
                <span>All dues cleared! No pending outstandings for this client.</span>
                <span className="font-mono text-emerald-900 ml-auto">
                  Rs. 0/-(Total as on {monthlyOutstandings.dateFormatted})
                </span>
              </div>
            ) : (
              <div className="max-w-md bg-surface-50/70 border border-surface-200 rounded-xl p-4 sm:p-5 space-y-2 font-mono text-xs sm:text-sm">
                <div className="space-y-1.5 font-bold text-surface-800">
                  {monthlyOutstandings.items.map((m) => (
                    <div
                      key={m.key}
                      className="flex items-center justify-between py-1 border-b border-surface-200/70"
                    >
                      <span className="text-surface-900">
                        Rs. {m.amount.toLocaleString('en-IN')}/-
                      </span>
                      <span className="text-surface-700 font-bold bg-white px-2 py-0.5 rounded border border-surface-200 text-xs shadow-2xs">
                        ({m.monthName})
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-3">
                  <div className="flex items-center justify-between text-surface-950 font-black text-sm sm:text-base bg-white p-3 rounded-lg border-2 border-surface-900 shadow-xs">
                    <span className="text-[#ea580c]">
                      Rs. {monthlyOutstandings.totalUnpaid.toLocaleString('en-IN')}/-
                    </span>
                    <span className="text-xs font-bold text-surface-600 font-sans">
                      (Total as on {monthlyOutstandings.dateFormatted})
                    </span>
                  </div>
                </div>
              </div>
            )}
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

              <div className="space-y-1">
                <label className="font-bold text-surface-700 flex items-center justify-between">
                  <span>Attach to Challan (Optional)</span>
                  <span className="text-[10px] font-normal text-surface-400">Link site balance to a delivery challan</span>
                </label>
                <select
                  value={addSiteChallanNumber}
                  onChange={(e) => {
                    const selectedNum = e.target.value;
                    setAddSiteChallanNumber(selectedNum);
                    const found = availableChallans.find((c) => c.challan_number === selectedNum);
                    setAddSiteChallanId(found ? found.id : '');
                  }}
                  className="input text-xs w-full font-medium"
                >
                  <option value="">-- None / General Account --</option>
                  {availableChallans.map((c) => (
                    <option key={c.id} value={c.challan_number}>
                      {c.challan_number} {c.amount ? `(₹${c.amount.toLocaleString('en-IN')})` : ''} - {c.date ? formatDateDisplay(c.date) : ''}
                    </option>
                  ))}
                </select>
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

              <div className="space-y-1">
                <label className="font-bold text-surface-700 flex items-center justify-between">
                  <span>Attached Challan</span>
                  <span className="text-[10px] font-normal text-surface-400">Link site balance to a delivery challan</span>
                </label>
                <select
                  value={editSiteChallanNumber}
                  onChange={(e) => {
                    const selectedNum = e.target.value;
                    setEditSiteChallanNumber(selectedNum);
                    const found = availableChallans.find((c) => c.challan_number === selectedNum);
                    setEditSiteChallanId(found ? found.id : '');
                  }}
                  className="input text-xs w-full font-medium"
                >
                  <option value="">-- None / General Account --</option>
                  {availableChallans.map((c) => (
                    <option key={c.id} value={c.challan_number}>
                      {c.challan_number} {c.amount ? `(₹${c.amount.toLocaleString('en-IN')})` : ''} - {c.date ? formatDateDisplay(c.date) : ''}
                    </option>
                  ))}
                </select>
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

            <form onSubmit={handleCreateManualEntry} className="space-y-3 text-xs" noValidate>
              {/* Select Customer's Transactions / Challans (Auto-Fill) */}
              <div className="space-y-1.5 p-2.5 bg-amber-500/10 border border-amber-300/70 rounded-xl">
                <label className="font-bold text-amber-950 flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <FileText size={13} className="text-[#ea580c]" />
                    <span>Select Customer&apos;s Transaction / Challan (Auto-Fill)</span>
                  </span>
                  {availableCustomerTransactions.length > 0 && (
                    <span className="text-[10px] text-amber-900 font-bold px-2 py-0.5 bg-amber-200/70 rounded-full">
                      {availableCustomerTransactions.length} Available
                    </span>
                  )}
                </label>
                <select
                  value={selectedChallanForEntry}
                  onChange={(e) => {
                    const cId = e.target.value;
                    setSelectedChallanForEntry(cId);
                    const match = availableCustomerTransactions.find((c) => c.id === cId || c.voucher_no === cId);
                    if (match) {
                      setEntryVoucherNo(match.voucher_no);
                      setEntryAmount(String(match.amount || ''));
                      if (entryDebitOrCredit === 'credit') {
                        // Credit entry made against a challan is dated TODAY
                        setEntryDate(toInputDateFormat(new Date()));
                        setEntryParticulars(`By Payment - Challan ${match.voucher_no}`);
                      } else {
                        if (match.date) setEntryDate(toInputDateFormat(match.date));
                        setEntryParticulars(match.particulars);
                      }
                      if (match.site_name) setEntrySiteName(match.site_name);
                      setEntryType(match.type);
                      setEntryDebitOrCredit(match.effect);
                    }
                  }}
                  className="input text-xs w-full font-bold bg-white border-amber-300"
                >
                  <option value="">-- Choose Transaction / Challan to Auto-Fill --</option>
                  {availableCustomerTransactions.map((tx) => (
                    <option key={tx.id} value={tx.id}>
                      {tx.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-amber-800/80">
                  Selecting any challan or transaction will auto-fill voucher details, amount, and debit/credit effect.
                </p>
              </div>

              {/* Accounting Effect: Debit vs Credit Toggle */}
              <div className="space-y-1">
                <label className="font-bold text-surface-700">Accounting Effect *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEntryDebitOrCredit('debit');
                      setEntryParticulars(cleanTallyParticulars(entryParticulars, true));
                    }}
                    className={cn(
                      'py-2 px-3 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer',
                      entryDebitOrCredit === 'debit'
                        ? 'bg-rose-50 border-rose-500 text-rose-700 ring-2 ring-rose-400/20'
                        : 'bg-white border-surface-200 text-surface-600 hover:bg-surface-50'
                    )}
                  >
                    <ArrowUpRight size={14} className="text-rose-600" />
                    <span>Debit (+) Receivable</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEntryDebitOrCredit('credit');
                      // Credit / payment entry made today strictly defaults to today's date
                      setEntryDate(toInputDateFormat(new Date()));
                      if (entryParticulars.includes('To SALE')) {
                        setEntryParticulars(
                          entryParticulars
                            .replace('To SALE GST 18%', 'By Payment')
                            .replace('To SALE', 'By Payment')
                        );
                      } else {
                        setEntryParticulars(cleanTallyParticulars(entryParticulars, false));
                      }
                    }}
                    className={cn(
                      'py-2 px-3 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer',
                      entryDebitOrCredit === 'credit'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-400/20'
                        : 'bg-white border-surface-200 text-surface-600 hover:bg-surface-50'
                    )}
                  >
                    <ArrowDownLeft size={14} className="text-emerald-600" />
                    <span>Credit (-) Receipt / Payment</span>
                  </button>
                </div>
              </div>

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
                      const isCr = ['UPI', 'Cash', 'Cheque', 'Bank Transfer', 'Receipt', 'Credit Adjustment'].includes(val);
                      setEntryDebitOrCredit(isCr ? 'credit' : 'debit');
                      if (val === 'Party Challan' || val === 'Sales GST') {
                        setEntryParticulars('To SALE GST 18%');
                      } else if (val === 'UPI') {
                        setEntryParticulars('By UPI');
                      } else if (val === 'Cash') {
                        setEntryParticulars('By Cash');
                      } else if (val === 'Cheque') {
                        setEntryParticulars('By Cheque');
                      } else if (val === 'Bank Transfer') {
                        setEntryParticulars('By HDFC BANK-50200003880041');
                      } else if (val === 'Receipt') {
                        setEntryParticulars('By Receipt');
                      } else {
                        setEntryParticulars(cleanTallyParticulars(entryParticulars, !isCr));
                      }
                    }}
                    className="input text-xs w-full font-bold"
                  >
                    <option value="Party Challan">Party Challan (Sales Debit)</option>
                    <option value="Cash">Cash Receipt (Credit)</option>
                    <option value="UPI">UPI (Receipt - Credit)</option>
                    <option value="Bank Transfer">Bank Transfer (HDFC Bank - Credit)</option>
                    <option value="Cheque">Cheque (Receipt - Credit)</option>
                    <option value="Receipt">Generic Receipt (Credit)</option>
                    <option value="Sales GST">Sales GST (Debit)</option>
                    <option value="Debit Adjustment">Debit Adjustment (+)</option>
                    <option value="Credit Adjustment">Credit Adjustment (-)</option>
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
                  type="button"
                  onClick={() => handleCreateManualEntry()}
                  className="btn-primary py-1.5 px-4 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white cursor-pointer"
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

      {/* ============================================================ */}
      {/* MODAL: DELETE LEDGER ENTRY CONFIRMATION                      */}
      {/* ============================================================ */}
      {entryToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full border border-surface-200 p-4 sm:p-5 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center gap-2 text-rose-600">
              <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-surface-900">Delete Ledger Entry</h3>
                <span className="text-[11px] text-surface-500">This action cannot be undone</span>
              </div>
            </div>

            <div className="p-3 bg-surface-50 rounded-lg border border-surface-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-surface-500">Date:</span>
                <span className="font-semibold text-surface-800">{formatDateDisplay(entryToDelete.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-500">Particulars:</span>
                <span className="font-semibold text-surface-900 text-right">{entryToDelete.particulars}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-500">Vch / Ref:</span>
                <span className="font-mono font-bold text-surface-900">{entryToDelete.reference || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-500">Amount:</span>
                <span className="font-mono font-black text-rose-600">
                  ₹{(entryToDelete.debit > 0 ? entryToDelete.debit : entryToDelete.credit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {entryToDelete.source_type && (
                <div className="flex justify-between pt-1 border-t border-surface-200">
                  <span className="text-surface-500">Source:</span>
                  <span className="uppercase text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-surface-200 text-surface-700">
                    {entryToDelete.source_type}
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-surface-600 leading-relaxed">
              Deleting this entry will remove it from the customer ledger and recalculate closing balance and subtotals automatically.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-surface-100">
              <button
                type="button"
                disabled={isDeletingEntry}
                onClick={() => setEntryToDelete(null)}
                className="btn-secondary py-1.5 px-3 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingEntry}
                onClick={handleConfirmDeleteEntry}
                className="btn-primary py-1.5 px-3.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 cursor-pointer"
              >
                {isDeletingEntry ? (
                  <span>Deleting...</span>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: PARTY CHALLANS LIST                                   */}
      {/* ============================================================ */}
      {showPartyChallansModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-surface-200 p-4 sm:p-5 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-surface-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-100 text-[#ea580c] rounded-lg">
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-surface-900 flex items-center gap-2">
                    <span>Party Challans: {selectedCustomer.name || selectedCustomer.business_name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-100 text-surface-700 font-bold">
                      {customerChallans.length} Challans
                    </span>
                  </h3>
                  <span className="text-[11px] text-surface-500">
                    Official delivery challans issued to this party
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPartyChallansModal(false)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Search and Action Bar */}
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
                <input
                  type="text"
                  value={partyChallansSearch}
                  onChange={(e) => setPartyChallansSearch(e.target.value)}
                  placeholder="Filter challans by number, site..."
                  className="input text-xs py-1.5 pl-8 pr-2 w-full font-medium"
                />
              </div>

              <Link
                href={`/challans/new?customerId=${encodeURIComponent(selectedCustomer.id || selectedCustomerId)}`}
                className="btn-primary py-1.5 px-3 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white flex items-center gap-1 shadow-xs whitespace-nowrap"
              >
                <Plus size={13} />
                <span>+ New Challan</span>
              </Link>
            </div>

            {/* Challans Table */}
            <div className="border border-surface-200 rounded-xl overflow-hidden max-h-[50vh] overflow-y-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-surface-50 sticky top-0 border-b border-surface-200">
                  <tr className="text-surface-700 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2 px-3">Challan #</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Site / Project</th>
                    <th className="py-2 px-3 text-right">Amount (₹)</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    <th className="py-2 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 font-medium text-surface-800">
                  {customerChallans
                    .filter((c) => {
                      if (!partyChallansSearch.trim()) return true;
                      const q = partyChallansSearch.toLowerCase();
                      return (
                        c.challan_number.toLowerCase().includes(q) ||
                        (c.site_name || '').toLowerCase().includes(q)
                      );
                    })
                    .map((c) => (
                      <tr key={c.id} className="hover:bg-surface-50/80 transition-colors">
                        <td className="py-2 px-3 font-mono font-bold text-primary-600">
                          <Link
                            href={`/challans/${c.id}`}
                            className="hover:underline flex items-center gap-1"
                          >
                            <span>{c.challan_number}</span>
                            <ExternalLink size={10} className="opacity-70" />
                          </Link>
                        </td>
                        <td className="py-2 px-3 text-surface-600 whitespace-nowrap">
                          {formatDateDisplay(c.date)}
                        </td>
                        <td className="py-2 px-3 text-surface-700">
                          {c.site_name || '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-surface-900">
                          ₹{c.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="uppercase text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            {c.status || 'delivered'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <Link
                            href={`/challans/${c.id}`}
                            className="p-1 text-surface-600 hover:text-surface-900 hover:bg-surface-100 rounded inline-flex items-center gap-1 text-[11px] font-semibold"
                            title="Open Challan"
                          >
                            <Eye size={12} />
                            <span>View</span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  {customerChallans.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-surface-400">
                        No challans found for this party.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-2 border-t border-surface-100 flex items-center justify-between text-xs text-surface-500">
              <span>
                Total Amount:{' '}
                <b className="text-surface-900 font-mono">
                  ₹{customerChallans.reduce((s, c) => s + (c.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </b>
              </span>
              <button
                type="button"
                onClick={() => setShowPartyChallansModal(false)}
                className="btn-secondary py-1.5 px-3 text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: EDIT LEDGER ENTRY (DEBIT / CREDIT / AMOUNT / SITE)    */}
      {/* ============================================================ */}
      {showEditEntryModal && editingEntry && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-surface-200 p-4 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-surface-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-100 text-[#ea580c] rounded-lg">
                  <Edit2 size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-surface-900">
                    Edit Ledger Transaction
                  </h3>
                  <span className="text-[11px] text-surface-500">
                    Modify debit/credit, amounts, site or particulars with audit tracking
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditEntryModal(false);
                  setEditingEntry(null);
                }}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleUpdateEntrySubmit} className="space-y-4 text-xs">
              {/* Accounting Effect: Debit vs Credit toggle */}
              <div className="space-y-1.5">
                <label className="font-bold text-surface-700 block">Accounting Effect *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditEntryDebitOrCredit('debit');
                      setEditEntryParticulars(cleanTallyParticulars(editEntryParticulars, true));
                    }}
                    className={`py-2 px-3 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      editEntryDebitOrCredit === 'debit'
                        ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-2xs ring-2 ring-rose-400/20'
                        : 'bg-surface-50 border-surface-200 text-surface-600 hover:bg-surface-100'
                    }`}
                  >
                    <span>↗ Debit (+) Receivable</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditEntryDebitOrCredit('credit');
                      setEditEntryParticulars(cleanTallyParticulars(editEntryParticulars, false));
                    }}
                    className={`py-2 px-3 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      editEntryDebitOrCredit === 'credit'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-2xs ring-2 ring-emerald-400/20'
                        : 'bg-surface-50 border-surface-200 text-surface-600 hover:bg-surface-100'
                    }`}
                  >
                    <span>↙ Credit (-) Receipt / Payment</span>
                  </button>
                </div>
              </div>

              {/* Date & Transaction Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-surface-700">Date *</label>
                  <input
                    type="date"
                    required
                    value={editEntryDate}
                    onChange={(e) => setEditEntryDate(e.target.value)}
                    className="input text-xs w-full font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-surface-700">Transaction Type *</label>
                  <select
                    value={editEntryType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditEntryType(val as any);
                      const isCr = ['Generic Receipt (Credit)', 'Bank Transfer', 'UPI', 'Cash', 'Cheque', 'Credit Adjustment', 'Receipt'].includes(val);
                      setEditEntryDebitOrCredit(isCr ? 'credit' : 'debit');
                      if (val === 'Cash') {
                        setEditEntryParticulars('By Cash');
                      } else if (val === 'UPI') {
                        setEditEntryParticulars('By UPI');
                      } else if (val === 'Cheque') {
                        setEditEntryParticulars('By Cheque');
                      } else if (val === 'Bank Transfer') {
                        setEditEntryParticulars('By HDFC BANK-50200003880041');
                      } else if (val === 'Party Challan' || val === 'Sales GST') {
                        setEditEntryParticulars('To SALE GST 18%');
                      } else {
                        setEditEntryParticulars(cleanTallyParticulars(editEntryParticulars, !isCr));
                      }
                    }}
                    className="input text-xs w-full font-medium"
                  >
                    <option value="Sales GST">Sales GST (Challan / Bill - Debit)</option>
                    <option value="Party Challan">Party Challan (Delivery - Debit)</option>
                    <option value="Cash">Cash Receipt (Credit)</option>
                    <option value="UPI">UPI Payment (Credit)</option>
                    <option value="Bank Transfer">Bank Transfer (HDFC Bank - Credit)</option>
                    <option value="Cheque">Cheque (Credit)</option>
                    <option value="Generic Receipt (Credit)">Generic Receipt (Credit)</option>
                    <option value="Debit Adjustment">Debit Adjustment (+)</option>
                    <option value="Credit Adjustment">Credit Adjustment (-)</option>
                  </select>
                </div>
              </div>

              {/* Particulars */}
              <div className="space-y-1">
                <label className="font-bold text-surface-700">Particulars / Description *</label>
                <input
                  type="text"
                  required
                  value={editEntryParticulars}
                  onChange={(e) => setEditEntryParticulars(e.target.value)}
                  placeholder="e.g. To SALE GST 18% or By HDFC BANK-50200003880041"
                  className="input text-xs w-full font-medium"
                />
              </div>

              {/* Voucher No & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-surface-700">Vch No. / Ref</label>
                  <input
                    type="text"
                    value={editEntryVoucherNo}
                    onChange={(e) => setEditEntryVoucherNo(e.target.value)}
                    placeholder="e.g. 2225 or 4652/23-24"
                    className="input text-xs w-full font-mono font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-surface-700">Amount (₹) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editEntryAmount}
                    onChange={(e) => setEditEntryAmount(e.target.value)}
                    placeholder="0.00"
                    className="input text-xs w-full font-mono font-bold"
                  />
                </div>
              </div>

              {/* Site Name */}
              <div className="space-y-1">
                <label className="font-bold text-surface-700">Site Name (Optional)</label>
                <input
                  type="text"
                  list="ledgerSitesList"
                  value={editEntrySiteName}
                  onChange={(e) => setEditEntrySiteName(e.target.value)}
                  placeholder="e.g. Kalpataru, Naupada, General..."
                  className="input text-xs w-full font-medium"
                />
                <datalist id="ledgerSitesList">
                  {ledgerData.sites?.map((s) => (
                    <option key={s.id} value={s.site_name} />
                  ))}
                </datalist>
                <span className="text-[10px] text-surface-500">
                  Site balance will automatically update in the Sites table below.
                </span>
              </div>

              {/* Reason for Change */}
              <div className="space-y-1">
                <label className="font-bold text-surface-700 flex items-center justify-between">
                  <span>Reason for Change / Edit *</span>
                  <span className="text-[10px] text-amber-700 font-normal">Recorded in audit log</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={editEntryReason}
                  onChange={(e) => setEditEntryReason(e.target.value)}
                  placeholder="e.g. Rate adjusted as per revised challan / payment mode corrected / debit shifted"
                  className="input text-xs w-full font-medium py-1.5"
                />
              </div>

              {/* Form Action Buttons */}
              <div className="pt-3 border-t border-surface-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditEntryModal(false);
                    setEditingEntry(null);
                  }}
                  className="btn-secondary py-1.5 px-3 text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingEntry}
                  className="btn-primary py-1.5 px-4 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  {isUpdatingEntry ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: TRANSACTION REVISION & UPDATE HISTORY (LAST UPDATED)  */}
      {/* ============================================================ */}
      {selectedEntryForHistory && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-surface-200 p-4 sm:p-5 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-surface-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                  <Clock size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-surface-900">
                    Transaction Revision & Update History
                  </h3>
                  <span className="text-[11px] text-surface-500 font-mono">
                    Ref: {selectedEntryForHistory.reference || '—'} • {selectedEntryForHistory.particulars}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntryForHistory(null)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Current Status & Primary Last Updated Banner */}
            <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-900 flex items-center gap-1.5">
                  <Clock size={13} className="text-amber-700" />
                  <span>Last Updated:</span>
                </span>
                <span className="font-semibold text-amber-950 font-mono text-[11px]">
                  {selectedEntryForHistory.last_updated
                    ? new Date(selectedEntryForHistory.last_updated).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Recent update'}
                </span>
              </div>

              {selectedEntryForHistory.updated_by && (
                <div className="flex items-center justify-between text-surface-700">
                  <span>Updated By:</span>
                  <span className="font-bold text-surface-900">{selectedEntryForHistory.updated_by}</span>
                </div>
              )}

              {selectedEntryForHistory.reason && (
                <div className="pt-2 border-t border-amber-200/70 text-surface-800">
                  <span className="font-bold text-amber-950 block text-[11px] mb-0.5">Reason for Update:</span>
                  <p className="bg-white/80 p-2 rounded-lg border border-amber-200/80 text-[11.5px] leading-relaxed font-medium text-surface-900">
                    &ldquo;{selectedEntryForHistory.reason}&rdquo;
                  </p>
                </div>
              )}
            </div>

            {/* Entry Financial Snapshot */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs p-2.5 bg-surface-50 rounded-xl border border-surface-200">
              <div>
                <span className="text-[10px] text-surface-500 font-bold block uppercase">Date</span>
                <span className="font-semibold text-surface-800">{formatDateDisplay(selectedEntryForHistory.date)}</span>
              </div>
              <div>
                <span className="text-[10px] text-surface-500 font-bold block uppercase">Effect</span>
                <span className={`font-bold uppercase text-[11px] ${selectedEntryForHistory.debit > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {selectedEntryForHistory.debit > 0 ? 'Debit (+)' : 'Credit (-)'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-surface-500 font-bold block uppercase">Amount</span>
                <span className="font-mono font-bold text-surface-950">
                  ₹{(selectedEntryForHistory.debit > 0 ? selectedEntryForHistory.debit : selectedEntryForHistory.credit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Chronological Revisions History */}
            {selectedEntryForHistory.revision_history && selectedEntryForHistory.revision_history.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-surface-700 uppercase tracking-wider">
                  Detailed Change Log ({selectedEntryForHistory.revision_history.length})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedEntryForHistory.revision_history.map((rev: any, rIdx: number) => (
                    <div
                      key={rIdx}
                      className="p-2.5 bg-surface-50 rounded-lg border border-surface-200 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-surface-800">
                          {rev.edited_by || 'Admin'}
                        </span>
                        <span className="text-surface-500 font-mono text-[10px]">
                          {new Date(rev.timestamp).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {rev.reason && (
                        <p className="text-[11px] text-surface-700 font-medium">
                          <b>Reason:</b> {rev.reason}
                        </p>
                      )}
                      {Array.isArray(rev.changes) && rev.changes.length > 0 && (
                        <ul className="list-disc list-inside text-[10.5px] text-surface-600 space-y-0.5 pt-0.5">
                          {rev.changes.map((c: string, ci: number) => (
                            <li key={ci}>{c}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-surface-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEntryForHistory(null)}
                className="btn-secondary py-1.5 px-4 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: CLEAR CUSTOMER LEDGER (45-DAY RETENTION)              */}
      {/* ============================================================ */}
      {showDeleteEntireLedgerModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-amber-200 p-5 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 border border-amber-300">
                <Trash2 size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-surface-950">
                  Clear Outstanding &amp; Settle Ledger?
                </h3>
                <p className="text-xs text-surface-600 leading-relaxed">
                  Are you sure you want to clear the ledger and settle outstanding for <b className="text-surface-900">{selectedCustomer?.name || 'this customer'}</b>?
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900 space-y-1 mt-2">
                  <p className="font-bold">🛡️ 45-Day Retention Policy:</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
                    <li>Ledger outstanding will be settled and reconciled to ₹0.</li>
                    <li>Records are <b>NOT deleted immediately</b> — they are preserved in ledger history for <b>45 days</b>.</li>
                    <li>After 45 days, settled transactions will be automatically purged by the system.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-100">
              <button
                type="button"
                onClick={() => setShowDeleteEntireLedgerModal(false)}
                disabled={isDeletingEntireLedger}
                className="px-3 py-1.5 text-xs font-semibold text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteEntireLedger}
                disabled={isDeletingEntireLedger}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 size={13} />
                <span>{isDeletingEntireLedger ? 'Clearing...' : 'Clear Ledger (Retain 45 Days)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

export default function MasterPartyLedgerPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-8 h-8 border-2 border-[#ea580c] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MasterPartyLedgerContent />
    </React.Suspense>
  );
}
