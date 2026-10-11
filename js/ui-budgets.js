/**
 * SỔ THU CHI - UI BUDGETS MODULE
 * Quản lý ngân sách đa chế độ:
 * 1. Ngân sách Tổng của tháng & Khóa trần các danh mục chi tiêu thiết yếu
 * 2. Chi tiết dạng bảng tính theo phong cách Actual Budget (Zero-based Envelope Budgeting)
 * 3. Chuyển đổi chế độ & Cài đặt áp dụng ngân sách theo từng ví/tài khoản (Nút Cài đặt trên Header)
 * 4. Nút Sao chép bên trái bộ chọn tháng [Sao chép] < Tháng mm/yyyy >
 * 5. Bố cục rõ ràng, gọn gàng, loại bỏ chi tiết thừa, tối ưu trên cả Mobile & Desktop
 */

const UIBudgets = {
  currentMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
  currentMode: 'simple', // 'simple' | 'detailed'
  applicableWallets: 'ALL', // 'ALL' | [accountId, ...]
  quickEditTarget: null,
  dismissedAlertSignatures: new Set(),

  async init() {
    // 1. Load saved mode preference
    try {
      const savedMode = await db.settings.get('budget_mode');
      if (savedMode && (savedMode.value === 'simple' || savedMode.value === 'detailed')) {
        this.currentMode = savedMode.value;
      }
    } catch (e) {
      console.warn('Error loading budget mode:', e);
    }

    // 2. Load saved applicable wallets
    try {
      const savedWallets = await db.settings.get('budget_applicable_accounts');
      if (savedWallets && savedWallets.value) {
        this.applicableWallets = savedWallets.value;
      }
    } catch (e) {
      console.warn('Error loading budget applicable accounts:', e);
    }

    this.bindEvents();
    await this.render();
  },

  bindEvents() {
    this.updateMonthLabels();

    // Auto format inputs for amounts
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

    // Form 0: Cài đặt ngân sách (Chế độ & Ví áp dụng)
    const formSettings = document.getElementById('budget-settings-form');
    if (formSettings) {
      formSettings.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleSettingsSubmit();
      });
    }

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

  /* ==================== BUDGET SETTINGS MODAL ==================== */
  async openSettingsModal() {
    const modal = document.getElementById('modal-budget-settings');
    if (!modal) return;

    // Set active mode radio & style
    this.selectSettingMode(this.currentMode);

    // Populate accounts list
    const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
    const walletListEl = document.getElementById('budget-settings-wallet-list');

    const isCustom = Array.isArray(this.applicableWallets) && this.applicableWallets.length > 0;
    this.selectWalletScope(isCustom ? 'custom' : 'all');

    if (walletListEl) {
      walletListEl.innerHTML = accounts.map(acc => {
        const checked = isCustom
          ? this.applicableWallets.includes(acc.id)
          : !acc.excludeFromReport;
        return `
          <label class="budget-wallet-check-item">
            <input type="checkbox" name="budget-wallet-item" value="${acc.id}" ${checked ? 'checked' : ''}>
            <div class="category-icon-bubble" style="background: ${acc.color || '#0d9488'}22; color: ${acc.color || '#0d9488'}; width: 28px; height: 28px; font-size: 0.8rem;">
              <i data-lucide="${acc.icon || 'wallet'}"></i>
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; font-size: 0.86rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${escapeHTML(acc.name)}
              </div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${this.formatMoney(acc.balance || 0)}</div>
            </div>
          </label>
        `;
      }).join('');
    }

    modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeSettingsModal() {
    const modal = document.getElementById('modal-budget-settings');
    if (modal) modal.classList.remove('open');
  },

  selectSettingMode(mode) {
    const cardSimple = document.getElementById('setting-mode-simple-card');
    const cardDetailed = document.getElementById('setting-mode-detailed-card');
    if (cardSimple) {
      cardSimple.classList.toggle('active', mode === 'simple');
      const radio = cardSimple.querySelector('input[type="radio"]');
      if (radio) radio.checked = (mode === 'simple');
    }
    if (cardDetailed) {
      cardDetailed.classList.toggle('active', mode === 'detailed');
      const radio = cardDetailed.querySelector('input[type="radio"]');
      if (radio) radio.checked = (mode === 'detailed');
    }
  },

  selectWalletScope(scope) {
    const cardAll = document.getElementById('scope-all-card');
    const cardCustom = document.getElementById('scope-custom-card');
    const walletList = document.getElementById('budget-settings-wallet-list');
    const quickActions = document.getElementById('budget-wallet-quick-actions');

    if (cardAll) {
      cardAll.classList.toggle('active', scope === 'all');
      const radio = cardAll.querySelector('input[type="radio"]');
      if (radio) radio.checked = (scope === 'all');
    }
    if (cardCustom) {
      cardCustom.classList.toggle('active', scope === 'custom');
      const radio = cardCustom.querySelector('input[type="radio"]');
      if (radio) radio.checked = (scope === 'custom');
    }
    if (walletList) {
      walletList.style.display = scope === 'custom' ? 'flex' : 'none';
    }
    if (quickActions) {
      quickActions.style.display = scope === 'custom' ? 'inline-flex' : 'none';
    }
  },

  toggleAllWallets(selectAll) {
    const checkboxes = document.querySelectorAll('input[name="budget-wallet-item"]');
    checkboxes.forEach(cb => { cb.checked = selectAll; });
  },

  async handleSettingsSubmit() {
    const selectedMode = document.querySelector('input[name="budget-setting-mode"]:checked')?.value || 'simple';
    const selectedScope = document.querySelector('input[name="budget-wallet-scope"]:checked')?.value || 'all';

    let applicableWallets = 'ALL';
    if (selectedScope === 'custom') {
      const checkedBoxes = Array.from(document.querySelectorAll('input[name="budget-wallet-item"]:checked'));
      const ids = checkedBoxes.map(cb => Number(cb.value)).filter(Boolean);
      if (ids.length === 0) {
        showToast('Vui lòng chọn ít nhất một ví để áp dụng ngân sách', 'warning');
        return;
      }
      applicableWallets = ids;
    }

    this.currentMode = selectedMode;
    this.applicableWallets = applicableWallets;

    try {
      await db.settings.put({ key: 'budget_mode', value: selectedMode });
      await db.settings.put({ key: 'budget_applicable_accounts', value: applicableWallets });
      showToast('Đã lưu cài đặt ngân sách', 'success');
    } catch (e) {
      console.warn('Error saving budget settings:', e);
    }

    this.closeSettingsModal();
    await this.render();
  },

  handlePrimaryAddAction() {
    if (this.currentMode === 'simple') {
      this.openOverallBudgetModal();
    } else {
      this.openCategoryModal();
    }
  },

  /* ==================== DATA QUERIES & RENDER ==================== */
  async render() {
    this.updateMonthLabels();

    // 1. Update toolbar badge labels
    const modeBadgeLabel = document.getElementById('budget-mode-badge-label');
    if (modeBadgeLabel) {
      modeBadgeLabel.textContent = this.currentMode === 'simple' ? 'Ngân sách Tổng' : 'Bảng Chi Tiết (Actual)';
    }

    const mainAddLabel = document.getElementById('budget-main-add-label');
    if (mainAddLabel) {
      mainAddLabel.textContent = this.currentMode === 'simple' ? 'Đặt Ngân Sách' : 'Thêm Mục';
    }

    // 2. Fetch all accounts & check custom wallet scope
    const allAccounts = await db.accounts.where('isDeleted').equals(0).toArray();
    const accountMap = new Map(allAccounts.map(a => [a.id, a]));

    const scopeBar = document.getElementById('budget-scope-bar');
    let allowedAccountIds = null;

    if (Array.isArray(this.applicableWallets) && this.applicableWallets.length > 0) {
      allowedAccountIds = new Set(this.applicableWallets);
      if (scopeBar) {
        const names = this.applicableWallets.map(id => accountMap.get(id)?.name || 'Ví').slice(0, 2).join(', ');
        const extra = this.applicableWallets.length > 2 ? ` (+${this.applicableWallets.length - 2})` : '';
        scopeBar.innerHTML = `<i data-lucide="wallet" style="width: 12px; height: 12px;"></i> <span>Ví: <b>${escapeHTML(names + extra)}</b></span> <i data-lucide="chevron-down" style="width: 11px; height: 11px; opacity: 0.7;"></i>`;
        scopeBar.style.display = 'inline-flex';
      }
    } else {
      // Default: exclude accounts with excludeFromReport
      const excludedAccounts = allAccounts.filter(a => !!a.excludeFromReport);
      const excludedAccountIds = new Set(excludedAccounts.map(a => a.id));
      allowedAccountIds = new Set(allAccounts.filter(a => !excludedAccountIds.has(a.id)).map(a => a.id));
      if (scopeBar) {
        scopeBar.innerHTML = `<i data-lucide="wallet" style="width: 12px; height: 12px;"></i> <span>Tất cả ví</span> <i data-lucide="chevron-down" style="width: 11px; height: 11px; opacity: 0.7;"></i>`;
        scopeBar.style.display = 'inline-flex';
      }
    }

    // 3. Get transactions of current month filtered by applicable accounts
    const startOfMonth = `${this.currentMonth}-01`;
    const endOfMonth = `${this.currentMonth}-31`;
    const allTxs = await db.transactions
      .where('date')
      .between(startOfMonth, endOfMonth, true, true)
      .and(t => t.isDeleted === 0)
      .toArray();

    const txs = allTxs.filter(t => allowedAccountIds.has(t.accountId));
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

    // 4. Get budgets for current month
    const rawBudgets = await db.budgets.where('month').equals(this.currentMonth).toArray();
    const overallBudget = rawBudgets.find(b => b.categoryId === 'TOTAL' || b.categoryId === 0 || b.isOverall);
    const categoryBudgets = rawBudgets.filter(b => b.categoryId !== 'TOTAL' && b.categoryId !== 0 && !b.isOverall);

    // 5. Active expense categories
    const allCategories = await db.categories.where('isDeleted').equals(0).toArray();
    const expenseCategories = allCategories.filter(c => c.type === 'expense');
    const catMap = new Map(allCategories.map(c => [c.id, c]));

    // 6. Switch pane visibility
    const paneSimple = document.getElementById('budget-simple-container');
    const paneDetailed = document.getElementById('budget-detailed-container');

    if (this.currentMode === 'simple') {
      if (paneSimple) paneSimple.style.display = 'block';
      if (paneDetailed) paneDetailed.style.display = 'none';
      this.renderSimpleMode({
        overallBudget,
        categoryBudgets,
        expenseCategories,
        catMap,
        totalSpent,
        spentByCat
      });
    } else {
      if (paneSimple) paneSimple.style.display = 'none';
      if (paneDetailed) paneDetailed.style.display = 'block';
      this.renderDetailedMode({
        categoryBudgets,
        expenseCategories,
        catMap,
        totalIncome,
        totalSpent,
        spentByCat
      });
    }

    // 7. Check non-intrusive alerts
    this.checkBudgetAlerts({
      overallBudget,
      categoryBudgets,
      catMap,
      totalSpent,
      spentByCat
    });

    if (window.lucide) lucide.createIcons();
  },

  /* ==================== MODE 1: SIMPLE OVERALL & LOCKED CATEGORIES ==================== */
  renderSimpleMode({ overallBudget, categoryBudgets, expenseCategories, catMap, totalSpent, spentByCat }) {
    const container = document.getElementById('budget-simple-container');
    if (!container) return;

    const lockedBudgets = categoryBudgets.filter(b => b.isLocked === 1 || b.isLocked === true);
    const lockedLimitTotal = lockedBudgets.reduce((sum, b) => sum + (b.limitAmount || 0), 0);
    const lockedSpentTotal = lockedBudgets.reduce((sum, b) => sum + (spentByCat[b.categoryId] || 0), 0);

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
      const flexibleLimit = Math.max(0, overallLimit - lockedLimitTotal);
      const flexibleSpent = Math.max(0, totalSpent - lockedSpentTotal);
      const flexibleRemaining = flexibleLimit - flexibleSpent;

      let barColor = 'linear-gradient(90deg, #10b981, #06b6d4)';
      let statusBadge = `<span class="budget-status-pill safe"><i data-lucide="check-circle-2" style="width: 12px; height: 12px;"></i> Tiến độ an toàn (${percent}%)</span>`;
      if (totalSpent > overallLimit) {
        barColor = 'linear-gradient(90deg, #f43f5e, #e11d48)';
        statusBadge = `<span class="budget-status-pill danger"><i data-lucide="alert-triangle" style="width: 12px; height: 12px;"></i> Đã vượt trần! (${percent}%)</span>`;
      } else if (percent >= 80) {
        barColor = 'linear-gradient(90deg, #f59e0b, #d97706)';
        statusBadge = `<span class="budget-status-pill warning"><i data-lucide="alert-circle" style="width: 12px; height: 12px;"></i> Sắp chạm trần (${percent}%)</span>`;
      }

      const avgSpentPerDay = daysElapsed > 0 ? Math.round(totalSpent / daysElapsed) : 0;
      const safeRemainingPerDay = daysRemaining > 0 ? Math.round(Math.max(0, remaining) / daysRemaining) : 0;

      heroHtml = `
        <div class="budget-hero-card">
          <div class="budget-hero-header">
            <div class="budget-hero-title-wrap">
              <span class="budget-hero-badge">Ngân Sách Tổng</span>
              <span class="budget-hero-month">${this.formatMonthDisplay(this.currentMonth)}</span>
              ${statusBadge}
            </div>
            <button type="button" class="btn-secondary budget-hero-edit-btn" onclick="UIBudgets.openOverallBudgetModal()">
              <i data-lucide="edit-2" style="width: 13px; height: 13px;"></i> <span>Sửa hạn mức</span>
            </button>
          </div>

          <div class="budget-hero-main-stat">
            <div class="budget-hero-rem-label">${remaining >= 0 ? 'Còn lại cho tháng này' : 'Đã chi vượt ngân sách'}</div>
            <div class="budget-hero-rem-val" style="color: ${remaining >= 0 ? 'var(--income)' : 'var(--expense)'};">
              ${remaining >= 0 ? `+${this.formatMoney(remaining)}` : `-${this.formatMoney(Math.abs(remaining))}`}
            </div>
          </div>

          <div class="budget-progress-wrap">
            <div class="budget-progress-track">
              <div class="budget-progress-fill" style="width: ${Math.min(100, percent)}%; background: ${barColor};"></div>
            </div>
            <div class="budget-progress-header">
              <span>Đã chi: <b>${this.formatMoney(totalSpent)}</b> (${percent}%)</span>
              <span>Hạn mức: <b>${this.formatMoney(overallLimit)}</b></span>
            </div>
          </div>

          <div class="budget-hero-kpi-grid">
            <div class="budget-hero-kpi-item">
              <div class="budget-hero-kpi-label">Hạn Mức Tháng</div>
              <div class="budget-hero-kpi-val" style="color: var(--primary);">${this.formatMoney(overallLimit)}</div>
            </div>
            <div class="budget-hero-kpi-item">
              <div class="budget-hero-kpi-label">Thực Tế Đã Chi</div>
              <div class="budget-hero-kpi-val" style="color: ${totalSpent > overallLimit ? 'var(--expense)' : 'var(--text-primary)'};">${this.formatMoney(totalSpent)}</div>
            </div>
            <div class="budget-hero-kpi-item">
              <div class="budget-hero-kpi-label">Mức Tiêu An Toàn</div>
              <div class="budget-hero-kpi-val" style="color: ${safeRemainingPerDay > 0 ? 'var(--income)' : 'var(--text-muted)'};">
                ${daysRemaining > 0 ? `${this.formatMoney(safeRemainingPerDay)}/ngày` : 'Hết tháng'}
              </div>
              <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">Còn ${daysRemaining} ngày</div>
            </div>
          </div>
        </div>
      `;
    } else {
      heroHtml = `
        <div class="budget-hero-card">
          <div class="budget-hero-empty">
            <div class="budget-hero-empty-icon">
              <i data-lucide="target" style="width: 28px; height: 28px;"></i>
            </div>
            <h3>Chưa Thiết Lập Ngân Sách Tổng</h3>
            <p>Đặt hạn mức chi tiêu chung cho cả tháng để nhận cảnh báo thông minh và kiểm soát dòng tiền an toàn mỗi ngày.</p>
            <button type="button" class="btn-primary" onclick="UIBudgets.openOverallBudgetModal()">
              <i data-lucide="plus" style="width: 15px; height: 15px;"></i> Thiết Lập Ngân Sách Tổng
            </button>
          </div>
        </div>
      `;
    }

    // Locked categories section
    let lockedHtml = '';
    if (lockedBudgets.length === 0) {
      lockedHtml = `
        <div class="budget-locked-empty">
          <i data-lucide="lock" style="width: 24px; height: 24px; opacity: 0.5;"></i>
          <div>Chưa có danh mục nào được khóa trần riêng.</div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
            Khóa riêng các khoản thiết yếu (Ăn uống, Tiền nhà...) để kiểm soát trần con dưới ngân sách tổng.
          </div>
          <button type="button" class="btn-secondary" style="margin-top: 10px; font-size: 0.8rem;" onclick="UIBudgets.openLockCategoryModal()">
            <i data-lucide="plus" style="width: 13px; height: 13px;"></i> Khóa Mục Đầu Tiên
          </button>
        </div>
      `;
    } else {
      let rows = '';
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
        if (spent > limit) {
          barColor = 'linear-gradient(90deg, #f43f5e, #e11d48)';
        } else if (percent >= 80) {
          barColor = 'linear-gradient(90deg, #f59e0b, #d97706)';
        }

        rows += `
          <div class="budget-locked-item">
            <div class="budget-locked-item-header">
              <div class="budget-locked-item-cat">
                <div class="category-icon-bubble" style="background: ${catColor}22; color: ${catColor}; width: 28px; height: 28px; font-size: 0.8rem;">
                  <i data-lucide="${catIcon}"></i>
                </div>
                <span class="budget-locked-item-name">${escapeHTML(catName)}</span>
              </div>
              <div class="budget-locked-item-actions">
                <button type="button" class="btn-icon" onclick="UIBudgets.openLockCategoryModal(${b.categoryId})" title="Sửa hạn mức">
                  <i data-lucide="edit-2" style="width: 13px; height: 13px;"></i>
                </button>
                <button type="button" class="btn-icon" onclick="UIBudgets.unlockCategory(${b.categoryId})" title="Bỏ khóa mục">
                  <i data-lucide="unlock" style="width: 13px; height: 13px;"></i>
                </button>
              </div>
            </div>

            <div class="budget-locked-item-body">
              <div class="budget-locked-metric">
                <span class="budget-locked-metric-label">Hạn mức:</span>
                <span class="budget-locked-metric-val" style="color: var(--primary);">${this.formatMoney(limit)}</span>
              </div>
              <div class="budget-locked-metric">
                <span class="budget-locked-metric-label">Đã chi:</span>
                <span class="budget-locked-metric-val">${this.formatMoney(spent)} (${percent}%)</span>
              </div>
              <div class="budget-locked-metric">
                <span class="budget-locked-metric-label">Còn lại:</span>
                <span class="budget-locked-metric-val" style="color: ${remaining >= 0 ? 'var(--income)' : 'var(--expense)'}; font-weight: 700;">
                  ${remaining >= 0 ? `+${this.formatMoney(remaining)}` : `-${this.formatMoney(Math.abs(remaining))}`}
                </span>
              </div>
            </div>

            <div class="budget-progress-track" style="height: 5px; margin-top: 6px;">
              <div class="budget-progress-fill" style="width: ${Math.min(100, percent)}%; background: ${barColor};"></div>
            </div>
          </div>
        `;
      }

      lockedHtml = `<div class="budget-locked-list">${rows}</div>`;
    }

    container.innerHTML = `
      ${heroHtml}
      <div class="budget-section-header">
        <div class="budget-section-title">
          <i data-lucide="lock" style="width: 16px; height: 16px; color: #f59e0b;"></i>
          <span>Danh Mục Khóa Trần</span>
          <span class="budget-count-pill">${lockedBudgets.length}</span>
        </div>
        <button type="button" class="btn-secondary" style="font-size: 0.8rem; padding: 5px 12px;" onclick="UIBudgets.openLockCategoryModal()">
          <i data-lucide="plus" style="width: 13px; height: 13px;"></i> Khóa thêm mục
        </button>
      </div>
      ${lockedHtml}
    `;
  },

  /* ==================== MODE 2: ACTUAL BUDGET SPREADSHEET TABLE ==================== */
  renderDetailedMode({ categoryBudgets, expenseCategories, catMap, totalIncome, totalSpent, spentByCat }) {
    const container = document.getElementById('budget-detailed-container');
    if (!container) return;

    const budgetMap = new Map(categoryBudgets.map(b => [Number(b.categoryId), b]));
    const totalBudgeted = categoryBudgets.reduce((sum, b) => sum + (b.limitAmount || 0), 0);
    const toBudget = totalIncome - totalBudgeted;

    let iconClass = 'positive';
    let iconName = 'wallet';
    let captionText = 'Sẵn sàng phân bổ vào các danh mục';

    if (toBudget === 0) {
      iconClass = 'zero';
      iconName = 'check-circle-2';
      captionText = '🎯 Zero-based: Đã phân bổ toàn bộ thu nhập';
    } else if (toBudget < 0) {
      iconClass = 'negative';
      iconName = 'alert-triangle';
      captionText = '⚠️ Đã phân bổ vượt quá thu nhập tháng!';
    }

    const topBannerHtml = `
      <div class="actual-budget-top-card">
        <div class="actual-to-budget-left">
          <div class="actual-to-budget-icon ${iconClass}">
            <i data-lucide="${iconName}" style="width: 22px; height: 22px;"></i>
          </div>
          <div>
            <div class="actual-to-budget-amount" style="color: ${toBudget < 0 ? 'var(--expense)' : (toBudget === 0 ? 'var(--primary)' : 'var(--income)')};">
              ${this.formatMoney(toBudget)}
            </div>
            <div class="actual-to-budget-caption">${captionText}</div>
          </div>
        </div>

        <div class="actual-to-budget-meta">
          <div class="actual-to-budget-meta-item">
            <span class="actual-to-budget-meta-label">Thu Nhập Tháng</span>
            <span class="actual-to-budget-meta-val" style="color: var(--income);">+${this.formatMoney(totalIncome)}</span>
          </div>
          <div class="actual-to-budget-meta-item">
            <span class="actual-to-budget-meta-label">Đã Phân Bổ</span>
            <span class="actual-to-budget-meta-val" style="color: var(--primary);">-${this.formatMoney(totalBudgeted)}</span>
          </div>
          <div class="actual-to-budget-meta-item">
            <span class="actual-to-budget-meta-label">Đã Chi Tiêu</span>
            <span class="actual-to-budget-meta-val" style="color: var(--expense);">${totalSpent > 0 ? `-${this.formatMoney(totalSpent)}` : '0đ'}</span>
          </div>
        </div>
      </div>
    `;

    // Table rows
    let tableRows = '';
    let totalAvailable = 0;

    for (const cat of expenseCategories) {
      const b = budgetMap.get(cat.id);
      const budgeted = b ? (b.limitAmount || 0) : 0;
      const spent = spentByCat[cat.id] || 0;
      const available = budgeted - spent;
      totalAvailable += available;

      let badgeClass = 'zero';
      let availText = '0đ';
      if (available > 0) {
        badgeClass = 'positive';
        availText = `+${this.formatMoney(available)}`;
      } else if (available < 0) {
        badgeClass = 'negative';
        availText = `-${this.formatMoney(Math.abs(available))}`;
      }

      tableRows += `
        <tr class="actual-budget-row" data-cat-name="${escapeHTML(cat.name)}">
          <td>
            <div class="actual-cat-cell">
              <div class="actual-cat-icon" style="background: ${cat.color || '#0d9488'}22; color: ${cat.color || '#0d9488'};">
                <i data-lucide="${cat.icon || 'tag'}"></i>
              </div>
              <span class="actual-cat-name">${escapeHTML(cat.name)}</span>
            </div>
          </td>

          <td style="text-align: right;">
            <div class="actual-budget-cell" onclick="UIBudgets.openQuickEditModal(${cat.id})" title="Nhấp để sửa phân bổ">
              <span>${budgeted > 0 ? this.formatMoney(budgeted) : '<span style="opacity: 0.4;">0đ</span>'}</span>
              <i data-lucide="edit-2" class="actual-edit-pen"></i>
            </div>
          </td>

          <td style="text-align: right;">
            <span class="actual-spent-cell">${spent > 0 ? `-${this.formatMoney(spent)}` : '0đ'}</span>
          </td>

          <td style="text-align: right;">
            <span class="actual-avail-badge ${badgeClass}">${availText}</span>
          </td>
        </tr>
      `;
    }

    let totalAvailClass = 'zero';
    let totalAvailText = '0đ';
    if (totalAvailable > 0) {
      totalAvailClass = 'positive';
      totalAvailText = `+${this.formatMoney(totalAvailable)}`;
    } else if (totalAvailable < 0) {
      totalAvailClass = 'negative';
      totalAvailText = `-${this.formatMoney(Math.abs(totalAvailable))}`;
    }

    const tableHtml = `
      <div class="actual-table-container">
        <table class="actual-budget-table">
          <thead>
            <tr>
              <th style="width: 38%;">HẠNG MỤC CHI</th>
              <th style="width: 24%; text-align: right;">PHÂN BỔ (BUDGETED)</th>
              <th style="width: 18%; text-align: right;">ĐÃ CHI (SPENT)</th>
              <th style="width: 20%; text-align: right;">CÒN LẠI (AVAILABLE)</th>
            </tr>
          </thead>
          <tbody id="actual-table-body">
            ${tableRows}
          </tbody>
          <tfoot>
            <tr>
              <td>Tổng cộng (${expenseCategories.length} mục)</td>
              <td style="text-align: right; color: var(--primary); font-weight: 700;">${this.formatMoney(totalBudgeted)}</td>
              <td style="text-align: right; color: var(--text-secondary); font-weight: 700;">${totalSpent > 0 ? `-${this.formatMoney(totalSpent)}` : '0đ'}</td>
              <td style="text-align: right;">
                <span class="actual-avail-badge ${totalAvailClass}">${totalAvailText}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    container.innerHTML = `
      ${topBannerHtml}
      <div class="actual-table-toolbar">
        <div class="actual-table-search-box">
          <i data-lucide="search" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
          <input type="text" id="actual-cat-search" placeholder="Tìm danh mục chi tiêu..." oninput="UIBudgets.filterDetailedTable(this.value)">
        </div>
        <div class="actual-table-meta-hint">
          <span>Hiển thị <b id="actual-visible-count">${expenseCategories.length}</b> danh mục</span>
          <span style="opacity: 0.4;">•</span>
          <span>💡 Nhấp vào ô "Phân bổ" để sửa nhanh</span>
        </div>
      </div>
      ${tableHtml}
    `;
  },

  /* Real-time category table filter */
  filterDetailedTable(keyword) {
    const term = (keyword || '').toLowerCase().trim();
    const rows = document.querySelectorAll('.actual-budget-row');
    let visibleCount = 0;
    rows.forEach(r => {
      const name = r.getAttribute('data-cat-name') || '';
      if (!term || name.toLowerCase().includes(term)) {
        r.style.display = '';
        visibleCount++;
      } else {
        r.style.display = 'none';
      }
    });
    const counter = document.getElementById('actual-visible-count');
    if (counter) counter.textContent = visibleCount;
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

    if (overallBudget && overallBudget.limitAmount > 0) {
      const limit = overallBudget.limitAmount;
      if (totalSpent > limit) {
        hasAlert = true;
        const overAmount = totalSpent - limit;
        title = 'Cảnh Báo Vượt Ngân Sách Tổng';
        message = `Bạn đã chi ${this.formatMoney(totalSpent)}, vượt hạn mức tháng ${this.formatMoney(overAmount)}.`;
        alertSignature = `OVERALL_OVER_${this.currentMonth}_${limit}_${Math.floor(totalSpent / 500000)}`;
      } else if (totalSpent >= limit * 0.9) {
        hasAlert = true;
        title = 'Ngân Sách Tổng Sắp Chạm Trần';
        message = `Đã chi ${Math.round((totalSpent / limit) * 100)}% hạn mức (${this.formatMoney(totalSpent)} / ${this.formatMoney(limit)}).`;
        alertSignature = `OVERALL_WARN_${this.currentMonth}_${limit}`;
      }
    }

    if (!hasAlert) {
      for (const b of categoryBudgets) {
        const spent = spentByCat[b.categoryId] || 0;
        const limit = b.limitAmount || 0;
        if (limit > 0 && spent > limit) {
          const cat = catMap.get(Number(b.categoryId));
          const catName = cat ? cat.name : 'Danh mục';
          hasAlert = true;
          title = `Vượt Ngân Sách [${catName}]`;
          message = `Đã chi ${this.formatMoney(spent)} / Hạn mức ${this.formatMoney(limit)}.`;
          alertSignature = `CAT_OVER_${b.categoryId}_${this.currentMonth}`;
          break;
        }
      }
    }

    if (hasAlert && !this.dismissedAlertSignatures.has(alertSignature)) {
      this.currentAlertSignature = alertSignature;
      banners.forEach(b => {
        const titleEl = b.querySelector('.budget-alert-title');
        const descEl = b.querySelector('.budget-alert-desc');
        if (titleEl) titleEl.textContent = title;
        if (descEl) descEl.textContent = message;
        b.style.display = 'flex';
        b.style.opacity = '1';
        b.style.maxHeight = '80px';
      });
    } else {
      banners.forEach(b => {
        b.style.display = 'none';
      });
    }
  },

  dismissAlert() {
    if (this.currentAlertSignature) {
      this.dismissedAlertSignatures.add(this.currentAlertSignature);
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
      showToast(`Đã lưu [${this.quickEditTarget.name}]: ${this.formatMoney(limitAmount)}`, 'success');
    }

    this.closeQuickEditModal();
    window.app.refreshAll();
  },

  /* ==================== MODAL 4: COPY BUDGET ==================== */
  openCopyModal() {
    const modal = document.getElementById('modal-budget-copy');
    if (!modal) return;

    const targetDisplay = document.getElementById('budget-copy-target-display');
    if (targetDisplay) {
      targetDisplay.value = this.formatMonthDisplay(this.currentMonth);
    }

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

    const sourceBudgets = await db.budgets.where('month').equals(sourceMonth).toArray();
    const targetBudgets = await db.budgets.where('month').equals(targetMonth).toArray();
    const targetMap = new Map(targetBudgets.map(b => [String(b.categoryId), b]));

    let copiedCount = 0;
    const now = Date.now();

    if (copyMode === 'actual_spent') {
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
      if (sourceBudgets.length === 0) {
        showToast(`Tháng ${this.formatMonthDisplay(sourceMonth)} chưa có thiết lập ngân sách nào`, 'warning');
        return;
      }

      for (const b of sourceBudgets) {
        const existing = targetMap.get(String(b.categoryId));
        if (copyMode === 'fill_empty' && existing && existing.limitAmount > 0) {
          continue;
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
    return new Intl.NumberFormat('vi-VN').format(Math.round(num || 0)) + '₫';
  }
};

window.UIBudgets = UIBudgets;
