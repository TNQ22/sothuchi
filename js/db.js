/**
 * Sá»” THU CHI - DATABASE ENGINE (INDEXEDDB VIA DEXIE)
 * Offline-First Storage with Change-Tracking for Google Drive Sync
 */

const db = new Dexie('SoThuChiDB');

// Define Schema Version 1
db.version(1).stores({
  transactions: '++id, type, categoryId, accountId, toAccountId, amount, date, isDeleted, updatedAt',
  accounts: '++id, name, type, balance, isDeleted, updatedAt',
  categories: '++id, name, type, icon, color, isDeleted, updatedAt',
  debts: '++id, type, personName, originalAmount, remainingAmount, dueDate, accountId, status, isDeleted, updatedAt',
  budgets: '++id, categoryId, month, updatedAt',
  recurring: '++id, title, type, amount, categoryId, accountId, frequency, nextDueDate, updatedAt',
  settings: 'key'
});

// Schema Version 2: Bá»• sung Quáº£n lÃ½ Sá»• Tiáº¿t Kiá»‡m, Sá»• TÃ­ch LÅ©y, Quáº£n lÃ½ TÃ i Sáº£n
db.version(2).stores({
  transactions: '++id, type, categoryId, accountId, toAccountId, amount, date, isDeleted, updatedAt',
  accounts: '++id, name, type, balance, isDeleted, updatedAt',
  categories: '++id, name, type, icon, color, isDeleted, updatedAt',
  debts: '++id, type, personName, originalAmount, remainingAmount, dueDate, accountId, status, isDeleted, updatedAt',
  budgets: '++id, categoryId, month, updatedAt',
  recurring: '++id, title, type, amount, categoryId, accountId, frequency, nextDueDate, updatedAt',
  settings: 'key',
  // Báº£ng quáº£n lÃ½ sá»• tiáº¿t kiá»‡m ngÃ¢n hÃ ng
  savings: '++id, name, bankCode, balance, status, dueDate, isDeleted, updatedAt',
  // Báº£ng quáº£n lÃ½ sá»• tÃ­ch lÅ©y theo má»¥c tiÃªu
  accumulations: '++id, name, targetAmount, currentAmount, status, isDeleted, updatedAt',
  // Báº£ng quáº£n lÃ½ tÃ i sáº£n (BÄS, Kim loáº¡i quÃ½, Ngoáº¡i tá»‡, TÃ i sáº£n khÃ¡c)
  assets: '++id, assetType, subType, name, status, includeInNetWorth, isDeleted, updatedAt',
  // Báº£ng quáº£n lÃ½ sá»• vay ngÃ¢n hÃ ng
  loans: '++id, name, bankCode, loanAmount, remainingAmount, status, isDeleted, updatedAt'
});

// Default Seed Categories
const DEFAULT_CATEGORIES = [
  // Chi tiÃªu (Expense) - Quick items
  { name: 'Ä‚n uá»‘ng & CÃ  phÃª', type: 'expense', icon: 'utensils', color: '#f43f5e', isQuick: 1 },
  { name: 'Äi chá»£ & SiÃªu thá»‹', type: 'expense', icon: 'shopping-cart', color: '#fb7185', isQuick: 1 },
  { name: 'Di chuyá»ƒn & XÄƒng', type: 'expense', icon: 'car', color: '#f59e0b', isQuick: 1 },
  { name: 'HÃ³a Ä‘Æ¡n & Äiá»‡n nÆ°á»›c', type: 'expense', icon: 'zap', color: '#eab308', isQuick: 1 },
  { name: 'Mua sáº¯m Ä‘á»“ dÃ¹ng', type: 'expense', icon: 'shopping-bag', color: '#ec4899', isQuick: 1 },
  { name: 'NhÃ  á»Ÿ & Tiá»n thuÃª', type: 'expense', icon: 'home', color: '#8b5cf6', isQuick: 1 },
  { name: 'Sá»©c khá»e & Y táº¿', type: 'expense', icon: 'heart-pulse', color: '#10b981', isQuick: 1 },
  { name: 'Giáº£i trÃ­ & Phim áº£nh', type: 'expense', icon: 'film', color: '#06b6d4', isQuick: 1 },
  { name: 'GiÃ¡o dá»¥c & KhÃ³a há»c', type: 'expense', icon: 'graduation-cap', color: '#3b82f6', isQuick: 1 },
  { name: 'Gia Ä‘Ã¬nh & Con cÃ¡i', type: 'expense', icon: 'users', color: '#6366f1', isQuick: 1 },
  // Tráº£ ná»£ vay ngÃ¢n hÃ ng (Danh má»¥c há»‡ thá»‘ng)
  { name: 'Tráº£ ná»£ vay ngÃ¢n hÃ ng', type: 'expense', icon: 'badge-percent', color: '#ef4444', isQuick: 0, isSystem: 1, systemKey: 'loan_repay' },
  { name: 'Chi phÃ­ khÃ¡c', type: 'expense', icon: 'more-horizontal', color: '#64748b', isQuick: 1 },

  // Thu nháº­p (Income) - Quick items
  { name: 'LÆ°Æ¡ng cá»‘ Ä‘á»‹nh', type: 'income', icon: 'banknote', color: '#10b981', isQuick: 1 },
  { name: 'ThÆ°á»Ÿng & Hoa há»“ng', type: 'income', icon: 'award', color: '#059669', isQuick: 1 },
  { name: 'Lá»£i nhuáº­n Ä‘áº§u tÆ°', type: 'income', icon: 'trending-up', color: '#0ea5e9', isQuick: 1 },
  { name: 'Thu nháº­p phá»¥', type: 'income', icon: 'briefcase', color: '#8b5cf6', isQuick: 0 },
  // Giáº£i ngÃ¢n khoáº£n vay (Danh má»¥c há»‡ thá»‘ng)
  { name: 'Giáº£i ngÃ¢n khoáº£n vay', type: 'income', icon: 'landmark', color: '#0ea5e9', isQuick: 0, isSystem: 1, systemKey: 'loan_disburse' },
  { name: 'QuÃ  táº·ng & Cho', type: 'income', icon: 'gift', color: '#ec4899', isQuick: 0 },
  { name: 'Thu nháº­p khÃ¡c', type: 'income', icon: 'plus-circle', color: '#64748b', isQuick: 0 }
];

// Default Seed Accounts
const DEFAULT_ACCOUNTS = [
  { name: 'Tiá»n máº·t', type: 'cash', balance: 0, initialBalance: 0, icon: 'wallet', color: '#10b981', order: 0 },
  { name: 'NgÃ¢n hÃ ng', type: 'bank', balance: 0, initialBalance: 0, icon: 'landmark', color: '#4f46e5', order: 1 },
  { name: 'VÃ­ Ä‘iá»‡n tá»­', type: 'ewallet', balance: 0, initialBalance: 0, icon: 'smartphone', color: '#ec4899', order: 2 }
];

// Tá»± Ä‘á»™ng kiá»ƒm tra vÃ  gá»™p tÃ i khoáº£n bá»‹ trÃ¹ng láº·p tÃªn & loáº¡i (kháº¯c phá»¥c nhÃ¢n Ä‘Ã´i trÃªn PWA/Sync)
async function deduplicateAccounts() {
  try {
    const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
    const seen = new Map();
    for (const acc of accounts) {
      const key = `${acc.name.trim().toLowerCase()}_${acc.type}`;
      if (!seen.has(key)) {
        seen.set(key, acc);
      } else {
        const existing = seen.get(key);
        // XÃ¡c Ä‘á»‹nh tÃ i khoáº£n nÃ o cÃ³ dá»¯ liá»‡u giao dá»‹ch hoáº·c sá»‘ dÆ° cao hÆ¡n
        const existingTxCount = await db.transactions.where('accountId').equals(existing.id).count();
        const currentTxCount = await db.transactions.where('accountId').equals(acc.id).count();

        let keep = existing;
        let remove = acc;
        if (currentTxCount > existingTxCount || (currentTxCount === existingTxCount && (acc.updatedAt || 0) > (existing.updatedAt || 0))) {
          keep = acc;
          remove = existing;
          seen.set(key, keep);
        }

        // Chuyá»ƒn toÃ n bá»™ giao dá»‹ch tá»« tÃ i khoáº£n trÃ¹ng sang tÃ i khoáº£n giá»¯ láº¡i
        const removeTxs = await db.transactions.where('accountId').equals(remove.id).toArray();
        for (const tx of removeTxs) {
          await db.transactions.update(tx.id, { accountId: keep.id });
        }
        const removeDebts = await db.debts.where('accountId').equals(remove.id).toArray();
        for (const d of removeDebts) {
          await db.debts.update(d.id, { accountId: keep.id });
        }

        // ÄÃ¡nh dáº¥u tÃ i khoáº£n trÃ¹ng lÃ  Ä‘Ã£ xÃ³a
        await db.accounts.update(remove.id, { isDeleted: 1, updatedAt: Date.now() });
        console.log(`[Deduplicate] ÄÃ£ gá»™p tÃ i khoáº£n trÃ¹ng "${remove.name}" (ID ${remove.id}) vÃ o ID ${keep.id}`);
      }
    }
  } catch (err) {
    console.warn('Lá»—i khi lá»c tÃ i khoáº£n trÃ¹ng:', err);
  }
}

async function initDatabase() {
  const categoryCount = await db.categories.count();
  if (categoryCount === 0) {
    const now = Date.now();
    await db.categories.bulkAdd(DEFAULT_CATEGORIES.map(c => ({ ...c, isDeleted: 0, updatedAt: now })));
  } else {
    // Ensure existing categories have isQuick initialized
    const cats = await db.categories.where('isDeleted').equals(0).toArray();
    const hasQuick = cats.some(c => c.isQuick !== undefined);
    if (!hasQuick) {
      const now = Date.now();
      for (let i = 0; i < cats.length; i++) {
        await db.categories.update(cats[i].id, { isQuick: i < 14 ? 1 : 0, updatedAt: now });
      }
    }
  }

  const accountCount = await db.accounts.count();
  if (accountCount === 0) {
    const now = Date.now();
    await db.accounts.bulkAdd(DEFAULT_ACCOUNTS.map((a, index) => ({ ...a, order: a.order ?? index, isDeleted: 0, updatedAt: now })));
  } else {
    // Tá»± Ä‘á»™ng kiá»ƒm tra vÃ  khá»Ÿi táº¡o order tuáº§n tá»± náº¿u cÃ³ tÃ i khoáº£n thiáº¿u order
    try {
      const allAccs = await db.accounts.where('isDeleted').equals(0).toArray();
      const needsOrder = allAccs.some(a => a.order === undefined || a.order === null);
      if (needsOrder) {
        allAccs.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));
        const now = Date.now();
        for (let i = 0; i < allAccs.length; i++) {
          if (allAccs[i].order !== i) {
            await db.accounts.update(allAccs[i].id, { order: i, updatedAt: now });
          }
        }
      }
    } catch (e) {
      console.warn('Init accounts order error:', e);
    }
    // Tá»± Ä‘á»™ng chuyá»ƒn Ä‘á»•i tÃªn vÃ  reset sá»‘ dÆ° ban Ä‘áº§u máº«u vá» 0Ä‘ cho cÃ¡c tÃ i khoáº£n máº·c Ä‘á»‹nh
    const defaultAccountsToReset = [
      { oldNames: ['MoMo / ZaloPay', 'Momo / ZaloPay', 'VÃ­ Ä‘iá»‡n tá»­'], oldInit: 500000, newName: 'VÃ­ Ä‘iá»‡n tá»­' },
      { oldNames: ['NgÃ¢n hÃ ng', 'TÃ i khoáº£n NgÃ¢n hÃ ng'], oldInit: 12500000, newName: 'NgÃ¢n hÃ ng' },
      { oldNames: ['Tiá»n máº·t'], oldInit: 1500000, newName: 'Tiá»n máº·t' }
    ];
    for (const item of defaultAccountsToReset) {
      for (const n of item.oldNames) {
        const acc = await db.accounts.where('name').equals(n).first();
        if (acc) {
          const updatePayload = { updatedAt: Date.now() };
          if (acc.name !== item.newName) {
            updatePayload.name = item.newName;
          }
          if (acc.initialBalance === item.oldInit) {
            updatePayload.initialBalance = 0;
            updatePayload.balance = Math.max(0, (acc.balance || 0) - item.oldInit);
          }
          if (Object.keys(updatePayload).length > 1 || updatePayload.name) {
            await db.accounts.update(acc.id, updatePayload);
          }
        }
      }
    }
  }

  // Äáº£m báº£o khá»Ÿi táº¡o 2 danh má»¥c há»‡ thá»‘ng cho sá»• vay vÃ  khÃ³a báº£o vá»‡
  const { disburseCat, repayCat } = await getLoanSystemCategories();

  // Tá»± Ä‘á»™ng kiá»ƒm tra vÃ  bÃ¹ giao dá»‹ch giáº£i ngÃ¢n cho cÃ¡c sá»• vay Ä‘Ã£ cÃ³ tÃ i khoáº£n nháº­n nhÆ°ng chÆ°a cÃ³ ghi chÃº thu chi
  if (db.loans) {
    try {
      const activeLoans = await db.loans.where('isDeleted').equals(0).toArray();
      for (const l of activeLoans) {
        if (l.disbursementAccountId && l.loanAmount > 0) {
          const existingTx = await db.transactions
            .filter(t => t.loanId === l.id && t.loanAction === 'disburse' && !t.isDeleted)
            .first();
          if (!existingTx) {
            const acc = await db.accounts.get(Number(l.disbursementAccountId));
            if (acc) {
              const nowTs = Date.now();
              await db.transactions.add({
                type: 'income',
                categoryId: disburseCat ? disburseCat.id : null,
                amount: l.loanAmount,
                fee: 0,
                accountId: acc.id,
                toAccountId: null,
                date: l.startDate || new Date().toISOString().split('T')[0],
                time: '09:00',
                note: `Giáº£i ngÃ¢n sá»• vay: ${l.name}`,
                excludeFromReport: l.excludeFromReport ? 1 : 0,
                images: [],
                loanId: l.id,
                loanAction: 'disburse',
                isDeleted: 0,
                createdAt: nowTs,
                updatedAt: nowTs
              });
            }
          } else if (!existingTx.categoryId && disburseCat) {
            await db.transactions.update(existingTx.id, {
              categoryId: disburseCat.id,
              updatedAt: Date.now()
            });
          }
        }
      }

      // Tá»± Ä‘á»™ng gÃ¡n categoryId cho cÃ¡c giao dá»‹ch tráº£ ná»£ gá»‘c hiá»‡n cÃ³ náº¿u chÆ°a cÃ³ categoryId
      if (repayCat) {
        const repayTxs = await db.transactions
          .filter(t => (t.loanAction === 'repay' || (t.note && t.note.startsWith('Tráº£ ná»£ gá»‘c sá»• vay:'))) && !t.categoryId && !t.isDeleted)
          .toArray();
        for (const rTx of repayTxs) {
          await db.transactions.update(rTx.id, {
            categoryId: repayCat.id,
            updatedAt: Date.now()
          });
        }
      }
    } catch (err) {
      console.warn('Loan disbursement auto-migration notice:', err);
    }
  }

  // Tá»± Ä‘á»™ng gá»™p vÃ  loáº¡i bá» tÃ i khoáº£n bá»‹ nhÃ¢n Ä‘Ã´i (do PWA khá»Ÿi táº¡o nhiá»u láº§n hoáº·c do sync)
  await deduplicateAccounts();

  // Seed default settings if empty
  const theme = await db.settings.get('theme');
  if (!theme) await db.settings.put({ key: 'theme', value: 'dark' });

  const privacy = await db.settings.get('privacyMode');
  if (!privacy) await db.settings.put({ key: 'privacyMode', value: false });

  const currency = await db.settings.get('currency');
  if (!currency) await db.settings.put({ key: 'currency', value: 'VND' });
}

// Transaction operations with automatic balance recalculation
async function addTransaction(data) {
  const now = Date.now();
  const currentTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const fee = Number(data.fee) || 0;
  const tx = {
    ...data,
    amount: Number(data.amount),
    fee: fee,
    accountId: Number(data.accountId),
    toAccountId: data.toAccountId ? Number(data.toAccountId) : null,
    categoryId: data.categoryId ? Number(data.categoryId) : null,
    date: data.date || new Date().toISOString().split('T')[0],
    time: data.time || currentTime,
    isDeleted: 0,
    updatedAt: now
  };

  // If user checked "Äi vay Ä‘á»ƒ tráº£ khoáº£n nÃ y", create linked borrow debt record
  if (data.isBorrowed && data.borrowPerson) {
    await addDebt({
      type: 'borrow',
      personName: data.borrowPerson.trim(),
      originalAmount: tx.amount,
      dueDate: data.borrowDueDate || null,
      accountId: tx.accountId,
      note: `Vay Ä‘á»ƒ chi tráº£: ${data.note || 'Khoáº£n chi'}`
    });
  }

  await db.transaction('rw', db.transactions, db.accounts, async () => {
    // Add transaction
    await db.transactions.add(tx);

    // Update account balances
    if (tx.type === 'expense') {
      const acc = await db.accounts.get(tx.accountId);
      if (acc) {
        await db.accounts.update(acc.id, { balance: acc.balance - (tx.amount + fee), updatedAt: now });
      }
    } else if (tx.type === 'income') {
      const acc = await db.accounts.get(tx.accountId);
      if (acc) {
        await db.accounts.update(acc.id, { balance: acc.balance + (tx.amount - fee), updatedAt: now });
      }
    } else if (tx.type === 'transfer' && tx.toAccountId) {
      const fromAcc = await db.accounts.get(tx.accountId);
      const toAcc = await db.accounts.get(tx.toAccountId);
      if (fromAcc) await db.accounts.update(fromAcc.id, { balance: fromAcc.balance - (tx.amount + fee), updatedAt: now });
      if (toAcc) await db.accounts.update(toAcc.id, { balance: toAcc.balance + tx.amount, updatedAt: now });
    }
  });

  // Trigger sync if enabled
  triggerAutoSync();
}

async function deleteTransaction(txId) {
  const now = Date.now();
  await db.transaction('rw', db.transactions, db.accounts, async () => {
    const tx = await db.transactions.get(Number(txId));
    if (!tx || tx.isDeleted) return;

    // Giao dá»‹ch thuá»™c Sá»• Vay NgÃ¢n HÃ ng pháº£i Ä‘Æ°á»£c quáº£n lÃ½ vÃ  xÃ³a thÃ´ng qua Sá»• Vay
    if (tx.loanId) {
      throw new Error('Giao dá»‹ch thuá»™c Sá»• Vay NgÃ¢n HÃ ng, khÃ´ng thá»ƒ xÃ³a trá»±c tiáº¿p! Vui lÃ²ng quáº£n lÃ½ trong má»¥c Sá»• Vay.');
    }

    const fee = Number(tx.fee) || 0;

    // Rollback account balance
    if (tx.type === 'expense') {
      const acc = await db.accounts.get(tx.accountId);
      if (acc) await db.accounts.update(acc.id, { balance: acc.balance + (tx.amount + fee), updatedAt: now });
    } else if (tx.type === 'income') {
      const acc = await db.accounts.get(tx.accountId);
      if (acc) await db.accounts.update(acc.id, { balance: acc.balance - (tx.amount - fee), updatedAt: now });
    } else if (tx.type === 'transfer' && tx.toAccountId) {
      const fromAcc = await db.accounts.get(tx.accountId);
      const toAcc = await db.accounts.get(tx.toAccountId);
      if (fromAcc) await db.accounts.update(fromAcc.id, { balance: fromAcc.balance + (tx.amount + fee), updatedAt: now });
      if (toAcc) await db.accounts.update(toAcc.id, { balance: toAcc.balance - tx.amount, updatedAt: now });
    }

    // Soft delete for sync capability
    await db.transactions.update(tx.id, { isDeleted: 1, updatedAt: now });
  });

  triggerAutoSync();
}

// Helper Ä‘áº£m báº£o danh má»¥c há»‡ thá»‘ng cho sá»• vay ngÃ¢n hÃ ng luÃ´n tá»“n táº¡i vÃ  Ä‘Æ°á»£c báº£o vá»‡
async function getLoanSystemCategories() {
  const cats = await db.categories.toArray();

  let disburseCat = cats.find(c => c.systemKey === 'loan_disburse' || c.name === 'Giáº£i ngÃ¢n khoáº£n vay');
  if (!disburseCat) {
    const now = Date.now();
    const id = await db.categories.add({
      name: 'Giáº£i ngÃ¢n khoáº£n vay',
      type: 'income',
      icon: 'landmark',
      color: '#0ea5e9',
      isQuick: 0,
      isSystem: 1,
      systemKey: 'loan_disburse',
      isDeleted: 0,
      updatedAt: now
    });
    disburseCat = { id, name: 'Giáº£i ngÃ¢n khoáº£n vay', type: 'income', icon: 'landmark', color: '#0ea5e9', isSystem: 1, systemKey: 'loan_disburse' };
  } else if (!disburseCat.isSystem || !disburseCat.systemKey || disburseCat.isDeleted) {
    await db.categories.update(disburseCat.id, {
      isSystem: 1,
      systemKey: 'loan_disburse',
      isDeleted: 0,
      updatedAt: Date.now()
    });
    disburseCat.isSystem = 1;
    disburseCat.systemKey = 'loan_disburse';
    disburseCat.isDeleted = 0;
  }

  let repayCat = cats.find(c => c.systemKey === 'loan_repay' || c.name === 'Tráº£ ná»£ vay ngÃ¢n hÃ ng');
  if (!repayCat) {
    const now = Date.now();
    const id = await db.categories.add({
      name: 'Tráº£ ná»£ vay ngÃ¢n hÃ ng',
      type: 'expense',
      icon: 'badge-percent',
      color: '#ef4444',
      isQuick: 0,
      isSystem: 1,
      systemKey: 'loan_repay',
      isDeleted: 0,
      updatedAt: now
    });
    repayCat = { id, name: 'Tráº£ ná»£ vay ngÃ¢n hÃ ng', type: 'expense', icon: 'badge-percent', color: '#ef4444', isSystem: 1, systemKey: 'loan_repay' };
  } else if (!repayCat.isSystem || !repayCat.systemKey || repayCat.isDeleted) {
    await db.categories.update(repayCat.id, {
      isSystem: 1,
      systemKey: 'loan_repay',
      isDeleted: 0,
      updatedAt: Date.now()
    });
    repayCat.isSystem = 1;
    repayCat.systemKey = 'loan_repay';
    repayCat.isDeleted = 0;
  }

  return { disburseCat, repayCat };
}

// Category Operations (CRUD)
async function addCategory(data) {
  const now = Date.now();
  const id = await db.categories.add({
    name: data.name.trim(),
    type: data.type || 'expense',
    icon: data.icon || 'tag',
    color: data.color || '#6366f1',
    isQuick: data.isQuick ? 1 : 0,
    isDeleted: 0,
    updatedAt: now
  });
  triggerAutoSync();
  return id;
}

async function updateCategory(id, data) {
  const cat = await db.categories.get(Number(id));
  if (cat && (cat.isSystem || cat.systemKey)) {
    // Cho phÃ©p Ä‘á»•i tráº¡ng thÃ¡i chá»n nhanh isQuick, nhÆ°ng khÃ³a khÃ´ng cho sá»­a tÃªn, loáº¡i
    if (data.name && data.name !== cat.name) {
      throw new Error('Danh má»¥c há»‡ thá»‘ng Ä‘Æ°á»£c báº£o vá»‡, khÃ´ng thá»ƒ sá»­a Ä‘á»•i tÃªn!');
    }
    if (data.type && data.type !== cat.type) {
      throw new Error('Danh má»¥c há»‡ thá»‘ng Ä‘Æ°á»£c báº£o vá»‡, khÃ´ng thá»ƒ sá»­a Ä‘á»•i loáº¡i!');
    }
  }
  const now = Date.now();
  await db.categories.update(Number(id), {
    ...data,
    updatedAt: now
  });
  triggerAutoSync();
}

async function deleteCategory(id) {
  const cat = await db.categories.get(Number(id));
  if (cat && (cat.isSystem || cat.systemKey)) {
    throw new Error('Danh má»¥c há»‡ thá»‘ng Ä‘Æ°á»£c báº£o vá»‡, khÃ´ng thá»ƒ xÃ³a!');
  }
  const now = Date.now();
  await db.categories.update(Number(id), {
    isDeleted: 1,
    updatedAt: now
  });
  triggerAutoSync();
}

// Debt Operations (Vay & Cho Vay)
async function addDebt(data) {
  const now = Date.now();
  const debt = {
    ...data,
    originalAmount: Number(data.originalAmount),
    remainingAmount: Number(data.originalAmount),
    accountId: Number(data.accountId),
    status: 'active', // 'active' | 'settled' | 'overdue'
    records: [], // list of payments
    isDeleted: 0,
    updatedAt: now
  };

  await db.transaction('rw', db.debts, db.accounts, async () => {
    await db.debts.add(debt);

    // If "lend" (cho mÆ°á»£n): money exits chosen wallet
    // If "borrow" (mÆ°á»£n ná»£): money enters chosen wallet
    const acc = await db.accounts.get(debt.accountId);
    if (acc) {
      const newBal = debt.type === 'lend' 
        ? acc.balance - debt.originalAmount 
        : acc.balance + debt.originalAmount;
      await db.accounts.update(acc.id, { balance: newBal, updatedAt: now });
    }
  });

  triggerAutoSync();
}

async function recordDebtPayment(debtId, paymentAmount, accountId, note = '') {
  const now = Date.now();
  const pAmount = Number(paymentAmount);
  const accId = Number(accountId);

  await db.transaction('rw', db.debts, db.accounts, async () => {
    const debt = await db.debts.get(Number(debtId));
    if (!debt || debt.isDeleted) return;

    const newRemaining = Math.max(0, debt.remainingAmount - pAmount);
    const newStatus = newRemaining === 0 ? 'settled' : debt.status;

    const paymentRecord = {
      amount: pAmount,
      date: new Date().toISOString().split('T')[0],
      accountId: accId,
      note: note,
      createdAt: now
    };

    const updatedRecords = [...(debt.records || []), paymentRecord];

    await db.debts.update(debt.id, {
      remainingAmount: newRemaining,
      status: newStatus,
      records: updatedRecords,
      updatedAt: now
    });

    // Update account balance:
    // If debt.type === 'lend' (thu há»“i ná»£ cho vay) -> money enters wallet
    // If debt.type === 'borrow' (tráº£ ná»£ Ä‘i vay) -> money exits wallet
    const acc = await db.accounts.get(accId);
    if (acc) {
      const newBal = debt.type === 'lend' 
        ? acc.balance + pAmount 
        : acc.balance - pAmount;
      await db.accounts.update(acc.id, { balance: newBal, updatedAt: now });
    }
  });

  triggerAutoSync();
}

async function deleteDebt(debtId) {
  const now = Date.now();
  await db.debts.update(Number(debtId), { isDeleted: 1, updatedAt: now });
  triggerAutoSync();
}

/* ==================== QUáº¢N LÃ Sá»” TIáº¾T KIá»†M (SAVINGS OPERATIONS) ==================== */
async function addSaving(data) {
  const now = Date.now();
  const amount = Number(data.balance || data.initialBalance || 0);
  const sourceAccountId = data.sourceAccountId ? Number(data.sourceAccountId) : null;

  const saving = {
    name: data.name.trim(),
    bankCode: data.bankCode || '',
    initialBalance: amount,
    balance: amount,
    currency: data.currency || 'VND',
    depositDate: data.depositDate || new Date().toISOString().split('T')[0],
    termMonths: Number(data.termMonths || 0), // 0: khÃ´ng ká»³ háº¡n
    dueDate: data.dueDate || '',
    interestRate: Number(data.interestRate || 0), // %/nÄƒm
    nonTermRate: Number(data.nonTermRate || 0.05), // %/nÄƒm
    interestDaysYear: Number(data.interestDaysYear || 365),
    interestPayment: data.interestPayment || 'end', // 'end' | 'start' | 'monthly'
    maturityAction: data.maturityAction || 'rollover_all', // 'rollover_all' | 'rollover_principal' | 'settle'
    sourceAccountId: sourceAccountId,
    settleAccountId: data.settleAccountId ? Number(data.settleAccountId) : null,
    status: 'active', // 'active' | 'settled'
    settledDate: null,
    settledAmount: 0,
    description: (data.description || '').trim(),
    excludeFromReport: data.excludeFromReport ? 1 : 0,
    isDeleted: 0,
    updatedAt: now
  };

  await db.transaction('rw', db.savings, db.accounts, async () => {
    const id = await db.savings.add(saving);
    // Náº¿u cÃ³ chá»n tÃ i khoáº£n trÃ­ch tiá»n, tá»± Ä‘á»™ng trá»« tiá»n trong tÃ i khoáº£n Ä‘Ã³
    if (sourceAccountId && amount > 0) {
      const srcAcc = await db.accounts.get(sourceAccountId);
      if (srcAcc) {
        await db.accounts.update(sourceAccountId, {
          balance: srcAcc.balance - amount,
          updatedAt: now
        });
      }
    }
  });

  triggerAutoSync();
}

async function updateSaving(id, data) {
  const now = Date.now();
  await db.savings.update(Number(id), {
    ...data,
    updatedAt: now
  });
  triggerAutoSync();
}

async function settleSaving(id, settleData) {
  const now = Date.now();
  const savingId = Number(id);
  const settleAmount = Number(settleData.settledAmount || 0);
  const targetAccountId = settleData.targetAccountId ? Number(settleData.targetAccountId) : null;

  await db.transaction('rw', db.savings, db.accounts, async () => {
    const saving = await db.savings.get(savingId);
    if (!saving || saving.isDeleted) return;

    await db.savings.update(savingId, {
      status: 'settled',
      settledDate: settleData.settledDate || new Date().toISOString().split('T')[0],
      settledAmount: settleAmount,
      updatedAt: now
    });

    // Náº¿u ngÆ°á»i dÃ¹ng chá»n tÃ i khoáº£n nháº­n tiá»n táº¥t toÃ¡n, cá»™ng tiá»n vÃ o tÃ i khoáº£n
    if (targetAccountId && settleAmount > 0) {
      const targetAcc = await db.accounts.get(targetAccountId);
      if (targetAcc) {
        await db.accounts.update(targetAccountId, {
          balance: targetAcc.balance + settleAmount,
          updatedAt: now
        });
      }
    }
  });

  triggerAutoSync();
}

async function deleteSaving(id) {
  const now = Date.now();
  await db.savings.update(Number(id), { isDeleted: 1, updatedAt: now });
  triggerAutoSync();
}

/* ==================== QUáº¢N LÃ Sá»” TÃCH LÅ¨Y (ACCUMULATIONS OPERATIONS) ==================== */
async function addAccumulation(data) {
  const now = Date.now();
  const targetAmount = Number(data.targetAmount || 0);
  const currentAmount = Number(data.currentAmount || 0);
  const sourceAccountId = data.sourceAccountId ? Number(data.sourceAccountId) : null;

  const accumulation = {
    name: data.name.trim(),
    targetAmount: targetAmount,
    currentAmount: currentAmount,
    currency: data.currency || 'VND',
    startDate: data.startDate || new Date().toISOString().split('T')[0],
    targetDate: data.targetDate || '',
    durationMonths: Number(data.durationMonths || 0),
    hasRecurring: data.hasRecurring ? 1 : 0,
    recurringAmount: Number(data.recurringAmount || 0),
    recurringFrequency: data.recurringFrequency || 'monthly',
    sourceAccountId: sourceAccountId,
    excludeFromReport: data.excludeFromReport ? 1 : 0,
    status: currentAmount >= targetAmount && targetAmount > 0 ? 'completed' : 'active',
    isDeleted: 0,
    updatedAt: now
  };

  // Chá»‘ng nhÃ¢n Ä‘Ã´i náº¿u submit liÃªn tiáº¿p trong vÃ²ng 2.5 giÃ¢y
  const recentAccDup = await db.accumulations
    .filter(a => !a.isDeleted && a.name === accumulation.name && a.targetAmount === accumulation.targetAmount && Math.abs((a.updatedAt || 0) - now) < 2500)
    .first();
  if (recentAccDup) {
    console.warn('Blocked duplicate accumulation submission:', accumulation.name);
    return recentAccDup.id;
  }

  await db.transaction('rw', db.accumulations, db.accounts, async () => {
    await db.accumulations.add(accumulation);
    // TrÃ­ch tiá»n khá»Ÿi Ä‘iá»ƒm tá»« tÃ i khoáº£n náº¿u cÃ³ chá»n
    if (sourceAccountId && currentAmount > 0) {
      const srcAcc = await db.accounts.get(sourceAccountId);
      if (srcAcc) {
        await db.accounts.update(sourceAccountId, {
          balance: srcAcc.balance - currentAmount,
          updatedAt: now
        });
      }
    }
  });

  triggerAutoSync();
}

async function updateAccumulation(id, data) {
  const now = Date.now();
  await db.accumulations.update(Number(id), {
    ...data,
    updatedAt: now
  });
  triggerAutoSync();
}

async function depositAccumulation(id, depositAmount, sourceAccountId) {
  const now = Date.now();
  const accId = Number(id);
  const amount = Number(depositAmount);
  const srcId = sourceAccountId ? Number(sourceAccountId) : null;

  await db.transaction('rw', db.accumulations, db.accounts, async () => {
    const item = await db.accumulations.get(accId);
    if (!item || item.isDeleted) return;

    const newAmount = item.currentAmount + amount;
    const isCompleted = item.targetAmount > 0 && newAmount >= item.targetAmount;

    await db.accumulations.update(accId, {
      currentAmount: newAmount,
      status: isCompleted ? 'completed' : 'active',
      updatedAt: now
    });

    if (srcId && amount > 0) {
      const srcAcc = await db.accounts.get(srcId);
      if (srcAcc) {
        await db.accounts.update(srcId, {
          balance: srcAcc.balance - amount,
          updatedAt: now
        });
      }
    }
  });

  triggerAutoSync();
}

async function deleteAccumulation(id) {
  const now = Date.now();
  await db.accumulations.update(Number(id), { isDeleted: 1, updatedAt: now });
  triggerAutoSync();
}

/* ==================== QUáº¢N LÃ TÃ€I Sáº¢N (ASSETS OPERATIONS) ==================== */
async function addAsset(data) {
  const now = Date.now();
  const quantity = Number(data.quantity || 1);
  const buyPrice = data.isGift ? 0 : Number(data.buyPrice || 0);
  const currentPrice = Number(data.currentPrice || buyPrice || 0);
  const extraCosts = Number(data.extraCosts || 0);
  const totalBuyValue = Math.round(data.isGift ? extraCosts : (quantity * buyPrice + extraCosts));
  const totalCurrentValue = Math.round(quantity * currentPrice);
  const sourceAccountId = data.sourceAccountId ? Number(data.sourceAccountId) : null;

  const asset = {
    assetType: data.assetType || 'other', // 'real_estate' | 'precious_metal' | 'foreign_currency' | 'other'
    subType: data.subType || '',
    name: data.name.trim(),
    isGift: data.isGift ? 1 : 0,
    buyDate: data.buyDate || new Date().toISOString().split('T')[0],
    quantity: quantity,
    unit: data.unit || 'Chiáº¿c',
    currency: data.currency || 'VND',
    buyPrice: buyPrice,
    currentPrice: currentPrice,
    totalBuyValue: totalBuyValue,
    totalCurrentValue: totalCurrentValue,
    exchangeRateBuy: Number(data.exchangeRateBuy || 1),
    exchangeRateCurrent: Number(data.exchangeRateCurrent || 1),
    extraCosts: extraCosts,
    sourceAccountId: sourceAccountId,
    location: (data.location || '').trim(),
    note: (data.note || '').trim(),
    includeInNetWorth: data.includeInNetWorth !== undefined ? (data.includeInNetWorth ? 1 : 0) : 1,
    status: 'holding', // 'holding' | 'liquidated'
    liquidatedDate: null,
    liquidatedPrice: 0,
    isDeleted: 0,
    updatedAt: now
  };

  // Chá»‘ng nhÃ¢n Ä‘Ã´i náº¿u submit liÃªn tiáº¿p trong vÃ²ng 2.5 giÃ¢y
  const recentAssetDup = await db.assets
    .filter(x => !x.isDeleted && x.name === asset.name && x.type === asset.type && Math.abs((x.updatedAt || 0) - now) < 2500)
    .first();
  if (recentAssetDup) {
    console.warn('Blocked duplicate asset submission:', asset.name);
    return recentAssetDup.id;
  }

  await db.transaction('rw', db.assets, db.accounts, async () => {
    await db.assets.add(asset);
    // Náº¿u cÃ³ chá»n tÃ i khoáº£n thanh toÃ¡n, trá»« tiá»n mua
    if (sourceAccountId && totalBuyValue > 0) {
      const srcAcc = await db.accounts.get(sourceAccountId);
      if (srcAcc) {
        await db.accounts.update(sourceAccountId, {
          balance: srcAcc.balance - totalBuyValue,
          updatedAt: now
        });
      }
    }
  });

  triggerAutoSync();
}

async function updateAsset(id, data) {
  const now = Date.now();
  const quantity = Number(data.quantity !== undefined ? data.quantity : 1);
  const currentPrice = Number(data.currentPrice !== undefined ? data.currentPrice : 0);
  const totalCurrentValue = Math.round(quantity * currentPrice);

  await db.assets.update(Number(id), {
    ...data,
    totalCurrentValue,
    updatedAt: now
  });
  triggerAutoSync();
}

async function liquidateAsset(id, liquidateData) {
  const now = Date.now();
  const assetId = Number(id);
  const salePrice = Number(liquidateData.salePrice || 0);
  const targetAccountId = liquidateData.targetAccountId ? Number(liquidateData.targetAccountId) : null;

  await db.transaction('rw', db.assets, db.accounts, async () => {
    const item = await db.assets.get(assetId);
    if (!item || item.isDeleted) return;

    await db.assets.update(assetId, {
      status: 'liquidated',
      liquidatedDate: liquidateData.liquidatedDate || new Date().toISOString().split('T')[0],
      liquidatedPrice: salePrice,
      updatedAt: now
    });

    if (targetAccountId && salePrice > 0) {
      const acc = await db.accounts.get(targetAccountId);
      if (acc) {
        await db.accounts.update(targetAccountId, {
          balance: acc.balance + salePrice,
          updatedAt: now
        });
      }
    }
  });

  triggerAutoSync();
}

async function deleteAsset(id) {
  const now = Date.now();
  await db.assets.update(Number(id), { isDeleted: 1, updatedAt: now });
  triggerAutoSync();
}

// ==================== LOANS (Sá»” VAY NGÃ‚N HÃ€NG) CRUD ====================
async function addLoan(loanData) {
  const now = new Date().toISOString();
  const nowTs = Date.now();
  const loan = {
    ...loanData,
    remainingAmount: loanData.loanAmount,
    status: 'active',
    isDeleted: 0,
    createdAt: now,
    updatedAt: now
  };

  let id;
  const disburseAccId = loan.disbursementAccountId ? Number(loan.disbursementAccountId) : null;
  if (disburseAccId && loan.loanAmount > 0) {
    const { disburseCat } = await getLoanSystemCategories();
    await db.transaction('rw', db.loans, db.accounts, db.transactions, db.categories, async () => {
      id = await db.loans.add(loan);
      const acc = await db.accounts.get(disburseAccId);
      if (acc) {
        await db.accounts.update(acc.id, {
          balance: (acc.balance || 0) + loan.loanAmount,
          updatedAt: nowTs
        });
        // ThÃªm ghi chÃº giao dá»‹ch thu nháº­p giáº£i ngÃ¢n vÃ o vÃ­
        await db.transactions.add({
          type: 'income',
          categoryId: disburseCat ? disburseCat.id : null,
          amount: loan.loanAmount,
          fee: 0,
          accountId: acc.id,
          toAccountId: null,
          date: loan.startDate || now.split('T')[0],
          time: new Date().toTimeString().slice(0, 5),
          note: `Giáº£i ngÃ¢n sá»• vay: ${loan.name}`,
          excludeFromReport: loan.excludeFromReport ? 1 : 0,
          images: [],
          loanId: id,
          loanAction: 'disburse',
          isDeleted: 0,
          createdAt: nowTs,
          updatedAt: nowTs
        });
      }
    });
  } else {
    id = await db.loans.add(loan);
  }
  triggerAutoSync();
  return id;
}

async function updateLoan(id, loanData) {
  const lId = Number(id);
  const now = new Date().toISOString();
  const nowTs = Date.now();

  const { disburseCat } = await getLoanSystemCategories();

  await db.transaction('rw', db.loans, db.accounts, db.transactions, db.categories, async () => {
    const oldLoan = await db.loans.get(lId);
    if (!oldLoan || oldLoan.isDeleted) return;

    let remaining = oldLoan.remainingAmount !== undefined ? oldLoan.remainingAmount : (oldLoan.loanAmount || 0);

    // Náº¿u ngÆ°á»i dÃ¹ng thay Ä‘á»•i sá»‘ tiá»n vay ban Ä‘áº§u (vÃ­ dá»¥ sá»­a lÃºc nháº­p nháº§m):
    if (loanData.loanAmount !== undefined && loanData.loanAmount !== oldLoan.loanAmount) {
      const history = oldLoan.repaymentHistory || [];
      const totalPaid = history.reduce((sum, h) => sum + (h.amount || 0), 0);
      remaining = Math.max(0, loanData.loanAmount - totalPaid);
    }

    // Xá»­ lÃ½ Ä‘á»“ng bá»™ ghi chÃº giao dá»‹ch giáº£i ngÃ¢n vÃ o vÃ­
    const oldDisburseTx = await db.transactions
      .filter(t => t.loanId === lId && t.loanAction === 'disburse' && !t.isDeleted)
      .first();

    const newDisburseAccId = loanData.disbursementAccountId ? Number(loanData.disbursementAccountId) : null;
    const newLoanAmount = loanData.loanAmount !== undefined ? Number(loanData.loanAmount) : (oldLoan.loanAmount || 0);
    const newStartDate = loanData.startDate || oldLoan.startDate || now.split('T')[0];
    const newName = loanData.name || oldLoan.name;
    const newExclude = loanData.excludeFromReport !== undefined ? (loanData.excludeFromReport ? 1 : 0) : (oldLoan.excludeFromReport ? 1 : 0);

    if (oldDisburseTx) {
      const oldAccId = oldDisburseTx.accountId;
      const oldAmount = oldDisburseTx.amount || 0;

      if (!newDisburseAccId) {
        // Äá»•i sang khÃ´ng cá»™ng vÃ o vÃ­: hoÃ n tÃ¡c sá»‘ dÆ° vÃ­ cÅ© vÃ  xÃ³a giao dá»‹ch giáº£i ngÃ¢n
        const oldAcc = await db.accounts.get(oldAccId);
        if (oldAcc) {
          await db.accounts.update(oldAccId, {
            balance: (oldAcc.balance || 0) - oldAmount,
            updatedAt: nowTs
          });
        }
        await db.transactions.update(oldDisburseTx.id, {
          isDeleted: 1,
          updatedAt: nowTs
        });
      } else if (oldAccId === newDisburseAccId) {
        // Váº«n cÃ¹ng vÃ­: Ä‘iá»u chá»‰nh sá»‘ dÆ° chÃªnh lá»‡ch (náº¿u Ä‘á»•i loanAmount) vÃ  cáº­p nháº­t thÃ´ng tin giao dá»‹ch
        const diff = newLoanAmount - oldAmount;
        if (diff !== 0) {
          const acc = await db.accounts.get(newDisburseAccId);
          if (acc) {
            await db.accounts.update(newDisburseAccId, {
              balance: (acc.balance || 0) + diff,
              updatedAt: nowTs
            });
          }
        }
        await db.transactions.update(oldDisburseTx.id, {
          categoryId: disburseCat ? disburseCat.id : (oldDisburseTx.categoryId || null),
          amount: newLoanAmount,
          date: newStartDate,
          note: `Giáº£i ngÃ¢n sá»• vay: ${newName}`,
          excludeFromReport: newExclude,
          updatedAt: nowTs
        });
      } else {
        // Äá»•i sang vÃ­ khÃ¡c: trá»« vÃ­ cÅ©, cá»™ng vÃ­ má»›i, cáº­p nháº­t transaction
        const oldAcc = await db.accounts.get(oldAccId);
        if (oldAcc) {
          await db.accounts.update(oldAccId, {
            balance: (oldAcc.balance || 0) - oldAmount,
            updatedAt: nowTs
          });
        }
        const newAcc = await db.accounts.get(newDisburseAccId);
        if (newAcc) {
          await db.accounts.update(newDisburseAccId, {
            balance: (newAcc.balance || 0) + newLoanAmount,
            updatedAt: nowTs
          });
        }
        await db.transactions.update(oldDisburseTx.id, {
          categoryId: disburseCat ? disburseCat.id : (oldDisburseTx.categoryId || null),
          accountId: newDisburseAccId,
          amount: newLoanAmount,
          date: newStartDate,
          note: `Giáº£i ngÃ¢n sá»• vay: ${newName}`,
          excludeFromReport: newExclude,
          updatedAt: nowTs
        });
      }
    } else {
      // ChÆ°a tá»«ng cÃ³ giao dá»‹ch giáº£i ngÃ¢n vÃ o vÃ­ (lÃºc táº¡o Ä‘á»ƒ ngoÃ i vÃ­, giá» chá»n vÃ­ nháº­n)
      if (newDisburseAccId && newLoanAmount > 0) {
        const acc = await db.accounts.get(newDisburseAccId);
        if (acc) {
          await db.accounts.update(acc.id, {
            balance: (acc.balance || 0) + newLoanAmount,
            updatedAt: nowTs
          });
          await db.transactions.add({
            type: 'income',
            categoryId: disburseCat ? disburseCat.id : null,
            amount: newLoanAmount,
            fee: 0,
            accountId: acc.id,
            toAccountId: null,
            date: newStartDate,
            time: new Date().toTimeString().slice(0, 5),
            note: `Giáº£i ngÃ¢n sá»• vay: ${newName}`,
            excludeFromReport: newExclude,
            images: [],
            loanId: lId,
            loanAction: 'disburse',
            isDeleted: 0,
            createdAt: nowTs,
            updatedAt: nowTs
          });
        }
      }
    }

    await db.loans.update(lId, {
      ...loanData,
      remainingAmount: remaining,
      status: remaining <= 0 ? 'settled' : 'active',
      updatedAt: now
    });
  });

  triggerAutoSync();
}

async function payLoan(loanId, paymentAmount, sourceAccountId = null, dateStr = null) {
  const lId = Number(loanId);
  const now = new Date().toISOString();
  const nowTs = Date.now();
  const pDate = dateStr || now.split('T')[0];

  const { repayCat } = await getLoanSystemCategories();

  await db.transaction('rw', db.loans, db.accounts, db.transactions, db.categories, async () => {
    const loan = await db.loans.get(lId);
    if (!loan || loan.isDeleted) return;

    const newRemaining = Math.max(0, (loan.remainingAmount || loan.loanAmount || 0) - paymentAmount);
    const isFullyPaid = newRemaining <= 0;

    const history = loan.repaymentHistory || [];
    history.push({
      date: pDate,
      amount: paymentAmount,
      sourceAccountId: sourceAccountId ? Number(sourceAccountId) : null,
      note: `Tráº£ ná»£ gá»‘c sá»• vay: ${loan.name}`,
      createdAt: now
    });

    await db.loans.update(lId, {
      remainingAmount: newRemaining,
      status: isFullyPaid ? 'settled' : 'active',
      settledDate: isFullyPaid ? pDate : null,
      repaymentHistory: history,
      updatedAt: now
    });

    if (sourceAccountId) {
      const src = await db.accounts.get(Number(sourceAccountId));
      if (src) {
        await db.accounts.update(src.id, {
          balance: (src.balance || 0) - paymentAmount,
          updatedAt: nowTs
        });
        // Ghi nháº­n giao dá»‹ch chi phÃ­ tráº£ ná»£ gá»‘c vÃ o vÃ­
        await db.transactions.add({
          type: 'expense',
          categoryId: repayCat ? repayCat.id : null,
          amount: paymentAmount,
          fee: 0,
          accountId: src.id,
          toAccountId: null,
          date: pDate,
          time: new Date().toTimeString().slice(0, 5),
          note: `Tráº£ ná»£ gá»‘c sá»• vay: ${loan.name}`,
          excludeFromReport: loan.excludeFromReport ? 1 : 0,
          images: [],
          loanId: lId,
          loanAction: 'repay',
          isDeleted: 0,
          createdAt: nowTs,
          updatedAt: nowTs
        });
      }
    }
  });

  triggerAutoSync();
}

async function deleteLoan(id) {
  const lId = Number(id);
  const now = new Date().toISOString();
  const nowTs = Date.now();

  await db.transaction('rw', db.loans, db.accounts, db.transactions, async () => {
    const loan = await db.loans.get(lId);
    if (!loan || loan.isDeleted) return;

    // TÃ¬m cÃ¡c giao dá»‹ch liÃªn quan Ä‘áº¿n sá»• vay vÃ  hoÃ n tÃ¡c sá»‘ dÆ° vÃ­
    const relatedTxs = await db.transactions
      .filter(t => t.loanId === lId && !t.isDeleted)
      .toArray();

    for (const tx of relatedTxs) {
      const acc = await db.accounts.get(tx.accountId);
      if (acc) {
        if (tx.type === 'income') {
          await db.accounts.update(acc.id, {
            balance: (acc.balance || 0) - tx.amount,
            updatedAt: nowTs
          });
        } else if (tx.type === 'expense') {
          await db.accounts.update(acc.id, {
            balance: (acc.balance || 0) + tx.amount,
            updatedAt: nowTs
          });
        }
      }
      await db.transactions.update(tx.id, {
        isDeleted: 1,
        updatedAt: nowTs
      });
    }

    await db.loans.update(lId, { isDeleted: 1, updatedAt: now });
  });

  triggerAutoSync();
}

// Calculation Utilities
async function getNetWorth() {
  const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
  const totalAccountBalance = accounts.filter(a => !a.isArchived).reduce((sum, a) => sum + (a.balance || 0), 0);

  // Sá»• tiáº¿t kiá»‡m Ä‘ang gá»­i
  let totalSavings = 0;
  try {
    if (db.savings) {
      const savingsList = await db.savings.where('isDeleted').equals(0).toArray();
      totalSavings = savingsList.filter(s => s.status !== 'settled').reduce((sum, s) => sum + (s.balance || 0), 0);
    }
  } catch (e) {
    console.warn('Savings read error:', e);
  }

  // Sá»• tÃ­ch lÅ©y
  let totalAccumulations = 0;
  try {
    if (db.accumulations) {
      const accList = await db.accumulations.where('isDeleted').equals(0).toArray();
      totalAccumulations = accList.reduce((sum, a) => sum + (a.currentAmount || 0), 0);
    }
  } catch (e) {
    console.warn('Accumulations read error:', e);
  }

  // TÃ i sáº£n (Báº¥t Ä‘á»™ng sáº£n, Kim loáº¡i quÃ½, Ngoáº¡i tá»‡, TÃ i sáº£n khÃ¡c)
  let totalAssets = 0;
  try {
    if (db.assets) {
      const assetList = await db.assets.where('isDeleted').equals(0).toArray();
      totalAssets = assetList
        .filter(a => a.status !== 'liquidated' && a.includeInNetWorth !== 0)
        .reduce((sum, a) => sum + (a.totalCurrentValue !== undefined ? a.totalCurrentValue : ((a.currentPrice || 0) * (a.quantity || 1))), 0);
    }
  } catch (e) {
    console.warn('Assets read error:', e);
  }

  // Sá»• vay ngÃ¢n hÃ ng (NghÄ©a vá»¥ ná»£ gá»‘c cÃ²n láº¡i)
  let totalLoans = 0;
  try {
    if (db.loans) {
      const loanList = await db.loans.where('isDeleted').equals(0).toArray();
      totalLoans = loanList.filter(l => l.status !== 'settled').reduce((sum, l) => sum + (l.remainingAmount !== undefined ? l.remainingAmount : (l.loanAmount || 0)), 0);
    }
  } catch (e) {
    console.warn('Loans read error:', e);
  }

  const activeDebts = await db.debts.where('isDeleted').equals(0).toArray();
  // lend = ná»£ cáº§n thu (tÃ i sáº£n tÄƒng)
  // borrow = ná»£ cáº§n tráº£ (nghÄ©a vá»¥ tÃ i chÃ­nh)
  const totalLend = activeDebts.filter(d => d.type === 'lend' && d.status !== 'settled').reduce((s, d) => s + d.remainingAmount, 0);
  const totalBorrow = activeDebts.filter(d => d.type === 'borrow' && d.status !== 'settled').reduce((s, d) => s + d.remainingAmount, 0) + totalLoans;

  const grandTotalAssets = totalAccountBalance + totalSavings + totalAccumulations + totalAssets;

  return {
    totalAccountBalance,
    totalSavings,
    totalAccumulations,
    totalAssets,
    totalLoans,
    grandTotalAssets,
    totalLend,
    totalBorrow,
    netWorth: grandTotalAssets + totalLend - totalBorrow
  };
}

// Auto-sync debouncer hook
let autoSyncTimeout = null;
function triggerAutoSync() { if (window.SyncCoordinator) { window.SyncCoordinator.notifyDataChange(); } else { if (autoSyncTimeout) clearTimeout(autoSyncTimeout); autoSyncTimeout = setTimeout(() => { if (window.googleDriveService && window.googleDriveService.isAutoSyncEnabled()) { window.googleDriveService.sync(); } }, 3000); } }

