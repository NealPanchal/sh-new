'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useApp } from '@/lib/context';
import { customerSchema, CustomerFormValues } from '@/lib/validations';
import { X, Plus, Trash2, Layers, Download, Send, CheckSquare, Square, ShieldAlert } from 'lucide-react';
import { CustomerMaterialRate } from '@/types';
import { exportCustomerRatesToPDF } from '@/lib/pdf-rates';
import { shareCustomerRatesViaWhatsApp } from '@/lib/whatsapp';

interface CustomerFormModalProps {
  editId: string | null;
  onClose: () => void;
}

export function CustomerFormModal({ editId, onClose }: CustomerFormModalProps) {
  const { getCustomer, createCustomer, updateCustomer, showToast } = useApp();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      business_name: '',
      contact_person: '',
      phone: '',
      billing_address: '',
      delivery_address: '',
      gstin: '',
      notes: '',
    },
  });

  const [materialRates, setMaterialRates] = useState<CustomerMaterialRate[]>([]);
  const [selectedRateIds, setSelectedRateIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (editId) {
      const customer = getCustomer(editId);
      if (customer) {
        reset({
          business_name: customer.business_name,
          contact_person: customer.contact_person || '',
          phone: customer.phone,
          billing_address: customer.billing_address,
          delivery_address: customer.delivery_address || '',
          gstin: customer.gstin || '',
          notes: customer.notes || '',
        });
        if (Array.isArray(customer.material_rates) && customer.material_rates.length > 0) {
          setMaterialRates(customer.material_rates);
        } else {
          setMaterialRates([]);
        }
      }
    } else {
      setMaterialRates([]);
    }
  }, [editId, getCustomer, reset]);

  const handleAddMaterialRow = () => {
    const newId = `mr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setMaterialRates((prev) => [
      ...prev,
      {
        id: newId,
        room: 'Living Room',
        particulars: '',
        code: '',
        company_name: '',
        rate: 0,
      },
    ]);
  };

  const handleUpdateMaterialRow = (index: number, field: keyof CustomerMaterialRate, value: any) => {
    setMaterialRates((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleRemoveMaterialRow = (index: number) => {
    const targetId = materialRates[index]?.id;
    setMaterialRates((prev) => prev.filter((_, i) => i !== index));
    if (targetId) {
      setSelectedRateIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    }
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
    if (selectedRateIds.size === materialRates.length) {
      setSelectedRateIds(new Set());
    } else {
      setSelectedRateIds(new Set(materialRates.map((mr) => mr.id)));
    }
  };

  const handleDeleteSelectedRates = () => {
    if (selectedRateIds.size === 0) {
      showToast('Please select at least one row using the checkboxes', 'error');
      return;
    }
    const count = selectedRateIds.size;
    setMaterialRates((prev) => prev.filter((mr) => !selectedRateIds.has(mr.id)));
    setSelectedRateIds(new Set());
    showToast(`Removed ${count} selected material rate(s)`, 'info');
  };

  const getTargetRatesToExport = () => {
    if (selectedRateIds.size > 0) {
      return materialRates.filter((mr) => selectedRateIds.has(mr.id));
    }
    return materialRates.filter((mr) => (mr.rate && mr.rate > 0) || mr.room || mr.particulars || mr.code);
  };

  const handleDownloadRatesPDF = () => {
    const list = getTargetRatesToExport();
    if (list.length === 0) {
      showToast('No materials to download. Add rows or select items first.', 'error');
      return;
    }
    const name = watch('business_name') || 'Customer';
    const contact = watch('contact_person') || undefined;
    const phone = watch('phone') || undefined;
    const deliv = watch('delivery_address') || undefined;
    exportCustomerRatesToPDF({
      customerName: name,
      contactPerson: contact,
      phone,
      deliveryAddress: deliv,
      selectedRates: list,
    });
    showToast('Downloaded Customer Material Rates PDF!', 'success');
  };

  const handleShareRatesWhatsApp = () => {
    const list = getTargetRatesToExport();
    if (list.length === 0) {
      showToast('No materials to share. Add rows or select items first.', 'error');
      return;
    }
    const name = watch('business_name') || 'Customer';
    const phone = watch('phone') || '';
    shareCustomerRatesViaWhatsApp({
      customerName: name,
      phone,
      selectedRates: list,
      onToast: showToast,
    });
  };

  const onSubmit = (data: CustomerFormValues) => {
    const validRates = materialRates.filter(
      (m) => m.particulars?.trim() || m.code?.trim() || m.company_name?.trim() || m.rate > 0
    );

    if (editId) {
      updateCustomer(editId, {
        business_name: data.business_name,
        contact_person: data.contact_person || null,
        phone: data.phone,
        billing_address: data.billing_address,
        delivery_address: data.delivery_address || null,
        gstin: data.gstin ? data.gstin.toUpperCase() : null,
        notes: data.notes || null,
        material_rates: validRates,
      });
      showToast('Customer updated successfully', 'success');
    } else {
      createCustomer({
        business_name: data.business_name,
        contact_person: data.contact_person || null,
        phone: data.phone,
        billing_address: data.billing_address,
        delivery_address: data.delivery_address || null,
        gstin: data.gstin ? data.gstin.toUpperCase() : null,
        notes: data.notes || null,
        material_rates: validRates,
      });
      showToast('Customer created successfully', 'success');
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content animate-slide-up max-w-4xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-surface-100">
          <h2 className="text-lg font-semibold text-surface-800">
            {editId ? 'Edit Customer' : 'Add New Customer'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-4 sm:p-5 space-y-4">
          <div>
            <label className="label">Business / Customer Name *</label>
            <input {...register('business_name')} className={`input ${errors.business_name ? 'input-error' : ''}`} placeholder="e.g. Sharma Interiors" />
            {errors.business_name && <p className="error-text">{errors.business_name.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Contact Person</label>
              <input {...register('contact_person')} className="input" placeholder="e.g. Rajesh Sharma" />
            </div>

            <div>
              <label className="label">Mobile / WhatsApp Number *</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-surface-500 bg-surface-50 px-3 py-2.5 rounded-lg border border-surface-200">+91</span>
                <input
                  {...register('phone')}
                  className={`input flex-1 ${errors.phone ? 'input-error' : ''}`}
                  placeholder="9876543210"
                  maxLength={10}
                />
              </div>
              {errors.phone && <p className="error-text">{errors.phone.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Billing Address *</label>
              <textarea
                {...register('billing_address')}
                className={`input min-h-[70px] ${errors.billing_address ? 'input-error' : ''}`}
                placeholder="Complete billing address"
                rows={2}
              />
              {errors.billing_address && <p className="error-text">{errors.billing_address.message}</p>}
            </div>

            <div>
              <label className="label">Delivery Address</label>
              <textarea
                {...register('delivery_address')}
                className="input min-h-[70px]"
                placeholder="If different from billing address"
                rows={2}
              />
            </div>
          </div>

          <div>
            <label className="label">GSTIN</label>
            <input
              {...register('gstin')}
              className={`input uppercase font-mono ${errors.gstin ? 'input-error' : ''}`}
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
            />
            {errors.gstin && <p className="error-text">{errors.gstin.message}</p>}
          </div>

          {/* Material & Rate Contract Matrix (Room, Particulars, Code, Company, Rate) */}
          <div className="space-y-2 pt-3 border-t border-surface-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <label className="text-xs font-bold text-surface-900 flex items-center gap-1.5">
                  <span className="p-1 rounded bg-[#ea580c]/10 text-[#ea580c]">
                    <Layers size={14} />
                  </span>
                  <span>Material &amp; Rate Contract (Auto-applied in Challans)</span>
                </label>
                <p className="text-[11px] text-surface-500 flex items-center gap-1 mt-0.5">
                  <span className="font-semibold text-emerald-700">🔒 Customer Confidentiality:</span>
                  <span>WhatsApp &amp; PDF will only show <b>Room</b>, <b>Particulars</b> &amp; <b>Rate</b>. Code &amp; Company remain internal.</span>
                </p>
              </div>

              {/* Action Toolbar: Selection, Delete, Download, WhatsApp, Add */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {selectedRateIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleDeleteSelectedRates}
                    className="py-1 px-2.5 text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-300 rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                    title="Delete selected rows"
                  >
                    <Trash2 size={12} />
                    <span>Delete ({selectedRateIds.size})</span>
                  </button>
                )}

                {materialRates.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleDownloadRatesPDF}
                      className="py-1 px-2.5 text-xs font-bold bg-surface-100 hover:bg-surface-200 text-surface-800 border border-surface-300 rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                      title="Download PDF rate sheet (Room, Particulars & Rate only)"
                    >
                      <Download size={12} />
                      <span>{selectedRateIds.size > 0 ? `PDF (${selectedRateIds.size})` : 'Download PDF'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShareRatesWhatsApp}
                      className="py-1 px-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                      title="Share selected rates via WhatsApp (Room, Particulars & Rate only)"
                    >
                      <Send size={12} />
                      <span>{selectedRateIds.size > 0 ? `WhatsApp (${selectedRateIds.size})` : 'WhatsApp Share'}</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={handleAddMaterialRow}
                  className="py-1 px-2.5 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
                >
                  <Plus size={12} />
                  <span>+ Add Row</span>
                </button>
              </div>
            </div>

            {materialRates.length > 0 ? (
              <div className="border border-surface-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-surface-50 border-b border-surface-200 text-surface-700 font-bold uppercase text-[10px] sticky top-0 z-10">
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
                      <th className="py-2 px-2.5 w-24 text-right">Rate (₹)</th>
                      <th className="py-2 px-1.5 w-8 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {materialRates.map((mr, idx) => {
                      const isChecked = selectedRateIds.has(mr.id);
                      return (
                        <tr key={mr.id || idx} className={isChecked ? 'bg-amber-50/50' : 'hover:bg-surface-50/50'}>
                          <td className="p-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectRate(mr.id)}
                              className="rounded border-surface-300 text-[#ea580c] focus:ring-[#ea580c] cursor-pointer"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              list="room-options"
                              value={mr.room}
                              onChange={(e) => handleUpdateMaterialRow(idx, 'room', e.target.value)}
                              placeholder="e.g. Master Bed"
                              className="input text-xs py-1 px-2 w-full font-medium"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={mr.particulars || ''}
                              onChange={(e) => handleUpdateMaterialRow(idx, 'particulars', e.target.value)}
                              placeholder="e.g. High Gloss Acrylic 1.5mm"
                              className="input text-xs py-1 px-2 w-full font-semibold text-surface-900"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={mr.code}
                              onChange={(e) => handleUpdateMaterialRow(idx, 'code', e.target.value)}
                              placeholder="e.g. SF-102"
                              className="input text-xs py-1 px-2 w-full font-mono text-zinc-700 font-semibold"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={mr.company_name}
                              onChange={(e) => handleUpdateMaterialRow(idx, 'company_name', e.target.value)}
                              placeholder="e.g. Royal Oak"
                              className="input text-xs py-1 px-2 w-full font-medium text-zinc-700"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              step="0.01"
                              value={mr.rate || ''}
                              onChange={(e) => handleUpdateMaterialRow(idx, 'rate', Number(e.target.value) || 0)}
                              placeholder="850.00"
                              className="input text-xs py-1 px-2 w-full text-right font-mono font-bold text-surface-900"
                            />
                          </td>
                          <td className="p-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveMaterialRow(idx)}
                              className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
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
                </datalist>
              </div>
            ) : (
              <div className="p-3.5 bg-surface-50 rounded-lg border border-dashed border-surface-300 text-center text-xs text-surface-500">
                No materials/rates configured yet. Click <b>&quot;+ Add Row&quot;</b> to add pre-agreed rates for this customer.
              </div>
            )}
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              {...register('notes')}
              className="input min-h-[50px]"
              placeholder="Any additional notes..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-surface-100">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {editId ? 'Update Customer' : 'Save Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
