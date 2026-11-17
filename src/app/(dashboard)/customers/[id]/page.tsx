'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
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
} from 'lucide-react';
import { formatPhone, formatDateIndian } from '@/lib/utils';
import { CustomerFormModal } from '@/components/customers/customer-form-modal';
import { exportCustomerRatesToPDF } from '@/lib/pdf-rates';
import { shareCustomerRatesViaWhatsApp } from '@/lib/whatsapp';
import { getCurrentUser } from '@/lib/auth';
import { CustomerMaterialRate } from '@/types';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getCustomer, getCustomerChallans, updateCustomer, showToast } = useApp();
  const [showEdit, setShowEdit] = useState(false);
  const [selectedRateIds, setSelectedRateIds] = useState<Set<string>>(new Set());

  const customerId = params.id as string;
  const customer = useMemo(() => getCustomer(customerId), [getCustomer, customerId]);
  const challans = useMemo(
    () => getCustomerChallans(customerId),
    [getCustomerChallans, customerId]
  );

  const materialRates: CustomerMaterialRate[] = useMemo(() => {
    return Array.isArray(customer?.material_rates) ? customer.material_rates : [];
  }, [customer?.material_rates]);

  const toggleSelectRate = (id: string) => {
    setSelectedRateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllRates = () => {
    if (selectedRateIds.size === materialRates.length) {
      setSelectedRateIds(new Set());
    } else {
      setSelectedRateIds(new Set(materialRates.map((mr) => mr.id)));
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
    return materialRates;
  };

  const handleDownloadPDF = () => {
    if (!customer) return;
    const list = getTargetRatesToExport();
    if (list.length === 0) {
      showToast('No material rates to download', 'error');
      return;
    }
    exportCustomerRatesToPDF({
      customerName: customer.business_name,
      contactPerson: customer.contact_person,
      phone: customer.phone,
      deliveryAddress: customer.delivery_address || customer.billing_address,
      selectedRates: list,
    });
    showToast('Downloaded Customer Material Rates PDF!', 'success');
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
      onToast: showToast,
    });
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
            className="p-1.5 rounded-lg text-surface-500 hover:text-surface-900 hover:bg-surface-100"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-surface-900 tracking-tight">
              {customer.business_name}
            </h1>
            {customer.contact_person && (
              <p className="text-xs text-surface-500">{customer.contact_person}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEdit(true)}
            className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"
          >
            <Edit size={14} />
            <span>Edit</span>
          </button>
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
        {/* Customer Info Card */}
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

            {customer.delivery_address && (
              <div className="flex items-start gap-2 text-surface-600 pt-1 border-t border-surface-100">
                <MapPin size={14} className="text-primary-500 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] text-surface-400 uppercase font-semibold block">Delivery Site</span>
                  <span>{customer.delivery_address}</span>
                </div>
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

        {/* Right Section: Agreed Material Rates & Challan History */}
        <div className="lg:col-span-2 space-y-3.5">
          {/* Agreed Material Rates & Quotation Card */}
          <div className="card p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-surface-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#ea580c]/10 text-[#ea580c]">
                  <Layers size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-surface-900 flex items-center gap-2">
                    <span>Agreed Material Rates &amp; Quotations</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-surface-100 text-surface-700">
                      {materialRates.length}
                    </span>
                  </h3>
                  <p className="text-[11px] text-surface-500">
                    Room-wise agreed rates. Auto-fetches in Challans &amp; WhatsApp share.
                  </p>
                </div>
              </div>

              {/* Action Toolbar: Selection, Delete, Download, WhatsApp, Edit */}
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
                      title="Download clean customer PDF (Room, Particulars & Rate only)"
                    >
                      <Download size={12} />
                      <span>{selectedRateIds.size > 0 ? `PDF (${selectedRateIds.size})` : 'Download PDF'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShareWhatsApp}
                      className="py-1 px-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                      title="Send WhatsApp quotation to customer (Room, Particulars & Rate only)"
                    >
                      <Send size={12} />
                      <span>{selectedRateIds.size > 0 ? `WhatsApp (${selectedRateIds.size})` : 'WhatsApp Share'}</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setShowEdit(true)}
                  className="py-1 px-2.5 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
                >
                  <Plus size={12} />
                  <span>+ Manage Rates</span>
                </button>
              </div>
            </div>

            {materialRates.length === 0 ? (
              <div className="p-4 bg-surface-50 rounded-xl border border-dashed border-surface-200 text-center text-xs text-surface-500 space-y-1">
                <p className="font-semibold text-surface-700">No agreed materials configured yet</p>
                <p className="text-[11px] text-surface-400">Click &quot;+ Manage Rates&quot; to configure room-wise particulars, internal codes &amp; agreed rates.</p>
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
                            checked={selectedRateIds.size === materialRates.length && materialRates.length > 0}
                            onChange={toggleSelectAllRates}
                            className="rounded border-surface-300 text-[#ea580c] focus:ring-[#ea580c] cursor-pointer"
                            title="Select / Deselect All"
                          />
                        </th>
                        <th className="py-2 px-2.5 w-28">Room</th>
                        <th className="py-2 px-2.5">Selected Particulars</th>
                        <th className="py-2 px-2 w-24">
                          <div className="flex items-center gap-1">
                            <span>Code</span>
                            <span className="text-[8px] px-1 py-0.2 rounded bg-zinc-200 text-zinc-700 font-normal">Internal</span>
                          </div>
                        </th>
                        <th className="py-2 px-2 w-28">
                          <div className="flex items-center gap-1">
                            <span>Company</span>
                            <span className="text-[8px] px-1 py-0.2 rounded bg-zinc-200 text-zinc-700 font-normal">Internal</span>
                          </div>
                        </th>
                        <th className="py-2 px-2.5 w-24 text-right">Agreed Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {materialRates.map((mr, idx) => {
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
                      <strong className="text-[#ea580c]">{selectedRateIds.size} of {materialRates.length} item(s) selected</strong>
                    ) : (
                      <span>Showing {materialRates.length} agreed material(s)</span>
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

          {/* Challan History */}
          <div className="card p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-surface-100">
            <h3 className="text-sm font-bold text-surface-900">
              Challan History ({challans.length})
            </h3>
            <Link
              href={`/challans/new?customerId=${customer.id}`}
              className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              <Plus size={13} />
              <span>Create Challan</span>
            </Link>
          </div>

          {challans.length === 0 ? (
            <div className="py-8 text-center text-xs text-surface-400">
              No challans generated for this customer yet.
            </div>
          ) : (
            <>
              {/* Mobile Card list */}
              <div className="sm:hidden space-y-2">
                {challans.map((c) => (
                  <Link
                    key={c.id}
                    href={`/challans/${c.id}`}
                    className="p-2.5 rounded-lg border border-surface-200 bg-surface-50/50 block hover:bg-white transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-bold text-xs text-primary-600">{c.challan_number}</span>
                      <span className="text-[10px] uppercase font-bold text-surface-600 px-1.5 py-0.5 rounded bg-surface-200">
                        {c.status}
                      </span>
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
                      <th className="text-right">Qty</th>
                      <th className="text-right">Total Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {challans.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-50">
                        <td>
                          <Link href={`/challans/${c.id}`} className="font-mono font-bold text-primary-600 hover:underline">
                            {c.challan_number}
                          </Link>
                        </td>
                        <td className="text-surface-600">{formatDateIndian(c.challan_date)}</td>
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
    </div>
  );
}
