/**
 * SỔ THU CHI - MAIN APPLICATION CONTROLLER
 * Routing, View Management, Event Handling, PWA ServiceWorker
 */

// Global Utilities
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle-2';
  if (type === 'error') iconName = 'alert-triangle';

  toast.innerHTML = `
    <i data-lucide="${iconName}" style="width: 18px; height: 18px; flex-shrink: 0;"></i>
    <span>${escapeHTML(message)}</span>
  `;
  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

class App {
  constructor() {
    this.currentView = 'new-transaction';
    this.activePrimaryView = 'dashboard'; // ONLY updated when user taps a primary nav tab
    this.previousView = 'dashboard'; // View trước khi mở new-transaction
    this.scrollPositions = {}; // Lưu tọa độ cuộn theo từng view
    this.isPrivacyMode = false;
    this.isBackTransitioning = false;
    this.lastAddTabClickTime = 0;
  }

  async init() {
    // 0. Render icons immediately
    if (window.lucide) lucide.createIcons();

    // 1. Initialize IndexedDB
    await initDatabase();

    // 2. Initialize Google Drive Sync engine
    if (window.googleDriveService) {
      await window.googleDriveService.init();
    }

    // 3. Setup UI Modules
    window.UITransactions.init();
    window.UIDebts.init();
    window.UIAccounts.init();
    window.UIBudgets.init();
    window.UIAnalytics.init();
    window.UISettings.init();

    // 4. Setup Routing & Navigation
    this.setupNavigation();

    // 5. Setup Touch Swipe Gestures (Swipe from left to right to go back)
    this.setupSwipeToBack();

    // 6. Setup Global Shortcuts & Listeners
    this.setupGlobalShortcuts();

    // 7. Apply Saved Theme & Privacy Mode
    await this.loadInitialPreferences();

    // 8. Render initial data
    await this.refreshAll();

    // Reset bản nháp khi đóng/mở lại app và khởi tạo sạch trang nhập liệu mặc định
    if (window.UITransactions) {
      window.UITransactions.clearDraft();
      await window.UITransactions.resetForm('expense');
    }

    // Render icons again after dynamic DOM render
    if (window.lucide) lucide.createIcons();

    // 9. Register Service Worker for PWA
    this.registerServiceWorker();

    // 10. Sync indicator listener
    this.setupSyncListeners();

    // 11. Check URL query action (e.g. ?action=new-tx or ?tab=debts)
    this.handleUrlActions();

    // 12. Setup Browser History (Popstate) listener
    this.setupPopstateListener();

    console.log('Sổ Thu Chi PWA đã khởi động sẵn sàng!');
  }

  async loadInitialPreferences() {
    const theme = await db.settings.get('theme');
    if (theme && theme.value) {
      this.applyTheme(theme.value);
      const themeSelect = document.getElementById('settings-theme-select');
      if (themeSelect) themeSelect.value = theme.value;
    }

    const privacy = await db.settings.get('privacyMode');
    if (privacy && privacy.value) {
      this.applyPrivacyMode(true);
    }
  }

  applyTheme(theme) {
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  applyPrivacyMode(enabled) {
    this.isPrivacyMode = enabled;
    const privacyBtnIcon = document.getElementById('btn-privacy-toggle');
    if (privacyBtnIcon) {
      privacyBtnIcon.innerHTML = enabled 
        ? '<i data-lucide="eye-off" style="width: 20px; height: 20px; color: var(--warning);"></i>'
        : '<i data-lucide="eye" style="width: 20px; height: 20px;"></i>';
      if (window.lucide) lucide.createIcons();
    }

    // Mask numbers with ****** instead of eye-straining blur
    document.querySelectorAll('.stat-amount, .tx-amount, .debt-amounts div div:nth-child(2)').forEach(el => {
      if (enabled) {
        if (!el.dataset.rawAmount && el.textContent.trim() !== '******') {
          el.dataset.rawAmount = el.textContent.trim();
        }
        el.textContent = '******';
        el.classList.add('privacy-masked');
      } else {
        if (el.dataset.rawAmount) {
          el.textContent = el.dataset.rawAmount;
          delete el.dataset.rawAmount;
        }
        el.classList.remove('privacy-masked');
      }
    });
  }

  togglePrivacyMode() {
    this.applyPrivacyMode(!this.isPrivacyMode);
    db.settings.put({ key: 'privacyMode', value: this.isPrivacyMode });
    showToast(this.isPrivacyMode ? 'Đã ẩn số tiền' : 'Đã hiện số tiền', 'info');
  }

  setupNavigation() {
    // Desktop Nav Items
    document.querySelectorAll('.nav-item a').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.dataset.view;
        if (view) {
          this.activePrimaryView = view; // Track which primary tab is active
          this.switchView(view);
        }
      });
    });

    // Mobile Bottom Nav Items
    document.querySelectorAll('.mobile-nav-item').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.dataset.view;
        if (view) {
          this.activePrimaryView = view; // Track which primary tab is active
          this.switchView(view);
        }
      });
    });

    // Global Action Buttons
    const fabBtn = document.getElementById('fab-add-tx');
    if (fabBtn) {
      fabBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleInputTabClick();
      });
    }

    const headerAddBtn = document.getElementById('header-add-btn');
    if (headerAddBtn) {
      headerAddBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleInputTabClick();
      });
    }

    const privacyBtn = document.getElementById('btn-privacy-toggle');
    if (privacyBtn) {
      privacyBtn.addEventListener('click', () => this.togglePrivacyMode());
    }
  }

  handleInputTabClick() {
    const now = Date.now();
    const timeSinceLastClick = now - (this.lastAddTabClickTime || 0);
    this.lastAddTabClickTime = now;

    // Nếu bấm 2 lần trong vòng 2 giây (hoặc double tap)
    if (timeSinceLastClick < 2000) {
      if (window.UITransactions) {
        window.UITransactions.clearDraft();
        window.UITransactions.resetForm('expense');
        showToast('Đã làm mới trang nhập liệu', 'info');
        window.scrollTo(0, 0);
        const activeView = document.getElementById('view-new-transaction');
        if (activeView) activeView.scrollTop = 0;
      }
      this.lastAddTabClickTime = 0;
      return;
    }

    // Nếu chưa ở trang nhập liệu -> Chuyển vào trang nhập liệu (giữ nguyên dữ liệu đang nhập dở)
    if (this.currentView !== 'new-transaction') {
      if (window.UITransactions) {
        window.UITransactions.openAddModal();
      }
    } else {
      // Đang ở trang nhập liệu mà mới bấm 1 lần -> Gợi ý bấm thêm lần nữa để làm mới
      showToast('Bấm thêm lần nữa để làm mới trang nhập liệu', 'info');
    }
  }

  switchView(viewId, isBack = false) {
    if (!viewId) return;
    const primaryViews = ['dashboard', 'accounts', 'budgets', 'settings', 'transactions', 'debts', 'analytics'];
    const isPrimary = primaryViews.includes(viewId);
    const isTxPage = ['new-transaction', 'category-picker', 'borrow-select'].includes(viewId);

    // Instantly hide/show the header in JS FIRST — before any class/DOM changes.
    // CSS :has() and body-class selectors update asynchronously (next paint frame),
    // causing a 1-frame flicker where the header briefly appears. Direct style is immediate.
    const appHeader = document.querySelector('.app-header');
    if (appHeader) {
      if (isTxPage) {
        appHeader.style.display = 'none';
        appHeader.style.backdropFilter = 'none';
        appHeader.style.webkitBackdropFilter = 'none';
      } else {
        appHeader.style.display = '';
        appHeader.style.backdropFilter = '';
        appHeader.style.webkitBackdropFilter = '';
      }
    }

    // 1. Lưu vị trí cuộn của view hiện tại trước khi chuyển view
    if (this.currentView) {
      this.scrollPositions[this.currentView] = window.scrollY || document.documentElement.scrollTop || 0;
      // Tự động lưu nháp giao dịch nếu đang rời khỏi trang ghi chép
      if (this.currentView === 'new-transaction' && window.UITransactions) {
        window.UITransactions.saveDraft();
      }
    }

    // 2. Lưu previousView trước khi chuyển vào các trang con (ghi chép, danh mục, ...)
    const txSubViews = ['new-transaction', 'category-picker', 'borrow-select'];
    if (txSubViews.includes(viewId) && !txSubViews.includes(this.currentView)) {
      this.previousView = this.currentView;
    }

    const previousViewId = this.currentView;
    this.currentView = viewId;

    // Toggle body class for view-specific styles
    document.body.classList.toggle('view-new-transaction', isTxPage);
    document.body.classList.toggle('view-category-picker', viewId === 'category-picker');
    document.body.classList.toggle('view-borrow-select', viewId === 'borrow-select');


    // Update active nav links
    document.querySelectorAll('.nav-item').forEach(item => {
      const link = item.querySelector('a');
      item.classList.toggle('active', link && link.dataset.view === viewId);
    });

    document.querySelectorAll('.mobile-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewId);
    });

    // Show/hide view pages
    document.querySelectorAll('.page-view').forEach(page => {
      const isActive = page.id === `view-${viewId}`;
      page.classList.toggle('active', isActive);
      if (page.classList.contains('tx-page-view')) {
        page.style.transform = '';
        page.style.opacity = '';
        page.style.transition = '';
      }
    });

    // Update Header title
    const titles = {
      dashboard: 'Tổng Quan Tài Chính',
      transactions: 'Sổ Giao Dịch',
      debts: 'Sổ Vay Nợ (Cho Vay & Đi Vay)',
      accounts: 'Tài Khoản & Ví Tiền',
      budgets: 'Hạn Mức Ngân Sách',
      analytics: 'Báo Cáo & Phân Tích',
      settings: 'Cài Đặt & Đồng Bộ',
      'new-transaction': 'Ghi Chép Mới',
      'category-picker': 'Chọn Danh Mục',
      'borrow-select': 'Chọn Người Cho Vay'
    };
    const titleEl = document.getElementById('header-page-title');
    if (titleEl) titleEl.textContent = titles[viewId] || 'Sổ Thu Chi';

    // Update browser history:
    // Use replaceState for ALL views so the history stack never grows.
    // This prevents the browser from firing popstate during our custom swipe gesture.
    // Back navigation is handled 100% by goBack() and the swipe handler — not the browser.
    if (window.history) {
      window.history.replaceState({ view: viewId }, '', `#${viewId}`);
    }

    // Refresh specific view data
    if (viewId === 'dashboard') {
      this.refreshNetWorth();
      window.UITransactions.render();
      window.UIAnalytics.render();
    } else if (viewId === 'transactions') {
      window.UITransactions.render();
    } else if (viewId === 'debts') {
      window.UIDebts.render();
    } else if (viewId === 'accounts') {
      window.UIAccounts.render();
    } else if (viewId === 'budgets') {
      window.UIBudgets.render();
    } else if (viewId === 'analytics') {
      window.UIAnalytics.render();
    } else if (viewId === 'settings') {
      window.UISettings.loadSettings();
    }

    const activeView = document.getElementById(`view-${viewId}`);
    if (activeView) {
      activeView.scrollTop = 0;
    }

    // Khôi phục vị trí cuộn khi trở về (isBack = true)
    if (isBack && this.scrollPositions[viewId] !== undefined) {
      const savedY = this.scrollPositions[viewId];
      // Khôi phục ngay lập tức và một lần nữa sau khi DOM render ổn định
      window.scrollTo(0, savedY);
      requestAnimationFrame(() => {
        window.scrollTo(0, savedY);
      });
    } else if (!isTxPage) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo(0, 0);
    }
  }

  goBack() {
    if (this.isBackTransitioning) return;
    this.isBackTransitioning = true;
    setTimeout(() => { this.isBackTransitioning = false; }, 350);

    if (window.UITransactions) {
      window.UITransactions.closeKeypad();
      if (typeof window.UITransactions.closeTypeDropdown === 'function') {
        window.UITransactions.closeTypeDropdown();
      }
    }

    // Sub-pages (category-picker, borrow-select) → back to new-transaction
    if (this.currentView === 'category-picker' || this.currentView === 'borrow-select') {
      this.switchView('new-transaction', true);
      return;
    }

    // new-transaction → chỉ trở về khi đang ở chế độ SỬA giao dịch đã có
    if (this.currentView === 'new-transaction') {
      const txId = document.getElementById('tx-id-input')?.value;
      if (txId) {
        const target = this.previousView || this.activePrimaryView || 'transactions';
        this.switchView(target, true);
      }
      return;
    }
  }

  setupPopstateListener() {
    // Since we use replaceState for all views, popstate should NOT fire during normal navigation.
    // This listener only handles the Android hardware back button press.
    window.addEventListener('popstate', (e) => {
      if (this.isBackTransitioning) {
        window.history.replaceState({ view: this.currentView }, '', `#${this.currentView}`);
        return;
      }

      // category-picker & borrow-select always support back to new-transaction
      if (['category-picker', 'borrow-select'].includes(this.currentView)) {
        window.history.replaceState({ view: this.currentView }, '', `#${this.currentView}`);
        this.goBack();
      } else if (this.currentView === 'new-transaction') {
        // new-transaction only supports back when editing
        const isEditing = !!document.getElementById('tx-id-input')?.value;
        window.history.replaceState({ view: this.currentView }, '', `#${this.currentView}`);
        if (isEditing) {
          this.goBack();
        }
      } else {
        // All other views (primary tabs) are FIXED — ignore back button
        window.history.replaceState({ view: this.currentView }, '', `#${this.currentView}`);
      }
    });
  }

  setupSwipeToBack() {
    // new-transaction, category-picker, borrow-select: support swipe-to-back.
    // NOTE: new-transaction ONLY allows swipe when editing an existing transaction.
    const pages = document.querySelectorAll('#view-new-transaction, #view-category-picker, #view-borrow-select');
    if (!pages.length) return;

    pages.forEach(page => {
      let startX = 0;
      let startY = 0;
      let currentX = 0;
      let deltaX = 0;
      let deltaY = 0;
      let startTime = 0;
      let isSwiping = false;
      let canSwipe = false;

      page.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        // ONLY allow swipe on the currently ACTIVE page
        if (!page.classList.contains('active')) return;

        // Trang Ghi Chép (new-transaction) là trang cố định:
        // CHỈ cho phép vuốt trở về khi ĐANG SỬA một giao dịch đã có
        if (page.id === 'view-new-transaction') {
          const isEditing = !!document.getElementById('tx-id-input')?.value;
          if (!isEditing) {
            canSwipe = false;
            return;
          }
        }

        const target = e.target;
        // Skip if inside open keypad or category manager
        if (target.closest('#modal-keypad.open') || target.closest('#modal-category-manager.open')) {
          canSwipe = false;
          return;
        }
        // Skip if touching interactive input/select/button
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
          canSwipe = false;
          return;
        }

        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        currentX = startX;
        deltaX = 0;
        deltaY = 0;
        startTime = Date.now();
        isSwiping = false;

        // Allow swipe starting from left area of screen
        canSwipe = (startX <= window.innerWidth * 0.4 || startX <= 140);
      }, { passive: true });

      page.addEventListener('touchmove', (e) => {
        if (!canSwipe || e.touches.length !== 1) return;
        if (!page.classList.contains('active')) return;
        currentX = e.touches[0].clientX;
        deltaX = currentX - startX;
        deltaY = e.touches[0].clientY - startY;

        // Only handle drag towards right
        if (deltaX > 8) {
          // Horizontal gesture priority
          if (Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
            isSwiping = true;
            page.classList.add('swiping');
            const translateX = Math.max(0, deltaX);
            page.style.transform = `translateX(${translateX}px)`;
            const progress = Math.min(translateX / (window.innerWidth * 0.7), 1);
            page.style.opacity = `${1 - progress * 0.25}`;
          }
        }
      }, { passive: true });

      const handleTouchEnd = () => {
        if (!isSwiping) {
          canSwipe = false;
          return;
        }
        isSwiping = false;
        canSwipe = false;
        page.classList.remove('swiping');

        const duration = Date.now() - startTime;
        const velocity = deltaX / Math.max(duration, 1);
        const threshold = Math.min(window.innerWidth * 0.25, 80);
        const swipedView = page.id.replace('view-', '');

        // Trigger back if past threshold or quick flick
        if (deltaX > threshold || (deltaX > 35 && velocity > 0.3)) {
          page.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.2s ease';
          page.style.transform = 'translateX(100%)';
          page.style.opacity = '0';
          setTimeout(() => {
            page.style.transform = '';
            page.style.opacity = '';
            page.style.transition = '';
            // Since we use replaceState (no pushState), there's no popstate race.
            // Just call goBack() directly — it will do the right thing based on currentView.
            this.goBack();
          }, 220);
        } else {
          // Snap back
          page.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.2s ease';
          page.style.transform = 'translateX(0)';
          page.style.opacity = '1';
          setTimeout(() => {
            page.style.transform = '';
            page.style.opacity = '';
            page.style.transition = '';
          }, 200);
        }
      };

      page.addEventListener('touchend', handleTouchEnd, { passive: true });
      page.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    });
  }

  setupGlobalShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Don't trigger when user is typing in input or modal is open
      const isInputActive = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
      const isModalOpen = document.querySelector('.modal-overlay.open');

      if (!isInputActive && !isModalOpen) {
        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          this.handleInputTabClick();
        } else if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          this.togglePrivacyMode();
        }
      }

      if (e.key === 'Escape') {
        // Close any open modals
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
      }
    });
  }

  setupSyncListeners() {
    const dot = document.querySelector('.status-dot');
    const text = document.getElementById('sync-status-text');

    window.addEventListener('sync-start', () => {
      if (dot) dot.className = 'status-dot syncing';
      if (text) text.textContent = 'Đang đồng bộ...';
    });

    window.addEventListener('sync-success', (e) => {
      if (dot) dot.className = 'status-dot';
      if (text) text.textContent = 'Đã đồng bộ Drive';
    });

    window.addEventListener('sync-error', (e) => {
      if (dot) dot.className = 'status-dot error';
      if (text) text.textContent = 'Lỗi đồng bộ';
    });
  }

  async refreshNetWorth() {
    const nw = await getNetWorth();

    const netWorthEl = document.getElementById('stat-net-worth');
    const totalLendEl = document.getElementById('stat-total-lend');
    const totalBorrowEl = document.getElementById('stat-total-borrow');
    const totalBalanceEl = document.getElementById('stat-total-balance');

    if (netWorthEl) netWorthEl.textContent = `${new Intl.NumberFormat('vi-VN').format(nw.netWorth)}đ`;
    if (totalLendEl) totalLendEl.textContent = `${new Intl.NumberFormat('vi-VN').format(nw.totalLend)}đ`;
    if (totalBorrowEl) totalBorrowEl.textContent = `${new Intl.NumberFormat('vi-VN').format(nw.totalBorrow)}đ`;
    if (totalBalanceEl) totalBalanceEl.textContent = `${new Intl.NumberFormat('vi-VN').format(nw.totalAccountBalance)}đ`;

    // Reapply privacy mask if enabled
    if (this.isPrivacyMode) {
      this.applyPrivacyMode(true);
    }
  }

  async refreshAll() {
    await this.refreshNetWorth();
    await window.UITransactions.render();
    await window.UIDebts.render();
    await window.UIAccounts.render();
    await window.UIBudgets.render();
    await window.UIAnalytics.render();
    if (window.lucide) lucide.createIcons();
  }

  handleUrlActions() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const tab = params.get('tab');

    if (tab) {
      this.switchView(tab);
    } else {
      this.switchView('new-transaction');
    }
    if (action === 'new-tx') {
      setTimeout(() => this.handleInputTabClick(), 300);
    }
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => {
            console.log('PWA ServiceWorker registered with scope:', reg.scope);
          })
          .catch(err => {
            console.warn('PWA ServiceWorker registration failed:', err);
          });
      });
    }
  }
}

// Instantiate and launch App on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});

// iOS Safari / Mobile PWA Viewport and Touch Misalignment Fixes
document.addEventListener('touchstart', () => {}, { passive: true });
