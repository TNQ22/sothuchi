const CACHE_NAME = 'sothuchi-pwa-v1.9.27';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  'index.html',
  './manifest.json',
  'manifest.json',
  './css/style.css',
  './vendor/dexie.min.js',
  './vendor/chart.umd.min.js',
  './vendor/lucide.min.js',
  './js/db.js',
  './js/crypto.js',
  './js/google-drive.js',
  './js/csv-export.js',
  './js/backup.js',
  './js/ui-calendar.js',
  './js/ui-transactions.js',
  './js/ui-debts.js',
  './js/ui-accounts.js',
  './js/ui-budgets.js',
  './js/ui-analytics.js',
  './js/ui-settings.js',
  './js/app.js',
  './assets/icons/icon-192.png?v=1.9.27',
  './assets/icons/icon-512.png?v=1.9.27',
  './assets/icons/icon-maskable.png?v=1.9.27',
  './assets/icons/icon.svg',
  './assets/logos/acb.png?v=1.9.27',
  './assets/logos/bidv.png?v=1.9.27',
  './assets/logos/cake.png?v=1.9.27',
  './assets/logos/ctg.png?v=1.9.27',
  './assets/logos/eib.png?v=1.9.27',
  './assets/logos/hdb.png?v=1.9.27',
  './assets/logos/lpb.png?v=1.9.27',
  './assets/logos/mb.png?v=1.9.27',
  './assets/logos/momo.png?v=1.9.27',
  './assets/logos/msb.png?v=1.9.27',
  './assets/logos/nab.png?v=1.9.27',
  './assets/logos/ocb.png?v=1.9.27',
  './assets/logos/seab.png?v=1.9.27',
  './assets/logos/shb.png?v=1.9.27',
  './assets/logos/shopeepay.png?v=1.9.27',
  './assets/logos/stb.png?v=1.9.27',
  './assets/logos/tcb.png?v=1.9.27',
  './assets/logos/timo.png?v=1.9.27',
  './assets/logos/tpb.png?v=1.9.27',
  './assets/logos/varb.png?v=1.9.27',
  './assets/logos/vcb.png?v=1.9.27',
  './assets/logos/vib.png?v=1.9.27',
  './assets/logos/viettelmoney.png?v=1.9.27',
  './assets/logos/vnpay.png?v=1.9.27',
  './assets/logos/vpb.png?v=1.9.27',
  './assets/logos/zalopay.png?v=1.9.27'
];

// Install Event: Precache static assets immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching offline assets v1.2.0');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[ServiceWorker] Pre-cache warning:', err);
      });
    })
  );
});

// Activate Event: Clean up old caches & take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache First for 100% Offline Capability
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Handle navigation requests (opening app / refreshing)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true })
        .then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return caches.match('./index.html')
            .then(res => res || caches.match('index.html'))
            .then(res => res || fetch(event.request));
        })
        .catch(() => {
          return caches.match('./index.html') || caches.match('index.html');
        })
    );
    return;
  }

  // Handle asset requests
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        // Revalidate in background when online
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* Offline, perfectly fine */});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        return networkResponse;
      }).catch(() => {
        // External fallback
        return caches.match(event.request);
      });
    })
  );
});
