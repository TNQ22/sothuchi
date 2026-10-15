# Hướng dẫn thiết lập Cloudflare Worker cho Sổ Thu Chi (Miễn phí 100%)

Cầu nối này giúp thiết bị (đặc biệt là iPhone / iPad / Safari) lưu giữ mã **Refresh Token vĩnh viễn**, từ đó tự động đồng bộ Google Drive mãi mãi trong nền mà không bao giờ bị văng hoặc hết hạn phiên đăng nhập.

---

### Các bước thực hiện:

#### 1. Đăng nhập Cloudflare
- Truy cập: [dash.cloudflare.com](https://dash.cloudflare.com/) (Tạo tài khoản miễn phí nếu chưa có).
- Chọn mục **Workers & Pages** ở thanh bên trái &rarr; Bấm **Create application** &rarr; Chọn tab **Workers** &rarr; Bấm **Create Worker**.

#### 2. Dán mã nguồn Worker
- Đặt tên cho Worker (ví dụ: `sothuchi-auth`).
- Bấm **Deploy**.
- Sau khi Deploy xong, bấm nút **Edit code**.
- Xóa toàn bộ nội dung mẫu hiện có và sao chép toàn bộ nội dung từ file `cloudflare/google-token-bridge.js` dán vào.
- Bấm nút **Deploy** (ở góc trên bên phải) để cập nhật code.

#### 3. Cấu hình biến bí mật (Client Secret) trên Cloudflare *(Khuyên dùng - Tăng bảo mật)*
Lưu `GOOGLE_CLIENT_SECRET` trực tiếp trên Cloudflare giúp bạn **không phải nhập mã bí mật này trên điện thoại / trình duyệt client**, tăng tối đa tính bảo mật:

1. Quay lại trang quản lý Worker `sothuchi-auth`.
2. Chọn tab **Settings** (Cài đặt) &rarr; chọn **Variables and Secrets** (hoặc *Variables*).
3. Tại mục **Environment Variables**, bấm **Add** (hoặc *Add variable*):
   - **Variable name**: `GOOGLE_CLIENT_SECRET` *(viết hoa chính xác)*
   - **Value**: Dán mã Client Secret lấy từ Google Cloud Console (có dạng `GOCSPX-...`).
   - Bấm nút **Encrypt** (Mã hóa) bên cạnh ô nhập để biến được bảo mật an toàn.
4. Bấm **Save and deploy** (hoặc *Deploy*) để lưu lại.

> **Mẹo (Dùng Wrangler CLI):** Nếu bạn quản lý qua terminal, có thể chạy lệnh:
> ```bash
> npx wrangler secret put GOOGLE_CLIENT_SECRET
> ```

#### 4. Lấy địa chỉ Worker
- Sao chép đường dẫn của Worker vừa tạo (ví dụ: `https://sothuchi-auth.yourname.workers.dev`).

#### 5. Kích hoạt trong ứng dụng Sổ Thu Chi

##### Cách A: Nhập trên giao diện Web / App PWA
- Mở app Sổ Thu Chi &rarr; Vào **Cài đặt** &rarr; Mục **Google Drive**.
- Bấm mở **Cấu hình nâng cao (Dành cho iPhone)**.
- Dán URL Cloudflare Worker vào ô **Worker URL**.
- **Client Secret**:
  - Nếu bạn **đã cấu hình Bước 3** trên Cloudflare: **Có thể để trống** ô này!
  - Nếu bạn chưa cấu hình trên Cloudflare: Nhập mã Client Secret vào đây.
- Bấm **Lưu cấu hình**.
- Bấm **Đăng nhập Google** một lần duy nhất.

##### Cách B: Cấu hình sẵn qua Docker Compose / .env (Dành cho Server tự host)
Thêm biến môi trường vào file `.env` hoặc `docker-compose.yml`:
```ini
GOOGLE_WORKER_URL=https://sothuchi-auth.yourname.workers.dev
```
Toàn bộ các máy client kết nối đến server tự host sẽ tự động nhận URL Worker này.

---

🎉 **Từ thời điểm này, iPhone / trình duyệt sẽ lưu Refresh Token và tự động làm mới mã kết nối mãi mãi trong nền!**
