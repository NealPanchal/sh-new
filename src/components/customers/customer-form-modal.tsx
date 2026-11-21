'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useApp } from '@/lib/context';
import { customerSchema, CustomerFormValues } from '@/lib/validations';
import { X, Plus, Trash2, User, Building2, Compass, CreditCard } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { cn } from '@/lib/utils';

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
      email: '',
      customer_type: 'client',
      is_architect: false,
      architect_firm: '',
      billing_address: '',
      delivery_address: '',
      gstin: '',
      notes: '',
    },
  });

  const [isPartyArchitect, setIsPartyArchitect] = useState(false);
  const [creditStatus, setCreditStatus] = useState<'credit' | 'no_credit'>('credit');
  const [customerSites, setCustomerSites] = useState<Array<{ id: string; site_name: string; site_address: string }>>([
    { id: 'site_1', site_name: 'Site 1', site_address: '' },
  ]);

  useEffect(() => {
    if (editId) {
      const customer = getCustomer(editId);
      if (customer) {
        const isArch = Boolean(customer.is_architect || customer.customer_type === 'architect');
        setIsPartyArchitect(isArch);
        setCreditStatus(customer.credit_status === 'no_credit' || customer.is_credit_blocked ? 'no_credit' : 'credit');
        reset({
          business_name: customer.business_name,
          contact_person: customer.contact_person || '',
          phone: customer.phone,
          email: customer.email || '',
          customer_type: isArch ? 'architect' : 'client',
          is_architect: isArch,
          architect_firm: customer.architect_firm || '',
          billing_address: customer.billing_address,
          delivery_address: customer.delivery_address || '',
          gstin: customer.gstin || '',
          notes: customer.notes || '',
        });
        if (Array.isArray(customer.sites) && customer.sites.length > 0) {
          setCustomerSites(
            customer.sites.map((s, idx) => ({
              id: s.id || `site_${idx + 1}`,
              site_name: s.site_name || `Site ${idx + 1}`,
              site_address: s.site_address || '',
            }))
          );
        } else if (customer.delivery_address) {
          setCustomerSites([
            { id: `site_1_${customer.id}`, site_name: 'Site 1', site_address: customer.delivery_address },
          ]);
        } else {
          setCustomerSites([{ id: 'site_1', site_name: 'Site 1', site_address: '' }]);
        }
      }
    } else {
      setIsPartyArchitect(false);
      setCustomerSites([{ id: 'site_1', site_name: 'Site 1', site_address: '' }]);
    }
  }, [editId, getCustomer, reset]);

  const onSubmit = (data: CustomerFormValues) => {
    const validSites = customerSites
      .filter((s) => s.site_address?.trim())
      .map((s, idx) => ({
        id: s.id || `site_${editId || 'new'}_${Date.now()}_${idx}`,
        customer_id: editId || '',
        site_name: s.site_name?.trim() || `Site ${idx + 1}`,
        name: s.site_name?.trim() || `Site ${idx + 1}`,
        site_address: s.site_address.trim(),
        location: s.site_address.trim(),
        created_at: new Date().toISOString(),
        is_active: true,
      }));

    const user = getCurrentUser();
    const cleanContact = data.contact_person.trim();
    const cleanBusiness = data.business_name?.trim() || cleanContact;
    const cleanDelivery = validSites[0]?.site_address || data.delivery_address?.trim() || '';
    const cleanBilling = cleanDelivery || 'Showhouse Site';
    const isArch = isPartyArchitect;

    const existingCust = editId ? getCustomer(editId) : null;

    const payload = {
      name: cleanBusiness,
      business_name: cleanBusiness,
      contact_person: cleanContact,
      phone: data.phone,
      email: data.email?.trim() || null,
      customer_type: isArch ? ('architect' as const) : ('client' as const),
      is_architect: isArch,
      architect_firm: isArch ? (data.architect_firm?.trim() || cleanBusiness || cleanContact) : null,
      billing_address: cleanBilling,
      delivery_address: cleanDelivery || null,
      sites: validSites,
      gstin: data.gstin ? data.gstin.toUpperCase() : null,
      notes: data.notes || null,
      credit_status: creditStatus,
      is_credit_blocked: creditStatus === 'no_credit',
      // Retain existing material rates if editing so they are never lost
      material_rates: existingCust?.material_rates || [],
      created_by: user?.username || 'admin',
      creator_name: user?.name || user?.username || 'Admin SH',
      user_id: user?.username || 'admin',
    };

    if (editId) {
      updateCustomer(editId, payload);
      showToast(isArch ? 'Architect profile updated successfully!' : 'Customer updated successfully!', 'success');
    } else {
      createCustomer(payload);
      showToast(isArch ? 'Architect added to Directory successfully!' : 'Customer created successfully!', 'success');
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content animate-slide-up max-w-2xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-surface-100">
          <div className="flex items-center gap-2">
            {isPartyArchitect ? (
              <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
                <Compass size={18} />
              </div>
            ) : (
              <div className="p-2 rounded-xl bg-orange-100 text-[#ea580c]">
                <User size={18} />
              </div>
            )}
            <div>
              <h2 className="text-base sm:text-lg font-bold text-surface-900">
                {editId
                  ? (isPartyArchitect ? 'Edit Architect Profile' : 'Edit Customer')
                  : (isPartyArchitect ? 'Add New Architect' : 'Add New Customer')}
              </h2>
              <p className="text-[11px] text-surface-500">
                {isPartyArchitect
                  ? 'Architectural firm, contact details & sites'
                  : 'Party master & delivery contact details'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-4 sm:p-5 space-y-4">
          {/* Party Bifurcation Segmented Toggle: Client vs Architect */}
          <div className="flex items-center gap-2 p-1.5 bg-surface-100 rounded-xl border border-surface-200">
            <button
              type="button"
              onClick={() => setIsPartyArchitect(false)}
              className={cn(
                'flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer',
                !isPartyArchitect
                  ? 'bg-white text-surface-900 shadow-xs border border-surface-200'
                  : 'text-surface-600 hover:text-surface-900'
              )}
            >
              <User size={15} className={!isPartyArchitect ? 'text-[#ea580c]' : ''} />
              <span>Regular Client / Party</span>
            </button>
            <button
              type="button"
              onClick={() => setIsPartyArchitect(true)}
              className={cn(
                'flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer',
                isPartyArchitect
                  ? 'bg-gradient-to-r from-purple-700 to-indigo-700 text-white shadow-sm'
                  : 'text-surface-600 hover:text-surface-900'
              )}
            >
              <Compass size={15} className={isPartyArchitect ? 'text-amber-300' : ''} />
              <span>Architect / Interior Designer</span>
            </button>
          </div>

          {/* Credit / No Credit Option */}
          <div className="p-3 bg-surface-50 rounded-xl border border-surface-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-surface-900 flex items-center gap-1.5">
                <CreditCard size={14} className={creditStatus === 'credit' ? 'text-emerald-600' : 'text-rose-600'} />
                <span>Credit / Payment Terms</span>
              </label>
              <span
                className={cn(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                  creditStatus === 'credit'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-rose-50 text-rose-700 border-rose-300'
                )}
              >
                {creditStatus === 'credit' ? '✓ Credit Allowed' : '⛔ Strict No Credit'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCreditStatus('credit')}
                className={cn(
                  'py-2 px-3 text-xs font-bold rounded-lg border transition-all flex items-center justify-center gap-1.5 cursor-pointer',
                  creditStatus === 'credit'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                    : 'bg-white text-surface-700 border-surface-200 hover:bg-surface-100'
                )}
              >
                <span>Credit (Udhar Allowed)</span>
              </button>
              <button
                type="button"
                onClick={() => setCreditStatus('no_credit')}
                className={cn(
                  'py-2 px-3 text-xs font-bold rounded-lg border transition-all flex items-center justify-center gap-1.5 cursor-pointer',
                  creditStatus === 'no_credit'
                    ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                    : 'bg-white text-surface-700 border-surface-200 hover:bg-surface-100'
                )}
              >
                <span>No Credit (Cash / Advance)</span>
              </button>
            </div>
            {creditStatus === 'no_credit' ? (
              <p className="text-[11px] text-rose-600 font-medium">
                ⚠️ Material dispatch requires 100% advance or payment on delivery. Ledger credit is restricted.
              </p>
            ) : (
              <p className="text-[11px] text-emerald-700 font-medium">
                ✓ Party is eligible for regular credit challans &amp; billing.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">
                {isPartyArchitect ? 'Principal Architect / Contact Person *' : 'Contact Person *'}
              </label>
              <input
                {...register('contact_person')}
                className={`input ${errors.contact_person ? 'input-error' : ''}`}
                placeholder={isPartyArchitect ? 'e.g. Ar. Taniya / Rajesh Sharma' : 'e.g. Rajesh Sharma'}
              />
              {errors.contact_person && <p className="error-text">{errors.contact_person.message}</p>}
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
              <label className="label">
                {isPartyArchitect ? 'Architectural Studio / Firm Name (Optional)' : 'Business / Customer Name (Optional)'}
              </label>
              <input
                {...register('business_name')}
                className="input"
                placeholder={isPartyArchitect ? 'e.g. Taniya Arch & Associates' : 'e.g. Sharma Interiors (Optional)'}
              />
              {errors.business_name && <p className="error-text">{errors.business_name.message}</p>}
            </div>

            <div>
              <label className="label">{isPartyArchitect ? 'Architect Email (Optional)' : 'Email Address (Optional)'}</label>
              <input
                type="email"
                {...register('email')}
                className={`input ${errors.email ? 'input-error' : ''}`}
                placeholder="studio@architect.com"
              />
              {errors.email && <p className="error-text">{errors.email.message}</p>}
            </div>
          </div>

          <div>
            <label className="label">GSTIN (Optional)</label>
            <input
              {...register('gstin')}
              className={`input uppercase font-mono ${errors.gstin ? 'input-error' : ''}`}
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
            />
            {errors.gstin && <p className="error-text">{errors.gstin.message}</p>}
          </div>

          {/* Multiple Delivery Sites Section */}
          <div className="space-y-2 p-3 bg-surface-50 rounded-xl border border-surface-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-surface-900 flex items-center gap-1.5">
                <Building2 size={14} className="text-[#ea580c]" />
                <span>Delivery Sites (Multiple Projects)</span>
              </label>
              <button
                type="button"
                onClick={() =>
                  setCustomerSites((prev) => [
                    ...prev,
                    {
                      id: `site_${Date.now()}`,
                      site_name: `Site ${prev.length + 1}`,
                      site_address: '',
                    },
                  ])
                }
                className="py-1 px-2 text-[11px] font-bold bg-white text-[#ea580c] hover:bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <Plus size={11} />
                <span>+ Add Site ({`Site ${customerSites.length + 1}`})</span>
              </button>
            </div>

            <div className="space-y-2">
              {customerSites.map((site, sIdx) => (
                <div key={site.id || sIdx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={site.site_name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomerSites((prev) => {
                        const copy = [...prev];
                        copy[sIdx] = { ...copy[sIdx], site_name: val };
                        return copy;
                      });
                    }}
                    placeholder={`Site ${sIdx + 1}`}
                    className="input text-xs font-bold w-28 shrink-0 bg-white"
                  />
                  <input
                    type="text"
                    value={site.site_address}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomerSites((prev) => {
                        const copy = [...prev];
                        copy[sIdx] = { ...copy[sIdx], site_address: val };
                        return copy;
                      });
                    }}
                    placeholder={
                      sIdx === 0
                        ? (isPartyArchitect ? 'Studio / Office / Site Address (Primary)' : 'Primary Delivery Site Address (e.g. 2902, Runwal Sanctuary, Mulund)')
                        : `Site ${sIdx + 1} Address`
                    }
                    className="input text-xs flex-1 bg-white"
                  />
                  {customerSites.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setCustomerSites((prev) => prev.filter((_, i) => i !== sIdx))}
                      className="p-1.5 text-surface-400 hover:text-rose-600 cursor-pointer"
                      title="Remove site"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
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
