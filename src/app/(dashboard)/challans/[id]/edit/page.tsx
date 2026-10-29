'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  X,
  Search,
  ChevronDown,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UNIT_OPTIONS } from '@/lib/validations';
import { ChallanItemFormData, UnitType, Customer, Product } from '@/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { resolveCustomerPhone } from '@/lib/whatsapp';

const emptyItem = (): ChallanItemFormData => ({
  product_id: '',
  item_description: '',
  brand: '',
  colour_finish: '',
  size: '',
  unit: 'sheets',
  quantity: '',
  rate: '',
  amount: '',
  length: '',
  width: '',
  dimension_unit: 'ft',
  calculated_sqft: '',
});

export default function EditChallanPage() {
  const params = useParams();
  const router = useRouter();
  const challanId = params.id as string;

  const {
    getChallan,
    updateChallan,
    customers,
    products,
    profile,
    showToast,
    isLoading,
    getNextStaffPONumber,
    challans: liveChallans,
  } = useApp();

  const [mounted, setMounted] = useState(false);
  const [challanLoaded, setChallanLoaded] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [challanNumber, setChallanNumber] = useState('');
  const [piNumber, setPiNumber] = useState('');

  // Form state
  const [challanDate, setChallanDate] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [showExtraDetails, setShowExtraDetails] = useState(false);

  const [items, setItems] = useState<ChallanItemFormData[]>([emptyItem()]);

  // Additional Charges & GST
  const [transportCharges, setTransportCharges] = useState('');
  const [loadingCharges, setLoadingCharges] = useState('');
  const [applyGst, setApplyGst] = useState(false);
  const [applyAdditional9, setApplyAdditional9] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeProductRow, setActiveProductRow] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const employeeList: string[] = useMemo(() => {
    const list: string[] =
      profile?.employees && profile.employees.length > 0
        ? profile.employees
        : ['Neal', 'Vrushank'];
    if (createdBy && !list.includes(createdBy)) {
      return [...list, createdBy];
    }
    return list;
  }, [profile?.employees, createdBy]);

  const populateChallan = (c: any) => {
    setChallanNumber(c.challan_number);
    setPiNumber(c.pi_number || c.challan_number?.replace(/^SH\//, 'PI/') || '');
    setChallanDate(c.challan_date);
    setSelectedCustomerId(c.customer_id || '');
    setCustomerName(c.customer_name);
    const resolved = c.customer_phone || resolveCustomerPhone(c, customers, liveChallans);
    setCustomerPhone(resolved || '');
    setDeliveryAddress(c.delivery_address || c.customer_address || '');
    setReferenceNumber(c.reference_number || '');
    setCreatedBy(c.created_by || c.prepared_by || (profile?.employees && profile.employees[0]) || 'Neal');
    setTransportCharges(c.transportation_charges ? String(c.transportation_charges) : '');
    setLoadingCharges(c.loading_charges ? String(c.loading_charges) : '');
    setApplyGst(Boolean(c.apply_gst));
    setApplyAdditional9(Boolean(c.apply_additional_9));

    if (c.customer_phone || c.delivery_address || c.reference_number || c.transportation_charges || c.loading_charges || c.apply_gst || c.apply_additional_9 || c.created_by) {
      setShowExtraDetails(true);
    }

    if (c.items && c.items.length > 0) {
      setItems(
        c.items.map((it: any) => ({
          product_id: it.product_id || '',
          item_description: it.item_description,
          brand: it.brand || '',
          colour_finish: it.colour_finish || '',
          size: it.size || '',
          unit: it.unit,
          quantity: it.quantity,
          rate: it.rate ? String(it.rate) : '',
          amount: it.amount ? String(it.amount) : '',
          length: it.length ? String(it.length) : '',
          width: it.width ? String(it.width) : '',
          dimension_unit: it.dimension_unit || 'ft',
          calculated_sqft: it.calculated_sqft ? String(it.calculated_sqft) : '',
        }))
      );
    }
    setChallanLoaded(true);
    setPageLoading(false);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadChallan() {
      // 1. Local check
      const local = getChallan(challanId);
      if (local) {
        if (!isCancelled) {
          populateChallan(local);
        }
        return;
      }

      // 2. Direct Firestore fallback
      try {
        const { fetchSingleChallanFromFirebase } = await import('@/lib/firebase-service');
        const remote = await fetchSingleChallanFromFirebase(challanId);
        if (remote && !isCancelled) {
          const { syncFromFirebase } = await import('@/lib/demo-store');
          syncFromFirebase([remote]);
          populateChallan(remote);
          return;
        }
      } catch (err) {
        console.warn('Edit page direct Firestore fetch note:', err);
      }

      // 3. Server API fallback
      try {
        const res = await fetch(`/api/challans?id=${encodeURIComponent(challanId)}`, {
          credentials: 'same-origin',
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.challan && !isCancelled) {
            const { syncFromFirebase } = await import('@/lib/demo-store');
            syncFromFirebase([json.challan]);
            populateChallan(json.challan);
            return;
          }
        }
      } catch (err) {
        console.warn('Edit page server API fetch note:', err);
      }

      if (!isCancelled) {
        setPageLoading(false);
      }
    }

    if (mounted && challanId) {
      loadChallan();
    }

    return () => {
      isCancelled = true;
    };
  }, [mounted, challanId, getChallan]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 6);
    const q = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        c.business_name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
    ).slice(0, 8);
  }, [customers, customerSearch]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 6);
    const q = productSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.colour_design && p.colour_design.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [products, productSearch]);

  const selectCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setCustomerName(c.business_name);
    setCustomerPhone(c.phone || '');
    setDeliveryAddress(c.delivery_address || c.billing_address || '');
    setShowCustomerDropdown(false);
    setCustomerSearch('');
  };

  const selectProduct = (index: number, p: Product) => {
    const newItems = [...items];
    const rateVal = p.default_rate ?? p.rate;
    newItems[index] = {
      ...newItems[index],
      product_id: p.id,
      item_description: p.name,
      brand: p.brand || '',
      colour_finish: p.colour_design || p.colour_finish || '',
      size: p.size_thickness || p.size || '',
      unit: p.unit,
      rate: rateVal ? String(rateVal) : '',
    };
    if (newItems[index].quantity && rateVal) {
      newItems[index].amount = String(Number(newItems[index].quantity) * rateVal);
    }
    setItems(newItems);
    setActiveProductRow(null);
    setProductSearch('');
  };

  const addItem = () => {
    setItems([...items, emptyItem()]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ChallanItemFormData, value: string) => {
    const newItems = [...items];
    const it = {
      ...newItems[index],
      [field]: value,
    };

    const qty = Number(it.quantity) || 0;
    const rate = it.rate ? Number(it.rate) : 0;
    const len = Number(it.length) || 0;
    const wid = Number(it.width) || 0;
    const dimUnit = it.dimension_unit || 'ft';

    // Dimension calculation for sq.ft & running ft
    if (it.unit === 'sq.ft' && len > 0 && wid > 0) {
      const sqftPerPc = dimUnit === 'in' ? (len * wid) / 144 : len * wid;
      const totalSqft = Math.round(qty * sqftPerPc * 100) / 100;
      it.calculated_sqft = String(totalSqft);
      if (rate > 0) {
        it.amount = String(Math.round(totalSqft * rate));
      } else {
        it.amount = '';
      }
    } else if (it.unit === 'running ft' && len > 0) {
      const totalRft = Math.round(qty * len * 100) / 100;
      it.calculated_sqft = String(totalRft);
      if (rate > 0) {
        it.amount = String(Math.round(totalRft * rate));
      } else {
        it.amount = '';
      }
    } else {
      it.calculated_sqft = '';
      if (rate > 0 && qty > 0) {
        it.amount = String(Math.round(qty * rate * 100) / 100);
      } else {
        it.amount = '';
      }
    }

    newItems[index] = it;
    setItems(newItems);
  };

  const totalQuantity = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }, [items]);

  const itemsSubtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [items]);

  const transport = useMemo(() => Number(transportCharges) || 0, [transportCharges]);
  const loading = useMemo(() => Number(loadingCharges) || 0, [loadingCharges]);

  const taxableSubtotal = useMemo(() => {
    return itemsSubtotal + transport + loading;
  }, [itemsSubtotal, transport, loading]);

  const cgstAmount = useMemo(() => {
    return applyGst && taxableSubtotal > 0
      ? Math.round(taxableSubtotal * 0.09 * 100) / 100
      : 0;
  }, [applyGst, taxableSubtotal]);

  const sgstAmount = useMemo(() => {
    return applyGst && taxableSubtotal > 0
      ? Math.round(taxableSubtotal * 0.09 * 100) / 100
      : 0;
  }, [applyGst, taxableSubtotal]);

  const additional9Amount = useMemo(() => {
    return applyAdditional9 && taxableSubtotal > 0
      ? Math.round(taxableSubtotal * 0.09 * 100) / 100
      : 0;
  }, [applyAdditional9, taxableSubtotal]);

  const totalAmount = useMemo(() => {
    if (taxableSubtotal <= 0) return 0;
    return taxableSubtotal + cgstAmount + sgstAmount + additional9Amount;
  }, [taxableSubtotal, cgstAmount, sgstAmount, additional9Amount]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!customerName.trim()) errs.customer = 'Customer name is required';
    if (!challanDate) errs.date = 'Date is required';

    const hasValidItem = items.some(
      (item) => item.item_description.trim() && Number(item.quantity) > 0
    );
    if (!hasValidItem) errs.items = 'Add at least one item description and quantity';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      showToast('Please fix the errors in the form', 'error');
      return;
    }

    setSaving(true);
    try {
      const validItems = items.filter(
        (it) => it.item_description.trim() && Number(it.quantity) > 0
      );

      let finalPhone = customerPhone.trim();
      if (!finalPhone && customerName.trim()) {
        finalPhone = resolveCustomerPhone(
          { customer_id: selectedCustomerId, customer_name: customerName.trim(), customer_phone: '' } as any,
          customers,
          liveChallans
        );
      }

      const updated = await updateChallan(
        challanId,
        {
          challan_date: challanDate,
          pi_number: piNumber.trim() || undefined,
          customer_id: selectedCustomerId || undefined,
          customer_name: customerName.trim(),
          customer_phone: finalPhone,
          customer_address: deliveryAddress.trim(),
          delivery_address: deliveryAddress.trim(),
          reference_number: referenceNumber.trim(),
          prepared_by: createdBy.trim() || employeeList[0] || 'Neal',
          created_by: createdBy.trim() || employeeList[0] || 'Neal',
          total_quantity: totalQuantity,
          transportation_charges: transport > 0 ? transport : null,
          loading_charges: loading > 0 ? loading : null,
          apply_gst: applyGst,
          cgst_amount: cgstAmount > 0 ? cgstAmount : null,
          sgst_amount: sgstAmount > 0 ? sgstAmount : null,
          apply_additional_9: applyAdditional9,
          additional_9_amount: additional9Amount > 0 ? additional9Amount : null,
          subtotal_amount: taxableSubtotal > 0 ? taxableSubtotal : null,
          total_amount: totalAmount > 0 ? totalAmount : null,
        },
        validItems.map((it) => {
          let derivedSize = it.size || undefined;
          if (!derivedSize && it.length) {
            derivedSize = it.width
              ? `${it.length}×${it.width} ${it.dimension_unit || 'ft'}`
              : `${it.length} ${it.dimension_unit || 'ft'}`;
          }
          return {
            product_id: it.product_id || undefined,
            item_description: it.item_description.trim(),
            brand: it.brand || undefined,
            colour_finish: it.colour_finish || undefined,
            size: derivedSize,
            unit: it.unit,
            quantity: Number(it.quantity) || 0,
            rate: it.rate ? Number(it.rate) : null,
            amount: it.amount ? Number(it.amount) : null,
            length: it.length ? Number(it.length) : null,
            width: it.width ? Number(it.width) : null,
            dimension_unit: it.dimension_unit || 'ft',
            calculated_sqft: it.calculated_sqft ? Number(it.calculated_sqft) : null,
          };
        })
      );

      if (updated) {
        showToast(`Challan ${challanNumber} updated`);
        router.push(`/challans/${challanId}`);
      } else {
        showToast('Failed to update challan', 'error');
      }
    } catch {
      showToast('Error saving changes', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || isLoading || (pageLoading && !challanLoaded)) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-xs text-surface-500">Loading challan details...</p>
      </div>
    );
  }

  if (!challanLoaded) {
    return (
      <div className="card p-8 sm:p-12 text-center max-w-lg mx-auto">
        <AlertCircle size={36} className="mx-auto text-surface-400 mb-2" />
        <h2 className="text-lg font-bold text-surface-900 mb-1">Challan Not Found</h2>
        <p className="text-xs text-surface-500 mb-4">Cannot edit a non-existent challan.</p>
        <Link href="/challans" className="btn-secondary text-xs py-2 px-3.5 inline-flex items-center gap-1.5">
          <ArrowLeft size={15} />
          Back to Challans
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28 sm:pb-16 max-w-4xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2 border-b border-surface-200">
        <div className="flex items-center gap-2">
          <Link
            href={`/challans/${challanId}`}
            className="p-1.5 rounded-lg text-surface-500 hover:text-surface-900 hover:bg-surface-100 transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-surface-900 tracking-tight">
              Edit Challan: <span className="font-mono text-primary-600">{challanNumber}</span>
            </h1>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCancel(true)}
            className="btn-secondary text-xs py-2 px-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-xs py-2 px-4 font-semibold"
          >
            <Save size={14} />
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Customer & Date */}
      <div className="card p-3.5 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6 relative">
            <label className="label text-xs">Customer Name *</label>
            <div className="relative">
              <input
                type="text"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setCustomerSearch(e.target.value);
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                placeholder="Type customer or contractor name..."
                className={cn('input text-sm font-medium', errors.customer && 'input-error')}
              />
            </div>

            {showCustomerDropdown && filteredCustomers.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-surface-200 z-30 max-h-52 overflow-y-auto">
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCustomer(c)}
                    className="w-full text-left px-3.5 py-2 hover:bg-surface-50 border-b border-surface-100 last:border-0 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-xs text-surface-900">{c.business_name}</div>
                      {c.phone && <div className="text-[11px] text-surface-400">{c.phone}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {errors.customer && <p className="error-text text-xs mt-1">{errors.customer}</p>}
          </div>

          <div className="sm:col-span-3">
            <label className="label text-xs">Date *</label>
            <input
              type="date"
              value={challanDate}
              onChange={(e) => setChallanDate(e.target.value)}
              className="input text-xs"
            />
          </div>

          {/* Billed By / Created By Dropdown */}
          <div className="sm:col-span-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-surface-700">Billed / Created By</label>
              <Link
                href="/settings"
                className="text-[11px] text-primary-600 hover:text-primary-700 font-medium hover:underline"
                title="Configure employees in settings"
              >
                Settings ↗
              </Link>
            </div>
            <select
              value={createdBy}
              onChange={(e) => {
                const newC = e.target.value;
                setCreatedBy(newC);
                if (!referenceNumber) {
                  try {
                    const next = getNextStaffPONumber(newC);
                    setReferenceNumber(next);
                  } catch {}
                }
              }}
              className="input text-xs font-semibold text-surface-900 bg-white cursor-pointer h-9 w-full"
            >
              {employeeList.map((emp) => (
                <option key={emp} value={emp}>
                  {emp}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Document Series & Staff PO Auto-Sequence Bar */}
        <div className="bg-gradient-to-r from-surface-50 to-amber-50/50 p-2.5 sm:p-3 rounded-lg border border-surface-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
            {/* Challan No */}
            <div>
              <span className="text-[10px] uppercase font-bold text-surface-500 tracking-wider block">
                Challan # (Delivery)
              </span>
              <span className="font-mono font-bold text-primary-700 bg-white px-2 py-0.5 rounded border border-primary-200 text-xs shadow-2xs inline-block">
                {challanNumber || 'SH/2026-27/0001'}
              </span>
            </div>

            {/* PI No */}
            <div>
              <span className="text-[10px] uppercase font-bold text-surface-500 tracking-wider block">
                PI # (Proforma Invoice)
              </span>
              <input
                type="text"
                value={piNumber}
                onChange={(e) => setPiNumber(e.target.value)}
                placeholder="e.g. PI/2026-27/0001"
                className="input text-xs font-mono font-bold bg-white text-blue-700 h-7 max-w-[170px]"
              />
            </div>

            {/* Staff PO Sequence */}
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] uppercase font-bold text-surface-700 tracking-wider">
                  Staff PO # ({createdBy || 'Staff'} Sequence)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = getNextStaffPONumber(createdBy);
                    setReferenceNumber(next);
                    showToast(`PO auto-sequenced for ${createdBy}: ${next}`);
                  }}
                  className="text-[10px] text-primary-600 hover:text-primary-800 font-semibold cursor-pointer underline"
                  title="Auto-calculate next sequential PO for this staff"
                >
                  Auto-Next
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="e.g. PO VS 001"
                  className="input text-xs font-mono font-bold bg-white text-surface-900 h-7 max-w-[150px]"
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowExtraDetails(!showExtraDetails)}
            className="text-[11px] font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 mt-1"
          >
            <ChevronDown size={14} className={cn('transition-transform', showExtraDetails && 'rotate-180')} />
            <span>{showExtraDetails ? 'Hide Site & Phone Details' : '+ Edit Phone, Site Address, or Ref #'}</span>
          </button>

          {showExtraDetails && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 mt-2 border-t border-surface-100">
              <div>
                <label className="label text-[11px]">Phone / WhatsApp</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="10-digit mobile"
                  className="input text-xs"
                />
              </div>
              <div>
                <label className="label text-[11px]">Delivery Site / Address</label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Site location"
                  className="input text-xs"
                />
              </div>
              <div>
                <label className="label text-[11px]">Reference / PO #</label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="e.g. PO-102"
                  className="input text-xs"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Items List */}
      <div className="card p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center justify-between pb-1 border-b border-surface-100">
          <div className="flex items-center gap-1.5">
            <Layers size={16} className="text-primary-600" />
            <h2 className="text-sm font-bold text-surface-900">Items & Quantities *</h2>
          </div>
          <button
            type="button"
            onClick={addItem}
            className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1 py-1 px-2 rounded hover:bg-primary-50"
          >
            <Plus size={14} />
            <span>Add Row</span>
          </button>
        </div>

        {errors.items && (
          <div className="p-2 bg-red-50 text-red-600 text-xs rounded border border-red-200">
            {errors.items}
          </div>
        )}

        <div className="space-y-2.5">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="p-2.5 sm:p-3 rounded-lg border border-surface-200 bg-surface-50/50 hover:bg-white transition-colors space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-surface-400 w-5">#{idx + 1}</span>

                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={item.item_description}
                    onChange={(e) => {
                      updateItem(idx, 'item_description', e.target.value);
                      setActiveProductRow(idx);
                      setProductSearch(e.target.value);
                    }}
                    onFocus={() => {
                      setActiveProductRow(idx);
                      setProductSearch(item.item_description);
                    }}
                    placeholder="e.g. 1mm Gloss Laminate - Oak Wood"
                    className="input text-xs py-2 w-full font-medium"
                  />

                  {activeProductRow === idx && filteredProducts.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-surface-200 z-30 max-h-44 overflow-y-auto">
                      {filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={() => selectProduct(idx, p)}
                          className="w-full text-left px-3 py-1.5 hover:bg-surface-50 border-b border-surface-100 last:border-0 flex justify-between items-center text-xs"
                        >
                          <span className="font-semibold text-surface-900">{p.name}</span>
                          <span className="text-[11px] text-surface-400">
                            {[p.brand, p.colour_design].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="p-1.5 text-surface-400 hover:text-red-500 rounded hover:bg-surface-100"
                    title="Remove Item"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              {/* Quantity, Unit, Rate, and Amount */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pl-7">
                <div>
                  <label className="text-[10px] font-semibold text-surface-500 uppercase block mb-1">
                    Qty *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                    placeholder="0"
                    className="input text-xs py-1.5 font-bold text-surface-900 text-center"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-surface-500 uppercase block mb-1">
                    Unit
                  </label>
                  <select
                    value={item.unit}
                    onChange={(e) => updateItem(idx, 'unit', e.target.value as UnitType)}
                    className="input text-xs py-1.5 capitalize"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-surface-500 uppercase block mb-1">
                    Rate (₹) <span className="text-[9px] text-surface-400 font-normal lowercase">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={item.rate}
                    onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                    placeholder="Rate ₹"
                    className="input text-xs py-1.5 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-surface-500 uppercase block mb-1">
                    Amount (₹)
                  </label>
                  <div className="text-xs font-mono font-bold text-surface-800 bg-surface-100/70 border border-surface-200 rounded px-2.5 py-1.5 h-[34px] flex items-center">
                    {item.amount ? `₹${Number(item.amount).toLocaleString('en-IN')}` : '—'}
                  </div>
                </div>
              </div>

              {/* Dimensions Section for Sq.Ft & Running Ft */}
              {(item.unit === 'sq.ft' || item.unit === 'running ft' || item.length) && (
                <div className="pl-7 pt-1">
                  <div className="p-2 rounded-md bg-amber-50/70 border border-amber-200/80 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1">
                      📐 Dimensions:
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-surface-600 font-medium">Length:</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="L"
                        value={item.length || ''}
                        onChange={(e) => updateItem(idx, 'length', e.target.value)}
                        className="input text-xs py-1 px-1.5 w-16 bg-white font-mono text-center"
                      />
                    </div>

                    {item.unit === 'sq.ft' && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-surface-600 font-medium">Width:</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="W"
                          value={item.width || ''}
                          onChange={(e) => updateItem(idx, 'width', e.target.value)}
                          className="input text-xs py-1 px-1.5 w-16 bg-white font-mono text-center"
                        />
                      </div>
                    )}

                    <select
                      value={item.dimension_unit || 'ft'}
                      onChange={(e) => updateItem(idx, 'dimension_unit', e.target.value)}
                      className="input text-xs py-1 px-1.5 bg-white text-[11px]"
                    >
                      <option value="ft">Feet (ft)</option>
                      <option value="in">Inches (in)</option>
                    </select>

                    {item.calculated_sqft && Number(item.calculated_sqft) > 0 && (
                      <div className="ml-auto text-[11px] font-semibold text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded border border-amber-300">
                        Total {item.unit === 'sq.ft' ? 'Area' : 'Length'}:{' '}
                        <span className="font-bold">{item.calculated_sqft}</span>{' '}
                        {item.unit === 'sq.ft' ? 'Sq.Ft' : 'R.Ft'}
                        {item.rate && Number(item.rate) > 0 ? ` @ ₹${item.rate}` : ''}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addItem}
          className="w-full py-2.5 border border-dashed border-surface-300 rounded-lg text-xs font-medium text-surface-600 hover:text-primary-600 hover:border-primary-400 hover:bg-primary-50/50 transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus size={15} />
          <span>Add Another Item Row</span>
        </button>
      </div>

      {/* Additional Charges: Transportation, Loading & GST */}
      <div className="card p-3 sm:p-4 space-y-3 bg-surface-50/70 border border-surface-200">
        <div className="flex items-center justify-between border-b border-surface-200 pb-2">
          <div>
            <h3 className="text-xs font-bold text-surface-900 uppercase tracking-wider">
              Transportation, Loading & GST
            </h3>
            <p className="text-[11px] text-surface-500">
              Add separate charges and toggle optional 9% CGST + 9% SGST
            </p>
          </div>
          {itemsSubtotal > 0 && (
            <span className="text-xs font-mono font-bold text-surface-700 bg-white px-2 py-0.5 rounded border border-surface-200">
              Items: ₹{itemsSubtotal.toLocaleString('en-IN')}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-surface-600 block mb-1">
              Transportation / Cartage Charges (₹)
            </label>
            <input
              type="number"
              min="0"
              value={transportCharges}
              onChange={(e) => setTransportCharges(e.target.value)}
              placeholder="e.g. 500"
              className="input text-xs py-1.5 font-mono"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-surface-600 block mb-1">
              Loading / Unloading Charges (₹)
            </label>
            <input
              type="number"
              min="0"
              value={loadingCharges}
              onChange={(e) => setLoadingCharges(e.target.value)}
              placeholder="e.g. 300"
              className="input text-xs py-1.5 font-mono"
            />
          </div>
        </div>

        {/* GST Toggle Option */}
        <div className="pt-2 border-t border-surface-200">
          <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg bg-white hover:bg-surface-100/60 transition-colors border border-surface-200">
            <input
              type="checkbox"
              checked={applyGst}
              onChange={(e) => setApplyGst(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-primary-600 focus:ring-primary-400 cursor-pointer"
            />
            <div className="flex-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-surface-900">
                  Apply GST (18%) — 9% CGST + 9% SGST
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Auto Calculated
                </span>
              </div>
              <span className="text-[11px] text-surface-500 block mt-0.5">
                Auto-calculate 9% CGST + 9% SGST on subtotal. Leave unchecked if non-tax/estimate billing.
              </span>
            </div>
          </label>
        </div>

        {/* Additional 9% Toggle Option (Right after GST) */}
        <div className="pt-1">
          <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-amber-50/40 transition-colors border border-amber-200/80 bg-amber-50/20">
            <input
              type="checkbox"
              checked={applyAdditional9}
              onChange={(e) => setApplyAdditional9(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-amber-600 focus:ring-amber-400 cursor-pointer"
            />
            <div className="flex-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-surface-900">
                  Additional 9% Tax
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
                  +9% Extra
                </span>
              </div>
              <span className="text-[11px] text-surface-600 block mt-0.5">
                Auto-calculate extra 9% tax on taxable subtotal. Toggle on to include in calculation.
              </span>
            </div>
          </label>

          {/* Live Tax Calculation Breakdown if either GST or Additional 9% is applied */}
          {(applyGst || applyAdditional9) && taxableSubtotal > 0 && (
            <div className="mt-2.5 p-3 rounded-lg bg-white border border-surface-200 text-xs space-y-1.5 font-mono">
              <div className="flex justify-between text-surface-600">
                <span>Items Subtotal:</span>
                <span>₹{itemsSubtotal.toLocaleString('en-IN')}</span>
              </div>
              {transport > 0 && (
                <div className="flex justify-between text-surface-600">
                  <span>Transportation Charges:</span>
                  <span>+ ₹{transport.toLocaleString('en-IN')}</span>
                </div>
              )}
              {loading > 0 && (
                <div className="flex justify-between text-surface-600">
                  <span>Loading Charges:</span>
                  <span>+ ₹{loading.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-surface-800 pt-1 border-t border-surface-200">
                <span>Taxable Value:</span>
                <span>₹{taxableSubtotal.toLocaleString('en-IN')}</span>
              </div>
              {applyGst && (
                <>
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>CGST (9%):</span>
                    <span>+ ₹{cgstAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>SGST (9%):</span>
                    <span>+ ₹{sgstAmount.toLocaleString('en-IN')}</span>
                  </div>
                </>
              )}
              {applyAdditional9 && (
                <div className="flex justify-between text-amber-700 font-semibold">
                  <span>Additional 9% Tax:</span>
                  <span>+ ₹{additional9Amount.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-surface-900 pt-1.5 border-t-2 border-surface-300 text-sm">
                <span>
                  Final Grand Total {applyGst && applyAdditional9 ? '(with 18% GST + 9% Addl)' : applyGst ? '(with 18% GST)' : '(with 9% Addl)'}:
                </span>
                <span className="text-primary-600">₹{totalAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary Footer Bar on Mobile & Desktop */}
      <div className="card p-3.5 sm:p-4 bg-surface-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <span className="text-[10px] text-surface-400 uppercase tracking-wider block">
              Total Quantity
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-primary-400">
              {totalQuantity} <span className="text-xs text-white font-normal">{items[0]?.unit || 'sheets'}</span>
            </span>
          </div>
          {totalAmount > 0 && (
            <div className="pl-3 border-l border-surface-700">
              <span className="text-[10px] text-surface-400 uppercase tracking-wider block">
                Total Amount {applyGst || applyAdditional9 ? '(Incl. Tax)' : ''}
              </span>
              <span className="text-base sm:text-lg font-bold font-mono text-white">
                ₹{totalAmount.toLocaleString('en-IN')}
              </span>
            </div>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="btn-primary py-2 px-5 text-xs font-semibold shadow-md"
          >
            <Save size={15} />
            <span>Save Changes</span>
          </button>
        </div>
      </div>

      {/* Sticky Bottom Action Bar for Mobile */}
      <div className="sm:hidden fixed bottom-14 left-0 right-0 bg-white border-t border-surface-200 px-3 py-2 z-40 flex items-center justify-between gap-2 shadow-lg">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-sm text-surface-900">
              {totalQuantity} {items[0]?.unit || 'sheets'}
            </span>
            {totalAmount > 0 && (
              <span className="text-xs font-bold text-primary-700 bg-primary-50 border border-primary-200 px-1.5 py-0.5 rounded font-mono">
                ₹{totalAmount.toLocaleString('en-IN')}
              </span>
            )}
          </div>
          <span className="text-[9px] text-surface-400 font-medium">
            {applyGst ? 'Total (Inc. 18% GST)' : totalAmount > 0 ? 'Total Amount' : 'Total Quantity'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowCancel(true)}
            className="btn-secondary py-2 px-3 text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="btn-primary py-2 px-4 text-xs font-bold rounded-lg shadow-sm"
          >
            <Save size={14} />
            <span>Save</span>
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showCancel}
        title="Discard Changes?"
        message="Discard unsaved edits and return to challan view?"
        variant="warning"
        confirmLabel="Discard"
        onConfirm={() => router.push(`/challans/${challanId}`)}
        onCancel={() => setShowCancel(false)}
      />
    </div>
  );
}
