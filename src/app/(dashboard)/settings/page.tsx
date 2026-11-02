'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
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
  ShieldAlert,
  FileCheck,
  Users,
  Plus,
  X,
  Trash2,
  Key,
  Eye,
  EyeOff,
  Copy,
  Lock,
  FileSpreadsheet,
} from 'lucide-react';
import { BusinessProfile, EmployeeAccount } from '@/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn, formatDateIndian } from '@/lib/utils';
import { exportMonthSalesToExcel } from '@/lib/excel-export';
import * as store from '@/lib/demo-store';

function formatMonthYearLabel(monthKey: string): string {
  if (!monthKey || monthKey === 'all') return 'All Time (Complete Sales)';
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

export default function SettingsPage() {
  const { profile, saveProfile, showToast, isLoading, isEmployee, currentUser, challans } =
    useApp();
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

  // Employees / Creators (Billed By)
  const [employees, setEmployees] = useState<string[]>(['Neal', 'Vrushank']);

  // Employee Accounts Management
  const [employeeAccounts, setEmployeeAccounts] = useState<EmployeeAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [savingAccounts, setSavingAccounts] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [deleteAccountTarget, setDeleteAccountTarget] = useState<EmployeeAccount | null>(null);

  // Monthly Sales Backup State
  const [selectedBackupMonth, setSelectedBackupMonth] = useState<string>('');

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
      setEmployees(
        profile.employees && profile.employees.length > 0
          ? profile.employees
          : ['Neal', 'Vrushank']
      );
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

  // Load Employee Accounts
  useEffect(() => {
    if (mounted && !isEmployee) {
      setLoadingAccounts(true);
      fetch('/api/employees')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.employees)) {
            setEmployeeAccounts(data.employees);
            if (typeof window !== 'undefined') {
              localStorage.setItem('showhouse_employee_cache', JSON.stringify(data.employees));
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoadingAccounts(false));
    }
  }, [mounted, isEmployee]);

  // Monthly Sales Backup computations
  const availableMonths = React.useMemo(() => {
    const all = challans && challans.length > 0 ? challans : store.getChallans();
    const set = new Set<string>();
    all.forEach((c) => {
      if (c.challan_date) {
        const d = new Date(c.challan_date);
        if (!isNaN(d.getTime())) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          set.add(key);
        }
      }
    });
    return Array.from(set).sort().reverse();
  }, [challans]);

  useEffect(() => {
    if (availableMonths.length > 0 && !selectedBackupMonth) {
      setSelectedBackupMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedBackupMonth]);

  const monthChallans = React.useMemo(() => {
    const all = challans && challans.length > 0 ? challans : store.getChallans();
    if (!selectedBackupMonth || selectedBackupMonth === 'all') return all;
    return all.filter((c) => c.challan_date && c.challan_date.startsWith(selectedBackupMonth));
  }, [challans, selectedBackupMonth]);

  const monthTotalQty = React.useMemo(() => {
    return monthChallans.reduce((s, c) => s + (Number(c.total_quantity) || 0), 0);
  }, [monthChallans]);

  const monthTotalAmt = React.useMemo(() => {
    return monthChallans.reduce((s, c) => s + (Number(c.total_amount) || 0), 0);
  }, [monthChallans]);

  const handleDownloadMonthlyExcel = () => {
    if (monthChallans.length === 0) {
      showToast('No challans found for the selected month to export', 'error');
      return;
    }
    const label = formatMonthYearLabel(selectedBackupMonth);
    exportMonthSalesToExcel({
      challans: monthChallans,
      monthLabel: label,
      profile,
    });
    showToast(`Exported ${label} sales report to Excel!`, 'success');
  };

  const handleUpdateAccount = (idx: number, field: keyof EmployeeAccount, value: any) => {
    const updated = [...employeeAccounts];
    updated[idx] = { ...updated[idx], [field]: value };
    setEmployeeAccounts(updated);
  };

  const handleAddStaffRow = () => {
    const nextIdx = employeeAccounts.length + 1;
    const newAcc: EmployeeAccount = {
      id: `emp_${Date.now()}_${nextIdx}`,
      name: `Staff ${nextIdx}`,
      username: `staff${nextIdx}`,
      phone: '',
      password: `staff${nextIdx}@sh26`,
      role: 'employee',
      is_active: true,
      po_prefix: `PO ST${nextIdx}`,
    };
    const updated = [...employeeAccounts, newAcc];
    setEmployeeAccounts(updated);
    showToast(`Added row for Staff ${nextIdx}. Click "Save Logins" when done!`);
  };

  const handleDeleteAccount = (acc: EmployeeAccount) => {
    if (employeeAccounts.length <= 1) {
      showToast('At least one staff member must remain active', 'error');
      return;
    }
    setDeleteAccountTarget(acc);
  };

  const confirmDeleteAccount = async () => {
    if (!deleteAccountTarget) return;
    const targetName = deleteAccountTarget.name;
    const updated = employeeAccounts.filter((a) => a.id !== deleteAccountTarget.id);
    setEmployeeAccounts(updated);
    setDeleteAccountTarget(null);

    try {
      await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees: updated }),
      });
      const activeNames = updated
        .filter((a) => a.is_active !== false)
        .map((a) => a.name.trim())
        .filter(Boolean);
      setEmployees(activeNames);
      saveProfile({ employees: activeNames });
      if (typeof window !== 'undefined') {
        localStorage.setItem('showhouse_employee_cache', JSON.stringify(updated));
      }
      showToast(`Removed staff member "${targetName}"`, 'success');
    } catch {
      showToast('Error removing staff member', 'error');
    }
  };

  const handleSaveAccounts = async () => {
    setSavingAccounts(true);
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees: employeeAccounts }),
      });
      const data = await res.json();
      if (data.success) {
        const activeNames = employeeAccounts
          .filter((a) => a.is_active !== false)
          .map((a) => a.name.trim())
          .filter(Boolean);
        setEmployees(activeNames);
        saveProfile({ employees: activeNames });
        if (typeof window !== 'undefined') {
          localStorage.setItem('showhouse_employee_cache', JSON.stringify(employeeAccounts));
        }
        showToast('All employee logins & contact numbers saved successfully!', 'success');
      } else {
        showToast(data.error || 'Failed to save employee accounts', 'error');
      }
    } catch {
      showToast('Network error while saving accounts', 'error');
    } finally {
      setSavingAccounts(false);
    }
  };

  const handleCopyCredentials = (acc: EmployeeAccount) => {
    const phoneLine = acc.phone ? `\nContact: ${acc.phone}` : '';
    const text = `Showhouse Staff Login:\nStaff: ${acc.name}${phoneLine}\nPO Series: ${acc.po_prefix || 'PO'}\nUsername: ${acc.username}\nPassword: ${acc.password}\nPortal Link: ${window.location.origin}/login`;
    navigator.clipboard.writeText(text);
    showToast(`Copied login details for ${acc.name}!`, 'success');
  };

  if (!mounted || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Security Check: If an employee tries to access Settings, block them!
  if (isEmployee) {
    return (
      <div className="card p-8 sm:p-12 text-center max-w-lg mx-auto my-12 space-y-4 shadow-sm border border-surface-200">
        <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
          <ShieldAlert size={28} />
        </div>
        <h2 className="text-lg font-bold text-surface-900">Settings Restricted to Admin</h2>
        <p className="text-xs text-surface-500 max-w-sm mx-auto leading-relaxed">
          You are currently signed in as <b>{currentUser?.name}</b> (Staff Account).
          Business profile, tax settings, and employee credentials are only accessible by the Showhouse Admin.
        </p>
        <Link
          href="/"
          className="btn-primary inline-flex items-center gap-1.5 text-xs py-2 px-4 shadow-xs mt-2"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const activeNames =
        employeeAccounts.length > 0
          ? employeeAccounts
              .filter((a) => a.is_active !== false)
              .map((a) => a.name.trim())
              .filter(Boolean)
          : employees.filter(Boolean);

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
        employees: activeNames,
        bank_name: bankName,
        bank_account: bankAccount,
        bank_ifsc: bankIfsc,
        bank_branch: bankBranch,
        terms_conditions: terms,
      });

      if (employeeAccounts.length > 0) {
        await fetch('/api/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employees: employeeAccounts }),
        });
        if (typeof window !== 'undefined') {
          localStorage.setItem('showhouse_employee_cache', JSON.stringify(employeeAccounts));
        }
      }

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
        if (parsed.customers || parsed.challans || parsed.profile || parsed.products) {
          store.importBackupData(parsed);
          showToast('Data imported successfully and synced to database! Reloading...');
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
          <div className="flex items-center justify-between pb-2 border-b border-surface-100">
            <div className="flex items-center gap-2 text-primary-600 font-bold text-base">
              <Building2 size={20} />
              <span>Showhouse Profile</span>
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Verified Brand
            </span>
          </div>

          {/* Official Logo Display */}
          <div className="p-4 rounded-xl bg-surface-50 border border-surface-200 flex flex-col sm:flex-row items-center gap-4">
            <div className="w-20 h-20 bg-white rounded-xl border border-surface-200 p-2 shadow-2xs shrink-0 flex items-center justify-center">
              <img
                src="/logo.png"
                alt="Showhouse Decor Studio Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="space-y-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <span className="text-sm font-bold text-surface-900">Official Brand Logo</span>
                <span className="text-[10px] font-semibold px-2 py-0.2 rounded bg-amber-100/70 text-amber-800 border border-amber-300/50">
                  Active
                </span>
              </div>
              <p className="text-xs text-surface-500">
                Applied automatically across delivery bills, memo pads, navigation, app icons, and PDF exports.
              </p>
            </div>
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

        {/* Employee / Billing Staff Management */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-surface-100">
            <div className="flex items-center gap-2 text-primary-600 font-bold text-base">
              <Users size={20} />
              <span>Staff Accounts & Employee Logins</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-primary-50 text-primary-700 px-2.5 py-0.5 rounded-full font-semibold border border-primary-200">
                {employeeAccounts.length} Staff Members
              </span>
              <button
                type="button"
                disabled={savingAccounts}
                onClick={handleSaveAccounts}
                className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <Save size={13} />
                <span>{savingAccounts ? 'Saving...' : 'Save Logins'}</span>
              </button>
            </div>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg text-xs space-y-1">
            <div className="font-bold text-amber-900 flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-amber-700" />
              <span>Strict Data Leakage Protection Active</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Har employee apne personal username & password se login karega. <b>Employee ko sirf apne banaye huye challans aur bills dikhenge</b>—kisi dusre employee ka data ya company ka pura customer base unhe nahi dikhega. Kalko koi employee chhod ke jaye toh data leak hone ka khatra 0% ho jata hai.
            </p>
          </div>

          {/* Unified Staff Accounts Table */}
          <div className="space-y-3 pt-1">
            <div className="overflow-x-auto border border-surface-200 rounded-lg shadow-2xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-50 text-[10px] font-bold text-surface-600 uppercase border-b border-surface-200">
                  <tr>
                    <th className="px-3 py-2.5 w-10">#</th>
                    <th className="px-3 py-2.5 min-w-[130px]">Staff Name</th>
                    <th className="px-3 py-2.5 min-w-[140px]">Contact Number</th>
                    <th className="px-3 py-2.5 min-w-[100px]">PO Prefix</th>
                    <th className="px-3 py-2.5 min-w-[110px]">Username</th>
                    <th className="px-3 py-2.5 min-w-[140px]">Password</th>
                    <th className="px-3 py-2.5 text-center w-20">Status</th>
                    <th className="px-3 py-2.5 text-right min-w-[120px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 bg-white">
                  {employeeAccounts.map((acc, idx) => {
                    const isVisible = showPasswords[acc.id];
                    return (
                      <tr key={acc.id} className="hover:bg-surface-50/70 transition-colors">
                        <td className="px-3 py-2 text-surface-400 font-mono font-bold">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={acc.name}
                            onChange={(e) => handleUpdateAccount(idx, 'name', e.target.value)}
                            placeholder="Staff Name"
                            className="input text-xs py-1 px-2 font-semibold text-surface-900 w-full"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={acc.phone || ''}
                            placeholder="e.g. +91 98765 43210"
                            onChange={(e) => handleUpdateAccount(idx, 'phone', e.target.value)}
                            className="input text-xs py-1 px-2 font-mono text-surface-800 w-full bg-surface-50/60"
                            title="Employee contact number (prints on delivery challans and quotes)"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={acc.po_prefix || ''}
                            placeholder="e.g. PO VS"
                            onChange={(e) =>
                              handleUpdateAccount(idx, 'po_prefix', e.target.value.toUpperCase())
                            }
                            className="input text-xs py-1 px-2 font-mono font-bold text-amber-700 w-full bg-surface-50"
                            title="Staff PO series prefix (e.g. PO VS 001, PO BH 001...)"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={acc.username}
                            onChange={(e) =>
                              handleUpdateAccount(
                                idx,
                                'username',
                                e.target.value.toLowerCase().trim()
                              )
                            }
                            className="input text-xs py-1 px-2 font-mono text-primary-700 w-full bg-surface-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="relative inline-flex items-center w-full">
                            <input
                              type={isVisible ? 'text' : 'password'}
                              value={acc.password}
                              onChange={(e) =>
                                handleUpdateAccount(idx, 'password', e.target.value)
                              }
                              className="input text-xs py-1 pl-2 pr-7 font-mono w-full"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowPasswords({
                                  ...showPasswords,
                                  [acc.id]: !isVisible,
                                })
                              }
                              className="absolute right-1.5 p-0.5 text-surface-400 hover:text-surface-700 cursor-pointer"
                              title={isVisible ? 'Hide password' : 'Show password'}
                            >
                              {isVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateAccount(idx, 'is_active', !acc.is_active)
                            }
                            className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer border transition-colors',
                              acc.is_active !== false
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-surface-100 text-surface-500 border-surface-200 hover:bg-surface-200'
                            )}
                          >
                            {acc.is_active !== false ? 'Active' : 'Disabled'}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleCopyCredentials(acc)}
                              className="p-1 rounded text-surface-500 hover:text-primary-600 hover:bg-surface-100 inline-flex items-center gap-1 text-[11px] font-medium"
                              title="Copy login details to send to staff"
                            >
                              <Copy size={13} />
                              <span className="hidden sm:inline">Copy</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAccount(acc)}
                              className="p-1 rounded text-surface-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                              title={`Remove ${acc.name} from staff list`}
                            >
                              <Trash2 size={13} />
                              <span className="hidden sm:inline">Remove</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Row: + Add Staff Member & Helpful Note */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={handleAddStaffRow}
                className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5 self-start cursor-pointer hover:border-primary-400"
              >
                <Plus size={14} className="text-primary-600" />
                <span>+ Add Staff Member</span>
              </button>

              <p className="text-[11px] text-surface-500">
                Active staff automatically populate the <b>&quot;Billed By&quot;</b> dropdown when generating new challans.
              </p>
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

        {/* Monthly Sales Excel Backup & Audit Card */}
        <div className="card p-6 space-y-4 border-2 border-emerald-500/25 bg-gradient-to-br from-white via-white to-emerald-50/30 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-surface-100">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-base">
              <FileSpreadsheet size={20} className="text-emerald-600" />
              <span>Monthly Sales Backup & Audit (Excel .xlsx)</span>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 border border-emerald-300 px-2.5 py-0.5 rounded-full self-start sm:self-auto">
              Executive Sales Report
            </span>
          </div>

          <p className="text-xs text-surface-600 leading-relaxed">
            Download complete monthly sales reports in Microsoft Excel (.xlsx) format for showroom accounting and GST audits. Contains two formatted sheets:
            <br />
            <b>1. Sales & Taxes Summary:</b> S.No, Challan #, PI #, Staff PO #, Billed By, Customer, Delivery Site, Items, Subtotal, Transportation, Loading, CGST 9%, SGST 9%, Addl 9%, and Grand Totals.
            <br />
            <b>2. Itemized Items:</b> Complete product-level details with brand, finish, thickness, and quantity.
          </p>

          <div className="p-4 bg-white rounded-lg border border-emerald-200/70 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-1.5 flex-1 max-w-sm">
                <label className="label text-[11px] font-bold text-surface-700 uppercase tracking-wide">
                  Select Month to Download
                </label>
                <select
                  value={selectedBackupMonth}
                  onChange={(e) => setSelectedBackupMonth(e.target.value)}
                  className="input text-xs py-2 font-medium bg-surface-50"
                >
                  {availableMonths.map((mKey) => (
                    <option key={mKey} value={mKey}>
                      {formatMonthYearLabel(mKey)}
                    </option>
                  ))}
                  <option value="all">All Dates / Complete Sales Backup</option>
                </select>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[11px] text-surface-400 font-semibold uppercase">
                    {formatMonthYearLabel(selectedBackupMonth)}
                  </div>
                  <div className="text-xs font-bold text-surface-900">
                    {monthChallans.length} Orders • {monthTotalQty} Sheets/Units
                  </div>
                  <div className="text-xs font-mono font-black text-emerald-700">
                    ₹{monthTotalAmt.toLocaleString('en-IN')}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadMonthlyExcel}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 px-4 rounded-lg shadow-xs hover:shadow transition-all inline-flex items-center gap-2 shrink-0 cursor-pointer"
                >
                  <Download size={15} />
                  <span>Download Month Sales (.xlsx)</span>
                </button>
              </div>
            </div>
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
        isOpen={Boolean(deleteAccountTarget)}
        title="Remove Staff Account?"
        message={`Are you sure you want to remove "${deleteAccountTarget?.name || 'this staff member'}"? They will no longer be able to log in or create challans under their account.`}
        variant="danger"
        confirmLabel="Remove Staff"
        onConfirm={confirmDeleteAccount}
        onCancel={() => setDeleteAccountTarget(null)}
      />

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
