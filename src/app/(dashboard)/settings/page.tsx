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
  Ban,
  Activity,
  RefreshCw,
  Globe,
  Smartphone,
} from 'lucide-react';
import { BusinessProfile, EmployeeAccount, SecurityAuditEntry, SecurityConfig } from '@/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn, formatDateIndian } from '@/lib/utils';
import { exportMonthSalesToExcel } from '@/lib/excel-export';
import { getClientAuthToken } from '@/lib/auth';
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

  // Admin Password Management State
  const [adminUsername, setAdminUsername] = useState('adminsh');
  const [adminPhone, setAdminPhone] = useState('+91 79773 95952');
  const [adminCurrentPassword, setAdminCurrentPassword] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingAdminPassword, setSavingAdminPassword] = useState(false);
  const [adminPasswordSuccess, setAdminPasswordSuccess] = useState(false);

  // Employee self-service password & row save states
  const [empCurrentPassword, setEmpCurrentPassword] = useState('');
  const [empNewPassword, setEmpNewPassword] = useState('');
  const [empConfirmPassword, setEmpConfirmPassword] = useState('');
  const [showEmpCurrentPassword, setShowEmpCurrentPassword] = useState(false);
  const [showEmpNewPassword, setShowEmpNewPassword] = useState(false);
  const [showEmpConfirmPassword, setShowEmpConfirmPassword] = useState(false);
  const [savingEmpPassword, setSavingEmpPassword] = useState(false);
  const [empPasswordSuccess, setEmpPasswordSuccess] = useState(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  interface Account2FA {
    username: string;
    name: string;
    role: string;
    phone?: string;
    is_enrolled: boolean;
    enrolled_at?: string | null;
    backup_codes_left: number;
  }

  // Security 2FA Controls & Audit Log State
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>({
    totp_enforced: true,
    totp_issuer: 'Showhouse',
    totp_interval: 30,
    max_totp_attempts: 5,
  });
  const [securityLogs, setSecurityLogs] = useState<SecurityAuditEntry[]>([]);
  const [accounts2FA, setAccounts2FA] = useState<Account2FA[]>([]);
  const [loadingSecurity, setLoadingSecurity] = useState(false);
  const [resettingUser, setResettingUser] = useState<string | null>(null);

  // Bank & Terms
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [terms, setTerms] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const fetchSecurityData = async () => {
    try {
      setLoadingSecurity(true);
      const token = getClientAuthToken();
      const res = await fetch('/api/auth/security', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) setSecurityConfig(data.config);
        if (Array.isArray(data.logs)) setSecurityLogs(data.logs);
        if (Array.isArray(data.accounts)) setAccounts2FA(data.accounts);
      }
    } catch {
    } finally {
      setLoadingSecurity(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isEmployee) {
      const token = getClientAuthToken();
      const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      fetch('/api/auth/change-password', {
        headers: authHeader,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.username) {
            setAdminUsername(data.username);
          }
          if (data?.phone) {
            setAdminPhone(data.phone);
          }
        })
        .catch(() => {});

      fetch('/api/settings', {
        headers: authHeader,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.profile) {
            const p = data.profile;
            if (p.business_name) setBusinessName(p.business_name);
            if (p.tagline) setTagline(p.tagline);
            if (p.address) setAddress(p.address);
            if (p.phone) setPhone(p.phone);
            if (p.email) setEmail(p.email);
            if (p.gstin) setGstin(p.gstin);
            if (p.state) setStateName(p.state);
            if (p.state_code) setStateCode(p.state_code);
            if (p.challan_prefix) setChallanPrefix(p.challan_prefix);
            if (p.challan_next_number) setChallanNextNumber(p.challan_next_number);
            if (Array.isArray(p.employees) && p.employees.length > 0) setEmployees(p.employees);
            if (p.bank_name) setBankName(p.bank_name);
            if (p.bank_account) setBankAccount(p.bank_account);
            if (p.bank_ifsc) setBankIfsc(p.bank_ifsc);
            if (p.bank_branch) setBankBranch(p.bank_branch);
            if (p.terms_conditions) setTerms(p.terms_conditions);
          }
        })
        .catch(() => {});

      fetchSecurityData();
    }
  }, [mounted, isEmployee]);

  const handleResetUserTotp = async (targetUsername: string) => {
    if (!confirm(`Are you sure you want to reset Google Authenticator for @${targetUsername}? They will be required to scan a new QR code on their next login.`)) {
      return;
    }

    try {
      setResettingUser(targetUsername);
      const token = getClientAuthToken();
      const res = await fetch('/api/auth/security', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'reset_totp',
          target_username: targetUsername,
          reason: 'Admin requested 2FA reset from settings',
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showToast(data.message || `2FA reset for @${targetUsername}`, 'success');
        fetchSecurityData();
      } else {
        showToast(data.error || 'Failed to reset 2FA', 'error');
      }
    } catch {
      showToast('Error resetting user 2FA', 'error');
    } finally {
      setResettingUser(null);
    }
  };

  const [savingAdminPhone, setSavingAdminPhone] = useState(false);
  const [adminPhoneSuccess, setAdminPhoneSuccess] = useState(false);

  const handleSaveAdminPhone = async () => {
    if (!adminPhone || !adminPhone.trim()) {
      showToast('Please enter a valid mobile number', 'error');
      return;
    }
    try {
      setSavingAdminPhone(true);
      const token = getClientAuthToken();
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          phone: adminPhone.trim(),
          newUsername: adminUsername.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showToast(data.error || 'Failed to update admin contact number', 'error');
        return;
      }

      setAdminPhoneSuccess(true);
      setTimeout(() => setAdminPhoneSuccess(false), 4000);
      showToast('Admin mobile number updated successfully!', 'success');
    } catch {
      showToast('Error updating admin phone', 'error');
    } finally {
      setSavingAdminPhone(false);
    }
  };

  const handleChangeAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminNewPassword || adminNewPassword.length < 6) {
      showToast('New password must be at least 6 characters long', 'error');
      return;
    }
    if (adminNewPassword !== adminConfirmPassword) {
      showToast('New password and confirm password do not match', 'error');
      return;
    }

    try {
      setSavingAdminPassword(true);
      const token = getClientAuthToken();
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          currentPassword: adminCurrentPassword ? adminCurrentPassword.trim() : undefined,
          newPassword: adminNewPassword.trim(),
          confirmPassword: adminConfirmPassword.trim(),
          newUsername: adminUsername.trim(),
          phone: adminPhone.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        showToast(data.error || 'Failed to update admin password', 'error');
        return;
      }

      // Update client session token so user stays seamlessly authenticated
      if (data.token && typeof window !== 'undefined') {
        localStorage.setItem('showhouse_admin_token', data.token);
        const stored = localStorage.getItem('showhouse_admin_authenticated');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            parsed.username = data.username || adminUsername;
            localStorage.setItem('showhouse_admin_authenticated', JSON.stringify(parsed));
          } catch {}
        }
      }

      setAdminCurrentPassword('');
      setAdminNewPassword('');
      setAdminConfirmPassword('');
      setAdminPasswordSuccess(true);
      setTimeout(() => setAdminPasswordSuccess(false), 5000);
      showToast('Master Admin password updated successfully! Please note your new credentials.', 'success');
    } catch {
      showToast('Error updating admin password', 'error');
    } finally {
      setSavingAdminPassword(false);
    }
  };

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
      const token = getClientAuthToken();
      fetch('/api/employees', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
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
      const token = getClientAuthToken();
      await fetch('/api/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ employees: updated }),
      });
      const activeNames = updated
        .filter((a) => a.is_active !== false && !a.is_banned)
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

  const handleToggleBanAccount = async (targetId: string) => {
    const target = employeeAccounts.find((a) => a.id === targetId);
    if (!target) return;
    const isCurrentlyActive = target.is_active !== false && !target.is_banned;
    const willBan = isCurrentlyActive;

    const updated = employeeAccounts.map((a) => {
      if (a.id === targetId) {
        return {
          ...a,
          is_active: !willBan,
          is_banned: willBan,
        };
      }
      return a;
    });
    setEmployeeAccounts(updated);

    try {
      const token = getClientAuthToken();
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'toggle_ban',
          employeeId: targetId,
          banned: willBan,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const activeNames = updated
          .filter((a) => a.is_active !== false && !a.is_banned)
          .map((a) => a.name.trim())
          .filter(Boolean);
        setEmployees(activeNames);
        saveProfile({ employees: activeNames });
        if (typeof window !== 'undefined') {
          localStorage.setItem('showhouse_employee_cache', JSON.stringify(updated));
        }
        if (willBan) {
          showToast(`User "${target.name}" is now BANNED & inaccessible to all tools.`, 'error');
        } else {
          showToast(`User "${target.name}" has been UNBANNED and activated.`, 'success');
        }
      } else {
        showToast(data.error || 'Failed to update user ban status', 'error');
      }
    } catch {
      showToast('Network error while toggling ban status', 'error');
    }
  };

  const handleSaveAccounts = async () => {
    setSavingAccounts(true);
    try {
      const token = getClientAuthToken();
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ employees: employeeAccounts }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.employees)) {
        setEmployeeAccounts(data.employees);
        const activeNames = data.employees
          .filter((a: any) => a.is_active !== false && !a.is_banned)
          .map((a: any) => a.name.trim())
          .filter(Boolean);
        setEmployees(activeNames);
        saveProfile({ employees: activeNames });
        if (typeof window !== 'undefined') {
          localStorage.setItem('showhouse_employee_cache', JSON.stringify(data.employees));
        }
        showToast('All employee logins & contact numbers saved successfully in database!', 'success');
      } else {
        showToast(data.error || 'Failed to save employee accounts', 'error');
      }
    } catch {
      showToast('Network error while saving accounts', 'error');
    } finally {
      setSavingAccounts(false);
    }
  };

  const handleSaveSingleStaffRow = async (acc: EmployeeAccount) => {
    if (!acc.password || acc.password.trim().length < 6) {
      showToast(`Password for ${acc.name} must be at least 6 characters long`, 'error');
      return;
    }

    try {
      setSavingRowId(acc.id);
      const token = getClientAuthToken();
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'update_password',
          employeeId: acc.id,
          username: acc.username,
          newPassword: acc.password.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showToast(`Saved password & login credentials for ${acc.name}!`, 'success');
        // Trigger full sync to save phone, po_prefix, name as well
        handleSaveAccounts();
      } else {
        showToast(data.error || `Failed to save password for ${acc.name}`, 'error');
      }
    } catch {
      showToast('Error saving staff member credentials', 'error');
    } finally {
      setSavingRowId(null);
    }
  };

  const handleChangeEmployeePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empNewPassword || empNewPassword.length < 6) {
      showToast('New password must be at least 6 characters long', 'error');
      return;
    }
    if (empNewPassword !== empConfirmPassword) {
      showToast('New password and confirm password do not match', 'error');
      return;
    }

    try {
      setSavingEmpPassword(true);
      const token = getClientAuthToken();
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          currentPassword: empCurrentPassword ? empCurrentPassword.trim() : undefined,
          newPassword: empNewPassword.trim(),
          confirmPassword: empConfirmPassword.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showToast(data.error || 'Failed to update password', 'error');
        return;
      }

      if (data.token && typeof window !== 'undefined') {
        localStorage.setItem('showhouse_admin_token', data.token);
      }

      setEmpCurrentPassword('');
      setEmpNewPassword('');
      setEmpConfirmPassword('');
      setEmpPasswordSuccess(true);
      setTimeout(() => setEmpPasswordSuccess(false), 5000);
      showToast('Your staff password updated and recorded successfully!', 'success');
    } catch {
      showToast('Error updating staff password', 'error');
    } finally {
      setSavingEmpPassword(false);
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

  // If signed in as an employee: Render Staff Security & Password Change
  if (isEmployee) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-12 pt-4">
        {/* Header */}
        <div className="border-b border-surface-200 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-surface-900 tracking-tight">Staff Account Security</h1>
            <p className="text-xs text-surface-500 mt-0.5">
              Manage your personal staff password and account security settings
            </p>
          </div>
          <Link href="/" className="btn-secondary text-xs py-2 px-3">
            Dashboard
          </Link>
        </div>

        {/* Staff Profile Card */}
        <div className="card p-5 space-y-3 bg-surface-50/50 border border-surface-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-surface-700 uppercase tracking-wider">Staff Account Profile</span>
            <span className="text-[11px] font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full border border-primary-200">
              Active Staff Member
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
            <div className="p-2.5 rounded-lg bg-white border border-surface-200">
              <span className="text-[10px] text-surface-400 block font-bold uppercase">Staff Name</span>
              <span className="text-xs font-bold text-surface-900">{currentUser?.name || 'Staff'}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-white border border-surface-200">
              <span className="text-[10px] text-surface-400 block font-bold uppercase">Username</span>
              <span className="text-xs font-mono font-bold text-primary-700">@{currentUser?.username}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-white border border-surface-200 col-span-2 sm:col-span-1">
              <span className="text-[10px] text-surface-400 block font-bold uppercase">Security Role</span>
              <span className="text-xs font-bold text-surface-700">Billing / Staff User</span>
            </div>
          </div>
        </div>

        {/* Employee Password Change Card */}
        <div className="card p-6 space-y-4 border-2 border-primary-500/25 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-surface-100">
            <div className="flex items-center gap-2.5 text-surface-900 font-bold text-base">
              <div className="p-2 rounded-xl bg-primary-100 text-primary-700">
                <Key size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-surface-900">Change Staff Password</h3>
                <p className="text-[11px] text-surface-500 font-normal">
                  Update your personal login password. It will record instantly to the database.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleChangeEmployeePassword} className="space-y-4 pt-1">
            <div className="space-y-3">
              <div>
                <label className="label text-xs font-bold text-surface-700">Current Password</label>
                <div className="relative">
                  <input
                    type={showEmpCurrentPassword ? 'text' : 'password'}
                    value={empCurrentPassword}
                    onChange={(e) => setEmpCurrentPassword(e.target.value)}
                    placeholder="Enter current password (optional)"
                    className="input text-xs pr-8 w-full font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEmpCurrentPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700 cursor-pointer"
                  >
                    {showEmpCurrentPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <span className="text-[10px] text-surface-400 mt-1 block">Optional if logged in</span>
              </div>

              <div>
                <label className="label text-xs font-bold text-surface-700">New Password *</label>
                <div className="relative">
                  <input
                    type={showEmpNewPassword ? 'text' : 'password'}
                    value={empNewPassword}
                    onChange={(e) => setEmpNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    required
                    minLength={6}
                    className="input text-xs pr-8 w-full font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEmpNewPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700 cursor-pointer"
                  >
                    {showEmpNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <span className="text-[10px] text-surface-400 mt-1 block">At least 6 characters</span>
              </div>

              <div>
                <label className="label text-xs font-bold text-surface-700">Confirm New Password *</label>
                <div className="relative">
                  <input
                    type={showEmpConfirmPassword ? 'text' : 'password'}
                    value={empConfirmPassword}
                    onChange={(e) => setEmpConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    required
                    minLength={6}
                    className="input text-xs pr-8 w-full font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEmpConfirmPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700 cursor-pointer"
                  >
                    {showEmpConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <span className="text-[10px] text-surface-400 mt-1 block">Must match new password</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {empPasswordSuccess && (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md inline-flex items-center gap-1">
                  <Check size={14} />
                  <span>Password Updated &amp; Recorded!</span>
                </span>
              )}
              {!empPasswordSuccess && <span />}

              <button
                type="submit"
                disabled={
                  savingEmpPassword ||
                  !empNewPassword ||
                  empNewPassword.length < 6 ||
                  !empConfirmPassword ||
                  empNewPassword !== empConfirmPassword
                }
                className="btn-primary text-xs py-2 px-5 flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Lock size={14} />
                <span>{savingEmpPassword ? 'Saving to Database...' : 'Save New Password'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Company Settings Restricted Banner */}
        <div className="p-4 rounded-xl bg-surface-50 border border-surface-200 text-xs text-surface-500 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-surface-700">
            <ShieldAlert size={14} className="text-amber-600" />
            <span>Master Settings Restricted</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Company profile, tax rates, GSTIN, challan sequences, and other staff records can only be configured by the Showhouse Master Administrator.
          </p>
        </div>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    setSaving(true);
    try {
      const token = getClientAuthToken();
      const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const activeNames =
        employeeAccounts.length > 0
          ? employeeAccounts
              .filter((a) => a.is_active !== false && !a.is_banned)
              .map((a) => a.name.trim())
              .filter(Boolean)
          : employees.filter(Boolean);

      const profilePayload: Partial<BusinessProfile> = {
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
      };

      // 1. Save Company Details & Business Profile to server & database
      const settingsPromise = fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify({ profile: profilePayload }),
      });

      // 2. Save Admin Username & Phone (and new password if entered)
      const adminCredsPayload: Record<string, any> = {
        newUsername: adminUsername.trim(),
        phone: adminPhone.trim(),
      };
      if (adminNewPassword && adminNewPassword.trim().length >= 6) {
        if (adminNewPassword === adminConfirmPassword) {
          adminCredsPayload.currentPassword = adminCurrentPassword ? adminCurrentPassword.trim() : undefined;
          adminCredsPayload.newPassword = adminNewPassword.trim();
          adminCredsPayload.confirmPassword = adminConfirmPassword.trim();
        }
      }
      const adminPromise = fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify(adminCredsPayload),
      });

      // 3. Save Employee Accounts & Passwords to server & database
      let empPromise = Promise.resolve(null as any);
      if (employeeAccounts.length > 0) {
        empPromise = fetch('/api/employees', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader,
          },
          body: JSON.stringify({ employees: employeeAccounts }),
        });
      }

      const [settingsRes, adminRes, empRes] = await Promise.all([
        settingsPromise,
        adminPromise,
        empPromise,
      ]);

      const settingsData = await settingsRes.json().catch(() => ({}));
      const adminData = await adminRes.json().catch(() => ({}));

      if (!settingsRes.ok || !settingsData.success) {
        showToast(settingsData.error || 'Failed to save business settings', 'error');
        return;
      }

      if (!adminRes.ok || !adminData.success) {
        showToast(adminData.error || 'Failed to update admin credentials', 'error');
        return;
      }

      if (adminData.token && typeof window !== 'undefined') {
        localStorage.setItem('showhouse_admin_token', adminData.token);
      }

      if (adminNewPassword && adminNewPassword === adminConfirmPassword) {
        setAdminCurrentPassword('');
        setAdminNewPassword('');
        setAdminConfirmPassword('');
      }

      if (empRes) {
        const empData = await empRes.json().catch(() => ({}));
        if (empData.success && Array.isArray(empData.employees)) {
          setEmployeeAccounts(empData.employees);
          if (typeof window !== 'undefined') {
            localStorage.setItem('showhouse_employee_cache', JSON.stringify(empData.employees));
          }
        }
      }

      saveProfile(profilePayload);
      showToast('All settings, company details, admin phone & staff logins saved successfully!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to save settings', 'error');
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

        {/* Master Admin Security & Password Change */}
        <div className="card p-6 space-y-4 border-2 border-orange-500/25 bg-gradient-to-br from-white via-white to-orange-50/20 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-surface-100">
            <div className="flex items-center gap-2.5 text-surface-900 font-bold text-base">
              <div className="p-2 rounded-xl bg-orange-100 text-[#ea580c]">
                <Key size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-surface-900">Admin Security &amp; Password Change</h3>
                <p className="text-[11px] text-surface-500 font-normal">
                  Update Admin username and master password for full ERP system access
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-[#ea580c] bg-orange-50 border border-orange-200 px-2.5 py-0.5 rounded-full self-start sm:self-auto flex items-center gap-1">
              <ShieldCheck size={12} />
              <span>Master Administrator</span>
            </span>
          </div>

          <form onSubmit={handleChangeAdminPassword} className="space-y-4 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Admin Username */}
              <div>
                <label className="label text-xs font-bold text-surface-700">Admin Username</label>
                <input
                  type="text"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                  placeholder="adminsh"
                  required
                  className="input font-mono text-xs font-bold text-surface-900 bg-surface-50 w-full"
                />
                <span className="text-[10px] text-surface-400 mt-1 block">Default: adminsh</span>
              </div>

              {/* Admin Mobile / Phone */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label text-xs font-bold text-surface-700 mb-0">Admin Mobile (OTP)</label>
                  <button
                    type="button"
                    onClick={handleSaveAdminPhone}
                    disabled={savingAdminPhone}
                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
                    title="1-Click: Save updated mobile number"
                  >
                    {savingAdminPhone ? 'Saving...' : adminPhoneSuccess ? '✓ Saved!' : 'Save Phone'}
                  </button>
                </div>
                <input
                  type="text"
                  value={adminPhone}
                  onChange={(e) => setAdminPhone(e.target.value)}
                  placeholder="+91 79773 95952"
                  className="input font-mono text-xs font-bold text-emerald-800 bg-emerald-50/50 border-emerald-300 w-full"
                />
                <span className="text-[10px] text-emerald-700 mt-1 block">Editable • Click &quot;Save Phone&quot; to update</span>
              </div>

              {/* Current Password (Optional if logged in) */}
              <div>
                <label className="label text-xs font-bold text-surface-700">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={adminCurrentPassword}
                    onChange={(e) => setAdminCurrentPassword(e.target.value)}
                    placeholder="Current password (optional)"
                    className="input text-xs pr-8 w-full font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700"
                    title={showCurrentPassword ? 'Hide password' : 'Show password'}
                  >
                    {showCurrentPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <span className="text-[10px] text-surface-400 mt-1 block">Leave blank or verify</span>
              </div>

              {/* New Password */}
              <div>
                <label className="label text-xs font-bold text-surface-700">New Password *</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={adminNewPassword}
                    onChange={(e) => setAdminNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    required
                    minLength={6}
                    className="input text-xs pr-8 w-full font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700"
                    title={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <span className="text-[10px] text-surface-400 mt-1 block">At least 6 characters</span>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="label text-xs font-bold text-surface-700">Confirm New Password *</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={adminConfirmPassword}
                    onChange={(e) => setAdminConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    required
                    minLength={6}
                    className="input text-xs pr-8 w-full font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700"
                    title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <span className="text-[10px] text-surface-400 mt-1 block">Must match new password</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-surface-500">
                  Changing admin password immediately updates your persistent master credentials.
                </span>
                {adminPasswordSuccess && (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                    <Check size={13} />
                    <span>Password Updated!</span>
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={
                  savingAdminPassword ||
                  !adminNewPassword ||
                  adminNewPassword.length < 6 ||
                  !adminConfirmPassword ||
                  adminNewPassword !== adminConfirmPassword
                }
                className="btn-primary text-xs py-2 px-4 flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer self-start sm:self-auto"
              >
                <Lock size={14} />
                <span>{savingAdminPassword ? 'Updating...' : 'Change Admin Password'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Security Suite & Login Audit Trail */}
        <div className="card p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-surface-100">
            <div className="flex items-center gap-2 text-emerald-700 font-bold text-base">
              <ShieldCheck size={20} className="text-emerald-600" />
              <span>Security Suite & Login Protection</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchSecurityData}
                disabled={loadingSecurity}
                className="text-xs text-surface-500 hover:text-surface-800 p-1.5 rounded-md hover:bg-surface-100 transition-colors inline-flex items-center gap-1 cursor-pointer"
                title="Refresh Security Logs"
              >
                <RefreshCw size={13} className={loadingSecurity ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Refresh Logs</span>
              </button>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                Direct Password Authentication (Active)
              </span>
            </div>
          </div>

          {/* Login Activity Audit Trail */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-surface-800 flex items-center gap-1.5">
                <Activity size={14} className="text-primary-600" />
                <span>Recent Security & Login Audit Trail</span>
              </span>
              <span className="text-[11px] text-surface-400">
                Tracking last {securityLogs.length} authentication events
              </span>
            </div>

            <div className="overflow-x-auto border border-surface-200 rounded-lg shadow-2xs max-h-64 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-50 text-[10px] font-bold text-surface-600 uppercase border-b border-surface-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 w-32">Timestamp</th>
                    <th className="px-3 py-2">User / Identity</th>
                    <th className="px-3 py-2 text-center w-20">Role</th>
                    <th className="px-3 py-2 text-center w-28">Event Status</th>
                    <th className="px-3 py-2">IP / Network</th>
                    <th className="px-3 py-2">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 bg-white">
                  {securityLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-surface-400 text-xs">
                        No login events recorded yet. Activity will appear here in real time.
                      </td>
                    </tr>
                  ) : (
                    securityLogs.slice(0, 25).map((log) => {
                      const dateObj = new Date(log.timestamp);
                      const timeStr = !isNaN(dateObj.getTime())
                        ? dateObj.toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : log.timestamp;

                      let badgeClass = 'bg-surface-100 text-surface-700 border-surface-200';
                      let statusText: string = log.status;

                      if (log.status === 'success') {
                        badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                        statusText = 'Login Success';
                      } else if (log.status === 'totp_challenge_issued') {
                        badgeClass = 'bg-sky-50 text-sky-700 border-sky-200';
                        statusText = 'TOTP Prompt';
                      } else if (log.status === 'totp_enrolled') {
                        badgeClass = 'bg-teal-50 text-teal-700 border-teal-200';
                        statusText = 'TOTP Enrolled';
                      } else if (log.status === 'totp_reset') {
                        badgeClass = 'bg-purple-50 text-purple-700 border-purple-200';
                        statusText = '2FA Reset';
                      } else if (log.status === 'backup_code_used') {
                        badgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                        statusText = 'Backup Code Used';
                      } else if (log.status === 'totp_failed') {
                        badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
                        statusText = 'TOTP Failed';
                      } else if (log.status === 'failed') {
                        badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
                        statusText = 'Failed Auth';
                      } else if (log.status === 'rate_limited') {
                        badgeClass = 'bg-red-50 text-red-700 border-red-200';
                        statusText = 'Rate Limited';
                      } else if (log.status === 'banned_attempt') {
                        badgeClass = 'bg-gray-100 text-gray-800 border-gray-300';
                        statusText = 'Banned User';
                      } else if (log.status === 'password_changed') {
                        badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
                        statusText = 'Password Changed';
                      }

                      return (
                        <tr key={log.id} className="hover:bg-surface-50/70 transition-colors">
                          <td className="px-3 py-2 text-[11px] font-mono text-surface-500 whitespace-nowrap">
                            {timeStr}
                          </td>
                          <td className="px-3 py-2 font-semibold text-surface-900 whitespace-nowrap">
                            {log.name || log.username}
                            <span className="text-[10px] text-surface-400 font-mono block">
                              @{log.username}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <span
                              className={cn(
                                'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
                                log.role === 'admin'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-primary-50 text-primary-700'
                              )}
                            >
                              {log.role}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <span
                              className={cn(
                                'text-[10px] font-bold px-2 py-0.5 rounded-md border inline-block min-w-[75px]',
                                badgeClass
                              )}
                            >
                              {statusText}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-surface-600 whitespace-nowrap">
                            {log.ip}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-surface-500 max-w-xs truncate" title={log.note || ''}>
                            {log.note || 'Authentication event'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
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
                          {acc.is_active !== false && !acc.is_banned ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Active</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                              <Ban size={10} className="text-rose-600" />
                              <span>Banned</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleSaveSingleStaffRow(acc)}
                              disabled={savingRowId === acc.id}
                              className="px-2 py-1 rounded text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 inline-flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                              title={`Save password & details for ${acc.name} immediately`}
                            >
                              <Save size={12} />
                              <span>{savingRowId === acc.id ? 'Saving...' : 'Save'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleBanAccount(acc.id)}
                              className={cn(
                                'px-2 py-1 rounded text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors border',
                                acc.is_active !== false && !acc.is_banned
                                  ? 'text-rose-700 bg-rose-50/80 hover:bg-rose-100 border-rose-200'
                                  : 'text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100 border-emerald-200'
                              )}
                              title={
                                acc.is_active !== false && !acc.is_banned
                                  ? `Ban ${acc.name} (Revoke login & tools access immediately)`
                                  : `Unban ${acc.name} (Restore access)`
                              }
                            >
                              {acc.is_active !== false && !acc.is_banned ? (
                                <>
                                  <Ban size={12} />
                                  <span>Ban User</span>
                                </>
                              ) : (
                                <>
                                  <Check size={12} />
                                  <span>Unban</span>
                                </>
                              )}
                            </button>
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
