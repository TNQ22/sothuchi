/**
 * SỔ THU CHI - DATABASE ENGINE (INDEXEDDB VIA DEXIE)
 * Offline-First Storage with Change-Tracking for Google Drive Sync
 */

const db = new Dexie('SoThuChiDB');

// Define Schema
db.version(1).stores({
  transactions: '++id, type, categoryId, accountId, toAccountId, amount, date, isDeleted, updatedAt',
  accounts: '++id, name, type, balance, isDeleted, updatedAt',
  categories: '++id, name, type, icon, color, isDeleted, updatedAt',
  debts: '++id, type, personName, originalAmount, remainingAmount, dueDate, accountId, status, isDeleted, updatedAt',
  budgets: '++id, categoryId, month, updatedAt',
  recurring: '++id, title, type, amount, categoryId, accountId, frequency, nextDueDate, updatedAt',
  settings: 'key'
});

// Default Seed Categories
const DEFAULT_CATEGORIES = [
  // Chi tiêu (Expense) - Quick items
  { name: 'Ăn uống & Cà phê', type: 'expense', icon: 'utensils', color: '#f43f5e', isQuick: 1 },
  { name: 'Đi chợ & Siêu thị', type: 'expense', icon: 'shopping-cart', color: '#fb7185', isQuick: 1 },
  { name: 'Di chuyển & Xăng', type: 'expense', icon: 'car', color: '#f59e0b', isQuick: 1 },
  { name: 'Hóa đơn & Điện nước', type: 'expense', icon: 'zap', color: '#eab308', isQuick: 1 },
  { name: 'Mua sắm đồ dùng', type: 'expense', icon: 'shopping-bag', color: '#ec4899', isQuick: 1 },
  { name: 'Nhà ở & Tiền thuê', type: 'expense', icon: 'home', color: '#8b5cf6', isQuick: 1 },
  { name: 'Sức khỏe & Y tế', type: 'expense', icon: 'heart-pulse', color: '#10b981', isQuick: 1 },
  { name: 'Giải trí & Phim ảnh', type: 'expense', icon: 'film', color: '#06b6d4', isQuick: 1 },
  { name: 'Giáo dục & Khóa học', type: 'expense', icon: 'graduation-cap', color: '#3b82f6', isQuick: 1 },
  { name: 'Gia đình & Con cái', type: 'expense', icon: 'users', color: '#6366f1', isQuick: 1 },
  { name: 'Chi phí khác', type: 'expense', icon: 'more-horizontal', color: '#64748b', isQuick: 1 },

  // Thu nhập (Income) - Quick items
  { name: 'Lương cố định', type: 'income', icon: 'banknote', color: '#10b981', isQuick: 1 },
  { name: 'Thưởng & Hoa hồng', type: 'income', icon: 'award', color: '#059669', isQuick: 1 },
  { name: 'Lợi nhuận đầu tư', type: 'income', icon: 'trending-up', color: '#0ea5e9', isQuick: 1 },
  { name: 'Thu nhập phụ', type: 'income', icon: 'briefcase', color: '#8b5cf6', isQuick: 0 },
  { name: 'Quà tặng & Cho', type: 'income', icon: 'gift', color: '#ec4899', isQuick: 0 },
  { name: 'Thu nhập khác', type: 'income', icon: 'plus-circle', color: '#64748b', isQuick: 0 }
];

// Default Seed Accounts
const DEFAULT_ACCOUNTS = [
  { name: 'Tiền mặt', type: 'cash', balance: 1500000, initialBalance: 1500000, icon: 'wallet', color: '#10b981' },
  { name: 'Ngân hàng', type: 'bank', balance: 12500000, initialBalance: 12500000, icon: 'landmark', color: '#4f46e5' },
  { name: 'Ví MoMo / ZaloPay', type: 'ewallet', balance: 500000, initialBalance: 500000, icon: 'smartphone', color: '#ec4899' }
];

// Initialize Database & Seed Defaults
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
    await db.accounts.bulkAdd(DEFAULT_ACCOUNTS.map(a => ({ ...a, isDeleted: 0, updatedAt: now })));
  } else {
    // Auto-migrate account name from 'Tài khoản Ngân hàng' to 'Ngân hàng'
    const oldBankAcc = await db.accounts.where('name').equals('Tài khoản Ngân hàng').first();
    if (oldBankAcc) {
      await db.accounts.update(oldBankAcc.id, { name: 'Ngân hàng', updatedAt: Date.now() });
    }
  }

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

  // If user checked "Đi vay để trả khoản này", create linked borrow debt record
  if (data.isBorrowed && data.borrowPerson) {
    await addDebt({
      type: 'borrow',
      personName: data.borrowPerson.trim(),
      originalAmount: tx.amount,
      dueDate: data.borrowDueDate || null,
      accountId: tx.accountId,
      note: `Vay để chi trả: ${data.note || 'Khoản chi'}`
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
  const now = Date.now();
  await db.categories.update(Number(id), {
    ...data,
    updatedAt: now
  });
  triggerAutoSync();
}

async function deleteCategory(id) {
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

    // If "lend" (cho mượn): money exits chosen wallet
    // If "borrow" (mượn nợ): money enters chosen wallet
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
    // If debt.type === 'lend' (thu hồi nợ cho vay) -> money enters wallet
    // If debt.type === 'borrow' (trả nợ đi vay) -> money exits wallet
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

// Calculation Utilities
async function getNetWorth() {
  const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
  const totalAccountBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);

  const activeDebts = await db.debts.where('isDeleted').equals(0).toArray();
  // lend = nợ cần thu (tài sản tăng)
  // borrow = nợ cần trả (nghĩa vụ tài chính)
  const totalLend = activeDebts.filter(d => d.type === 'lend' && d.status !== 'settled').reduce((s, d) => s + d.remainingAmount, 0);
  const totalBorrow = activeDebts.filter(d => d.type === 'borrow' && d.status !== 'settled').reduce((s, d) => s + d.remainingAmount, 0);

  return {
    totalAccountBalance,
    totalLend,
    totalBorrow,
    netWorth: totalAccountBalance + totalLend - totalBorrow
  };
}

// Auto-sync debouncer hook
let autoSyncTimeout = null;
function triggerAutoSync() {
  if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
  autoSyncTimeout = setTimeout(() => {
    if (window.googleDriveService && window.googleDriveService.isAutoSyncEnabled()) {
      window.googleDriveService.sync();
    }
  }, 3000);
}
