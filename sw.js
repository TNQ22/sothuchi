const CACHE_NAME = 'sothuchi-pwa-v2.7.7';

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
  './js/google-drive.js',
  './js/dropbox.js',
  './js/server-sync.js',
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
  './js/server-auth-modals.js',
  './js/pull-to-refresh.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// 1. Cài đặt Service Worker và Cache tĩnh các tài nguyên cốt lõi
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Đang tải trước tài nguyên ngoại tuyến...');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// 2. Kích hoạt và dọn dẹp các bản Cache cũ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((name) => name.startsWith('sothuchi-pwa-') && name !== CACHE_NAME)
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

// 3. Chiến lược Network-First cho CSS/JS ứng dụng, Cache-First cho CDN/Fonts/Icons
self.addEventListener('fetch', (event) => {
  // Bỏ qua các yêu cầu không phải GET hoặc chrome-extension/Google API
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Không cache các lệnh gọi API Google/Dropbox/Cloudflare/Sync Server
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

  // Đối với file trong cùng domain (HTML, CSS, JS, hình ảnh nội bộ):
  // Chiến lược: Network-First (Ưu tiên mạng để lấy bản mới nhất, rớt mạng thì fallback về Cache)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Chỉ lưu vào cache nếu response hợp lệ (status 200)
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Ngoại tuyến (Offline): Lấy từ cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            // Nếu là yêu cầu trang (HTML) mà không có trong cache, trả về trang chủ index.html
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
        })
    );
    return;
  }

  // Đối với tài nguyên thư viện bên thứ 3 (Font, CDN Lucide, Google GIS script):
  // Chiến lược: Stale-While-Revalidate hoặc Cache-First
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
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
      });
    })
  );
});
