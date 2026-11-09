'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    __showhouseDeferredPrompt?: any;
  }
}

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Register Service Worker for PWA offline caching & installability
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('PWA ServiceWorker registered with scope:', registration.scope);
          })
          .catch((error) => {
            console.warn('PWA ServiceWorker registration failed:', error);
          });
      });
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

