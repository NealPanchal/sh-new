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

    let swRegistration: ServiceWorkerRegistration | null = null;

    // Register Service Worker for PWA offline caching & installability
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            swRegistration = registration;
            registration.update();
            console.log('PWA ServiceWorker registered with scope:', registration.scope);

            // If a new worker is waiting, activate immediately
            if (registration.waiting) {
              registration.waiting.postMessage({ action: 'skipWaiting' });
            }

            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    newWorker.postMessage({ action: 'skipWaiting' });
                  }
                });
              }
            });
          })
          .catch((error) => {
            console.warn('PWA ServiceWorker registration failed:', error);
          });
      });

      // Reload when a new ServiceWorker controller takes over to ensure real-time UI
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });

      // On visibility change / focus (when user opens Add-to-Home-Screen app), check for SW updates
      const handleAppResume = () => {
        if (document.visibilityState === 'visible' && swRegistration) {
          swRegistration.update().catch(() => {});
        }
      };

      document.addEventListener('visibilitychange', handleAppResume);
      window.addEventListener('focus', handleAppResume);

      return () => {
        document.removeEventListener('visibilitychange', handleAppResume);
        window.removeEventListener('focus', handleAppResume);
      };
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
