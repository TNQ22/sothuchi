/**
 * SỔ THU CHI - ENV CONFIG LOADER
 * Tự động đọc và phân tích cấu hình từ:
 * 1. API Server (/api/config) khi chạy trên Docker / Máy chủ riêng
 * 2. File .env (hoặc .env.local) khi chạy tĩnh trên trình duyệt
 * Ưu tiên:
 * 1. Giá trị người dùng nhập và lưu trong DB (IndexedDB)
 * 2. Giá trị máy chủ cấp sẵn hoặc định cấu hình trong file .env
 */

const EnvConfig = {
  data: {},
  isLoaded: false,

  // Tải cấu hình từ API Máy chủ (Docker) hoặc file .env
  async load() {
    if (this.isLoaded) return this.data;

    // 1. Thử lấy cấu hình cấp sẵn từ API Server nếu chạy trên máy chủ Docker/Node
    if (typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http')) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1800);
        const apiRes = await fetch('./api/config', {
          cache: 'no-store',
          signal: controller.signal
        }).catch(() => null);
        clearTimeout(timer);

        if (apiRes && apiRes.ok) {
          const serverConfig = await apiRes.json().catch(() => null);
          if (serverConfig && typeof serverConfig === 'object') {
            for (const [k, v] of Object.entries(serverConfig)) {
              if (v !== undefined && v !== null && v !== '') {
                this.data[k] = v;
              }
            }
            console.log('[EnvConfig] Đã nạp cấu hình PWA cấp sẵn từ máy chủ Docker:', Object.keys(this.data));
          }
        }
      } catch (_) {}
    }

    // 2. Tải thêm từ file ./.env nếu có (dành cho môi trường tĩnh / local / GitHub Pages)
    try {
      const response = await fetch('./.env', { cache: 'no-store' }).catch(() => null);
      if (response && response.ok) {
        const text = await response.text();
        this.parse(text);
        console.log('[EnvConfig] Đã tải cấu hình từ file .env thành công.');
      }
    } catch (e) {
      console.log('[EnvConfig] Không đọc được .env, dùng cấu hình mặc định/CSDL.');
    }

    this.isLoaded = true;
    return this.data;
  },

  // Phân tích cú pháp file .env (KEY=VALUE)
  parse(content) {
    if (!content) return;
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Bỏ qua dòng trống hoặc dòng chú thích bắt đầu bằng #
      if (!trimmed || trimmed.startsWith('#')) continue;

      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmed.slice(0, equalIndex).trim();
        let value = trimmed.slice(equalIndex + 1).trim();

        // Xóa dấu ngoặc kép hoặc đơn nếu có
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        if (key && !this.data[key]) {
          this.data[key] = value;
        }
      }
    }
  },

  // Lấy giá trị theo tên biến
  get(key, defaultValue = '') {
    if (this.data[key] !== undefined && this.data[key] !== '') {
      return this.data[key];
    }
    // Hỗ trợ cả tiền tố VITE_ hoặc không có VITE_
    const altKey = key.startsWith('VITE_') ? key.replace('VITE_', '') : `VITE_${key}`;
    if (this.data[altKey] !== undefined && this.data[altKey] !== '') {
      return this.data[altKey];
    }
    return defaultValue;
  }
};

window.EnvConfig = EnvConfig;
