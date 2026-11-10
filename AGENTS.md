# QUY TẮC PHÁT TRIỂN & THIẾT KẾ DỰ ÁN (SỔ THU CHI)

Tài liệu này định nghĩa toàn bộ quy chuẩn thiết kế UI/UX và quy tắc viết mã cho dự án **Sổ Thu Chi**. Mọi trợ lý AI (AI Agents) và lập trình viên khi sửa đổi hoặc viết code mới **bắt buộc phải tuân thủ** các hướng dẫn dưới đây mà không cần người dùng phải nhắc lại.

---

## 1. TỔNG QUAN DỰ ÁN
- **Tên dự án:** Sổ Thu Chi (Finance Management PWA)
- **Kiến trúc:** Offline-First Progressive Web App (PWA), Vanilla JS, CSS3, HTML5, Service Worker.
- **Mục tiêu:** Quản lý thu chi cá nhân nhanh chóng, trực quan, tối ưu trải nghiệm chạm trên điện thoại di động và mượt mà trên desktop.

---

## 2. QUY CHUẨN THIẾT KẾ UI/UX (BẮT BUỘC)

### 2.1. Màu sắc chủ đạo: Xanh Ngọc Bích (Emerald / Jade / Teal)
- **Primary Color:** Xanh ngọc bích luôn là màu nhận diện và điểm nhấn chính của ứng dụng.
  - `--primary: #0d9488;` (Teal-600)
  - `--primary-hover: #0f766e;` (Teal-700)
  - `--primary-light: rgba(13, 148, 136, 0.15);`
  - `--border-focus: #14b8a6;` (Teal-500)
  - `--shadow-glow: 0 0 20px rgba(13, 148, 136, 0.35);`
- **Màu ngữ cảnh nghiệp vụ:**
  - Tiền vào / Thu nhập: Xanh lá (`--income: #10b981;`)
  - Tiền ra / Chi tiêu: Đỏ hồng (`--expense: #f43f5e;`)
  - Chuyển khoản ví: Xanh dương biển (`--transfer: #0ea5e9;`)
  - Cho vay / Đi vay: Cam hổ phách (`--debt-borrow: #f59e0b;`)
- **Theme:** Hỗ trợ mượt mà cả **Dark Mode** (nền tối sâu dịu mắt `#0a0f1d`, `#111827`) làm mặc định và **Light Mode** (`#f1f5f9`, `#ffffff`).

### 2.2. Bố cục: Xát viền màn hình (Edge-to-Edge) - Tối đa hóa diện tích hiển thị
- **Tràn viền / Tận dụng tối đa không gian:**
  - Không để lãng phí viền lề ngoài (margin/padding bao khung bên ngoài phải tối giản, sát cạnh viền màn hình thiết bị).
  - Khung nội dung chính trên di động ưu tiên trải rộng 100% chiều ngang (full-width edge-to-edge).
  - Header và Bottom Navigation cố định, thanh mảnh, tối ưu chiều cao hiển thị nội dung thu chi.
  - Cảm giác sử dụng giống như ứng dụng Native Mobile (App-like feel).

### 2.3. Nút bấm & Tương tác: Căng đều & Thân thiện với cảm ứng
- **Căng đều (Stretched & Balanced):**
  - Các nhóm nút thao tác (ví dụ: Lưu / Hủy, Chọn loại giao dịch, Bộ lọc kỳ hạn) phải **căng đều 100% bề ngang** (`flex: 1` hoặc CSS Grid cân đối `grid-template-columns: repeat(N, 1fr)`).
  - Không để nút bấm bị lệch một góc hoặc co cụm kích thước nhỏ lọt thỏm giữa màn hình.
- **Touch-Friendly:**
  - Chiều cao vùng chạm tối thiểu từ **44px - 48px** để người dùng dễ bấm chính xác bằng một tay trên điện thoại.
  - Bo góc mềm mại, hiện đại (`border-radius: 12px` đến `16px`).
  - Phản hồi trực quan khi bấm (Active scale nhẹ, hover glow với ánh xanh ngọc bích).

### 2.4. Thẻ & Modal (Cards & Dialogs)
- Phong cách Glassmorphism tinh tế (kính mờ nền mờ nhẹ `backdrop-filter: blur(16px)`).
- Đường viền siêu mảnh tạo khối sang trọng (`1px solid rgba(255, 255, 255, 0.08)` trên Dark mode).
- Typography hiển thị số tiền lớn, rõ ràng, định dạng chuẩn Việt Nam (`100.000 đ`).

---

## 3. NGUYÊN TẮC VIẾT CODE & BẢO TRÌ
1. **Sử dụng CSS Variables:** Luôn kế thừa và tái sử dụng biến CSS đã định nghĩa trong [css/style.css](file:///C:/Users/TNQ/Documents/3T%20Code/So%20Thu%20Chi/css/style.css), không hardcode mã màu lung tung.
2. **Offline-First:** Mọi tính năng giao diện và dữ liệu phải hoạt động trơn tru ngoại tuyến (IndexedDB / LocalStorage / Service Worker).
3. **Giữ vững kiến trúc:** Không tự ý thay đổi luồng đồng bộ dữ liệu (Google Drive Sync, Cloudflare D1) nếu không có yêu cầu cụ thể.
4. **Không phát sinh dư thừa:** Hạn chế thêm thư viện bên ngoài nặng nề; ưu tiên giải pháp gọn nhẹ bằng HTML/CSS/JS thuần hiện có.
