/**
 * Sổ Thu Chi - Dropbox Sync Service
 * Sử dụng OAuth 2.0 PKCE (Proof Key for Code Exchange) với Refresh Token vĩnh viễn
 * Hoạt động 100% Client-side trên Web/PWA, KHÔNG cần Server trung gian!
 * Tự động đồng bộ vĩnh viễn trên iPhone/iOS không bao giờ bị hỏi lại.
 */

class DropboxSync {
  constructor() {
    this.appKey = ''; // Dropbox App Key
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = 0;
    this.userProfile = null;
    this.isSyncing = false;
    this.autoSync = true;
    this.lastSyncTime = null;
    this.filePath = '/sothuchi_vault.json';
    this.refreshTimer = null;
  }

  async init() {
    try {
      const keySetting = await db.settings.get('dropboxAppKey');
      if (keySetting && keySetting.value) {
        this.appKey = keySetting.value.trim();
      } else if (window.EnvConfig) {
        this.appKey = window.EnvConfig.get('DROPBOX_APP_KEY', '').trim();
      }

      const refreshSetting = await db.settings.get('dropboxRefreshToken');
      if (refreshSetting && refreshSetting.value) {
        this.refreshToken = refreshSetting.value;
      }

      const profileSetting = await db.settings.get('dropboxUserProfile');
      if (profileSetting && profileSetting.value) {
        this.userProfile = profileSetting.value;
      }

      const autoSetting = await db.settings.get('dropboxAutoSync');
      if (autoSetting !== undefined) {
        this.autoSync = !!autoSetting.value;
      }

      // Khôi phục token còn hạn
      const tokenSetting = await db.settings.get('dropboxAccessToken');
      const expiresSetting = await db.settings.get('dropboxTokenExpiresAt');
      if (tokenSetting && expiresSetting && Date.now() < Number(expiresSetting.value)) {
        this.accessToken = tokenSetting.value;
        this.tokenExpiresAt = Number(expiresSetting.value);
      }

      // Kiểm tra xem trang có đang là cửa sổ redirect nhận OAuth code không
      this.handleOAuthRedirect();

      // Đặt bộ đếm tự động gia hạn token trước khi hết hạn
      this.setupAutoRefreshTimer();
    } catch (err) {
      console.warn('DropboxSync init warning:', err);
    }
  }

  setAppKey(key) {
    this.appKey = (key || '').trim();
    db.settings.put({ key: 'dropboxAppKey', value: this.appKey });
  }

  hasValidToken() {
    return !!(this.accessToken && (!this.tokenExpiresAt || Date.now() < this.tokenExpiresAt));
  }

  isAutoSyncEnabled() {
    // Có AppKey, bật autoSync và có Refresh Token hoặc Access Token
    return !!(this.autoSync && this.appKey && (this.refreshToken || this.hasValidToken()));
  }

  getTargetLabel() {
    return 'Dropbox';
  }

  // Tạo PKCE Code Verifier ngẫu nhiên
  generateCodeVerifier() {
    const array = new Uint8Array(48);
    crypto.getRandomValues(array);
    return Array.from(array, byte => ('0' + byte.toString(16)).slice(-2)).join('');
  }

  // Tạo PKCE Code Challenge (SHA-256 base64url)
  async generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // Khởi động quá trình đăng nhập Dropbox PKCE
  async requestAuth() {
    if (!this.appKey) {
      throw new Error('Vui lòng nhập Dropbox App Key trong mục Cài đặt trước khi kết nối.');
    }

    const verifier = this.generateCodeVerifier();
    sessionStorage.setItem('dropbox_code_verifier', verifier);
    await db.settings.put({ key: 'dropboxCodeVerifier', value: verifier });

    const challenge = await this.generateCodeChallenge(verifier);
    const redirectUri = window.location.origin + window.location.pathname;

    const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${encodeURIComponent(this.appKey)}&response_type=code&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256&token_access_type=offline&redirect_uri=${encodeURIComponent(redirectUri)}`;

    // Mở popup đăng nhập
    const width = 500;
    const height = 650;
    const left = (window.innerWidth - width) / 2 + window.screenX;
    const top = (window.innerHeight - height) / 2 + window.screenY;

    const popup = window.open(
      authUrl,
      'dropbox_oauth',
      `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`
    );

    if (!popup) {
      // Nếu popup bị chặn, điều hướng thẳng
      window.location.href = authUrl;
      return;
    }

    // Đợi kết quả từ popup qua BroadcastChannel hoặc postMessage
    return new Promise((resolve, reject) => {
      const handler = async (event) => {
        if (event.data && event.data.type === 'dropbox-auth-code') {
          window.removeEventListener('message', handler);
          try {
            const tokenData = await this.exchangeCodeForToken(event.data.code, verifier, redirectUri);
            resolve(tokenData);
          } catch (e) {
            reject(e);
          }
        }
      };

      window.addEventListener('message', handler);

      const checkTimer = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkTimer);
          window.removeEventListener('message', handler);
          if (!this.accessToken) {
            reject(new Error('Đã đóng cửa sổ đăng nhập Dropbox'));
          }
        }
      }, 500);
    });
  }

  // Xử lý khi URL có code (được redirect từ Dropbox)
  async handleOAuthRedirect() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    // Nếu đây là popup của sổ con
    if (window.opener) {
      window.opener.postMessage({ type: 'dropbox-auth-code', code }, '*');
      window.close();
      return;
    }

    // Nếu là điều hướng thẳng trên cùng một tab
    try {
      let verifier = sessionStorage.getItem('dropbox_code_verifier');
      if (!verifier) {
        const stored = await db.settings.get('dropboxCodeVerifier');
        verifier = stored?.value;
      }
      if (verifier && this.appKey) {
        const redirectUri = window.location.origin + window.location.pathname;
        await this.exchangeCodeForToken(code, verifier, redirectUri);
        // Xoá code khỏi URL để sạch đẹp
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (e) {
      console.warn('OAuth redirect exchange error:', e);
    }
  }

  // Đổi Auth Code lấy Access Token + Refresh Token
  async exchangeCodeForToken(code, verifier, redirectUri) {
    const bodyParams = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: this.appKey,
      code_verifier: verifier,
      redirect_uri: redirectUri
    });

    const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Đổi token Dropbox thất bại: ${errText}`);
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    if (data.refresh_token) {
      this.refreshToken = data.refresh_token;
      await db.settings.put({ key: 'dropboxRefreshToken', value: this.refreshToken });
    }

    const expiresIn = data.expires_in || 14400; // 4 tiếng
    this.tokenExpiresAt = Date.now() + (expiresIn * 1000) - 120000;

    await db.settings.put({ key: 'dropboxAccessToken', value: this.accessToken });
    await db.settings.put({ key: 'dropboxTokenExpiresAt', value: this.tokenExpiresAt });

    await this.fetchUserProfile();
    this.setupAutoRefreshTimer();
    return data;
  }

  // Làm mới Access Token bằng Refresh Token (chạy ngầm 100% trên iPhone)
  async refreshAccessToken() {
    if (!this.refreshToken || !this.appKey) {
      throw new Error('Chưa có Refresh Token hoặc App Key Dropbox.');
    }

    const bodyParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
      client_id: this.appKey
    });

    const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gia hạn token Dropbox thất bại: ${errText}`);
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    const expiresIn = data.expires_in || 14400;
    this.tokenExpiresAt = Date.now() + (expiresIn * 1000) - 120000;

    await db.settings.put({ key: 'dropboxAccessToken', value: this.accessToken });
    await db.settings.put({ key: 'dropboxTokenExpiresAt', value: this.tokenExpiresAt });
    return this.accessToken;
  }

  // Đảm bảo luôn có Access Token hợp lệ trước khi gọi API
  async ensureValidToken() {
    if (this.hasValidToken()) return this.accessToken;
    if (this.refreshToken) {
      return await this.refreshAccessToken();
    }
    throw new Error('Chưa đăng nhập Dropbox hoặc phiên đã hết hạn.');
  }

  // Tải profile tài khoản Dropbox
  async fetchUserProfile() {
    try {
      const token = await this.ensureValidToken();
      const res = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        this.userProfile = {
          name: data.name?.display_name || 'Dropbox User',
          email: data.email,
          picture: data.profile_photo_url || null
        };
        await db.settings.put({ key: 'dropboxUserProfile', value: this.userProfile });
        window.dispatchEvent(new CustomEvent('dropbox-profile-updated', { detail: this.userProfile }));
        return this.userProfile;
      }
    } catch (e) {
      console.warn('fetchUserProfile Dropbox error:', e);
    }
    return null;
  }

  setupAutoRefreshTimer() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    // Mỗi 3 tiếng kiểm tra gia hạn
    this.refreshTimer = setInterval(async () => {
      if (this.refreshToken && this.appKey && this.autoSync) {
        try {
          await this.refreshAccessToken();
          console.log('[Dropbox] Tự động làm mới token thành công!');
        } catch (e) {
          console.log('[Dropbox] Lỗi gia hạn token ngầm:', e.message);
        }
      }
    }, 3 * 3600 * 1000);
  }

  // Đọc file sao lưu trên Dropbox
  async downloadRemoteData() {
    const token = await this.ensureValidToken();
    const res = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ path: this.filePath })
      }
    });

    if (res.status === 409) {
      // File chưa tồn tại
      return null;
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Tải file từ Dropbox thất bại: ${errText}`);
    }

    const text = await res.text();
    return JSON.parse(text);
  }

  // Ghi file lên Dropbox
  async uploadRemoteData(payload) {
    const token = await this.ensureValidToken();
    const bodyStr = JSON.stringify(payload, null, 2);

    const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: this.filePath,
          mode: 'overwrite',
          autorename: false,
          mute: true
        }),
        'Content-Type': 'application/octet-stream'
      },
      body: bodyStr
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Lưu file lên Dropbox thất bại: ${errText}`);
    }

    return await res.json();
  }

  // Đồng bộ hai chiều với thuật toán Last-Write-Wins
  async sync() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    window.dispatchEvent(new CustomEvent('sync-start', { detail: { target: 'Dropbox' } }));

    try {
      await this.ensureValidToken();

      let remoteData = null;
      try {
        remoteData = await this.downloadRemoteData();
      } catch (dlErr) {
        console.warn('Lỗi đọc remote Dropbox:', dlErr);
      }

      // Tận dụng hàm mergeDatabases sẵn có từ googleDriveService nếu có, hoặc tự gộp
      let merged;
      if (window.googleDriveService && typeof window.googleDriveService.mergeDatabases === 'function') {
        merged = await window.googleDriveService.mergeDatabases(remoteData ? remoteData.data : null);
      } else {
        merged = await this.mergeDatabases(remoteData ? remoteData.data : null);
      }

      const payload = {
        version: '2.0.0',
        syncedAt: new Date().toISOString(),
        data: merged
      };

      await this.uploadRemoteData(payload);

      this.lastSyncTime = new Date().toISOString();
      await db.settings.put({ key: 'lastSyncTime', value: this.lastSyncTime });

      window.dispatchEvent(new CustomEvent('sync-success', {
        detail: { time: this.lastSyncTime, target: 'Dropbox' }
      }));

      return { success: true, time: this.lastSyncTime };
    } catch (err) {
      console.error('[DropboxSync] Đồng bộ thất bại:', err);
      window.dispatchEvent(new CustomEvent('sync-error', {
        detail: { error: err.message, target: 'Dropbox' }
      }));
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  // Merge Database LWW Fallback
  async mergeDatabases(remoteData) {
    if (!remoteData) {
      return await this.exportLocalData();
    }
    // Giao dịch
    const localTxs = await db.transactions.toArray();
    const mergedTxs = this.mergeEntities(localTxs, remoteData.transactions || []);
    await db.transactions.clear();
    await db.transactions.bulkPut(mergedTxs);

    // Tài khoản
    const localAccs = await db.accounts.toArray();
    const mergedAccs = this.mergeEntities(localAccs, remoteData.accounts || []);
    await db.accounts.clear();
    await db.accounts.bulkPut(mergedAccs);

    // Hạng mục
    const localCats = await db.categories.toArray();
    const mergedCats = this.mergeEntities(localCats, remoteData.categories || []);
    await db.categories.clear();
    await db.categories.bulkPut(mergedCats);

    return await this.exportLocalData();
  }

  mergeEntities(locals, remotes) {
    const map = new Map();
    for (const item of locals) map.set(String(item.id), item);
    for (const remote of remotes) {
      const key = String(remote.id);
      const local = map.get(key);
      if (!local) {
        map.set(key, remote);
      } else {
        const localTime = local.updatedAt || 0;
        const remoteTime = remote.updatedAt || 0;
        if (remoteTime > localTime) {
          map.set(key, remote);
        }
      }
    }
    return Array.from(map.values());
  }

  async exportLocalData() {
    const allAccs = await db.accounts.toArray();
    const sharedAccs = allAccs.filter(a => a.isShared === undefined || a.isShared === 1 || a.isShared === true);
    const sharedAccIds = new Set(sharedAccs.map(a => Number(a.id)));

    const allTxs = await db.transactions.toArray();
    const sharedTxs = allTxs.filter(t => {
      const accId = Number(t.accountId);
      const toAccId = t.toAccountId ? Number(t.toAccountId) : null;
      return sharedAccIds.has(accId) || (toAccId && sharedAccIds.has(toAccId));
    });

    const cats = await db.categories.toArray();
    return { transactions: sharedTxs, accounts: sharedAccs, categories: cats };
  }

  async disconnect() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = 0;
    this.userProfile = null;
    this.autoSync = false;

    if (this.refreshTimer) clearInterval(this.refreshTimer);

    await db.settings.delete('dropboxAccessToken');
    await db.settings.delete('dropboxRefreshToken');
    await db.settings.delete('dropboxTokenExpiresAt');
    await db.settings.delete('dropboxUserProfile');
    await db.settings.put({ key: 'dropboxAutoSync', value: false });

    window.dispatchEvent(new CustomEvent('dropbox-profile-updated', { detail: null }));
  }
}

window.dropboxService = new DropboxSync();
