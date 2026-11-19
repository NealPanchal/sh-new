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
  Sparkles,
  AlertTriangle,
  Tag,
  Percent,
  FileSpreadsheet,
} from 'lucide-react';
import { getTodayISO, cn, formatCurrency, formatDate } from '@/lib/utils';
import { UNIT_OPTIONS } from '@/lib/validations';
import { ChallanItemFormData, UnitType, Customer, Product, CustomerSite, CustomerCreditStatus, Challan, Quotation } from '@/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { downloadChallanPDF, printChallanPDF } from '@/lib/pdf';
import { openWhatsApp, generateShareMessage, shareChallanViaWhatsApp, resolveCustomerPhone } from '@/lib/whatsapp';
import { SiteModal } from '@/components/customers/site-modal';

const emptyItem = (): ChallanItemFormData => ({
  product_id: '',
  item_description: '',
  brand: '',
  colour_finish: '',
  size: '',
  unit: 'sheets',
  quantity: '',
  rate: '',
  discount_type: 'percent',
  discount_value: '',
  discount_amount: '',
  amount: '',
  length: '',
  width: '',
  dimension_unit: 'ft',
  calculated_sqft: '',
});

function CreateChallanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCustomerId = searchParams.get('customerId');
  const preselectedQuotationId = searchParams.get('quotationId');
  const {
    customers,
    products,
    getCustomer,
    getQuotation,
    updateQuotation,
    peekNextChallanNumber,
    getNextChallanNumber,
    peekNextPINumber,
    getNextStaffPONumber,
    createChallan,
    createCustomer,
    profile,
    currentUser,
    isEmployee,
    showToast,
    updateShareStatus,
    challans: liveChallans,
  } = useApp();

  // Core Form State (Speed & Simplicity)
  const [challanDate, setChallanDate] = useState('');
  const [challanNumberPreview, setChallanNumberPreview] = useState('');
  const [piNumberPreview, setPiNumberPreview] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(preselectedCustomerId || '');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [isPoManual, setIsPoManual] = useState(false);
  const [createdBy, setCreatedBy] = useState('');
  const [showExtraDetails, setShowExtraDetails] = useState(false);
  const [sourceQuotation, setSourceQuotation] = useState<Quotation | null>(null);
  const [showSiteModal, setShowSiteModal] = useState(false);

  // Site Management State
  const [availableSites, setAvailableSites] = useState<CustomerSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedSiteName, setSelectedSiteName] = useState('');

  // Credit Control & 45-Day Block State
  const [creditStatus, setCreditStatus] = useState<CustomerCreditStatus | null>(null);

  // Intelligent Previous Order Detection
  const [previousChallan, setPreviousChallan] = useState<Challan | null>(null);

  // Items
  const [items, setItems] = useState<ChallanItemFormData[]>([emptyItem()]);

  // Overall Challan Discount State
  const [overallDiscountType, setOverallDiscountType] = useState<'percent' | 'amount'>('percent');
  const [overallDiscountValue, setOverallDiscountValue] = useState('');

  // Additional Charges & GST
  const [transportCharges, setTransportCharges] = useState('');
  const [loadingCharges, setLoadingCharges] = useState('');
  const [applyGst, setApplyGst] = useState(false);
  const [applyAdditional9, setApplyAdditional9] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Fetch sites and credit control whenever customer changes
  useEffect(() => {
    const custId =
      selectedCustomerId ||
      customers.find(
        (c) => c.business_name.toLowerCase() === customerName.trim().toLowerCase()
      )?.id;

    if (custId) {
      // 1. Fetch Sites
      fetch(`/api/sites?customerId=${custId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.sites) {
            setAvailableSites(d.sites);
          } else {
            setAvailableSites([]);
          }
        })
        .catch(() => setAvailableSites([]));

      // 2. Fetch Credit Status
      fetch(`/api/credit-control?customerId=${custId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.status) {
            setCreditStatus(d.status);
          } else {
            setCreditStatus(null);
          }
        })
        .catch(() => setCreditStatus(null));
    } else {
      setAvailableSites([]);
      setCreditStatus(null);
      setSelectedSiteId('');
      setSelectedSiteName('');
    }

    // 3. Find Previous Order for this Customer
    if (custId || customerName.trim()) {
      const prev = liveChallans
        .filter(
          (c) =>
            (c.customer_id === custId ||
              c.customer_name?.toLowerCase() === customerName.trim().toLowerCase()) &&
            c.status !== 'cancelled' &&
            c.status !== 'void'
        )
        .sort((a, b) => new Date(b.challan_date).getTime() - new Date(a.challan_date).getTime())[0];

      setPreviousChallan(prev || null);
    } else {
      setPreviousChallan(null);
    }
  }, [selectedCustomerId, customerName, customers, liveChallans]);

  const handleUsePreviousItems = () => {
    if (!previousChallan || !previousChallan.items || previousChallan.items.length === 0) return;
    const cloned: ChallanItemFormData[] = previousChallan.items.map((it) => ({
      product_id: it.product_id || '',
      item_description: it.item_description,
      brand: it.brand || '',
      colour_finish: it.colour_finish || '',
      size: it.size || '',
      unit: it.unit || 'sheets',
      quantity: String(it.quantity || '1'),
      rate: it.rate != null ? String(it.rate) : '',
      discount_type: 'percent',
      discount_value: '',
      discount_amount: '',
      amount: it.amount != null ? String(it.amount) : '',
      length: '',
      width: '',
      dimension_unit: 'ft',
      calculated_sqft: '',
    }));
    setItems(cloned);
    showToast(
      `Loaded ${cloned.length} item(s) from previous order ${previousChallan.challan_number} with last rates!`,
      'success'
    );
  };

  const matchedCustomer = useMemo(() => {
    return (
      customers.find(
        (c) =>
          (selectedCustomerId && c.id === selectedCustomerId) ||
          c.business_name.toLowerCase() === customerName.trim().toLowerCase()
      ) || null
    );
  }, [customers, selectedCustomerId, customerName]);

  const customerSites: CustomerSite[] = useMemo(() => {
    const list: CustomerSite[] = [];
    const seen = new Set<string>();

    if (matchedCustomer?.sites && Array.isArray(matchedCustomer.sites)) {
      matchedCustomer.sites.forEach((s) => {
        if (s.id && !seen.has(s.id)) {
          seen.add(s.id);
          list.push(s);
        }
      });
    }

    availableSites.forEach((s) => {
      if (s.id && !seen.has(s.id)) {
        seen.add(s.id);
        list.push(s);
      }
    });

    if (list.length === 0 && (matchedCustomer?.delivery_address || deliveryAddress)) {
      const addr = matchedCustomer?.delivery_address || deliveryAddress;
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
  }, [matchedCustomer?.sites, matchedCustomer?.delivery_address, availableSites, deliveryAddress, matchedCustomer?.id]);

  const handleLoadCustomerAgreedMaterials = () => {
    if (!matchedCustomer?.material_rates || matchedCustomer.material_rates.length === 0) return;

    let targetRates = matchedCustomer.material_rates;
    if (selectedSiteName && selectedSiteName !== 'All Sites') {
      const siteFiltered = targetRates.filter(
        (m) =>
          m.site_name?.toLowerCase() === selectedSiteName.toLowerCase() ||
          (m.site_id && m.site_id === selectedSiteId) ||
          !m.site_name ||
          m.site_name === 'All Sites'
      );
      if (siteFiltered.length > 0) {
        targetRates = siteFiltered;
      }
    }

    const newItems: ChallanItemFormData[] = targetRates.map((m) => {
      const desc = m.particulars?.trim() || [m.code, m.company_name, m.room ? `(${m.room})` : ''].filter(Boolean).join(' ');
      return {
        product_id: '',
        item_description: desc,
        brand: m.company_name || '',
        colour_finish: m.room || '',
        size: '',
        unit: 'sheets',
        quantity: '', // blank for user to add quantity
        rate: m.rate ? String(m.rate) : '',
        discount_type: 'percent',
        discount_value: '',
        discount_amount: '',
        amount: '',
        length: '',
        width: '',
        dimension_unit: 'ft',
        calculated_sqft: '',
      };
    });
    setItems(newItems);
    showToast(
      `Loaded ${newItems.length} agreed material(s) for ${selectedSiteName ? `${matchedCustomer.business_name} (${selectedSiteName})` : matchedCustomer.business_name} with pre-agreed rates. Enter quantities to proceed!`,
      'success'
    );
  };

  const findCustomerMaterialRate = (desc: string, prodId?: string, brand?: string | null): number | null => {
    const qDesc = (desc || '').trim().toLowerCase();
    const qBrand = (brand || '').trim().toLowerCase();
    if (!qDesc && !prodId) return null;

    // 1. Check customer's agreed material rates matrix (Particulars, Code, Company, Room)
    if (matchedCustomer?.material_rates && matchedCustomer.material_rates.length > 0) {
      const foundMat = matchedCustomer.material_rates.find((mr) => {
        const cCode = (mr.code || '').trim().toLowerCase();
        const cComp = (mr.company_name || '').trim().toLowerCase();
        const cRoom = (mr.room || '').trim().toLowerCase();
        const cPart = (mr.particulars || '').trim().toLowerCase();

        if (cPart && (qDesc.includes(cPart) || cPart.includes(qDesc))) return true;
        if (cCode && (qDesc.includes(cCode) || cCode.includes(qDesc))) return true;
        if (cComp && qBrand && (cComp === qBrand || qDesc.includes(cComp))) return true;
        if (cComp && qDesc.includes(cComp)) return true;
        if (cRoom && qDesc.includes(cRoom)) return true;
        return false;
      });
      if (foundMat && Number(foundMat.rate) > 0) {
        return Number(foundMat.rate);
      }
    }

    // 2. Price Memory Engine: Check prior challans for this customer
    const custId = matchedCustomer?.id || selectedCustomerId;
    const custName = (matchedCustomer?.business_name || customerName || '').trim().toLowerCase();

    const customerPastChallans = liveChallans.filter(
      (c) =>
        (c.customer_id === custId ||
          (c.customer_name && c.customer_name.trim().toLowerCase() === custName)) &&
        c.status !== 'cancelled' &&
        c.status !== 'void'
    );

    for (const ch of customerPastChallans) {
      if (!ch.items) continue;
      const matchedItem = ch.items.find((it) => {
        if (prodId && it.product_id && it.product_id === prodId) return true;
        const itDesc = (it.item_description || '').trim().toLowerCase();
        if (itDesc && (itDesc === qDesc || itDesc.includes(qDesc) || qDesc.includes(itDesc))) {
          return true;
        }
        return false;
      });
      if (matchedItem && matchedItem.rate != null && Number(matchedItem.rate) > 0) {
        return Number(matchedItem.rate);
      }
    }

    return null;
  };

  const employeeList: string[] = useMemo(() => {
    if (profile?.employees && profile.employees.length > 0) {
      return profile.employees;
    }
    return ['Neal', 'Vrushank'];
  }, [profile?.employees]);

  // Auto-set staff creator on initial load (with employee identity support)
  useEffect(() => {
    if (currentUser?.name) {
      const match = employeeList.find(
        (e) => e.toLowerCase() === currentUser.name.toLowerCase()
      );
      if (match && createdBy !== match) {
        setCreatedBy(match);
        return;
      }
    }
    if (employeeList.length > 0 && (!createdBy || !employeeList.includes(createdBy))) {
      setCreatedBy(employeeList[0]);
    }
  }, [employeeList, createdBy, currentUser]);

  // Auto-populate staff-specific continuous PO sequence (e.g. Vrushank: PO VS 001, Bhavin: PO BH 001, etc.)
  useEffect(() => {
    if (createdBy && (!referenceNumber || !isPoManual)) {
      try {
        const nextPO = getNextStaffPONumber(createdBy);
        setReferenceNumber(nextPO);
      } catch (err) {
        console.warn('Could not auto-generate staff PO:', err);
      }
    }
  }, [createdBy, liveChallans, getNextStaffPONumber, isPoManual]);

  const handleCreatorChange = (newCreator: string) => {
    setCreatedBy(newCreator);
    try {
      const nextPO = getNextStaffPONumber(newCreator);
      setReferenceNumber(nextPO);
      setIsPoManual(false);
    } catch {
      // Keep previous
    }
  };

  const [showCancel, setShowCancel] = useState(false);

  // Autocomplete UI
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [activeProductRow, setActiveProductRow] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    setChallanDate(getTodayISO());
    try {
      setChallanNumberPreview(peekNextChallanNumber());
    } catch {
      setChallanNumberPreview('SH/2026-27/0001');
    }
    try {
      setPiNumberPreview(peekNextPINumber());
    } catch {
      setPiNumberPreview('PI/2026-27/0001');
    }
  }, [peekNextChallanNumber, peekNextPINumber, liveChallans]);

  // Pre-select customer if passed in URL
  useEffect(() => {
    if (preselectedCustomerId) {
      const c = getCustomer(preselectedCustomerId);
      if (c) selectCustomer(c);
    }
  }, [preselectedCustomerId, getCustomer]);

  // Pre-load from quotation if quotationId is passed in URL
  useEffect(() => {
    if (preselectedQuotationId) {
      const q = getQuotation(preselectedQuotationId);
      if (q) {
        setSourceQuotation(q);
        if (q.customer_id) {
          const c = getCustomer(q.customer_id);
          if (c) {
            selectCustomer(c);
          } else {
            setSelectedCustomerId(q.customer_id);
            setCustomerName(q.customer_name);
            setCustomerPhone(q.customer_phone || '');
          }
        }
        if (q.site_id) setSelectedSiteId(q.site_id);
        if (q.site_name) setSelectedSiteName(q.site_name);
        if (q.delivery_address) setDeliveryAddress(q.delivery_address);
        if (q.apply_gst) setApplyGst(true);

        if (q.items && q.items.length > 0) {
          setItems(
            q.items.map((it) => ({
              product_id: it.product_id || '',
              item_description: it.item_description,
              brand: it.brand || '',
              colour_finish: it.colour_finish || '',
              size: it.size || '',
              unit: it.unit || 'sheets',
              quantity: String(it.quantity),
              rate: String(it.rate),
              discount_type: 'percent',
              discount_value: '',
              discount_amount: '',
              amount: String(it.amount),
              length: '',
              width: '',
              dimension_unit: 'ft',
              calculated_sqft: '',
            }))
          );
        }
        showToast(`⚡ Pre-filled items & rates from Quotation ${q.quotation_number}`, 'info');
      }
    }
  }, [preselectedQuotationId, getQuotation, getCustomer]);

  const filteredCustomers = useMemo(() => {
    let list = customers;
    if (currentUser?.role === 'employee') {
      const uName = (currentUser.name || '').toLowerCase().trim();
      const uUser = (currentUser.username || '').toLowerCase().trim();
      list = list.filter((c) => {
        const cr = (c.created_by || '').toLowerCase().trim();
        const crN = (c.creator_name || '').toLowerCase().trim();
        const uId = (c.user_id || '').toLowerCase().trim();
        return (
          (uUser && (cr === uUser || uId === uUser)) ||
          (uName && (cr.includes(uName) || crN.includes(uName) || uId.includes(uName)))
        );
      });
    }
    if (!customerSearch.trim()) return list.slice(0, 6);
    const q = customerSearch.toLowerCase();
    return list.filter(
      (c) =>
        c.business_name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
    ).slice(0, 8);
  }, [customers, customerSearch, currentUser]);

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
    if (customer.sites && customer.sites.length > 0) {
      setSelectedSiteId(customer.sites[0].id);
      setSelectedSiteName(customer.sites[0].site_name || 'Site 1');
      setDeliveryAddress(customer.sites[0].site_address || customer.delivery_address || customer.billing_address || '');
    } else {
      setSelectedSiteId('');
      setSelectedSiteName('Site 1');
      setDeliveryAddress(customer.delivery_address || customer.billing_address || '');
    }
    setCustomerSearch('');
    setShowCustomerDropdown(false);
  };

  const selectProduct = (rowIndex: number, product: Product) => {
    const newItems = [...items];
    const customerSavedRate = findCustomerMaterialRate(product.name, product.id, product.brand);
    const effectiveRate = customerSavedRate != null ? customerSavedRate : (product.default_rate || 0);

    newItems[rowIndex] = {
      ...newItems[rowIndex],
      product_id: product.id,
      item_description: product.name,
      brand: product.brand || '',
      colour_finish: product.colour_design || '',
      size: product.size_thickness || '',
      unit: product.unit,
      rate: effectiveRate ? String(effectiveRate) : '',
    };
    if (newItems[rowIndex].quantity && effectiveRate) {
      newItems[rowIndex].amount = String(Number(newItems[rowIndex].quantity) * effectiveRate);
    }
    setItems(newItems);
    setActiveProductRow(null);
    setProductSearch('');

    if (customerSavedRate != null) {
      showToast(`⚡ Price Memory: Auto-applied party rate ₹${customerSavedRate} for "${product.name}"`, 'info');
    }
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

    if (field === 'item_description' && (!it.rate || it.rate === '0')) {
      const memoryRate = findCustomerMaterialRate(value);
      if (memoryRate != null) {
        it.rate = String(memoryRate);
        showToast(`⚡ Price Memory: Auto-applied saved party rate ₹${memoryRate}`, 'info');
      }
    }

    const qty = Number(it.quantity) || 0;
    const rate = it.rate ? Number(it.rate) : 0;
    const len = Number(it.length) || 0;
    const wid = Number(it.width) || 0;
    const dimUnit = it.dimension_unit || 'ft';

    let baseAmount = 0;
    // Dimension calculation for sq.ft & running ft
    if (it.unit === 'sq.ft' && len > 0 && wid > 0) {
      // Area in sq.ft: if in inches (L*W)/144, if in feet L*W
      const sqftPerPc = dimUnit === 'in' ? (len * wid) / 144 : len * wid;
      const totalSqft = Math.round(qty * sqftPerPc * 100) / 100;
      it.calculated_sqft = String(totalSqft);
      baseAmount = rate > 0 ? Math.round(totalSqft * rate) : 0;
    } else if (it.unit === 'running ft' && len > 0) {
      const totalRft = Math.round(qty * len * 100) / 100;
      it.calculated_sqft = String(totalRft);
      baseAmount = rate > 0 ? Math.round(totalRft * rate) : 0;
    } else {
      it.calculated_sqft = '';
      baseAmount = rate > 0 && qty > 0 ? Math.round(qty * rate * 100) / 100 : 0;
    }

    // Apply item level discount
    const discVal = Number(it.discount_value) || 0;
    let discAmt = 0;
    if (discVal > 0 && baseAmount > 0) {
      if (it.discount_type === 'percent') {
        discAmt = Math.round(((baseAmount * discVal) / 100) * 100) / 100;
      } else {
        discAmt = Math.min(baseAmount, discVal);
      }
    }
    it.discount_amount = discAmt > 0 ? String(discAmt) : '';
    it.amount = baseAmount > 0 ? String(Math.max(0, Math.round((baseAmount - discAmt) * 100) / 100)) : '';

    newItems[index] = it;
    setItems(newItems);
  };

  // Calculations
  const totalQuantity = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }, [items]);

  const itemsSubtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [items]);

  const transport = Number(transportCharges) || 0;
  const loading = Number(loadingCharges) || 0;
  const grossSubtotal = itemsSubtotal + transport + loading;

  const overallDiscountAmount = useMemo(() => {
    const val = Number(overallDiscountValue) || 0;
    if (val <= 0 || grossSubtotal <= 0) return 0;
    if (overallDiscountType === 'percent') {
      return Math.round(((grossSubtotal * val) / 100) * 100) / 100;
    }
    return Math.min(grossSubtotal, val);
  }, [grossSubtotal, overallDiscountValue, overallDiscountType]);

  const taxableSubtotal = Math.max(0, grossSubtotal - overallDiscountAmount);

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

    // 45-day overdue / credit limit company-wide guard for employees
    if (creditStatus?.isBlocked && isEmployee) {
      showToast(
        'BILLING RESTRICTED: Customer has invoices overdue for >45 days or credit limit exceeded. Staff cannot create challans.',
        'error'
      );
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

      // Auto-resolve customer phone if not typed
      let finalPhone = customerPhone.trim();
      if (!finalPhone && customerName.trim()) {
        finalPhone = resolveCustomerPhone(
          { customer_id: finalCustomerId || '', customer_name: customerName.trim(), customer_phone: '' } as any,
          customers,
          liveChallans
        );
      }

      const challan = await createChallan(
        {
          challan_date: challanDate,
          challan_number: challanNumberPreview,
          pi_number: piNumberPreview,
          document_type: 'both',
          customer_id: finalCustomerId || '',
          customer_name: customerName.trim(),
          customer_phone: finalPhone,
          customer_address: deliveryAddress.trim(),
          delivery_address: deliveryAddress.trim(),
          site_id: selectedSiteId || undefined,
          site_name: selectedSiteName || undefined,
          reference_number: referenceNumber.trim() || getNextStaffPONumber(createdBy),
          prepared_by: createdBy.trim() || employeeList[0] || 'Neal',
          created_by: createdBy.trim() || employeeList[0] || 'Neal',
          status,
          total_quantity: totalQuantity,
          discount_percent: overallDiscountType === 'percent' && Number(overallDiscountValue) > 0 ? Number(overallDiscountValue) : null,
          discount_amount: overallDiscountAmount > 0 ? overallDiscountAmount : null,
          subtotal_amount: taxableSubtotal > 0 ? taxableSubtotal : null,
          transportation_charges: transport > 0 ? transport : null,
          loading_charges: loading > 0 ? loading : null,
          apply_gst: applyGst,
          cgst_amount: cgstAmount > 0 ? cgstAmount : null,
          sgst_amount: sgstAmount > 0 ? sgstAmount : null,
          apply_additional_9: applyAdditional9,
          additional_9_amount: additional9Amount > 0 ? additional9Amount : null,
          total_amount: totalAmount > 0 ? totalAmount : null,
        },
        validItems.map((it) => {
          let derivedSize = it.size || null;
          if (!derivedSize && it.length) {
            derivedSize = it.width
              ? `${it.length}×${it.width} ${it.dimension_unit || 'ft'}`
              : `${it.length} ${it.dimension_unit || 'ft'}`;
          }
          return {
            product_id: it.product_id || null,
            item_description: it.item_description.trim(),
            brand: it.brand || null,
            colour_finish: it.colour_finish || null,
            size: derivedSize,
            unit: it.unit as UnitType,
            quantity: Number(it.quantity),
            rate: it.rate ? Number(it.rate) : null,
            discount_percent: it.discount_type === 'percent' && Number(it.discount_value) > 0 ? Number(it.discount_value) : null,
            discount_amount: it.discount_amount ? Number(it.discount_amount) : null,
            amount: it.amount ? Number(it.amount) : null,
            length: it.length ? Number(it.length) : null,
            width: it.width ? Number(it.width) : null,
            dimension_unit: it.dimension_unit || 'ft',
            calculated_sqft: it.calculated_sqft ? Number(it.calculated_sqft) : null,
          };
        })
      );

      if (action === 'print' && profile) {
        printChallanPDF({
          challan,
          items: challan.items || [],
          profile,
        });
      }

      if (action === 'whatsapp' && profile) {
        const phoneToUse = finalPhone || (challan.customer_phone || '').trim();
        if (phoneToUse) {
          await shareChallanViaWhatsApp({
            challan,
            phoneOverride: phoneToUse,
            items: challan.items || [],
            profile,
            onToast: showToast,
          });
          updateShareStatus(challan.id, 'share_initiated');
        } else {
          showToast('Challan saved, but no customer phone was found for WhatsApp', 'info');
        }
      }

      if (sourceQuotation) {
        updateQuotation(sourceQuotation.id, {
          status: 'converted',
          converted_challan_id: challan.id,
          converted_challan_number: challan.challan_number,
        });
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
          {customerPhone && (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave('final', 'whatsapp')}
              className="btn-primary py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              title="Save & Share WhatsApp"
            >
              <Send size={14} />
              <span>Save & WhatsApp</span>
            </button>
          )}
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
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Customer Name Search / Input */}
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

          {/* Pre-filled Quotation Linked Banner */}
          {sourceQuotation && (
            <div className="sm:col-span-12 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-300 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-600 text-white shrink-0">
                  <FileSpreadsheet size={16} />
                </div>
                <div>
                  <span className="font-bold text-blue-950">
                    ⚡ Pre-filled from Quotation {sourceQuotation.quotation_number}
                  </span>
                  <p className="text-[11px] text-blue-800 mt-0.5">
                    Imported {sourceQuotation.items?.length || 0} items ({sourceQuotation.total_quantity} sheets) · Quotation Amount: ₹{Number(sourceQuotation.total_amount || 0).toLocaleString('en-IN')}. Review quantities &amp; save to issue Delivery Challan.
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-blue-200 text-blue-950 font-black text-[10px] uppercase shrink-0">
                Quotation Linked
              </span>
            </div>
          )}

          {/* Multiple Site Selector for Customer */}
          {(matchedCustomer || customerSites.length > 0) && (
            <div className="sm:col-span-12 p-3 bg-amber-50/70 rounded-xl border border-amber-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-surface-900 flex items-center gap-1.5">
                  <Building2 size={14} className="text-[#ea580c]" />
                  <span>Target Delivery Site ({customerSites.length} Configured)</span>
                </label>
                {matchedCustomer && (
                  <button
                    type="button"
                    onClick={() => setShowSiteModal(true)}
                    className="py-1 px-2.5 text-[11px] font-bold bg-white text-[#ea580c] hover:bg-orange-50 border border-orange-300 rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>+ Add Site ({`Site ${customerSites.length + 1}`})</span>
                  </button>
                )}
              </div>

              {/* Site Selection Pills */}
              <div className="flex flex-wrap items-center gap-2">
                {customerSites.map((s, idx) => {
                  const isSelected = selectedSiteId === s.id || selectedSiteName === s.site_name;
                  return (
                    <button
                      key={s.id || idx}
                      type="button"
                      onClick={() => {
                        setSelectedSiteId(s.id);
                        setSelectedSiteName(s.site_name || s.name || `Site ${idx + 1}`);
                        const addr = s.site_address || s.location || '';
                        if (addr) setDeliveryAddress(addr);
                        showToast(`📍 Selected ${s.site_name || `Site ${idx + 1}`}`, 'info');
                      }}
                      className={cn(
                        'py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border',
                        isSelected
                          ? 'bg-[#ea580c] text-white border-[#ea580c] shadow-sm'
                          : 'bg-white text-surface-700 hover:bg-surface-100 border-surface-200'
                      )}
                    >
                      <MapPin size={12} className={isSelected ? 'text-amber-200' : 'text-[#ea580c]'} />
                      <span>{s.site_name || s.name || `Site ${idx + 1}`}</span>
                      {s.site_address && (
                        <span className={cn('text-[10px] font-normal truncate max-w-[140px]', isSelected ? 'text-white/80' : 'text-surface-400')}>
                          ({s.site_address})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Selected site active address confirmation */}
              {deliveryAddress && (
                <div className="text-[11px] text-surface-600 flex items-center gap-1.5 pt-1 border-t border-amber-200/50">
                  <span className="font-semibold text-surface-700">Delivery Address:</span>
                  <span className="truncate">{deliveryAddress}</span>
                </div>
              )}
            </div>
          )}

          {/* Credit Block Warning Banner */}
          {creditStatus?.isBlocked && (
            <div className="sm:col-span-12 p-3 bg-red-50 border border-red-300 rounded-xl text-xs text-red-800 flex items-start gap-2.5">
              <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-extrabold block text-sm">
                  ⚠️ BILLING RESTRICTED: Customer Credit Block
                </span>
                <p className="mt-0.5">
                  {creditStatus.isOverdue
                    ? `Payment overdue for more than 45 days (${creditStatus.daysOverdue} days past due).`
                    : 'Customer outstanding balance exceeds credit limit.'}{' '}
                  Total Outstanding: <strong>₹{creditStatus.totalOutstanding.toLocaleString('en-IN')}</strong>.
                  {isEmployee
                    ? ' Staff cannot create challans for this customer.'
                    : ' Admin override authority active.'}
                </p>
              </div>
            </div>
          )}

          {/* Previous Order Suggestion Banner */}
          {previousChallan && (
            <div className="sm:col-span-12 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="flex items-start gap-2">
                <Sparkles size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-zinc-900">
                    Previous Order Detected: {previousChallan.challan_number} ({formatDate(previousChallan.challan_date)})
                  </span>
                  <p className="text-[11px] text-zinc-600 mt-0.5">
                    Last used items:{' '}
                    <span className="font-medium text-zinc-800">
                      {(previousChallan.items || [])
                        .map((it) => `${it.item_description} @ ₹${it.rate || '—'}`)
                        .slice(0, 3)
                        .join(', ')}
                      {(previousChallan.items || []).length > 3 ? '...' : ''}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleUsePreviousItems}
                className="btn-secondary py-1.5 px-3 text-xs font-bold bg-white text-amber-800 border-amber-300 hover:bg-amber-50 shrink-0 self-start sm:self-auto shadow-2xs"
              >
                <Sparkles size={13} className="text-amber-600" />
                <span>Use Previous Challan Items</span>
              </button>
            </div>
          )}

          {/* Customer Agreed Materials Matrix Auto-Fetch Banner (4 Columns: Room, Code, Company, Rate) */}
          {matchedCustomer?.material_rates && matchedCustomer.material_rates.length > 0 && (
            <div className="sm:col-span-12 p-3 bg-blue-50/90 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="flex items-start gap-2">
                <Layers size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-blue-950 flex items-center gap-1.5">
                    <span>Customer Agreed Materials Configured</span>
                    <span className="px-1.5 py-0.2 bg-blue-200 text-blue-800 rounded font-black text-[10px]">
                      {matchedCustomer.material_rates.length} {matchedCustomer.material_rates.length === 1 ? 'Item' : 'Items'}
                    </span>
                  </span>
                  <p className="text-[11px] text-blue-800 mt-0.5">
                    Room / Code / Company matrix with locked party rates:{' '}
                    <span className="font-semibold text-blue-900">
                      {matchedCustomer.material_rates
                        .map((m) => `${m.code || m.company_name} (${m.room || 'General'}) @ ₹${m.rate}`)
                        .slice(0, 3)
                        .join(' · ')}
                      {matchedCustomer.material_rates.length > 3 ? ' ...' : ''}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLoadCustomerAgreedMaterials}
                className="btn-primary py-1.5 px-3 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shrink-0 self-start sm:self-auto shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
                title="Auto-fill items with locked rates and leave quantity blank"
              >
                <Layers size={13} />
                <span>
                  {selectedSiteName
                    ? `⚡ Auto-Fetch ${selectedSiteName} Materials`
                    : '⚡ Auto-Fetch Agreed Materials'}
                </span>
              </button>
            </div>
          )}

          {/* Challan Date */}
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
              onChange={(e) => handleCreatorChange(e.target.value)}
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
                {challanNumberPreview || 'SH/2026-27/0001'}
              </span>
            </div>

            {/* PI No */}
            <div>
              <span className="text-[10px] uppercase font-bold text-surface-500 tracking-wider block">
                PI # (Proforma Invoice)
              </span>
              <span className="font-mono font-bold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200 text-xs shadow-2xs inline-block">
                {piNumberPreview || 'PI/2026-27/0001'}
              </span>
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
                    setIsPoManual(false);
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
                  onChange={(e) => {
                    setReferenceNumber(e.target.value);
                    setIsPoManual(true);
                  }}
                  placeholder="e.g. PO VS 001"
                  className="input text-xs font-mono font-bold bg-white text-surface-900 h-7 max-w-[150px]"
                />
                <span className="text-[10px] text-surface-500">
                  {isPoManual ? '(Manual)' : '(Auto-incrementing)'}
                </span>
              </div>
            </div>
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

              {/* Quantity, Unit, Rate, Discount, and Amount */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pl-7">
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-semibold text-surface-500 uppercase">
                      Discount
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const nextType = item.discount_type === 'percent' ? 'amount' : 'percent';
                        updateItem(idx, 'discount_type', nextType);
                      }}
                      className="text-[9px] font-bold text-primary-600 hover:text-primary-800"
                    >
                      {item.discount_type === 'percent' ? '%' : '₹'}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={item.discount_value || ''}
                      onChange={(e) => updateItem(idx, 'discount_value', e.target.value)}
                      placeholder={item.discount_type === 'percent' ? '0%' : '₹0'}
                      className="input text-xs py-1.5 font-mono pr-5"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-surface-400">
                      {item.discount_type === 'percent' ? '%' : '₹'}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-surface-500 uppercase block mb-1">
                    Net Amount (₹)
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

      {/* Transportation, Loading & GST Charges Section */}
      <div className="card p-3 sm:p-4 bg-white border border-surface-200 space-y-3">
        <div className="flex items-center justify-between pb-1 border-b border-surface-100">
          <span className="text-xs font-bold uppercase tracking-wider text-surface-800">
            Transportation, Loading & Tax Charges
          </span>
          <span className="text-[11px] text-surface-400 font-medium">Optional Rows</span>
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

        {/* Overall Challan Level Discount */}
        <div className="pt-2 border-t border-surface-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/30 p-2.5 rounded-lg border border-amber-200/60">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-amber-600" />
            <div>
              <span className="text-xs font-bold text-zinc-900 block">Overall Challan Discount</span>
              <span className="text-[10px] text-zinc-500">Apply cash (₹) or percentage (%) discount on entire challan</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-surface-300 bg-white overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setOverallDiscountType('percent')}
                className={`px-2.5 py-1 font-bold ${
                  overallDiscountType === 'percent' ? 'bg-primary-500 text-white' : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                %
              </button>
              <button
                type="button"
                onClick={() => setOverallDiscountType('amount')}
                className={`px-2.5 py-1 font-bold ${
                  overallDiscountType === 'amount' ? 'bg-primary-500 text-white' : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                ₹
              </button>
            </div>
            <input
              type="number"
              min="0"
              value={overallDiscountValue}
              onChange={(e) => setOverallDiscountValue(e.target.value)}
              placeholder={overallDiscountType === 'percent' ? 'e.g. 10%' : 'e.g. 1000'}
              className="input text-xs py-1.5 font-mono w-28 bg-white"
            />
            {overallDiscountAmount > 0 && (
              <span className="text-xs font-bold text-amber-700 font-mono whitespace-nowrap bg-amber-100/80 px-2 py-1 rounded">
                - ₹{overallDiscountAmount.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        </div>

        {/* GST Toggle Option */}
        <div className="pt-2 border-t border-surface-100">
          <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-surface-50 transition-colors border border-surface-200">
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
            <div className="mt-2.5 p-3 rounded-lg bg-surface-50 border border-surface-200 text-xs space-y-1.5 font-mono">
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
              {overallDiscountAmount > 0 && (
                <div className="flex justify-between text-amber-700 font-semibold">
                  <span>Challan Discount ({overallDiscountType === 'percent' ? `${overallDiscountValue}%` : 'Cash'}):</span>
                  <span>- ₹{overallDiscountAmount.toLocaleString('en-IN')}</span>
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
              {totalQuantity}{' '}
              <span className="text-xs text-white font-normal">
                {items[0]?.unit || 'sheets'}
              </span>
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
            {applyGst ? 'Grand Total with 18% GST' : totalAmount > 0 ? 'Live Rate Total' : 'Total Quantity'}
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

      {/* Quick Add Site Modal */}
      {showSiteModal && matchedCustomer && (
        <SiteModal
          customer={matchedCustomer}
          onClose={() => setShowSiteModal(false)}
          onSaved={(newSite) => {
            setSelectedSiteId(newSite.id);
            setSelectedSiteName(newSite.site_name);
            if (newSite.site_address) setDeliveryAddress(newSite.site_address);
          }}
        />
      )}
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
