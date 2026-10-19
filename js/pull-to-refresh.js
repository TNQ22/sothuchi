/**
 * PullToRefresh - Kéo xuống từ đỉnh trang để kích hoạt làm mới dữ liệu từ Máy Chủ
 * - Giao diện: Icon chấm vòng tròn (circle-dot) trong khung bo tròn cao cấp
 * - Chuyển động: GPU transform 60fps/120fps siêu mượt theo đường cong Apple Rubber-band, không khựng
 * - Phản hồi xúc giác (Haptic): Hỗ trợ Taptic Engine trên iOS (Switch trigger) & Vibration API trên Android
 * - Tự động thu gọn êm ái ngay khi thả tay, chạy đồng bộ nền hiển thị qua logo
 */
class PullToRefresh {
  constructor() {
    this.container = null;
    this.pillEl = null;
    this.dotIcon = null;
    this.textLabel = null;

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

    this.PULL_THRESHOLD = 60; // Ngưỡng kéo để kích hoạt rung & làm mới (px)
    this.MAX_PULL = 96;       // Giới hạn kéo tối đa (px)

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
      <div class="ptr-pill">
        <div class="ptr-icon-box">
          <svg class="ptr-icon ptr-icon-circle-dot" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"></circle>
            <circle class="ptr-inner-dot" cx="12" cy="12" r="3.2" fill="currentColor"></circle>
          </svg>
        </div>
        <span class="ptr-label">Kéo xuống để làm mới</span>
      </div>
    `;

    this.container = el;
    this.pillEl = el.querySelector('.ptr-pill');
    this.dotIcon = el.querySelector('.ptr-icon-circle-dot');
    this.textLabel = el.querySelector('.ptr-label');

    // Khởi tạo thẻ hỗ trợ rung Taptic Engine trên iOS nếu chưa có
    this.ensureIosHapticElement();

    this.setupListeners();
  }

  ensureIosHapticElement() {
    if (!document.getElementById('ios-ptr-haptic-wrap')) {
      const wrap = document.createElement('label');
      wrap.id = 'ios-ptr-haptic-wrap';
      wrap.style.cssText = 'position:fixed;top:-100px;left:-100px;opacity:0;pointer-events:none;z-index:-999;';
      wrap.setAttribute('aria-hidden', 'true');
      wrap.innerHTML = '<input type="checkbox" switch id="ios-ptr-haptic">';
      document.body.appendChild(wrap);
    }
  }

  triggerHaptic() {
    // 1. Rung trên Android / Thiết bị hỗ trợ Vibration API
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(15); } catch (_) {}
    }

    // 2. Kích hoạt Taptic Engine trên iOS (Safari / PWA qua switch toggle)
    try {
      const switchEl = document.getElementById('ios-ptr-haptic');
      if (switchEl) {
        switchEl.checked = !switchEl.checked;
        switchEl.click();
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

    // Hiển thị pill căn giữa ngay trong khoảng trống vừa mở ra
    const targetY = this.headerBottom + Math.max(8, (distance - 36) * 0.5);
    const opacity = Math.min(1, distance / 22);

    this.container.style.transform = `translate3d(0, ${targetY.toFixed(1)}px, 0)`;
    this.container.style.opacity = opacity.toFixed(2);

    // Xoay icon chấm vòng tròn theo cự ly kéo
    if (this.dotIcon) {
      this.dotIcon.style.transform = `rotate(${(progress * 270).toFixed(1)}deg)`;
    }

    // Đạt đủ ngưỡng 60px: Rung phản hồi & đổi màu viền xanh ngọc
    if (distance >= this.PULL_THRESHOLD) {
      if (!this._hasVibrated) {
        this.triggerHaptic();
        this._hasVibrated = true;
      }
      this.container.classList.add('ready');
      if (this.textLabel) this.textLabel.textContent = 'Thả tay để làm mới...';
    } else {
      this._hasVibrated = false;
      this.container.classList.remove('ready');
      if (this.textLabel) this.textLabel.textContent = 'Kéo xuống để làm mới';
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
      if (window.syncCoordinator) {
        await window.syncCoordinator.syncAll(false);
      } else if (window.serverSyncService) {
        await window.serverSyncService.sync();
      }

      if (window.app && typeof window.app.refreshAll === 'function') {
        await window.app.refreshAll();
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
    const wasPulling = this.currentPullDistance > 0;
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

      if (this.dotIcon) this.dotIcon.style.transform = '';
      if (this.textLabel) this.textLabel.textContent = 'Kéo xuống để làm mới';

      setTimeout(() => {
        if (this.container && !this.isPulling) {
          this.container.style.transition = '';
        }
      }, 300);
    }

    this.activeScrollContainer = null;
  }
}

window.pullToRefresh = new PullToRefresh();
