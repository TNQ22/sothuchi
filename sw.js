const CACHE_NAME = 'sothuchi-pwa-v1.9.57';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
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
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable.png',
  './assets/icons/icon.svg',
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
  './assets/logos/varb.png',
  './assets/logos/vcb.png',
  './assets/logos/vib.png',
  './assets/logos/viettelmoney.png',
  './assets/logos/vnpay.png',
  './assets/logos/vpb.png',
  './assets/logos/zalopay.png'
];

// Install Event: Precache static assets individually so no single failure breaks offline support
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[ServiceWorker] Pre-caching offline assets for:', CACHE_NAME);
      await Promise.all(
        PRECACHE_ASSETS.map(async (assetUrl) => {
          try {
            const response = await fetch(assetUrl, { cache: 'reload' });
            if (response.ok) {
              await cache.put(assetUrl, response);
            }
          } catch (err) {
            console.warn('[ServiceWorker] Precache failed for:', assetUrl, err);
          }
        })
      );
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
  if (!event.request.url.startsWith('http')) return;

  // Handle navigation requests (opening app / refreshing)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // If online and network is fast, try network fetch with 1.5s timeout
          const networkPromise = fetch(event.request).then(async (response) => {
            if (response && response.status === 200) {
              const cache = await caches.open(CACHE_NAME);
              cache.put(event.request, response.clone());
            }
            return response;
          });
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Network timeout')), 1500)
          );
          return await Promise.race([networkPromise, timeoutPromise]);
        } catch (err) {
          // Offline or slow network: fall back to cached index.html immediately
          const cache = await caches.open(CACHE_NAME);
          const cached = (await cache.match(event.request, { ignoreSearch: true }))
            || (await cache.match('./index.html', { ignoreSearch: true }))
            || (await cache.match('./', { ignoreSearch: true }))
            || (await cache.match('index.html', { ignoreSearch: true }));
          if (cached) return cached;
          return (await caches.match('index.html', { ignoreSearch: true })) || Response.error();
        }
      })()
    );
    return;
  }

  // Handle asset requests (CSS, JS, images, icons, vendor scripts)
  event.respondWith(
    (async () => {
      // 1. Try Cache First (WITH ignoreSearch: true so style.css?v=... matches style.css!)
      const cachedResponse = await caches.match(event.request, { ignoreSearch: true });

      if (cachedResponse) {
        // Revalidate in background when online (Stale-While-Revalidate)
        if (navigator.onLine) {
          fetch(event.request).then(async (networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const cache = await caches.open(CACHE_NAME);
              cache.put(event.request, networkResponse);
            }
          }).catch(() => {/* Offline, perfectly fine */});
        }
        return cachedResponse;
      }

      // 2. Not in cache: fetch from network
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        // 3. Fallback when offline
        const fallback = await caches.match(event.request, { ignoreSearch: true });
        if (fallback) return fallback;
        throw err;
      }
    })()
  );
});
