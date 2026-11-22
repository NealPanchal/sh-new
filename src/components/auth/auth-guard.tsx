'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isAdminAuthenticated, verifySessionWithServer } from '@/lib/auth';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // If user is already on /login, don't guard
    if (pathname === '/login') {
      setAuthorized(true);
      return;
    }

    if (isAdminAuthenticated()) {
      setAuthorized(true);
      return;
    }

    // Check with server if session cookie is active (crucial for iOS Safari PWA / Add-to-Home-Screen)
    let isCancelled = false;
    const timeout = setTimeout(() => {
      if (!isCancelled) {
        setAuthorized(false);
        router.replace('/login');
      }
    }, 2000);

    verifySessionWithServer()
      .then((isAuthed) => {
        clearTimeout(timeout);
        if (isCancelled) return;
        if (isAuthed) {
          setAuthorized(true);
        } else {
          setAuthorized(false);
          router.replace('/login');
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        if (!isCancelled) {
          setAuthorized(false);
          router.replace('/login');
        }
      });

    return () => {
      isCancelled = true;
      clearTimeout(timeout);
    };
  }, [pathname, router]);

  if (!authorized && pathname !== '/login') {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-4 select-none">
        <div className="w-16 h-16 rounded-2xl bg-white p-2.5 shadow-xl border border-amber-200/40 mb-4 flex items-center justify-center animate-pulse">
          <img
            src="/logo-emblem.png"
            alt="Showhouse"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs text-surface-400 font-medium tracking-wide">
          Loading Showhouse...
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
