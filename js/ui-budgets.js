/**
 * SỔ THU CHI - UI BUDGETS MODULE
 * Quản lý hạn mức ngân sách tháng và cảnh báo vượt ngưỡng
 */

const UIBudgets = {
  currentMonth: new Date().toISOString().slice(0, 7), // YYYY-MM

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const budgetMonthInput = document.getElementById('budget-month-select');
    if (budgetMonthInput) {
      budgetMonthInput.dataset.rawMonth = this.currentMonth;
      budgetMonthInput.value = this.formatMonthDisplay(this.currentMonth);
    }

    const budgetForm = document.getElementById('budget-form');
    if (budgetForm) {
      budgetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleFormSubmit();
      });
    }
  },

  formatMonthDisplay(monthStr) {
    if (!monthStr) return '';
    const [y, m] = monthStr.split('-');
    return `Tháng ${m}/${y}`;
  },

  openFilterMonthPicker() {
    const input = document.getElementById('budget-month-select');
    const curVal = input?.dataset.rawMonth || this.currentMonth;

    const cal = window.UICalendar || (typeof UICalendar !== 'undefined' ? UICalendar : null);
    if (cal) {
      cal.open({
        mode: 'month',
        initialDate: `${curVal}-01`,
        onSelect: (monthStr) => {
          this.currentMonth = monthStr;
          if (input) {
            input.dataset.rawMonth = monthStr;
            input.value = this.formatMonthDisplay(monthStr);
          }
          this.render();
        }
      });
    }
  },

  openAddMonthPicker() {
    const input = document.getElementById('budget-month-input');
    const curVal = input?.dataset.rawMonth || this.currentMonth;

    const cal = window.UICalendar || (typeof UICalendar !== 'undefined' ? UICalendar : null);
    if (cal) {
      cal.open({
        mode: 'month',
        initialDate: `${curVal}-01`,
        onSelect: (monthStr) => {
          if (input) {
            input.dataset.rawMonth = monthStr;
            input.value = this.formatMonthDisplay(monthStr);
          }
        }
      });
    }
  },

  async openAddModal() {
    const modal = document.getElementById('modal-budget');
    const form = document.getElementById('budget-form');
    if (!modal || !form) return;

    form.reset();
    const addMonthInput = document.getElementById('budget-month-input');
    if (addMonthInput) {
      addMonthInput.dataset.rawMonth = this.currentMonth;
      addMonthInput.value = this.formatMonthDisplay(this.currentMonth);
    }

    // Populate expense categories
    const categories = await db.categories.where('type').equals('expense').and(c => c.isDeleted === 0).toArray();
    const select = document.getElementById('budget-category-select');
    if (select) {
      select.innerHTML = categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    modal.classList.add('open');
    setTimeout(() => document.getElementById('budget-amount-input')?.focus(), 150);
  },

  closeModal() {
    const modal = document.getElementById('modal-budget');
    if (modal) modal.classList.remove('open');
  },

  async handleFormSubmit() {
    const categoryId = Number(document.getElementById('budget-category-select').value);
    const month = document.getElementById('budget-month-input')?.dataset.rawMonth || document.getElementById('budget-month-input')?.value;
    const limitAmount = Number(document.getElementById('budget-amount-input').value);

    if (!limitAmount || limitAmount <= 0) {
      showToast('Vui lòng nhập hạn mức chi tiêu hợp lệ', 'error');
      return;
    }

    const existing = await db.budgets.where({ categoryId, month }).first();
    const now = Date.now();

    if (existing) {
      await db.budgets.update(existing.id, { limitAmount, updatedAt: now });
      showToast('Đã cập nhật hạn mức ngân sách', 'success');
    } else {
      await db.budgets.add({ categoryId, month, limitAmount, updatedAt: now });
      showToast('Đã thiết lập ngân sách mới', 'success');
    }

    this.closeModal();
    window.app.refreshAll();
  },

  async render() {
    const container = document.getElementById('budgets-list-container');
    if (!container) return;

    const budgets = await db.budgets.where('month').equals(this.currentMonth).toArray();
    const categories = await db.categories.toArray();
    const catMap = new Map(categories.map(c => [c.id, c]));

    // Get current month expense transactions
    const startOfMonth = `${this.currentMonth}-01`;
    const endOfMonth = `${this.currentMonth}-31`;
    const txsAll = await db.transactions
      .where('date')
      .between(startOfMonth, endOfMonth, true, true)
      .and(t => t.type === 'expense' && t.isDeleted === 0)
      .toArray();

    // Loại trừ giao dịch của các tài khoản được đánh dấu "Không tính vào báo cáo"
    const excludedAccounts = await db.accounts.where('excludeFromReport').equals(1).toArray();
    const excludedAccountIds = new Set(excludedAccounts.map(a => a.id));

    const txs = excludedAccountIds.size > 0
      ? txsAll.filter(t => !excludedAccountIds.has(t.accountId))
      : txsAll;

    const spentByCat = {};
    for (const t of txs) {
      if (t.categoryId) {
        spentByCat[t.categoryId] = (spentByCat[t.categoryId] || 0) + t.amount;
      }
    }

    if (budgets.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px 16px; color: var(--text-muted);">
          <i data-lucide="piggy-bank" style="width: 48px; height: 48px; stroke-width: 1.5; margin-bottom: 12px; opacity: 0.5;"></i>
          <p style="font-size: 1rem; font-weight: 500;">Chưa thiết lập ngân sách cho tháng này</p>
          <p style="font-size: 0.85rem; margin-top: 4px;">Đặt hạn mức để kiểm soát chi tiêu không bị vung tay quá trán</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    let html = '';
    for (const b of budgets) {
      const cat = catMap.get(b.categoryId);
      const catName = cat ? cat.name : 'Danh mục đã xóa';
      const spent = spentByCat[b.categoryId] || 0;
      const percent = Math.min(100, Math.round((spent / b.limitAmount) * 100));
      const remaining = b.limitAmount - spent;

      let barColor = 'linear-gradient(90deg, #10b981, #06b6d4)';
      let alertBadge = '<span style="color: var(--income); font-size: 0.75rem; font-weight: 600;">Trong tầm kiểm soát</span>';

      if (spent >= b.limitAmount) {
        barColor = 'linear-gradient(90deg, #f43f5e, #e11d48)';
        alertBadge = '<span style="color: var(--expense); font-size: 0.75rem; font-weight: 700;">ĐÃ VƯỢT NGÂN SÁCH!</span>';
      } else if (percent >= 80) {
        barColor = 'linear-gradient(90deg, #f59e0b, #d97706)';
        alertBadge = '<span style="color: var(--warning); font-size: 0.75rem; font-weight: 600;">Sắp chạm hạn mức (≥80%)</span>';
      }

      html += `
        <div class="debt-card">
          <div class="debt-header">
            <div>
              <div style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">${escapeHTML(catName)}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">Tháng ${this.currentMonth}</div>
            </div>
            ${alertBadge}
          </div>

          <div class="debt-progress-bar">
            <div class="debt-progress-fill" style="width: ${percent}%; background: ${barColor};"></div>
          </div>

          <div class="debt-amounts">
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">ĐÃ CHI (${percent}%)</div>
              <div style="font-weight: 700; color: ${spent >= b.limitAmount ? 'var(--expense)' : 'var(--text-primary)'};">
                ${new Intl.NumberFormat('vi-VN').format(spent)}đ
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.75rem; color: var(--text-muted);">HẠN MỨC / CÒN LẠI</div>
              <div style="font-weight: 600; color: var(--text-secondary);">
                ${new Intl.NumberFormat('vi-VN').format(b.limitAmount)}đ 
                (${remaining >= 0 ? `Còn ${new Intl.NumberFormat('vi-VN').format(remaining)}đ` : `Quá ${new Intl.NumberFormat('vi-VN').format(Math.abs(remaining))}đ`})
              </div>
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }
};

window.UIBudgets = UIBudgets;
