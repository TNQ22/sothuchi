/**
 * SyncCoordinator - Trung tâm điều phối đồng bộ hợp nhất
 * Hỗ trợ: Dedicated Sync Server (Self-Hosted), Google Drive, Dropbox, Local Folder
 * Quản lý trạng thái, Micro Popover và kích hoạt đồng bộ thông minh
 */
class SyncCoordinator {
  constructor() {
    this.adapters = new Map();
    this.status = 'idle'; // 'idle' | 'syncing' | 'synced' | 'pending' | 'error'
    this.lastSyncTime = null;
    this.lastSyncTarget = null;
    this.lastError = null;
    this.debounceTimer = null;
    this.isPopoverOpen = false;

    this.init();
  }

  async init() {
    // Tải cấu hình và lịch sử đồng bộ gần nhất từ database
    try {
      if (window.db && window.db.settings) {
        const lastTime = await db.settings.get('lastSyncSuccessTime');
        const lastTarget = await db.settings.get('lastSyncTargetName');
        if (lastTime && lastTime.value) {
          this.lastSyncTime = lastTime.value;
          this.lastSyncTarget = lastTarget ? lastTarget.value : 'Đám mây';
          this.status = 'synced';
        }
      }
    } catch (e) {
      console.warn('SyncCoordinator init error:', e);
    }

    this.setupEventListeners();
    this.updateUI();
  }

  registerAdapter(name, adapter) {
    this.adapters.set(name, adapter);
  }

  setupEventListeners() {
    // Lắng nghe sự kiện bắt đầu đồng bộ
    window.addEventListener('sync-start', (e) => {
      this.setStatus('syncing', e.detail?.target || 'Đám mây');
    });

    // Lắng nghe sự kiện đồng bộ thành công
    window.addEventListener('sync-success', (e) => {
      this.lastSyncTime = new Date().toISOString();
      this.lastSyncTarget = e.detail?.target || this.lastSyncTarget || 'Đám mây';
      this.lastError = null;
      this.setStatus('synced', this.lastSyncTarget);

      // Lưu lại vào DB để giữ trạng thái sau khi F5/tải lại trang
      if (window.db && window.db.settings) {
        db.settings.put({ key: 'lastSyncSuccessTime', value: this.lastSyncTime });
        db.settings.put({ key: 'lastSyncTargetName', value: this.lastSyncTarget });
      }
    });

    // Lắng nghe sự kiện đồng bộ thất bại
    window.addEventListener('sync-error', (e) => {
      this.lastError = e.detail?.error || 'Không thể kết nối đến máy chủ sao lưu';
      this.setStatus('error', e.detail?.target || 'Đám mây');
    });

    // Lắng nghe click bên ngoài để đóng popover
    document.addEventListener('click', (e) => {
      if (!this.isPopoverOpen) return;
      const popover = document.getElementById('sync-status-popover');
      const headerBtn = document.getElementById('header-brand-logo-btn');
      const txBtn = document.getElementById('tx-brand-logo-btn');
      const syncBtn = document.getElementById('header-sync-btn');
      
      if (popover && !popover.contains(e.target) && 
          (!headerBtn || !headerBtn.contains(e.target)) && 
          (!txBtn || !txBtn.contains(e.target)) &&
          (!syncBtn || !syncBtn.contains(e.target))) {
        this.closePopover();
      }
    });
  }

  setStatus(status, target = null) {
    this.status = status;
    if (target) this.lastSyncTarget = target;
    this.updateUI();
  }

  // Báo hiệu có dữ liệu mới thay đổi (gọi từ db.js hoặc các hàm CRUD)
  notifyDataChange() {
    this.notifyDataChanged();
  }

  notifyDataChanged() {
    if (this.status !== 'syncing') {
      this.setStatus('pending');
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Tự động kích hoạt đồng bộ sau 2.5s không có thêm thay đổi
    this.debounceTimer = setTimeout(() => {
      this.syncAll(true).catch(err => {
        console.warn('Debounced auto-sync error:', err);
      });
    }, 2500);
  }

  // Kích hoạt đồng bộ các adapter đang hoạt động
  async syncAll(isAuto = false) {
    let performedSync = false;

    // 0. Dedicated Sync Server Adapter (Máy chủ riêng - Ưu tiên hàng đầu)
    const serverAdapter = this.adapters.get('custom-server') || window.serverSyncService;
    if (serverAdapter && (isAuto ? serverAdapter.isAutoSyncEnabled() : (serverAdapter.serverUrl && serverAdapter.token))) {
      performedSync = true;
      try {
        await serverAdapter.sync();
      } catch (err) {
        console.warn('Dedicated Server sync failed during syncAll:', err);
        if (!isAuto) throw err;
      }
    }

    // 1. Google Drive Adapter
    const driveAdapter = this.adapters.get('google-drive') || window.googleDriveService;
    if (driveAdapter) {
      const isDriveReady = driveAdapter.clientId && (
        driveAdapter.hasValidToken() ||
        (driveAdapter.workerUrl && driveAdapter.refreshToken) ||
        (driveAdapter.userProfile && driveAdapter.userProfile.email)
      );

      if (isAuto ? driveAdapter.isAutoSyncEnabled() : isDriveReady) {
        performedSync = true;
        try {
          await driveAdapter.sync({ interactive: false });
        } catch (err) {
          console.warn('Google Drive sync failed during syncAll:', err);
          if (!isAuto) throw err;
        }
      }
    }

    // 2. Dropbox Adapter (Tự động đồng bộ vĩnh viễn trên iPhone)
    const dropboxAdapter = this.adapters.get('dropbox') || window.dropboxService;
    if (dropboxAdapter) {
      const isDropboxReady = dropboxAdapter.appKey && (
        dropboxAdapter.hasValidToken() ||
        dropboxAdapter.refreshToken
      );

      if (isAuto ? dropboxAdapter.isAutoSyncEnabled() : isDropboxReady) {
        performedSync = true;
        try {
          await dropboxAdapter.sync();
        } catch (err) {
          console.warn('Dropbox sync failed during syncAll:', err);
          if (!isAuto) throw err;
        }
      }
    }

    // 3. Local Folder Adapter (nếu người dùng chọn thư mục máy tính)
    const backupService = this.adapters.get('local-folder') || window.BackupService;
    if (backupService && backupService.hasLocalDirectory && backupService.hasLocalDirectory()) {
      try {
        await backupService.autoSaveToDirectory();
        performedSync = true;
        this.lastSyncTime = new Date().toISOString();
        this.lastSyncTarget = 'Thư mục máy tính (' + (backupService.localDirName || 'Local') + ')';
        this.setStatus('synced', this.lastSyncTarget);
      } catch (err) {
        console.warn('Local folder auto-save failed:', err);
      }
    }

    if (!performedSync && !isAuto) {
      // Không có dịch vụ đám mây/máy chủ nào được kết nối
      this.setStatus('idle', 'Bộ nhớ trình duyệt (IndexedDB)');
      showToast('Chưa có dịch vụ đám mây nào được kết nối. Hãy vào Cài đặt để đăng nhập.', 'info');
    }
  }

  // Cập nhật Micro Indicator trên Header, Trang Ghi Chép và Sidebar
  updateUI() {
    const dots = [
      document.getElementById('header-sync-dot'),
      document.getElementById('tx-sync-dot')
    ];
    const btns = [
      document.getElementById('header-brand-logo-btn'),
      document.getElementById('tx-brand-logo-btn'),
      document.getElementById('header-sync-btn')
    ];
    const headerIcon = document.getElementById('header-sync-icon');
    const sidebarText = document.getElementById('sync-status-text');
    const sidebarDot = document.querySelector('.sidebar-footer .status-dot');

    // Tooltip & text
    let titleText = '';
    let dotClass = 'sync-status-dot';
    let iconName = 'cloud';

    switch (this.status) {
      case 'syncing':
        titleText = 'Đang đồng bộ dữ liệu...';
        dotClass = 'sync-status-dot syncing';
        iconName = 'refresh-cw';
        if (sidebarText) sidebarText.textContent = 'Đang đồng bộ...';
        if (sidebarDot) sidebarDot.className = 'status-dot syncing';
        break;

      case 'synced':
        titleText = `Đã sao lưu an toàn (${this.formatRelativeTime(this.lastSyncTime)})`;
        dotClass = 'sync-status-dot synced';
        iconName = 'cloud-check';
        if (sidebarText) sidebarText.textContent = 'Đồng bộ: ' + this.formatRelativeTime(this.lastSyncTime);
        if (sidebarDot) sidebarDot.className = 'status-dot active';
        break;

      case 'pending':
        titleText = 'Có thay đổi mới đang chờ sao lưu';
        dotClass = 'sync-status-dot pending';
        iconName = 'cloud';
        if (sidebarText) sidebarText.textContent = 'Chờ đồng bộ...';
        if (sidebarDot) sidebarDot.className = 'status-dot pending';
        break;

      case 'error':
        titleText = 'Sự cố đồng bộ: ' + (this.lastError || 'Lỗi');
        dotClass = 'sync-status-dot error';
        iconName = 'alert-circle';
        if (sidebarText) sidebarText.textContent = 'Lỗi đồng bộ';
        if (sidebarDot) sidebarDot.className = 'status-dot error';
        break;

      case 'idle':
      default:
        titleText = this.lastSyncTime ? `Sao lưu lần cuối: ${this.formatRelativeTime(this.lastSyncTime)}` : 'Sẵn sàng sao lưu';
        dotClass = this.lastSyncTime ? 'sync-status-dot synced quiet' : 'sync-status-dot idle';
        iconName = 'cloud';
        if (sidebarText) sidebarText.textContent = this.lastSyncTime ? `Đã lưu: ${this.formatRelativeTime(this.lastSyncTime)}` : 'Google Drive: Sẵn sàng';
        if (sidebarDot) sidebarDot.className = 'status-dot';
        break;
    }

    dots.forEach(dot => {
      if (dot) dot.className = dotClass;
    });

    btns.forEach(btn => {
      if (btn) btn.setAttribute('title', titleText);
    });
    if (headerIcon) {
      headerIcon.setAttribute('data-lucide', iconName);
      if (this.status === 'syncing') {
        headerIcon.classList.add('spin-animation');
      } else {
        headerIcon.classList.remove('spin-animation');
      }
      if (window.lucide) {
        lucide.createIcons();
      }
    }

    // Cập nhật nội dung Popover nếu đang mở
    this.updatePopoverContent();
  }

  // Format thời gian thân thiện (Vừa xong, 5 phút trước...)
  formatRelativeTime(isoString) {
    if (!isoString) return 'Chưa sao lưu';
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 10) return 'Vừa xong';
    if (diffSec < 60) return `${diffSec} giây trước`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} phút trước`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  // Toggle mở/đóng Popover
  togglePopover(e, triggerBtn = null) {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    if (this.isPopoverOpen) {
      this.closePopover();
    } else {
      this.openPopover(triggerBtn || e?.currentTarget || document.getElementById('tx-brand-logo-btn'));
    }
  }

  openPopover(triggerBtn = null) {
    const popover = document.getElementById('sync-status-popover');
    const backdrop = document.getElementById('sync-popover-backdrop');
    if (!popover) return;
    this.updatePopoverContent();
    if (backdrop) {
      backdrop.style.display = 'block';
    }
    popover.style.display = 'block';
    this.isPopoverOpen = true;

    const popoverWidth = 290;
    if (triggerBtn && typeof triggerBtn.getBoundingClientRect === 'function') {
      const rect = triggerBtn.getBoundingClientRect();
      popover.style.position = 'fixed';
      const topPos = (rect.bottom > 0 ? rect.bottom + 8 : 60);
      popover.style.top = topPos + 'px';
      
      let left = rect.left;
      if (left + popoverWidth > window.innerWidth - 12) {
        left = window.innerWidth - popoverWidth - 12;
      }
      if (left < 12) left = 12;
      popover.style.left = left + 'px';
      popover.style.right = 'auto';
    } else {
      popover.style.position = 'fixed';
      popover.style.top = '60px';
      popover.style.left = '16px';
      popover.style.right = 'auto';
    }

    if (window.lucide) lucide.createIcons();
  }

  closePopover() {
    const popover = document.getElementById('sync-status-popover');
    const backdrop = document.getElementById('sync-popover-backdrop');
    if (backdrop) {
      backdrop.style.display = 'none';
    }
    if (!popover) return;
    popover.style.display = 'none';
    this.isPopoverOpen = false;
  }

  updatePopoverContent() {
    const titleEl = document.getElementById('popover-status-title');
    const dotEl = document.getElementById('popover-status-dot');
    const timeEl = document.getElementById('popover-last-time');
    const targetEl = document.getElementById('popover-target');
    const errBox = document.getElementById('popover-error-box');

    if (!titleEl) return;

    if (this.status === 'syncing') {
      titleEl.textContent = 'Đang đồng bộ dữ liệu...';
      if (dotEl) dotEl.className = 'sync-popover-dot syncing';
    } else if (this.status === 'error') {
      titleEl.textContent = 'Gặp sự cố đồng bộ';
      if (dotEl) dotEl.className = 'sync-popover-dot error';
    } else if (this.status === 'pending') {
      titleEl.textContent = 'Chờ sao lưu thay đổi...';
      if (dotEl) dotEl.className = 'sync-popover-dot pending';
    } else if (this.lastSyncTime) {
      titleEl.textContent = 'Đã sao lưu an toàn';
      if (dotEl) dotEl.className = 'sync-popover-dot synced';
    } else {
      titleEl.textContent = 'Sẵn sàng sao lưu';
      if (dotEl) dotEl.className = 'sync-popover-dot idle';
    }

    if (timeEl) {
      timeEl.textContent = this.lastSyncTime ? new Date(this.lastSyncTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Chưa có';
    }

    const isOnlyLocalDB = !this.lastSyncTarget || 
      this.lastSyncTarget === 'Nội bộ máy' || 
      this.lastSyncTarget.includes('IndexedDB') || 
      this.lastSyncTarget.includes('trình duyệt');

    if (targetEl) {
      if (isOnlyLocalDB) {
        targetEl.innerHTML = '<span style=\"color: var(--text-secondary); font-size: 0.8rem;\">Bộ nhớ trình duyệt (IndexedDB)</span>';
      } else {
        targetEl.textContent = this.lastSyncTarget;
      }
    }

    const warningEl = document.getElementById('popover-warning-note');
    if (warningEl) {
      warningEl.style.display = isOnlyLocalDB ? 'block' : 'none';
    }

    if (errBox) {
      if (this.status === 'error' && this.lastError) {
        errBox.textContent = this.lastError;
        errBox.style.display = 'block';
      } else {
        errBox.style.display = 'none';
      }
    }
  }

  // Nút hành động nhanh trên Popover
  async syncNow() {
    const btn = document.getElementById('popover-sync-now-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="spin-animation"></i> <span>Đang xử lý...</span>';
      if (window.lucide) lucide.createIcons();
    }

    try {
      // 1. Google Drive: Nếu người dùng ĐÃ ĐĂNG NHẬP trước đó (có userProfile.email hoặc refreshToken)
      const drive = window.googleDriveService;
      if (drive && drive.clientId && (drive.userProfile?.email || drive.refreshToken)) {
        if (!drive.hasValidToken()) {
          let refreshed = false;
          if (drive.workerUrl && drive.refreshToken) {
            refreshed = await drive.refreshViaWorker();
          }
          // Nếu không có Worker hoặc refresh thất bại: Bật popup gia hạn trực tiếp vì đây là thao tác chủ động của người dùng
          if (!refreshed && !drive.hasValidToken()) {
            showToast('Đang kết nối lại Google Drive...', 'info');
            await drive.requestToken({ interactive: true });
          }
        }
      }

      // 2. Dropbox: Nếu người dùng ĐÃ ĐĂNG NHẬP trước đó (có refreshToken hoặc userProfile)
      const dropbox = window.dropboxService;
      if (dropbox && dropbox.appKey && (dropbox.refreshToken || dropbox.userProfile?.email)) {
        if (!dropbox.hasValidToken()) {
          if (dropbox.refreshToken) {
            await dropbox.refreshAccessToken();
          } else {
            showToast('Đang kết nối lại Dropbox...', 'info');
            await dropbox.requestAuth();
          }
        }
      }

      await this.syncAll(false);
      showToast('Đã kiểm tra đồng bộ thành công!', 'success');
      if (window.app && window.app.refreshAll) await window.app.refreshAll();
    } catch (err) {
      showToast('Đồng bộ thất bại: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="refresh-cw" style="width: 13px; height: 13px;"></i> <span>Đồng bộ ngay</span>';
        if (window.lucide) lucide.createIcons();
      }
    }
  }

  openSettings() {
    this.closePopover();
    if (window.app && window.app.switchView) {
      window.app.switchView('settings');
    }
  }
}

window.SyncCoordinator = new SyncCoordinator();
