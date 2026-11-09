'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FilePlus,
  FileText,
  Receipt,
  Users,
  Package,
  Settings,
  ChevronLeft,
  Plus,
  LogOut,
  ShieldCheck,
  RotateCcw,
  WalletCards,
  BookOpen,
  Building2,
  ShieldAlert,
  ArrowLeftRight,
  Menu,
  X,
  Smartphone,
  Download,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logoutAdmin, getCurrentUser } from '@/lib/auth';
import { UserRole } from '@/types';

export const allNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/challans/new', label: 'New Challan', icon: FilePlus },
  { href: '/challans', label: 'All Challans', icon: FileText },
  { href: '/bills', label: 'Delivery Bills', icon: Receipt },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/ledger', label: 'Party Ledger', icon: BookOpen, adminOnly: true },
  { href: '/returns', label: 'Goods Returns', icon: RotateCcw, adminOnly: true },
  { href: '/payments', label: 'Payments', icon: WalletCards, adminOnly: true },
  { href: '/settings', label: 'Settings', icon: Settings, adminOnly: true },
];

export const navItems = allNavItems;

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<{ username: string; name: string; role: UserRole } | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const handleLogout = async () => {
    if (confirm('Logout from Showhouse Portal?')) {
      await logoutAdmin();
    }
  };

  const navItems = allNavItems.filter((item) => {
    if (item.adminOnly && user?.role === 'employee') {
      return false; // Employees cannot access Settings or Tally
    }
    return true;
  });

  const displayName = user?.name || (user?.username === 'adminsh' ? 'Admin SH' : 'Staff');
  const avatarLetter = (displayName[0] || 'U').toUpperCase();
  const roleLabel =
    user?.role === 'employee'
      ? '• Staff Member'
      : user?.role === 'accountant'
      ? '• Accountant'
      : '• Admin (Full Access)';

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col fixed left-0 top-0 h-full bg-white border-r border-surface-200 z-40 transition-all duration-200 select-none shadow-sm',
        collapsed ? 'w-[68px]' : 'w-[245px]'
      )}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between px-3.5 h-14 border-b border-surface-100 bg-surface-50/40">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-[#b8860b]/30 bg-white p-0.5 flex items-center justify-center shadow-2xs">
              <img
                src="/logo-emblem.png"
                alt="Showhouse"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-[15px] text-surface-900 tracking-tight leading-none truncate">
                SHOW<span className="text-[#b8860b]">HOUSE</span>
              </span>
              <span className="text-[10px] text-[#b8860b] font-semibold tracking-wider uppercase mt-0.5 truncate">
                Decor Studio
              </span>
            </div>
          </Link>
        )}
        {collapsed && (
          <Link
            href="/"
            className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-[#b8860b]/30 bg-white p-0.5 flex items-center justify-center shadow-2xs mx-auto"
            title="Showhouse Decor Studio"
          >
            <img
              src="/logo-emblem.png"
              alt="Showhouse"
              className="w-full h-full object-contain"
            />
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded-md hover:bg-surface-100 text-surface-400 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft
            size={16}
            className={cn('transition-transform duration-200', collapsed && 'rotate-180')}
          />
        </button>
      </div>

      {/* Quick Create Button */}
      {!collapsed && (
        <div className="p-3">
          <Link
            href="/challans/new"
            className="w-full btn-primary py-2 text-xs flex items-center justify-center gap-2 shadow-xs font-semibold"
          >
            <Plus size={16} />
            <span>Create Challan</span>
          </Link>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-600 font-semibold shadow-2xs'
                  : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={17} className={cn(isActive ? 'text-primary-500' : 'text-surface-500')} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer / Account & Logout */}
      <div className="p-3 border-t border-surface-100 bg-surface-50/50">
        {!collapsed ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#1e293b] text-white flex items-center justify-center text-[11px] font-bold shrink-0 shadow-2xs">
                {avatarLetter}
              </div>
              <div className="min-w-0">
                <span className="font-bold text-xs text-surface-900 block truncate leading-none">
                  {displayName}
                </span>
                <span className="text-[10px] text-emerald-600 font-semibold block mt-0.5">
                  {roleLabel}
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center p-2 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </aside>
  );
}

export function MobileDrawer({
  isOpen,
  onClose,
  user,
}: {
  isOpen: boolean;
  onClose: () => void;
  user: { username: string; name: string; role: UserRole } | null;
}) {
  const pathname = usePathname();
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.__showhouseDeferredPrompt) {
      setCanInstall(true);
    }
    const onReady = () => setCanInstall(true);
    window.addEventListener('pwa-install-ready', onReady);
    return () => window.removeEventListener('pwa-install-ready', onReady);
  }, []);

  const handleInstallClick = async () => {
    if (typeof window !== 'undefined' && window.__showhouseDeferredPrompt) {
      window.__showhouseDeferredPrompt.prompt();
      const choiceResult = await window.__showhouseDeferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setCanInstall(false);
      }
      window.__showhouseDeferredPrompt = null;
    } else {
      alert('To install Showhouse App on iPhone/iPad: Tap the Share button in Safari, then tap "Add to Home Screen". On Android Chrome: Tap the 3 dots menu, then "Install app".');
    }
  };

  const handleLogout = async () => {
    if (confirm('Logout from Showhouse Portal?')) {
      await logoutAdmin();
    }
  };

  const navItems = allNavItems.filter((item) => {
    if (item.adminOnly && user?.role === 'employee') {
      return false;
    }
    return true;
  });

  const displayName = user?.name || (user?.username === 'adminsh' ? 'Admin SH' : 'Staff');
  const avatarLetter = (displayName[0] || 'U').toUpperCase();
  const roleLabel =
    user?.role === 'employee'
      ? 'Staff Member'
      : user?.role === 'accountant'
      ? 'Accountant'
      : 'Admin (Full Access)';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      {/* Drawer Panel */}
      <div className="relative w-[285px] max-w-[85vw] bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
        {/* Brand & Close */}
        <div className="flex items-center justify-between p-4 border-b border-surface-200 bg-surface-50/50">
          <Link href="/" onClick={onClose} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-[#b8860b]/30 bg-white p-0.5 flex items-center justify-center shadow-2xs">
              <img
                src="/logo-emblem.png"
                alt="Showhouse"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm text-surface-900 tracking-tight leading-none">
                SHOW<span className="text-[#b8860b]">HOUSE</span>
              </span>
              <span className="text-[9px] text-[#b8860b] font-semibold tracking-wider uppercase mt-0.5">
                Decor Studio
              </span>
            </div>
          </Link>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* User Profile Card */}
        <div className="p-3.5 bg-gradient-to-r from-surface-50 to-amber-50/30 border-b border-surface-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#ea580c] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
            {avatarLetter}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-xs text-surface-900 truncate">{displayName}</div>
            <div className="text-[10px] text-emerald-700 font-semibold">{roleLabel}</div>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all',
                  isActive
                    ? 'bg-[#ea580c] text-white shadow-xs'
                    : 'text-surface-700 hover:bg-surface-100 hover:text-surface-950'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                  <span>{item.label}</span>
                </div>
                {item.adminOnly && (
                  <span
                    className={cn(
                      'text-[9px] px-1.5 py-0.2 rounded font-bold uppercase',
                      isActive ? 'bg-white/20 text-white' : 'bg-surface-200 text-surface-600'
                    )}
                  >
                    Admin
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* PWA Install Button & Logout */}
        <div className="p-3 border-t border-surface-200 bg-surface-50/60 space-y-2">
          {/* PWA App Install Action */}
          <button
            onClick={handleInstallClick}
            type="button"
            className="w-full py-2 px-3 bg-gradient-to-r from-amber-500 to-[#ea580c] hover:from-amber-600 hover:to-[#c2410c] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-transform active:scale-95 cursor-pointer"
          >
            <Smartphone size={14} />
            <span>Install Showhouse App</span>
          </button>

          <button
            onClick={handleLogout}
            type="button"
            className="w-full py-2 px-3 bg-surface-100 hover:bg-red-50 text-surface-700 hover:text-red-700 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors border border-surface-200"
          >
            <LogOut size={14} />
            <span>Logout Portal</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function MobileHeader() {
  const [user, setUser] = useState<{ username: string; name: string; role: UserRole } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setUser(getCurrentUser());

    const toggleHandler = () => setDrawerOpen((prev) => !prev);
    window.addEventListener('toggle-mobile-drawer', toggleHandler);
    return () => window.removeEventListener('toggle-mobile-drawer', toggleHandler);
  }, []);

  return (
    <>
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-xs border-b border-surface-200 z-40 h-13 px-3">
        <div className="flex items-center justify-between h-full max-w-7xl mx-auto">
          {/* Left: Hamburger Menu */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-1.5 text-surface-700 hover:text-surface-950 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer"
              aria-label="Open Navigation Drawer"
            >
              <Menu size={20} />
            </button>

            <Link href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 border border-[#b8860b]/30 bg-white p-0.5 flex items-center justify-center shadow-2xs">
                <img
                  src="/logo-emblem.png"
                  alt="Showhouse"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-sm text-surface-900 tracking-tight leading-none">
                  SHOW<span className="text-[#b8860b]">HOUSE</span>
                </span>
                <span className="text-[9px] text-[#b8860b] font-semibold tracking-wider uppercase mt-0.5">
                  Decor Studio
                </span>
              </div>
            </Link>
          </div>

          {/* Right: Quick Action & Role */}
          <div className="flex items-center gap-2">
            <Link
              href="/challans/new"
              className="btn-primary py-1 px-2.5 text-xs font-bold flex items-center gap-1 rounded-lg shadow-xs bg-[#ea580c] hover:bg-[#c2410c] text-white active:scale-95"
            >
              <Plus size={14} />
              <span>New</span>
            </Link>

            <button
              onClick={() => setDrawerOpen(true)}
              className="w-7 h-7 rounded-full bg-amber-500 text-white font-bold text-xs flex items-center justify-center shadow-2xs cursor-pointer"
              title="Open profile & menu"
            >
              {((user?.name || user?.username || 'A')[0]).toUpperCase()}
            </button>
          </div>
        </div>
      </header>

      {/* Slide-out Drawer */}
      <MobileDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
      />
    </>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ username: string; name: string; role: UserRole } | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const isAdminOrAccountant = user?.role === 'admin' || user?.role === 'accountant';

  const mobileTabs = isAdminOrAccountant
    ? [
        { href: '/', label: 'Home', icon: LayoutDashboard },
        { href: '/challans', label: 'Challans', icon: FileText },
        { href: '/challans/new', label: 'New', icon: Plus, isAction: true },
        { href: '/ledger', label: 'Ledger', icon: BookOpen },
        { href: '#menu', label: 'Menu', icon: Menu, isMenuTrigger: true },
      ]
    : [
        { href: '/', label: 'Home', icon: LayoutDashboard },
        { href: '/challans', label: 'Challans', icon: FileText },
        { href: '/challans/new', label: 'New', icon: Plus, isAction: true },
        { href: '/bills', label: 'Bills', icon: Receipt },
        { href: '#menu', label: 'Menu', icon: Menu, isMenuTrigger: true },
      ];

  const handleMenuClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('toggle-mobile-drawer'));
  };

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-surface-200 z-40 safe-area-bottom shadow-lg">
      <div className="flex items-center justify-around px-1 py-1 h-14">
        {mobileTabs.map((tab) => {
          const isActive =
            tab.href === '/'
              ? pathname === '/'
              : tab.href !== '#menu' && pathname.startsWith(tab.href);
          const Icon = tab.icon;

          if (tab.isAction) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="relative -top-3 flex flex-col items-center group"
                title="Create New Challan"
              >
                <div className="w-12 h-12 rounded-full bg-[#ea580c] hover:bg-[#c2410c] text-white flex items-center justify-center shadow-md active:scale-95 transition-transform border-3 border-white">
                  <Icon size={22} strokeWidth={2.5} />
                </div>
                <span className="text-[10px] font-bold text-[#ea580c] mt-0.5">
                  New
                </span>
              </Link>
            );
          }

          if (tab.isMenuTrigger) {
            return (
              <button
                key={tab.label}
                type="button"
                onClick={handleMenuClick}
                className="flex flex-col items-center justify-center flex-1 py-1 text-surface-500 hover:text-surface-900 transition-colors cursor-pointer"
              >
                <Icon size={18} strokeWidth={2} />
                <span className="text-[10px] mt-0.5 font-medium">{tab.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 py-1 transition-colors',
                isActive ? 'text-[#ea580c]' : 'text-surface-400 hover:text-surface-700'
              )}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
              <span
                className={cn(
                  'text-[10px] mt-0.5',
                  isActive ? 'font-bold text-[#ea580c]' : 'font-medium'
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
