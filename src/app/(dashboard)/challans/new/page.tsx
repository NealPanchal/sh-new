'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Printer,
  Send,
  X,
  Search,
  ChevronDown,
  Building2,
  Calendar,
  Layers,
  Phone,
  MapPin,
  CheckCircle2,
} from 'lucide-react';
import { getTodayISO, cn } from '@/lib/utils';
import { UNIT_OPTIONS } from '@/lib/validations';
import { ChallanItemFormData, UnitType, Customer, Product } from '@/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { downloadChallanPDF, printChallanPDF } from '@/lib/pdf';
import { openWhatsApp, generateShareMessage } from '@/lib/whatsapp';

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
});

function CreateChallanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCustomerId = searchParams.get('customerId');
  const {
    customers,
    products,
    getCustomer,
    getNextChallanNumber,
    createChallan,
    createCustomer,
    profile,
    showToast,
    updateShareStatus,
  } = useApp();

  // Core Form State (Speed & Simplicity)
  const [challanDate, setChallanDate] = useState('');
  const [challanNumberPreview, setChallanNumberPreview] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(preselectedCustomerId || '');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [showExtraDetails, setShowExtraDetails] = useState(false);

  // Items
  const [items, setItems] = useState<ChallanItemFormData[]>([emptyItem()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  // Autocomplete UI
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [activeProductRow, setActiveProductRow] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    setChallanDate(getTodayISO());
    try {
      setChallanNumberPreview(getNextChallanNumber());
    } catch {
      setChallanNumberPreview('SH/CH-0001');
    }
  }, [getNextChallanNumber]);

  // Pre-select customer if passed in URL
  useEffect(() => {
    if (preselectedCustomerId) {
      const c = getCustomer(preselectedCustomerId);
      if (c) selectCustomer(c);
    }
  }, [preselectedCustomerId, getCustomer]);

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

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    setCustomerName(customer.business_name);
    setCustomerPhone(customer.phone || '');
    setDeliveryAddress(customer.delivery_address || customer.billing_address || '');
    setCustomerSearch('');
    setShowCustomerDropdown(false);
  };

  const selectProduct = (rowIndex: number, product: Product) => {
    const newItems = [...items];
    newItems[rowIndex] = {
      ...newItems[rowIndex],
      product_id: product.id,
      item_description: product.name,
      brand: product.brand || '',
      colour_finish: product.colour_design || '',
      size: product.size_thickness || '',
      unit: product.unit,
      rate: product.default_rate ? String(product.default_rate) : '',
    };
    if (newItems[rowIndex].quantity && product.default_rate) {
      newItems[rowIndex].amount = String(Number(newItems[rowIndex].quantity) * product.default_rate);
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
    newItems[index] = {
      ...newItems[index],
      [field]: value,
    };

    if (field === 'quantity' || field === 'rate') {
      const qty = Number(newItems[index].quantity) || 0;
      const rate = Number(newItems[index].rate) || 0;
      newItems[index].amount = rate > 0 ? String(qty * rate) : '';
    }

    setItems(newItems);
  };

  // Calculations
  const totalQuantity = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }, [items]);

  const totalAmount = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [items]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!customerName.trim()) errs.customer = 'Please enter or select a customer name';
    if (!challanDate) errs.date = 'Date is required';

    const hasValidItem = items.some(
      (item) => item.item_description.trim() && Number(item.quantity) > 0
    );
    if (!hasValidItem) {
      errs.items = 'Please enter at least one item description and quantity';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (status: 'final' | 'draft', action?: 'print' | 'whatsapp') => {
    if (!validate()) {
      showToast('Please enter customer name and item quantity', 'error');
      return;
    }

    setSaving(true);
    try {
      // Auto-save customer if new name was entered
      let finalCustomerId = selectedCustomerId;
      if (!finalCustomerId && customerName.trim()) {
        const existing = customers.find(
          (c) => c.business_name.toLowerCase() === customerName.trim().toLowerCase()
        );
        if (existing) {
          finalCustomerId = existing.id;
        } else {
          try {
            const newCust = createCustomer({
              business_name: customerName.trim(),
              phone: customerPhone.trim(),
              delivery_address: deliveryAddress.trim(),
              billing_address: deliveryAddress.trim(),
            });
            finalCustomerId = newCust.id;
          } catch {
            // Non-blocking fallback
          }
        }
      }

      const validItems = items.filter(
        (it) => it.item_description.trim() && Number(it.quantity) > 0
      );

      const challan = createChallan(
        {
          challan_date: challanDate,
          customer_id: finalCustomerId || undefined,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          customer_address: deliveryAddress.trim(),
          delivery_address: deliveryAddress.trim(),
          reference_number: referenceNumber.trim(),
          status,
          total_quantity: totalQuantity,
          total_amount: totalAmount > 0 ? totalAmount : null,
        },
        validItems.map((it) => ({
          product_id: it.product_id || null,
          item_description: it.item_description.trim(),
          brand: it.brand || null,
          colour_finish: it.colour_finish || null,
          size: it.size || null,
          unit: it.unit as UnitType,
          quantity: Number(it.quantity),
          rate: Number(it.rate) || null,
          amount: Number(it.amount) || null,
        }))
      );

      if (action === 'print' && profile) {
        printChallanPDF({
          challan,
          items: challan.items || [],
          profile,
        });
      }

      if (action === 'whatsapp' && profile && customerPhone) {
        const msg = generateShareMessage(challan, profile);
        openWhatsApp(customerPhone, msg);
        updateShareStatus(challan.id, 'share_initiated');
      }

      showToast(`Challan ${challan.challan_number} saved successfully!`);
      router.push(`/challans/${challan.id}`);
    } catch (err) {
      showToast('Error saving challan', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-28 sm:pb-16 max-w-4xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2 border-b border-surface-200">
        <div className="flex items-center gap-2">
          <Link
            href="/challans"
            className="p-1.5 rounded-lg text-surface-500 hover:text-surface-900 hover:bg-surface-100 transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-surface-900 tracking-tight">
                New Delivery Challan
              </h1>
              {challanNumberPreview && (
                <span className="hidden sm:inline-block font-mono text-xs font-semibold px-2 py-0.5 rounded bg-primary-50 text-primary-700 border border-primary-200">
                  {challanNumberPreview}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Quick Actions */}
        <div className="hidden sm:flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave('draft')}
            className="btn-secondary text-xs py-2 px-3"
          >
            Draft
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave('final', 'print')}
            className="btn-secondary text-xs py-2 px-3"
          >
            <Printer size={14} />
            <span>Save & Print</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave('final')}
            className="btn-primary text-xs py-2 px-4 font-semibold"
          >
            <Save size={14} />
            <span>Save Challan</span>
          </button>
        </div>
      </div>

      {/* Customer & Date Card (Fast Entry) */}
      <div className="card p-3.5 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Customer Name Search / Input */}
          <div className="sm:col-span-2 relative">
            <label className="label text-xs">Customer Name *</label>
            <div className="relative">
              <input
                type="text"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setCustomerSearch(e.target.value);
                  setShowCustomerDropdown(true);
                  if (selectedCustomerId) setSelectedCustomerId('');
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                placeholder="Type customer or contractor name..."
                className={cn(
                  'input text-sm pr-8 font-medium',
                  errors.customer && 'input-error'
                )}
              />
              {customerName ? (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerName('');
                    setSelectedCustomerId('');
                    setCustomerPhone('');
                    setDeliveryAddress('');
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 p-1"
                >
                  <X size={14} />
                </button>
              ) : (
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
              )}
            </div>

            {/* Suggestions dropdown */}
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
                    {c.delivery_address && (
                      <span className="text-[10px] text-surface-400 truncate max-w-[120px]">
                        {c.delivery_address}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {errors.customer && <p className="error-text text-xs mt-1">{errors.customer}</p>}
          </div>

          {/* Challan Date */}
          <div>
            <label className="label text-xs">Date *</label>
            <input
              type="date"
              value={challanDate}
              onChange={(e) => setChallanDate(e.target.value)}
              className="input text-xs"
            />
          </div>
        </div>

        {/* Optional Collapsible Details: Phone, Delivery Site, Ref */}
        <div>
          <button
            type="button"
            onClick={() => setShowExtraDetails(!showExtraDetails)}
            className="text-[11px] font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 mt-1"
          >
            <ChevronDown size={14} className={cn('transition-transform', showExtraDetails && 'rotate-180')} />
            <span>{showExtraDetails ? 'Hide Site & Phone Details' : '+ Add Phone, Site Address, or Ref #'}</span>
          </button>

          {showExtraDetails && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 mt-2 border-t border-surface-100 animate-fade-in">
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
                <label className="label text-[11px]">Delivery Site / Destination</label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Site address or project location"
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

      {/* Items List (Fast Line Items Entry) */}
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

                {/* Item description */}
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

                  {/* Product suggestions */}
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

                {/* Remove row */}
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="p-1.5 text-surface-400 hover:text-red-500 rounded hover:bg-surface-100 transition-colors"
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
                    Rate (₹)
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
            </div>
          ))}
        </div>

        {/* Add item row button */}
        <button
          type="button"
          onClick={addItem}
          className="w-full py-2.5 border border-dashed border-surface-300 rounded-lg text-xs font-medium text-surface-600 hover:text-primary-600 hover:border-primary-400 hover:bg-primary-50/50 transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus size={15} />
          <span>Add Another Item Row</span>
        </button>
      </div>

      {/* Summary Footer Bar on Mobile & Desktop */}
      <div className="card p-3.5 sm:p-4 bg-surface-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <span className="text-[10px] text-surface-400 uppercase tracking-wider block">
              Total Quantity
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-primary-400">
              {totalQuantity}{' '}
              <span className="text-xs text-white font-normal">
                {items[0]?.unit || 'sheets'}
              </span>
            </span>
          </div>
          {totalAmount > 0 && (
            <div className="pl-3 border-l border-surface-700">
              <span className="text-[10px] text-surface-400 uppercase tracking-wider block">
                Total Amount
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
            onClick={() => handleSave('final')}
            className="btn-primary py-2 px-5 text-xs font-semibold shadow-md"
          >
            <Save size={15} />
            <span>Save Challan</span>
          </button>
        </div>
      </div>

      {/* Sticky Bottom Action Bar for Mobile Devices */}
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
            {totalAmount > 0 ? 'Live Rate Total' : 'Total Quantity'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {customerPhone && (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave('final', 'whatsapp')}
              className="p-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 text-xs flex items-center gap-1 font-semibold"
              title="Save & Share WhatsApp"
            >
              <Send size={15} />
            </button>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave('final', 'print')}
            className="p-2 bg-surface-100 text-surface-700 rounded-lg hover:bg-surface-200 text-xs"
            title="Save & Print"
          >
            <Printer size={15} />
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave('final')}
            className="btn-primary py-2 px-4 text-xs font-bold rounded-lg shadow-sm"
          >
            <Save size={14} />
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Discard Dialog */}
      <ConfirmDialog
        isOpen={showCancel}
        title="Discard Challan?"
        message="Are you sure you want to discard this challan? Any entered data will be lost."
        variant="warning"
        confirmLabel="Discard"
        onConfirm={() => router.push('/challans')}
        onCancel={() => setShowCancel(false)}
      />
    </div>
  );
}

export default function CreateChallanPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CreateChallanContent />
    </React.Suspense>
  );
}
