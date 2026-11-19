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
- **Tên dữ liệu trải dài 100% dòng trên:** Tên dữ liệu/tệp phải nằm trọn vẹn ở dòng trên cùng, kéo dài hết bề ngang của thẻ (`width: 100%`, `white-space: nowrap; overflow: hidden; text-overflow: clip;`), không bị nút hay icon bên cạnh chèn ép.
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
  - **Trên Dashboard:** Chỉ hiển thị tiêu đề `TÀI CHÍNH HIỆN CÓ` và số tiền chính giữa (`.finance-overview-amount-row`). Không hiển thị thanh chia cột `Tổng có | Tổng nợ` trên Dashboard để giữ giao diện thanh thoát, trực quan.
  - **Khi chạm mở trang Chi tiết:** Mới hiển thị đầy đủ thẻ chi tiết với `Tài chính hiện có`, thanh chia `Tổng có | Tổng nợ`, bộ lọc tab và danh sách chi tiết từng loại tài khoản.
  - **Không dùng icon khiên và không dùng nút "Chi tiết >":** Giữ thẻ phẳng, tối giản, sang trọng. Người dùng có thể chạm trực tiếp vào bất kỳ vị trí nào trên thẻ để mở trang chi tiết.
  - **Căn giữa toàn bộ:** Tiêu đề `TÀI CHÍNH HIỆN CÓ` nằm ở giữa trên cùng của thẻ (`justify-content: center; text-align: center;`), số tiền chính (`.finance-overview-amount-row`), cột `Tổng có` (`.col-have`) và `Tổng nợ` (`.col-debt`) đều được căn giữa cân đối 100%.
  - **Vị trí nút Con mắt (Ẩn/Hiện số tiền) & Nút Làm mới (Tỷ giá):**
    - **Con mắt ẩn số tiền:** Cố định ở góc phải trên Header (`.tx-header-right`), đồng bộ với icon ẩn/hiện số tiền toàn ứng dụng.
    - **Nút Làm mới:** Đặt ở góc phải của thẻ Hero Card (`.networth-privacy-btn` trong `.finance-overview-header`) để làm mới tỷ giá và giá tài sản.
  - **Logic Tài Sản Ròng / Tài Chính Hiện Có (Chuẩn Hệ Thống):**
    - `Tài chính hiện có`: Chính là **Tài sản ròng** (`netWorth = grandTotalAssets + totalLend - totalBorrow`).
    - `Tổng có`: Là **tổng các tài khoản như cũ + Khoản cho vay** (`grandTotalAssets + totalLend`).
    - `Tổng nợ`: Là **sổ nợ thôi** (`totalBorrow` = nợ cá nhân đi vay + sổ vay ngân hàng).
  - **Tính Toán Tài Sản (Vàng, Ngoại tệ, Crypto, BĐS...):**
    - Giá trị tài sản bắt buộc luôn được tính chính xác theo công thức: `totalCurrentValue = quantity * currentPrice`.
    - Khi làm mới hoặc cập nhật giá thị trường, không được làm mất hoặc reset `quantity` (ví dụ: vàng 2 chỉ phải nhân đúng với đơn giá của 2 chỉ, không được để quantity mặc định về 1).
  - **Quy Tắc Màu Sắc Bắt Buộc:**
    - **Dương thì xanh ngọc** (`#10b981` / `var(--income)`), áp dụng cho Tổng có, các khoản thu/tài sản, và các ví/tài khoản có số dư dương.
    - **Riêng Tài chính hiện có** (số lớn chính giữa thẻ Hero Card): **màu trắng** (`#ffffff`), nếu âm thì chuyển sang **màu đỏ** (`#f43f5e`).
    - **Âm thì màu đỏ** (`#f43f5e` / `var(--expense)`), áp dụng cho các ví âm tiền, tài sản ròng âm, tổng có âm.
    - **Tổng nợ**: Nếu có nợ (> 0đ) hiển thị màu đỏ; nếu không nợ (0đ) hiển thị màu xanh ngọc.
  - **Hỗ Trợ Vuốt Trở Về (Swipe Back):**
    - Trang Chi tiết Tài chính hiện có (`view-finance-detail`) bắt buộc hỗ trợ cử chỉ vuốt cảm ứng từ cạnh trái sang phải để nhanh chóng quay trở về trang Tổng Quan (Dashboard).
- **Thanh Tiện Ích Nhanh trên Dashboard (Quick Utilities - Kéo ngang mượt mà):**
  - **Vuốt kéo ngang (Horizontal Scrollable):** Thanh tiện ích phải được thiết lập dạng cuộn ngang (`display: flex; overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; scroll-snap-type: x mandatory; touch-action: pan-x pan-y;`), ẩn thanh cuộn xấu, hỗ trợ vuốt mượt mà trên điện thoại.
  - **Kích thước thẻ:** Mỗi thẻ tiện ích có độ rộng cố định (`flex: 0 0 170px`), bố trí icon bên trái và tên + mô tả bên phải, cho phép người dùng kéo ngang mượt mà mà không bao giờ bị cắt chữ hay kẹt giao diện.
  - **3 tiện ích cốt lõi:** `Chia tiền nhóm` (Bill split), `Chuyến đi/Sự kiện` (Trips), và `Quét hoá đơn (OCR)`. Bỏ các mục dư thừa như `Xuất Excel`.
  - **Quét hoá đơn (OCR):** Bấm vào mở Action Sheet cho phép chọn: Chụp ảnh hoá đơn (Camera) / Chọn ảnh từ thư viện (Gallery) / Cài đặt nhận diện OCR, tự động kích hoạt quá trình quét và điền giao dịch nhanh chóng.
- **Trang Chi Tiết Tài Chính Hiện Có (`view-finance-detail`):**
  - **Tiêu đề Header đồng nhất 1 font/kiểu chữ:** Hiển thị 2 dòng căn giữa cùng kích thước font, cùng kiểu chữ và độ đậm: dòng 1 `Chi Tiết`, dòng 2 `Tài Chính Hiện Có` (`.finance-detail-header-line1`, `.finance-detail-header-line2`). Không phối nhiều font khác biệt gây rối mắt.
  - **Phân chia 2 phần rõ ràng:**
    - Nhóm `TỔNG CÓ`: Hiển thị 1. Tài khoản ngân hàng, tiền mặt, ví chi tiêu; 2. Tài khoản đầu tư & ngoại tệ; 3. Sổ tiết kiệm & tích lũy; 4. Khoản cho vay (Nợ cần thu).
    - Nhóm `TỔNG NỢ`: Hiển thị sổ nợ gồm nợ cá nhân (đi vay / mượn nợ) và sổ vay ngân hàng.
  - **Thanh tab bộ lọc (Tất cả | Tổng có | Tổng nợ):** Căng đều 100% bề ngang (`flex: 1 1 0; min-width: 0;`), chữ ẩn ký tự khi tràn viền (`text-overflow: clip`) chống tràn viền, không dùng dấu ba chấm `...`.
- **Xuất Lề Sát Cạnh (Edge-to-Edge Max Display Area):**
  - Giảm thiểu tối đa padding viền ngoài (`padding: 8px 2px` hoặc `4px 2px`) để các ô danh sách (`.finance-group-card`, `.finance-item-card`) mở rộng tối đa diện tích hiển thị trên điện thoại.
  - Phần hiển thị số tiền và tên tài khoản có không gian rộng rãi, không bị co ép hay che khuất.

### 2.8. Quy Tắc Tuyệt Đối Chống Tràn Màn Hình Ngang Trên Mobile (Zero Horizontal Overflow) (BẮT BUỘC)
- **Khóa cứng toàn bộ View & Container (`overflow-x: hidden`):**
  - Mọi view chính và view con (`#view-dashboard`, `.page-view.active`, `.tx-page-view`, `.tx-page-card-wrapper`) trên mobile (`<= 768px`) bắt buộc phải có:
    ```css
    width: 100% !important;
    max-width: 100vw !important;
    overflow-x: hidden !important;
    box-sizing: border-box !important;
    ```
  - Tuyệt đối không để xảy ra tình trạng cuộn ngang ngoài ý muốn trên toàn trang hoặc lòi góc thẻ ra mép phải màn hình.
- **CSS Grid vs Flexbox trên Mobile (`<= 900px`):**
  - **Nguyên nhân cốt lõi gây lỗi tràn:** Trong CSS Grid, track `1fr` thực chất là `minmax(auto, 1fr)`. Nếu trong grid có bất kỳ phần tử con nào có nội dung dài (như thanh tiện ích cuộn ngang 3 thẻ `~530px`), cột grid sẽ tự động bị kéo phình to bằng `min-content` (530px), làm tất cả các thẻ khác trong cùng cột (biểu đồ Thu-Chi, Cơ cấu chi tiêu) bị kéo dãn vượt qua màn hình điện thoại (390px).
  - **Quy tắc bắt buộc:** Trên màn hình di động/tablet (`@media (max-width: 900px)`), các container dạng grid như `.dashboard-grid` **bắt buộc phải chuyển sang Flexbox dọc**:
    ```css
    @media (max-width: 900px) {
      .dashboard-grid {
        display: flex !important;
        flex-direction: column !important;
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
      }
      .dashboard-grid > * {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
      }
    }
    ```
  - Trên Desktop (`> 900px`), sử dụng `grid-template-areas` với `minmax(0, 1fr)` để phân tách cột rõ ràng, không để track grid bị phình to.
- **Padding Thẻ Panel Trên Mobile (`.card-panel`):**
  - Desktop dùng `padding: 20px;`, nhưng trên mobile (`<= 768px`) **bắt buộc thu hẹp xuống `padding: 14px 10px !important;`** để tiết kiệm 40px không gian chiều ngang quý giá theo đúng triết lý Edge-to-Edge.
  - Luôn khai báo `width: 100% !important; max-width: 100% !important; min-width: 0 !important; box-sizing: border-box !important; overflow: hidden !important;`.
- **Ràng Buộc Kích Thước Biểu Đồ Chart.js & Canvas:**
  - Khung bao canvas (`.chart-container`, `.expense-breakdown-chart-box`) và chính thẻ `<canvas>` bắt buộc phải có `width: 100% !important; max-width: 100% !important; min-width: 0 !important; overflow: hidden !important;` để Chart.js tự động tính toán kích thước chuẩn theo màn hình.
  - **Cơ cấu chi tiêu (Donut chart & Legend):**
    - Đường kính Donut chart trên mobile tối đa `120px` (trên màn hình hẹp `<= 380px` là `106px`).
    - Khối legend bên phải phải có `flex: 1 1 0%; min-width: 0; overflow: hidden;`. Tên danh mục `.expense-legend-name` bắt buộc có `text-overflow: clip; white-space: nowrap; overflow: hidden; min-width: 0;` để hiển thị tối đa ký tự và phần trăm bên phải không bao giờ bị đẩy tràn viền.
  - **Biến động Thu - Chi trong năm (Bar chart 12 tháng):**
    - Chiều cao container khống chế gọn gàng `height: 250px !important;`.
    - Trục X/Y dùng font chữ `10px`, `maxRotation: 0` để 24 cột bar co giãn đều đặn không tràn viền.
- **Ràng Buộc Flexbox Cho Hàng Danh Sách Có Badge / Số Tiền Bên Phải:**
  - Mọi hàng có cấu trúc Trái (Icon + Tên) và Phải (Số tiền / Badge / Lịch sử) như `.finance-group-header`, `.finance-item-card`, `.accounts-group-header`:
    - Phần bên trái: `flex: 1 1 0%; min-width: 0; overflow: hidden;`, chữ bên trong phải có `text-overflow: clip; white-space: nowrap;`.
    - Phần bên phải: `flex-shrink: 0; max-width: 48%; min-width: 0; text-align: right;`.
    - Không bao giờ để nội dung bên trái đẩy dồn phần tử bên phải tràn ra ngoài mép màn hình.
- **Quy Trình Kiểm Tra & Nâng Cấp Cache PWA:**
  - Mỗi khi sửa đổi CSS, JS hoặc HTML giao diện, bắt buộc chạy kiểm tra cú pháp `node -c <file.js>` (nếu có JS) và **tăng phiên bản cache trong [sw.js](file:///C:/Users/TNQ/Documents/3T%20Code/So%20Thu%20Chi/sw.js)** (ví dụ: `v3.2.6 -> v3.2.7`) để điện thoại tự động tải bản giao diện mới nhất.

### 2.9. Quy Tắc Triệt Tiêu Dấu Ba Chấm `...` - Dùng `text-overflow: clip` Để Hiển Thị Thêm Ký Tự Có Nghĩa (BẮT BUỘC)
- **Vấn đề của `text-overflow: ellipsis` (`...`):**
  - Ký tự ba chấm `...` / `…` chiếm từ 15px - 25px bề ngang container (tương đương 2 đến 4 ký tự chữ cái).
  - Trên màn hình di động hẹp (375px - 414px), việc hy sinh 3-4 ký tự chỉ để vẽ dấu ba chấm làm mất đi các thông tin nhận diện cốt lõi (ví dụ: `Chia tiền nhóm` bị biến thành `Chia tiền nh...`, `Chuyến đi/Sự kiện` thành `Chuyến đi/S...`).
- **Quy tắc thiết kế bắt buộc:**
  - **Tuyệt đối KHÔNG dùng `text-overflow: ellipsis`** trên bất kỳ nhãn, tiêu đề, tab, thẻ tiện ích, danh mục hoặc số tiền nào trong ứng dụng.
  - **Bắt buộc dùng `text-overflow: clip`** kết hợp với `overflow: hidden; white-space: nowrap;`:
    ```css
    white-space: nowrap;
    overflow: hidden;
    text-overflow: clip; /* hoặc text-overflow: clip !important; */
    ```
  - **Hiệu quả:** Trình duyệt sẽ hiển thị toàn bộ ký tự trọn vẹn sát tận mép đường biên của ô/thẻ, cho phép người dùng đọc thêm được vài ký tự có nghĩa quý giá thay vì hiển thị dấu ba chấm `...`. Khi bị tràn, các ký tự vượt ngưỡng sẽ tự động ẩn phẳng (clip) một cách tinh tế và không gây xô lệch hay cuộn trang.

### 2.10. Chuẩn Giao Diện Mục Được Chia Sẻ Ở Tab Tài Khoản (`#view-accounts`) (BẮT BUỘC)
- **Thanh tab bộ lọc (Tất cả | Cá nhân | Được chia sẻ):**
  - Căng đều 100% bề ngang (`flex: 1 1 0; min-width: 0;`), chữ bắt buộc có `text-overflow: clip !important; overflow: hidden !important; white-space: nowrap !important;`.
  - Tuyệt đối không để tab `Được chia sẻ` bị co ép thành dấu ba chấm `...` hay tràn vỡ giao diện trên mọi màn hình di động.
- **Khung nhóm Mục Được Chia Sẻ (`.shared-highlight-section`):**
  - **Xuất lề sát cạnh (Edge-to-Edge display):** Giảm thiểu padding container trên mobile (`padding: 12px 6px !important;`), mở rộng tối đa không gian hiển thị cho các thẻ danh sách bên trong tương tự như thẻ Tài chính hiện có.
  - Header nhóm (`.accounts-group-header`): Icon gọn gàng 34px, tiêu đề `Mục được chia sẻ với bạn` và số tiền tổng hợp hiển thị rõ ràng, khối action bên phải (`.accounts-group-actions`) có `flex-shrink: 0`, khối tiêu đề bên trái (`.accounts-group-title-wrap`) có `flex: 1 1 0%; min-width: 0; overflow: hidden;` không giới hạn cứng bề ngang để nhường tối đa diện tích cho tiêu đề.
- **Triệt tiêu toàn bộ dấu ba chấm `...` trên các thẻ chia sẻ:**
  - Tên tài khoản chia sẻ (`.account-name`), tên sổ tiết kiệm, sổ tích lũy, sổ vay, quản lý tài sản, badge quyền (`.account-role-badge`), tag kỳ hạn/lãi suất (`.term-badge`, `.rate-badge`), tên người chia sẻ (`Từ: ...`), mô tả và số tiền đều phải dùng `text-overflow: clip` để hiển thị tối đa ký tự có nghĩa tràn sát mép viền, tuyệt đối không dùng `text-overflow: ellipsis`.
  - Phân loại trực quan bằng viền xanh dương nổi bật (`#3b82f6` / `#60a5fa`) và badge quyền trực quan (`Chỉnh sửa` / `Chỉ xem`) mà không làm co hẹp tên tài khoản.

### 2.11. Chuẩn Giao Diện Tab Cài Đặt (`#view-settings`) (BẮT BUỘC)
- **Xuất Lề Sát Cạnh (Edge-to-Edge Max Display Area):**
  - Giảm thiểu tối đa padding viền bao trên mobile (`@media (max-width: 768px)`):
    - Khung view chính `#view-settings.page-view`: `padding: 8px 3px 20px 3px !important; width: 100% !important; max-width: 100vw !important; overflow-x: hidden !important;`.
    - Thẻ container `.settings-container`: `padding: 0 2px 4px 2px !important; width: 100% !important; max-width: 100% !important; overflow-x: hidden !important;`.
    - Thẻ card sạch `.settings-card-clean`: `padding: 12px 8px !important;`.
    - Khung danh sách sổ `.server-vault-section-box`: `padding: 10px 8px !important;`.
  - Mở rộng tối đa bề ngang cho danh sách cài đặt, trung tâm đồng bộ và các bảng chi tiết để không lãng phí không gian hiển thị trên điện thoại.
- **Ràng Buộc Flexbox Khắc Phục Thu Nhỏ Tiêu Đề & Huy Hiệu Trạng Thái:**
  - Hàng tiêu đề hub item `.settings-item-title-row`: Phải có `display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 6px !important; min-width: 0 !important; width: 100% !important;`.
  - Tiêu đề mục cài đặt `.settings-item-title`: Bắt buộc có `min-width: 0 !important; flex: 1 1 0% !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: clip !important;`. Khi văn bản quá dài, tự động ẩn phẳng (clip) các ký tự vượt ngưỡng, tuyệt đối không chèn `...` và không được đẩy dồn pill trạng thái (`.settings-status-pill`) ra ngoài màn hình.
  - Huy hiệu trạng thái `.settings-status-pill`: Có `flex-shrink: 0 !important; white-space: nowrap !important;`.
  - Tiêu đề header trang con `.settings-detail-header-title`: Bắt buộc có `min-width: 0 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: clip !important;`.
- **Thẻ Tài Khoản Đồng Bộ & Danh Sách Sổ Đa Người Dùng:**
  - Thông tin người dùng (`.server-user-name`, `.server-user-email`): Có `min-width: 0 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: clip !important;`.
  - Huy hiệu vai trò (`.sync-vault-role-pill`): Có `flex-shrink: 0 !important; white-space: nowrap !important;` (Chủ sổ / Chỉ xem / Chỉnh sửa).
  - Tên sổ đồng bộ (`.server-vault-name-text`): Có `flex: 1 1 0% !important; min-width: 0 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: clip !important;`.
  - Cụm nút hành động trên mỗi sổ (`.server-vault-icon-actions`): Có `flex-shrink: 0 !important;` bảo toàn kích thước các nút bấm thao tác nhanh.
- **Thẻ Giao Dịch Trong Thùng Rác (`renderTrashPanel`):**
  - Tên tài khoản / nguồn tiền (`accInfo`): Giới hạn hiển thị với `text-overflow: clip` để không làm vỡ bố cục thẻ hoặc chèn dấu ba chấm.

---

## 3. NGUYÊN TẮC VIẾT CODE & BẢO TRÌ
1. **Sử dụng CSS Variables:** Luôn kế thừa và tái sử dụng biến CSS đã định nghĩa trong [css/style.css](file:///C:/Users/TNQ/Documents/3T%20Code/So%20Thu%20Chi/css/style.css), không hardcode mã màu lung tung.
2. **Offline-First:** Mọi tính năng giao diện và dữ liệu phải hoạt động trơn tru ngoại tuyến (IndexedDB / LocalStorage / Service Worker).
3. **Giữ vững kiến trúc:** Không tự ý thay đổi luồng đồng bộ dữ liệu (Google Drive Sync, Cloudflare D1) nếu không có yêu cầu cụ thể.
4. **Không phát sinh dư thừa:** Hạn chế thêm thư viện bên ngoài nặng nề; ưu tiên giải pháp gọn nhẹ bằng HTML/CSS/JS thuần hiện có.
