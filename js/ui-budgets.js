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

    try {
      await db.settings.put({ key: 'budget_mode', value: selectedMode });
      showToast('Đã lưu chế độ ngân sách', 'success');
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
          <div class="actual-to-budget-caption">${captionText}</div>
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
              <span class="actual-cat-name">${escapeHTML(cat.name)}</span>
            </div>
          </td>

          <td style="text-align: right; cursor: pointer;" onclick="UIBudgets.openQuickEditModal(${cat.id})" title="Nhấp để sửa phân bổ">
            <div class="actual-budget-cell ${budgeted > 0 ? 'has-budget' : 'is-zero'} ${budgetedFontClass}" role="button" tabindex="0">
              <span>${budgetedText}</span>
            </div>
          </td>

          <td style="text-align: right;">
            <span class="actual-spent-cell ${spentFontClass}">${spentText}</span>
          </td>

          <td style="text-align: right;">
            <span class="actual-avail-badge ${badgeClass} ${availFontClass}">${availText}</span>
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

    const nameEl = document.getElementById('keypad-budget-cat-name');
    const spentEl = document.getElementById('keypad-budget-cat-spent');
    const bubbleEl = document.getElementById('keypad-budget-cat-bubble');

    if (nameEl) nameEl.textContent = cat.name;
    if (spentEl) spentEl.textContent = `Thực tế đã chi: ${this.formatMoney(spent)}`;
    if (bubbleEl) {
      bubbleEl.style.background = `${cat.color || '#0d9488'}22`;
      bubbleEl.style.color = cat.color || '#0d9488';
      bubbleEl.innerHTML = `<i data-lucide="${cat.icon || 'tag'}"></i>`;
    }

    if (window.UITransactions && typeof window.UITransactions.openKeypad === 'function') {
      window.UITransactions.openKeypad('budget-quick-amount');
    }
    if (window.lucide) lucide.createIcons();
  },

  cancelQuickKeypad() {
    this.quickEditTarget = null;
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
      this.loadMonthBudgets();
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

  formatMoney(num) {
    return new Intl.NumberFormat('vi-VN').format(Math.round(num || 0)) + '₫';
  }
};

window.UIBudgets = UIBudgets;
