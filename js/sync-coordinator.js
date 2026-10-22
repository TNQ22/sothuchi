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
      this.lastError = e.detail?.error || 'Không thể kết nối đến máy chủ sao lưu';
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

    // 0. Dedicated Sync Server Adapter (Máy chủ riêng)
    // Nếu công tắc Kích Hoạt bị TẮT (autoSync === false), loại trừ 100% khỏi cả đồng bộ ngầm lẫn đồng bộ Header
    const serverAdapter = this.adapters.get('custom-server') || window.serverSyncService;
    if (serverAdapter && serverAdapter.autoSync !== false) {
      if (isAuto ? serverAdapter.isAutoSyncEnabled() : (serverAdapter.serverUrl && serverAdapter.token)) {
        performedSync = true;
        try {
          await serverAdapter.sync();
        } catch (err) {
          console.warn('Dedicated Server sync failed during syncAll:', err);
          if (!isAuto) throw err;
        }
      }
    }

    // 1. Google Drive Adapter
    // Nếu công tắc Kích Hoạt bị TẮT (autoSync === false), loại trừ 100% khỏi cả đồng bộ ngầm lẫn đồng bộ Header
    const driveAdapter = this.adapters.get('google-drive') || window.googleDriveService;
    if (driveAdapter && driveAdapter.autoSync !== false) {
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

    // 2. Dropbox Adapter
    // Nếu công tắc Kích Hoạt bị TẮT (autoSync === false), loại trừ 100% khỏi cả đồng bộ ngầm lẫn đồng bộ Header
    const dropboxAdapter = this.adapters.get('dropbox') || window.dropboxService;
    if (dropboxAdapter && dropboxAdapter.autoSync !== false) {
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
