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
} from 'lucide-react';
import { BusinessProfile, EmployeeAccount } from '@/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import * as store from '@/lib/demo-store';

export default function SettingsPage() {
  const { profile, saveProfile, showToast, isLoading, isEmployee, currentUser } = useApp();
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
  const [newEmployeeName, setNewEmployeeName] = useState('');

  // 10 Employee Accounts Management
  const [employeeAccounts, setEmployeeAccounts] = useState<EmployeeAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [savingAccounts, setSavingAccounts] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

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
          }
        })
        .catch(() => {})
        .finally(() => setLoadingAccounts(false));
    }
  }, [mounted, isEmployee]);

  const handleUpdateAccount = (idx: number, field: keyof EmployeeAccount, value: any) => {
    const updated = [...employeeAccounts];
    updated[idx] = { ...updated[idx], [field]: value };
    setEmployeeAccounts(updated);
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
        showToast('All 10 employee logins saved successfully!', 'success');
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
    const text = `Showhouse Staff Login:\nStaff: ${acc.name}\nPO Series: ${acc.po_prefix || 'PO'}\nUsername: ${acc.username}\nPassword: ${acc.password}\nPortal Link: ${window.location.origin}/login`;
    navigator.clipboard.writeText(text);
    showToast(`Copied login details for ${acc.name}!`, 'success');
  };

  const handleAddEmployee = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = newEmployeeName.trim();
    if (!name) return;
    if (employees.some((emp) => emp.toLowerCase() === name.toLowerCase())) {
      showToast(`${name} is already in the employee list`, 'error');
      return;
    }
    const updated = [...employees, name];
    setEmployees(updated);
    setNewEmployeeName('');
    showToast(`Added ${name} to employee list`);
  };

  const handleRemoveEmployee = (nameToRemove: string) => {
    if (employees.length <= 1) {
      showToast('At least one employee must remain in the list', 'error');
      return;
    }
    const updated = employees.filter((emp) => emp !== nameToRemove);
    setEmployees(updated);
    showToast(`Removed ${nameToRemove}`);
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
        employees: employees.filter(Boolean),
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
              <span>Staff Members & Employee Logins (10 Isolated Accounts)</span>
            </div>
            <span className="text-xs bg-primary-50 text-primary-700 px-2.5 py-0.5 rounded-full font-semibold border border-primary-200">
              {employeeAccounts.length > 0 ? employeeAccounts.length : employees.length} Staff Accounts
            </span>
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

          {/* Current Employees Badges */}
          <div className="space-y-2">
            <label className="label text-xs">Active Staff for &quot;Billed By&quot; Dropdown</label>
            <div className="flex flex-wrap items-center gap-2">
              {employees.map((emp) => (
                <div
                  key={emp}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-100 border border-surface-200 text-xs font-semibold text-surface-800 shadow-2xs"
                >
                  <div className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px]">
                    👤
                  </div>
                  <span>{emp}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveEmployee(emp)}
                    title={`Remove ${emp}`}
                    className="p-0.5 text-surface-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Add New Employee to Selector Form */}
          <div className="pt-2">
            <label className="label text-xs">Add New Staff / Employee to Selector</label>
            <div className="flex items-center gap-2 max-w-md">
              <input
                type="text"
                value={newEmployeeName}
                onChange={(e) => setNewEmployeeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEmployee();
                  }
                }}
                placeholder="e.g. Ramesh Patel"
                className="input text-xs flex-1"
              />
              <button
                type="button"
                onClick={() => handleAddEmployee()}
                className="btn-primary text-xs py-2 px-3.5 whitespace-nowrap flex items-center gap-1.5 shrink-0"
              >
                <Plus size={15} />
                <span>Add to List</span>
              </button>
            </div>
          </div>

          {/* 10 Employee Logins Table */}
          <div className="pt-4 border-t border-surface-100 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-surface-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Key size={14} className="text-primary-600" />
                  <span>10 Staff Login Accounts & Passwords</span>
                </h3>
                <p className="text-[11px] text-surface-500">
                  Aap in 10 accounts ke username aur password yaha se dekh ya badal sakte hain.
                </p>
              </div>
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

            <div className="overflow-x-auto border border-surface-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-50 text-[10px] font-bold text-surface-500 uppercase border-b border-surface-200">
                  <tr>
                    <th className="px-3 py-2 w-10">#</th>
                    <th className="px-3 py-2">Staff Name</th>
                    <th className="px-3 py-2">PO Prefix</th>
                    <th className="px-3 py-2">Username</th>
                    <th className="px-3 py-2">Password</th>
                    <th className="px-3 py-2 text-center w-20">Status</th>
                    <th className="px-3 py-2 text-right w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 bg-white">
                  {employeeAccounts.map((acc, idx) => {
                    const isVisible = showPasswords[acc.id];
                    return (
                      <tr key={acc.id} className="hover:bg-surface-50/60 transition-colors">
                        <td className="px-3 py-2 text-surface-400 font-mono font-bold">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={acc.name}
                            onChange={(e) => handleUpdateAccount(idx, 'name', e.target.value)}
                            className="input text-xs py-1 px-2 font-semibold text-surface-900 w-28 sm:w-36"
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
                            className="input text-xs py-1 px-2 font-mono font-bold text-amber-700 w-24 sm:w-28 bg-surface-50"
                            title="Staff PO series prefix (e.g. PO VS 001, PO VS 002...)"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={acc.username}
                            onChange={(e) =>
                              handleUpdateAccount(idx, 'username', e.target.value.toLowerCase().trim())
                            }
                            className="input text-xs py-1 px-2 font-mono text-primary-700 w-24 sm:w-28 bg-surface-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="relative inline-flex items-center">
                            <input
                              type={isVisible ? 'text' : 'password'}
                              value={acc.password}
                              onChange={(e) => handleUpdateAccount(idx, 'password', e.target.value)}
                              className="input text-xs py-1 pl-2 pr-7 font-mono w-32 sm:w-40"
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
                            onClick={() => handleUpdateAccount(idx, 'is_active', !acc.is_active)}
                            className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer border',
                              acc.is_active !== false
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-surface-100 text-surface-500 border-surface-200'
                            )}
                          >
                            {acc.is_active !== false ? 'Active' : 'Disabled'}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleCopyCredentials(acc)}
                            className="p-1 rounded text-surface-500 hover:text-primary-600 hover:bg-surface-100 inline-flex items-center gap-1 text-[11px] font-medium"
                            title="Copy login details to send to staff"
                          >
                            <Copy size={13} />
                            <span>Copy</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
