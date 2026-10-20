'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/lib/context';
import {
  Building2,
  FileText,
  CreditCard,
  Database,
  Save,
  RotateCcw,
  Download,
  Upload,
  Check,
  ShieldCheck,
  FileCheck,
} from 'lucide-react';
import { BusinessProfile } from '@/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import * as store from '@/lib/demo-store';

export default function SettingsPage() {
  const { profile, saveProfile, showToast, isLoading } = useApp();
  const [mounted, setMounted] = useState(false);

  // Form states
  const [businessName, setBusinessName] = useState('');
  const [tagline, setTagline] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [stateName, setStateName] = useState('Gujarat');
  const [stateCode, setStateCode] = useState('24');

  // Sequence
  const [challanPrefix, setChallanPrefix] = useState('SH/');
  const [challanNextNumber, setChallanNextNumber] = useState(1);

  // Bank & Terms
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [terms, setTerms] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (profile) {
      setBusinessName(profile.business_name || 'Showhouse');
      setTagline(profile.tagline || 'Premium Laminates & Decorative Surfaces');
      setAddress(profile.address || '');
      setPhone(profile.phone || '');
      setEmail(profile.email || '');
      setGstin(profile.gstin || '');
      setStateName(profile.state || 'Gujarat');
      setStateCode(profile.state_code || '24');
      setChallanPrefix(profile.challan_prefix || 'SH/');
      setChallanNextNumber(profile.challan_next_number || 1);
      setBankName(profile.bank_name || '');
      setBankAccount(profile.bank_account || '');
      setBankIfsc(profile.bank_ifsc || '');
      setBankBranch(profile.bank_branch || '');
      setTerms(
        profile.terms_conditions ||
          '1. Goods once delivered and verified will not be taken back.\n2. Discrepancies if any must be reported within 24 hours.\n3. This is a Delivery Challan acknowledging goods receipt and not a tax invoice.\n4. Subject to local jurisdiction.'
      );
    }
  }, [profile]);

  if (!mounted || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      saveProfile({
        business_name: businessName,
        tagline,
        address,
        phone,
        email,
        gstin,
        state: stateName,
        state_code: stateCode,
        challan_prefix: challanPrefix,
        challan_next_number: Number(challanNextNumber) || 1,
        bank_name: bankName,
        bank_account: bankAccount,
        bank_ifsc: bankIfsc,
        bank_branch: bankBranch,
        terms_conditions: terms,
      });
      showToast('Settings and business profile saved successfully');
    } catch (err) {
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleExportBackup = () => {
    const data = {
      profile: store.getProfile(),
      customers: store.getCustomers(),
      products: store.getProducts(),
      challans: store.getChallans(),
      exportedAt: new Date().toISOString(),
      app: 'Showhouse Challan System',
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Showhouse_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON backup exported successfully');
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.customers && parsed.products && parsed.challans) {
          localStorage.setItem('showhouse_customers', JSON.stringify(parsed.customers));
          localStorage.setItem('showhouse_products', JSON.stringify(parsed.products));
          localStorage.setItem('showhouse_challans', JSON.stringify(parsed.challans));
          if (parsed.profile) {
            localStorage.setItem('showhouse_profile', JSON.stringify(parsed.profile));
          }
          showToast('Data imported successfully. Reloading...');
          setTimeout(() => window.location.reload(), 1000);
        } else {
          showToast('Invalid backup file format', 'error');
        }
      } catch (err) {
        showToast('Error reading backup file', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleResetData = () => {
    store.clearAllData();
    store.seedDemoData();
    showToast('Reset to demo data complete. Reloading...');
    setTimeout(() => window.location.reload(), 800);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Business Settings</h1>
          <p className="text-sm text-surface-500 mt-1">
            Configure Showhouse business profile, challan prefixes, print preferences, and backups
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2 self-start sm:self-auto text-xs py-2.5"
        >
          <Save size={16} />
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Business Profile */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2 text-primary-600 font-bold text-base pb-2 border-b border-surface-100">
            <Building2 size={20} />
            <span>Showhouse Profile</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">Business Name *</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                className="input text-sm"
              />
            </div>
            <div>
              <label className="label text-xs">Tagline / Subtitle</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Premium Laminates & Decorative Surfaces"
                className="input text-sm"
              />
            </div>
          </div>

          <div>
            <label className="label text-xs">Shop / Showroom Address *</label>
            <textarea
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Shop No., Complex, Road, City, Pincode"
              className="input text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label text-xs">Phone / WhatsApp *</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="input text-sm"
              />
            </div>
            <div>
              <label className="label text-xs">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@showhouse.in"
                className="input text-sm"
              />
            </div>
            <div>
              <label className="label text-xs">GSTIN</label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="24ABCDE1234F1Z5"
                className="input font-mono text-sm uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">State</label>
              <input
                type="text"
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
                className="input text-sm"
              />
            </div>
            <div>
              <label className="label text-xs">State Code (GST)</label>
              <input
                type="text"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                placeholder="24"
                className="input font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* Challan Numbering Sequence */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2 text-primary-600 font-bold text-base pb-2 border-b border-surface-100">
            <FileText size={20} />
            <span>Challan Numbering & Sequencing</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">Challan Prefix</label>
              <input
                type="text"
                value={challanPrefix}
                onChange={(e) => setChallanPrefix(e.target.value)}
                placeholder="SH/"
                className="input font-mono text-sm"
              />
              <span className="text-[11px] text-surface-400 mt-1 block">
                Preview format: {challanPrefix}24-25/0001
              </span>
            </div>
            <div>
              <label className="label text-xs">Next Sequence Number</label>
              <input
                type="number"
                min="1"
                value={challanNextNumber}
                onChange={(e) => setChallanNextNumber(Number(e.target.value))}
                className="input font-mono text-sm"
              />
              <span className="text-[11px] text-surface-400 mt-1 block">
                Automatically increments with each created challan
              </span>
            </div>
          </div>
        </div>

        {/* Bank Details & Terms */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2 text-primary-600 font-bold text-base pb-2 border-b border-surface-100">
            <CreditCard size={20} />
            <span>Bank Account Details (Optional)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">Bank Name</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="HDFC Bank"
                className="input text-sm"
              />
            </div>
            <div>
              <label className="label text-xs">Account Number</label>
              <input
                type="text"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder="50200012345678"
                className="input font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">IFSC Code</label>
              <input
                type="text"
                value={bankIfsc}
                onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                placeholder="HDFC0001234"
                className="input font-mono text-sm uppercase"
              />
            </div>
            <div>
              <label className="label text-xs">Branch</label>
              <input
                type="text"
                value={bankBranch}
                onChange={(e) => setBankBranch(e.target.value)}
                placeholder="Main Branch"
                className="input text-sm"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="label text-xs">Default Terms & Conditions (On Challan Print)</label>
            <textarea
              rows={4}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="input text-xs leading-relaxed"
            />
          </div>
        </div>

        {/* Data Backup & Restore */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2 text-primary-600 font-bold text-base pb-2 border-b border-surface-100">
            <Database size={20} />
            <span>Data Management & Backup</span>
          </div>

          <p className="text-xs text-surface-500">
            Export all customers, laminate products, and delivery challans to a secure JSON file,
            or restore from a previous backup.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleExportBackup}
              className="btn-secondary text-xs py-2 flex items-center gap-2"
            >
              <Download size={15} />
              <span>Export JSON Backup</span>
            </button>

            <label className="btn-secondary text-xs py-2 flex items-center gap-2 cursor-pointer">
              <Upload size={15} />
              <span>Import JSON Backup</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="btn-ghost text-xs py-2 text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <RotateCcw size={15} />
              <span>Reset to Sample Demo Data</span>
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center gap-2 text-sm px-6 py-2.5 shadow"
          >
            <Save size={16} />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>

      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Reset to Demo Data?"
        message="This will replace current local challans, products, and customers with the sample Showhouse laminate shop records. Are you sure?"
        variant="danger"
        confirmLabel="Reset Data"
        onConfirm={handleResetData}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}
