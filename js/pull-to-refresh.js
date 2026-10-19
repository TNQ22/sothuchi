/**
 * PullToRefresh - Kéo xuống từ đỉnh trang để kích hoạt làm mới dữ liệu từ Máy Chủ
 * - Khi kéo: Mở khoảng hở dưới Header, hiện icon mũi tên xoay dần + "Kéo xuống để làm mới"
 * - Khi đạt ngưỡng (65px): Rung phản hồi (Haptic 12ms), viền xanh ngọc + "Thả tay để làm mới..."
 * - Khi thả tay: Lập tức tự cuộn êm lên lại 0px, kích hoạt đồng bộ nền (trạng thái làm mới hiển thị qua icon logo trên header)
 */
class PullToRefresh {
  constructor() {
    this.container = null;
    this.arrowIcon = null;
    this.textLabel = null;

    this.startY = 0;
    this.startX = 0;
    this.currentY = 0;
    this.pullDistance = 0;
    this.isPulling = false;
    this.isRefreshing = false;
    this.canPull = false;
    this._hasVibrated = false;
    this.activeScrollContainer = null;

    this.PULL_THRESHOLD = 65; // Khoảng cách kéo tối thiểu để kích hoạt làm mới (px)
    this.MAX_PULL = 115;      // Giới hạn kéo tối đa (px)

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
      el.innerHTML = `
        <div class="ptr-pill">
          <div class="ptr-icon-box">
            <svg class="ptr-icon ptr-icon-arrow" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <polyline points="19 12 12 19 5 12"></polyline>
            </svg>
          </div>
          <span class="ptr-label">Kéo xuống để làm mới</span>
        </div>
      `;

      const mainWrapper = document.querySelector('.main-wrapper') || document.body;
      const appHeader = document.querySelector('.app-header');
      if (appHeader && appHeader.nextSibling) {
        mainWrapper.insertBefore(el, appHeader.nextSibling);
      } else {
        mainWrapper.appendChild(el);
      }
    }

    this.container = el;
    this.arrowIcon = el.querySelector('.ptr-icon-arrow');
    this.textLabel = el.querySelector('.ptr-label');

    this.setupListeners();
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
    // Không cho phép pull khi đang mở modal, dialog, action sheet, keypad, hoặc đang ở form ghi chép/tạo mới
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
    this.pullDistance = 0;
    this.isPulling = false;
    this.activeScrollContainer = this.getActivePageElement();
  }

  onTouchMove(e) {
    if (!this.canPull || this.isRefreshing) return;
    if (e.touches.length !== 1) return;

    this.currentY = e.touches[0].clientY;
    const deltaY = this.currentY - this.startY;
    const deltaX = Math.abs(e.touches[0].clientX - this.startX);

    // Nếu vuốt ngang nhiều hơn vuốt dọc thì hủy pull
    if (deltaX > deltaY) {
      this.canPull = false;
      return;
    }

    // Kéo xuống
    if (deltaY > 6) {
      this.isPulling = true;
      if (e.cancelable) e.preventDefault();

      const dampened = Math.min(this.MAX_PULL, Math.pow(deltaY, 0.82) * 1.5);
      this.pullDistance = dampened;
      this.updatePullProgress(dampened);
    }
  }

  updatePullProgress(distance) {
    if (!this.container) return;

    const headerBottom = this.getHeaderBottom();
    const pullOffset = Math.round(distance * 0.82);

    this.container.style.top = `${headerBottom}px`;
    this.container.style.height = `${pullOffset}px`;
    this.container.classList.add('visible');
    this.container.classList.remove('animate-reset');

    const pageEl = this.activeScrollContainer || this.getActivePageElement();
    if (pageEl) {
      pageEl.style.transition = 'none';
      pageEl.style.transform = `translateY(${pullOffset}px)`;
    }

    const progress = Math.min(1, distance / this.PULL_THRESHOLD);
    const rotation = progress * 180;
    if (this.arrowIcon) {
      this.arrowIcon.style.transform = `rotate(${rotation}deg)`;
    }

    if (distance >= this.PULL_THRESHOLD) {
      this.container.classList.add('ready');
      if (this.textLabel) this.textLabel.textContent = 'Thả tay để làm mới...';
      if (!this._hasVibrated && navigator.vibrate) {
        try { navigator.vibrate(12); } catch (_) {}
        this._hasVibrated = true;
      }
    } else {
      this.container.classList.remove('ready');
      if (this.textLabel) this.textLabel.textContent = 'Kéo xuống để làm mới';
      this._hasVibrated = false;
    }
  }

  onTouchEnd() {
    if (!this.isPulling) {
      this.resetPullState();
      return;
    }

    const shouldRefresh = this.pullDistance >= this.PULL_THRESHOLD;

    // Tự cuộn êm lên lại ngay lập tức
    this.resetPullState();

    // Nếu đã kéo đủ khoảng cách thì kích hoạt làm mới (trạng thái làm mới hiển thị qua logo trên Header)
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
    this.pullDistance = 0;
    this._hasVibrated = false;

    const pageEl = this.activeScrollContainer || this.getActivePageElement();
    if (pageEl) {
      pageEl.style.transition = 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)';
      pageEl.style.transform = '';
      setTimeout(() => {
        if (pageEl && !this.isPulling) {
          pageEl.style.transition = '';
        }
      }, 300);
    }

    if (this.container) {
      this.container.classList.add('animate-reset');
      this.container.style.transition = 'height 0.28s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.2s ease';
      this.container.style.height = '0px';
      this.container.classList.remove('visible', 'ready');
      if (this.arrowIcon) this.arrowIcon.style.transform = '';
      if (this.textLabel) this.textLabel.textContent = 'Kéo xuống để làm mới';
      setTimeout(() => {
        if (this.container && !this.isPulling) {
          this.container.classList.remove('animate-reset');
          this.container.style.transition = '';
        }
      }, 300);
    }

    this.activeScrollContainer = null;
  }
}

window.pullToRefresh = new PullToRefresh();
