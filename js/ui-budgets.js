/**
 * SỔ THU CHI - UI BUDGETS MODULE
 * Quản lý ngân sách đa chế độ:
 * 1. Ngân sách Tổng của tháng & Khóa trần các danh mục chi tiêu thiết yếu
 * 2. Chi tiết theo phong cách Actual Budget (Zero-based Envelope Budgeting)
 * 3. Sao chép linh hoạt từ các tháng trước (Nguyên bản, Điền mục trống, Theo thực chi)
 * 4. Cảnh báo vượt ngân sách nổi bật nhưng không vướng và tắt được
 */

const UIBudgets = {
  currentMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
  currentMode: 'simple', // 'simple' | 'detailed'
  quickEditTarget: null, // { categoryId, name, spent, currentAmount, color, icon }
  dismissedAlertSignatures: new Set(),

  async init() {
    // Load saved mode preference
    try {
      const savedMode = await db.settings.get('budget_mode');
      if (savedMode && (savedMode.value === 'simple' || savedMode.value === 'detailed')) {
        this.currentMode = savedMode.value;
      }
    } catch (e) {
      console.warn('Error loading budget mode:', e);
    }

    this.bindEvents();
    await this.render();
  },

  bindEvents() {
    this.updateMonthLabels();

    // Mode Switcher Tabs
    const btnSimple = document.getElementById('btn-budget-mode-simple');
    const btnDetailed = document.getElementById('btn-budget-mode-detailed');
    if (btnSimple && btnDetailed) {
      btnSimple.classList.toggle('active', this.currentMode === 'simple');
      btnDetailed.classList.toggle('active', this.currentMode === 'detailed');
    }

    // Amount input auto-formatting for all budget modals
    const amountInputIds = [
      'budget-overall-amount',
      'budget-lock-amount',
      'budget-cat-amount',
      'budget-quick-amount-input'
    ];
    amountInputIds.forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('input', (e) => {
          const raw = e.target.value.replace(/\D/g, '');
          if (raw) {
            e.target.value = new Intl.NumberFormat('vi-VN').format(Number(raw));
          } else {
            e.target.value = '';
          }
        });
      }
    });

    // Form 1: Ngân sách Tổng
    const formOverall = document.getElementById('budget-overall-form');
    if (formOverall) {
      formOverall.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleOverallBudgetSubmit();
      });
    }

    // Form 2: Khóa mục chi
    const formLock = document.getElementById('budget-lock-form');
    if (formLock) {
      formLock.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleLockCategorySubmit();
      });
    }

    // Form 3: Hạn mức chi tiết (Actual Budget)
    const formCat = document.getElementById('budget-category-form');
    if (formCat) {
      formCat.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleCategoryBudgetSubmit();
      });
    }

    // Form 4: Sao chép ngân sách
    const formCopy = document.getElementById('budget-copy-form');
    if (formCopy) {
      formCopy.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleCopySubmit();
      });
    }

    // Form 5: Quick Edit Keypad
    const formQuick = document.getElementById('budget-quick-edit-form');
    if (formQuick) {
      formQuick.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleQuickEditSubmit();
      });
    }
  },

  /* ==================== MONTH NAVIGATION ==================== */
  formatMonthDisplay(monthStr) {
    if (!monthStr) return '';
    const [y, m] = monthStr.split('-');
    return `Tháng ${m}/${y}`;
  },

  updateMonthLabels() {
    const label = document.getElementById('budget-month-display-label');
    if (label) {
      label.textContent = this.formatMonthDisplay(this.currentMonth);
    }
    const legacyInput = document.getElementById('budget-month-select');
    if (legacyInput) {
      legacyInput.dataset.rawMonth = this.currentMonth;
      legacyInput.value = this.formatMonthDisplay(this.currentMonth);
    }
  },

  changeMonth(delta) {
    const [y, m] = this.currentMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const newY = d.getFullYear();
    const newM = String(d.getMonth() + 1).padStart(2, '0');
    this.currentMonth = `${newY}-${newM}`;
    this.updateMonthLabels();
    this.render();
  },

  openFilterMonthPicker() {
    const cal = window.UICalendar || (typeof UICalendar !== 'undefined' ? UICalendar : null);
    if (cal) {
      cal.open({
        mode: 'month',
        initialDate: `${this.currentMonth}-01`,
        onSelect: (monthStr) => {
          this.currentMonth = monthStr;
          this.updateMonthLabels();
          this.render();
        }
      });
    }
  },

  /* ==================== MODE SWITCHING ==================== */
  async switchMode(mode) {
    if (mode !== 'simple' && mode !== 'detailed') return;
    this.currentMode = mode;

    try {
      await db.settings.put({ key: 'budget_mode', value: mode });
    } catch (e) {
      console.warn('Could not save budget mode:', e);
    }

    const btnSimple = document.getElementById('btn-budget-mode-simple');
    const btnDetailed = document.getElementById('btn-budget-mode-detailed');
    if (btnSimple && btnDetailed) {
      btnSimple.classList.toggle('active', mode === 'simple');
      btnDetailed.classList.toggle('active', mode === 'detailed');
    }

    const paneSimple = document.getElementById('budget-simple-container');
    const paneDetailed = document.getElementById('budget-detailed-container');
    if (paneSimple && paneDetailed) {
      if (mode === 'simple') {
        paneSimple.style.display = 'block';
        paneDetailed.style.display = 'none';
      } else {
        paneSimple.style.display = 'none';
        paneDetailed.style.display = 'block';
      }
    }

    // Update primary action button label
    const mainAddLabel = document.getElementById('budget-main-add-label');
    if (mainAddLabel) {
      mainAddLabel.textContent = mode === 'simple' ? 'Đặt Ngân Sách' : 'Thêm Hạn Mức';
    }

    await this.render();
  },

  handlePrimaryAddAction() {
    if (this.currentMode === 'simple') {
      this.openOverallBudgetModal();
    } else {
      this.openCategoryModal();
    }
  },

  /* ==================== DATA QUERIES & MAIN RENDER ==================== */
  async render() {
    this.updateMonthLabels();

    // 1. Get transactions of current month
    const startOfMonth = `${this.currentMonth}-01`;
    const endOfMonth = `${this.currentMonth}-31`;
    const allTxs = await db.transactions
      .where('date')
      .between(startOfMonth, endOfMonth, true, true)
      .and(t => t.isDeleted === 0)
      .toArray();

    // Exclude accounts marked as excludeFromReport
    const excludedAccounts = await db.accounts.filter(a => !!a.excludeFromReport).toArray();
    const excludedAccountIds = new Set(excludedAccounts.map(a => a.id));
    const txs = excludedAccountIds.size > 0
      ? allTxs.filter(t => !excludedAccountIds.has(t.accountId))
      : allTxs;

    const expenseTxs = txs.filter(t => t.type === 'expense');
    const incomeTxs = txs.filter(t => t.type === 'income');

    const totalSpent = expenseTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalIncome = incomeTxs.reduce((sum, t) => sum + (t.amount || 0), 0);

    const spentByCat = {};
    for (const t of expenseTxs) {
      if (t.categoryId) {
        spentByCat[t.categoryId] = (spentByCat[t.categoryId] || 0) + (t.amount || 0);
      }
    }

    // 2. Get budgets for current month
    const rawBudgets = await db.budgets.where('month').equals(this.currentMonth).toArray();
    // Normalize overall budget and category budgets
    const overallBudget = rawBudgets.find(b => b.categoryId === 'TOTAL' || b.categoryId === 0 || b.isOverall);
    const categoryBudgets = rawBudgets.filter(b => b.categoryId !== 'TOTAL' && b.categoryId !== 0 && !b.isOverall);

    // 3. Get all active expense categories
    const allCategories = await db.categories.where('isDeleted').equals(0).toArray();
    const expenseCategories = allCategories.filter(c => c.type === 'expense');
    const catMap = new Map(allCategories.map(c => [c.id, c]));

    // 4. Render active mode
    if (this.currentMode === 'simple') {
      this.renderSimpleMode({
        overallBudget,
        categoryBudgets,
        expenseCategories,
        catMap,
        totalSpent,
        spentByCat
      });
    } else {
      this.renderDetailedMode({
        categoryBudgets,
        expenseCategories,
        catMap,
        totalIncome,
        totalSpent,
        spentByCat
      });
    }

    // 5. Check and display non-intrusive alerts
    this.checkBudgetAlerts({
      overallBudget,
      categoryBudgets,
      catMap,
      totalSpent,
      spentByCat
    });

    if (window.lucide) lucide.createIcons();
  },

  /* ==================== MODE 1: SIMPLE OVERALL & LOCKED ==================== */
  renderSimpleMode({ overallBudget, categoryBudgets, expenseCategories, catMap, totalSpent, spentByCat }) {
    const container = document.getElementById('budget-simple-container');
    if (!container) return;

    const lockedBudgets = categoryBudgets.filter(b => b.isLocked === 1 || b.isLocked === true);
    const lockedLimitTotal = lockedBudgets.reduce((sum, b) => sum + (b.limitAmount || 0), 0);
    const lockedSpentTotal = lockedBudgets.reduce((sum, b) => sum + (spentByCat[b.categoryId] || 0), 0);

    // Days elapsed / remaining calculations
    const [yearStr, monthStr] = this.currentMonth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const totalDays = new Date(year, month, 0).getDate();
    const now = new Date();
    const currentYm = now.toISOString().slice(0, 7);

    let daysElapsed = totalDays;
    let daysRemaining = 0;
    if (this.currentMonth === currentYm) {
      daysElapsed = Math.min(totalDays, now.getDate());
      daysRemaining = Math.max(0, totalDays - daysElapsed);
    } else if (this.currentMonth > currentYm) {
      daysElapsed = 0;
      daysRemaining = totalDays;
    }

    let heroHtml = '';
    if (overallBudget) {
      const overallLimit = overallBudget.limitAmount || 0;
      const remaining = overallLimit - totalSpent;
      const percent = overallLimit > 0 ? Math.round((totalSpent / overallLimit) * 100) : 0;

      let barColor = 'linear-gradient(90deg, #10b981, #06b6d4)';
      let paceBadge = '<span style="color: var(--income); font-weight: 700;"> Chi tiêu hợp lý</span>';
      if (totalSpent > overallLimit) {
        barColor = 'linear-gradient(90deg, #f43f5e, #e11d48)';
        paceBadge = '<span style="color: var(--expense); font-weight: 800;">⚠️ ĐÃ VƯỢT NGÂN SÁCH TỔNG!</span>';
      } else if (percent >= 80) {
        barColor = 'linear-gradient(90deg, #f59e0b, #d97706)';
        paceBadge = '<span style="color: var(--warning); font-weight: 700;">⚠️ Sắp chạm trần (≥80%)</span>';
      } else if (daysElapsed > 0 && (percent > (daysElapsed / totalDays) * 100 + 15)) {
        barColor = 'linear-gradient(90deg, #f59e0b, #eab308)';
        paceBadge = '<span style="color: var(--warning); font-weight: 700;">⚡ Đang tiêu nhanh hơn tiến độ</span>';
      }

      const avgSpentPerDay = daysElapsed > 0 ? Math.round(totalSpent / daysElapsed) : 0;
      const safeRemainingPerDay = daysRemaining > 0 ? Math.round(Math.max(0, remaining) / daysRemaining) : 0;

      heroHtml = `
        <div class="budget-hero-card">
          <div class="budget-hero-header">
            <div class="budget-hero-title-wrap">
              <span class="budget-hero-badge">Ngân Sách Tổng</span>
              <span style="font-size: 0.92rem; font-weight: 700; color: var(--text-primary);">${this.formatMonthDisplay(this.currentMonth)}</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn-secondary" style="font-size: 0.8rem; padding: 4px 10px;" onclick="UIBudgets.openOverallBudgetModal()">
                <i data-lucide="edit-2" style="width: 13px; height: 13px;"></i> Sửa hạn mức
              </button>
            </div>
          </div>

          <div class="budget-hero-kpi-grid">
            <div class="budget-hero-kpi-item">
              <div class="budget-hero-kpi-label">Hạn Mức Tháng</div>
              <div class="budget-hero-kpi-val" style="color: var(--primary);">${this.formatMoney(overallLimit)}</div>
            </div>
            <div class="budget-hero-kpi-item">
              <div class="budget-hero-kpi-label">Đã Chi (${percent}%)</div>
              <div class="budget-hero-kpi-val" style="color: ${totalSpent > overallLimit ? 'var(--expense)' : 'var(--text-primary)'};">
                ${this.formatMoney(totalSpent)}
              </div>
            </div>
            <div class="budget-hero-kpi-item">
              <div class="budget-hero-kpi-label">${remaining >= 0 ? 'Còn Lại' : 'Vượt Trần'}</div>
              <div class="budget-hero-kpi-val" style="color: ${remaining >= 0 ? 'var(--income)' : 'var(--expense)'};">
                ${remaining >= 0 ? this.formatMoney(remaining) : `-${this.formatMoney(Math.abs(remaining))}`}
              </div>
            </div>
          </div>

          <div class="budget-progress-wrap">
            <div class="budget-progress-header">
              <span>Tiến độ sử dụng ngân sách</span>
              <span style="font-weight: 700; color: ${totalSpent > overallLimit ? 'var(--expense)' : 'var(--text-primary)'};">${percent}%</span>
            </div>
            <div class="budget-progress-track">
              <div class="budget-progress-fill" style="width: ${Math.min(100, percent)}%; background: ${barColor};"></div>
            </div>
          </div>

          <div class="budget-pace-box">
            <div class="budget-pace-item">
              <span class="budget-pace-label">Thời gian tháng</span>
              <span class="budget-pace-val">Ngày ${daysElapsed}/${totalDays} (${Math.round((daysElapsed / totalDays) * 100)}%)</span>
            </div>
            <div class="budget-pace-item">
              <span class="budget-pace-label">Đã tiêu TB / ngày</span>
              <span class="budget-pace-val">${this.formatMoney(avgSpentPerDay)}</span>
            </div>
            <div class="budget-pace-item">
              <span class="budget-pace-label">Mức an toàn còn lại</span>
              <span class="budget-pace-val" style="color: ${safeRemainingPerDay > 0 ? 'var(--income)' : 'var(--expense)'};">
                ${daysRemaining > 0 ? `${this.formatMoney(safeRemainingPerDay)}/ngày` : 'Hết tháng'}
              </span>
            </div>
          </div>

          <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="font-size: 0.82rem;">Đánh giá nhịp độ: ${paceBadge}</div>
            <button type="button" class="btn-danger-subtle" style="font-size: 0.76rem; padding: 2px 8px;" onclick="UIBudgets.deleteOverallBudget()">Xóa ngân sách tổng</button>
          </div>
        </div>
      `;
    } else {
      heroHtml = `
        <div class="budget-hero-card">
          <div class="budget-hero-empty">
            <i data-lucide="target" style="width: 44px; height: 44px; stroke-width: 1.5;"></i>
            <h3>Chưa Đặt Ngân Sách Tổng</h3>
            <p>Đặt hạn mức chi tiêu chung cho cả tháng để dễ dàng kiểm soát dòng tiền và nhận cảnh báo khi vượt ngưỡng.</p>
            <button type="button" class="btn-primary" onclick="UIBudgets.openOverallBudgetModal()">
              <i data-lucide="plus" style="width: 16px; height: 16px;"></i> Thiết Lập Ngân Sách Tổng
            </button>
          </div>
        </div>
      `;
    }

    // Flexible Spending Pool Card
    let poolHtml = '';
    if (overallBudget) {
      const overallLimit = overallBudget.limitAmount || 0;
      const flexibleLimit = Math.max(0, overallLimit - lockedLimitTotal);
      const flexibleSpent = Math.max(0, totalSpent - lockedSpentTotal);
      const flexibleRemaining = flexibleLimit - flexibleSpent;

      poolHtml = `
        <div class="budget-pool-card">
          <div class="budget-pool-left">
            <div class="budget-pool-icon"><i data-lucide="compass"></i></div>
            <div>
              <div class="budget-pool-title">Hạn Mức Chi Tiêu Linh Hoạt</div>
              <div class="budget-pool-sub">Ngân sách cho các mục chưa bị khóa (Tổng - Các mục đã khóa)</div>
            </div>
          </div>
          <div>
            <div class="budget-pool-stat">${this.formatMoney(flexibleLimit)}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted); text-align: right;">
              Đã chi: ${this.formatMoney(flexibleSpent)} | Còn: <b style="color: ${flexibleRemaining >= 0 ? 'var(--income)' : 'var(--expense)'};">${this.formatMoney(flexibleRemaining)}</b>
            </div>
          </div>
        </div>
      `;
    }

    // Locked Categories Grid
    let lockedHtml = '';
    if (lockedBudgets.length === 0) {
      lockedHtml = `
        <div style="background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: var(--radius-md); padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.88rem;">
          <i data-lucide="lock" style="width: 28px; height: 28px; opacity: 0.4; margin-bottom: 8px;"></i>
          <div>Chưa có mục chi nào được khóa theo ngân sách tổng.</div>
          <div style="font-size: 0.78rem; margin-top: 4px;">Khóa trần các khoản quan trọng (như Ăn uống, Tiền nhà, Mua sắm...) để kiểm soát riêng biệt.</div>
          <button type="button" class="btn-secondary" style="margin-top: 12px; font-size: 0.82rem;" onclick="UIBudgets.openLockCategoryModal()">
            <i data-lucide="plus" style="width: 14px; height: 14px;"></i> Khóa Mục Chi Ngay
          </button>
        </div>
      `;
    } else {
      let cards = '';
      for (const b of lockedBudgets) {
        const cat = catMap.get(Number(b.categoryId));
        const catName = cat ? cat.name : 'Danh mục đã xóa';
        const catIcon = cat ? cat.icon || 'tag' : 'tag';
        const catColor = cat ? cat.color || '#0d9488' : '#0d9488';
        const spent = spentByCat[b.categoryId] || 0;
        const limit = b.limitAmount || 0;
        const remaining = limit - spent;
        const percent = limit > 0 ? Math.round((spent / limit) * 100) : 0;

        let barColor = 'linear-gradient(90deg, #10b981, #06b6d4)';
        let statusBadge = '<span style="font-size: 0.75rem; color: var(--income); font-weight: 600;">Bình thường</span>';
        if (spent > limit) {
          barColor = 'linear-gradient(90deg, #f43f5e, #e11d48)';
          statusBadge = '<span style="font-size: 0.75rem; color: var(--expense); font-weight: 700;">⚠️ Vượt trần!</span>';
        } else if (percent >= 80) {
          barColor = 'linear-gradient(90deg, #f59e0b, #d97706)';
          statusBadge = '<span style="font-size: 0.75rem; color: var(--warning); font-weight: 600;">Sắp chạm</span>';
        }

        cards += `
          <div class="budget-item-card">
            <div class="budget-item-header">
              <div class="budget-item-cat">
                <div class="category-icon-bubble" style="background: ${catColor}22; color: ${catColor}; width: 34px; height: 34px; font-size: 0.9rem;">
                  <i data-lucide="${catIcon}"></i>
                </div>
                <div>
                  <div class="budget-item-name">${escapeHTML(catName)}</div>
                  <div style="font-size: 0.72rem; color: var(--text-muted);"><i data-lucide="lock" style="width: 10px; height: 10px; display: inline-block;"></i> Mục đã khóa</div>
                </div>
              </div>
              <div class="budget-item-actions">
                ${statusBadge}
                <button type="button" class="btn-icon" style="width: 28px; height: 28px;" onclick="UIBudgets.openLockCategoryModal(${b.categoryId})" title="Chỉnh sửa hạn mức">
                  <i data-lucide="edit-2" style="width: 13px; height: 13px; color: var(--text-muted);"></i>
                </button>
                <button type="button" class="btn-icon" style="width: 28px; height: 28px;" onclick="UIBudgets.unlockCategory(${b.categoryId})" title="Bỏ khóa">
                  <i data-lucide="unlock" style="width: 13px; height: 13px; color: var(--text-muted);"></i>
                </button>
              </div>
            </div>

            <div class="budget-item-amounts">
              <div>
                <span style="font-size: 0.75rem; color: var(--text-muted);">Đã chi: </span>
                <span class="budget-item-spent-val" style="color: ${spent > limit ? 'var(--expense)' : 'var(--text-primary)'};">${this.formatMoney(spent)}</span>
              </div>
              <div style="text-align: right;">
                <span class="budget-item-limit-val">Hạn mức: ${this.formatMoney(limit)}</span>
              </div>
            </div>

            <div class="budget-progress-track">
              <div class="budget-progress-fill" style="width: ${Math.min(100, percent)}%; background: ${barColor};"></div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.76rem; color: var(--text-muted);">
              <span>Đã tiêu: ${percent}%</span>
              <span>${remaining >= 0 ? `Còn lại: <b style="color: var(--income);">${this.formatMoney(remaining)}</b>` : `Vượt: <b style="color: var(--expense);">${this.formatMoney(Math.abs(remaining))}</b>`}</span>
            </div>
          </div>
        `;
      }
      lockedHtml = `<div class="budget-cards-grid">${cards}</div>`;
    }

    container.innerHTML = `
      ${heroHtml}
      <div class="budget-locked-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin: 0;">Mục Chi Khóa Theo Ngân Sách</h3>
          <span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; padding: 2px 7px; border-radius: 12px; font-size: 0.75rem; font-weight: 700;">${lockedBudgets.length}</span>
        </div>
        <button type="button" class="btn-secondary" style="font-size: 0.82rem; padding: 6px 12px;" onclick="UIBudgets.openLockCategoryModal()">
          <i data-lucide="plus" style="width: 14px; height: 14px;"></i> Khóa Thêm Mục
        </button>
      </div>
      ${poolHtml}
      ${lockedHtml}
    `;
  },

  /* ==================== MODE 2: DETAILED ACTUAL BUDGET ==================== */
  renderDetailedMode({ categoryBudgets, expenseCategories, catMap, totalIncome, totalSpent, spentByCat }) {
    const container = document.getElementById('budget-detailed-container');
    if (!container) return;

    const budgetMap = new Map(categoryBudgets.map(b => [Number(b.categoryId), b]));
    const totalBudgeted = categoryBudgets.reduce((sum, b) => sum + (b.limitAmount || 0), 0);
    const toBudget = totalIncome - totalBudgeted;

    let toBudgetStatusClass = 'ready';
    let toBudgetBadge = '<span class="budget-actual-kpi-badge" style="background: rgba(16, 185, 129, 0.15); color: var(--income);"> Sẵn sàng phân bổ</span>';
    if (toBudget === 0) {
      toBudgetBadge = '<span class="budget-actual-kpi-badge" style="background: rgba(13, 148, 136, 0.15); color: var(--primary);">🎯 Zero-Base Hoàn Hảo!</span>';
    } else if (toBudget < 0) {
      toBudgetStatusClass = 'over';
      toBudgetBadge = '<span class="budget-actual-kpi-badge" style="background: rgba(244, 63, 94, 0.15); color: var(--expense);">⚠️ Vượt thu nhập</span>';
    }

    const kpiHtml = `
      <div class="budget-actual-kpis">
        <div class="budget-actual-kpi-card">
          <div class="budget-actual-kpi-label">Tổng Thu Tháng Này</div>
          <div class="budget-actual-kpi-val" style="color: var(--income);">${this.formatMoney(totalIncome)}</div>
          <span style="font-size: 0.72rem; color: var(--text-muted);">Nguồn tiền khả dụng</span>
        </div>

        <div class="budget-actual-kpi-card">
          <div class="budget-actual-kpi-label">Tổng Đã Phân Bổ</div>
          <div class="budget-actual-kpi-val" style="color: var(--primary);">${this.formatMoney(totalBudgeted)}</div>
          <span style="font-size: 0.72rem; color: var(--text-muted);">${categoryBudgets.length} danh mục có hạn mức</span>
        </div>

        <div class="budget-actual-kpi-card to-budget ${toBudgetStatusClass}">
          <div class="budget-actual-kpi-label">Chờ Phân Bổ (To Budget)</div>
          <div class="budget-actual-kpi-val" style="color: ${toBudget < 0 ? 'var(--expense)' : (toBudget === 0 ? 'var(--primary)' : 'var(--income)')};">
            ${this.formatMoney(toBudget)}
          </div>
          ${toBudgetBadge}
        </div>
      </div>
    `;

    // Matrix Table of Categories
    let rowsHtml = '';
    for (const cat of expenseCategories) {
      const b = budgetMap.get(cat.id);
      const budgeted = b ? (b.limitAmount || 0) : 0;
      const spent = spentByCat[cat.id] || 0;
      const available = budgeted - spent;
      const percent = budgeted > 0 ? Math.round((spent / budgeted) * 100) : (spent > 0 ? 100 : 0);

      let availBadgeClass = 'zero';
      let availText = '0đ';
      if (available > 0) {
        availBadgeClass = 'positive';
        availText = `+${this.formatMoney(available)}`;
      } else if (available < 0) {
        availBadgeClass = 'negative';
        availText = `Quá ${this.formatMoney(Math.abs(available))}`;
      }

      let barColor = 'linear-gradient(90deg, #10b981, #06b6d4)';
      if (available < 0) {
        barColor = 'linear-gradient(90deg, #f43f5e, #e11d48)';
      } else if (percent >= 80) {
        barColor = 'linear-gradient(90deg, #f59e0b, #d97706)';
      }

      rowsHtml += `
        <div class="budget-matrix-row">
          <div class="budget-cell-cat">
            <div class="category-icon-bubble" style="background: ${cat.color || '#0d9488'}22; color: ${cat.color || '#0d9488'}; width: 32px; height: 32px; font-size: 0.85rem;">
              <i data-lucide="${cat.icon || 'tag'}"></i>
            </div>
            <div style="min-width: 0;">
              <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${escapeHTML(cat.name)}
              </div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">
                ${percent}% sử dụng
              </div>
            </div>
          </div>

          <div>
            <div class="budget-cell-editable" onclick="UIBudgets.openQuickEditModal(${cat.id})" title="Nhấp để sửa nhanh số tiền">
              <span>${this.formatMoney(budgeted)}</span>
              <i data-lucide="edit-3" style="width: 12px; height: 12px; opacity: 0.5;"></i>
            </div>
          </div>

          <div>
            <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-primary); font-variant-numeric: tabular-nums;">
              ${this.formatMoney(spent)}
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">Thực tế chi</div>
          </div>

          <div>
            <span class="budget-avail-badge ${availBadgeClass}">${availText}</span>
          </div>

          <!-- Mini Progress line below row on mobile -->
          <div style="grid-column: 1 / -1; margin-top: 4px;">
            <div class="budget-progress-track" style="height: 4px;">
              <div class="budget-progress-fill" style="width: ${Math.min(100, percent)}%; background: ${barColor};"></div>
            </div>
          </div>
        </div>
      `;
    }

    const matrixHtml = `
      <div class="budget-matrix-card">
        <div class="budget-matrix-header-row">
          <div>HẠNG MỤC CHI</div>
          <div>NGÂN SÁCH (SỬA NHANH)</div>
          <div>ĐÃ CHI</div>
          <div>CÒN LẠI (AVAILABLE)</div>
        </div>
        <div>${rowsHtml}</div>
      </div>
    `;

    container.innerHTML = `
      ${kpiHtml}
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
        <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary);">Ma Trận Hạn Mức Danh Mục</div>
        <div style="font-size: 0.78rem; color: var(--text-muted);">💡 Bấm vào ô số tiền Ngân Sách để chỉnh sửa nhanh</div>
      </div>
      ${matrixHtml}
    `;
  },

  /* ==================== NON-INTRUSIVE DISMISSIBLE ALERTS ==================== */
  checkBudgetAlerts({ overallBudget, categoryBudgets, catMap, totalSpent, spentByCat }) {
    const banners = [
      document.getElementById('tx-budget-alert-banner'),
      document.getElementById('dashboard-budget-alert')
    ].filter(Boolean);

    if (banners.length === 0) return;

    let hasAlert = false;
    let title = '';
    let message = '';
    let alertSignature = '';

    // 1. Check Overall Budget
    if (overallBudget && (overallBudget.limitAmount || 0) > 0) {
      const limit = overallBudget.limitAmount;
      if (totalSpent > limit) {
        const over = totalSpent - limit;
        hasAlert = true;
        title = `⚠️ Vượt Ngân Sách Tổng ${this.formatMonthDisplay(this.currentMonth)}!`;
        message = `Đã chi ${this.formatMoney(totalSpent)} / ${this.formatMoney(limit)} (Vượt ${this.formatMoney(over)})`;
        alertSignature = `overall_${this.currentMonth}_${Math.floor(over / 50000)}`;
      }
    }

    // 2. Check Category Budgets (if overall not exceeded, find top exceeded category)
    if (!hasAlert && categoryBudgets.length > 0) {
      let topOverAmount = 0;
      let topOverCatName = '';
      let overCount = 0;

      for (const b of categoryBudgets) {
        const spent = spentByCat[b.categoryId] || 0;
        const limit = b.limitAmount || 0;
        if (limit > 0 && spent > limit) {
          overCount++;
          const diff = spent - limit;
          if (diff > topOverAmount) {
            topOverAmount = diff;
            const cat = catMap.get(Number(b.categoryId));
            topOverCatName = cat ? cat.name : 'Danh mục';
          }
        }
      }

      if (overCount > 0) {
        hasAlert = true;
        title = `⚠️ Vượt hạn mức [${topOverCatName}]!`;
        message = `Đã chi vượt ${this.formatMoney(topOverAmount)}${overCount > 1 ? ` (và ${overCount - 1} mục khác)` : ''}`;
        alertSignature = `cat_${this.currentMonth}_${topOverCatName}_${Math.floor(topOverAmount / 50000)}`;
      }
    }

    if (!hasAlert) {
      banners.forEach(b => {
        b.style.display = 'none';
      });
      return;
    }

    // Check if user dismissed this alert in this session
    const isDismissed = this.dismissedAlertSignatures.has(alertSignature) ||
      sessionStorage.getItem(`stc_budget_alert_${alertSignature}`) === '1';

    if (isDismissed) {
      banners.forEach(b => {
        b.style.display = 'none';
      });
      return;
    }

    // Build Banner HTML
    const bannerHtml = `
      <div class="budget-alert-icon"><i data-lucide="alert-triangle"></i></div>
      <div class="budget-alert-content">
        <div class="budget-alert-title">${escapeHTML(title)}</div>
        <div class="budget-alert-desc">${escapeHTML(message)}</div>
      </div>
      <div class="budget-alert-actions">
        <button type="button" class="budget-alert-view-btn" onclick="window.app.switchView('budgets')">Xem</button>
        <button type="button" class="budget-alert-close-btn" onclick="UIBudgets.dismissAlert('${alertSignature}')" title="Tắt cảnh báo">
          <i data-lucide="x" style="width: 16px; height: 16px;"></i>
        </button>
      </div>
    `;

    banners.forEach(b => {
      b.innerHTML = bannerHtml;
      b.style.display = 'flex';
      b.style.opacity = '1';
      b.style.maxHeight = '120px';
    });

    if (window.lucide) lucide.createIcons();
  },

  dismissAlert(sig) {
    if (sig) {
      this.dismissedAlertSignatures.add(sig);
      try {
        sessionStorage.setItem(`stc_budget_alert_${sig}`, '1');
      } catch (e) {}
    }

    const banners = [
      document.getElementById('tx-budget-alert-banner'),
      document.getElementById('dashboard-budget-alert')
    ].filter(Boolean);

    banners.forEach(b => {
      b.style.opacity = '0';
      b.style.maxHeight = '0';
      b.style.paddingTop = '0';
      b.style.paddingBottom = '0';
      b.style.marginTop = '0';
      b.style.marginBottom = '0';
      setTimeout(() => {
        b.style.display = 'none';
      }, 280);
    });
  },

  /* ==================== HELPER: REALTIME STATUS FOR TRANSACTION FORM ==================== */
  async getCategoryBudgetInfo(catId) {
    if (!catId) return null;
    try {
      const ym = new Date().toISOString().slice(0, 7);
      const budget = await db.budgets.where({ categoryId: Number(catId), month: ym }).first();
      if (!budget || !budget.limitAmount) return null;

      const txs = await db.transactions
        .where('date')
        .between(`${ym}-01`, `${ym}-31`, true, true)
        .and(t => t.type === 'expense' && Number(t.categoryId) === Number(catId) && t.isDeleted === 0)
        .toArray();

      const spent = txs.reduce((sum, t) => sum + (t.amount || 0), 0);
      const remaining = budget.limitAmount - spent;
      return {
        limit: budget.limitAmount,
        spent,
        remaining,
        isOver: remaining < 0,
        text: remaining >= 0
          ? `Còn ${this.formatMoney(remaining)} ngân sách`
          : `Đã vượt ${this.formatMoney(Math.abs(remaining))}`
      };
    } catch (e) {
      return null;
    }
  },

  /* ==================== MODAL 1: OVERALL BUDGET ==================== */
  async openOverallBudgetModal() {
    const modal = document.getElementById('modal-budget-overall');
    if (!modal) return;

    const monthDisplay = document.getElementById('budget-overall-month');
    if (monthDisplay) monthDisplay.value = this.formatMonthDisplay(this.currentMonth);

    const amountInput = document.getElementById('budget-overall-amount');
    const deleteBtn = document.getElementById('budget-overall-delete-btn');

    const existing = await db.budgets.where('month').equals(this.currentMonth).toArray();
    const overall = existing.find(b => b.categoryId === 'TOTAL' || b.categoryId === 0 || b.isOverall);

    if (overall && overall.limitAmount) {
      if (amountInput) amountInput.value = new Intl.NumberFormat('vi-VN').format(overall.limitAmount);
      if (deleteBtn) deleteBtn.style.display = 'inline-block';
    } else {
      if (amountInput) amountInput.value = '';
      if (deleteBtn) deleteBtn.style.display = 'none';
    }

    modal.classList.add('open');
    setTimeout(() => amountInput?.focus(), 120);
    if (window.lucide) lucide.createIcons();
  },

  closeOverallModal() {
    const modal = document.getElementById('modal-budget-overall');
    if (modal) modal.classList.remove('open');
  },

  setOverallPreset(amount) {
    const input = document.getElementById('budget-overall-amount');
    if (input) {
      input.value = new Intl.NumberFormat('vi-VN').format(amount);
    }
  },

  async handleOverallBudgetSubmit() {
    const amountStr = document.getElementById('budget-overall-amount')?.value || '';
    const limitAmount = Number(amountStr.replace(/\D/g, ''));

    if (!limitAmount || limitAmount <= 0) {
      showToast('Vui lòng nhập số tiền ngân sách tổng hợp lệ', 'error');
      return;
    }

    const existing = await db.budgets.where('month').equals(this.currentMonth).toArray();
    const overall = existing.find(b => b.categoryId === 'TOTAL' || b.categoryId === 0 || b.isOverall);
    const now = Date.now();

    if (overall) {
      await db.budgets.update(overall.id, {
        limitAmount,
        categoryId: 'TOTAL',
        isOverall: true,
        updatedAt: now
      });
      showToast('Đã cập nhật ngân sách tổng của tháng', 'success');
    } else {
      await db.budgets.add({
        categoryId: 'TOTAL',
        month: this.currentMonth,
        limitAmount,
        isOverall: true,
        updatedAt: now
      });
      showToast('Đã thiết lập ngân sách tổng của tháng', 'success');
    }

    this.closeOverallModal();
    window.app.refreshAll();
  },

  async deleteOverallBudget() {
    const existing = await db.budgets.where('month').equals(this.currentMonth).toArray();
    const overall = existing.find(b => b.categoryId === 'TOTAL' || b.categoryId === 0 || b.isOverall);
    if (overall) {
      await db.budgets.delete(overall.id);
      showToast('Đã xóa ngân sách tổng của tháng', 'info');
      this.closeOverallModal();
      window.app.refreshAll();
    }
  },

  /* ==================== MODAL 2: LOCK CATEGORY ==================== */
  async openLockCategoryModal(catId = null) {
    const modal = document.getElementById('modal-budget-lock');
    if (!modal) return;

    const select = document.getElementById('budget-lock-category-select');
    const amountInput = document.getElementById('budget-lock-amount');
    const catIdHidden = document.getElementById('budget-lock-cat-id');
    const deleteBtn = document.getElementById('budget-lock-delete-btn');

    // Populate expense categories
    const categories = await db.categories.where('type').equals('expense').and(c => c.isDeleted === 0).toArray();
    if (select) {
      select.innerHTML = categories.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
    }

    if (catId) {
      if (select) {
        select.value = catId;
        select.disabled = true;
      }
      if (catIdHidden) catIdHidden.value = catId;

      const existing = await db.budgets.where({ categoryId: Number(catId), month: this.currentMonth }).first();
      if (existing && amountInput) {
        amountInput.value = new Intl.NumberFormat('vi-VN').format(existing.limitAmount);
      }
      if (deleteBtn) deleteBtn.style.display = 'inline-block';
    } else {
      if (select) {
        select.disabled = false;
        select.selectedIndex = 0;
      }
      if (catIdHidden) catIdHidden.value = '';
      if (amountInput) amountInput.value = '';
      if (deleteBtn) deleteBtn.style.display = 'none';
    }

    modal.classList.add('open');
    setTimeout(() => amountInput?.focus(), 120);
    if (window.lucide) lucide.createIcons();
  },

  closeLockModal() {
    const modal = document.getElementById('modal-budget-lock');
    if (modal) modal.classList.remove('open');
  },

  setLockPreset(amount) {
    const input = document.getElementById('budget-lock-amount');
    if (input) {
      input.value = new Intl.NumberFormat('vi-VN').format(amount);
    }
  },

  async handleLockCategorySubmit() {
    const select = document.getElementById('budget-lock-category-select');
    const catIdHidden = document.getElementById('budget-lock-cat-id');
    const categoryId = Number(catIdHidden?.value || select?.value);
    const amountStr = document.getElementById('budget-lock-amount')?.value || '';
    const limitAmount = Number(amountStr.replace(/\D/g, ''));

    if (!categoryId || !limitAmount || limitAmount <= 0) {
      showToast('Vui lòng chọn danh mục và nhập hạn mức hợp lệ', 'error');
      return;
    }

    const existing = await db.budgets.where({ categoryId, month: this.currentMonth }).first();
    const now = Date.now();

    if (existing) {
      await db.budgets.update(existing.id, {
        limitAmount,
        isLocked: 1,
        updatedAt: now
      });
      showToast('Đã cập nhật hạn mức khóa cho danh mục', 'success');
    } else {
      await db.budgets.add({
        categoryId,
        month: this.currentMonth,
        limitAmount,
        isLocked: 1,
        updatedAt: now
      });
      showToast('Đã khóa trần danh mục theo ngân sách', 'success');
    }

    this.closeLockModal();
    window.app.refreshAll();
  },

  async unlockCurrentCategory() {
    const catIdHidden = document.getElementById('budget-lock-cat-id');
    const select = document.getElementById('budget-lock-category-select');
    const categoryId = Number(catIdHidden?.value || select?.value);
    if (categoryId) {
      await this.unlockCategory(categoryId);
      this.closeLockModal();
    }
  },

  async unlockCategory(catId) {
    const existing = await db.budgets.where({ categoryId: Number(catId), month: this.currentMonth }).first();
    if (existing) {
      await db.budgets.update(existing.id, { isLocked: 0, updatedAt: Date.now() });
      showToast('Đã bỏ khóa mục chi', 'info');
      window.app.refreshAll();
    }
  },

  /* ==================== MODAL 3: ACTUAL BUDGET CATEGORY ==================== */
  async openCategoryModal(catId = null) {
    const modal = document.getElementById('modal-budget-category');
    if (!modal) return;

    const select = document.getElementById('budget-cat-select');
    const amountInput = document.getElementById('budget-cat-amount');
    const catIdHidden = document.getElementById('budget-cat-id');
    const deleteBtn = document.getElementById('budget-cat-delete-btn');

    const categories = await db.categories.where('type').equals('expense').and(c => c.isDeleted === 0).toArray();
    if (select) {
      select.innerHTML = categories.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
    }

    if (catId) {
      if (select) select.value = catId;
      if (catIdHidden) catIdHidden.value = catId;
      const existing = await db.budgets.where({ categoryId: Number(catId), month: this.currentMonth }).first();
      if (existing && amountInput) {
        amountInput.value = new Intl.NumberFormat('vi-VN').format(existing.limitAmount);
      }
      if (deleteBtn) deleteBtn.style.display = 'inline-block';
    } else {
      if (catIdHidden) catIdHidden.value = '';
      if (amountInput) amountInput.value = '';
      if (deleteBtn) deleteBtn.style.display = 'none';
    }

    modal.classList.add('open');
    setTimeout(() => amountInput?.focus(), 120);
    if (window.lucide) lucide.createIcons();
  },

  closeCategoryModal() {
    const modal = document.getElementById('modal-budget-category');
    if (modal) modal.classList.remove('open');
  },

  setCatPreset(amount) {
    const input = document.getElementById('budget-cat-amount');
    if (input) {
      input.value = new Intl.NumberFormat('vi-VN').format(amount);
    }
  },

  async handleCategoryBudgetSubmit() {
    const select = document.getElementById('budget-cat-select');
    const catIdHidden = document.getElementById('budget-cat-id');
    const categoryId = Number(catIdHidden?.value || select?.value);
    const amountStr = document.getElementById('budget-cat-amount')?.value || '';
    const limitAmount = Number(amountStr.replace(/\D/g, ''));

    if (!categoryId || !limitAmount || limitAmount <= 0) {
      showToast('Vui lòng chọn danh mục và nhập ngân sách hợp lệ', 'error');
      return;
    }

    const existing = await db.budgets.where({ categoryId, month: this.currentMonth }).first();
    const now = Date.now();

    if (existing) {
      await db.budgets.update(existing.id, { limitAmount, updatedAt: now });
      showToast('Đã cập nhật phân bổ ngân sách', 'success');
    } else {
      await db.budgets.add({ categoryId, month: this.currentMonth, limitAmount, updatedAt: now });
      showToast('Đã phân bổ ngân sách mới', 'success');
    }

    this.closeCategoryModal();
    window.app.refreshAll();
  },

  async deleteCurrentCategoryBudget() {
    const catIdHidden = document.getElementById('budget-cat-id');
    const select = document.getElementById('budget-cat-select');
    const categoryId = Number(catIdHidden?.value || select?.value);
    if (categoryId) {
      const existing = await db.budgets.where({ categoryId, month: this.currentMonth }).first();
      if (existing) {
        await db.budgets.delete(existing.id);
        showToast('Đã xóa hạn mức danh mục', 'info');
      }
      this.closeCategoryModal();
      window.app.refreshAll();
    }
  },

  /* ==================== MODAL 5: QUICK EDIT INLINE KEYPAD ==================== */
  async openQuickEditModal(catId) {
    const cat = await db.categories.get(Number(catId));
    if (!cat) return;

    // Get current budget and spent
    const existing = await db.budgets.where({ categoryId: Number(catId), month: this.currentMonth }).first();
    const currentLimit = existing ? (existing.limitAmount || 0) : 0;

    const startOfMonth = `${this.currentMonth}-01`;
    const endOfMonth = `${this.currentMonth}-31`;
    const txs = await db.transactions
      .where('date')
      .between(startOfMonth, endOfMonth, true, true)
      .and(t => t.type === 'expense' && Number(t.categoryId) === Number(catId) && t.isDeleted === 0)
      .toArray();
    const spent = txs.reduce((s, t) => s + (t.amount || 0), 0);

    this.quickEditTarget = {
      categoryId: cat.id,
      name: cat.name,
      spent,
      currentAmount: currentLimit,
      color: cat.color || '#0d9488',
      icon: cat.icon || 'tag'
    };

    const modal = document.getElementById('modal-budget-quick-edit');
    if (!modal) return;

    document.getElementById('budget-quick-cat-id').value = cat.id;
    document.getElementById('budget-quick-cat-name').textContent = cat.name;
    document.getElementById('budget-quick-cat-spent').textContent = `Thực tế đã chi tháng này: ${this.formatMoney(spent)}`;

    const bubble = document.getElementById('budget-quick-cat-bubble');
    if (bubble) {
      bubble.style.background = `${cat.color || '#0d9488'}22`;
      bubble.style.color = cat.color || '#0d9488';
      bubble.innerHTML = `<i data-lucide="${cat.icon || 'tag'}"></i>`;
    }

    const input = document.getElementById('budget-quick-amount-input');
    if (input) {
      input.value = currentLimit > 0 ? new Intl.NumberFormat('vi-VN').format(currentLimit) : '';
    }

    modal.classList.add('open');
    setTimeout(() => {
      input?.focus();
      input?.select();
    }, 120);
    if (window.lucide) lucide.createIcons();
  },

  closeQuickEditModal() {
    const modal = document.getElementById('modal-budget-quick-edit');
    if (modal) modal.classList.remove('open');
    this.quickEditTarget = null;
  },

  adjustQuickAmount(delta) {
    const input = document.getElementById('budget-quick-amount-input');
    if (!input) return;
    const current = Number((input.value || '').replace(/\D/g, '')) || 0;
    const next = Math.max(0, current + delta);
    input.value = new Intl.NumberFormat('vi-VN').format(next);
  },

  setQuickToSpent() {
    if (!this.quickEditTarget) return;
    const input = document.getElementById('budget-quick-amount-input');
    if (input) {
      input.value = new Intl.NumberFormat('vi-VN').format(this.quickEditTarget.spent);
    }
  },

  setQuickZero() {
    const input = document.getElementById('budget-quick-amount-input');
    if (input) input.value = '0';
  },

  async handleQuickEditSubmit() {
    if (!this.quickEditTarget) return;
    const categoryId = this.quickEditTarget.categoryId;
    const amountStr = document.getElementById('budget-quick-amount-input')?.value || '';
    const limitAmount = Number(amountStr.replace(/\D/g, '')) || 0;

    const existing = await db.budgets.where({ categoryId, month: this.currentMonth }).first();
    const now = Date.now();

    if (limitAmount <= 0) {
      if (existing) {
        await db.budgets.delete(existing.id);
        showToast(`Đã xóa ngân sách [${this.quickEditTarget.name}]`, 'info');
      }
    } else {
      if (existing) {
        await db.budgets.update(existing.id, { limitAmount, updatedAt: now });
      } else {
        await db.budgets.add({ categoryId, month: this.currentMonth, limitAmount, updatedAt: now });
      }
      showToast(`Đã lưu ngân sách [${this.quickEditTarget.name}]: ${this.formatMoney(limitAmount)}`, 'success');
    }

    this.closeQuickEditModal();
    window.app.refreshAll();
  },

  /* ==================== MODAL 4: COPY BUDGET FROM PAST MONTHS ==================== */
  openCopyModal() {
    const modal = document.getElementById('modal-budget-copy');
    if (!modal) return;

    // Set target month display
    const targetDisplay = document.getElementById('budget-copy-target-display');
    if (targetDisplay) {
      targetDisplay.value = this.formatMonthDisplay(this.currentMonth);
    }

    // Populate last 6 months into select
    const select = document.getElementById('budget-copy-source-select');
    if (select) {
      const [curY, curM] = this.currentMonth.split('-').map(Number);
      const options = [];
      for (let i = 1; i <= 6; i++) {
        const d = new Date(curY, curM - 1 - i, 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const ym = `${y}-${m}`;
        options.push(`<option value="${ym}">${this.formatMonthDisplay(ym)}${i === 1 ? ' (Tháng liền kề trước)' : ''}</option>`);
      }
      select.innerHTML = options.join('');
    }

    this.selectCopyOption('exact');
    modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeCopyModal() {
    const modal = document.getElementById('modal-budget-copy');
    if (modal) modal.classList.remove('open');
  },

  selectCopyOption(mode) {
    document.querySelectorAll('.budget-copy-option').forEach(el => el.classList.remove('active'));
    const activeLabel = document.getElementById(`opt-copy-${mode === 'fill_empty' ? 'empty' : (mode === 'actual_spent' ? 'spent' : 'exact')}`);
    if (activeLabel) {
      activeLabel.classList.add('active');
      const radio = activeLabel.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    }
  },

  async handleCopySubmit() {
    const sourceMonth = document.getElementById('budget-copy-source-select')?.value;
    const targetMonth = this.currentMonth;
    const copyMode = document.querySelector('input[name="budget-copy-mode"]:checked')?.value || 'exact';

    if (!sourceMonth || !targetMonth || sourceMonth === targetMonth) {
      showToast('Vui lòng chọn tháng nguồn hợp lệ', 'error');
      return;
    }

    // 1. Fetch source month budgets & transactions
    const sourceBudgets = await db.budgets.where('month').equals(sourceMonth).toArray();
    const targetBudgets = await db.budgets.where('month').equals(targetMonth).toArray();
    const targetMap = new Map(targetBudgets.map(b => [String(b.categoryId), b]));

    let copiedCount = 0;
    const now = Date.now();

    if (copyMode === 'actual_spent') {
      // Calculate actual spending of source month
      const startOfMonth = `${sourceMonth}-01`;
      const endOfMonth = `${sourceMonth}-31`;
      const sourceTxs = await db.transactions
        .where('date')
        .between(startOfMonth, endOfMonth, true, true)
        .and(t => t.type === 'expense' && t.isDeleted === 0)
        .toArray();

      const spentByCat = {};
      let totalExpense = 0;
      for (const t of sourceTxs) {
        totalExpense += (t.amount || 0);
        if (t.categoryId) {
          spentByCat[t.categoryId] = (spentByCat[t.categoryId] || 0) + (t.amount || 0);
        }
      }

      // Copy overall budget based on total spent rounded to thousands
      const roundedTotal = Math.round(totalExpense / 1000) * 1000;
      if (roundedTotal > 0) {
        const existingOverall = targetBudgets.find(b => b.categoryId === 'TOTAL' || b.categoryId === 0 || b.isOverall);
        if (existingOverall) {
          await db.budgets.update(existingOverall.id, { limitAmount: roundedTotal, updatedAt: now });
        } else {
          await db.budgets.add({ categoryId: 'TOTAL', month: targetMonth, limitAmount: roundedTotal, isOverall: true, updatedAt: now });
        }
        copiedCount++;
      }

      // Copy category budgets based on spent
      for (const [catIdStr, spent] of Object.entries(spentByCat)) {
        const catId = Number(catIdStr);
        const roundedSpent = Math.round(spent / 1000) * 1000;
        if (roundedSpent <= 0) continue;

        const existing = targetMap.get(String(catId));
        if (existing) {
          await db.budgets.update(existing.id, { limitAmount: roundedSpent, updatedAt: now });
        } else {
          await db.budgets.add({ categoryId: catId, month: targetMonth, limitAmount: roundedSpent, updatedAt: now });
        }
        copiedCount++;
      }
    } else {
      // 'exact' or 'fill_empty'
      if (sourceBudgets.length === 0) {
        showToast(`Tháng ${this.formatMonthDisplay(sourceMonth)} chưa có thiết lập ngân sách nào`, 'warning');
        return;
      }

      for (const b of sourceBudgets) {
        const existing = targetMap.get(String(b.categoryId));
        if (copyMode === 'fill_empty' && existing && existing.limitAmount > 0) {
          continue; // Skip already defined in target
        }

        if (existing) {
          await db.budgets.update(existing.id, {
            limitAmount: b.limitAmount,
            isLocked: b.isLocked || 0,
            isOverall: b.isOverall || false,
            updatedAt: now
          });
        } else {
          await db.budgets.add({
            categoryId: b.categoryId,
            month: targetMonth,
            limitAmount: b.limitAmount,
            isLocked: b.isLocked || 0,
            isOverall: b.isOverall || false,
            updatedAt: now
          });
        }
        copiedCount++;
      }
    }

    this.closeCopyModal();
    showToast(`Đã sao chép thành công ${copiedCount} mục ngân sách từ ${this.formatMonthDisplay(sourceMonth)}`, 'success');
    window.app.refreshAll();
  },

  /* ==================== FORMATTER UTILITY ==================== */
  formatMoney(num) {
    return new Intl.NumberFormat('vi-VN').format(Math.round(num || 0)) + 'đ';
  }
};

window.UIBudgets = UIBudgets;
