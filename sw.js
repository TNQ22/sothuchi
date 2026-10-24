const CACHE_NAME = 'sothuchi-pwa-v3.0.0';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/admin-panel.css',
  './vendor/dexie.min.js',
  './vendor/chart.umd.min.js',
  './vendor/lucide.min.js',
  './js/config.js',
  './js/custom-dialog.js',
  './js/crypto.js',
  './js/db.js',
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
  './js/ui-share.js',
  './js/ui-budgets.js',
  './js/ui-analytics.js',
  './js/ui-settings.js',
  './js/ui-admin.js',
  './js/server-auth-modals.js',
  './js/pull-to-refresh.js',
  './js/app.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable.png'
];

// 1. Cài đặt Service Worker và Cache tĩnh các tài nguyên cốt lõi (Bảo đảm không bị sập nếu 1 asset lỗi)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Đang nạp tài nguyên ngoại tuyến phiên bản mới (v3.0.0)...');
      return Promise.allSettled(
        PRECACHE_ASSETS.map((asset) => {
          return fetch(asset, { cache: 'no-cache' }).then((res) => {
            if (res && res.status === 200) {
              return cache.put(asset, res);
            }
          }).catch((err) => {
            console.warn('[SW] Bỏ qua tài nguyên không tải được:', asset, err);
          });
        })
      );
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// 2. Kích hoạt và dọn dẹp các bản Cache cũ ngay lập tức
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Xóa bộ nhớ đệm phiên bản cũ:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// 3. Lắng nghe thông điệp từ ứng dụng (Force Skip Waiting & Purge All)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'PURGE_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) => {
        return Promise.all(keys.map((k) => caches.delete(k)));
      }).then(() => {
        return self.skipWaiting();
      }).then(() => {
        return self.clients.claim();
      })
    );
  }
});

// 4. Chiến lược Network-First cho CSS/JS ứng dụng (kèm ignoreSearch fallback offline), Cache-First cho CDN/Icons
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Không can thiệp API ngoài
  if (
    url.origin !== self.location.origin &&
    (url.hostname.includes('googleapis.com') ||
     url.hostname.includes('google.com') ||
     url.hostname.includes('dropbox.com') ||
     url.hostname.includes('dropboxapi.com') ||
     url.pathname.startsWith('/api/'))
  ) {
    return;
  }

  // File trong cùng domain: Network-First (cache: 'no-cache' để luôn lấy bản mới nếu online)
  // Khi offline: lấy từ CacheStorage (sử dụng ignoreSearch: true để match dù có query param ?v=...)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html', { ignoreSearch: true }).then((htmlRes) => {
                return htmlRes || caches.match('./', { ignoreSearch: true });
              });
            }
          });
        })
    );
    return;
  }

  // Thư viện bên thứ 3
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (event.request.url.includes('lucide') ||
           event.request.url.includes('fonts.gstatic.com') ||
           event.request.url.includes('fonts.googleapis.com'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        return cachedResponse || new Response('', { status: 408, statusText: 'Offline' });
      });
    })
  );
});
