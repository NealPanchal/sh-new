'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import {
  ArrowLeft,
  Printer,
  Download,
  Send,
  Edit,
  Copy,
  Ban,
  CheckCircle2,
  Clock,
  Phone,
  MapPin,
  FileText,
  AlertCircle,
  Share2,
  Receipt,
  Trash2,
  Truck,
  WalletCards,
  RotateCcw,
  CheckSquare,
  Square,
  Building2,
  Lock,
  X,
} from 'lucide-react';
import { formatDateIndian, formatINR, formatPhone, amountToWords, cn } from '@/lib/utils';
import { Challan, ChallanStatus, PaymentMode } from '@/types';
import { getCurrentUser, isEmployee, isAdmin } from '@/lib/auth';
import { downloadChallanPDF, printChallanPDF } from '@/lib/pdf';
import {
  openWhatsApp,
  generateShareMessage,
  tryNativeShare,
  shareChallanViaWhatsApp,
  shareDeliveryConfirmationViaWhatsApp,
  resolveCustomerPhone,
} from '@/lib/whatsapp';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DeliveryMemoBill } from '@/components/challans/delivery-memo-bill';
import { PaidRubberStamp } from '@/components/accounting/paid-rubber-stamp';

export default function ChallanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const challanId = params.id as string;

  const {
    getChallan,
    profile,
    customers,
    updateChallan,
    updateChallanStatus,
    updateShareStatus,
    duplicateChallan,
    deleteChallan,
    showToast,
    isLoading,
    challans: liveChallans,
    dataVersion,
  } = useApp();

  const [mounted, setMounted] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [challan, setChallan] = useState<Challan | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [viewMode, setViewMode] = useState<'challan' | 'pi' | 'bill'>('challan');
  const [activeDocType, setActiveDocType] = useState<'DELIVERY CHALLAN' | 'PROFORMA INVOICE'>('DELIVERY CHALLAN');

  // Payment Received Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<PaymentMode>('upi');
  const [payRef, setPayRef] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [recordingPay, setRecordingPay] = useState(false);

  // Delivery status management
  const [deliveryRemarks, setDeliveryRemarks] = useState('');
  const [updatingDelivery, setUpdatingDelivery] = useState(false);

  const currentUser = getCurrentUser();
  const isEmp = currentUser?.role === 'employee';
  const isApproved = Boolean(
    challan?.is_approved ||
    challan?.status === 'approved' ||
    challan?.status === 'delivered' ||
    challan?.status === 'final'
  );
  const isChallanPaid = Boolean(
    challan?.payment_status === 'paid' ||
    (challan?.total_amount && challan.paid_amount && challan.paid_amount >= challan.total_amount)
  );
  const canEdit = !isEmp || !isApproved;

  const handleUpdateDeliveryStatus = async (
    newStatus: ChallanStatus,
    confirmed?: boolean,
    remarks?: string
  ) => {
    if (!challan) return;
    try {
      setUpdatingDelivery(true);
      const now = new Date().toISOString();
      const confirmedBy = currentUser?.name || challan.prepared_by || 'Staff';

      const updatePayload: Partial<Challan> = {
        status: newStatus,
        delivery_status: newStatus,
        updated_at: now,
      };

      if (newStatus === 'delivered' || confirmed) {
        updatePayload.is_delivered = true;
        updatePayload.delivered_at = now;
        updatePayload.delivery_confirmed_at = now;
        updatePayload.delivery_confirmed_by = confirmedBy;
        updatePayload.delivered_by = confirmedBy;
        if (remarks) updatePayload.delivery_remarks = remarks;
      }

      const updated = await updateChallan(challan.id, updatePayload);
      if (updated) {
        setChallan({ ...challan, ...updated });
        showToast(`Delivery status updated to ${newStatus.replace('_', ' ').toUpperCase()}!`, 'success');
      }
    } catch (err: any) {
      showToast('Error updating delivery status', 'error');
    } finally {
      setUpdatingDelivery(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challan) return;
    const numAmt = Number(payAmount);
    if (!numAmt || numAmt <= 0) {
      showToast('Please enter a valid positive payment amount', 'error');
      return;
    }

    try {
      setRecordingPay(true);
      const { getClientAuthToken } = await import('@/lib/auth');
      const token = getClientAuthToken();

      const payload = {
        customer_id: challan.customer_id,
        customer_name: challan.customer_name,
        site_id: challan.site_id || undefined,
        site_name: challan.site_name || undefined,
        challan_id: challan.id,
        challan_number: challan.challan_number,
        amount: numAmt,
        payment_mode: payMode,
        payment_date: payDate,
        reference_no: payRef.trim() || undefined,
        notes: payNotes.trim() || undefined,
      };

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const d = await res.json();
      if (!res.ok || !d.success) {
        showToast(d.error || 'Failed to record payment', 'error');
        return;
      }

      showToast(`Payment of ₹${numAmt.toLocaleString('en-IN')} recorded & credited to ledger!`, 'success');
      setIsPaymentModalOpen(false);
      setPayAmount('');
      setPayRef('');
      setPayNotes('');

      // Immediately update local state with payment status & paid amount so the big PAID stamp appears instantly
      if (d.challan) {
        setChallan({ ...challan, ...d.challan });
        try {
          updateChallan(challan.id, d.challan);
        } catch {}
      } else {
        const newPaid = (challan.paid_amount || 0) + numAmt;
        const total = Number(challan.total_amount) || 0;
        const isPaid = total > 0 && newPaid >= total;
        const updatedPartial = {
          ...challan,
          paid_amount: newPaid,
          payment_status: isPaid ? ('paid' as const) : ('partial' as const),
          paid_at: payDate,
        };
        setChallan(updatedPartial);
        try {
          updateChallan(challan.id, updatedPartial);
        } catch {}
      }
    } catch (err: any) {
      showToast(err.message || 'Network error recording payment', 'error');
    } finally {
      setRecordingPay(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadChallan() {
      // 1. Try local cache
      const local = getChallan(challanId);
      if (local) {
        if (!isCancelled) {
          setChallan(local);
          setPageLoading(false);
        }
      }

      // 2. Fetch single challan directly from Cloud Firestore (vital for cold mobile loads & multi-device sync)
      try {
        const { fetchSingleChallanFromFirebase } = await import('@/lib/firebase-service');
        const remote = await fetchSingleChallanFromFirebase(challanId);
        if (remote && !isCancelled) {
          const { syncFromFirebase } = await import('@/lib/demo-store');
          syncFromFirebase([remote]);
          setChallan(remote);
          setPageLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Direct Firestore fetch attempt note:', err);
      }

      // 3. Fallback to Server API /api/challans?id=...
      try {
        const { getClientAuthToken } = await import('@/lib/auth');
        const token = getClientAuthToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/challans?id=${encodeURIComponent(challanId)}`, {
          credentials: 'same-origin',
          headers,
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.challan && !isCancelled) {
            const { syncFromFirebase } = await import('@/lib/demo-store');
            syncFromFirebase([json.challan]);
            setChallan(json.challan);
            setPageLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('API challans fetch attempt note:', err);
      }

      // 4. Fallback to public endpoint /api/public/challan?id=...
      try {
        const res = await fetch(`/api/public/challan?id=${encodeURIComponent(challanId)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.challan && !isCancelled) {
            const { syncFromFirebase } = await import('@/lib/demo-store');
            syncFromFirebase([json.challan]);
            setChallan(json.challan);
            setPageLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Public API challans fetch attempt note:', err);
      }

      // 5. If not found in any store/remote/API
      if (!isCancelled && !local) {
        setChallan(null);
        setPageLoading(false);
      }
    }

    if (mounted && challanId) {
      loadChallan();
    }

    return () => {
      isCancelled = true;
    };
  }, [mounted, challanId, getChallan, dataVersion, liveChallans]);

  const itemsSubtotal = useMemo(() => {
    if (!challan?.items) return 0;
    return challan.items.reduce((sum, item) => {
      const amt = Number(item.amount) || ((Number(item.quantity) || 0) * (Number(item.rate) || 0));
      return sum + amt;
    }, 0);
  }, [challan]);

  const transportCharges = Number(challan?.transportation_charges) || 0;
  const loadingCharges = Number(challan?.loading_charges) || 0;
  const taxableSubtotal = challan?.subtotal_amount || (itemsSubtotal + transportCharges + loadingCharges);
  const applyGst = Boolean(challan?.apply_gst);
  const applyAdditional9 = Boolean(challan?.apply_additional_9);
  const cgstAmount = challan?.cgst_amount ?? (applyGst && taxableSubtotal > 0 ? Math.round(taxableSubtotal * 0.09 * 100) / 100 : 0);
  const sgstAmount = challan?.sgst_amount ?? (applyGst && taxableSubtotal > 0 ? Math.round(taxableSubtotal * 0.09 * 100) / 100 : 0);
  const additional9Amount = challan?.additional_9_amount ?? (applyAdditional9 && taxableSubtotal > 0 ? Math.round(taxableSubtotal * 0.09 * 100) / 100 : 0);

  const totalAmount = useMemo(() => {
    if (challan?.total_amount && challan.total_amount > 0) return challan.total_amount;
    if (taxableSubtotal <= 0) return 0;
    return taxableSubtotal + cgstAmount + sgstAmount + additional9Amount;
  }, [challan, taxableSubtotal, cgstAmount, sgstAmount, additional9Amount]);

  if (!mounted || isLoading || (pageLoading && !challan)) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-xs text-surface-500">Loading challan details...</p>
      </div>
    );
  }

  if (!challan) {
    return (
      <div className="card p-8 sm:p-12 text-center max-w-lg mx-auto">
        <AlertCircle size={36} className="mx-auto text-surface-400 mb-2" />
        <h2 className="text-lg font-bold text-surface-900 mb-1">Challan Not Found</h2>
        <p className="text-xs text-surface-500 mb-4">
          This challan does not exist or may have been deleted.
        </p>
        <Link href="/challans" className="btn-secondary text-xs py-2 px-3.5 inline-flex items-center gap-1.5">
          <ArrowLeft size={15} />
          Back to Challans
        </Link>
      </div>
    );
  }

  const handlePrint = (typeOverride?: 'DELIVERY CHALLAN' | 'PROFORMA INVOICE') => {
    if (!profile) return;
    const docType = typeOverride || activeDocType;
    printChallanPDF({
      challan,
      items: challan.items || [],
      profile,
      documentType: docType,
    });
    const label = docType === 'PROFORMA INVOICE'
      ? (challan.pi_number || 'PI')
      : challan.challan_number;
    showToast(`Print opened for ${label}`);
  };

  const handleDownload = (typeOverride?: 'DELIVERY CHALLAN' | 'PROFORMA INVOICE') => {
    if (!profile) return;
    const docType = typeOverride || activeDocType;
    downloadChallanPDF({
      challan,
      items: challan.items || [],
      profile,
      documentType: docType,
    });
    const label = docType === 'PROFORMA INVOICE'
      ? (challan.pi_number || 'PI')
      : challan.challan_number;
    showToast(`PDF downloaded: ${label}`);
  };

  const handlePrintWithoutRate = () => {
    if (!profile || !challan) return;
    printChallanPDF({
      challan,
      items: challan.items || [],
      profile,
      documentType: 'DELIVERY CHALLAN',
      hideRate: true,
    });
    showToast(`Print opened (Without Rate) for ${challan.challan_number}`);
  };

  const handleDownloadWithoutRate = () => {
    if (!profile || !challan) return;
    downloadChallanPDF({
      challan,
      items: challan.items || [],
      profile,
      documentType: 'DELIVERY CHALLAN',
      hideRate: true,
    });
    showToast(`PDF downloaded (Without Rate): ${challan.challan_number}`);
  };

  const handleWhatsApp = async (typeOverride?: 'DELIVERY CHALLAN' | 'PROFORMA INVOICE') => {
    if (!profile || !challan) return;
    const docType = typeOverride || activeDocType;
    const targetPhone = resolveCustomerPhone(challan, customers, liveChallans);
    if (!targetPhone) {
      setPhoneInput('');
      setShowPhoneModal(true);
      return;
    }

    await shareChallanViaWhatsApp({
      challan,
      phoneOverride: targetPhone,
      items: challan.items || [],
      profile,
      documentType: docType,
      onToast: showToast,
    });

    updateShareStatus(challan.id, 'user_marked_sent');
    if (!challan.customer_phone?.trim()) {
      updateChallan(challan.id, { customer_phone: targetPhone });
      setChallan({ ...challan, customer_phone: targetPhone });
    }
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challan || !phoneInput.trim() || !profile) {
      showToast('Please enter a phone number', 'error');
      return;
    }
    const cleanNum = phoneInput.trim();
    setShowPhoneModal(false);
    const targetChallan = { ...challan, customer_phone: cleanNum };
    setChallan(targetChallan);

    await shareChallanViaWhatsApp({
      challan: targetChallan,
      phoneOverride: cleanNum,
      items: targetChallan.items || [],
      profile,
      onToast: showToast,
    });

    updateChallan(challan.id, { customer_phone: cleanNum });
    updateShareStatus(challan.id, 'user_marked_sent');
  };

  const handleDuplicate = async () => {
    const dup = await duplicateChallan(challan.id);
    if (dup) {
      showToast(`Duplicated to ${dup.challan_number}`);
      router.push(`/challans/${dup.id}`);
    }
  };

  const handleMarkDelivered = async () => {
    if (!challan || !profile) return;
    const targetPhone = resolveCustomerPhone(challan, customers, liveChallans);
    if (!targetPhone) {
      setPhoneInput('');
      setShowPhoneModal(true);
      return;
    }

    const updated = await updateChallanStatus(challan.id, 'delivered');
    if (updated) {
      setChallan({
        ...challan,
        ...updated,
        status: 'delivered',
        is_delivered: true,
        delivered_at: new Date().toISOString(),
      });
    }
    showToast(`Challan ${challan.challan_number} marked as DELIVERED! 🚚`, 'success');

    // Trigger WhatsApp Delivery Notification
    await shareDeliveryConfirmationViaWhatsApp({
      challan: { ...challan, status: 'delivered', customer_phone: targetPhone },
      profile,
      phoneOverride: targetPhone,
      onToast: showToast,
    });
  };

  const confirmCancel = async () => {
    await updateChallanStatus(challan.id, 'cancelled');
    const refreshed = getChallan(challan.id);
    if (refreshed) setChallan(refreshed);
    setShowCancelModal(false);
    showToast(`Challan ${challan.challan_number} marked as cancelled`);
  };

  const confirmDelete = async () => {
    await deleteChallan(challan.id);
    showToast(`Challan ${challan.challan_number} permanently deleted`, 'success');
    setShowDeleteModal(false);
    router.push('/challans');
  };

  return (
    <div className="space-y-4 pb-20 sm:pb-8 max-w-4xl mx-auto">
      {/* Top Header & Fast Action Bar */}
      <div className="card p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href="/challans"
              className="p-1.5 rounded-lg text-surface-500 hover:text-surface-900 hover:bg-surface-100 transition-colors"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-extrabold text-base sm:text-lg text-primary-600">
                  {challan.challan_number}
                </span>
                {challan.pi_number && (
                  <span className="font-mono font-bold text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200" title="Proforma Invoice ID">
                    PI: {challan.pi_number}
                  </span>
                )}
                {challan.reference_number && (
                  <span className="font-mono font-bold text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200" title="Staff Purchase / Work Order">
                    PO: {challan.reference_number}
                  </span>
                )}
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                    challan.status === 'delivered'
                      ? 'bg-blue-50 text-blue-700 border border-blue-300'
                      : challan.status === 'final'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : challan.status === 'draft'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  )}
                >
                  {challan.status === 'delivered' ? '🚚 Delivered' : challan.status}
                </span>

                {isChallanPaid && (
                  <PaidRubberStamp size="xs" title="PAID" color="emerald" angle={0} />
                )}
              </div>
              <p className="text-[11px] text-surface-500 mt-0.5">
                Date: {formatDateIndian(challan.challan_date)}
                {challan.reference_number && ` • Staff PO: ${challan.reference_number}`}
                {challan.pi_number && ` • PI No: ${challan.pi_number}`}
                {challan.delivered_at && ` • Delivered on: ${formatDateIndian(challan.delivered_at)}`}
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {/* Record Payment Received Button */}
            <button
              onClick={() => {
                setPayAmount(challan.total_amount ? String(challan.total_amount) : '');
                setIsPaymentModalOpen(true);
              }}
              className="btn-primary py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
              title="Record Payment Received against this challan"
            >
              <WalletCards size={14} />
              <span>Payment Received</span>
            </button>

            {/* Goods Return shortcut */}
            <Link
              href="/returns"
              className="btn-secondary py-1.5 px-3 text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              title="Record Goods Return against this challan"
            >
              <RotateCcw size={14} />
              <span>Goods Return</span>
            </Link>

            {/* Mark as Delivered / Re-notify Button */}
            <button
              onClick={handleMarkDelivered}
              className={cn(
                'btn-primary py-1.5 px-3 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap',
                challan.status === 'delivered'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              )}
              title={
                challan.status === 'delivered'
                  ? 'Re-send Delivery Confirmation via WhatsApp'
                  : 'Mark as delivered and send WhatsApp notification'
              }
            >
              <Truck size={14} />
              <span>{challan.status === 'delivered' ? 'Delivery Sent' : 'Mark Delivered'}</span>
            </button>

            <Link
              href={`/challans/${challan.id}/bill`}
              className="btn-primary py-1.5 px-3 bg-[#b8860b] hover:bg-[#a07408] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs whitespace-nowrap"
              title="After-Delivery Bill / Memo slip"
            >
              <Receipt size={14} />
              <span>Bill / Memo</span>
            </Link>

            {(() => {
              const targetPhone = challan ? resolveCustomerPhone(challan, customers, liveChallans) : '';
              const docLabel = viewMode === 'pi' ? 'PI' : 'Challan';
              return (
                <button
                  onClick={() => handleWhatsApp(viewMode === 'pi' ? 'PROFORMA INVOICE' : 'DELIVERY CHALLAN')}
                  className="btn-primary py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
                  title={targetPhone ? `Share ${docLabel} via WhatsApp (${targetPhone})` : `Share ${docLabel} via WhatsApp`}
                >
                  <Send size={14} />
                  <span>WhatsApp ({docLabel})</span>
                </button>
              );
            })()}

            <button
              onClick={() => handlePrint(viewMode === 'pi' ? 'PROFORMA INVOICE' : 'DELIVERY CHALLAN')}
              className="btn-secondary py-1.5 px-3 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
              title={`Print ${viewMode === 'pi' ? 'Proforma Invoice' : 'Delivery Challan'}`}
            >
              <Printer size={14} />
              <span>Print {viewMode === 'pi' ? 'PI' : 'Challan'}</span>
            </button>

            {/* Print Without Rate Option */}
            <button
              onClick={handlePrintWithoutRate}
              className="btn-secondary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 shadow-2xs"
              title="Print Delivery Slip without Rate or Prices (Item, Brand, Quantity & Unit only)"
            >
              <Printer size={14} className="text-amber-700" />
              <span>Print (No Rate)</span>
            </button>

            <button
              onClick={() => handleDownload(viewMode === 'pi' ? 'PROFORMA INVOICE' : 'DELIVERY CHALLAN')}
              className="btn-secondary py-1.5 px-3 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
              title={`Download ${viewMode === 'pi' ? 'Proforma Invoice' : 'Delivery Challan'} PDF`}
            >
              <Download size={14} />
              <span>PDF ({viewMode === 'pi' ? 'PI' : 'Challan'})</span>
            </button>

            {canEdit ? (
              <Link
                href={`/challans/${challan.id}/edit`}
                className="btn-secondary py-1.5 px-3 text-xs font-medium flex items-center gap-1.5"
              >
                <Edit size={14} />
                <span>Edit</span>
              </Link>
            ) : (
              <span
                className="py-1.5 px-3 text-xs font-medium flex items-center gap-1.5 text-surface-400 bg-surface-100 rounded-lg cursor-not-allowed border border-surface-200 select-none"
                title="Approved records are locked. Only an Administrator can edit."
              >
                <Lock size={13} />
                <span>Locked</span>
              </span>
            )}

            <button
              onClick={handleDuplicate}
              className="btn-secondary py-1.5 px-2.5 text-xs font-medium text-surface-600"
              title="Duplicate"
            >
              <Copy size={14} />
            </button>

            {(!isEmp || !isApproved) && challan.status !== 'cancelled' && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="btn-ghost py-1.5 px-2 text-xs font-medium text-amber-600 hover:bg-amber-50"
                title="Cancel Challan"
              >
                <Ban size={14} />
              </button>
            )}

            {!isEmp && (
              <button
                onClick={() => setShowDeleteModal(true)}
                className="btn-ghost py-1.5 px-2 text-xs font-medium text-rose-600 hover:bg-rose-50"
                title="Delete Challan Permanently"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Format Toggle Tabs */}
      <div className="flex items-center gap-2 border-b border-surface-200 pb-2 flex-wrap">
        <button
          onClick={() => {
            setViewMode('challan');
            setActiveDocType('DELIVERY CHALLAN');
          }}
          className={cn(
            'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer',
            viewMode === 'challan'
              ? 'bg-surface-900 text-white shadow-xs'
              : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
          )}
        >
          <FileText size={14} />
          <span>Delivery Challan (A4)</span>
        </button>

        <button
          onClick={() => {
            setViewMode('pi');
            setActiveDocType('PROFORMA INVOICE');
          }}
          className={cn(
            'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer',
            viewMode === 'pi'
              ? 'bg-[#2B5EA7] text-white shadow-xs'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
          )}
        >
          <FileText size={14} />
          <span>Proforma Invoice PI (A4)</span>
        </button>

        <button
          onClick={() => setViewMode('bill')}
          className={cn(
            'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer',
            viewMode === 'bill'
              ? 'bg-[#b8860b] text-white shadow-xs'
              : 'bg-[#b8860b]/10 text-[#b8860b] hover:bg-[#b8860b]/20 border border-[#b8860b]/30'
          )}
        >
          <Receipt size={14} />
          <span>After-Delivery Bill (Showhouse Slip)</span>
          <span className="text-[9px] bg-white text-[#b8860b] px-1.5 py-0.2 rounded-full font-extrabold uppercase">
            Shop Format
          </span>
        </button>
      </div>

      {/* Delivery Tracking & Confirmation Action Box */}
      <div className="card p-3.5 bg-gradient-to-r from-surface-50 to-emerald-50/30 border border-surface-200 text-xs space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-zinc-900 select-none">
              <input
                type="checkbox"
                checked={challan.status === 'delivered' || challan.is_delivered}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  handleUpdateDeliveryStatus(isChecked ? 'delivered' : 'pending', isChecked);
                }}
                className="w-4 h-4 rounded text-primary-600 focus:ring-primary-400 cursor-pointer"
              />
              <span className="text-xs">Mark as Delivered</span>
            </label>

            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-semibold">Status:</span>
              <select
                value={challan.status}
                onChange={(e) => handleUpdateDeliveryStatus(e.target.value as ChallanStatus)}
                className="px-2.5 py-1 rounded-md bg-white border border-surface-300 text-xs font-bold text-zinc-800 shadow-2xs cursor-pointer"
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
          </div>

          {/* Delivery Confirmation Audit Record */}
          {challan.delivered_at && (
            <div className="text-[11px] text-zinc-700 bg-white px-2.5 py-1 rounded-lg border border-surface-200 flex items-center gap-1.5 shadow-2xs">
              <CheckCircle2 size={13} className="text-emerald-600" />
              <span>
                Delivered: <strong>{formatDateIndian(challan.delivered_at)}</strong>
                {challan.delivery_confirmed_by && ` • Verified by ${challan.delivery_confirmed_by}`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Conditionally render the selected view */}
      {viewMode === 'bill' ? (
        <div className="printable-delivery-bill">
          <DeliveryMemoBill challan={challan} profile={profile} />
        </div>
      ) : (
        <div className="card p-4 sm:p-8 bg-white shadow-xs border border-surface-200 printable-challan relative">
          {/* Compact Transparent Rubber Stamp: PAID */}
          {isChallanPaid && (
            <div className="absolute top-4 right-6 sm:top-5 sm:right-10 pointer-events-none select-none z-10 print:top-3 print:right-6">
              <PaidRubberStamp
                size="md"
                title="PAID"
                subtitle="SHOWHOUSE"
                date={challan.paid_at ? formatDateIndian(challan.paid_at) : formatDateIndian(challan.challan_date)}
                amount={challan.total_amount ?? undefined}
                refNo={challan.challan_number}
                color="emerald"
                angle={-6}
              />
            </div>
          )}
        {/* Business Header */}
        <div className="border-b-2 border-primary-500 pb-4 mb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-surface-900 tracking-tight">
                {profile?.business_name || 'SHOWHOUSE'}
              </h2>
              <p className="text-[11px] font-semibold text-primary-600 tracking-wider uppercase mt-0.5">
                {profile?.tagline || 'Premium Laminates & Decorative Surfaces'}
              </p>
              {profile?.address && (
                <p className="text-xs text-surface-500 mt-1 whitespace-pre-line leading-relaxed max-w-sm">
                  {profile.address}
                </p>
              )}
            </div>

            <div className="text-left sm:text-right text-xs text-surface-600 space-y-0.5">
              {profile?.gstin && (
                <div>
                  <span className="text-surface-400">GSTIN: </span>
                  <span className="font-mono font-semibold text-surface-800">{profile.gstin}</span>
                </div>
              )}
              {profile?.phone && (
                <div>
                  <span className="text-surface-400">Phone: </span>
                  <span className="font-medium text-surface-800">{formatPhone(profile.phone)}</span>
                </div>
              )}
              {profile?.email && (
                <div>
                  <span className="text-surface-400">Email: </span>
                  <span>{profile.email}</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 text-center">
            <span
              className={cn(
                'inline-block font-bold text-[11px] uppercase tracking-widest px-3 py-0.5 rounded',
                viewMode === 'pi'
                  ? 'bg-[#2B5EA7] text-white'
                  : 'bg-surface-900 text-white'
              )}
            >
              {viewMode === 'pi' ? 'Proforma Invoice' : 'Delivery Challan'}
            </span>
          </div>
        </div>

        {/* Challan / PI & Consignee Meta */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4 border-b border-surface-200 text-xs">
          {/* Document & PO Info */}
          <div className="bg-surface-50 p-3 rounded-lg border border-surface-100 space-y-1.5">
            {viewMode === 'pi' ? (
              <>
                <div className="flex justify-between">
                  <span className="text-surface-500">PI No (Invoice ID):</span>
                  <span className="font-mono font-bold text-blue-700">
                    {challan.pi_number || challan.challan_number.replace(/^SH\//, 'PI/')}
                  </span>
                </div>
                {challan.challan_number && (
                  <div className="flex justify-between">
                    <span className="text-surface-500">Challan Ref:</span>
                    <span className="font-mono font-medium text-surface-800">{challan.challan_number}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-surface-500">Challan No:</span>
                  <span className="font-mono font-bold text-surface-900">{challan.challan_number}</span>
                </div>
                {challan.pi_number && (
                  <div className="flex justify-between">
                    <span className="text-surface-500">PI Ref (Invoice ID):</span>
                    <span className="font-mono font-medium text-blue-700">{challan.pi_number}</span>
                  </div>
                )}
              </>
            )}

            {challan.reference_number && (
              <div className="flex justify-between">
                <span className="text-surface-500">Staff PO #:</span>
                <span className="font-mono font-bold text-amber-700">{challan.reference_number}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-surface-500">Date:</span>
              <span className="font-medium text-surface-800">{formatDateIndian(challan.challan_date)}</span>
            </div>
          </div>

          {/* Consignee Info */}
          <div className="bg-surface-50 p-3 rounded-lg border border-surface-100 space-y-1">
            <span className="text-[10px] text-surface-400 font-semibold uppercase tracking-wider block">
              Consignee / Deliver To:
            </span>
            <div className="font-bold text-surface-900 text-sm">
              {challan.customer_name}
            </div>
            {challan.customer_phone && (
              <div className="text-surface-600 flex items-center gap-1 text-[11px]">
                <Phone size={12} className="text-surface-400" />
                <span>{formatPhone(challan.customer_phone)}</span>
              </div>
            )}
            {(challan.delivery_address || challan.customer_address) && (
              <div className="text-surface-600 flex items-start gap-1 text-[11px] pt-0.5">
                <MapPin size={12} className="text-surface-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{challan.delivery_address || challan.customer_address}</span>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Items View (Zero Horizontal Overflow) */}
        <div className="sm:hidden py-3 space-y-2">
          {challan.items?.map((item, idx) => {
            const lineRate = item.rate ? Number(item.rate) : null;
            const lineAmt = item.amount ? Number(item.amount) : (lineRate ? lineRate * item.quantity : null);
            return (
              <div key={idx} className="p-2.5 rounded-lg border border-surface-100 bg-surface-50/50 flex justify-between items-start text-xs">
                <div>
                  <span className="font-bold text-surface-900 block">{item.item_description}</span>
                  <span className="text-[11px] text-surface-500 block mt-0.5">
                    {[item.brand, item.colour_finish, item.size].filter(Boolean).join(' · ')}
                  </span>
                  {lineRate && (
                    <span className="text-[10px] text-surface-500 block font-mono mt-0.5">
                      Rate: ₹{lineRate.toLocaleString('en-IN')} / {item.unit}
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0 pl-2">
                  <span className="font-bold text-surface-900 text-sm block">
                    {item.quantity} {item.unit}
                  </span>
                  {lineAmt && (
                    <span className="text-xs text-primary-600 font-bold block font-mono mt-0.5">
                      ₹{lineAmt.toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Mobile Additional Charges & GST */}
          {transportCharges > 0 && (
            <div className="p-2.5 rounded-lg border border-surface-200 bg-surface-50/80 flex justify-between items-center text-xs">
              <span className="font-medium text-surface-700">Transportation / Cartage</span>
              <span className="font-mono font-bold text-surface-900">+ ₹{transportCharges.toLocaleString('en-IN')}</span>
            </div>
          )}

          {loadingCharges > 0 && (
            <div className="p-2.5 rounded-lg border border-surface-200 bg-surface-50/80 flex justify-between items-center text-xs">
              <span className="font-medium text-surface-700">Loading / Unloading Charges</span>
              <span className="font-mono font-bold text-surface-900">+ ₹{loadingCharges.toLocaleString('en-IN')}</span>
            </div>
          )}

          {(applyGst || applyAdditional9) && (
            <div className="p-2.5 rounded-lg border border-surface-200 bg-surface-50 text-xs space-y-1 font-mono">
              <div className="flex justify-between text-surface-600">
                <span>Taxable Subtotal:</span>
                <span>₹{taxableSubtotal.toLocaleString('en-IN')}</span>
              </div>
              {applyGst && (
                <>
                  <div className="flex justify-between text-emerald-800 font-medium">
                    <span>CGST (9%):</span>
                    <span>+ ₹{cgstAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-emerald-800 font-medium">
                    <span>SGST (9%):</span>
                    <span>+ ₹{sgstAmount.toLocaleString('en-IN')}</span>
                  </div>
                </>
              )}
              {applyAdditional9 && (
                <div className="flex justify-between text-amber-800 font-medium">
                  <span>Additional 9% Tax:</span>
                  <span>+ ₹{additional9Amount.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop / Print Items Table */}
        <div className="hidden sm:block py-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-surface-200 text-surface-500 uppercase font-semibold">
                <th className="py-2 px-2 text-left w-10">#</th>
                <th className="py-2 px-2 text-left">Item Description</th>
                <th className="py-2 px-2 text-left">Brand / Spec</th>
                <th className="py-2 px-2 text-right">Quantity</th>
                <th className="py-2 px-2 text-left">Unit</th>
                {totalAmount > 0 && <th className="py-2 px-2 text-right">Rate (₹)</th>}
                {totalAmount > 0 && <th className="py-2 px-2 text-right">Amount (₹)</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {challan.items?.map((item, idx) => {
                const lineRate = item.rate ? Number(item.rate) : null;
                const lineAmt = item.amount ? Number(item.amount) : (lineRate ? lineRate * item.quantity : null);
                return (
                  <tr key={idx} className="hover:bg-surface-50/50">
                    <td className="py-2 px-2 text-surface-400 font-mono">{idx + 1}</td>
                    <td className="py-2 px-2 font-semibold text-surface-900">{item.item_description}</td>
                    <td className="py-2 px-2 text-surface-600">
                      {[item.brand, item.colour_finish, item.size].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-surface-900">{item.quantity}</td>
                    <td className="py-2 px-2 text-surface-500 capitalize">{item.unit}</td>
                    {totalAmount > 0 && (
                      <td className="py-2 px-2 text-right text-surface-600 font-mono">
                        {lineRate ? formatINR(lineRate) : '—'}
                      </td>
                    )}
                    {totalAmount > 0 && (
                      <td className="py-2 px-2 text-right font-semibold text-surface-900 font-mono">
                        {lineAmt ? formatINR(lineAmt) : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}

              {/* Transportation Charges row */}
              {transportCharges > 0 && (
                <tr className="bg-surface-50/50 font-medium">
                  <td className="py-2 px-2 text-surface-400 font-mono">•</td>
                  <td className="py-2 px-2 text-surface-800 italic" colSpan={2}>
                    Transportation / Cartage Charges
                  </td>
                  <td className="py-2 px-2 text-right text-surface-400">—</td>
                  <td className="py-2 px-2 text-surface-400">—</td>
                  {totalAmount > 0 && <td className="py-2 px-2 text-right text-surface-400">—</td>}
                  {totalAmount > 0 && (
                    <td className="py-2 px-2 text-right font-semibold text-surface-900 font-mono">
                      {formatINR(transportCharges)}
                    </td>
                  )}
                </tr>
              )}

              {/* Loading / Unloading Charges row */}
              {loadingCharges > 0 && (
                <tr className="bg-surface-50/50 font-medium">
                  <td className="py-2 px-2 text-surface-400 font-mono">•</td>
                  <td className="py-2 px-2 text-surface-800 italic" colSpan={2}>
                    Loading / Unloading Charges
                  </td>
                  <td className="py-2 px-2 text-right text-surface-400">—</td>
                  <td className="py-2 px-2 text-surface-400">—</td>
                  {totalAmount > 0 && <td className="py-2 px-2 text-right text-surface-400">—</td>}
                  {totalAmount > 0 && (
                    <td className="py-2 px-2 text-right font-semibold text-surface-900 font-mono">
                      {formatINR(loadingCharges)}
                    </td>
                  )}
                </tr>
              )}

              {/* Subtotal, GST & Additional 9% rows */}
              {(applyGst || applyAdditional9) && (
                <>
                  <tr className="border-t border-surface-200 bg-surface-50/70 font-semibold text-surface-700">
                    <td className="py-1.5 px-2 font-mono">•</td>
                    <td className="py-1.5 px-2 uppercase text-[11px]" colSpan={4}>
                      Taxable Subtotal
                    </td>
                    <td className="py-1.5 px-2 text-right text-surface-400">—</td>
                    <td className="py-1.5 px-2 text-right font-mono font-bold text-surface-900">
                      {formatINR(taxableSubtotal)}
                    </td>
                  </tr>
                  {applyGst && (
                    <>
                      <tr className="bg-emerald-50/30 text-emerald-800 font-medium">
                        <td className="py-1.5 px-2 font-mono text-emerald-600">•</td>
                        <td className="py-1.5 px-2" colSpan={2}>CGST (9%)</td>
                        <td className="py-1.5 px-2 text-right font-mono">9%</td>
                        <td className="py-1.5 px-2">—</td>
                        <td className="py-1.5 px-2 text-right text-surface-400">—</td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-800">
                          {formatINR(cgstAmount)}
                        </td>
                      </tr>
                      <tr className="bg-emerald-50/30 text-emerald-800 font-medium">
                        <td className="py-1.5 px-2 font-mono text-emerald-600">•</td>
                        <td className="py-1.5 px-2" colSpan={2}>SGST (9%)</td>
                        <td className="py-1.5 px-2 text-right font-mono">9%</td>
                        <td className="py-1.5 px-2">—</td>
                        <td className="py-1.5 px-2 text-right text-surface-400">—</td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-800">
                          {formatINR(sgstAmount)}
                        </td>
                      </tr>
                    </>
                  )}
                  {applyAdditional9 && (
                    <tr className="bg-amber-50/40 text-amber-900 font-medium">
                      <td className="py-1.5 px-2 font-mono text-amber-600">•</td>
                      <td className="py-1.5 px-2" colSpan={2}>Additional Tax (9%)</td>
                      <td className="py-1.5 px-2 text-right font-mono">9%</td>
                      <td className="py-1.5 px-2">—</td>
                      <td className="py-1.5 px-2 text-right text-surface-400">—</td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-amber-900">
                        {formatINR(additional9Amount)}
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Total Summary Row */}
        <div className="py-3 px-3.5 bg-surface-50 rounded-lg border border-surface-200 flex items-center justify-between mt-2">
          <div>
            <span className="font-bold text-xs uppercase tracking-wider text-surface-700 block">
              Total Quantity
            </span>
            <span className="font-extrabold text-base text-surface-900">
              {challan.total_quantity} <span className="text-xs font-normal text-surface-500">{challan.items?.[0]?.unit || 'sheets'}</span>
            </span>
          </div>
          {totalAmount > 0 && (
            <div className="text-right">
              <span className="font-bold text-xs uppercase tracking-wider text-surface-700 block">
                {applyGst ? 'Grand Total (Inc. 18% GST)' : 'Total Amount'}
              </span>
              <span className="font-mono font-extrabold text-lg text-primary-600">
                ₹{totalAmount.toLocaleString('en-IN')}
              </span>
            </div>
          )}
        </div>

        {totalAmount > 0 && (
          <div className="py-2 px-3 text-xs text-surface-600 mt-2">
            <span className="font-semibold text-surface-700">Amount in Words: </span>
            <span className="italic">{amountToWords(totalAmount)}</span>
          </div>
        )}

        {/* Terms & Signatures */}
        <div className="pt-6 mt-4 border-t border-surface-200 text-xs space-y-6">
          <div>
            <span className="text-[10px] font-bold text-surface-600 uppercase tracking-wider block mb-1">
              Terms & Conditions
            </span>
            <p className="text-[11px] text-surface-500 leading-relaxed">
              1. Goods received in good condition. 2. Discrepancies must be reported within 24 hours. 3. Non-tax delivery document.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-6">
            <div className="border-t border-dashed border-surface-300 pt-2 text-center text-xs">
              <span className="font-semibold text-surface-700 block">Receiver&apos;s Signature</span>
              <span className="text-[10px] text-surface-400 block mt-0.5">Goods Received</span>
            </div>
            <div className="border-t border-dashed border-surface-300 pt-2 text-center text-xs">
              <span className="font-semibold text-surface-700 block">
                For {profile?.business_name || 'SHOWHOUSE'}
              </span>
              <span className="text-[10px] text-surface-400 block mt-0.5">Authorized Signatory</span>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showCancelModal}
        title="Cancel Challan?"
        message={`Are you sure you want to mark challan ${challan.challan_number} as cancelled?`}
        variant="warning"
        confirmLabel="Yes, Cancel"
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelModal(false)}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteModal}
        title="Delete Challan Permanently?"
        message={`Are you sure you want to permanently delete challan ${challan.challan_number}? This cannot be undone and will delete it from all databases.`}
        variant="danger"
        confirmLabel="Yes, Delete Permanently"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteModal(false)}
      />

      {/* Customer WhatsApp Phone Prompt Modal */}
      {showPhoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full border border-surface-200 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Send size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-surface-900">Share on WhatsApp</h3>
                <p className="text-xs text-surface-500">Customer: {challan.customer_name}</p>
              </div>
            </div>

            <form onSubmit={handlePhoneSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-surface-700 block mb-1">
                  Customer WhatsApp Number *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 font-mono text-xs">
                    +91
                  </span>
                  <input
                    type="tel"
                    autoFocus
                    placeholder="Enter 10-digit mobile number"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="input pl-11 text-sm font-mono"
                  />
                </div>
                <p className="text-[11px] text-surface-400 mt-1">
                  The PDF will auto-download and WhatsApp chat will open with the customer.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowPhoneModal(false)}
                  className="btn-secondary text-xs py-2 px-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <Send size={13} />
                  <span>Share Now</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Received Modal */}
      {isPaymentModalOpen && challan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-surface-200 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-surface-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                  <WalletCards size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-900">Record Payment Received</h3>
                  <p className="text-[11px] text-zinc-500">Challan: {challan.challan_number}</p>
                </div>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1 text-surface-400 hover:text-surface-700 rounded-md"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="py-4 space-y-3.5">
              <div className="p-3 bg-surface-50 rounded-xl border border-surface-200">
                <span className="text-[10px] text-zinc-400 font-semibold uppercase block">Customer / Party</span>
                <span className="font-bold text-zinc-900 text-sm block">{challan.customer_name}</span>
                {challan.site_name && (
                  <span className="text-[11px] text-zinc-500 block mt-0.5">Site: {challan.site_name}</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-700">Amount Received (₹) *</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="e.g. 25000"
                    className="input text-xs font-bold text-emerald-600 w-full"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-700">Payment Mode</label>
                  <select
                    value={payMode}
                    onChange={(e) => setPayMode(e.target.value as PaymentMode)}
                    className="input text-xs font-medium w-full"
                  >
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer (NEFT)</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-700">Payment Date</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="input text-xs font-medium w-full"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-700">Ref / UTR / Cheque #</label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="e.g. UTR12345"
                    className="input text-xs font-mono w-full"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-700">Notes / Remarks</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="e.g. Received via PhonePe"
                  className="input text-xs font-medium w-full"
                />
              </div>

              <div className="pt-3 border-t border-surface-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="btn-secondary py-1.5 px-3 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recordingPay}
                  className="btn-primary py-1.5 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                >
                  {recordingPay ? 'Recording...' : 'Record Payment & Credit Ledger'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
