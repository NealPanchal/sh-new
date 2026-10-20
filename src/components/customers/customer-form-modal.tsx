'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useApp } from '@/lib/context';
import { customerSchema, CustomerFormValues } from '@/lib/validations';
import { X } from 'lucide-react';

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
      }
    }
  }, [editId, getCustomer, reset]);

  const onSubmit = (data: CustomerFormValues) => {
    if (editId) {
      updateCustomer(editId, {
        business_name: data.business_name,
        contact_person: data.contact_person || null,
        phone: data.phone,
        billing_address: data.billing_address,
        delivery_address: data.delivery_address || null,
        gstin: data.gstin ? data.gstin.toUpperCase() : null,
        notes: data.notes || null,
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
