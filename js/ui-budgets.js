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

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#budget-cat-page-dropdown') && !e.target.closest('#budget-cat-page-menu')) {
        const m = document.getElementById('budget-cat-page-menu');
        const b = document.getElementById('budget-cat-page-backdrop');
        if (m) m.style.display = 'none';
        if (b) b.style.display = 'none';
      }
      if (!e.target.closest('#budget-lock-cat-dropdown')) {
        const m = document.getElementById('budget-lock-cat-menu');
        if (m) m.style.display = 'none';
      }
      if (!e.target.closest('#budget-cat-dropdown')) {
        const m = document.getElementById('budget-cat-menu');
        if (m) m.style.display = 'none';
      }
    });

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
    const subtitle = document.getElementById('budget-header-subtitle');
    if (subtitle) {
      subtitle.textContent = this.currentMode === 'simple' ? 'Ngân sách tổng' : 'Ngân sách chi tiết';
    }
  },

  updateMonthDisplay() {
    this.updateMonthLabels();
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

    this.selectSettingMode(this.currentMode);

    const toggle = document.getElementById('budget-setting-rollover-toggle');
    if (toggle) {
      try {
        const saved = await db.settings.get('budget_rollover_enabled');
        toggle.checked = saved ? (saved.value === true || saved.value === 'true' || saved.value === 1) : true;
      } catch (e) {
        toggle.checked = true;
      }
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

  async handleSettingsSubmit() {
    const selectedMode = document.querySelector('input[name="budget-setting-mode"]:checked')?.value || 'simple';
    this.currentMode = selectedMode;

    const toggle = document.getElementById('budget-setting-rollover-toggle');
    const rolloverVal = toggle ? toggle.checked : true;

    try {
      await db.settings.put({ key: 'budget_mode', value: selectedMode });
      await db.settings.put({ key: 'budget_rollover_enabled', value: rolloverVal });
      showToast('Đã lưu cài đặt ngân sách', 'success');
    } catch (e) {
      console.warn('Error saving budget settings:', e);
    }

    this.closeSettingsModal();
    await this.render();
  },

    handlePrimaryAddAction() {
    if (this.currentMode === 'simple') {
      this.openBudgetForm();
    } else {
      this.openLockCategoryForm();
    }
  },

  /* ==================== AUTO ROLLOVER FOR NEW MONTH ==================== */
  async checkAndAutoRollover(targetMonth) {
    if (!targetMonth) return;
    try {
      const skipKey = 'skip_auto_rollover_' + targetMonth;
      if (sessionStorage.getItem(skipKey)) return;

      // 1. Chỉ hoạt động khi thời gian hiện tại trong thế giới thực ĐÃ BƯỚC SANG tháng đó
      // Tuyệt đối không kích hoạt khi người dùng xem trước tháng sau (targetMonth > actualMonth)
      const nowD = new Date();
      const actualCurrentMonth = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}`;
      if (targetMonth > actualCurrentMonth) {
        return; // Đang xem trước tháng tương lai -> không tự động sao chép
      }

      // 2. Không tự kích hoạt nếu tháng này đã được người dùng thiết lập bằng tay (hoặc chủ động xóa)
      if (localStorage.getItem('budget_manual_set_' + targetMonth)) {
        return;
      }

      // 3. Kiểm tra cài đặt bật/tắt tự động sao chép
      const autoSetting = await db.settings.get('budget_auto_rollover');
      const isAuto = autoSetting ? (autoSetting.value !== false && autoSetting.value !== 0) : true;
      if (!isAuto) return;

      // 4. Nếu tháng này đã có bất kỳ bản ghi ngân sách nào -> không làm gì cả
      const currentMonthBudgets = await db.budgets.where('month').equals(targetMonth).toArray();
      if (currentMonthBudgets.length > 0) return;

      const [yStr, mStr] = targetMonth.split('-');
      let y = parseInt(yStr, 10);
      let m = parseInt(mStr, 10);
      m -= 1;
      if (m < 1) {
        m = 12;
        y -= 1;
      }
      const prevMonth = `${y}-${String(m).padStart(2, '0')}`;

      const prevBudgets = await db.budgets.where('month').equals(prevMonth).toArray();
      if (prevBudgets.length === 0) return;

      const now = Date.now();
      const newItems = prevBudgets.map(b => ({
        categoryId: b.categoryId,
        month: targetMonth,
        limitAmount: b.limitAmount,
        isLocked: b.isLocked || 0,
        isOverall: b.isOverall || false,
        createdAt: now,
        updatedAt: now
      }));

      await db.budgets.bulkAdd(newItems);
      sessionStorage.setItem(skipKey, '1');
      showToast(`Đã tự động sao chép ngân sách từ ${this.formatMonthDisplay(prevMonth)} sang ${this.formatMonthDisplay(targetMonth)}`, 'info');
    } catch (e) {
      console.warn('Auto rollover check failed:', e);
    }
  },

  /* ==================== DETAILED MODE ROLLOVER CALCULATION ==================== */
  async calculateDetailedRollover(currentMonth, allowedAccountIds) {
    let rolloverEnabled = true;
    try {
      const saved = await db.settings.get('budget_rollover_enabled');
      if (saved && saved.value !== undefined) {
        rolloverEnabled = saved.value === true || saved.value === 'true' || saved.value === 1;
      }
    } catch (e) {}

    if (!rolloverEnabled) {
      return {
        prevToBudget: 0,
        categoryCarryover: {},
        rolloverEnabled: false
      };
    }

    try {
      const allPastBudgets = await db.budgets
        .filter(b => b.month < currentMonth && b.categoryId !== 'TOTAL' && b.categoryId !== 0 && !b.isOverall)
        .toArray();

      if (allPastBudgets.length === 0) {
        return {
          prevToBudget: 0,
          categoryCarryover: {},
          rolloverEnabled: true
        };
      }

      const pastMonths = Array.from(new Set(allPastBudgets.map(b => b.month))).sort();
      const earliestMonth = pastMonths[0];

      const [curY, curM] = currentMonth.split('-').map(Number);
      const prevEndDateObj = new Date(curY, curM - 1, 0);
      const prevEndYear = prevEndDateObj.getFullYear();
      const prevEndMonth = String(prevEndDateObj.getMonth() + 1).padStart(2, '0');
      const prevEndDay = String(prevEndDateObj.getDate()).padStart(2, '0');
      const endDate = `${prevEndYear}-${prevEndMonth}-${prevEndDay}`;

      const pastTxs = await db.transactions
        .where('date')
        .between(`${earliestMonth}-01`, endDate, true, true)
        .and(t => (!t.isDeleted || t.isDeleted === 0))
        .toArray();

      const allowedTxs = pastTxs.filter(t => allowedAccountIds.has(t.accountId));

      const txByMonth = {};
      for (const t of allowedTxs) {
        const m = (t.date || '').slice(0, 7);
        if (!m) continue;
        if (!txByMonth[m]) {
          txByMonth[m] = { income: 0, expenseByCat: {} };
        }
        if (t.type === 'income') {
          txByMonth[m].income += (t.amount || 0);
        } else if (t.type === 'expense' && t.categoryId) {
          const catKey = String(t.categoryId);
          txByMonth[m].expenseByCat[catKey] = (txByMonth[m].expenseByCat[catKey] || 0) + (t.amount || 0);
        }
      }

      const budgetsByMonth = {};
      for (const b of allPastBudgets) {
        if (!budgetsByMonth[b.month]) budgetsByMonth[b.month] = {};
        budgetsByMonth[b.month][String(b.categoryId)] = {
          limitAmount: b.limitAmount || 0,
          shiftToNextMonth: b.shiftToNextMonth === true
        };
      }

      let runningToBudget = 0;
      const categoryBalances = {};

      const allMonthsRange = [];
      let iterDate = new Date(Number(earliestMonth.split('-')[0]), Number(earliestMonth.split('-')[1]) - 1, 1);
      const stopDate = new Date(curY, curM - 1, 1);

      while (iterDate < stopDate) {
        const ym = `${iterDate.getFullYear()}-${String(iterDate.getMonth() + 1).padStart(2, '0')}`;
        allMonthsRange.push(ym);
        iterDate.setMonth(iterDate.getMonth() + 1);
      }

      for (const m of allMonthsRange) {
        const mTx = txByMonth[m] || { income: 0, expenseByCat: {} };
        const mBudgets = budgetsByMonth[m] || {};

        let mTotalBudgeted = 0;
        let mUnshiftedOverspent = 0;

        const allCatKeys = new Set([
          ...Object.keys(mBudgets),
          ...Object.keys(mTx.expenseByCat),
          ...Object.keys(categoryBalances)
        ]);

        for (const catIdStr of allCatKeys) {
          const bInfo = mBudgets[catIdStr];
          const budgeted = bInfo ? (bInfo.limitAmount || 0) : 0;
          if (bInfo) mTotalBudgeted += budgeted;

          const spent = mTx.expenseByCat[catIdStr] || 0;
          const prevBal = categoryBalances[catIdStr] || 0;
          const avail = prevBal + budgeted - spent;

          if (avail < 0) {
            const isShifted = bInfo && bInfo.shiftToNextMonth === true;
            if (isShifted) {
              // Chuyển sang tháng sau: giữ số âm ở danh mục
              categoryBalances[catIdStr] = avail;
            } else {
              // Mặc định: không tự động chuyển sang cho tháng sau, mà tính vào ngân sách tháng
              categoryBalances[catIdStr] = 0;
              mUnshiftedOverspent += Math.abs(avail);
            }
          } else {
            categoryBalances[catIdStr] = avail;
          }
        }

        // Ngân sách tháng cộng thu nhập, trừ hạn mức đã phân bổ, trừ các khoản chi vượt không chuyển tháng sau (có thể âm)
        runningToBudget = runningToBudget + mTx.income - mTotalBudgeted - mUnshiftedOverspent;
      }

      return {
        prevToBudget: runningToBudget,
        categoryCarryover: categoryBalances,
        rolloverEnabled: true
      };
    } catch (err) {
      console.warn('calculateDetailedRollover error:', err);
      return {
        prevToBudget: 0,
        categoryCarryover: {},
        rolloverEnabled: true
      };
    }
  },

  /* ==================== DATA QUERIES & RENDER ==================== */
  async render() {
    await this.checkAndAutoRollover(this.currentMonth);
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

    // 2. Fetch all accounts & resolve wallet scope
    const allAccounts = await db.accounts.where('isDeleted').equals(0).toArray();
    const accountMap = new Map(allAccounts.map(a => [a.id, a]));

    let allowedAccountIds = new Set();
    allAccounts.forEach(a => {
      const isBudgetEnabled = a.includeInBudget !== undefined
        ? (a.includeInBudget === 1 || a.includeInBudget === true)
        : !a.excludeFromReport;
      if (isBudgetEnabled && !a.isArchived) {
        allowedAccountIds.add(a.id);
      }
    });

    const scopeBar = document.getElementById('budget-scope-bar');
    if (scopeBar) {
      if (allowedAccountIds.size < allAccounts.length) {
        const enabledAccs = allAccounts.filter(a => allowedAccountIds.has(a.id));
        const names = enabledAccs.map(a => a.name).slice(0, 2).join(', ');
        const extra = enabledAccs.length > 2 ? ' (+' + (enabledAccs.length - 2) + ')' : '';
        scopeBar.innerHTML = '<i data-lucide="wallet" style="width: 12px; height: 12px;"></i> <span>Ví: <b>' + escapeHTML(names + extra) + '</b></span> <i data-lucide="chevron-down" style="width: 11px; height: 11px; opacity: 0.7;"></i>';
        scopeBar.style.display = 'inline-flex';
      } else {
        scopeBar.innerHTML = '<i data-lucide="wallet" style="width: 12px; height: 12px;"></i> <span>Tất cả ví</span> <i data-lucide="chevron-down" style="width: 11px; height: 11px; opacity: 0.7;"></i>';
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

      const rolloverData = await this.calculateDetailedRollover(this.currentMonth, allowedAccountIds);

      this.renderDetailedMode({
        categoryBudgets,
        expenseCategories,
        catMap,
        totalIncome,
        totalSpent,
        spentByCat,
        rolloverData
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

    let heroHtml = '';
    if (overallBudget) {
      const overallLimit = overallBudget.limitAmount || 0;
      const remaining = overallLimit - totalSpent;
      const percent = overallLimit > 0 ? Math.round((totalSpent / overallLimit) * 100) : 0;

      let barColor = 'linear-gradient(90deg, #10b981, #06b6d4)';
      let statusColor = 'var(--income)';
      if (totalSpent > overallLimit) {
        barColor = 'linear-gradient(90deg, #f43f5e, #e11d48)';
        statusColor = 'var(--expense)';
      } else if (percent >= 80) {
        barColor = 'linear-gradient(90deg, #f59e0b, #d97706)';
        statusColor = '#f59e0b';
      }

      heroHtml = `
        <div class="budget-hero-card budget-hero-clickable" onclick="UIBudgets.openBudgetForm()" title="Nhấp vào để sửa hạn mức ngân sách">
          <div class="budget-hero-center-box">
            <div class="budget-hero-rem-label">${remaining >= 0 ? 'CÒN LẠI CHO THÁNG NÀY' : 'ĐÃ CHI VƯỢT HẠN MỨC'}</div>
            <div class="budget-hero-rem-val" style="color: ${statusColor};">
              ${remaining >= 0 ? `+${this.formatMoney(remaining)}` : `-${this.formatMoney(Math.abs(remaining))}`}
            </div>

            <div class="budget-hero-bar-meta">
              <span class="budget-bar-spent">${this.formatMoney(totalSpent)} (${percent}%)</span>
              <span class="budget-bar-limit">${this.formatMoney(overallLimit)}</span>
            </div>

            <div class="budget-progress-track budget-hero-progress">
              <div class="budget-progress-fill" style="width: ${Math.min(100, percent)}%; background: ${barColor};"></div>
            </div>

          </div>
        </div>
      `;
    } else {
      heroHtml = `
        <div class="budget-hero-card budget-hero-clickable" onclick="UIBudgets.openBudgetForm()" title="Nhấp vào để thiết lập hạn mức ngân sách">
          <div class="budget-hero-center-box">
            <div class="budget-hero-empty-icon">
              <i data-lucide="target" style="width: 24px; height: 24px;"></i>
            </div>
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">Chưa Thiết Lập Ngân Sách Tháng</div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px;">Nhấp vào đây để đặt hạn mức chi tiêu cho ${this.formatMonthDisplay(this.currentMonth)}</div>
          </div>
        </div>
      `;
    }

        // Locked categories section
    let lockedHtml = '';
    if (lockedBudgets.length === 0) {
      lockedHtml = `
        <div class="budget-locked-empty">
          <i data-lucide="layers" style="width: 24px; height: 24px; opacity: 0.5;"></i>
          <div>Chưa có danh mục nào được đặt hạn mức riêng.</div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
            Đặt hạn mức riêng các khoản thiết yếu (Ăn uống, Tiền nhà...) để theo dõi chi tiêu chi tiết.
          </div>
          <button type="button" class="btn-secondary" style="margin-top: 10px; font-size: 0.8rem;" onclick="UIBudgets.openLockCategoryForm()">
            <i data-lucide="plus" style="width: 13px; height: 13px;"></i> Thêm Hạn Mức Đầu Tiên
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
          <div class="budget-locked-item" onclick="UIBudgets.openLockCategoryForm(${b.categoryId})" title="Nhấp vào để chỉnh sửa hoặc xóa hạn mức">
            <div class="budget-locked-item-header">
              <div class="budget-locked-item-cat">
                <div class="category-icon-bubble" style="background: ${catColor}22; color: ${catColor}; width: 28px; height: 28px; font-size: 0.8rem;">
                  <i data-lucide="${catIcon}"></i>
                </div>
                <span class="budget-locked-item-name">${escapeHTML(catName)}</span>
              </div>
              <div class="budget-locked-item-remaining" style="color: ${remaining >= 0 ? 'var(--income)' : 'var(--expense)'};">
                ${remaining >= 0 ? `+${this.formatMoney(remaining)}` : `-${this.formatMoney(Math.abs(remaining))}`}
              </div>
            </div>

            <div class="budget-hero-bar-meta" style="margin-top: 6px;">
              <span class="budget-bar-spent">${this.formatMoney(spent)} (${percent}%)</span>
              <span class="budget-bar-limit">${this.formatMoney(limit)}</span>
            </div>

            <div class="budget-progress-track budget-hero-progress" style="height: 6px; margin: 4px 0 0 0; width: 100%; max-width: 100%;">
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
          <i data-lucide="layers" style="width: 16px; height: 16px; color: var(--primary);"></i>
          <span>Hạn Mức Theo Danh Mục</span>
          <span class="budget-count-pill">${lockedBudgets.length}</span>
        </div>
        <button type="button" class="btn-icon" style="width: 32px; height: 32px; border-radius: var(--radius-full); background: var(--bg-card); border: 1px solid var(--border-color); color: var(--primary); display: inline-flex; align-items: center; justify-content: center; box-shadow: var(--shadow-sm); cursor: pointer;" onclick="UIBudgets.openLockCategoryForm()" title="Thêm hạn mức danh mục">
          <i data-lucide="plus" style="width: 17px; height: 17px;"></i>
        </button>
      </div>
      ${lockedHtml}
    `;
  },

    /* ==================== MODE 2: ACTUAL BUDGET SPREADSHEET TABLE ==================== */
  renderDetailedMode({ categoryBudgets, expenseCategories, catMap, totalIncome, totalSpent, spentByCat, rolloverData }) {
    const container = document.getElementById('budget-detailed-container');
    if (!container) return;

    const budgetMap = new Map(categoryBudgets.map(b => [Number(b.categoryId), b]));
    const totalBudgeted = categoryBudgets.reduce((sum, b) => sum + (b.limitAmount || 0), 0);

    const prevToBudget = (rolloverData && rolloverData.prevToBudget) || 0;
    const categoryCarryover = (rolloverData && rolloverData.categoryCarryover) || {};

    const toBudget = prevToBudget + totalIncome - totalBudgeted;

    let iconClass = 'positive';
    let iconName = 'wallet';
    let captionText = 'Sẵn sàng phân bổ vào các danh mục';

    if (toBudget === 0) {
      iconClass = 'zero';
      iconName = 'check-circle-2';
      captionText = '🎯 Đã phân bổ toàn bộ thu nhập';
    } else if (toBudget < 0) {
      iconClass = 'negative';
      iconName = 'alert-triangle';
      captionText = '⚠️ Đã phân bổ vượt quá thu nhập tháng!';
    }

    const topBannerHtml = `
      <div class="actual-budget-top-card">
        <div class="actual-budget-actions-corner">
          <button type="button" class="actual-budget-corner-btn copy-btn" onclick="UIBudgets.openCopyModal()" title="Sao chép / Thiết lập ngân sách" aria-label="Sao chép ngân sách">
            <i data-lucide="copy"></i>
          </button>
        </div>

        <div class="actual-to-budget-center">
          <div class="actual-to-budget-amount-wrapper">
            <div class="actual-to-budget-amount" style="color: ${toBudget < 0 ? 'var(--expense)' : (toBudget === 0 ? 'var(--primary)' : 'var(--income)')};">
              ${this.formatMoney(toBudget)}
            </div>
          </div>
          ${prevToBudget !== 0 ? `
            <div class="actual-to-budget-rollover-sub">
              <span>Từ tháng trước:</span>
              <span style="font-weight: 600; color: ${prevToBudget > 0 ? 'var(--income)' : 'var(--expense)'};">
                ${prevToBudget > 0 ? `+${this.formatMoney(prevToBudget)}` : `-${this.formatMoney(Math.abs(prevToBudget))}`}
              </span>
            </div>
          ` : ''}
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
            <span class="actual-to-budget-meta-val" style="color: var(--expense);">${totalSpent > 0 ? `-${this.formatMoney(totalSpent)}` : '0₫'}</span>
          </div>
        </div>
      </div>
    `;

    

    // Banner 1: Ngân sách tháng bị âm (toBudget < 0) - Cân đối độc lập
    let toBudgetNegativeBannerHtml = '';
    if (toBudget < 0) {
      toBudgetNegativeBannerHtml = `
        <div class="budget-overspent-banner to-budget-neg" style="background: rgba(239, 68, 68, 0.12); border-left: 3px solid var(--expense); margin-bottom: 8px;">
          <div class="budget-overspent-left">
            <div class="budget-overspent-info">
              <div class="budget-overspent-title">Ngân sách tháng bị âm</div>
              <div class="budget-overspent-sub">Cần cân đối: ${this.formatMoney(Math.abs(toBudget))}</div>
            </div>
          </div>
          <button type="button" class="budget-rebalance-btn" onclick="UIBudgets.openToBudgetRebalanceModal()" title="Cân đối ngân sách tháng về 0">
            Cân đối
          </button>
        </div>
      `;
    }

    // Calculate overspent categories & alert banner (chỉ các mục chưa chuyển sang tháng sau)
    const overspentCats = [];
    let totalOverspentThisMonth = 0;

    for (const cat of expenseCategories) {
      const b = budgetMap.get(cat.id);
      const budgeted = b ? (b.limitAmount || 0) : 0;
      const spent = spentByCat[cat.id] || 0;
      const prevCarry = categoryCarryover[String(cat.id)] || 0;
      const rawAvailable = prevCarry + budgeted - spent;
      const isShifted = b && b.shiftToNextMonth === true;

      if (rawAvailable < 0 && !isShifted) {
        const overAmount = Math.abs(rawAvailable);
        overspentCats.push({ cat, budgeted, spent, prevCarry, available: rawAvailable, overAmount });
        totalOverspentThisMonth += overAmount;
      }
    }

    let overspentBannerHtml = '';
    if (overspentCats.length > 0) {
      const catCountText = overspentCats.length === 1 ? '1 hạng mục' : `${overspentCats.length} hạng mục`;
      overspentBannerHtml = `
        <div class="budget-overspent-banner">
          <div class="budget-overspent-left">
            <div class="budget-overspent-info">
              <div class="budget-overspent-title">Vượt ngân sách ${catCountText}</div>
              <div class="budget-overspent-sub">Chi vượt: ${this.formatMoney(totalOverspentThisMonth)}</div>
            </div>
          </div>
          <button type="button" class="budget-rebalance-btn" onclick="UIBudgets.openRebalanceModal()" title="Cân đối ngân sách">
            Cân đối
          </button>
        </div>
      `;
    }

    // Save cache for popup options
    this.currentDetailedDataCache = {
      expenseCategories,
      budgetMap,
      categoryCarryover,
      spentByCat,
      toBudget
    };

    // Table rows
    let tableRows = '';
    let totalAvailable = 0;

    for (const cat of expenseCategories) {
      const b = budgetMap.get(cat.id);
      const budgeted = b ? (b.limitAmount || 0) : 0;
      const spent = spentByCat[cat.id] || 0;
      const prevCarry = categoryCarryover[String(cat.id)] || 0;
      const rawAvailable = prevCarry + budgeted - spent;
      const isShifted = b && b.shiftToNextMonth === true;

      totalAvailable += rawAvailable;

      let badgeClass = 'zero';
      let availText = '0đ';
      if (rawAvailable > 0) {
        badgeClass = 'positive';
        availText = `+${this.formatMoney(rawAvailable)}`;
      } else if (rawAvailable < 0) {
        badgeClass = isShifted ? 'negative shifted' : 'negative';
        availText = `-${this.formatMoney(Math.abs(rawAvailable))}`;
      }

      const budgetedText = budgeted > 0 ? this.formatMoney(budgeted) : '0đ';
      const budgetedFontClass = this.getAmountFontClass(budgetedText);

      const spentText = spent > 0 ? `-${this.formatMoney(spent)}` : '0đ';
      const spentFontClass = this.getAmountFontClass(spentText);

      const availFontClass = this.getAmountFontClass(availText);

      tableRows += `
        <tr class="actual-budget-row" data-cat-name="${escapeHTML(cat.name)}">
          <td>
            <div class="actual-cat-cell">
              <div class="actual-cat-icon" style="background: ${cat.color || '#0d9488'}22; color: ${cat.color || '#0d9488'};">
                <i data-lucide="${cat.icon || 'tag'}"></i>
              </div>
              <div style="min-width: 0; overflow: hidden;">
                <span class="actual-cat-name">${escapeHTML(cat.name)}</span>
              </div>
            </div>
          </td>

          <td style="text-align: right; cursor: pointer;" onclick="UIBudgets.openQuickEditModal(${cat.id}, ${prevCarry})" title="Nhấp để sửa phân bổ">
            <div class="actual-budget-cell ${budgeted > 0 ? 'has-budget' : 'is-zero'} ${budgetedFontClass}" role="button" tabindex="0">
              <span>${budgetedText}</span>
            </div>
          </td>

          <td style="text-align: right; cursor: pointer;" onclick="UIBudgets.openCatExpenseHistory(${cat.id})" title="Nhấp để xem lịch sử ghi chép đã chi">
            <span class="actual-spent-cell ${spentFontClass}" style="cursor: pointer;">${spentText}</span>
          </td>

          <td style="text-align: right; cursor: pointer;" onclick="UIBudgets.openAvailOptionsModal(${cat.id})" title="Nhấp để chọn Cân đối hoặc Chuyển sang tháng sau">
            <div class="actual-avail-wrapper">
              <span class="actual-avail-badge ${badgeClass} ${availFontClass}">${availText}</span>
              ${isShifted && rawAvailable < 0 ? `
                <span class="avail-shift-corner-arrow" title="Đã chuyển sang tháng sau">
                  <i data-lucide="arrow-right"></i>
                </span>
              ` : ''}
            </div>
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
              <th style="width: 32%; text-align: left;">Hạng mục</th>
              <th style="width: 23%; text-align: right;">Phân bổ</th>
              <th style="width: 22%; text-align: right;">Đã chi</th>
              <th style="width: 23%; text-align: right;">Còn lại</th>
            </tr>
          </thead>
          <tbody id="actual-table-body">
            ${tableRows}
          </tbody>
          <tfoot>
            <tr>
              <td style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Tổng (${expenseCategories.length})</td>
              <td class="${this.getAmountFontClass(this.formatMoney(totalBudgeted))}" style="text-align: right; color: var(--primary); font-weight: 700;">${this.formatMoney(totalBudgeted)}</td>
              <td class="${this.getAmountFontClass(totalSpent > 0 ? '-' + this.formatMoney(totalSpent) : '0đ')}" style="text-align: right; color: var(--text-secondary); font-weight: 700;">${totalSpent > 0 ? `-${this.formatMoney(totalSpent)}` : '0đ'}</td>
              <td style="text-align: right;">
                <span class="actual-avail-badge ${totalAvailClass} ${this.getAmountFontClass(totalAvailText)}">${totalAvailText}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    container.innerHTML = `
      ${topBannerHtml}
            ${toBudgetNegativeBannerHtml}
      ${overspentBannerHtml}
      ${tableHtml}
    `;
    if (window.lucide) lucide.createIcons();
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

  /* ==================== FULL PAGE VIEW: BUDGET FORM ==================== */
  async openBudgetForm() {
    const monthText = document.getElementById('budget-form-month-text');
    if (monthText) monthText.textContent = this.formatMonthDisplay(this.currentMonth);

    const amountInput = document.getElementById('budget-form-amount');
    const deleteBtn = document.getElementById('budget-form-delete-btn');
    const autoRolloverCheckbox = document.getElementById('budget-form-auto-rollover');

    const existing = await db.budgets.where('month').equals(this.currentMonth).toArray();
    const overall = existing.find(b => b.categoryId === 'TOTAL' || b.categoryId === 0 || b.isOverall);

    if (overall && overall.limitAmount) {
      if (amountInput) amountInput.value = new Intl.NumberFormat('vi-VN').format(overall.limitAmount);
      if (deleteBtn) deleteBtn.style.display = 'inline-flex';
    } else {
      if (amountInput) amountInput.value = '';
      if (deleteBtn) deleteBtn.style.display = 'none';
    }

    if (autoRolloverCheckbox) {
      try {
        const autoSetting = await db.settings.get('budget_auto_rollover');
        autoRolloverCheckbox.checked = autoSetting ? (autoSetting.value !== false && autoSetting.value !== 0) : true;
      } catch (e) {
        autoRolloverCheckbox.checked = true;
      }
    }

    if (window.app) {
      window.app.switchView('budget-form');
    }
    if (window.lucide) lucide.createIcons();
    // Do NOT auto open keypad; wait for user tap
  },

  closeBudgetForm() {
    if (window.app) {
      window.app.switchView('budgets', true);
    }
  },

  setFormPreset(amount) {
    const input = document.getElementById('budget-form-amount');
    const formatted = new Intl.NumberFormat('vi-VN').format(amount);
    if (input) input.value = formatted;
    const keypadLive = document.getElementById('keypad-live-val');
    if (keypadLive && window.UITransactions && window.UITransactions.activeKeypadTarget === 'budget-form-amount') {
      keypadLive.textContent = formatted;
      window.UITransactions.keypadAutoSelect = true;
      keypadLive.classList.add('is-selected');
    }
  },

  async handleFormBudgetSubmit() {
    const amountStr = document.getElementById('budget-form-amount')?.value || '';
    const limitAmount = Number(amountStr.replace(/\D/g, ''));

    if (!limitAmount || limitAmount <= 0) {
      showToast('Vui lòng nhập số tiền ngân sách tổng hợp lệ', 'error');
      return;
    }

    const autoRolloverCheckbox = document.getElementById('budget-form-auto-rollover');
    if (autoRolloverCheckbox) {
      try {
        await db.settings.put({ key: 'budget_auto_rollover', value: !!autoRolloverCheckbox.checked });
      } catch (e) {
        console.warn('Error saving budget_auto_rollover:', e);
      }
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

    try {
      localStorage.setItem('budget_manual_set_' + this.currentMonth, '1');
    } catch (_) {}

    this.closeBudgetForm();
    window.app.refreshAll();
  },

  async deleteFormBudget() {
    const monthDisplay = this.formatMonthDisplay(this.currentMonth);
    if (!confirm(`Bạn có chắc chắn muốn xóa ngân sách tổng của ${monthDisplay}?`)) {
      return;
    }
    const existing = await db.budgets.where('month').equals(this.currentMonth).toArray();
    const overall = existing.find(b => b.categoryId === 'TOTAL' || b.categoryId === 0 || b.isOverall);
    if (overall) {
      await db.budgets.delete(overall.id);
      try {
        localStorage.setItem('budget_manual_set_' + this.currentMonth, '1');
      } catch (_) {}
      showToast('Đã xóa ngân sách tổng của tháng', 'info');
      this.closeBudgetForm();
      window.app.refreshAll();
    }
  },

  /* ==================== MODAL 1: OVERALL BUDGET (LEGACY/BACKUP) ==================== */
  async copyFromPreviousMonthOverall() {
    try {
      const allBudgets = await db.budgets.toArray();
      const pastOverall = allBudgets
        .filter(b => (b.categoryId === 'TOTAL' || b.categoryId === 0 || b.isOverall) && b.month < this.currentMonth && (b.limitAmount || 0) > 0)
        .sort((a, b) => b.month.localeCompare(a.month));

      if (pastOverall.length === 0) {
        showToast('Chưa có dữ liệu ngân sách các tháng trước để sao chép', 'warning');
        return;
      }

      const prev = pastOverall[0];
      const amountInput = document.getElementById('budget-overall-amount');
      if (amountInput) {
        amountInput.value = new Intl.NumberFormat('vi-VN').format(prev.limitAmount);
        amountInput.focus();
      }
      showToast(`Đã sao chép hạn mức ${this.formatMoney(prev.limitAmount)} từ ${this.formatMonthDisplay(prev.month)}`, 'success');
    } catch (e) {
      console.error('Error copying previous budget:', e);
      showToast('Có lỗi xảy ra khi sao chép ngân sách', 'error');
    }
  },

  async openOverallBudgetModal() {
    const modal = document.getElementById('modal-budget-overall');
    if (!modal) return;

    const monthDisplay = document.getElementById('budget-overall-month');
    if (monthDisplay) monthDisplay.value = this.currentMonth;
    const monthText = document.getElementById('budget-overall-month-text');
    if (monthText) monthText.textContent = this.formatMonthDisplay(this.currentMonth);

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
    if (window.lucide) lucide.createIcons();
  },

  closeOverallModal() {
    const modal = document.getElementById('modal-budget-overall');
    if (modal) modal.classList.remove('open');
  },

  setOverallPreset(amount) {
    const input = document.getElementById('budget-overall-amount');
    const formatted = new Intl.NumberFormat('vi-VN').format(amount);
    if (input) input.value = formatted;
    const keypadLive = document.getElementById('keypad-live-val');
    if (keypadLive && window.UITransactions && window.UITransactions.activeKeypadTarget === 'budget-overall-amount') {
      keypadLive.textContent = formatted;
      window.UITransactions.keypadAutoSelect = true;
      keypadLive.classList.add('is-selected');
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
    const monthDisplay = this.formatMonthDisplay(this.currentMonth);
    if (!confirm(`Bạn có chắc chắn muốn xóa ngân sách tổng của ${monthDisplay}?`)) {
      return;
    }
    const existing = await db.budgets.where('month').equals(this.currentMonth).toArray();
    const overall = existing.find(b => b.categoryId === 'TOTAL' || b.categoryId === 0 || b.isOverall);
    if (overall) {
      await db.budgets.delete(overall.id);
      showToast('Đã xóa ngân sách tổng của tháng', 'info');
      this.closeOverallModal();
      window.app.refreshAll();
    }
  },

  /* ==================== CATEGORY DROPDOWN PICKER ==================== */
  async initCatDropdown(type, selectedCatId = null, disabled = false) {
    const trigger = document.getElementById(type === 'lock' ? 'budget-lock-cat-trigger' : 'budget-cat-trigger');
    const iconEl = document.getElementById(type === 'lock' ? 'budget-lock-cat-icon' : 'budget-cat-icon');
    const labelEl = document.getElementById(type === 'lock' ? 'budget-lock-cat-label' : 'budget-cat-label');
    const menu = document.getElementById(type === 'lock' ? 'budget-lock-cat-menu' : 'budget-cat-menu');
    const hidden = document.getElementById(type === 'lock' ? 'budget-lock-cat-id' : 'budget-cat-id');

    if (!menu) return;

    if (trigger) {
      trigger.disabled = !!disabled;
      trigger.style.opacity = disabled ? '0.75' : '1';
      trigger.style.cursor = disabled ? 'not-allowed' : 'pointer';
    }

    const existingBudgets = await db.budgets
      .where('month').equals(this.currentMonth)
      .filter(b => b.categoryId !== 'TOTAL' && b.categoryId !== 0 && !b.isOverall && (b.limitAmount || 0) > 0)
      .toArray();
    const existingCatIds = new Set(existingBudgets.map(b => Number(b.categoryId)));

    const categories = (await db.categories.where('type').equals('expense').and(c => c.isDeleted === 0).toArray())
      .filter(c => (selectedCatId && Number(c.id) === Number(selectedCatId)) || !existingCatIds.has(Number(c.id)));

    let targetCat = null;
    if (selectedCatId) {
      targetCat = categories.find(c => Number(c.id) === Number(selectedCatId));
    }
    if (!targetCat && categories.length > 0) {
      targetCat = categories[0];
    }

    if (targetCat) {
      if (hidden) hidden.value = targetCat.id;
      if (labelEl) labelEl.textContent = targetCat.name;
      if (iconEl) {
        iconEl.style.background = `${targetCat.color || '#0d9488'}22`;
        iconEl.style.color = targetCat.color || '#0d9488';
        iconEl.innerHTML = `<i data-lucide="${targetCat.icon || 'tag'}"></i>`;
      }
    }

    menu.innerHTML = categories.map(c => `
      <div class="budget-cat-option ${targetCat && targetCat.id === c.id ? 'selected' : ''}" onclick="UIBudgets.selectCatOption('${type}', ${c.id})">
        <div class="category-icon-bubble" style="background: ${c.color || '#0d9488'}22; color: ${c.color || '#0d9488'}; width: 28px; height: 28px; font-size: 0.85rem;">
          <i data-lucide="${c.icon || 'tag'}"></i>
        </div>
        <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">${escapeHTML(c.name)}</span>
      </div>
    `).join('');

    menu.style.display = 'none';
    if (window.lucide) lucide.createIcons();
  },

  toggleCatDropdown(type) {
    const trigger = document.getElementById(type === 'lock' ? 'budget-lock-cat-trigger' : 'budget-cat-trigger');
    if (trigger && trigger.disabled) return;
    const menu = document.getElementById(type === 'lock' ? 'budget-lock-cat-menu' : 'budget-cat-menu');
    if (!menu) return;
    const isShowing = menu.style.display === 'flex';
    menu.style.display = isShowing ? 'none' : 'flex';
  },

  async selectCatOption(type, catId) {
    const cat = await db.categories.get(Number(catId));
    if (!cat) return;

    const iconEl = document.getElementById(type === 'lock' ? 'budget-lock-cat-icon' : 'budget-cat-icon');
    const labelEl = document.getElementById(type === 'lock' ? 'budget-lock-cat-label' : 'budget-cat-label');
    const menu = document.getElementById(type === 'lock' ? 'budget-lock-cat-menu' : 'budget-cat-menu');
    const hidden = document.getElementById(type === 'lock' ? 'budget-lock-cat-id' : 'budget-cat-id');

    if (hidden) hidden.value = cat.id;
    if (labelEl) labelEl.textContent = cat.name;
    if (iconEl) {
      iconEl.style.background = `${cat.color || '#0d9488'}22`;
      iconEl.style.color = cat.color || '#0d9488';
      iconEl.innerHTML = `<i data-lucide="${cat.icon || 'tag'}"></i>`;
    }

    if (menu) {
      menu.querySelectorAll('.budget-cat-option').forEach(el => el.classList.remove('selected'));
      menu.style.display = 'none';
    }

    if (window.lucide) lucide.createIcons();
  },

  /* ==================== BUDGET CATEGORY FORM (NEW FULL-SCREEN PAGE) ==================== */
  async openLockCategoryForm(catId = null) {
    const amountInput = document.getElementById('budget-cat-form-amount');
    const deleteBtn = document.getElementById('budget-cat-form-delete-btn');
    const titleEl = document.getElementById('budget-cat-page-title');

    // Nếu thêm mới, kiểm tra xem tất cả danh mục chi tiêu đã có hạn mức chưa
    if (!catId) {
      const existingBudgets = await db.budgets
        .where('month').equals(this.currentMonth)
        .filter(b => b.categoryId !== 'TOTAL' && b.categoryId !== 0 && !b.isOverall && (b.limitAmount || 0) > 0)
        .toArray();
      const existingCatIds = new Set(existingBudgets.map(b => Number(b.categoryId)));
      const allExpenseCategories = await db.categories.where('type').equals('expense').and(c => c.isDeleted === 0).toArray();
      const availableCategories = allExpenseCategories.filter(c => !existingCatIds.has(Number(c.id)));

      if (allExpenseCategories.length > 0 && availableCategories.length === 0) {
        showToast('Tất cả danh mục chi tiêu đã được thiết lập hạn mức trong tháng này', 'info');
        return;
      }
    }

    await this.initCatPageDropdown(catId);

    if (catId) {
      const existing = await db.budgets.where({ categoryId: Number(catId), month: this.currentMonth }).first();
      if (existing && amountInput) {
        amountInput.value = new Intl.NumberFormat('vi-VN').format(existing.limitAmount);
      } else if (amountInput) {
        amountInput.value = '';
      }
      if (deleteBtn) deleteBtn.style.display = 'inline-flex';
      if (titleEl) titleEl.textContent = 'Chỉnh Sửa Hạn Mức';
    } else {
      if (amountInput) amountInput.value = '';
      if (deleteBtn) deleteBtn.style.display = 'none';
      if (titleEl) titleEl.textContent = 'Thêm Hạn Mức Danh Mục';
    }

    if (window.app) window.app.switchView('budget-category-form');
    if (window.lucide) lucide.createIcons();
  },

  closeBudgetCategoryForm() {
    this.closeCatPickerModal();
    if (window.app) window.app.switchView('budgets', true);
  },

  openCatPickerModal() {
    const modal = document.getElementById('modal-budget-cat-picker');
    if (!modal) return;
    this.renderCatPickerModalList();
    modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeCatPickerModal() {
    const modal = document.getElementById('modal-budget-cat-picker');
    if (modal) modal.classList.remove('open');
  },

  toggleCatPageDropdown(force = null) {
    if (force === false) {
      this.closeCatPickerModal();
    } else {
      this.openCatPickerModal();
    }
  },

  async renderCatPickerModalList() {
    const listEl = document.getElementById('modal-budget-cat-list');
    if (!listEl) return;

    const currentSelectedId = document.getElementById('budget-cat-page-id')?.value;
    const allExpenseCategories = await db.categories.where('type').equals('expense').and(c => c.isDeleted === 0).toArray();

    // Lấy các danh mục đã có hạn mức trong tháng này
    const existingBudgets = await db.budgets
      .where('month').equals(this.currentMonth)
      .filter(b => b.categoryId !== 'TOTAL' && b.categoryId !== 0 && !b.isOverall && (b.limitAmount || 0) > 0)
      .toArray();
    const existingCatIds = new Set(existingBudgets.map(b => Number(b.categoryId)));

    // Loại bỏ các danh mục đã có hạn mức (chỉ giữ lại danh mục đang sửa nếu có)
    const categories = allExpenseCategories.filter(cat => 
      (currentSelectedId && Number(cat.id) === Number(currentSelectedId)) || !existingCatIds.has(Number(cat.id))
    );

    if (categories.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 36px 16px; color: var(--text-muted); font-size: 0.9rem;">
          <i data-lucide="check-circle" style="width: 38px; height: 38px; margin-bottom: 8px; color: var(--primary);"></i>
          <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Đã thiết lập đầy đủ</div>
          <div>Tất cả danh mục chi tiêu đều đã có hạn mức trong tháng này.</div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    let itemsHtml = '';
    categories.forEach(cat => {
      const isSelected = currentSelectedId && Number(currentSelectedId) === Number(cat.id);
      const color = cat.color || '#0d9488';
      const icon = cat.icon || 'tag';

      itemsHtml += `
        <div class="budget-cat-item ${isSelected ? 'selected' : ''}" onclick="UIBudgets.selectCatPageOption(${cat.id})">
          <div class="category-icon-bubble" style="background: ${color}22; color: ${color}; width: 34px; height: 34px; font-size: 0.95rem; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%;">
            <i data-lucide="${icon}"></i>
          </div>
          <span class="budget-cat-item-name">${escapeHTML(cat.name)}</span>
          ${isSelected ? '<i data-lucide="check" class="budget-cat-check"></i>' : ''}
        </div>
      `;
    });

    listEl.innerHTML = itemsHtml;
    if (window.lucide) lucide.createIcons();
  },

  async initCatPageDropdown(selectedId = null) {
    const triggerIcon = document.getElementById('budget-cat-page-icon');
    const triggerLabel = document.getElementById('budget-cat-page-label');
    const hiddenId = document.getElementById('budget-cat-page-id');

    const allExpenseCategories = await db.categories.where('type').equals('expense').and(c => c.isDeleted === 0).toArray();

    // Lấy các danh mục đã có hạn mức trong tháng này
    const existingBudgets = await db.budgets
      .where('month').equals(this.currentMonth)
      .filter(b => b.categoryId !== 'TOTAL' && b.categoryId !== 0 && !b.isOverall && (b.limitAmount || 0) > 0)
      .toArray();
    const existingCatIds = new Set(existingBudgets.map(b => Number(b.categoryId)));

    // Loại bỏ các mục đã có hạn mức, giữ lại danh mục đang sửa nếu có
    const categories = allExpenseCategories.filter(cat => 
      (selectedId && Number(cat.id) === Number(selectedId)) || !existingCatIds.has(Number(cat.id))
    );

    let foundCat = null;
    if (selectedId) {
      foundCat = allExpenseCategories.find(c => Number(c.id) === Number(selectedId));
    } else if (categories.length > 0) {
      foundCat = categories[0];
    }

    if (foundCat) {
      const color = foundCat.color || '#0d9488';
      const icon = foundCat.icon || 'tag';
      if (triggerIcon) {
        triggerIcon.style.background = `${color}22`;
        triggerIcon.style.color = color;
        triggerIcon.innerHTML = `<i data-lucide="${icon}"></i>`;
      }
      if (triggerLabel) triggerLabel.textContent = foundCat.name;
      if (hiddenId) hiddenId.value = foundCat.id;
    } else {
      if (triggerIcon) {
        triggerIcon.style.background = 'rgba(13, 148, 136, 0.15)';
        triggerIcon.style.color = 'var(--primary)';
        triggerIcon.innerHTML = `<i data-lucide="tag"></i>`;
      }
      if (triggerLabel) triggerLabel.textContent = 'Chọn danh mục';
      if (hiddenId) hiddenId.value = '';
    }

    await this.renderCatPickerModalList();
    if (window.lucide) lucide.createIcons();
  },

  async selectCatPageOption(catId) {
    const cat = await db.categories.get(Number(catId));
    if (!cat) return;

    const triggerIcon = document.getElementById('budget-cat-page-icon');
    const triggerLabel = document.getElementById('budget-cat-page-label');
    const hiddenId = document.getElementById('budget-cat-page-id');

    const color = cat.color || '#0d9488';
    const icon = cat.icon || 'tag';

    if (triggerIcon) {
      triggerIcon.style.background = `${color}22`;
      triggerIcon.style.color = color;
      triggerIcon.innerHTML = `<i data-lucide="${icon}"></i>`;
    }
    if (triggerLabel) triggerLabel.textContent = cat.name;
    if (hiddenId) hiddenId.value = cat.id;

    this.closeCatPickerModal();

    const existing = await db.budgets.where({ categoryId: Number(cat.id), month: this.currentMonth }).first();
    const amountInput = document.getElementById('budget-cat-form-amount');
    const deleteBtn = document.getElementById('budget-cat-form-delete-btn');
    const titleEl = document.getElementById('budget-cat-page-title');

    if (existing && existing.limitAmount > 0) {
      if (amountInput) amountInput.value = new Intl.NumberFormat('vi-VN').format(existing.limitAmount);
      if (deleteBtn) deleteBtn.style.display = 'inline-flex';
      if (titleEl) titleEl.textContent = 'Chỉnh Sửa Hạn Mức';
    } else {
      if (amountInput && !amountInput.value) amountInput.value = '';
      if (deleteBtn) deleteBtn.style.display = 'none';
      if (titleEl) titleEl.textContent = 'Thêm Hạn Mức Danh Mục';
    }

    if (window.lucide) lucide.createIcons();
  },

  setCatFormPreset(amount) {
    const input = document.getElementById('budget-cat-form-amount');
    const formatted = new Intl.NumberFormat('vi-VN').format(amount);
    if (input) input.value = formatted;
    const keypadLive = document.getElementById('keypad-live-val');
    if (keypadLive && window.UITransactions && window.UITransactions.activeKeypadTarget === 'budget-cat-form-amount') {
      keypadLive.textContent = formatted;
      window.UITransactions.keypadAutoSelect = true;
      keypadLive.classList.add('is-selected');
    }
  },

  async handleCatFormBudgetSubmit() {
    const catIdHidden = document.getElementById('budget-cat-page-id');
    const categoryId = Number(catIdHidden?.value);
    const amountStr = document.getElementById('budget-cat-form-amount')?.value || '';
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
      showToast('Đã cập nhật hạn mức cho danh mục', 'success');
    } else {
      await db.budgets.add({
        categoryId,
        month: this.currentMonth,
        limitAmount,
        isLocked: 1,
        updatedAt: now
      });
      showToast('Đã thiết lập hạn mức danh mục', 'success');
    }

    try {
      localStorage.setItem('budget_manual_set_' + this.currentMonth, '1');
    } catch (_) {}

    this.closeBudgetCategoryForm();
    window.app.refreshAll();
  },

  async deleteCatFormBudget() {
    const catIdHidden = document.getElementById('budget-cat-page-id');
    const categoryId = Number(catIdHidden?.value);
    if (categoryId) {
      if (!confirm('Bạn có chắc chắn muốn xóa hạn mức cho danh mục này?')) {
        return;
      }
      const existing = await db.budgets.where({ categoryId, month: this.currentMonth }).first();
      if (existing) {
        await db.budgets.delete(existing.id);
        try {
          localStorage.setItem('budget_manual_set_' + this.currentMonth, '1');
        } catch (_) {}
        showToast('Đã xóa hạn mức danh mục', 'info');
      }
      this.closeBudgetCategoryForm();
      window.app.refreshAll();
    }
  },

  /* ==================== MODAL 2: LOCK CATEGORY ==================== */
  async openLockCategoryModal(catId = null) {
    return this.openLockCategoryForm(catId);
  },
  async _deprecated_openLockCategoryModal(catId = null) {
    const modal = document.getElementById('modal-budget-lock');
    if (!modal) return;

    const amountInput = document.getElementById('budget-lock-amount');
    const deleteBtn = document.getElementById('budget-lock-delete-btn');

    await this.initCatDropdown('lock', catId, !!catId);

    if (catId) {
      const existing = await db.budgets.where({ categoryId: Number(catId), month: this.currentMonth }).first();
      if (existing && amountInput) {
        amountInput.value = new Intl.NumberFormat('vi-VN').format(existing.limitAmount);
      }
      if (deleteBtn) deleteBtn.style.display = 'inline-block';
    } else {
      if (amountInput) amountInput.value = '';
      if (deleteBtn) deleteBtn.style.display = 'none';
    }

    modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeLockModal() {
    const modal = document.getElementById('modal-budget-lock');
    if (modal) modal.classList.remove('open');
    const menu = document.getElementById('budget-lock-cat-menu');
    if (menu) menu.style.display = 'none';
  },

  setLockPreset(amount) {
    const input = document.getElementById('budget-lock-amount');
    const formatted = new Intl.NumberFormat('vi-VN').format(amount);
    if (input) input.value = formatted;
    const keypadLive = document.getElementById('keypad-live-val');
    if (keypadLive && window.UITransactions && window.UITransactions.activeKeypadTarget === 'budget-lock-amount') {
      keypadLive.textContent = formatted;
      window.UITransactions.keypadAutoSelect = true;
      keypadLive.classList.add('is-selected');
    }
  },

  async handleLockCategorySubmit() {
    const catIdHidden = document.getElementById('budget-lock-cat-id');
    const categoryId = Number(catIdHidden?.value);
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
      showToast('Đã cập nhật hạn mức cho danh mục', 'success');
    } else {
      await db.budgets.add({
        categoryId,
        month: this.currentMonth,
        limitAmount,
        isLocked: 1,
        updatedAt: now
      });
      showToast('Đã thiết lập hạn mức danh mục', 'success');
    }

    this.closeLockModal();
    window.app.refreshAll();
  },

  async unlockCurrentCategory() {
    const catIdHidden = document.getElementById('budget-lock-cat-id');
    const categoryId = Number(catIdHidden?.value);
    if (categoryId) {
      if (!confirm('Bạn có chắc chắn muốn xóa hạn mức cho danh mục này?')) {
        return;
      }
      await this.unlockCategory(categoryId, true);
      this.closeLockModal();
    }
  },

  async unlockCategory(catId, skipConfirm = false) {
    if (!skipConfirm && !confirm('Bạn có chắc chắn muốn xóa hạn mức cho danh mục này?')) {
      return;
    }
    const existing = await db.budgets.where({ categoryId: Number(catId), month: this.currentMonth }).first();
    if (existing) {
      await db.budgets.delete(existing.id);
      showToast('Đã xóa hạn mức danh mục', 'info');
      window.app.refreshAll();
    }
  },

  /* ==================== MODAL 3: ACTUAL BUDGET CATEGORY ==================== */
  async openCategoryModal(catId = null) {
    return this.openLockCategoryForm(catId);
  },
  async _deprecated_openCategoryModal(catId = null) {
    const modal = document.getElementById('modal-budget-category');
    if (!modal) return;

    const amountInput = document.getElementById('budget-cat-amount');
    const deleteBtn = document.getElementById('budget-cat-delete-btn');

    await this.initCatDropdown('actual', catId, false);

    if (catId) {
      const existing = await db.budgets.where({ categoryId: Number(catId), month: this.currentMonth }).first();
      if (existing && amountInput) {
        amountInput.value = new Intl.NumberFormat('vi-VN').format(existing.limitAmount);
      }
      if (deleteBtn) deleteBtn.style.display = 'inline-block';
    } else {
      if (amountInput) amountInput.value = '';
      if (deleteBtn) deleteBtn.style.display = 'none';
    }

    modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeCategoryModal() {
    const modal = document.getElementById('modal-budget-category');
    if (modal) modal.classList.remove('open');
    const menu = document.getElementById('budget-cat-menu');
    if (menu) menu.style.display = 'none';
  },

  setCatPreset(amount) {
    const input = document.getElementById('budget-cat-amount');
    const formatted = new Intl.NumberFormat('vi-VN').format(amount);
    if (input) input.value = formatted;
    const keypadLive = document.getElementById('keypad-live-val');
    if (keypadLive && window.UITransactions && window.UITransactions.activeKeypadTarget === 'budget-cat-amount') {
      keypadLive.textContent = formatted;
      window.UITransactions.keypadAutoSelect = true;
      keypadLive.classList.add('is-selected');
    }
  },

  async handleCategoryBudgetSubmit() {
    const catIdHidden = document.getElementById('budget-cat-id');
    const categoryId = Number(catIdHidden?.value);
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
    const categoryId = Number(catIdHidden?.value);
    if (categoryId) {
      if (!confirm('Bạn có chắc chắn muốn xóa hạn mức phân bổ cho danh mục này?')) {
        return;
      }
      const existing = await db.budgets.where({ categoryId, month: this.currentMonth }).first();
      if (existing) {
        await db.budgets.delete(existing.id);
        showToast('Đã xóa hạn mức danh mục', 'info');
      }
      this.closeCategoryModal();
      window.app.refreshAll();
    }
  },

  /* ==================== QUICK EDIT INLINE KEYPAD BOTTOM SHEET ==================== */
  async openQuickEditModal(catId, prevCarry = 0) {
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
      prevCarry,
      currentAmount: currentLimit,
      color: cat.color || '#0d9488',
      icon: cat.icon || 'tag'
    };

    const nameEl = document.getElementById('keypad-budget-cat-name');
    const spentEl = document.getElementById('keypad-budget-cat-spent');
    const bubbleEl = document.getElementById('keypad-budget-cat-bubble');

    if (nameEl) nameEl.textContent = cat.name;
    const spentText = `Thực tế đã chi: ${this.formatMoney(spent)}`;
    const carryText = prevCarry !== 0 ? ` • Từ tháng trước: ${prevCarry > 0 ? '+' : ''}${this.formatMoney(prevCarry)}` : '';
    if (spentEl) spentEl.textContent = `${spentText}${carryText}`;
    if (bubbleEl) {
      bubbleEl.style.background = `${cat.color || '#0d9488'}22`;
      bubbleEl.style.color = cat.color || '#0d9488';
      bubbleEl.innerHTML = `<i data-lucide="${cat.icon || 'tag'}"></i>`;
    }

    // Reset advanced panel state
    const advPanel = document.getElementById('keypad-budget-adv-panel');
    const advBar = document.getElementById('btn-budget-quick-adv-bar');
    if (advPanel) advPanel.style.display = 'none';
    if (advBar) advBar.classList.remove('active');

    // Open keypad
    if (window.UITransactions && typeof window.UITransactions.openKeypad === 'function') {
      window.UITransactions.openKeypad('budget-quick-amount');
    }
    if (window.lucide) lucide.createIcons();

    // Asynchronously calculate advanced stats (previous month & averages)
    this.loadQuickAdvancedStats(cat.id);
  },

  toggleQuickAdvanced() {
    const advPanel = document.getElementById('keypad-budget-adv-panel');
    const advBar = document.getElementById('btn-budget-quick-adv-bar');
    if (!advPanel) return;

    const isHidden = advPanel.style.display === 'none' || !advPanel.style.display;
    if (isHidden) {
      advPanel.style.display = 'flex';
      if (advBar) advBar.classList.add('active');
      if (this.quickEditTarget && this.quickEditTarget.categoryId) {
        this.loadQuickAdvancedStats(this.quickEditTarget.categoryId);
      }
    } else {
      advPanel.style.display = 'none';
      if (advBar) advBar.classList.remove('active');
    }
    if (window.lucide) lucide.createIcons();
  },

  async loadQuickAdvancedStats(catId) {
    try {
      const [curY, curM] = this.currentMonth.split('-').map(Number);
      const prevDate = new Date(curY, curM - 2, 1);
      const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      const prevLabel = `T${prevDate.getMonth() + 1}/${prevDate.getFullYear()}`;

      const prevNameEl = document.getElementById('keypad-budget-prev-name');
      if (prevNameEl) prevNameEl.textContent = prevLabel;

      // 1. Previous month data (use string comparison to avoid IndexedDB type mismatch)
      const prevBudgets = await db.budgets.where('month').equals(prevYM).toArray();
      const prevBudget = prevBudgets.find(b => String(b.categoryId) === String(catId));
      const prevBudgetAmt = prevBudget ? (prevBudget.limitAmount || 0) : 0;

      const pStart = `${prevYM}-01`;
      const pEnd = `${prevYM}-31`;
      const pTxs = await db.transactions
        .where('date')
        .between(pStart, pEnd, true, true)
        .and(t => t.type === 'expense' && String(t.categoryId) === String(catId) && (!t.isDeleted || t.isDeleted === 0))
        .toArray();
      const prevSpentAmt = pTxs.reduce((s, t) => s + (t.amount || 0), 0);

      const prevChipsEl = document.getElementById('keypad-budget-prev-chips');
      if (prevChipsEl) {
        const chips = [];
        if (prevBudgetAmt > 0) {
          chips.push(`<button type="button" class="budget-adv-chip" onclick="UIBudgets.applyQuickAdvAmount(${prevBudgetAmt})" title="Sao chép ngân sách ${prevLabel}"><i data-lucide="copy" style="width: 11px; height: 11px;"></i> NS: ${this.formatMoney(prevBudgetAmt)}</button>`);
        }
        if (prevSpentAmt > 0) {
          chips.push(`<button type="button" class="budget-adv-chip" onclick="UIBudgets.applyQuickAdvAmount(${prevSpentAmt})" title="Sao chép thực chi ${prevLabel}"><i data-lucide="receipt" style="width: 11px; height: 11px;"></i> Chi: ${this.formatMoney(prevSpentAmt)}</button>`);
        }
        if (chips.length === 0) {
          chips.push(`<span class="budget-adv-empty">Chưa có dữ liệu ${prevLabel}</span>`);
        }
        prevChipsEl.innerHTML = chips.join('');
      }

      // 2. Average calculations for 3, 6, 12 months
      const avgChipsEl = document.getElementById('keypad-budget-avg-chips');
      if (avgChipsEl) {
        const avgList = [];
        for (const n of [3, 6, 12]) {
          const startD = new Date(curY, curM - 1 - n, 1);
          const startYM = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}`;
          const startDate = `${startYM}-01`;

          const endD = new Date(curY, curM - 1, 0);
          const endY = endD.getFullYear();
          const endM = String(endD.getMonth() + 1).padStart(2, '0');
          const endDay = String(endD.getDate()).padStart(2, '0');
          const endDate = `${endY}-${endM}-${endDay}`;

          const txs = await db.transactions
            .where('date')
            .between(startDate, endDate, true, true)
            .and(t => t.type === 'expense' && String(t.categoryId) === String(catId) && (!t.isDeleted || t.isDeleted === 0))
            .toArray();
          const total = txs.reduce((s, t) => s + (t.amount || 0), 0);
          const avg = Math.round((total / n) / 1000) * 1000;
          avgList.push({ n, avg });
        }

        avgChipsEl.innerHTML = avgList.map(item => {
          if (item.avg > 0) {
            return `<button type="button" class="budget-adv-chip" onclick="UIBudgets.applyQuickAdvAmount(${item.avg})" title="Trung bình ${item.n} tháng qua: ${this.formatMoney(item.avg)}">${item.n} tháng: ${this.formatMoney(item.avg)}</button>`;
          } else {
            return `<button type="button" class="budget-adv-chip disabled" title="Không có chi tiêu trong ${item.n} tháng">${item.n} tháng: 0 ₫</button>`;
          }
        }).join('');
      }

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.warn('loadQuickAdvancedStats error:', err);
      const prevChipsEl = document.getElementById('keypad-budget-prev-chips');
      const avgChipsEl = document.getElementById('keypad-budget-avg-chips');
      if (prevChipsEl) prevChipsEl.innerHTML = `<span class="budget-adv-empty">Chưa có dữ liệu</span>`;
      if (avgChipsEl) avgChipsEl.innerHTML = `<span class="budget-adv-empty">Chưa có dữ liệu</span>`;
    }
  },

  applyQuickAdvAmount(amt) {
    const keypadLive = document.getElementById('keypad-live-val');
    if (keypadLive) {
      keypadLive.textContent = new Intl.NumberFormat('vi-VN').format(amt);
      if (window.UITransactions) {
        window.UITransactions.keypadAutoSelect = true;
        keypadLive.classList.add('is-selected');
      }
    }
  },

  cancelQuickKeypad() {
    this.quickEditTarget = null;
    const advPanel = document.getElementById('keypad-budget-adv-panel');
    const advBar = document.getElementById('btn-budget-quick-adv-bar');
    if (advPanel) advPanel.style.display = 'none';
    if (advBar) advBar.classList.remove('active');

    if (window.UITransactions && typeof window.UITransactions.closeKeypad === 'function') {
      window.UITransactions.closeKeypad(true);
    }
  },

  closeQuickEditModal() {
    this.cancelQuickKeypad();
  },

  adjustQuickAmount(delta) {
    const keypadLive = document.getElementById('keypad-live-val');
    if (!keypadLive) return;
    const current = Number((keypadLive.textContent || '').replace(/\D/g, '')) || 0;
    const next = Math.max(0, current + delta);
    keypadLive.textContent = new Intl.NumberFormat('vi-VN').format(next);
    if (window.UITransactions) {
      window.UITransactions.keypadAutoSelect = true;
      keypadLive.classList.add('is-selected');
    }
  },

  setQuickToSpent() {
    if (!this.quickEditTarget) return;
    const formatted = new Intl.NumberFormat('vi-VN').format(this.quickEditTarget.spent);
    const keypadLive = document.getElementById('keypad-live-val');
    if (keypadLive) {
      keypadLive.textContent = formatted;
      if (window.UITransactions) {
        window.UITransactions.keypadAutoSelect = true;
        keypadLive.classList.add('is-selected');
      }
    }
  },

  setQuickZero() {
    const keypadLive = document.getElementById('keypad-live-val');
    if (keypadLive) {
      keypadLive.textContent = '0';
      if (window.UITransactions) {
        window.UITransactions.keypadAutoSelect = true;
        keypadLive.classList.add('is-selected');
      }
    }
  },

  async handleQuickEditSubmit() {
    if (!this.quickEditTarget) return;
    const categoryId = this.quickEditTarget.categoryId;
    const catName = this.quickEditTarget.name;
    const keypadLive = document.getElementById('keypad-live-val');
    const amountStr = keypadLive ? keypadLive.textContent : '0';
    const evaluated = window.UITransactions ? window.UITransactions.evaluateAmountExpression(amountStr) : null;
    const limitAmount = evaluated !== null && evaluated >= 0 ? evaluated : (Number((amountStr || '').replace(/\D/g, '')) || 0);

    const existing = await db.budgets.where({ categoryId, month: this.currentMonth }).first();
    const now = Date.now();

    if (limitAmount <= 0) {
      if (existing) {
        await db.budgets.delete(existing.id);
        if (typeof showToast === 'function') showToast(`Đã xóa ngân sách [${catName}]`, 'info');
      }
    } else {
      if (existing) {
        await db.budgets.update(existing.id, { limitAmount, updatedAt: now });
      } else {
        await db.budgets.add({ categoryId, month: this.currentMonth, limitAmount, updatedAt: now });
      }
      if (typeof showToast === 'function') showToast(`Đã lưu [${catName}]: ${this.formatMoney(limitAmount)}`, 'success');
    }

    this.quickEditTarget = null;
    if (window.UITransactions && typeof window.UITransactions.closeKeypad === 'function') {
      window.UITransactions.closeKeypad(true);
    }
    if (window.app && typeof window.app.refreshAll === 'function') {
      window.app.refreshAll();
    } else {
      await this.render();
    }
  },

    /* ==================== MODAL 4: COPY / AUTO SETUP BUDGET ==================== */
  setupType: 'prev_month',
  averageMonths: 3,

  openCopyModal() {
    const modal = document.getElementById('modal-budget-copy');
    if (!modal) return;

    this.setupType = 'prev_month';
    this.averageMonths = 3;

    const targetDisplay = document.getElementById('budget-copy-target-display');
    if (targetDisplay) {
      targetDisplay.textContent = this.formatMonthDisplay(this.currentMonth);
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

    this.selectSetupType('prev_month');
    this.setAverageMonths(3);

    modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeCopyModal() {
    const modal = document.getElementById('modal-budget-copy');
    if (modal) modal.classList.remove('open');
  },

  selectSetupType(type) {
    this.setupType = type;
    const optPrev = document.getElementById('opt-setup-prev');
    const optAvg = document.getElementById('opt-setup-avg');
    const radioPrev = document.getElementById('radio-setup-prev');
    const radioAvg = document.getElementById('radio-setup-avg');
    const subPrev = document.getElementById('setup-prev-suboptions');
    const subAvg = document.getElementById('setup-avg-suboptions');

    if (type === 'average') {
      if (optPrev) optPrev.classList.remove('active');
      if (optAvg) optAvg.classList.add('active');
      if (radioPrev) radioPrev.checked = false;
      if (radioAvg) radioAvg.checked = true;
      if (subPrev) subPrev.style.display = 'none';
      if (subAvg) subAvg.style.display = 'block';
      this.updateAverageHint();
    } else {
      if (optPrev) optPrev.classList.add('active');
      if (optAvg) optAvg.classList.remove('active');
      if (radioPrev) radioPrev.checked = true;
      if (radioAvg) radioAvg.checked = false;
      if (subPrev) subPrev.style.display = 'flex';
      if (subAvg) subAvg.style.display = 'none';
    }
  },

  setAverageMonths(n) {
    this.averageMonths = n;
    [3, 6, 12].forEach(m => {
      const btn = document.getElementById(`btn-avg-${m}`);
      if (btn) {
        if (m === n) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
    });
    this.updateAverageHint();
  },

  updateAverageHint() {
    const hint = document.getElementById('setup-avg-range-hint');
    if (!hint) return;
    const n = this.averageMonths || 3;
    const [curY, curM] = this.currentMonth.split('-').map(Number);
    const startD = new Date(curY, curM - 1 - n, 1);
    const startYM = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}`;
    const endD = new Date(curY, curM - 1, 0);
    const endYM = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}`;
    hint.innerHTML = `<i data-lucide="calendar" style="width: 12px; height: 12px; vertical-align: -1px; margin-right: 4px;"></i>Phân tích chi tiêu từ <strong>${this.formatMonthDisplay(startYM)}</strong> đến <strong>${this.formatMonthDisplay(endYM)}</strong> (${n} tháng)`;
    if (window.lucide) lucide.createIcons();
  },

  selectCopyOption(mode) {
    if (mode === 'actual_spent') {
      this.selectSetupType('prev_month');
      const radio = document.querySelector('input[name="budget-prev-source-type"][value="spent"]');
      if (radio) radio.checked = true;
    } else if (mode === 'average') {
      this.selectSetupType('average');
    } else {
      this.selectSetupType('prev_month');
    }
  },

  async handleCopySubmit() {
    const targetMonth = this.currentMonth;
    const now = Date.now();
    const categories = await db.categories.where('type').equals('expense').toArray();

    // 1. THIẾT LẬP THEO TRUNG BÌNH 3, 6, 12 THÁNG
    if (this.setupType === 'average') {
      const n = this.averageMonths || 3;
      const [curY, curM] = targetMonth.split('-').map(Number);

      const startD = new Date(curY, curM - 1 - n, 1);
      const startYM = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}`;
      const startDate = `${startYM}-01`;

      const endD = new Date(curY, curM - 1, 0);
      const endY = endD.getFullYear();
      const endM = String(endD.getMonth() + 1).padStart(2, '0');
      const endDay = String(endD.getDate()).padStart(2, '0');
      const endDate = `${endY}-${endM}-${endDay}`;

      const txs = await db.transactions
        .where('date')
        .between(startDate, endDate, true, true)
        .and(t => t.type === 'expense' && t.isDeleted === 0)
        .toArray();

      if (txs.length === 0) {
        showToast(`Không có dữ liệu chi tiêu trong ${n} tháng gần nhất để tính trung bình`, 'warning');
        return;
      }

      const spentByCat = {};
      let totalSpent = 0;
      for (const t of txs) {
        const amt = t.amount || 0;
        totalSpent += amt;
        if (t.categoryId) {
          spentByCat[t.categoryId] = (spentByCat[t.categoryId] || 0) + amt;
        }
      }

      const targetBudgets = await db.budgets.where('month').equals(targetMonth).toArray();
      const targetMap = new Map(targetBudgets.map(b => [String(b.categoryId), b]));

      let appliedCount = 0;
      for (const cat of categories) {
        const catSpentTotal = spentByCat[cat.id] || 0;
        const avgSpent = Math.round((catSpentTotal / n) / 1000) * 1000;
        if (avgSpent > 0) {
          const existing = targetMap.get(String(cat.id));
          if (existing) {
            await db.budgets.update(existing.id, { limitAmount: avgSpent, updatedAt: now });
          } else {
            await db.budgets.add({ categoryId: cat.id, month: targetMonth, limitAmount: avgSpent, updatedAt: now });
          }
          appliedCount++;
        }
      }

      const avgTotal = Math.round((totalSpent / n) / 1000) * 1000;
      if (avgTotal > 0) {
        const existingOverall = targetBudgets.find(b => b.categoryId === 'TOTAL' || b.categoryId === 0 || b.isOverall);
        if (existingOverall) {
          await db.budgets.update(existingOverall.id, { limitAmount: avgTotal, updatedAt: now });
        } else {
          await db.budgets.add({ categoryId: 'TOTAL', month: targetMonth, limitAmount: avgTotal, isOverall: true, updatedAt: now });
        }
      }

      try {
        localStorage.setItem('budget_manual_set_' + targetMonth, '1');
      } catch (_) {}

      this.closeCopyModal();
      if (window.UITransactions && typeof window.UITransactions.closeKeypad === 'function') {
        window.UITransactions.closeKeypad();
      }
      this.closeBudgetForm();
      showToast(`Đã thiết lập ngân sách theo trung bình ${n} tháng (${appliedCount} hạng mục)`, 'success');
      if (window.app) {
        await window.app.refreshAll();
      }
      return;
    }

    // 2. SAO CHÉP TỪ THÁNG TRƯỚC (HOẶC THÁNG ĐƯỢC CHỌN)
    const sourceMonth = document.getElementById('budget-copy-source-select')?.value;
    const prevSourceType = document.querySelector('input[name="budget-prev-source-type"]:checked')?.value || 'budget';

    if (!sourceMonth || !targetMonth || sourceMonth === targetMonth) {
      showToast('Vui lòng chọn tháng nguồn hợp lệ', 'error');
      return;
    }

    const sourceBudgets = await db.budgets.where('month').equals(sourceMonth).toArray();
    const targetBudgets = await db.budgets.where('month').equals(targetMonth).toArray();
    const targetMap = new Map(targetBudgets.map(b => [String(b.categoryId), b]));

    let copiedCount = 0;

    if (prevSourceType === 'spent') {
      const startOfMonth = `${sourceMonth}-01`;
      const endOfMonth = `${sourceMonth}-31`;
      const sourceTxs = await db.transactions
        .where('date')
        .between(startOfMonth, endOfMonth, true, true)
        .and(t => t.type === 'expense' && t.isDeleted === 0)
        .toArray();

      if (sourceTxs.length === 0) {
        showToast(`Tháng ${this.formatMonthDisplay(sourceMonth)} không có chi tiêu thực tế`, 'warning');
        return;
      }

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
      // Theo hạn mức đã đặt
      if (sourceBudgets.length === 0) {
        showToast(`Tháng ${this.formatMonthDisplay(sourceMonth)} chưa có thiết lập ngân sách nào`, 'warning');
        return;
      }

      for (const b of sourceBudgets) {
        const existing = targetMap.get(String(b.categoryId));
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

    try {
      localStorage.setItem('budget_manual_set_' + targetMonth, '1');
    } catch (_) {}
    this.closeCopyModal();
    if (window.UITransactions && typeof window.UITransactions.closeKeypad === 'function') {
      window.UITransactions.closeKeypad();
    }
    this.closeBudgetForm();
    showToast(`Đã sao chép thành công ${copiedCount} mục ngân sách từ ${this.formatMonthDisplay(sourceMonth)}`, 'success');
    if (window.app) {
      await window.app.refreshAll();
    }
  },

  async clearBudgetMonth(targetMonth = null) {
    const month = targetMonth || this.currentMonth;
    const monthDisplay = this.formatMonthDisplay(month);

    const budgets = await db.budgets.where('month').equals(month).toArray();
    if (budgets.length === 0) {
      showToast(`${monthDisplay} chưa có ngân sách nào để xóa`, 'info');
      return;
    }

    if (!confirm(`Bạn có chắc chắn muốn xóa toàn bộ ngân sách (${budgets.length} mục) của ${monthDisplay}?`)) {
      return;
    }

    try {
      await db.budgets.where('month').equals(month).delete();
      localStorage.setItem('budget_manual_set_' + month, '1');
    } catch (err) {
      console.error('Error clearing budget for month:', err);
    }

    this.closeCopyModal();
    this.closeBudgetForm();
    showToast(`Đã xóa sạch ngân sách của ${monthDisplay}`, 'success');
    if (window.app) {
      await window.app.refreshAll();
    }
  },

  /* ==================== FORMATTER UTILITY ==================== */
  getAmountFontClass(amountStr) {
    const raw = (amountStr || '').toString().replace(/<[^>]*>/g, '').trim();
    const len = raw.length;
    if (len >= 14) return 'font-len-xs';
    if (len >= 12) return 'font-len-sm';
    return '';
  },


  /* ==================== VIEW: CATEGORY EXPENSE HISTORY (DEDICATED FULL PAGE) ==================== */
  async openCatExpenseHistory(catId) {
    try {
      const cat = await db.categories.get(Number(catId));
      if (!cat) return;

      const startOfMonth = `${this.currentMonth}-01`;
      const endOfMonth = `${this.currentMonth}-31`;
      const allTxs = await db.transactions
        .where('date')
        .between(startOfMonth, endOfMonth, true, true)
        .and(t => t.type === 'expense' && Number(t.categoryId) === Number(catId) && (!t.isDeleted || t.isDeleted === 0))
        .toArray();

      allTxs.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id - a.id));

      const totalSpent = allTxs.reduce((sum, t) => sum + (t.amount || 0), 0);

      const allBudgets = await db.budgets.where('month').equals(this.currentMonth).toArray();
      const b = allBudgets.find(item => Number(item.categoryId) === Number(catId));
      const budgeted = b ? (b.limitAmount || 0) : 0;

      const isOverspent = totalSpent > budgeted;
      const overAmount = isOverspent ? (totalSpent - budgeted) : 0;

      const allAccounts = await db.accounts.toArray();
      const accMap = new Map(allAccounts.map(a => [a.id, a]));

      const titleEl = document.getElementById('cat-history-title');
      const bubbleEl = document.getElementById('cat-history-bubble');
      const monthEl = document.getElementById('cat-history-month-text');
      const budgetEl = document.getElementById('cat-history-budget-text');
      const totalSpentEl = document.getElementById('cat-history-total-spent');
      const overspentBox = document.getElementById('cat-history-overspent-box');
      const overspentText = document.getElementById('cat-history-overspent-text');
      const rebalanceBtn = document.getElementById('cat-history-rebalance-btn');
      const listEl = document.getElementById('cat-history-list');

      if (titleEl) titleEl.textContent = cat.name;
      if (monthEl) monthEl.textContent = `Tháng ${this.formatMonthDisplay(this.currentMonth)}`;
      if (budgetEl) budgetEl.textContent = `Hạn mức: ${this.formatMoney(budgeted)}`;
      if (totalSpentEl) totalSpentEl.textContent = this.formatMoney(totalSpent);

      if (bubbleEl) {
        bubbleEl.style.background = `${cat.color || '#0d9488'}22`;
        bubbleEl.style.color = cat.color || '#0d9488';
        bubbleEl.innerHTML = `<i data-lucide="${cat.icon || 'tag'}" style="width: 16px; height: 16px;"></i>`;
      }

      if (isOverspent && overspentBox) {
        overspentBox.style.display = 'flex';
        if (overspentText) overspentText.textContent = `Chi vượt: ${this.formatMoney(overAmount)}`;
        if (rebalanceBtn) {
          rebalanceBtn.onclick = () => {
            this.openRebalanceModal(catId);
          };
        }
      } else if (overspentBox) {
        overspentBox.style.display = 'none';
      }

      if (listEl) {
        if (allTxs.length === 0) {
          listEl.innerHTML = `
            <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); font-size: 0.9rem;">
              Chưa có ghi chép chi tiêu nào cho hạng mục này trong tháng ${this.formatMonthDisplay(this.currentMonth)}.
            </div>
          `;
        } else {
          listEl.innerHTML = allTxs.map(t => {
            const acc = accMap.get(t.accountId);
            const accName = acc ? acc.name : 'Ví mặc định';
            const [y, m, d] = (t.date || '').split('-');
            const dateStr = d && m ? `${d}/${m}/${y}` : t.date;
            return `
              <div class="cat-history-item" onclick="if (window.UITransactions) UITransactions.openEditModal(${t.id});" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px solid var(--border-color); cursor: pointer; transition: background 0.15s ease;">
                <div style="min-width: 0; flex: 1; padding-right: 12px;">
                  <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                    ${escapeHTML(t.note || cat.name)}
                  </div>
                  <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 3px;">
                    <span>${dateStr}</span> • <span>${escapeHTML(accName)}</span>
                  </div>
                </div>
                <div style="font-size: 0.95rem; font-weight: 700; color: var(--expense); white-space: nowrap;">
                  -${this.formatMoney(t.amount)}
                </div>
              </div>
            `;
          }).join('');
        }
      }

      if (window.app && typeof window.app.switchView === 'function') {
        window.app.switchView('budget-cat-history');
      }
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error('Error in openCatExpenseHistory:', err);
    }
  },

  closeCatExpenseHistory() {
    if (window.app && typeof window.app.goBack === 'function') {
      window.app.goBack();
    } else if (window.app) {
      window.app.switchView('budgets', true);
    }
  },

  /* ==================== MODAL 6: REBALANCE / COVER OVERSPENT (2 STEPS) ==================== */
  rebalanceTargetCat: null,
  rebalanceSelectedSource: null,
  rebalanceDataCache: null,

  
    /* ==================== AVAIL OPTIONS MODAL (CÂN ĐỐI / CHUYỂN THÁNG SAU) ==================== */
  currentAvailOptionsCatId: null,

  async openAvailOptionsModal(catId) {
    this.currentAvailOptionsCatId = Number(catId);
    const cat = await db.categories.get(Number(catId));
    if (!cat) return;

    const modal = document.getElementById('modal-budget-avail-options');
    const titleEl = document.getElementById('avail-options-title');
    const subtitleEl = document.getElementById('avail-options-subtitle');
    const iconEl = document.getElementById('avail-options-icon');
    const rebalanceTitleEl = document.getElementById('avail-option-rebalance-title');
    const rebalanceDescEl = document.getElementById('avail-option-rebalance-desc');
    const shiftTitleEl = document.getElementById('avail-option-shift-title');
    const shiftDescEl = document.getElementById('avail-option-shift-desc');
    const shiftBadgeEl = document.getElementById('avail-option-shift-badge');

    if (titleEl) titleEl.textContent = cat.name;
    if (iconEl) {
      iconEl.style.background = `${cat.color || '#0d9488'}22`;
      iconEl.style.color = cat.color || '#0d9488';
      iconEl.innerHTML = `<i data-lucide="${cat.icon || 'tag'}"></i>`;
    }

    const currentMonthBudgets = await db.budgets.where('month').equals(this.currentMonth).toArray();
    const b = currentMonthBudgets.find(item => Number(item.categoryId) === Number(catId));
    const budgeted = b ? (b.limitAmount || 0) : 0;
    const isShifted = b && b.shiftToNextMonth === true;

    const spentByCat = this.currentDetailedDataCache?.spentByCat || {};
    const categoryCarryover = this.currentDetailedDataCache?.categoryCarryover || {};
    const spent = spentByCat[catId] || 0;
    const prevCarry = categoryCarryover[String(catId)] || 0;
    const rawAvailable = prevCarry + budgeted - spent;

    if (rawAvailable < 0) {
      const overAmount = Math.abs(rawAvailable);
      if (subtitleEl) {
        subtitleEl.textContent = isShifted
          ? `Chi vượt: -${this.formatMoney(overAmount)} (Đã chuyển sang tháng sau)`
          : `Chi vượt: -${this.formatMoney(overAmount)}`;
        subtitleEl.style.color = isShifted ? '#3b82f6' : 'var(--expense)';
      }
      if (rebalanceTitleEl) rebalanceTitleEl.textContent = 'Cân đối ngân sách';
      if (rebalanceDescEl) rebalanceDescEl.textContent = `Bù đắp khoản chi vượt ${this.formatMoney(overAmount)} từ nguồn khác`;

      if (shiftTitleEl) {
        shiftTitleEl.textContent = isShifted ? 'Đã chuyển sang tháng sau' : 'Chuyển sang tháng sau';
      }
      if (shiftDescEl) {
        shiftDescEl.textContent = isShifted
          ? 'Khoản chi vượt này đang trừ vào danh mục tháng sau. Nhấp để hoàn tác (tính vào ngân sách tháng sau).'
          : 'Trừ khoản chi vượt này vào danh mục tháng sau thay vì tính vào ngân sách tháng sau.';
      }
      if (shiftBadgeEl) {
        shiftBadgeEl.style.display = isShifted ? 'inline-block' : 'none';
        shiftBadgeEl.textContent = 'Đang bật';
        shiftBadgeEl.className = 'badge-shifted';
      }
    } else {
      if (subtitleEl) {
        subtitleEl.textContent = rawAvailable > 0 ? `Còn dư: +${this.formatMoney(rawAvailable)}` : 'Còn lại: 0 ₫';
        subtitleEl.style.color = rawAvailable > 0 ? 'var(--income)' : 'var(--text-muted)';
      }
      if (rebalanceTitleEl) rebalanceTitleEl.textContent = 'Điều chuyển ngân sách';
      if (rebalanceDescEl) rebalanceDescEl.textContent = rawAvailable > 0
        ? `Chuyển bớt số dư ${this.formatMoney(rawAvailable)} sang bù cho hạng mục khác`
        : 'Điều chuyển hoặc nhận thêm ngân sách từ nguồn khác';

      if (shiftTitleEl) shiftTitleEl.textContent = 'Chuyển sang tháng sau';
      if (shiftDescEl) shiftDescEl.textContent = 'Số dư còn dư sẽ tự động được cộng dồn vào danh mục này ở các tháng sau.';
      if (shiftBadgeEl) {
        shiftBadgeEl.style.display = 'inline-block';
        shiftBadgeEl.textContent = 'Tự động';
        shiftBadgeEl.className = 'badge-auto';
      }
    }

    if (modal) modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeAvailOptionsModal() {
    const modal = document.getElementById('modal-budget-avail-options');
    if (modal) modal.classList.remove('open');
  },

  handleAvailOptionRebalance() {
    const catId = this.currentAvailOptionsCatId;
    this.closeAvailOptionsModal();
    if (catId) {
      this.openRebalanceModal(catId);
    }
  },

  async handleAvailOptionShift() {
    const catId = this.currentAvailOptionsCatId;
    this.closeAvailOptionsModal();
    if (catId) {
      await this.toggleShiftOverspentToNextMonth(catId);
    }
  },

  /* ==================== TOGGLE SHIFT OVERSPENT TO NEXT MONTH (Request 6) ==================== */
  async toggleShiftOverspentToNextMonth(catId) {
    try {
      const cat = await db.categories.get(Number(catId));
      const catName = cat ? cat.name : 'hạng mục';

      const currentMonthBudgets = await db.budgets.where('month').equals(this.currentMonth).toArray();
      let b = currentMonthBudgets.find(item => Number(item.categoryId) === Number(catId));

      const now = Date.now();
      const currentShiftState = b ? (b.shiftToNextMonth === true) : false;
      const newShiftState = !currentShiftState;

      if (b) {
        await db.budgets.update(b.id, {
          shiftToNextMonth: newShiftState,
          updatedAt: now
        });
      } else {
        await db.budgets.add({
          categoryId: Number(catId),
          month: this.currentMonth,
          limitAmount: 0,
          shiftToNextMonth: newShiftState,
          updatedAt: now
        });
      }

      const [y, m] = this.currentMonth.split('-').map(Number);
      const nextDate = new Date(y, m, 1);
      const nextMonthStr = `${String(nextDate.getMonth() + 1).padStart(2, '0')}/${nextDate.getFullYear()}`;

      if (newShiftState) {
        showToast(`Đã chuyển chi vượt của "${catName}" sang tháng ${nextMonthStr}`, 'success');
      } else {
        showToast(`Đã hoàn tác: Chi vượt của "${catName}" sẽ được tính vào ngân sách tháng sau`, 'info');
      }

      await this.render();
    } catch (err) {
      console.error('Error in toggleShiftOverspentToNextMonth:', err);
      showToast('Có lỗi xảy ra khi chuyển ngân sách vượt', 'error');
    }
  },

    /* ==================== CÂN ĐỐI NGÂN SÁCH THÁNG (ĐỘC LẬP) ==================== */
  async openToBudgetRebalanceModal() {
    try {
      const allCategories = await db.categories.where('isDeleted').equals(0).toArray();
      const expenseCategories = allCategories.filter(c => c.type === 'expense');

      const rawBudgets = await db.budgets.where('month').equals(this.currentMonth).toArray();
      const budgetMap = new Map();
      let totalBudgeted = 0;
      rawBudgets.forEach(b => {
        if (b.categoryId !== 'TOTAL' && b.categoryId !== 0 && !b.isOverall) {
          budgetMap.set(b.categoryId, b);
          totalBudgeted += (b.limitAmount || 0);
        }
      });

      const spentByCat = this.currentDetailedDataCache?.spentByCat || {};
      const categoryCarryover = this.currentDetailedDataCache?.categoryCarryover || {};
      const toBudget = this.currentDetailedDataCache?.toBudget ?? 0;

      const surplusList = [];
      expenseCategories.forEach(cat => {
        const b = budgetMap.get(cat.id);
        const budgeted = b ? (b.limitAmount || 0) : 0;
        const spent = spentByCat[cat.id] || 0;
        const prevCarry = categoryCarryover[String(cat.id)] || 0;
        const rawAvailable = prevCarry + budgeted - spent;
        const isShifted = b && b.shiftToNextMonth === true;
        const available = (isShifted && rawAvailable < 0) ? 0 : rawAvailable;

        if (available > 0) {
          surplusList.push({ cat, available, surplus: available, budgeted });
        }
      });

      this.rebalanceDataCache = {
        expenseCategories,
        budgetMap,
        categoryCarryover,
        spentByCat,
        surplusList,
        toBudget,
        isToBudgetMode: true
      };

      this.rebalanceTargetCat = 'TO_BUDGET';

      const modal = document.getElementById('modal-budget-rebalance');
      const step1 = document.getElementById('rebalance-step-1');
      const step2 = document.getElementById('rebalance-step-2');
      const backBtn = document.getElementById('rebalance-back-btn');
      const titleEl = document.getElementById('rebalance-step2-title');
      const subtitleEl = document.getElementById('rebalance-step2-subtitle');
      const sourceListEl = document.getElementById('rebalance-step2-source-list');
      const submitBtn = document.getElementById('rebalance-submit-btn');
      const amountInput = document.getElementById('rebalance-amount-input');
      const hintEl = document.getElementById('rebalance-amount-hint');

      if (step1) step1.style.display = 'none';
      if (step2) step2.style.display = 'flex';
      if (backBtn) backBtn.style.display = 'none';

      if (titleEl) titleEl.textContent = 'Cân đối ngân sách tháng';
      const deficit = Math.abs(toBudget);
      if (subtitleEl) {
        subtitleEl.textContent = `Cần bù về 0 ₫: ${this.formatMoney(deficit)}`;
        subtitleEl.style.color = 'var(--expense)';
      }

      if (amountInput) {
        amountInput.value = '';
        amountInput.oninput = (e) => {
          const raw = Number((e.target.value || '').replace(/\D/g, ''));
          e.target.value = raw > 0 ? new Intl.NumberFormat('vi-VN').format(raw) : '';
        };
      }
      if (hintEl) hintEl.textContent = 'Chọn hạng mục có dư để trích tiền về ngân sách tháng';

      let sourcesHtml = '';
      if (surplusList.length === 0) {
        sourcesHtml = `
          <div style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 20px 0;">
            Hiện không có hạng mục nào có số dư để trích về ngân sách tháng.
          </div>
        `;
      } else {
        sourcesHtml = surplusList.map(item => `
          <div class="rebalance-source-item" id="rebalance-source-${item.cat.id}" onclick="UIBudgets.rebalanceSelectSource(${item.cat.id}, ${item.surplus})">
            <div class="rebalance-source-left">
              <div class="rebalance-source-icon" style="background: ${item.cat.color || '#0d9488'}22; color: ${item.cat.color || '#0d9488'};">
                <i data-lucide="${item.cat.icon || 'tag'}"></i>
              </div>
              <div class="rebalance-source-name">${escapeHTML(item.cat.name)}</div>
            </div>
            <div class="rebalance-source-right">
              <span class="rebalance-amount-badge surplus">+${this.formatMoney(item.surplus)}</span>
              <div class="rebalance-radio"></div>
            </div>
          </div>
        `).join('');
      }

      if (sourceListEl) sourceListEl.innerHTML = sourcesHtml;
      if (submitBtn) submitBtn.textContent = 'Cân đối về ngân sách';

      if (modal) modal.classList.add('open');
      if (window.lucide) lucide.createIcons();

      // Auto select first source
      if (surplusList.length > 0) {
        this.rebalanceSelectSource(surplusList[0].cat.id, surplusList[0].surplus);
      }
    } catch (err) {
      console.error('Error in openToBudgetRebalanceModal:', err);
    }
  },

  async openRebalanceModal(targetCatId = null) {
    try {
      const allCategories = await db.categories.where('isDeleted').equals(0).toArray();
      const expenseCategories = allCategories.filter(c => c.type === 'expense');

      const rawBudgets = await db.budgets.where('month').equals(this.currentMonth).toArray();
      const budgetMap = new Map();
      let totalBudgeted = 0;
      rawBudgets.forEach(b => {
        if (b.categoryId !== 'TOTAL' && b.categoryId !== 0 && !b.isOverall) {
          budgetMap.set(b.categoryId, b);
          totalBudgeted += (b.limitAmount || 0);
        }
      });

      const startOfMonth = `${this.currentMonth}-01`;
      const endOfMonth = `${this.currentMonth}-31`;
      const allowedAccountIds = new Set();
      const allAccounts = await db.accounts.toArray();
      allAccounts.forEach(a => {
        const isBudgetEnabled = a.includeInBudget === undefined ? (!a.excludeFromBudget) : a.includeInBudget;
        if (isBudgetEnabled && !a.isArchived) allowedAccountIds.add(a.id);
      });

      const txs = await db.transactions
        .where('date')
        .between(startOfMonth, endOfMonth, true, true)
        .and(t => (!t.isDeleted || t.isDeleted === 0))
        .toArray();

      const allowedTxs = txs.filter(t => allowedAccountIds.has(t.accountId));
      const incomeTxs = allowedTxs.filter(t => t.type === 'income');
      const expenseTxs = allowedTxs.filter(t => t.type === 'expense');

      const totalIncome = incomeTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
      const spentByCat = {};
      for (const t of expenseTxs) {
        if (t.categoryId) {
          spentByCat[t.categoryId] = (spentByCat[t.categoryId] || 0) + (t.amount || 0);
        }
      }

      const rolloverData = await this.calculateDetailedRollover(this.currentMonth, allowedAccountIds);
      const prevToBudget = (rolloverData && rolloverData.prevToBudget) || 0; // can be negative (Request 3)
      const categoryCarryover = (rolloverData && rolloverData.categoryCarryover) || {};

      const toBudget = prevToBudget + totalIncome - totalBudgeted; // can be negative (Request 3)

      // Identify overspent & surplus categories
      const overspentList = [];
      const surplusList = [];

      expenseCategories.forEach(cat => {
        const b = budgetMap.get(cat.id);
        const budgeted = b ? (b.limitAmount || 0) : 0;
        const spent = spentByCat[cat.id] || 0;
        const prevCarry = categoryCarryover[String(cat.id)] || 0;
        const rawAvailable = prevCarry + budgeted - spent;
        const isShifted = b && b.shiftToNextMonth === true;

        const available = (isShifted && rawAvailable < 0) ? 0 : rawAvailable;

        if (available < 0) {
          overspentList.push({ cat, available, deficit: Math.abs(available), budgeted });
        } else if (available > 0) {
          surplusList.push({ cat, available, surplus: available, budgeted });
        }
      });

      // Cache data for navigation between steps
      this.rebalanceDataCache = {
        expenseCategories,
        budgetMap,
        categoryCarryover,
        spentByCat,
        overspentList,
        surplusList,
        toBudget
      };

      const modal = document.getElementById('modal-budget-rebalance');

      // Amount input live vi-VN formatting
      const amountInput = document.getElementById('rebalance-amount-input');
      if (amountInput) {
        amountInput.oninput = (e) => {
          const raw = Number((e.target.value || '').replace(/\D/g, ''));
          e.target.value = raw > 0 ? new Intl.NumberFormat('vi-VN').format(raw) : '';
        };
      }

      if (targetCatId) {
        // Direct jump to Step 2 for chosen category or 'TO_BUDGET'
        this.rebalanceSelectTarget(targetCatId);
      } else {
        // Show Step 1: List of categories needing rebalance
        this.renderRebalanceStep1();
      }

      if (modal) modal.classList.add('open');
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error('Error in openRebalanceModal:', err);
    }
  },

  renderRebalanceStep1() {
    const step1 = document.getElementById('rebalance-step-1');
    const step2 = document.getElementById('rebalance-step-2');
    const listEl = document.getElementById('rebalance-step1-list');

    if (step1) step1.style.display = 'flex';
    if (step2) step2.style.display = 'none';

    if (!listEl || !this.rebalanceDataCache) return;

    const { overspentList, expenseCategories, categoryCarryover, budgetMap, spentByCat, toBudget } = this.rebalanceDataCache;

    let itemsHtml = '';

    

    if (overspentList.length === 0) {
      // If no category is overspent and toBudget >= 0, let user pick any category
      itemsHtml += `
        <div style="font-size: 0.85rem; color: var(--text-muted); padding: 8px 4px; line-height: 1.4;">
          Không có hạng mục nào bị chi vượt trong tháng. Bạn có thể chọn bất kỳ hạng mục nào dưới đây để cấp thêm ngân sách:
        </div>
        ${expenseCategories.map(cat => {
          const prevCarry = categoryCarryover[String(cat.id)] || 0;
          const budgeted = budgetMap.get(cat.id)?.limitAmount || 0;
          const spent = spentByCat[cat.id] || 0;
          const avail = prevCarry + budgeted - spent;
          return `
            <div class="rebalance-cat-item" onclick="UIBudgets.rebalanceSelectTarget(${cat.id})">
              <div class="rebalance-item-left">
                <div class="rebalance-item-icon" style="background: ${cat.color || '#0d9488'}22; color: ${cat.color || '#0d9488'};">
                  <i data-lucide="${cat.icon || 'tag'}"></i>
                </div>
                <div class="rebalance-item-name">${escapeHTML(cat.name)}</div>
              </div>
              <div class="rebalance-item-right">
                <span class="rebalance-amount-badge ${avail > 0 ? 'surplus' : 'zero'}">${avail > 0 ? '+' : ''}${this.formatMoney(avail)}</span>
                <i data-lucide="chevron-right" style="width: 16px; height: 16px; color: var(--text-muted);"></i>
              </div>
            </div>
          `;
        }).join('')}
      `;
    } else {
      if (overspentList.length > 0) {
        itemsHtml += `
          <div style="font-size: 0.82rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin: 6px 0 2px 0;">
            Hạng mục cần bù ngân sách:
          </div>
          ${overspentList.map(item => `
            <div class="rebalance-cat-item" onclick="UIBudgets.rebalanceSelectTarget(${item.cat.id})">
              <div class="rebalance-item-left">
                <div class="rebalance-item-icon" style="background: ${item.cat.color || '#0d9488'}22; color: ${item.cat.color || '#0d9488'};">
                  <i data-lucide="${item.cat.icon || 'tag'}"></i>
                </div>
                <div class="rebalance-item-name">${escapeHTML(item.cat.name)}</div>
              </div>
              <div class="rebalance-item-right">
                <span class="rebalance-amount-badge deficit">Chi vượt: ${this.formatMoney(item.deficit)}</span>
                <i data-lucide="chevron-right" style="width: 16px; height: 16px; color: var(--text-muted);"></i>
              </div>
            </div>
          `).join('')}
        `;
      }
    }

    listEl.innerHTML = itemsHtml;
    if (window.lucide) lucide.createIcons();
  },

  rebalanceGoToStep1() {
    this.renderRebalanceStep1();
  },

  rebalanceSelectTarget(catId) {
    if (!this.rebalanceDataCache) return;

    this.rebalanceTargetCat = Number(catId);
    const { expenseCategories, budgetMap, categoryCarryover, spentByCat, surplusList, toBudget } = this.rebalanceDataCache;

    const cat = expenseCategories.find(c => Number(c.id) === Number(catId));
    if (!cat) return;

    const step1 = document.getElementById('rebalance-step-1');
    const step2 = document.getElementById('rebalance-step-2');
    const titleEl = document.getElementById('rebalance-step2-title');
    const subtitleEl = document.getElementById('rebalance-step2-subtitle');
    const sourceListEl = document.getElementById('rebalance-step2-source-list');
    const submitBtn = document.getElementById('rebalance-submit-btn');
    const backBtn = document.getElementById('rebalance-back-btn');

    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'flex';
    if (backBtn) backBtn.style.display = '';

    const prevCarry = categoryCarryover[String(cat.id)] || 0;
    const budgeted = budgetMap.get(cat.id)?.limitAmount || 0;
    const spent = spentByCat[cat.id] || 0;
    const rawAvailable = prevCarry + budgeted - spent;
    const isShifted = budgetMap.get(cat.id)?.shiftToNextMonth === true;
    const available = (isShifted && rawAvailable < 0) ? 0 : rawAvailable;
    const deficit = available < 0 ? Math.abs(available) : 0;

    if (titleEl) titleEl.textContent = `Bù cho: ${cat.name}`;
    if (subtitleEl) {
      if (deficit > 0) {
        subtitleEl.textContent = `Chi vượt: ${this.formatMoney(deficit)}`;
        subtitleEl.style.color = 'var(--expense)';
      } else {
        subtitleEl.textContent = `Hiện có: ${this.formatMoney(available)}`;
        subtitleEl.style.color = 'var(--text-muted)';
      }
    }

    const validSurplusCats = surplusList.filter(item => Number(item.cat.id) !== Number(catId));

    let sourcesHtml = '';

    // Ngân sách tháng bằng số không hoặc âm thì KHÔNG cho lấy nguồn
    const canUseToBudget = toBudget > 0;

    if (canUseToBudget) {
      sourcesHtml += `
        <div class="rebalance-source-item" id="rebalance-src-TO_BUDGET" onclick="UIBudgets.rebalancePickSource('TO_BUDGET', ${toBudget})">
          <div class="rebalance-item-left">
            <div class="rebalance-item-icon" style="background: rgba(16, 185, 129, 0.15); color: var(--income);">
              <i data-lucide="wallet"></i>
            </div>
            <div class="rebalance-item-name">Ngân sách tháng sẵn sàng</div>
          </div>
          <div class="rebalance-item-right">
            <span class="rebalance-amount-badge surplus">+${this.formatMoney(toBudget)}</span>
          </div>
        </div>
      `;
    }

    // Source 2..N: Danh sách danh mục với số ngân sách còn bên phải
    validSurplusCats.forEach(item => {
      sourcesHtml += `
        <div class="rebalance-source-item" id="rebalance-src-${item.cat.id}" onclick="UIBudgets.rebalancePickSource(${item.cat.id}, ${item.surplus})">
          <div class="rebalance-item-left">
            <div class="rebalance-item-icon" style="background: ${item.cat.color || '#0d9488'}22; color: ${item.cat.color || '#0d9488'};">
              <i data-lucide="${item.cat.icon || 'tag'}"></i>
            </div>
            <div class="rebalance-item-name">${escapeHTML(item.cat.name)}</div>
          </div>
          <div class="rebalance-item-right">
            <span class="rebalance-amount-badge surplus">+${this.formatMoney(item.surplus)}</span>
          </div>
        </div>
      `;
    });

    if (sourcesHtml === '') {
      sourcesHtml = `
        <div style="font-size: 0.85rem; color: var(--expense); padding: 16px 12px; text-align: center; background: rgba(244, 63, 94, 0.08); border-radius: var(--radius-md);">
          Không có nguồn ngân sách nào còn dư để cân đối.
        </div>
      `;
      if (submitBtn) submitBtn.disabled = true;
    } else {
      if (submitBtn) submitBtn.disabled = false;
    }

    if (sourceListEl) sourceListEl.innerHTML = sourcesHtml;

    // Auto-select initial source
    if (canUseToBudget) {
      this.rebalancePickSource('TO_BUDGET', toBudget, deficit);
    } else if (validSurplusCats.length > 0) {
      this.rebalancePickSource(validSurplusCats[0].cat.id, validSurplusCats[0].surplus, deficit);
    } else {
      this.rebalancePickSource(null, 0, deficit);
    }

    if (window.lucide) lucide.createIcons();
  },

  rebalancePickSource(sourceKey, maxAvailable, targetDeficit = null) {
    this.rebalanceSelectedSource = sourceKey;

    // Highlight selected source row
    document.querySelectorAll('.rebalance-source-item').forEach(el => el.classList.remove('selected'));
    if (sourceKey) {
      const selectedEl = document.getElementById(`rebalance-src-${sourceKey}`);
      if (selectedEl) selectedEl.classList.add('selected');
    }

    const amountInput = document.getElementById('rebalance-amount-input');
    const hintEl = document.getElementById('rebalance-amount-hint');

    const { expenseCategories, budgetMap, categoryCarryover, spentByCat, toBudget } = this.rebalanceDataCache || {};
    let deficit = targetDeficit;

    if (deficit === null) {
      if (String(this.rebalanceTargetCat) === 'TO_BUDGET') {
        deficit = toBudget < 0 ? Math.abs(toBudget) : 0;
      } else {
        const cat = (expenseCategories || []).find(c => Number(c.id) === Number(this.rebalanceTargetCat));
        if (cat) {
          const prevCarry = categoryCarryover[String(cat.id)] || 0;
          const budgeted = budgetMap.get(cat.id)?.limitAmount || 0;
          const spent = spentByCat[cat.id] || 0;
          const rawAvailable = prevCarry + budgeted - spent;
          const isShifted = budgetMap.get(cat.id)?.shiftToNextMonth === true;
          const avail = (isShifted && rawAvailable < 0) ? 0 : rawAvailable;
          deficit = avail < 0 ? Math.abs(avail) : 0;
        }
      }
    }

    const suggested = (deficit && deficit > 0) ? (maxAvailable > 0 ? Math.min(deficit, maxAvailable) : deficit) : (maxAvailable > 0 ? maxAvailable : 0);

    if (amountInput) {
      amountInput.value = suggested > 0 ? new Intl.NumberFormat('vi-VN').format(suggested) : '';
    }

    if (hintEl) {
      hintEl.textContent = maxAvailable > 0 ? `Nguồn này có sẵn: ${this.formatMoney(maxAvailable)}` : 'Chưa chọn nguồn hoặc nguồn có 0 ₫';
    }
  },

  closeRebalanceModal() {
    const modal = document.getElementById('modal-budget-rebalance');
    if (modal) modal.classList.remove('open');
  },

  async applyRebalance() {
    try {
      const isTargetToBudget = String(this.rebalanceTargetCat) === 'TO_BUDGET';
      const targetCatId = isTargetToBudget ? 'TO_BUDGET' : Number(this.rebalanceTargetCat);
      const sourceVal = this.rebalanceSelectedSource;
      const amountInput = document.getElementById('rebalance-amount-input');
      const amount = Number((amountInput?.value || '').replace(/\D/g, ''));

      if (!targetCatId) {
        showToast('Vui lòng chọn đối tượng cần cân đối', 'error');
        return;
      }
      if (!sourceVal) {
        showToast('Vui lòng chọn nguồn ngân sách để bù', 'error');
        return;
      }
      if (!amount || amount <= 0) {
        showToast('Vui lòng nhập số tiền cần bù hợp lệ', 'error');
        return;
      }

      if (String(sourceVal) === String(targetCatId)) {
        showToast('Nguồn lấy tiền và đối tượng cần bù không thể trùng nhau', 'error');
        return;
      }

      const now = Date.now();
      const currentMonthBudgets = await db.budgets.where('month').equals(this.currentMonth).toArray();

      // Case 1: Target is TO_BUDGET (Cân đối ngân sách tháng độc lập)
      if (isTargetToBudget) {
        const sourceCatId = Number(sourceVal);
        const sourceCat = await db.categories.get(sourceCatId);
        const sourceCatName = sourceCat ? sourceCat.name : 'hạng mục';

        const sourceSurplus = this.rebalanceDataCache?.surplusList?.find(s => Number(s.cat.id) === sourceCatId)?.surplus || 0;
        if (amount > sourceSurplus) {
          showToast(`Số tiền vượt quá số dư còn lại (${this.formatMoney(sourceSurplus)}) của "${sourceCatName}"`, 'error');
          return;
        }

        const sourceBudget = currentMonthBudgets.find(b => Number(b.categoryId) === sourceCatId);
        const currentSourceLimit = sourceBudget ? (sourceBudget.limitAmount || 0) : 0;
        const newSourceLimit = currentSourceLimit - amount;

        if (sourceBudget) {
          await db.budgets.update(sourceBudget.id, { limitAmount: newSourceLimit, updatedAt: now });
        } else {
          await db.budgets.add({
            categoryId: sourceCatId,
            month: this.currentMonth,
            limitAmount: newSourceLimit,
            updatedAt: now
          });
        }

        showToast(`Đã chuyển ${this.formatMoney(amount)} từ "${sourceCatName}" về ngân sách tháng`, 'success');
        this.closeRebalanceModal();
        if (window.app && typeof window.app.refreshAll === 'function') {
          await window.app.refreshAll();
        } else {
          await this.render();
        }
        return;
      }

      // Case 2: Target is an expense category
      const targetCat = await db.categories.get(targetCatId);
      const targetCatName = targetCat ? targetCat.name : 'hạng mục';

      // Subcase A: Source is TO_BUDGET
      if (sourceVal === 'TO_BUDGET') {
        const toBudget = this.rebalanceDataCache?.toBudget || 0;
        // Request 4: Cannot take from TO_BUDGET if toBudget <= 0
        if (toBudget <= 0) {
          showToast('Ngân sách tháng bằng 0 hoặc âm, không thể lấy làm nguồn bù', 'error');
          return;
        }
        if (amount > toBudget) {
          showToast(`Số tiền vượt quá ngân sách tháng sẵn sàng (${this.formatMoney(toBudget)})`, 'error');
          return;
        }

        const existing = currentMonthBudgets.find(b => Number(b.categoryId) === targetCatId);
        const currentLimit = existing ? (existing.limitAmount || 0) : 0;
        const newLimit = currentLimit + amount;

        if (existing) {
          await db.budgets.update(existing.id, { limitAmount: newLimit, updatedAt: now });
        } else {
          await db.budgets.add({
            categoryId: targetCatId,
            month: this.currentMonth,
            limitAmount: newLimit,
            updatedAt: now
          });
        }

        showToast(`Đã bù thêm ${this.formatMoney(amount)} cho "${targetCatName}"`, 'success');
      } else {
        // Subcase B: Source is another category
        const sourceCatId = Number(sourceVal);
        const sourceCat = await db.categories.get(sourceCatId);
        const sourceCatName = sourceCat ? sourceCat.name : 'hạng mục';

        // Check against actual available surplus (Fix for Request 5!)
        const sourceSurplus = this.rebalanceDataCache?.surplusList?.find(s => Number(s.cat.id) === sourceCatId)?.surplus || 0;
        if (amount > sourceSurplus) {
          showToast(`Số tiền vượt quá số dư còn lại (${this.formatMoney(sourceSurplus)}) của "${sourceCatName}"`, 'error');
          return;
        }

        const sourceBudget = currentMonthBudgets.find(b => Number(b.categoryId) === sourceCatId);
        const targetBudget = currentMonthBudgets.find(b => Number(b.categoryId) === targetCatId);

        const currentSourceLimit = sourceBudget ? (sourceBudget.limitAmount || 0) : 0;
        const currentTargetLimit = targetBudget ? (targetBudget.limitAmount || 0) : 0;

        const newSourceLimit = currentSourceLimit - amount;
        const newTargetLimit = currentTargetLimit + amount;

        if (sourceBudget) {
          await db.budgets.update(sourceBudget.id, { limitAmount: newSourceLimit, updatedAt: now });
        } else {
          await db.budgets.add({
            categoryId: sourceCatId,
            month: this.currentMonth,
            limitAmount: newSourceLimit,
            updatedAt: now
          });
        }

        if (targetBudget) {
          await db.budgets.update(targetBudget.id, { limitAmount: newTargetLimit, updatedAt: now });
        } else {
          await db.budgets.add({
            categoryId: targetCatId,
            month: this.currentMonth,
            limitAmount: newTargetLimit,
            updatedAt: now
          });
        }

        showToast(`Đã chuyển ${this.formatMoney(amount)} từ "${sourceCatName}" sang "${targetCatName}"`, 'success');
      }

      this.closeRebalanceModal();
      if (window.app) {
        await window.app.refreshAll();
      } else {
        await this.render();
      }
    } catch (err) {
      console.error('Error in applyRebalance:', err);
      showToast('Có lỗi xảy ra khi cân đối ngân sách', 'error');
    }
  },

  formatMoney(num) {
    return new Intl.NumberFormat('vi-VN').format(Math.round(num || 0)) + '₫';
  }
};

window.UIBudgets = UIBudgets;
