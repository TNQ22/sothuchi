/**
 * PullToRefresh - Kéo xuống từ đỉnh trang để làm mới dữ liệu từ Máy Chủ
 * Hỗ trợ cảm ứng trên thiết bị di động (Touch) và thao tác mượt mà trên tất cả các trang.
 */
class PullToRefresh {
  constructor() {
    this.container = null;
    this.arrowIcon = null;
    this.spinnerIcon = null;
    this.successIcon = null;
    this.textLabel = null;

    this.startY = 0;
    this.startX = 0;
    this.currentY = 0;
    this.pullDistance = 0;
    this.isPulling = false;
    this.isRefreshing = false;
    this.canPull = false;
    this._hasVibrated = false;

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
    if (document.getElementById('pull-to-refresh-indicator')) return;

    const el = document.createElement('div');
    el.id = 'pull-to-refresh-indicator';
    el.className = 'ptr-indicator';
    el.innerHTML = `
      <div class="ptr-pill">
        <div class="ptr-icon-box">
          <svg class="ptr-icon ptr-icon-arrow" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
          <svg class="ptr-icon ptr-icon-spinner" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
          </svg>
          <svg class="ptr-icon ptr-icon-success" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <span class="ptr-label">Kéo xuống để làm mới</span>
      </div>
    `;

    document.body.appendChild(el);
    this.container = el;
    this.arrowIcon = el.querySelector('.ptr-icon-arrow');
    this.spinnerIcon = el.querySelector('.ptr-icon-spinner');
    this.successIcon = el.querySelector('.ptr-icon-success');
    this.textLabel = el.querySelector('.ptr-label');

    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: true });
    window.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    window.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: true });
    window.addEventListener('touchcancel', () => this.resetPullState(), { passive: true });
  }

  isAtTop(target) {
    if (window.scrollY > 2 || document.documentElement.scrollTop > 2 || document.body.scrollTop > 2) {
      return false;
    }

    const activePage = document.querySelector('.page-view.active');
    if (activePage && activePage.scrollTop > 2) {
      return false;
    }

    let el = target;
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.scrollHeight > el.clientHeight + 4) {
        const overflowY = window.getComputedStyle(el).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollTop > 2) {
          return false;
        }
      }
      el = el.parentElement;
    }

    if (document.querySelector('.modal.open, .dialog.open, #modal-keypad.open, #action-sheet.open')) {
      return false;
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
  }

  onTouchMove(e) {
    if (!this.canPull || this.isRefreshing) return;
    if (e.touches.length !== 1) return;

    this.currentY = e.touches[0].clientY;
    const deltaY = this.currentY - this.startY;
    const deltaX = Math.abs(e.touches[0].clientX - this.startX);

    if (deltaX > deltaY) {
      this.canPull = false;
      return;
    }

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
    this.container.classList.add('visible');
    this.container.classList.remove('refreshing', 'success');

    this.container.style.transform = `translate(-50%, ${distance}px)`;

    const progress = Math.min(1, distance / this.PULL_THRESHOLD);
    const rotation = progress * 180;
    if (this.arrowIcon) {
      this.arrowIcon.style.transform = `rotate(${rotation}deg)`;
    }

    if (distance >= this.PULL_THRESHOLD) {
      this.container.classList.add('ready');
      if (this.textLabel) this.textLabel.textContent = 'Thả tay để làm mới...';
      if (!this._hasVibrated && navigator.vibrate) {
        navigator.vibrate(12);
        this._hasVibrated = true;
      }
    } else {
      this.container.classList.remove('ready');
      if (this.textLabel) this.textLabel.textContent = 'Kéo xuống để làm mới';
      this._hasVibrated = false;
    }
  }

  async onTouchEnd() {
    if (!this.isPulling || this.isRefreshing) {
      this.resetPullState();
      return;
    }

    if (this.pullDistance >= this.PULL_THRESHOLD) {
      await this.triggerRefresh();
    } else {
      this.resetPullState();
    }
  }

  async triggerRefresh() {
    this.isRefreshing = true;
    this.container.classList.add('refreshing');
    this.container.classList.remove('ready');
    this.container.style.transform = `translate(-50%, ${this.PULL_THRESHOLD}px)`;
    if (this.textLabel) this.textLabel.textContent = 'Đang đồng bộ từ máy chủ...';

    try {
      if (window.syncCoordinator) {
        await window.syncCoordinator.syncAll(false);
      } else if (window.serverSyncService) {
        await window.serverSyncService.sync();
      }

      if (window.app && typeof window.app.refreshAll === 'function') {
        await window.app.refreshAll();
      }

      this.container.classList.remove('refreshing');
      this.container.classList.add('success');
      if (this.textLabel) this.textLabel.textContent = 'Đã làm mới thành công!';

      await new Promise(resolve => setTimeout(resolve, 600));
    } catch (err) {
      console.warn('[PullToRefresh] Lỗi làm mới:', err);
      if (this.textLabel) this.textLabel.textContent = 'Không thể kết nối máy chủ';
      await new Promise(resolve => setTimeout(resolve, 1000));
    } finally {
      this.resetPullState();
    }
  }

  resetPullState() {
    this.isPulling = false;
    this.isRefreshing = false;
    this.canPull = false;
    this.pullDistance = 0;
    this._hasVibrated = false;

    if (this.container) {
      this.container.style.transform = '';
      this.container.classList.remove('visible', 'ready', 'refreshing', 'success');
      if (this.arrowIcon) this.arrowIcon.style.transform = '';
      if (this.textLabel) this.textLabel.textContent = 'Kéo xuống để làm mới';
    }
  }
}

window.pullToRefresh = new PullToRefresh();
