/**
 * Sổ Thu Chi - Dropbox Sync Service
 * Sử dụng OAuth 2.0 PKCE (Proof Key for Code Exchange) với Refresh Token vĩnh viễn
 * Hoạt động 100% Client-side trên Web/PWA, KHÔNG cần Server trung gian!
 * Tự động đồng bộ vĩnh viễn trên iPhone/iOS không bao giờ bị hỏi lại.
 * Hỗ trợ Chia sẻ tài khoản độc lập (Universal Share), E2EE AES-256 và Shared Folders.
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
    this.folderPath = ''; // Đường dẫn thư mục dùng chung (VD: /SoThuChi_Shared)
    this.sharedLink = '';
    this.role = 'owner'; // 'owner' hoặc 'member'
    this.refreshTimer = null;
    this.encryptionPassword = '';
    this._isSyncingReceivedSharedItems = false;
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

      const linkSetting = await db.settings.get('dropboxSharedLink');
      if (linkSetting && linkSetting.value) {
        this.sharedLink = linkSetting.value.trim();
      }

      const roleSetting = await db.settings.get('dropboxRole');
      if (roleSetting && roleSetting.value) {
        this.role = roleSetting.value;
      }

      const folderSetting = await db.settings.get('dropboxFolderPath');
      if (folderSetting && folderSetting.value) {
        this.folderPath = folderSetting.value.trim();
      }

      const fileSetting = await db.settings.get('dropboxFilePath');
      if (fileSetting && fileSetting.value) {
        this.filePath = fileSetting.value.trim();
      } else {
        this.updateResolvedFilePath();
      }

      const encSetting = await db.settings.get('dropboxEncryptionPassword');
      if (encSetting && encSetting.value) {
        this.encryptionPassword = encSetting.value;
      }

      const lastSyncSetting = await db.settings.get('dropboxLastSyncTime');
      if (lastSyncSetting && lastSyncSetting.value) {
        this.lastSyncTime = lastSyncSetting.value;
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

  setAutoSync(enabled) {
    this.autoSync = !!enabled;
    db.settings.put({ key: 'dropboxAutoSync', value: this.autoSync });
  }

  isAutoSyncEnabled() {
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
  async requestAuth(opts = {}) {
    if (!this.appKey) {
      throw new Error('Vui lòng nhập Dropbox App Key trong mục Cài đặt trước khi kết nối.');
    }

    const verifier = this.generateCodeVerifier();
    sessionStorage.setItem('dropbox_code_verifier', verifier);
    await db.settings.put({ key: 'dropboxCodeVerifier', value: verifier });

    const challenge = await this.generateCodeChallenge(verifier);
    const redirectUri = window.location.origin + window.location.pathname;

    let authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${encodeURIComponent(this.appKey)}&response_type=code&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256&token_access_type=offline&redirect_uri=${encodeURIComponent(redirectUri)}`;
    if (opts.forceReauth) {
      authUrl += '&force_reapprove=true';
    }

    const width = 520;
    const height = 680;
    const left = (window.innerWidth - width) / 2 + window.screenX;
    const top = (window.innerHeight - height) / 2 + window.screenY;

    const popup = window.open(
      authUrl,
      'dropbox_oauth',
      `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`
    );

    if (!popup) {
      window.location.href = authUrl;
      return;
    }

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

    if (window.opener) {
      window.opener.postMessage({ type: 'dropbox-auth-code', code }, '*');
      window.close();
      return;
    }

    try {
      let verifier = sessionStorage.getItem('dropbox_code_verifier');
      if (!verifier) {
        const stored = await db.settings.get('dropboxCodeVerifier');
        verifier = stored?.value;
      }
      if (verifier && this.appKey) {
        const redirectUri = window.location.origin + window.location.pathname;
        await this.exchangeCodeForToken(code, verifier, redirectUri);
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

    const expiresIn = data.expires_in || 14400;
    this.tokenExpiresAt = Date.now() + (expiresIn * 1000) - 120000;

    await db.settings.put({ key: 'dropboxAccessToken', value: this.accessToken });
    await db.settings.put({ key: 'dropboxTokenExpiresAt', value: this.tokenExpiresAt });

    await this.fetchUserProfile();
    this.setupAutoRefreshTimer();
    return data;
  }

  // Làm mới Access Token bằng Refresh Token
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

  // Đảm bảo luôn có Access Token hợp lệ
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
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        this.userProfile = {
          name: data.name?.display_name || 'Dropbox User',
          email: data.email,
          picture: data.profile_photo_url || './assets/icons/dropbox.svg',
          isDropbox: true
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

  updateResolvedFilePath() {
    if (this.folderPath && this.folderPath.trim()) {
      let clean = this.folderPath.trim();
      if (!clean.startsWith('/')) clean = '/' + clean;
      if (clean.endsWith('/')) clean = clean.slice(0, -1);
      this.filePath = clean + '/sothuchi_vault.json';
    } else {
      this.filePath = '/sothuchi_vault.json';
    }
  }

  async setFolderPath(path) {
    this.folderPath = (path || '').trim();
    this.updateResolvedFilePath();
    await db.settings.put({ key: 'dropboxFolderPath', value: this.folderPath });
  }

  async setCustomFilePath(path) {
    let clean = (path || '').trim();
    if (clean && !clean.startsWith('/')) clean = '/' + clean;
    this.filePath = clean || '/sothuchi_vault.json';
    await db.settings.put({ key: 'dropboxFilePath', value: this.filePath });
  }

  async setFilePath(path) {
    return this.setCustomFilePath(path);
  }

  async setEncryptionPassword(password) {
    this.encryptionPassword = (password || '').trim();
    if (this.encryptionPassword) {
      await db.settings.put({ key: 'dropboxEncryptionPassword', value: this.encryptionPassword });
    } else {
      await db.settings.delete('dropboxEncryptionPassword');
    }
    window.dispatchEvent(new CustomEvent('dropbox-encryption-updated', {
      detail: { enabled: !!this.encryptionPassword }
    }));
  }

  // Tạo hoặc lấy Shared Link cho file sao lưu của Chủ sổ
  async getOrCreateSharedLink() {
    const token = await this.ensureValidToken();
    try {
      const listRes = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: this.filePath, direct_only: true })
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.links && listData.links.length > 0) {
          const directLink = listData.links[0].url.replace('?dl=0', '?dl=1');
          this.sharedLink = directLink;
          await db.settings.put({ key: 'dropboxSharedLink', value: directLink });
          return directLink;
        }
      }

      const createRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: this.filePath,
          settings: { requested_visibility: 'public' }
        })
      });
      if (createRes.ok) {
        const createData = await createRes.json();
        const directLink = createData.url.replace('?dl=0', '?dl=1');
        this.sharedLink = directLink;
        await db.settings.put({ key: 'dropboxSharedLink', value: directLink });
        return directLink;
      }
    } catch (err) {
      console.warn('Lỗi khi lấy/tạo shared link Dropbox:', err);
    }
    return null;
  }

  // Đọc file sao lưu trên Dropbox (hỗ trợ cả tài khoản Chủ sổ hoặc Thành viên dùng Shared Link)
  async downloadRemoteData() {
    if (this.role === 'member' && this.sharedLink) {
      try {
        let fetchUrl = this.sharedLink.trim();
        if (fetchUrl.includes('dropbox.com')) {
          fetchUrl = fetchUrl.replace('?dl=0', '?dl=1');
          if (!fetchUrl.includes('dl=1')) {
            fetchUrl += (fetchUrl.includes('?') ? '&dl=1' : '?dl=1');
          }
        }
        const res = await fetch(fetchUrl);
        if (res.ok) {
          const text = await res.text();
          let json = JSON.parse(text);
          if (json && json.encrypted && json.payload && this.encryptionPassword && window.CryptoService) {
            try {
              const decrypted = await window.CryptoService.decrypt(json.payload, this.encryptionPassword);
              json = JSON.parse(decrypted);
            } catch (decErr) {
              throw new Error('Mật khẩu mã hóa E2EE không đúng hoặc dữ liệu bị lỗi.');
            }
          }
          return json;
        }
      } catch (err) {
        console.warn('Lỗi khi tải từ link chia sẻ Dropbox:', err);
      }
    }

    const token = await this.ensureValidToken();
    const res = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ path: this.filePath })
      }
    });

    if (res.status === 409) {
      return null;
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Tải file từ Dropbox thất bại: ${errText}`);
    }

    const text = await res.text();
    let json = JSON.parse(text);
    if (json && json.encrypted && json.payload && this.encryptionPassword && window.CryptoService) {
      try {
        const decrypted = await window.CryptoService.decrypt(json.payload, this.encryptionPassword);
        json = JSON.parse(decrypted);
      } catch (decErr) {
        throw new Error('Mật khẩu mã hóa E2EE không đúng.');
      }
    }
    return json;
  }

  // Ghi file lên Dropbox
  async uploadRemoteData(payload) {
    const token = await this.ensureValidToken();
    let bodyPayload = payload;
    if (this.encryptionPassword && window.CryptoService) {
      const encrypted = await window.CryptoService.encrypt(JSON.stringify(payload), this.encryptionPassword);
      bodyPayload = {
        encrypted: true,
        payload: encrypted,
        version: payload.version || '2.0.0',
        syncedAt: payload.syncedAt || new Date().toISOString()
      };
    }
    const bodyStr = JSON.stringify(bodyPayload, null, 2);

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
      await db.settings.put({ key: 'dropboxLastSyncTime', value: this.lastSyncTime });

      // Tự động đồng bộ các tài khoản được chia sẻ
      try {
        await this.syncReceivedSharedItems();
        await this.pullAndMergeOwnedSharedProjections();
      } catch (shErr) {
        console.warn('[Dropbox] Đồng bộ item chia sẻ trong sync:', shErr);
      }

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

  async mergeDatabases(remoteData) {
    if (!remoteData) {
      return await this.exportLocalData();
    }
    const localTxs = await db.transactions.toArray();
    const mergedTxs = this.mergeEntities(localTxs, remoteData.transactions || []);
    await db.transactions.clear();
    await db.transactions.bulkPut(mergedTxs);

    const localAccs = await db.accounts.toArray();
    const mergedAccs = this.mergeEntities(localAccs, remoteData.accounts || [], true, mergedTxs);
    await db.accounts.clear();
    await db.accounts.bulkPut(mergedAccs);

    const localCats = await db.categories.toArray();
    const mergedCats = this.mergeEntities(localCats, remoteData.categories || []);
    await db.categories.clear();
    await db.categories.bulkPut(mergedCats);

    return await this.exportLocalData();
  }

  mergeEntities(locals, remotes, isAccounts = false, currentTxs = []) {
    const map = new Map();
    for (const item of locals) map.set(String(item.id), item);

    const DEFAULT_ACCOUNT_NAMES = ['tiền mặt', 'ngân hàng', 'ví điện tử', 'momo / zalopay', 'tài khoản ngân hàng'];
    let txAccIds = new Set();
    if (isAccounts && Array.isArray(currentTxs)) {
      for (const t of currentTxs) {
        if (!t.isDeleted) {
          if (t.accountId) txAccIds.add(String(t.accountId));
          if (t.toAccountId) txAccIds.add(String(t.toAccountId));
        }
      }
    }

    for (const remote of remotes) {
      let key = String(remote.id);
      let local = map.get(key);

      if (!local && isAccounts && remote.name) {
        for (const [lId, lItem] of map.entries()) {
          if (lItem.name && lItem.name.trim().toLowerCase() === remote.name.trim().toLowerCase() && lItem.type === remote.type) {
            local = lItem;
            key = lId;
            break;
          }
        }
      }

      if (!local) {
        map.set(key, remote);
      } else {
        if (isAccounts) {
          const isDef = local.name && DEFAULT_ACCOUNT_NAMES.includes(local.name.trim().toLowerCase());
          const isBlank = (local.balance === 0 || local.balance === '0') && ((local.initialBalance || 0) === 0) && !local.isShared;
          const isUntouchedDef = isDef && isBlank && (Number(local.updatedAt || 0) <= 1 || (remote.balance !== 0 || remote.initialBalance !== 0));
          if (isDef && isBlank && remote.isDeleted) {
            map.set(key, { ...remote, id: local.id, isDeleted: 1 });
            continue;
          }
          if ((remote.balance !== 0 || remote.initialBalance !== 0) && isUntouchedDef && !remote.isDeleted) {
            map.set(key, { ...remote, id: local.id });
            continue;
          }
        }
        const localTime = local.updatedAt || 0;
        const remoteTime = remote.updatedAt || 0;
        if (remoteTime > localTime) {
          map.set(key, remote);
        }
      }
    }

    if (isAccounts && Array.isArray(remotes) && remotes.length > 0) {
      for (const [id, item] of map.entries()) {
        const isDef = item.name && DEFAULT_ACCOUNT_NAMES.includes(item.name.trim().toLowerCase());
        const isBlank = (item.balance === 0 || item.balance === '0') && ((item.initialBalance || 0) === 0) && !item.isShared;
        const hasTx = txAccIds.has(String(item.id));
        if (isDef && isBlank && !hasTx) {
          const inRemote = remotes.some(r => r && (String(r.id) === String(item.id) || (r.name && r.name.trim().toLowerCase() === item.name.trim().toLowerCase() && r.type === item.type)));
          if (!inRemote) {
            map.delete(id);
          }
        }
      }
    }

    return Array.from(map.values());
  }

  async exportLocalData() {
    const txs = await db.transactions.toArray();
    const accs = await db.accounts.toArray();
    const cats = await db.categories.toArray();
    return { transactions: txs, accounts: accs, categories: cats };
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
    await db.settings.delete('dropboxUserProfile');
    await db.settings.delete('dropboxTokenExpiresAt');
    await db.settings.put({ key: 'dropboxAutoSync', value: false });

    window.dispatchEvent(new CustomEvent('dropbox-profile-updated', { detail: null }));
  }

  // =========================================================================
  // UNIVERSAL ACCOUNT & ITEM SHARING FOR DROPBOX
  // =========================================================================

  getSharedItemPath(itemType, itemId) {
    let folder = (this.folderPath || '').trim();
    if (folder.endsWith('/')) folder = folder.slice(0, -1);
    if (folder && !folder.startsWith('/')) folder = '/' + folder;
    return `${folder}/stc_shared_${itemType}_${itemId}.json`;
  }

  async getSharedFileId(itemType, itemId) {
    const s = await db.settings.get(`dropboxSharedFile_${itemType}_${itemId}`);
    return s?.value || null;
  }

  async setSharedFileId(itemType, itemId, fileId) {
    await db.settings.put({ key: `dropboxSharedFile_${itemType}_${itemId}`, value: fileId });
  }

  async removeSharedFileId(itemType, itemId) {
    await db.settings.delete(`dropboxSharedFile_${itemType}_${itemId}`);
  }

  async getItemShareKey(key) {
    const s = await db.settings.get(`dropboxShareKey_${key}`);
    return s?.value || null;
  }

  async saveItemShareKey(key, value) {
    await db.settings.put({ key: `dropboxShareKey_${key}`, value });
  }

  async deleteItemShareKey(key) {
    await db.settings.delete(`dropboxShareKey_${key}`);
  }

  // Trích xuất item và đẩy lên Dropbox ở file độc lập
  async projectAndPushItem(itemType, itemId, shareKey = null) {
    await this.ensureValidToken();

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

    const filePath = this.getSharedItemPath(itemType, itemId);

    // Differential merge: Nếu file đã tồn tại trên Dropbox, tải về kiểm tra giao dịch do thành viên khác ghi nhận
    if (itemType === 'account') {
      try {
        const pullToken = await this.ensureValidToken();
        const pullRes = await fetch('https://content.dropboxapi.com/2/files/download', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${pullToken}`,
            'Dropbox-API-Arg': JSON.stringify({ path: filePath })
          }
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
              transactions = (await db.transactions.toArray()).filter(t => {
                if (t._isSharedItem) return false;
                if (t.isDeleted && t.isDeleted !== 0) return false;
                return Number(t.accountId) === Number(itemId) || Number(t.toAccountId) === Number(itemId);
              });
            }
          }
        }
      } catch (mergeErr) {
        console.warn('[Dropbox] Kiểm tra giao dịch từ xa khi chiếu:', mergeErr);
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
        name: this.userProfile?.name || 'Dropbox User',
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
      await this.deleteItemShareKey(`${itemType}_${itemId}`);
    }

    // Upload file lên Dropbox
    const uploadToken = await this.ensureValidToken();
    const uploadRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${uploadToken}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: filePath,
          mode: 'overwrite',
          autorename: false,
          mute: true
        }),
        'Content-Type': 'application/octet-stream'
      },
      body: fileContent
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Tải file chia sẻ lên Dropbox thất bại: ${errText}`);
    }

    await this.setSharedFileId(itemType, itemId, filePath);

    // Lấy hoặc tạo shared link cho file này
    let directLink = null;
    try {
      directLink = await this.getOrCreateItemSharedLink(filePath);
    } catch (_) {}

    try {
      const ownedShares = (await db.settings.get('syncOwnedSharedProjections')) || { key: 'syncOwnedSharedProjections', value: [] };
      const list = Array.isArray(ownedShares.value) ? ownedShares.value : [];
      const existing = list.find(x => x.itemType === itemType && String(x.itemId) === String(itemId) && x.service === 'dropbox');
      if (existing) {
        existing.fileId = filePath;
        existing.shareKey = shareKey || null;
        existing.directLink = directLink || existing.directLink;
      } else {
        list.push({ itemType, itemId: String(itemId), fileId: filePath, shareKey: shareKey || null, directLink, service: 'dropbox' });
      }
      await db.settings.put({ key: 'syncOwnedSharedProjections', value: list });
    } catch (_) {}

    return { success: true, fileId: filePath, filePath, shareKey, directLink };
  }

  async getOrCreateItemSharedLink(filePath) {
    const token = await this.ensureValidToken();
    try {
      const listRes = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: filePath, direct_only: true })
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.links && listData.links.length > 0) {
          return listData.links[0].url.replace('?dl=0', '?dl=1');
        }
      }

      const createRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: filePath,
          settings: { requested_visibility: 'public' }
        })
      });
      if (createRes.ok) {
        const createData = await createRes.json();
        return createData.url.replace('?dl=0', '?dl=1');
      }
    } catch (err) {
      console.warn('Dropbox getOrCreateItemSharedLink warning:', err);
    }
    return null;
  }

  makeDropboxToken(url, path, itemId, itemType) {
    const cleanUrl = (url || '').replace('?dl=0', '?dl=1');
    const payload = { url: cleanUrl, path, id: itemId, type: itemType, s: 'dbx' };
    return `dropbox_${btoa(unescape(encodeURIComponent(JSON.stringify(payload))))}`;
  }

  parseDropboxToken(token) {
    if (!token) return null;
    if (token.startsWith('dropbox_')) {
      const b64 = token.slice('dropbox_'.length);
      try {
        const jsonStr = decodeURIComponent(escape(atob(b64)));
        return JSON.parse(jsonStr);
      } catch (_) {
        return { url: decodeURIComponent(b64) };
      }
    }
    if (token.includes('dropbox.com') || token.includes('dropboxusercontent.com')) {
      return { url: token };
    }
    return null;
  }

  async getItemShares(itemType, itemId) {
    const filePath = this.getSharedItemPath(itemType, itemId);
    const shares = [];
    const links = [];

    // 1. Đọc danh sách đã lưu cục bộ
    const localSetting = (await db.settings.get(`dropboxItemShares_${itemType}_${itemId}`)) || { value: { shares: [], links: [] } };
    const saved = localSetting.value || { shares: [], links: [] };

    // 2. Truy vấn Dropbox API nếu có token
    if (this.hasValidToken() || this.refreshToken) {
      try {
        const token = await this.ensureValidToken();

        // 2.1 Quét Shared Links từ Dropbox
        try {
          const listRes = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ path: filePath, direct_only: true })
          });
          if (listRes.ok) {
            const listData = await listRes.json();
            if (Array.isArray(listData.links)) {
              for (const l of listData.links) {
                const dbxToken = this.makeDropboxToken(l.url, filePath, itemId, itemType);
                links.push({
                  id: l.id || l.url,
                  token: dbxToken,
                  directUrl: l.url.replace('?dl=0', '?dl=1'),
                  role: 'editor',
                  created_at: l.client_modified || new Date().toISOString(),
                  service: 'dropbox'
                });
              }
            }
          }
        } catch (lErr) {
          console.warn('[Dropbox] getItemShares list links error:', lErr);
        }

        // 2.2 Quét File Members từ Dropbox
        try {
          const memRes = await fetch('https://api.dropboxapi.com/2/sharing/list_file_members', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ file: filePath })
          });
          if (memRes.ok) {
            const memData = await memRes.json();
            const myEmail = (this.userProfile?.email || '').toLowerCase();
            if (Array.isArray(memData.users)) {
              for (const u of memData.users) {
                const email = u.user?.email || '';
                if (email && email.toLowerCase() === myEmail) continue;
                shares.push({
                  id: u.user?.account_id || email,
                  user_email: email,
                  user_name: u.user?.display_name || email,
                  role: u.access_type?.['.tag'] === 'editor' ? 'editor' : 'viewer',
                  service: 'dropbox'
                });
              }
            }
          }
        } catch (_) {}
      } catch (err) {
        console.warn('[Dropbox] getItemShares error:', err);
      }
    }

    // Gộp với danh sách local để không bị sót
    for (const s of (saved.shares || [])) {
      if (!shares.some(x => x.user_email && x.user_email.toLowerCase() === (s.user_email || '').toLowerCase())) {
        shares.push(s);
      }
    }
    for (const l of (saved.links || [])) {
      if (!links.some(x => x.id === l.id || x.token === l.token)) {
        links.push(l);
      }
    }

    return { shares, links };
  }

  async shareItemWithEmail(itemType, itemId, itemName, email, role = 'viewer', password = null) {
    let shareKey = password ? password.trim() : null;
    if (!shareKey && this.encryptionPassword) {
      shareKey = (await this.getItemShareKey(`${itemType}_${itemId}`)) || this.encryptionPassword;
    }

    let emails = Array.isArray(email) ? email : email.split(/[\s,;]+/);
    const cleanEmails = [...new Set(emails.map(e => (e || '').trim().toLowerCase()).filter(e => e && e.includes('@')))];
    if (cleanEmails.length === 0) {
      throw new Error('Vui lòng cung cấp ít nhất một địa chỉ email hợp lệ.');
    }

    const { filePath } = await this.projectAndPushItem(itemType, itemId, shareKey);

    // Cố gắng gọi Dropbox API add_file_member
    try {
      const token = await this.ensureValidToken();
      await fetch('https://api.dropboxapi.com/2/sharing/add_file_member', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          file: filePath,
          members: cleanEmails.map(em => ({ ".tag": "email", email: em })),
          access_level: role === 'editor' ? 'editor' : 'viewer',
          quiet: true
        })
      });
    } catch (apiErr) {
      console.warn('[Dropbox] add_file_member notice:', apiErr);
    }

    // Lưu vào tracking cục bộ
    const keySetting = `dropboxItemShares_${itemType}_${itemId}`;
    const cur = (await db.settings.get(keySetting)) || { value: { shares: [], links: [] } };
    const saved = cur.value || { shares: [], links: [] };
    const createdShares = [];

    cleanEmails.forEach(em => {
      const existing = saved.shares.find(x => x.user_email?.toLowerCase() === em);
      if (existing) {
        existing.role = role;
      } else {
        const item = {
          id: `dbx_email_${em}`,
          user_email: em,
          user_name: em,
          role,
          shareKey,
          service: 'dropbox'
        };
        saved.shares.push(item);
        createdShares.push(item);
      }
    });

    await db.settings.put({ key: keySetting, value: saved });

    if (shareKey) {
      await this.saveItemShareKey(`${itemType}_${itemId}`, shareKey);
    }

    return {
      success: true,
      count: cleanEmails.length,
      emails: cleanEmails,
      shares: createdShares.length > 0 ? createdShares : saved.shares
    };
  }

  async createItemShareLink(itemType, itemId, itemName, role = 'viewer', customKey = null) {
    let shareKey = customKey ? customKey.trim() : null;
    if (!shareKey && this.encryptionPassword) {
      shareKey = (await this.getItemShareKey(`${itemType}_${itemId}`)) || this.encryptionPassword;
    }

    const { filePath } = await this.projectAndPushItem(itemType, itemId, shareKey);
    const directLink = await this.getOrCreateItemSharedLink(filePath);

    if (!directLink) {
      throw new Error('Không thể tạo liên kết chia sẻ từ Dropbox. Vui lòng kiểm tra quyền hạn tài khoản.');
    }

    const token = this.makeDropboxToken(directLink, filePath, itemId, itemType);

    if (shareKey) {
      await this.saveItemShareKey(token, shareKey);
      await this.saveItemShareKey(filePath, shareKey);
    }

    const keySetting = `dropboxItemShares_${itemType}_${itemId}`;
    const cur = (await db.settings.get(keySetting)) || { value: { shares: [], links: [] } };
    const saved = cur.value || { shares: [], links: [] };

    const newLink = {
      id: token,
      token,
      directUrl: directLink,
      role: role === 'editor' ? 'editor' : 'viewer',
      created_at: new Date().toISOString(),
      shareKey: shareKey || null,
      service: 'dropbox'
    };

    if (!saved.links.some(l => l.token === token)) {
      saved.links.push(newLink);
      await db.settings.put({ key: keySetting, value: saved });
    }

    return {
      success: true,
      token,
      directLink,
      link: newLink
    };
  }

  async revokeItemShare(itemType, itemId, shareId) {
    const filePath = this.getSharedItemPath(itemType, itemId);
    try {
      const token = await this.ensureValidToken();
      await fetch('https://api.dropboxapi.com/2/sharing/remove_file_member_2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          file: filePath,
          member: { ".tag": "email", email: shareId.replace('dbx_email_', '') },
          keep_access: false
        })
      });
    } catch (_) {}

    const keySetting = `dropboxItemShares_${itemType}_${itemId}`;
    const cur = (await db.settings.get(keySetting)) || { value: { shares: [], links: [] } };
    const saved = cur.value || { shares: [], links: [] };
    saved.shares = saved.shares.filter(s => s.id !== shareId && s.user_email !== shareId);
    await db.settings.put({ key: keySetting, value: saved });
    return { success: true };
  }

  async revokeItemShareLink(itemType, itemId, linkId) {
    const keySetting = `dropboxItemShares_${itemType}_${itemId}`;
    const cur = (await db.settings.get(keySetting)) || { value: { shares: [], links: [] } };
    const saved = cur.value || { shares: [], links: [] };
    const found = saved.links.find(l => l.id === linkId || l.token === linkId);
    if (found && found.directUrl) {
      try {
        const token = await this.ensureValidToken();
        await fetch('https://api.dropboxapi.com/2/sharing/revoke_shared_link', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url: found.directUrl.replace('?dl=1', '?dl=0') })
        });
      } catch (_) {}
    }
    saved.links = saved.links.filter(l => l.id !== linkId && l.token !== linkId);
    await db.settings.put({ key: keySetting, value: saved });
    return { success: true };
  }

  async shareVaultWithEmail(email, role = 'editor') {
    const token = await this.ensureValidToken();
    let emails = Array.isArray(email) ? email : email.split(/[\s,;]+/);
    const cleanEmails = [...new Set(emails.map(e => (e || '').trim().toLowerCase()).filter(e => e && e.includes('@')))];
    if (cleanEmails.length === 0) throw new Error('Vui lòng nhập địa chỉ email hợp lệ.');

    try {
      await fetch('https://api.dropboxapi.com/2/sharing/add_file_member', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          file: this.filePath,
          members: cleanEmails.map(em => ({ ".tag": "email", email: em })),
          access_level: role === 'editor' ? 'editor' : 'viewer',
          quiet: true
        })
      });
    } catch (e) {
      console.warn('Dropbox add_file_member vault error:', e);
    }

    const vaultSharesSetting = (await db.settings.get('dropboxVaultShares')) || { key: 'dropboxVaultShares', value: [] };
    const list = Array.isArray(vaultSharesSetting.value) ? vaultSharesSetting.value : [];
    cleanEmails.forEach(em => {
      if (!list.some(x => x.email === em)) {
        list.push({ email: em, role, addedAt: new Date().toISOString() });
      }
    });
    await db.settings.put({ key: 'dropboxVaultShares', value: list });
    return { success: true, emails: cleanEmails };
  }

  async getShareLinkInfo(token) {
    const parsed = this.parseDropboxToken(token);
    let fetchUrl = parsed?.url || token;
    if (fetchUrl.includes('dropbox.com')) {
      fetchUrl = fetchUrl.replace('?dl=0', '?dl=1');
      if (!fetchUrl.includes('dl=1')) {
        fetchUrl += (fetchUrl.includes('?') ? '&dl=1' : '?dl=1');
      }
    }

    let rawText = null;
    try {
      const res = await fetch(fetchUrl);
      if (!res.ok) {
        throw new Error(`Không thể đọc tệp chia sẻ từ Dropbox (HTTP ${res.status}).`);
      }
      rawText = await res.text();
    } catch (err) {
      throw new Error(`Không thể kết nối tải tệp từ Dropbox: ${err.message}`);
    }

    let payloadObj = null;
    try {
      payloadObj = JSON.parse(rawText);
    } catch (_) {
      throw new Error('Định dạng tệp trên Dropbox không phải là JSON hợp lệ.');
    }

    if (payloadObj.encrypted) {
      return {
        success: true,
        isEncrypted: true,
        itemType: payloadObj.itemType || 'account',
        itemId: payloadObj.itemId || parsed?.id || 'shared_item',
        itemName: payloadObj.itemName || 'Mục chia sẻ',
        ownerName: payloadObj.owner?.name || 'Dropbox User',
        ownerEmail: payloadObj.owner?.email || '',
        role: 'editor',
        service: 'dropbox',
        token
      };
    }

    return {
      success: true,
      isEncrypted: false,
      itemType: payloadObj.itemType || 'account',
      itemId: payloadObj.itemId || parsed?.id || 'shared_item',
      itemName: payloadObj.itemName || payloadObj.item?.name || 'Mục chia sẻ',
      ownerName: payloadObj.owner?.name || 'Dropbox User',
      ownerEmail: payloadObj.owner?.email || '',
      role: 'editor',
      service: 'dropbox',
      token
    };
  }

  async acceptShareLink(token, key = null) {
    const parsed = this.parseDropboxToken(token);
    const recSetting = (await db.settings.get('dropboxReceivedFiles')) || { key: 'dropboxReceivedFiles', value: [] };
    const list = Array.isArray(recSetting.value) ? recSetting.value : [];

    const fileId = parsed?.path || token;
    if (!list.some(x => x.token === token || x.fileId === fileId)) {
      list.push({ fileId, token, key: key || null, acceptedAt: Date.now() });
      await db.settings.put({ key: 'dropboxReceivedFiles', value: list });
    }

    if (key) {
      await this.saveItemShareKey(token, key);
      await this.saveItemShareKey(fileId, key);
    }

    return { success: true, shareId: token, fileId };
  }

  // Tải và đồng bộ các tài khoản người khác chia sẻ cho mình qua Dropbox
  async syncReceivedSharedItems() {
    if (this._isSyncingReceivedSharedItems) return false;
    this._isSyncingReceivedSharedItems = true;
    let hasChanges = false;

    const recSetting = (await db.settings.get('dropboxReceivedFiles')) || { value: [] };
    const recList = Array.isArray(recSetting.value) ? recSetting.value : [];
    if (recList.length === 0) {
      this._isSyncingReceivedSharedItems = false;
      return false;
    }

    try {
      // 1. Đẩy các giao dịch do thành viên tạo lên Dropbox trước nếu có quyền
      try {
        await this.pushAllReceivedSharedItems();
      } catch (pushErr) {
        console.warn('[Dropbox] Lỗi đẩy giao dịch chia sẻ:', pushErr);
      }

      for (const rec of recList) {
        try {
          const parsed = this.parseDropboxToken(rec.token);
          let fetchUrl = parsed?.url || rec.token;
          if (fetchUrl.includes('dropbox.com')) {
            fetchUrl = fetchUrl.replace('?dl=0', '?dl=1');
            if (!fetchUrl.includes('dl=1')) {
              fetchUrl += (fetchUrl.includes('?') ? '&dl=1' : '?dl=1');
            }
          }

          let res = await fetch(fetchUrl);
          if (!res.ok && this.hasValidToken() && parsed?.path) {
            const token = await this.ensureValidToken();
            res = await fetch('https://content.dropboxapi.com/2/files/download', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Dropbox-API-Arg': JSON.stringify({ path: parsed.path })
              }
            });
          }

          if (!res.ok) continue;

          const text = await res.text();
          let json = JSON.parse(text);
          let itemPayload = json;

          const shareKey = rec.key || (await this.getItemShareKey(rec.token)) || (await this.getItemShareKey(rec.fileId));
          if (json.encrypted && json.payload) {
            if (shareKey && window.CryptoService) {
              try {
                const dec = await window.CryptoService.decrypt(json.payload, shareKey);
                itemPayload = JSON.parse(dec);
              } catch (_) {
                continue;
              }
            } else {
              continue;
            }
          }

          const itemType = itemPayload.itemType || 'account';
          const remoteItem = itemPayload.item;
          if (!remoteItem) continue;

          // Hạng mục
          if (Array.isArray(itemPayload.categories)) {
            const localCats = await db.categories.toArray();
            for (const cat of itemPayload.categories) {
              if (cat && cat.id && !localCats.some(c => c.id === cat.id || c.name === cat.name)) {
                await db.categories.add(cat);
              }
            }
          }

          if (itemType === 'account') {
            const allAccs = await db.accounts.toArray();
            let existingAcc = allAccs.find(a => a._isSharedItem && (
              String(a._shareId) === String(rec.token) ||
              String(a._shareId) === String(rec.fileId) ||
              (a._remoteId && String(a._remoteId) === String(itemPayload.itemId))
            ));

            let localAccountId;
            if (existingAcc) {
              localAccountId = existingAcc.id;
              await db.accounts.update(existingAcc.id, {
                name: remoteItem.name || existingAcc.name,
                type: remoteItem.type || existingAcc.type,
                icon: remoteItem.icon || existingAcc.icon,
                color: remoteItem.color || existingAcc.color,
                balance: remoteItem.balance !== undefined ? remoteItem.balance : existingAcc.balance,
                initialBalance: remoteItem.initialBalance !== undefined ? remoteItem.initialBalance : existingAcc.initialBalance,
                _ownerName: itemPayload.owner?.name || existingAcc._ownerName,
                _ownerEmail: itemPayload.owner?.email || existingAcc._ownerEmail,
                _sharedService: 'dropbox',
                _isSharedItem: 1,
                _needsPassword: 0,
                updatedAt: Date.now()
              });
            } else {
              const toAdd = {
                ...remoteItem,
                isShared: 0,
                _isSharedItem: 1,
                _sharedService: 'dropbox',
                _shareId: rec.token,
                _remoteId: itemPayload.itemId,
                _ownerName: itemPayload.owner?.name || '',
                _ownerEmail: itemPayload.owner?.email || '',
                _needsPassword: 0,
                updatedAt: Date.now()
              };
              delete toAdd.id;
              localAccountId = await db.accounts.add(toAdd);
              hasChanges = true;
            }

            // Đồng bộ giao dịch
            if (Array.isArray(itemPayload.transactions) && localAccountId) {
              const allLocalTxs = await db.transactions.toArray();
              const existingMap = new Map();
              for (const t of allLocalTxs) {
                existingMap.set(String(t._remoteTxId || t.id), t);
              }

              for (const rtx of itemPayload.transactions) {
                if (!rtx) continue;
                const match = existingMap.get(String(rtx.id));
                if (!match) {
                  const toAdd = {
                    ...rtx,
                    accountId: localAccountId,
                    _remoteTxId: rtx.id,
                    _isSharedItem: 1,
                    _sharedService: 'dropbox'
                  };
                  delete toAdd.id;
                  await db.transactions.add(toAdd);
                  hasChanges = true;
                } else if (Number(rtx.updatedAt || 0) > Number(match.updatedAt || 0)) {
                  await db.transactions.update(match.id, {
                    ...rtx,
                    accountId: localAccountId,
                    _remoteTxId: rtx.id,
                    _isSharedItem: 1,
                    _sharedService: 'dropbox'
                  });
                  hasChanges = true;
                }
              }
            }

            if (typeof window.recalculateAccountBalances === 'function') {
              await window.recalculateAccountBalances();
            }
          }
        } catch (recErr) {
          console.warn('[Dropbox] Lỗi đồng bộ 1 tệp received:', recErr);
        }
      }

      if (hasChanges) {
        window.dispatchEvent(new CustomEvent('accounts-updated'));
        window.dispatchEvent(new CustomEvent('shared-items-updated'));
      }
      return hasChanges;
    } catch (err) {
      console.warn('[Dropbox] syncReceivedSharedItems error:', err);
      return false;
    } finally {
      this._isSyncingReceivedSharedItems = false;
    }
  }

  // Đẩy giao dịch do thành viên tạo ngược lại file Dropbox
  async pushAllReceivedSharedItems() {
    const recSetting = (await db.settings.get('dropboxReceivedFiles')) || { value: [] };
    const recList = Array.isArray(recSetting.value) ? recSetting.value : [];
    if (recList.length === 0) return;

    for (const rec of recList) {
      try {
        const parsed = this.parseDropboxToken(rec.token);
        if (!parsed?.path && !rec.fileId) continue;
        const filePath = parsed?.path || rec.fileId;

        // Tìm tài khoản local tương ứng
        const allAccs = await db.accounts.toArray();
        const localAcc = allAccs.find(a => a._isSharedItem && (
          String(a._shareId) === String(rec.token) ||
          String(a._shareId) === String(rec.fileId)
        ));
        if (!localAcc) continue;

        const myMemberTxs = (await db.transactions.toArray()).filter(t =>
          (Number(t.accountId) === Number(localAcc.id) || Number(t.toAccountId) === Number(localAcc.id)) &&
          t.recordedByOther === 1
        );
        if (myMemberTxs.length === 0) continue;

        // Tải file hiện tại, ghép myMemberTxs vào và lưu lại
        const token = await this.ensureValidToken();
        const dlRes = await fetch('https://content.dropboxapi.com/2/files/download', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Dropbox-API-Arg': JSON.stringify({ path: filePath })
          }
        });
        if (!dlRes.ok) continue;

        const text = await dlRes.text();
        let json = JSON.parse(text);
        let payload = json;
        const shareKey = rec.key || (await this.getItemShareKey(rec.token));

        if (json.encrypted && json.payload && shareKey && window.CryptoService) {
          try {
            const dec = await window.CryptoService.decrypt(json.payload, shareKey);
            payload = JSON.parse(dec);
          } catch (_) { continue; }
        }

        const remoteTxs = Array.isArray(payload.transactions) ? payload.transactions : [];
        let modified = false;
        for (const mtx of myMemberTxs) {
          if (!remoteTxs.some(rt => String(rt.id) === String(mtx.id) || String(rt._remoteTxId) === String(mtx.id))) {
            remoteTxs.push({
              ...mtx,
              recordedByOther: 1
            });
            modified = true;
          }
        }

        if (modified) {
          payload.transactions = remoteTxs;
          payload.projectedAt = new Date().toISOString();

          let newBodyStr = '';
          if (json.encrypted && shareKey && window.CryptoService) {
            const enc = await window.CryptoService.encrypt(JSON.stringify(payload), shareKey);
            newBodyStr = JSON.stringify({
              encrypted: true,
              payload: enc,
              itemType: payload.itemType,
              itemId: payload.itemId,
              itemName: payload.itemName,
              owner: payload.owner,
              updatedAt: new Date().toISOString()
            }, null, 2);
          } else {
            newBodyStr = JSON.stringify({
              encrypted: false,
              ...payload,
              updatedAt: new Date().toISOString()
            }, null, 2);
          }

          await fetch('https://content.dropboxapi.com/2/files/upload', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Dropbox-API-Arg': JSON.stringify({
                path: filePath,
                mode: 'overwrite',
                autorename: false,
                mute: true
              }),
              'Content-Type': 'application/octet-stream'
            },
            body: newBodyStr
          });
        }
      } catch (err) {
        console.warn('[Dropbox] pushAllReceivedSharedItems error:', err);
      }
    }
  }

  // Chủ sở hữu quét cập nhật giao dịch do thành viên khác đẩy lên các mục mình đã share
  async pullAndMergeOwnedSharedProjections() {
    const ownedSetting = (await db.settings.get('syncOwnedSharedProjections')) || { value: [] };
    const list = Array.isArray(ownedSetting.value) ? ownedSetting.value.filter(x => x.service === 'dropbox') : [];
    if (list.length === 0) return false;

    let hasChanges = false;
    for (const item of list) {
      try {
        await this.projectAndPushItem(item.itemType, item.itemId, item.shareKey);
        hasChanges = true;
      } catch (err) {
        console.warn('[Dropbox] pullAndMergeOwnedSharedProjections error for item:', item, err);
      }
    }
    return hasChanges;
  }
}

window.dropboxService = new DropboxSync();
