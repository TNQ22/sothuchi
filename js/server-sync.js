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

      // 5. Đọc Auto Sync
      const savedAutoSync = await db.settings.get('syncServerAutoSync');
      if (savedAutoSync !== undefined) {
        this.autoSync = !!savedAutoSync.value;
      }

      // 6. Đọc Last Sync Time
      const savedTime = await db.settings.get('syncServerLastSyncTime');
      if (savedTime) {
        this.lastSyncTime = savedTime.value;
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
      const res = await fetch(`${this.serverUrl}/api/health`, { cache: 'no-store' });
      if (res.ok) {
        const info = await res.json();
        this.connectionStatus = 'connected';
        if (info.googleClientId) {
          this.serverGoogleClientId = info.googleClientId;
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
  async loginWithGoogle() {
    if (!this.serverUrl) {
      throw new Error('Vui lòng nhập địa chỉ Máy Chủ Riêng trước khi đăng nhập.');
    }

    // A. Nếu Google Drive đã có Access Token hợp lệ, gửi xác thực ngay lập tức không cần mở popup lại
    const gDrive = window.googleDriveService;
    if (gDrive && gDrive.hasValidToken && gDrive.hasValidToken() && gDrive.accessToken) {
      try {
        const authRes = await fetch(`${this.serverUrl}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: gDrive.accessToken })
        });
        if (authRes.ok) {
          const authData = await authRes.json();
          this.token = authData.token;
          this.userProfile = authData.user;
          await db.settings.put({ key: 'syncServerToken', value: this.token });
          await db.settings.put({ key: 'syncServerUserProfile', value: this.userProfile });
          await this.fetchVaults();
          window.dispatchEvent(new CustomEvent('server-auth-changed', {
            detail: { user: this.userProfile, vaults: this.vaults, activeVaultId: this.activeVaultId }
          }));
          return { user: this.userProfile, vaults: this.vaults };
        }
      } catch (reuseErr) {
        console.warn('[ServerSync] Không tái sử dụng được token Google Drive hiện tại, chuyển sang đăng nhập mới:', reuseErr);
      }
    }

    // B. Lấy Google Client ID (từ cache serverGoogleClientId, settings, hoặc EnvConfig)
    let clientId = this.serverGoogleClientId || gDrive?.clientId;
    if (!clientId) {
      const dbClientId = await db.settings.get('googleClientId');
      if (dbClientId && dbClientId.value) clientId = dbClientId.value;
      else if (window.EnvConfig) clientId = window.EnvConfig.get('GOOGLE_CLIENT_ID', '');
    }

    if (!clientId) {
      try {
        const cfgRes = await fetch(`${this.serverUrl}/api/auth/config`);
        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          if (cfg.googleClientId) clientId = cfg.googleClientId;
        }
      } catch (e) {}
    }

    if (!clientId) {
      throw new Error('Chưa có Google Client ID. Vui lòng nhập Google Client ID trong phần Cài đặt.');
    }

    // C. Sử dụng GIS token client với scope đầy đủ và xử lý liên tục
    if (!window.google?.accounts?.oauth2) {
      throw new Error('Thư viện Google Identity chưa tải xong. Vui lòng thử lại sau 3 giây.');
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Hết thời gian chờ đăng nhập Google'));
        }
      }, 60000);

      try {
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid',
          callback: async (resp) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);

            if (resp.error) {
              return reject(new Error(resp.error_description || resp.error));
            }

            try {
              // Gửi token xác thực lên Server
              const authRes = await fetch(`${this.serverUrl}/api/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: resp.access_token })
              });

              if (!authRes.ok) {
                const errData = await authRes.json();
                throw new Error(errData.error || 'Đăng nhập vào máy chủ thất bại');
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

              resolve({ user: this.userProfile, vaults: this.vaults });
            } catch (authErr) {
              reject(authErr);
            }
          }
        });

        tokenClient.requestAccessToken({ prompt: 'select_account' });
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(err);
        }
      }
    });
  }

  // Đăng xuất khỏi Máy chủ riêng
  async logout() {
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

    await db.settings.delete('syncServerToken');
    await db.settings.delete('syncServerUserProfile');
    await db.settings.delete('syncServerActiveVaultId');

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

  // Chuyển sang Sổ khác
  async switchVault(vaultId) {
    if (!vaultId) return;
    this.activeVaultId = vaultId;
    await db.settings.put({ key: 'syncServerActiveVaultId', value: this.activeVaultId });

    const currentVault = this.getActiveVault();
    if (currentVault && currentVault.role === 'owner') {
      await this.fetchShares(this.activeVaultId);
    } else {
      this.shares = [];
    }

    // Khi đổi sang sổ khác, đồng bộ kéo dữ liệu về máy ngay
    await this.sync({ interactive: true });

    window.dispatchEvent(new CustomEvent('server-vault-switched', {
      detail: { vault: currentVault }
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
      const err = await res.json();
      throw new Error(err.error || 'Tạo sổ thất bại');
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

  // Lấy danh sách thành viên được chia sẻ
  async fetchShares(vaultId) {
    if (!this.serverUrl || !this.token || !vaultId) return [];
    try {
      const res = await fetch(`${this.serverUrl}/api/vaults/${vaultId}/shares`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        this.shares = data.shares || [];
        window.dispatchEvent(new CustomEvent('server-shares-updated', { detail: { shares: this.shares } }));
        return this.shares;
      }
    } catch (e) {
      console.warn('[ServerSync] fetchShares error:', e);
    }
    return [];
  }

  // Chia sẻ Sổ cho Email Google khác
  async shareVaultWithEmail(email, role = 'editor') {
    if (!this.serverUrl || !this.token) throw new Error('Yêu cầu kết nối máy chủ');
    if (!this.activeVaultId) throw new Error('Chưa chọn sổ để chia sẻ');

    const cleanEmail = (email || '').toLowerCase().trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Vui lòng nhập địa chỉ email Google hợp lệ');
    }

    const res = await fetch(`${this.serverUrl}/api/vaults/${this.activeVaultId}/shares`, {
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
    await this.fetchShares(this.activeVaultId);
    return data;
  }

  // Xóa thành viên khỏi Sổ
  async removeShare(shareId) {
    if (!this.serverUrl || !this.token || !this.activeVaultId) throw new Error('Yêu cầu kết nối máy chủ');

    const res = await fetch(`${this.serverUrl}/api/vaults/${this.activeVaultId}/shares/${shareId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.token}` }
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Xóa thành viên thất bại');
    }

    await this.fetchShares(this.activeVaultId);
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

  // Thay thế toàn bộ dữ liệu dùng chung cục bộ bằng dữ liệu Snapshot
  async replaceLocalWithSnapshotData(remoteData) {
    if (!remoteData) return;

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

    const newAccs = [...privateAccs, ...(remoteData.accounts || [])];
    const newTxs = [...privateTxs, ...(remoteData.transactions || [])];

    await db.accounts.clear();
    await db.accounts.bulkAdd(newAccs);

    await db.transactions.clear();
    await db.transactions.bulkAdd(newTxs);

    if (remoteData.categories) {
      await db.categories.clear();
      await db.categories.bulkAdd(remoteData.categories);
    }
    if (remoteData.debts) {
      await db.debts.clear();
      await db.debts.bulkAdd(remoteData.debts);
    }
    if (remoteData.budgets) {
      await db.budgets.clear();
      await db.budgets.bulkAdd(remoteData.budgets);
    }
    if (remoteData.recurring) {
      await db.recurring.clear();
      await db.recurring.bulkAdd(remoteData.recurring);
    }
    if (remoteData.savings && db.savings) {
      await db.savings.clear();
      await db.savings.bulkAdd(remoteData.savings);
    }
    if (remoteData.accumulations && db.accumulations) {
      await db.accumulations.clear();
      await db.accumulations.bulkAdd(remoteData.accumulations);
    }
    if (remoteData.assets && db.assets) {
      await db.assets.clear();
      await db.assets.bulkAdd(remoteData.assets);
    }
    if (remoteData.loans && db.loans) {
      await db.loans.clear();
      await db.loans.bulkAdd(remoteData.loans);
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
  async forceOverwriteServer() {
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

    const res = await fetch(`${this.serverUrl}/api/vaults/${this.activeVaultId}/overwrite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: payload, forceOverwrite: true })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Ghi đè dữ liệu lên máy chủ thất bại.');
    }

    const pushResult = await res.json();

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
      const serverData = pullResult.data || {};

      // 2. Gộp dữ liệu từ Server vào IndexedDB máy khách (bảo vệ tài khoản riêng tư)
      await this.mergeServerDataIntoLocal(serverData);

      // 3. Nếu là Editor hoặc Owner: Chuẩn bị dữ liệu để đẩy (Push) lên Server
      if (!isViewer) {
        // Lấy các tài khoản và giao dịch chia sẻ để đẩy lên server
        const allAccs = await db.accounts.toArray();
        const sharedAccs = allAccs.filter(a => a.isShared === 1 || a.isShared === true);
        const sharedAccIds = new Set(sharedAccs.map(a => Number(a.id)));

        const allTxs = await db.transactions.toArray();
        const sharedTxs = allTxs.filter(t => {
          const accId = Number(t.accountId);
          const toAccId = t.toAccountId ? Number(t.toAccountId) : null;
          return sharedAccIds.has(accId) || (toAccId && sharedAccIds.has(toAccId));
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

        const localPayload = {
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

        // Gửi push & merge lên Server
        const pushRes = await fetch(`${this.serverUrl}/api/vaults/${this.activeVaultId}/sync`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ data: localPayload })
        });

        if (!pushRes.ok) {
          const err = await pushRes.json();
          throw new Error(err.error || 'Đẩy dữ liệu lên máy chủ thất bại.');
        }

        const pushResult = await pushRes.json();
        // Cập nhật lại IndexedDB với kết quả đã gộp từ server
        if (pushResult.data) {
          await this.mergeServerDataIntoLocal(pushResult.data);
        }
      }

      // Đối soát lại số dư
      if (typeof window.recalculateAccountBalances === 'function') {
        await window.recalculateAccountBalances();
      }

      this.lastSyncTime = new Date().toISOString();
      await db.settings.put({ key: 'syncServerLastSyncTime', value: this.lastSyncTime });
      await db.settings.put({ key: 'lastSyncTime', value: this.lastSyncTime });

      window.dispatchEvent(new CustomEvent('sync-success', {
        detail: { time: this.lastSyncTime, target: targetLabel }
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

  // Thuật toán gộp dữ liệu từ Server vào Dexie IndexedDB
  async mergeServerDataIntoLocal(remoteData) {
    if (!remoteData) return;

    const mergeTable = async (table, localItems, remoteItems) => {
      if (!table || !Array.isArray(remoteItems)) return;
      const itemMap = new Map();

      for (const lItem of localItems) {
        itemMap.set(lItem.id, lItem);
      }

      for (const rItem of remoteItems) {
        if (!rItem || rItem.id === undefined) continue;

        let lItem = itemMap.get(rItem.id);

        if (!lItem && table === db.accounts && rItem.name) {
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
          const rTime = new Date(rItem.updatedAt || 0).getTime() || 0;
          const lTime = new Date(lItem.updatedAt || 0).getTime() || 0;
          if (rTime >= lTime) {
            itemMap.set(lItem.id, { ...rItem, id: lItem.id });
          }
        }
      }

      const mergedList = Array.from(itemMap.values());
      await table.clear();
      await table.bulkAdd(mergedList);
    };

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

    if (remoteData.transactions) await mergeTable(db.transactions, localTxs, remoteData.transactions);
    if (remoteData.accounts) await mergeTable(db.accounts, localAccs, remoteData.accounts);

    // Phục hồi lại các bản ghi riêng tư nếu bị ảnh hưởng
    for (const pAcc of privateAccs) {
      await db.accounts.put(pAcc);
    }
    for (const pTx of privateTxs) {
      await db.transactions.put(pTx);
    }

    if (remoteData.categories) await mergeTable(db.categories, await db.categories.toArray(), remoteData.categories);
    if (remoteData.debts) await mergeTable(db.debts, await db.debts.toArray(), remoteData.debts);
    if (remoteData.budgets) await mergeTable(db.budgets, await db.budgets.toArray(), remoteData.budgets);
    if (remoteData.recurring) await mergeTable(db.recurring, await db.recurring.toArray(), remoteData.recurring);
    if (remoteData.savings && db.savings) await mergeTable(db.savings, await db.savings.toArray(), remoteData.savings);
    if (remoteData.accumulations && db.accumulations) await mergeTable(db.accumulations, await db.accumulations.toArray(), remoteData.accumulations);
    if (remoteData.assets && db.assets) await mergeTable(db.assets, await db.assets.toArray(), remoteData.assets);
    if (remoteData.loans && db.loans) await mergeTable(db.loans, await db.loans.toArray(), remoteData.loans);

    // Cài đặt ứng dụng
    if (remoteData.settings && Array.isArray(remoteData.settings)) {
      for (const rSetting of remoteData.settings) {
        const lSetting = await db.settings.get(rSetting.key);
        const rTime = new Date(rSetting.updatedAt || 0).getTime() || 0;
        const lTime = new Date(lSetting?.updatedAt || 0).getTime() || 0;
        if (!lSetting || rTime >= lTime) {
          await db.settings.put(rSetting);
        }
      }
    }
  }
}

window.serverSyncService = new ServerSyncService();
