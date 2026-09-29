/**
 * SỔ THU CHI - JSON BACKUP & RESTORE SERVICE
 * Hỗ trợ sao lưu và khôi phục toàn bộ dữ liệu offline
 */

const BackupService = {
  // Export entire database as JSON
  async exportFullBackup(encryptionPassword = null) {
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

    const dataPayload = {
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
        assets
      }
    };

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

  // Restore database from JSON file
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

          const { transactions, accounts, categories, debts, budgets, recurring, savings, accumulations, assets } = parsed.data;

          const storesToLock = [db.transactions, db.accounts, db.categories, db.debts, db.budgets, db.recurring];
          if (db.savings) storesToLock.push(db.savings);
          if (db.accumulations) storesToLock.push(db.accumulations);
          if (db.assets) storesToLock.push(db.assets);

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
