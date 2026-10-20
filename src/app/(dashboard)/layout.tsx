'use client';

import React from 'react';
import { AppProvider } from '@/lib/context';
import { Sidebar, MobileNav, MobileHeader } from '@/components/layout/navigation';
import { Toast } from '@/components/ui/toast';
import { AuthGuard } from '@/components/auth/auth-guard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppProvider>
        <div className="flex min-h-screen bg-surface-50 text-surface-900 overflow-x-hidden antialiased">
          <Sidebar />
          <MobileHeader />

          {/* Main content area */}
          <main className="flex-1 lg:ml-[240px] pt-13 lg:pt-0 pb-18 lg:pb-8 min-w-0">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6">
              {children}
            </div>
          </main>

          <MobileNav />
          <Toast />
        </div>
      </AppProvider>
    </AuthGuard>
  );
}
