/**
 * SỔ THU CHI - SYNC COORDINATOR & ADAPTER ARCHITECTURE
 * Module điều phối trung tâm quản lý:
 * - Trạng thái đồng bộ: idle, pending, syncing, synced, error
 * - Các bộ chuyển đổi (Adapters): GoogleDriveAdapter, LocalFolderAdapter, (Sẵn sàng cho Cloudflare/Supabase sau này)
 * - Micro Status Indicator trên Header & Sidebar
 * - Popover xem nhanh trạng thái
 */

class SyncCoordinator {
  constructor() {
    this.status = 'idle'; // 'idle' | 'pending' | 'syncing' | 'synced' | 'error'
    this.lastSyncTime = null;
    this.lastSyncTarget = 'Bộ nhớ trình duyệt (IndexedDB)';
    this.lastError = null;
    this.isDirty = false;
    this.debounceTimer = null;
    this.adapters = new Map();
    this.isPopoverOpen = false;
  }

  // Khởi tạo coordinator
  async init() {
    // Đọc trạng thái đã lưu
    try {
      const savedTime = await db.settings.get('lastSyncTime');
      if (savedTime && savedTime.value) {
        this.lastSyncTime = savedTime.value;
      }

      const savedTarget = await db.settings.get('lastSyncTarget');
      if (savedTarget && savedTarget.value) {
        this.lastSyncTarget = savedTarget.value;
      }
    } catch (e) {
      console.warn('SyncCoordinator init read error:', e);
    }

    // Đăng ký adapter mặc định nếu có
    if (window.serverSyncService) {
      this.registerAdapter('custom-server', window.serverSyncService);
    }
    if (window.googleDriveService) {
      this.registerAdapter('google-drive', window.googleDriveService);
    }
    if (window.BackupService) {
      this.registerAdapter('local-folder', window.BackupService);
    }

    // Lắng nghe sự kiện đồng bộ từ các adapter
    window.addEventListener('sync-start', (e) => {
      this.setStatus('syncing', e.detail?.target || this.lastSyncTarget);
    });

    window.addEventListener('sync-success', (e) => {
      this.lastSyncTime = e.detail?.time || new Date().toISOString();
      this.lastSyncTarget = e.detail?.target || this.lastSyncTarget;
      this.lastError = null;
      this.isDirty = false;
      this.setStatus('synced', this.lastSyncTarget);
      if (db.settings) {
        db.settings.put({ key: 'lastSyncTime', value: this.lastSyncTime });
        db.settings.put({ key: 'lastSyncTarget', value: this.lastSyncTarget });
      }
    });

    window.addEventListener('sync-error', (e) => {
      this.lastError = e.detail?.error || 'Lỗi không xác định khi đồng bộ';
      this.setStatus('error', this.lastSyncTarget, this.lastError);
    });

    // Đóng popover khi click/chạm vào lớp nền backdrop
    const backdrop = document.getElementById('sync-popover-backdrop');
    if (backdrop) {
      const handleBackdropDismiss = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        this.closePopover();
      };
      backdrop.addEventListener('pointerdown', handleBackdropDismiss);
      backdrop.addEventListener('touchstart', handleBackdropDismiss, { passive: false });
      backdrop.addEventListener('click', handleBackdropDismiss);
    }

    // Đóng popover khi click ngoài (dành cho desktop hoặc dự phòng)
    document.addEventListener('pointerdown', (e) => {
      const popover = document.getElementById('sync-status-popover');
      if (this.isPopoverOpen && popover) {
        const isClickOnAnyTrigger = e.target.closest('#header-brand-logo-btn') || 
                                    e.target.closest('#tx-brand-logo-btn') || 
                                    e.target.closest('#header-sync-btn');
        if (!popover.contains(e.target) && !isClickOnAnyTrigger) {
          this.closePopover();
        }
      }
    }, { passive: true });

    document.addEventListener('click', (e) => {
      const popover = document.getElementById('sync-status-popover');
      if (this.isPopoverOpen && popover) {
        const isClickOnAnyTrigger = e.target.closest('#header-brand-logo-btn') || 
                                    e.target.closest('#tx-brand-logo-btn') || 
                                    e.target.closest('#header-sync-btn');
        if (!popover.contains(e.target) && !isClickOnAnyTrigger) {
          this.closePopover();
        }
      }
    });

    // Cập nhật giao diện lần đầu
    this.updateUI();
  }

  // Đăng ký một Adapter (sẵn sàng mở rộng sau này)
  registerAdapter(name, adapter) {
    this.adapters.set(name, adapter);
  }

  // Cập nhật trạng thái và thông báo UI
  setStatus(status, target = null, error = null) {
    this.status = status;
    if (target) this.lastSyncTarget = target;
    if (error !== undefined) this.lastError = error;
    this.updateUI();
  }

  // Hook được gọi khi có thay đổi dữ liệu trong CSDL IndexedDB
  notifyDataChange() {
    this.isDirty = true;
    if (this.status !== 'syncing') {
      this.setStatus('pending');
    }

    // Debounce trigger sync (3 giây)
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.syncAll(true); // auto sync
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
    if (driveAdapter && (isAuto ? driveAdapter.isAutoSyncEnabled() : true)) {
      if (driveAdapter.clientId) {
        performedSync = true;
        try {
          await driveAdapter.sync({ interactive: !isAuto });
        } catch (err) {
          console.warn('Google Drive sync failed during syncAll:', err);
          if (!isAuto) throw err;
        }
      }
    }

    // 2. Dropbox Adapter (Tự động đồng bộ vĩnh viễn trên iPhone)
    const dropboxAdapter = this.adapters.get('dropbox') || window.dropboxService;
    if (dropboxAdapter && (isAuto ? dropboxAdapter.isAutoSyncEnabled() : true)) {
      if (dropboxAdapter.appKey && (dropboxAdapter.refreshToken || dropboxAdapter.accessToken)) {
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
      // Không có dịch vụ nào kích hoạt
      this.setStatus('idle', 'Bộ nhớ trình duyệt (IndexedDB)');
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
        targetEl.innerHTML = '<span style="color: var(--text-secondary); font-size: 0.8rem;">Bộ nhớ trình duyệt (IndexedDB)</span>';
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
      const drive = window.googleDriveService;
      if (drive && drive.clientId && !drive.hasValidToken()) {
        let ok = false;
        if (drive.workerUrl && drive.refreshToken) {
          ok = await drive.refreshViaWorker();
        }
        if (!ok) {
          showToast('Đang kết nối lại Google...', 'info');
          await drive.requestToken({ interactive: true });
        }
      }

      const dropbox = window.dropboxService;
      if (dropbox && dropbox.appKey && !dropbox.hasValidToken() && !dropbox.refreshToken) {
        showToast('Đang mở đăng nhập Dropbox...', 'info');
        await dropbox.requestAuth();
      }

      await this.syncAll(false);
      showToast('Đồng bộ thành công!', 'success');
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
