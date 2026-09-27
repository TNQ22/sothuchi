/**
 * SỔ THU CHI - CSV EXPORT SERVICE
 * Xuất dữ liệu giao dịch và sổ nợ ra file CSV chuẩn UTF-8 có BOM (tương thích Excel)
 */

const CSVExportService = {
  // Format monetary value
  formatCurrency(val) {
    return new Intl.NumberFormat('vi-VN').format(val || 0);
  },

  // Escape special CSV characters
  escapeCSV(field) {
    if (field === null || field === undefined) return '""';
    const stringField = String(field);
    if (stringField.includes('"') || stringField.includes(',') || stringField.includes('\n') || stringField.includes('\r')) {
      return `"${stringField.replace(/"/g, '""')}"`;
    }
    return `"${stringField}"`;
  },

  // Export Transactions to CSV
  async exportTransactions(options = {}) {
    const { startDate, endDate, accountId, categoryId, type } = options;

    let query = db.transactions.where('isDeleted').equals(0);
    let txs = await query.toArray();

    // In-memory filter
    if (startDate) txs = txs.filter(t => t.date >= startDate);
    if (endDate) txs = txs.filter(t => t.date <= endDate);
    if (accountId) txs = txs.filter(t => t.accountId === Number(accountId) || t.toAccountId === Number(accountId));
    if (categoryId) txs = txs.filter(t => t.categoryId === Number(categoryId));
    if (type) txs = txs.filter(t => t.type === type);

    // Sort by date descending
    txs.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Get categories & accounts for mapping names
    const categories = await db.categories.toArray();
    const accounts = await db.accounts.toArray();
    const catMap = new Map(categories.map(c => [c.id, c.name]));
    const accMap = new Map(accounts.map(a => [a.id, a.name]));

    // CSV Headers
    const headers = ['Mã GD', 'Ngày', 'Giờ', 'Loại giao dịch', 'Số tiền (VNĐ)', 'Danh mục', 'Tài khoản / Ví', 'Ví nhận (Chuyển khoản)', 'Ghi chú'];
    const rows = [headers.map(this.escapeCSV).join(',')];

    for (const t of txs) {
      const typeLabel = t.type === 'expense' ? 'Chi tiêu' : (t.type === 'income' ? 'Thu nhập' : 'Chuyển tiền');
      const catName = t.categoryId ? (catMap.get(t.categoryId) || 'Khác') : (t.type === 'transfer' ? 'Chuyển tiền nội bộ' : 'Chưa phân loại');
      const fromAcc = accMap.get(t.accountId) || 'Ví không rõ';
      const toAcc = t.toAccountId ? (accMap.get(t.toAccountId) || '') : '';

      const row = [
        t.id,
        t.date,
        t.time || '',
        typeLabel,
        t.amount,
        catName,
        fromAcc,
        toAcc,
        t.note || ''
      ];

      rows.push(row.map(this.escapeCSV).join(','));
    }

    // Add UTF-8 BOM so Excel opens Vietnamese characters perfectly
    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = `SoThuChi_GiaoDich_${new Date().toISOString().slice(0, 10)}.csv`;

    this.downloadFile(blob, filename);
  },

  // Export Debts & Loans to CSV
  async exportDebts() {
    const debts = await db.debts.where('isDeleted').equals(0).toArray();
    const accounts = await db.accounts.toArray();
    const accMap = new Map(accounts.map(a => [a.id, a.name]));

    const headers = ['Mã Nợ', 'Loại hình', 'Người vay / Chủ nợ', 'Số tiền ban đầu', 'Còn lại', 'Đã trả/thu', 'Ví liên kết', 'Ngày thu/trả nợ', 'Trạng thái', 'Ghi chú'];
    const rows = [headers.map(this.escapeCSV).join(',')];

    for (const d of debts) {
      const typeLabel = d.type === 'lend' ? 'Cho vay (Cần thu)' : 'Đi vay (Cần trả)';
      const paid = d.originalAmount - d.remainingAmount;
      const statusLabel = d.status === 'settled' ? 'Đã hoàn tất' : (d.status === 'overdue' ? 'Quá hạn' : 'Đang theo dõi');
      const accName = accMap.get(d.accountId) || 'Ví không rõ';

      const row = [
        d.id,
        typeLabel,
        d.personName,
        d.originalAmount,
        d.remainingAmount,
        paid,
        accName,
        d.dueDate || 'Không có',
        statusLabel,
        d.note || ''
      ];

      rows.push(row.map(this.escapeCSV).join(','));
    }

    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = `SoThuChi_VayNo_${new Date().toISOString().slice(0, 10)}.csv`;

    this.downloadFile(blob, filename);
  },

  // Generic file download trigger
  downloadFile(blob, filename) {
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
  }
};

window.CSVExportService = CSVExportService;
