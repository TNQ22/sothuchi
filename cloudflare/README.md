# Hướng dẫn thiết lập Cloudflare Worker cho Sổ Thu Chi (Miễn phí 100%)

Cầu nối này giúp điện thoại iPhone/iPad lưu giữ mã **Refresh Token vĩnh viễn**, từ đó tự động đồng bộ Google Drive mãi mãi trong nền mà không bao giờ bị hết hạn phiên.

---

### Các bước thực hiện (chỉ mất 2 phút):

1. **Đăng nhập Cloudflare**:
   - Truy cập: [dash.cloudflare.com](https://dash.cloudflare.com/) (Tạo tài khoản miễn phí nếu chưa có).
   - Chọn mục **Workers & Pages** ở thanh bên trái &rarr; Bấm **Create application** &rarr; Chọn tab **Workers** &rarr; Bấm **Create Worker**.

2. **Dán mã nguồn**:
   - Đặt tên cho Worker (ví dụ: `sothuchi-auth`).
   - Bấm **Deploy**.
   - Sau khi Deploy xong, bấm nút **Edit code**.
   - Xóa toàn bộ nội dung mẫu hiện có và sao chép toàn bộ nội dung từ file `cloudflare/google-token-bridge.js` dán vào.
   - Bấm **Deploy** (ở góc trên bên phải).

3. **Lấy địa chỉ Worker**:
   - Sao chép đường dẫn của Worker vừa tạo (ví dụ: `https://sothuchi-auth.yourname.workers.dev`).

4. **Kích hoạt trong ứng dụng Sổ Thu Chi**:
   - Mở app Sổ Thu Chi &rarr; Vào **Cài đặt** &rarr; Mục **Google Drive**.
   - Bấm mở **Cấu hình nâng cao (Dành cho iPhone)**.
   - Dán URL Cloudflare Worker và mã **Client Secret** (lấy cùng chỗ với Client ID trên Google Cloud Console).
   - Bấm **Lưu cấu hình**.
   - Bấm **Đăng nhập Google** một lần duy nhất.

Từ thời điểm này, iPhone sẽ lưu Refresh Token và tự động làm mới mã kết nối mãi mãi mà không bao giờ bị hỏi lại!
