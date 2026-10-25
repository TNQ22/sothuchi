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

  // Giữ tối đa 1 thông báo để thanh gọn nhất và không chồng lấp giao diện
  const existing = container.querySelectorAll('.toast');
  existing.forEach(t => t.remove());

  const isMultiLine = typeof message === 'string' && message.includes('\n');
  const hasEmojiIcon = typeof message === 'string' && (/^[✅❌⚠️ℹ️]/.test(message.trim()) || isMultiLine);

  const toast = document.createElement('div');
  toast.className = `toast ${type}${isMultiLine ? ' multi-line' : ''}`;
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle-2';
  if (type === 'error') iconName = 'alert-triangle';
  if (type === 'warning') iconName = 'alert-circle';

  if (hasEmojiIcon) {
    toast.innerHTML = `<span style="font-size: 0.85rem;">${escapeHTML(message)}</span>`;
  } else {
    toast.innerHTML = `
      <i data-lucide="${iconName}"></i>
      <span>${escapeHTML(message)}</span>
    `;
  }
  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  let isDismissed = false;
  let timer = null;

  const dismiss = (direction = 'up') => {
    if (isDismissed) return;
    isDismissed = true;
    if (timer) clearTimeout(timer);

    toast.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease';
    if (direction === 'left') {
      toast.style.transform = 'translateX(-80px) scale(0.9)';
    } else if (direction === 'right') {
      toast.style.transform = 'translateX(80px) scale(0.9)';
    } else {
      toast.style.transform = 'translateY(-24px) scale(0.9)';
    }
    toast.style.opacity = '0';

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 200);
  };

  // 1. Tự động tắt sau 2 giây (hoặc 4 giây nếu nhiều dòng)
  const duration = isMultiLine ? 4000 : 2000;
  timer = setTimeout(() => dismiss('up'), duration);

  // 2. Chạm hoặc click vào là tắt thông báo luôn
  toast.addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss('up');
  });

  // 3. Hỗ trợ vuốt để tắt (Touch Swipe: vuốt lên, vuốt trái, vuốt phải)
  let startX = 0;
  let startY = 0;
  let isTouching = false;

  toast.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isTouching = true;
    toast.style.transition = 'none';
  }, { passive: true });

  toast.addEventListener('touchmove', (e) => {
    if (!isTouching || e.touches.length !== 1) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;

    // Hỗ trợ vuốt lên (deltaY < 0) hoặc vuốt sang 2 bên
    if (deltaY < 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
      const translateY = Math.min(0, deltaY);
      const opacity = Math.max(0.15, 1 - Math.max(Math.abs(deltaX), -deltaY) / 80);
      toast.style.transform = `translate(${deltaX}px, ${translateY}px)`;
      toast.style.opacity = String(opacity);
    }
  }, { passive: true });

  toast.addEventListener('touchend', (e) => {
    if (!isTouching) return;
    isTouching = false;
    const touch = e.changedTouches[0];
    const deltaX = touch ? touch.clientX - startX : 0;
    const deltaY = touch ? touch.clientY - startY : 0;

    // Vuốt lên trên
    if (deltaY < -15) {
      dismiss('up');
      return;
    }
    // Vuốt sang trái
    if (deltaX < -25) {
      dismiss('left');
      return;
    }
    // Vuốt sang phải
    if (deltaX > 25) {
      dismiss('right');
      return;
    }

    // Nếu chỉ chạm nhẹ hoặc chưa đủ ngưỡng -> phục hồi vị trí
    toast.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease';
    toast.style.transform = 'translate(0, 0)';
    toast.style.opacity = '1';
  }, { passive: true });

  toast.addEventListener('touchcancel', () => {
    isTouching = false;
    toast.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease';
    toast.style.transform = 'translate(0, 0)';
    toast.style.opacity = '1';
  }, { passive: true });
}

class App {
  constructor() {
    this.currentView = 'new-transaction';
    this.activePrimaryView = 'dashboard'; // ONLY updated when user taps a primary nav tab
    this.previousView = null; // Trang nhập liệu là mặc định cố định, không vuốt lùi về dashboard
    this.openedFromAccountMenu = false; // Bật true khi mở Chuyển khoản / Điều chỉnh từ menu 3 chấm của Ví
    this.editSourceView = null; // Lưu view đã mở form sửa giao dịch (ví dụ: 'transactions', 'dashboard')
    this.scrollPositions = {}; // Lưu tọa độ cuộn theo từng view
    this.isPrivacyMode = false;
    this.isBackTransitioning = false;
    this.lastAddTabClickTime = 0;
    this.lastBudgetTabClickTime = 0;
  }

  async init() {
    // 0. Render icons immediately & Load .env configuration in background
    if (window.lucide) lucide.createIcons();
    if (window.EnvConfig && window.EnvConfig.load) {
      window.EnvConfig.load().catch(e => console.warn('EnvConfig load error:', e));
    }

    // 1. Initialize IndexedDB
    await initDatabase();

    // 2. Setup Transaction UI and initialize default form immediately (default startup view)
    if (window.UITransactions) {
      await window.UITransactions.init();
      window.UITransactions.clearDraft();
      await window.UITransactions.resetForm('expense');
    }

    // Cập nhật Avatar tài khoản Google/Dropbox hoặc App Logo lên Header và Trang Ghi Chép
    const savedGoogleProfile = await db.settings.get('googleUserProfile');
    const savedDbxProfile = await db.settings.get('dropboxUserProfile');
    const dbxHasToken = window.dropboxService && window.dropboxService.hasValidToken && window.dropboxService.hasValidToken();
    const gDriveHasToken = window.googleDriveService && window.googleDriveService.hasValidToken && window.googleDriveService.hasValidToken();

    if (dbxHasToken && savedDbxProfile?.value) {
      this.updateBrandLogos(savedDbxProfile.value);
    } else if (gDriveHasToken && savedGoogleProfile?.value) {
      this.updateBrandLogos(savedGoogleProfile.value);
    } else if (savedGoogleProfile?.value) {
      this.updateBrandLogos(savedGoogleProfile.value);
    } else if (savedDbxProfile?.value) {
      this.updateBrandLogos(savedDbxProfile.value);
    } else {
      this.updateBrandLogos(null);
    }

    window.addEventListener('server-auth-changed', (e) => {
      if (e.detail?.user) {
        this.updateBrandLogos(e.detail.user);
      } else if (window.googleDriveService?.userProfile) {
        this.updateBrandLogos(window.googleDriveService.userProfile);
      } else if (window.dropboxService?.userProfile) {
        this.updateBrandLogos(window.dropboxService.userProfile);
      } else {
        this.updateBrandLogos(null);
      }
    });

    window.addEventListener('google-profile-updated', (e) => {
      this.updateBrandLogos(e.detail);
    });

    window.addEventListener('dropbox-profile-updated', (e) => {
      if (e.detail) {
        this.updateBrandLogos(e.detail);
      } else if (window.googleDriveService?.userProfile) {
        this.updateBrandLogos(window.googleDriveService.userProfile);
      } else {
        this.updateBrandLogos(null);
      }
    });

    // 3. Setup Other UI Modules
    window.UIDebts.init();
    window.UIAccounts.init();
    window.UIBudgets.init();
    window.UIAnalytics.init();
    window.UISettings.init();

    // 4. Setup Routing & Navigation
    this.setupNavigation();

    // 5. Setup Touch Swipe Gestures (Swipe from left to right to go back)
    this.setupSwipeToBack();
    this.setupModalSwipeGestures();
    this.setupModalBackdropDismiss();

    // 6. Setup Global Shortcuts & Listeners
    this.setupGlobalShortcuts();
    this.setupClearableInputs();

    // 7. Apply Saved Theme & Privacy Mode
    await this.loadInitialPreferences();

    // 8. Render initial data for background tabs
    await this.refreshAll();

    // Render icons again after dynamic DOM render
    if (window.lucide) lucide.createIcons();

    // 9. Khởi chạy Cloud Sync & Đồng bộ ngầm ở background (hoàn toàn Non-Blocking)
    (async () => {
      try {
        if (window.serverSyncService) {
          await window.serverSyncService.init().catch(e => console.warn('ServerSync init error:', e));
          if (window.SyncCoordinator) {
            window.SyncCoordinator.registerAdapter('custom-server', window.serverSyncService);
          }
        }
        if (window.googleDriveService) {
          await window.googleDriveService.init().catch(e => console.warn('Drive init error:', e));
        }
        if (window.dropboxService) {
          await window.dropboxService.init().catch(e => console.warn('Dropbox init error:', e));
          if (window.SyncCoordinator) {
            window.SyncCoordinator.registerAdapter('dropbox', window.dropboxService);
          }
        }
        if (window.BackupService && window.BackupService.init) {
          await window.BackupService.init().catch(e => console.warn('BackupService init error:', e));
        }
        if (window.SyncCoordinator && window.SyncCoordinator.init) {
          await window.SyncCoordinator.init().catch(e => console.warn('SyncCoordinator init error:', e));
        }

        // Tự động đồng bộ dữ liệu từ Google Drive khi mở app
        if (window.googleDriveService && window.googleDriveService.clientId && window.googleDriveService.autoSync) {
          if (window.googleDriveService.hasValidToken()) {
            console.log('[GoogleDrive] Token còn hạn, tự động đồng bộ khi mở app...');
            if (window.SyncCoordinator) {
              window.SyncCoordinator.syncAll(true).catch(e => console.warn('Startup sync:', e));
            } else {
              window.googleDriveService.sync().catch(e => console.warn('Startup sync:', e));
            }
          } else if (window.googleDriveService.userProfile?.email) {
            console.log('[GoogleDrive] Thử gia hạn ngầm phiên đăng nhập với email đã nhớ...');
            window.googleDriveService.requestToken({ prompt: '', interactive: false })
              .then(async () => {
                console.log('[GoogleDrive] Gia hạn ngầm thành công khi mở app! Bắt đầu đồng bộ...');
                if (window.SyncCoordinator) {
                  await window.SyncCoordinator.syncAll(true);
                } else {
                  await window.googleDriveService.sync();
                }
                await this.refreshAll();
              })
              .catch(err => {
                console.log('[GoogleDrive] Trình duyệt chặn kết nối ngầm (sẵn sàng kết nối khi bấm vào Avatar):', err.message);
              });
          }
        }

        // Tự động đồng bộ với Máy Chủ Riêng khi mở app
        if (window.serverSyncService && window.serverSyncService.isAutoSyncEnabled()) {
          console.log('[ServerSync] Tự động đồng bộ với Máy Chủ Riêng khi mở app...');
          window.serverSyncService.sync().catch(e => console.warn('[ServerSync] Startup sync error:', e));
        }
      } catch (err) {
        console.warn('Background sync init error:', err);
      }
    })();

    // 10. Register Service Worker for PWA
    this.registerServiceWorker();

    // 11. Sync indicator listener
    this.setupSyncListeners();

    // 12. Check URL query action (e.g. ?action=new-tx or ?tab=debts)
    this.handleUrlActions();

    // 13. Setup Browser History (Popstate) listener
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
    if (window.UIAnalytics && typeof window.UIAnalytics.render === 'function') {
      window.UIAnalytics.render();
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

    const networthEyeIcon = document.getElementById('account-privacy-eye-icon');
    if (networthEyeIcon) {
      networthEyeIcon.setAttribute('data-lucide', enabled ? 'eye-off' : 'eye');
      if (window.lucide) lucide.createIcons();
    }

    // Mask numbers with ****** instead of eye-straining blur (bao gồm số dư các ví/tài khoản chi tiêu)
    document.querySelectorAll('.stat-amount, .tx-amount, .account-balance, .debt-amounts div div:nth-child(2)').forEach(el => {
      // Vô hiệu hóa ẩn số tiền cho mục lịch sử thu chi:
      if (el.closest('#view-transactions') || el.closest('#transactions-list-container-full')) {
        return;
      }
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

    if (window.UIAccounts && typeof window.UIAccounts.adjustMiniPillFontSizes === 'function') {
      window.UIAccounts.adjustMiniPillFontSizes();
    }
  }

  togglePrivacyMode() {
    this.applyPrivacyMode(!this.isPrivacyMode);
    db.settings.put({ key: 'privacyMode', value: this.isPrivacyMode });
    showToast(this.isPrivacyMode ? 'Đã ẩn số tiền' : 'Đã hiện số tiền', 'info');
  }

  setupNavigation() {
    const handleNavClick = (link, e) => {
      e.preventDefault();
      const view = link.dataset.view;
      if (!view) return;

      // 1. Nếu đang ở sẵn view này:
      if (this.currentView === view) {
        if (view === 'settings') {
          this.handleSettingsTabClick();
          return;
        }
        if (view === 'budgets') {
          this.handleBudgetTabClick();
          return;
        }
        if (view === 'dashboard' || view === 'accounts') {
          this.scrollToTopView(view);
          return;
        }
        // Riêng trang thêm ghi chú ('new-transaction') và các trang khác không thêm cuộn
        return;
      }

      // 2. Chuyển sang view khác:
      if (view === 'budgets') {
        this.handleBudgetTabClick();
        return;
      }
      if (view === 'settings') {
        this.handleSettingsTabClick();
        return;
      }
      if (view === 'transactions') {
        this.txHistorySource = null;
        this.previousView = null;
        if (window.UITransactions && typeof window.UITransactions.resetAllFilters === 'function') {
          window.UITransactions.resetAllFilters(false);
        }
      }
      this.activePrimaryView = view; // Track which primary tab is active
      this.switchView(view);
    };

    // Desktop Nav Items
    document.querySelectorAll('.nav-item a').forEach(link => {
      link.addEventListener('click', (e) => handleNavClick(link, e));
      if (link.dataset.view === 'budgets') {
        link.addEventListener('dblclick', (e) => {
          e.preventDefault();
          this.lastBudgetTabClickTime = 0;
          if (window.UIBudgets && typeof window.UIBudgets.goToCurrentMonth === 'function') {
            window.UIBudgets.goToCurrentMonth();
          }
        });
      }
    });

    // Mobile Bottom Nav Items (Chỉ các tab điều hướng, KHÔNG bao gồm nút FAB thêm giao dịch)
    document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item:not(.fab-item)').forEach(link => {
      link.addEventListener('click', (e) => handleNavClick(link, e));
      if (link.dataset.view === 'budgets') {
        link.addEventListener('dblclick', (e) => {
          e.preventDefault();
          this.lastBudgetTabClickTime = 0;
          if (window.UIBudgets && typeof window.UIBudgets.goToCurrentMonth === 'function') {
            window.UIBudgets.goToCurrentMonth();
          }
        });
      }
    });

    // Global Action Buttons (Nút FAB thêm giao dịch)
    const fabBtn = document.getElementById('fab-add-tx');
    if (fabBtn) {
      fabBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleInputTabClick();
      });
      fabBtn.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.resetToDefaultTransactionForm();
      });
    }

    const headerAddBtn = document.getElementById('header-add-btn');
    if (headerAddBtn) {
      headerAddBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleInputTabClick();
      });
      headerAddBtn.addEventListener('dblclick', (e) => {
        e.preventDefault();
        this.resetToDefaultTransactionForm();
      });
    }

    const privacyBtn = document.getElementById('btn-privacy-toggle');
    if (privacyBtn) {
      privacyBtn.addEventListener('click', () => this.togglePrivacyMode());
    }
  }

  async resetToDefaultTransactionForm() {
    this.lastAddTabClickTime = 0;
    this.openedFromAccountMenu = false;
    this.previousView = null;

    if (this.currentView !== 'new-transaction') {
      this.switchView('new-transaction');
    }
    if (window.UITransactions) {
      window.UITransactions.clearDraft();
      window.UITransactions.isEditing = false;
      const idInput = document.getElementById('tx-id-input');
      if (idInput) idInput.value = '';
      await window.UITransactions.resetForm('expense');
      window.scrollTo(0, 0);
      const activeView = document.getElementById('view-new-transaction');
      if (activeView) activeView.scrollTop = 0;
      showToast('Đã mở lại trang ghi chép mặc định', 'success');
    }
  }

  scrollToTopView(viewId) {
    const el = document.getElementById(`view-${viewId}`);
    if (el) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  handleSettingsTabClick() {
    // Nếu đang ở sẵn trang Cài đặt:
    if (this.currentView === 'settings') {
      if (window.UISettings) {
        if (window.UISettings.currentSection) {
          // 1 chạm khi đang ở trang con -> Quay lại màn hình Cài Đặt chính
          window.UISettings.backToHub();
        } else {
          // 1 chạm khi đang ở màn hình Cài Đặt chính -> Cuộn mượt lên đầu trang
          this.scrollToTopView('settings');
        }
      }
      return;
    }

    // Chuyển vào trang Cài Đặt
    this.activePrimaryView = 'settings';
    this.switchView('settings');
  }

  handleBudgetTabClick() {
    const now = Date.now();
    const timeSinceLastClick = now - (this.lastBudgetTabClickTime || 0);

    // Nhấp nhanh 2 lần (< 400ms) vào tab Ngân sách -> về lại tháng hiện tại
    if (this.lastBudgetTabClickTime > 0 && timeSinceLastClick < 400) {
      this.lastBudgetTabClickTime = 0;
      if (window.UIBudgets && typeof window.UIBudgets.goToCurrentMonth === 'function') {
        window.UIBudgets.goToCurrentMonth();
      }
      return;
    }

    this.lastBudgetTabClickTime = now;

    // Nếu đang ở sẵn trang Ngân sách -> Cuộn mượt lên đầu trang
    if (this.currentView === 'budgets') {
      this.scrollToTopView('budgets');
      return;
    }

    // Nếu đang ở màn hình khác -> chuyển vào trang Ngân sách
    this.activePrimaryView = 'budgets';
    this.switchView('budgets');
  }

  async handleInputTabClick() {
    const now = Date.now();
    const timeSinceLastClick = now - (this.lastAddTabClickTime || 0);

    // Nhấp 2 lần nhanh (double-tap chuẩn, không cần chờ) -> Khôi phục form mặc định
    if (this.lastAddTabClickTime > 0 && timeSinceLastClick < 400) {
      await this.resetToDefaultTransactionForm();
      return;
    }

    this.lastAddTabClickTime = now;

    // Nếu đang ở màn hình khác -> chuyển vào trang nhập liệu
    if (this.currentView !== 'new-transaction') {
      if (window.UITransactions) {
        await window.UITransactions.openAddModal();
      } else {
        this.switchView('new-transaction');
      }
    }
  }

  openTransactionsFromDashboard() {
    this.txHistorySource = 'dashboard';
    this.previousView = 'dashboard';
    this.switchView('transactions');
  }

  updateBrandLogos(profile) {
    const brandLogos = [
      document.getElementById('header-brand-logo'),
      document.getElementById('tx-brand-logo')
    ];

    const isDropbox = profile && (profile.isDropbox || (profile.picture && profile.picture.includes('dropbox')) || (window.dropboxService && window.dropboxService.userProfile === profile));
    const hasAvatar = profile && (profile.picture || isDropbox);
    let avatarUrl = './assets/icons/icon.svg';

    if (isDropbox) {
      avatarUrl = profile.picture || './assets/icons/dropbox.svg';
    } else if (hasAvatar) {
      avatarUrl = profile.picture;
    }

    brandLogos.forEach(img => {
      if (!img) return;
      img.src = avatarUrl;
      img.classList.remove('is-app-logo', 'is-google-avatar', 'is-dropbox-avatar');
      if (isDropbox) {
        img.classList.add('is-dropbox-avatar');
        img.alt = profile.name || 'Dropbox User';
      } else if (hasAvatar) {
        img.classList.add('is-google-avatar');
        img.alt = profile.name || 'Google Avatar';
      } else {
        img.classList.add('is-app-logo');
        img.alt = 'Logo Sổ Thu Chi';
      }
    });
  }

  switchView(viewId, isBack = false) {
    if (!viewId) return;
    // Chuyển trang/tab thì reset đếm lần chạm làm mới
    this.lastAddTabClickTime = 0;
    if (viewId !== 'budgets') {
      this.lastBudgetTabClickTime = 0;
    }
    const primaryViews = ['dashboard', 'accounts', 'budgets', 'settings', 'transactions', 'debts', 'analytics'];
    const isPrimary = primaryViews.includes(viewId);
    const isTxPage = ['new-transaction', 'category-picker', 'borrow-select', 'account-form', 'account-provider', 'savings-form', 'accumulation-form', 'asset-form', 'loan-form', 'budget-form', 'budget-category-form', 'budget-cat-history'].includes(viewId);

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

    const mobileBottomNav = document.querySelector('.mobile-bottom-nav');
    if (mobileBottomNav) {
      const hideNavViews = ['budget-form', 'budget-category-form', 'category-picker', 'borrow-select', 'account-form', 'account-provider', 'savings-form', 'accumulation-form', 'asset-form', 'loan-form', 'budget-cat-history'];
      if (hideNavViews.includes(viewId)) {
        mobileBottomNav.style.setProperty('display', 'none', 'important');
      } else {
        mobileBottomNav.style.removeProperty('display');
      }
    }

    // 1. Lưu vị trí cuộn của view hiện tại trước khi chuyển view
    if (this.currentView) {
      const curViewEl = document.getElementById(`view-${this.currentView}`);
      this.scrollPositions[this.currentView] = (curViewEl && curViewEl.scrollTop !== undefined) ? curViewEl.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0);
      // Tự động lưu nháp giao dịch nếu đang rời khỏi trang ghi chép (chỉ khi chuyển tab bình thường, KHÔNG lưu khi trượt trở về / hủy)
      if (!isBack && this.currentView === 'new-transaction' && window.UITransactions) {
        window.UITransactions.saveDraft();
      }
    }

    // 2. Lưu previousView trước khi chuyển vào các trang con (danh mục, biểu mẫu tài khoản, ...)
    const formSubViews = ['category-picker', 'borrow-select', 'account-form', 'account-provider', 'savings-form', 'accumulation-form', 'asset-form', 'loan-form', 'budget-form', 'budget-category-form', 'budget-cat-history'];
    if (formSubViews.includes(viewId) && !formSubViews.includes(this.currentView)) {
      this.previousView = this.currentView;
    } else if (viewId === 'transactions') {
      if (!isBack) {
        if (!this.txHistorySource) {
          this.txHistorySource = (this.currentView && this.currentView !== 'transactions') ? this.currentView : 'dashboard';
        }
        this.previousView = this.txHistorySource;
      }
    } else if (viewId === 'new-transaction') {
      // Tab Ghi Chép (new-transaction):
      // - Nếu mở từ menu 3 chấm của tài khoản (openedFromAccountMenu): previousView = currentView
      // - Nếu đang ở chế độ SỬA giao dịch (txId hoặc editSourceView): previousView = editSourceView || currentView || 'transactions'
      // - Nếu là thêm mới bình thường: previousView = null (màn hình cố định)
      const txId = document.getElementById('tx-id-input')?.value;
      if (this.openedFromAccountMenu) {
        this.previousView = this.currentView;
      } else if (txId || this.editSourceView) {
        this.previousView = this.editSourceView || (this.currentView !== 'new-transaction' ? this.currentView : 'transactions');
      } else {
        this.previousView = null;
        this.editSourceView = null;
      }
    }

    // Khi rời khỏi trang lịch sử chi tiết hạng mục ngân sách sang view khác (ngoại trừ form ghi chép new-transaction)
    if (viewId !== 'budget-cat-history' && viewId !== 'new-transaction') {
      if (window.UIBudgets) {
        window.UIBudgets.currentCatHistoryId = null;
      }
    }

    const previousViewId = this.currentView;
    this.currentView = viewId;

    // Khi rời khỏi trang lịch sử ghi chép -> reset toàn bộ bộ lọc về mặc định
    if (previousViewId === 'transactions' && viewId !== 'transactions') {
      if (window.UITransactions && typeof window.UITransactions.resetAllFilters === 'function') {
        window.UITransactions.resetAllFilters(false);
      }
    }

    // Toggle body class for view-specific styles
    document.body.classList.toggle('view-new-transaction', isTxPage);
    document.body.classList.toggle('view-category-picker', viewId === 'category-picker');
    document.body.classList.toggle('view-borrow-select', viewId === 'borrow-select');
    document.body.classList.toggle('view-account-form', viewId === 'account-form');
    document.body.classList.toggle('view-account-provider', viewId === 'account-provider');


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
      if (page.classList.contains('tx-page-view') || page.id === 'view-transactions') {
        page.style.transform = '';
        page.style.opacity = '';
        page.style.transition = '';
      }
    });

    // Sync clearable note/input X buttons
    this.syncClearableInputs();

    // Update Header title
    const titles = {
      dashboard: 'Tổng Quan Tài Chính',
      transactions: 'Sổ Giao Dịch',
      debts: 'Sổ Vay Nợ',
      accounts: 'Tài Khoản',
      budgets: 'Hạn Mức Ngân Sách',
      analytics: 'Báo Cáo & Phân Tích',
      settings: 'Cài Đặt & Đồng Bộ',
      'new-transaction': 'Ghi Chép Mới',
      'category-picker': 'Chọn Danh Mục',
      'borrow-select': 'Chọn Người Cho Vay',
      'account-form': 'Thông Tin Tài Khoản',
      'account-provider': 'Chọn Ngân Hàng & Ví',
      'savings-form': 'Sổ Tiết Kiệm',
      'loan-form': 'Sổ Vay Ngân Hàng',
      'accumulation-form': 'Sổ Tích Lũy',
      'asset-form': 'Quản Lý Tài Sản',
      'budget-form': 'Thiết Lập Ngân Sách',
      'budget-category-form': 'Hạn Mức Danh Mục',
      'budget-cat-history': 'Lịch Sử Chi Tiêu'
    };
    const titleEl = document.getElementById('header-page-title');
    const appHeaderCenter = document.getElementById('app-header-center');
    const txHeaderCenter = document.getElementById('tx-header-center');
    const txSearchBtn = document.getElementById('tx-header-search-btn');
    const txSearchBar = document.getElementById('tx-header-search-bar');
    const privacyBtn = document.getElementById('btn-privacy-toggle');
    const txHistoryBackBtn = document.getElementById('tx-history-back-btn');
    const brandLogo = document.getElementById('header-brand-logo');

    if (viewId === 'transactions') {
      if (titleEl) titleEl.style.display = 'none';
      if (appHeaderCenter) appHeaderCenter.style.display = 'none';
      if (txHeaderCenter) txHeaderCenter.style.display = 'flex';
      if (txSearchBtn) txSearchBtn.style.display = 'inline-flex';
      if (txSearchBar) txSearchBar.style.display = 'none';
      // Xóa và vô hiệu hóa nút hiển thị/ẩn số tiền cho mục lịch sử thu chi
      if (privacyBtn) privacyBtn.style.display = 'none';

      const hasBack = viewId === 'transactions' ? true : !!(this.txHistorySource || (this.previousView && this.previousView !== 'transactions'));
      if (txHistoryBackBtn) txHistoryBackBtn.style.display = hasBack ? 'inline-flex' : 'none';
      const brandLogoBtn = document.getElementById('header-brand-logo-btn') || brandLogo;
      if (brandLogoBtn) brandLogoBtn.style.display = hasBack ? 'none' : 'inline-flex';
      const headerVaultPill = document.getElementById('header-vault-pill');
      if (headerVaultPill && hasBack) headerVaultPill.style.display = 'none';

      if (window.UITransactions) {
        window.UITransactions.updateHeaderAccountDisplay();
        window.UITransactions.initTimeFilter();
      }
    } else {
      if (titleEl) {
        titleEl.style.display = '';
        titleEl.textContent = titles[viewId] || 'Sổ Thu Chi';
      }
      if (appHeaderCenter) appHeaderCenter.style.display = 'flex';
      if (txHistoryBackBtn) txHistoryBackBtn.style.display = 'none';
      const brandLogoBtn = document.getElementById('header-brand-logo-btn') || brandLogo;
      if (brandLogoBtn) brandLogoBtn.style.display = 'inline-flex';
      if (window.SyncCoordinator && typeof window.SyncCoordinator.updateVaultUI === 'function') {
        window.SyncCoordinator.updateVaultUI();
      }
      if (window.UITransactions) {
        if (typeof window.UITransactions.closeHeaderAccountDropdown === 'function') {
          window.UITransactions.closeHeaderAccountDropdown();
        }
        if (typeof window.UITransactions.closeSearch === 'function') {
          window.UITransactions.closeSearch();
        }
      }
      if (txHeaderCenter) txHeaderCenter.style.display = 'none';
      if (txSearchBtn) txSearchBtn.style.display = 'none';
      if (txSearchBar) txSearchBar.style.display = 'none';
      if (privacyBtn && !isTxPage) privacyBtn.style.display = '';
    }

    // Toggle header center & settings button for Budgets (đè tiêu đề Hạn mức ngân sách, căn giữa tháng và chú thích)
    const budgetHeaderCenter = document.getElementById('budget-header-center');
    const budgetSettingsBtn = document.getElementById('btn-budget-settings');
    if (viewId === 'budgets') {
      if (titleEl) titleEl.style.display = 'none';
      if (appHeaderCenter) appHeaderCenter.style.display = 'none';
      if (brandLogo) brandLogo.style.display = '';
      if (budgetHeaderCenter) budgetHeaderCenter.style.display = 'flex';
      if (privacyBtn) privacyBtn.style.display = 'none';
      if (budgetSettingsBtn) budgetSettingsBtn.style.display = 'inline-flex';
      if (window.UIBudgets && typeof window.UIBudgets.updateMonthDisplay === 'function') {
        window.UIBudgets.updateMonthDisplay();
      }
    } else {
      if (budgetHeaderCenter) budgetHeaderCenter.style.display = 'none';
      if (budgetSettingsBtn) budgetSettingsBtn.style.display = 'none';
      if (privacyBtn && !isTxPage) privacyBtn.style.display = '';
    }

    if (viewId === 'new-transaction') {
      const backBtn = document.getElementById('tx-header-back-btn');
      const txId = document.getElementById('tx-id-input')?.value;
      const canBack = !!(txId || (this.openedFromAccountMenu && this.previousView));
      if (backBtn) backBtn.style.display = canBack ? 'inline-flex' : 'none';
    }

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
      if (window.UIBudgets) window.UIBudgets.render();
    } else if (viewId === 'new-transaction') {
      // Không chạy UIBudgets.render() ở đây để tránh nghẽn luồng nhập liệu
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
      const savedY = this.scrollPositions[viewId] || 0;
      if (activeView) {
        activeView.scrollTop = savedY;
        requestAnimationFrame(() => {
          activeView.scrollTop = savedY;
        });
      }
      window.scrollTo(0, 0);
    } else if (!isTxPage) {
      if (activeView) activeView.scrollTop = 0;
      window.scrollTo(0, 0);
    } else {
      if (activeView) activeView.scrollTop = 0;
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

    // Settings Sub-page → back to Settings Hub
    if (this.currentView === 'settings') {
      if (window.UISettings && window.UISettings.currentSection) {
        window.UISettings.backToHub();
        return;
      }
    }

    // Sub-pages: template-editor → template-manager (or new-transaction)
    if (this.currentView === 'template-editor') {
      const prev = (window.UITransactions && window.UITransactions._templateEditorPrevView) || 'template-manager';
      this.switchView(prev, true);
      if (prev === 'new-transaction') {
        setTimeout(() => {
          if (window.UITransactions) {
            window.UITransactions.openKeypad('amount');
            window.UITransactions.toggleKeypadTemplates(true);
          }
        }, 120);
      }
      return;
    }

    if (this.currentView === 'category-picker') {
      if (window.UITransactions && window.UITransactions._categoryPickerMode === 'template') {
        window.UITransactions._categoryPickerMode = null;
        this.switchView('template-editor', true);
        return;
      }
      this.switchView('new-transaction', true);
      return;
    }

    // Sub-pages (category-picker, borrow-select, template-manager) → back to new-transaction
    if (this.currentView === 'template-manager') {
      this.switchView('new-transaction', true);
      // Khi vuốt về thì về lại ngay menu Ghi chép mẫu đang mở đó lại nha
      setTimeout(() => {
        if (window.UITransactions) {
          window.UITransactions.openKeypad('amount');
          window.UITransactions.toggleKeypadTemplates(true);
        }
      }, 120);
      return;
    }

    if (this.currentView === 'category-picker' || this.currentView === 'borrow-select') {
      this.switchView('new-transaction', true);
      return;
    }

    if (this.currentView === 'account-provider') {
      const target = (window.UIAccounts && window.UIAccounts._pickerTarget);
      if (window.UIAccounts) window.UIAccounts._pickerTarget = null;
      if (target === 'saving') {
        this.switchView('savings-form', true);
      } else if (target === 'loan') {
        this.switchView('loan-form', true);
      } else {
        this.switchView('account-form', true);
      }
      return;
    }

    if (this.currentView === 'account-form') {
      this.switchView(this.previousView || 'accounts', true);
      return;
    }

    // Các trang con của tab Tài khoản -> quay lại danh sách tài khoản
    if (['savings-form', 'accumulation-form', 'asset-form', 'loan-form'].includes(this.currentView)) {
      this.switchView('accounts', true);
      return;
    }

    if (this.currentView === 'budget-form' || this.currentView === 'budget-category-form' || this.currentView === 'budget-cat-history') {
      if (this.currentView === 'budget-cat-history' && window.UIBudgets) {
        window.UIBudgets.currentCatHistoryId = null;
      }
      this.switchView('budgets', true);
      return;
    }

    // transactions (Lịch sử ghi chép) -> quay lại view đã mở nó (new-transaction hoặc accounts)
    if (this.currentView === 'transactions') {
      const target = this.txHistorySource || (this.previousView && this.previousView !== 'transactions' ? this.previousView : 'dashboard');
      this.txHistorySource = null;
      this.previousView = null;

      // Khi thoát khỏi lịch sử ghi chép, reset toàn bộ bộ lọc về mặc định (Tất cả, Không tài khoản, Không từ khóa, Tháng này)
      if (window.UITransactions && typeof window.UITransactions.resetAllFilters === 'function') {
        window.UITransactions.resetAllFilters(false);
      }

      this.switchView(target, true);
      return;
    }

    // new-transaction → CHỈ trở về khi đang sửa giao dịch HOẶC khi mở từ menu 3 chấm của tài khoản
    if (this.currentView === 'new-transaction') {
      const txId = document.getElementById('tx-id-input')?.value;
      const openedFromMenu = this.openedFromAccountMenu;
      // Nếu đang sửa giao dịch, đích quay về là view nguồn (editSourceView / previousView hoặc mặc định 'transactions')
      const target = this.openedFromAccountMenu 
        ? (this.previousView || 'accounts') 
        : (txId ? (this.editSourceView || this.previousView || 'transactions') : null);

      if (openedFromMenu || txId) {
        // DỌN DẸP & RESET TOÀN BỘ FORM VỀ MẶC ĐỊNH
        if (window.UITransactions) {
          window.UITransactions.setEditMode(false);
          const idInput = document.getElementById('tx-id-input');
          if (idInput) idInput.value = '';
          window.UITransactions.clearDraft();
          window.UITransactions.resetForm('expense');
        }

        this.openedFromAccountMenu = false;
        this.previousView = null;
        this.editSourceView = null;

        if (target && target !== 'new-transaction') {
          this.switchView(target, true);
          return;
        }
      }
      // Ở chế độ thêm mới thông thường: trang nhập liệu CỐ ĐỊNH, không bao giờ thoát về tài khoản hay tổng quan!
      return;
    }
  }

  /**
   * Kiểm tra xem màn hình hiện tại có cho phép vuốt/bấm trở về hay không
   */
  canGoBack() {
    // 1. Cài đặt: Chỉ cho phép trở về khi đang ở màn hình con (sub-panel)
    if (this.currentView === 'settings') {
      return !!(window.UISettings && window.UISettings.currentSection);
    }

    // 2. Ghi chép: Chỉ cho phép trở về khi đang SỬA giao dịch hoặc mở từ menu tài khoản
    if (this.currentView === 'new-transaction') {
      const isEditing = !!document.getElementById('tx-id-input')?.value;
      return isEditing || (this.openedFromAccountMenu && !!this.previousView);
    }

    // 3. Các màn hình con/biểu mẫu khác luôn hỗ trợ quay lại
    const backEligibleViews = [
      'transactions',
      'category-picker',
      'template-manager',
      'template-editor',
      'borrow-select',
      'account-form',
      'account-provider',
      'savings-form',
      'accumulation-form',
      'asset-form',
      'loan-form',
      'budget-form',
      'budget-category-form',
      'budget-cat-history'
    ];
    return backEligibleViews.includes(this.currentView);
  }

  setupPopstateListener() {
    // Since we use replaceState for all views, popstate should NOT fire during normal navigation.
    // This listener only handles the Android hardware back button press.
    window.addEventListener('popstate', (e) => {
      if (this.isBackTransitioning) {
        window.history.replaceState({ view: this.currentView }, '', `#${this.currentView}`);
        return;
      }

      window.history.replaceState({ view: this.currentView }, '', `#${this.currentView}`);
      if (this.canGoBack()) {
        this.goBack();
      }
    });
  }

  setupSwipeToBack() {
    // Ngưỡng mép trái màn hình: CHỈ nhận diện khi ngón tay chạm sát mép trái (<= 28px)
    // Giúp loại bỏ 100% tình trạng phản hồi nhầm khi cuộn trang hoặc thao tác trên màn hình
    const EDGE_SWIPE_MAX_START_X = 28;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let deltaX = 0;
    let deltaY = 0;
    let startTime = 0;
    let isSwiping = false;
    let canSwipe = false;
    let gestureDirection = null; // null | 'horizontal' | 'vertical'
    let activePage = null;
    let justCompletedSwipe = false;

    document.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      currentX = startX;
      deltaX = 0;
      deltaY = 0;
      startTime = Date.now();
      isSwiping = false;
      canSwipe = false;
      gestureDirection = null;

      // 1. KIỂM TRA SÁT MÉP TRÁI: Nếu không chạm sát mép (<= 28px), THOÁT NGAY!
      if (startX > EDGE_SWIPE_MAX_START_X) {
        return;
      }

      // 2. Không cho phép vuốt trang nếu đang có Modal/Dialog/Keypad mở
      if (document.querySelector('.modal-overlay.open, #modal-keypad.open, .custom-dialog-overlay.open')) {
        return;
      }

      // 3. Kiểm tra xem trang hiện tại có hỗ trợ quay lại (Back) hay không
      if (!this.canGoBack()) {
        return;
      }

      // 4. Lấy trang đang hoạt động
      activePage = document.querySelector('.page-view.active');
      if (!activePage) return;

      // Xử lý riêng cho trang transactions nếu chưa có view nguồn
      if (this.currentView === 'transactions') {
        if (!this.txHistorySource && (!this.previousView || this.previousView === 'transactions')) {
          this.txHistorySource = 'dashboard';
          this.previousView = 'dashboard';
        }
      }

      // 5. Bỏ qua nếu chạm vào control tương tác (input, button, filter slider...)
      const el = (e.target && e.target.nodeType === 1) ? e.target : e.target?.parentElement;
      if (el) {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || 
            el.closest('input, select, textarea, button, .btn, .filter-bar, .tx-type-filter-bar, .accounts-filter-bar, .admin-pill-bar, input[type="range"]')) {
          return;
        }
      }

      canSwipe = true;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!canSwipe || gestureDirection === 'vertical' || e.touches.length !== 1) return;
      if (!activePage) return;

      currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      deltaX = currentX - startX;
      deltaY = currentY - startY;

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Ngăn chặn vuốt lùi về phía bên trái (chỉ nhận cử chỉ kéo sang phải)
      if (deltaX < -4) {
        canSwipe = false;
        gestureDirection = 'vertical';
        return;
      }

      // Khóa hướng cử chỉ (Gesture Lock):
      // Nếu cử chỉ có xu hướng cuộn dọc ngay từ đầu -> HỦY BỎ ngay lập tức để không cản trở cuộn trang
      if (gestureDirection === null) {
        if (absY >= 8 && absY >= absX) {
          canSwipe = false;
          gestureDirection = 'vertical';
          return;
        }

        // Chỉ kích hoạt chế độ vuốt trở về khi chuyển động ngang sang phải rõ rệt
        if (deltaX >= 10 && deltaX > absY * 1.5) {
          gestureDirection = 'horizontal';
          isSwiping = true;
          activePage.classList.add('swiping');
        }
      }

      if (isSwiping) {
        // Ngăn chặn cuộn trang dọc khi đang trong tiến trình vuốt ngang trở về
        if (e.cancelable) {
          e.preventDefault();
        }
        const translateX = Math.max(0, deltaX);
        activePage.style.transform = `translateX(${translateX}px)`;
        const progress = Math.min(translateX / (window.innerWidth * 0.75), 1);
        activePage.style.opacity = `${1 - progress * 0.25}`;
      }
    }, { passive: false });

    const handleTouchEnd = () => {
      if (!isSwiping || !activePage) {
        canSwipe = false;
        gestureDirection = null;
        isSwiping = false;
        return;
      }

      isSwiping = false;
      canSwipe = false;
      gestureDirection = null;
      activePage.classList.remove('swiping');

      const duration = Date.now() - startTime;
      const velocity = deltaX / Math.max(duration, 1);
      const threshold = Math.min(window.innerWidth * 0.3, 110);
      const swipedDeltaX = deltaX;
      const swipingPage = activePage;

      // Đánh dấu để chặn click nhầm lên các phần tử bên dưới ngay sau khi nhả tay
      justCompletedSwipe = true;
      setTimeout(() => {
        justCompletedSwipe = false;
        deltaX = 0;
      }, 200);

      // Đạt ngưỡng kéo hoặc hất nhanh (flick) sang phải
      if (swipedDeltaX > threshold || (swipedDeltaX > 45 && velocity > 0.35)) {
        swipingPage.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.2s ease';
        swipingPage.style.transform = 'translateX(100%)';
        swipingPage.style.opacity = '0';
        setTimeout(() => {
          swipingPage.style.transform = '';
          swipingPage.style.opacity = '';
          swipingPage.style.transition = '';
          this.goBack();
        }, 220);
      } else {
        // Trượt trở về vị trí cũ nếu chưa đủ ngưỡng
        swipingPage.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.2s ease';
        swipingPage.style.transform = 'translateX(0)';
        swipingPage.style.opacity = '1';
        setTimeout(() => {
          swipingPage.style.transform = '';
          swipingPage.style.opacity = '';
          swipingPage.style.transition = '';
        }, 200);
      }
    };

    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    // Ngăn chặn click nhầm vào các nút / thẻ khi vừa thực hiện cử chỉ vuốt
    document.addEventListener('click', (e) => {
      if (justCompletedSwipe) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
  }

  /* ==================== UNIVERSAL CLEARABLE INPUTS (Nút X xóa nhanh) ==================== */
  setupClearableInputs() {
    const attachWrapper = (wrapper) => {
      const input = wrapper.querySelector('input');
      const btn = wrapper.querySelector('.btn-clear-input');
      if (!input || !btn || input._clearableBound) return;
      input._clearableBound = true;

      const updateBtn = () => {
        const val = input.value ? input.value.trim() : '';
        btn.style.display = val.length > 0 ? 'inline-flex' : 'none';
      };

      input.addEventListener('input', updateBtn);
      input.addEventListener('focus', updateBtn);
      input.addEventListener('change', updateBtn);
      input.addEventListener('keyup', updateBtn);

      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault(); // Prevents input from losing focus / mobile blur
      });

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        input.value = '';
        updateBtn();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.focus();
      });

      updateBtn();
    };

    document.querySelectorAll('.input-clearable-wrapper').forEach(attachWrapper);

    if (!this._clearableGlobalBound) {
      this._clearableGlobalBound = true;
      document.addEventListener('focusin', (e) => {
        if (e.target && e.target.matches && e.target.matches('.input-clearable-wrapper input')) {
          const wrapper = e.target.closest('.input-clearable-wrapper');
          const btn = wrapper?.querySelector('.btn-clear-input');
          if (btn) {
            const val = e.target.value ? e.target.value.trim() : '';
            btn.style.display = val.length > 0 ? 'inline-flex' : 'none';
          }
        }
      });
    }
  }

  syncClearableInputs() {
    this.setupClearableInputs();
    document.querySelectorAll('.input-clearable-wrapper').forEach(wrapper => {
      const input = wrapper.querySelector('input');
      const btn = wrapper.querySelector('.btn-clear-input');
      if (input && btn) {
        const val = input.value ? input.value.trim() : '';
        btn.style.display = val.length > 0 ? 'inline-flex' : 'none';
      }
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
        // Close any open modal / popup / sheet
        const openModal = document.querySelector('.modal-overlay.open, .keypad-popup-overlay.open, .custom-cal-overlay.open');
        if (openModal) {
          this.dismissModal(openModal);
        }
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

    window.addEventListener('sync-success', async (e) => {
      if (dot) dot.className = 'status-dot';
      if (text) text.textContent = 'Đã đồng bộ Drive';
      const dataChanged = e.detail?.dataChanged !== false;
      if (dataChanged) {
        if (window.UIBudgets && typeof window.UIBudgets.init === 'function') {
          await window.UIBudgets.init();
        }
        if (typeof window.recalculateAccountBalances === 'function') {
          await window.recalculateAccountBalances();
        }
        await this.refreshAll();
      }
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
    if (window.UITransactions && typeof window.UITransactions.invalidateCategoriesCache === 'function') {
      window.UITransactions.invalidateCategoriesCache();
    }
    await this.refreshNetWorth();
    await window.UITransactions.render();
    await window.UIDebts.render();
    await window.UIAccounts.render();
    await window.UIBudgets.render();
    await window.UIAnalytics.render();
    if (window.SyncCoordinator && typeof window.SyncCoordinator.updateVaultUI === 'function') {
      window.SyncCoordinator.updateVaultUI();
    }
    if (window.lucide) lucide.createIcons();
  }

  handleUrlActions() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const tab = params.get('tab');
    const view = params.get('view') || tab;
    const section = params.get('section');
    const hash = window.location.hash ? window.location.hash.replace('#', '') : null;

    if (view === 'settings' || hash === 'settings' || hash === 'server-admin' || section === 'server-admin' || params.get('admin') === '1') {
      this.switchView('settings');
      const targetSec = section || (hash === 'server-admin' ? 'server-admin' : (params.get('admin') === '1' ? 'server-admin' : null));
      if (targetSec && window.UISettings) {
        setTimeout(() => window.UISettings.openSection(targetSec), 120);
      }
    } else if (tab) {
      this.switchView(tab);
    } else if (hash && ['dashboard', 'transactions', 'debts', 'accounts', 'budgets', 'analytics', 'settings'].includes(hash)) {
      this.switchView(hash);
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
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
          .then(reg => {
            console.log('PWA ServiceWorker registered with scope:', reg.scope);
            try { reg.update(); } catch (e) {}
          })
          .catch(err => {
            console.warn('PWA ServiceWorker registration failed:', err);
          });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!refreshing && navigator.onLine) {
            refreshing = true;
            console.log('[ServiceWorker] Controller updated, refreshing page');
            window.location.reload();
          }
        });
      });
    }
  }

    /**
   * Universal Modal / Popup / Bottom Sheet Dismissal
   * Safely closes any modal, action sheet, keypad, or calendar across the entire app
   */
  dismissModal(overlay) {
    if (!overlay) return;
    const id = overlay.id;
    try {
      switch (id) {
        case 'modal-custom-dialog':
          if (window.CustomDialog) window.CustomDialog._close();
          break;
        case 'modal-source-account-picker':
          if (window.UIAccounts) window.UIAccounts.closeSourceAccountPicker();
          break;
        case 'modal-server-vault-history':
          if (window.UISettings) window.UISettings.closeVaultHistoryModal();
          break;
        case 'modal-server-vault-share':
          if (window.UISettings) window.UISettings.closeVaultShareModal();
          break;
        case 'modal-account-actions':
          if (window.UIAccounts) window.UIAccounts.closeActionSheet();
          break;
        case 'modal-account-statement':
          if (window.UIAccounts) window.UIAccounts.closeStatementModal();
          break;
        case 'modal-account-create-type':
          if (window.UIAccounts) window.UIAccounts.closeCreateTypeSheet();
          break;
        case 'modal-asset-type-picker':
          if (window.UIAccounts) window.UIAccounts.closeAssetTypePicker();
          break;
        case 'modal-settle-saving':
          if (window.UIAccounts) window.UIAccounts.closeSettleSavingModal();
          break;
        case 'modal-pay-loan':
          if (window.UIAccounts) window.UIAccounts.closePayLoanModal();
          break;
        case 'modal-deposit-accumulation':
          if (window.UIAccounts) window.UIAccounts.closeDepositAccModal();
          break;
        case 'modal-liquidate-asset':
          if (window.UIAccounts) window.UIAccounts.closeLiquidateModal();
          break;
        case 'modal-item-actions':
          if (window.UIAccounts) window.UIAccounts.closeItemActionSheet();
          break;
        case 'modal-category-manager':
          if (window.UITransactions) window.UITransactions.closeCategoryManager();
          break;
        case 'modal-debt':
          if (window.UIDebts) window.UIDebts.closeModal();
          break;
        case 'modal-debt-payment':
          if (window.UIDebts) window.UIDebts.closePaymentModal();
          break;
        case 'modal-budget':
          if (window.UIBudgets) window.UIBudgets.closeModal();
          break;
        case 'modal-keypad':
          if (window.UITransactions) window.UITransactions.closeKeypad();
          break;
        case 'modal-custom-calendar':
          if (window.UICalendar) window.UICalendar.close();
          break;
        default:
          overlay.classList.remove('open');
          break;
      }
    } catch (err) {
      console.warn('Error during modal dismissal:', err);
    }
    overlay.classList.remove('open');
  }

  /**
   * Tap / Click outside popup whitespace to dismiss
   * Applies to ALL modals, bottom sheets, keypad, and calendars app-wide.
   */
  setupModalBackdropDismiss() {
    // 1. Direct overlay listeners
    const overlays = document.querySelectorAll('.modal-overlay, .keypad-popup-overlay, .custom-cal-overlay');
    overlays.forEach(overlay => {
      let isPointerDownOutside = false;

      overlay.addEventListener('pointerdown', (e) => {
        const inside = e.target.closest('.modal-dialog, .keypad-popup-sheet, .custom-cal-container');
        isPointerDownOutside = !inside;
      });

      overlay.addEventListener('click', (e) => {
        const inside = e.target.closest('.modal-dialog, .keypad-popup-sheet, .custom-cal-container');
        if (isPointerDownOutside && !inside) {
          e.preventDefault();
          e.stopPropagation();
          this.dismissModal(overlay);
        }
        isPointerDownOutside = false;
      });
    });

    // 2. Global document listener fallback for dynamically created overlays or edge touch events
    let globalOutsideTarget = null;
    document.addEventListener('pointerdown', (e) => {
      const openModal = document.querySelector('.modal-overlay.open, .keypad-popup-overlay.open, .custom-cal-overlay.open');
      if (openModal) {
        const inside = e.target.closest('.modal-dialog, .keypad-popup-sheet, .custom-cal-container');
        if (!inside && (e.target === openModal || openModal.contains(e.target))) {
          globalOutsideTarget = openModal;
        } else {
          globalOutsideTarget = null;
        }
      } else {
        globalOutsideTarget = null;
      }
    }, { passive: true });

    document.addEventListener('click', (e) => {
      if (globalOutsideTarget && globalOutsideTarget.classList.contains('open')) {
        const inside = e.target.closest('.modal-dialog, .keypad-popup-sheet, .custom-cal-container');
        if (!inside) {
          this.dismissModal(globalOutsideTarget);
        }
      }
      globalOutsideTarget = null;
    });
  }

  setupModalSwipeGestures() {
    const EDGE_SWIPE_MAX_START_X = 28;

    // Hỗ trợ cử chỉ vuốt trên Modal/Action Sheet:
    // - Vuốt sang phải để đóng/trở về: CHỈ khi vuốt sát mép màn hình bên trái (<= 28px)
    // - Vuốt xuống để đóng: chỉ dành cho Action Sheet / Bottom Sheet khi kéo từ đỉnh
    document.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const el = (e.target && e.target.nodeType === 1) ? e.target : e.target?.parentElement;
      const overlay = el ? el.closest('.modal-overlay.open') : document.querySelector('.modal-overlay.open');
      if (!overlay) return;
      const dialog = overlay.querySelector('.modal-dialog');
      if (!dialog) return;

      if (el) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.closest('input, select, textarea, button, .btn')) {
          return;
        }
      }

      const touch = e.touches[0];
      overlay._swipeStartX = touch.clientX;
      overlay._swipeStartY = touch.clientY;
      overlay._swipeTouching = true;
      overlay._swipeDirection = null;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      const overlay = document.querySelector('.modal-overlay.open');
      if (!overlay || !overlay._swipeTouching) return;
      if (e.touches.length !== 1) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const deltaX = currentX - overlay._swipeStartX;
      const deltaY = currentY - overlay._swipeStartY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (!overlay._swipeDirection) {
        if (absY >= 8 && absY >= absX) {
          overlay._swipeDirection = 'vertical';
        } else if (absX >= 8 && absX > absY) {
          overlay._swipeDirection = 'horizontal';
        }
      }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      const overlay = document.querySelector('.modal-overlay.open');
      if (!overlay || !overlay._swipeTouching) return;
      overlay._swipeTouching = false;

      if (!e.changedTouches || e.changedTouches.length === 0) return;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const deltaX = endX - overlay._swipeStartX;
      const deltaY = endY - overlay._swipeStartY;
      const startX = overlay._swipeStartX;

      // Vuốt xuống để đóng: chỉ khi cuộn đang ở trên cùng
      const el = (e.target && e.target.nodeType === 1) ? e.target : e.target?.parentElement;
      const scrollParent = el ? el.closest('.modal-body, .action-sheet-body, #statement-history-list') : null;
      const isAtTop = !scrollParent || scrollParent.scrollTop <= 2;
      const isSwipeDown = isAtTop && deltaY > 70 && deltaY > Math.abs(deltaX) * 1.5;

      // Vuốt sang phải để đóng (trở về): CHỈ hoạt động khi vuốt sát mép màn hình bên trái (<= 28px)
      const isEdgeSwipeRight = startX <= EDGE_SWIPE_MAX_START_X && deltaX > 75 && deltaX > Math.abs(deltaY) * 1.5;

      if (isSwipeDown || isEdgeSwipeRight) {
        this.dismissModal(overlay);
      }
    }, { passive: true });
  }

}


// Instantiate and launch App on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});

// iOS Safari / Mobile PWA Viewport and Touch Misalignment Fixes
document.addEventListener('touchstart', () => {}, { passive: true });

// Ngăn phím Enter / "Xong" trên bàn phím ảo tự động gửi và lưu form khi đang nhập liệu vào input
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' || e.keyCode === 13) {
    const target = e.target;
    if (target && target.tagName === 'INPUT' && !['submit', 'button', 'checkbox', 'radio'].includes(target.type)) {
      e.preventDefault();
      target.blur(); // Chỉ đóng bàn phím mềm trên mobile, không tự động lưu form
    }
  }
}, true);

// Hỗ trợ kéo ngang mượt mà bằng chuột cho các thanh Tab/Pill trên PC (như accounts-filter-bar, admin-pill-bar)
function enableHorizontalDragScroll(selector) {
  document.querySelectorAll(selector).forEach(el => {
    if (!el || el._dragScrollBound) return;
    el._dragScrollBound = true;
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let hasDragged = false;

    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDown = true;
      hasDragged = false;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      el.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => {
      if (isDown) {
        isDown = false;
        if (el) el.style.cursor = '';
      }
    });

    el.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.5;
      if (Math.abs(walk) > 4) {
        hasDragged = true;
      }
      el.scrollLeft = scrollLeft - walk;
    });

    el.addEventListener('click', (e) => {
      if (hasDragged) {
        e.stopPropagation();
        e.preventDefault();
        hasDragged = false;
      }
    }, true);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  enableHorizontalDragScroll('.accounts-filter-bar, .admin-pill-bar, .tx-type-filter-bar');
});
