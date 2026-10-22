/**
 * PullToRefresh - Kéo xuống từ đỉnh trang để kích hoạt làm mới dữ liệu từ Máy Chủ
 * - Giao diện: Vòng tròn gồm các chấm mô phỏng kéo tay (Apple/iOS native style), không chữ
 * - Hoạt ảnh: Các chấm sáng dần theo vòng tròn theo cự ly kéo tay (0% -> 100%)
 * - Chuyển động: GPU transform 60fps/120fps siêu mượt theo đường cong Apple Rubber-band
 * - Phản hồi xúc giác (Haptic): Hỗ trợ đa tầng iOS Taptic Engine (Switch hack + Web Audio micro-haptic) & Android
 * - Tự động thu gọn êm ái ngay khi thả tay, chạy đồng bộ nền hiển thị qua logo header
 */
class PullToRefresh {
  constructor() {
    this.container = null;
    this.badgeEl = null;
    this.spinnerSvg = null;
    this.dots = [];

    this.startY = 0;
    this.startX = 0;
    this.currentY = 0;
    this.headerBottom = 0;
    this.currentPullDistance = 0;
    this.isPulling = false;
    this.isRefreshing = false;
    this.canPull = false;
    this._hasVibrated = false;
    this.activeScrollContainer = null;
    this.rafId = null;
    this.audioCtx = null;

    this.PULL_THRESHOLD = 60; // Ngưỡng kéo để kích hoạt rung & làm mới (px)
    this.MAX_PULL = 92;       // Giới hạn kéo tối đa (px)

    this.init();
  }

  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupDOM());
    } else {
      this.setupDOM();
    }
  }

  setupDOM() {
    let el = document.getElementById('pull-to-refresh-indicator');

    if (!el) {
      el = document.createElement('div');
      el.id = 'pull-to-refresh-indicator';
      el.className = 'ptr-indicator';
      const mainWrapper = document.querySelector('.main-wrapper') || document.body;
      const appHeader = document.querySelector('.app-header');
      if (appHeader && appHeader.nextSibling) {
        mainWrapper.insertBefore(el, appHeader.nextSibling);
      } else {
        mainWrapper.appendChild(el);
      }
    }

    el.innerHTML = `
      <div class="ptr-circle-badge">
        <svg class="ptr-dots-spinner" viewBox="0 0 24 24" width="22" height="22">
          <circle class="ptr-dot ptr-dot-0" cx="12.00" cy="4.20" r="1.45" fill="currentColor"></circle>
          <circle class="ptr-dot ptr-dot-1" cx="15.90" cy="5.24" r="1.45" fill="currentColor"></circle>
          <circle class="ptr-dot ptr-dot-2" cx="18.75" cy="8.10" r="1.45" fill="currentColor"></circle>
          <circle class="ptr-dot ptr-dot-3" cx="19.80" cy="12.00" r="1.45" fill="currentColor"></circle>
          <circle class="ptr-dot ptr-dot-4" cx="18.75" cy="15.90" r="1.45" fill="currentColor"></circle>
          <circle class="ptr-dot ptr-dot-5" cx="15.90" cy="18.75" r="1.45" fill="currentColor"></circle>
          <circle class="ptr-dot ptr-dot-6" cx="12.00" cy="19.80" r="1.45" fill="currentColor"></circle>
          <circle class="ptr-dot ptr-dot-7" cx="8.10" cy="18.75" r="1.45" fill="currentColor"></circle>
          <circle class="ptr-dot ptr-dot-8" cx="5.25" cy="15.90" r="1.45" fill="currentColor"></circle>
          <circle class="ptr-dot ptr-dot-9" cx="4.20" cy="12.00" r="1.45" fill="currentColor"></circle>
          <circle class="ptr-dot ptr-dot-10" cx="5.25" cy="8.10" r="1.45" fill="currentColor"></circle>
          <circle class="ptr-dot ptr-dot-11" cx="8.10" cy="5.24" r="1.45" fill="currentColor"></circle>
        </svg>
      </div>
    `;

    this.container = el;
    this.badgeEl = el.querySelector('.ptr-circle-badge');
    this.spinnerSvg = el.querySelector('.ptr-dots-spinner');
    this.dots = Array.from(el.querySelectorAll('.ptr-dot'));

    // Đặt ban đầu các chấm mờ
    this.dots.forEach((dot, idx) => {
      dot.style.opacity = idx === 0 ? '0.7' : '0.18';
    });

    // Khởi tạo thẻ hỗ trợ rung Taptic Engine trên iOS
    this.ensureIosHapticElement();

    this.setupListeners();
  }

  ensureIosHapticElement() {
    if (!document.getElementById('ios-ptr-haptic-label')) {
      const label = document.createElement('label');
      label.id = 'ios-ptr-haptic-label';
      label.setAttribute('for', 'ios-ptr-haptic-input');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;bottom:0;right:0;width:1px;height:1px;opacity:0.01;pointer-events:none;overflow:hidden;z-index:1;';
      label.innerHTML = '<input type="checkbox" switch id="ios-ptr-haptic-input">';
      document.body.appendChild(label);
    }
  }

  triggerHaptic() {
    // 1. Android / Thiết bị hỗ trợ Vibration API
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(22); } catch (_) {}
    }

    // 2. Kích hoạt Taptic Engine trên iOS (qua trigger click vào label của native switch)
    try {
      const label = document.getElementById('ios-ptr-haptic-label');
      if (label) {
        label.click();
      }
    } catch (_) {}

    // 3. Xung phản hồi xúc giác cơ học (Web Audio micro-haptic kick)
    // Tần số siêu trầm 60Hz trong 30ms kích xung qua cuộn loa máy, tạo cảm giác giật xúc giác ở tay
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!this.audioCtx) this.audioCtx = new AudioCtx();
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const ctx = this.audioCtx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(65, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + 0.035);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.04);
      }
    } catch (_) {}
  }

  setupListeners() {
    window.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: true });
    window.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    window.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: true });
    window.addEventListener('touchcancel', () => this.resetPullState(), { passive: true });
  }

  getHeaderBottom() {
    const header = document.querySelector('.app-header');
    if (!header || header.offsetParent === null || window.getComputedStyle(header).display === 'none') {
      return 0;
    }
    const rect = header.getBoundingClientRect();
    return Math.max(0, Math.round(rect.bottom));
  }

  getActivePageElement() {
    return document.querySelector('.page-view.active') || document.querySelector('.main-wrapper');
  }

  isAtTop(target) {
    // Không pull khi đang mở modal, dialog, action sheet, bàn phím số, hoặc form ghi chép
    if (document.querySelector('.modal.open, .dialog.open, #modal-keypad.open, #action-sheet.open, .page-view.active.tx-page-view')) {
      return false;
    }

    if (window.scrollY > 2 || document.documentElement.scrollTop > 2 || document.body.scrollTop > 2) {
      return false;
    }

    const activePage = document.querySelector('.page-view.active');
    if (activePage && activePage.scrollTop > 2) {
      return false;
    }

    let el = target;
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.scrollTop > 2) {
        return false;
      }
      el = el.parentElement;
    }

    return true;
  }

  onTouchStart(e) {
    if (this.isRefreshing) return;
    if (e.touches.length !== 1) return;

    this.canPull = this.isAtTop(e.target);
    this.startY = e.touches[0].clientY;
    this.startX = e.touches[0].clientX;
    this.currentY = this.startY;
    this.currentPullDistance = 0;
    this.isPulling = false;
    this._hasVibrated = false;

    // Cache trước vị trí chân header và page view để touchmove không phải query DOM
    this.headerBottom = this.getHeaderBottom();
    this.activeScrollContainer = this.getActivePageElement();

    // Hủy bỏ transition cũ nếu có để bám tay tức thì
    if (this.activeScrollContainer) {
      this.activeScrollContainer.style.transition = 'none';
      this.activeScrollContainer.style.willChange = 'transform';
    }
    if (this.container) {
      this.container.style.transition = 'none';
    }

    // Đánh thức Web Audio Context sẵn sàng trong gesture
    try {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    } catch (_) {}
  }

  onTouchMove(e) {
    if (!this.canPull || this.isRefreshing) return;
    if (e.touches.length !== 1) return;

    this.currentY = e.touches[0].clientY;
    const deltaY = this.currentY - this.startY;
    const deltaX = Math.abs(e.touches[0].clientX - this.startX);

    // Nếu người dùng vuốt ngang nhiều hơn vuốt dọc thì bỏ qua
    if (!this.isPulling) {
      if (deltaX > deltaY) {
        this.canPull = false;
        return;
      }
      if (deltaY > 5) {
        this.isPulling = true;
        if (e.cancelable) e.preventDefault();
      } else {
        return;
      }
    }

    if (this.isPulling) {
      if (e.cancelable) e.preventDefault();

      // Công thức đàn hồi Apple Rubber-band: mượt mà, không giật
      const maxPull = this.MAX_PULL;
      const pull = Math.max(0, deltaY);
      const dampened = maxPull * (1 - Math.exp(-pull / 140));

      this.currentPullDistance = dampened;

      // Đồng bộ theo chu kỳ khung hình GPU của màn hình (60fps / 120fps)
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(() => {
          this.renderFrame();
          this.rafId = null;
        });
      }
    }
  }

  renderFrame() {
    if (!this.container || !this.isPulling) return;

    const distance = this.currentPullDistance;
    const progress = Math.min(1, distance / this.PULL_THRESHOLD);

    // Di chuyển nội dung trang xuống theo tay kéo
    if (this.activeScrollContainer) {
      this.activeScrollContainer.style.transform = `translate3d(0, ${distance.toFixed(1)}px, 0)`;
    }

    // Hiển thị vòng tròn chấm căn giữa ngay trong khoảng trống vừa mở ra
    const targetY = this.headerBottom + Math.max(6, (distance - 38) * 0.5);
    const opacity = Math.min(1, distance / 16);

    this.container.style.transform = `translate3d(0, ${targetY.toFixed(1)}px, 0)`;
    this.container.style.opacity = opacity.toFixed(2);

    // Cập nhật số chấm sáng theo tiến trình kéo tay (từ 1 đến 12 chấm quanh vòng tròn)
    const activeCount = Math.min(12, Math.max(1, Math.round(progress * 12)));
    if (this.dots && this.dots.length === 12) {
      for (let i = 0; i < 12; i++) {
        this.dots[i].style.opacity = i < activeCount ? '1' : '0.18';
      }
    }

    // Xoay vòng tròn nhẹ nhàng theo tay kéo
    if (this.spinnerSvg) {
      this.spinnerSvg.style.transform = `rotate(${(progress * 240).toFixed(1)}deg)`;
    }

    // Đạt đủ ngưỡng 60px: Rung phản hồi & đổi sang màu xanh ngọc sẵn sàng
    if (distance >= this.PULL_THRESHOLD) {
      if (!this._hasVibrated) {
        this.triggerHaptic();
        this._hasVibrated = true;
      }
      this.container.classList.add('ready');
    } else {
      this._hasVibrated = false;
      this.container.classList.remove('ready');
    }
  }

  onTouchEnd() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (!this.isPulling) {
      this.resetPullState();
      return;
    }

    const shouldRefresh = this.currentPullDistance >= this.PULL_THRESHOLD;

    // Tự động cuộn êm lên lại vị trí ban đầu ngay lập tức
    this.resetPullState();

    // Nếu đã kéo đủ ngưỡng thì kích hoạt làm mới chạy ngầm
    if (shouldRefresh) {
      this.triggerRefresh();
    }
  }

  async triggerRefresh() {
    this.isRefreshing = true;
    try {
      // 1. Cập nhật thông tin sổ & danh sách chia sẻ mới nhất từ máy chủ riêng
      if (window.serverSyncService && window.serverSyncService.serverUrl && window.serverSyncService.token) {
        try {
          await window.serverSyncService.fetchVaults();
          if (window.serverSyncService.activeVaultId) {
            await window.serverSyncService.fetchShares(window.serverSyncService.activeVaultId);
          }
          if (typeof window.serverSyncService.syncReceivedSharedItems === 'function') {
            await window.serverSyncService.syncReceivedSharedItems();
          }
        } catch (serverInfoErr) {
          console.warn('[PullToRefresh] Cập nhật thông tin sổ & chia sẻ:', serverInfoErr);
        }
      }

      // 2. Kích hoạt đồng bộ dữ liệu giao dịch / tài chính hai chiều
      if (window.syncCoordinator) {
        await window.syncCoordinator.syncAll(false);
      } else if (window.serverSyncService) {
        await window.serverSyncService.sync();
      }

      // 3. Nạp lại cấu hình thiết lập ứng dụng từ database (Theme, Privacy Mode, v.v.)
      if (window.app && typeof window.app.loadInitialPreferences === 'function') {
        await window.app.loadInitialPreferences();
      }

      // 4. Làm mới toàn bộ UI dữ liệu ứng dụng
      if (window.app && typeof window.app.refreshAll === 'function') {
        await window.app.refreshAll();
      }

      // 5. Cập nhật lại UI Cài Đặt và Chia Sẻ nếu đang mở
      if (window.UISettings) {
        if (typeof window.UISettings.renderServerSyncUI === 'function') {
          window.UISettings.renderServerSyncUI();
        }
        if (typeof window.UISettings.updateHubBadges === 'function') {
          window.UISettings.updateHubBadges();
        }
      }
      if (window.UniversalShareModal && typeof window.UniversalShareModal.loadShareData === 'function') {
        const modal = document.getElementById('modal-universal-share');
        if (modal && modal.classList.contains('open')) {
          await window.UniversalShareModal.loadShareData();
        }
      }
      if (window.SyncCoordinator && typeof window.SyncCoordinator.updateVaultUI === 'function') {
        window.SyncCoordinator.updateVaultUI();
      }
    } catch (err) {
      console.warn('[PullToRefresh] Lỗi làm mới:', err);
    } finally {
      this.isRefreshing = false;
    }
  }

  resetPullState() {
    this.isPulling = false;
    this.canPull = false;
    this.currentPullDistance = 0;
    this._hasVibrated = false;

    const pageEl = this.activeScrollContainer || this.getActivePageElement();
    if (pageEl) {
      pageEl.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)';
      pageEl.style.transform = 'translate3d(0, 0, 0)';
      setTimeout(() => {
        if (pageEl && !this.isPulling) {
          pageEl.style.transition = '';
          pageEl.style.transform = '';
          pageEl.style.willChange = '';
        }
      }, 300);
    }

    if (this.container) {
      this.container.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.22s ease';
      this.container.style.transform = `translate3d(0, ${Math.max(0, this.headerBottom - 10)}px, 0)`;
      this.container.style.opacity = '0';
      this.container.classList.remove('ready');

      if (this.spinnerSvg) this.spinnerSvg.style.transform = '';

      setTimeout(() => {
        if (this.container && !this.isPulling) {
          this.container.style.transition = '';
          if (this.dots && this.dots.length === 12) {
            this.dots.forEach((dot, idx) => {
              dot.style.opacity = idx === 0 ? '0.7' : '0.18';
            });
          }
        }
      }, 300);
    }

    this.activeScrollContainer = null;
  }
}

window.pullToRefresh = new PullToRefresh();
