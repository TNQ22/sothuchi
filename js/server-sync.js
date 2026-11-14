/**
 * SỔ THU CHI - DEDICATED SYNC SERVER CLIENT SERVICE
 * Module kết nối máy chủ riêng (Self-Hosted Sync Server):
 * - Đăng nhập bảo mật qua Google Identity Services (GIS)
 * - Quản lý Đa Sổ (Multi-Vault) & Chuyển đổi linh hoạt
 * - Chia sẻ Sổ qua Email Google với phân quyền (Chủ sổ / Editor / Viewer)
 * - Đồng bộ hai chiều thông minh Last-Write-Wins
 * - Tự động đồng bộ ngầm khi phát sinh thay đổi
 */

class ServerSyncService {
  constructor() {
    this.serverUrl = '';
    this.token = null;
    this.userProfile = null;
    this.vaults = [];
    this.activeVaultId = null;
    this.shares = [];
    this.isSyncing = false;
    this.autoSync = true;
    this.lastSyncTime = null;
    this.lastError = null;
    this.serverGoogleClientId = null;
    this.connectionStatus = 'disconnected'; // 'connected' | 'checking' | 'disconnected'
    this.lastVaultVersion = null;
    this.lastVaultUpdatedAt = null;
    this.encryptionPassword = null;
    this._pollingStarted = false;
    let savedOffset = 0;
    try {
      savedOffset = parseInt(localStorage.getItem('stc_server_clock_offset_ms'), 10) || 0;
    } catch (_) {}
    this.serverClockOffsetMs = savedOffset;
  }

  // Ghi nhận và tính toán bù trừ lệch giờ (Clock Skew Compensation) từ server
  recordServerTime(res) {
    if (!res) return;
    try {
      const dateHeader = res.headers && typeof res.headers.get === 'function' ? res.headers.get('date') : null;
      if (dateHeader) {
        const serverTimeMs = new Date(dateHeader).getTime();
        if (!isNaN(serverTimeMs) && serverTimeMs > 0) {
          this.serverClockOffsetMs = serverTimeMs - Date.now();
          try { localStorage.setItem('stc_server_clock_offset_ms', String(this.serverClockOffsetMs)); } catch (_) {}
        }
      }
    } catch (_) {}
  }

  // Lấy mốc thời gian chuẩn hóa theo đồng hồ máy chủ
  getSyncedNow() {
    return Date.now() + (this.serverClockOffsetMs || 0);
  }

  // Wrapper fetch tự động ghi nhận thời gian máy chủ sau mỗi phản hồi
  async fetchWithSync(url, options = {}) {
    const res = await fetch(url, options);
    this.recordServerTime(res);
    return res;
  }

  get isConnected() {
    return !!(this.serverUrl && (this.token || this.connectionStatus === 'connected'));
  }

  get isLoggedIn() {
    return !!(this.serverUrl && this.token && this.userProfile);
  }

  // Kiểm tra xem ứng dụng có đang được host và truy cập trực tiếp từ chính Máy Chủ (Self-Hosted) hay không
  isSelfHosted() {
    if (typeof window === 'undefined' || !window.location || !window.location.origin) return false;
    if (window.location.protocol === 'file:') return false;

    const origin = window.location.origin.toLowerCase().replace(/\/+$/, '');
    const sUrl = (this.serverUrl || '').toLowerCase().replace(/\/+$/, '');

    // 1. Trùng chính xác URL máy chủ với Origin trang web hiện tại
    if (sUrl && sUrl === origin) return true;

    // 2. Chạy trên cổng 8081 (Docker / Node mặc định của server)
    if (window.location.port === '8081') return true;

    // 3. Nếu đang mở từ localhost hoặc LAN và không phải static hosting công cộng
    const hostname = window.location.hostname || '';
    const isPublicHost = hostname.endsWith('github.io') || hostname.endsWith('web.app') || hostname.endsWith('pages.dev') || hostname.endsWith('vercel.app') || hostname.endsWith('netlify.app');
    if (!isPublicHost) {
      if (hostname === 'localhost' || hostname === '127.0.0.1' || /^192\.168\./.test(hostname) || /^10\./.test(hostname)) {
        return true;
      }
    }

    return false;
  }

  // Khởi tạo service khi tải app
  async init() {
    try {
      // 1. Đọc cấu hình Server URL đã lưu hoặc từ .env hoặc fallback origin
      const savedUrl = await db.settings.get('syncServerUrl');
      if (savedUrl && savedUrl.value) {
        this.serverUrl = savedUrl.value.trim().replace(/\/+$/, '');
      } else if (window.EnvConfig) {
        const envUrl = window.EnvConfig.get('SYNC_SERVER_URL', '');
        if (envUrl) {
          this.serverUrl = envUrl.trim().replace(/\/+$/, '');
        }
      }

      // TỰ ĐỘNG PHÁT HIỆN TÊN MIỀN MÁY CHỦ (Self-hosted domain auto-detection):
      // Nếu chưa có serverUrl được cấu hình:
      // Tự động kiểm tra xem trang web hiện tại có đang chạy trên chính Máy Chủ Riêng (Docker / VPS) hay không
      if (!this.serverUrl && window.location.protocol && window.location.protocol.startsWith('http')) {
        const currentOrigin = window.location.origin;
        const isGitHubPages = window.location.hostname && window.location.hostname.endsWith('github.io');

        // Nếu là port 8081 (Docker mặc định), tự động gán ngay
        if (window.location.port === '8081') {
          this.serverUrl = currentOrigin;
          await db.settings.put({ key: 'syncServerUrl', value: this.serverUrl });
        } else if (!isGitHubPages) {
          // Kiểm tra ngầm xem domain hiện tại có API máy chủ riêng /api/health không
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 1800);
            const checkRes = await fetch(`${currentOrigin}/api/health`, {
              method: 'GET',
              signal: controller.signal
            }).catch(() => null);
            clearTimeout(timer);

            if (checkRes && checkRes.ok) {
              const resJson = await checkRes.json().catch(() => null);
              if (resJson && resJson.status === 'ok') {
                this.serverUrl = currentOrigin;
                console.log('[ServerSync] 🚀 Tự động phát hiện và kết nối Máy Chủ Riêng tại tên miền:', this.serverUrl);
                await db.settings.put({ key: 'syncServerUrl', value: this.serverUrl });
                if (resJson.googleClientId) {
                  this.serverGoogleClientId = resJson.googleClientId;
                }
              }
            }
          } catch (_) {
            // Không có máy chủ riêng trên domain này -> Tiếp tục chạy chế độ độc lập/serverless
          }
        }
      }

      // 2. Đọc Token đăng nhập
      const savedToken = await db.settings.get('syncServerToken');
      if (savedToken && savedToken.value) {
        this.token = savedToken.value;
      }

      // 3. Đọc User Profile
      const savedProfile = await db.settings.get('syncServerUserProfile');
      if (savedProfile && savedProfile.value) {
        this.userProfile = savedProfile.value;
      }

      // BẢO MẬT: Bắt buộc 100% Google OAuth. Tự động thu hồi và đăng xuất nếu có tài khoản quick_* cũ
      if (this.userProfile && (this.userProfile.google_id || '').startsWith('quick_')) {
        await this.logout();
      }

      // 4. Đọc Active Vault ID
      const savedVaultId = await db.settings.get('syncServerActiveVaultId');
      if (savedVaultId && savedVaultId.value) {
        this.activeVaultId = savedVaultId.value;
      }

      // 4.5 Đọc Danh sách Sổ đã lưu (Cached Vaults)
      const savedVaults = await db.settings.get('syncServerVaults');
      if (savedVaults && Array.isArray(savedVaults.value)) {
        this.vaults = savedVaults.value;
      }

      // 5. Đọc Auto Sync
      const savedAutoSync = await db.settings.get('syncServerAutoSync');
      if (savedAutoSync !== undefined) {
        this.autoSync = !!savedAutoSync.value;
      } else {
        this.autoSync = true;
      }

      // 6. Đọc Last Sync Time
      const savedTime = await db.settings.get('syncServerLastSyncTime');
      if (savedTime) {
        this.lastSyncTime = savedTime.value;
      }

      // 6.5 Đọc Mật khẩu Mã hóa Sổ Máy Chủ (E2EE) cho Sổ hiện tại
      if (this.activeVaultId) {
        this.encryptionPassword = await this.getEncryptionPasswordForVault(this.activeVaultId);
      } else {
        const savedServerPass = await db.settings.get('syncServerEncryptionPassword');
        if (savedServerPass && savedServerPass.value) {
          this.encryptionPassword = savedServerPass.value.trim();
        }
      }

      // 7. Đọc Last Vault Version
      const savedVersion = await db.settings.get('syncServerLastVaultVersion');
      if (savedVersion && savedVersion.value !== undefined) {
        this.lastVaultVersion = savedVersion.value;
      }

      // Kiểm tra kết nối và cập nhật phiên làm việc nếu có serverUrl
      if (this.serverUrl) {
        this.checkConnection().then(async (isOk) => {
          if (isOk && this.token) {
            await this.refreshSession();
            const sharedChanged = await this.syncReceivedSharedItems();
            if (sharedChanged) {
              if (typeof window.recalculateAccountBalances === 'function') {
                await window.recalculateAccountBalances();
              }
              if (window.app && typeof window.app.refreshAll === 'function') {
                await window.app.refreshAll();
              }
            }
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('[ServerSync] Init warning:', err);
    }
    this.startAutoPolling();
  }

  // Đặt Server URL
  async setServerUrl(url) {
    this.serverUrl = (url || '').trim().replace(/\/+$/, '');
    await db.settings.put({ key: 'syncServerUrl', value: this.serverUrl });
    return await this.checkConnection();
  }

  // Kiểm tra tình trạng kết nối tới máy chủ
  async checkConnection() {
    if (!this.serverUrl) {
      this.connectionStatus = 'disconnected';
      window.dispatchEvent(new CustomEvent('server-connection-changed', { detail: { status: 'disconnected' } }));
      return false;
    }

    this.connectionStatus = 'checking';
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(`${this.serverUrl}/api/health`, { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const info = await res.json();
        this.connectionStatus = 'connected';
        if (info.googleClientId) {
          this.serverGoogleClientId = info.googleClientId;
        } else {
          // Pre-fetch auth/config
          try {
            const cCtrl = new AbortController();
            const cTimer = setTimeout(() => cCtrl.abort(), 3000);
            fetch(`${this.serverUrl}/api/auth/config`, { signal: cCtrl.signal })
              .then(r => r.json())
              .then(c => {
                clearTimeout(cTimer);
                if (c && c.googleClientId) this.serverGoogleClientId = c.googleClientId;
              }).catch(() => clearTimeout(cTimer));
          } catch (_) {}
        }
        window.dispatchEvent(new CustomEvent('server-connection-changed', {
          detail: { status: 'connected', info }
        }));
        return true;
      }
    } catch (e) {
      console.warn('[ServerSync] Kiểm tra máy chủ thất bại:', e.message);
    }

    this.connectionStatus = 'disconnected';
    window.dispatchEvent(new CustomEvent('server-connection-changed', { detail: { status: 'disconnected' } }));
    return false;
  }

  // Làm mới thông tin phiên làm việc và danh sách sổ
  async refreshSession() {
    if (!this.serverUrl || !this.token) return false;
    try {
      // 1. Kiểm tra xác thực user
      const userRes = await fetch(`${this.serverUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      if (!userRes.ok) {
        if (userRes.status === 401) {
          console.warn('[ServerSync] Phiên đăng nhập máy chủ hết hạn');
          await this.logout();
        }
        return false;
      }

      const userData = await userRes.json();
      this.userProfile = userData.user;
      await db.settings.put({ key: 'syncServerUserProfile', value: this.userProfile });

      // 2. Lấy danh sách Sổ
      await this.fetchVaults();

      window.dispatchEvent(new CustomEvent('server-auth-changed', {
        detail: { user: this.userProfile, vaults: this.vaults, activeVaultId: this.activeVaultId }
      }));
      return true;
    } catch (e) {
      console.warn('[ServerSync] refreshSession error:', e);
      return false;
    }
  }

  // Đăng nhập máy chủ bằng tài khoản Google
  async loginWithGoogle(options = {}) {
    if (!this.serverUrl) {
      throw new Error('Vui lòng nhập địa chỉ Máy Chủ Riêng trước khi đăng nhập.');
    }

    let accessToken = null;
    let idToken = null;

    // 1. Lấy Client ID đồng bộ trong tick click của người dùng
    let clientId = this.serverGoogleClientId;
    if (!clientId && window.googleDriveService?.clientId) {
      clientId = window.googleDriveService.clientId;
    }
    if (!clientId) {
      const inputEl = document.getElementById('settings-client-id');
      if (inputEl && inputEl.value) clientId = inputEl.value.trim();
    }
    if (!clientId && window.EnvConfig) {
      clientId = window.EnvConfig.get('GOOGLE_CLIENT_ID', '');
    }
    if (!clientId) {
      const dbClientId = await db.settings.get('googleClientId');
      if (dbClientId && dbClientId.value) clientId = dbClientId.value;
    }

    if (!clientId) {
      throw new Error('Chưa có Google Client ID. Vui lòng nhập Google Client ID trong phần Cài đặt.');
    }

    if (!window.google?.accounts?.oauth2) {
      throw new Error('Thư viện Google Identity chưa tải xong. Vui lòng kiểm tra kết nối mạng và thử lại.');
    }

    // 2. Mở popup đăng nhập Google ĐỘC LẬP cho Máy Chủ Riêng
    // CHÚ Ý: Chỉ xin quyền userinfo (email/profile/openid), TUYỆT ĐỐI KHÔNG chạm vào GoogleDriveService để tránh tự động kích hoạt Google Drive
    const promptVal = options.forceSelect ? 'select_account' : (options.prompt !== undefined ? options.prompt : (this.userProfile?.email ? '' : 'select_account'));

    accessToken = await new Promise((resolve, reject) => {
      let settled = false;
      const startTime = Date.now();
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Hết thời gian chờ đăng nhập Google (120 giây). Vui lòng thử lại.'));
        }
      }, 120000);

      try {
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid',
          prompt: promptVal,
          callback: (resp) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (resp.error) {
              if (resp.error === 'popup_closed_by_user') {
                const errObj = new Error('popup_closed_by_user');
                errObj.duration = Date.now() - startTime;
                errObj.possible2FA = errObj.duration > 3500;
                return reject(errObj);
              }
              return reject(new Error(resp.error_description || resp.error));
            }
            resolve(resp.access_token);
          },
          error_callback: (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const duration = Date.now() - startTime;
            if (err && err.type === 'popup_closed') {
              const errObj = new Error('popup_closed_by_user');
              errObj.duration = duration;
              errObj.possible2FA = duration > 3500;
              return reject(errObj);
            }
            if (err && err.type === 'popup_failed_to_open') {
              return reject(new Error('popup_blocked'));
            }
            return reject(new Error(err?.message || 'Cửa sổ xác thực Google bị gián đoạn'));
          }
        });
        tokenClient.requestAccessToken(promptVal ? { prompt: promptVal } : {});
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });

    if (!accessToken && !idToken) {
      throw new Error('Không nhận được token xác thực từ Google');
    }

    // 3. Gửi token xác thực lên Máy Chủ Riêng
    const authRes = await fetch(`${this.serverUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(accessToken ? { access_token: accessToken } : { id_token: idToken })
    });

    if (!authRes.ok) {
      const errData = await authRes.json().catch(() => ({}));
      throw new Error(errData.error || `Máy chủ từ chối xác thực (HTTP ${authRes.status})`);
    }

    const authData = await authRes.json();
    this.token = authData.token;
    this.userProfile = authData.user;

    await db.settings.put({ key: 'syncServerToken', value: this.token });
    await db.settings.put({ key: 'syncServerUserProfile', value: this.userProfile });

    // Tải danh sách Sổ
    await this.fetchVaults();

    window.dispatchEvent(new CustomEvent('server-auth-changed', {
      detail: { user: this.userProfile, vaults: this.vaults, activeVaultId: this.activeVaultId }
    }));

    this.syncReceivedSharedItems().catch(() => {});

    if (this.activeVaultId) {
      this.handlePostLoginSync(this.userProfile).catch(err => {
        console.warn('[ServerSync] handlePostLoginSync after Google login:', err);
      });
    }

    return { user: this.userProfile, vaults: this.vaults };
  }

  // Đăng xuất khỏi Máy chủ riêng
  async logout(options = {}) {
    const wipeLocal = options && options.wipeLocal === true;

    if (this.serverUrl && this.token) {
      try {
        await fetch(`${this.serverUrl}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.token}` }
        });
      } catch (e) {}
    }

    this.token = null;
    this.userProfile = null;
    this.vaults = [];
    this.shares = [];
    this.activeVaultId = null;
    this.lastVaultVersion = null;
    this.lastVaultUpdatedAt = null;
    this.connectionStatus = 'disconnected';

    await db.settings.delete('syncServerToken');
    await db.settings.delete('syncServerUserProfile');
    await db.settings.delete('syncServerActiveVaultId');
    await db.settings.delete('syncServerVaults');
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('syncServerToken');
        localStorage.removeItem('stc_admin_token');
      }
    } catch (_) {}

    if (wipeLocal && typeof window.wipeAndResetLocalDatabase === 'function') {
      await window.wipeAndResetLocalDatabase();
    } else {
      // Khi ngắt kết nối / dùng độc lập ngoại tuyến (wipeLocal: false):
      // Giữ lại 100% tài khoản và giao dịch cá nhân của chính người dùng.
      // Dọn dẹp toàn bộ các sổ / mục chia sẻ nhận được từ máy chủ này (_isSharedItem từ server),
      // vì người dùng đã đăng xuất khỏi máy chủ thì không còn quyền thành viên của các sổ đó.
      try {
        const localAccs = await db.accounts.toArray();
        for (const acc of localAccs) {
          if (acc._isSharedItem && (acc._sharedService === 'server' || !acc._sharedService)) {
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
        if (db.savings) {
          const s = (await db.savings.toArray()).filter(x => x._isSharedItem && (x._sharedService === 'server' || !x._sharedService));
          for (const item of s) await db.savings.delete(item.id);
        }
        if (db.accumulations) {
          const a = (await db.accumulations.toArray()).filter(x => x._isSharedItem && (x._sharedService === 'server' || !x._sharedService));
          for (const item of a) await db.accumulations.delete(item.id);
        }
        if (db.loans) {
          const l = (await db.loans.toArray()).filter(x => x._isSharedItem && (x._sharedService === 'server' || !x._sharedService));
          for (const item of l) await db.loans.delete(item.id);
        }
        if (db.assets) {
          const ast = (await db.assets.toArray()).filter(x => x._isSharedItem && (x._sharedService === 'server' || !x._sharedService));
          for (const item of ast) await db.assets.delete(item.id);
        }
      } catch (cleanErr) {
        console.warn('[ServerSync] Lỗi khi dọn dẹp các sổ chia sẻ máy chủ khi đăng xuất:', cleanErr);
      }

      // Dọn dẹp projection chia sẻ của máy chủ riêng
      try {
        if (db.settings) {
          const ownedSetting = await db.settings.get('syncOwnedSharedProjections');
          if (ownedSetting && Array.isArray(ownedSetting.value)) {
            const remaining = ownedSetting.value.filter(x => x && x.service && x.service !== 'server');
            await db.settings.put({ key: 'syncOwnedSharedProjections', value: remaining });
          }
        }
      } catch (_) {}

      // Tắt cờ isShared cho các mục cá nhân trước đó chỉ chia sẻ qua máy chủ
      try {
        const ownedSetting = db.settings ? await db.settings.get('syncOwnedSharedProjections') : null;
        const activeProjections = (ownedSetting && Array.isArray(ownedSetting.value)) ? ownedSetting.value : [];

        const personalAccs = (await db.accounts.toArray()).filter(a => !a._isSharedItem && (a.isShared === 1 || a.isShared === true));
        for (const a of personalAccs) {
          const stillShared = activeProjections.some(x => x.itemType === 'account' && String(x.itemId) === String(a.id));
          if (!stillShared) {
            await db.accounts.update(a.id, { isShared: 0, updatedAt: Date.now() });
          }
        }

        if (db.savings) {
          const sList = (await db.savings.toArray()).filter(s => !s._isSharedItem && (s.isShared === 1 || s.isShared === true));
          for (const s of sList) {
            const stillShared = activeProjections.some(x => x.itemType === 'savings' && String(x.itemId) === String(s.id));
            if (!stillShared) await db.savings.update(s.id, { isShared: 0, updatedAt: Date.now() });
          }
        }

        if (db.accumulations) {
          const aList = (await db.accumulations.toArray()).filter(a => !a._isSharedItem && (a.isShared === 1 || a.isShared === true));
          for (const a of aList) {
            const stillShared = activeProjections.some(x => x.itemType === 'accumulation' && String(x.itemId) === String(a.id));
            if (!stillShared) await db.accumulations.update(a.id, { isShared: 0, updatedAt: Date.now() });
          }
        }

        if (db.loans) {
          const lList = (await db.loans.toArray()).filter(l => !l._isSharedItem && (l.isShared === 1 || l.isShared === true));
          for (const l of lList) {
            const stillShared = activeProjections.some(x => x.itemType === 'loan' && String(x.itemId) === String(l.id));
            if (!stillShared) await db.loans.update(l.id, { isShared: 0, updatedAt: Date.now() });
          }
        }

        if (db.assets) {
          const astList = (await db.assets.toArray()).filter(ast => !ast._isSharedItem && (ast.isShared === 1 || ast.isShared === true));
          for (const ast of astList) {
            const stillShared = activeProjections.some(x => x.itemType === 'asset' && String(x.itemId) === String(ast.id));
            if (!stillShared) await db.assets.update(ast.id, { isShared: 0, updatedAt: Date.now() });
          }
        }
      } catch (cleanSharesErr) {
        console.warn('[ServerSync] Lỗi làm sạch cờ chia sẻ khi ngắt kết nối máy chủ:', cleanSharesErr);
      }
    }

    window.dispatchEvent(new CustomEvent('server-connection-changed', { detail: { status: 'disconnected' } }));
    window.dispatchEvent(new CustomEvent('server-auth-changed', { detail: null }));
    window.dispatchEvent(new CustomEvent('shared-items-updated', { detail: { action: 'logout' } }));
  }

  // Lấy danh sách Sổ (Vaults)

  // Kiểm tra quyền Quản trị viên máy chủ (/admin)
  async checkAdminStatus() {
    const token = this.token || (typeof localStorage !== 'undefined' ? (localStorage.getItem('syncServerToken') || localStorage.getItem('stc_admin_token')) : null);
    if (!token) return { authenticated: false };
    let baseUrl = '';
    if (this.serverUrl) {
      baseUrl = this.serverUrl.replace(/\/+$/, '');
    } else if (typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http')) {
      baseUrl = window.location.origin;
    }
    try {
      const res = await fetch(`${baseUrl}/api/admin/auth-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (!data || !data.authenticated) {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('stc_admin_token');
          }
        }
        return data;
      } else if (res.status === 401 || res.status === 403) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('stc_admin_token');
        }
      }
    } catch (_) {}
    return { authenticated: false };
  }

  async fetchVaults() {
    if (!this.serverUrl || !this.token) return [];
    try {
      const res = await fetch(`${this.serverUrl}/api/vaults`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const rawVaults = Array.isArray(data.vaults) ? data.vaults : [];
        const seenVIds = new Set();
        this.vaults = rawVaults.filter(v => {
          if (!v || !v.id || seenVIds.has(v.id)) return false;
          seenVIds.add(v.id);
          return true;
        });
        await db.settings.put({ key: 'syncServerVaults', value: this.vaults });

        // Đảm bảo activeVaultId hợp lệ
        if (!this.activeVaultId || !this.vaults.some(v => v.id === this.activeVaultId)) {
          if (this.vaults.length > 0) {
            this.activeVaultId = this.vaults[0].id;
            await db.settings.put({ key: 'syncServerActiveVaultId', value: this.activeVaultId });
          }
        }

        // Tải danh sách chia sẻ nếu là Owner
        const currentVault = this.getActiveVault();
        if (currentVault && currentVault.role === 'owner') {
          await this.fetchShares(this.activeVaultId);
        }

        window.dispatchEvent(new CustomEvent('server-vaults-updated', {
          detail: { vaults: this.vaults, activeVaultId: this.activeVaultId }
        }));

        return this.vaults;
      }
    } catch (e) {
      console.warn('[ServerSync] fetchVaults error:', e);
    }
    return [];
  }

  // Lấy thông tin Sổ đang chọn
  getActiveVault() {
    if (!this.activeVaultId || !this.vaults) return null;
    return this.vaults.find(v => v.id === this.activeVaultId) || null;
  }

  // Chuẩn bị payload dữ liệu cục bộ của Sổ hiện tại (không lấy các mục được chia sẻ độc lập)
  async buildLocalPayload() {
    const allAccs = await db.accounts.toArray();
    const allTxs = await db.transactions.toArray();

    // Không sao lưu ngược các mục do người khác chia sẻ vào Vault cá nhân của mình
    const personalAccs = allAccs.filter(a => !a._isSharedItem);
    const personalAccIds = new Set(personalAccs.map(a => Number(a.id)));
    const personalTxs = allTxs.filter(t => {
      if (t._isSharedItem) return false;
      const accId = Number(t.accountId);
      const toAccId = t.toAccountId ? Number(t.toAccountId) : null;
      return personalAccIds.has(accId) || (toAccId && personalAccIds.has(toAccId));
    });

    const SYNCABLE_SETTINGS_KEYS = [
      'budget_mode',
      'budget_applicable_accounts',
      'budget_rollover_enabled',
      'budget_auto_rollover',
      'theme',
      'currency',
      'privacyMode'
    ];
    const localSettings = [];
    for (const k of SYNCABLE_SETTINGS_KEYS) {
      const s = await db.settings.get(k);
      if (s) localSettings.push(s);
    }

    return {
      transactions: personalTxs,
      accounts: personalAccs,
      categories: await db.categories.toArray(),
      debts: db.debts ? await db.debts.toArray() : [],
      budgets: db.budgets ? await db.budgets.toArray() : [],
      recurring: db.recurring ? await db.recurring.toArray() : [],
      savings: db.savings ? (await db.savings.toArray()).filter(s => !s._isSharedItem) : [],
      accumulations: db.accumulations ? (await db.accumulations.toArray()).filter(a => !a._isSharedItem) : [],
      assets: db.assets ? (await db.assets.toArray()).filter(a => !a._isSharedItem) : [],
      loans: db.loans ? (await db.loans.toArray()).filter(l => !l._isSharedItem) : [],
      settings: localSettings
    };
  }

  // Đẩy toàn bộ dữ liệu cục bộ của Sổ lên máy chủ
  async pushLocalDataToServer(targetVaultId = this.activeVaultId, { forceOverwrite = false } = {}) {
    if (!this.serverUrl || !this.token || !targetVaultId) return null;

    const localPayload = await this.buildLocalPayload();
    let dataToSend = localPayload;
    if (this.encryptionPassword && window.CryptoService) {
      const encryptedPayload = await window.CryptoService.encrypt(JSON.stringify(localPayload), this.encryptionPassword);
      dataToSend = {
        encrypted: true,
        payload: encryptedPayload,
        encryptedAt: new Date().toISOString()
      };
    }

    const endpoint = forceOverwrite
      ? `${this.serverUrl}/api/vaults/${targetVaultId}/overwrite`
      : `${this.serverUrl}/api/vaults/${targetVaultId}/sync`;

    const pushRes = await this.fetchWithSync(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: dataToSend,
        baseVersion: forceOverwrite ? undefined : this.lastVaultVersion,
        forceOverwrite: forceOverwrite
      })
    });

    if (pushRes.ok) {
      const pushResult = await pushRes.json();
      if (pushResult.version) {
        this.lastVaultVersion = pushResult.version;
        this.lastVaultUpdatedAt = pushResult.updated_at;
        await db.settings.put({ key: 'syncServerLastVaultVersion', value: this.lastVaultVersion });
      }
    }
    return pushRes;
  }

  // Khởi tạo sổ trắng (trống dữ liệu hoàn toàn, chỉ có tài khoản & danh mục mặc định)
  async initializeBlankVault() {
    await this.replaceLocalWithSnapshotData({
      accounts: typeof DEFAULT_ACCOUNTS !== 'undefined' ? DEFAULT_ACCOUNTS.map((a, index) => ({
        ...a,
        balance: 0,
        initialBalance: 0,
        order: a.order ?? index,
        isDeleted: 0,
        updatedAt: 1
      })) : [],
      transactions: [],
      categories: typeof DEFAULT_CATEGORIES !== 'undefined' ? DEFAULT_CATEGORIES.map(c => ({
        ...c,
        isDeleted: 0,
        updatedAt: Date.now()
      })) : [],
      debts: [],
      budgets: [],
      recurring: [],
      savings: [],
      accumulations: [],
      assets: [],
      loans: []
    }, false);
  }

  // Chuyển sang Sổ khác (hoàn toàn cách ly dữ liệu giữa các sổ)
  async switchVault(vaultId, options = {}) {
    if (!vaultId) return;

    // 1. Lưu thay đổi của sổ hiện tại lên máy chủ trước khi chuyển sang sổ khác
    const oldVaultId = this.activeVaultId;
    if (oldVaultId && oldVaultId !== vaultId && this.serverUrl && this.token && !options.skipPushCurrent) {
      const oldVault = this.getActiveVault();
      if (oldVault && (oldVault.role === 'owner' || oldVault.role === 'editor')) {
        try {
          await this.pushLocalDataToServer(oldVaultId);
        } catch (saveOldErr) {
          console.warn('[ServerSync] Không thể lưu sổ cũ trước khi chuyển:', saveOldErr);
        }
      }
    }

    // 2. Chuyển activeVaultId sang Sổ mới
    this.activeVaultId = vaultId;
    await db.settings.put({ key: 'syncServerActiveVaultId', value: this.activeVaultId });

    const currentVault = this.getActiveVault();
    if (currentVault && currentVault.role === 'owner') {
      await this.fetchShares(this.activeVaultId);
    } else {
      this.shares = [];
    }

    this.lastVaultVersion = null;
    await db.settings.delete('syncServerLastVaultVersion');

    // 3. Tải dữ liệu của Sổ mới từ Máy chủ
    if (this.serverUrl && this.token) {
      const pullRes = await fetch(`${this.serverUrl}/api/vaults/${this.activeVaultId}/data`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });

      if (!pullRes.ok) {
        if (pullRes.status === 401) {
          await this.logout();
          throw new Error('Phiên làm việc trên máy chủ đã hết hạn. Vui lòng đăng nhập lại.');
        }
        const err = await pullRes.json().catch(() => ({}));
        throw new Error(err.error || 'Không thể tải dữ liệu sổ từ máy chủ');
      }

      const pullResult = await pullRes.json();
      let serverData = pullResult.data || {};
      if (pullResult.vault) {
        this.lastVaultVersion = pullResult.vault.version;
        this.lastVaultUpdatedAt = pullResult.vault.updated_at;
        await db.settings.put({ key: 'syncServerLastVaultVersion', value: this.lastVaultVersion });
      }

      // Xử lý giải mã E2EE nếu dữ liệu trên máy chủ đã được mã hóa
      if (serverData && serverData.encrypted && serverData.payload) {
        const vaultPass = await this.getEncryptionPasswordForVault(vaultId);
        this.encryptionPassword = vaultPass;

        if (!this.encryptionPassword) {
          throw new Error('Sổ trên máy chủ đã được mã hóa đầu cuối (E2EE). Vui lòng vào Cài đặt Máy Chủ Riêng > Nhập Mật khẩu Mã Hóa Sổ để mở khóa dữ liệu.');
        }
        if (!window.CryptoService) {
          throw new Error('Trình duyệt không hỗ trợ thư viện giải mã dữ liệu (CryptoService).');
        }
        try {
          const decryptedStr = await window.CryptoService.decrypt(serverData.payload, this.encryptionPassword);
          serverData = JSON.parse(decryptedStr);
        } catch (decErr) {
          throw new Error('Mật khẩu mã hóa Sổ không chính xác! Không thể giải mã dữ liệu tài chính từ máy chủ.');
        }
      } else {
        // Sổ trên máy chủ KHÔNG mã hoá:
        // Đặt mật khẩu của phiên làm việc với sổ này = null để không tự ý mã hóa đè lên sổ của người khác!
        this.encryptionPassword = null;
        await db.settings.put({ key: 'syncServerEncryptionPassword_' + vaultId, value: null });
      }

      // Kiểm tra xem sổ này trên server là sổ mới trống dữ liệu hay đã có dữ liệu
      const hasDataOnServer = serverData && (
        (serverData.accounts && serverData.accounts.length > 0) ||
        (serverData.transactions && serverData.transactions.length > 0) ||
        (serverData.debts && serverData.debts.length > 0) ||
        (serverData.savings && serverData.savings.length > 0) ||
        (serverData.loans && serverData.loans.length > 0)
      );

      if (!hasDataOnServer || options.forceClean) {
        // Sổ mới trống dữ liệu -> Khởi tạo sổ trắng hoàn toàn
        await this.initializeBlankVault();

        // Đẩy trạng thái trắng khởi tạo ban đầu lên server để lưu version 1
        if (currentVault && (currentVault.role === 'owner' || currentVault.role === 'editor')) {
          try {
            await this.pushLocalDataToServer(this.activeVaultId, { forceOverwrite: true });
          } catch (initPushErr) {
            console.warn('[ServerSync] Không thể lưu trạng thái khởi tạo lên server:', initPushErr);
          }
        }
      } else {
        // Nạp và thay thế hoàn toàn dữ liệu cục bộ bằng dữ liệu của Sổ này
        await this.replaceLocalWithSnapshotData(serverData, false);
      }
    }

    this.lastSyncTime = new Date().toISOString();
    await db.settings.put({ key: 'syncServerLastSyncTime', value: this.lastSyncTime });
    await db.settings.put({ key: 'lastSyncTime', value: this.lastSyncTime });

    // Cập nhật giao diện toàn ứng dụng
    if (window.app && typeof window.app.refreshAll === 'function') {
      await window.app.refreshAll();
    }

    window.dispatchEvent(new CustomEvent('server-vault-switched', {
      detail: { vault: currentVault }
    }));
    window.dispatchEvent(new CustomEvent('server-vaults-updated', {
      detail: { vaults: this.vaults, activeVaultId: this.activeVaultId }
    }));
  }

  // Tạo Sổ mới
  async createVault(name) {
    if (!this.serverUrl || !this.token) throw new Error('Yêu cầu kết nối máy chủ');
    const res = await fetch(`${this.serverUrl}/api/vaults`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: (name || '').trim() || 'Sổ Thu Chi Mới' })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Tạo sổ thất bại');
    }

    const data = await res.json();
    await this.fetchVaults();
    if (data.vault?.id) {
      await this.switchVault(data.vault.id, { forceClean: true });
    }
    return data.vault;
  }

  // Sao chép Sổ (Copy Vault)
  async copyVault(sourceVaultId, newName) {
    if (!this.serverUrl || !this.token) throw new Error('Yêu cầu kết nối máy chủ');
    const targetSourceId = sourceVaultId || this.activeVaultId;
    if (!targetSourceId) throw new Error('Chưa chọn sổ nguồn để sao chép');

    // Lưu thay đổi mới nhất của sổ nguồn trước khi sao chép
    if (targetSourceId === this.activeVaultId) {
      const currentVault = this.getActiveVault();
      if (currentVault && (currentVault.role === 'owner' || currentVault.role === 'editor')) {
        try {
          await this.pushLocalDataToServer(targetSourceId);
        } catch (e) {
          console.warn('[ServerSync] Không thể đẩy dữ liệu trước khi copy:', e);
        }
      }
    }

    const res = await fetch(`${this.serverUrl}/api/vaults/${targetSourceId}/copy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: (newName || '').trim() })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Sao chép sổ thất bại');
    }

    const data = await res.json();
    await this.fetchVaults();
    if (data.vault?.id) {
      await this.switchVault(data.vault.id);
    }
    return data.vault;
  }

  // Đổi tên Sổ
  async renameVault(vaultId, newName) {
    if (!this.serverUrl || !this.token) throw new Error('Yêu cầu kết nối máy chủ');
    const res = await fetch(`${this.serverUrl}/api/vaults/${vaultId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: newName })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Đổi tên sổ thất bại');
    }
    await this.fetchVaults();
    return true;
  }

  // Xóa Sổ (Chỉ Owner)
  async deleteVault(vaultId) {
    if (!this.serverUrl || !this.token) throw new Error('Yêu cầu kết nối máy chủ');
    const res = await fetch(`${this.serverUrl}/api/vaults/${vaultId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.token}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Xóa sổ thất bại');
    }

    const wasActive = (this.activeVaultId === vaultId);
    if (wasActive) {
      this.activeVaultId = null;
      await db.settings.delete('syncServerActiveVaultId');
    }
    await db.settings.delete('syncServerEncryptionPassword_' + vaultId);

    // Lấy lại danh sách sổ mới từ máy chủ
    await this.fetchVaults();

    if (wasActive) {
      if (this.vaults && this.vaults.length > 0) {
        // Tự động chuyển sang sổ còn lại đầu tiên (hoặc Sổ mặc định do server tự tạo mới)
        // và nạp/làm sạch dữ liệu tương ứng của sổ đó
        await this.switchVault(this.vaults[0].id, { skipPushCurrent: true });
      } else {
        // Nếu không còn sổ nào, khởi tạo dữ liệu cục bộ trắng
        await this.initializeBlankVault();
        if (window.app && typeof window.app.refreshAll === 'function') {
          await window.app.refreshAll();
        }
      }
    }
    return true;
  }

  // Lấy danh sách người dùng trên server để gợi ý khi chia sẻ sổ
  async fetchServerUsers() {
    if (!this.serverUrl || !this.token) return [];
    try {
      const res = await fetch(`${this.serverUrl}/api/users`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data.users) ? data.users : [];
      }
    } catch (e) {
      console.warn('[ServerSync] fetchServerUsers error:', e);
    }
    return [];
  }

  // Lấy danh sách thành viên được chia sẻ của 1 sổ
  async fetchShares(vaultId = null) {
    const targetVaultId = vaultId || this.activeVaultId;
    if (!this.serverUrl || !this.token || !targetVaultId) return [];
    try {
      const res = await fetch(`${this.serverUrl}/api/vaults/${targetVaultId}/shares`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const sharesList = data.shares || [];
        if (targetVaultId === this.activeVaultId) {
          this.shares = sharesList;
          window.dispatchEvent(new CustomEvent('server-shares-updated', { detail: { shares: this.shares } }));
        }
        return sharesList;
      }
    } catch (e) {
      console.warn('[ServerSync] fetchShares error:', e);
    }
    return [];
  }

  // Chia sẻ Sổ cho Email Google khác (hỗ trợ chỉ định vaultId độc lập)
  async shareVaultWithEmail(email, role = 'editor', vaultId = null) {
    const targetVaultId = vaultId || this.activeVaultId;
    if (!this.serverUrl || !this.token) throw new Error('Yêu cầu kết nối máy chủ');
    if (!targetVaultId) throw new Error('Chưa chọn sổ để chia sẻ');

    const cleanEmail = (email || '').toLowerCase().trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Vui lòng nhập địa chỉ email Google hợp lệ');
    }

    const res = await fetch(`${this.serverUrl}/api/vaults/${targetVaultId}/shares`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: cleanEmail, role })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Chia sẻ sổ thất bại');
    }

    const data = await res.json();
    if (targetVaultId === this.activeVaultId) {
      await this.fetchShares(this.activeVaultId);
    }
    return data;
  }

  // Xóa thành viên khỏi Sổ (hỗ trợ chỉ định vaultId độc lập)
  async removeShare(shareId, vaultId = null) {
    const targetVaultId = vaultId || this.activeVaultId;
    if (!this.serverUrl || !this.token || !targetVaultId) throw new Error('Yêu cầu kết nối máy chủ');

    const res = await fetch(`${this.serverUrl}/api/vaults/${targetVaultId}/shares/${shareId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.token}` }
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Xóa thành viên thất bại');
    }

    if (targetVaultId === this.activeVaultId) {
      await this.fetchShares(this.activeVaultId);
    }
    return true;
  }

  // Lấy lịch sử 20 snapshot gần nhất của Sổ
  async getVaultHistory(vaultId = null) {
    const targetVaultId = vaultId || this.activeVaultId;
    if (!this.serverUrl || !this.token || !targetVaultId) return [];
    try {
      const res = await fetch(`${this.serverUrl}/api/vaults/${targetVaultId}/history`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        return data.history || [];
      }
    } catch (e) {
      console.warn('[ServerSync] getVaultHistory error:', e);
    }
    return [];
  }

  // Khôi phục Sổ về một bản snapshot cụ thể (Rollback)
  async restoreVaultSnapshot(historyId, vaultId = null) {
    const targetVaultId = vaultId || this.activeVaultId;
    if (!this.serverUrl || !this.token || !targetVaultId) {
      throw new Error('Chưa kết nối hoặc chưa chọn Sổ trên Máy Chủ Riêng.');
    }
    if (!historyId) {
      throw new Error('Chưa chọn bản snapshot cần khôi phục.');
    }

    const res = await fetch(`${this.serverUrl}/api/vaults/${targetVaultId}/history/${historyId}/restore`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Khôi phục bản snapshot thất bại.');
    }

    const result = await res.json();
    if (result.data) {
      // Thay thế hoàn toàn dữ liệu dùng chung cục bộ bằng bản snapshot vừa khôi phục
      await this.replaceLocalWithSnapshotData(result.data);
    }

    this.lastSyncTime = new Date().toISOString();
    await db.settings.put({ key: 'syncServerLastSyncTime', value: this.lastSyncTime });
    await db.settings.put({ key: 'lastSyncTime', value: this.lastSyncTime });

    window.dispatchEvent(new CustomEvent('sync-success', {
      detail: { time: this.lastSyncTime, target: this.getTargetLabel() }
    }));

    return result;
  }

  // Kiểm tra và xử lý đồng bộ khi người dùng vừa đăng nhập thành công
  async handlePostLoginSync(userProfile) {
    if (!this.activeVaultId || !this.serverUrl || !this.token) return;

    // 1. Kiểm tra dữ liệu trên thiết bị cục bộ
    const localTxCount = await db.transactions.count();
    const localAccs = await db.accounts.toArray();
    const DEFAULT_ACCOUNT_NAMES = ['tiền mặt', 'ngân hàng', 'ví điện tử', 'momo / zalopay', 'tài khoản ngân hàng'];
    const isDefAcc = (a) => a && a.name && DEFAULT_ACCOUNT_NAMES.includes(a.name.trim().toLowerCase());
    const hasCustomAccs = localAccs.some(a => (a.balance !== 0) || ((a.initialBalance || 0) !== 0) || !isDefAcc(a));
    const hasLocalData = localTxCount > 0 || hasCustomAccs;

    // 2. Kéo thông tin dữ liệu từ Server Vault
    let serverVaultData = {};
    let serverTxCount = 0;
    try {
      const res = await fetch(`${this.serverUrl}/api/vaults/${this.activeVaultId}/data`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      if (res.ok) {
        const json = await res.json();
        serverVaultData = json.data || {};
        if (json.vault) {
          this.lastVaultVersion = json.vault.version;
          this.lastVaultUpdatedAt = json.vault.updated_at;
        }

        // Xử lý giải mã E2EE nếu dữ liệu server đã mã hóa
        if (serverVaultData && serverVaultData.encrypted && serverVaultData.payload) {
          if (!this.encryptionPassword) {
            this.encryptionPassword = await this.getEncryptionPasswordForVault(this.activeVaultId);
          }
          if (this.encryptionPassword && window.CryptoService) {
            try {
              const dec = await window.CryptoService.decrypt(serverVaultData.payload, this.encryptionPassword);
              serverVaultData = JSON.parse(dec);
            } catch (decErr) {
              console.warn('[ServerSync] Chưa giải mã được serverVaultData trong handlePostLoginSync:', decErr);
            }
          }
        }

        serverTxCount = (serverVaultData.transactions || []).filter(t => !t.isDeleted).length;
      }
    } catch (e) {
      console.warn('[ServerSync] Lỗi kiểm tra dữ liệu vault khi đăng nhập:', e);
    }

    // 3. Nếu máy cục bộ HOÀN TOÀN TRỐNG (vừa cài mới hoặc vừa đăng xuất làm sạch dữ liệu):
    if (!hasLocalData) {
      console.log('[ServerSync] Thiết bị cục bộ chưa có dữ liệu, tự động kéo dữ liệu từ máy chủ...');
      if (serverTxCount > 0 || (serverVaultData.accounts && serverVaultData.accounts.length > 0)) {
        await this.replaceLocalWithSnapshotData(serverVaultData, false);
      } else {
        await this.sync();
      }
      if (window.app && typeof window.app.refreshAll === 'function') {
        await window.app.refreshAll();
      }
      return;
    }

    // 4. Nếu máy cục bộ ĐANG CÓ DỮ LIỆU:
    // Hiển thị Modal để người dùng chủ động lựa chọn (Tùy chọn mặc định để TRỐNG)
    if (window.ServerAuthModals && typeof window.ServerAuthModals.promptLoginSyncStrategy === 'function') {
      await window.ServerAuthModals.promptLoginSyncStrategy({
        user: userProfile || this.userProfile,
        serverVaultData,
        localTxCount,
        serverTxCount
      });
    } else {
      // Fallback nếu modal chưa sẵn sàng
      await this.sync();
      if (window.app && typeof window.app.refreshAll === 'function') {
        await window.app.refreshAll();
      }
    }
  }

  // Thay thế toàn bộ dữ liệu dùng chung cục bộ bằng dữ liệu Snapshot / Sổ khác
  async replaceLocalWithSnapshotData(remoteData, preservePrivate = true) {
    if (!remoteData) return;

    let newAccs = remoteData.accounts ? [...remoteData.accounts] : [];
    let newTxs = remoteData.transactions ? [...remoteData.transactions] : [];

    if (preservePrivate) {
      // Giữ an toàn cho các tài khoản và giao dịch riêng tư cục bộ
      const localAccs = await db.accounts.toArray();
      const localTxs = await db.transactions.toArray();
      const DEFAULT_ACCOUNT_NAMES = ['tiền mặt', 'ngân hàng', 'ví điện tử', 'momo / zalopay', 'tài khoản ngân hàng'];
      const isDefAcc = (a) => a && a.name && DEFAULT_ACCOUNT_NAMES.includes(a.name.trim().toLowerCase());

      const privateAccs = localAccs.filter(a => {
        if (a.isShared === 1 || a.isShared === true) return false;
        // Nếu là tài khoản mặc định và không có số dư/giao dịch, mà remoteData đã có tài khoản: loại bỏ
        if (newAccs.length > 0 && isDefAcc(a)) {
          const isBlank = (Number(a.balance) || 0) === 0 && (Number(a.initialBalance) || 0) === 0;
          const hasTx = localTxs.some(t => !t.isDeleted && (String(t.accountId) === String(a.id) || String(t.toAccountId) === String(a.id)));
          if (isBlank && !hasTx) return false;
        }
        return true;
      });
      const privateAccIds = new Set(privateAccs.map(a => Number(a.id)));

      const privateTxs = localTxs.filter(t => {
        const accId = Number(t.accountId);
        const toAccId = t.toAccountId ? Number(t.toAccountId) : null;
        return privateAccIds.has(accId) && (!toAccId || privateAccIds.has(toAccId));
      });

      newAccs = [...privateAccs, ...newAccs];
      newTxs = [...privateTxs, ...newTxs];
    }

    // Bảo tồn các mục do người khác chia sẻ độc lập (_isSharedItem)
    const localAccs = await db.accounts.toArray();
    const sharedReceivedAccs = localAccs.filter(a => a._isSharedItem);
    const localTxs = await db.transactions.toArray();
    const sharedReceivedTxs = localTxs.filter(t => t._isSharedItem);

    if (sharedReceivedAccs.length > 0) {
      newAccs = [...newAccs.filter(a => !a._isSharedItem), ...sharedReceivedAccs];
    }
    if (sharedReceivedTxs.length > 0) {
      newTxs = [...newTxs.filter(t => !t._isSharedItem), ...sharedReceivedTxs];
    }

    if (newAccs.length === 0 && typeof DEFAULT_ACCOUNTS !== 'undefined') {
      newAccs = DEFAULT_ACCOUNTS.map((a, index) => ({
        ...a,
        balance: 0,
        initialBalance: 0,
        order: a.order ?? index,
        isDeleted: 0,
        updatedAt: 1
      }));
    }

    await db.accounts.clear();
    if (newAccs.length > 0) await db.accounts.bulkAdd(newAccs);

    await db.transactions.clear();
    if (newTxs.length > 0) await db.transactions.bulkAdd(newTxs);

    await db.categories.clear();
    if (remoteData.categories && remoteData.categories.length > 0) {
      await db.categories.bulkAdd(remoteData.categories);
    } else if (typeof DEFAULT_CATEGORIES !== 'undefined') {
      await db.categories.bulkAdd(DEFAULT_CATEGORIES.map(c => ({
        ...c,
        isDeleted: 0,
        updatedAt: Date.now()
      })));
    }
    if (typeof ensureLoanSystemCategories === 'function') {
      await ensureLoanSystemCategories();
    }

    await db.debts.clear();
    if (remoteData.debts && remoteData.debts.length > 0) {
      await db.debts.bulkAdd(remoteData.debts);
    }

    await db.budgets.clear();
    if (remoteData.budgets && remoteData.budgets.length > 0) {
      await db.budgets.bulkAdd(remoteData.budgets);
    }

    await db.recurring.clear();
    if (remoteData.recurring && remoteData.recurring.length > 0) {
      await db.recurring.bulkAdd(remoteData.recurring);
    }

    if (db.savings) {
      await db.savings.clear();
      if (remoteData.savings && remoteData.savings.length > 0) {
        await db.savings.bulkAdd(remoteData.savings);
      }
    }

    if (db.accumulations) {
      await db.accumulations.clear();
      if (remoteData.accumulations && remoteData.accumulations.length > 0) {
        await db.accumulations.bulkAdd(remoteData.accumulations);
      }
    }

    if (db.assets) {
      await db.assets.clear();
      if (remoteData.assets && remoteData.assets.length > 0) {
        await db.assets.bulkAdd(remoteData.assets);
      }
    }

    if (db.loans) {
      await db.loans.clear();
      if (remoteData.loans && remoteData.loans.length > 0) {
        await db.loans.bulkAdd(remoteData.loans);
      }
    }

    if (remoteData.settings && Array.isArray(remoteData.settings)) {
      for (const rSetting of remoteData.settings) {
        await db.settings.put(rSetting);
      }
    }

    if (typeof window.recalculateAccountBalances === 'function') {
      await window.recalculateAccountBalances();
    }
  }

  // Ép ghi đè toàn bộ dữ liệu cục bộ lên Máy chủ riêng (Force Overwrite)
  async forceOverwriteServer(customPassword = undefined) {
    if (!this.serverUrl || !this.token || !this.activeVaultId) {
      throw new Error('Chưa kết nối hoặc chưa chọn Sổ trên Máy Chủ Riêng.');
    }

    const currentVault = this.getActiveVault();
    if (currentVault && currentVault.role === 'viewer') {
      throw new Error('Bạn chỉ có quyền xem, không thể ghi đè dữ liệu lên sổ này.');
    }

    const allAccs = await db.accounts.toArray();
    const allTxs = await db.transactions.toArray();

    const SYNCABLE_SETTINGS_KEYS = [
      'budget_mode',
      'budget_applicable_accounts',
      'budget_rollover_enabled',
      'budget_auto_rollover',
      'theme',
      'currency',
      'privacyMode'
    ];
    const localSettings = [];
    for (const k of SYNCABLE_SETTINGS_KEYS) {
      const s = await db.settings.get(k);
      if (s) localSettings.push(s);
    }

    const payload = {
      transactions: allTxs,
      accounts: allAccs,
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

    const passToUse = customPassword !== undefined ? customPassword : this.encryptionPassword;
    let dataToSend = payload;
    if (passToUse && window.CryptoService) {
      const encryptedPayload = await window.CryptoService.encrypt(JSON.stringify(payload), passToUse);
      dataToSend = {
        encrypted: true,
        payload: encryptedPayload,
        encryptedAt: new Date().toISOString()
      };
    }

    const res = await fetch(`${this.serverUrl}/api/vaults/${this.activeVaultId}/overwrite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: dataToSend, forceOverwrite: true })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Ghi đè dữ liệu lên máy chủ thất bại.');
    }

    const pushResult = await res.json();
    if (pushResult && pushResult.version) {
      this.lastVaultVersion = pushResult.version;
      this.lastVaultUpdatedAt = pushResult.updated_at;
      await db.settings.put({ key: 'syncServerLastVaultVersion', value: this.lastVaultVersion });
    }

    if (typeof window.recalculateAccountBalances === 'function') {
      await window.recalculateAccountBalances();
    }

    this.lastSyncTime = new Date().toISOString();
    await db.settings.put({ key: 'syncServerLastSyncTime', value: this.lastSyncTime });
    await db.settings.put({ key: 'lastSyncTime', value: this.lastSyncTime });

    window.dispatchEvent(new CustomEvent('sync-success', {
      detail: { time: this.lastSyncTime, target: this.getTargetLabel() }
    }));

    return pushResult;
  }

  async overwriteVaultWithLocal(customPassword = undefined) {
    return this.forceOverwriteServer(customPassword);
  }

  // Đổi Mật Khẩu Mã Hóa Sổ (Re-encrypt vault with new password)
  async changeEncryptionPassword(...args) {
    if (!this.token) throw new Error('Vui lòng kết nối và đăng nhập máy chủ riêng.');
    if (!this.activeVaultId) throw new Error('Chưa chọn sổ trên máy chủ.');
    const newPassword = (args.length >= 2 ? args[1] : args[0]) || '';
    if (!newPassword.trim()) {
      throw new Error('Mật khẩu mới không được để trống.');
    }
    const cleanNewPass = newPassword.trim();

    // Dữ liệu đã có sẵn trên máy khách. Ghi đè toàn bộ dữ liệu trên máy chủ bằng Mật khẩu mới
    await this.overwriteVaultWithLocal(cleanNewPass);

    // Cập nhật mật khẩu trong máy khách
    await this.setEncryptionPassword(cleanNewPass, this.activeVaultId);

    return { success: true };
  }

  // Vô hiệu hóa mã hóa E2EE (Chuyển về dạng lưu trữ thông thường trên máy chủ)
  async disableEncryption() {
    if (!this.token) throw new Error('Vui lòng kết nối và đăng nhập máy chủ riêng.');
    if (!this.activeVaultId) throw new Error('Chưa chọn sổ trên máy chủ.');

    // Dữ liệu thô đã có sẵn trên máy khách, ghi đè trực tiếp dạng Plain JSON (customPassword = null)
    await this.overwriteVaultWithLocal(null);

    // Xóa mật khẩu trên máy khách
    await this.setEncryptionPassword(null, this.activeVaultId);

    // Cập nhật lại các mục chia sẻ (Universal Share Projections) sang dạng KHÔNG mã hoá (plain JSON) và xoá khóa mã hoá đã lưu
    try {
      const ownedSetting = await db.settings.get('syncOwnedSharedProjections');
      if (ownedSetting && Array.isArray(ownedSetting.value)) {
        for (const s of ownedSetting.value) {
          if (s.shareKey) {
            await this.deleteItemShareKey(s.shareKey);
          }
          await this.deleteItemShareKey(`${s.itemType}_${s.itemId}`);
          await this.deleteItemShareKey(s.itemId);
          s.shareKey = null;
          await this.projectAndPushItem(s.itemType, s.itemId, null);
        }
        await db.settings.put({ key: 'syncOwnedSharedProjections', value: ownedSetting.value });
      }
    } catch (e) {
      console.warn('[ServerSync] Lỗi cập nhật bản chiếu khi tắt mã hoá:', e);
    }

    return { success: true };
  }

  // Thiết lập mật khẩu mã hóa sổ máy chủ (Zero-Knowledge E2EE)
  async getEncryptionPasswordForVault(vaultId = this.activeVaultId) {
    if (!vaultId) return this.encryptionPassword;
    try {
      const vPass = await db.settings.get('syncServerEncryptionPassword_' + vaultId);
      if (vPass && vPass.value !== undefined) {
        return vPass.value ? vPass.value.trim() : null;
      }
      const activeVault = this.getActiveVault();
      if (!activeVault || activeVault.role === 'owner') {
        const legacyPass = await db.settings.get('syncServerEncryptionPassword');
        return legacyPass && legacyPass.value ? legacyPass.value.trim() : null;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  async setEncryptionPassword(password, vaultId = this.activeVaultId) {
    this.encryptionPassword = password ? password.trim() : null;
    if (vaultId) {
      await db.settings.put({ key: 'syncServerEncryptionPassword_' + vaultId, value: this.encryptionPassword });
    }
    await db.settings.put({ key: 'syncServerEncryptionPassword', value: this.encryptionPassword });
  }

  // Bật/tắt tự động đồng bộ
  setAutoSync(enabled) {
    this.autoSync = !!enabled;
    db.settings.put({ key: 'syncServerAutoSync', value: this.autoSync });
  }

  // Kiểm tra điều kiện tự động đồng bộ
  isAutoSyncEnabled() {
    return !!(this.autoSync && this.serverUrl && this.token && this.activeVaultId);
  }

  // Tên hiển thị trạng thái
  getTargetLabel() {
    const v = this.getActiveVault();
    if (v) {
      const roleText = v.role === 'owner' ? 'Chủ Sổ' : (v.role === 'viewer' ? 'Chỉ Xem' : 'Thành Viên');
      return `Máy chủ riêng (${v.name} - ${roleText})`;
    }
    return 'Máy chủ riêng (Self-Hosted)';
  }

  // Đồng bộ hai chiều với Máy chủ riêng
  async sync(options = {}) {
    if (this.isSyncing) return;
    if (!this.serverUrl || !this.token) {
      throw new Error('Chưa kết nối hoặc chưa đăng nhập vào Máy chủ riêng.');
    }
    if (!this.activeVaultId) {
      await this.fetchVaults();
      if (!this.activeVaultId) throw new Error('Chưa chọn Sổ cần đồng bộ.');
    }

    this.isSyncing = true;
    const targetLabel = this.getTargetLabel();
    window.dispatchEvent(new CustomEvent('sync-start', { detail: { target: targetLabel } }));

    try {
      let localDataHasChanged = false;
      const currentVault = this.getActiveVault();
      const isViewer = currentVault && currentVault.role === 'viewer';

      // 1. Tải dữ liệu Sổ từ Máy chủ (kèm tự động đồng bộ giờ server)
      const pullRes = await this.fetchWithSync(`${this.serverUrl}/api/vaults/${this.activeVaultId}/data`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });

      if (!pullRes.ok) {
        if (pullRes.status === 401) {
          await this.logout();
          throw new Error('Phiên làm việc trên máy chủ đã hết hạn. Vui lòng đăng nhập lại.');
        }
        const err = await pullRes.json();
        throw new Error(err.error || 'Không thể tải dữ liệu từ máy chủ.');
      }

      const pullResult = await pullRes.json();
      let serverData = pullResult.data || {};
      if (pullResult.vault) {
        this.lastVaultVersion = pullResult.vault.version;
        this.lastVaultUpdatedAt = pullResult.vault.updated_at;
      }

      // Xử lý giải mã E2EE nếu dữ liệu trên máy chủ đã được mã hóa
      if (serverData && serverData.encrypted && serverData.payload) {
        if (!this.encryptionPassword) {
          const vaultPass = await this.getEncryptionPasswordForVault(this.activeVaultId);
          this.encryptionPassword = vaultPass;
        }
        if (!this.encryptionPassword) {
          throw new Error('Sổ trên máy chủ đã được mã hóa đầu cuối (E2EE). Vui lòng vào Cài đặt Máy Chủ Riêng > Nhập Mật khẩu Mã Hóa Sổ để mở khóa dữ liệu.');
        }
        if (!window.CryptoService) {
          throw new Error('Trình duyệt không hỗ trợ thư viện giải mã dữ liệu (CryptoService).');
        }
        try {
          const decryptedStr = await window.CryptoService.decrypt(serverData.payload, this.encryptionPassword);
          serverData = JSON.parse(decryptedStr);
        } catch (decErr) {
          throw new Error('Mật khẩu mã hóa Sổ không chính xác! Không thể giải mã dữ liệu tài chính từ máy chủ.');
        }
      } else {
        // Sổ trên server không mã hóa -> đảm bảo mật khẩu là null để không tự mã hóa
        this.encryptionPassword = null;
      }

      // 2. Gộp dữ liệu từ Server vào IndexedDB máy khách (bảo vệ tài khoản riêng tư)
      const pullChanged = await this.mergeServerDataIntoLocal(serverData);
      if (pullChanged) localDataHasChanged = true;

      // 2.5. Kéo và gộp các giao dịch/ghi chú mới từ các thành viên (Editor) được chia sẻ mục TRƯỚC TIÊN
      try {
        const ownedChanged = await this.pullAndMergeOwnedSharedProjections();
        if (ownedChanged) localDataHasChanged = true;
      } catch (ownedErr) {
        console.warn('[ServerSync] Lỗi kéo giao dịch từ mục chia sẻ của chủ:', ownedErr.message);
      }

      // Sau khi đã gộp giao dịch từ thành viên vào IndexedDB, cập nhật lại bản chiếu mới nhất lên Server
      try {
        const ownedShares = await db.settings.get('syncOwnedSharedProjections');
        if (ownedShares && Array.isArray(ownedShares.value)) {
          let dirty = false;
          for (const s of ownedShares.value) {
            let currentKey = null;
            if (this.encryptionPassword) {
              currentKey = s.shareKey || (await this.getItemShareKey(`${s.itemType}_${s.itemId}`)) || this.encryptionPassword;
            } else {
              // Sổ không mã hoá: xoá khoá cũ để đảm bảo không bị mã hoá sót
              if (s.shareKey) {
                s.shareKey = null;
                dirty = true;
              }
              await this.deleteItemShareKey(`${s.itemType}_${s.itemId}`);
              await this.deleteItemShareKey(s.itemId);
            }
            await this.projectAndPushItem(s.itemType, s.itemId, currentKey);
          }
          if (dirty) {
            await db.settings.put({ key: 'syncOwnedSharedProjections', value: ownedShares.value });
          }
        }
      } catch (projErr) {
        console.warn('[ServerSync] Lỗi cập nhật bản chiếu chia sẻ:', projErr.message);
      }

      // 3. Nếu là Editor hoặc Owner: Chuẩn bị dữ liệu để đẩy (Push) lên Server
      if (!isViewer) {
        const localPayload = await this.buildLocalPayload();

        let dataToSend = localPayload;
        if (this.encryptionPassword && window.CryptoService) {
          const encryptedPayload = await window.CryptoService.encrypt(JSON.stringify(localPayload), this.encryptionPassword);
          dataToSend = {
            encrypted: true,
            payload: encryptedPayload,
            encryptedAt: new Date().toISOString()
          };
        }

        // Gửi push & merge lên Server kèm baseVersion để kiểm soát xung đột đồng thời
        let pushRes = await this.fetchWithSync(`${this.serverUrl}/api/vaults/${this.activeVaultId}/sync`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ data: dataToSend, baseVersion: this.lastVaultVersion })
        });

        // TỰ ĐỘNG XỬ LÝ KHI 2 THIẾT BỊ GỬI ĐỒNG THỜI (Optimistic Concurrency Retry)
        if (pushRes.status === 409) {
          const conflictData = await pushRes.json();
          console.warn(`[ServerSync] ⚔️ Phát hiện xung đột đồng thời (Client v${this.lastVaultVersion} < Server v${conflictData.currentVersion}). Tự động giải mã, gộp bản mới và đẩy lại...`);

          let remoteData = conflictData.serverData;
          if (remoteData && remoteData.encrypted && remoteData.payload && this.encryptionPassword && window.CryptoService) {
            try {
              const dec = await window.CryptoService.decrypt(remoteData.payload, this.encryptionPassword);
              remoteData = JSON.parse(dec);
            } catch (decErr) {
              console.error('[ServerSync] Giải mã bản ghi xung đột thất bại:', decErr);
            }
          }

          // 1. Gộp dữ liệu của thiết bị kia vừa gửi lên vào IndexedDB của mình
          if (remoteData && !remoteData.encrypted) {
            const conflictChanged = await this.mergeServerDataIntoLocal(remoteData);
            if (conflictChanged) localDataHasChanged = true;
          }
          this.lastVaultVersion = conflictData.currentVersion;

          // 2. Thu thập lại dữ liệu địa phương (đã chứa cả dữ liệu của mình và thiết bị kia)
          const remergedAccs = await db.accounts.toArray();
          const remergedTxs = await db.transactions.toArray();
          const pAccs = remergedAccs.filter(a => !a._isSharedItem);
          const pAccIds = new Set(pAccs.map(a => Number(a.id)));
          const pTxs = remergedTxs.filter(t => {
            if (t._isSharedItem) return false;
            const accId = Number(t.accountId);
            const toAccId = t.toAccountId ? Number(t.toAccountId) : null;
            return pAccIds.has(accId) || (toAccId && pAccIds.has(toAccId));
          });

          const remergedPayload = {
            transactions: pTxs,
            accounts: pAccs,
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

          let reEncryptedData = remergedPayload;
          if (this.encryptionPassword && window.CryptoService) {
            const reEnc = await window.CryptoService.encrypt(JSON.stringify(remergedPayload), this.encryptionPassword);
            reEncryptedData = {
              encrypted: true,
              payload: reEnc,
              encryptedAt: new Date().toISOString()
            };
          }

          // 3. Đẩy lại lần 2 lên server với baseVersion mới
          pushRes = await this.fetchWithSync(`${this.serverUrl}/api/vaults/${this.activeVaultId}/sync`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: reEncryptedData, baseVersion: this.lastVaultVersion })
          });
        }

        if (!pushRes.ok) {
          const err = await pushRes.json();
          throw new Error(err.error || 'Đẩy dữ liệu lên máy chủ thất bại.');
        }

        const pushResult = await pushRes.json();
        const newVersion = pushResult.version !== undefined ? pushResult.version : pushResult.vault?.version;
        const newUpdatedAt = pushResult.updated_at !== undefined ? pushResult.updated_at : pushResult.vault?.updated_at;
        if (newVersion !== undefined) {
          this.lastVaultVersion = newVersion;
          this.lastVaultUpdatedAt = newUpdatedAt;
          await db.settings.put({ key: 'syncServerLastVaultVersion', value: this.lastVaultVersion });
        }
        // Cập nhật lại IndexedDB với kết quả đã gộp từ server
        if (pushResult.data) {
          let pushData = pushResult.data;
          if (pushData.encrypted && pushData.payload) {
            if (this.encryptionPassword && window.CryptoService) {
              try {
                const dec = await window.CryptoService.decrypt(pushData.payload, this.encryptionPassword);
                pushData = JSON.parse(dec);
              } catch (_) {}
            }
          }
          if (!pushData.encrypted) {
            const pushChanged = await this.mergeServerDataIntoLocal(pushData);
            if (pushChanged) localDataHasChanged = true;
          }
        }

        // Tự động đồng bộ các mục được người khác chia sẻ (Received Shared Items)
        try {
          // Tự động làm mới và cập nhật bản chiếu cho các mục đang chia sẻ
          try {
            const ownedShares = await db.settings.get('syncOwnedSharedProjections');
            if (ownedShares && Array.isArray(ownedShares.value)) {
              let dirty = false;
              for (const s of ownedShares.value) {
                let currentKey = null;
                if (this.encryptionPassword) {
                  currentKey = s.shareKey || (await this.getItemShareKey(`${s.itemType}_${s.itemId}`)) || this.encryptionPassword;
                } else {
                  if (s.shareKey) {
                    s.shareKey = null;
                    dirty = true;
                  }
                  await this.deleteItemShareKey(`${s.itemType}_${s.itemId}`);
                  await this.deleteItemShareKey(s.itemId);
                }
                await this.projectAndPushItem(s.itemType, s.itemId, currentKey);
              }
              if (dirty) {
                await db.settings.put({ key: 'syncOwnedSharedProjections', value: ownedShares.value });
              }
            }
          } catch (projErr) {
            console.warn('[ServerSync] Lỗi tự động cập nhật bản chiếu chia sẻ:', projErr.message);
          }

          const sharedChanged = await this.syncReceivedSharedItems();
          if (sharedChanged) localDataHasChanged = true;
        } catch (shareSyncErr) {
          console.warn('[ServerSync] Đồng bộ mục chia sẻ nhận được:', shareSyncErr.message);
        }
      } else {
        try {
          const sharedChanged = await this.syncReceivedSharedItems();
          if (sharedChanged) localDataHasChanged = true;
        } catch (shareSyncErr) {
          console.warn('[ServerSync] Đồng bộ mục chia sẻ nhận được (viewer):', shareSyncErr.message);
        }
      }

      // Đối soát lại số dư
      if (typeof window.recalculateAccountBalances === 'function') {
        await window.recalculateAccountBalances();
      }

      // Đảm bảo thứ tự hiển thị tùy chỉnh của tài khoản không bị xáo trộn sau khi đồng bộ
      if (typeof window.enforceAccountsDisplayOrder === 'function') {
        await window.enforceAccountsDisplayOrder();
      }

      this.lastSyncTime = new Date().toISOString();
      this.lastError = null;
      await db.settings.put({ key: 'syncServerLastSyncTime', value: this.lastSyncTime });
      await db.settings.put({ key: 'lastSyncTime', value: this.lastSyncTime });

      window.dispatchEvent(new CustomEvent('sync-success', {
        detail: { time: this.lastSyncTime, target: targetLabel, dataChanged: localDataHasChanged }
      }));

      return { success: true, time: this.lastSyncTime };
    } catch (err) {
      console.error('[ServerSync] Error:', err);
      this.lastError = err.message;
      window.dispatchEvent(new CustomEvent('sync-error', {
        detail: { error: err.message, target: targetLabel }
      }));
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  // ===========================================================================
  // REAL-TIME AUTO POLLING & TAB VISIBILITY SYNC (ĐỒNG BỘ TỰ ĐỘNG THỜI GIAN THỰC)
  // ===========================================================================
  startAutoPolling() {
    if (this._pollingStarted) return;
    this._pollingStarted = true;

    // 1. Kiểm tra định kỳ mỗi 60 giây (khi tab đang active)
    setInterval(async () => {
      if (document.hidden) return;
      await this.checkRemoteVersionAndSync();
    }, 60000);

    // 2. Kiểm tra ngay lập tức khi người dùng chuyển qua lại giữa các tab hoặc mở lại app
    const onAppResume = async () => {
      if (this.autoSync === false) return;
      await this.checkRemoteVersionAndSync();
      if (this.serverUrl && this.token) {
        try {
          const p1 = this.syncReceivedSharedItems();
          const p2 = this.pullAndMergeOwnedSharedProjections();
          const [changed1, changed2] = await Promise.all([p1.catch(() => false), p2.catch(() => false)]);
          if (changed1 || changed2) {
            if (typeof window.recalculateAccountBalances === 'function') {
              await window.recalculateAccountBalances();
            }
            if (window.app && typeof window.app.refreshAll === 'function') {
              await window.app.refreshAll();
            }
          }
        } catch (_) {}
      }
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

  async checkRemoteVersionAndSync() {
    if (!this.serverUrl || !this.token || !this.activeVaultId || this.isSyncing) return;
    if (this.autoSync === false) return;

    try {
      const res = await fetch(`${this.serverUrl}/api/vaults/${this.activeVaultId}/version`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      if (!res.ok) return;

      const data = await res.json();
      if (data && data.version !== undefined) {
        const remoteVer = Number(data.version);
        const localVer = this.lastVaultVersion !== null && this.lastVaultVersion !== undefined ? Number(this.lastVaultVersion) : null;
        if (localVer !== null && !isNaN(localVer) && !isNaN(remoteVer) && remoteVer > localVer) {
          console.log(`[ServerSync] Phát hiện dữ liệu mới trên máy chủ (v${remoteVer} > v${localVer}), tự động cập nhật...`);
          await this.sync();
        } else if (this.lastVaultVersion === null || this.lastVaultVersion === undefined) {
          this.lastVaultVersion = data.version;
          this.lastVaultUpdatedAt = data.updated_at;
          await db.settings.put({ key: 'syncServerLastVaultVersion', value: this.lastVaultVersion });
        }
      }
    } catch (e) {
      // Bỏ qua lỗi kết nối tạm thời khi polling
    }
  }

  // Thuật toán gộp dữ liệu từ Server vào Dexie IndexedDB (Chống ghi đè & Tự động xử lý xung đột ID)
  async mergeServerDataIntoLocal(remoteData) {
    if (!remoteData) return false;
    let anyDataChanged = false;

    const mergeTable = async (table, localItems, remoteItems, isAccountTable = false, tableName = '') => {
      if (!table || !Array.isArray(remoteItems)) return;
      const itemMap = new Map();
      const generateUniqueNumericId = () => (window.generateUniqueId ? window.generateUniqueId() : (Date.now() * 1000 + Math.floor(Math.random() * 1000)));

      let localTxAccIds = new Set();
      if (isAccountTable) {
        const currentTxs = await db.transactions.toArray();
        for (const t of currentTxs) {
          if (!t.isDeleted) {
            if (t.accountId !== undefined && t.accountId !== null) localTxAccIds.add(String(t.accountId));
            if (t.toAccountId !== undefined && t.toAccountId !== null) localTxAccIds.add(String(t.toAccountId));
          }
        }
      }

      const DEFAULT_ACCOUNT_NAMES = ['tiền mặt', 'ngân hàng', 'ví điện tử', 'momo / zalopay', 'tài khoản ngân hàng'];
      const isDefAcc = (a) => a && a.name && DEFAULT_ACCOUNT_NAMES.includes(a.name.trim().toLowerCase());
      const isBlankAcc = (a) => (a.balance === 0 || a.balance === '0') &&
                                ((a.initialBalance || 0) === 0) &&
                                !a.isShared;
      const isUntouchedDefAcc = (a) => isAccountTable && isDefAcc(a) && isBlankAcc(a) && !localTxAccIds.has(String(a.id)) && (Number(a.updatedAt || 0) <= 1);

      const mergeEntityFields = (olderItem, newerItem, tblName = '') => {
        if (!olderItem) return { ...newerItem };
        if (!newerItem) return { ...olderItem };

        const merged = { ...olderItem, ...newerItem };

        // 1. Giữ nguyên mốc thời gian tạo ban đầu (cũ nhất)
        if (olderItem.createdAt && newerItem.createdAt) {
          const oC = new Date(olderItem.createdAt).getTime() || olderItem.createdAt;
          const nC = new Date(newerItem.createdAt).getTime() || newerItem.createdAt;
          merged.createdAt = Math.min(oC, nC);
        } else if (olderItem.createdAt) {
          merged.createdAt = olderItem.createdAt;
        }

        // 2. Gộp thông minh cấp độ trường: bảo lưu trường khác rỗng của olderItem nếu newerItem không cung cấp
        const retainableFields = [
          'note', 'description', 'categoryId', 'tags', 'payee', 'payer',
          'fee', 'toAccountId', 'personName', 'dueDate', 'reminderTime',
          'color', 'icon', 'order', 'budgetLimit', 'period', 'startDate', 'endDate',
          'initialBalance', 'accountType'
        ];
        for (const field of retainableFields) {
          if (
            (merged[field] === undefined || merged[field] === null || merged[field] === '') &&
            olderItem[field] !== undefined && olderItem[field] !== null && olderItem[field] !== ''
          ) {
            merged[field] = olderItem[field];
          }
        }

        if (olderItem.order !== undefined && olderItem.order !== null && (newerItem.order === undefined || newerItem.order === null)) {
          merged.order = olderItem.order;
        }

        const oTime = new Date(olderItem.updatedAt || 0).getTime() || 0;
        const nTime = new Date(newerItem.updatedAt || 0).getTime() || 0;
        merged.updatedAt = Math.max(oTime, nTime);

        return merged;
      };

      const resolveDeletedStatus = (itemA, itemB) => {
        const isA = Boolean(itemA && itemA.isDeleted);
        const isB = Boolean(itemB && itemB.isDeleted);

        if (isA && isB) {
          const delAt = (itemA && itemA.deletedAt) || (itemB && itemB.deletedAt) || Math.max(
            new Date((itemA && itemA.updatedAt) || 0).getTime() || 0,
            new Date((itemB && itemB.updatedAt) || 0).getTime() || 0
          );
          const source = (itemA && itemA.deletedSource) || (itemB && itemB.deletedSource) || 'sync';
          const reason = (itemA && itemA.deletedReason) || (itemB && itemB.deletedReason) || 'Đồng bộ từ máy chủ / thiết bị khác';
          return { isDeleted: 1, deletedAt: delAt, deletedSource: source, deletedReason: reason };
        }

        if (!isA && !isB) {
          return { isDeleted: 0, deletedAt: null, deletedSource: null, deletedReason: null };
        }

        // Một bên đã xóa, một bên đang hoạt động
        const deletedItem = isA ? itemA : itemB;
        const activeItem = isA ? itemB : itemA;

        const deletedTime = new Date(deletedItem.deletedAt || deletedItem.updatedAt || 0).getTime() || 0;
        const activeTime = new Date(activeItem.restoredAt || activeItem.updatedAt || 0).getTime() || 0;

        // Nếu bên hoạt động có thời gian cập nhật/khôi phục MỚI HƠN thời điểm xóa:
        // Hành động Khôi phục (Restore) thắng!
        if (activeTime > deletedTime) {
          return {
            isDeleted: 0,
            deletedAt: null,
            deletedSource: null,
            deletedReason: null,
            restoredAt: activeItem.restoredAt || activeTime
          };
        }

        // Ngược lại: Hành động Xóa xảy ra sau hoặc không có khôi phục mới -> Tombstone Priority thắng
        return {
          isDeleted: 1,
          deletedAt: deletedItem.deletedAt || deletedTime,
          deletedSource: deletedItem.deletedSource || 'sync',
          deletedReason: deletedItem.deletedReason || 'Đồng bộ từ máy chủ / thiết bị khác'
        };
      };

      for (const lItem of localItems) {
        if (lItem && lItem.id !== undefined && lItem.id !== null) {
          itemMap.set(String(lItem.id), lItem);
        }
      }

      for (const rItem of remoteItems) {
        if (!rItem || rItem.id === undefined || rItem.id === null) continue;

        let lItem = itemMap.get(String(rItem.id));

        // --- XỬ LÝ RIÊNG CHO BẢNG TÀI KHOẢN (ACCOUNTS) ---
        if (isAccountTable) {
          if (!lItem && rItem.name) {
            for (const existing of itemMap.values()) {
              if (
                existing.name &&
                existing.name.trim().toLowerCase() === rItem.name.trim().toLowerCase() &&
                existing.type === rItem.type
              ) {
                lItem = existing;
                break;
              }
            }
          }

          if (!lItem) {
            itemMap.set(String(rItem.id), rItem);
          } else {
            // Nếu tài khoản local là tài khoản mặc định chưa phát sinh ghi chép và remote đánh dấu đã xoá:
            // Cập nhật trạng thái xoá ngay lập tức, không để timestamp local ghi đè
            if (isUntouchedDefAcc(lItem) && rItem.isDeleted) {
              itemMap.set(String(lItem.id), { ...rItem, id: lItem.id, isDeleted: 1 });
              continue;
            }

            // Chỉ bảo vệ nếu tài khoản local là tài khoản mặc định chưa từng sử dụng (seed data ban đầu với updatedAt <= 1)
            const rHasData = (rItem.balance !== 0 || (rItem.initialBalance || 0) !== 0);

            if (isUntouchedDefAcc(lItem) && rHasData && !rItem.isDeleted) {
              const localOrder = (lItem && lItem.order !== undefined && lItem.order !== null) ? lItem.order : rItem.order;
              itemMap.set(String(lItem.id), { ...rItem, id: lItem.id, order: localOrder });
              continue;
            }

            const rTime = new Date(rItem.updatedAt || 0).getTime() || 0;
            const lTime = new Date(lItem.updatedAt || 0).getTime() || 0;
            const older = rTime >= lTime ? lItem : rItem;
            const newer = rTime >= lTime ? rItem : lItem;
            const merged = mergeEntityFields(older, newer, 'accounts');
            merged.id = lItem.id;
            const delStatus = resolveDeletedStatus(lItem, rItem);
            Object.assign(merged, delStatus);
            itemMap.set(String(lItem.id), merged);
          }
          continue;
        }

        // --- XỬ LÝ CHO CÁC BẢNG KHÁC (TRANSACTIONS, V.V...) ---
        if (!lItem) {
          // Khớp dự phòng theo signature cho bảng giao dịch tránh tạo bản ghi trùng lặp
          let matchedTx = null;
          let matchedKey = null;
          if (tableName === 'transactions' || (rItem.amount !== undefined && rItem.date !== undefined)) {
            for (const [key, existing] of itemMap.entries()) {
              const sameType = existing.type === rItem.type;
              const sameDate = String(existing.date || '').slice(0, 10) === String(rItem.date || '').slice(0, 10);
              const sameTime = !existing.time || !rItem.time || String(existing.time) === String(rItem.time);
              const sameAmount = Math.abs(Number(existing.amount || 0) - Number(rItem.amount || 0)) < 0.01;
              const sameAccount = Number(existing.accountId) === Number(rItem.accountId);
              const sameNote = (existing.note || '').trim() === (rItem.note || '').trim();
              if (sameType && sameDate && sameTime && sameAmount && sameAccount && sameNote) {
                matchedTx = existing;
                matchedKey = key;
                break;
              }
            }
          }
          if (matchedTx) {
            const rTime = new Date(rItem.updatedAt || 0).getTime() || 0;
            const lTime = new Date(matchedTx.updatedAt || 0).getTime() || 0;
            const older = rTime >= lTime ? matchedTx : rItem;
            const newer = rTime >= lTime ? rItem : matchedTx;
            const merged = mergeEntityFields(older, newer, tableName);
            merged.id = matchedTx.id;
            const delStatus = resolveDeletedStatus(matchedTx, rItem);
            Object.assign(merged, delStatus);
            itemMap.set(matchedKey, merged);
            continue;
          }

          itemMap.set(String(rItem.id), rItem);
        } else {
          // Kiểm tra xem có phải trùng ID do auto-increment của 2 trình duyệt độc lập không
          let isSameEntity = false;

          if (tableName === 'transactions' || (rItem.amount !== undefined && rItem.date !== undefined)) {
            const sameType = rItem.type === lItem.type;
            const sameDate = String(rItem.date || '').slice(0, 10) === String(rItem.date || '').slice(0, 10);
            const sameAmount = Math.abs(Number(rItem.amount || 0) - Number(lItem.amount || 0)) < 0.01;
            const sameAccount = Number(rItem.accountId) === Number(lItem.accountId);
            isSameEntity = sameType && sameDate && sameAmount && sameAccount;
          } else if (rItem.name && lItem.name) {
            isSameEntity = (rItem.name.trim().toLowerCase() === lItem.name.trim().toLowerCase());
          } else {
            isSameEntity = true;
          }

          if (isSameEntity) {
            // Cùng một thực thể -> Hợp nhất thông minh kết hợp Tombstone / Restore Priority
            const rTime = new Date(rItem.updatedAt || 0).getTime() || 0;
            const lTime = new Date(lItem.updatedAt || 0).getTime() || 0;
            const older = rTime >= lTime ? lItem : rItem;
            const newer = rTime >= lTime ? rItem : lItem;
            const merged = mergeEntityFields(older, newer, tableName);
            merged.id = lItem.id;
            const delStatus = resolveDeletedStatus(lItem, rItem);
            Object.assign(merged, delStatus);
            itemMap.set(String(lItem.id), merged);
          } else {
            // Xung đột ID giữa 2 trình duyệt: Cấp ID mới cho rItem và giữ cả 2!
            const newId = generateUniqueNumericId();
            itemMap.set(String(newId), { ...rItem, id: newId });
          }
        }
      }

      // Khôi phục và bảo vệ đầy đủ các tài khoản mặc định (như Ví tiền mặt, Ngân hàng, Ví điện tử)
      if (isAccountTable) {
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
          } else if (exists.isDeleted === 1 && exists.deletedSource !== 'user') {
            exists.isDeleted = 0;
            exists.deletedAt = null;
            exists.deletedReason = null;
            exists.updatedAt = now;
            exists.restoredAt = now;
          }
        }
      }

      const mergedList = Array.from(itemMap.values());
      const sortById = (arr) => [...arr].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const beforeStr = JSON.stringify(sortById(localItems));
      const afterStr = JSON.stringify(sortById(mergedList));
      if (beforeStr !== afterStr) {
        anyDataChanged = true;
        await table.clear();
        await table.bulkAdd(mergedList);
      }
    };

    // Lưu lại các item được người khác chia sẻ để không bị ghi đè bởi vault cá nhân
    const sharedReceivedAccs = (await db.accounts.toArray()).filter(a => a._isSharedItem);
    const sharedReceivedTxs = (await db.transactions.toArray()).filter(t => t._isSharedItem);

    const prevAccsChanged = anyDataChanged;
    if (remoteData.transactions) await mergeTable(db.transactions, await db.transactions.toArray(), remoteData.transactions, false, 'transactions');
    if (remoteData.accounts) await mergeTable(db.accounts, await db.accounts.toArray(), remoteData.accounts, true, 'accounts');

    // Đối soát ngay số dư tài khoản theo giao dịch vừa gộp để không bao giờ hiển thị số dư cũ bị lệch
    if (typeof window.recalculateAccountBalances === 'function') {
      await window.recalculateAccountBalances();
    }

    // Phục hồi lại các item chia sẻ nhận được chỉ khi bảng tài khoản/giao dịch thực sự bị xóa & gộp lại
    if (anyDataChanged) {
      for (const sAcc of sharedReceivedAccs) {
        await db.accounts.put(sAcc);
      }
      for (const sTx of sharedReceivedTxs) {
        await db.transactions.put(sTx);
      }
    }

    if (remoteData.categories) await mergeTable(db.categories, await db.categories.toArray(), remoteData.categories, false, 'categories');
    if (remoteData.debts) await mergeTable(db.debts, await db.debts.toArray(), remoteData.debts, false, 'debts');
    if (remoteData.budgets) await mergeTable(db.budgets, await db.budgets.toArray(), remoteData.budgets, false, 'budgets');
    if (remoteData.recurring) await mergeTable(db.recurring, await db.recurring.toArray(), remoteData.recurring, false, 'recurring');
    if (remoteData.savings && db.savings) await mergeTable(db.savings, await db.savings.toArray(), remoteData.savings, false, 'savings');
    if (remoteData.accumulations && db.accumulations) await mergeTable(db.accumulations, await db.accumulations.toArray(), remoteData.accumulations, false, 'accumulations');
    if (remoteData.assets && db.assets) await mergeTable(db.assets, await db.assets.toArray(), remoteData.assets, false, 'assets');
    if (remoteData.loans && db.loans) await mergeTable(db.loans, await db.loans.toArray(), remoteData.loans, false, 'loans');

    // Cài đặt ứng dụng
    if (remoteData.settings && Array.isArray(remoteData.settings)) {
      for (const rSetting of remoteData.settings) {
        const lSetting = await db.settings.get(rSetting.key);
        const rTime = new Date(rSetting.updatedAt || 0).getTime() || 0;
        const lTime = new Date(lSetting?.updatedAt || 0).getTime() || 0;
        if (!lSetting || rTime >= lTime) {
          if (JSON.stringify(lSetting) !== JSON.stringify(rSetting)) {
            anyDataChanged = true;
            await db.settings.put(rSetting);
          }
        }
      }
    }
    return anyDataChanged;
  }

  // ===========================================================================
  // GRANULAR PER-ITEM SHARING (TÀI KHOẢN, SỔ TIẾT KIỆM, TÍCH LUỸ, VAY, TÀI SẢN)
  // ===========================================================================

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
      console.warn('[ServerSync] Không thể lưu item share key:', e);
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
      console.warn('[ServerSync] Không thể xóa item share key:', e);
    }
  }

  async projectAndPushItem(itemType, itemId, shareKey = null) {
    if (!this.token) throw new Error('Vui lòng kết nối và đăng nhập máy chủ riêng.');

    // 1. Trích xuất item và giao dịch thuộc về item này từ IndexedDB
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

    // 2. Mã hóa bằng Khóa Chia Sẻ (Item Share Key) nếu có hoặc mật khẩu mã hóa sổ của chủ sở hữu
    if (!this.encryptionPassword) {
      shareKey = null;
    } else if (!shareKey) {
      shareKey = (await this.getItemShareKey(`${itemType}_${itemId}`)) || this.encryptionPassword;
    }

    let projectionToSend;
    if (shareKey && window.CryptoService) {
      const encryptedStr = await window.CryptoService.encrypt(JSON.stringify(projectedPayload), shareKey);
      projectionToSend = {
        encrypted: true,
        payload: encryptedStr,
        updatedAt: new Date().toISOString()
      };
      await this.saveItemShareKey(`${itemType}_${itemId}`, shareKey);
    } else {
      projectionToSend = {
        encrypted: false,
        ...projectedPayload,
        updatedAt: new Date().toISOString()
      };
    }

    // 3. Đẩy bản chiếu đã mã hóa lên Server
    const res = await fetch(`${this.serverUrl}/api/shares/item/projection`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vaultId: this.activeVaultId,
        itemType,
        itemId: String(itemId),
        projection: projectionToSend
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Đẩy bản chiếu chia sẻ thất bại.');
    }

    // Ghi nhận vào danh sách các mục mình sở hữu và chia sẻ
    try {
      const ownedShares = (await db.settings.get('syncOwnedSharedProjections')) || { key: 'syncOwnedSharedProjections', value: [] };
      const list = Array.isArray(ownedShares.value) ? ownedShares.value : [];
      if (!list.some(x => x.itemType === itemType && String(x.itemId) === String(itemId))) {
        list.push({ itemType, itemId: String(itemId), shareKey: shareKey || null });
        await db.settings.put({ key: 'syncOwnedSharedProjections', value: list });
      }
    } catch (_) {}

    return { success: true, shareKey };
  }

  async getAvailableServices() {
    try {
      const res = await fetch(`${this.serverUrl}/api/shares/services`);
      if (res.ok) {
        const data = await res.json();
        return data.services || [];
      }
    } catch (e) {
      console.warn('[ServerSync] Không thể lấy danh sách dịch vụ:', e.message);
    }
    return [
      { id: 'server', name: 'Máy Chủ Riêng (Self-Hosted)', status: this.isConnected ? 'connected' : 'not_connected', supported: true, badge: 'Sẵn sàng' },
      { id: 'google-drive', name: 'Google Drive', status: 'available', supported: false, badge: 'Sắp hỗ trợ' },
      { id: 'dropbox', name: 'Dropbox', status: 'available', supported: false, badge: 'Sắp hỗ trợ' }
    ];
  }

  async getItemShares(itemType, itemId) {
    if (!this.token) throw new Error('Vui lòng kết nối và đăng nhập máy chủ riêng.');
    const vParam = this.activeVaultId ? `&vaultId=${encodeURIComponent(this.activeVaultId)}` : '';
    const res = await fetch(`${this.serverUrl}/api/shares/item?itemType=${encodeURIComponent(itemType)}&itemId=${encodeURIComponent(itemId)}${vParam}`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Lấy danh sách chia sẻ thất bại.');
    }
    return res.json();
  }

  async shareItemWithEmail(itemType, itemId, itemName, email, role = 'viewer', password = null) {
    if (!this.token) throw new Error('Vui lòng kết nối và đăng nhập máy chủ riêng.');

    // Chỉ dùng shareKey nếu người dùng đặt mật khẩu riêng HOẶC Sổ đang bật mã hóa E2EE
    let shareKey = password ? password.trim() : null;
    if (!shareKey && this.encryptionPassword) {
      shareKey = (await this.getItemShareKey(`${itemType}_${itemId}`)) || this.encryptionPassword;
    }

    // Tự động bóc tách bản chiếu (chỉ mã hóa nếu có shareKey) trước khi mời email
    await this.projectAndPushItem(itemType, itemId, shareKey);

    const res = await fetch(`${this.serverUrl}/api/shares/item/email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ itemType, itemId, itemName, email, role, shareKey, vaultId: this.activeVaultId })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Cấp quyền chia sẻ thất bại.');
    }
    const result = await res.json();
    if (result.share && result.share.id && shareKey) {
      await this.saveItemShareKey(result.share.id, shareKey);
      result.share.shareKey = shareKey;
    }
    try {
      const owned = (await db.settings.get('syncOwnedSharedProjections')) || { key: 'syncOwnedSharedProjections', value: [] };
      const arr = Array.isArray(owned.value) ? owned.value : [];
      const existing = arr.find(x => x.itemType === itemType && String(x.itemId) === String(itemId));
      if (existing) {
        existing.shareKey = shareKey || null;
      } else {
        arr.push({ itemType, itemId: String(itemId), shareKey: shareKey || null });
      }
      if (!shareKey) {
        await this.deleteItemShareKey(`${itemType}_${itemId}`);
        await this.deleteItemShareKey(itemId);
      }
      await db.settings.put({ key: 'syncOwnedSharedProjections', value: arr });
    } catch (_) {}
    return result;
  }

  async revokeItemEmailShare(shareId) {
    if (!this.token) throw new Error('Vui lòng kết nối và đăng nhập máy chủ riêng.');
    const res = await fetch(`${this.serverUrl}/api/shares/item/email/${shareId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Thu hồi quyền thất bại.');
    }
    return res.json();
  }

  async createItemShareLink(itemType, itemId, itemName, role = 'viewer', customKey = null) {
    if (!this.token) throw new Error('Vui lòng kết nối và đăng nhập máy chủ riêng.');

    // Chỉ dùng shareKey nếu người dùng đặt mật khẩu riêng HOẶC Sổ đang bật mã hóa E2EE
    let shareKey = customKey ? customKey.trim() : null;
    if (!shareKey && this.encryptionPassword) {
      shareKey = (await this.getItemShareKey(`${itemType}_${itemId}`)) || this.encryptionPassword;
    }

    // Tự động bóc tách bản chiếu gửi lên server
    await this.projectAndPushItem(itemType, itemId, shareKey);

    const res = await fetch(`${this.serverUrl}/api/shares/item/link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ itemType, itemId, itemName, role, shareKey, vaultId: this.activeVaultId })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Tạo liên kết chia sẻ thất bại.');
    }
    const result = await res.json();
    if (result.link && result.link.token && shareKey) {
      await this.saveItemShareKey(result.link.token, shareKey);
      result.link.shareKey = shareKey;
    }
    try {
      const owned = (await db.settings.get('syncOwnedSharedProjections')) || { key: 'syncOwnedSharedProjections', value: [] };
      const arr = Array.isArray(owned.value) ? owned.value : [];
      const existing = arr.find(x => x.itemType === itemType && String(x.itemId) === String(itemId));
      if (existing) {
        existing.shareKey = shareKey || null;
      } else {
        arr.push({ itemType, itemId: String(itemId), shareKey: shareKey || null });
      }
      if (!shareKey) {
        await this.deleteItemShareKey(`${itemType}_${itemId}`);
        await this.deleteItemShareKey(itemId);
      }
      await db.settings.put({ key: 'syncOwnedSharedProjections', value: arr });
    } catch (_) {}
    return result;
  }

  async revokeItemShareLink(linkId) {
    if (!this.token) throw new Error('Vui lòng kết nối và đăng nhập máy chủ riêng.');
    const res = await fetch(`${this.serverUrl}/api/shares/item/link/${linkId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Thu hồi liên kết thất bại.');
    }
    return res.json();
  }

  async getShareLinkInfo(token) {
    const res = await fetch(`${this.serverUrl}/api/shares/link/info?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Liên kết không hợp lệ hoặc đã bị thu hồi.');
    }
    return res.json();
  }

  async getShareLinkData(token) {
    const res = await fetch(`${this.serverUrl}/api/shares/link/data?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Không thể tải dữ liệu liên kết chia sẻ.');
    }
    return res.json();
  }

  async acceptShareLink(token) {
    if (!this.token) throw new Error('Vui lòng kết nối máy chủ riêng để nhận tài khoản được chia sẻ.');
    const res = await fetch(`${this.serverUrl}/api/shares/link/accept`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Chấp nhận liên kết thất bại.');
    }
    const result = await res.json();
    if (result) {
      await this.clearLeftSharedItem({
        shareId: result.shareId,
        vaultId: result.vaultId,
        itemType: result.itemType,
        itemId: result.itemId
      });
    }
    return result;
  }

  async getLeftSharedItems() {
    try {
      const setting = await db.settings.get('syncLeftSharedItems');
      const list = (setting && Array.isArray(setting.value)) ? setting.value : [];
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
        list.push({ shareId: sId, vaultId: vId, itemType: itemType || 'account', itemId: iId, localId: lId, leftAt: Date.now() });
        await db.settings.put({ key: 'syncLeftSharedItems', value: list });
      }
    } catch (e) {
      console.warn('[ServerSync] recordLeftSharedItem error:', e);
    }
  }

  async clearLeftSharedItem({ shareId, vaultId, itemType, itemId }) {
    try {
      let list = await this.getLeftSharedItems();
      const sId = shareId ? String(shareId) : null;
      const vId = vaultId ? String(vaultId) : null;
      const iId = itemId ? String(itemId) : null;

      const filtered = list.filter(x => {
        if (sId && x.shareId && x.shareId === sId) return false;
        if (vId && itemType && iId && x.vaultId === vId && x.itemType === itemType && String(x.itemId) === iId) return false;
        return true;
      });

      await db.settings.put({ key: 'syncLeftSharedItems', value: filtered });
    } catch (_) {}
  }

  async leaveReceivedSharedItem({ shareId, vaultId, itemType, itemId }) {
    // 1. Luôn ghi nhận vào danh sách blacklist cục bộ trước
    await this.recordLeftSharedItem({ shareId, vaultId, itemType, itemId });

    // 2. Dọn dẹp key mã hóa nếu có
    try {
      const settings = (await db.settings.get('syncItemShareKeys')) || { key: 'syncItemShareKeys', value: {} };
      const map = settings.value || {};
      if (shareId) delete map[String(shareId)];
      if (itemId) delete map[String(itemId)];
      if (itemType && itemId) delete map[`${itemType}_${itemId}`];
      await db.settings.put({ key: 'syncItemShareKeys', value: map });
    } catch (_) {}

    // 3. Nếu có kết nối server, gửi yêu cầu rời khỏi
    if (this.serverUrl && this.token) {
      try {
        const res = await fetch(`${this.serverUrl}/api/shares/item/leave`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ shareId, vaultId, itemType, itemId })
        });
        if (res.ok) {
          console.log('[ServerSync] Đã xóa tư cách thành viên mục chia sẻ trên máy chủ:', shareId || itemId);
        } else {
          console.warn('[ServerSync] Server phản hồi khi rời khỏi mục chia sẻ:', res.status);
        }
      } catch (err) {
        console.warn('[ServerSync] Không thể kết nối server để rời khỏi mục chia sẻ:', err.message);
      }
    }
  }

  async syncReceivedSharedItems() {
    if (!this.token) return false;
    if (this._isSyncingReceivedSharedItems) return false;
    this._isSyncingReceivedSharedItems = true;
    let hasChanges = false;

    // 0. Đẩy các thay đổi giao dịch từ phía Editor lên server trước khi kéo dữ liệu mới
    try {
      await this.pushAllReceivedSharedItems();
    } catch (pushErr) {
      console.warn('[ServerSync] Lỗi đẩy giao dịch chia sẻ trước khi pull:', pushErr.message);
    }

    try {
      const res = await fetch(`${this.serverUrl}/api/shares/my-received`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      if (!res.ok) return;

      const { items } = await res.json();
      if (!Array.isArray(items)) return;

      const leftItems = await this.getLeftSharedItems();
      const isLeft = (i) => {
        if (!i) return false;
        const targetType = i.itemType || i._itemType || 'account';
        const targetItemId = i.itemId !== undefined ? String(i.itemId) : (i._remoteId !== undefined ? String(i._remoteId) : (i.id !== undefined ? String(i.id) : null));
        const targetLocalId = i.localId !== undefined ? String(i.localId) : (i.id !== undefined ? String(i.id) : null);
        const targetVaultId = i.vaultId ? String(i.vaultId) : (i._remoteVaultId ? String(i._remoteVaultId) : null);
        const targetShareId = i.shareId ? String(i.shareId) : (i._shareId ? String(i._shareId) : null);
        const shareTime = i.updatedAt ? new Date(i.updatedAt).getTime() : (i.createdAt ? new Date(i.createdAt).getTime() : 0);

        return leftItems.some(x => {
          // Nếu share trên server được tạo hoặc cập nhật SAU thời điểm rời khỏi -> Đây là đợt share mới của chủ sở hữu
          if (shareTime && x.leftAt && shareTime > x.leftAt) {
            return false;
          }
          // Nếu shareId cụ thể khác với shareId đã rời -> Lượt share mới độc lập
          if (x.shareId && targetShareId && String(x.shareId) !== targetShareId) {
            return false;
          }

          const sMatch = x.shareId && targetShareId && String(x.shareId) === targetShareId;
          const iMatch = x.itemId && targetItemId && String(x.itemId) === targetItemId;
          const lMatch = x.localId && targetLocalId && String(x.localId) === targetLocalId;
          const vMatch = x.vaultId && targetVaultId && String(x.vaultId) === targetVaultId && (iMatch || lMatch);
          return !!(sMatch || iMatch || lMatch || vMatch);
        });
      };

      const activeReceivedShareIds = new Set(items.filter(i => !isLeft(i)).map(i => String(i.shareId)));
      const activeReceivedItemKeys = new Set(items.filter(i => !isLeft(i)).map(i => `${i.vaultId || ''}_${i.itemType || 'account'}_${i.itemId || ''}`));

      const shouldDeleteItem = (type, item) => {
        if (!item || !item._isSharedItem) return false;
        // 1. Nếu người dùng đã bấm rời khỏi mục này
        if (isLeft({ shareId: item._shareId, vaultId: item._remoteVaultId, itemType: type, itemId: item._remoteId, id: item.id })) {
          return true;
        }
        // 2. Quyền chia sẻ không còn tồn tại trên server (bị xóa, thu hồi, hoặc sổ gốc đã bị xóa)
        const hasShareId = item._shareId !== undefined && item._shareId !== null && String(item._shareId).trim() !== '';
        const sMatch = hasShareId ? activeReceivedShareIds.has(String(item._shareId)) : false;
        const itemKey = `${item._remoteVaultId || ''}_${type}_${item._remoteId || ''}`;
        const kMatch = (item._remoteVaultId && item._remoteId) ? activeReceivedItemKeys.has(itemKey) : false;
        if (!sMatch && !kMatch) {
          return true;
        }
        return false;
      };

      // 1. Xóa các item đã bị thu hồi hoặc đã rời khỏi khỏi local IndexedDB
      const localAccs = await db.accounts.toArray();
      for (const acc of localAccs) {
        if (shouldDeleteItem('account', acc)) {
          console.log('[ServerSync] Quyền chia sẻ đã bị thu hồi hoặc đã rời khỏi, xóa tài khoản:', acc.name);
          hasChanges = true;
          await db.accounts.delete(acc.id);
          if (acc.id !== undefined && !isNaN(Number(acc.id))) {
            await db.accounts.delete(Number(acc.id));
          }
          await db.accounts.delete(String(acc.id));

          // Xóa giao dịch kèm theo
          const relatedTxs = (await db.transactions.toArray()).filter(t =>
            Number(t.accountId) === Number(acc.id) ||
            Number(t.toAccountId) === Number(acc.id) ||
            String(t.accountId) === String(acc.id) ||
            String(t.toAccountId) === String(acc.id) ||
            (acc._shareId && String(t._shareId) === String(acc._shareId))
          );
          for (const tx of relatedTxs) {
            await db.transactions.delete(tx.id);
          }

          if (window.UITransactions && (window.UITransactions.filterAccountId === acc.id || String(window.UITransactions.filterAccountId) === String(acc.id))) {
            window.UITransactions.filterAccountId = null;
            if (typeof window.UITransactions.updateHeaderAccountDisplay === 'function') {
              await window.UITransactions.updateHeaderAccountDisplay();
            }
          }
        }
      }

      if (db.savings) {
        const localSavings = await db.savings.toArray();
        for (const s of localSavings) {
          if (shouldDeleteItem('savings', s)) {
            hasChanges = true;
            await db.savings.delete(s.id);
          }
        }
      }

      if (db.accumulations) {
        const localAccums = await db.accumulations.toArray();
        for (const a of localAccums) {
          if (shouldDeleteItem('accumulation', a)) {
            hasChanges = true;
            await db.accumulations.delete(a.id);
          }
        }
      }

      if (db.loans) {
        const localLoans = await db.loans.toArray();
        for (const l of localLoans) {
          if (shouldDeleteItem('loan', l)) {
            hasChanges = true;
            await db.loans.delete(l.id);
          }
        }
      }

      if (db.assets) {
        const localAssets = await db.assets.toArray();
        for (const ast of localAssets) {
          if (shouldDeleteItem('asset', ast)) {
            hasChanges = true;
            await db.assets.delete(ast.id);
          }
        }
      }

      // 2. Thêm hoặc cập nhật các item được chia sẻ vào local IndexedDB
      for (const shareItem of items) {
        if (isLeft(shareItem)) continue;
        const { itemType, itemId, shareId, role, ownerName, ownerEmail, vaultId } = shareItem;

        let item = shareItem.item;
        let transactions = shareItem.transactions;

        // Xử lý bản chiếu mã hóa E2EE (Zero-Knowledge Item Projection)
        let needsPassword = false;
        let isEncrypted = false;
        if (shareItem.isEncrypted !== undefined) {
          isEncrypted = Boolean(shareItem.isEncrypted);
        } else if (shareItem.isProjection && shareItem.projectionData) {
          isEncrypted = Boolean(shareItem.projectionData.encrypted);
        }

        if (isEncrypted) {
          if (shareItem.shareKey) {
            await this.saveItemShareKey(shareId, shareItem.shareKey);
            await this.saveItemShareKey(itemId, shareItem.shareKey);
            await this.saveItemShareKey(`${itemType}_${itemId}`, shareItem.shareKey);
          }
          const shareKey = shareItem.shareKey || (await this.getItemShareKey(shareId)) || (await this.getItemShareKey(itemId)) || (await this.getItemShareKey(`${itemType}_${itemId}`));
          if (!shareKey) {
            console.warn('[ServerSync] Chưa có khóa giải mã cho mục chia sẻ:', shareItem.itemName);
            needsPassword = true;
          } else if (window.CryptoService) {
            try {
              const payloadToDecrypt = (shareItem.projectionData && shareItem.projectionData.payload) ? shareItem.projectionData.payload : (typeof shareItem.projectionData === 'string' ? shareItem.projectionData : null);
              if (payloadToDecrypt) {
                const decStr = await window.CryptoService.decrypt(payloadToDecrypt, shareKey);
                const decData = JSON.parse(decStr);
                item = decData.item;
                transactions = decData.transactions;
              } else {
                needsPassword = true;
              }
            } catch (decErr) {
              console.error('[ServerSync] Lỗi giải mã mục chia sẻ:', decErr);
              needsPassword = true;
            }
          }
        } else {
          // KHÔNG MÃ HOÁ:
          // Xoá mọi khoá chia sẻ cũ đã lưu trên máy khách
          await this.deleteItemShareKey(shareId);
          await this.deleteItemShareKey(itemId);
          await this.deleteItemShareKey(`${itemType}_${itemId}`);

          if (shareItem.projectionData) {
            item = shareItem.projectionData.item || shareItem.item || item;
            transactions = shareItem.projectionData.transactions || shareItem.transactions || transactions;
          } else {
            item = shareItem.item || item;
            transactions = shareItem.transactions || transactions;
          }

          // Thông báo cho người nhận nếu chủ sổ vừa tắt mã hoá
          let wasEncrypted = false;
          let foundName = shareItem.itemName || '';
          if (itemType === 'account') {
            const allA = await db.accounts.toArray();
            const prevA = allA.find(a => a && a._isSharedItem && (
              (shareId && a._shareId && String(a._shareId) === String(shareId)) ||
              (itemId !== undefined && a._remoteId !== undefined && String(a._remoteId) === String(itemId))
            ));
            if (prevA && (prevA._needsPassword === 1 || prevA._isEncrypted === 1)) {
              wasEncrypted = true;
              foundName = prevA.name || foundName;
            }
          } else if (itemType === 'savings' && db.savings) {
            const allS = await db.savings.toArray();
            const prevS = allS.find(s => s && s._isSharedItem && (
              (shareId && s._shareId && String(s._shareId) === String(shareId)) ||
              (itemId !== undefined && s._remoteId !== undefined && String(s._remoteId) === String(itemId))
            ));
            if (prevS && (prevS._needsPassword === 1 || prevS._isEncrypted === 1)) {
              wasEncrypted = true;
              foundName = prevS.name || foundName;
            }
          } else if (itemType === 'accumulation' && db.accumulations) {
            const allAcc = await db.accumulations.toArray();
            const prevAcc = allAcc.find(a => a && a._isSharedItem && (
              (shareId && a._shareId && String(a._shareId) === String(shareId)) ||
              (itemId !== undefined && a._remoteId !== undefined && String(a._remoteId) === String(itemId))
            ));
            if (prevAcc && (prevAcc._needsPassword === 1 || prevAcc._isEncrypted === 1)) {
              wasEncrypted = true;
              foundName = prevAcc.name || foundName;
            }
          } else if (itemType === 'loan' && db.loans) {
            const allL = await db.loans.toArray();
            const prevL = allL.find(l => l && l._isSharedItem && (
              (shareId && l._shareId && String(l._shareId) === String(shareId)) ||
              (itemId !== undefined && l._remoteId !== undefined && String(l._remoteId) === String(itemId))
            ));
            if (prevL && (prevL._needsPassword === 1 || prevL._isEncrypted === 1)) {
              wasEncrypted = true;
              foundName = prevL.borrowerName || prevL.name || foundName;
            }
          } else if (itemType === 'asset' && db.assets) {
            const allAst = await db.assets.toArray();
            const prevAst = allAst.find(a => a && a._isSharedItem && (
              (shareId && a._shareId && String(a._shareId) === String(shareId)) ||
              (itemId !== undefined && a._remoteId !== undefined && String(a._remoteId) === String(itemId))
            ));
            if (prevAst && (prevAst._needsPassword === 1 || prevAst._isEncrypted === 1)) {
              wasEncrypted = true;
              foundName = prevAst.name || foundName;
            }
          }

          if (wasEncrypted && window.showToast) {
            window.showToast(`Chủ sổ đã tắt mã hoá cho "${foundName || 'mục chia sẻ'}". Mật khẩu đã được gỡ bỏ.`, 'info');
          }
        }

        if (needsPassword) {
          // Đánh dấu _needsPassword và _isEncrypted cho local item để UI hiển thị badge cảnh báo và cho phép nhập mật khẩu
          if (itemType === 'account') {
            const allLocalAccs = await db.accounts.toArray();
            const localAcc = allLocalAccs.find(a => a && a._isSharedItem && (
              (shareId && a._shareId && String(a._shareId) === String(shareId)) ||
              (itemId !== undefined && a._remoteId !== undefined && String(a._remoteId) === String(itemId))
            ));
            if (localAcc) {
              if (!localAcc._needsPassword || !localAcc._isEncrypted) {
                await db.accounts.update(localAcc.id, { _needsPassword: 1, _isEncrypted: 1 });
                hasChanges = true;
              }
            } else {
              await db.accounts.add({
                name: shareItem.itemName || 'Ví được chia sẻ',
                type: 'cash',
                balance: 0,
                isDeleted: 0,
                _isSharedItem: true,
                _isEncrypted: 1,
                _needsPassword: 1,
                _sharedRole: role,
                _shareId: shareId,
                _remoteId: itemId,
                _remoteVaultId: vaultId,
                _sharedFrom: ownerName || ownerEmail
              });
              hasChanges = true;
            }
          } else if (itemType === 'savings' && db.savings) {
            const allSav = await db.savings.toArray();
            const localSav = allSav.find(s => s._isSharedItem && (
              (shareId && s._shareId && String(s._shareId) === String(shareId)) ||
              (itemId !== undefined && s._remoteId !== undefined && String(s._remoteId) === String(itemId))
            ));
            if (localSav && (!localSav._needsPassword || !localSav._isEncrypted)) {
              await db.savings.update(localSav.id, { _needsPassword: 1, _isEncrypted: 1 });
              hasChanges = true;
            } else if (!localSav) {
              await db.savings.add({
                name: shareItem.itemName || 'Sổ tiết kiệm chia sẻ',
                balance: 0,
                status: 'active',
                isDeleted: 0,
                _isSharedItem: true,
                _isEncrypted: 1,
                _needsPassword: 1,
                _sharedRole: role,
                _shareId: shareId,
                _remoteId: itemId,
                _remoteVaultId: vaultId,
                _sharedFrom: ownerName || ownerEmail
              });
              hasChanges = true;
            }
          } else if (itemType === 'accumulation' && db.accumulations) {
            const allAcc = await db.accumulations.toArray();
            const localAcc = allAcc.find(a => a._isSharedItem && (
              (shareId && a._shareId && String(a._shareId) === String(shareId)) ||
              (itemId !== undefined && a._remoteId !== undefined && String(a._remoteId) === String(itemId))
            ));
            if (localAcc && (!localAcc._needsPassword || !localAcc._isEncrypted)) {
              await db.accumulations.update(localAcc.id, { _needsPassword: 1, _isEncrypted: 1 });
              hasChanges = true;
            } else if (!localAcc) {
              await db.accumulations.add({
                name: shareItem.itemName || 'Mục tích luỹ chia sẻ',
                targetAmount: 0,
                currentAmount: 0,
                isDeleted: 0,
                _isSharedItem: true,
                _isEncrypted: 1,
                _needsPassword: 1,
                _sharedRole: role,
                _shareId: shareId,
                _remoteId: itemId,
                _remoteVaultId: vaultId,
                _sharedFrom: ownerName || ownerEmail
              });
              hasChanges = true;
            }
          } else if (itemType === 'loan' && db.loans) {
            const allLoans = await db.loans.toArray();
            const localLoan = allLoans.find(l => l._isSharedItem && (
              (shareId && l._shareId && String(l._shareId) === String(shareId)) ||
              (itemId !== undefined && l._remoteId !== undefined && String(l._remoteId) === String(itemId))
            ));
            if (localLoan && (!localLoan._needsPassword || !localLoan._isEncrypted)) {
              await db.loans.update(localLoan.id, { _needsPassword: 1, _isEncrypted: 1 });
              hasChanges = true;
            } else if (!localLoan) {
              await db.loans.add({
                name: shareItem.itemName || 'Sổ vay chia sẻ',
                loanAmount: 0,
                remainingAmount: 0,
                status: 'active',
                isDeleted: 0,
                _isSharedItem: true,
                _isEncrypted: 1,
                _needsPassword: 1,
                _sharedRole: role,
                _shareId: shareId,
                _remoteId: itemId,
                _remoteVaultId: vaultId,
                _sharedFrom: ownerName || ownerEmail
              });
              hasChanges = true;
            }
          } else if (itemType === 'asset' && db.assets) {
            const allAssets = await db.assets.toArray();
            const localAsset = allAssets.find(a => a._isSharedItem && (
              (shareId && a._shareId && String(a._shareId) === String(shareId)) ||
              (itemId !== undefined && a._remoteId !== undefined && String(a._remoteId) === String(itemId))
            ));
            if (localAsset && (!localAsset._needsPassword || !localAsset._isEncrypted)) {
              await db.assets.update(localAsset.id, { _needsPassword: 1, _isEncrypted: 1 });
              hasChanges = true;
            } else if (!localAsset) {
              await db.assets.add({
                name: shareItem.itemName || 'Tài sản chia sẻ',
                assetType: 'other',
                isDeleted: 0,
                _isSharedItem: true,
                _isEncrypted: 1,
                _needsPassword: 1,
                _sharedRole: role,
                _shareId: shareId,
                _remoteId: itemId,
                _remoteVaultId: vaultId,
                _sharedFrom: ownerName || ownerEmail
              });
              hasChanges = true;
            }
          }
          continue;
        }

        if (!item) continue;

        // Xóa mục này khỏi blacklist để luôn sẵn sàng nhận chia sẻ mới
        await this.clearLeftSharedItem({ shareId, vaultId, itemType, itemId });

        if (itemType === 'account') {
          // Chỉ tìm tài khoản chia sẻ tương ứng theo _shareId hoặc _remoteId (không bao giờ đè tài khoản cá nhân)
          const allLocalAccs = await db.accounts.toArray();
          const isMatch = (a) => a && a._isSharedItem && (
            (shareId && a._shareId && String(a._shareId) === String(shareId)) ||
            (itemId !== undefined && a._remoteId !== undefined && String(a._remoteId) === String(itemId) &&
             (!vaultId || !a._remoteVaultId || String(a._remoteVaultId) === String(vaultId)))
          );
          const matchingAccs = allLocalAccs.filter(isMatch);
          let localAcc = matchingAccs[0] || null;

          // Tự động dọn dẹp các tài khoản chia sẻ trùng lặp nếu có từ trước
          if (matchingAccs.length > 1) {
            for (let k = 1; k < matchingAccs.length; k++) {
              console.log('[ServerSync] Dọn dẹp tài khoản chia sẻ trùng lặp:', matchingAccs[k].name, matchingAccs[k].id);
              await db.accounts.delete(matchingAccs[k].id);
              const dupTxs = (await db.transactions.toArray()).filter(t =>
                Number(t.accountId) === Number(matchingAccs[k].id) || Number(t.toAccountId) === Number(matchingAccs[k].id)
              );
              for (const dt of dupTxs) {
                await db.transactions.delete(dt.id);
              }
              hasChanges = true;
            }
          }

          // Dọn dẹp cả bản sao cùng tên nếu có từ trước
          const sameNameDups = allLocalAccs.filter(a =>
            a && a._isSharedItem && a.id !== (localAcc ? localAcc.id : null) &&
            (a.name || '').trim().toLowerCase() === (item.name || '').trim().toLowerCase() &&
            (String(a._remoteId || '') === String(itemId || '') || (a._sharedFrom && a._sharedFrom === (ownerName || ownerEmail)))
          );
          for (const dup of sameNameDups) {
            console.log('[ServerSync] Dọn dẹp bản sao tài khoản chia sẻ cùng tên:', dup.name, dup.id);
            await db.accounts.delete(dup.id);
            const dupTxs = (await db.transactions.toArray()).filter(t =>
              Number(t.accountId) === Number(dup.id) || Number(t.toAccountId) === Number(dup.id)
            );
            for (const dt of dupTxs) {
              await db.transactions.delete(dt.id);
            }
            hasChanges = true;
          }

          const accData = {
            ...item,
            isDeleted: 0,
            isArchived: item.isArchived ? 1 : 0,
            _isEncrypted: isEncrypted ? 1 : 0,
            _needsPassword: 0,
            includeInReport: localAcc && localAcc.includeInReport !== undefined ? localAcc.includeInReport : 0,
            includeInBudget: localAcc && localAcc.includeInBudget !== undefined ? localAcc.includeInBudget : 0,
            order: localAcc && localAcc.order !== undefined ? localAcc.order : (item.order !== undefined ? item.order : 999),
            _isSharedItem: true,
            _sharedRole: role,
            _shareId: shareId,
            _remoteId: itemId,
            _remoteVaultId: vaultId,
            _sharedFrom: ownerName || ownerEmail
          };

          let localAccId;
          if (localAcc) {
            localAccId = localAcc.id;
            const isDiff = localAcc._needsPassword === 1 ||
                           localAcc._isEncrypted !== accData._isEncrypted ||
                           (localAcc.name || '').trim() !== (accData.name || '').trim() ||
                           Number(localAcc.balance || 0) !== Number(accData.balance || 0) ||
                           (localAcc.type || '') !== (accData.type || '') ||
                           (localAcc.icon || '') !== (accData.icon || '') ||
                           (localAcc.color || '') !== (accData.color || '') ||
                           (localAcc.currency || 'VND') !== (accData.currency || 'VND') ||
                           (localAcc.description || '').trim() !== (accData.description || '').trim() ||
                           Boolean(localAcc.isArchived) !== Boolean(accData.isArchived) ||
                           (localAcc._sharedRole || '') !== (accData._sharedRole || '') ||
                           (localAcc._sharedFrom || '') !== (accData._sharedFrom || '') ||
                           (localAcc._shareId || '') !== (accData._shareId || '');
            if (isDiff) {
              hasChanges = true;
              await db.accounts.update(localAccId, { ...accData, id: localAccId, _needsPassword: 0, _isEncrypted: isEncrypted ? 1 : 0 });
            }
          } else {
            delete accData.id;
            hasChanges = true;
            localAccId = await db.accounts.add(accData);
          }

          // Cập nhật giao dịch cho tài khoản này
          if (Array.isArray(transactions)) {
            // Danh mục dùng để map tên, icon, màu nếu giao dịch thiếu
            const incCatMap = new Map();
            if (Array.isArray(shareItem.categories)) {
              for (const c of shareItem.categories) {
                if (c && c.id) incCatMap.set(String(c.id), c);
              }
            }

            // 1. Loại bỏ trùng lặp từ danh sách server trả về
            const uniqueIncomingTxs = [];
            const seenIncomingSigs = new Set();
            for (const tx of transactions) {
              if (!tx) continue;
              const txDate = String(tx.date || '').slice(0, 10);
              const txTime = String(tx.time || '').slice(0, 5);
              const txAmt = Math.round(Number(tx.amount || 0) * 100) / 100;
              const txNote = (tx.note || '').trim().toLowerCase();
              const txSig = `${tx.id || ''}_${tx.type || ''}_${txDate}_${txTime}_${txAmt}_${txNote}`;
              if (!seenIncomingSigs.has(txSig)) {
                seenIncomingSigs.add(txSig);
                uniqueIncomingTxs.push(tx);
              }
            }

            const incomingRemoteTxIds = new Set(uniqueIncomingTxs.filter(t => !t.isDeleted).map(t => String(t.id)));

            // 2. Lấy tất cả giao dịch cục bộ thuộc tài khoản chia sẻ này
            const existingSharedTxs = (await db.transactions.toArray()).filter(t =>
              t._shareId === shareId || Number(t.accountId) === localAccId || (localAcc && localAcc._remoteId && String(t._remoteId) === String(localAcc._remoteId))
            );

            // 3. TỰ ĐỘNG DỌN DẸP TOÀN BỘ GIAO DỊCH TRÙNG LẶP CỤC BỘ TRONG INDEXEDDB
            const localSeenSigs = new Map();
            for (const oldTx of existingSharedTxs) {
              const oldDate = String(oldTx.date || '').slice(0, 10);
              const oldTime = String(oldTx.time || '').slice(0, 5);
              const oldAmt = Math.round(Number(oldTx.amount || 0) * 100) / 100;
              const oldNote = (oldTx.note || '').trim().toLowerCase();
              const sig = `${oldTx._remoteTxId || ''}_${oldTx.type || ''}_${oldDate}_${oldTime}_${oldAmt}_${oldNote}`;
              const fallbackSig = `${oldTx.type || ''}_${oldDate}_${oldTime}_${oldAmt}_${oldNote}`;
              
              if (localSeenSigs.has(sig) || (fallbackSig && localSeenSigs.has(fallbackSig))) {
                console.log('[ServerSync] Phát hiện và xóa giao dịch trùng lặp trong IndexedDB:', oldTx.id, sig);
                await db.transactions.delete(oldTx.id);
                hasChanges = true;
              } else {
                localSeenSigs.set(sig, oldTx);
                if (fallbackSig) localSeenSigs.set(fallbackSig, oldTx);
              }
            }

            // Lấy lại danh sách sau khi đã loại bỏ triệt để trùng lặp nội bộ
            const remainingLocalTxs = (await db.transactions.toArray()).filter(t =>
              t._shareId === shareId || Number(t.accountId) === localAccId
            );

            // 4. Xóa các giao dịch cục bộ nếu trên server đã bị xóa (bảo toàn tuyệt đối giao dịch của thành viên)
            for (const oldTx of remainingLocalTxs) {
              const remoteId = oldTx._remoteTxId;
              // TUYỆT ĐỐI KHÔNG XÓA giao dịch mới do thành viên này tạo (recordedByOther === 1 hoặc chưa có remoteId)
              if (!remoteId || oldTx.recordedByOther === 1) {
                continue;
              }
              if (!incomingRemoteTxIds.has(String(remoteId))) {
                hasChanges = true;
                await db.transactions.delete(oldTx.id);
              }
            }

            // 5. Thêm hoặc cập nhật các giao dịch từ server
            for (const tx of uniqueIncomingTxs) {
              if (tx.isDeleted) {
                const localTx = remainingLocalTxs.find(t => String(t._remoteTxId || t.id) === String(tx.id));
                if (localTx) {
                  hasChanges = true;
                  await db.transactions.delete(localTx.id);
                }
                continue;
              }

              const txRemoteId = tx.id;
              let localTx = remainingLocalTxs.find(t => String(t._remoteTxId || t.id) === String(txRemoteId));
              if (!localTx) {
                // Khớp dự phòng theo đặc trưng nếu ID khác nhau
                localTx = remainingLocalTxs.find(t =>
                  t.type === tx.type &&
                  String(t.date || '').slice(0, 10) === String(tx.date || '').slice(0, 10) &&
                  (!t.time || !tx.time || String(t.time || '').slice(0, 5) === String(tx.time || '').slice(0, 5)) &&
                  Math.abs(Number(t.amount || 0) - Number(tx.amount || 0)) < 0.01 &&
                  (t.note || '').trim().toLowerCase() === (tx.note || '').trim().toLowerCase()
                );
              }

              let catName = tx.categoryName || '';
              let catIcon = tx.categoryIcon || '';
              let catColor = tx.categoryColor || '';
              if (!catName && tx.categoryId) {
                const c = incCatMap.get(String(tx.categoryId));
                if (c) {
                  catName = c.name || '';
                  catIcon = c.icon || '';
                  catColor = c.color || '';
                }
              }

              const txData = {
                ...tx,
                accountId: localAccId,
                isDeleted: 0,
                _isSharedItem: true,
                _shareId: shareId,
                _remoteTxId: txRemoteId,
                categoryName: catName,
                categoryIcon: catIcon,
                categoryColor: catColor,
                recordedByOther: tx.recordedByOther !== undefined ? tx.recordedByOther : 0,
                createdBy: tx.createdBy || (tx.recordedByOther ? 'Thành viên' : (ownerName || ownerEmail || 'Chủ sổ')),
                createdByEmail: tx.createdByEmail || (tx.recordedByOther ? '' : (ownerEmail || ''))
              };

              if (localTx) {
                const rTime = new Date(txData.updatedAt || 0).getTime() || 0;
                const lTime = new Date(localTx.updatedAt || 0).getTime() || 0;
                // Nếu local đã đánh dấu xóa và server chưa xóa mà timestamp local mới hơn / bằng: KHÔNG ghi đè phục hồi
                if (localTx.isDeleted && !txData.isDeleted && lTime >= rTime) {
                  continue;
                }
                const isTxDiff = Number(localTx.amount || 0) !== Number(txData.amount || 0) ||
                                 (localTx.type || '') !== (txData.type || '') ||
                                 (localTx.category || '') !== (txData.category || '') ||
                                 (localTx.categoryName || '') !== (txData.categoryName || '') ||
                                 (localTx.categoryIcon || '') !== (txData.categoryIcon || '') ||
                                 (localTx.categoryColor || '') !== (txData.categoryColor || '') ||
                                 (localTx.date || '') !== (txData.date || '') ||
                                 String(localTx.time || '').slice(0, 5) !== String(txData.time || '').slice(0, 5) ||
                                 (localTx.note || '').trim().toLowerCase() !== (txData.note || '').trim().toLowerCase() ||
                                 (localTx.createdBy || '') !== (txData.createdBy || '') ||
                                 localTx.recordedByOther !== txData.recordedByOther ||
                                 Boolean(localTx.isDeleted) !== Boolean(txData.isDeleted);
                if (isTxDiff && (rTime >= lTime || !localTx.updatedAt)) {
                  hasChanges = true;
                  await db.transactions.update(localTx.id, { ...txData, id: localTx.id });
                } else if (localTx._remoteTxId !== txRemoteId) {
                  await db.transactions.update(localTx.id, { _remoteTxId: txRemoteId });
                }
              } else {
                delete txData.id;
                hasChanges = true;
                const newAddedId = await db.transactions.add(txData);
                remainingLocalTxs.push({ ...txData, id: newAddedId });
              }
            }
          }
        } else if (itemType === 'savings' && db.savings) {
          const allSav = await db.savings.toArray();
          const matchSav = allSav.filter(s => s._isSharedItem && (
            (shareId && s._shareId && String(s._shareId) === String(shareId)) ||
            (itemId !== undefined && s._remoteId !== undefined && String(s._remoteId) === String(itemId))
          ));
          let localSav = matchSav[0] || null;
          if (matchSav.length > 1) {
            for (let k = 1; k < matchSav.length; k++) {
              await db.savings.delete(matchSav[k].id);
              hasChanges = true;
            }
          }
          const savData = {
            ...item,
            isDeleted: 0,
            _isEncrypted: isEncrypted ? 1 : 0,
            _needsPassword: 0,
            includeInReport: localSav && localSav.includeInReport !== undefined ? localSav.includeInReport : 0,
            _isSharedItem: true,
            _sharedRole: role,
            _shareId: shareId,
            _remoteId: itemId,
            _remoteVaultId: vaultId,
            _sharedFrom: ownerName || ownerEmail
          };
          if (localSav) {
            const isDiff = localSav._needsPassword === 1 ||
                           localSav._isEncrypted !== savData._isEncrypted ||
                           localSav.name !== savData.name ||
                           Number(localSav.balance || localSav.depositAmount || 0) !== Number(savData.balance || savData.depositAmount || 0) ||
                           localSav.status !== savData.status ||
                           localSav.interestRate !== savData.interestRate ||
                           localSav._sharedRole !== savData._sharedRole;
            if (isDiff) {
              hasChanges = true;
              await db.savings.update(localSav.id, { ...savData, id: localSav.id, _needsPassword: 0, _isEncrypted: isEncrypted ? 1 : 0 });
            }
          } else {
            delete savData.id;
            hasChanges = true;
            await db.savings.add(savData);
          }
        } else if (itemType === 'accumulation' && db.accumulations) {
          const allAcc = await db.accumulations.toArray();
          const matchAcc = allAcc.filter(a => a._isSharedItem && (
            (shareId && a._shareId && String(a._shareId) === String(shareId)) ||
            (itemId !== undefined && a._remoteId !== undefined && String(a._remoteId) === String(itemId))
          ));
          let localAcc = matchAcc[0] || null;
          if (matchAcc.length > 1) {
            for (let k = 1; k < matchAcc.length; k++) {
              await db.accumulations.delete(matchAcc[k].id);
              hasChanges = true;
            }
          }
          const accData = {
            ...item,
            isDeleted: 0,
            _isEncrypted: isEncrypted ? 1 : 0,
            _needsPassword: 0,
            includeInReport: localAcc && localAcc.includeInReport !== undefined ? localAcc.includeInReport : 0,
            _isSharedItem: true,
            _sharedRole: role,
            _shareId: shareId,
            _remoteId: itemId,
            _remoteVaultId: vaultId,
            _sharedFrom: ownerName || ownerEmail
          };
          if (localAcc) {
            const isDiff = localAcc._needsPassword === 1 ||
                           localAcc._isEncrypted !== accData._isEncrypted ||
                           localAcc.name !== accData.name ||
                           Number(localAcc.currentAmount || 0) !== Number(accData.currentAmount || 0) ||
                           Number(localAcc.targetAmount || 0) !== Number(accData.targetAmount || 0) ||
                           localAcc._sharedRole !== accData._sharedRole;
            if (isDiff) {
              hasChanges = true;
              await db.accumulations.update(localAcc.id, { ...accData, id: localAcc.id, _needsPassword: 0, _isEncrypted: isEncrypted ? 1 : 0 });
            }
          } else {
            delete accData.id;
            hasChanges = true;
            await db.accumulations.add(accData);
          }
        } else if (itemType === 'loan' && db.loans) {
          const allLoans = await db.loans.toArray();
          const matchLoans = allLoans.filter(l => l._isSharedItem && (
            (shareId && l._shareId && String(l._shareId) === String(shareId)) ||
            (itemId !== undefined && l._remoteId !== undefined && String(l._remoteId) === String(itemId))
          ));
          let localLoan = matchLoans[0] || null;
          if (matchLoans.length > 1) {
            for (let k = 1; k < matchLoans.length; k++) {
              await db.loans.delete(matchLoans[k].id);
              hasChanges = true;
            }
          }
          const loanData = {
            ...item,
            isDeleted: 0,
            _isEncrypted: isEncrypted ? 1 : 0,
            _needsPassword: 0,
            includeInReport: localLoan && localLoan.includeInReport !== undefined ? localLoan.includeInReport : 0,
            _isSharedItem: true,
            _sharedRole: role,
            _shareId: shareId,
            _remoteId: itemId,
            _remoteVaultId: vaultId,
            _sharedFrom: ownerName || ownerEmail
          };
          if (localLoan) {
            const isDiff = localLoan._needsPassword === 1 ||
                           localLoan._isEncrypted !== loanData._isEncrypted ||
                           localLoan.borrowerName !== loanData.borrowerName ||
                           Number(localLoan.remainingAmount !== undefined ? localLoan.remainingAmount : (localLoan.loanAmount || 0)) !== Number(loanData.remainingAmount !== undefined ? loanData.remainingAmount : (loanData.loanAmount || 0)) ||
                           localLoan.status !== loanData.status ||
                           localLoan._sharedRole !== loanData._sharedRole;
            if (isDiff) {
              hasChanges = true;
              await db.loans.update(localLoan.id, { ...loanData, id: localLoan.id, _needsPassword: 0, _isEncrypted: isEncrypted ? 1 : 0 });
            }
          } else {
            delete loanData.id;
            hasChanges = true;
            await db.loans.add(loanData);
          }
        } else if (itemType === 'asset' && db.assets) {
          const allAssets = await db.assets.toArray();
          const matchAssets = allAssets.filter(a => a._isSharedItem && (
            (shareId && a._shareId && String(a._shareId) === String(shareId)) ||
            (itemId !== undefined && a._remoteId !== undefined && String(a._remoteId) === String(itemId))
          ));
          let localAsset = matchAssets[0] || null;
          if (matchAssets.length > 1) {
            for (let k = 1; k < matchAssets.length; k++) {
              await db.assets.delete(matchAssets[k].id);
              hasChanges = true;
            }
          }
          const assetData = {
            ...item,
            isDeleted: 0,
            _isEncrypted: isEncrypted ? 1 : 0,
            _needsPassword: 0,
            includeInReport: localAsset && localAsset.includeInReport !== undefined ? localAsset.includeInReport : 0,
            _isSharedItem: true,
            _sharedRole: role,
            _shareId: shareId,
            _remoteId: itemId,
            _remoteVaultId: vaultId,
            _sharedFrom: ownerName || ownerEmail
          };
          if (localAsset) {
            const isDiff = localAsset._needsPassword === 1 ||
                           localAsset._isEncrypted !== assetData._isEncrypted ||
                           localAsset.name !== assetData.name ||
                           Number(localAsset.quantity || 0) !== Number(assetData.quantity || 0) ||
                           Number(localAsset.currentPrice || 0) !== Number(assetData.currentPrice || 0) ||
                           localAsset.status !== assetData.status ||
                           localAsset._sharedRole !== assetData._sharedRole;
            if (isDiff) {
              hasChanges = true;
              await db.assets.update(localAsset.id, { ...assetData, id: localAsset.id, _needsPassword: 0, _isEncrypted: isEncrypted ? 1 : 0 });
            }
          } else {
            delete assetData.id;
            hasChanges = true;
            await db.assets.add(assetData);
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
        window.dispatchEvent(new CustomEvent('shared-items-updated', { detail: { count: items.length } }));
      }
      return hasChanges;
    } catch (err) {
      console.warn('[ServerSync] Lỗi tải các mục được chia sẻ:', err.message);
      return false;
    } finally {
      this._isSyncingReceivedSharedItems = false;
    }
  }

  async pushReceivedSharedItemTransactions(shareId) {
    if (!this.token || !this.serverUrl) return false;

    try {
      const localAcc = (await db.accounts.toArray()).find(a => a._isSharedItem && a._shareId === shareId);
      if (!localAcc) return false;
      if (localAcc._sharedRole !== 'editor') return false;
      if (localAcc._needsPassword) {
        // Tài khoản đang cần mật khẩu mã hoá, tạm dừng đẩy để không ghi đè dữ liệu lỗi
        return false;
      }

      const localAccId = Number(localAcc.id);
      const remoteItemId = Number(localAcc._remoteId);

      const allTxs = await db.transactions.toArray();
      const rawLocalTxs = allTxs.filter(t => Number(t.accountId) === localAccId || Number(t.toAccountId) === localAccId || t._shareId === shareId);

      if (rawLocalTxs.length === 0) return true;

      // Loại bỏ trùng lặp trước khi gửi
      const localTxs = [];
      const seenPushSigs = new Set();
      for (const t of rawLocalTxs) {
        if (!t) continue;
        const sig = `${t.type}_${String(t.date || '').slice(0, 10)}_${String(t.time || '').slice(0, 5)}_${Math.round(Number(t.amount || 0) * 100) / 100}_${(t.note || '').trim().toLowerCase()}`;
        if (!seenPushSigs.has(sig)) {
          seenPushSigs.add(sig);
          localTxs.push(t);
        }
      }

      const uProfile = this.userProfile || window.googleDriveService?.userProfile || window.dropboxService?.userProfile;
      const uName = (uProfile?.name && uProfile.name.trim()) || (uProfile?.email && uProfile.email.trim()) || '';
      const uEmail = uProfile?.email || '';

      const localCategories = await db.categories.toArray();
      const localCatMap = new Map();
      for (const c of localCategories) {
        if (c && c.id) localCatMap.set(String(c.id), c);
      }

      const mappedTxs = localTxs.map(t => {
        const copy = { ...t };
        copy.id = copy._remoteTxId || copy.id;
        if (Number(copy.accountId) === localAccId) {
          copy.accountId = remoteItemId;
        }
        if (copy.toAccountId && Number(copy.toAccountId) === localAccId) {
          copy.toAccountId = remoteItemId;
        }
        copy.isDeleted = copy.isDeleted ? 1 : 0;
        // Chỉ gán recordedByOther và createdBy cho giao dịch do thành viên này tạo (không ghi đè giao dịch của chủ sổ)
        if (copy.recordedByOther === 1 || !copy.createdBy) {
          copy.recordedByOther = 1;
          if (!copy.createdBy && uName) {
            copy.createdBy = uName;
            copy.createdByEmail = uEmail;
          }
        }
        if (copy.categoryId && !copy.categoryName) {
          const c = localCatMap.get(String(copy.categoryId));
          if (c) {
            copy.categoryName = c.name;
            copy.categoryIcon = c.icon;
            copy.categoryColor = c.color;
          }
        }
        delete copy._isSharedItem;
        delete copy._shareId;
        delete copy._remoteTxId;
        delete copy._remoteId;
        return copy;
      });

      const shareKey = (await this.getItemShareKey(shareId)) ||
                       (await this.getItemShareKey(remoteItemId)) ||
                       (await this.getItemShareKey(`account_${remoteItemId}`));

      const cleanItem = { ...localAcc };
      delete cleanItem._isSharedItem;
      delete cleanItem._sharedRole;
      delete cleanItem._shareId;
      delete cleanItem._remoteId;
      delete cleanItem._remoteVaultId;
      delete cleanItem._sharedFrom;
      delete cleanItem.includeInReport;
      delete cleanItem.includeInBudget;
      cleanItem.id = remoteItemId;

      // Fingerprint kiểm tra dữ liệu thay đổi thực tế trước khi gửi lên server
      const currentFingerprint = JSON.stringify({
        balance: cleanItem.balance,
        name: cleanItem.name,
        txs: mappedTxs.map(t => `${t.id}_${t.amount}_${t.type}_${t.category}_${t.date}_${(t.note || '').trim()}_${t.isDeleted ? 1 : 0}`)
      });
      if (!this._lastPushedSharedFingerprints) this._lastPushedSharedFingerprints = {};
      if (this._lastPushedSharedFingerprints[shareId] === currentFingerprint) {
        return false;
      }

      const categories = await db.categories.toArray();

      const projectedPayload = {
        item: cleanItem,
        transactions: mappedTxs,
        categories,
        projectedAt: new Date().toISOString()
      };

      let projectionToSend = null;
      if (shareKey && window.CryptoService) {
        const encStr = await window.CryptoService.encrypt(JSON.stringify(projectedPayload), shareKey);
        projectionToSend = {
          encrypted: true,
          payload: encStr,
          updatedAt: new Date().toISOString()
        };
      } else {
        projectionToSend = {
          encrypted: false,
          ...projectedPayload,
          updatedAt: new Date().toISOString()
        };
      }

      const res = await fetch(`${this.serverUrl}/api/shares/received/sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shareId,
          transactions: mappedTxs,
          projection: projectionToSend
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi đẩy giao dịch chia sẻ');
      }

      this._lastPushedSharedFingerprints[shareId] = currentFingerprint;

      for (const t of localTxs) {
        const updates = {};
        if (!t._remoteTxId) {
          updates._remoteTxId = t.id;
          updates._shareId = shareId;
          updates._isSharedItem = true;
        }
        // Chỉ cập nhật nếu là giao dịch do thành viên này tạo (recordedByOther === 1) mà chưa có tên
        if (t.recordedByOther === 1 && !t.createdBy && uName) {
          updates.createdBy = uName;
          updates.createdByEmail = uEmail;
        }
        if (Object.keys(updates).length > 0) {
          await db.transactions.update(t.id, updates);
        }
      }

      return true;
    } catch (err) {
      console.warn('[ServerSync] pushReceivedSharedItemTransactions error:', err.message);
      return false;
    }
  }

  async pushAllReceivedSharedItems() {
    if (!this.token || !this.serverUrl) return false;
    if (this._isPushingReceivedSharedItems) return false;
    this._isPushingReceivedSharedItems = true;
    try {
      const sharedAccounts = (await db.accounts.toArray()).filter(a => a._isSharedItem && a._sharedRole === 'editor' && a._shareId);
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

  async auditOwnedShares() {
    if (!this.token || !this.serverUrl) return false;
    let changed = false;
    try {
      const personalAccs = (await db.accounts.toArray()).filter(a => !a._isSharedItem && (!a.isDeleted || a.isDeleted === 0));
      if (personalAccs.length === 0) return false;

      const ownedSetting = await db.settings.get('syncOwnedSharedProjections');
      let ownedList = (ownedSetting && Array.isArray(ownedSetting.value)) ? [...ownedSetting.value] : [];

      for (const acc of personalAccs) {
        try {
          const res = await this.getItemShares('account', acc.id);
          if (res && Array.isArray(res.shares) && Array.isArray(res.links)) {
            const hasShares = res.shares.length > 0 || res.links.length > 0;
            if (hasShares) {
              if (!acc.isShared) {
                await db.accounts.update(acc.id, { isShared: 1, updatedAt: Date.now() });
                acc.isShared = 1;
                changed = true;
              }
              if (!ownedList.some(x => x.itemType === 'account' && String(x.itemId) === String(acc.id) && (!x.service || x.service === 'server'))) {
                ownedList.push({ itemType: 'account', itemId: String(acc.id), service: 'server' });
                changed = true;
              }
            } else if (acc.isShared) {
              const sharedViaOther = ownedList.some(x => x.itemType === 'account' && String(x.itemId) === String(acc.id) && x.service === 'google-drive');
              ownedList = ownedList.filter(x => !(x.itemType === 'account' && String(x.itemId) === String(acc.id) && (!x.service || x.service === 'server')));
              if (!sharedViaOther) {
                await db.accounts.update(acc.id, { isShared: 0, updatedAt: Date.now() });
                acc.isShared = 0;
                console.log(`[ServerSync] Tự động xóa cờ chia sẻ cho tài khoản không có người nhận: "${acc.name}"`);
              }
              changed = true;
            }
          }
        } catch (_) {
          // Lỗi mạng hoặc server không phản hồi -> giữ nguyên trạng thái cục bộ
        }
      }

      if (changed) {
        await db.settings.put({ key: 'syncOwnedSharedProjections', value: ownedList });
        window.dispatchEvent(new CustomEvent('shared-items-updated'));
        if (window.UIAccounts && typeof window.UIAccounts.render === 'function') {
          await window.UIAccounts.render();
        }
        if (window.UITransactions && typeof window.UITransactions.updateHeaderAccountDisplay === 'function') {
          await window.UITransactions.updateHeaderAccountDisplay();
        }
      }
    } catch (err) {
      console.warn('[ServerSync] auditOwnedShares error:', err);
    }
    return changed;
  }

  async pullAndMergeOwnedSharedProjections() {
    if (!this.token || !this.serverUrl) return false;
    let hasChanges = false;

    try {
      const audited = await this.auditOwnedShares();
      if (audited) hasChanges = true;

      const ownedSetting = await db.settings.get('syncOwnedSharedProjections');
      const ownedList = (ownedSetting && Array.isArray(ownedSetting.value)) ? [...ownedSetting.value] : [];

      if (ownedList.length === 0) return hasChanges;

      for (const share of ownedList) {
        if (share.service && share.service !== 'server') continue;
        const { itemType, itemId } = share;
        const currentKey = share.shareKey || (await this.getItemShareKey(`${itemType}_${itemId}`));
        const vaultParam = this.activeVaultId ? `&vaultId=${encodeURIComponent(this.activeVaultId)}` : '';

        const res = await fetch(`${this.serverUrl}/api/shares/item/projection?itemType=${encodeURIComponent(itemType)}&itemId=${encodeURIComponent(itemId)}${vaultParam}`, {
          headers: { Authorization: `Bearer ${this.token}` }
        });
        if (!res.ok) continue;

        const resData = await res.json();
        let proj = resData.projection;
        if (!proj) continue;

        if (proj.encrypted && proj.payload) {
          if (!currentKey || !window.CryptoService) continue;
          try {
            const decStr = await window.CryptoService.decrypt(proj.payload, currentKey);
            proj = JSON.parse(decStr);
          } catch (decErr) {
            console.warn('[ServerSync] Lỗi giải mã bản chiếu mục chia sẻ của chủ:', decErr.message);
            continue;
          }
        }

        const remoteTxs = Array.isArray(proj.transactions) ? proj.transactions : [];
        if (itemType === 'account' && remoteTxs.length > 0) {
          const accId = Number(itemId);
          const localTxs = (await db.transactions.toArray()).filter(t => !t._isSharedItem && (Number(t.accountId) === accId || Number(t.toAccountId) === accId));
          const localMap = new Map();
          for (const lt of localTxs) {
            localMap.set(String(lt.id), lt);
          }

          for (const rtx of remoteTxs) {
            const rIdStr = String(rtx.id);
            let existing = localMap.get(rIdStr);

            // Khớp dự phòng theo signature nếu không khớp ID
            if (!existing) {
              for (const lt of localTxs) {
                const sameType = lt.type === rtx.type;
                const sameDate = String(lt.date || '').slice(0, 10) === String(rtx.date || '').slice(0, 10);
                const sameTime = !lt.time || !rtx.time || String(lt.time || '').slice(0, 5) === String(rtx.time || '').slice(0, 5);
                const sameAmount = Math.abs(Number(lt.amount || 0) - Number(rtx.amount || 0)) < 0.01;
                const sameNote = (lt.note || '').trim().toLowerCase() === (rtx.note || '').trim().toLowerCase();
                if (sameType && sameDate && sameTime && sameAmount && sameNote) {
                  existing = lt;
                  break;
                }
              }
            }

            if (rtx.isDeleted) {
              if (existing && !existing.isDeleted) {
                await db.transactions.update(existing.id, { isDeleted: 1, updatedAt: rtx.updatedAt || Date.now() });
                hasChanges = true;
              }
              continue;
            }

            if (!existing) {
              let targetId = Number(rtx.id);
              if (targetId) {
                const dup = await db.transactions.get(targetId);
                if (dup) {
                  targetId = typeof generateUniqueId === 'function' ? generateUniqueId() : Date.now();
                }
              } else {
                targetId = typeof generateUniqueId === 'function' ? generateUniqueId() : Date.now();
              }
              const newTx = {
                ...rtx,
                id: targetId,
                accountId: accId,
                isDeleted: 0,
                updatedAt: rtx.updatedAt || Date.now(),
                recordedByOther: rtx.recordedByOther !== undefined ? rtx.recordedByOther : 1,
                createdBy: rtx.createdBy || rtx.updatedBy || 'Thành viên',
                createdByEmail: rtx.createdByEmail || ''
              };
              delete newTx._isSharedItem;
              delete newTx._shareId;
              delete newTx._remoteTxId;
              delete newTx._remoteId;
              await db.transactions.add(newTx);
              hasChanges = true;
            } else {
              const rTime = new Date(rtx.updatedAt || 0).getTime() || 0;
              const lTime = new Date(existing.updatedAt || 0).getTime() || 0;
              // Nếu local đã xóa và remote chưa cập nhật (hoặc timestamp local mới hơn / bằng): giữ nguyên xóa
              if (existing.isDeleted && !rtx.isDeleted && lTime >= rTime) {
                continue;
              }
              const isDiff = Number(existing.amount || 0) !== Number(rtx.amount || 0) ||
                             (existing.type || '') !== (rtx.type || '') ||
                             (existing.category || '') !== (rtx.category || '') ||
                             (existing.date || '') !== (rtx.date || '') ||
                             (existing.time || '') !== (rtx.time || '') ||
                             (existing.note || '').trim() !== (rtx.note || '').trim() ||
                             Boolean(existing.isDeleted) !== Boolean(rtx.isDeleted);
              if (isDiff && (rTime > lTime || !existing.updatedAt)) {
                await db.transactions.update(existing.id, {
                  ...rtx,
                  id: existing.id,
                  accountId: accId,
                  isDeleted: rtx.isDeleted ? 1 : 0,
                  updatedAt: rtx.updatedAt || Date.now(),
                  recordedByOther: existing.recordedByOther !== undefined ? existing.recordedByOther : (rtx.recordedByOther !== undefined ? rtx.recordedByOther : 0),
                  createdBy: existing.createdBy || rtx.createdBy || '',
                  createdByEmail: existing.createdByEmail || rtx.createdByEmail || ''
                });
                hasChanges = true;
              }
            }
          }
        }
      }

      if (hasChanges) {
        if (typeof window.recalculateAccountBalances === 'function') {
          await window.recalculateAccountBalances();
        }
      }

      return hasChanges;
    } catch (err) {
      console.warn('[ServerSync] Lỗi pullAndMergeOwnedSharedProjections:', err.message);
      return false;
    }
  }

  async syncSharedTransactions(shareId, transactions, projection = null) {
    if (!this.token) throw new Error('Vui lòng kết nối máy chủ riêng.');
    const res = await fetch(`${this.serverUrl}/api/shares/received/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ shareId, transactions, projection })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Đồng bộ giao dịch chia sẻ thất bại.');
    }
    return res.json();
  }
}

window.serverSyncService = new ServerSyncService();

if (typeof window !== 'undefined') {
  window.getSyncedTimestamp = () => {
    if (window.serverSyncService && typeof window.serverSyncService.getSyncedNow === 'function') {
      return window.serverSyncService.getSyncedNow();
    }
    try {
      const saved = parseInt(localStorage.getItem('stc_server_clock_offset_ms'), 10);
      return Date.now() + (!isNaN(saved) ? saved : 0);
    } catch (_) {
      return Date.now();
    }
  };
}
