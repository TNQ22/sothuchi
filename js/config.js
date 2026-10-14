/**
 * SỔ THU CHI - ENV CONFIG LOADER
 * Tự động đọc và phân tích file .env (hoặc .env.local) khi chạy ứng dụng trên trình duyệt.
 * Ưu tiên:
 * 1. Giá trị người dùng nhập và lưu trong DB (IndexedDB)
 * 2. Giá trị định cấu hình sẵn trong file .env
 */

const EnvConfig = {
  data: {},
  isLoaded: false,

  // Tải file .env từ thư mục gốc
  async load() {
    if (this.isLoaded) return this.data;

    try {
      const response = await fetch('./.env', { cache: 'no-store' });
      if (response.ok) {
        const text = await response.text();
        this.parse(text);
        console.log('[EnvConfig] Đã tải cấu hình từ .env thành công.');
      }
    } catch (e) {
      console.log('[EnvConfig] Không tìm thấy hoặc không thể đọc .env, dùng cấu hình mặc định/CSDL.');
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

        if (key) {
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
