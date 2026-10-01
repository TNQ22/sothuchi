/**
 * SỔ THU CHI - GOOGLE DRIVE CLIENT-SIDE SYNC ENGINE
 * Zero-Backend Serverless Synchronization
 * Lưu trữ & đồng bộ cơ sở dữ liệu trên Google Drive của người dùng
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
  }

  // Load saved configuration from DB
  async init() {
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
  }

  setClientId(id) {
    this.clientId = id.trim();
    db.settings.put({ key: 'googleClientId', value: this.clientId });
  }

  isAutoSyncEnabled() {
    return this.autoSync && this.accessToken !== null;
  }

  // Request Access Token from Google Identity Services
  async requestToken() {
    if (!this.clientId) {
      throw new Error('Vui lòng nhập Google Client ID trong mục Cài đặt trước khi kết nối.');
    }

    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      throw new Error('Thư viện Google Identity Services chưa sẵn sàng hoặc đang offline.');
    }

    return new Promise((resolve, reject) => {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
        callback: (resp) => {
          if (resp.error) {
            reject(new Error(resp.error_description || resp.error));
            return;
          }
          this.accessToken = resp.access_token;
          resolve(this.accessToken);
        }
      });

      this.tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  // Locate existing vault file on Drive or return null
  async findRemoteFile() {
    if (!this.accessToken) return null;

    const query = encodeURIComponent(`name = '${this.syncFileName}' and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!res.ok) {
      if (res.status === 401) {
        this.accessToken = null;
        throw new Error('Phiên đăng nhập Google đã hết hạn. Vui lòng kết nối lại.');
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

  // Download vault file content
  async downloadRemoteData(fileId) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!res.ok) throw new Error('Không thể tải tệp từ Google Drive.');
    let text = await res.text();
    let json = JSON.parse(text);

    if (json.encrypted && json.payload) {
      if (!this.encryptionPassword) {
        throw new Error('Dữ liệu trên Drive đã được mã hóa. Vui lòng nhập mật khẩu giải mã.');
      }
      const decrypted = await window.CryptoService.decrypt(json.payload, this.encryptionPassword);
      json = JSON.parse(decrypted);
    }

    return json;
  }

  // Upload or update vault file on Drive
  async uploadRemoteData(payloadObj) {
    let bodyText;
    if (this.encryptionPassword && window.CryptoService) {
      const encrypted = await window.CryptoService.encrypt(JSON.stringify(payloadObj), this.encryptionPassword);
      bodyText = JSON.stringify({ encrypted: true, payload: encrypted });
    } else {
      bodyText = JSON.stringify(payloadObj, null, 2);
    }

    if (!this.driveFileId) {
      // Create new file with multipart upload
      const metadata = {
        name: this.syncFileName,
        mimeType: 'application/json'
      };

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
      // Update existing file content
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

  // Two-way synchronization with Conflict Resolution (Last-Write-Wins per record)
  async sync() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    window.dispatchEvent(new CustomEvent('sync-start'));

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
        }
      }

      // Merge local and remote
      const merged = await this.mergeDatabases(remoteData ? remoteData.data : null);

      // Upload merged result back to Google Drive
      await this.uploadRemoteData({
        version: '2.0.0',
        syncedAt: new Date().toISOString(),
        data: merged
      });

      this.lastSyncTime = new Date().toISOString();
      await db.settings.put({ key: 'lastSyncTime', value: this.lastSyncTime });

      window.dispatchEvent(new CustomEvent('sync-success', { detail: { time: this.lastSyncTime } }));
      return { success: true, time: this.lastSyncTime };
    } catch (err) {
      console.error('Google Drive Sync Error:', err);
      window.dispatchEvent(new CustomEvent('sync-error', { detail: { error: err.message } }));
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  // Merge algorithm: Last-Write-Wins based on updatedAt
  async mergeDatabases(remoteData) {
    if (!remoteData) {
      // First time sync: local data becomes remote
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
      
      // Load local
      for (const item of localItems) {
        itemMap.set(item.id, item);
      }

      // Compare with remote
      if (remoteItems && Array.isArray(remoteItems)) {
        for (const rItem of remoteItems) {
          let lItem = itemMap.get(rItem.id);
          // Đối với tài khoản, nếu ID khác nhau nhưng cùng tên & loại -> ghép lại tránh bị lặp gấp đôi
          if (!lItem && table === db.accounts && rItem.name) {
            for (const existing of itemMap.values()) {
              if (existing.name && existing.name.trim().toLowerCase() === rItem.name.trim().toLowerCase() && existing.type === rItem.type) {
                lItem = existing;
                break;
              }
            }
          }

          if (!lItem) {
            // New from remote
            itemMap.set(rItem.id, rItem);
          } else {
            // Conflict resolution: pick higher updatedAt
            const rTime = rItem.updatedAt || 0;
            const lTime = lItem.updatedAt || 0;
            if (rTime > lTime) {
              itemMap.set(lItem.id, { ...rItem, id: lItem.id });
            }
          }
        }
      }

      const mergedArray = Array.from(itemMap.values());
      // Save merged array back to local IndexedDB
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
