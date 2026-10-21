/**
 * SỔ THU CHI - UI SETTINGS MODULE (v2.5.0)
 * Tối ưu hóa giao diện Cài đặt: Menu đề mục dạng Hub + Sub-pages chi tiết
 * Phân chia Thiết lập Cơ bản & Cài đặt Nâng cao (Collapsible Accordion)
 * Google Drive Sync (E2EE, Custom Folder, Mirror Backup, Sharing),
 * Dropbox Sync (PKCE, Shared Folder), Dedicated Server (Docker / Google Login / Multi-vault),
 * Tự động sao lưu Thư mục PC (Offline), Xuất CSV Excel, Sao lưu/Khôi phục JSON & STC mã hóa, Giao diện & Riêng tư
 */

const UISettings = {
  currentSection: null,

  init() {
    this.bindEvents();
    this.loadSettings();

    // Lắng nghe cập nhật profile Google & Drive
    window.addEventListener('google-profile-updated', (e) => {
      this.renderGoogleProfile(e.detail);
      this.updateHubBadges();
    });

    // Lắng nghe các sự kiện Máy Chủ Riêng Docker
    window.addEventListener('server-connection-changed', () => {
      this.renderServerSyncUI();
      this.updateHubBadges();
    });
    window.addEventListener('server-auth-changed', () => {
      this.renderServerSyncUI();
      this.updateHubBadges();
    });
    window.addEventListener('server-shares-updated', () => {
      this.renderServerSharesList();
    });
    window.addEventListener('server-vault-switched', () => {
      this.renderServerSyncUI();
      this.updateHubBadges();
    });
    window.addEventListener('server-vaults-updated', () => {
      this.renderServerSyncUI();
      this.updateHubBadges();
    });
    window.addEventListener('sync-success', () => {
      this.renderServerSyncUI();
      this.updateHubBadges();
    });
  },

  // Mở trang chi tiết của một đề mục
  openSection(sectionId) {
    this.currentSection = sectionId;

    const hubView = document.getElementById('settings-hub-view');
    const detailView = document.getElementById('settings-detail-view');
    const titleEl = document.getElementById('settings-detail-header-title');

    if (!hubView || !detailView) return;

    hubView.style.display = 'none';
    detailView.style.display = 'block';

    // Ẩn tất cả các panel, hiển thị panel được chọn
    const panels = document.querySelectorAll('.settings-detail-panel');
    panels.forEach(p => p.classList.remove('active'));

    const targetPanel = document.getElementById(`panel-${sectionId}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }

    if (sectionId === 'appearance') {
      this.updateStorageUsage();
    }

    // Cập nhật tiêu đề trang con
    const titleMap = {
      'google-drive': '<svg viewBox="0 0 87.3 78" style="width: 20px; height: 18px; vertical-align: middle;"><path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"/><path fill="#00ac47" d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z"/><path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z"/><path fill="#00832d" d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"/><path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"/><path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z"/></svg> Google Drive',
      'dropbox': '<i data-lucide="box" style="color: #0061ff; width: 20px; height: 20px;"></i> Dropbox',
      'server': '<i data-lucide="server" style="color: #a855f7; width: 20px; height: 20px;"></i> Máy Chủ Riêng',
      'local-folder': '<i data-lucide="folder-sync" style="color: #f59e0b; width: 20px; height: 20px;"></i> Sao Lưu Thư Mục PC',
      'backup-restore': '<i data-lucide="database" style="color: #ec4899; width: 20px; height: 20px;"></i> Sao Lưu & Khôi Phục File',
      'export-csv': '<i data-lucide="file-spreadsheet" style="color: #10b981; width: 20px; height: 20px;"></i> Xuất Dữ Liệu Excel (CSV)',
      'appearance': '<i data-lucide="palette" style="color: #6366f1; width: 20px; height: 20px;"></i> Giao Diện & Hệ Thống'
    };

    if (titleEl && titleMap[sectionId]) {
      titleEl.innerHTML = titleMap[sectionId];
    }

    // Cuộn lên đầu trang
    const settingsView = document.getElementById('view-settings');
    if (settingsView) settingsView.scrollTop = 0;
    window.scrollTo(0, 0);

    if (window.lucide) lucide.createIcons();
  },

  // Quay lại màn hình menu Hub
  backToHub() {
    this.currentSection = null;
    const hubView = document.getElementById('settings-hub-view');
    const detailView = document.getElementById('settings-detail-view');

    if (detailView) detailView.style.display = 'none';
    if (hubView) hubView.style.display = 'block';

    const panels = document.querySelectorAll('.settings-detail-panel');
    panels.forEach(p => p.classList.remove('active'));

    const settingsView = document.getElementById('view-settings');
    if (settingsView) settingsView.scrollTop = 0;
    window.scrollTo(0, 0);

    this.updateHubBadges();
    if (window.lucide) lucide.createIcons();
  },

  // Xoá Cache & Cập nhật
  clearAppCache() {
    if (typeof window.clearAppCacheDirectly === 'function') {
      return window.clearAppCacheDirectly();
    }
  },

  // Khôi phục cài đặt gốc
  factoryResetApp() {
    if (typeof window.factoryResetAppDirectly === 'function') {
      return window.factoryResetAppDirectly();
    }
  },

  // Cập nhật thông tin dung lượng bộ nhớ Cache & Storage
  async updateStorageUsage() {
    const textEl = document.getElementById('settings-storage-usage-text');
    if (!textEl) return;
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const usedMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(1);
        textEl.textContent = `~${usedMB} MB (IndexedDB & Cache)`;
      } else {
        textEl.textContent = 'Hoạt động bình thường';
      }
    } catch (e) {
      textEl.textContent = 'Khả dụng';
    }
  },

  // Đóng / mở khối thiết lập nâng cao (Accordion)
  toggleAccordion(headerEl) {
    if (!headerEl) return;
    const accordion = headerEl.closest('.settings-accordion');
    if (!accordion) return;

    accordion.classList.toggle('expanded');
    if (window.lucide) lucide.createIcons();
  },

  // Cập nhật trạng thái hiển thị nhanh trên từng mục ở Hub
  async updateHubBadges() {
    // 1. Google Drive
    const gBadge = document.getElementById('hub-gdrive-badge');
    const gDesc = document.getElementById('hub-gdrive-desc');
    const gDrive = window.googleDriveService;
    if (gBadge && gDesc) {
      if (gDrive && gDrive.userProfile && gDrive.userProfile.email) {
        gBadge.className = 'settings-status-pill pill-green';
        gBadge.textContent = 'Đã kết nối';
        gDesc.textContent = `Tài khoản: ${gDrive.userProfile.email}`;
      } else {
        gBadge.className = 'settings-status-pill pill-gray';
        gBadge.textContent = 'Chưa kết nối';
        gDesc.textContent = 'Lưu trữ đám mây Google & mã hóa E2EE';
      }
    }

    // 2. Dropbox
    const dBadge = document.getElementById('hub-dropbox-badge');
    const dDesc = document.getElementById('hub-dropbox-desc');
    const dbx = window.dropboxService;
    if (dBadge && dDesc) {
      if (dbx && (dbx.refreshToken || dbx.accessToken) && dbx.userProfile) {
        dBadge.className = 'settings-status-pill pill-green';
        dBadge.textContent = 'Đã kết nối';
        dDesc.textContent = `Tài khoản: ${dbx.userProfile.name || dbx.userProfile.email || 'Dropbox'}`;
      } else {
        dBadge.className = 'settings-status-pill pill-gray';
        dBadge.textContent = 'Chưa kết nối';
        dDesc.textContent = 'Đồng bộ chuẩn PKCE mượt mà trên iPhone';
      }
    }

    // 3. Máy Chủ Riêng Docker
    const sBadge = document.getElementById('hub-server-badge');
    const sDesc = document.getElementById('hub-server-desc');
    const sService = window.serverSyncService;
    if (sBadge && sDesc) {
      if (sService && sService.token && sService.userProfile) {
        sBadge.className = 'settings-status-pill pill-green';
        sBadge.textContent = 'Đã kết nối';
        sDesc.textContent = `Tài khoản: ${sService.userProfile.email || sService.userProfile.name}`;
      } else if (sService && sService.serverUrl) {
        sBadge.className = 'settings-status-pill pill-blue';
        sBadge.textContent = 'Sẵn sàng';
        sDesc.textContent = `Địa chỉ: ${sService.serverUrl}`;
      } else {
        sBadge.className = 'settings-status-pill pill-gray';
        sBadge.textContent = 'Chưa kết nối';
        sDesc.textContent = 'Máy chủ tự lưu trữ Self-Hosted tốc độ cao & đa sổ';
      }
    }

    // 4. Thư Mục Máy PC
    const lBadge = document.getElementById('hub-local-badge');
    const lDesc = document.getElementById('hub-local-desc');
    const bService = window.BackupService;
    if (lBadge && lDesc) {
      if (bService && bService.hasLocalDirectory && bService.hasLocalDirectory()) {
        lBadge.className = 'settings-status-pill pill-green';
        lBadge.textContent = 'Đang lưu';
        lDesc.textContent = `📁 Thư mục: ${bService.localDirName || 'Đã liên kết'}`;
      } else {
        lBadge.className = 'settings-status-pill pill-gray';
        lBadge.textContent = 'Chưa chọn';
        lDesc.textContent = 'Tự động ghi file sao lưu vào ổ cứng máy tính';
      }
    }

    // 5. Giao Diện
    const tBadge = document.getElementById('hub-theme-badge');
    if (tBadge) {
      const themeSetting = await db.settings.get('theme');
      const themeVal = (themeSetting && themeSetting.value) || 'dark';
      const themeLabels = { dark: 'Tối', light: 'Sáng', system: 'Hệ thống' };
      tBadge.textContent = themeLabels[themeVal] || 'Tối';
    }
  },

  async loadSettings() {
    // 1. Load Google Client ID
    const clientIdSetting = await db.settings.get('googleClientId');
    const clientIdInput = document.getElementById('settings-client-id');
    if (clientIdInput) {
      if (clientIdSetting && clientIdSetting.value) {
        clientIdInput.value = clientIdSetting.value;
      } else if (window.EnvConfig && window.EnvConfig.get('GOOGLE_CLIENT_ID')) {
        clientIdInput.value = window.EnvConfig.get('GOOGLE_CLIENT_ID');
      }
    }

    // 1.1 Load Cloudflare Worker URL & Secret
    const workerSetting = await db.settings.get('googleWorkerUrl');
    const workerInput = document.getElementById('settings-google-worker-url');
    if (workerInput) {
      if (workerSetting && workerSetting.value) {
        workerInput.value = workerSetting.value;
      } else if (window.EnvConfig && window.EnvConfig.get('GOOGLE_WORKER_URL')) {
        workerInput.value = window.EnvConfig.get('GOOGLE_WORKER_URL');
      }
    }

    const secretSetting = await db.settings.get('googleClientSecret');
    const secretInput = document.getElementById('settings-google-client-secret');
    if (secretInput) {
      if (secretSetting && secretSetting.value) {
        secretInput.value = secretSetting.value;
      } else if (window.EnvConfig && window.EnvConfig.get('GOOGLE_CLIENT_SECRET')) {
        secretInput.value = window.EnvConfig.get('GOOGLE_CLIENT_SECRET');
      }
    }

    // 1.2 Load Dropbox App Key & Shared Settings
    const dbxKeySetting = await db.settings.get('dropboxAppKey');
    const dbxKeyInput = document.getElementById('settings-dropbox-app-key');
    if (dbxKeyInput) {
      if (dbxKeySetting && dbxKeySetting.value) {
        dbxKeyInput.value = dbxKeySetting.value;
      } else if (window.EnvConfig && window.EnvConfig.get('DROPBOX_APP_KEY')) {
        dbxKeyInput.value = window.EnvConfig.get('DROPBOX_APP_KEY');
      }
    }

    const dbxShareLinkSetting = await db.settings.get('dropboxSharedLink');
    const dbxShareInput = document.getElementById('settings-dropbox-share-link');
    if (dbxShareLinkSetting && dbxShareInput) {
      dbxShareInput.value = dbxShareLinkSetting.value;
    }

    const dbxFolderSetting = await db.settings.get('dropboxFolderPath');
    const dbxFolderInput = document.getElementById('settings-dropbox-folder-path');
    if (dbxFolderInput) {
      dbxFolderInput.value = (dbxFolderSetting && dbxFolderSetting.value) || '';
    }

    const dbxRoleSetting = await db.settings.get('dropboxRole');
    const dbxRoleBadge = document.getElementById('dropbox-role-badge');
    if (dbxRoleBadge) {
      const isMember = (dbxRoleSetting && dbxRoleSetting.value === 'member');
      dbxRoleBadge.textContent = isMember ? 'Thành Viên' : 'Chủ Sổ';
      dbxRoleBadge.style.background = isMember ? 'rgba(16, 185, 129, 0.12)' : 'rgba(0, 97, 255, 0.12)';
      dbxRoleBadge.style.color = isMember ? '#10b981' : '#0061ff';
    }

    // 2. Load Google User Profile & Role
    const profileSetting = await db.settings.get('googleUserProfile');
    if (profileSetting && profileSetting.value) {
      this.renderGoogleProfile(profileSetting.value);
    } else if (window.googleDriveService && window.googleDriveService.userProfile) {
      this.renderGoogleProfile(window.googleDriveService.userProfile);
    }

    // 3. Load Storage Location
    const locSetting = await db.settings.get('driveStorageLocation');
    const loc = (locSetting && locSetting.value) || 'appDataFolder';
    const appDataRadio = document.getElementById('loc-radio-appdata');
    const customRadio = document.getElementById('loc-radio-custom');
    const appDataCard = document.getElementById('loc-card-appdata');
    const customCard = document.getElementById('loc-card-custom');
    const customWrap = document.getElementById('custom-folder-name-wrap');

    if (loc === 'customFolder') {
      if (customRadio) customRadio.checked = true;
      if (customCard) customCard.classList.add('active');
      if (appDataCard) appDataCard.classList.remove('active');
      if (customWrap) customWrap.style.display = 'block';
    } else {
      if (appDataRadio) appDataRadio.checked = true;
      if (appDataCard) appDataCard.classList.add('active');
      if (customCard) customCard.classList.remove('active');
      if (customWrap) customWrap.style.display = 'none';
    }

    const folderNameSetting = await db.settings.get('driveCustomFolderName');
    const folderInput = document.getElementById('settings-drive-folder-name');
    if (folderNameSetting && folderInput) {
      folderInput.value = folderNameSetting.value;
    }

    // 4. Load Vault Password (E2EE)
    const vaultPassSetting = await db.settings.get('syncEncryptionPassword');
    const vaultPassInput = document.getElementById('settings-vault-password');
    if (vaultPassInput) {
      if (document.activeElement !== vaultPassInput) {
        vaultPassInput.value = '';
      }
      if (vaultPassSetting && vaultPassSetting.value) {
        vaultPassInput.placeholder = 'Nhập mới để đổi mật khẩu';
      } else {
        vaultPassInput.placeholder = 'Để trống nếu không mã hóa';
      }
    }

    // 5. Load Mirror Backup setting
    const mirrorSetting = await db.settings.get('autoMirrorToPersonalDrive');
    const mirrorToggle = document.getElementById('settings-auto-mirror');
    if (mirrorSetting && mirrorToggle) {
      mirrorToggle.checked = !!mirrorSetting.value;
    }

    // 6. Load Local Folder Backup
    this.renderLocalFolderStatus();

    // 7. Load Auto Sync & Privacy Mode
    const autoSyncSetting = await db.settings.get('autoSyncEnabled');
    const autoSyncToggle = document.getElementById('settings-auto-sync');
    if (autoSyncToggle) {
      autoSyncToggle.checked = autoSyncSetting ? !!autoSyncSetting.value : true;
    }

    const dbxAutoSyncSetting = await db.settings.get('dropboxAutoSync');
    const dbxAutoSyncToggle = document.getElementById('settings-dropbox-auto-sync');
    if (dbxAutoSyncToggle) {
      dbxAutoSyncToggle.checked = dbxAutoSyncSetting !== undefined ? !!dbxAutoSyncSetting.value : true;
    }

    const privacySetting = await db.settings.get('privacyMode');
    const privacyToggle = document.getElementById('settings-privacy-mode');
    if (privacySetting && privacyToggle) {
      privacyToggle.checked = !!privacySetting.value;
    }

    // 8. Load Last Sync Time Display
    const lastSyncSetting = await db.settings.get('lastSyncTime');
    const lastSyncDisplay = document.getElementById('settings-last-sync-time');
    if (lastSyncSetting && lastSyncDisplay) {
      lastSyncDisplay.textContent = new Date(lastSyncSetting.value).toLocaleString('vi-VN');
    }

    // 9. Load Dropbox Account UI
    this.updateDropboxAccountUI();

    // 10. Load Server Sync UI
    this.renderServerSyncUI();

    // 11. Cập nhật các badge tóm tắt trên Hub
    this.updateHubBadges();
  },

  renderGoogleProfile(profile) {
    const card = document.getElementById('google-profile-card');
    const avatar = document.getElementById('google-profile-avatar');
    const nameEl = document.getElementById('google-profile-name');
    const emailEl = document.getElementById('google-profile-email');
    const roleBadge = document.getElementById('google-vault-role-badge');
    const loginBtn = document.getElementById('btn-google-login');

    if (!card) return;

    if (profile && profile.email) {
      card.style.display = 'block';
      if (avatar) avatar.src = profile.picture || './assets/icons/google-drive.svg';
      if (nameEl) nameEl.textContent = profile.name || 'Tài khoản Google';
      if (emailEl) emailEl.textContent = profile.email;

      const isOwner = (window.googleDriveService && window.googleDriveService.vaultRole !== 'member');
      if (roleBadge) {
        roleBadge.textContent = isOwner ? 'Chủ sổ' : 'Thành viên';
        roleBadge.className = isOwner ? 'sync-vault-role-pill owner' : 'sync-vault-role-pill editor';
      }

      if (loginBtn) {
        loginBtn.innerHTML = '<i data-lucide="check-circle" style="width: 16px; height: 16px; color: #10b981;"></i> Đã Đăng Nhập';
      }
    } else {
      card.style.display = 'none';
      if (loginBtn) {
        loginBtn.innerHTML = '<i data-lucide="log-in" style="width: 16px; height: 16px;"></i> Đăng Nhập Google';
      }
    }

    this.updateHubBadges();
    if (window.lucide) lucide.createIcons();
  },

  renderLocalFolderStatus() {
    const nameEl = document.getElementById('local-folder-name');
    const statusEl = document.getElementById('local-folder-status');
    const btnText = document.getElementById('btn-select-local-folder-text');
    const selectBtn = document.getElementById('btn-select-local-folder');
    const removeBtn = document.getElementById('btn-remove-local-folder');
    const iosNotice = document.getElementById('local-folder-ios-notice');

    const isSupported = window.BackupService && window.BackupService.isFileSystemAccessSupported();

    if (!isSupported) {
      if (iosNotice) iosNotice.style.display = 'block';
      if (nameEl) nameEl.textContent = 'Thiết bị này không hỗ trợ tự động ghi thư mục';
      if (statusEl) statusEl.textContent = 'Dành cho Chrome/Edge trên PC. Trên iPhone, bạn hãy dùng Google Drive (ở trên) hoặc bấm Tải Về Máy.';
      if (selectBtn) {
        selectBtn.className = 'btn-secondary btn-sm';
        selectBtn.innerHTML = '<i data-lucide="download" style="width: 14px; height: 14px;"></i> <span id="btn-select-local-folder-text">Tải Về Máy Ngay</span>';
      }
      if (removeBtn) removeBtn.style.display = 'none';
      if (window.lucide) lucide.createIcons();
      this.updateHubBadges();
      return;
    }

    if (iosNotice) iosNotice.style.display = 'none';
    const hasFolder = window.BackupService && window.BackupService.hasLocalDirectory();
    if (hasFolder) {
      if (nameEl) nameEl.textContent = `📁 Đang lưu: ${window.BackupService.localDirName}`;
      if (statusEl) statusEl.textContent = 'Tự động sao lưu vào ổ cứng sau mỗi lần thêm/sửa giao dịch';
      if (selectBtn) {
        selectBtn.className = 'btn-primary btn-sm';
        selectBtn.innerHTML = '<i data-lucide="folder-sync" style="width: 14px; height: 14px;"></i> <span id="btn-select-local-folder-text">Đổi Thư Mục</span>';
      }
      if (removeBtn) removeBtn.style.display = 'inline-flex';
    } else {
      if (nameEl) nameEl.textContent = 'Chưa chọn thư mục sao lưu';
      if (statusEl) statusEl.textContent = 'Tự động ghi file SoThuChi_AutoBackup vào ổ cứng khi có thay đổi';
      if (selectBtn) {
        selectBtn.className = 'btn-primary btn-sm';
        selectBtn.innerHTML = '<i data-lucide="folder-plus" style="width: 14px; height: 14px;"></i> <span id="btn-select-local-folder-text">Chọn Thư Mục</span>';
      }
      if (removeBtn) removeBtn.style.display = 'none';
    }

    this.updateHubBadges();
    if (window.lucide) lucide.createIcons();
  },

  updateDropboxAccountUI() {
    const infoBox = document.getElementById('dropbox-account-info');
    const nameEl = document.getElementById('dropbox-user-name');
    const emailEl = document.getElementById('dropbox-user-email');
    const avatarEl = document.getElementById('dropbox-user-avatar');
    const connectBtn = document.getElementById('btn-dropbox-connect');

    const dbx = window.dropboxService;
    if (dbx && (dbx.refreshToken || dbx.accessToken) && dbx.userProfile) {
      if (infoBox) infoBox.style.display = 'block';
      if (nameEl) nameEl.textContent = dbx.userProfile.name || 'Dropbox User';
      if (emailEl) emailEl.textContent = dbx.userProfile.email || '';
      if (avatarEl && dbx.userProfile.picture) avatarEl.src = dbx.userProfile.picture;
      if (connectBtn) connectBtn.style.display = 'none';
    } else {
      if (infoBox) infoBox.style.display = 'none';
      if (connectBtn) connectBtn.style.display = 'inline-flex';
    }

    this.updateHubBadges();
    if (window.lucide) lucide.createIcons();
  },

  // Cập nhật giao diện Đồng bộ Máy Chủ Riêng Docker
  renderServerSyncUI() {
    const sService = window.serverSyncService;
    if (!sService) return;

    // 1. Cấu hình hiển thị URL Máy Chủ:
    const isSelfHost = typeof sService.isSelfHosted === 'function' ? sService.isSelfHosted() : false;
    const selfhostBanner = document.getElementById('server-selfhost-banner');
    const selfhostOrigin = document.getElementById('server-selfhost-origin');
    const urlContainer = document.getElementById('server-url-container');
    const cardSlot = document.getElementById('server-url-card-slot');
    const unloggedSlot = document.getElementById('server-url-unlogged-slot');
    const urlInput = document.getElementById('settings-server-url');

    if (urlInput && !urlInput.value && sService.serverUrl) {
      urlInput.value = sService.serverUrl;
    }

    if (isSelfHost) {
      // 1. NẾU DÙNG MÁY CHỦ RIÊNG (Self-Hosted): ẨN HOÀN TOÀN TRƯỜNG URL
      if (urlContainer) urlContainer.style.display = 'none';
      if (cardSlot) cardSlot.style.display = 'none';
      if (unloggedSlot) unloggedSlot.style.display = 'none';
      if (selfhostBanner) selfhostBanner.style.display = 'none';
    } else {
      // 2. Nếu truy cập từ bên ngoài (Public Web / GitHub Pages): Hiển thị trường URL để nhập máy chủ
      if (selfhostBanner) selfhostBanner.style.display = 'none';
      if (urlContainer) urlContainer.style.display = 'block';
      if (sService.userProfile && sService.token && cardSlot) {
        cardSlot.style.display = 'block';
        if (urlContainer && urlContainer.parentElement !== cardSlot) {
          cardSlot.appendChild(urlContainer);
        }
      } else if (unloggedSlot) {
        unloggedSlot.style.display = 'block';
        if (urlContainer && urlContainer.parentElement !== unloggedSlot) {
          unloggedSlot.appendChild(urlContainer);
        }
      }
    }

    // 1.5 Cập nhật Mật khẩu Mã Hóa Sổ (E2EE)
    const serverPassInput = document.getElementById('settings-server-vault-password');
    const encBadge = document.getElementById('server-encryption-badge');
    if (serverPassInput) {
      // Tuyệt đối không hiển thị mật khẩu đã nhập để tránh ai đó vào xem trộm mật khẩu cá nhân
      if (document.activeElement !== serverPassInput) {
        serverPassInput.value = '';
      }
      if (sService.encryptionPassword) {
        serverPassInput.placeholder = 'Nhập mới để đổi mật khẩu';
      } else {
        serverPassInput.placeholder = 'Để trống nếu không mã hóa';
      }
    }
    const disableEncBtn = document.getElementById('btn-disable-server-encryption');
    const saveEncBtn = document.getElementById('btn-save-server-vault-password');
    const saveEncText = document.getElementById('btn-save-server-vault-password-text');
    if (encBadge) {
      if (sService.encryptionPassword) {
        encBadge.textContent = 'Đã bật E2EE';
        encBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        encBadge.style.color = '#10b981';
        if (disableEncBtn) disableEncBtn.style.display = 'inline-flex';
        if (saveEncText) saveEncText.textContent = 'Đổi mật khẩu';
        else if (saveEncBtn) saveEncBtn.textContent = 'Đổi mật khẩu';
      } else {
        encBadge.textContent = 'Chưa mã hóa';
        encBadge.style.background = 'rgba(100, 116, 139, 0.12)';
        encBadge.style.color = 'var(--text-muted)';
        if (disableEncBtn) disableEncBtn.style.display = 'none';
        if (saveEncText) saveEncText.textContent = 'Lưu';
        else if (saveEncBtn) saveEncBtn.textContent = 'Lưu';
      }
    }

    // 2. Cập nhật Status Badge (fallback)
    const badge = document.getElementById('server-status-badge');
    const text = document.getElementById('server-status-text');
    if (badge && text) {
      if (sService.token) {
        badge.className = 'badge-status badge-connected';
        text.textContent = 'Đã kết nối';
      } else if (sService.connectionStatus === 'connected') {
        badge.className = 'badge-status badge-connected';
        text.textContent = 'Máy chủ sẵn sàng';
      } else if (sService.connectionStatus === 'checking') {
        badge.className = 'badge-status badge-checking';
        text.textContent = 'Đang kiểm tra...';
      } else {
        badge.className = 'badge-status badge-disconnected';
        text.textContent = 'Chưa kết nối';
      }
    }

    // 3. Cập nhật Auth & User Profile Card
    const userCard = document.getElementById('server-user-card');
    const loginPrompt = document.getElementById('server-login-prompt');
    const multiVaultContainer = document.getElementById('server-multi-vault-container');
    const sharingPanel = document.getElementById('server-sharing-panel');

    if (sService.userProfile && sService.token) {
      if (userCard) userCard.style.display = 'block';
      if (loginPrompt) loginPrompt.style.display = 'none';

      const avatar = document.getElementById('server-user-avatar');
      const nameEl = document.getElementById('server-user-name');
      const emailEl = document.getElementById('server-user-email');

      if (avatar) avatar.src = sService.userProfile.picture || './assets/icons/icon.svg';
      if (nameEl) nameEl.textContent = sService.userProfile.name || 'Người dùng Google';
      if (emailEl) emailEl.textContent = sService.userProfile.email || '';

      const activeVault = sService.getActiveVault ? sService.getActiveVault() : null;
      const isOwner = !activeVault || activeVault.role === 'owner';

      if (multiVaultContainer) multiVaultContainer.style.display = 'block';
      if (sharingPanel) sharingPanel.style.display = isOwner ? 'block' : 'none';
    } else {
      if (userCard) userCard.style.display = 'none';
      if (loginPrompt) loginPrompt.style.display = 'block';
      if (multiVaultContainer) multiVaultContainer.style.display = 'none';
      if (sharingPanel) sharingPanel.style.display = 'none';
    }

    // 4. Render danh sách Sổ dạng List (Sổ đang đồng bộ & Sổ được share)
    this.renderServerVaultsLists();

    // Đồng bộ select ẩn cho tương thích ngược
    const vaultSelect = document.getElementById('settings-server-vault-select');
    if (vaultSelect && sService.vaults && sService.vaults.length > 0) {
      vaultSelect.innerHTML = sService.vaults.map(v => `
        <option value="${v.id}" ${v.id === sService.activeVaultId ? 'selected' : ''}>
          ${v.name} ${v.role === 'owner' ? '(Chủ sổ)' : '(Thành viên)'}
        </option>
      `).join('');
    }

    // 5. Cập nhật Toggle Tự động đồng bộ
    const autoSync = document.getElementById('settings-server-auto-sync');
    if (autoSync) {
      autoSync.checked = !!sService.autoSync;
    }

    // 6. Cập nhật Thời gian đồng bộ lần cuối
    const timeEl = document.getElementById('settings-server-last-sync-time');
    if (timeEl) {
      timeEl.textContent = sService.lastSyncTime ? new Date(sService.lastSyncTime).toLocaleString('vi-VN') : 'Chưa đồng bộ';
    }

    this.renderServerSharesList();
    this.updateHubBadges();
    if (window.lucide) lucide.createIcons();
  },

  // Render danh sách Sổ trên Máy Chủ (Bảng Sổ đang đồng bộ & Bảng Sổ được chia sẻ riêng biệt)
  renderServerVaultsLists() {
    const sService = window.serverSyncService;
    const myVaultsContainer = document.getElementById('server-my-vaults-list');
    const sharedVaultsContainer = document.getElementById('server-shared-vaults-list');

    if (!sService || !sService.vaults || sService.vaults.length === 0) {
      if (myVaultsContainer) {
        myVaultsContainer.innerHTML = '<div class="server-vaults-empty">Chưa có sổ nào trên máy chủ. Bấm nút "+" để thêm sổ mới.</div>';
      }
      if (sharedVaultsContainer) {
        sharedVaultsContainer.innerHTML = '<div class="server-vaults-empty">Chưa có sổ nào được chia sẻ với bạn.</div>';
      }
      if (window.lucide) lucide.createIcons();
      return;
    }

    const myVaults = sService.vaults.filter(v => v.role === 'owner');
    const sharedVaults = sService.vaults.filter(v => v.role !== 'owner');
    const esc = typeof escapeHTML === 'function' ? escapeHTML : (s => s || '');

    // 1. Render Sổ Cá Nhân (Sổ do tôi sở hữu - 2 hàng: hàng trên Tên sổ, hàng dưới Chú thích & Nút bấm)
    if (myVaultsContainer) {
      if (myVaults.length === 0) {
        myVaultsContainer.innerHTML = '<div class="server-vaults-empty">Không có sổ cá nhân nào. Hãy bấm "+" để tạo sổ mới.</div>';
      } else {
        myVaultsContainer.innerHTML = myVaults.map(v => {
          const isActive = v.id === sService.activeVaultId;
          return `
            <div class="server-vault-row ${isActive ? 'is-active' : ''}" data-vault-id="${v.id}" role="button" tabindex="0" title="${isActive ? 'Sổ đang được chọn' : 'Chạm để chọn sổ này'}">
              <!-- Hàng trên: Tên sổ & Nhãn trạng thái -->
              <div class="server-vault-row-top">
                <div class="server-vault-name-text ${isActive ? 'active-name' : ''}">${esc(v.name)}</div>
                ${isActive ? '<span class="vault-pill-active">Đang dùng</span>' : ''}
              </div>
              <!-- Hàng dưới: Chú thích bên trái (màu chuẩn sync-vault-role-pill) & Các nút bấm góc phải -->
              <div class="server-vault-row-bottom">
                <div class="server-vault-caption-text">
                  <span class="sync-vault-role-pill owner">Chủ sổ</span>
                </div>
                <div class="server-vault-icon-actions">
                  <button type="button" class="btn-vault-icon btn-vault-rename" data-vault-id="${v.id}" data-vault-name="${esc(v.name)}" title="Đổi tên sổ">
                    <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
                  </button>
                  <button type="button" class="btn-vault-icon btn-vault-copy" data-vault-id="${v.id}" data-vault-name="${esc(v.name)}" title="Sao chép sổ">
                    <i data-lucide="copy" style="width: 14px; height: 14px;"></i>
                  </button>
                  <button type="button" class="btn-vault-icon btn-vault-history" data-vault-id="${v.id}" data-vault-name="${esc(v.name)}" title="Lịch sử snapshot">
                    <i data-lucide="history" style="width: 14px; height: 14px;"></i>
                  </button>
                  <button type="button" class="btn-vault-icon btn-vault-delete" data-vault-id="${v.id}" data-vault-name="${esc(v.name)}" title="Xóa sổ">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // 2. Render Sổ Được Share (Riêng 1 bảng - 2 hàng: Chỉ xem / Ghi chép có màu giống trên trạng thái đồng bộ)
    if (sharedVaultsContainer) {
      if (sharedVaults.length === 0) {
        sharedVaultsContainer.innerHTML = '<div class="server-vaults-empty">Chưa có sổ nào được chia sẻ với bạn.</div>';
      } else {
        sharedVaultsContainer.innerHTML = sharedVaults.map(v => {
          const isActive = v.id === sService.activeVaultId;
          const isEditor = v.role === 'editor';
          const roleClass = isEditor ? 'editor' : 'viewer';
          const roleText = isEditor ? 'Ghi chép' : 'Chỉ xem';
          const ownerText = v.owner_email ? `<span style="opacity: 0.7; font-size: 0.72rem; margin-left: 5px;">• Từ: ${esc(v.owner_email)}</span>` : '';
          return `
            <div class="server-vault-row ${isActive ? 'is-active' : ''}" data-vault-id="${v.id}" role="button" tabindex="0" title="${isActive ? 'Sổ đang được chọn' : 'Chạm để chọn sổ này'}">
              <!-- Hàng trên: Tên sổ & Nhãn trạng thái -->
              <div class="server-vault-row-top">
                <div class="server-vault-name-text ${isActive ? 'active-name' : ''}">${esc(v.name)}</div>
                ${isActive ? '<span class="vault-pill-active">Đang dùng</span>' : ''}
              </div>
              <!-- Hàng dưới: Chú thích quyền hạn & Người chia sẻ; nút bấm góc phải -->
              <div class="server-vault-row-bottom">
                <div class="server-vault-caption-text">
                  <span class="sync-vault-role-pill ${roleClass}">${roleText}</span>${ownerText}
                </div>
                <div class="server-vault-icon-actions">
                  ${isEditor ? `
                  <button type="button" class="btn-vault-icon btn-vault-rename" data-vault-id="${v.id}" data-vault-name="${esc(v.name)}" title="Đổi tên sổ">
                    <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
                  </button>
                  ` : ''}
                  <button type="button" class="btn-vault-icon btn-vault-copy" data-vault-id="${v.id}" data-vault-name="${esc(v.name)}" title="Sao chép sổ">
                    <i data-lucide="copy" style="width: 14px; height: 14px;"></i>
                  </button>
                  <button type="button" class="btn-vault-icon btn-vault-history" data-vault-id="${v.id}" data-vault-name="${esc(v.name)}" title="Lịch sử snapshot">
                    <i data-lucide="history" style="width: 14px; height: 14px;"></i>
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    if (window.lucide) lucide.createIcons();
  },

  // Render danh sách thành viên được chia sẻ trên Máy chủ riêng
  renderServerSharesList() {
    const sService = window.serverSyncService;
    const listEl = document.getElementById('server-shares-list');
    if (!listEl) return;

    if (sService && sService.shares && sService.shares.length > 0) {
      listEl.innerHTML = sService.shares.map(s => `
        <div class="server-share-item">
          <div class="server-share-info">
            <i data-lucide="user-check" style="width: 14px; height: 14px; color: #10b981;"></i>
            <span class="server-share-email">${s.email}</span>
            <span class="badge" style="font-size: 0.7rem; padding: 2px 6px; background: rgba(59, 130, 246, 0.12); color: #3b82f6; border-radius: 9999px;">
              ${s.role === 'editor' ? 'Ghi chép' : 'Chỉ xem'}
            </span>
          </div>
          <button type="button" class="btn-text btn-server-remove-share" data-share-id="${s.id}" style="color: #ef4444; font-size: 0.78rem; padding: 2px 6px; border: none; background: none; cursor: pointer;" title="Xóa quyền truy cập">
            <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
          </button>
        </div>
      `).join('');
    } else {
      listEl.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">Chưa có thành viên nào được chia sẻ.</div>';
    }

    if (window.lucide) lucide.createIcons();
  },

  // Mở modal Lịch sử Snapshot của Sổ trên Máy chủ riêng
  async openVaultHistoryModal(vaultId = null, vaultName = null) {
    const sService = window.serverSyncService;
    const targetVaultId = vaultId || (sService ? sService.activeVaultId : null);
    if (!sService || !targetVaultId) return;

    const modal = document.getElementById('modal-server-vault-history');
    if (!modal) return;

    let targetVault = null;
    if (sService.vaults) {
      targetVault = sService.vaults.find(v => v.id === targetVaultId);
    }
    const displayName = vaultName || (targetVault ? targetVault.name : 'Hiện tại');
    const vaultNameEl = document.getElementById('server-history-vault-name');
    if (vaultNameEl) {
      vaultNameEl.textContent = `Sổ: ${displayName}`;
    }

    const loadingEl = document.getElementById('server-history-loading');
    const emptyEl = document.getElementById('server-history-empty');
    const listEl = document.getElementById('server-history-list');

    if (loadingEl) loadingEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    if (listEl) listEl.innerHTML = '';

    modal.classList.add('open');
    if (window.lucide) lucide.createIcons();

    try {
      const history = await sService.getVaultHistory(targetVaultId);
      if (loadingEl) loadingEl.style.display = 'none';

      if (!history || history.length === 0) {
        if (emptyEl) emptyEl.style.display = 'block';
        return;
      }

      const isViewer = targetVault && targetVault.role === 'viewer';

      listEl.innerHTML = history.map((item, idx) => {
        const dateStr = item.synced_at ? new Date(item.synced_at).toLocaleString('vi-VN') : 'Không rõ thời gian';
        const user = item.updated_by || 'Hệ thống';
        const sizeKb = item.data_size ? (item.data_size / 1024).toFixed(1) + ' KB' : '';
        const isLatest = idx === 0;

        return `
          <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div style="min-width: 0; flex: 1;">
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 3px; flex-wrap: wrap;">
                <span class="badge" style="font-size: 0.72rem; padding: 2px 7px; background: rgba(168, 85, 247, 0.15); color: #a855f7; font-weight: 700; border-radius: 6px;">
                  v${item.version}
                </span>
                ${isLatest ? '<span class="badge" style="font-size: 0.68rem; padding: 2px 6px; background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 600; border-radius: 6px;">Bản hiện tại</span>' : ''}
                <span style="font-size: 0.84rem; font-weight: 600; color: var(--text-primary);">${dateStr}</span>
              </div>
              <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 10px; flex-wrap: wrap;">
                <span><i data-lucide="user" style="width: 12px; height: 12px; vertical-align: middle;"></i> ${user}</span>
                ${sizeKb ? `<span><i data-lucide="database" style="width: 12px; height: 12px; vertical-align: middle;"></i> ${sizeKb}</span>` : ''}
              </div>
            </div>
            <div>
              <button type="button" class="btn-secondary btn-sm btn-restore-snapshot" data-history-id="${item.id}" data-time="${dateStr}" ${isViewer ? 'disabled' : ''} style="font-size: 0.78rem; padding: 5px 10px; display: inline-flex; align-items: center; gap: 4px;" title="Khôi phục dữ liệu sổ về mốc này">
                <i data-lucide="rotate-ccw" style="width: 13px; height: 13px;"></i>
                <span>Khôi phục</span>
              </button>
            </div>
          </div>
        `;
      }).join('');

      if (window.lucide) lucide.createIcons();

      // Gắn sự kiện khôi phục cho từng nút
      listEl.querySelectorAll('.btn-restore-snapshot').forEach(btn => {
        btn.addEventListener('click', async () => {
          const histId = btn.getAttribute('data-history-id');
          const time = btn.getAttribute('data-time');
          if (!histId) return;

          if (!confirm(`Bạn có chắc chắn muốn khôi phục Sổ về bản snapshot lúc:\n${time}?\n\nToàn bộ dữ liệu hiện tại của Sổ trên máy chủ sẽ được thay thế bằng bản này và đồng bộ về máy bạn!`)) {
            return;
          }

          btn.disabled = true;
          btn.innerHTML = '<i data-lucide="loader" class="spin" style="width: 13px; height: 13px;"></i> Đang phục hồi...';
          if (window.lucide) lucide.createIcons();

          try {
            await sService.restoreVaultSnapshot(histId, targetVaultId);
            showToast('Đã khôi phục dữ liệu snapshot thành công!', 'success');
            if (window.app && window.app.refreshAll) await window.app.refreshAll();
            this.closeVaultHistoryModal();
          } catch (err) {
            showToast('Khôi phục snapshot thất bại: ' + err.message, 'error');
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="rotate-ccw" style="width: 13px; height: 13px;"></i> Khôi phục';
            if (window.lucide) lucide.createIcons();
          }
        });
      });

    } catch (err) {
      if (loadingEl) loadingEl.style.display = 'none';
      showToast('Lỗi tải lịch sử snapshot: ' + err.message, 'error');
    }
  },

  closeVaultHistoryModal() {
    const modal = document.getElementById('modal-server-vault-history');
    if (modal) modal.classList.remove('open');
  },

  bindEvents() {
    // --- DEDICATED SYNC SERVER EVENTS ---
    const sService = window.serverSyncService;

    // Toggle Docker Help
    const dockerHelpBtn = document.getElementById('btn-toggle-server-docker-help');
    const dockerHelpBox = document.getElementById('box-server-docker-help');
    if (dockerHelpBtn && dockerHelpBox) {
      dockerHelpBtn.addEventListener('click', () => {
        const isHidden = dockerHelpBox.style.display === 'none';
        dockerHelpBox.style.display = isHidden ? 'block' : 'none';
        dockerHelpBtn.textContent = isHidden ? 'Ẩn hướng dẫn' : 'Hướng dẫn Docker';
      });
    }

    // Hàm tắt mã hóa E2EE
    const handleDisableEncryption = async () => {
      if (!confirm('Bạn có chắc chắn muốn TẮT MÃ HÓA ĐẦU CUỐI (E2EE)?\n\nDữ liệu trên máy của bạn sẽ được lưu dưới dạng thông thường (plain JSON) lên máy chủ.')) {
        return;
      }

      try {
        showToast('Đang tắt mã hóa và lưu dữ liệu thông thường lên máy chủ...', 'info');
        await sService.disableEncryption();
        showToast('Đã tắt mã hóa E2EE thành công! Sổ đã trở về dạng lưu trữ thông thường.', 'success');
        this.renderServerSyncUI();
      } catch (err) {
        showToast('Lỗi tắt mã hóa: ' + err.message, 'error');
      }
    };

    // Lưu / Đổi Mật khẩu Mã Hóa Sổ Máy Chủ (E2EE)
    const saveServerPassBtn = document.getElementById('btn-save-server-vault-password');
    if (saveServerPassBtn) {
      saveServerPassBtn.addEventListener('click', async () => {
        const input = document.getElementById('settings-server-vault-password');
        const newPass = (input ? input.value : '').trim();
        const curPass = sService ? sService.encryptionPassword : null;

        if (!sService) return;

        // Nếu người dùng để trống ô nhập mật khẩu
        if (!newPass) {
          if (curPass) {
            showToast('Vui lòng nhập mật khẩu mới vào ô bên trên để thay đổi.', 'warning');
          } else {
            showToast('Vui lòng nhập mật khẩu muốn cài đặt.', 'warning');
          }
          return;
        }

        // Trường hợp 1: Đã có mật khẩu trước đó và người dùng nhập mật khẩu khác -> Đổi mật khẩu
        if (curPass && curPass !== newPass) {
          if (!confirm('Bạn có chắc chắn muốn đổi sang mật khẩu mã hóa mới?\n\nDữ liệu trên máy của bạn sẽ được mã hóa với mật khẩu mới và ghi đè đồng bộ lên máy chủ.')) {
            return;
          }
          try {
            showToast('Đang mã hóa lại toàn bộ sổ với mật khẩu mới...', 'info');
            await sService.changeEncryptionPassword(newPass);
            if (input) input.value = '';
            showToast('Đổi mật khẩu mã hóa E2EE thành công! Hãy cập nhật mật khẩu mới trên các thiết bị khác.', 'success');
            this.renderServerSyncUI();
          } catch (err) {
            showToast('Lỗi: ' + err.message, 'error');
          }
          return;
        }

        // Trường hợp 2: Bật mã hóa lần đầu (chưa có mật khẩu trước đó)
        if (!curPass) {
          try {
            showToast('Đang kích hoạt mã hóa E2EE và đồng bộ lên máy chủ...', 'info');
            sService.setEncryptionPassword(newPass);
            if (sService.isConnected && sService.activeVaultId) {
              await sService.overwriteVaultWithLocal(newPass);
            }
            if (input) input.value = '';
            showToast('Đã kích hoạt Mã hóa Đầu cuối (E2EE) thành công!', 'success');
            this.renderServerSyncUI();
          } catch (err) {
            showToast('Lỗi kích hoạt mã hóa: ' + err.message, 'error');
          }
          return;
        }

        // Trường hợp 3: Nhập lại đúng mật khẩu cũ
        showToast('Mật khẩu mã hóa không có thay đổi.', 'info');
      });
    }

    const disableServerPassBtn = document.getElementById('btn-disable-server-encryption');
    if (disableServerPassBtn) {
      disableServerPassBtn.addEventListener('click', handleDisableEncryption);
    }

    // Toggle Ẩn / Hiện mật khẩu mã hóa máy chủ
    const toggleServerPassBtn = document.getElementById('btn-toggle-server-password-visibility');
    if (toggleServerPassBtn) {
      toggleServerPassBtn.addEventListener('click', () => {
        const input = document.getElementById('settings-server-vault-password');
        if (!input) return;
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        toggleServerPassBtn.innerHTML = isPass ? '<i data-lucide="eye-off" style="width: 14px; height: 14px;"></i>' : '<i data-lucide="eye" style="width: 14px; height: 14px;"></i>';
        if (window.lucide) window.lucide.createIcons();
      });
    }

    // Toggle Giải đáp bảo mật & mã hóa máy chủ
    const secHelpBtn = document.getElementById('btn-toggle-server-security-help');
    const secHelpBox = document.getElementById('box-server-security-help');
    if (secHelpBtn && secHelpBox) {
      secHelpBtn.addEventListener('click', () => {
        const isHidden = secHelpBox.style.display === 'none';
        secHelpBox.style.display = isHidden ? 'block' : 'none';
        secHelpBtn.textContent = isHidden ? 'Thu gọn' : 'Tìm hiểu';
      });
    }

    // Kiểm tra kết nối Máy chủ
    const testServerBtn = document.getElementById('btn-test-server-connection');
    if (testServerBtn) {
      testServerBtn.addEventListener('click', async () => {
        const urlInput = document.getElementById('settings-server-url');
        const url = (urlInput ? urlInput.value : '').trim();
        if (!url) {
          showToast('Vui lòng nhập địa chỉ Máy Chủ Riêng', 'warning');
          return;
        }

        testServerBtn.disabled = true;
        showToast('Đang kiểm tra kết nối tới máy chủ...', 'info');
        try {
          if (sService) {
            await sService.setServerUrl(url);
            const ok = await sService.checkConnection();
            if (ok) {
              showToast('Kết nối tới Máy Chủ Riêng thành công!', 'success');
            } else {
              showToast('Không thể kết nối tới máy chủ. Vui lòng kiểm tra lại URL hoặc trạng thái Docker', 'error');
            }
          }
        } catch (e) {
          showToast('Lỗi kết nối máy chủ: ' + e.message, 'error');
        } finally {
          testServerBtn.disabled = false;
        }
      });
    }

    // Lưu URL Máy chủ
    const saveServerUrlBtn = document.getElementById('btn-save-server-url');
    if (saveServerUrlBtn) {
      saveServerUrlBtn.addEventListener('click', async () => {
        const urlInput = document.getElementById('settings-server-url');
        const url = (urlInput ? urlInput.value : '').trim();
        if (sService) {
          await sService.setServerUrl(url);
          showToast('Đã lưu URL Máy Chủ Riêng', 'success');
        }
      });
    }

    // Đăng nhập Máy chủ bằng Google
    const serverGoogleLoginBtn = document.getElementById('btn-server-google-login');
    if (serverGoogleLoginBtn) {
      serverGoogleLoginBtn.addEventListener('click', async () => {
        if (!sService) return;
        const urlInput = document.getElementById('settings-server-url');
        const enteredUrl = (urlInput ? urlInput.value : sService.serverUrl || '').trim().replace(/\/+$/, '');
        if (!enteredUrl) {
          showToast('Vui lòng nhập địa chỉ Máy Chủ Riêng trước khi đăng nhập', 'warning');
          return;
        }
        sService.serverUrl = enteredUrl;
        db.settings.put({ key: 'syncServerUrl', value: enteredUrl }).catch(() => {});

        try {
          // KHÔNG disable button ở đây để tránh làm mất quyền User Activation trên iOS Safari
          showToast('Đang mở màn hình xác thực Google...', 'info');
          const result = await sService.loginWithGoogle();
          showToast(`Đăng nhập máy chủ thành công! Xin chào ${result.user.name}`, 'success');
          if (window.app && window.app.refreshAll) await window.app.refreshAll();
        } catch (err) {
          if (err.message && (err.message.includes('popup_closed') || err.message.includes('Đã đóng') || err.message.includes('hủy'))) {
            showToast('Đã hủy đăng nhập Google', 'info');
          } else if (err.message && err.message.includes('popup_blocked')) {
            showToast('Safari đã chặn cửa sổ đăng nhập. Vui lòng vào Cài đặt iPhone > Safari > Tắt "Chặn cửa sổ bật lên" rồi thử lại.', 'warning', 6500);
          } else {
            showToast('Đăng nhập máy chủ thất bại: ' + err.message, 'error', 5500);
          }
        } finally {
          serverGoogleLoginBtn.disabled = false;
        }
      });
    }

    // Cụm nút icon chọn quyền Chia sẻ Sổ (Editor: Bút / Viewer: Mắt)
    const roleGroup = document.getElementById('server-share-role-group');
    if (roleGroup) {
      roleGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-share-role-icon');
        if (!btn) return;
        const role = btn.getAttribute('data-role');
        const hiddenInput = document.getElementById('settings-server-share-role');
        if (hiddenInput) hiddenInput.value = role;
        roleGroup.querySelectorAll('.btn-share-role-icon').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    }

    // Đăng xuất Máy chủ
    const serverLogoutBtn = document.getElementById('btn-server-logout');
    if (serverLogoutBtn) {
      serverLogoutBtn.addEventListener('click', () => {
        if (window.ServerAuthModals) {
          window.ServerAuthModals.openLogoutModal();
        } else if (confirm('Bạn có chắc muốn đăng xuất khỏi Máy Chủ Riêng?')) {
          if (sService) sService.logout().then(() => showToast('Đã đăng xuất khỏi Máy Chủ Riêng', 'info'));
        }
      });
    }

    // Đổi tài khoản khác (icon góc trên bên phải logo Google)
    const serverReauthBtn = document.getElementById('btn-server-reauth');
    if (serverReauthBtn) {
      serverReauthBtn.addEventListener('click', async () => {
        if (!sService) return;
        try {
          showToast('Đang mở màn hình xác thực Google để đổi tài khoản...', 'info');
          const result = await sService.loginWithGoogle();
          showToast(`Đã đổi sang tài khoản: ${result.user.name || result.user.email}`, 'success');
          if (window.app && window.app.refreshAll) await window.app.refreshAll();
        } catch (err) {
          if (err.message && (err.message.includes('popup_closed') || err.message.includes('Đã đóng') || err.message.includes('hủy'))) {
            showToast('Đã hủy đổi tài khoản', 'info');
          } else {
            showToast('Đổi tài khoản thất bại: ' + err.message, 'error');
          }
        }
      });
    }

    // Ẩn / Hiện chú thích bảo mật trong dòng tiêu đề Mật khẩu Mã Hóa Sổ
    const toggleEncHelp = () => {
      const encHelpBox = document.getElementById('server-enc-help-box');
      if (encHelpBox) {
        const isHidden = encHelpBox.style.display === 'none' || !encHelpBox.style.display;
        encHelpBox.style.display = isHidden ? 'block' : 'none';
      }
    };
    const toggleEncHelpBtn = document.getElementById('btn-toggle-server-enc-help');
    if (toggleEncHelpBtn) toggleEncHelpBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleEncHelp(); });
    const labelEnc = document.getElementById('label-server-vault-password');
    if (labelEnc) labelEnc.addEventListener('click', toggleEncHelp);

    // Chuyển Sổ (Vault Switcher qua select ẩn nếu có)
    const vaultSelectEl = document.getElementById('settings-server-vault-select');
    if (vaultSelectEl) {
      vaultSelectEl.addEventListener('change', async (e) => {
        const vaultId = e.target.value;
        if (!vaultId || !sService) return;
        try {
          showToast('Đang chuyển sổ và đồng bộ dữ liệu...', 'info');
          await sService.switchVault(vaultId);
          showToast('Đã chuyển sang sổ mới thành công!', 'success');
          if (window.app && window.app.refreshAll) await window.app.refreshAll();
        } catch (err) {
          showToast('Lỗi khi chuyển sổ: ' + err.message, 'error');
        }
      });
    }

    // Tạo Sổ mới (Nút icon +)
    const createVaultBtn = document.getElementById('btn-server-create-vault');
    if (createVaultBtn) {
      createVaultBtn.addEventListener('click', async () => {
        const name = prompt('Nhập tên Sổ mới (ví dụ: Sổ Chi Tiêu Gia Đình, Sổ Quỹ Lớp...):');
        if (!name || !name.trim() || !sService) return;
        try {
          showToast('Đang tạo sổ mới trên máy chủ...', 'info');
          const v = await sService.createVault(name.trim());
          showToast(`Đã tạo sổ "${v.name}" thành công!`, 'success');
          if (window.app && window.app.refreshAll) await window.app.refreshAll();
        } catch (err) {
          showToast('Tạo sổ thất bại: ' + err.message, 'error');
        }
      });
    }

    // Quản lý Đa Sổ tương tác trực tiếp (Chạm để chọn sổ, icon Đổi tên, Copy, Lịch sử, Xóa)
    const multiVaultContainer = document.getElementById('server-multi-vault-container');
    if (multiVaultContainer) {
      multiVaultContainer.addEventListener('click', async (e) => {
        // Đổi tên sổ
        const renameBtn = e.target.closest('.btn-vault-rename');
        if (renameBtn && sService) {
          const vaultId = renameBtn.getAttribute('data-vault-id');
          const currentName = renameBtn.getAttribute('data-vault-name') || '';
          const newName = prompt('Nhập tên mới cho sổ:', currentName);
          if (newName && newName.trim() && newName.trim() !== currentName) {
            try {
              await sService.renameVault(vaultId, newName.trim());
              showToast('Đã đổi tên sổ thành công!', 'success');
              if (window.app && window.app.refreshAll) await window.app.refreshAll();
            } catch (err) {
              showToast('Đổi tên sổ thất bại: ' + err.message, 'error');
            }
          }
          return;
        }

        // Sao chép sổ
        const copyBtn = e.target.closest('.btn-vault-copy');
        if (copyBtn && sService) {
          const vaultId = copyBtn.getAttribute('data-vault-id');
          const currentName = copyBtn.getAttribute('data-vault-name') || 'Sổ';
          const name = prompt(`Nhập tên Sổ mới sao chép từ "${currentName}":`, `${currentName} (Bản sao)`);
          if (name && name.trim()) {
            try {
              showToast('Đang sao chép sổ...', 'info');
              const v = await sService.copyVault(vaultId, name.trim());
              showToast(`Đã sao chép sang sổ "${v.name}" thành công!`, 'success');
              if (window.app && window.app.refreshAll) await window.app.refreshAll();
            } catch (err) {
              showToast('Sao chép sổ thất bại: ' + err.message, 'error');
            }
          }
          return;
        }

        // Xem lịch sử snapshot
        const historyBtn = e.target.closest('.btn-vault-history');
        if (historyBtn && sService) {
          const vaultId = historyBtn.getAttribute('data-vault-id');
          const vaultName = historyBtn.getAttribute('data-vault-name');
          this.openVaultHistoryModal(vaultId, vaultName);
          return;
        }

        // Xóa sổ
        const deleteBtn = e.target.closest('.btn-vault-delete');
        if (deleteBtn && sService) {
          const vaultId = deleteBtn.getAttribute('data-vault-id');
          const vaultName = deleteBtn.getAttribute('data-vault-name') || 'sổ';
          const v = sService.vaults ? sService.vaults.find(item => item.id === vaultId) : null;
          if (v && v.role !== 'owner') {
            showToast('Chỉ Chủ Sổ mới có quyền xóa sổ này', 'warning');
            return;
          }
          if (confirm(`Bạn có chắc chắn muốn xóa sổ "${vaultName}" vĩnh viễn trên máy chủ?`)) {
            try {
              await sService.deleteVault(vaultId);
              showToast('Đã xóa sổ thành công!', 'success');
              if (window.app && window.app.refreshAll) await window.app.refreshAll();
            } catch (err) {
              showToast('Xóa sổ thất bại: ' + err.message, 'error');
            }
          }
          return;
        }

        // 3. Tính năng chạm để chọn: Nhấp vào hàng sổ (.server-vault-row) để kích hoạt
        const row = e.target.closest('.server-vault-row');
        if (row && sService) {
          const vaultId = row.getAttribute('data-vault-id');
          if (vaultId && vaultId !== sService.activeVaultId) {
            try {
              showToast('Đang chuyển sang sổ được chọn...', 'info');
              await sService.switchVault(vaultId);
              showToast('Đã kích hoạt sổ thành công!', 'success');
              if (window.app && window.app.refreshAll) await window.app.refreshAll();
            } catch (err) {
              showToast('Lỗi khi chuyển sổ: ' + err.message, 'error');
              this.renderServerVaultsLists();
            }
          }
          return;
        }
      });
    }

    const historyModalOverlay = document.getElementById('modal-server-vault-history');
    if (historyModalOverlay) {
      historyModalOverlay.addEventListener('click', (e) => {
        if (e.target === historyModalOverlay) {
          this.closeVaultHistoryModal();
        }
      });
    }

    // Mời / Chia sẻ Sổ cho Email Google
    const addShareBtn = document.getElementById('btn-server-add-share');
    if (addShareBtn) {
      addShareBtn.addEventListener('click', async () => {
        const emailInput = document.getElementById('settings-server-share-email');
        const roleSelect = document.getElementById('settings-server-share-role');
        const email = (emailInput ? emailInput.value : '').trim();
        const role = roleSelect ? roleSelect.value : 'editor';

        if (!email || !email.includes('@')) {
          showToast('Vui lòng nhập địa chỉ email Google hợp lệ', 'warning');
          return;
        }

        try {
          addShareBtn.disabled = true;
          showToast(`Đang cấp quyền cho ${email}...`, 'info');
          await sService.shareVaultWithEmail(email, role);
          showToast(`Đã chia sẻ sổ thành công cho ${email}!`, 'success');
          if (emailInput) emailInput.value = '';
        } catch (err) {
          showToast('Chia sẻ thất bại: ' + err.message, 'error');
        } finally {
          addShareBtn.disabled = false;
        }
      });
    }

    // Xóa quyền thành viên chia sẻ (Delegated Click)
    const sharesListEl = document.getElementById('server-shares-list');
    if (sharesListEl) {
      sharesListEl.addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('.btn-server-remove-share');
        if (!removeBtn) return;
        const shareId = removeBtn.getAttribute('data-share-id');
        if (!shareId || !sService) return;

        if (confirm('Bạn có chắc muốn xóa quyền truy cập của thành viên này?')) {
          try {
            await sService.removeShare(shareId);
            showToast('Đã xóa quyền thành viên thành công!', 'success');
          } catch (err) {
            showToast('Xóa quyền thất bại: ' + err.message, 'error');
          }
        }
      });
    }

    // Toggle Kích Hoạt Máy Chủ Riêng
    const serverAutoSyncToggle = document.getElementById('settings-server-auto-sync');
    if (serverAutoSyncToggle) {
      serverAutoSyncToggle.addEventListener('change', (e) => {
        if (sService) {
          sService.setAutoSync(e.target.checked);
          showToast(e.target.checked ? 'Đã kích hoạt đồng bộ Máy Chủ Riêng' : 'Đã vô hiệu hóa Máy Chủ Riêng', 'info');
        }
      });
    }

    // Nút Đồng bộ Máy chủ ngay
    const serverSyncNowBtn = document.getElementById('btn-server-sync-now');
    if (serverSyncNowBtn) {
      serverSyncNowBtn.addEventListener('click', async () => {
        if (!sService) return;
        if (!sService.serverUrl || !sService.token) {
          showToast('Vui lòng kết nối và đăng nhập vào Máy Chủ Riêng trước', 'warning');
          return;
        }

        try {
          serverSyncNowBtn.disabled = true;
          serverSyncNowBtn.innerHTML = '<i data-lucide="loader-2" class="spin-animation" style="width: 14px; height: 14px;"></i> <span>Đang đồng bộ...</span>';
          if (window.lucide) lucide.createIcons();

          showToast('Đang đồng bộ dữ liệu với Máy Chủ Riêng...', 'info');
          await sService.sync({ interactive: true });
          showToast('Đồng bộ Máy Chủ Riêng thành công!', 'success');

          if (window.app && window.app.refreshAll) await window.app.refreshAll();
        } catch (err) {
          showToast('Đồng bộ thất bại: ' + err.message, 'error');
        } finally {
          serverSyncNowBtn.disabled = false;
          serverSyncNowBtn.innerHTML = '<i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i> <span>Đồng bộ máy chủ ngay</span>';
          if (window.lucide) lucide.createIcons();
        }
      });
    }

    // Toggle Google Advanced Box
    const advBtn = document.getElementById('btn-toggle-google-advanced');
    const advBox = document.getElementById('google-advanced-box');
    if (advBtn && advBox) {
      advBtn.addEventListener('click', () => {
        advBox.style.display = advBox.style.display === 'none' ? 'block' : 'none';
      });
    }

    // Save Google Advanced Settings
    const saveAdvBtn = document.getElementById('btn-save-google-advanced');
    if (saveAdvBtn) {
      saveAdvBtn.addEventListener('click', async () => {
        const workerUrl = (document.getElementById('settings-google-worker-url')?.value || '').trim();
        const clientSecret = (document.getElementById('settings-google-client-secret')?.value || '').trim();
        await db.settings.put({ key: 'googleWorkerUrl', value: workerUrl });
        await db.settings.put({ key: 'googleClientSecret', value: clientSecret });
        if (window.googleDriveService) {
          window.googleDriveService.workerUrl = workerUrl;
          window.googleDriveService.clientSecret = clientSecret;
        }
        showToast('Đã lưu cấu hình Cloudflare Worker!', 'success');
      });
    }

    // Toggle Dropbox Help Box
    const dbxHelpBtn = document.getElementById('btn-toggle-dropbox-help');
    const dbxHelpBox = document.getElementById('dropbox-help-box');
    if (dbxHelpBtn && dbxHelpBox) {
      dbxHelpBtn.addEventListener('click', () => {
        dbxHelpBox.style.display = dbxHelpBox.style.display === 'none' ? 'block' : 'none';
      });
    }

    // Save Dropbox App Key
    const saveDbxKeyBtn = document.getElementById('btn-save-dropbox-key');
    if (saveDbxKeyBtn) {
      saveDbxKeyBtn.addEventListener('click', async () => {
        const key = (document.getElementById('settings-dropbox-app-key')?.value || '').trim();
        await db.settings.put({ key: 'dropboxAppKey', value: key });
        if (window.dropboxService) window.dropboxService.setAppKey(key);
        showToast('Đã lưu Dropbox App Key', 'success');
      });
    }

    // Dropbox Connect
    const dbxConnectBtn = document.getElementById('btn-dropbox-connect');
    if (dbxConnectBtn) {
      dbxConnectBtn.addEventListener('click', async () => {
        try {
          if (!window.dropboxService) return;
          showToast('Đang kết nối Dropbox PKCE...', 'info');
          await window.dropboxService.requestAuth();
          showToast('Đăng nhập Dropbox thành công! Đang đồng bộ...', 'info');
          await window.dropboxService.sync();
          showToast('Đồng bộ Dropbox hoàn tất!', 'success');
          this.updateDropboxAccountUI();
          if (window.app && window.app.refreshAll) await window.app.refreshAll();
        } catch (e) {
          showToast('Lỗi đăng nhập Dropbox: ' + e.message, 'error');
        }
      });
    }

    // Dropbox Disconnect
    const dbxDisconnectBtn = document.getElementById('btn-dropbox-disconnect');
    if (dbxDisconnectBtn) {
      dbxDisconnectBtn.addEventListener('click', async () => {
        if (confirm('Bạn có chắc muốn ngắt kết nối Dropbox?')) {
          if (window.dropboxService) await window.dropboxService.disconnect();
          this.updateDropboxAccountUI();
          showToast('Đã ngắt kết nối Dropbox', 'info');
        }
      });
    }

    // Dropbox Sync Now
    const dbxSyncBtn = document.getElementById('btn-dropbox-sync-now');
    if (dbxSyncBtn) {
      dbxSyncBtn.addEventListener('click', async () => {
        try {
          if (!window.dropboxService) return;
          showToast('Đang đồng bộ Dropbox...', 'info');
          await window.dropboxService.sync();
          showToast('Đồng bộ Dropbox thành công!', 'success');
          if (window.app && window.app.refreshAll) await window.app.refreshAll();
        } catch (e) {
          showToast('Đồng bộ Dropbox thất bại: ' + e.message, 'error');
        }
      });
    }

    // Dropbox Generate Shared Link
    const dbxGenLinkBtn = document.getElementById('btn-dropbox-generate-link');
    if (dbxGenLinkBtn) {
      dbxGenLinkBtn.addEventListener('click', async () => {
        try {
          if (!window.dropboxService) return;
          showToast('Đang tạo liên kết chia sẻ Dropbox...', 'info');
          const link = await window.dropboxService.getOrCreateSharedLink();
          if (link) {
            const input = document.getElementById('settings-dropbox-share-link');
            if (input) input.value = link;
            showToast('Đã tạo liên kết chia sẻ thành công!', 'success');
          } else {
            showToast('Chưa thể tạo liên kết chia sẻ (vui lòng đảm bảo đã kết nối Dropbox)', 'error');
          }
        } catch (err) {
          showToast('Lỗi tạo liên kết: ' + err.message, 'error');
        }
      });
    }

    // Dropbox Copy Shared Link
    const dbxCopyLinkBtn = document.getElementById('btn-dropbox-copy-link');
    if (dbxCopyLinkBtn) {
      dbxCopyLinkBtn.addEventListener('click', async () => {
        const input = document.getElementById('settings-dropbox-share-link');
        const link = input ? input.value.trim() : '';
        if (!link) {
          showToast('Vui lòng bấm "Lấy Link" trước khi sao chép', 'warning');
          return;
        }
        try {
          await navigator.clipboard.writeText(link);
          showToast('Đã sao chép liên kết chia sẻ vào bộ nhớ tạm!', 'success');
        } catch (err) {
          input.select();
          document.execCommand('copy');
          showToast('Đã sao chép liên kết chia sẻ!', 'success');
        }
      });
    }

    // Dropbox Join Vault via Shared Link
    const dbxJoinBtn = document.getElementById('btn-dropbox-join-vault');
    if (dbxJoinBtn) {
      dbxJoinBtn.addEventListener('click', async () => {
        const input = document.getElementById('settings-dropbox-join-link');
        const link = input ? input.value.trim() : '';
        if (!link) {
          showToast('Vui lòng nhập link chia sẻ Dropbox của chủ sổ', 'warning');
          return;
        }
        try {
          if (!window.dropboxService) return;
          showToast('Đang kết nối vào sổ qua liên kết...', 'info');
          window.dropboxService.sharedLink = link;
          window.dropboxService.role = 'member';
          await db.settings.put({ key: 'dropboxSharedLink', value: link });
          await db.settings.put({ key: 'dropboxRole', value: 'member' });
          await window.dropboxService.sync();
          showToast('Đã vào sổ chia sẻ Dropbox thành công!', 'success');
          const dbxRoleBadge = document.getElementById('dropbox-role-badge');
          if (dbxRoleBadge) {
            dbxRoleBadge.textContent = 'Thành Viên';
            dbxRoleBadge.style.background = 'rgba(16, 185, 129, 0.12)';
            dbxRoleBadge.style.color = '#10b981';
          }
          if (window.app && window.app.refreshAll) await window.app.refreshAll();
        } catch (err) {
          showToast('Kết nối vào sổ thất bại: ' + err.message, 'error');
        }
      });
    }

    // Toggle Dropbox Folder Help Box
    const dbxFolderHelpBtn = document.getElementById('btn-toggle-dropbox-folder-help');
    const dbxFolderHelpBox = document.getElementById('dropbox-folder-help-box');
    if (dbxFolderHelpBtn && dbxFolderHelpBox) {
      dbxFolderHelpBtn.addEventListener('click', () => {
        dbxFolderHelpBox.style.display = dbxFolderHelpBox.style.display === 'none' ? 'block' : 'none';
      });
    }

    // Save Dropbox Shared Folder Path
    const dbxSaveFolderBtn = document.getElementById('btn-save-dropbox-folder');
    if (dbxSaveFolderBtn) {
      dbxSaveFolderBtn.addEventListener('click', async () => {
        const input = document.getElementById('settings-dropbox-folder-path');
        const folder = input ? input.value.trim() : '';
        if (window.dropboxService) {
          await window.dropboxService.setFolderPath(folder);
          showToast('Đã lưu cấu hình thư mục Dropbox! Bấm Đồng Bộ để kiểm tra.', 'success');
        }
      });
    }

    // 1. Google Client ID Save
    const saveClientIdBtn = document.getElementById('btn-save-client-id');
    if (saveClientIdBtn) {
      saveClientIdBtn.addEventListener('click', async () => {
        const input = document.getElementById('settings-client-id');
        const val = input.value.trim();
        await db.settings.put({ key: 'googleClientId', value: val });
        if (window.googleDriveService) window.googleDriveService.setClientId(val);
        showToast('Đã lưu Google Client ID', 'success');
      });
    }

    // Toggle Client ID Help Box
    const helpBtn = document.getElementById('btn-toggle-client-id-help');
    const helpBox = document.getElementById('client-id-help-box');
    if (helpBtn && helpBox) {
      helpBtn.addEventListener('click', () => {
        helpBox.style.display = helpBox.style.display === 'none' ? 'block' : 'none';
      });
    }

    // 2. Google Login / Re-auth / Logout Buttons
    const handleGoogleLogin = async () => {
      try {
        if (!window.googleDriveService) return;
        showToast('Đang kết nối Google Identity Services...', 'info');
        const drive = window.googleDriveService;
        const promptMode = (drive.userProfile && drive.userProfile.email) ? '' : 'select_account';
        await drive.requestToken({ prompt: promptMode, interactive: true });

        // Tự động kích hoạt tự động đồng bộ khi đăng nhập
        window.googleDriveService.autoSync = true;
        await db.settings.put({ key: 'autoSyncEnabled', value: true });

        // Tự động đồng bộ dữ liệu từ Google Drive về máy ngay sau khi đăng nhập
        showToast('Đang đồng bộ dữ liệu từ Google Drive...', 'info');
        await window.googleDriveService.sync();
        showToast('Đồng bộ dữ liệu thành công!', 'success');

        await this.loadSettings();
        if (window.app && typeof window.app.refreshAll === 'function') {
          await window.app.refreshAll();
        }
        if (window.SyncCoordinator) {
          window.SyncCoordinator.setStatus('synced', window.googleDriveService.getTargetLabel());
        }
      } catch (err) {
        if (err.message && (err.message.includes('Đã đóng cửa sổ') || err.message.includes('popup_closed_by_user'))) {
          showToast('Đã hủy đăng nhập', 'info');
        } else {
          showToast('Đăng nhập thất bại: ' + err.message, 'error');
        }
      }
    };

    const loginBtn = document.getElementById('btn-google-login');
    if (loginBtn) loginBtn.addEventListener('click', handleGoogleLogin);

    const reauthBtn = document.getElementById('btn-google-reauth');
    if (reauthBtn) {
      reauthBtn.addEventListener('click', async () => {
        try {
          if (!window.googleDriveService) return;
          showToast('Đang mở màn hình chọn tài khoản Google...', 'info');
          await window.googleDriveService.switchAccount();

          window.googleDriveService.autoSync = true;
          await db.settings.put({ key: 'autoSyncEnabled', value: true });

          showToast('Đang đồng bộ dữ liệu từ Google Drive...', 'info');
          await window.googleDriveService.sync();
          showToast('Đã đổi tài khoản và đồng bộ thành công!', 'success');

          await this.loadSettings();
          if (window.app && typeof window.app.refreshAll === 'function') {
            await window.app.refreshAll();
          }
          if (window.SyncCoordinator) {
            window.SyncCoordinator.setStatus('synced', window.googleDriveService.getTargetLabel());
          }
        } catch (err) {
          if (err.message && (err.message.includes('Đã đóng cửa sổ') || err.message.includes('popup_closed_by_user'))) {
            showToast('Đã hủy chọn tài khoản', 'info');
          } else {
            showToast('Đổi tài khoản thất bại: ' + err.message, 'error');
          }
          await this.loadSettings();
        }
      });
    }

    const logoutBtn = document.getElementById('btn-google-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          if (!window.googleDriveService) return;
          await window.googleDriveService.disconnect();
          showToast('Đã đăng xuất khỏi Google Drive', 'info');
          await this.loadSettings();
          if (window.SyncCoordinator) {
            const sService = window.serverSyncService;
            if (sService && sService.token && sService.activeVaultId) {
              window.SyncCoordinator.setStatus('synced', sService.getTargetLabel());
            } else if (window.dropboxService && window.dropboxService.hasValidToken()) {
              window.SyncCoordinator.setStatus('synced', window.dropboxService.getTargetLabel());
            } else {
              window.SyncCoordinator.setStatus('idle', 'Bộ nhớ trình duyệt (IndexedDB)');
            }
          }
        } catch (err) {
          showToast('Lỗi khi đăng xuất: ' + err.message, 'error');
        }
      });
    }



    // 3. Storage Location Selector (Radio)
    const locRadios = document.querySelectorAll('input[name="drive-storage-location"]');
    locRadios.forEach(radio => {
      radio.addEventListener('change', async (e) => {
        const val = e.target.value;
        const appDataCard = document.getElementById('loc-card-appdata');
        const customCard = document.getElementById('loc-card-custom');
        const customWrap = document.getElementById('custom-folder-name-wrap');
        const folderInput = document.getElementById('settings-drive-folder-name');

        if (val === 'customFolder') {
          if (customCard) customCard.classList.add('active');
          if (appDataCard) appDataCard.classList.remove('active');
          if (customWrap) customWrap.style.display = 'block';
          if (window.googleDriveService) {
            window.googleDriveService.setStorageLocation('customFolder', folderInput ? folderInput.value : 'Sổ Thu Chi');
          }
          showToast('Đã chuyển sang Thư mục riêng trên Drive của tôi', 'info');
        } else {
          if (appDataCard) appDataCard.classList.add('active');
          if (customCard) customCard.classList.remove('active');
          if (customWrap) customWrap.style.display = 'none';
          if (window.googleDriveService) {
            window.googleDriveService.setStorageLocation('appDataFolder');
          }
          showToast('Đã chuyển sang Thư mục ứng dụng Google (AppData)', 'info');
        }

        if (window.SyncCoordinator) {
          window.SyncCoordinator.setStatus(window.SyncCoordinator.status, window.googleDriveService.getTargetLabel());
        }
      });
    });

    // Save Custom Folder Name
    const saveFolderNameBtn = document.getElementById('btn-save-folder-name');
    if (saveFolderNameBtn) {
      saveFolderNameBtn.addEventListener('click', async () => {
        const folderInput = document.getElementById('settings-drive-folder-name');
        const name = (folderInput ? folderInput.value : '').trim() || 'Sổ Thu Chi';
        if (window.googleDriveService) {
          window.googleDriveService.setStorageLocation('customFolder', name);
        }
        showToast(`Đã lưu tên thư mục Drive: "${name}"`, 'success');
      });
    }

    // 4. Save Vault Password (E2EE)
    const saveVaultPassBtn = document.getElementById('btn-save-vault-password');
    if (saveVaultPassBtn) {
      saveVaultPassBtn.addEventListener('click', async () => {
        const input = document.getElementById('settings-vault-password');
        const val = input ? input.value : '';
        if (window.googleDriveService) {
          window.googleDriveService.setEncryptionPassword(val);
        }
        if (input) {
          input.value = '';
          input.placeholder = val ? 'Nhập mới để đổi mật khẩu' : 'Để trống nếu không mã hóa';
        }
        showToast(val ? 'Đã lưu Mật khẩu Mã hóa Sổ (E2EE) thành công!' : 'Đã bỏ mật khẩu mã hóa sổ', 'success');
      });
    }

    // 5. Auto Mirror Backup Toggle
    const autoMirrorToggle = document.getElementById('settings-auto-mirror');
    if (autoMirrorToggle) {
      autoMirrorToggle.addEventListener('change', async (e) => {
        if (window.googleDriveService) {
          window.googleDriveService.setAutoMirror(e.target.checked);
        }
        showToast(e.target.checked ? 'Đã bật tự động sao lưu dự phòng Mirror Backup' : 'Đã tắt Mirror Backup', 'info');
      });
    }

    // 6. Promote to Master Vault Button
    const promoteBtn = document.getElementById('btn-promote-master');
    if (promoteBtn) {
      promoteBtn.addEventListener('click', async () => {
        const ok = confirm('Bạn có chắc chắn muốn thăng cấp dữ liệu hiện tại trên máy này thành Sổ Chính trên tài khoản Google của bạn không?\n\n(Hành động này hữu ích khi Chủ sổ cũ xóa tài khoản hoặc ngừng chia sẻ).');
        if (!ok) return;

        try {
          promoteBtn.disabled = true;
          promoteBtn.innerHTML = '<i data-lucide="loader-2" class="spin-animation"></i> Đang thăng cấp...';
          if (window.lucide) lucide.createIcons();

          await window.googleDriveService.promoteToMaster();
          showToast('Đã thăng cấp thành Sổ Chính thành công!', 'success');
          this.loadSettings();
        } catch (err) {
          showToast('Thăng cấp thất bại: ' + err.message, 'error');
        } finally {
          promoteBtn.disabled = false;
          promoteBtn.innerHTML = '<i data-lucide="crown" style="width: 14px; height: 14px; color: #f59e0b;"></i> <span>Thăng cấp thành Sổ chính</span>';
          if (window.lucide) lucide.createIcons();
        }
      });
    }

    // 7. Share Vault with Email
    const shareBtn = document.getElementById('btn-share-invite');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        const emailInput = document.getElementById('settings-share-email');
        const roleSelect = document.getElementById('settings-share-role');
        const email = emailInput ? emailInput.value : '';
        const role = roleSelect ? roleSelect.value : 'writer';

        if (!email || !email.includes('@')) {
          showToast('Vui lòng nhập địa chỉ email Google hợp lệ', 'error');
          return;
        }

        try {
          shareBtn.disabled = true;
          shareBtn.innerHTML = '<i data-lucide="loader-2" class="spin-animation"></i> Đang cấp quyền...';
          if (window.lucide) lucide.createIcons();

          await window.googleDriveService.shareVaultWithEmail(email.trim(), role);
          showToast(`Đã cấp quyền chia sẻ cho ${email}!`, 'success');
          if (emailInput) emailInput.value = '';
        } catch (err) {
          showToast('Lỗi khi chia sẻ: ' + err.message, 'error');
        } finally {
          shareBtn.disabled = false;
          shareBtn.innerHTML = '<i data-lucide="user-plus" style="width: 15px; height: 15px;"></i> <span>Cấp quyền</span>';
          if (window.lucide) lucide.createIcons();
        }
      });
    }

    // 8. Local Folder Auto-Backup (File System Access)
    const selectLocalFolderBtn = document.getElementById('btn-select-local-folder');
    if (selectLocalFolderBtn) {
      selectLocalFolderBtn.addEventListener('click', async () => {
        try {
          if (!window.BackupService) return;
          if (!window.BackupService.isFileSystemAccessSupported()) {
            const pass = prompt('iOS / Safari không cho phép ứng dụng web tự động ghi nền vào thư mục máy.\n\nNhập mật khẩu để mã hóa file (hoặc bấm OK để xuất file bình thường):');
            if (pass === null) return;
            await window.BackupService.exportFullBackup(pass || null);
            showToast('Đã tải file sao lưu về máy (lưu vào Tệp / Files)!', 'success');
            return;
          }

          const chosen = await window.BackupService.selectBackupDirectory();
          if (chosen) {
            this.renderLocalFolderStatus();
            showToast(`Đã liên kết thư mục máy tính: ${chosen}`, 'success');
            if (window.SyncCoordinator) {
              window.SyncCoordinator.setStatus('synced', `Thư mục máy (${chosen})`);
            }
          }
        } catch (err) {
          showToast('Chọn thư mục thất bại: ' + err.message, 'error');
        }
      });
    }

    const removeLocalFolderBtn = document.getElementById('btn-remove-local-folder');
    if (removeLocalFolderBtn) {
      removeLocalFolderBtn.addEventListener('click', async () => {
        const ok = confirm('Bạn có chắc muốn hủy liên kết thư mục sao lưu cục bộ trên máy tính?');
        if (!ok) return;

        if (window.BackupService) {
          await window.BackupService.removeBackupDirectory();
          this.renderLocalFolderStatus();
          showToast('Đã hủy liên kết thư mục máy tính', 'info');
        }
      });
    }

    // 9. Sync Now Button (Chỉ đồng bộ riêng cho Google Drive để người dùng test độc lập)
    const syncNowBtn = document.getElementById('btn-sync-now');
    if (syncNowBtn) {
      syncNowBtn.addEventListener('click', async () => {
        try {
          syncNowBtn.disabled = true;
          syncNowBtn.innerHTML = '<i data-lucide="loader-2" class="spin-animation"></i> Đang đồng bộ...';
          if (window.lucide) lucide.createIcons();

          if (window.googleDriveService) {
            await window.googleDriveService.sync({ interactive: true });
          }

          showToast('Đồng bộ Google Drive thành công!', 'success');
          this.loadSettings();
          if (window.app && window.app.refreshAll) window.app.refreshAll();
        } catch (err) {
          showToast('Lỗi đồng bộ: ' + err.message, 'error');
        } finally {
          syncNowBtn.disabled = false;
          syncNowBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Đồng Bộ Ngay';
          if (window.lucide) lucide.createIcons();
        }
      });
    }

    // 10. Auto Sync Toggle (Kích Hoạt Google Drive)
    const autoSyncToggle = document.getElementById('settings-auto-sync');
    if (autoSyncToggle) {
      autoSyncToggle.addEventListener('change', async (e) => {
        if (window.googleDriveService) {
          window.googleDriveService.setAutoSync(e.target.checked);
        } else {
          await db.settings.put({ key: 'autoSyncEnabled', value: e.target.checked });
        }
        showToast(e.target.checked ? 'Đã kích hoạt đồng bộ Google Drive' : 'Đã vô hiệu hóa Google Drive', 'info');
      });
    }

    // Toggle Kích Hoạt Dropbox
    const dbxAutoSyncToggle = document.getElementById('settings-dropbox-auto-sync');
    if (dbxAutoSyncToggle) {
      dbxAutoSyncToggle.addEventListener('change', async (e) => {
        if (window.dropboxService) {
          window.dropboxService.setAutoSync(e.target.checked);
        } else {
          await db.settings.put({ key: 'dropboxAutoSync', value: e.target.checked });
        }
        showToast(e.target.checked ? 'Đã kích hoạt đồng bộ Dropbox' : 'Đã vô hiệu hóa Dropbox', 'info');
      });
    }

    // 11. CSV Export Transactions
    const exportCsvTxBtn = document.getElementById('btn-export-tx-csv');
    if (exportCsvTxBtn) {
      exportCsvTxBtn.addEventListener('click', async () => {
        await window.CSVExportService.exportTransactions();
        showToast('Đã xuất file CSV Giao Dịch thành công', 'success');
      });
    }

    // 12. CSV Export Debts
    const exportCsvDebtBtn = document.getElementById('btn-export-debt-csv');
    if (exportCsvDebtBtn) {
      exportCsvDebtBtn.addEventListener('click', async () => {
        await window.CSVExportService.exportDebts();
        showToast('Đã xuất file CSV Sổ Nợ thành công', 'success');
      });
    }

    // 13. Full JSON / STC Backup Export
    const exportJsonBtn = document.getElementById('btn-export-json');
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', async () => {
        const pass = prompt('Nhập mật khẩu để mã hóa sao lưu AES-GCM (hoặc bấm OK để xuất JSON thông thường):');
        await window.BackupService.exportFullBackup(pass || null);
        showToast('Đã tải file sao lưu dự phòng thành công', 'success');
      });
    }

    // 14. JSON / STC Restore Input
    const restoreFileInput = document.getElementById('input-restore-file');
    if (restoreFileInput) {
      restoreFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const overwriteServerCheckbox = document.getElementById('checkbox-restore-overwrite-server');
        const shouldOverwriteServer = overwriteServerCheckbox && overwriteServerCheckbox.checked;

        if (shouldOverwriteServer) {
          const sService = window.serverSyncService;
          if (!sService || sService.connectionStatus !== 'connected' || !sService.activeVaultId) {
            showToast('Bạn đã chọn ghi đè máy chủ nhưng chưa kết nối hoặc chưa đăng nhập vào Máy Chủ Riêng!', 'warning');
            e.target.value = '';
            return;
          }

          const currentVault = sService.getActiveVault ? sService.getActiveVault() : null;
          const vaultName = currentVault ? currentVault.name : 'hiện tại';
          const ok = confirm(`CẢNH BÁO GHI ĐÈ MÁY CHỦ RIÊNG:\n\nBạn đang bật tùy chọn ghi đè toàn bộ lên máy chủ.\nDữ liệu của Sổ "${vaultName}" trên máy chủ sẽ bị THAY THẾ 100% bằng tệp sao lưu này!\n\nBạn có chắc chắn muốn thực hiện không?`);
          if (!ok) {
            e.target.value = '';
            return;
          }
        }

        let password = null;
        if (file.name.endsWith('.stc') || file.name.includes('Encrypted')) {
          password = prompt('Tệp sao lưu này yêu cầu mật khẩu giải mã:');
        }

        try {
          const res = await window.BackupService.importBackup(file, password);

          if (shouldOverwriteServer && window.serverSyncService) {
            showToast(`Đã khôi phục file (${res.count} giao dịch). Đang ghi đè toàn bộ lên máy chủ...`, 'info');
            await window.serverSyncService.forceOverwriteServer();
            showToast(`Khôi phục và ghi đè toàn bộ lên Máy Chủ Riêng thành công!`, 'success');
          } else {
            showToast(`Khôi phục dữ liệu thành công (${res.count} giao dịch)!`, 'success');
          }

          if (window.app && window.app.refreshAll) window.app.refreshAll();
        } catch (err) {
          showToast('Khôi phục thất bại: ' + err.message, 'error');
        }
        e.target.value = '';
      });
    }

    // 15. Privacy Mode Toggle
    const privacyToggle = document.getElementById('settings-privacy-mode');
    if (privacyToggle) {
      privacyToggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        await db.settings.put({ key: 'privacyMode', value: enabled });
        if (window.app && window.app.applyPrivacyMode) {
          window.app.applyPrivacyMode(enabled);
        }
        showToast(enabled ? 'Đã bật chế độ riêng tư (Ẩn số tiền)' : 'Đã tắt chế độ riêng tư', 'info');
      });
    }

    // 17 & 18. Xoá Cache & Khôi Phục Cài Đặt Gốc:
    // Đã được gắn trực tiếp qua onclick trong index.html (window.clearAppCacheDirectly & window.factoryResetAppDirectly).
    // Không gắn thêm addEventListener ở đây để tránh bị hỏi xác nhận 2 lần lặp lại.

    // 16. Theme Selector
    const themeSelect = document.getElementById('settings-theme-select');
    if (themeSelect) {
      themeSelect.addEventListener('change', async (e) => {
        const theme = e.target.value;
        await db.settings.put({ key: 'theme', value: theme });
        if (window.app && window.app.applyTheme) {
          window.app.applyTheme(theme);
        }
        this.updateHubBadges();
      });
    }
  }
};

window.UISettings = UISettings;
