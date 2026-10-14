# 💰 Sổ Thu Chi (Offline-First PWA & Google Drive Sync)

Ứng dụng PWA quản lý tài chính cá nhân, hạn mức ngân sách và **Sổ Vay Nợ (Cho vay & Đi vay)** hoạt động theo kiến trúc **offline-first** (tương tự Actual Budget), lưu trữ dữ liệu cục bộ trên máy và **đồng bộ trực tiếp qua Google Drive của bạn mà không cần máy chủ (Zero-backend serverless)**.

---

## ✨ Tính Năng Nổi Bật

- 📱 **Hỗ trợ Đa nền tảng (PWA)**: Giao diện tối ưu chuyên sâu cho cả **Điện thoại (Mobile)** (thanh điều hướng đáy, phím tắt nổi FAB, bottom sheet một tay) và **Laptop/Desktop** (Sidebar tiện lợi, bảng dữ liệu đa cột, phím tắt nhanh).
- ⚡ **Offline-First 100%**: Mở tức thì và ghi chép mượt mà ngay cả khi không có mạng Internet. Dữ liệu được lưu trong IndexedDB của trình duyệt.
- ☁️ **Đồng bộ Google Drive không cần Server**: Lưu trữ cơ sở dữ liệu trên chính Google Drive của người dùng. Không ai khác có quyền truy cập dữ liệu của bạn.
- 🤝 **Sổ Vay Nợ Toàn Diện**:
  - Quản lý **Cho vay (Cần thu lại)** và **Đi vay (Cần phải trả)**.
  - Ghi nhận trả nợ theo từng đợt, thanh tiến trình % trực quan, cảnh báo quá hạn.
  - Tự động cộng/trừ số dư tài khoản tương ứng khi tạo khoản nợ hoặc thanh toán.
- 📊 **Thống kê & Báo cáo Trực quan**: Biểu đồ phân bổ chi tiêu Donut và xu hướng Thu - Chi theo thời gian thực (sử dụng Chart.js).
- 📥 **Xuất Dữ Liệu CSV & Sao Lưu JSON**:
  - Xuất file **CSV chuẩn UTF-8 có BOM** (mở trực tiếp trong Microsoft Excel tiếng Việt không bị lỗi font).
  - Tải file sao lưu JSON hoặc khôi phục dữ liệu dự phòng.
- 🔒 **Chế độ Riêng tư (Privacy Mode)**: Một chạm ẩn nhanh tất cả số dư trên màn hình (phím tắt `P`) khi ở nơi đông người.
- 🧮 **Bàn phím Tính nhanh (In-app Calculator)**: Hỗ trợ gõ trực tiếp biểu thức và viết tắt: `50k`, `25k + 35k`, `1.5tr`...

---

## 🚀 Hướng Dẫn Đưa Lên GitHub & Tạo Web (GitHub Pages)

### Bước 1: Tạo Repository mới trên GitHub
1. Đăng nhập vào [GitHub](https://github.com/) và bấm **New repository**.
2. Đặt tên (ví dụ: `so-thu-chi`), để chế độ **Public** hoặc **Private** đều được.
3. Không cần tích chọn README hay `.gitignore`.

### Bước 2: Đẩy toàn bộ mã nguồn lên GitHub
Mở Terminal / PowerShell tại thư mục này và chạy các lệnh:
```bash
git init
git add .
git commit -m "Khoi tao ung dung So Thu Chi PWA"
git branch -M main
git remote add origin https://github.com/TNQ22/sothuchi.git
git push -u origin main
```

### Bước 3: Bật tính năng GitHub Pages
1. Trên trang repo GitHub của bạn, vào tab **Settings** -> mục **Pages** (ở cột bên trái).
2. Tại phần **Build and deployment** -> **Source**: Chọn **GitHub Actions** (đã có sẵn file workflow tự động `.github/workflows/deploy.yml`).
3. Đợi khoảng 1 phút, trang web của bạn sẽ hiển thị đường dẫn truy cập dạng:
   👉 **`https://tnq22.github.io/sothuchi/`**
4. **Tùy chọn Tên miền riêng (Custom Domain)**: Nếu bạn có tên miền riêng (ví dụ: `sothuchi.tenban.com`), bạn chỉ cần nhập vào ô **Custom domain** trong trang cài đặt Pages.

---

## 📲 Hướng Dẫn Cài Đặt Ứng Dụng (PWA)

### Trên Điện thoại iPhone (iOS Safari):
1. Mở trang web ứng dụng trên trình duyệt **Safari**.
2. Bấm vào nút **Chia sẻ (Share)** ở thanh công cụ phía dưới (biểu tượng hình vuông có mũi tên trỏ lên).
3. Cuộn xuống và chọn **Thêm vào MH chính (Add to Home Screen)**.
4. Ứng dụng sẽ xuất hiện trên màn hình chính và hoạt động toàn màn hình như ứng dụng gốc tải từ App Store.

### Trên Điện thoại Android (Google Chrome):
1. Mở trang web ứng dụng trên **Chrome**.
2. Bấm vào menu **3 chấm** ở góc trên cùng bên phải.
3. Chọn **Cài đặt ứng dụng (Install app)** hoặc **Thêm vào màn hình chính**.

### Trên Laptop / Máy tính (Chrome hoặc Microsoft Edge):
1. Mở trang web trên trình duyệt Chrome hoặc Edge.
2. Bấm vào biểu tượng **Cài đặt (Install App)** ở góc phải thanh địa chỉ URL.
3. Ứng dụng sẽ chạy trong cửa sổ riêng biệt không có thanh viền trình duyệt.

---

## 🔑 Hướng Dẫn 3 Bước Tạo Google Client ID (Để Đồng Bộ Google Drive)

> [!NOTE]
> Tạo Google OAuth Client ID là hoàn toàn **MIỄN PHÍ** và chỉ mất 2 phút thực hiện.

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/) và tạo một dự án mới (ví dụ: `My-Expense-Tracker`).
2. Vào mục **APIs & Services** -> **Enabled APIs & services** -> bấm **Enable APIs and Services** -> tìm kiếm và bật **Google Drive API**.
3. Vào mục **APIs & Services** -> **Credentials**:
   - Chọn **Create Credentials** -> **OAuth client ID**.
   - Chọn Application type: **Web application**.
   - Tại mục **Authorized JavaScript origins**: Thêm URL trang web GitHub Pages của bạn (ví dụ: `https://tenban.github.io`).
   - Bấm **Create**, sao chép chuỗi **Client ID** (dạng `xxxx.apps.googleusercontent.com`).
4. Mở ứng dụng Sổ Thu Chi -> vào mục **Cài Đặt & Drive** -> dán Client ID vào và bấm **Lưu**. Bấm **Đồng Bộ Ngay** để kết nối!

---


---

## 🐳 Chạy Máy Chủ Riêng Bằng Docker (Self-Hosted Sync Server & Chia Sẻ Qua Google)

Ứng dụng hỗ trợ chạy **Máy Chủ Riêng (Dedicated Sync Server)** phục vụ đầy đủ tính năng: đồng bộ hai chiều thời gian thực cực nhanh, hỗ trợ đa người dùng (Multi-User), quản lý nhiều Sổ (Multi-Vault), và **đăng nhập / chia sẻ Sổ qua tài khoản Google** với phân quyền (Chủ sổ / Ghi chép / Chỉ xem).

### 1. Tự Động Build Docker (GitHub Actions & Docker Hub)
Khi bạn push mã nguồn lên GitHub (nhánh `main` hoặc tạo tag release `v*`), quy trình **GitHub Actions** (`.github/workflows/docker-publish.yml`) sẽ tự động:
- Build image container đa kiến trúc (`linux/amd64` và `linux/arm64`).
- Đẩy trực tiếp lên **GitHub Container Registry (GHCR)**: `ghcr.io/tnq22/sothuchi:latest`.
- Đẩy lên **Docker Hub** nếu bạn đã cấu hình 2 Secret trong GitHub Repo (*Settings -> Secrets and variables -> Actions*):
  - `DOCKERHUB_USERNAME`: Tên tài khoản Docker Hub của bạn.
  - `DOCKERHUB_TOKEN`: Personal Access Token lấy từ Docker Hub (*Account Settings -> Security -> New Access Token*).

### 2. Tích Hợp PWA Trực Tiếp & Tự Động Nhận Diện Tên Miền
- **App PWA All-in-One**: Toàn bộ ứng dụng Web PWA (offline-first, icon, service worker) đã được nhúng sẵn vào container Docker cùng với API máy chủ.
- **Tự động nhận diện tên miền**: Khi bạn mở ứng dụng trên trình duyệt qua bất kỳ domain hay cổng nào (ví dụ: `http://localhost:8081`, `http://192.168.1.100:8081`, hoặc domain riêng có HTTPS `https://chi-tieu.tenban.com`), app sẽ **tự động phát hiện tên miền hiện tại** và thiết lập kết nối ngay mà không cần cấu hình thủ công!
- **Hoàn toàn độc lập cho người dùng không có server**: Người dùng truy cập qua GitHub Pages (`https://tnq22.github.io/sothuchi/`) hoặc mở file cục bộ vẫn dùng bình thường 100% với IndexedDB, Google Drive serverless và sao lưu thư mục máy tính mà không bị phụ thuộc vào server riêng.

### 3. Khởi động nhanh với Docker Compose
Trong thư mục dự án đã có sẵn file `Dockerfile` và `docker-compose.yml`:

```bash
# Khởi động máy chủ ngầm (All-in-one bao gồm Web App + REST API + SQLite)
docker compose up -d
```

Sau khi chạy lệnh trên:
- **Ứng dụng Web & API**: Truy cập ngay tại `http://localhost:8081`
- **Cơ sở dữ liệu**: Dữ liệu SQLite và các bản sao lưu lịch sử được lưu bền vững tại thư mục `./data` trên máy chủ của bạn.

### 2. Tùy chỉnh biến môi trường (`docker-compose.yml` hoặc `.env`)
| Biến môi trường | Mặc định | Ý nghĩa |
| :--- | :--- | :--- |
| `PORT` | `8081` | Cổng lắng nghe của máy chủ |
| `DATA_DIR` | `/app/data` | Thư mục lưu file SQLite (`sothuchi.sqlite`) và bản sao lưu |
| `JWT_SECRET` | Chuỗi ngẫu nhiên | Khóa bí mật bảo vệ phiên đăng nhập token của người dùng |
| `GOOGLE_CLIENT_ID` | *(Tùy chọn)* | Client ID từ Google Cloud Console để máy chủ tự động cung cấp cho client |
| `CORS_ORIGIN` | `*` | Cho phép ứng dụng PWA từ bất kỳ domain nào (hoặc GitHub Pages) kết nối vào |

### 3. Đăng nhập và Chia sẻ Sổ qua Email Google
1. **Kết nối**: Mở ứng dụng PWA (trên máy tính hoặc điện thoại) -> vào **Cài Đặt** -> tại mục **Máy Chủ Riêng**, nhập địa chỉ máy chủ (vd: `http://localhost:8081` hoặc tên miền VPS của bạn) -> bấm **Lưu URL**.
2. **Đăng nhập Google**: Bấm **Đăng nhập Máy chủ bằng Google** để xác thực danh tính.
3. **Quản lý Sổ**: Bạn có thể tạo nhiều sổ (Sổ Cá Nhân, Sổ Chi Tiêu Gia Đình, Sổ Quỹ Lớp...).
4. **Chia sẻ cho người thân**:
   - Tại mục **Chia Sẻ Sổ Cho Người Khác Qua Email Google**: Nhập email Google của người thân (vd: `nguoithan@gmail.com`).
   - Chọn quyền: **Ghi chép (Editor)** hoặc **Chỉ xem (Viewer)** -> bấm **Mời**.
   - Người thân chỉ cần mở ứng dụng và đăng nhập bằng email Google đó là sẽ tự động thấy Sổ được chia sẻ và có thể cùng ghi chép chi tiêu với bạn!
   - Chủ sổ có thể thu hồi quyền chia sẻ bất kỳ lúc nào.

---

## ⌨️ Phím Tắt Tiện Lợi Trên Máy Tính

- **`N`**: Mở nhanh cửa sổ thêm giao dịch mới.
- **`P`**: Bật / Tắt chế độ riêng tư (ẩn số tiền).
- **`Esc`**: Đóng nhanh bất kỳ hộp thoại nào đang mở.

---

## 🛡️ Bản Quyền & Giấy Phép
Dự án được phân phối theo giấy phép mã nguồn mở MIT License. Tự do sao chép, tùy biến và sử dụng cho mục đích cá nhân.
