// Showhouse Progressive Web App Service Worker
const CACHE_NAME = 'showhouse-pwa-v5';
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

// Fetch: Pass-through for APIs, cache for static icons/assets, pure network-first for pages
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and chrome-extension schemes
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // Never intercept API routes or authentication flows
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Navigation / HTML Pages: Always network-first with cache-bust to ensure Add-to-Home-Screen app stays real-time
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // Static assets (images, icons, fonts): Cache-first with network revalidation
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
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
        });
      })
    );
    return;
  }
});
