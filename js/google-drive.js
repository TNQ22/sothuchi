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
    this.apiKey = '';
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

      const savedApiKey = await db.settings.get('googleApiKey');
      if (savedApiKey && savedApiKey.value) {
        this.apiKey = savedApiKey.value.trim();
      } else if (window.EnvConfig) {
        this.apiKey = window.EnvConfig.get('GOOGLE_API_KEY', '').trim();
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
      this.setupGoogleIframeDismissWatcher();

      // Kiểm tra scope version để đảm bảo token có quyền đọc file sharedWithMe qua REST API
      const REQUIRED_SCOPE_VER = 'v3_full_drive';
      try {
        const scopeVer = await db.settings.get('googleScopeVersion');
        if (!scopeVer || scopeVer.value !== REQUIRED_SCOPE_VER) {
          sessionStorage.removeItem('sothuchi_google_access_token');
          sessionStorage.removeItem('sothuchi_google_token_expires_at');
          await db.settings.delete('googleAccessToken');
          await db.settings.delete('googleTokenExpiresAt');
          await db.settings.put({ key: 'googleScopeVersion', value: REQUIRED_SCOPE_VER });
          console.log('[GoogleDrive] Nâng cấp scope sang full drive để đọc tệp chia sẻ, xóa token cũ.');
        }
      } catch (_) {}

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
          if (this.workerUrl && this.refreshToken && this.clientId) {
            this.refreshViaWorker().catch(e => console.warn('[GoogleDrive] Auto-refresh on init failed:', e));
          }
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

  setApiKey(key) {
    this.apiKey = (key || '').trim();
    db.settings.put({ key: 'googleApiKey', value: this.apiKey });
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

  get isConnected() {
    return Boolean((this.accessToken && this.hasValidToken()) || this.userProfile);
  }

  get isLoggedIn() {
    return Boolean(this.accessToken || this.userProfile);
  }

  async ensureToken(interactive = false) {
    if (this.hasValidToken()) return this.accessToken;
    if (this.workerUrl && this.refreshToken && this.clientId) {
      try {
        const refreshed = await this.refreshViaWorker();
        if (refreshed && this.hasValidToken()) return this.accessToken;
      } catch (_) {}
    }
    if (interactive) {
      return await this.requestToken({ interactive: true, prompt: '' });
    }
    if (this.accessToken) return this.accessToken;
    throw new Error('Chưa kết nối Google Drive hoặc phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
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
          if (window.SyncCoordinator && typeof window.SyncCoordinator.updateUI === 'function') {
            window.SyncCoordinator.updateUI();
          }
          return true;
        }
      }
    } catch (e) {
      console.warn('[GoogleDrive] Gia hạn qua Worker lỗi:', e);
    }
    return false;
  }

  setAutoSync(enabled) {
    this.autoSync = !!enabled;
    db.settings.put({ key: 'autoSyncEnabled', value: this.autoSync });
  }

  // Kiểm tra xem môi trường hiện tại có bị chặn cookie bên thứ 3 trong iframe không (iOS Safari, iOS PWA, WebKit)
  cannotSilentRefresh() {
    // Nếu có Worker backend thì luôn refresh ngầm an toàn bằng HTTP POST
    if (this.workerUrl && this.refreshToken) return false;

    // Các môi trường chặn cookie bên thứ ba trong iframe: iOS Safari, PWA Standalone trên iPhone, Safari desktop
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = Boolean(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    return isIOS || isStandalone || isSafari;
  }

  // Dọn dẹp sạch các iframe / modal rác do Google Identity Services (GIS) tự chèn vào DOM bị kẹt
  cleanupGoogleIframes() {
    try {
      const dismissBtn = document.getElementById('google-iframe-dismiss-btn');
      if (dismissBtn) dismissBtn.remove();

      const picker = document.getElementById('credential_picker_container');
      if (picker) picker.remove();

      const pickerIframe = document.getElementById('credential_picker_iframe');
      if (pickerIframe) pickerIframe.remove();

      const iframes = document.querySelectorAll('iframe[src*="accounts.google.com"]');
      iframes.forEach(iframe => {
        const parent = iframe.parentElement;
        if (parent && parent !== document.body && (parent.style.position === 'fixed' || parent.style.position === 'absolute')) {
          parent.remove();
        } else {
          iframe.remove();
        }
      });
    } catch (_) {}
  }

  // Luôn gắn nút "✕" nổi thoát khẩn cấp nếu có bất kỳ iframe Google nào bị kẹt che toàn màn hình
  setupGoogleIframeDismissWatcher() {
    if (this._iframeDismissWatcherActive) return;
    this._iframeDismissWatcherActive = true;

    const checkAndAttachDismissBtn = () => {
      const iframes = document.querySelectorAll('iframe[src*="accounts.google.com"]');
      const hasVisibleIframe = Array.from(iframes).some(f => {
        try {
          const style = window.getComputedStyle(f);
          return style.display !== 'none' && style.visibility !== 'hidden' && f.offsetHeight > 50;
        } catch (_) {
          return false;
        }
      });

      let btn = document.getElementById('google-iframe-dismiss-btn');
      if (hasVisibleIframe) {
        if (!btn) {
          btn = document.createElement('button');
          btn.id = 'google-iframe-dismiss-btn';
          btn.setAttribute('aria-label', 'Đóng cửa sổ Google');
          btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
          Object.assign(btn.style, {
            position: 'fixed',
            top: '16px',
            right: '16px',
            zIndex: '2147483647',
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(8px)',
            webkitBackdropFilter: 'blur(8px)',
            color: '#ffffff',
            border: '1.5px solid rgba(255, 255, 255, 0.35)',
            borderRadius: '50%',
            width: '42px',
            height: '42px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            transition: 'transform 0.15s ease'
          });
          btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.cleanupGoogleIframes();
          };
          document.body.appendChild(btn);
        }
      } else if (btn) {
        btn.remove();
      }
    };

    try {
      const observer = new MutationObserver(() => {
        checkAndAttachDismissBtn();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
  }

  isAutoSyncEnabled() {
    if (this.autoSync && this.clientId && this.hasValidToken()) {
      return true;
    }
    // Đã cấu hình Cloudflare Worker + Refresh Token -> Luôn tự động đồng bộ ngầm vĩnh viễn trên iPhone!
    if (this.autoSync && this.clientId && this.workerUrl && this.refreshToken) {
      return true;
    }
    // Nếu có email và đã bật autoSync -> cho phép thử gia hạn ngầm khi có dữ liệu mới (chỉ khi không bị chặn bởi iOS/Safari)
    if (this.autoSync && this.clientId && this.userProfile && this.userProfile.email && !this.cannotSilentRefresh()) {
      return true;
    }
    return false;
  }

  setupTokenRefreshTimer() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    // Mỗi 35 phút (trước khi token 60 phút hết hạn), tự động làm mới phiên ngầm
    this.refreshTimer = setInterval(async () => {
      if (this.clientId && this.userProfile?.email && this.autoSync) {
        if (this.workerUrl && this.refreshToken) {
          try {
            await this.refreshViaWorker();
            console.log('[GoogleDrive] Đã tự động gia hạn token qua Worker!');
          } catch (e) {}
        } else if (!this.cannotSilentRefresh()) {
          try {
            await this.requestToken({ prompt: '', interactive: false });
            console.log('[GoogleDrive] Đã tự động gia hạn phiên đăng nhập ngầm thành công!');
          } catch (e) {
            console.log('[GoogleDrive] Chưa thể gia hạn ngầm (sẽ gia hạn khi tương tác):', e.message);
          }
        }
      }
    }, 35 * 60 * 1000);

    this.startAutoPolling();
  }

  startAutoPolling() {
    if (this._pollingStarted) return;
    this._pollingStarted = true;

    // 1. Kiểm tra định kỳ mỗi 60 giây (khi tab đang active)
    setInterval(async () => {
      if (document.hidden) return;
      if (this.autoSync === false || !this.isConnected) return;
      try {
        const p1 = this.syncReceivedSharedItems();
        const p2 = this.pullAndMergeOwnedSharedProjections();
        const [c1, c2] = await Promise.all([p1.catch(() => false), p2.catch(() => false)]);
        if (c1 || c2) {
          if (typeof window.recalculateAccountBalances === 'function') await window.recalculateAccountBalances();
          if (window.app && typeof window.app.refreshAll === 'function') await window.app.refreshAll();
        }
      } catch (_) {}
    }, 60000);

    // 2. Kiểm tra ngay lập tức khi người dùng chuyển qua lại giữa các tab hoặc mở lại app
    const onAppResume = async () => {
      if (this.autoSync === false || !this.isConnected) return;
      try {
        const p1 = this.syncReceivedSharedItems();
        const p2 = this.pullAndMergeOwnedSharedProjections();
        const [c1, c2] = await Promise.all([p1.catch(() => false), p2.catch(() => false)]);
        if (c1 || c2) {
          if (typeof window.recalculateAccountBalances === 'function') await window.recalculateAccountBalances();
          if (window.app && typeof window.app.refreshAll === 'function') await window.app.refreshAll();
        }
      } catch (_) {}
    };

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        await onAppResume();
      }
    });

    window.addEventListener('focus', async () => {
      await onAppResume();
    });
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
    if (this.workerUrl && window.google?.accounts?.oauth2?.initCodeClient && (options.forceCode || options.interactive)) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const startTime = Date.now();
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error('Hết thời gian chờ cấp quyền Google (120 giây)'));
          }
        }, 120000);

        try {
          const codeClient = google.accounts.oauth2.initCodeClient({
            client_id: this.clientId,
            scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
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
                    client_secret: this.clientSecret || '',
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
            },
            error_callback: (err) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              const duration = Date.now() - startTime;
              if (err && err.type === 'popup_closed') {
                const errObj = new Error('Đã đóng cửa sổ đăng nhập');
                errObj.duration = duration;
                errObj.possible2FA = duration > 3500;
                return reject(errObj);
              }
              if (err && err.type === 'popup_failed_to_open') {
                return reject(new Error('popup_blocked'));
              }
              return reject(new Error(err?.message || 'Cửa sổ xác thực Google bị đóng'));
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

    // Chặn yêu cầu ngầm trên iOS/Safari/PWA để tránh lỗi kẹt iframe "Không thể truy cập vào Tài khoản Google của bạn"
    if (!isInteractive && this.cannotSilentRefresh()) {
      return Promise.reject(new Error('Môi trường iOS/Safari/PWA chặn cookie bên thứ 3 trong iframe, bỏ qua gia hạn ngầm. Hãy bấm vào Avatar để kết nối.'));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const startTime = Date.now();
      const timeoutMs = isInteractive ? 120000 : 3500;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.cleanupGoogleIframes();
          if (isInteractive) {
            reject(new Error('Hết thời gian chờ đăng nhập Google (120 giây)'));
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
          scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
          prompt: promptValue,
          callback: async (resp) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            this.cleanupGoogleIframes();

            if (resp.error) {
              if (resp.error === 'popup_closed_by_user') {
                const errObj = new Error('Đã đóng cửa sổ đăng nhập');
                errObj.duration = Date.now() - startTime;
                errObj.possible2FA = errObj.duration > 3500;
                reject(errObj);
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
          },
          error_callback: (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            this.cleanupGoogleIframes();
            const duration = Date.now() - startTime;
            if (err && err.type === 'popup_closed') {
              const errObj = new Error('Đã đóng cửa sổ đăng nhập');
              errObj.duration = duration;
              errObj.possible2FA = duration > 3500;
              return reject(errObj);
            }
            if (err && err.type === 'popup_failed_to_open') {
              return reject(new Error('popup_blocked'));
            }
            return reject(new Error(err?.message || 'Cửa sổ xác thực Google bị đóng'));
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
          this.cleanupGoogleIframes();
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

  // Tự động sao lưu toàn bộ dữ liệu máy (cả tài khoản riêng tư) vào appDataFolder của chính người dùng
  async saveFullPrivateBackup(fullPayloadObj) {
    if (!this.accessToken) return;
    try {
      let bodyText;
      if (this.encryptionPassword && window.CryptoService) {
        const encrypted = await window.CryptoService.encrypt(JSON.stringify(fullPayloadObj), this.encryptionPassword);
        bodyText = JSON.stringify({ encrypted: true, payload: encrypted });
      } else {
        bodyText = JSON.stringify(fullPayloadObj, null, 2);
      }

      const privateVaultName = 'sothuchi_private_vault.json';
      if (!this._privateVaultFileId) {
        const query = encodeURIComponent(`name = '${privateVaultName}' and trashed = false`);
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id)`, {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        });
        if (searchRes.ok) {
          const d = await searchRes.json();
          if (d.files && d.files.length > 0) {
            this._privateVaultFileId = d.files[0].id;
          }
        }
      }

      if (this._privateVaultFileId) {
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${this._privateVaultFileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: bodyText
        });
      } else {
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({ name: privateVaultName, parents: ['appDataFolder'] })], { type: 'application/json' }));
        form.append('file', new Blob([bodyText], { type: 'application/json' }));
        const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.accessToken}` },
          body: form
        });
        if (createRes.ok) {
          const created = await createRes.json();
          this._privateVaultFileId = created.id;
        }
      }
      console.log('[GoogleDrive] Đã sao lưu bản đầy đủ riêng tư (Full Private Vault) vào appDataFolder an toàn 100%.');
    } catch (err) {
      console.warn('Lưu Private Vault thất bại:', err);
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
          } else if (!this.cannotSilentRefresh()) {
            try {
              await this.requestToken({ prompt: '', interactive: false });
            } catch (tokErr) {
              this.accessToken = null;
              this.tokenExpiresAt = 0;
              console.warn('[GoogleDrive] Không thể lấy token ngầm:', tokErr.message);
              throw new Error('Phiên đăng nhập đã hết hạn. Bấm vào Avatar để kết nối lại.');
            }
          } else {
            this.accessToken = null;
            this.tokenExpiresAt = 0;
            throw new Error('Phiên đăng nhập đã hết hạn. Bấm vào Avatar để kết nối lại.');
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

      // 1. Luôn tự động sao lưu bản toàn bộ (cả tài khoản riêng tư) vào appDataFolder của bạn để tránh mất dữ liệu
      try {
        const fullLocalData = {
          transactions: (await db.transactions.toArray()).filter(t => !t._isSharedItem),
          accounts: (await db.accounts.toArray()).filter(a => !a._isSharedItem),
          categories: await db.categories.toArray(),
          debts: await db.debts.toArray(),
          budgets: await db.budgets.toArray(),
          recurring: await db.recurring.toArray(),
          savings: db.savings ? (await db.savings.toArray()).filter(s => !s._isSharedItem) : [],
          accumulations: db.accumulations ? (await db.accumulations.toArray()).filter(a => !a._isSharedItem) : [],
          assets: db.assets ? (await db.assets.toArray()).filter(a => !a._isSharedItem) : [],
          loans: db.loans ? (await db.loans.toArray()).filter(l => !l._isSharedItem) : []
        };
        await this.saveFullPrivateBackup({
          version: '2.0.0',
          syncedAt: new Date().toISOString(),
          data: fullLocalData
        });
      } catch (bkErr) {
        console.warn('Lỗi khi sao lưu Full Private Backup:', bkErr);
      }

      // 2. Nếu là thành viên và bật Mirror Backup, lưu thêm bản sao vào Drive cá nhân
      if (this.autoMirror) {
        await this.saveMirrorBackup(payload);
      }

      // 3. Đồng bộ các mục chia sẻ độc lập (Individual Shared Items)
      try {
        await this.pushAllReceivedSharedItems();
        await this.pullAndMergeOwnedSharedProjections();
        await this.syncReceivedSharedItems();
      } catch (shareErr) {
        console.warn('[GoogleDrive] Lỗi đồng bộ mục chia sẻ:', shareErr);
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

    const leftItems = await this.getLeftSharedItems();
    const isLeft = (shareId, remoteId, localId) => {
      const sId = shareId ? String(shareId) : null;
      const rId = remoteId !== undefined && remoteId !== null ? String(remoteId) : null;
      const lId = localId !== undefined && localId !== null ? String(localId) : null;
      return leftItems.some(x => {
        if (sId && x.shareId && String(x.shareId) === sId) return true;
        if (rId && x.itemId && String(x.itemId) === rId) return true;
        if (lId && x.localId && String(x.localId) === lId) return true;
        if (sId && x.itemId && String(x.itemId) === sId) return true;
        if (rId && x.shareId && String(x.shareId) === rId) return true;
        return false;
      });
    };
    const isLeftItem = (item) => {
      // TUYỆT ĐỐI CHỈ ÁP DỤNG CHO MỤC CHIA SẺ (_isSharedItem), KHÔNG BAO GIỜ ÁP DỤNG CHO DỮ LIỆU CÁ NHÂN!
      if (!item || !item._isSharedItem) return false;
      return isLeft(
        item._shareId || item.shareId,
        item._remoteId !== undefined ? item._remoteId : item.itemId,
        item.id !== undefined ? item.id : item.localId
      );
    };

    // Làm sạch remoteData: loại bỏ hoàn toàn các mục chia sẻ nhận được (_isSharedItem) hoặc đã rời khỏi (blacklist)
    if (remoteData) {
      if (Array.isArray(remoteData.accounts)) {
        remoteData.accounts = remoteData.accounts.filter(a => a && !a._isSharedItem);
      }
      if (Array.isArray(remoteData.transactions)) {
        remoteData.transactions = remoteData.transactions.filter(t => t && !t._isSharedItem);
      }
      if (Array.isArray(remoteData.savings)) {
        remoteData.savings = remoteData.savings.filter(s => s && !s._isSharedItem);
      }
      if (Array.isArray(remoteData.accumulations)) {
        remoteData.accumulations = remoteData.accumulations.filter(a => a && !a._isSharedItem);
      }
      if (Array.isArray(remoteData.loans)) {
        remoteData.loans = remoteData.loans.filter(l => l && !l._isSharedItem);
      }
      if (Array.isArray(remoteData.assets)) {
        remoteData.assets = remoteData.assets.filter(a => a && !a._isSharedItem);
      }
    }

    if (!remoteData) {
      // Lần đầu sync: dữ liệu máy trở thành master
      const localSettings = [];
      for (const k of SYNCABLE_SETTINGS_KEYS) {
        const s = await db.settings.get(k);
        if (s) localSettings.push(s);
      }

      // Chỉ đồng bộ tài khoản và giao dịch cá nhân lên Drive (không bao gồm sổ được chia sẻ)
      const allAccs = await db.accounts.toArray();
      const allTxs = await db.transactions.toArray();
      const local = {
        transactions: allTxs.filter(t => !t._isSharedItem),
        accounts: allAccs.filter(a => !a._isSharedItem),
        categories: await db.categories.toArray(),
        debts: await db.debts.toArray(),
        budgets: await db.budgets.toArray(),
        recurring: await db.recurring.toArray(),
        savings: db.savings ? (await db.savings.toArray()).filter(s => !s._isSharedItem) : [],
        accumulations: db.accumulations ? (await db.accumulations.toArray()).filter(a => !a._isSharedItem) : [],
        assets: db.assets ? (await db.assets.toArray()).filter(a => !a._isSharedItem) : [],
        loans: db.loans ? (await db.loans.toArray()).filter(l => !l._isSharedItem) : [],
        settings: localSettings
      };
      return local;
    }

    const resolveDeletedStatus = (itemA, itemB) => {
      const isA = Boolean(itemA && itemA.isDeleted);
      const isB = Boolean(itemB && itemB.isDeleted);

      if (isA && isB) {
        const delAt = (itemA && itemA.deletedAt) || (itemB && itemB.deletedAt) || Math.max(
          new Date((itemA && itemA.updatedAt) || 0).getTime() || 0,
          new Date((itemB && itemB.updatedAt) || 0).getTime() || 0
        );
        const source = (itemA && itemA.deletedSource) || (itemB && itemB.deletedSource) || 'sync';
        const reason = (itemA && itemA.deletedReason) || (itemB && itemB.deletedReason) || 'Đồng bộ từ Google Drive / thiết bị khác';
        return { isDeleted: 1, deletedAt: delAt, deletedSource: source, deletedReason: reason };
      }

      if (!isA && !isB) {
        return { isDeleted: 0, deletedAt: null, deletedSource: null, deletedReason: null };
      }

      const deletedItem = isA ? itemA : itemB;
      const activeItem = isA ? itemB : itemA;

      const deletedTime = new Date(deletedItem.deletedAt || deletedItem.updatedAt || 0).getTime() || 0;
      const activeTime = new Date(activeItem.restoredAt || activeItem.updatedAt || 0).getTime() || 0;

      if (activeTime > deletedTime) {
        return {
          isDeleted: 0,
          deletedAt: null,
          deletedSource: null,
          deletedReason: null,
          restoredAt: activeItem.restoredAt || activeTime
        };
      }

      return {
        isDeleted: 1,
        deletedAt: deletedItem.deletedAt || deletedTime,
        deletedSource: deletedItem.deletedSource || 'sync',
        deletedReason: deletedItem.deletedReason || 'Đồng bộ từ Google Drive / thiết bị khác'
      };
    };

    const mergeTable = async (table, localItems, remoteItems) => {
      if (!table) return [];
      const itemMap = new Map();

      // Nạp local
      for (const item of localItems) {
        if (item && item.id !== undefined && item.id !== null) {
          itemMap.set(String(item.id), item);
        }
      }

      // So sánh với remote
      if (remoteItems && Array.isArray(remoteItems)) {
        for (const rItem of remoteItems) {
          if (!rItem || rItem.id === undefined || rItem.id === null) continue;
          let lItem = itemMap.get(String(rItem.id));
          // Đối với tài khoản, nếu ID khác nhau nhưng cùng tên & loại -> ghép lại tránh nhân đôi
          if (!lItem && table === db.accounts && rItem.name) {
            for (const existing of itemMap.values()) {
              if (existing.name && existing.name.trim().toLowerCase() === rItem.name.trim().toLowerCase() && existing.type === rItem.type) {
                lItem = existing;
                break;
              }
            }
          }

          // Đối với giao dịch, nếu chưa khớp ID thì kiểm tra khớp signature
          if (!lItem && table === db.transactions && (rItem.amount !== undefined && rItem.date !== undefined)) {
            for (const [key, existing] of itemMap.entries()) {
              const sameType = existing.type === rItem.type;
              const sameDate = String(existing.date || '').slice(0, 10) === String(rItem.date || '').slice(0, 10);
              const sameTime = !existing.time || !rItem.time || String(existing.time) === String(rItem.time);
              const sameAmount = Math.abs(Number(existing.amount || 0) - Number(rItem.amount || 0)) < 0.01;
              const sameAccount = Number(existing.accountId) === Number(rItem.accountId);
              const sameNote = (existing.note || '').trim() === (rItem.note || '').trim();
              if (sameType && sameDate && sameTime && sameAmount && sameAccount && sameNote) {
                lItem = existing;
                break;
              }
            }
          }

          if (!lItem) {
            // Mới từ remote
            itemMap.set(String(rItem.id), rItem);
          } else {
            const DEFAULT_ACCOUNT_NAMES = ['tiền mặt', 'ngân hàng', 'ví điện tử', 'momo / zalopay', 'tài khoản ngân hàng'];
            const isDef = lItem.name && DEFAULT_ACCOUNT_NAMES.includes(lItem.name.trim().toLowerCase());
            const isBlank = (lItem.balance === 0 || lItem.balance === '0') && ((lItem.initialBalance || 0) === 0) && !lItem.isShared;
            const isUntouchedDef = isDef && isBlank && (Number(lItem.updatedAt || 0) <= 1);

            if (table === db.accounts && isUntouchedDef && rItem.isDeleted) {
              itemMap.set(String(lItem.id), { ...rItem, id: lItem.id, isDeleted: 1 });
            } else if (table === db.accounts && isUntouchedDef && (rItem.balance !== 0 || rItem.initialBalance !== 0) && !rItem.isDeleted) {
              const localOrder = (lItem && lItem.order !== undefined && lItem.order !== null) ? lItem.order : rItem.order;
              itemMap.set(String(lItem.id), { ...rItem, id: lItem.id, order: localOrder });
            } else {
              // Giải quyết xung đột: lấy bản ghi có updatedAt mới hơn kết hợp Restore/Tombstone Priority
              const rTime = new Date(rItem.updatedAt || 0).getTime() || 0;
              const lTime = new Date(lItem.updatedAt || 0).getTime() || 0;
              const older = rTime >= lTime ? lItem : rItem;
              const newer = rTime >= lTime ? rItem : lItem;
              const localOrder = (table === db.accounts && lItem && lItem.order !== undefined && lItem.order !== null) ? lItem.order : (older.order ?? newer.order);
              const merged = { ...older, ...newer, id: lItem.id };
              if (localOrder !== undefined && localOrder !== null) merged.order = localOrder;
              const delStatus = resolveDeletedStatus(lItem, rItem);
              Object.assign(merged, delStatus);
              itemMap.set(String(lItem.id), merged);
            }
          }
        }
      }

      // Khôi phục và bảo vệ đầy đủ các tài khoản mặc định (như Ví tiền mặt, Ngân hàng, Ví điện tử)
      if (table === db.accounts) {
        const activePersonal = Array.from(itemMap.values()).filter(a => a && !a._isSharedItem);
        const now = Date.now();
        for (let idx = 0; idx < DEFAULT_ACCOUNTS.length; idx++) {
          const defAcc = DEFAULT_ACCOUNTS[idx];
          const exists = activePersonal.find(a => 
            a.name && (
              a.name.trim().toLowerCase() === defAcc.name.trim().toLowerCase() ||
              (defAcc.type === 'cash' && (a.type === 'cash' || a.name.trim().toLowerCase().includes('tiền mặt')))
            )
          );
          if (!exists) {
            itemMap.set(`def_${idx}`, {
              ...defAcc,
              order: defAcc.order ?? idx,
              isDeleted: 0,
              updatedAt: now,
              restoredAt: now
            });
            console.log(`[GoogleDrive] Tự động phục hồi ví mặc định bị thiếu: ${defAcc.name}`);
          } else if (exists.isDeleted === 1 && exists.deletedSource !== 'user') {
            exists.isDeleted = 0;
            exists.deletedAt = null;
            exists.deletedReason = null;
            exists.updatedAt = now;
            exists.restoredAt = now;
            console.log(`[GoogleDrive] Phục hồi ví mặc định bị xóa nhầm do sync: ${exists.name}`);
          }
        }
      }

      const mergedArray = Array.from(itemMap.values());
      // Lưu lại vào IndexedDB máy
      await table.clear();
      await table.bulkAdd(mergedArray);
      return mergedArray;
    };

    // Thu thập và làm sạch dữ liệu địa phương
    const allLocalAccs = await db.accounts.toArray();
    const allLocalTxs = await db.transactions.toArray();

    // 1. Xóa sạch các tài khoản chia sẻ đã rời khỏi (blacklist) khỏi IndexedDB
    for (const a of allLocalAccs) {
      if (a._isSharedItem && isLeftItem(a)) {
        await db.accounts.delete(a.id);
        if (a.id !== undefined && !isNaN(Number(a.id))) {
          await db.accounts.delete(Number(a.id));
        }
        await db.accounts.delete(String(a.id));
        const relTxs = allLocalTxs.filter(t =>
          Number(t.accountId) === Number(a.id) || Number(t.toAccountId) === Number(a.id) ||
          String(t.accountId) === String(a.id) || String(t.toAccountId) === String(a.id) ||
          (a._shareId && String(t._shareId) === String(a._shareId))
        );
        for (const t of relTxs) await db.transactions.delete(t.id);
      }
    }

    // 2. Tách dữ liệu cá nhân (để gộp 2 chiều vào Drive) và dữ liệu chia sẻ hợp lệ
    const personalLocalAccs = allLocalAccs.filter(a => !a._isSharedItem);
    const personalLocalTxs = allLocalTxs.filter(t => !t._isSharedItem);

    const isServerConnected = Boolean(window.serverSyncService && window.serverSyncService.token);
    const validSharedAccs = allLocalAccs.filter(a => {
      if (!a._isSharedItem || isLeftItem(a)) return false;
      if ((a._sharedService === 'server' || !a._sharedService) && !isServerConnected) {
        return false; // Server đã ngắt kết nối / đăng xuất
      }
      return true;
    });
    const validSharedAccIds = new Set(validSharedAccs.map(a => String(a.id)));
    const validSharedTxs = allLocalTxs.filter(t => {
      if (!t._isSharedItem && !validSharedAccIds.has(String(t.accountId)) && !validSharedAccIds.has(String(t.toAccountId))) return false;
      if (isLeftItem(t)) return false;
      return true;
    });

    // Gộp hai chiều CHỈ dữ liệu cá nhân vào Drive
    const finalTransactions = await mergeTable(db.transactions, personalLocalTxs, remoteData.transactions);
    const finalAccounts = await mergeTable(db.accounts, personalLocalAccs, remoteData.accounts);
    const finalCategories = await mergeTable(db.categories, await db.categories.toArray(), remoteData.categories);
    const finalDebts = await mergeTable(db.debts, await db.debts.toArray(), remoteData.debts);
    const finalBudgets = await mergeTable(db.budgets, await db.budgets.toArray(), remoteData.budgets);
    const finalRecurring = await mergeTable(db.recurring, await db.recurring.toArray(), remoteData.recurring);
    const finalSavings = db.savings ? await mergeTable(db.savings, (await db.savings.toArray()).filter(s => !s._isSharedItem), remoteData.savings) : [];
    const finalAccumulations = db.accumulations ? await mergeTable(db.accumulations, (await db.accumulations.toArray()).filter(a => !a._isSharedItem), remoteData.accumulations) : [];
    const finalAssets = db.assets ? await mergeTable(db.assets, (await db.assets.toArray()).filter(a => !a._isSharedItem), remoteData.assets) : [];
    const finalLoans = db.loans ? await mergeTable(db.loans, (await db.loans.toArray()).filter(l => !l._isSharedItem), remoteData.loans) : [];

    // Phục hồi lại các mục chia sẻ hợp lệ vào IndexedDB sau khi mergeTable đã clear
    for (const sAcc of validSharedAccs) {
      await db.accounts.put(sAcc);
    }
    for (const sTx of validSharedTxs) {
      await db.transactions.put(sTx);
    }

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
          // Chỉ ghi đè cài đặt cục bộ nếu remote thực sự mới hơn (Last-Write-Wins nghiêm ngặt)
          if (!lSetting || ((rSetting.updatedAt || 0) > (lSetting.updatedAt || 0))) {
            await db.settings.put(rSetting);
            if (idx >= 0) finalSettings[idx] = rSetting;
            else finalSettings.push(rSetting);
          }
        }
      }
    }

    if (typeof window.enforceAccountsDisplayOrder === 'function') {
      await window.enforceAccountsDisplayOrder();
    }

    // Tự động đối soát và tính lại số dư sau khi gộp dữ liệu
    if (typeof window.recalculateAccountBalances === 'function') {
      await window.recalculateAccountBalances();
    }

    // Đồng bộ đầy đủ tất cả tài khoản và giao dịch lên đám mây
    return {
      transactions: finalTransactions,
      accounts: finalAccounts,
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

  // ===========================================================================
  // GRANULAR PER-ITEM SHARING (TÀI KHOẢN, SỔ TIẾT KIỆM, TÍCH LUỸ, VAY, TÀI SẢN)
  // CLIENT-SIDE SERVERLESS GOOGLE DRIVE REST API v3
  // ===========================================================================

  async getSharedFileMap() {
    try {
      const s = await db.settings.get('googleDriveSharedFileMap');
      return (s && s.value && typeof s.value === 'object') ? s.value : {};
    } catch (_) {
      return {};
    }
  }

  async setSharedFileId(itemType, itemId, fileId) {
    const map = await this.getSharedFileMap();
    map[`${itemType}_${itemId}`] = fileId;
    await db.settings.put({ key: 'googleDriveSharedFileMap', value: map });
  }

  async getSharedFileId(itemType, itemId) {
    const map = await this.getSharedFileMap();
    if (map[`${itemType}_${itemId}`]) return map[`${itemType}_${itemId}`];
    if (this.accessToken) {
      try {
        const tag = `stc_shared_${itemType}_${itemId}`;
        const oldFileName = `stc_shared_${itemType}_${itemId}.json`;
        const q = encodeURIComponent(`(name contains 'stc_shared' or name contains '${itemId}') and trashed = false`);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=drive&q=${q}&fields=files(id,name,appProperties)&orderBy=modifiedTime desc&pageSize=50`, {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        });
        if (res.ok) {
          const d = await res.json();
          if (Array.isArray(d.files)) {
            const match = d.files.find(f =>
              (f.name && (f.name.includes(tag) || f.name === oldFileName || f.name.includes(String(itemId)))) ||
              (f.appProperties?.stcItemId === String(itemId))
            );
            if (match) {
              await this.setSharedFileId(itemType, itemId, match.id);
              return match.id;
            }
          }
        }
      } catch (_) {}
    }
    return null;
  }

  async getItemShareKey(keyIdentifier) {
    if (!keyIdentifier) return null;
    try {
      const settings = (await db.settings.get('syncItemShareKeys')) || { value: {} };
      const map = settings.value || {};
      return map[String(keyIdentifier)] || null;
    } catch (_) {
      return null;
    }
  }

  async saveItemShareKey(keyIdentifier, key) {
    if (!keyIdentifier || !key) return;
    try {
      const settings = (await db.settings.get('syncItemShareKeys')) || { key: 'syncItemShareKeys', value: {} };
      const map = settings.value || {};
      map[String(keyIdentifier)] = key;
      await db.settings.put({ key: 'syncItemShareKeys', value: map });
    } catch (e) {
      console.warn('[GoogleDrive] Không thể lưu item share key:', e);
    }
  }

  async deleteItemShareKey(keyIdentifier) {
    if (!keyIdentifier) return;
    try {
      const settings = (await db.settings.get('syncItemShareKeys')) || { key: 'syncItemShareKeys', value: {} };
      const map = settings.value || {};
      const idStr = String(keyIdentifier);
      if (map[idStr] !== undefined) {
        delete map[idStr];
        await db.settings.put({ key: 'syncItemShareKeys', value: map });
      }
    } catch (e) {
      console.warn('[GoogleDrive] Không thể xóa item share key:', e);
    }
  }

  async getLeftSharedItems() {
    try {
      const setting = await db.settings.get('syncLeftSharedItems');
      const list = (setting && Array.isArray(setting.value)) ? setting.value : [];
      // Làm sạch các mục lưu nhầm không có shareId/vaultId mà chỉ có id nhỏ của tài khoản cá nhân
      const cleaned = list.filter(x => {
        if (!x) return false;
        if (x.shareId || x.vaultId) return true;
        const idVal = Number(x.itemId || x.localId);
        if (!isNaN(idVal) && idVal >= 0 && idVal <= 10) return false;
        return true;
      });
      if (cleaned.length !== list.length) {
        await db.settings.put({ key: 'syncLeftSharedItems', value: cleaned });
      }
      return cleaned;
    } catch (_) {
      return [];
    }
  }

  async recordLeftSharedItem({ shareId, vaultId, itemType, itemId, localId }) {
    try {
      const list = await this.getLeftSharedItems();
      const sId = shareId ? String(shareId) : null;
      const vId = vaultId ? String(vaultId) : null;
      const iId = itemId !== undefined && itemId !== null ? String(itemId) : null;
      const lId = localId !== undefined && localId !== null ? String(localId) : null;
      const exists = list.some(x => {
        if (sId && x.shareId && x.shareId === sId) return true;
        if (itemType && iId && x.itemType === itemType && String(x.itemId) === iId) return true;
        if (lId && x.localId && String(x.localId) === lId) return true;
        return false;
      });
      if (!exists) {
        list.push({ shareId: sId, vaultId: vId, itemType: itemType || 'account', itemId: iId, localId: lId, service: 'google-drive', leftAt: Date.now() });
        await db.settings.put({ key: 'syncLeftSharedItems', value: list });
      }
    } catch (e) {
      console.warn('[GoogleDrive] recordLeftSharedItem error:', e);
    }
  }

  async clearLeftSharedItem({ shareId, vaultId, itemType, itemId }) {
    try {
      let list = await this.getLeftSharedItems();
      const sId = shareId ? String(shareId) : null;
      const iId = itemId ? String(itemId) : null;
      const filtered = list.filter(x => {
        if (sId && x.shareId && x.shareId === sId) return false;
        if (itemType && iId && x.itemType === itemType && String(x.itemId) === iId) return false;
        return true;
      });
      await db.settings.put({ key: 'syncLeftSharedItems', value: filtered });
    } catch (_) {}
  }

  async leaveReceivedSharedItem({ shareId, vaultId, itemType, itemId, localId }) {
    await this.recordLeftSharedItem({ shareId, vaultId, itemType, itemId, localId });
    try {
      const settings = (await db.settings.get('syncItemShareKeys')) || { key: 'syncItemShareKeys', value: {} };
      const map = settings.value || {};
      if (shareId) delete map[String(shareId)];
      if (itemId) delete map[String(itemId)];
      if (itemType && itemId) delete map[`${itemType}_${itemId}`];
      await db.settings.put({ key: 'syncItemShareKeys', value: map });
    } catch (_) {}

    try {
      const recSetting = (await db.settings.get('googleDriveReceivedFiles')) || { key: 'googleDriveReceivedFiles', value: [] };
      const list = Array.isArray(recSetting.value) ? recSetting.value.filter(x => x.fileId !== shareId) : [];
      await db.settings.put({ key: 'googleDriveReceivedFiles', value: list });
    } catch (_) {}

    // Gỡ tệp khỏi danh sách Shared With Me trên Google Drive của chính mình
    if (shareId && this.accessToken) {
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${shareId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${this.accessToken}` }
        });
        console.log('[GoogleDrive] Đã gỡ tệp chia sẻ khỏi Drive:', shareId);
      } catch (err) {
        console.warn('[GoogleDrive] Không thể gỡ tệp chia sẻ khỏi Drive:', err);
      }
    }
  }

  async projectAndPushItem(itemType, itemId, shareKey = null) {
    await this.ensureToken(true);

    let targetItem = null;
    let transactions = [];
    if (itemType === 'account') {
      targetItem = await db.accounts.get(Number(itemId));
      if (targetItem) {
        transactions = (await db.transactions.toArray()).filter(t => {
          if (t._isSharedItem) return false;
          if (t.isDeleted && t.isDeleted !== 0) return false;
          return Number(t.accountId) === Number(itemId) || Number(t.toAccountId) === Number(itemId);
        });
      }
    } else if (itemType === 'savings' && db.savings) {
      targetItem = await db.savings.get(Number(itemId));
    } else if (itemType === 'accumulation' && db.accumulations) {
      targetItem = await db.accumulations.get(Number(itemId));
    } else if (itemType === 'loan' && db.loans) {
      targetItem = await db.loans.get(Number(itemId));
    } else if (itemType === 'asset' && db.assets) {
      targetItem = await db.assets.get(Number(itemId));
    }

    if (!targetItem) throw new Error('Không tìm thấy mục cần trích xuất trên thiết bị này.');

    let fileId = await this.getSharedFileId(itemType, itemId);

    // Differential merge: Nếu file đã tồn tại trên Drive, tải về để kiểm tra giao dịch do thành viên khác tạo
    if (fileId && itemType === 'account') {
      try {
        const pullRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        });
        if (pullRes.ok) {
          const pullText = await pullRes.text();
          let remoteJson = JSON.parse(pullText);
          let remotePayload = remoteJson;
          const currentShareKey = shareKey || (await this.getItemShareKey(`${itemType}_${itemId}`)) || this.encryptionPassword;
          if (remoteJson.encrypted && remoteJson.payload && currentShareKey && window.CryptoService) {
            try {
              const dec = await window.CryptoService.decrypt(remoteJson.payload, currentShareKey);
              remotePayload = JSON.parse(dec);
            } catch (_) {}
          }
          const remoteTxs = Array.isArray(remotePayload.transactions) ? remotePayload.transactions : [];
          if (remoteTxs.length > 0) {
            let localChanged = false;
            const currentTxs = await db.transactions.toArray();
            const currentMap = new Map();
            for (const ct of currentTxs) {
              currentMap.set(String(ct._remoteTxId || ct.id), ct);
            }
            for (const rtx of remoteTxs) {
              if (rtx && rtx.recordedByOther === 1) {
                const existing = currentMap.get(String(rtx.id));
                if (!existing) {
                  const toAdd = {
                    ...rtx,
                    accountId: Number(itemId),
                    _remoteTxId: rtx.id,
                    isDeleted: rtx.isDeleted ? 1 : 0
                  };
                  delete toAdd.id;
                  await db.transactions.add(toAdd);
                  localChanged = true;
                }
              }
            }
            if (localChanged) {
              if (typeof window.recalculateAccountBalances === 'function') {
                await window.recalculateAccountBalances();
              }
              // Nạp lại giao dịch mới nhất
              transactions = (await db.transactions.toArray()).filter(t => {
                if (t._isSharedItem) return false;
                if (t.isDeleted && t.isDeleted !== 0) return false;
                return Number(t.accountId) === Number(itemId) || Number(t.toAccountId) === Number(itemId);
              });
            }
          }
        }
      } catch (mergeErr) {
        console.warn('[GoogleDrive] Kiểm tra giao dịch từ xa khi chiếu:', mergeErr);
      }
    }

    const categories = await db.categories.toArray();
    const catMap = new Map();
    for (const c of categories) {
      if (c && c.id) catMap.set(String(c.id), c);
    }
    const cleanItem = { ...targetItem };
    delete cleanItem._isSharedItem;
    delete cleanItem._shareId;
    delete cleanItem.includeInReport;
    delete cleanItem.includeInBudget;

    const projectedPayload = {
      version: 1,
      itemType,
      itemId: String(itemId),
      itemName: cleanItem.name || cleanItem.borrowerName || 'Mục chia sẻ',
      owner: {
        name: this.userProfile?.name || '',
        email: this.userProfile?.email || ''
      },
      item: cleanItem,
      transactions: transactions.map(t => {
        const copy = { ...t };
        delete copy._isSharedItem;
        delete copy._shareId;
        if (copy.categoryId) {
          const c = catMap.get(String(copy.categoryId));
          if (c) {
            copy.categoryName = c.name;
            copy.categoryIcon = c.icon;
            copy.categoryColor = c.color;
          }
        }
        return copy;
      }),
      categories,
      projectedAt: new Date().toISOString()
    };

    if (!shareKey && this.encryptionPassword) {
      shareKey = (await this.getItemShareKey(`${itemType}_${itemId}`)) || this.encryptionPassword;
    }

    let fileContent = '';
    if (shareKey && window.CryptoService) {
      const encryptedStr = await window.CryptoService.encrypt(JSON.stringify(projectedPayload), shareKey);
      fileContent = JSON.stringify({
        encrypted: true,
        payload: encryptedStr,
        itemType,
        itemId: String(itemId),
        itemName: projectedPayload.itemName,
        owner: projectedPayload.owner,
        updatedAt: new Date().toISOString()
      }, null, 2);
      await this.saveItemShareKey(`${itemType}_${itemId}`, shareKey);
    } else {
      fileContent = JSON.stringify({
        encrypted: false,
        ...projectedPayload,
        updatedAt: new Date().toISOString()
      }, null, 2);
    }

    // Đặt tên file thân thiện dễ đọc trên Google Drive / Google Picker: "[Tên sổ] - [Email chủ] (stc_shared_account_123).json"
    const safeItemName = (projectedPayload.itemName || 'Sổ').replace(/[\\/:*?"<>|]/g, '').trim() || 'Sổ';
    let ownerEmail = (this.userProfile?.email || projectedPayload.owner?.email || '').trim();
    if (!ownerEmail && this.accessToken) {
      try {
        const profile = await this.fetchUserProfile();
        if (profile?.email) ownerEmail = profile.email.trim();
      } catch (_) {}
    }
    const ownerTag = ownerEmail ? ` - ${ownerEmail}` : '';
    const sharedFileName = `${safeItemName}${ownerTag} (stc_shared_${itemType}_${itemId}).json`;

    if (!fileId) {
      // Bắt buộc lưu vào My Drive Custom Folder (Google Drive CẤM share file trong appDataFolder)
      const folderId = await this.ensureCustomFolder();
      const metadata = {
        name: sharedFileName,
        mimeType: 'application/json',
        description: safeItemName,
        properties: {
          itemName: safeItemName,
          itemType: itemType,
          ownerEmail: ownerEmail || ''
        },
        appProperties: {
          stcApp: 'so-thu-chi',
          stcItemType: itemType,
          stcItemId: String(itemId),
          stcOwnerEmail: ownerEmail || '',
          stcItemName: safeItemName
        }
      };
      if (folderId) {
        metadata.parents = [folderId];
      }

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([fileContent], { type: 'application/json' }));

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.accessToken}` },
        body: form
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Không thể tạo file chia sẻ trên Google Drive.');
      }
      const created = await res.json();
      fileId = created.id;
      await this.setSharedFileId(itemType, itemId, fileId);
    } else {
      const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: fileContent
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Không thể cập nhật file chia sẻ trên Google Drive.');
      }

      // Tự động đồng bộ/cập nhật tên hiển thị thân thiện trên Google Drive
      fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: sharedFileName,
          description: safeItemName,
          properties: {
            itemName: safeItemName,
            itemType: itemType,
            ownerEmail: ownerEmail || ''
          },
          appProperties: {
            stcApp: 'so-thu-chi',
            stcItemType: itemType,
            stcItemId: String(itemId),
            stcOwnerEmail: ownerEmail || '',
            stcItemName: safeItemName
          }
        })
      }).catch(() => {});
    }

    try {
      const ownedShares = (await db.settings.get('syncOwnedSharedProjections')) || { key: 'syncOwnedSharedProjections', value: [] };
      const list = Array.isArray(ownedShares.value) ? ownedShares.value : [];
      const existing = list.find(x => x.itemType === itemType && String(x.itemId) === String(itemId) && x.service === 'google-drive');
      if (existing) {
        existing.fileId = fileId;
        existing.shareKey = shareKey || null;
      } else {
        list.push({ itemType, itemId: String(itemId), fileId, shareKey: shareKey || null, service: 'google-drive' });
      }
      await db.settings.put({ key: 'syncOwnedSharedProjections', value: list });
    } catch (_) {}

    return { success: true, fileId, shareKey };
  }

  async getItemShares(itemType, itemId) {
    const fileId = await this.getSharedFileId(itemType, itemId);
    if (!fileId) return { shares: [], links: [] };

    await this.ensureToken();
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(id,type,role,emailAddress,displayName,photoLink)`, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      if (!res.ok) return { shares: [], links: [] };
      const data = await res.json();
      const myEmail = (this.userProfile?.email || '').toLowerCase();
      const shares = [];
      const links = [];

      for (const p of (data.permissions || [])) {
        if (p.type === 'user') {
          if (p.emailAddress && p.emailAddress.toLowerCase() === myEmail) continue;
          shares.push({
            id: p.id,
            user_email: p.emailAddress || '',
            user_name: p.displayName || p.emailAddress || '',
            user_picture: p.photoLink || null,
            role: p.role === 'writer' ? 'editor' : 'viewer',
            service: 'google-drive'
          });
        } else if (p.type === 'anyone') {
          links.push({
            id: p.id,
            token: `gdrive_${fileId}`,
            role: p.role === 'writer' ? 'editor' : 'viewer',
            created_at: new Date().toISOString(),
            service: 'google-drive'
          });
        }
      }
      return { shares, links };
    } catch (err) {
      console.warn('[GoogleDrive] getItemShares error:', err);
      return { shares: [], links: [] };
    }
  }

  async shareItemWithEmail(itemType, itemId, itemName, email, role = 'viewer', password = null) {
    await this.ensureToken(true);
    let shareKey = password ? password.trim() : null;
    if (!shareKey && this.encryptionPassword) {
      shareKey = (await this.getItemShareKey(`${itemType}_${itemId}`)) || this.encryptionPassword;
    }

    const { fileId } = await this.projectAndPushItem(itemType, itemId, shareKey);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=false`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: role === 'editor' ? 'writer' : 'reader',
        type: 'user',
        emailAddress: email.trim()
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Không thể chia sẻ tới email này trên Google Drive.');
    }

    const perm = await res.json();
    if (shareKey) {
      await this.saveItemShareKey(perm.id, shareKey);
    }

    return {
      success: true,
      share: {
        id: perm.id,
        user_email: email.trim(),
        role,
        shareKey
      }
    };
  }

  async createItemShareLink(itemType, itemId, itemName, role = 'viewer', customKey = null) {
    await this.ensureToken(true);
    let shareKey = customKey ? customKey.trim() : null;
    if (!shareKey && this.encryptionPassword) {
      shareKey = (await this.getItemShareKey(`${itemType}_${itemId}`)) || this.encryptionPassword;
    }

    const { fileId } = await this.projectAndPushItem(itemType, itemId, shareKey);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: role === 'editor' ? 'writer' : 'reader',
        type: 'anyone'
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Không thể tạo liên kết chia sẻ trên Google Drive.');
    }

    const perm = await res.json();
    const token = `gdrive_${fileId}`;
    if (shareKey) {
      await this.saveItemShareKey(token, shareKey);
      await this.saveItemShareKey(fileId, shareKey);
    }

    return {
      success: true,
      link: {
        id: perm.id,
        token,
        role,
        shareKey
      }
    };
  }

  async revokeItemEmailShare(shareId, itemType, itemId) {
    await this.ensureToken();
    const fileId = await this.getSharedFileId(itemType, itemId);
    if (!fileId) return { success: true };

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${shareId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    if (!res.ok && res.status !== 404) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Thu hồi quyền chia sẻ thất bại.');
    }
    await this.deleteItemShareKey(shareId);
    return { success: true };
  }

  async revokeItemShareLink(linkId, itemType, itemId) {
    await this.ensureToken();
    const fileId = await this.getSharedFileId(itemType, itemId);
    if (!fileId) return { success: true };

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${linkId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    if (!res.ok && res.status !== 404) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Thu hồi liên kết chia sẻ thất bại.');
    }
    await this.deleteItemShareKey(`gdrive_${fileId}`);
    return { success: true };
  }

  // Khi chủ sở hữu xóa sổ/tài khoản, tự động hủy chia sẻ và xóa tệp chia sẻ trên Google Drive
  async unshareOwnedItem(itemType, itemId) {
    try {
      await this.ensureToken(false);
      if (!this.accessToken) return { success: true };

      const fileId = await this.getSharedFileId(itemType, itemId);
      if (fileId) {
        try {
          await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${this.accessToken}` }
          });
          console.log(`[GoogleDrive] Đã hủy chia sẻ và xóa file ${fileId} của ${itemType} #${itemId} trên Drive.`);
        } catch (e) {
          console.warn('[GoogleDrive] Lỗi khi xóa file chia sẻ trên Drive:', e);
        }
        await this.setSharedFileId(itemType, itemId, null);
      }
      await this.deleteItemShareKey(`${itemType}_${itemId}`);
      return { success: true };
    } catch (err) {
      console.warn('[GoogleDrive] unshareOwnedItem warning:', err);
      return { success: false, error: err.message };
    }
  }

  async getShareLinkInfo(token) {
    const fileId = token.replace(/^gdrive_/, '');
    await this.ensureToken(true);

    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,owners,capabilities,shared`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    if (!metaRes.ok) {
      throw new Error('Liên kết chia sẻ không tồn tại hoặc bạn không có quyền truy cập file này.');
    }
    const meta = await metaRes.json();

    const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    if (!mediaRes.ok) {
      throw new Error('Không thể đọc dữ liệu mục chia sẻ từ Google Drive.');
    }
    const rawText = await mediaRes.text();
    let json = JSON.parse(rawText);

    const isEncrypted = Boolean(json.encrypted);
    const itemName = json.itemName || json.item?.name || meta.name?.replace(/\s*\([^\)]*stc_shared[^\)]*\)/i, '').replace(/^stc_shared_[^_]+_[^_]+_?/, '').replace(/\.json$/, '').trim() || 'Tài khoản chia sẻ';
    const itemType = json.itemType || 'account';
    const ownerName = json.owner?.name || meta.owners?.[0]?.displayName || 'Chủ sở hữu';
    const ownerEmail = json.owner?.email || meta.owners?.[0]?.emailAddress || '';
    const role = meta.capabilities?.canEdit ? 'editor' : 'viewer';

    return {
      token,
      fileId,
      itemType,
      itemId: json.itemId || fileId,
      itemName,
      ownerName,
      ownerEmail,
      role,
      isEncrypted,
      service: 'google-drive'
    };
  }

  // Đảm bảo module Google Picker (api.js + gapi.load('picker')) được tải sẵn sàng
  async ensurePickerLoaded() {
    if (window.google?.picker) return true;

    if (typeof gapi === 'undefined') {
      await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[src*="apis.google.com/js/api.js"]');
        if (existing) {
          existing.addEventListener('load', resolve);
          existing.addEventListener('error', () => reject(new Error('Lỗi tải Google API Client Library')));
          return;
        }
        const s = document.createElement('script');
        s.src = 'https://apis.google.com/js/api.js';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Không thể tải Google API Client Library (api.js)'));
        document.head.appendChild(s);
      });
    }

    return new Promise((resolve, reject) => {
      if (typeof gapi?.load !== 'function') {
        return reject(new Error('Google Client Library gapi.load không khả dụng.'));
      }
      gapi.load('picker', {
        callback: () => {
          if (window.google?.picker) {
            resolve(true);
          } else {
            reject(new Error('Google Picker chưa sẵn sàng sau khi tải module.'));
          }
        },
        onerror: () => reject(new Error('Lỗi tải module Google Picker từ máy chủ Google.'))
      });
    });
  }

  // Lấy danh sách các tệp chia sẻ từ Google Drive REST API (Không dùng iframe/cookies, an toàn tuyệt đối trên iOS/Safari/PWA)
  async getSharedFilesFromDrive() {
    await this.ensureToken(true);
    if (!this.accessToken) {
      throw new Error('Chưa kết nối Google Drive. Vui lòng kết nối tài khoản Google trước.');
    }

    const filesMap = new Map();

    // 1. Quét tệp được chia sẻ với tôi (sharedWithMe)
    try {
      const q = encodeURIComponent("sharedWithMe = true and trashed = false");
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100&fields=files(id,name,mimeType,description,properties,appProperties,modifiedTime,owners,sharingUser,capabilities,size,iconLink)`, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.files)) {
          for (const f of data.files) {
            if (f.name && (f.name.includes('stc_shared') || f.mimeType === 'application/json' || f.name.endsWith('.json'))) {
              filesMap.set(f.id, f);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[GoogleDriveSync] Lỗi quét sharedWithMe:', e);
    }

    // 2. Quét thêm tệp stc_shared trong Drive cá nhân (nếu có)
    try {
      const q2 = encodeURIComponent("name contains 'stc_shared' and trashed = false");
      const res2 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q2}&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=50&fields=files(id,name,mimeType,description,properties,appProperties,modifiedTime,owners,sharingUser,capabilities,size,iconLink)`, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      if (res2.ok) {
        const data2 = await res2.json();
        if (Array.isArray(data2.files)) {
          for (const f of data2.files) {
            if (!filesMap.has(f.id)) {
              filesMap.set(f.id, f);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[GoogleDriveSync] Lỗi quét tệp stc_shared cá nhân:', e);
    }

    return Array.from(filesMap.values());
  }

  _showPickerCloseButton(onClose) {
    this._removePickerCloseButton();
    const btn = document.createElement('button');
    btn.id = 'google-picker-close-btn';
    btn.type = 'button';
    btn.innerHTML = '✕';
    btn.setAttribute('aria-label', 'Đóng hộp thoại Picker');
    btn.setAttribute('title', 'Đóng hộp thoại');
    btn.style.cssText = `
      position: fixed !important;
      top: 14px !important;
      right: 14px !important;
      z-index: 2147483647 !important;
      width: 44px !important;
      height: 44px !important;
      border-radius: 50% !important;
      background: #0f172a !important;
      color: #ffffff !important;
      border: 2px solid rgba(255, 255, 255, 0.4) !important;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.7) !important;
      font-size: 22px !important;
      font-weight: 700 !important;
      line-height: 1 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
      user-select: none !important;
      -webkit-tap-highlight-color: transparent !important;
      transition: all 0.2s ease !important;
    `;
    btn.onmouseover = () => { btn.style.background = '#ef4444'; };
    btn.onmouseout = () => { btn.style.background = '#0f172a'; };
    btn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this._removePickerCloseButton();
      if (typeof onClose === 'function') onClose();
    };
    document.body.appendChild(btn);

    // Bắt sự kiện click vào backdrop xám bên ngoài của Google Picker để đóng
    const bgWatcher = setInterval(() => {
      const bgs = document.querySelectorAll('.picker-dialog-bg');
      if (bgs.length > 0) {
        clearInterval(bgWatcher);
        bgs.forEach(bg => {
          bg.addEventListener('click', () => {
            this._removePickerCloseButton();
            if (typeof onClose === 'function') onClose();
          }, { once: true });
        });
      }
    }, 200);
    setTimeout(() => clearInterval(bgWatcher), 6000);
  }

  _removePickerCloseButton() {
    const btn = document.getElementById('google-picker-close-btn');
    if (btn) btn.remove();
    const dialogs = document.querySelectorAll('.picker-dialog, .picker-dialog-bg');
    dialogs.forEach(d => d.remove());
  }

  // Mở hộp thoại Google Picker chính thức để duyệt và nhận tệp chia sẻ riêng qua email
  async openPickerForSharedItems() {
    await this.ensureToken(true);
    if (!this.accessToken) {
      throw new Error('Chưa kết nối Google Drive. Vui lòng kết nối tài khoản Google trước.');
    }

    if (!this.apiKey) {
      const savedKey = await db.settings.get('googleApiKey');
      if (savedKey?.value) this.apiKey = savedKey.value.trim();
      else if (window.EnvConfig) this.apiKey = window.EnvConfig.get('GOOGLE_API_KEY', '').trim();
    }

    if (!this.apiKey) {
      const input = await showPrompt({
        title: 'Cần Google API Key (Google Picker)',
        message: `Google Picker yêu cầu API Key để duyệt các tệp chia sẻ riêng qua email theo chuẩn bảo mật <code>drive.file</code>.<br><br>
        <strong>⚠️ Lưu ý tránh lỗi "Khóa không hợp lệ":</strong><br>
        1. Cần <strong>BẬT Google Picker API</strong> trong Google Cloud Console Library.<br>
        2. Nếu bật <em>Hạn chế API (API restrictions)</em>: <strong>Bắt buộc tích chọn cả Google Drive API VÀ Google Picker API</strong> (không được chỉ chọn mỗi Drive API).<br><br>
        Nhập Google API Key của bạn (dạng <code>AIzaSy...</code>):`,
        placeholder: 'AIzaSy...',
        confirmText: 'Lưu & Mở Picker',
        cancelText: 'Huỷ',
        icon: 'key'
      });
      if (!input || !input.trim()) return null;
      this.setApiKey(input.trim());
    }

    await this.ensurePickerLoaded();

    const projectNumber = this.clientId ? this.clientId.split('-')[0] : '';

    return new Promise((resolve, reject) => {
      try {
        // Tab 1: Các tệp chia sẻ riêng với tôi (Shared with me)
        const sharedView = new google.picker.DocsView(google.picker.ViewId.DOCS)
          .setOwnedByMe(false)
          .setLabel('Được chia sẻ với tôi')
          .setMimeTypes('application/json');

        // Tab 2: Toàn bộ Drive / Tìm kiếm stc_shared_
        const allStcView = new google.picker.DocsView(google.picker.ViewId.DOCS)
          .setLabel('Tất cả tệp Sổ Thu Chi')
          .setQuery('stc_shared_');

        const builder = new google.picker.PickerBuilder()
          .addView(sharedView)
          .addView(allStcView)
          .setOAuthToken(this.accessToken)
          .setDeveloperKey(this.apiKey)
          .setTitle('Chọn Sổ / Ví Chia Sẻ Từ Google Drive')
          .setLocale('vi')
          .setCallback((data) => {
            const action = data[google.picker.Response.ACTION];
            if (action === google.picker.Action.PICKED) {
              this._removePickerCloseButton();
              const doc = data[google.picker.Response.DOCUMENTS]?.[0];
              if (doc) {
                const fileId = doc[google.picker.Document.ID];
                const fileName = doc[google.picker.Document.NAME];
                resolve({ fileId, fileName, doc });
              } else {
                resolve(null);
              }
            } else if (action === google.picker.Action.CANCEL) {
              this._removePickerCloseButton();
              resolve(null);
            }
          });

        if (projectNumber) {
          builder.setAppId(projectNumber);
        }

        const picker = builder.build();
        this._showPickerCloseButton(() => {
          resolve(null);
        });
        picker.setVisible(true);
      } catch (err) {
        this._removePickerCloseButton();
        console.error('[GooglePicker] Lỗi hiển thị Picker:', err);
        reject(err);
      }
    });
  }

  async acceptShareLink(token, key = null) {
    const fileId = token.replace(/^gdrive_/, '');
    const recSetting = (await db.settings.get('googleDriveReceivedFiles')) || { key: 'googleDriveReceivedFiles', value: [] };
    const list = Array.isArray(recSetting.value) ? recSetting.value : [];
    if (!list.some(x => x.fileId === fileId)) {
      list.push({ fileId, token, acceptedAt: Date.now() });
      await db.settings.put({ key: 'googleDriveReceivedFiles', value: list });
    }
    await this.clearLeftSharedItem({ shareId: fileId, itemId: fileId });

    if (key) {
      await this.saveItemShareKey(fileId, key);
      await this.saveItemShareKey(token, key);
    }
    return { success: true, shareId: fileId, fileId };
  }

  async syncReceivedSharedItems() {
    if (!this.accessToken) return false;
    if (this._isSyncingReceivedSharedItems) return false;
    this._isSyncingReceivedSharedItems = true;
    let hasChanges = false;

    try {
      // 0. Đẩy các giao dịch thành viên tạo lên Drive trước
      await this.pushAllReceivedSharedItems();

      // 1. Quét file từ SharedWithMe & Received via Link & Toàn bộ tệp có quyền đọc
      const fileMap = new Map();
      let swmSuccess = false;

      // Truy vấn 1: sharedWithMe = true
      try {
        const q1 = encodeURIComponent("sharedWithMe = true and trashed = false");
        const res1 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q1}&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100&fields=files(id,name,mimeType,modifiedTime,owners,capabilities,shared)`, {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        });
        if (res1.ok) {
          swmSuccess = true;
          const data1 = await res1.json();
          if (Array.isArray(data1.files)) {
            for (const f of data1.files) {
              if (f.name && (f.name.includes('stc_shared') || f.mimeType === 'application/json' || f.name.endsWith('.json'))) {
                fileMap.set(f.id, f);
              }
            }
          }
        } else {
          console.warn('[GoogleDrive] Quét sharedWithMe status:', res1.status, await res1.text().catch(() => ''));
        }
      } catch (err1) {
        console.warn('[GoogleDrive] Quét sharedWithMe warning:', err1);
      }

      // Truy vấn 2: Quét mọi tệp có tên chứa stc_shared mà tài khoản hiện tại có quyền đọc (kể cả tệp được share trong folder hoặc link)
      try {
        const q2 = encodeURIComponent("name contains 'stc_shared' and trashed = false");
        const res2 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q2}&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100&fields=files(id,name,mimeType,modifiedTime,owners,capabilities,shared)`, {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        });
        if (res2.ok) {
          const data2 = await res2.json();
          if (Array.isArray(data2.files)) {
            for (const f of data2.files) {
              if (!fileMap.has(f.id)) {
                fileMap.set(f.id, f);
              }
            }
          }
        }
      } catch (err2) {
        console.warn('[GoogleDrive] Quét name contains stc_shared warning:', err2);
      }

      const recSetting = (await db.settings.get('googleDriveReceivedFiles')) || { value: [] };
      const recList = Array.isArray(recSetting.value) ? recSetting.value : [];
      for (const item of recList) {
        if (!fileMap.has(item.fileId)) {
          try {
            const fRes = await fetch(`https://www.googleapis.com/drive/v3/files/${item.fileId}?supportsAllDrives=true&fields=id,name,modifiedTime,owners,capabilities,shared`, {
              headers: { Authorization: `Bearer ${this.accessToken}` }
            });
            if (fRes.ok) {
              const fData = await fRes.json();
              fileMap.set(fData.id, fData);
            }
          } catch (_) {}
        }
      }

      const leftItems = await this.getLeftSharedItems();
      const isLeft = (shareId, remoteId, localId) => {
        const sId = shareId ? String(shareId) : null;
        const rId = remoteId !== undefined && remoteId !== null ? String(remoteId) : null;
        const lId = localId !== undefined && localId !== null ? String(localId) : null;
        return leftItems.some(x => {
          if (sId && x.shareId && String(x.shareId) === sId) return true;
          if (rId && x.itemId && String(x.itemId) === rId) return true;
          if (lId && x.localId && String(x.localId) === lId) return true;
          if (lId && x.itemId && String(x.itemId) === lId) return true;
          if (sId && x.itemId && String(x.itemId) === sId) return true;
          if (rId && x.shareId && String(x.shareId) === rId) return true;
          return false;
        });
      };

      // Xóa các mục chia sẻ đã rời khỏi hoặc đã bị xóa
      const localAccs = await db.accounts.toArray();
      const isServerConnected = Boolean(window.serverSyncService && window.serverSyncService.token);
      for (const acc of localAccs) {
        if (acc._isSharedItem) {
          const explicitlyLeft = isLeft(acc._shareId, acc._remoteId, acc.id);
          let removed = explicitlyLeft;
          if (acc._sharedService === 'google-drive') {
            if (!explicitlyLeft && swmSuccess && !fileMap.has(acc._shareId)) {
              // Kiểm tra xem file có thực sự bị xóa hay mất quyền không
              try {
                const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files/${acc._shareId}?fields=id,trashed`, {
                  headers: { Authorization: `Bearer ${this.accessToken}` }
                });
                if (!checkRes.ok || (await checkRes.json().catch(() => ({}))).trashed) {
                  removed = true;
                }
              } catch (_) {}
            }
          } else if (acc._sharedService === 'server' || !acc._sharedService) {
            // Nếu là item từ Server riêng nhưng server đã đăng xuất/mất kết nối hoặc người dùng đã rời khỏi
            if (!isServerConnected || explicitlyLeft) {
              removed = true;
            }
          }
          if (removed) {
            hasChanges = true;
            await db.accounts.delete(acc.id);
            if (acc.id !== undefined && !isNaN(Number(acc.id))) {
              await db.accounts.delete(Number(acc.id));
            }
            await db.accounts.delete(String(acc.id));
            const relTxs = (await db.transactions.toArray()).filter(t =>
              Number(t.accountId) === Number(acc.id) || Number(t.toAccountId) === Number(acc.id) ||
              String(t.accountId) === String(acc.id) || String(t.toAccountId) === String(acc.id) ||
              (acc._shareId && String(t._shareId) === String(acc._shareId))
            );
            for (const t of relTxs) await db.transactions.delete(t.id);
          }
        }
      }

      if (db.savings) {
        const sList = await db.savings.toArray();
        for (const s of sList) {
          if (s._isSharedItem && (isLeft(s._shareId, s._remoteId, s.id) || ((s._sharedService === 'server' || !s._sharedService) && !isServerConnected))) {
            hasChanges = true;
            await db.savings.delete(s.id);
          }
        }
      }
      if (db.accumulations) {
        const aList = await db.accumulations.toArray();
        for (const a of aList) {
          if (a._isSharedItem && (isLeft(a._shareId, a._remoteId, a.id) || ((a._sharedService === 'server' || !a._sharedService) && !isServerConnected))) {
            hasChanges = true;
            await db.accumulations.delete(a.id);
          }
        }
      }
      if (db.loans) {
        const lList = await db.loans.toArray();
        for (const l of lList) {
          if (l._isSharedItem && (isLeft(l._shareId, l._remoteId, l.id) || ((l._sharedService === 'server' || !l._sharedService) && !isServerConnected))) {
            hasChanges = true;
            await db.loans.delete(l.id);
          }
        }
      }
      if (db.assets) {
        const astList = await db.assets.toArray();
        for (const ast of astList) {
          if (ast._isSharedItem && (isLeft(ast._shareId, ast._remoteId, ast.id) || ((ast._sharedService === 'server' || !ast._sharedService) && !isServerConnected))) {
            hasChanges = true;
            await db.assets.delete(ast.id);
          }
        }
      }

      // Xử lý từng file chia sẻ nhận được
      for (const [fileId, fileMeta] of fileMap.entries()) {
        const canEdit = Boolean(fileMeta.capabilities?.canEdit);
        const role = canEdit ? 'editor' : 'viewer';
        const ownerEmail = fileMeta.owners?.[0]?.emailAddress || '';
        const ownerName = fileMeta.owners?.[0]?.displayName || ownerEmail || 'Chủ sở hữu';

        let mediaRes;
        try {
          mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${this.accessToken}` }
          });
        } catch (_) {
          continue;
        }
        if (!mediaRes || !mediaRes.ok) continue;

        const rawText = await mediaRes.text();
        let remoteJson;
        try {
          remoteJson = JSON.parse(rawText);
        } catch (_) {
          continue;
        }

        const itemType = remoteJson.itemType || 'account';
        const remoteItemId = remoteJson.itemId || fileId;

        if (isLeft(fileId, remoteItemId)) {
          const matchAcc = (await db.accounts.toArray()).find(a => a._isSharedItem && (a._shareId === fileId || String(a._remoteId) === String(remoteItemId)));
          if (matchAcc) {
            await db.accounts.delete(matchAcc.id);
            const relTxs = (await db.transactions.toArray()).filter(t =>
              Number(t.accountId) === Number(matchAcc.id) || Number(t.toAccountId) === Number(matchAcc.id) || (matchAcc._shareId && String(t._shareId) === String(matchAcc._shareId))
            );
            for (const t of relTxs) await db.transactions.delete(t.id);
            hasChanges = true;
          }
          continue;
        }

        let needsPassword = false;
        let isEncrypted = Boolean(remoteJson.encrypted);
        let parsedPayload = remoteJson;

        if (isEncrypted) {
          const shareKey = (await this.getItemShareKey(fileId)) || (await this.getItemShareKey(`gdrive_${fileId}`)) || (await this.getItemShareKey(remoteItemId)) || (await this.getItemShareKey(`${itemType}_${remoteItemId}`));
          if (!shareKey) {
            needsPassword = true;
          } else if (window.CryptoService) {
            try {
              const decStr = await window.CryptoService.decrypt(remoteJson.payload, shareKey);
              parsedPayload = JSON.parse(decStr);
            } catch (decErr) {
              console.warn('[GoogleDrive] Giải mã mục chia sẻ thất bại:', decErr);
              needsPassword = true;
            }
          }
        }

        if (needsPassword) {
          if (itemType === 'account') {
            const currentAcc = (await db.accounts.toArray()).find(a => a._isSharedItem && a._shareId === fileId);
            if (currentAcc) {
              if (!currentAcc._needsPassword || !currentAcc._isEncrypted) {
                await db.accounts.update(currentAcc.id, { _needsPassword: 1, _isEncrypted: 1 });
                hasChanges = true;
              }
            } else {
              await db.accounts.add({
                name: remoteJson.itemName || 'Ví chia sẻ Google Drive',
                type: 'cash',
                balance: 0,
                isDeleted: 0,
                _isSharedItem: true,
                _sharedService: 'google-drive',
                _isEncrypted: 1,
                _needsPassword: 1,
                _sharedRole: role,
                _shareId: fileId,
                _remoteId: remoteItemId,
                _sharedFrom: ownerName || ownerEmail
              });
              hasChanges = true;
            }
          }
          continue;
        }

        const item = parsedPayload.item || {};
        const transactions = Array.isArray(parsedPayload.transactions) ? parsedPayload.transactions : [];

        if (itemType === 'account') {
          const allAccs = await db.accounts.toArray();
          const matchAccs = allAccs.filter(a => a._isSharedItem && a._shareId === fileId);
          let localAcc = matchAccs[0] || null;

          if (matchAccs.length > 1) {
            for (let k = 1; k < matchAccs.length; k++) {
              await db.accounts.delete(matchAccs[k].id);
              hasChanges = true;
            }
          }

          const accData = {
            ...item,
            isDeleted: 0,
            _isSharedItem: true,
            _sharedService: 'google-drive',
            _isEncrypted: isEncrypted ? 1 : 0,
            _needsPassword: 0,
            _sharedRole: role,
            _shareId: fileId,
            _remoteId: remoteItemId,
            _sharedFrom: ownerName || ownerEmail,
            order: localAcc?.order !== undefined ? localAcc.order : (item.order !== undefined ? item.order : 999),
            includeInReport: localAcc?.includeInReport !== undefined ? localAcc.includeInReport : 0,
            includeInBudget: localAcc?.includeInBudget !== undefined ? localAcc.includeInBudget : 0
          };

          let localAccId;
          if (localAcc) {
            localAccId = localAcc.id;
            const isDiff = localAcc._needsPassword === 1 ||
              localAcc.name !== accData.name ||
              Number(localAcc.balance || 0) !== Number(accData.balance || 0) ||
              localAcc._sharedRole !== accData._sharedRole;
            if (isDiff) {
              hasChanges = true;
              await db.accounts.update(localAccId, { ...accData, id: localAccId });
            }
          } else {
            delete accData.id;
            hasChanges = true;
            localAccId = await db.accounts.add(accData);
          }

          // 3-Way differential merge cho giao dịch
          const existingTxs = (await db.transactions.toArray()).filter(t =>
            t._shareId === fileId || Number(t.accountId) === localAccId
          );
          const incomingRemoteIds = new Set(transactions.filter(t => !t.isDeleted).map(t => String(t.id)));

          // Xoá giao dịch đã bị chủ sở hữu xoá (trừ giao dịch do thành viên tạo)
          for (const oldTx of existingTxs) {
            if (oldTx.recordedByOther === 1 || !oldTx._remoteTxId) continue;
            if (!incomingRemoteIds.has(String(oldTx._remoteTxId))) {
              hasChanges = true;
              await db.transactions.delete(oldTx.id);
            }
          }

          // Cập nhật hoặc thêm giao dịch từ xa
          for (const rx of transactions) {
            if (rx.isDeleted) {
              const localMatch = existingTxs.find(t => String(t._remoteTxId || t.id) === String(rx.id));
              if (localMatch) {
                hasChanges = true;
                await db.transactions.delete(localMatch.id);
              }
              continue;
            }

            let localMatch = existingTxs.find(t => String(t._remoteTxId || t.id) === String(rx.id));
            if (!localMatch) {
              localMatch = existingTxs.find(t =>
                t.type === rx.type &&
                String(t.date || '').slice(0, 10) === String(rx.date || '').slice(0, 10) &&
                Math.abs(Number(t.amount || 0) - Number(rx.amount || 0)) < 0.01 &&
                (t.note || '').trim().toLowerCase() === (rx.note || '').trim().toLowerCase()
              );
            }

            const txData = {
              ...rx,
              accountId: localAccId,
              isDeleted: 0,
              _isSharedItem: true,
              _sharedService: 'google-drive',
              _shareId: fileId,
              _remoteTxId: rx.id,
              recordedByOther: rx.recordedByOther !== undefined ? rx.recordedByOther : 0,
              createdBy: rx.createdBy || (ownerName || ownerEmail || 'Chủ sổ')
            };

            if (localMatch) {
              const rTime = new Date(rx.updatedAt || 0).getTime() || 0;
              const lTime = new Date(localMatch.updatedAt || 0).getTime() || 0;
              if (rTime >= lTime) {
                hasChanges = true;
                await db.transactions.update(localMatch.id, { ...txData, id: localMatch.id });
              }
            } else {
              delete txData.id;
              hasChanges = true;
              await db.transactions.add(txData);
            }
          }
        }
      }

      if (hasChanges) {
        if (typeof window.enforceAccountsDisplayOrder === 'function') {
          await window.enforceAccountsDisplayOrder();
        }
        if (typeof window.recalculateAccountBalances === 'function') {
          await window.recalculateAccountBalances();
        }
        if (window.app && typeof window.app.refreshAll === 'function') {
          await window.app.refreshAll();
        }
        window.dispatchEvent(new CustomEvent('shared-items-updated'));
      }
      return hasChanges;
    } catch (err) {
      console.warn('[GoogleDrive] syncReceivedSharedItems error:', err);
      return false;
    } finally {
      this._isSyncingReceivedSharedItems = false;
    }
  }

  async pushReceivedSharedItemTransactions(shareId) {
    if (!this.accessToken) return false;
    try {
      const localAcc = (await db.accounts.toArray()).find(a => a._isSharedItem && a._sharedService === 'google-drive' && a._shareId === shareId);
      if (!localAcc || localAcc._sharedRole !== 'editor' || localAcc._needsPassword) return false;

      const localAccId = Number(localAcc.id);
      const allTxs = await db.transactions.toArray();
      const rawLocalTxs = allTxs.filter(t => Number(t.accountId) === localAccId || Number(t.toAccountId) === localAccId || t._shareId === shareId);
      if (rawLocalTxs.length === 0) return true;

      const uProfile = this.userProfile;
      const uName = (uProfile?.name && uProfile.name.trim()) || (uProfile?.email && uProfile.email.trim()) || 'Thành viên';
      const uEmail = uProfile?.email || '';

      // Tải bản chiếu hiện tại trên Drive
      const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${shareId}?alt=media`, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      if (!mediaRes.ok) return false;

      const rawText = await mediaRes.text();
      let remoteJson = JSON.parse(rawText);
      let parsedPayload = remoteJson;
      const shareKey = (await this.getItemShareKey(shareId)) || (await this.getItemShareKey(`gdrive_${shareId}`));

      if (remoteJson.encrypted && remoteJson.payload) {
        if (!shareKey || !window.CryptoService) return false;
        try {
          const dec = await window.CryptoService.decrypt(remoteJson.payload, shareKey);
          parsedPayload = JSON.parse(dec);
        } catch (_) {
          return false;
        }
      }

      const remoteTxs = Array.isArray(parsedPayload.transactions) ? parsedPayload.transactions : [];
      const mergedMap = new Map();
      for (const rx of remoteTxs) {
        mergedMap.set(String(rx.id), rx);
      }

      for (const lx of rawLocalTxs) {
        const idKey = String(lx._remoteTxId || lx.id);
        const mappedTx = {
          ...lx,
          id: lx._remoteTxId || lx.id,
          recordedByOther: 1,
          createdBy: lx.createdBy || uName,
          createdByEmail: lx.createdByEmail || uEmail
        };
        delete mappedTx._isSharedItem;
        delete mappedTx._shareId;
        delete mappedTx._remoteTxId;
        mergedMap.set(idKey, mappedTx);
      }

      const updatedPayload = {
        ...parsedPayload,
        transactions: Array.from(mergedMap.values()),
        updatedAt: new Date().toISOString()
      };

      let bodyContent;
      if (shareKey && window.CryptoService) {
        const encStr = await window.CryptoService.encrypt(JSON.stringify(updatedPayload), shareKey);
        bodyContent = JSON.stringify({
          encrypted: true,
          payload: encStr,
          itemType: 'account',
          itemId: String(localAcc._remoteId || shareId),
          itemName: localAcc.name,
          updatedAt: updatedPayload.updatedAt
        }, null, 2);
      } else {
        bodyContent = JSON.stringify({
          encrypted: false,
          ...updatedPayload
        }, null, 2);
      }

      const patchRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${shareId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: bodyContent
      });

      if (patchRes.ok) {
        for (const t of rawLocalTxs) {
          if (!t._remoteTxId) {
            await db.transactions.update(t.id, { _remoteTxId: t.id, _shareId: shareId, _isSharedItem: true });
          }
        }
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[GoogleDrive] pushReceivedSharedItemTransactions error:', err);
      return false;
    }
  }

  async pushAllReceivedSharedItems() {
    if (!this.accessToken) return false;
    if (this._isPushingReceivedSharedItems) return false;
    this._isPushingReceivedSharedItems = true;
    try {
      const sharedAccounts = (await db.accounts.toArray()).filter(a =>
        a._isSharedItem && a._sharedService === 'google-drive' && a._sharedRole === 'editor' && a._shareId
      );
      let anyPushed = false;
      for (const acc of sharedAccounts) {
        const ok = await this.pushReceivedSharedItemTransactions(acc._shareId);
        if (ok) anyPushed = true;
      }
      return anyPushed;
    } finally {
      this._isPushingReceivedSharedItems = false;
    }
  }

  async pullAndMergeOwnedSharedProjections() {
    if (!this.accessToken) return false;
    let hasChanges = false;
    try {
      const map = await this.getSharedFileMap();
      const entries = Object.entries(map);
      if (entries.length === 0) return false;

      for (const [key, fileId] of entries) {
        const [itemType, itemId] = key.split('_');
        const shareKey = (await this.getItemShareKey(key)) || (await this.getItemShareKey(itemId)) || this.encryptionPassword;

        let mediaRes;
        try {
          mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${this.accessToken}` }
          });
        } catch (_) {
          continue;
        }
        if (!mediaRes || !mediaRes.ok) continue;

        const text = await mediaRes.text();
        let json = JSON.parse(text);
        let payload = json;
        if (json.encrypted && json.payload) {
          if (!shareKey || !window.CryptoService) continue;
          try {
            const dec = await window.CryptoService.decrypt(json.payload, shareKey);
            payload = JSON.parse(dec);
          } catch (_) {
            continue;
          }
        }

        const remoteTxs = Array.isArray(payload.transactions) ? payload.transactions : [];
        if (itemType === 'account' && remoteTxs.length > 0) {
          const accId = Number(itemId);
          const localTxs = (await db.transactions.toArray()).filter(t => !t._isSharedItem && (Number(t.accountId) === accId || Number(t.toAccountId) === accId));
          const localMap = new Map();
          for (const lt of localTxs) localMap.set(String(lt._remoteTxId || lt.id), lt);

          for (const rtx of remoteTxs) {
            let existing = localMap.get(String(rtx.id));
            if (!existing) {
              existing = localTxs.find(t =>
                t.type === rtx.type &&
                String(t.date || '').slice(0, 10) === String(rtx.date || '').slice(0, 10) &&
                Math.abs(Number(t.amount || 0) - Number(rtx.amount || 0)) < 0.01 &&
                (t.note || '').trim().toLowerCase() === (rtx.note || '').trim().toLowerCase()
              );
            }

            if (rtx.recordedByOther === 1) {
              if (!existing) {
                const toAdd = {
                  ...rtx,
                  accountId: accId,
                  _remoteTxId: rtx.id,
                  isDeleted: rtx.isDeleted ? 1 : 0
                };
                delete toAdd.id;
                hasChanges = true;
                await db.transactions.add(toAdd);
              } else if (rtx.isDeleted && !existing.isDeleted) {
                hasChanges = true;
                await db.transactions.update(existing.id, { isDeleted: 1, updatedAt: rtx.updatedAt || Date.now() });
              }
            }
          }
        }
      }

      if (hasChanges && typeof window.recalculateAccountBalances === 'function') {
        await window.recalculateAccountBalances();
      }
      return hasChanges;
    } catch (e) {
      console.warn('[GoogleDrive] pullAndMergeOwnedSharedProjections error:', e);
      return false;
    }
  }
}

window.googleDriveService = new GoogleDriveSync();