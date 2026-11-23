'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    __showhouseDeferredPrompt?: any;
  }
}

/**
 * PWA Service Worker Cleanup & Cache Purger
 * Completely eliminates browser offline cache traps ("This page couldn't load")
 * Automatically unregisters any existing service workers and purges browser cache storage
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Proactively unregister any active or waiting service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) {
            registration.unregister().catch(() => {});
          }
        })
        .catch(() => {});
    }

    // 2. Clear all Service Worker and HTTP caches stored in browser
    if ('caches' in window) {
      caches
        .keys()
        .then((keys) => {
          for (const key of keys) {
            caches.delete(key).catch(() => {});
          }
        })
        .catch(() => {});
    }

    // Capture beforeinstallprompt for manual 1-tap install button
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      window.__showhouseDeferredPrompt = e;
      window.dispatchEvent(new CustomEvent('pwa-install-ready'));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  return null;
}
