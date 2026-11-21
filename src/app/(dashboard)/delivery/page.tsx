'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Truck,
  CheckCircle2,
  Clock,
  Send,
  Eye,
  Search,
  Filter,
  BookOpen,
  AlertCircle,
  Phone,
  MapPin,
  Package,
  FileText,
  Check,
  X,
  RotateCcw,
  Calendar,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { useApp } from '@/lib/context';
import { Challan, ChallanStatus } from '@/types';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { formatDateIndian, formatCurrency, cn } from '@/lib/utils';
import {
  shareDeliveryConfirmationViaWhatsApp,
  generateDeliveryConfirmationMessage,
  resolveCustomerPhone,
  openWhatsApp,
} from '@/lib/whatsapp';
import { downloadChallanPDF } from '@/lib/pdf';

export default function DeliveryManagementPage() {
  const router = useRouter();
  const {
    challans,
    customers,
    profile,
    updateChallan,
    updateChallanStatus,
    showToast,
    dataVersion,
  } = useApp();

  const [mounted, setMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [statusTab, setStatusTab] = useState<
    | 'all'
    | 'pending'
    | 'approved'
    | 'out_for_delivery'
    | 'delivered'
    | 'partially_delivered'
    | 'cancelled'
    | 'goods_returned'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Phone Prompt Modal for Challans without a saved phone number
  const [phonePromptChallan, setPhonePromptChallan] = useState<Challan | null>(null);
  const [promptPhoneNumber, setPromptPhoneNumber] = useState('');

  useEffect(() => {
    setMounted(true);
    setCurrentUser(getCurrentUser());
  }, []);

  // Filter valid, non-deleted challans
  const activeChallans = useMemo(() => {
    return (challans || []).filter(
      (c) => !c.is_deleted && c.status !== 'void'
    );
  }, [challans, dataVersion]);

  // Status counts for top stats
  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let outForDelivery = 0;
    let delivered = 0;
    let partiallyDelivered = 0;
    let cancelled = 0;
    let goodsReturned = 0;

    activeChallans.forEach((c) => {
      const isDelivered = c.status === 'delivered' || (c as any).delivery_status === 'delivered' || Boolean(c.is_delivered);
      if (isDelivered) {
        delivered++;
      } else if (c.status === 'out_for_delivery') {
        outForDelivery++;
      } else if (c.status === 'approved') {
        approved++;
      } else if (c.status === 'partially_delivered') {
        partiallyDelivered++;
      } else if (c.status === 'cancelled') {
        cancelled++;
      } else if (c.status === 'goods_returned') {
        goodsReturned++;
      } else {
        pending++;
      }
    });

    return {
      total: activeChallans.length,
      pending,
      approved,
      outForDelivery,
      delivered,
      partiallyDelivered,
      cancelled,
      goodsReturned,
    };
  }, [activeChallans]);

  // Filtered challans based on active tab and search
  const filteredChallans = useMemo(() => {
    return activeChallans.filter((c) => {
      const isDelivered = c.status === 'delivered' || (c as any).delivery_status === 'delivered' || Boolean(c.is_delivered);

      // Status tab filter
      if (statusTab !== 'all') {
        if (statusTab === 'delivered' && !isDelivered) return false;
        if (statusTab === 'out_for_delivery' && (c.status !== 'out_for_delivery' || isDelivered)) return false;
        if (statusTab === 'pending' && (isDelivered || (c.status !== 'pending' && c.status !== 'draft'))) return false;
        if (statusTab === 'approved' && c.status !== 'approved') return false;
        if (statusTab === 'partially_delivered' && c.status !== 'partially_delivered') return false;
        if (statusTab === 'cancelled' && c.status !== 'cancelled') return false;
        if (statusTab === 'goods_returned' && c.status !== 'goods_returned') return false;
      }

      // Customer filter
      if (selectedCustomerId !== 'all') {
        const cId = (c.customer_id || '').toLowerCase();
        const cName = (c.customer_name || '').toLowerCase();
        const target = selectedCustomerId.toLowerCase();
        if (cId !== target && cName !== target && !cName.includes(target)) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const num = (c.challan_number || '').toLowerCase();
        const ref = (c.reference_number || '').toLowerCase();
        const cust = (c.customer_name || '').toLowerCase();
        const phone = (c.customer_phone || '').toLowerCase();
        const site = (c.site_name || c.delivery_address || '').toLowerCase();
        if (
          !num.includes(q) &&
          !ref.includes(q) &&
          !cust.includes(q) &&
          !phone.includes(q) &&
          !site.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [activeChallans, statusTab, selectedCustomerId, searchQuery]);

  // Handler: 1-Click Mark as Approved (Admin Approval Gate)
  const handleMarkAsApproved = async (challan: Challan) => {
    try {
      setUpdatingId(challan.id);
      const approvedAt = new Date().toISOString();
      const approvedBy = currentUser?.name || currentUser?.username || 'Admin';

      await updateChallanStatus(challan.id, 'approved');

      await updateChallan(challan.id, {
        status: 'approved',
        delivery_status: 'approved',
        is_approved: true,
        approved_at: approvedAt,
        approved_by: approvedBy,
      });

      showToast(`Challan ${challan.challan_number} APPROVED by Admin! Added to Party Ledger & Challans. ✓`, 'success');
    } catch (err: any) {
      console.error('Failed to approve challan:', err);
      showToast(err.message || 'Error approving challan', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  // Handler: 1-Click Mark as Delivered
  const handleMarkAsDelivered = async (challan: Challan) => {
    try {
      setUpdatingId(challan.id);
      const targetPhone = resolveCustomerPhone(challan, customers, challans);

      // 1. Update Challan Status in Client context store & Server Database
      const deliveredAt = new Date().toISOString();
      const deliveredBy = currentUser?.name || currentUser?.username || 'Staff';

      await updateChallanStatus(challan.id, 'delivered', {
        delivered_by: deliveredBy,
      });

      // Update full challan fields to guarantee ledger gate pickup
      await updateChallan(challan.id, {
        status: 'delivered',
        delivery_status: 'delivered',
        is_delivered: true,
        delivered_at: deliveredAt,
        delivered_by: deliveredBy,
      });

      showToast(`Challan ${challan.challan_number} marked as DELIVERED! Added to Party Ledger. 🚚`, 'success');

      // 2. Open WhatsApp delivery notification
      if (targetPhone) {
        if (profile) {
          await shareDeliveryConfirmationViaWhatsApp({
            challan: {
              ...challan,
              status: 'delivered',
              customer_phone: targetPhone,
              delivered_at: deliveredAt,
              delivered_by: deliveredBy,
            },
            profile,
            phoneOverride: targetPhone,
            onToast: showToast,
          });
        }
      } else {
        // Open modal to prompt staff for WhatsApp number
        setPhonePromptChallan({
          ...challan,
          status: 'delivered',
          delivered_at: deliveredAt,
          delivered_by: deliveredBy,
        });
        setPromptPhoneNumber('');
      }
    } catch (err: any) {
      console.error('Failed to mark delivery:', err);
      showToast(err.message || 'Error updating delivery status', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  // Handler: Mark Out for Delivery (In Transit)
  const handleMarkOutForDelivery = async (challan: Challan) => {
    try {
      setUpdatingId(challan.id);
      await updateChallanStatus(challan.id, 'out_for_delivery');
      await updateChallan(challan.id, {
        status: 'out_for_delivery',
        delivery_status: 'out_for_delivery',
        is_delivered: false,
      });
      showToast(`Challan ${challan.challan_number} is now OUT FOR DELIVERY (In Transit).`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to update status', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  // Handler: Update Delivery Status (Dropdown & Checkbox)
  const handleUpdateDeliveryStatus = async (
    challan: Challan,
    newStatus: ChallanStatus,
    confirmed?: boolean
  ) => {
    try {
      setUpdatingId(challan.id);
      if (newStatus === 'approved' || confirmed === true) {
        await handleMarkAsApproved(challan);
        return;
      }
      if (newStatus === 'delivered') {
        await handleMarkAsDelivered(challan);
        return;
      }

      const now = new Date().toISOString();
      const updatedChallanData: Partial<Challan> = {
        status: newStatus,
        delivery_status: newStatus,
        is_delivered: false,
        updated_at: now,
      };

      await updateChallanStatus(challan.id, newStatus);
      await updateChallan(challan.id, updatedChallanData);

      const statusLabels: Record<string, string> = {
        pending: 'Pending',
        approved: 'Approved',
        out_for_delivery: 'Out for Delivery (In Transit)',
        delivered: 'Delivered',
        partially_delivered: 'Partially Delivered',
        cancelled: 'Cancelled',
        goods_returned: 'Goods Returned',
      };

      showToast(`Challan ${challan.challan_number} status updated to ${statusLabels[newStatus] || newStatus}`, 'info');
    } catch (err: any) {
      console.error('Failed to update status:', err);
      showToast(err.message || 'Error updating status', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  // Handler: Re-send WhatsApp Confirmation
  const handleResendWhatsApp = async (challan: Challan) => {
    if (!profile) return;
    const targetPhone = resolveCustomerPhone(challan, customers, challans);
    if (!targetPhone) {
      setPhonePromptChallan(challan);
      setPromptPhoneNumber('');
      return;
    }

    await shareDeliveryConfirmationViaWhatsApp({
      challan,
      profile,
      phoneOverride: targetPhone,
      onToast: showToast,
    });
  };

  // Handler: Submit phone from prompt modal
  const handlePhonePromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phonePromptChallan || !promptPhoneNumber.trim() || !profile) return;
    const phone = promptPhoneNumber.trim();

    // Save phone to challan in store
    await updateChallan(phonePromptChallan.id, { customer_phone: phone });

    // Open WhatsApp
    await shareDeliveryConfirmationViaWhatsApp({
      challan: { ...phonePromptChallan, customer_phone: phone },
      profile,
      phoneOverride: phone,
      onToast: showToast,
    });

    setPhonePromptChallan(null);
    setPromptPhoneNumber('');
  };

  // Handler: Undo Delivered Status (Admin only)
  const handleUndoDelivery = async (challan: Challan) => {
    if (!isAdmin()) {
      showToast('Only Admins can undo delivered status', 'error');
      return;
    }
    if (!confirm(`Reset Challan ${challan.challan_number} back to Pending Delivery? (It will be temporarily removed from the Ledger until delivered again)`)) {
      return;
    }

    try {
      setUpdatingId(challan.id);
      await updateChallanStatus(challan.id, 'pending');
      await updateChallan(challan.id, {
        status: 'pending',
        delivery_status: 'pending',
        is_delivered: false,
        delivered_at: null,
        delivered_by: null,
      });
      showToast(`Challan ${challan.challan_number} set back to Pending Delivery.`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to revert delivery', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="space-y-5 p-3 sm:p-6 max-w-7xl mx-auto pb-24">
      {/* ============================================================ */}
      {/* HEADER & TOP STATS BAR                                       */}
      {/* ============================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-orange-100 text-[#ea580c] flex items-center justify-center shadow-xs">
              <Truck size={20} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-surface-900 tracking-tight flex items-center gap-2">
                <span>Delivery Status & Dispatch</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Ledger Sync Active
                </span>
              </h1>
              <p className="text-xs text-surface-500">
                Mark challan deliveries, trigger customer WhatsApp notifications, and auto-sync into Party Ledgers.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/bills"
            className="btn-secondary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5"
          >
            <FileText size={14} />
            <span>Delivery Bills</span>
          </Link>

          <Link
            href="/ledger"
            className="btn-primary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 bg-[#ea580c] hover:bg-[#c2410c] text-white shadow-xs"
          >
            <BookOpen size={14} />
            <span>View Party Ledger</span>
          </Link>
        </div>
      </div>

      {/* Stats Counter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Pending Card */}
        <button
          type="button"
          onClick={() => setStatusTab('pending')}
          className={cn(
            'p-3.5 rounded-xl border text-left transition-all cursor-pointer bg-white shadow-2xs',
            statusTab === 'pending'
              ? 'border-amber-400 ring-2 ring-amber-100 bg-amber-50/20'
              : 'border-surface-200 hover:border-surface-300'
          )}
        >
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Pending Delivery</span>
            <Clock size={16} />
          </div>
          <div className="text-2xl font-black text-surface-900">{stats.pending}</div>
          <div className="text-[10px] text-amber-600 font-medium mt-0.5">Awaiting dispatch</div>
        </button>

        {/* Out for Delivery Card */}
        <button
          type="button"
          onClick={() => setStatusTab('out_for_delivery')}
          className={cn(
            'p-3.5 rounded-xl border text-left transition-all cursor-pointer bg-white shadow-2xs',
            statusTab === 'out_for_delivery'
              ? 'border-blue-400 ring-2 ring-blue-100 bg-blue-50/20'
              : 'border-surface-200 hover:border-surface-300'
          )}
        >
          <div className="flex items-center justify-between text-blue-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Out for Delivery</span>
            <Truck size={16} />
          </div>
          <div className="text-2xl font-black text-surface-900">{stats.outForDelivery}</div>
          <div className="text-[10px] text-blue-600 font-medium mt-0.5">In Transit to site</div>
        </button>

        {/* Delivered Card */}
        <button
          type="button"
          onClick={() => setStatusTab('delivered')}
          className={cn(
            'p-3.5 rounded-xl border text-left transition-all cursor-pointer bg-white shadow-2xs',
            statusTab === 'delivered'
              ? 'border-emerald-400 ring-2 ring-emerald-100 bg-emerald-50/20'
              : 'border-surface-200 hover:border-surface-300'
          )}
        >
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Delivered</span>
            <CheckCircle2 size={16} />
          </div>
          <div className="text-2xl font-black text-emerald-700">{stats.delivered}</div>
          <div className="text-[10px] text-emerald-600 font-medium mt-0.5">Added to Party Ledger ✓</div>
        </button>

        {/* All Challans Card */}
        <button
          type="button"
          onClick={() => setStatusTab('all')}
          className={cn(
            'p-3.5 rounded-xl border text-left transition-all cursor-pointer bg-white shadow-2xs',
            statusTab === 'all'
              ? 'border-surface-400 ring-2 ring-surface-100 bg-surface-50'
              : 'border-surface-200 hover:border-surface-300'
          )}
        >
          <div className="flex items-center justify-between text-surface-600 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Challans</span>
            <Package size={16} />
          </div>
          <div className="text-2xl font-black text-surface-900">{stats.total}</div>
          <div className="text-[10px] text-surface-500 font-medium mt-0.5">All active records</div>
        </button>
      </div>

      {/* ============================================================ */}
      {/* FILTER & SEARCH TOOLBAR                                      */}
      {/* ============================================================ */}
      <div className="card p-3 sm:p-4 bg-white border border-surface-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-surface-100 p-1 rounded-xl shrink-0 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setStatusTab('all')}
              className={cn(
                'px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer',
                statusTab === 'all'
                  ? 'bg-white text-surface-900 shadow-xs'
                  : 'text-surface-600 hover:text-surface-900'
              )}
            >
              All ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('pending')}
              className={cn(
                'px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer',
                statusTab === 'pending'
                  ? 'bg-white text-amber-800 shadow-xs'
                  : 'text-surface-600 hover:text-surface-900'
              )}
            >
              Pending ({stats.pending})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('approved')}
              className={cn(
                'px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer',
                statusTab === 'approved'
                  ? 'bg-white text-indigo-800 shadow-xs'
                  : 'text-surface-600 hover:text-surface-900'
              )}
            >
              Approved ({stats.approved})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('out_for_delivery')}
              className={cn(
                'px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer',
                statusTab === 'out_for_delivery'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-surface-600 hover:text-surface-900'
              )}
            >
              Out for Delivery ({stats.outForDelivery})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('delivered')}
              className={cn(
                'px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer',
                statusTab === 'delivered'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-surface-600 hover:text-surface-900'
              )}
            >
              Delivered ({stats.delivered})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('partially_delivered')}
              className={cn(
                'px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer',
                statusTab === 'partially_delivered'
                  ? 'bg-white text-teal-800 shadow-xs'
                  : 'text-surface-600 hover:text-surface-900'
              )}
            >
              Partially Delivered ({stats.partiallyDelivered})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('cancelled')}
              className={cn(
                'px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer',
                statusTab === 'cancelled'
                  ? 'bg-white text-rose-800 shadow-xs'
                  : 'text-surface-600 hover:text-surface-900'
              )}
            >
              Cancelled ({stats.cancelled})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('goods_returned')}
              className={cn(
                'px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer',
                statusTab === 'goods_returned'
                  ? 'bg-white text-purple-800 shadow-xs'
                  : 'text-surface-600 hover:text-surface-900'
              )}
            >
              Goods Returned ({stats.goodsReturned})
            </button>
          </div>

          {/* Search & Customer Dropdown */}
          <div className="flex items-center gap-2 flex-1 max-w-lg">
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Challan No, Customer, Phone, Site..."
                className="input pl-9 text-xs w-full py-1.5"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="select text-xs py-1.5 max-w-[180px]"
            >
              <option value="all">All Customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.business_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* CHALLANS TABLE / CARD LIST                                   */}
      {/* ============================================================ */}
      {filteredChallans.length === 0 ? (
        <div className="card p-12 text-center border border-dashed border-surface-300 bg-white space-y-3">
          <div className="w-12 h-12 rounded-full bg-surface-100 text-surface-400 flex items-center justify-center mx-auto">
            <Truck size={24} />
          </div>
          <h3 className="font-bold text-sm text-surface-800">No Challans Found</h3>
          <p className="text-xs text-surface-500 max-w-sm mx-auto">
            No challans match the current filter criteria for status: <b>{statusTab}</b>.
          </p>
        </div>
      ) : (
        <div className="card bg-white border border-surface-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-200 text-surface-600 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Challan / PO No</th>
                  <th className="py-2.5 px-3">Customer & Site</th>
                  <th className="py-2.5 px-3">Items & Qty</th>
                  <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                  <th className="py-2.5 px-3 text-center">Delivery Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filteredChallans.map((c) => {
                  const isApproved = c.status === 'approved' || Boolean(c.is_approved);
                  const isDelivered =
                    c.status === 'delivered' ||
                    (c as any).delivery_status === 'delivered' ||
                    Boolean(c.is_delivered);
                  const isOut = c.status === 'out_for_delivery';
                  const isUpdating = updatingId === c.id;
                  const targetPhone = resolveCustomerPhone(c, customers, challans);

                  const itemsCount = Array.isArray(c.items) ? c.items.length : 0;
                  const firstItem = c.items?.[0]?.item_description || '';
                  const moreItems = itemsCount > 1 ? ` +${itemsCount - 1} more` : '';

                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        'hover:bg-surface-50/70 transition-colors',
                        isDelivered && 'bg-emerald-50/20'
                      )}
                    >
                      {/* Challan & Date */}
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        <div className="font-extrabold text-surface-900 flex items-center gap-1.5">
                          <Link
                            href={`/challans/${c.id}`}
                            className="hover:text-[#ea580c] transition-colors underline decoration-dotted"
                          >
                            {c.challan_number || c.reference_number}
                          </Link>
                        </div>
                        <div className="text-[10px] text-surface-500 mt-0.5 flex items-center gap-1">
                          <Calendar size={11} />
                          <span>{formatDateIndian(c.challan_date || c.created_at)}</span>
                        </div>
                        {c.reference_number && c.reference_number !== c.challan_number && (
                          <div className="text-[10px] text-surface-400 mt-0.5">
                            PO: {c.reference_number}
                          </div>
                        )}
                      </td>

                      {/* Customer & Site */}
                      <td className="py-3 px-3 align-top min-w-[200px]">
                        <div className="font-bold text-surface-900">{c.customer_name}</div>
                        <div className="text-[11px] text-surface-500 mt-0.5 flex items-center gap-1">
                          <MapPin size={11} className="shrink-0 text-surface-400" />
                          <span className="truncate max-w-[220px]">
                            {c.site_name || c.delivery_address || 'Main Address'}
                          </span>
                        </div>
                        {targetPhone && (
                          <div className="text-[11px] text-emerald-700 mt-0.5 flex items-center gap-1 font-medium">
                            <Phone size={10} />
                            <span>{targetPhone}</span>
                          </div>
                        )}
                      </td>

                      {/* Items & Qty */}
                      <td className="py-3 px-3 align-top min-w-[160px]">
                        <div className="font-bold text-surface-800">
                          {c.total_quantity || 0} sheets / items
                        </div>
                        <div className="text-[11px] text-surface-500 truncate max-w-[200px] mt-0.5" title={firstItem}>
                          {firstItem ? `${firstItem}${moreItems}` : `${itemsCount} line items`}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                        <div className="font-black text-surface-900">
                          ₹{Number(c.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-surface-400 mt-0.5">
                          {c.apply_gst ? 'Inc. 18% GST' : 'Non-GST'}
                        </div>
                      </td>

                      {/* Delivery Status & Dropdown (Checkbox + 7 Status Options) */}
                      <td className="py-3 px-3 align-top min-w-[210px]">
                        <div className="space-y-1.5 bg-surface-50/80 p-2 rounded-lg border border-surface-200">
                          {/* [ ] Mark as Approved Checkbox */}
                          <label className="flex items-center gap-2 cursor-pointer font-bold text-zinc-900 select-none text-xs">
                            <input
                              type="checkbox"
                              checked={isApproved}
                              disabled={isUpdating}
                              onChange={(e) => {
                                const isChecked = e.target.checked;
                                handleUpdateDeliveryStatus(c, isChecked ? 'approved' : 'pending', isChecked);
                              }}
                              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-400 cursor-pointer disabled:opacity-50"
                            />
                            <span className="text-xs">Mark as Approved</span>
                          </label>

                          {/* Status Dropdown with 7 exact options */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-zinc-500 font-semibold text-[11px]">Status:</span>
                            <select
                              value={c.status || 'pending'}
                              disabled={isUpdating}
                              onChange={(e) => {
                                const newStatus = e.target.value as ChallanStatus;
                                handleUpdateDeliveryStatus(c, newStatus, newStatus === 'approved');
                              }}
                              className={cn(
                                "px-2 py-0.5 rounded-md border text-xs font-bold shadow-2xs cursor-pointer flex-1",
                                isApproved
                                  ? "bg-indigo-50 text-indigo-800 border-indigo-300"
                                  : isDelivered
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                  : isOut
                                  ? "bg-blue-50 text-blue-800 border-blue-300"
                                  : c.status === 'partially_delivered'
                                  ? "bg-teal-50 text-teal-800 border-teal-300"
                                  : c.status === 'cancelled'
                                  ? "bg-rose-50 text-rose-800 border-rose-300"
                                  : c.status === 'goods_returned'
                                  ? "bg-purple-50 text-purple-800 border-purple-300"
                                  : "bg-amber-50 text-amber-800 border-amber-300"
                              )}
                            >
                              <option value="pending">Pending</option>
                              <option value="approved">Approved</option>
                              <option value="out_for_delivery">Out for Delivery</option>
                              <option value="delivered">Delivered</option>
                              <option value="partially_delivered">Partially Delivered</option>
                              <option value="cancelled">Cancelled</option>
                              <option value="goods_returned">Goods Returned</option>
                            </select>
                          </div>

                          {/* Ledger Status Note */}
                          {(isApproved || isDelivered) && (
                            <div className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 pt-0.5">
                              <CheckCircle2 size={11} className="text-emerald-600" />
                              <span>In Party Ledger ✓</span>
                              {(c.approved_at || c.delivered_at) && (
                                <span className="text-surface-400 font-normal">
                                  ({formatDateIndian((c.approved_at || c.delivered_at)!)})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isApproved ? (
                            <>
                              {/* 1-Click "Mark as Approved" Button */}
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handleMarkAsApproved(c)}
                                className="py-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                                title="Admin: Mark as Approved and add to Party Ledger & Challans"
                              >
                                {isUpdating ? (
                                  <span>Saving...</span>
                                ) : (
                                  <>
                                    <CheckCircle2 size={13} />
                                    <span>Approve</span>
                                  </>
                                )}
                              </button>

                              {/* Mark In Transit */}
                              {!isOut && (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => handleMarkOutForDelivery(c)}
                                  className="py-1 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg text-xs flex items-center gap-1 border border-blue-200 transition-colors cursor-pointer"
                                  title="Mark Out for Delivery (In Transit)"
                                >
                                  <Truck size={12} />
                                  <span>Out</span>
                                </button>
                              )}

                              {c.status === 'goods_returned' && (
                                <Link
                                  href={`/returns`}
                                  className="py-1 px-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-2xs transition-colors"
                                  title="View Return Note & Issue Replacement Challan"
                                >
                                  <RotateCcw size={12} />
                                  <span>Return / New Challan</span>
                                </Link>
                              )}
                            </>
                          ) : (
                            <>
                              {/* 1-Click "Mark as Delivered" if not yet delivered */}
                              {!isDelivered && (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => handleMarkAsDelivered(c)}
                                  className="py-1 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-xs flex items-center gap-1 border border-blue-200 transition-colors cursor-pointer"
                                  title="Mark Delivered & send customer WhatsApp notification"
                                >
                                  <Truck size={12} />
                                  <span>Delivered</span>
                                </button>
                              )}

                              {/* Re-send WhatsApp Confirmation */}
                              <button
                                type="button"
                                onClick={() => handleResendWhatsApp(c)}
                                className="py-1 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs flex items-center gap-1.5 border border-emerald-200 transition-colors cursor-pointer"
                                title="Re-send delivery confirmation message on WhatsApp"
                              >
                                <Send size={12} />
                                <span>WhatsApp</span>
                              </button>

                              {/* View in Ledger */}
                              <Link
                                href={`/ledger?party=${encodeURIComponent(c.customer_id || c.customer_name)}`}
                                className="py-1 px-2.5 bg-orange-50 hover:bg-orange-100 text-[#ea580c] font-bold rounded-lg text-xs flex items-center gap-1 border border-orange-200 transition-colors"
                                title="View customer's Party Ledger"
                              >
                                <BookOpen size={12} />
                                <span>Ledger</span>
                              </Link>

                              {/* Revert / Undo Approval (Admin Only) */}
                              {isAdmin() && (
                                <button
                                  type="button"
                                  onClick={() => handleUndoDelivery(c)}
                                  className="p-1 text-surface-400 hover:text-rose-600 rounded-md transition-colors"
                                  title="Admin: Revert approval status to Pending"
                                >
                                  <RotateCcw size={13} />
                                </button>
                              )}
                            </>
                          )}

                          {/* View PDF */}
                          <button
                            type="button"
                            onClick={() => {
                              if (profile) {
                                downloadChallanPDF({
                                  challan: c,
                                  items: c.items || [],
                                  profile,
                                });
                              }
                            }}
                            className="p-1.5 text-surface-500 hover:text-surface-900 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer"
                            title="Download / Print A5 Challan PDF"
                          >
                            <Eye size={14} />
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
      )}

      {/* ============================================================ */}
      {/* MODAL: PROMPT FOR CUSTOMER WHATSAPP NUMBER                   */}
      {/* ============================================================ */}
      {phonePromptChallan && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-surface-200 p-5 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-surface-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Truck size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-surface-900">
                    Send Delivery Confirmation
                  </h3>
                  <p className="text-[11px] text-surface-500">
                    Challan: {phonePromptChallan.challan_number}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPhonePromptChallan(null)}
                className="text-surface-400 hover:text-surface-600 p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handlePhonePromptSubmit} className="space-y-3">
              <p className="text-xs text-surface-600 leading-relaxed">
                Enter the customer&apos;s WhatsApp mobile number for{' '}
                <b>{phonePromptChallan.customer_name}</b> to send the delivery confirmation:
              </p>

              <div>
                <label className="block text-[11px] font-bold text-surface-700 mb-1">
                  Customer WhatsApp Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  autoFocus
                  value={promptPhoneNumber}
                  onChange={(e) => setPromptPhoneNumber(e.target.value)}
                  placeholder="e.g. 9876543210 or +91 9876543210"
                  className="input text-xs w-full"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-100">
                <button
                  type="button"
                  onClick={() => setPhonePromptChallan(null)}
                  className="btn-secondary py-1.5 px-3 text-xs font-semibold"
                >
                  Skip WhatsApp
                </button>
                <button
                  type="submit"
                  className="btn-primary py-1.5 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
                >
                  <Send size={13} />
                  <span>Open WhatsApp</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
