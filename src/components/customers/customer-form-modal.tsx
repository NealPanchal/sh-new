'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useApp } from '@/lib/context';
import { customerSchema, CustomerFormValues } from '@/lib/validations';
import { X, Plus, Trash2, Layers } from 'lucide-react';
import { CustomerMaterialRate } from '@/types';

interface CustomerFormModalProps {
  editId: string | null;
  onClose: () => void;
}

export function CustomerFormModal({ editId, onClose }: CustomerFormModalProps) {
  const { getCustomer, createCustomer, updateCustomer, showToast } = useApp();

  const {
    register,
    handleSubmit,
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
    setMaterialRates((prev) => [
      ...prev,
      {
        id: `mr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        room: 'Living Room',
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
    setMaterialRates((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = (data: CustomerFormValues) => {
    const validRates = materialRates.filter(
      (m) => m.code.trim() || m.company_name.trim() || m.rate > 0
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
        className="modal-content animate-slide-up max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-surface-100">
          <h2 className="text-lg font-semibold text-surface-800">
            {editId ? 'Edit Customer' : 'Add New Customer'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div>
            <label className="label">Business / Customer Name *</label>
            <input {...register('business_name')} className={`input ${errors.business_name ? 'input-error' : ''}`} placeholder="e.g. Sharma Interiors" />
            {errors.business_name && <p className="error-text">{errors.business_name.message}</p>}
          </div>

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

          <div>
            <label className="label">Billing Address *</label>
            <textarea
              {...register('billing_address')}
              className={`input min-h-[80px] ${errors.billing_address ? 'input-error' : ''}`}
              placeholder="Complete billing address"
              rows={3}
            />
            {errors.billing_address && <p className="error-text">{errors.billing_address.message}</p>}
          </div>

          <div>
            <label className="label">Delivery Address</label>
            <textarea
              {...register('delivery_address')}
              className="input min-h-[60px]"
              placeholder="If different from billing address"
              rows={2}
            />
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

          {/* 4-Column Material Rate Contract Matrix (Room, Code, Company, Rate) */}
          <div className="space-y-2 pt-2 border-t border-surface-200">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-surface-900 flex items-center gap-1.5">
                  <span className="p-1 rounded bg-[#ea580c]/10 text-[#ea580c]">
                    <Layers size={13} />
                  </span>
                  <span>Material &amp; Rate Contract (Auto-applied in Challans)</span>
                </label>
                <p className="text-[11px] text-surface-500">
                  Room code, company &amp; rate pre-defined for this party. Auto-fetches in New Challan.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddMaterialRow}
                className="py-1 px-2.5 text-xs font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <Plus size={12} />
                <span>+ Add Row</span>
              </button>
            </div>

            {materialRates.length > 0 ? (
              <div className="border border-surface-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-surface-50 border-b border-surface-200 text-surface-700 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2 px-2.5 w-32">Room</th>
                      <th className="py-2 px-2.5 w-28">Code</th>
                      <th className="py-2 px-2.5">Company Name</th>
                      <th className="py-2 px-2.5 w-28 text-right">Rate (₹)</th>
                      <th className="py-2 px-2 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {materialRates.map((mr, idx) => (
                      <tr key={mr.id || idx} className="hover:bg-surface-50/50">
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
                            value={mr.code}
                            onChange={(e) => handleUpdateMaterialRow(idx, 'code', e.target.value)}
                            placeholder="e.g. SF-102"
                            className="input text-xs py-1 px-2 w-full font-mono font-semibold"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={mr.company_name}
                            onChange={(e) => handleUpdateMaterialRow(idx, 'company_name', e.target.value)}
                            placeholder="e.g. Royal Oak"
                            className="input text-xs py-1 px-2 w-full font-medium"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            step="0.01"
                            value={mr.rate || ''}
                            onChange={(e) => handleUpdateMaterialRow(idx, 'rate', Number(e.target.value) || 0)}
                            placeholder="850.00"
                            className="input text-xs py-1 px-2 w-full text-right font-mono font-bold"
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
                    ))}
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
              <div className="p-3 bg-surface-50 rounded-lg border border-dashed border-surface-300 text-center text-xs text-surface-500">
                No materials/rates configured yet. Click <b>&quot;+ Add Row&quot;</b> to add agreed rates for this party.
              </div>
            )}
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              {...register('notes')}
              className="input min-h-[60px]"
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
