const CACHE_NAME = 'sothuchi-pwa-v3.0.11';

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
      console.log('[SW] Đang nạp tài nguyên ngoại tuyến phiên bản mới (v3.0.1)...');
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

// 4. Chiến lược Cache-First / Stale-While-Revalidate: Nạp Cache tức thì (0ms), tự động làm mới ngầm nếu có kết nối
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Bỏ qua các API nội bộ (/api/...) và dịch vụ bên ngoài (để mạng xử lý trực tiếp)
  if (
    url.pathname.startsWith('/api/') ||
    (url.origin !== self.location.origin && (
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('google.com') ||
      url.hostname.includes('dropbox.com') ||
      url.hostname.includes('dropboxapi.com')
    ))
  ) {
    return;
  }

  // A. Toàn bộ file nội bộ (HTML, CSS, JS, Assets): Stale-While-Revalidate
  // -> Load từ Cache trước ngay lập tức, sau đó kiểm tra và làm mới ngầm ở background
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
        // Luồng ngầm fetch từ mạng để cập nhật Cache
        const networkUpdatePromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => null);

        // 1. Đã có trong cache: Trả về NGAY LẬP TỨC (instant 0ms)
        if (cachedResponse) {
          event.waitUntil(networkUpdatePromise);
          return cachedResponse;
        }

        // 2. Nếu là Navigate (mở trang) mà chưa khớp URL cụ thể, thử lấy index.html trong cache
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html', { ignoreSearch: true }).then((cachedHtml) => {
            if (cachedHtml) {
              event.waitUntil(networkUpdatePromise);
              return cachedHtml;
            }
            return networkUpdatePromise.then((netRes) => {
              if (netRes) return netRes;
              return caches.match('./', { ignoreSearch: true });
            });
          });
        }

        // 3. Chưa có trong cache (lần mở đầu tiên): Chờ phản hồi từ mạng
        return networkUpdatePromise.then((networkResponse) => {
          if (networkResponse) return networkResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html', { ignoreSearch: true });
          }
          return new Response('', { status: 503, statusText: 'Offline' });
        });
      })
    );
    return;
  }

  // B. Thư viện bên thứ 3 (Lucide, Google Fonts...): Cache-First
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
