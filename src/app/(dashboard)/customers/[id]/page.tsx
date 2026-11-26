'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import * as store from '@/lib/demo-store';
import {
  ArrowLeft,
  Edit,
  Phone,
  MapPin,
  FileText,
  Plus,
  Building2,
  Calendar,
  Layers,
  Send,
  Download,
  Trash2,
  ShieldCheck,
  FileSpreadsheet,
  ArrowRight,
  ExternalLink,
  Eye,
} from 'lucide-react';
import { formatPhone, formatDateIndian, cn, deduplicateMaterialRates } from '@/lib/utils';
import { CustomerFormModal } from '@/components/customers/customer-form-modal';
import { QuotationModal } from '@/components/quotations/quotation-modal';
import { QuotationViewModal } from '@/components/quotations/quotation-view-modal';
import { SiteModal } from '@/components/customers/site-modal';
import { MaterialRateModal } from '@/components/customers/material-rate-modal';
import { exportCustomerRatesToPDF } from '@/lib/pdf-rates';
import { exportQuotationToPDF } from '@/lib/pdf-quotation';
import { shareCustomerRatesViaWhatsApp, shareQuotationViaWhatsApp } from '@/lib/whatsapp';
import { getCurrentUser } from '@/lib/auth';
import { CustomerMaterialRate, CustomerSite, Quotation } from '@/types';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const {
    getCustomer,
    getCustomerChallans,
    getCustomerQuotations,
    deleteQuotation,
    updateCustomer,
    customers,
    quotations: allQuotations,
    challans: allChallans,
    dataVersion,
    profile,
    showToast,
  } = useApp();

  const [showEdit, setShowEdit] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [activeSiteFilter, setActiveSiteFilter] = useState<string>('all');
  const [activeChallanSiteFilter, setActiveChallanSiteFilter] = useState<string>('all');
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
  const [viewingQuotation, setViewingQuotation] = useState<Quotation | null>(null);
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [editingSite, setEditingSite] = useState<CustomerSite | null>(null);

  const [selectedRateIds, setSelectedRateIds] = useState<Set<string>>(new Set());
  const currentUser = useMemo(() => getCurrentUser(), []);
  const isEmp = currentUser?.role === 'employee';

  const customerId = params.id as string;
  const customer = useMemo(
    () => getCustomer(customerId),
    [getCustomer, customerId, customers, dataVersion]
  );
  const challans = useMemo(
    () => getCustomerChallans(customerId),
    [getCustomerChallans, customerId, allChallans, dataVersion]
  );
  const quotations = useMemo(
    () => getCustomerQuotations(customerId),
    [getCustomerQuotations, customerId, allQuotations, dataVersion]
  );

  const displayedChallans = useMemo(() => {
    if (activeChallanSiteFilter === 'all') return challans;
    return challans.filter(
      (c) =>
        c.site_name === activeChallanSiteFilter ||
        c.site_id === activeChallanSiteFilter ||
        (c.delivery_address && c.delivery_address.toLowerCase().includes(activeChallanSiteFilter.toLowerCase()))
    );
  }, [challans, activeChallanSiteFilter]);

  useEffect(() => {
    if (!customerId) return;
    const fetchQuotations = async () => {
      try {
        const res = await fetch(`/api/quotations?customerId=${encodeURIComponent(customerId)}&_t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.success && Array.isArray(data.quotations)) {
            store.syncQuotations(data.quotations);
          }
        }
      } catch { }
    };
    fetchQuotations();
  }, [customerId]);

  const materialRates: CustomerMaterialRate[] = useMemo(() => {
    return deduplicateMaterialRates(customer?.material_rates, customer?.sites);
  }, [customer?.material_rates, customer?.sites]);

  const displayedRates: CustomerMaterialRate[] = useMemo(() => {
    if (activeSiteFilter === 'all') return materialRates;
    const norm = (s?: string | null) => (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
    const filterNorm = norm(activeSiteFilter);
    return materialRates.filter((r) => {
      const siteNorm = norm(r.site_name || r.site_id);
      return siteNorm === filterNorm || r.site_id === activeSiteFilter || (!r.site_name && activeSiteFilter === 'all');
    });
  }, [materialRates, activeSiteFilter]);

  // Multiple Sites derivation
  const customerSites: CustomerSite[] = useMemo(() => {
    if (Array.isArray(customer?.sites) && customer.sites.length > 0) {
      return customer.sites;
    }
    if (customer?.delivery_address) {
      return [
        {
          id: `site_1_${customer.id}`,
          customer_id: customer.id,
          site_name: 'Site 1',
          site_address: customer.delivery_address,
          created_at: customer.created_at || new Date().toISOString(),
        },
      ];
    }
    return [];
  }, [customer?.sites, customer?.delivery_address, customer?.id, customer?.created_at]);

  const handleDeleteSite = (siteId: string, siteName: string) => {
    if (!customer) return;
    if (!confirm(`Are you sure you want to delete ${siteName}?`)) return;

    const remaining = (customer.sites || []).filter((s) => s.id !== siteId);
    updateCustomer(customer.id, {
      sites: remaining,
    });
    fetch(`/api/sites?id=${encodeURIComponent(siteId)}`, {
      method: 'DELETE',
    }).catch(() => { });
    showToast(`Removed ${siteName}`, 'info');
  };

  const toggleSelectRate = (id: string) => {
    setSelectedRateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllRates = () => {
    if (selectedRateIds.size === displayedRates.length && displayedRates.length > 0) {
      setSelectedRateIds(new Set());
    } else {
      setSelectedRateIds(new Set(displayedRates.map((mr) => mr.id)));
    }
  };

  const handleDeleteSelectedRates = () => {
    if (!customer || selectedRateIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedRateIds.size} material rate(s)?`)) return;

    const remaining = materialRates.filter((mr) => !selectedRateIds.has(mr.id));
    updateCustomer(customer.id, {
      material_rates: remaining,
    });
    setSelectedRateIds(new Set());
    showToast(`Removed selected material rate(s)`, 'info');
  };

  const getTargetRatesToExport = () => {
    if (selectedRateIds.size > 0) {
      return materialRates.filter((mr) => selectedRateIds.has(mr.id));
    }
    return displayedRates.length > 0 ? displayedRates : materialRates;
  };

  const handleDownloadPDF = () => {
    if (!customer) return;
    const list = getTargetRatesToExport();
    if (list.length === 0) {
      showToast('No material rates to download', 'error');
      return;
    }
    const currentUser = getCurrentUser();
    exportCustomerRatesToPDF({
      customerName: customer.business_name,
      contactPerson: customer.contact_person,
      phone: customer.phone,
      deliveryAddress: customer.delivery_address || customer.billing_address,
      siteName: activeSiteFilter !== 'all' ? activeSiteFilter : undefined,
      profile,
      preparedBy: currentUser?.name || 'VRUSHANK',
      selectedRates: list,
      transportationCharges: customer.transportation_charges,
      selectionCharges: customer.selection_charges,
    });
    showToast('Downloaded Customer Material Selection PDF!', 'success');
  };

  const handleShareWhatsApp = () => {
    if (!customer) return;
    const list = getTargetRatesToExport();
    if (list.length === 0) {
      showToast('No material rates to share', 'error');
      return;
    }
    const user = getCurrentUser();
    shareCustomerRatesViaWhatsApp({
      customerName: customer.business_name,
      phone: customer.phone,
      attendee: user?.name || 'VRUSHANK',
      selectedRates: list,
      transportationCharges: customer.transportation_charges,
      selectionCharges: customer.selection_charges,
      onToast: showToast,
    });
  };

  const handleDeleteQuotation = (q: Quotation) => {
    if (isEmp) {
      showToast('Employees cannot delete quotations. Quotations must be preserved.', 'error');
      return;
    }
    if (!confirm(`Delete quotation ${q.quotation_number}?`)) return;
    deleteQuotation(q.id);
    showToast(`Quotation ${q.quotation_number} deleted`, 'info');
  };

  const handleShareQuotationWhatsApp = (q: Quotation) => {
    shareQuotationViaWhatsApp({
      quotation: q,
      profile,
      onToast: showToast,
    });
  };

  const handleDownloadQuotationPDF = (q: Quotation) => {
    exportQuotationToPDF(q, profile);
    showToast(`Downloaded Quotation ${q.quotation_number} PDF!`, 'success');
  };

  if (!customer) {
    return (
      <div className="card p-8 text-center max-w-md mx-auto">
        <Building2 className="w-10 h-10 mx-auto text-surface-400 mb-2" />
        <p className="text-base font-bold text-surface-800">Customer not found</p>
        <Link href="/customers" className="btn-secondary text-xs mt-3 inline-flex items-center gap-1.5">
          <ArrowLeft size={14} />
          <span>Back to Customers</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 pb-20 sm:pb-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-surface-200">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg text-surface-500 hover:text-surface-900 hover:bg-surface-100 cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-surface-900 tracking-tight flex items-center gap-2">
              <span>{customer.business_name}</span>
              {customer.is_architect && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 uppercase tracking-wide border border-purple-200">
                  Architect
                </span>
              )}
              {customer.credit_status === 'no_credit' || customer.is_credit_blocked ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 uppercase tracking-wide border border-rose-200">
                  No Credit
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 uppercase tracking-wide border border-emerald-200">
                  Credit
                </span>
              )}
            </h1>
            {customer.contact_person && (
              <p className="text-xs text-surface-500">{customer.contact_person}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEdit(true)}
            className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1 cursor-pointer"
          >
            <Edit size={14} />
            <span>Edit Profile</span>
          </button>

          {/* New Quotation Button */}
          <button
            onClick={() => {
              setEditingQuotation(null);
              setShowQuotationModal(true);
            }}
            className="py-1.5 px-3 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 shadow-xs cursor-pointer"
          >
            <Plus size={14} />
            <span>+ New Quotation</span>
          </button>

          {/* New Challan Button */}
          <Link
            href={`/challans/new?customerId=${customer.id}`}
            className="btn-primary py-1.5 px-3 text-xs font-semibold flex items-center gap-1 shadow-xs"
          >
            <Plus size={14} />
            <span>New Challan</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
        {/* Customer Info Card & Multiple Sites */}
        <div className="space-y-3">
          <div className="card p-4 space-y-3">
            <div className="text-xs font-bold text-surface-500 uppercase tracking-wider">
              Customer Information
            </div>

            <div className="space-y-2 text-xs">
              {customer.phone && (
                <div className="flex items-center gap-2 text-surface-700">
                  <Phone size={14} className="text-surface-400 shrink-0" />
                  <a href={`tel:${customer.phone}`} className="hover:text-primary-600 font-medium">
                    {formatPhone(customer.phone)}
                  </a>
                </div>
              )}

              {customer.billing_address && (
                <div className="flex items-start gap-2 text-surface-600">
                  <MapPin size={14} className="text-surface-400 shrink-0 mt-0.5" />
                  <span>{customer.billing_address}</span>
                </div>
              )}

              {customer.gstin && (
                <div className="flex items-center gap-2 text-surface-700 pt-1 border-t border-surface-100">
                  <FileText size={14} className="text-surface-400 shrink-0" />
                  <span className="font-mono text-xs">{customer.gstin}</span>
                </div>
              )}
            </div>
          </div>

          {/* Multiple Delivery Sites Card */}
          <div className="card p-4 space-y-3 border-l-4 border-l-[#ea580c]">
            <div className="flex items-center justify-between pb-1.5 border-b border-surface-100">
              <div className="flex items-center gap-1.5">
                <Building2 size={15} className="text-[#ea580c]" />
                <span className="text-xs font-bold text-surface-900 uppercase tracking-wider">
                  Delivery Sites ({customerSites.length})
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingSite(null);
                  setShowSiteModal(true);
                }}
                className="py-1 px-2 text-[11px] font-bold bg-orange-50 hover:bg-orange-100 text-[#ea580c] border border-orange-200 rounded-md flex items-center gap-1 cursor-pointer"
              >
                <Plus size={11} />
                <span>Add Site</span>
              </button>
            </div>

            {customerSites.length === 0 ? (
              <div className="text-xs text-surface-400 py-2">
                No delivery sites added yet. Click &quot;Add Site&quot; to configure Site 1, Site 2, etc.
              </div>
            ) : (
              <div className="space-y-2">
                {customerSites.map((site, idx) => (
                  <div
                    key={site.id || idx}
                    className="p-2.5 rounded-lg border border-surface-200 bg-surface-50/70 space-y-1 hover:bg-surface-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-surface-900 flex items-center gap-1.5">
                        <span className="px-1.5 py-0.2 rounded bg-[#ea580c]/10 text-[#ea580c] text-[10px] font-black uppercase">
                          {site.site_name || `Site ${idx + 1}`}
                        </span>
                        {idx === 0 && (
                          <span className="text-[9px] text-surface-400 font-normal">(Primary)</span>
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSite(site);
                            setShowSiteModal(true);
                          }}
                          className="p-1 text-surface-400 hover:text-surface-700 cursor-pointer"
                          title="Edit site"
                        >
                          <Edit size={12} />
                        </button>
                        {customerSites.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSite(site.id, site.site_name)}
                            className="p-1 text-surface-400 hover:text-rose-600 cursor-pointer"
                            title="Delete site"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-surface-600 leading-snug">
                      {site.site_address}
                    </p>
                    {site.contact_person && (
                      <p className="text-[10px] text-surface-400">
                        Incharge: {site.contact_person} {site.phone ? `(${site.phone})` : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Section: Quotations, Agreed Material Rates & Challan History */}
        <div className="lg:col-span-2 space-y-3.5">
          {/* 1. Quotations / Pre-Challan Estimates Card */}
          <div className="card p-3.5 sm:p-4 space-y-3 border-l-4 border-l-blue-600">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-surface-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                  <FileSpreadsheet size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-surface-900 flex items-center gap-2">
                    <span>Quotations &amp; Estimates</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
                      {quotations.length}
                    </span>
                  </h3>
                  <p className="text-[11px] text-surface-500">
                    Pre-challan item, qty, rate &amp; amount estimates. Send via WhatsApp or convert to Challan.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingQuotation(null);
                  setShowQuotationModal(true);
                }}
                className="py-1 px-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer self-start sm:self-auto"
              >
                <Plus size={12} />
                <span>+ Create Quotation</span>
              </button>
            </div>

            {quotations.length === 0 ? (
              <div className="p-4 bg-surface-50 rounded-xl border border-dashed border-surface-200 text-center text-xs text-surface-500 space-y-1">
                <p className="font-semibold text-surface-700">No quotations generated yet</p>
                <p className="text-[11px] text-surface-400">
                  Click &quot;+ Create Quotation&quot; to prepare an itemized quote with qty, rate &amp; amount before issuing a delivery challan.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Mobile Quotation Cards */}
                <div className="sm:hidden space-y-2">
                  {quotations.map((q) => (
                    <div
                      key={q.id}
                      className="p-3 rounded-lg border border-surface-200 bg-surface-50/60 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-xs text-blue-700">
                          {q.quotation_number}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border',
                            q.status === 'converted'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : q.status === 'approved'
                                ? 'bg-green-100 text-green-800 border-green-300'
                                : q.status === 'sent'
                                  ? 'bg-blue-100 text-blue-800 border-blue-200'
                                  : 'bg-amber-100 text-amber-800 border-amber-200'
                          )}
                        >
                          {q.status === 'draft' || !q.status ? 'SAVED' : q.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-surface-500">
                        <span>{formatDateIndian(q.quotation_date)}</span>
                        {q.site_name && (
                          <span className="font-medium text-surface-700">{q.site_name}</span>
                        )}
                        <span className="font-bold text-surface-900 font-mono">
                          ₹{Number(q.total_amount || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 pt-2 border-t border-surface-200">
                        <button
                          type="button"
                          onClick={() => setViewingQuotation(q)}
                          className="py-1.5 px-2 text-[11px] font-bold bg-surface-100 hover:bg-surface-200 text-surface-800 rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                          title="View Quotation Details"
                        >
                          <Eye size={11} />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingQuotation(q);
                            setShowQuotationModal(true);
                          }}
                          className="py-1.5 px-2 text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg border border-amber-200 flex items-center justify-center gap-1 cursor-pointer"
                          title="Edit Quotation"
                        >
                          <Edit size={11} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShareQuotationWhatsApp(q)}
                          className="flex-1 py-1.5 px-2 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                          title="Share via WhatsApp"
                        >
                          <Send size={11} />
                          <span>WhatsApp</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadQuotationPDF(q)}
                          className="py-1.5 px-2 text-[11px] font-bold bg-surface-100 hover:bg-surface-200 text-surface-800 rounded-lg border border-surface-300 flex items-center justify-center gap-1 cursor-pointer"
                          title="Download Quotation PDF"
                        >
                          <Download size={11} />
                        </button>
                        <Link
                          href={`/challans/new?customerId=${customer.id}&quotationId=${q.id}`}
                          className="py-1.5 px-2 text-[11px] font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-lg flex items-center justify-center gap-1"
                          title="Convert to Delivery Challan"
                        >
                          <ArrowRight size={11} />
                          <span>Challan</span>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Quotation Table */}
                <div className="hidden sm:block border border-surface-200 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-surface-50 border-b border-surface-200 text-surface-700 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="py-2 px-3">Quotation No.</th>
                        <th className="py-2 px-2.5">Date</th>
                        <th className="py-2 px-2.5">Target Site</th>
                        <th className="py-2 px-2 text-right">Items &amp; Qty</th>
                        <th className="py-2 px-2.5 text-right">Total Amount</th>
                        <th className="py-2 px-2 text-center">Status</th>
                        <th className="py-2 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {quotations.map((q) => (
                        <tr key={q.id} className="hover:bg-blue-50/40 transition-colors">
                          <td className="p-2.5 font-mono font-bold text-blue-700">
                            {q.quotation_number}
                          </td>
                          <td className="p-2.5 text-surface-600">
                            {formatDateIndian(q.quotation_date)}
                          </td>
                          <td className="p-2.5 font-medium text-surface-800">
                            {q.site_name ? (
                              <span className="px-1.5 py-0.5 rounded bg-surface-100 text-[11px] font-semibold">
                                {q.site_name}
                              </span>
                            ) : (
                              <span className="text-surface-400 italic">General Site</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right font-medium text-surface-700">
                            {q.items?.length || 0} items ({q.total_quantity} sheets)
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-surface-900">
                            ₹{Number(q.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2.5 text-center">
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-bold uppercase border',
                                q.status === 'converted'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : q.status === 'approved'
                                    ? 'bg-green-100 text-green-800 border-green-300'
                                    : q.status === 'sent'
                                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                                      : 'bg-amber-100 text-amber-800 border-amber-200'
                              )}
                            >
                              {q.status === 'draft' || !q.status ? 'SAVED' : q.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* View Quotation Preview */}
                              <button
                                type="button"
                                onClick={() => setViewingQuotation(q)}
                                className="p-1.5 rounded-lg text-surface-600 bg-surface-100 hover:bg-surface-200 border border-surface-300 cursor-pointer"
                                title="View Quotation Details"
                              >
                                <Eye size={13} />
                              </button>

                              {/* WhatsApp Share */}
                              <button
                                type="button"
                                onClick={() => handleShareQuotationWhatsApp(q)}
                                className="p-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                                title="Share Quotation via WhatsApp"
                              >
                                <Send size={13} />
                              </button>

                              {/* PDF Download */}
                              <button
                                type="button"
                                onClick={() => handleDownloadQuotationPDF(q)}
                                className="p-1.5 rounded-lg text-surface-700 bg-surface-100 hover:bg-surface-200 border border-surface-300 cursor-pointer"
                                title="Download Quotation PDF"
                              >
                                <Download size={13} />
                              </button>

                              {/* Convert to Challan */}
                              <Link
                                href={`/challans/new?customerId=${customer.id}&quotationId=${q.id}`}
                                className="p-1.5 rounded-lg text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 cursor-pointer inline-flex items-center gap-1 font-bold text-[10px]"
                                title="Convert this quotation directly into a Delivery Challan"
                              >
                                <ArrowRight size={12} />
                                <span>Challan</span>
                              </Link>

                              {/* Edit */}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingQuotation(q);
                                  setShowQuotationModal(true);
                                }}
                                className="p-1.5 rounded-lg text-surface-500 hover:text-surface-900 hover:bg-surface-100 cursor-pointer"
                                title="Edit Quotation"
                              >
                                <Edit size={13} />
                              </button>

                              {/* Delete - Admin only */}
                              {!isEmp && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteQuotation(q)}
                                  className="p-1.5 rounded-lg text-surface-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  title="Delete Quotation"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* 2. Agreed Material Rates & Quotation Card (Rate Contract) */}
          <div className="card p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-surface-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#ea580c]/10 text-[#ea580c]">
                  <Layers size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-surface-900 flex items-center gap-2">
                    <span>Agreed Material Rates &amp; Catalog</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-surface-100 text-surface-700">
                      {materialRates.length}
                    </span>
                  </h3>
                  <p className="text-[11px] text-surface-500">
                    Room-wise agreed rates matrix. Auto-fetches in Quotations &amp; Challans.
                  </p>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {selectedRateIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleDeleteSelectedRates}
                    className="py-1 px-2.5 text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-300 rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                    title="Delete selected rates"
                  >
                    <Trash2 size={12} />
                    <span>Delete ({selectedRateIds.size})</span>
                  </button>
                )}

                {materialRates.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleDownloadPDF}
                      className="py-1 px-2.5 text-xs font-bold bg-surface-100 hover:bg-surface-200 text-surface-800 border border-surface-300 rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                      title="Download Material Selection PDF"
                    >
                      <Download size={12} />
                      <span>{selectedRateIds.size > 0 ? `Selection PDF (${selectedRateIds.size})` : 'Selection PDF'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShareWhatsApp}
                      className="py-1 px-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                      title="Send WhatsApp rate card"
                    >
                      <Send size={12} />
                      <span>{selectedRateIds.size > 0 ? `WhatsApp (${selectedRateIds.size})` : 'WhatsApp Share'}</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setShowRateModal(true)}
                  className="py-1 px-2.5 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
                >
                  <Plus size={12} />
                  <span>+ Manage Rates</span>
                </button>
              </div>
            </div>

            {/* Site Filter Tabs */}
            {customerSites.length > 0 && materialRates.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-surface-100">
                <button
                  type="button"
                  onClick={() => setActiveSiteFilter('all')}
                  className={cn(
                    'py-1 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0',
                    activeSiteFilter === 'all'
                      ? 'bg-[#ea580c] text-white shadow-xs'
                      : 'bg-surface-100 hover:bg-surface-200 text-surface-700'
                  )}
                >
                  All Materials ({materialRates.length})
                </button>
                {customerSites.map((site) => {
                  const norm = (s?: string | null) => (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
                  const targetSiteNorm = norm(site.site_name);
                  const siteCount = materialRates.filter((r) => {
                    const rSiteNorm = norm(r.site_name || r.site_id);
                    return rSiteNorm === targetSiteNorm || r.site_id === site.id;
                  }).length;
                  return (
                    <button
                      key={site.id}
                      type="button"
                      onClick={() => setActiveSiteFilter(site.site_name)}
                      className={cn(
                        'py-1 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1',
                        activeSiteFilter === site.site_name
                          ? 'bg-[#ea580c] text-white shadow-xs'
                          : 'bg-surface-100 hover:bg-surface-200 text-surface-700'
                      )}
                    >
                      <span>{site.site_name}</span>
                      <span className={cn(
                        'text-[10px] px-1 py-0.2 rounded-full font-black',
                        activeSiteFilter === site.site_name ? 'bg-white/20 text-white' : 'bg-surface-200 text-surface-600'
                      )}>
                        {siteCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {displayedRates.length === 0 ? (
              <div className="p-4 bg-surface-50 rounded-xl border border-dashed border-surface-200 text-center text-xs text-surface-500 space-y-1">
                <p className="font-semibold text-surface-700">
                  {materialRates.length === 0
                    ? 'No agreed materials configured yet'
                    : `No materials configured for ${activeSiteFilter}`}
                </p>
                <p className="text-[11px] text-surface-400">
                  Click &quot;+ Manage Rates&quot; to configure room-wise particulars, internal codes &amp; agreed rates.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="border border-surface-200 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-surface-50 border-b border-surface-200 text-surface-700 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="py-2 px-2 w-8 text-center">
                          <input
                            type="checkbox"
                            checked={selectedRateIds.size === displayedRates.length && displayedRates.length > 0}
                            onChange={toggleSelectAllRates}
                            className="rounded border-surface-300 text-[#ea580c] focus:ring-[#ea580c] cursor-pointer"
                            title="Select / Deselect All"
                          />
                        </th>
                        <th className="py-2 px-2 w-20">Site</th>
                        <th className="py-2 px-2.5 w-24">Room</th>
                        <th className="py-2 px-2.5">Selected Particulars</th>
                        <th className="py-2 px-2 w-24">
                          <div className="flex items-center gap-1">
                            <span>Code</span>
                            <span className="text-[8px] px-1 py-0.2 rounded bg-zinc-200 text-zinc-700 font-normal">Internal</span>
                          </div>
                        </th>
                        <th className="py-2 px-2 w-24">
                          <div className="flex items-center gap-1">
                            <span>Company</span>
                            <span className="text-[8px] px-1 py-0.2 rounded bg-zinc-200 text-zinc-700 font-normal">Internal</span>
                          </div>
                        </th>
                        <th className="py-2 px-2.5 w-24 text-right">Agreed Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {displayedRates.map((mr, idx) => {
                        const isChecked = selectedRateIds.has(mr.id);
                        return (
                          <tr key={mr.id || idx} className={isChecked ? 'bg-amber-50/60' : 'hover:bg-surface-50/60'}>
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelectRate(mr.id)}
                                className="rounded border-surface-300 text-[#ea580c] focus:ring-[#ea580c] cursor-pointer"
                              />
                            </td>
                            <td className="p-2">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-100 text-surface-700 border border-surface-200">
                                {mr.site_name || 'All Sites'}
                              </span>
                            </td>
                            <td className="p-2 font-bold text-surface-900">{mr.room || 'General'}</td>
                            <td className="p-2 font-medium text-surface-800">
                              {mr.particulars?.trim() ? mr.particulars : <span className="text-surface-400 italic">Material Finish</span>}
                            </td>
                            <td className="p-2 font-mono text-zinc-600 font-semibold text-[11px]">{mr.code || '—'}</td>
                            <td className="p-2 text-zinc-600 text-[11px]">{mr.company_name || '—'}</td>
                            <td className="p-2 text-right font-mono font-bold text-[#ea580c]">
                              ₹{Number(mr.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between text-[11px] text-surface-500 px-1">
                  <span>
                    {selectedRateIds.size > 0 ? (
                      <strong className="text-[#ea580c]">{selectedRateIds.size} of {displayedRates.length} item(s) selected</strong>
                    ) : (
                      <span>Showing {displayedRates.length} agreed material(s)</span>
                    )}
                  </span>
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <ShieldCheck size={13} />
                    <span>Customer PDF &amp; WhatsApp hide internal codes &amp; company names</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 3. Challan History */}
          <div className="card p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-surface-100">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-surface-900">
                  Challan History ({challans.length})
                </h3>
                {activeChallanSiteFilter !== 'all' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-[#ea580c] text-white">
                    📍 {activeChallanSiteFilter} ({displayedChallans.length})
                  </span>
                )}
              </div>
              <Link
                href={`/challans/new?customerId=${customer.id}${activeChallanSiteFilter !== 'all' ? `&site=${encodeURIComponent(activeChallanSiteFilter)}` : ''}`}
                className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <Plus size={13} />
                <span>Create Challan</span>
              </Link>
            </div>

            {/* Site Wise Filter for Challans */}
            {customerSites.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setActiveChallanSiteFilter('all')}
                  className={cn(
                    'py-1 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1',
                    activeChallanSiteFilter === 'all'
                      ? 'bg-zinc-900 text-white shadow-xs'
                      : 'bg-surface-100 hover:bg-surface-200 text-surface-700'
                  )}
                >
                  <span>All Sites</span>
                  <span className="text-[10px] px-1 py-0.2 rounded-full font-black bg-surface-200 text-surface-800">
                    {challans.length}
                  </span>
                </button>
                {customerSites.map((site, idx) => {
                  const sName = site.site_name || `Site ${idx + 1}`;
                  const count = challans.filter(
                    (c) =>
                      c.site_name === sName ||
                      c.site_id === site.id ||
                      (c.delivery_address && c.delivery_address.toLowerCase().includes(sName.toLowerCase()))
                  ).length;
                  return (
                    <button
                      key={site.id || idx}
                      type="button"
                      onClick={() => setActiveChallanSiteFilter(sName)}
                      className={cn(
                        'py-1 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1',
                        activeChallanSiteFilter === sName
                          ? 'bg-[#ea580c] text-white shadow-xs'
                          : 'bg-surface-100 hover:bg-surface-200 text-surface-700'
                      )}
                    >
                      <Building2 size={11} />
                      <span>{sName}</span>
                      <span className="text-[10px] px-1 py-0.2 rounded-full font-black bg-surface-200 text-surface-800">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {displayedChallans.length === 0 ? (
              <div className="py-8 text-center text-xs text-surface-400">
                {challans.length === 0
                  ? 'No challans generated for this customer yet.'
                  : `No challans found for site "${activeChallanSiteFilter}".`}
              </div>
            ) : (
              <>
                {/* Mobile Card list */}
                <div className="sm:hidden space-y-2">
                  {displayedChallans.map((c) => (
                    <Link
                      key={c.id}
                      href={`/challans/${c.id}`}
                      className="p-2.5 rounded-lg border border-surface-200 bg-surface-50/50 block hover:bg-white transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-bold text-xs text-primary-600">{c.challan_number}</span>
                        <div className="flex items-center gap-1">
                          {c.site_name && (
                            <span className="text-[10px] font-bold text-[#ea580c] px-1.5 py-0.5 rounded bg-orange-50 border border-orange-200">
                              {c.site_name}
                            </span>
                          )}
                          <span className="text-[10px] uppercase font-bold text-surface-600 px-1.5 py-0.5 rounded bg-surface-200">
                            {c.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-surface-500">
                        <span>{formatDateIndian(c.challan_date)}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-surface-900">{c.total_quantity} sheets</span>
                          {c.total_amount && c.total_amount > 0 ? (
                            <span className="font-mono text-primary-700 font-bold bg-primary-50 px-1 rounded text-[10px]">
                              ₹{c.total_amount.toLocaleString('en-IN')}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>

                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="table text-xs">
                    <thead>
                      <tr>
                        <th>Challan No.</th>
                        <th>Date</th>
                        <th>Target Site</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Total Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {displayedChallans.map((c) => (
                        <tr key={c.id} className="hover:bg-surface-50">
                          <td>
                            <Link href={`/challans/${c.id}`} className="font-mono font-bold text-primary-600 hover:underline">
                              {c.challan_number}
                            </Link>
                          </td>
                          <td className="text-surface-600">{formatDateIndian(c.challan_date)}</td>
                          <td>
                            {c.site_name ? (
                              <span className="px-1.5 py-0.5 rounded bg-orange-50 text-[#ea580c] font-bold text-[10px] border border-orange-200">
                                📍 {c.site_name}
                              </span>
                            ) : (
                              <span className="text-surface-400 italic text-[11px]">Primary</span>
                            )}
                          </td>
                          <td className="text-right font-bold text-surface-900">{c.total_quantity}</td>
                          <td className="text-right font-mono font-bold text-surface-900">
                            {c.total_amount && c.total_amount > 0 ? `₹${c.total_amount.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td>
                            <span className="text-[10px] font-bold uppercase text-surface-600 px-2 py-0.5 rounded bg-surface-100 border border-surface-200">
                              {c.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showEdit && <CustomerFormModal editId={customer.id} onClose={() => setShowEdit(false)} />}

      {showQuotationModal && (
        <QuotationModal
          customer={customer}
          editQuotation={editingQuotation}
          initialSiteName={activeSiteFilter !== 'all' ? activeSiteFilter : undefined}
          onClose={() => {
            setShowQuotationModal(false);
            setEditingQuotation(null);
          }}
        />
      )}

      {showSiteModal && (
        <SiteModal
          customer={customer}
          editSite={editingSite}
          onClose={() => {
            setShowSiteModal(false);
            setEditingSite(null);
          }}
        />
      )}

      {showRateModal && (
        <MaterialRateModal
          customer={customer}
          onClose={() => setShowRateModal(false)}
        />
      )}

      {/* View Quotation Preview Modal */}
      {viewingQuotation && (
        <QuotationViewModal
          quotation={viewingQuotation}
          onClose={() => setViewingQuotation(null)}
          onEdit={(q) => {
            setViewingQuotation(null);
            setEditingQuotation(q);
            setShowQuotationModal(true);
          }}
        />
      )}
    </div>
  );
}
