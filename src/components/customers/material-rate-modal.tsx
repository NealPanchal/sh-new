'use client';

import React, { useState } from 'react';
import { Customer, CustomerMaterialRate, CustomerSite } from '@/types';
import { useApp } from '@/lib/context';
import { getCurrentUser } from '@/lib/auth';
import {
  X,
  Plus,
  Trash2,
  Layers,
  Download,
  Send,
  Building2,
  Check,
  ShieldAlert,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { exportCustomerRatesToPDF } from '@/lib/pdf-rates';
import { shareCustomerRatesViaWhatsApp } from '@/lib/whatsapp';
import { deduplicateMaterialRates } from '@/lib/utils';

interface MaterialRateModalProps {
  customer: Customer;
  onClose: () => void;
  onSaved?: (rates: CustomerMaterialRate[]) => void;
}

const STANDARD_ROOM_OPTIONS = [
  'Living Room',
  'Master Bedroom',
  'Bed Room 1',
  'Bed Room 2',
  'Kids Room',
  'Parents Room',
  'Guest Bedroom',
  'Kitchen',
  'Dining Area',
  'Office / Study',
  'Balcony',
  'Common / Inner',
  'Safety Door',
  'Ceiling',
  'Passage / Lobby',
  'Pooja Room',
  'Bathroom',
];

export function MaterialRateModal({ customer, onClose, onSaved }: MaterialRateModalProps) {
  const { updateCustomer, profile, showToast } = useApp();
  const currentUser = getCurrentUser();

  // Extract customer sites
  const sites: CustomerSite[] = Array.isArray(customer.sites) && customer.sites.length > 0
    ? customer.sites
    : customer.delivery_address
    ? [
        {
          id: `site_1_${customer.id}`,
          customer_id: customer.id,
          site_name: 'Site 1',
          site_address: customer.delivery_address,
          created_at: new Date().toISOString(),
        },
      ]
    : [];

  const initialRates: CustomerMaterialRate[] = Array.isArray(customer.material_rates)
    ? deduplicateMaterialRates(customer.material_rates, customer.sites)
    : [];

  const [rates, setRates] = useState<CustomerMaterialRate[]>(initialRates);
  const [selectedRateIds, setSelectedRateIds] = useState<Set<string>>(new Set());
  const [activeSiteFilter, setActiveSiteFilter] = useState<string>('all');
  const [transportCharges, setTransportCharges] = useState(
    customer.transportation_charges ? String(customer.transportation_charges) : ''
  );
  const [selectionCharges, setSelectionCharges] = useState(
    customer.selection_charges ? String(customer.selection_charges) : ''
  );

  const filteredRates = activeSiteFilter === 'all'
    ? rates
    : rates.filter((r) => r.site_name === activeSiteFilter || r.site_id === activeSiteFilter);

  const handleAddRow = () => {
    const newId = `mr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const defaultSite = activeSiteFilter !== 'all'
      ? sites.find((s) => s.id === activeSiteFilter || s.site_name === activeSiteFilter)
      : sites[0];

    const newRow: CustomerMaterialRate = {
      id: newId,
      site_id: defaultSite?.id || null,
      site_name: defaultSite?.site_name || 'Site 1',
      room: 'Living Room',
      material: 'Laminate',
      particulars: '',
      code: '',
      company_name: '',
      rate: 0,
    };

    setRates((prev) => [...prev, newRow]);
  };

  const handleUpdateRow = (id: string, field: keyof CustomerMaterialRate, value: any) => {
    setRates((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleRemoveRow = (id: string) => {
    setRates((prev) => prev.filter((r) => r.id !== id));
    setSelectedRateIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleSelectRow = (id: string) => {
    setSelectedRateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRateIds.size === filteredRates.length && filteredRates.length > 0) {
      setSelectedRateIds(new Set());
    } else {
      setSelectedRateIds(new Set(filteredRates.map((r) => r.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedRateIds.size === 0) {
      showToast('Select at least one row to delete', 'error');
      return;
    }
    const count = selectedRateIds.size;
    setRates((prev) => prev.filter((r) => !selectedRateIds.has(r.id)));
    setSelectedRateIds(new Set());
    showToast(`Removed ${count} selected rate(s)`, 'info');
  };

  const getTargetRatesToExport = () => {
    if (selectedRateIds.size > 0) {
      return rates.filter((r) => selectedRateIds.has(r.id));
    }
    return filteredRates.filter((r) => r.particulars?.trim() || r.rate > 0);
  };

  const handleDownloadPDF = () => {
    const list = getTargetRatesToExport();
    if (list.length === 0) {
      showToast('No materials to download', 'error');
      return;
    }
    exportCustomerRatesToPDF({
      customerName: customer.business_name || customer.contact_person || 'Customer',
      contactPerson: customer.contact_person || undefined,
      phone: customer.phone || undefined,
      deliveryAddress: customer.delivery_address || customer.billing_address,
      siteName: activeSiteFilter !== 'all' ? activeSiteFilter : undefined,
      customer,
      profile,
      preparedBy: currentUser?.name || 'VRUSHANK',
      selectedRates: list,
      transportationCharges: transportCharges ? parseFloat(transportCharges) : null,
      selectionCharges: selectionCharges ? parseFloat(selectionCharges) : null,
    });
    showToast('Downloaded Customer Material Selection PDF!', 'success');
  };

  const handleShareWhatsApp = () => {
    const list = getTargetRatesToExport();
    if (list.length === 0) {
      showToast('No materials to share', 'error');
      return;
    }
    shareCustomerRatesViaWhatsApp({
      customerName: customer.business_name || customer.contact_person || 'Customer',
      phone: customer.phone,
      attendee: currentUser?.name || 'Vrushank',
      selectedRates: list,
      transportationCharges: transportCharges ? parseFloat(transportCharges) : null,
      selectionCharges: selectionCharges ? parseFloat(selectionCharges) : null,
      onToast: showToast,
    });
  };

  const handleSave = () => {
    const valid = rates.filter((r) => r.particulars?.trim() || r.code?.trim() || r.rate > 0 || r.room?.trim());
    const deduped = deduplicateMaterialRates(valid, sites);
    const tc = transportCharges && !isNaN(parseFloat(transportCharges)) ? parseFloat(transportCharges) : null;
    const sc = selectionCharges && !isNaN(parseFloat(selectionCharges)) ? parseFloat(selectionCharges) : null;
    updateCustomer(customer.id, {
      material_rates: deduped,
      transportation_charges: tc,
      selection_charges: sc,
    });
    showToast(`Saved ${deduped.length} agreed material rate(s) successfully!`, 'success');
    if (onSaved) onSaved(deduped);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content animate-slide-up max-w-4xl w-full p-0 flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 bg-surface-50 border-b border-surface-200">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-orange-100 text-[#ea580c]">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-surface-900">
                Manage Agreed Materials &amp; Rates
              </h2>
              <p className="text-[11px] text-surface-500">
                Customer: <strong className="text-surface-800">{customer.business_name}</strong> · Separate rates per site or room
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-200 text-surface-400">
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Site Filter / Selection Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 bg-surface-50 rounded-xl border border-surface-200">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-surface-600 uppercase tracking-wider flex items-center gap-1">
                <Building2 size={13} className="text-[#ea580c]" />
                <span>Filter By Site:</span>
              </span>
              <button
                type="button"
                onClick={() => setActiveSiteFilter('all')}
                className={`py-1 px-2.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                  activeSiteFilter === 'all'
                    ? 'bg-[#ea580c] text-white border-[#ea580c] shadow-2xs'
                    : 'bg-white text-surface-700 hover:bg-surface-100 border-surface-200'
                }`}
              >
                All Sites ({rates.length})
              </button>

              {sites.map((s, idx) => {
                const sName = s.site_name || `Site ${idx + 1}`;
                const count = rates.filter((r) => r.site_name === sName || r.site_id === s.id).length;
                return (
                  <button
                    key={s.id || idx}
                    type="button"
                    onClick={() => setActiveSiteFilter(sName)}
                    className={`py-1 px-2.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      activeSiteFilter === sName
                        ? 'bg-[#ea580c] text-white border-[#ea580c] shadow-2xs'
                        : 'bg-white text-surface-700 hover:bg-surface-100 border-surface-200'
                    }`}
                  >
                    {sName} ({count})
                  </button>
                );
              })}
            </div>

            {/* Action Toolbar */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedRateIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="py-1 px-2.5 text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-300 rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 size={12} />
                  <span>Delete ({selectedRateIds.size})</span>
                </button>
              )}

              {rates.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleDownloadPDF}
                    className="py-1 px-2 text-xs font-bold bg-surface-100 hover:bg-surface-200 text-surface-800 border border-surface-300 rounded-lg flex items-center gap-1 cursor-pointer"
                    title="Download Material Selection PDF"
                  >
                    <Download size={12} />
                    <span>Selection PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="py-1 px-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1 cursor-pointer"
                    title="Send via WhatsApp"
                  >
                    <Send size={12} />
                    <span>WhatsApp</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleAddRow}
                className="py-1 px-2.5 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <Plus size={13} />
                <span>+ Add Material Row</span>
              </button>
            </div>
          </div>

          {/* Table */}
          {filteredRates.length === 0 ? (
            <div className="p-8 bg-surface-50 rounded-xl border border-dashed border-surface-200 text-center text-xs text-surface-500 space-y-2">
              <Layers className="w-8 h-8 mx-auto text-surface-400" />
              <p className="font-semibold text-surface-700">No materials or rates added for this selection</p>
              <p className="text-[11px] text-surface-400">
                Click &quot;+ Add Material Row&quot; above to set room, material description and locked agreed rate.
              </p>
            </div>
          ) : (
            <div className="border border-surface-200 rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-surface-100 border-b border-surface-200 text-surface-700 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-2 px-2 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={selectedRateIds.size === filteredRates.length && filteredRates.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-surface-300 text-[#ea580c] focus:ring-[#ea580c] cursor-pointer"
                      />
                    </th>
                    <th className="py-2 px-2 w-28">Target Site</th>
                    <th className="py-2 px-2 w-28">Room / Area</th>
                    <th className="py-2 px-3">Material Description / Particulars *</th>
                    <th className="py-2 px-2 w-24">
                      <span>Code</span> <span className="text-[8px] bg-zinc-200 px-1 py-0.2 rounded text-zinc-600">Internal</span>
                    </th>
                    <th className="py-2 px-2 w-24">
                      <span>Company</span> <span className="text-[8px] bg-zinc-200 px-1 py-0.2 rounded text-zinc-600">Internal</span>
                    </th>
                    <th className="py-2 px-3 w-28 text-right">Agreed Rate (₹) *</th>
                    <th className="py-2 px-1.5 w-8 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 bg-white">
                  {filteredRates.map((r) => {
                    const isChecked = selectedRateIds.has(r.id);
                    return (
                      <tr key={r.id} className={isChecked ? 'bg-amber-50/50' : 'hover:bg-surface-50/60'}>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectRow(r.id)}
                            className="rounded border-surface-300 text-[#ea580c] focus:ring-[#ea580c] cursor-pointer"
                          />
                        </td>
                        <td className="p-1.5">
                          <select
                            value={r.site_name || 'Site 1'}
                            onChange={(e) => {
                              const sName = e.target.value;
                              const matched = sites.find((s) => s.site_name === sName);
                              handleUpdateRow(r.id, 'site_name', sName);
                              handleUpdateRow(r.id, 'site_id', matched?.id || null);
                            }}
                            className="input text-xs py-1 px-1.5 font-bold text-surface-800 bg-surface-50"
                          >
                            <option value="All Sites">All Sites</option>
                            {sites.map((s, idx) => (
                              <option key={s.id || idx} value={s.site_name || `Site ${idx + 1}`}>
                                {s.site_name || `Site ${idx + 1}`}
                              </option>
                            ))}
                            {sites.length === 0 && <option value="Site 1">Site 1</option>}
                          </select>
                        </td>
                        <td className="p-1.5 min-w-[140px]">
                          <div className="space-y-1">
                            <select
                              value={STANDARD_ROOM_OPTIONS.includes(r.room) ? r.room : (r.room ? 'custom' : '')}
                              onChange={(e) => {
                                if (e.target.value === 'custom') {
                                  // Switch to custom room input
                                  if (STANDARD_ROOM_OPTIONS.includes(r.room)) {
                                    handleUpdateRow(r.id, 'room', '');
                                  }
                                } else {
                                  handleUpdateRow(r.id, 'room', e.target.value);
                                }
                              }}
                              className="input text-xs py-1 px-1.5 font-bold text-surface-900 bg-white border border-surface-300 w-full"
                            >
                              <option value="" disabled>Select Room / Area...</option>
                              {STANDARD_ROOM_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                              <option value="custom">✏️ Custom / Other Room...</option>
                            </select>
                            {(!STANDARD_ROOM_OPTIONS.includes(r.room) || r.room === '') && (
                              <input
                                type="text"
                                list="room-options"
                                value={r.room}
                                onChange={(e) => handleUpdateRow(r.id, 'room', e.target.value)}
                                placeholder="Type room name..."
                                className="input text-xs py-1 px-2 font-medium bg-amber-50/70 border border-amber-300 w-full"
                              />
                            )}
                          </div>
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={r.particulars || ''}
                            onChange={(e) => handleUpdateRow(r.id, 'particulars', e.target.value)}
                            placeholder="e.g. MATT LAM [ SHADES ] - SAFETY DOOR"
                            className="input text-xs py-1 px-2 font-semibold text-surface-900"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={r.code || ''}
                            onChange={(e) => handleUpdateRow(r.id, 'code', e.target.value)}
                            placeholder="e.g. SF-102"
                            className="input text-xs py-1 px-2 font-mono text-zinc-700"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={r.company_name || ''}
                            onChange={(e) => handleUpdateRow(r.id, 'company_name', e.target.value)}
                            placeholder="e.g. Royal Oak"
                            className="input text-xs py-1 px-2 font-medium text-zinc-700"
                          />
                        </td>
                        <td className="p-1.5 text-right">
                          <input
                            type="number"
                            step="any"
                            value={r.rate || ''}
                            onChange={(e) => handleUpdateRow(r.id, 'rate', Number(e.target.value) || 0)}
                            placeholder="1400"
                            className="input text-xs py-1 px-2 text-right font-mono font-bold text-[#ea580c]"
                          />
                        </td>
                        <td className="p-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(r.id)}
                            className="p-1 text-surface-400 hover:text-rose-600 cursor-pointer"
                            title="Remove row"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <datalist id="room-options">
                <option value="Living Room" />
                <option value="Master Bedroom" />
                <option value="Kids Room" />
                <option value="Kitchen" />
                <option value="Dining Area" />
                <option value="Guest Bedroom" />
                <option value="Office / Study" />
                <option value="Balcony" />
                <option value="Safety Door" />
                <option value="Ceiling" />
              </datalist>
            </div>
          )}

          {/* Transportation & Selection / Consultation Charges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-orange-50/50 rounded-xl border border-orange-200">
            <div>
              <label className="block text-[11px] font-bold text-surface-700 mb-1">
                Delivery / Transportation Charges (₹)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={transportCharges}
                onChange={(e) => setTransportCharges(e.target.value)}
                placeholder="e.g. 500"
                className="input text-xs py-1.5 px-2.5 font-mono bg-white"
              />
              <span className="text-[10px] text-surface-400">Optional site delivery / tempo freight</span>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-surface-700 mb-1">
                Loading / Unloading Charges (₹)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={selectionCharges}
                onChange={(e) => setSelectionCharges(e.target.value)}
                placeholder="e.g. 1500"
                className="input text-xs py-1.5 px-2.5 font-mono bg-white"
              />
              <span className="text-[10px] text-surface-400">Optional labour / loading / unloading fee</span>
            </div>
          </div>

          {/* Privacy Note */}
          <div className="flex items-center justify-between text-[11px] text-surface-500 bg-surface-50 p-2.5 rounded-lg border border-surface-200">
            <span>
              Showing <strong>{filteredRates.length}</strong> material rate(s) {activeSiteFilter !== 'all' ? `for ${activeSiteFilter}` : ''}
            </span>
            <span className="text-emerald-700 font-semibold flex items-center gap-1">
              <ShieldCheck size={13} />
              <span>Customer PDF &amp; WhatsApp hide internal codes &amp; company names</span>
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-surface-50 border-t border-surface-200 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary py-1.5 px-3 text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn-primary py-1.5 px-4 text-xs font-bold flex items-center gap-1.5"
          >
            <Check size={14} />
            <span>Save Materials &amp; Rates</span>
          </button>
        </div>
      </div>
    </div>
  );
}
