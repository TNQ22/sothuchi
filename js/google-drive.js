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
    this.autoSync = false;
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

  // Load saved configuration from DB
  async init() {
    try {
      const savedClientId = await db.settings.get('googleClientId');
      if (savedClientId && savedClientId.value) {
        this.clientId = savedClientId.value;
      }

      const autoSyncSetting = await db.settings.get('autoSyncEnabled');
      if (autoSyncSetting) {
        this.autoSync = !!autoSyncSetting.value;
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

  isAutoSyncEnabled() {
    return this.autoSync && this.accessToken !== null;
  }

  getTargetLabel() {
    if (this.storageLocation === 'customFolder') {
      return `Google Drive (${this.customFolderName || 'My Drive'})`;
    }
    return 'Google Drive (Vùng ứng dụng ẩn)';
  }

  // Yêu cầu Access Token từ Google Identity Services (GIS)
  async requestToken() {
    if (!this.clientId) {
      throw new Error('Vui lòng nhập Google Client ID trong mục Cài đặt trước khi kết nối.');
    }

    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      throw new Error('Thư viện Google Identity Services chưa tải xong hoặc máy đang ngoại tuyến.');
    }

    return new Promise((resolve, reject) => {
      try {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: this.clientId,
          scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
          callback: async (resp) => {
            if (resp.error) {
              reject(new Error(resp.error_description || resp.error));
              return;
            }
            this.accessToken = resp.access_token;

            // Tải thông tin tài khoản Google đăng nhập
            try {
              await this.fetchUserProfile();
            } catch (pErr) {
              console.warn('Lỗi khi tải profile Google:', pErr);
            }

            resolve(this.accessToken);
          }
        });

        this.tokenClient.requestAccessToken({ prompt: '' });
      } catch (err) {
        reject(err);
      }
    });
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

    const folderName = this.customFolderName || 'Sổ Thu Chi';
    const query = encodeURIComponent(`mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        this.customFolderId = data.files[0].id;
        return this.customFolderId;
      }
    }

    // Nếu chưa có, tạo thư mục mới
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      })
    });

    if (createRes.ok) {
      const created = await createRes.json();
      this.customFolderId = created.id;
      return this.customFolderId;
    }

    return null;
  }

  // Tìm file dữ liệu vault trên Google Drive (hỗ trợ cả AppData và Custom Folder)
  async findRemoteFile() {
    if (!this.accessToken) return null;

    let url;
    if (this.storageLocation === 'appDataFolder') {
      const query = encodeURIComponent(`name = '${this.syncFileName}' and trashed = false`);
      url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`;
    } else {
      const folderId = await this.ensureCustomFolder();
      let query;
      if (folderId) {
        query = encodeURIComponent(`'${folderId}' in parents and name = '${this.syncFileName}' and trashed = false`);
      } else {
        query = encodeURIComponent(`name = '${this.syncFileName}' and trashed = false`);
      }
      url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)`;
    }

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
      await db.settings.put({ key: 'googleDriveFileId', value: this.driveFileId });
      return this.driveFileId;
    }
    return null;
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
    if (!this.driveFileId) {
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
  async sync() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    const targetLabel = this.getTargetLabel();
    window.dispatchEvent(new CustomEvent('sync-start', { detail: { target: targetLabel } }));

    try {
      if (!this.accessToken) {
        await this.requestToken();
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
    if (!remoteData) {
      // Lần đầu sync: dữ liệu máy trở thành master
      const local = {
        transactions: await db.transactions.toArray(),
        accounts: await db.accounts.toArray(),
        categories: await db.categories.toArray(),
        debts: await db.debts.toArray(),
        budgets: await db.budgets.toArray(),
        recurring: await db.recurring.toArray(),
        savings: db.savings ? await db.savings.toArray() : [],
        accumulations: db.accumulations ? await db.accumulations.toArray() : [],
        assets: db.assets ? await db.assets.toArray() : [],
        loans: db.loans ? await db.loans.toArray() : []
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
            // Giải quyết xung đột: lấy bản ghi có updatedAt mới hơn
            const rTime = rItem.updatedAt || 0;
            const lTime = lItem.updatedAt || 0;
            if (rTime > lTime) {
              itemMap.set(lItem.id, { ...rItem, id: lItem.id });
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

    const finalTransactions = await mergeTable(db.transactions, await db.transactions.toArray(), remoteData.transactions);
    const finalAccounts = await mergeTable(db.accounts, await db.accounts.toArray(), remoteData.accounts);
    const finalCategories = await mergeTable(db.categories, await db.categories.toArray(), remoteData.categories);
    const finalDebts = await mergeTable(db.debts, await db.debts.toArray(), remoteData.debts);
    const finalBudgets = await mergeTable(db.budgets, await db.budgets.toArray(), remoteData.budgets);
    const finalRecurring = await mergeTable(db.recurring, await db.recurring.toArray(), remoteData.recurring);
    const finalSavings = db.savings ? await mergeTable(db.savings, await db.savings.toArray(), remoteData.savings) : [];
    const finalAccumulations = db.accumulations ? await mergeTable(db.accumulations, await db.accumulations.toArray(), remoteData.accumulations) : [];
    const finalAssets = db.assets ? await mergeTable(db.assets, await db.assets.toArray(), remoteData.assets) : [];
    const finalLoans = db.loans ? await mergeTable(db.loans, await db.loans.toArray(), remoteData.loans) : [];

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
      loans: finalLoans
    };
  }
}

window.googleDriveService = new GoogleDriveSync();
