/**
 * SỔ THU CHI - UI DEBTS & LOANS MODULE (SỔ VAY NỢ)
 * Quản lý theo dõi Cho Vay & Đi Vay, trả nợ từng đợt, tích hợp biến động số dư ví
 */

const UIDebts = {
  currentTab: 'lend', // 'lend' (Cho vay / Cần thu) hoặc 'borrow' (Đi vay / Cần trả)

  init() {
    this.bindEvents();
  },

  bindEvents() {
    // Tabs toggle
    document.querySelectorAll('.debt-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.debt-tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentTab = e.target.dataset.tab;
        this.render();
      });
    });

    // Formatting with dots in real-time for debt amounts
    const debtAmountInput = document.getElementById('debt-amount-input');
    if (debtAmountInput) {
      debtAmountInput.addEventListener('input', (e) => {
        const raw = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = raw ? new Intl.NumberFormat('vi-VN').format(Number(raw)) : '';
      });
    }

    const paymentAmountInput = document.getElementById('payment-amount-input');
    if (paymentAmountInput) {
      paymentAmountInput.addEventListener('input', (e) => {
        const raw = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = raw ? new Intl.NumberFormat('vi-VN').format(Number(raw)) : '';
      });
    }

    // Switch due date label when debt type changes
    const debtTypeSelect = document.getElementById('debt-type-select');
    if (debtTypeSelect) {
      debtTypeSelect.addEventListener('change', (e) => {
        this.updateDueDateLabel(e.target.value);
      });
    }

    // Add Debt Form Submit
    const debtForm = document.getElementById('debt-form');
    if (debtForm) {
      debtForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleDebtSubmit();
      });
    }

    // Payment/Collection Form Submit
    const paymentForm = document.getElementById('debt-payment-form');
    if (paymentForm) {
      paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handlePaymentSubmit();
      });
    }
  },

  async openAddModal(defaultType = null) {
    const type = defaultType || this.currentTab;
    const modal = document.getElementById('modal-debt');
    const form = document.getElementById('debt-form');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('debt-type-select').value = type;
    this.updateDueDateLabel(type);
    const dateInput = document.getElementById('debt-date-input');
    if (dateInput) {
      dateInput.value = '';
      dateInput.dataset.rawDate = '';
    }

    // Populate accounts
    const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
    const select = document.getElementById('debt-account-select');
    if (select) {
      select.innerHTML = accounts.map(a => `
        <option value="${a.id}">${a.name} (${new Intl.NumberFormat('vi-VN').format(a.balance)}đ)</option>
      `).join('');
    }

    modal.classList.add('open');
    setTimeout(() => document.getElementById('debt-person-input')?.focus(), 150);
  },

  closeModal() {
    const modal = document.getElementById('modal-debt');
    if (modal) modal.classList.remove('open');
  },

  closePaymentModal() {
    const modal = document.getElementById('modal-debt-payment');
    if (modal) modal.classList.remove('open');
  },

  updateDueDateLabel(type) {
    const label = document.getElementById('debt-date-label');
    const input = document.getElementById('debt-date-input');
    if (type === 'lend') {
      if (label) label.textContent = 'Ngày thu nợ (Tùy chọn)';
      if (input) input.placeholder = 'Chọn ngày thu nợ (tùy chọn)';
    } else {
      if (label) label.textContent = 'Ngày trả nợ (Tùy chọn)';
      if (input) input.placeholder = 'Chọn ngày trả nợ (tùy chọn)';
    }
  },

  openDatePicker() {
    const input = document.getElementById('debt-date-input');
    const curVal = input?.dataset.rawDate || '';

    const cal = window.UICalendar || (typeof UICalendar !== 'undefined' ? UICalendar : null);
    if (cal) {
      cal.open({
        mode: 'date',
        initialDate: curVal || new Date().toISOString().split('T')[0],
        onSelect: (d) => {
          if (!input) return;
          input.dataset.rawDate = d;
          const [y, m, day] = d.split('-');
          input.value = `${day}/${m}/${y}`;
        }
      });
    }
  },

  async handleDebtSubmit() {
    const type = document.getElementById('debt-type-select').value;
    const personName = document.getElementById('debt-person-input').value.trim();
    const amountRaw = (document.getElementById('debt-amount-input').value || '').replace(/\./g, '');
    const amount = Number(amountRaw);
    const dueDate = document.getElementById('debt-date-input')?.dataset.rawDate || document.getElementById('debt-date-input')?.value || '';
    const accountId = document.getElementById('debt-account-select').value;
    const note = document.getElementById('debt-note-input').value.trim();

    if (!personName) {
      showToast('Vui lòng nhập tên người vay hoặc chủ nợ', 'error');
      return;
    }

    if (!amount || amount <= 0) {
      showToast('Vui lòng nhập số tiền hợp lệ', 'error');
      return;
    }

    await addDebt({
      type,
      personName,
      originalAmount: amount,
      dueDate,
      accountId,
      note
    });

    this.closeModal();
    showToast(type === 'lend' ? 'Đã thêm khoản cho vay mới' : 'Đã ghi nhận khoản đi vay mới', 'success');
    window.app.refreshAll();
  },

  async openPaymentModal(debtId) {
    const debt = await db.debts.get(Number(debtId));
    if (!debt || debt.isDeleted) return;

    const modal = document.getElementById('modal-debt-payment');
    const title = document.getElementById('modal-debt-payment-title');
    const amountInput = document.getElementById('payment-amount-input');
    const debtIdInput = document.getElementById('payment-debt-id');
    const label = document.getElementById('payment-amount-label');

    if (!modal) return;

    debtIdInput.value = debt.id;
    amountInput.value = new Intl.NumberFormat('vi-VN').format(debt.remainingAmount);

    if (debt.type === 'lend') {
      if (title) title.textContent = `Thu Nợ: ${debt.personName}`;
      if (label) label.textContent = 'Số tiền thu hồi (VNĐ)';
    } else {
      if (title) title.textContent = `Trả Nợ: ${debt.personName}`;
      if (label) label.textContent = 'Số tiền thanh toán (VNĐ)';
    }

    // Populate accounts to receive or deduct money
    const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
    const select = document.getElementById('payment-account-select');
    if (select) {
      select.innerHTML = accounts.map(a => `
        <option value="${a.id}">${a.name} (${new Intl.NumberFormat('vi-VN').format(a.balance)}đ)</option>
      `).join('');
      if (debt.accountId) select.value = debt.accountId;
    }

    modal.classList.add('open');
    setTimeout(() => amountInput?.focus(), 150);
  },

  async handlePaymentSubmit() {
    const debtId = document.getElementById('payment-debt-id').value;
    const amountRaw = (document.getElementById('payment-amount-input').value || '').replace(/\./g, '');
    const amount = Number(amountRaw);
    const accountId = document.getElementById('payment-account-select').value;
    const note = document.getElementById('payment-note-input').value.trim();

    if (!amount || amount <= 0) {
      showToast('Vui lòng nhập số tiền thanh toán hợp lệ', 'error');
      return;
    }

    await recordDebtPayment(debtId, amount, accountId, note);
    this.closePaymentModal();
    showToast('Đã ghi nhận thanh toán thành công', 'success');
    window.app.refreshAll();
  },

  async deleteDebtRecord(debtId) {
    if (confirm('Bạn có chắc chắn muốn xóa khoản vay nợ này không?')) {
      await deleteDebt(debtId);
      showToast('Đã xóa khoản nợ', 'info');
      window.app.refreshAll();
    }
  },

  async render() {
    const container = document.getElementById('debts-list-container');
    const summaryLend = document.getElementById('debt-summary-lend');
    const summaryBorrow = document.getElementById('debt-summary-borrow');

    if (!container) return;

    const allDebts = await db.debts.where('isDeleted').equals(0).toArray();
    const accounts = await db.accounts.toArray();
    const accMap = new Map(accounts.map(a => [a.id, a]));

    const totalLend = allDebts.filter(d => d.type === 'lend' && d.status !== 'settled').reduce((s, d) => s + d.remainingAmount, 0);
    const totalBorrow = allDebts.filter(d => d.type === 'borrow' && d.status !== 'settled').reduce((s, d) => s + d.remainingAmount, 0);

    if (summaryLend) summaryLend.textContent = `${new Intl.NumberFormat('vi-VN').format(totalLend)}đ`;
    if (summaryBorrow) summaryBorrow.textContent = `${new Intl.NumberFormat('vi-VN').format(totalBorrow)}đ`;

    const filtered = allDebts.filter(d => d.type === this.currentTab);
    // Sort active first, then date
    filtered.sort((a, b) => (a.status === 'settled' ? 1 : -1) || (new Date(a.dueDate) - new Date(b.dueDate)));

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px 16px; color: var(--text-muted);">
          <i data-lucide="handshake" style="width: 48px; height: 48px; stroke-width: 1.5; margin-bottom: 12px; opacity: 0.5;"></i>
          <p style="font-size: 1rem; font-weight: 500;">
            ${this.currentTab === 'lend' ? 'Không có khoản cho vay nào' : 'Không có khoản đi vay nào'}
          </p>
          <p style="font-size: 0.85rem; margin-top: 4px;">Bấm "+ Tạo Khoản Mới" để theo dõi</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    let html = '';
    for (const d of filtered) {
      const acc = accMap.get(d.accountId);
      const paid = d.originalAmount - d.remainingAmount;
      const progressPercent = Math.min(100, Math.round((paid / d.originalAmount) * 100)) || 0;

      let isOverdue = false;
      if (d.dueDate && d.dueDate < todayStr && d.status !== 'settled') {
        isOverdue = true;
      }

      let statusBadge = '';
      if (d.status === 'settled') {
        statusBadge = `<span class="debt-status-badge settled">Đã hoàn tất</span>`;
      } else if (isOverdue) {
        statusBadge = `<span class="debt-status-badge overdue">Quá hạn</span>`;
      } else {
        statusBadge = `<span class="debt-status-badge active">Đang theo dõi</span>`;
      }

      const initialLetter = (d.personName || 'V').trim().charAt(0).toUpperCase();

      html += `
        <div class="debt-card">
          <div class="debt-header">
            <div class="debt-person">
              <div class="debt-avatar">${escapeHTML(initialLetter)}</div>
              <div>
                <div class="debt-name">${escapeHTML(d.personName)}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">
                  ${d.dueDate ? (d.type === 'lend' ? `Ngày thu: ${d.dueDate}` : `Ngày trả: ${d.dueDate}`) : 'Không có ngày hẹn'} • ${acc ? escapeHTML(acc.name) : 'Ví không rõ'}
                </div>
              </div>
            </div>
            ${statusBadge}
          </div>

          <div class="debt-progress-bar">
            <div class="debt-progress-fill" style="width: ${progressPercent}%;"></div>
          </div>

          <div class="debt-amounts">
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">ĐÃ ${d.type === 'lend' ? 'THU' : 'TRẢ'} (${progressPercent}%)</div>
              <div style="font-weight: 600; color: var(--income);">${new Intl.NumberFormat('vi-VN').format(paid)}đ</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.75rem; color: var(--text-muted);">CÒN LẠI / TỔNG SỐ</div>
              <div style="font-weight: 700; color: ${d.status === 'settled' ? 'var(--text-muted)' : (d.type === 'lend' ? 'var(--income)' : 'var(--warning)')};">
                ${new Intl.NumberFormat('vi-VN').format(d.remainingAmount)}đ / ${new Intl.NumberFormat('vi-VN').format(d.originalAmount)}đ
              </div>
            </div>
          </div>

          ${d.note ? `<div style="font-size: 0.82rem; color: var(--text-secondary); background: var(--bg-surface); padding: 8px 12px; border-radius: var(--radius-sm);">Ghi chú: ${escapeHTML(d.note)}</div>` : ''}

          <div class="debt-actions">
            ${d.status !== 'settled' ? `
              <button class="btn-primary" style="padding: 6px 14px; font-size: 0.85rem;" onclick="UIDebts.openPaymentModal(${d.id})">
                <i data-lucide="check-circle" style="width: 15px; height: 15px;"></i>
                ${d.type === 'lend' ? 'Thu Nợ' : 'Trả Nợ'}
              </button>
            ` : ''}
            <button class="btn-secondary" style="padding: 6px 10px; font-size: 0.85rem;" onclick="UIDebts.deleteDebtRecord(${d.id})">
              <i data-lucide="trash-2" style="width: 15px; height: 15px; color: var(--expense);"></i>
            </button>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }
};

window.UIDebts = UIDebts;
