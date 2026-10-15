const CACHE_NAME = 'sothuchi-pwa-v2.5.2';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './vendor/dexie.min.js',
  './vendor/chart.umd.min.js',
  './vendor/lucide.min.js',
  './js/config.js',
  './js/db.js',
  './js/crypto.js',
  './js/google-drive.js',
  './js/dropbox.js',
  './js/server-sync.js',
  './js/csv-export.js',
  './js/backup.js',
  './js/sync-coordinator.js',
  './js/ui-calendar.js',
  './js/ui-transactions.js',
  './js/ui-debts.js',
  './js/ui-accounts.js',
  './js/ui-budgets.js',
  './js/ui-analytics.js',
  './js/ui-settings.js',
  './js/app.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable.png',
  './assets/icons/icon.svg',
  './assets/icons/dropbox.svg',
  './assets/logos/acb.png',
  './assets/logos/bidv.png',
  './assets/logos/cake.png',
  './assets/logos/ctg.png',
  './assets/logos/eib.png',
  './assets/logos/hdb.png',
  './assets/logos/lpb.png',
  './assets/logos/mb.png',
  './assets/logos/momo.png',
  './assets/logos/msb.png',
  './assets/logos/nab.png',
  './assets/logos/ocb.png',
  './assets/logos/seab.png',
  './assets/logos/shb.png',
  './assets/logos/shopeepay.png',
  './assets/logos/stb.png',
  './assets/logos/tcb.png',
  './assets/logos/timo.png',
  './assets/logos/tpb.png',
  './assets/logos/vcb.png',
  './assets/logos/vib.png',
  './assets/logos/vpb.png',
  './assets/logos/zalopay.png'
];

// Install: Tải và lưu trước toàn bộ tài nguyên cốt lõi vào Cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching offline assets...');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Xóa các Cache phiên bản cũ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('sothuchi-pwa-') && name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Chiến lược Network-First cho HTML/API, Stale-While-Revalidate cho assets tĩnh
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Không cache các yêu cầu Google API, Dropbox API, máy chủ REST API hoặc script bên ngoài
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('dropboxapi.com') ||
    url.hostname.includes('dropbox.com') ||
    url.pathname.startsWith('/api/') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Đối với điều hướng trang HTML (Network-First, fallback về Cache)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Đối với tài nguyên tĩnh (Stale-While-Revalidate)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
