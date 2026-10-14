/**
 * SỔ THU CHI - GOOGLE DRIVE CLIENT-SIDE SYNC ENGINE
 * Zero-Backend Serverless Synchronization với Kiến trúc Module hóa
 * Hỗ trợ:
 * - Lưu trữ vùng ứng dụng (appDataFolder - Mặc định) hoặc Thư mục riêng hiển thị (My Drive)
 * - Mã hóa đầu cuối E2EE (Master Vault Password)
 * - Chia sẻ qua Email Google (Owner / Editor / Viewer)
 * - Tự động sao lưu dự phòng vào Drive cá nhân cho thành viên (Mirror Backup)
 * - Thăng cấp thành Sổ chính nếu Owner hủy kết nối (Promote to Master)
 */

class GoogleDriveSync {
  constructor() {
    this.accessToken = null;
    this.tokenClient = null;
    this.isSyncing = false;
    this.syncFileName = 'sothuchi_vault.json';
    this.driveFileId = null;
    this.lastSyncTime = null;
    this.autoSync = true;
    this.tokenExpiresAt = 0;
    this.refreshTimer = null;
    this.workerUrl = '';
    this.clientSecret = '';
    this.refreshToken = null;
    this.encryptionPassword = null;
    this.clientId = '';
    this.storageLocation = 'appDataFolder'; // 'appDataFolder' | 'customFolder'
    this.customFolderName = 'Sổ Thu Chi';
    this.customFolderId = null;
    this.userProfile = null;
    this.vaultRole = 'owner'; // 'owner' | 'editor' | 'viewer'
    this.autoMirror = false; // Tự động lưu 1 bản dự phòng vào Drive cá nhân
    this.mirrorFileId = null;
  }

  // Load saved configuration from DB & EnvConfig
  async init() {
    try {
      // 1. Load from DB or Fallback to .env
      const savedClientId = await db.settings.get('googleClientId');
      if (savedClientId && savedClientId.value) {
        this.clientId = savedClientId.value;
      } else if (window.EnvConfig) {
        this.clientId = window.EnvConfig.get('GOOGLE_CLIENT_ID', '');
      }

      const autoSyncSetting = await db.settings.get('autoSyncEnabled');
      if (autoSyncSetting !== undefined) {
        this.autoSync = !!autoSyncSetting.value;
      } else {
        this.autoSync = true;
      }

      const lastSyncSetting = await db.settings.get('lastSyncTime');
      if (lastSyncSetting) {
        this.lastSyncTime = lastSyncSetting.value;
      }

      const fileIdSetting = await db.settings.get('googleDriveFileId');
      if (fileIdSetting) {
        this.driveFileId = fileIdSetting.value;
      }

      const encSetting = await db.settings.get('syncEncryptionPassword');
      if (encSetting) {
        this.encryptionPassword = encSetting.value;
      }

      const locSetting = await db.settings.get('driveStorageLocation');
      if (locSetting && locSetting.value) {
        this.storageLocation = locSetting.value;
      }

      const folderNameSetting = await db.settings.get('driveCustomFolderName');
      if (folderNameSetting && folderNameSetting.value) {
        this.customFolderName = folderNameSetting.value;
      }

      const customFolderIdSetting = await db.settings.get('googleDriveCustomFolderId');
      if (customFolderIdSetting && customFolderIdSetting.value) {
        this.customFolderId = customFolderIdSetting.value;
      }

      const userProfileSetting = await db.settings.get('googleUserProfile');
      if (userProfileSetting && userProfileSetting.value) {
        this.userProfile = userProfileSetting.value;
      }

      const roleSetting = await db.settings.get('vaultRole');
      if (roleSetting && roleSetting.value) {
        this.vaultRole = roleSetting.value;
      }

      const mirrorSetting = await db.settings.get('autoMirrorToPersonalDrive');
      if (mirrorSetting) {
        this.autoMirror = !!mirrorSetting.value;
      }

      const workerSetting = await db.settings.get('googleWorkerUrl');
      if (workerSetting && workerSetting.value) {
        this.workerUrl = workerSetting.value.trim();
      } else if (window.EnvConfig) {
        this.workerUrl = window.EnvConfig.get('GOOGLE_WORKER_URL', '').trim();
      }

      const secretSetting = await db.settings.get('googleClientSecret');
      if (secretSetting && secretSetting.value) {
        this.clientSecret = secretSetting.value.trim();
      } else if (window.EnvConfig) {
        this.clientSecret = window.EnvConfig.get('GOOGLE_CLIENT_SECRET', '').trim();
      }

      const refreshSetting = await db.settings.get('googleRefreshToken');
      if (refreshSetting && refreshSetting.value) this.refreshToken = refreshSetting.value.trim();

      this.setupTokenRefreshTimer();

      // Khôi phục Token nếu còn hiệu lực (tránh bắt đăng nhập lại hoặc treo khi reload)
      try {
        let savedToken = sessionStorage.getItem('sothuchi_google_access_token');
        let savedExpires = parseInt(sessionStorage.getItem('sothuchi_google_token_expires_at') || '0', 10);
        if (!savedToken || !savedExpires || Date.now() >= savedExpires) {
          const dbToken = await db.settings.get('googleAccessToken');
          const dbExpires = await db.settings.get('googleTokenExpiresAt');
          if (dbToken && dbExpires) {
            savedToken = dbToken.value;
            savedExpires = Number(dbExpires.value);
          }
        }
        if (savedToken && savedExpires && Date.now() < savedExpires) {
          this.accessToken = savedToken;
          this.tokenExpiresAt = savedExpires;
          console.log('[GoogleDrive] Khôi phục phiên đăng nhập còn hiệu lực (' + Math.round((savedExpires - Date.now()) / 60000) + ' phút)');
        } else {
          this.accessToken = null;
          this.tokenExpiresAt = 0;
        }
      } catch (tErr) {}
    } catch (err) {
      console.warn('GoogleDriveSync init settings warning:', err);
    }
  }

  setClientId(id) {
    this.clientId = (id || '').trim();
    db.settings.put({ key: 'googleClientId', value: this.clientId });
  }

  setStorageLocation(loc, folderName = null) {
    this.storageLocation = loc === 'customFolder' ? 'customFolder' : 'appDataFolder';
    db.settings.put({ key: 'driveStorageLocation', value: this.storageLocation });
    if (folderName) {
      this.customFolderName = folderName.trim() || 'Sổ Thu Chi';
      db.settings.put({ key: 'driveCustomFolderName', value: this.customFolderName });
    }
    // Reset file ID khi chuyển đổi vùng lưu trữ để tìm hoặc tạo file ở vị trí mới
    this.driveFileId = null;
    db.settings.delete('googleDriveFileId');
  }

  setEncryptionPassword(password) {
    this.encryptionPassword = password ? password.trim() : null;
    db.settings.put({ key: 'syncEncryptionPassword', value: this.encryptionPassword });
  }

  setAutoMirror(enabled) {
    this.autoMirror = !!enabled;
    db.settings.put({ key: 'autoMirrorToPersonalDrive', value: this.autoMirror });
  }

  hasValidToken() {
    return !!(this.accessToken && (!this.tokenExpiresAt || Date.now() < this.tokenExpiresAt));
  }

  async refreshViaWorker() {
    if (!this.workerUrl || !this.refreshToken || !this.clientId) return false;
    try {
      const res = await fetch(`${this.workerUrl.replace(/\/+$/, '')}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret || ''
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          this.accessToken = data.access_token;
          const expiresInSec = data.expires_in || 3600;
          this.tokenExpiresAt = Date.now() + (expiresInSec * 1000) - 120000;
          sessionStorage.setItem('sothuchi_google_access_token', this.accessToken);
          sessionStorage.setItem('sothuchi_google_token_expires_at', String(this.tokenExpiresAt));
          await db.settings.put({ key: 'googleAccessToken', value: this.accessToken });
          await db.settings.put({ key: 'googleTokenExpiresAt', value: this.tokenExpiresAt });
          console.log('[GoogleDrive] Đã gia hạn token ngầm thành công qua Cloudflare Worker!');
          return true;
        }
      }
    } catch (e) {
      console.warn('[GoogleDrive] Gia hạn qua Worker lỗi:', e);
    }
    return false;
  }

  isAutoSyncEnabled() {
    if (this.autoSync && this.clientId && this.hasValidToken()) {
      return true;
    }
    // Đã cấu hình Cloudflare Worker + Refresh Token -> Luôn tự động đồng bộ ngầm vĩnh viễn trên iPhone!
    if (this.autoSync && this.clientId && this.workerUrl && this.refreshToken) {
      return true;
    }
    // Nếu có email và đã bật autoSync -> cho phép thử gia hạn ngầm khi có dữ liệu mới
    if (this.autoSync && this.clientId && this.userProfile && this.userProfile.email) {
      return true;
    }
    return false;
  }

  setupTokenRefreshTimer() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    // Mỗi 35 phút (trước khi token 60 phút hết hạn), tự động làm mới phiên ngầm
    this.refreshTimer = setInterval(async () => {
      if (this.clientId && this.userProfile?.email && this.autoSync) {
        try {
          await this.requestToken({ prompt: '', interactive: false });
          console.log('[GoogleDrive] Đã tự động gia hạn phiên đăng nhập ngầm thành công!');
        } catch (e) {
          console.log('[GoogleDrive] Chưa thể gia hạn ngầm (sẽ gia hạn khi tương tác):', e.message);
        }
      }
    }, 35 * 60 * 1000);
  }

  getTargetLabel() {
    if (this.storageLocation === 'customFolder') {
      return `Google Drive (${this.customFolderName || 'My Drive'})`;
    }
    return 'Google Drive (Vùng ứng dụng ẩn)';
  }

  // Yêu cầu Access Token từ Google Identity Services (GIS)
  async requestToken(options = {}) {
    if (!this.clientId) {
      throw new Error('Vui lòng nhập Google Client ID trong mục Cài đặt trước khi kết nối.');
    }

    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      throw new Error('Thư viện Google Identity Services chưa tải xong hoặc máy đang ngoại tuyến.');
    }

    // Nếu đã cấu hình Cloudflare Worker: dùng Authorization Code flow để lấy Refresh Token vĩnh viễn
    if (this.workerUrl && this.clientSecret && window.google?.accounts?.oauth2?.initCodeClient && (options.forceCode || options.interactive)) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error('Hết thời gian chờ cấp quyền Google'));
          }
        }, 60000);

        try {
          const codeClient = google.accounts.oauth2.initCodeClient({
            client_id: this.clientId,
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
            ux_mode: 'popup',
            callback: async (resp) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              if (resp.error) {
                return reject(new Error(resp.error_description || resp.error));
              }
              try {
                const res = await fetch(`${this.workerUrl.replace(/\/+$/, '')}/token`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    code: resp.code,
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    redirect_uri: 'postmessage'
                  })
                });
                const tokenData = await res.json();
                if (tokenData.access_token) {
                  this.accessToken = tokenData.access_token;
                  if (tokenData.refresh_token) {
                    this.refreshToken = tokenData.refresh_token;
                    await db.settings.put({ key: 'googleRefreshToken', value: this.refreshToken });
                  }
                  const expiresInSec = tokenData.expires_in || 3600;
                  this.tokenExpiresAt = Date.now() + (expiresInSec * 1000) - 120000;
                  sessionStorage.setItem('sothuchi_google_access_token', this.accessToken);
                  sessionStorage.setItem('sothuchi_google_token_expires_at', String(this.tokenExpiresAt));
                  await db.settings.put({ key: 'googleAccessToken', value: this.accessToken });
                  await db.settings.put({ key: 'googleTokenExpiresAt', value: this.tokenExpiresAt });
                  await this.fetchUserProfile();
                  this.setupTokenRefreshTimer();
                  resolve(this.accessToken);
                } else {
                  reject(new Error(tokenData.error || 'Không nhận được token từ Worker'));
                }
              } catch (exErr) {
                reject(exErr);
              }
            }
          });
          codeClient.requestCode();
        } catch (cErr) {
          clearTimeout(timer);
          reject(cErr);
        }
      });
    }

    const promptValue = options.prompt !== undefined ? options.prompt : (options.forceSelect ? 'select_account' : '');
    const isInteractive = promptValue === 'select_account' || options.interactive;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutMs = isInteractive ? 60000 : 3500;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (isInteractive) {
            reject(new Error('Hết thời gian chờ đăng nhập Google'));
          } else {
            reject(new Error('Phiên đăng nhập đã hết hạn. Hãy bấm vào Avatar để kết nối lại.'));
          }
        }
      }, timeoutMs);

      try {
        const oldToken = this.accessToken;

        const userEmail = (options.hint !== undefined) ? options.hint : (this.userProfile?.email || '');

        const tokenClientConfig = {
          client_id: this.clientId,
          scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
          prompt: promptValue,
          callback: async (resp) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);

            if (resp.error) {
              if (resp.error === 'popup_closed_by_user') {
                reject(new Error('Đã đóng cửa sổ đăng nhập'));
              } else if (resp.error === 'access_denied') {
                reject(new Error('Quyền truy cập bị từ chối'));
              } else {
                reject(new Error(resp.error_description || resp.error));
              }
              return;
            }

            this.accessToken = resp.access_token;
            const expiresInSec = resp.expires_in || 3600;
            this.tokenExpiresAt = Date.now() + (expiresInSec * 1000) - 120000;

            try {
              sessionStorage.setItem('sothuchi_google_access_token', this.accessToken);
              sessionStorage.setItem('sothuchi_google_token_expires_at', String(this.tokenExpiresAt));
              await db.settings.put({ key: 'googleAccessToken', value: this.accessToken });
              await db.settings.put({ key: 'googleTokenExpiresAt', value: this.tokenExpiresAt });
            } catch (e) {}

            // Nếu người dùng chọn đổi tài khoản, thu hồi token cũ ở chế độ nền
            if (options.forceSelect && oldToken && oldToken !== this.accessToken && window.google?.accounts?.oauth2?.revoke) {
              try {
                window.google.accounts.oauth2.revoke(oldToken, () => {});
              } catch (e) {}
            }

            // Tải thông tin tài khoản Google đăng nhập
            try {
              await this.fetchUserProfile();
            } catch (pErr) {
              console.warn('Lỗi khi tải profile Google:', pErr);
            }

            // Nếu đổi tài khoản, reset file ID để định vị lại file đúng trên Drive của tài khoản mới
            if (options.forceSelect) {
              this.driveFileId = null;
              this.customFolderId = null;
              await db.settings.delete('googleDriveFileId');
              await db.settings.delete('googleDriveCustomFolderId');
            }

            this.setupTokenRefreshTimer();
            resolve(this.accessToken);
          }
        };

        if (userEmail && !options.forceSelect) {
          tokenClientConfig.hint = userEmail;
        }

        this.tokenClient = google.accounts.oauth2.initTokenClient(tokenClientConfig);

        // Gọi yêu cầu Access Token kèm hint để Google tự động chọn tài khoản
        const reqConfig = { prompt: promptValue };
        if (userEmail && !options.forceSelect) {
          reqConfig.hint = userEmail;
        }
        this.tokenClient.requestAccessToken(reqConfig);
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      }
    });
  }

  // Đổi sang tài khoản Google khác (bắt buộc hiển thị Account Chooser)
  async switchAccount() {
    if (window.google?.accounts?.id?.disableAutoSelect) {
      try {
        window.google.accounts.id.disableAutoSelect();
      } catch (e) {}
    }
    return await this.requestToken({ prompt: 'select_account', forceSelect: true });
  }

  // Đăng xuất và ngắt kết nối Google Drive
  async disconnect() {
    if (this.accessToken && window.google?.accounts?.oauth2?.revoke) {
      try {
        await new Promise((res) => {
          window.google.accounts.oauth2.revoke(this.accessToken, () => res());
        });
      } catch (e) {
        console.warn('Revoke token error:', e);
      }
    }
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.userProfile = null;
    this.driveFileId = null;
    this.customFolderId = null;
    this.autoSync = false;

    sessionStorage.removeItem('sothuchi_google_access_token');
    sessionStorage.removeItem('sothuchi_google_token_expires_at');
    await db.settings.delete('googleAccessToken');
    await db.settings.delete('googleTokenExpiresAt');
    await db.settings.delete('googleUserProfile');
    await db.settings.delete('googleDriveFileId');
    await db.settings.delete('googleDriveCustomFolderId');
    await db.settings.put({ key: 'autoSyncEnabled', value: false });

    window.dispatchEvent(new CustomEvent('google-profile-updated', { detail: null }));
  }

  // Lấy thông tin tài khoản người dùng đăng nhập
  async fetchUserProfile() {
    if (!this.accessToken) return null;
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      if (res.ok) {
        this.userProfile = await res.json();
        await db.settings.put({ key: 'googleUserProfile', value: this.userProfile });
        window.dispatchEvent(new CustomEvent('google-profile-updated', { detail: this.userProfile }));
        return this.userProfile;
      }
    } catch (e) {
      console.warn('fetchUserProfile error:', e);
    }
    return null;
  }

  // Đảm bảo thư mục riêng trên Drive người dùng tồn tại (khi chọn 'customFolder')
  async ensureCustomFolder() {
    if (this.storageLocation !== 'customFolder') return null;
    if (this.customFolderId) return this.customFolderId;

    if (this._ensuringFolderPromise) {
      return await this._ensuringFolderPromise;
    }

    this._ensuringFolderPromise = (async () => {
      try {
        // 1. Kiểm tra cache trong DB
        const savedFolder = await db.settings.get('googleDriveCustomFolderId');
        if (savedFolder && savedFolder.value) {
          this.customFolderId = savedFolder.value;
          return this.customFolderId;
        }

        const targetName = (this.customFolderName || 'Sổ Thu Chi').normalize('NFC').trim().toLowerCase();

        // 2. Quét tất cả thư mục app sở hữu để so khớp Unicode chuẩn NFC/NFD
        const query = encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and trashed = false");
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=drive&q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`, {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        });

        if (res.ok) {
          const data = await res.json();
          if (data.files && data.files.length > 0) {
            const matched = data.files.find(f => (f.name || '').normalize('NFC').trim().toLowerCase() === targetName);
            if (matched) {
              this.customFolderId = matched.id;
              await db.settings.put({ key: 'googleDriveCustomFolderId', value: this.customFolderId });
              return this.customFolderId;
            }
          }
        }

        // 3. Nếu chưa có thư mục nào, mới tạo mới
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: this.customFolderName || 'Sổ Thu Chi',
            mimeType: 'application/vnd.google-apps.folder'
          })
        });

        if (createRes.ok) {
          const created = await createRes.json();
          this.customFolderId = created.id;
          await db.settings.put({ key: 'googleDriveCustomFolderId', value: this.customFolderId });
          return this.customFolderId;
        }

        return null;
      } finally {
        this._ensuringFolderPromise = null;
      }
    })();

    return await this._ensuringFolderPromise;
  }

  // Tìm file dữ liệu vault trên Google Drive (hỗ trợ AppData, Custom Folder và cả File được chia sẻ)
  async findRemoteFile() {
    if (!this.accessToken) return null;

    // 1. Ưu tiên kiểm tra xem có tệp nào được người khác chia sẻ với mình không (Shared With Me)
    try {
      const sharedQuery = encodeURIComponent(`sharedWithMe = true and name = '${this.syncFileName}' and trashed = false`);
      const sharedRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${sharedQuery}&fields=files(id,name,modifiedTime,owners,capabilities)`, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      if (sharedRes.ok) {
        const sharedData = await sharedRes.json();
        if (sharedData.files && sharedData.files.length > 0) {
          const sharedFile = sharedData.files[0];
          this.driveFileId = sharedFile.id;
          this.vaultRole = sharedFile.capabilities?.canEdit ? 'member' : 'viewer';
          this.ownerEmail = sharedFile.owners?.[0]?.emailAddress || '';
          await db.settings.put({ key: 'googleDriveFileId', value: this.driveFileId });
          await db.settings.put({ key: 'vaultRole', value: this.vaultRole });
          console.log(`[GoogleDrive] Đã tìm thấy Sổ được chia sẻ từ ${this.ownerEmail} (Quyển: ${this.vaultRole})`);
          return this.driveFileId;
        }
      }
    } catch (sErr) {
      console.warn('Kiểm tra file được chia sẻ warning:', sErr);
    }

    // 2. Tìm file của chính mình
    if (this.storageLocation === 'appDataFolder') {
      const query = encodeURIComponent(`name = '${this.syncFileName}' and trashed = false`);
      const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          this.accessToken = null;
          throw new Error('Phiên đăng nhập Google đã hết hạn. Vui lòng bấm Đăng nhập lại.');
        }
        throw new Error('Không thể tìm tệp trên Google Drive.');
      }

      const data = await res.json();
      if (data.files && data.files.length > 0) {
        this.driveFileId = data.files[0].id;
        this.vaultRole = 'owner';
        await db.settings.put({ key: 'googleDriveFileId', value: this.driveFileId });
        await db.settings.put({ key: 'vaultRole', value: 'owner' });
        return this.driveFileId;
      }
      return null;
    } else {
      // VÙNG CUSTOM FOLDER:
      // Tìm trực tiếp file sothuchi_vault.json trên Drive trước
      // Tự động nhận diện được chính xác Folder chứa file mà không cần tạo mới
      const query = encodeURIComponent(`name = '${this.syncFileName}' and trashed = false`);
      const url = `https://www.googleapis.com/drive/v3/files?spaces=drive&q=${query}&fields=files(id,name,modifiedTime,parents)&orderBy=modifiedTime desc`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          this.accessToken = null;
          throw new Error('Phiên đăng nhập Google đã hết hạn. Vui lòng bấm Đăng nhập lại.');
        }
        throw new Error('Không thể tìm tệp trên Google Drive.');
      }

      const data = await res.json();
      if (data.files && data.files.length > 0) {
        const foundFile = data.files[0];
        this.driveFileId = foundFile.id;
        this.vaultRole = 'owner';
        await db.settings.put({ key: 'googleDriveFileId', value: this.driveFileId });
        await db.settings.put({ key: 'vaultRole', value: 'owner' });

        if (foundFile.parents && foundFile.parents.length > 0) {
          this.customFolderId = foundFile.parents[0];
          await db.settings.put({ key: 'googleDriveCustomFolderId', value: this.customFolderId });
        }
        return this.driveFileId;
      }

      // Nếu chưa có file nào trên Drive, lúc này mới cần đảm bảo có sẵn Folder để lưu
      await this.ensureCustomFolder();
      return null;
    }
  }

  // Tải nội dung file từ Google Drive và giải mã nếu có mật khẩu
  async downloadRemoteData(fileId) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!res.ok) throw new Error('Không thể tải tệp từ Google Drive.');
    const text = await res.text();
    let json = JSON.parse(text);

    if (json.encrypted && json.payload) {
      if (!this.encryptionPassword) {
        throw new Error('Sổ này đã được mã hóa (E2EE). Vui lòng nhập Mật khẩu Sổ (Vault Password) trong mục Cài đặt.');
      }
      try {
        const decrypted = await window.CryptoService.decrypt(json.payload, this.encryptionPassword);
        json = JSON.parse(decrypted);
      } catch (decErr) {
        throw new Error('Mật khẩu giải mã Sổ không chính xác! Vui lòng kiểm tra lại mật khẩu Vault.');
      }
    }

    return json;
  }

  // Đẩy dữ liệu lên Drive (mã hóa nếu có mật khẩu E2EE)
  async uploadRemoteData(payloadObj) {
    let bodyText;
    if (this.encryptionPassword && window.CryptoService) {
      const encrypted = await window.CryptoService.encrypt(JSON.stringify(payloadObj), this.encryptionPassword);
      bodyText = JSON.stringify({ encrypted: true, payload: encrypted });
    } else {
      bodyText = JSON.stringify(payloadObj, null, 2);
    }

    if (!this.driveFileId) {
      // Tạo file mới
      const metadata = {
        name: this.syncFileName,
        mimeType: 'application/json'
      };

      if (this.storageLocation === 'appDataFolder') {
        metadata.parents = ['appDataFolder'];
      } else {
        const folderId = await this.ensureCustomFolder();
        if (folderId) {
          metadata.parents = [folderId];
        }
      }

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([bodyText], { type: 'application/json' }));

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.accessToken}` },
        body: form
      });

      if (!res.ok) throw new Error('Tạo tệp mới trên Google Drive thất bại.');
      const data = await res.json();
      this.driveFileId = data.id;
      await db.settings.put({ key: 'googleDriveFileId', value: this.driveFileId });
    } else {
      // Cập nhật file hiện có
      const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${this.driveFileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: bodyText
      });

      if (!res.ok) throw new Error('Cập nhật dữ liệu lên Google Drive thất bại.');
    }
  }

  // Tự động sao lưu một bản dự phòng vào Google Drive cá nhân của thành viên (Mirror Backup)
  async saveMirrorBackup(payloadObj) {
    if (!this.autoMirror || !this.accessToken) return;

    try {
      let bodyText;
      if (this.encryptionPassword && window.CryptoService) {
        const encrypted = await window.CryptoService.encrypt(JSON.stringify(payloadObj), this.encryptionPassword);
        bodyText = JSON.stringify({ encrypted: true, payload: encrypted });
      } else {
        bodyText = JSON.stringify(payloadObj, null, 2);
      }

      const mirrorName = 'SoThuChi_Mirror_Backup.stc';

      // Tìm file mirror cũ trong appDataFolder
      if (!this.mirrorFileId) {
        const query = encodeURIComponent(`name = '${mirrorName}' and trashed = false`);
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id)`, {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        });
        if (searchRes.ok) {
          const d = await searchRes.json();
          if (d.files && d.files.length > 0) {
            this.mirrorFileId = d.files[0].id;
          }
        }
      }

      if (this.mirrorFileId) {
        // Cập nhật mirror
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${this.mirrorFileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: bodyText
        });
      } else {
        // Tạo file mirror mới trong appDataFolder
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({ name: mirrorName, parents: ['appDataFolder'] })], { type: 'application/json' }));
        form.append('file', new Blob([bodyText], { type: 'application/json' }));
        const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.accessToken}` },
          body: form
        });
        if (createRes.ok) {
          const created = await createRes.json();
          this.mirrorFileId = created.id;
        }
      }
      console.log('[GoogleDrive] Đã cập nhật Mirror Backup dự phòng thành công.');
    } catch (mErr) {
      console.warn('Lưu Mirror Backup thất bại:', mErr);
    }
  }

  // Thăng cấp bản sao trên máy thành Sổ Master mới (nếu Owner cũ khóa/xóa tài khoản)
  async promoteToMaster() {
    this.driveFileId = null;
    this.vaultRole = 'owner';
    await db.settings.delete('googleDriveFileId');
    await db.settings.put({ key: 'vaultRole', value: 'owner' });
    showToast('Đã thăng cấp sổ này thành Sổ Chính của bạn!', 'success');
    return await this.sync();
  }

  // Chia sẻ quyền truy cập sổ cho email Google (Owner mời thành viên)
  async shareVaultWithEmail(email, role = 'writer') {
    if (!this.accessToken) {
      await this.requestToken();
    }

    // Google Drive không cho phép chia sẻ file trong 'appDataFolder'.
    // Nếu sổ đang ở appDataFolder, tự động chuyển sang Thư mục riêng 'Sổ Thu Chi' (My Drive) để có thể chia sẻ
    if (this.storageLocation === 'appDataFolder') {
      await this.setStorageLocation('customFolder', 'Sổ Thu Chi');
      this.driveFileId = null; // Tạo file mới ở My Drive
      await this.sync();
    } else if (!this.driveFileId) {
      await this.sync();
    }

    if (!this.driveFileId) {
      throw new Error('Chưa tìm thấy file dữ liệu trên Drive để chia sẻ. Hãy bấm Đồng bộ trước.');
    }

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${this.driveFileId}/permissions?sendNotificationEmail=false`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: role, // 'writer' (Editor) | 'reader' (Viewer)
        type: 'user',
        emailAddress: email.trim()
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Không thể cấp quyền chia sẻ cho email này.');
    }

    return await res.json();
  }

  // Đồng bộ hai chiều với thuật toán Last-Write-Wins theo từng bản ghi
  async sync(options = {}) {
    if (this.isSyncing) return;
    this.isSyncing = true;
    const targetLabel = this.getTargetLabel();
    window.dispatchEvent(new CustomEvent('sync-start', { detail: { target: targetLabel } }));

    try {
      if (!this.hasValidToken()) {
        let refreshedViaWorker = false;
        if (this.workerUrl && this.refreshToken) {
          refreshedViaWorker = await this.refreshViaWorker();
        }

        if (!refreshedViaWorker && !this.hasValidToken()) {
          if (options.interactive) {
            await this.requestToken({ interactive: true });
          } else {
            try {
              await this.requestToken({ prompt: '', interactive: false });
            } catch (tokErr) {
              this.accessToken = null;
              this.tokenExpiresAt = 0;
              console.warn('[GoogleDrive] Không thể lấy token ngầm:', tokErr.message);
              throw new Error('Phiên đăng nhập đã hết hạn. Bấm vào Avatar để kết nối lại.');
            }
          }
        }
      }

      const fileId = await this.findRemoteFile();
      let remoteData = null;
      if (fileId) {
        try {
          remoteData = await this.downloadRemoteData(fileId);
        } catch (downloadErr) {
          console.warn('Lỗi khi đọc file trên Drive:', downloadErr);
          throw downloadErr;
        }
      }

      // Merge local và remote
      const merged = await this.mergeDatabases(remoteData ? remoteData.data : null);

      // Upload kết quả đã gộp lên Google Drive
      const payload = {
        version: '2.0.0',
        syncedAt: new Date().toISOString(),
        data: merged
      };

      await this.uploadRemoteData(payload);

      // Nếu là thành viên và bật Mirror Backup, lưu thêm bản sao vào Drive cá nhân
      if (this.autoMirror) {
        await this.saveMirrorBackup(payload);
      }

      this.lastSyncTime = new Date().toISOString();
      await db.settings.put({ key: 'lastSyncTime', value: this.lastSyncTime });

      window.dispatchEvent(new CustomEvent('sync-success', {
        detail: { time: this.lastSyncTime, target: targetLabel }
      }));
      return { success: true, time: this.lastSyncTime };
    } catch (err) {
      console.error('Google Drive Sync Error:', err);
      window.dispatchEvent(new CustomEvent('sync-error', {
        detail: { error: err.message, target: targetLabel }
      }));
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  // Thuật toán Merge: Last-Write-Wins dựa vào updatedAt
  async mergeDatabases(remoteData) {
    const SYNCABLE_SETTINGS_KEYS = [
      'budget_mode',
      'budget_applicable_accounts',
      'budget_rollover_enabled',
      'budget_auto_rollover',
      'theme',
      'currency',
      'privacyMode'
    ];

    if (!remoteData) {
      // Lần đầu sync: dữ liệu máy trở thành master
      const localSettings = [];
      for (const k of SYNCABLE_SETTINGS_KEYS) {
        const s = await db.settings.get(k);
        if (s) localSettings.push(s);
      }

      // Chỉ chia sẻ các tài khoản được chọn (isShared !== 0 và !== false)
      const allAccs = await db.accounts.toArray();
      const sharedAccs = allAccs.filter(a => a.isShared === undefined || a.isShared === 1 || a.isShared === true);
      const sharedAccIds = new Set(sharedAccs.map(a => Number(a.id)));

      const allTxs = await db.transactions.toArray();
      const sharedTxs = allTxs.filter(t => {
        const accId = Number(t.accountId);
        const toAccId = t.toAccountId ? Number(t.toAccountId) : null;
        return sharedAccIds.has(accId) || (toAccId && sharedAccIds.has(toAccId));
      });

      const local = {
        transactions: sharedTxs,
        accounts: sharedAccs,
        categories: await db.categories.toArray(),
        debts: await db.debts.toArray(),
        budgets: await db.budgets.toArray(),
        recurring: await db.recurring.toArray(),
        savings: db.savings ? await db.savings.toArray() : [],
        accumulations: db.accumulations ? await db.accumulations.toArray() : [],
        assets: db.assets ? await db.assets.toArray() : [],
        loans: db.loans ? await db.loans.toArray() : [],
        settings: localSettings
      };
      return local;
    }

    const mergeTable = async (table, localItems, remoteItems) => {
      if (!table) return [];
      const itemMap = new Map();

      // Nạp local
      for (const item of localItems) {
        itemMap.set(item.id, item);
      }

      // So sánh với remote
      if (remoteItems && Array.isArray(remoteItems)) {
        for (const rItem of remoteItems) {
          let lItem = itemMap.get(rItem.id);
          // Đối với tài khoản, nếu ID khác nhau nhưng cùng tên & loại -> ghép lại tránh nhân đôi
          if (!lItem && table === db.accounts && rItem.name) {
            for (const existing of itemMap.values()) {
              if (existing.name && existing.name.trim().toLowerCase() === rItem.name.trim().toLowerCase() && existing.type === rItem.type) {
                lItem = existing;
                break;
              }
            }
          }

          if (!lItem) {
            // Mới từ remote
            itemMap.set(rItem.id, rItem);
          } else {
            // Đối với tài khoản: nếu remote có số dư mà local là tài khoản trắng (balance: 0), ưu tiên remote
            if (table === db.accounts && (rItem.balance !== 0 || rItem.initialBalance !== 0) && (lItem.balance === 0 && (lItem.initialBalance || 0) === 0)) {
              itemMap.set(lItem.id, { ...rItem, id: lItem.id });
            } else {
              // Giải quyết xung đột: lấy bản ghi có updatedAt mới hơn
              const rTime = rItem.updatedAt || 0;
              const lTime = lItem.updatedAt || 0;
              if (rTime > lTime) {
                itemMap.set(lItem.id, { ...rItem, id: lItem.id });
              }
            }
          }
        }
      }

      const mergedArray = Array.from(itemMap.values());
      // Lưu lại vào IndexedDB máy
      await table.clear();
      await table.bulkAdd(mergedArray);
      return mergedArray;
    };

    // Giữ an toàn cho các tài khoản và giao dịch riêng tư trên máy
    const currentLocalAccs = await db.accounts.toArray();
    const privateAccs = currentLocalAccs.filter(a => a.isShared === 0 || a.isShared === false);
    const privateAccIds = new Set(privateAccs.map(a => Number(a.id)));

    const currentLocalTxs = await db.transactions.toArray();
    const privateTxs = currentLocalTxs.filter(t => {
      const accId = Number(t.accountId);
      const toAccId = t.toAccountId ? Number(t.toAccountId) : null;
      return privateAccIds.has(accId) && (!toAccId || privateAccIds.has(toAccId));
    });

    const finalTransactions = await mergeTable(db.transactions, await db.transactions.toArray(), remoteData.transactions);
    const finalAccounts = await mergeTable(db.accounts, await db.accounts.toArray(), remoteData.accounts);

    // Đảm bảo các tài khoản & giao dịch riêng tư trên máy luôn được giữ nguyên vẹn
    for (const pAcc of privateAccs) {
      if (!finalAccounts.some(a => a.id === pAcc.id)) {
        finalAccounts.push(pAcc);
        await db.accounts.put(pAcc);
      }
    }
    for (const pTx of privateTxs) {
      if (!finalTransactions.some(t => t.id === pTx.id)) {
        finalTransactions.push(pTx);
        await db.transactions.put(pTx);
      }
    }
    const finalCategories = await mergeTable(db.categories, await db.categories.toArray(), remoteData.categories);
    const finalDebts = await mergeTable(db.debts, await db.debts.toArray(), remoteData.debts);
    const finalBudgets = await mergeTable(db.budgets, await db.budgets.toArray(), remoteData.budgets);
    const finalRecurring = await mergeTable(db.recurring, await db.recurring.toArray(), remoteData.recurring);
    const finalSavings = db.savings ? await mergeTable(db.savings, await db.savings.toArray(), remoteData.savings) : [];
    const finalAccumulations = db.accumulations ? await mergeTable(db.accumulations, await db.accumulations.toArray(), remoteData.accumulations) : [];
    const finalAssets = db.assets ? await mergeTable(db.assets, await db.assets.toArray(), remoteData.assets) : [];
    const finalLoans = db.loans ? await mergeTable(db.loans, await db.loans.toArray(), remoteData.loans) : [];

    // Hợp nhất cài đặt ứng dụng (Chế độ ngân sách, tài khoản áp dụng, theme...)
    const finalSettings = [];
    for (const k of SYNCABLE_SETTINGS_KEYS) {
      const l = await db.settings.get(k);
      if (l) finalSettings.push(l);
    }
    if (remoteData.settings && Array.isArray(remoteData.settings)) {
      for (const rSetting of remoteData.settings) {
        if (SYNCABLE_SETTINGS_KEYS.includes(rSetting.key)) {
          const idx = finalSettings.findIndex(s => s.key === rSetting.key);
          const lSetting = idx >= 0 ? finalSettings[idx] : null;
          if (!lSetting || (rSetting.updatedAt || 0) >= (lSetting.updatedAt || 0)) {
            await db.settings.put(rSetting);
            if (idx >= 0) finalSettings[idx] = rSetting;
            else finalSettings.push(rSetting);
          }
        }
      }
    }

    // Tự động đối soát và tính lại số dư sau khi gộp dữ liệu
    if (typeof window.recalculateAccountBalances === 'function') {
      await window.recalculateAccountBalances();
    }

    // Chỉ upload lên đám mây các tài khoản được bật chia sẻ
    const cloudAccounts = finalAccounts.filter(a => a.isShared === undefined || a.isShared === 1 || a.isShared === true);
    const cloudAccountIds = new Set(cloudAccounts.map(a => Number(a.id)));
    const cloudTransactions = finalTransactions.filter(t => {
      const accId = Number(t.accountId);
      const toAccId = t.toAccountId ? Number(t.toAccountId) : null;
      return cloudAccountIds.has(accId) || (toAccId && cloudAccountIds.has(toAccId));
    });

    return {
      transactions: cloudTransactions,
      accounts: cloudAccounts,
      categories: finalCategories,
      debts: finalDebts,
      budgets: finalBudgets,
      recurring: finalRecurring,
      savings: finalSavings,
      accumulations: finalAccumulations,
      assets: finalAssets,
      loans: finalLoans,
      settings: finalSettings
    };
  }
}

window.googleDriveService = new GoogleDriveSync();