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
    this.updateVaultUI();
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
      this.lastError = e.detail?.error || 'Kh\u00f4ng th\u1ec3 k\u1ebft n\u1ed1i \u0111\u1ebfn m\u00e1y ch\u1ee7 ri\u00eang';
      this.setStatus('error', e.detail?.target || 'Đám mây');
    });

    // Lắng nghe sự kiện sổ máy chủ thay đổi
    window.addEventListener('server-vault-switched', () => {
      this.updateVaultUI();
      if (this.isPopoverOpen) this.updatePopoverContent();
    });
    window.addEventListener('server-vaults-updated', () => {
      this.updateVaultUI();
      if (this.isPopoverOpen) this.updatePopoverContent();
    });
    window.addEventListener('server-auth-changed', () => {
      this.updateVaultUI();
      this.updateUI();
      if (this.isPopoverOpen) this.updatePopoverContent();
    });
    window.addEventListener('google-profile-updated', () => {
      this.updateUI();
      if (this.isPopoverOpen) this.updatePopoverContent();
    });
    window.addEventListener('dropbox-profile-updated', () => {
      this.updateUI();
      if (this.isPopoverOpen) this.updatePopoverContent();
    });

    // Lắng nghe click bên ngoài để đóng popover
    document.addEventListener('click', (e) => {
      if (!this.isPopoverOpen) return;
      const popover = document.getElementById('sync-status-popover');
      const headerBtn = document.getElementById('header-brand-logo-btn');
      const txBtn = document.getElementById('tx-brand-logo-btn');
      const headerPill = document.getElementById('header-vault-pill');
      const txPill = document.getElementById('tx-vault-pill');
      const syncBtn = document.getElementById('header-sync-btn');
      
      if (popover && !popover.contains(e.target) && 
          (!headerBtn || !headerBtn.contains(e.target)) && 
          (!txBtn || !txBtn.contains(e.target)) &&
          (!headerPill || !headerPill.contains(e.target)) &&
          (!txPill || !txPill.contains(e.target)) &&
          (!syncBtn || !syncBtn.contains(e.target))) {
        this.closePopover();
      }
    });
  }

  // Kiểm tra có dịch vụ đám mây / sao lưu nào đang kết nối và sẵn sàng
  hasConnectedServices(isAuto = false) {
    return this.getConnectedServices(isAuto).length > 0;
  }

  // Danh sách các dịch vụ đang kết nối và phương thức đồng bộ độc lập
  getConnectedServices(isAuto = false) {
    const list = [];

    // 1. M\u00e1y ch\u1ee7 ri\u00eang Adapter (Dedicated Sync Server / Self-Hosted)
    const serverAdapter = this.adapters.get('custom-server') || window.serverSyncService;
    if (serverAdapter && serverAdapter.autoSync !== false) {
      const isReady = isAuto
        ? (typeof serverAdapter.isAutoSyncEnabled === 'function' ? serverAdapter.isAutoSyncEnabled() : false)
        : !!(serverAdapter.serverUrl && serverAdapter.token);
      if (isReady) {
        list.push({
          id: 'custom-server',
          name: 'Máy chủ riêng',
          run: async () => {
            await serverAdapter.sync();
          }
        });
      }
    }

    // 2. Dropbox Adapter
    const dropboxAdapter = this.adapters.get('dropbox') || window.dropboxService;
    if (dropboxAdapter && dropboxAdapter.autoSync !== false) {
      const isDropboxConfigured = !!(dropboxAdapter.appKey && (
        (typeof dropboxAdapter.hasValidToken === 'function' && dropboxAdapter.hasValidToken()) ||
        dropboxAdapter.refreshToken ||
        (dropboxAdapter.userProfile && dropboxAdapter.userProfile.email)
      ));
      const isReady = isAuto
        ? (typeof dropboxAdapter.isAutoSyncEnabled === 'function' ? dropboxAdapter.isAutoSyncEnabled() : false)
        : isDropboxConfigured;

      if (isReady) {
        list.push({
          id: 'dropbox',
          name: 'Dropbox',
          run: async () => {
            if (!dropboxAdapter.hasValidToken()) {
              if (dropboxAdapter.refreshToken) {
                await dropboxAdapter.refreshAccessToken();
              } else if (!isAuto) {
                await dropboxAdapter.requestAuth();
              } else {
                throw new Error('Lỗi xác thực');
              }
            }
            await dropboxAdapter.sync();
          }
        });
      }
    }

    // 3. Google Drive Adapter
    const driveAdapter = this.adapters.get('google-drive') || window.googleDriveService;
    if (driveAdapter && driveAdapter.autoSync !== false) {
      const isDriveConfigured = !!(driveAdapter.clientId && (
        (typeof driveAdapter.hasValidToken === 'function' && driveAdapter.hasValidToken()) ||
        (driveAdapter.workerUrl && driveAdapter.refreshToken) ||
        (driveAdapter.userProfile && driveAdapter.userProfile.email)
      ));
      const isReady = isAuto
        ? (typeof driveAdapter.isAutoSyncEnabled === 'function' ? driveAdapter.isAutoSyncEnabled() : false)
        : isDriveConfigured;

      if (isReady) {
        list.push({
          id: 'google-drive',
          name: 'Google Drive',
          run: async () => {
            if (!driveAdapter.hasValidToken()) {
              let refreshed = false;
              if (driveAdapter.workerUrl && driveAdapter.refreshToken) {
                refreshed = await driveAdapter.refreshViaWorker();
              }
              if (!refreshed && !driveAdapter.hasValidToken()) {
                if (!isAuto) {
                  await driveAdapter.requestToken({ interactive: true });
                } else {
                  throw new Error('Lỗi xác thực');
                }
              }
            }
            await driveAdapter.sync({ interactive: false });
          }
        });
      }
    }

    // 3. Local Folder Adapter (Thư mục máy tính)
    const backupService = this.adapters.get('local-folder') || window.BackupService;
    if (backupService && typeof backupService.hasLocalDirectory === 'function' && backupService.hasLocalDirectory()) {
      list.push({
        id: 'local-folder',
        name: backupService.localDirName ? `Thư mục máy tính (${backupService.localDirName})` : 'Thư mục máy tính',
        run: async () => {
          await backupService.autoSaveToDirectory();
        }
      });
    }

    return list;
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
    // Chế độ độc lập (Không có đám mây):
    // Nếu không có dịch vụ đám mây nào đăng nhập/bật: Khi thay đổi dữ liệu sẽ chẳng có gì xảy ra.
    if (!this.hasConnectedServices(true)) {
      return;
    }

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
    const services = this.getConnectedServices(isAuto);
    if (!services || services.length === 0) {
      if (!isAuto) {
        this.setStatus('idle', 'Bộ nhớ trình duyệt (IndexedDB)');
      }
      return;
    }

    this.setStatus('syncing');

    let anySuccess = false;
    let anyError = false;
    const successNames = [];
    const errorDetails = [];

    // Chạy độc lập từng dịch vụ (không để lỗi của dịch vụ này chặn dịch vụ khác)
    for (const svc of services) {
      try {
        await svc.run();
        anySuccess = true;
        successNames.push(svc.name);
      } catch (err) {
        console.warn(`Sync failed for ${svc.name} during syncAll:`, err);
        anyError = true;
        let errMsg = err?.message || 'Lỗi kết nối';
        if (errMsg.toLowerCase().includes('token') || errMsg.toLowerCase().includes('auth') || errMsg.toLowerCase().includes('xác thực')) {
          errMsg = 'Lỗi xác thực';
        }
        errorDetails.push(`${svc.name}: ${errMsg}`);
      }
    }

    if (anySuccess) {
      this.lastSyncTime = new Date().toISOString();
      this.lastSyncTarget = successNames.join(', ');
      if (window.db && window.db.settings) {
        db.settings.put({ key: 'lastSyncSuccessTime', value: this.lastSyncTime });
        db.settings.put({ key: 'lastSyncTargetName', value: this.lastSyncTarget });
      }
    }

    if (anyError) {
      this.lastError = errorDetails.join('; ');
      this.setStatus('error', anySuccess ? this.lastSyncTarget : null);
    } else if (anySuccess) {
      this.lastError = null;
      this.setStatus('synced', this.lastSyncTarget);
    } else {
      this.setStatus('idle');
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

    const hasServices = this.hasConnectedServices(false);

    // Tooltip & text
    let titleText = '';
    let dotClass = 'sync-status-dot';
    let iconName = 'cloud';

    // Chế độ độc lập (Không có đám mây)
    if (!hasServices) {
      titleText = 'Chỉ lưu cục bộ';
      dotClass = 'sync-status-dot local';
      iconName = 'hard-drive';
      if (sidebarText) sidebarText.textContent = 'Chỉ lưu cục bộ';
      if (sidebarDot) sidebarDot.className = 'status-dot';
    } else {
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
          if (sidebarText) sidebarText.textContent = this.lastSyncTime ? `Đã lưu: ${this.formatRelativeTime(this.lastSyncTime)}` : 'Đám mây: Sẵn sàng';
          if (sidebarDot) sidebarDot.className = 'status-dot';
          break;
      }
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

    const popoverWidth = Math.min(310, window.innerWidth - 24);
    popover.style.width = popoverWidth + 'px';
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
    const syncNowBtn = document.getElementById('popover-sync-now-btn');

    if (!titleEl) return;

    const hasServices = this.hasConnectedServices(false);

    // 1. Nút "Đồng bộ ngay": Nếu chưa kết nối dịch vụ nào: ẩn nút đồng bộ
    if (syncNowBtn) {
      syncNowBtn.style.display = hasServices ? 'inline-flex' : 'none';
    }

    // 2. Chế độ độc lập (Không có đám mây):
    // Nếu không có dịch vụ đám mây nào đăng nhập/bật: Tiêu đề hiển thị chuẩn xác là "Chỉ lưu cục bộ"
    if (!hasServices) {
      titleEl.textContent = 'Chỉ lưu cục bộ';
      if (dotEl) dotEl.className = 'sync-popover-dot local';
    } else if (this.status === 'syncing') {
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
      if (!hasServices) {
        timeEl.textContent = 'Đã lưu trên thiết bị';
      } else {
        timeEl.textContent = this.lastSyncTime ? new Date(this.lastSyncTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Chưa có';
      }
    }

    const isOnlyLocalDB = !hasServices || !this.lastSyncTarget || 
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
      if (hasServices && this.status === 'error' && this.lastError) {
        errBox.textContent = this.lastError;
        errBox.style.display = 'block';
      } else {
        errBox.style.display = 'none';
      }
    }

    // Render mục chuyển sổ nếu có nhiều hơn 1 sổ
    const vaultContainer = document.getElementById('popover-vault-container');
    const vaultList = document.getElementById('popover-vault-list');
    const vaultCountBadge = document.getElementById('popover-vault-count-badge');

    const sService = window.serverSyncService;
    const vaults = sService && Array.isArray(sService.vaults) ? sService.vaults : [];
    const activeVaultId = sService?.activeVaultId;

    if (vaultContainer && vaultList) {
      if (vaults.length > 1) {
        vaultContainer.style.display = 'block';
        if (vaultCountBadge) vaultCountBadge.textContent = `${vaults.length} sổ`;

        vaultList.innerHTML = vaults.map(v => {
          const isActive = v.id === activeVaultId;
          const roleLabel = v.role === 'owner' ? 'Chủ sổ' : (v.role === 'editor' ? 'Chỉnh sửa' : 'Chỉ xem');
          const roleClass = v.role || 'owner';
          const safeId = typeof escapeHTML === 'function' ? escapeHTML(v.id) : v.id;
          const safeName = typeof escapeHTML === 'function' ? escapeHTML(v.name) : v.name;

          return `
            <div class="sync-vault-item ${isActive ? 'active' : ''}" data-vault-id="${safeId}" onclick="${isActive ? '' : `window.SyncCoordinator.switchVaultQuick('${safeId}')`}">
              <div class="sync-vault-item-left">
                <div class="sync-vault-item-icon">
                  <i data-lucide="${isActive ? 'book-check' : 'book'}" style="width: 14px; height: 14px;"></i>
                </div>
                <div class="sync-vault-item-info">
                  <div class="sync-vault-item-name" title="${safeName}">${safeName}</div>
                  <div class="sync-vault-item-meta">
                    <span class="sync-vault-role-pill ${roleClass}">${roleLabel}</span>
                  </div>
                </div>
              </div>
              <div class="sync-vault-item-right">
                ${isActive 
                  ? `<span class="sync-vault-active-tag"><i data-lucide="check" style="width: 12px; height: 12px;"></i> Đang dùng</span>`
                  : `<button type="button" class="sync-vault-switch-btn" title="Chuyển sang sổ này">
                      <span>Đổi</span>
                      <i data-lucide="arrow-right" style="width: 12px; height: 12px;"></i>
                    </button>`
                }
              </div>
            </div>
          `;
        }).join('');
      } else {
        vaultContainer.style.display = 'none';
      }
    }

    if (window.lucide) lucide.createIcons();
  }

  // Nút hành động nhanh trên Popover
  async syncNow() {
    const btn = document.getElementById('popover-sync-now-btn');
    const services = this.getConnectedServices(false);

    // Nếu chưa kết nối dịch vụ nào: ẩn nút đồng bộ và dừng
    if (!services || services.length === 0) {
      if (btn) btn.style.display = 'none';
      showToast('Chưa có dịch vụ đám mây nào được kết nối.', 'info');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="spin-animation"></i> <span>Đang xử lý...</span>';
      if (window.lucide) lucide.createIcons();
    }

    this.setStatus('syncing');

    // Chạy độc lập từng dịch vụ (không để lỗi của dịch vụ này chặn dịch vụ khác)
    const results = [];
    for (const svc of services) {
      try {
        await svc.run();
        results.push({ name: svc.name, success: true });
      } catch (err) {
        console.warn(`Sync failed for ${svc.name}:`, err);
        let errMsg = err?.message || 'Lỗi không xác định';
        if (errMsg.toLowerCase().includes('token') || errMsg.toLowerCase().includes('auth') || errMsg.toLowerCase().includes('xác thực')) {
          errMsg = 'Lỗi xác thực';
        } else if (errMsg.toLowerCase().includes('network') || errMsg.toLowerCase().includes('fetch') || errMsg.toLowerCase().includes('kết nối') || errMsg.toLowerCase().includes('failed to fetch')) {
          errMsg = 'Lỗi kết nối';
        }
        results.push({ name: svc.name, success: false, error: errMsg });
      }
    }

    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);

    // Cập nhật trạng thái
    if (successes.length > 0) {
      this.lastSyncTime = new Date().toISOString();
      this.lastSyncTarget = successes.map(s => s.name).join(', ');
      if (window.db && window.db.settings) {
        db.settings.put({ key: 'lastSyncSuccessTime', value: this.lastSyncTime });
        db.settings.put({ key: 'lastSyncTargetName', value: this.lastSyncTarget });
      }
    }

    if (failures.length > 0) {
      this.lastError = failures.map(f => `${f.name}: ${f.error}`).join('; ');
      this.setStatus('error', successes.length > 0 ? this.lastSyncTarget : null);
    } else {
      this.lastError = null;
      this.setStatus('synced', this.lastSyncTarget);
    }

    // Hiển thị thông báo chi tiết theo thứ tự:
    // - Nếu tất cả thành công: "✅ M\u00e1y ch\u1ee7 ri\u00eang, Dropbox, Google Drive"
    // - Nếu có dịch vụ lỗi:
    //   ✅ Google Drive
    //   ❌ Dropbox: Lỗi xác thực
    if (failures.length === 0) {
      const names = results.map(r => r.name).join(', ');
      showToast(`✅ ${names}`, 'success');
    } else {
      const lines = results.map(r => {
        if (r.success) {
          return `✅ ${r.name}`;
        } else {
          return `❌ ${r.name}: ${r.error}`;
        }
      });
      const toastType = successes.length > 0 ? 'warning' : 'error';
      showToast(lines.join('\n'), toastType);
    }

    if (window.app && typeof window.app.refreshAll === 'function') {
      await window.app.refreshAll().catch(e => console.warn('refreshAll error:', e));
    }

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="refresh-cw" style="width: 13px; height: 13px;"></i> <span>Đồng bộ ngay</span>';
      if (window.lucide) lucide.createIcons();
    }
  }

  openSettings() {
    this.closePopover();
    if (window.app && window.app.switchView) {
      window.app.switchView('settings');
    }
  }

  // Cập nhật hiển thị sổ bên ngoài Header
  updateVaultUI() {
    const sService = window.serverSyncService;
    const vaults = sService && Array.isArray(sService.vaults) ? sService.vaults : [];
    const activeVault = sService && typeof sService.getActiveVault === 'function' ? sService.getActiveVault() : null;

    const hasMultiVaults = vaults.length > 1;

    // 1. Cập nhật Pills bên ngoài Header
    const headerPill = document.getElementById('header-vault-pill');
    const txPill = document.getElementById('tx-vault-pill');
    const headerName = document.getElementById('header-vault-name');
    const txName = document.getElementById('tx-vault-name');

    // 2. Cập nhật Badges số lượng sổ trên Logo
    const headerBadge = document.getElementById('header-vault-badge-count');
    const txBadge = document.getElementById('tx-vault-badge-count');
    const headerBtn = document.getElementById('header-brand-logo-btn');
    const txBtn = document.getElementById('tx-brand-logo-btn');

    const vaultNameText = activeVault ? activeVault.name : (vaults[0]?.name || 'Sổ mặc định');

    const hasServerVault = !!(sService && sService.token && (vaults.length > 0 || activeVault));

    if (hasServerVault || hasMultiVaults) {
      if (headerPill) {
        headerPill.style.display = 'block';
        headerPill.setAttribute('title', `Sổ: ${vaultNameText}${hasMultiVaults ? ` (${vaults.length} sổ - Bấm để đổi)` : ''}`);
      }
      if (txPill) {
        txPill.style.display = 'block';
        txPill.setAttribute('title', `Sổ: ${vaultNameText}${hasMultiVaults ? ` (${vaults.length} sổ - Bấm để đổi)` : ''}`);
      }
      if (headerName) headerName.textContent = vaultNameText;
      if (txName) txName.textContent = vaultNameText;

      // Áp dụng màu theo quyền sổ (Chủ sổ: Emerald, Chỉnh sửa: Blue, Chỉ xem: Amber)
      const role = (activeVault && activeVault.role) ? activeVault.role : 'owner';
      const roleClasses = ['role-owner', 'role-editor', 'role-viewer'];
      const activeRoleClass = `role-${role}`;

      [headerPill, txPill, headerBtn, txBtn].forEach(el => {
        if (!el) return;
        roleClasses.forEach(cls => el.classList.remove(cls));
        el.classList.add(activeRoleClass);
        el.dataset.role = role;
      });

      const roleColors = {
        owner: '#10b981',
        editor: '#3b82f6',
        viewer: '#f59e0b'
      };
      const vaultColor = (activeVault && activeVault.color) ? activeVault.color : (roleColors[role] || '#10b981');

      if (headerName) headerName.style.color = vaultColor;
      if (txName) txName.style.color = vaultColor;
      if (headerPill) headerPill.style.color = vaultColor;
      if (txPill) txPill.style.color = vaultColor;

      if (headerBadge) {
        headerBadge.textContent = vaults.length;
        headerBadge.style.display = hasMultiVaults ? 'flex' : 'none';
      }
      if (txBadge) {
        txBadge.textContent = vaults.length;
        txBadge.style.display = hasMultiVaults ? 'flex' : 'none';
      }

      if (headerBtn) {
        headerBtn.classList.add('has-vault-name');
        if (hasMultiVaults) headerBtn.classList.add('has-multi-vaults');
        else headerBtn.classList.remove('has-multi-vaults');
        headerBtn.setAttribute('title', `Sổ: ${vaultNameText}${hasMultiVaults ? ` (${vaults.length} sổ)` : ''} - Bấm để đổi sổ hoặc xem đồng bộ`);
      }
      if (txBtn) {
        txBtn.classList.add('has-vault-name');
        if (hasMultiVaults) txBtn.classList.add('has-multi-vaults');
        else txBtn.classList.remove('has-multi-vaults');
        txBtn.setAttribute('title', `Sổ: ${vaultNameText}${hasMultiVaults ? ` (${vaults.length} sổ)` : ''} - Bấm để đổi sổ hoặc xem đồng bộ`);
      }
    } else {
      if (headerPill) headerPill.style.display = 'none';
      if (txPill) txPill.style.display = 'none';
      if (headerBadge) headerBadge.style.display = 'none';
      if (txBadge) txBadge.style.display = 'none';

      const roleClasses = ['role-owner', 'role-editor', 'role-viewer'];
      [headerPill, txPill, headerBtn, txBtn].forEach(el => {
        if (!el) return;
        roleClasses.forEach(cls => el.classList.remove(cls));
        delete el.dataset.role;
      });
      if (headerName) headerName.style.color = '';
      if (txName) txName.style.color = '';
      if (headerPill) headerPill.style.color = '';
      if (txPill) txPill.style.color = '';

      if (headerBtn) {
        headerBtn.classList.remove('has-vault-name', 'has-multi-vaults');
        headerBtn.setAttribute('title', 'Trạng thái sao lưu & đồng bộ');
      }
      if (txBtn) {
        txBtn.classList.remove('has-vault-name', 'has-multi-vaults');
        txBtn.setAttribute('title', 'Trạng thái sao lưu & đồng bộ');
      }
    }

    if (window.lucide) lucide.createIcons();
  }

  // Đổi sổ nhanh từ Popover Logo
  async switchVaultQuick(vaultId) {
    const sService = window.serverSyncService;
    if (!sService || !vaultId || vaultId === sService.activeVaultId) return;

    const targetVault = sService.vaults ? sService.vaults.find(v => v.id === vaultId) : null;
    const vaultName = targetVault ? targetVault.name : 'sổ mới';

    // Hiển thị trạng thái đang đổi trên popover
    const vaultListEl = document.getElementById('popover-vault-list');
    if (vaultListEl) {
      const items = vaultListEl.querySelectorAll('.sync-vault-item');
      items.forEach(el => {
        if (el.dataset.vaultId === vaultId) {
          el.classList.add('is-switching');
          const rightEl = el.querySelector('.sync-vault-item-right');
          if (rightEl) {
            rightEl.innerHTML = '<span class="vault-item-switching-text"><i data-lucide="loader-2" class="spin-animation" style="width:13px;height:13px;"></i> Đang chuyển...</span>';
          }
        }
      });
      if (window.lucide) lucide.createIcons();
    }

    try {
      showToast(`Đang chuyển sang "${vaultName}"...`, 'info');
      await sService.switchVault(vaultId);
      if (window.app && typeof window.app.refreshAll === 'function') {
        await window.app.refreshAll();
      }
      showToast(`Đã chuyển sang sổ "${vaultName}" thành công!`, 'success');
      this.updateVaultUI();
      this.updatePopoverContent();
      setTimeout(() => {
        this.closePopover();
      }, 600);
    } catch (err) {
      console.error('switchVaultQuick error:', err);
      showToast('Lỗi khi chuyển sổ: ' + (err.message || err), 'error');
      this.updatePopoverContent();
    }
  }

  // Tạo sổ mới nhanh từ Popover
  async quickCreateVault() {
    const sService = window.serverSyncService;
    if (!sService || !sService.serverUrl || !sService.token) {
      showToast('Vui lòng kết nối Máy Chủ Riêng để tạo sổ mới', 'warning');
      this.openVaultSettings();
      return;
    }
    const name = await showPrompt({
      title: 'Tạo Sổ Mới',
      message: 'Nhập tên Sổ mới để quản lý thu chi riêng biệt:',
      placeholder: 'Ví dụ: Sổ Gia Đình, Sổ Quỹ Lớp, Sổ Kinh Doanh...',
      confirmText: 'Tạo Sổ',
      cancelText: 'Huỷ',
      icon: 'book-plus'
    });
    if (!name || !name.trim()) return;

    try {
      showToast('Đang tạo sổ mới...', 'info');
      const v = await sService.createVault(name.trim());
      showToast(`Đã tạo sổ "${v.name}" thành công!`, 'success');
      if (window.app && typeof window.app.refreshAll === 'function') {
        await window.app.refreshAll();
      }
      this.updateVaultUI();
      this.updatePopoverContent();
      setTimeout(() => {
        this.closePopover();
      }, 700);
    } catch (err) {
      showToast('Tạo sổ thất bại: ' + (err.message || err), 'error');
    }
  }

  // Sao chép sổ nhanh từ Popover
  async quickCopyVault() {
    const sService = window.serverSyncService;
    if (!sService || !sService.serverUrl || !sService.token || !sService.activeVaultId) {
      showToast('Vui lòng kết nối Máy Chủ Riêng để sao chép sổ', 'warning');
      this.openVaultSettings();
      return;
    }
    const current = sService.getActiveVault ? sService.getActiveVault() : null;
    const currentName = current ? current.name : 'Sổ hiện tại';
    const escName = typeof escapeHTML === 'function' ? escapeHTML(currentName) : currentName;
    const name = await showPrompt({
      title: 'Sao Chép Sổ',
      message: `Nhập tên Sổ mới sao chép từ <strong>${escName}</strong>:`,
      defaultValue: `${currentName} (Bản sao)`,
      placeholder: 'Nhập tên sổ mới...',
      confirmText: 'Sao Chép',
      cancelText: 'Huỷ',
      icon: 'copy'
    });
    if (!name || !name.trim()) return;

    try {
      showToast('Đang sao chép sổ...', 'info');
      const v = await sService.copyVault(sService.activeVaultId, name.trim());
      showToast(`Đã sao chép sang sổ "${v.name}" thành công!`, 'success');
      if (window.app && typeof window.app.refreshAll === 'function') {
        await window.app.refreshAll();
      }
      this.updateVaultUI();
      this.updatePopoverContent();
      setTimeout(() => {
        this.closePopover();
      }, 700);
    } catch (err) {
      showToast('Sao chép sổ thất bại: ' + (err.message || err), 'error');
    }
  }

  // Chuyển tới mục quản lý Sổ trong Cài đặt
  openVaultSettings() {
    this.closePopover();
    if (window.app && typeof window.app.switchView === 'function') {
      window.app.switchView('settings');
      if (window.UISettings && typeof window.UISettings.openSection === 'function') {
        setTimeout(() => window.UISettings.openSection('section-server-sync'), 120);
      }
    }
  }
}

window.SyncCoordinator = new SyncCoordinator();
window.syncCoordinator = window.SyncCoordinator;
