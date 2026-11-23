// Showhouse Progressive Web App Service Worker
const CACHE_NAME = 'showhouse-pwa-v7';
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.png',
  '/logo-emblem.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: Cache critical static shell and immediately take over
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA: Failed to cache static assets during install', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: Immediately purge all outdated caches and claim open clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Allow client pages to command immediate skipWaiting on update
self.addEventListener('message', (event) => {
  if (event.data?.action === 'skipWaiting' || event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Fetch: Pass-through for APIs and Navigation, cache-first only for static icons/assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and chrome-extension schemes
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 1. NEVER intercept HTML page navigations - let browser handle network & redirects natively
  // This completely eliminates "This page couldn't load" browser offline screens
  if (request.mode === 'navigate') {
    return;
  }

  // 2. Never intercept API routes or authentication flows
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 3. Static assets (images, icons, fonts): Cache-first with network fallback
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        }).catch(() => cachedResponse);
      })
    );
    return;
  }
});
