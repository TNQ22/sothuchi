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

  // Đăng nhập nhanh máy chủ không cần Google OAuth (Mạng nội bộ / Docker)
  async quickLogin(email, name) {
    if (!this.serverUrl) throw new Error('Vui lòng nhập địa chỉ Máy Chủ Riêng trước.');
    const targetEmail = (email || '').trim().toLowerCase();
    if (!targetEmail) throw new Error('Vui lòng cung cấp email tài khoản.');

    const res = await fetch(`${this.serverUrl}/api/auth/quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, name: name || targetEmail.split('@')[0] })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Đăng nhập máy chủ thất bại');
    }

    this.token = data.token;
    this.userProfile = data.user;
    this.connectionStatus = 'connected';

    await db.settings.put({ key: 'syncServerToken', value: this.token });
    await db.settings.put({ key: 'syncServerUserProfile', value: this.userProfile });

    await this.fetchVaults();

    window.dispatchEvent(new CustomEvent('server-auth-changed', {
      detail: { user: this.userProfile, vaults: this.vaults, activeVaultId: this.activeVaultId }
    }));

    // Kiểm tra xung đột dữ liệu và thực hiện chiến lược đồng bộ phù hợp
    if (this.activeVaultId) {
      this.handlePostLoginSync(this.userProfile).catch(err => {
        console.warn('[ServerSync] handlePostLoginSync after quickLogin:', err);
      });
    }

    return data;
  }

  // Đăng nhập máy chủ bằng tài khoản Google
  async loginWithGoogle() {
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
    accessToken = await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Hết thời gian chờ đăng nhập Google'));
        }
      }, 60000);

      try {
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid',
          prompt: 'select_account',
          callback: (resp) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (resp.error) {
              if (resp.error === 'popup_closed_by_user') {
                return reject(new Error('popup_closed_by_user'));
              }
              return reject(new Error(resp.error_description || resp.error));
            }
            resolve(resp.access_token);
          }
        });
        tokenClient.requestAccessToken({ prompt: 'select_account' });
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

    await db.settings.delete('syncServerToken');
    await db.settings.delete('syncServerUserProfile');
    await db.settings.delete('syncServerActiveVaultId');
    await db.settings.delete('syncServerVaults');

    if (wipeLocal && typeof window.wipeAndResetLocalDatabase === 'function') {
      await window.wipeAndResetLocalDatabase();
    }

    window.dispatchEvent(new CustomEvent('server-auth-changed', { detail: null }));
  }

  // Lấy danh sách Sổ (Vaults)
  async fetchVaults() {
    if (!this.serverUrl || !this.token) return [];
    try {
      const res = await fetch(`${this.serverUrl}/api/vaults`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        this.vaults = data.vaults || [];
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

    const pushRes = await fetch(endpoint, {
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
    if (oldVaultId && oldVaultId !== vaultId && this.serverUrl && this.token) {
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
      const err = await res.json();
      throw new Error(err.error || 'Xóa sổ thất bại');
    }

    this.activeVaultId = null;
    await db.settings.delete('syncServerActiveVaultId');
    await this.fetchVaults();
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
    const hasCustomAccs = localAccs.some(a => (a.balance !== 0) || ((a.initialBalance || 0) !== 0) || a.id > 3);
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
      const privateAccs = localAccs.filter(a => a.isShared !== 1 && a.isShared !== true);
      const privateAccIds = new Set(privateAccs.map(a => Number(a.id)));

      const localTxs = await db.transactions.toArray();
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

    // Đánh dấu tất cả tài khoản cục bộ thành isShared = 1 để cùng đồng bộ với Vault
    const allAccs = await db.accounts.toArray();
    for (const a of allAccs) {
      if (a.isShared !== 1) {
        a.isShared = 1;
        await db.accounts.put(a);
      }
    }

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

      // 1. Tải dữ liệu Sổ từ Máy chủ
      const pullRes = await fetch(`${this.serverUrl}/api/vaults/${this.activeVaultId}/data`, {
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
        let pushRes = await fetch(`${this.serverUrl}/api/vaults/${this.activeVaultId}/sync`, {
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
          pushRes = await fetch(`${this.serverUrl}/api/vaults/${this.activeVaultId}/sync`, {
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
          // Tự động làm mới và cập nhật bản chiếu mã hóa cho các mục đang chia sẻ
          try {
            const ownedShares = await db.settings.get('syncOwnedSharedProjections');
            if (ownedShares && Array.isArray(ownedShares.value)) {
              for (const s of ownedShares.value) {
                const currentKey = s.shareKey || (await this.getItemShareKey(`${s.itemType}_${s.itemId}`));
                await this.projectAndPushItem(s.itemType, s.itemId, currentKey);
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
      }

      // Đối soát lại số dư
      if (typeof window.recalculateAccountBalances === 'function') {
        await window.recalculateAccountBalances();
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

    // 1. Kiểm tra định kỳ mỗi 10 giây (khi tab đang active)
    setInterval(async () => {
      if (document.hidden) return;
      await this.checkRemoteVersionAndSync();
    }, 10000);

    // 2. Kiểm tra ngay lập tức khi người dùng chuyển qua lại giữa các tab hoặc app
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        await this.checkRemoteVersionAndSync();
      }
    });

    window.addEventListener('focus', async () => {
      await this.checkRemoteVersionAndSync();
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
        if (this.lastVaultVersion !== null && data.version > this.lastVaultVersion) {
          console.log(`[ServerSync] Phát hiện dữ liệu mới trên máy chủ (v${data.version} > v${this.lastVaultVersion}), tự động cập nhật...`);
          await this.sync();
        } else if (this.lastVaultVersion === null) {
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

      for (const lItem of localItems) {
        if (lItem && lItem.id !== undefined && lItem.id !== null) {
          itemMap.set(lItem.id, lItem);
        }
      }

      for (const rItem of remoteItems) {
        if (!rItem || rItem.id === undefined || rItem.id === null) continue;

        let lItem = itemMap.get(rItem.id);

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
            itemMap.set(rItem.id, rItem);
          } else {
            // Bảo vệ tài khoản có số dư trên remote tránh bị tài khoản trắng mới khởi tạo của local ghi đè
            const lIsBlank = (lItem.balance === 0 || lItem.balance === '0') &&
                             ((lItem.initialBalance || 0) === 0) &&
                             !lItem.isShared;
            const rHasData = (rItem.balance !== 0 || (rItem.initialBalance || 0) !== 0);

            if (lIsBlank && rHasData && !rItem.isDeleted) {
              itemMap.set(lItem.id, { ...rItem, id: lItem.id });
              continue;
            }

            const rIsBlank = (rItem.balance === 0 || rItem.balance === '0') &&
                             ((rItem.initialBalance || 0) === 0) &&
                             !rItem.isShared;
            const lHasData = (lItem.balance !== 0 || (lItem.initialBalance || 0) !== 0);

            if (rIsBlank && lHasData && !lItem.isDeleted) {
              continue; // Giữ nguyên local
            }

            const rTime = new Date(rItem.updatedAt || 0).getTime() || 0;
            const lTime = new Date(lItem.updatedAt || 0).getTime() || 0;
            if (rTime >= lTime) {
              itemMap.set(lItem.id, { ...rItem, id: lItem.id });
            }
          }
          continue;
        }

        // --- XỬ LÝ CHO CÁC BẢNG KHÁC (TRANSACTIONS, V.V...) ---
        if (!lItem) {
          itemMap.set(rItem.id, rItem);
        } else {
          // Kiểm tra xem có phải trùng ID do auto-increment của 2 trình duyệt độc lập không
          let isSameEntity = false;

          if (tableName === 'transactions' || (rItem.amount !== undefined && rItem.date !== undefined)) {
            const sameType = rItem.type === lItem.type;
            const sameDate = String(rItem.date || '').slice(0, 10) === String(lItem.date || '').slice(0, 10);
            const sameAmount = Math.abs(Number(rItem.amount || 0) - Number(lItem.amount || 0)) < 0.01;
            const sameAccount = Number(rItem.accountId) === Number(lItem.accountId);
            isSameEntity = sameType && sameDate && sameAmount && sameAccount;
          } else if (rItem.name && lItem.name) {
            isSameEntity = (rItem.name.trim().toLowerCase() === lItem.name.trim().toLowerCase());
          } else {
            isSameEntity = true;
          }

          if (isSameEntity) {
            // Cùng một thực thể -> Last-Write-Wins
            const rTime = new Date(rItem.updatedAt || 0).getTime() || 0;
            const lTime = new Date(lItem.updatedAt || 0).getTime() || 0;
            if (rTime >= lTime) {
              itemMap.set(lItem.id, { ...rItem, id: lItem.id });
            }
          } else {
            // Xung đột ID giữa 2 trình duyệt: Cấp ID mới cho rItem và giữ cả 2!
            const newId = generateUniqueNumericId();
            itemMap.set(newId, { ...rItem, id: newId });
          }
        }
      }

      const mergedList = Array.from(itemMap.values());
      const beforeStr = JSON.stringify(localItems);
      const afterStr = JSON.stringify(mergedList);
      if (beforeStr !== afterStr) {
        anyDataChanged = true;
        await table.clear();
        await table.bulkAdd(mergedList);
      }
    };

    // Lưu lại các item được người khác chia sẻ để không bị ghi đè bởi vault cá nhân
    const sharedReceivedAccs = (await db.accounts.toArray()).filter(a => a._isSharedItem);
    const sharedReceivedTxs = (await db.transactions.toArray()).filter(t => t._isSharedItem);

    if (remoteData.transactions) await mergeTable(db.transactions, await db.transactions.toArray(), remoteData.transactions, false, 'transactions');
    if (remoteData.accounts) await mergeTable(db.accounts, await db.accounts.toArray(), remoteData.accounts, true, 'accounts');

    // Phục hồi lại các item chia sẻ nhận được
    for (const sAcc of sharedReceivedAccs) {
      await db.accounts.put(sAcc);
    }
    for (const sTx of sharedReceivedTxs) {
      await db.transactions.put(sTx);
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
    const cleanItem = { ...targetItem };
    delete cleanItem._isSharedItem;
    delete cleanItem._shareId;

    const projectedPayload = {
      item: cleanItem,
      transactions: transactions.map(t => {
        const copy = { ...t };
        delete copy._isSharedItem;
        delete copy._shareId;
        return copy;
      }),
      categories,
      projectedAt: new Date().toISOString()
    };

    // 2. Mã hóa bằng Khóa Chia Sẻ (Item Share Key) nếu có
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
    const res = await fetch(`${this.serverUrl}/api/shares/item?itemType=${encodeURIComponent(itemType)}&itemId=${encodeURIComponent(itemId)}`, {
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

    let shareKey = password ? password.trim() : null;
    if (!shareKey) {
      shareKey = (await this.getItemShareKey(`${itemType}_${itemId}`)) ||
        (Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join(''));
    }

    // Tự động bóc tách và mã hóa bản chiếu trước khi mời email
    await this.projectAndPushItem(itemType, itemId, shareKey);

    const res = await fetch(`${this.serverUrl}/api/shares/item/email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ itemType, itemId, itemName, email, role })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Cấp quyền chia sẻ thất bại.');
    }
    const result = await res.json();
    if (result.share && result.share.id) {
      await this.saveItemShareKey(result.share.id, shareKey);
      result.share.shareKey = shareKey;
    }
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

    // Tự động sinh khóa ngẫu nhiên 256-bit (16 bytes hex)
    const shareKey = customKey ? customKey.trim() : (Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join(''));

    // Tự động bóc tách và mã hóa bản chiếu gửi lên server
    await this.projectAndPushItem(itemType, itemId, shareKey);

    const res = await fetch(`${this.serverUrl}/api/shares/item/link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ itemType, itemId, itemName, role })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Tạo liên kết chia sẻ thất bại.');
    }
    const result = await res.json();
    if (result.link && result.link.token) {
      await this.saveItemShareKey(result.link.token, shareKey);
      result.link.shareKey = shareKey;
    }
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
    return res.json();
  }

  async syncReceivedSharedItems() {
    if (!this.token) return false;
    let hasChanges = false;

    try {
      const res = await fetch(`${this.serverUrl}/api/shares/my-received`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      if (!res.ok) return;

      const { items } = await res.json();
      if (!Array.isArray(items)) return;

      const activeReceivedShareIds = new Set(items.map(i => i.shareId));

      // 1. Xóa các item đã bị thu hồi khỏi local IndexedDB
      const localAccs = await db.accounts.toArray();
      for (const acc of localAccs) {
        if (acc._isSharedItem && acc._shareId && !activeReceivedShareIds.has(acc._shareId)) {
          console.log('[ServerSync] Quyền chia sẻ đã bị thu hồi, xóa tài khoản:', acc.name);
          hasChanges = true;
          await db.accounts.delete(acc.id);
          // Xóa giao dịch kèm theo
          const relatedTxs = await db.transactions.where('accountId').equals(acc.id).toArray();
          for (const tx of relatedTxs) {
            await db.transactions.delete(tx.id);
          }
        }
      }

      if (db.savings) {
        const localSavings = await db.savings.toArray();
        for (const s of localSavings) {
          if (s._isSharedItem && s._shareId && !activeReceivedShareIds.has(s._shareId)) {
            await db.savings.delete(s.id);
          }
        }
      }

      if (db.accumulations) {
        const localAccums = await db.accumulations.toArray();
        for (const a of localAccums) {
          if (a._isSharedItem && a._shareId && !activeReceivedShareIds.has(a._shareId)) {
            await db.accumulations.delete(a.id);
          }
        }
      }

      if (db.loans) {
        const localLoans = await db.loans.toArray();
        for (const l of localLoans) {
          if (l._isSharedItem && l._shareId && !activeReceivedShareIds.has(l._shareId)) {
            await db.loans.delete(l.id);
          }
        }
      }

      if (db.assets) {
        const localAssets = await db.assets.toArray();
        for (const ast of localAssets) {
          if (ast._isSharedItem && ast._shareId && !activeReceivedShareIds.has(ast._shareId)) {
            await db.assets.delete(ast.id);
          }
        }
      }

      // 2. Thêm hoặc cập nhật các item được chia sẻ vào local IndexedDB
      for (const shareItem of items) {
        const { itemType, itemId, shareId, role, ownerName, ownerEmail, vaultId } = shareItem;

        let item = shareItem.item;
        let transactions = shareItem.transactions;

        // Xử lý bản chiếu mã hóa E2EE (Zero-Knowledge Item Projection)
        if (shareItem.isProjection && shareItem.isEncrypted && shareItem.projectionData) {
          const shareKey = (await this.getItemShareKey(shareId)) || (await this.getItemShareKey(itemId)) || (await this.getItemShareKey(`${itemType}_${itemId}`));
          if (!shareKey) {
            console.warn('[ServerSync] Chưa có khóa giải mã cho mục chia sẻ:', shareItem.itemName);
            continue;
          }
          if (window.CryptoService) {
            try {
              const decStr = await window.CryptoService.decrypt(shareItem.projectionData.payload, shareKey);
              const decData = JSON.parse(decStr);
              item = decData.item;
              transactions = decData.transactions;
            } catch (decErr) {
              console.error('[ServerSync] Lỗi giải mã mục chia sẻ:', decErr);
              continue;
            }
          }
        }

        if (!item) continue;

        if (itemType === 'account') {
          // Tìm tài khoản cục bộ tương ứng theo _shareId hoặc _remoteId
          let localAcc = (await db.accounts.toArray()).find(a => a._shareId === shareId || (a._remoteId === itemId && a._remoteVaultId === vaultId));
          const accData = {
            ...item,
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
            hasChanges = true;
            await db.accounts.update(localAccId, { ...accData, id: localAccId });
          } else {
            delete accData.id;
            hasChanges = true;
            localAccId = await db.accounts.add(accData);
          }

          // Cập nhật giao dịch cho tài khoản này
          if (Array.isArray(transactions)) {
            for (const tx of transactions) {
              const txRemoteId = tx.id;
              const localTx = (await db.transactions.toArray()).find(t => t._remoteTxId === txRemoteId && t._shareId === shareId);
              const txData = {
                ...tx,
                accountId: localAccId,
                _isSharedItem: true,
                _shareId: shareId,
                _remoteTxId: txRemoteId
              };
              if (localTx) {
                await db.transactions.update(localTx.id, { ...txData, id: localTx.id });
              } else {
                delete txData.id;
                await db.transactions.add(txData);
              }
            }
          }
        } else if (itemType === 'savings' && db.savings) {
          let localSav = (await db.savings.toArray()).find(s => s._shareId === shareId);
          const savData = {
            ...item,
            _isSharedItem: true,
            _sharedRole: role,
            _shareId: shareId,
            _remoteId: itemId,
            _remoteVaultId: vaultId,
            _sharedFrom: ownerName || ownerEmail
          };
          if (localSav) {
            await db.savings.update(localSav.id, { ...savData, id: localSav.id });
          } else {
            delete savData.id;
            await db.savings.add(savData);
          }
        } else if (itemType === 'accumulation' && db.accumulations) {
          let localAcc = (await db.accumulations.toArray()).find(a => a._shareId === shareId);
          const accData = {
            ...item,
            _isSharedItem: true,
            _sharedRole: role,
            _shareId: shareId,
            _remoteId: itemId,
            _remoteVaultId: vaultId,
            _sharedFrom: ownerName || ownerEmail
          };
          if (localAcc) {
            await db.accumulations.update(localAcc.id, { ...accData, id: localAcc.id });
          } else {
            delete accData.id;
            await db.accumulations.add(accData);
          }
        } else if (itemType === 'loan' && db.loans) {
          let localLoan = (await db.loans.toArray()).find(l => l._shareId === shareId);
          const loanData = {
            ...item,
            _isSharedItem: true,
            _sharedRole: role,
            _shareId: shareId,
            _remoteId: itemId,
            _remoteVaultId: vaultId,
            _sharedFrom: ownerName || ownerEmail
          };
          if (localLoan) {
            await db.loans.update(localLoan.id, { ...loanData, id: localLoan.id });
          } else {
            delete loanData.id;
            await db.loans.add(loanData);
          }
        } else if (itemType === 'asset' && db.assets) {
          let localAsset = (await db.assets.toArray()).find(a => a._shareId === shareId);
          const assetData = {
            ...item,
            _isSharedItem: true,
            _sharedRole: role,
            _shareId: shareId,
            _remoteId: itemId,
            _remoteVaultId: vaultId,
            _sharedFrom: ownerName || ownerEmail
          };
          if (localAsset) {
            await db.assets.update(localAsset.id, { ...assetData, id: localAsset.id });
          } else {
            delete assetData.id;
            await db.assets.add(assetData);
          }
        }
      }
      return hasChanges;
    } catch (err) {
      console.warn('[ServerSync] Lỗi tải các mục được chia sẻ:', err.message);
      return false;
    }
  }

  async syncSharedTransactions(shareId, transactions) {
    if (!this.token) throw new Error('Vui lòng kết nối máy chủ riêng.');
    const res = await fetch(`${this.serverUrl}/api/shares/received/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ shareId, transactions })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Đồng bộ giao dịch chia sẻ thất bại.');
    }
    return res.json();
  }
}

window.serverSyncService = new ServerSyncService();
