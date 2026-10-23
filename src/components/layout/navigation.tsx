'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logoutAdmin } from '@/lib/auth';

export const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/challans/new', label: 'New Challan', icon: FilePlus },
  { href: '/challans', label: 'All Challans', icon: FileText },
  { href: '/bills', label: 'Delivery Bills', icon: Receipt },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    if (confirm('Logout from Showhouse Admin?')) {
      await logoutAdmin();
    }
  };

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col fixed left-0 top-0 h-full bg-white border-r border-surface-200 z-40 transition-all duration-200 select-none',
        collapsed ? 'w-[68px]' : 'w-[240px]'
      )}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-surface-100">
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
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
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
                'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-600 font-semibold'
                  : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className={cn(isActive ? 'text-primary-500' : 'text-surface-500')} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer / Admin Account & Logout */}
      <div className="p-3 border-t border-surface-100 bg-surface-50/50">
        {!collapsed ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-surface-900 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                A
              </div>
              <div className="min-w-0">
                <span className="font-bold text-xs text-surface-900 block truncate leading-none">
                  Admin SH
                </span>
                <span className="text-[10px] text-emerald-600 font-semibold block mt-0.5">
                  • Verified
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Logout from Admin"
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

export function MobileHeader() {
  const router = useRouter();

  const handleLogout = async () => {
    if (confirm('Logout from Showhouse Admin?')) {
      await logoutAdmin();
    }
  };

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-xs border-b border-surface-200 z-40 h-13 px-3">
      <div className="flex items-center justify-between h-full max-w-7xl mx-auto">
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

        <div className="flex items-center gap-2">
          <Link
            href="/challans/new"
            className="btn-primary py-1 px-2 text-xs font-medium flex items-center gap-1 rounded-md shadow-xs"
          >
            <Plus size={14} />
            <span>New</span>
          </Link>
          <button
            onClick={handleLogout}
            className="p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
            title="Logout from Admin"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  const pathname = usePathname();

  const mobileTabs = [
    { href: '/', label: 'Home', icon: LayoutDashboard },
    { href: '/challans', label: 'Challans', icon: FileText },
    { href: '/challans/new', label: 'New', icon: Plus, isAction: true },
    { href: '/bills', label: 'Bills', icon: Receipt },
    { href: '/customers', label: 'Customers', icon: Users },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-surface-200 z-50 safe-area-bottom shadow-lg">
      <div className="flex items-center justify-around px-1 py-1 h-14">
        {mobileTabs.map((tab) => {
          const isActive =
            tab.href === '/'
              ? pathname === '/'
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          if (tab.isAction) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="relative -top-3 flex flex-col items-center group"
                title="Create New Challan"
              >
                <div className="w-12 h-12 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-md active:scale-95 transition-transform border-3 border-white">
                  <Icon size={22} strokeWidth={2.5} />
                </div>
                <span className="text-[10px] font-semibold text-primary-600 mt-0.5">
                  New
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 py-1 text-surface-400 transition-colors',
                isActive ? 'text-primary-600' : 'hover:text-surface-600'
              )}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className={cn('text-[10px] mt-0.5', isActive ? 'font-semibold text-primary-600' : 'font-medium')}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
