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

### 2.5. Bố cục Modal & Danh sách Thẻ (Cards / Lists) trên Mobile (BẮT BUỘC)
- **Sát viền màn hình (Edge-to-Edge Container):** Modal overlay trên mobile chỉ để lề tối thiểu (`padding: 4px 2px`), modal dialog mở rộng tối đa `width: calc(100% - 4px)` hoặc `100%`, tận dụng tối đa diện tích hiển thị trên điện thoại.
- **Từng ô / thẻ phiên bản mở rộng sát viền (Flush Card Items):** Trong thân modal (`modal-body`), giảm tối đa padding ngang của container (chỉ để `2px - 4px`), để từng ô thẻ danh sách (`card item`) trải rộng 100% sát 2 bên viền của modal dialog, không thụt sâu vào trong gây co hẹp diện tích hiển thị tên dữ liệu.
- **Bỏ icon trang trí thừa bên trái:** Trong các thẻ danh sách (như danh sách tệp, bản sao lưu, mục chọn), không chèn icon khối vuông lớn bên trái nếu không cần thiết, để nhường toàn bộ bề ngang cho tiêu đề và tên dữ liệu.
- **Không lặp tiền tố dư thừa (No Redundant Prefixes):** Khi thẻ đã có Badge/Tag phân loại (như `[Bản lịch sử]`, `[Drive]`), tuyệt đối không lặp lại tiền tố vào tên dữ liệu (như "Bản lịch sử: ...", "Sổ chính: ...") làm che khuất tên tệp thật.
- **Tên dữ liệu trải dài 100% dòng trên:** Tên dữ liệu/tệp phải nằm trọn vẹn ở dòng trên cùng, kéo dài hết bề ngang của thẻ (`width: 100%`, `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`), không bị nút hay icon bên cạnh chèn ép.
- **Nút thao tác chuyển xuống cạnh dưới (Bottom Action):** Nút hành động (như Khôi phục, Tải về, Xoá) chuyển xuống hàng dưới cùng hàng với Tag + Thời gian. Ưu tiên nút icon gọn gàng (`icon button`), bỏ chữ rườm rà để tiết kiệm diện tích tối đa.

### 2.6. Chống Link Preview / Callout trên Safari & Trình duyệt - Long-Press Tooltip (BẮT BUỘC)
- **Triệt tiêu xem trước (Link Preview) & Context Menu mặc định của Safari / WebKit:**
  - Trên Safari / iOS WebKit, khi người dùng nhấn giữ (long-press) vào thẻ `<a>`, nút bấm hoặc icon, trình duyệt mặc định sẽ bung cửa sổ popup xem trước trang web (Peek & Pop / Link Preview) và menu chia sẻ hệ thống, gây khó chịu và che khuất màn hình ứng dụng PWA.
  - **Quy tắc CSS bắt buộc:** Mọi nút bấm, icon button, thẻ tab, đường dẫn hành động (`button`, `.btn`, `.btn-icon`, `a`, `[role="button"]`, `.nav-item`,...) phải luôn được áp dụng:
    ```css
    -webkit-touch-callout: none !important;
    -webkit-user-select: none;
    user-select: none;
    ```
  - **Quy tắc HTML / Semantic:** Tuyệt đối không dùng `<a href="...">` cho các nút bấm hành động nội bộ (actions, modal triggers, icon controls). Bắt buộc dùng thẻ `<button type="button">`. Nếu bắt buộc phải dùng thẻ `<a>`, không đặt URL thực mà dùng `href="javascript:void(0)"` hoặc không có `href`, kết hợp chặn sự kiện `contextmenu`.
- **Nhấn giữ hiển thị tên nút thay thế (Long-Press Tooltip / Label):**
  - Khi người dùng nhấn và giữ nút bấm trên màn hình cảm ứng (~300ms - 500ms), **thay vì để trình duyệt bung menu hoặc popup xem trước**, hệ thống phải ngăn chặn menu mặc định (`e.preventDefault()` trên `contextmenu` hoặc touch event) và hiển thị tên nút đó thay thế.
  - **Thuộc tính bắt buộc:** Tất cả các icon button, nút rút gọn chữ bắt buộc phải khai báo thuộc tính `title` hoặc `aria-label` (hoặc `data-tooltip`) rõ ràng, xúc tích.
  - **Trải nghiệm hiển thị:** Hiển thị tên nút dạng Tooltip / Micro-toast nổi nhỏ gọn với phong cách thương hiệu (nền tối, viền ngọc bích, bo góc), tự động biến mất khi nhấc tay (`touchend`), di chuyển ngón tay (`touchmove`), hoặc sau 1.5 giây.

### 2.7. Chuẩn Giao Diện Thẻ Tài Chính Hiện Có, Tiện Ích & Chi Tiết Tài Chính (BẮT BUỘC)
- **Thẻ Tổng Quan Tài Chính Hiện Có (Dashboard & Detail Hero Card):**
  - **Căn giữa toàn bộ số liệu:** Số tiền chính `TÀI CHÍNH HIỆN CÓ` (`.finance-overview-amount-row`), cột `Tổng có` (`.col-have`) và `Tổng nợ` (`.col-debt`) phải luôn được căn giữa (`text-align: center; justify-content: center; align-items: center;`).
  - **Không dùng 4 thẻ thống kê phụ cũ trên Dashboard:** Không hiển thị cụm 4 thẻ cũ (Tài sản ròng, Tổng tài khoản, Cho vay, Đi vay) vì gây rối mắt và trùng lặp thông tin với Thẻ Tài Chính Hiện Có.
- **Cụm Tiện Ích Nhanh trên Dashboard (Quick Utilities):**
  - **Không bị tràn ngang:** Bố trí 3 tiện ích chính căn đều dạng lưới 3 cột cân xứng (`grid-template-columns: repeat(3, 1fr)`), không để phát sinh thanh cuộn ngang bị cắt lẹm.
  - **3 tiện ích cốt lõi:** `Chia tiền nhóm` (Bill split), `Chuyến đi/Sự kiện` (Trips), và `Quét hoá đơn (OCR)`. Bỏ các mục dư thừa như `Xuất Excel` (đã có trong Cài Đặt và Chuyến đi).
  - **Quét hoá đơn (OCR):** Khi bấm vào từ Dashboard, phải mở Action Sheet chọn: Chụp ảnh hoá đơn (Camera) / Chọn ảnh từ thư viện (Gallery) / Cài đặt nhận diện OCR, tự động kích hoạt quá trình quét và điền giao dịch nhanh chóng.
- **Trang Chi Tiết Tài Chính Hiện Có (`view-finance-detail`):**
  - **Tiêu đề Header:** Tiêu đề ở giữa luôn hiển thị 2 dòng: Chữ đậm `Chi Tiết` ở dòng trên, và dòng dưới là `TÀI CHÍNH HIỆN CÓ` (chữ nhỏ, mờ nhẹ, căn giữa).
  - **Thanh tab bộ lọc (Tất cả | Tổng có | Tổng nợ):** Căng đều 100% bề ngang (`flex: 1 1 0; min-width: 0;`), chữ có ellipsis chống tràn viền.
- **Xuất Lề Sát Cạnh (Edge-to-Edge Max Display Area):**
  - Giảm thiểu tối đa padding viền ngoài (`padding: 8px 2px` hoặc `4px 2px`) để các ô danh sách (`.finance-group-card`, `.finance-item-card`) mở rộng tối đa diện tích hiển thị trên điện thoại.
  - Phần hiển thị số tiền và tên tài khoản có không gian rộng rãi, không bị co ép hay che khuất.

---

## 3. NGUYÊN TẮC VIẾT CODE & BẢO TRÌ
1. **Sử dụng CSS Variables:** Luôn kế thừa và tái sử dụng biến CSS đã định nghĩa trong [css/style.css](file:///C:/Users/TNQ/Documents/3T%20Code/So%20Thu%20Chi/css/style.css), không hardcode mã màu lung tung.
2. **Offline-First:** Mọi tính năng giao diện và dữ liệu phải hoạt động trơn tru ngoại tuyến (IndexedDB / LocalStorage / Service Worker).
3. **Giữ vững kiến trúc:** Không tự ý thay đổi luồng đồng bộ dữ liệu (Google Drive Sync, Cloudflare D1) nếu không có yêu cầu cụ thể.
4. **Không phát sinh dư thừa:** Hạn chế thêm thư viện bên ngoài nặng nề; ưu tiên giải pháp gọn nhẹ bằng HTML/CSS/JS thuần hiện có.
