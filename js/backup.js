/**
 * SỔ THU CHI - JSON BACKUP & RESTORE SERVICE
 * Hỗ trợ:
 * - Xuất & khôi phục toàn bộ dữ liệu offline
 * - Tự động sao lưu vào thư mục máy tính (File System Access API) dành cho người dùng offline không đăng nhập
 * - Mã hóa AES-GCM bảo vệ an toàn tệp sao lưu
 */

const BackupService = {
  localDirHandle: null,
  localDirName: '',

  async init() {
    try {
      const savedName = await db.settings.get('localBackupDirName');
      if (savedName && savedName.value) {
        this.localDirName = savedName.value;
      }
      const savedHandle = await db.settings.get('localBackupDirHandle');
      if (savedHandle && savedHandle.value) {
        this.localDirHandle = savedHandle.value;
      }
    } catch (e) {
      console.warn('BackupService init local folder warning:', e);
    }
  },

  isFileSystemAccessSupported() {
    return 'showDirectoryPicker' in window;
  },

  hasLocalDirectory() {
    return !!this.localDirHandle;
  },

  // Chọn thư mục máy tính để tự động sao lưu
  async selectBackupDirectory() {
    if (!this.isFileSystemAccessSupported()) {
      throw new Error('Trình duyệt hiện tại chưa hỗ trợ File System Access API. Bạn có thể sử dụng nút Tải File Sao Lưu.');
    }

    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      });

      this.localDirHandle = dirHandle;
      this.localDirName = dirHandle.name;

      await db.settings.put({ key: 'localBackupDirHandle', value: dirHandle });
      await db.settings.put({ key: 'localBackupDirName', value: dirHandle.name });

      // Thực hiện sao lưu thử nghiệm ngay sau khi chọn
      await this.autoSaveToDirectory();
      return this.localDirName;
    } catch (err) {
      if (err.name === 'AbortError') {
        return null; // Người dùng bấm hủy
      }
      throw err;
    }
  },

  // Hủy kết nối thư mục sao lưu máy tính
  async removeBackupDirectory() {
    this.localDirHandle = null;
    this.localDirName = '';
    await db.settings.delete('localBackupDirHandle');
    await db.settings.delete('localBackupDirName');
  },

  // Lấy toàn bộ dữ liệu CSDL
  async getFullDatabasePayload() {
    const transactions = await db.transactions.toArray();
    const accounts = await db.accounts.toArray();
    const categories = await db.categories.toArray();
    const debts = await db.debts.toArray();
    const budgets = await db.budgets.toArray();
    const recurring = await db.recurring.toArray();
    const settings = await db.settings.toArray();
    const savings = db.savings ? await db.savings.toArray() : [];
    const accumulations = db.accumulations ? await db.accumulations.toArray() : [];
    const assets = db.assets ? await db.assets.toArray() : [];
    const loans = db.loans ? await db.loans.toArray() : [];

    return {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      data: {
        transactions,
        accounts,
        categories,
        debts,
        budgets,
        recurring,
        settings,
        savings,
        accumulations,
        assets,
        loans
      }
    };
  },

  // Tự động ghi file sao lưu trực tiếp vào thư mục máy tính
  async autoSaveToDirectory() {
    if (!this.localDirHandle) return false;

    // Kiểm tra và yêu cầu quyền ghi nếu cần
    try {
      const permissionOpts = { mode: 'readwrite' };
      if ((await this.localDirHandle.queryPermission(permissionOpts)) !== 'granted') {
        const req = await this.localDirHandle.requestPermission(permissionOpts);
        if (req !== 'granted') {
          throw new Error('Chưa cấp quyền ghi vào thư mục máy tính.');
        }
      }

      const dataPayload = await this.getFullDatabasePayload();
      const encSetting = await db.settings.get('syncEncryptionPassword');
      const encryptionPassword = encSetting ? encSetting.value : null;

      let fileData;
      let filename;

      if (encryptionPassword && window.CryptoService) {
        const encrypted = await window.CryptoService.encrypt(JSON.stringify(dataPayload), encryptionPassword);
        fileData = JSON.stringify({ encrypted: true, payload: encrypted });
        filename = 'SoThuChi_AutoBackup.stc';
      } else {
        fileData = JSON.stringify(dataPayload, null, 2);
        filename = 'SoThuChi_AutoBackup.json';
      }

      // Ghi đè vào file sao lưu chính
      const fileHandle = await this.localDirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(fileData);
      await writable.close();

      console.log(`[BackupService] Đã tự động sao lưu vào thư mục máy tính: ${this.localDirName}/${filename}`);
      return true;
    } catch (err) {
      console.warn('Tự động sao lưu vào thư mục máy tính thất bại:', err);
      throw err;
    }
  },

  // Tải file sao lưu về máy (Export thủ công)
  async exportFullBackup(encryptionPassword = null) {
    const dataPayload = await this.getFullDatabasePayload();

    let fileData;
    let filename;

    if (encryptionPassword && window.CryptoService) {
      const encrypted = await window.CryptoService.encrypt(JSON.stringify(dataPayload), encryptionPassword);
      fileData = JSON.stringify({ encrypted: true, payload: encrypted });
      filename = `SoThuChi_Backup_Encrypted_${new Date().toISOString().slice(0, 10)}.stc`;
    } else {
      fileData = JSON.stringify(dataPayload, null, 2);
      filename = `SoThuChi_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    }

    const blob = new Blob([fileData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  },

  // Khôi phục dữ liệu từ tệp JSON / STC
  async importBackup(file, password = null) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          let content = e.target.result;
          let parsed = JSON.parse(content);

          if (parsed.encrypted) {
            if (!password) {
              throw new Error('Tệp này đã được mã hóa. Vui lòng nhập mật khẩu để khôi phục.');
            }
            const decrypted = await window.CryptoService.decrypt(parsed.payload, password);
            parsed = JSON.parse(decrypted);
          }

          if (!parsed.data) {
            throw new Error('Định dạng tệp sao lưu không hợp lệ.');
          }

          const { transactions, accounts, categories, debts, budgets, recurring, savings, accumulations, assets, loans } = parsed.data;

          const storesToLock = [db.transactions, db.accounts, db.categories, db.debts, db.budgets, db.recurring];
          if (db.savings) storesToLock.push(db.savings);
          if (db.accumulations) storesToLock.push(db.accumulations);
          if (db.assets) storesToLock.push(db.assets);
          if (db.loans) storesToLock.push(db.loans);

          await db.transaction('rw', storesToLock, async () => {
            if (transactions && transactions.length) {
              await db.transactions.clear();
              await db.transactions.bulkAdd(transactions);
            }
            if (accounts && accounts.length) {
              await db.accounts.clear();
              await db.accounts.bulkAdd(accounts);
            }
            if (categories && categories.length) {
              await db.categories.clear();
              await db.categories.bulkAdd(categories);
            }
            if (debts && debts.length) {
              await db.debts.clear();
              await db.debts.bulkAdd(debts);
            }
            if (budgets && budgets.length) {
              await db.budgets.clear();
              await db.budgets.bulkAdd(budgets);
            }
            if (recurring && recurring.length) {
              await db.recurring.clear();
              await db.recurring.bulkAdd(recurring);
            }
            if (savings && savings.length && db.savings) {
              await db.savings.clear();
              await db.savings.bulkAdd(savings);
            }
            if (accumulations && accumulations.length && db.accumulations) {
              await db.accumulations.clear();
              await db.accumulations.bulkAdd(accumulations);
            }
            if (assets && assets.length && db.assets) {
              await db.assets.clear();
              await db.assets.bulkAdd(assets);
            }
            if (loans && loans.length && db.loans) {
              await db.loans.clear();
              await db.loans.bulkAdd(loans);
            }
          });

          resolve({ success: true, count: (transactions || []).length });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Không thể đọc tệp sao lưu.'));
      reader.readAsText(file);
    });
  }
};

window.BackupService = BackupService;
