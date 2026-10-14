/**
 * SỔ THU CHI - UI SETTINGS MODULE (v2.2.5)
 * Thiết lập Google Drive Sync (AppData / Custom Folder, E2EE, Mirror Backup, Sharing),
 * Tự động sao lưu Thư mục máy tính (Local Folder Auto-Backup),
 * Xuất CSV, Sao lưu JSON, Chế độ riêng tư & Giao diện
 */

const UISettings = {
  init() {
    this.bindEvents();
    this.loadSettings();

    // Lắng nghe cập nhật profile Google
    window.addEventListener('google-profile-updated', (e) => {
      this.renderGoogleProfile(e.detail);
    });
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
    if (vaultPassSetting && vaultPassInput) {
      vaultPassInput.value = vaultPassSetting.value || '';
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
    if (autoSyncSetting && autoSyncToggle) {
      autoSyncToggle.checked = !!autoSyncSetting.value;
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
      card.style.display = 'flex';
      if (avatar) avatar.src = profile.picture || './assets/icons/icon.svg';
      if (nameEl) nameEl.textContent = profile.name || 'Người dùng Google';
      if (emailEl) emailEl.textContent = profile.email;

      const isOwner = (window.googleDriveService && window.googleDriveService.vaultRole !== 'member');
      if (roleBadge) {
        roleBadge.textContent = isOwner ? 'Chủ Sổ' : 'Thành Viên';
        roleBadge.className = isOwner ? 'google-role-badge' : 'google-role-badge member';
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
      return;
    }

    if (iosNotice) iosNotice.style.display = 'none';
    const hasFolder = window.BackupService && window.BackupService.hasLocalDirectory();
    if (hasFolder) {
      if (nameEl) nameEl.textContent = `📂 Đang lưu vào: ${window.BackupService.localDirName}`;
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
      if (infoBox) infoBox.style.display = 'flex';
      if (nameEl) nameEl.textContent = dbx.userProfile.name || 'Dropbox User';
      if (emailEl) emailEl.textContent = dbx.userProfile.email || '';
      if (avatarEl && dbx.userProfile.picture) avatarEl.src = dbx.userProfile.picture;
      if (connectBtn) connectBtn.style.display = 'none';
    } else {
      if (infoBox) infoBox.style.display = 'none';
      if (connectBtn) connectBtn.style.display = 'inline-flex';
    }
  },

  bindEvents() {
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
          showToast('Đã ngắt kết nối Google Drive', 'info');
          await this.loadSettings();
          if (window.SyncCoordinator) {
            window.SyncCoordinator.setStatus('offline', 'Chưa kết nối');
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
        const email = emailInput ? emailInput.value.trim() : '';
        const role = roleSelect ? roleSelect.value : 'writer';

        if (!email || !email.includes('@')) {
          showToast('Vui lòng nhập địa chỉ email Google hợp lệ', 'error');
          return;
        }

        try {
          shareBtn.disabled = true;
          shareBtn.innerHTML = '<i data-lucide="loader-2" class="spin-animation"></i> Đang cấp quyền...';
          if (window.lucide) lucide.createIcons();

          await window.googleDriveService.shareVaultWithEmail(email, role);
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
            // Thiết bị không hỗ trợ File System Access API (như iPhone / iOS Safari)
            const pass = prompt('iOS / Safari không cho phép ứng dụng web tự động ghi nền vào thư mục máy.\n\nNhập mật khẩu để mã hóa file (hoặc bấm OK để xuất file bình thường):');
            if (pass === null) return; // Người dùng bấm Hủy
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

    // 9. Sync Now Button
    const syncNowBtn = document.getElementById('btn-sync-now');
    if (syncNowBtn) {
      syncNowBtn.addEventListener('click', async () => {
        try {
          syncNowBtn.disabled = true;
          syncNowBtn.innerHTML = '<i data-lucide="loader-2" class="spin-animation"></i> Đang đồng bộ...';
          if (window.lucide) lucide.createIcons();

          if (window.SyncCoordinator) {
            await window.SyncCoordinator.syncAll(false);
          } else if (window.googleDriveService) {
            await window.googleDriveService.sync();
          }

          showToast('Đồng bộ dữ liệu thành công!', 'success');
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

    // 10. Auto Sync Toggle
    const autoSyncToggle = document.getElementById('settings-auto-sync');
    if (autoSyncToggle) {
      autoSyncToggle.addEventListener('change', async (e) => {
        await db.settings.put({ key: 'autoSyncEnabled', value: e.target.checked });
        if (window.googleDriveService) window.googleDriveService.autoSync = e.target.checked;
        showToast(e.target.checked ? 'Đã bật tự động đồng bộ' : 'Đã tắt tự động đồng bộ', 'info');
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

        let password = null;
        if (file.name.endsWith('.stc') || file.name.includes('Encrypted')) {
          password = prompt('Tệp sao lưu này yêu cầu mật khẩu giải mã:');
        }

        try {
          const res = await window.BackupService.importBackup(file, password);
          showToast(`Khôi phục dữ liệu thành công (${res.count} giao dịch)!`, 'success');
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

    // 16. Theme Selector
    const themeSelect = document.getElementById('settings-theme-select');
    if (themeSelect) {
      themeSelect.addEventListener('change', async (e) => {
        const theme = e.target.value;
        await db.settings.put({ key: 'theme', value: theme });
        if (window.app && window.app.applyTheme) {
          window.app.applyTheme(theme);
        }
      });
    }
  }
};

window.UISettings = UISettings;
