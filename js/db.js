/**
 * SỔ THU CHI - DATABASE ENGINE (INDEXEDDB VIA DEXIE)
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

// Schema Version 2: Bổ sung Quản lý Sổ Tiết Kiệm, Sổ Tích Lũy, Quản lý Tài Sản
db.version(2).stores({
  transactions: '++id, type, categoryId, accountId, toAccountId, amount, date, isDeleted, updatedAt',
  accounts: '++id, name, type, balance, isDeleted, updatedAt',
  categories: '++id, name, type, icon, color, isDeleted, updatedAt',
  debts: '++id, type, personName, originalAmount, remainingAmount, dueDate, accountId, status, isDeleted, updatedAt',
  budgets: '++id, categoryId, month, updatedAt',
  recurring: '++id, title, type, amount, categoryId, accountId, frequency, nextDueDate, updatedAt',
  settings: 'key',
  // Bảng quản lý sổ tiết kiệm ngân hàng
  savings: '++id, name, bankCode, balance, status, dueDate, isDeleted, updatedAt',
  // Bảng quản lý sổ tích lũy theo mục tiêu
  accumulations: '++id, name, targetAmount, currentAmount, status, isDeleted, updatedAt',
  // Bảng quản lý tài sản (BĐS, Kim loại quý, Ngoại tệ, Tài sản khác)
  assets: '++id, assetType, subType, name, status, includeInNetWorth, isDeleted, updatedAt',
  // Bảng quản lý sổ vay ngân hàng
  loans: '++id, name, bankCode, loanAmount, remainingAmount, status, isDeleted, updatedAt'
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
  // Trả nợ vay ngân hàng (Danh mục hệ thống)
  { name: 'Trả nợ vay ngân hàng', type: 'expense', icon: 'badge-percent', color: '#ef4444', isQuick: 0, isSystem: 1, systemKey: 'loan_repay' },
  { name: 'Chi phí khác', type: 'expense', icon: 'more-horizontal', color: '#64748b', isQuick: 1 },

  // Thu nhập (Income) - Quick items
  { name: 'Lương cố định', type: 'income', icon: 'banknote', color: '#10b981', isQuick: 1 },
  { name: 'Thưởng & Hoa hồng', type: 'income', icon: 'award', color: '#059669', isQuick: 1 },
  { name: 'Lợi nhuận đầu tư', type: 'income', icon: 'trending-up', color: '#0ea5e9', isQuick: 1 },
  { name: 'Thu nhập phụ', type: 'income', icon: 'briefcase', color: '#8b5cf6', isQuick: 0 },
  // Giải ngân khoản vay (Danh mục hệ thống)
  { name: 'Giải ngân khoản vay', type: 'income', icon: 'landmark', color: '#0ea5e9', isQuick: 0, isSystem: 1, systemKey: 'loan_disburse' },
  { name: 'Quà tặng & Cho', type: 'income', icon: 'gift', color: '#ec4899', isQuick: 0 },
  { name: 'Thu nhập khác', type: 'income', icon: 'plus-circle', color: '#64748b', isQuick: 0 }
];

// Default Seed Accounts
const DEFAULT_ACCOUNTS = [
  { name: 'Tiền mặt', type: 'cash', balance: 0, initialBalance: 0, icon: 'wallet', color: '#10b981' },
  { name: 'Ngân hàng', type: 'bank', balance: 0, initialBalance: 0, icon: 'landmark', color: '#4f46e5' },
  { name: 'Ví điện tử', type: 'ewallet', balance: 0, initialBalance: 0, icon: 'smartphone', color: '#ec4899' }
];

// Tự động kiểm tra và gộp tài khoản bị trùng lặp tên & loại (khắc phục nhân đôi trên PWA/Sync)
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
        // Xác định tài khoản nào có dữ liệu giao dịch hoặc số dư cao hơn
        const existingTxCount = await db.transactions.where('accountId').equals(existing.id).count();
        const currentTxCount = await db.transactions.where('accountId').equals(acc.id).count();

        let keep = existing;
        let remove = acc;
        if (currentTxCount > existingTxCount || (currentTxCount === existingTxCount && (acc.updatedAt || 0) > (existing.updatedAt || 0))) {
          keep = acc;
          remove = existing;
          seen.set(key, keep);
        }

        // Chuyển toàn bộ giao dịch từ tài khoản trùng sang tài khoản giữ lại
        const removeTxs = await db.transactions.where('accountId').equals(remove.id).toArray();
        for (const tx of removeTxs) {
          await db.transactions.update(tx.id, { accountId: keep.id });
        }
        const removeDebts = await db.debts.where('accountId').equals(remove.id).toArray();
        for (const d of removeDebts) {
          await db.debts.update(d.id, { accountId: keep.id });
        }

        // Đánh dấu tài khoản trùng là đã xóa
        await db.accounts.update(remove.id, { isDeleted: 1, updatedAt: Date.now() });
        console.log(`[Deduplicate] Đã gộp tài khoản trùng "${remove.name}" (ID ${remove.id}) vào ID ${keep.id}`);
      }
    }
  } catch (err) {
    console.warn('Lỗi khi lọc tài khoản trùng:', err);
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
    await db.accounts.bulkAdd(DEFAULT_ACCOUNTS.map(a => ({ ...a, isDeleted: 0, updatedAt: now })));
  } else {
    // Tự động chuyển đổi tên và reset số dư ban đầu mẫu về 0đ cho các tài khoản mặc định
    const defaultAccountsToReset = [
      { oldNames: ['MoMo / ZaloPay', 'Momo / ZaloPay', 'Ví điện tử'], oldInit: 500000, newName: 'Ví điện tử' },
      { oldNames: ['Ngân hàng', 'Tài khoản Ngân hàng'], oldInit: 12500000, newName: 'Ngân hàng' },
      { oldNames: ['Tiền mặt'], oldInit: 1500000, newName: 'Tiền mặt' }
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

  // Đảm bảo khởi tạo 2 danh mục hệ thống cho sổ vay và khóa bảo vệ
  const { disburseCat, repayCat } = await getLoanSystemCategories();

  // Tự động kiểm tra và bù giao dịch giải ngân cho các sổ vay đã có tài khoản nhận nhưng chưa có ghi chú thu chi
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
                note: `Giải ngân sổ vay: ${l.name}`,
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

      // Tự động gán categoryId cho các giao dịch trả nợ gốc hiện có nếu chưa có categoryId
      if (repayCat) {
        const repayTxs = await db.transactions
          .filter(t => (t.loanAction === 'repay' || (t.note && t.note.startsWith('Trả nợ gốc sổ vay:'))) && !t.categoryId && !t.isDeleted)
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

  // Tự động gộp và loại bỏ tài khoản bị nhân đôi (do PWA khởi tạo nhiều lần hoặc do sync)
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

// Helper đảm bảo danh mục hệ thống cho sổ vay ngân hàng luôn tồn tại và được bảo vệ
async function getLoanSystemCategories() {
  const cats = await db.categories.toArray();

  let disburseCat = cats.find(c => c.systemKey === 'loan_disburse' || c.name === 'Giải ngân khoản vay');
  if (!disburseCat) {
    const now = Date.now();
    const id = await db.categories.add({
      name: 'Giải ngân khoản vay',
      type: 'income',
      icon: 'landmark',
      color: '#0ea5e9',
      isQuick: 0,
      isSystem: 1,
      systemKey: 'loan_disburse',
      isDeleted: 0,
      updatedAt: now
    });
    disburseCat = { id, name: 'Giải ngân khoản vay', type: 'income', icon: 'landmark', color: '#0ea5e9', isSystem: 1, systemKey: 'loan_disburse' };
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

  let repayCat = cats.find(c => c.systemKey === 'loan_repay' || c.name === 'Trả nợ vay ngân hàng');
  if (!repayCat) {
    const now = Date.now();
    const id = await db.categories.add({
      name: 'Trả nợ vay ngân hàng',
      type: 'expense',
      icon: 'badge-percent',
      color: '#ef4444',
      isQuick: 0,
      isSystem: 1,
      systemKey: 'loan_repay',
      isDeleted: 0,
      updatedAt: now
    });
    repayCat = { id, name: 'Trả nợ vay ngân hàng', type: 'expense', icon: 'badge-percent', color: '#ef4444', isSystem: 1, systemKey: 'loan_repay' };
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
    // Cho phép đổi trạng thái chọn nhanh isQuick, nhưng khóa không cho sửa tên, loại
    if (data.name && data.name !== cat.name) {
      throw new Error('Danh mục hệ thống được bảo vệ, không thể sửa đổi tên!');
    }
    if (data.type && data.type !== cat.type) {
      throw new Error('Danh mục hệ thống được bảo vệ, không thể sửa đổi loại!');
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
    throw new Error('Danh mục hệ thống được bảo vệ, không thể xóa!');
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

/* ==================== QUẢN LÝ SỔ TIẾT KIỆM (SAVINGS OPERATIONS) ==================== */
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
    termMonths: Number(data.termMonths || 0), // 0: không kỳ hạn
    dueDate: data.dueDate || '',
    interestRate: Number(data.interestRate || 0), // %/năm
    nonTermRate: Number(data.nonTermRate || 0.05), // %/năm
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
    // Nếu có chọn tài khoản trích tiền, tự động trừ tiền trong tài khoản đó
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

    // Nếu người dùng chọn tài khoản nhận tiền tất toán, cộng tiền vào tài khoản
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

/* ==================== QUẢN LÝ SỔ TÍCH LŨY (ACCUMULATIONS OPERATIONS) ==================== */
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

  // Chống nhân đôi nếu submit liên tiếp trong vòng 2.5 giây
  const recentAccDup = await db.accumulations
    .filter(a => !a.isDeleted && a.name === accumulation.name && a.targetAmount === accumulation.targetAmount && Math.abs((a.updatedAt || 0) - now) < 2500)
    .first();
  if (recentAccDup) {
    console.warn('Blocked duplicate accumulation submission:', accumulation.name);
    return recentAccDup.id;
  }

  await db.transaction('rw', db.accumulations, db.accounts, async () => {
    await db.accumulations.add(accumulation);
    // Trích tiền khởi điểm từ tài khoản nếu có chọn
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

/* ==================== QUẢN LÝ TÀI SẢN (ASSETS OPERATIONS) ==================== */
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
    unit: data.unit || 'Chiếc',
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

  // Chống nhân đôi nếu submit liên tiếp trong vòng 2.5 giây
  const recentAssetDup = await db.assets
    .filter(x => !x.isDeleted && x.name === asset.name && x.type === asset.type && Math.abs((x.updatedAt || 0) - now) < 2500)
    .first();
  if (recentAssetDup) {
    console.warn('Blocked duplicate asset submission:', asset.name);
    return recentAssetDup.id;
  }

  await db.transaction('rw', db.assets, db.accounts, async () => {
    await db.assets.add(asset);
    // Nếu có chọn tài khoản thanh toán, trừ tiền mua
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

// ==================== LOANS (SỔ VAY NGÂN HÀNG) CRUD ====================
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
    await db.transaction('rw', db.loans, db.accounts, db.transactions, async () => {
      id = await db.loans.add(loan);
      const acc = await db.accounts.get(disburseAccId);
      if (acc) {
        await db.accounts.update(acc.id, {
          balance: (acc.balance || 0) + loan.loanAmount,
          updatedAt: nowTs
        });
        // Thêm ghi chú giao dịch thu nhập giải ngân vào ví
        const { disburseCat } = await getLoanSystemCategories();
        await db.transactions.add({
          type: 'income',
          categoryId: disburseCat ? disburseCat.id : null,
          amount: loan.loanAmount,
          fee: 0,
          accountId: acc.id,
          toAccountId: null,
          date: loan.startDate || now.split('T')[0],
          time: new Date().toTimeString().slice(0, 5),
          note: `Giải ngân sổ vay: ${loan.name}`,
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

  await db.transaction('rw', db.loans, db.accounts, db.transactions, async () => {
    const oldLoan = await db.loans.get(lId);
    if (!oldLoan || oldLoan.isDeleted) return;

    let remaining = oldLoan.remainingAmount !== undefined ? oldLoan.remainingAmount : (oldLoan.loanAmount || 0);

    // Nếu người dùng thay đổi số tiền vay ban đầu (ví dụ sửa lúc nhập nhầm):
    if (loanData.loanAmount !== undefined && loanData.loanAmount !== oldLoan.loanAmount) {
      const history = oldLoan.repaymentHistory || [];
      const totalPaid = history.reduce((sum, h) => sum + (h.amount || 0), 0);
      remaining = Math.max(0, loanData.loanAmount - totalPaid);
    }

    // Xử lý đồng bộ ghi chú giao dịch giải ngân vào ví
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
        // Đổi sang không cộng vào ví: hoàn tác số dư ví cũ và xóa giao dịch giải ngân
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
        // Vẫn cùng ví: điều chỉnh số dư chênh lệch (nếu đổi loanAmount) và cập nhật thông tin giao dịch
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
        const { disburseCat: dCat1 } = await getLoanSystemCategories();
        await db.transactions.update(oldDisburseTx.id, {
          categoryId: dCat1 ? dCat1.id : (oldDisburseTx.categoryId || null),
          amount: newLoanAmount,
          date: newStartDate,
          note: `Giải ngân sổ vay: ${newName}`,
          excludeFromReport: newExclude,
          updatedAt: nowTs
        });
      } else {
        // Đổi sang ví khác: trừ ví cũ, cộng ví mới, cập nhật transaction
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
        const { disburseCat: dCat2 } = await getLoanSystemCategories();
        await db.transactions.update(oldDisburseTx.id, {
          categoryId: dCat2 ? dCat2.id : (oldDisburseTx.categoryId || null),
          accountId: newDisburseAccId,
          amount: newLoanAmount,
          date: newStartDate,
          note: `Giải ngân sổ vay: ${newName}`,
          excludeFromReport: newExclude,
          updatedAt: nowTs
        });
      }
    } else {
      // Chưa từng có giao dịch giải ngân vào ví (lúc tạo để ngoài ví, giờ chọn ví nhận)
      if (newDisburseAccId && newLoanAmount > 0) {
        const acc = await db.accounts.get(newDisburseAccId);
        if (acc) {
          await db.accounts.update(acc.id, {
            balance: (acc.balance || 0) + newLoanAmount,
            updatedAt: nowTs
          });
          const { disburseCat: dCat3 } = await getLoanSystemCategories();
          await db.transactions.add({
            type: 'income',
            categoryId: dCat3 ? dCat3.id : null,
            amount: newLoanAmount,
            fee: 0,
            accountId: acc.id,
            toAccountId: null,
            date: newStartDate,
            time: new Date().toTimeString().slice(0, 5),
            note: `Giải ngân sổ vay: ${newName}`,
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

  await db.transaction('rw', db.loans, db.accounts, db.transactions, async () => {
    const loan = await db.loans.get(lId);
    if (!loan || loan.isDeleted) return;

    const newRemaining = Math.max(0, (loan.remainingAmount || loan.loanAmount || 0) - paymentAmount);
    const isFullyPaid = newRemaining <= 0;

    const history = loan.repaymentHistory || [];
    history.push({
      date: pDate,
      amount: paymentAmount,
      sourceAccountId: sourceAccountId ? Number(sourceAccountId) : null,
      note: `Trả nợ gốc sổ vay: ${loan.name}`,
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
        // Ghi nhận giao dịch chi phí trả nợ gốc vào ví
        const { repayCat } = await getLoanSystemCategories();
        await db.transactions.add({
          type: 'expense',
          categoryId: repayCat ? repayCat.id : null,
          amount: paymentAmount,
          fee: 0,
          accountId: src.id,
          toAccountId: null,
          date: pDate,
          time: new Date().toTimeString().slice(0, 5),
          note: `Trả nợ gốc sổ vay: ${loan.name}`,
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

    // Tìm các giao dịch liên quan đến sổ vay và hoàn tác số dư ví
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

  // Sổ tiết kiệm đang gửi
  let totalSavings = 0;
  try {
    if (db.savings) {
      const savingsList = await db.savings.where('isDeleted').equals(0).toArray();
      totalSavings = savingsList.filter(s => s.status !== 'settled').reduce((sum, s) => sum + (s.balance || 0), 0);
    }
  } catch (e) {
    console.warn('Savings read error:', e);
  }

  // Sổ tích lũy
  let totalAccumulations = 0;
  try {
    if (db.accumulations) {
      const accList = await db.accumulations.where('isDeleted').equals(0).toArray();
      totalAccumulations = accList.reduce((sum, a) => sum + (a.currentAmount || 0), 0);
    }
  } catch (e) {
    console.warn('Accumulations read error:', e);
  }

  // Tài sản (Bất động sản, Kim loại quý, Ngoại tệ, Tài sản khác)
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

  // Sổ vay ngân hàng (Nghĩa vụ nợ gốc còn lại)
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
  // lend = nợ cần thu (tài sản tăng)
  // borrow = nợ cần trả (nghĩa vụ tài chính)
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
function triggerAutoSync() {
  if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
  autoSyncTimeout = setTimeout(() => {
    if (window.googleDriveService && window.googleDriveService.isAutoSyncEnabled()) {
      window.googleDriveService.sync();
    }
  }, 3000);
}
