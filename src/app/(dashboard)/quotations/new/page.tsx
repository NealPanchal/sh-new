'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Send,
  Download,
  Building2,
  Calendar,
  Phone,
  MapPin,
  CheckCircle2,
  Sparkles,
  Layers,
  FileSpreadsheet,
  X,
  Search,
  ChevronDown,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UNIT_OPTIONS } from '@/lib/validations';
import { Customer, CustomerSite, Quotation, QuotationItem, UnitType } from '@/types';
import { getCurrentUser } from '@/lib/auth';
import { exportQuotationToPDF } from '@/lib/pdf-quotation';
import { shareQuotationViaWhatsApp } from '@/lib/whatsapp';
import { SiteModal } from '@/components/customers/site-modal';

interface FormItem {
  id: string;
  item_description: string;
  brand?: string;
  unit: UnitType;
  quantity: string;
  rate: string;
  amount: number;
}

const emptyItem = (): FormItem => ({
  id: `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  item_description: '',
  brand: '',
  unit: 'sheets',
  quantity: '1',
  rate: '',
  amount: 0,
});

function CreateQuotationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCustomerId = searchParams.get('customerId');
  const preselectedSite = searchParams.get('site');

  const {
    customers,
    getCustomer,
    peekNextQuotationNumber,
    createQuotation,
    createCustomer,
    profile,
    showToast,
  } = useApp();

  const currentUser = useMemo(() => getCurrentUser(), []);

  // Form Basic Info
  const [quotationNumber, setQuotationNumber] = useState('');
  const [quotationDate, setQuotationDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Customer State & Search
  const [customerName, setCustomerName] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Site Management State
  const [availableSites, setAvailableSites] = useState<CustomerSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedSiteName, setSelectedSiteName] = useState('');
  const [showSiteModal, setShowSiteModal] = useState(false);

  // Charges & GST
  const [applyGst, setApplyGst] = useState(true);
  const [transportCharges, setTransportCharges] = useState('');
  const [loadingCharges, setLoadingCharges] = useState('');
  const [notes, setNotes] = useState('');
  const [preparedBy, setPreparedBy] = useState(currentUser?.name || 'Vrushank');

  // Items State
  const [items, setItems] = useState<FormItem[]>([emptyItem()]);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize Next Quotation Number
  useEffect(() => {
    try {
      const nextNum = peekNextQuotationNumber ? peekNextQuotationNumber(quotationDate) : 'QT/2026-27/001';
      setQuotationNumber(nextNum);
    } catch {
      setQuotationNumber('QT/2026-27/001');
    }
  }, [peekNextQuotationNumber, quotationDate]);

  // Handle outside click for customer dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Pre-fill if customerId is passed in URL
  useEffect(() => {
    if (preselectedCustomerId) {
      const cust = getCustomer(preselectedCustomerId);
      if (cust) {
        setSelectedCustomerId(cust.id);
        setCustomerName(cust.business_name || cust.name || '');
        setCustomerPhone(cust.phone || '');
        setDeliveryAddress(cust.delivery_address || cust.billing_address || '');
        if (cust.sites && cust.sites.length > 0) {
          setAvailableSites(cust.sites);
          if (preselectedSite) {
            const matched = cust.sites.find(
              (s) => s.site_name?.toLowerCase() === preselectedSite.toLowerCase()
            );
            if (matched) {
              setSelectedSiteId(matched.id);
              setSelectedSiteName(matched.site_name);
              if (matched.site_address) setDeliveryAddress(matched.site_address);
            }
          } else {
            setSelectedSiteId(cust.sites[0].id);
            setSelectedSiteName(cust.sites[0].site_name || 'Site 1');
            if (cust.sites[0].site_address) setDeliveryAddress(cust.sites[0].site_address);
          }
        }
      }
    }
  }, [preselectedCustomerId, preselectedSite, getCustomer]);

  // Filtered customer list for autocomplete
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return customers.slice(0, 8);
    const q = customerSearchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        (c.business_name && c.business_name.toLowerCase().includes(q)) ||
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.contact_person && c.contact_person.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [customers, customerSearchQuery]);

  const matchedCustomer = useMemo(() => {
    if (selectedCustomerId) {
      return customers.find((c) => c.id === selectedCustomerId);
    }
    const qName = customerName.trim().toLowerCase();
    if (!qName) return undefined;
    return customers.find(
      (c) =>
        (c.business_name && c.business_name.toLowerCase() === qName) ||
        (c.name && c.name.toLowerCase() === qName)
    );
  }, [customers, selectedCustomerId, customerName]);

  // Multiple Sites derivation
  const customerSites: CustomerSite[] = useMemo(() => {
    const list: CustomerSite[] = [];
    const seen = new Set<string>();

    if (matchedCustomer?.sites && Array.isArray(matchedCustomer.sites)) {
      matchedCustomer.sites.forEach((s) => {
        const key = (s.site_name || s.name || '').trim().toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          list.push(s);
        }
      });
    }

    availableSites.forEach((s) => {
      const key = (s.site_name || s.name || '').trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        list.push(s);
      }
    });

    if (list.length === 0) {
      const addr = deliveryAddress || matchedCustomer?.delivery_address || '';
      list.push({
        id: `site_1_${matchedCustomer?.id || 'default'}`,
        customer_id: matchedCustomer?.id || '',
        site_name: 'Site 1',
        name: 'Site 1',
        site_address: addr,
        location: addr,
        created_at: new Date().toISOString(),
      });
    }

    return list;
  }, [matchedCustomer?.sites, availableSites, deliveryAddress, matchedCustomer?.delivery_address, matchedCustomer?.id]);

  // Select customer from dropdown
  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    const displayName = customer.business_name || customer.name || '';
    setCustomerName(displayName);
    setCustomerSearchQuery(displayName);
    setCustomerPhone(customer.phone || '');
    setIsCustomerDropdownOpen(false);

    if (customer.sites && customer.sites.length > 0) {
      setAvailableSites(customer.sites);
      setSelectedSiteId(customer.sites[0].id);
      setSelectedSiteName(customer.sites[0].site_name || 'Site 1');
      setDeliveryAddress(customer.sites[0].site_address || customer.delivery_address || customer.billing_address || '');
    } else {
      setAvailableSites([]);
      setSelectedSiteId('');
      setSelectedSiteName('Site 1');
      setDeliveryAddress(customer.delivery_address || customer.billing_address || '');
    }

    showToast(`Loaded ${displayName}`, 'info');
  };

  // Auto-Fetch Customer Agreed Materials
  const handleAutoFetchAgreedMaterials = () => {
    if (!matchedCustomer?.material_rates || matchedCustomer.material_rates.length === 0) {
      showToast('No agreed material rates configured for this customer', 'info');
      return;
    }

    let source = matchedCustomer.material_rates;
    if (selectedSiteName && selectedSiteName !== 'All Sites') {
      const siteFiltered = source.filter(
        (mr) =>
          mr.site_name?.toLowerCase() === selectedSiteName.toLowerCase() ||
          mr.site_id === selectedSiteId ||
          !mr.site_name ||
          mr.site_name === 'All Sites'
      );
      if (siteFiltered.length > 0) {
        source = siteFiltered;
      }
    }

    const fetched: FormItem[] = source.map((mr, idx) => {
      const roomPrefix = mr.room ? `[ ${mr.room.toUpperCase()} ] ` : '';
      const desc = mr.particulars ? `${roomPrefix}${mr.particulars}` : `${roomPrefix}LAMINATE / FINISH`;
      const r = Number(mr.rate) || 0;
      return {
        id: `it_af_${Date.now()}_${idx}`,
        item_description: desc,
        brand: mr.company_name || '',
        unit: 'sheets',
        quantity: '1',
        rate: String(r),
        amount: r,
      };
    });

    setItems(fetched);
    showToast(
      `⚡ Auto-fetched ${fetched.length} agreed materials for ${selectedSiteName || customerName} with locked rates!`,
      'success'
    );
  };

  // Item row operations
  const handleItemChange = (index: number, field: keyof FormItem, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      const cur = { ...next[index], [field]: value };
      const q = parseFloat(cur.quantity) || 0;
      const r = parseFloat(cur.rate) || 0;
      cur.amount = Math.round(q * r * 100) / 100;
      next[index] = cur;
      return next;
    });
  };

  const handleAddItem = () => {
    setItems((prev) => [...prev, emptyItem()]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const totalQuantity = items.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0), 0);
  const subtotalAmount = items.reduce((sum, it) => sum + (it.amount || 0), 0);
  const parsedTransport = parseFloat(transportCharges) || 0;
  const parsedLoading = parseFloat(loadingCharges) || 0;
  const taxableBase = subtotalAmount + parsedTransport + parsedLoading;
  const cgstAmount = applyGst ? Math.round(taxableBase * 0.09 * 100) / 100 : 0;
  const sgstAmount = applyGst ? Math.round(taxableBase * 0.09 * 100) / 100 : 0;
  const totalAmount = Math.round((taxableBase + cgstAmount + sgstAmount) * 100) / 100;

  // Validation
  const validateForm = (): boolean => {
    if (!customerName.trim()) {
      showToast('Please select or enter customer name', 'error');
      return false;
    }
    const validItems = items.filter((it) => it.item_description.trim() && (parseFloat(it.quantity) || 0) > 0);
    if (validItems.length === 0) {
      showToast('Please add at least one valid item with description and quantity', 'error');
      return false;
    }
    return true;
  };

  // Save Quotation Handler (Save only, Save + WhatsApp, Save + PDF)
  const handleSaveQuotation = async (action: 'save' | 'whatsapp' | 'pdf' | 'challan') => {
    if (!validateForm()) return;

    try {
      setIsSaving(true);

      // 1. Ensure Customer exists
      let custId = selectedCustomerId;
      let targetCust = matchedCustomer;

      if (!targetCust && customerName.trim()) {
        const newCust = createCustomer({
          name: customerName.trim(),
          business_name: customerName.trim(),
          phone: customerPhone.trim() || undefined,
          delivery_address: deliveryAddress.trim() || undefined,
          billing_address: deliveryAddress.trim() || undefined,
        });
        custId = newCust.id;
        targetCust = newCust;
        setSelectedCustomerId(newCust.id);
      } else if (targetCust && customerPhone.trim() && !targetCust.phone) {
        targetCust.phone = customerPhone.trim();
      }

      // 2. Build Quotation Payload
      const validItems = items.filter((it) => it.item_description.trim());
      const quotationData: Partial<Quotation> = {
        quotation_number: quotationNumber.trim() || `QT/${Date.now().toString().slice(-4)}`,
        quotation_date: quotationDate,
        customer_id: custId || targetCust?.id || `cust_${Date.now()}`,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || undefined,
        customer_address: deliveryAddress.trim() || undefined,
        site_id: selectedSiteId || undefined,
        site_name: selectedSiteName || undefined,
        delivery_address: deliveryAddress.trim() || undefined,
        status: 'draft',
        total_quantity: totalQuantity,
        subtotal_amount: subtotalAmount,
        transportation_charges: parsedTransport,
        selection_charges: parsedLoading,
        apply_gst: applyGst,
        cgst_amount: cgstAmount,
        sgst_amount: sgstAmount,
        total_amount: totalAmount,
        notes: notes.trim() || null,
        prepared_by: preparedBy.trim() || 'Vrushank',
        created_by: currentUser?.username || 'admin',
      };

      const quotationItems: Partial<QuotationItem>[] = validItems.map((it, idx) => ({
        serial_number: idx + 1,
        item_description: it.item_description.trim(),
        brand: it.brand?.trim() || null,
        unit: it.unit,
        quantity: parseFloat(it.quantity) || 1,
        rate: parseFloat(it.rate) || 0,
        amount: it.amount,
      }));

      const saved = createQuotation(quotationData, quotationItems);
      showToast(`Quotation ${saved.quotation_number} generated successfully!`, 'success');

      if (action === 'whatsapp') {
        shareQuotationViaWhatsApp({
          quotation: saved,
          profile,
          onToast: showToast,
        });
      } else if (action === 'pdf') {
        exportQuotationToPDF(saved, profile, 'a4');
        showToast('Downloaded Quotation PDF!', 'success');
      } else if (action === 'challan') {
        router.push(`/challans/new?customerId=${encodeURIComponent(saved.customer_id)}&quotationId=${encodeURIComponent(saved.id)}`);
        return;
      }

      // If just saved or shared, redirect to customer or quotations
      setTimeout(() => {
        if (saved.customer_id) {
          router.push(`/customers/${saved.customer_id}`);
        } else {
          router.push('/customers');
        }
      }, 700);
    } catch (err: any) {
      console.error('Error saving quotation:', err);
      showToast(err?.message || 'Failed to generate quotation', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-20 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-surface-200">
        <div className="flex items-center gap-2">
          <Link
            href="/customers"
            className="p-1.5 rounded-lg text-surface-500 hover:text-surface-900 hover:bg-surface-100 transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                <FileSpreadsheet size={16} />
              </span>
              <h1 className="text-lg sm:text-xl font-black text-surface-950 tracking-tight">
                New Fast Quotation / Estimate
              </h1>
            </div>
            <p className="text-xs text-surface-500 mt-0.5">
              Select party, add materials &amp; locked rates, and send directly via WhatsApp.
            </p>
          </div>
        </div>

        {/* Action Header Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* ⚡ Send WhatsApp (Primary Quick Action) */}
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSaveQuotation('whatsapp')}
            className="px-3.5 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer transition-all disabled:opacity-50"
            title="Save and instantly open WhatsApp to send quotation"
          >
            <Send size={14} />
            <span>⚡ Save &amp; Send WhatsApp</span>
          </button>

          {/* Download PDF */}
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSaveQuotation('pdf')}
            className="px-3 py-2 text-xs font-bold text-surface-700 bg-surface-100 hover:bg-surface-200 active:scale-95 rounded-lg flex items-center gap-1.5 border border-surface-300 cursor-pointer transition-all disabled:opacity-50"
            title="Save & Download official A4 PDF"
          >
            <Download size={14} />
            <span className="hidden sm:inline">PDF</span>
          </button>

          {/* Save Draft */}
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSaveQuotation('save')}
            className="px-3.5 py-2 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 active:scale-95 rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer transition-all disabled:opacity-50"
          >
            <Save size={14} />
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Main Form Body */}
      <div className="space-y-4">
        {/* Card 1: Quotation Header & Customer Selection */}
        <div className="card p-4 sm:p-5 space-y-4 bg-white border border-surface-200 shadow-2xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Quotation Number */}
            <div>
              <label className="label text-[11px] font-bold text-surface-700">Quotation No.</label>
              <input
                type="text"
                className="input text-xs font-mono font-bold bg-surface-50 text-blue-700 border-surface-300"
                value={quotationNumber}
                onChange={(e) => setQuotationNumber(e.target.value)}
                placeholder="QT/2026-27/001"
              />
            </div>

            {/* Quotation Date */}
            <div>
              <label className="label text-[11px] font-bold text-surface-700">Date</label>
              <div className="relative">
                <input
                  type="date"
                  className="input text-xs font-bold pl-8 border-surface-300"
                  value={quotationDate}
                  onChange={(e) => setQuotationDate(e.target.value)}
                />
                <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
              </div>
            </div>

            {/* Prepared By */}
            <div>
              <label className="label text-[11px] font-bold text-surface-700">Prepared By</label>
              <input
                type="text"
                className="input text-xs font-semibold border-surface-300"
                value={preparedBy}
                onChange={(e) => setPreparedBy(e.target.value)}
                placeholder="Staff name"
              />
            </div>
          </div>

          <div className="w-full h-px bg-surface-200" />

          {/* Customer Search & Name Selection */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
            {/* Customer Search / Name Autocomplete */}
            <div className="md:col-span-6 relative" ref={dropdownRef}>
              <label className="label text-[11px] font-bold text-surface-700 flex items-center justify-between">
                <span>Select Party / Customer Name *</span>
                {matchedCustomer && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    ✓ Registered Party
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="text"
                  className="input text-xs font-bold pl-8 pr-8 border-surface-300 text-surface-900"
                  placeholder="Type or select customer / architect name..."
                  value={customerName}
                  onFocus={() => setIsCustomerDropdownOpen(true)}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setCustomerSearchQuery(e.target.value);
                    setIsCustomerDropdownOpen(true);
                    if (selectedCustomerId && e.target.value !== matchedCustomer?.business_name) {
                      setSelectedCustomerId('');
                    }
                  }}
                />
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
                <button
                  type="button"
                  onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-surface-400 hover:text-surface-700 cursor-pointer"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              {/* Autocomplete Dropdown List */}
              {isCustomerDropdownOpen && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-surface-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-3 text-xs text-surface-500 text-center">
                      No matching party found. You can enter &quot;{customerName}&quot; as a new party.
                    </div>
                  ) : (
                    filteredCustomers.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        className="p-2.5 hover:bg-blue-50/70 border-b border-surface-100 last:border-none cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div>
                          <div className="text-xs font-extrabold text-surface-900">
                            {c.business_name || c.name}
                          </div>
                          <div className="text-[11px] text-surface-500 flex items-center gap-2">
                            {c.contact_person && <span>{c.contact_person}</span>}
                            {c.phone && <span>📞 {c.phone}</span>}
                          </div>
                        </div>
                        {Array.isArray(c.sites) && c.sites.length > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-50 text-[#ea580c] border border-orange-200">
                            {c.sites.length} site(s)
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Customer Phone (For WhatsApp Send) */}
            <div className="md:col-span-3">
              <label className="label text-[11px] font-bold text-surface-700">
                WhatsApp / Phone Number
              </label>
              <div className="relative">
                <input
                  type="tel"
                  className="input text-xs font-bold pl-8 border-surface-300"
                  placeholder="e.g. 98203 31717"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
                <Phone size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
              </div>
            </div>

            {/* Delivery / Site Address */}
            <div className="md:col-span-3">
              <label className="label text-[11px] font-bold text-surface-700">
                Site / Delivery Address
              </label>
              <div className="relative">
                <input
                  type="text"
                  className="input text-xs font-medium pl-8 border-surface-300"
                  placeholder="e.g. Kalpataru Paramount, Thane"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                />
                <MapPin size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
              </div>
            </div>
          </div>

          {/* Multiple Site Selector Pills */}
          {customerSites.length > 0 && (
            <div className="pt-2 border-t border-surface-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-surface-800 flex items-center gap-1.5">
                  <Building2 size={13} className="text-[#ea580c]" />
                  <span>Target Delivery Site ({customerSites.length} Configured)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowSiteModal(true)}
                  className="text-[11px] font-bold text-[#ea580c] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={11} />
                  <span>+ Add Another Site</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {customerSites.map((s, idx) => {
                  const isSelected = selectedSiteId === s.id || selectedSiteName === s.site_name;
                  return (
                    <button
                      key={s.id || idx}
                      type="button"
                      onClick={() => {
                        setSelectedSiteId(s.id);
                        setSelectedSiteName(s.site_name || s.name || `Site ${idx + 1}`);
                        if (s.site_address) setDeliveryAddress(s.site_address);
                        showToast(`Selected ${s.site_name || `Site ${idx + 1}`}`, 'info');
                      }}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer',
                        isSelected
                          ? 'bg-[#ea580c] text-white border-[#ea580c] shadow-xs'
                          : 'bg-surface-50 text-surface-700 border-surface-200 hover:bg-surface-100'
                      )}
                    >
                      <Building2 size={12} />
                      <span>{s.site_name || s.name || `Site ${idx + 1}`}</span>
                      {s.site_address && (
                        <span className="text-[10px] opacity-75 truncate max-w-[120px]">
                          ({s.site_address})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Auto-Fill Agreed Materials if Customer has Material Rates */}
          {matchedCustomer?.material_rates && matchedCustomer.material_rates.length > 0 && (
            <div className="p-3 rounded-xl bg-orange-50/80 border border-orange-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[#ea580c]" />
                <div className="text-xs">
                  <span className="font-bold text-orange-950">
                    {matchedCustomer.material_rates.length} Agreed Material Rates found for this customer!
                  </span>
                  <span className="text-orange-800/80 block text-[11px]">
                    Pre-fill descriptions, internal finishes, and agreed contract rates with 1-Click.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAutoFetchAgreedMaterials}
                className="py-1 px-2.5 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-lg shadow-2xs shrink-0 cursor-pointer"
              >
                ⚡ Auto-Fill Agreed Rates
              </button>
            </div>
          )}
        </div>

        {/* Card 2: Itemized Particulars, Quantity, Rate & Amount */}
        <div className="card p-4 sm:p-5 space-y-3 bg-white border border-surface-200 shadow-2xs">
          <div className="flex items-center justify-between pb-2 border-b border-surface-100">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-blue-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-surface-800">
                Quotation Items ({items.length})
              </h3>
            </div>
            <button
              type="button"
              onClick={handleAddItem}
              className="py-1 px-2.5 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus size={12} />
              <span>Add Row</span>
            </button>
          </div>

          {/* Desktop Items Table */}
          <div className="overflow-x-auto border border-surface-200 rounded-xl">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-surface-50 border-b border-surface-200 text-surface-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-2 text-center w-10">#</th>
                  <th className="py-2.5 px-3">Item Description / Particulars *</th>
                  <th className="py-2.5 px-2 w-32">Brand / Finish</th>
                  <th className="py-2.5 px-2 w-24">Unit</th>
                  <th className="py-2.5 px-2 w-20 text-right">Qty *</th>
                  <th className="py-2.5 px-2.5 w-28 text-right">Rate (₹)</th>
                  <th className="py-2.5 px-3 w-28 text-right">Amount (₹)</th>
                  <th className="py-2.5 px-2 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {items.map((it, idx) => (
                  <tr key={it.id || idx} className="hover:bg-surface-50/50">
                    <td className="p-2 text-center font-bold text-surface-500">
                      {idx + 1}
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        className="input text-xs py-1.5 px-2 font-semibold text-surface-900 border-surface-300 w-full"
                        placeholder="e.g. Living Room - High Gloss Acrylic Laminate 1mm"
                        value={it.item_description}
                        onChange={(e) => handleItemChange(idx, 'item_description', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        className="input text-xs py-1.5 px-2 text-surface-700 border-surface-300 w-full"
                        placeholder="e.g. SHOWHOUSE"
                        value={it.brand || ''}
                        onChange={(e) => handleItemChange(idx, 'brand', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <select
                        className="select text-xs py-1.5 px-1.5 border-surface-300 w-full"
                        value={it.unit}
                        onChange={(e) => handleItemChange(idx, 'unit', e.target.value as UnitType)}
                      >
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className="input text-xs py-1.5 px-2 font-bold text-right border-surface-300 w-full"
                        placeholder="1"
                        value={it.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className="input text-xs py-1.5 px-2 font-mono font-bold text-right border-surface-300 w-full"
                        placeholder="0.00"
                        value={it.rate}
                        onChange={(e) => handleItemChange(idx, 'rate', e.target.value)}
                      />
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-surface-900 text-xs">
                      ₹{it.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        disabled={items.length <= 1}
                        className="p-1 text-surface-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                        title="Remove row"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={handleAddItem}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer pt-1"
          >
            <Plus size={13} />
            <span>+ Add Another Item Row</span>
          </button>
        </div>

        {/* Card 3: Charges, GST & Total Calculation */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Notes & Terms */}
          <div className="md:col-span-7 card p-4 space-y-3 bg-white border border-surface-200">
            <label className="label text-[11px] font-bold text-surface-700">Terms &amp; Notes</label>
            <textarea
              className="textarea text-xs border-surface-300 font-sans"
              rows={4}
              placeholder="1. Interest @ 21% will be charged if the payment of bill not made with 7 days&#10;2. 100% Advance Payment&#10;3. Goods once sold will not be taken back or exchanged"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="text-[11px] text-surface-500 space-y-0.5">
              <p>• Validity: 15 Days from quotation date.</p>
              <p>• Delivery: Dispatched to selected site upon order confirmation.</p>
            </div>
          </div>

          {/* Charges and Totals Summary */}
          <div className="md:col-span-5 card p-4 space-y-2.5 bg-surface-50 border border-surface-200">
            <div className="text-xs font-black uppercase tracking-wider text-surface-800 pb-1 border-b border-surface-200">
              Quotation Summary
            </div>

            <div className="flex justify-between items-center text-xs text-surface-700">
              <span>Total Quantity:</span>
              <span className="font-bold text-surface-900">{totalQuantity} sheets / units</span>
            </div>

            <div className="flex justify-between items-center text-xs text-surface-700">
              <span>Items Subtotal:</span>
              <span className="font-mono font-bold text-surface-900">
                ₹{subtotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Transport Charges */}
            <div className="flex justify-between items-center text-xs text-surface-700 gap-2">
              <span>Transport Charges (₹):</span>
              <input
                type="number"
                min="0"
                className="input text-xs py-1 px-2 font-mono font-bold text-right w-24 border-surface-300"
                placeholder="0"
                value={transportCharges}
                onChange={(e) => setTransportCharges(e.target.value)}
              />
            </div>

            {/* Loading / Selection Charges */}
            <div className="flex justify-between items-center text-xs text-surface-700 gap-2">
              <span>Loading / Selection (₹):</span>
              <input
                type="number"
                min="0"
                className="input text-xs py-1 px-2 font-mono font-bold text-right w-24 border-surface-300"
                placeholder="0"
                value={loadingCharges}
                onChange={(e) => setLoadingCharges(e.target.value)}
              />
            </div>

            {/* GST 18% Toggle */}
            <div className="pt-1 border-t border-surface-200 flex items-center justify-between">
              <label className="text-xs font-bold text-surface-800 flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyGst}
                  onChange={(e) => setApplyGst(e.target.checked)}
                  className="rounded border-surface-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Apply 18% GST (9% CGST + 9% SGST)</span>
              </label>
            </div>

            {applyGst && (
              <div className="text-xs text-surface-600 space-y-1 pl-4">
                <div className="flex justify-between">
                  <span>CGST (9%):</span>
                  <span className="font-mono font-bold text-surface-800">
                    ₹{cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>SGST (9%):</span>
                  <span className="font-mono font-bold text-surface-800">
                    ₹{sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}

            {/* Net Total Amount */}
            <div className="pt-2 border-t border-surface-300 flex justify-between items-center">
              <span className="text-sm font-black text-surface-950">Grand Total:</span>
              <span className="text-base font-black font-mono text-blue-700">
                ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Quick Action Footer inside Card */}
            <div className="pt-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveQuotation('whatsapp')}
                className="w-full py-2.5 px-3 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-98 rounded-lg flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all disabled:opacity-50"
              >
                <Send size={15} />
                <span>⚡ Save &amp; Send to WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Add Site Modal */}
      {showSiteModal && matchedCustomer && (
        <SiteModal
          customer={matchedCustomer}
          onClose={() => setShowSiteModal(false)}
          onSaved={(newSite) => {
            setSelectedSiteId(newSite.id);
            setSelectedSiteName(newSite.site_name);
            if (newSite.site_address) setDeliveryAddress(newSite.site_address);
            setAvailableSites((prev) => [...prev, newSite]);
            setShowSiteModal(false);
          }}
        />
      )}
    </div>
  );
}

export default function NewQuotationPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CreateQuotationContent />
    </React.Suspense>
  );
}
