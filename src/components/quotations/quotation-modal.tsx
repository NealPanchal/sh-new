'use client';

import React, { useState, useEffect } from 'react';
import { Customer, CustomerSite, Quotation, QuotationItem, UnitType } from '@/types';
import { useApp } from '@/lib/context';
import { getCurrentUser } from '@/lib/auth';
import { X, Plus, Trash2, Layers, Send, Save, Download, Building2, Calendar, FileText } from 'lucide-react';
import { shareQuotationViaWhatsApp } from '@/lib/whatsapp';
import { exportQuotationToPDF } from '@/lib/pdf-quotation';

interface QuotationModalProps {
  customer: Customer;
  editQuotation?: Quotation | null;
  onClose: () => void;
  onSaved?: (quotation: Quotation) => void;
}

interface FormItem {
  id: string;
  item_description: string;
  brand?: string;
  unit: UnitType;
  quantity: string;
  rate: string;
  amount: number;
}

export function QuotationModal({ customer, editQuotation, onClose, onSaved }: QuotationModalProps) {
  const { createQuotation, updateQuotation, peekNextQuotationNumber, products, profile, showToast } = useApp();
  const currentUser = getCurrentUser();

  const [quotationNumber, setQuotationNumber] = useState('');
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedSiteName, setSelectedSiteName] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [applyGst, setApplyGst] = useState(true);
  const [transportCharges, setTransportCharges] = useState(
    editQuotation?.transportation_charges ? String(editQuotation.transportation_charges) : ''
  );
  const [selectionCharges, setSelectionCharges] = useState(
    editQuotation?.selection_charges ? String(editQuotation.selection_charges) : ''
  );
  const [preparedBy, setPreparedBy] = useState(currentUser?.name || 'Vrushank');
  const [notes, setNotes] = useState('');

  // Customer Sites
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

  const [items, setItems] = useState<FormItem[]>([
    {
      id: `it_${Date.now()}_1`,
      item_description: '',
      brand: '',
      unit: 'sheets',
      quantity: '1',
      rate: '',
      amount: 0,
    },
  ]);

  useEffect(() => {
    if (editQuotation) {
      setQuotationNumber(editQuotation.quotation_number);
      setQuotationDate(editQuotation.quotation_date);
      setSelectedSiteId(editQuotation.site_id || '');
      setSelectedSiteName(editQuotation.site_name || '');
      setDeliveryAddress(editQuotation.delivery_address || '');
      setApplyGst(Boolean(editQuotation.apply_gst));
      setTransportCharges(editQuotation.transportation_charges ? String(editQuotation.transportation_charges) : '');
      setSelectionCharges(editQuotation.selection_charges ? String(editQuotation.selection_charges) : '');
      setPreparedBy(editQuotation.prepared_by || currentUser?.name || 'Vrushank');
      setNotes(editQuotation.notes || '');

      if (editQuotation.items && editQuotation.items.length > 0) {
        setItems(
          editQuotation.items.map((it) => ({
            id: it.id,
            item_description: it.item_description,
            brand: it.brand || '',
            unit: it.unit || 'sheets',
            quantity: String(it.quantity),
            rate: String(it.rate),
            amount: Number(it.amount),
          }))
        );
      }
    } else {
      setQuotationNumber(peekNextQuotationNumber());
      if (sites.length > 0) {
        setSelectedSiteId(sites[0].id);
        setSelectedSiteName(sites[0].site_name);
        setDeliveryAddress(sites[0].site_address);
      } else {
        setDeliveryAddress(customer.delivery_address || customer.billing_address || '');
      }
    }
  }, [editQuotation, peekNextQuotationNumber]);

  const handleSiteChange = (siteId: string) => {
    setSelectedSiteId(siteId);
    const found = sites.find((s) => s.id === siteId);
    if (found) {
      setSelectedSiteName(found.site_name);
      setDeliveryAddress(found.site_address);
    } else {
      setSelectedSiteName('');
      setDeliveryAddress(customer.delivery_address || customer.billing_address || '');
    }
  };

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
    setItems((prev) => [
      ...prev,
      {
        id: `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        item_description: '',
        brand: '',
        unit: 'sheets',
        quantity: '1',
        rate: '',
        amount: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Auto-Fetch Customer Agreed Materials
  const handleAutoFetchAgreedMaterials = () => {
    if (!customer.material_rates || customer.material_rates.length === 0) {
      showToast('No agreed material rates configured for this customer', 'info');
      return;
    }

    let source = customer.material_rates;
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
      `⚡ Auto-fetched ${fetched.length} agreed materials for ${selectedSiteName || 'Customer'} with locked rates!`,
      'success'
    );
  };

  // Computations
  const totalQuantity = items.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0), 0);
  const itemsSubtotal = items.reduce((sum, it) => sum + (it.amount || 0), 0);
  const parsedTransport = parseFloat(transportCharges) || 0;
  const parsedSelection = parseFloat(selectionCharges) || 0;
  const subtotal = itemsSubtotal + parsedTransport + parsedSelection;
  const cgstAmount = applyGst ? Math.round(subtotal * 0.09 * 100) / 100 : 0;
  const sgstAmount = applyGst ? Math.round(subtotal * 0.09 * 100) / 100 : 0;
  const totalAmount = subtotal + cgstAmount + sgstAmount;

  const handleSave = (andShareWhatsApp = false, andDownloadPDF = false) => {
    const validItems = items.filter((it) => it.item_description.trim() && parseFloat(it.quantity) > 0);
    if (validItems.length === 0) {
      showToast('Please add at least one item with description and quantity', 'error');
      return;
    }

    const quotationData: Partial<Quotation> = {
      quotation_number: quotationNumber.trim() || peekNextQuotationNumber(),
      quotation_date: quotationDate,
      customer_id: customer.id,
      customer_name: customer.business_name || customer.contact_person || 'Client',
      customer_phone: customer.phone,
      customer_address: customer.billing_address,
      site_id: selectedSiteId || null,
      site_name: selectedSiteName || null,
      delivery_address: deliveryAddress || null,
      status: andShareWhatsApp ? 'sent' : 'draft',
      total_quantity: totalQuantity,
      subtotal_amount: subtotal,
      transportation_charges: parsedTransport,
      selection_charges: parsedSelection,
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

    let saved: Quotation | null = null;
    if (editQuotation) {
      saved = updateQuotation(editQuotation.id, quotationData, quotationItems);
      showToast(`Quotation ${quotationData.quotation_number} updated successfully!`, 'success');
    } else {
      saved = createQuotation(quotationData, quotationItems);
      showToast(`Quotation ${saved.quotation_number} created successfully!`, 'success');
    }

    if (saved && andShareWhatsApp) {
      shareQuotationViaWhatsApp({
        quotation: saved,
        profile,
        onToast: showToast,
      });
    }

    if (saved && andDownloadPDF) {
      exportQuotationToPDF(saved, profile, 'a4');
      showToast('Downloaded Quotation PDF!', 'success');
    }

    if (saved && onSaved) onSaved(saved);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content animate-slide-up max-w-4xl w-full max-h-[92vh] flex flex-col p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 bg-surface-50 border-b border-surface-200">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
              <FileText size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-surface-900">
                {editQuotation ? 'Edit Quotation' : 'Create Pre-Challan Quotation'}
              </h2>
              <p className="text-[11px] text-surface-500">
                Customer: <strong className="text-surface-800">{customer.business_name}</strong> · Phone: {customer.phone}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-200 text-surface-400">
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Top Metadata Row: QTN No, Date, Site Selection, Prepared By */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-surface-50 p-3 rounded-xl border border-surface-200">
            <div>
              <label className="label text-[11px] font-semibold text-surface-600">Quotation No.</label>
              <input
                type="text"
                value={quotationNumber}
                onChange={(e) => setQuotationNumber(e.target.value)}
                className="input text-xs font-mono font-bold text-blue-700 bg-white"
                placeholder="QT/11/001"
              />
            </div>

            <div>
              <label className="label text-[11px] font-semibold text-surface-600">Date</label>
              <input
                type="date"
                value={quotationDate}
                onChange={(e) => setQuotationDate(e.target.value)}
                className="input text-xs bg-white"
              />
            </div>

            {/* Multiple Site Selector */}
            <div>
              <label className="label text-[11px] font-semibold text-surface-600 flex items-center gap-1">
                <Building2 size={12} className="text-blue-600" />
                <span>Target Site ({sites.length || 1})</span>
              </label>
              <select
                value={selectedSiteId}
                onChange={(e) => handleSiteChange(e.target.value)}
                className="input text-xs font-semibold text-surface-900 bg-white"
              >
                {sites.map((s, idx) => (
                  <option key={s.id || idx} value={s.id}>
                    {s.site_name || `Site ${idx + 1}`}
                  </option>
                ))}
                {sites.length === 0 && <option value="">Default Site</option>}
              </select>
            </div>

            <div>
              <label className="label text-[11px] font-semibold text-surface-600">Prepared By</label>
              <input
                type="text"
                value={preparedBy}
                onChange={(e) => setPreparedBy(e.target.value)}
                className="input text-xs font-medium bg-white"
                placeholder="Vrushank / Staff"
              />
            </div>

            {/* Delivery Site Address details */}
            <div className="sm:col-span-4 flex items-center gap-2 pt-1 border-t border-surface-200/60">
              <span className="text-[10px] uppercase font-bold text-surface-400">Site Location:</span>
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className="input text-xs bg-white flex-1 py-1 h-7"
                placeholder="Delivery address for this site"
              />
            </div>
          </div>

          {/* Action Toolbar above items table */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-surface-900 uppercase tracking-wider">
                Quotation Items ({items.length})
              </h3>
              <p className="text-[11px] text-surface-400">Enter item description, quantity, rate &amp; amount</p>
            </div>

            <div className="flex items-center gap-2">
              {customer.material_rates && customer.material_rates.length > 0 && (
                <button
                  type="button"
                  onClick={handleAutoFetchAgreedMaterials}
                  className="py-1 px-2.5 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Auto-fill items with locked customer rates"
                >
                  <Layers size={13} />
                  <span>
                    ⚡ Auto-Fetch {selectedSiteName ? `${selectedSiteName} Materials` : 'Agreed Rates'} ({customer.material_rates.length})
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={handleAddItem}
                className="py-1 px-2.5 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <Plus size={13} />
                <span>+ Add Item</span>
              </button>
            </div>
          </div>

          {/* Items Table */}
          <div className="border border-surface-200 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-surface-100 border-b border-surface-200 font-bold uppercase text-[10px] text-surface-700">
                <tr>
                  <th className="py-2 px-2 w-8 text-center">#</th>
                  <th className="py-2 px-3">Item Description *</th>
                  <th className="py-2 px-2 w-24">Unit</th>
                  <th className="py-2 px-2 w-20 text-center">Qty *</th>
                  <th className="py-2 px-2 w-24 text-right">Rate (₹)</th>
                  <th className="py-2 px-3 w-28 text-right">Amount (₹)</th>
                  <th className="py-2 px-2 w-8 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 bg-white">
                {items.map((it, idx) => (
                  <tr key={it.id || idx} className="hover:bg-surface-50/70">
                    <td className="p-2 text-center font-mono text-surface-400 text-[11px]">{idx + 1}</td>
                    <td className="p-1.5">
                      <input
                        type="text"
                        value={it.item_description}
                        onChange={(e) => handleItemChange(idx, 'item_description', e.target.value)}
                        placeholder="e.g. MATT LAM [ SHADES ] - SAFETY DOOR"
                        className="input text-xs py-1 px-2 w-full font-medium"
                      />
                    </td>
                    <td className="p-1.5">
                      <select
                        value={it.unit}
                        onChange={(e) => handleItemChange(idx, 'unit', e.target.value as UnitType)}
                        className="input text-xs py-1 px-2 w-full"
                      >
                        <option value="sheets">sheets</option>
                        <option value="pieces">pieces</option>
                        <option value="boxes">boxes</option>
                        <option value="sq.ft">sq.ft</option>
                        <option value="running ft">running ft</option>
                        <option value="bundles">bundles</option>
                        <option value="nos">nos</option>
                      </select>
                    </td>
                    <td className="p-1.5">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={it.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                        placeholder="1"
                        className="input text-xs py-1 px-2 text-center font-bold"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={it.rate}
                        onChange={(e) => handleItemChange(idx, 'rate', e.target.value)}
                        placeholder="0"
                        className="input text-xs py-1 px-2 text-right font-mono"
                      />
                    </td>
                    <td className="p-1.5 text-right font-mono font-bold text-surface-900 pr-3">
                      ₹{it.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-1.5 text-center">
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

          {/* Financial Calculation Summary Card */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 p-3 bg-surface-50 rounded-xl border border-surface-200">
            <div className="space-y-2 max-w-sm w-full">
              <label className="text-[11px] font-semibold text-surface-600 block">Terms &amp; Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Validity: 1 Week | 50% advance, remaining on delivery."
                className="input text-xs w-full py-1.5 bg-white"
              />

              {/* Extra Charges Section: Transport & Selection */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[10px] font-bold text-surface-700 block mb-0.5">
                    Transportation Charges (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={transportCharges}
                    onChange={(e) => setTransportCharges(e.target.value)}
                    placeholder="0"
                    className="input text-xs w-full py-1 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-surface-700 block mb-0.5">
                    Loading / Unloading Charges (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={selectionCharges}
                    onChange={(e) => setSelectionCharges(e.target.value)}
                    placeholder="0"
                    className="input text-xs w-full py-1 bg-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="applyGstToggle"
                  checked={applyGst}
                  onChange={(e) => setApplyGst(e.target.checked)}
                  className="rounded border-surface-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="applyGstToggle" className="text-xs font-semibold text-surface-800 cursor-pointer select-none">
                  Apply 18% GST (CGST 9% + SGST 9%)
                </label>
              </div>
            </div>

            <div className="w-full sm:w-64 space-y-1.5 text-xs">
              <div className="flex justify-between text-surface-600">
                <span>Total Quantity:</span>
                <span className="font-bold text-surface-900">{totalQuantity} sheets</span>
              </div>
              <div className="flex justify-between text-surface-600">
                <span>Items Subtotal:</span>
                <span className="font-mono font-semibold text-surface-900">
                  ₹{itemsSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {parsedTransport > 0 && (
                <div className="flex justify-between text-surface-600 text-[11px]">
                  <span>Transportation:</span>
                  <span className="font-mono text-surface-800">+₹{parsedTransport.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {parsedSelection > 0 && (
                <div className="flex justify-between text-surface-600 text-[11px]">
                  <span>Loading / Unloading:</span>
                  <span className="font-mono text-surface-800">+₹{parsedSelection.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between text-surface-700 font-semibold pt-1 border-t border-surface-200">
                <span>Net Subtotal:</span>
                <span className="font-mono font-bold text-surface-900">
                  ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {applyGst && (
                <>
                  <div className="flex justify-between text-surface-600 text-[11px]">
                    <span>CGST (9%):</span>
                    <span className="font-mono">₹{cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-surface-600 text-[11px]">
                    <span>SGST (9%):</span>
                    <span className="font-mono">₹{sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm font-bold text-blue-900 pt-2 border-t border-surface-200">
                <span>Estimated Total:</span>
                <span className="font-mono">
                  ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 bg-surface-50 border-t border-surface-200 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary py-1.5 px-3 text-xs"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSave(false, false)}
              className="btn-secondary py-1.5 px-3 text-xs font-bold flex items-center gap-1.5"
            >
              <Save size={13} />
              <span>Save Draft</span>
            </button>

            <button
              type="button"
              onClick={() => handleSave(false, true)}
              className="py-1.5 px-3 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Save quotation and download PDF"
            >
              <Download size={13} />
              <span>Download PDF</span>
            </button>

            <button
              type="button"
              onClick={() => handleSave(true, false)}
              className="py-1.5 px-3.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Send size={13} />
              <span>Save &amp; Send WhatsApp 📲</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
