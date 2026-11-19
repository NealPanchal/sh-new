'use client';

import React, { useState } from 'react';
import { Customer, CustomerSite } from '@/types';
import { useApp } from '@/lib/context';
import { X, Building2, Plus, MapPin, Check } from 'lucide-react';

interface SiteModalProps {
  customer: Customer;
  editSite?: CustomerSite | null;
  onClose: () => void;
  onSaved?: (newSite: CustomerSite) => void;
}

export function SiteModal({ customer, editSite, onClose, onSaved }: SiteModalProps) {
  const { updateCustomer, showToast } = useApp();

  const existingSites: CustomerSite[] = Array.isArray(customer.sites) ? [...customer.sites] : [];
  const nextSiteNum = existingSites.length + 1;

  const [siteName, setSiteName] = useState(
    editSite?.site_name || `Site ${nextSiteNum}`
  );
  const [siteAddress, setSiteAddress] = useState(
    editSite?.site_address || ''
  );
  const [contactPerson, setContactPerson] = useState(
    editSite?.contact_person || ''
  );
  const [phone, setPhone] = useState(
    editSite?.phone || ''
  );

  const handleSave = () => {
    if (!siteName.trim()) {
      showToast('Please enter a site name or label (e.g. Site 2)', 'error');
      return;
    }
    if (!siteAddress.trim()) {
      showToast('Please enter site / delivery address', 'error');
      return;
    }

    const siteId = editSite?.id || `site_${customer.id}_${Date.now()}`;
    const newSite: CustomerSite = {
      id: siteId,
      customer_id: customer.id,
      site_name: siteName.trim(),
      name: siteName.trim(),
      site_address: siteAddress.trim(),
      location: siteAddress.trim(),
      contact_person: contactPerson.trim() || undefined,
      phone: phone.trim() || undefined,
      created_at: editSite?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: true,
    };

    let updatedSites: CustomerSite[] = [];
    if (editSite) {
      updatedSites = existingSites.map((s) => (s.id === editSite.id ? newSite : s));
    } else {
      updatedSites = [...existingSites, newSite];
    }

    updateCustomer(customer.id, {
      sites: updatedSites,
    });

    // Also sync to server /api/sites
    fetch('/api/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customer.id,
        site_name: siteName.trim(),
        site_address: siteAddress.trim(),
        contact_person: contactPerson.trim() || undefined,
        phone: phone.trim() || undefined,
      }),
    }).catch(() => {});

    showToast(`Site "${siteName}" saved successfully!`, 'success');
    if (onSaved) onSaved(newSite);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content animate-slide-up max-w-md w-full p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 bg-surface-50 border-b border-surface-200">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-orange-100 text-[#ea580c]">
              <Building2 size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-surface-900">
                {editSite ? 'Edit Site' : 'Add New Customer Site'}
              </h2>
              <p className="text-[11px] text-surface-500">{customer.business_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-200 text-surface-400">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-3.5 text-xs">
          <div>
            <label className="label text-[11px] font-semibold text-surface-700">
              Site Name / Label *
            </label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="e.g. Site 2, Rustomjee Majiwada, Flat 402"
              className="input text-xs font-semibold"
            />
            <p className="text-[10px] text-surface-400 mt-1">
              Used to identify this project when creating Challans &amp; Quotations.
            </p>
          </div>

          <div>
            <label className="label text-[11px] font-semibold text-surface-700 flex items-center gap-1">
              <MapPin size={12} className="text-[#ea580c]" />
              <span>Full Delivery Site Address *</span>
            </label>
            <textarea
              rows={3}
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
              placeholder="e.g. Flat 502, Wing B, Rustomjee Urbania, Majiwada, Thane (W) - 400601"
              className="input text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="label text-[11px] font-semibold text-surface-700">
                Site Incharge (Optional)
              </label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. Supervisor Raju"
                className="input text-xs"
              />
            </div>
            <div>
              <label className="label text-[11px] font-semibold text-surface-700">
                Incharge Phone (Optional)
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                className="input text-xs"
              />
            </div>
          </div>
        </div>

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
            <span>Save Site</span>
          </button>
        </div>
      </div>
    </div>
  );
}
