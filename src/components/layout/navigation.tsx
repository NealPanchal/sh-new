'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FilePlus,
  FileText,
  Users,
  Package,
  Settings,
  ChevronLeft,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/challans/new', label: 'New Challan', icon: FilePlus },
  { href: '/challans', label: 'All Challans', icon: FileText },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-surface-900 flex items-center justify-center font-bold text-white text-sm shadow-xs">
              <span className="text-primary-500">S</span>H
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-base text-surface-900 tracking-tight leading-none">
                SHOW<span className="text-primary-500">HOUSE</span>
              </span>
              <span className="text-[10px] text-surface-400 font-medium tracking-wider uppercase mt-0.5">
                Challan Manager
              </span>
            </div>
          </Link>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-surface-900 flex items-center justify-center mx-auto font-bold text-sm">
            <span className="text-primary-500">S</span>
          </div>
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

      {/* Footer Info */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-surface-100 bg-surface-50/50">
          <p className="text-[11px] font-medium text-surface-600">Showhouse Laminates</p>
          <p className="text-[10px] text-surface-400">TallyPrime-style Challans</p>
        </div>
      )}
    </aside>
  );
}

export function MobileHeader() {
  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-xs border-b border-surface-200 z-40 h-13 px-3">
      <div className="flex items-center justify-between h-full max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-surface-900 flex items-center justify-center font-bold text-xs text-white">
            <span className="text-primary-500">S</span>H
          </div>
          <span className="font-extrabold text-sm text-surface-900 tracking-tight">
            SHOW<span className="text-primary-500">HOUSE</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/challans/new"
            className="btn-primary py-1 px-2.5 text-xs font-medium flex items-center gap-1 rounded-md shadow-xs"
          >
            <Plus size={14} />
            <span>New Challan</span>
          </Link>
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
    { href: '/customers', label: 'Customers', icon: Users },
    { href: '/settings', label: 'Settings', icon: Settings },
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
