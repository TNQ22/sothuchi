/**
 * SỔ THU CHI - UI TRANSACTIONS MODULE
 * Quản lý giao dịch, danh mục nhanh 4 hàng, bàn phím số popup, chi tiết nâng cao & liên kết vay nợ
 */

/**
 * Trả về ngày hiện tại theo múi giờ của thiết bị (YYYY-MM-DD).
 * Không dùng toISOString() vì nó luôn trả về UTC, gây lệch ngày với UTC+7.
 */
function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const UITransactions = {
  userChangedAccount: false,
  userSelectedAccountId: null,
  isEditing: false,
  currentFilterType: 'all',
  filterAccountId: null,
  formInitialized: false,
  searchKeyword: '',
  timeFilterMode: 'month', // 'month' | 'day' | 'custom' | 'all'
  filterMonth: '', // 'YYYY-MM'
  filterDate: '',  // 'YYYY-MM-DD'
  filterCustomStart: '', // 'YYYY-MM-DD'
  filterCustomEnd: '',   // 'YYYY-MM-DD'
  selectedCategory: null,
  activeKeypadInput: null,
  activeKeypadTarget: 'amount', // 'amount' | 'fee'
  currentCatTab: 'expense',
  editingCatId: null,
  _categoriesCache: null,

  /* Đính kèm ảnh hoá đơn & Quét AI */
  attachedImages: [],
  isScanningAI: false,
  isNoteManuallyEdited: false,
  lastAutoNoteValue: '',
  _lastScannedItemsText: '',
  cropState: {
    sourceImg: null,
    targetIndex: -1,
    rotation: 0,
    topPercent: 0,
    bottomPercent: 0,
    leftPercent: 0,
    rightPercent: 0
  },

  async loadCategories(forceReload = false) {
    if (!forceReload && this._categoriesCache && this._categoriesCache.length > 0) {
      return this._categoriesCache;
    }
    try {
      this._categoriesCache = await db.categories.where('isDeleted').equals(0).toArray();
    } catch (e) {
      console.warn('[UITransactions] Lỗi nạp danh mục:', e);
      this._categoriesCache = [];
    }
    return this._categoriesCache;
  },

  invalidateCategoriesCache() {
    this._categoriesCache = null;
  },

  async init() {
    if (this._initialized) return;
    this._initialized = true;
    this.bindEvents();
    await this.loadCategories();
    await this.renderQuickCategories();
  },

  /* ==================== RESET ALL FILTERS ==================== */
  resetAllFilters(autoRender = false) {
    // 1. Reset bộ lọc loại giao dịch về "Tất cả"
    this.currentFilterType = 'all';
    document.querySelectorAll('.tx-filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === 'all');
    });

    // 2. Reset bộ lọc tài khoản về "Tất cả tài khoản"
    this.filterAccountId = null;
    if (typeof this.closeHeaderAccountDropdown === 'function') {
      this.closeHeaderAccountDropdown();
    }
    this.updateHeaderAccountDisplay();

    // 3. Reset tìm kiếm
    const searchBar = document.getElementById('tx-header-search-bar');
    const searchInput = document.getElementById('tx-search-input');
    const timeFilterCard = document.getElementById('tx-time-filter-card');
    const txHeaderCenter = document.getElementById('tx-header-center');
    const txHeaderSearchBtn = document.getElementById('tx-header-search-btn');

    if (searchBar) searchBar.style.display = 'none';
    if (timeFilterCard) timeFilterCard.style.display = 'block';

    const isTxView = window.app && window.app.currentView === 'transactions';
    if (txHeaderCenter) txHeaderCenter.style.display = isTxView ? 'flex' : 'none';
    if (txHeaderSearchBtn) txHeaderSearchBtn.style.display = isTxView ? 'inline-flex' : 'none';

    if (searchInput) searchInput.value = '';
    this.searchKeyword = '';

    // 4. Reset bộ lọc thời gian về Tháng hiện tại
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    this.timeFilterMode = 'month';
    this.filterMonth = `${y}-${m}`;
    this.filterDate = `${y}-${m}-${d}`;
    this.filterCustomStart = `${y}-${m}-01`;
    this.filterCustomEnd = `${y}-${m}-${d}`;

    const navBox = document.getElementById('tx-time-navigator');
    if (navBox) {
      navBox.style.display = 'flex';
    }

    document.querySelectorAll('.tx-time-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === 'month');
    });

    this.updateTimeDisplay();

    if (autoRender) {
      this.render();
    }
  },

  async filterByAccount(accId) {
    this.filterAccountId = (accId && accId !== 'all') ? Number(accId) : null;
    if (window.app && window.app.currentView !== 'transactions') {
      window.app.switchView('transactions');
    }
    await this.updateHeaderAccountDisplay();
    await this.render();
  },

  async clearAccountFilter() {
    this.filterAccountId = null;
    await this.updateHeaderAccountDisplay();
    await this.render();
  },

  /* ==================== HEADER ACCOUNT DROPDOWN (SỔ XUỐNG) ==================== */
  async toggleHeaderAccountDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('tx-header-account-dropdown-menu');
    if (!menu) return;
    const isShown = menu.style.display === 'block' || menu.style.display === 'flex';
    if (isShown) {
      this.closeHeaderAccountDropdown();
    } else {
      await this.renderHeaderAccountDropdownList();
      menu.style.display = 'flex';
    }
  },

  closeHeaderAccountDropdown() {
    const menu = document.getElementById('tx-header-account-dropdown-menu');
    if (menu) menu.style.display = 'none';
  },

  openAccountFilterPicker(e) {
    this.toggleHeaderAccountDropdown(e);
  },

  async renderHeaderAccountDropdownList() {
    const menu = document.getElementById('tx-header-account-dropdown-menu');
    if (!menu) return;

    try {
      const accounts = (await db.accounts.toArray()).filter(a => !a.isDeleted || a.isDeleted === 0);
      accounts.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));
      const active = accounts.filter(a => !a.isArchived);

      const isAllSelected = !this.filterAccountId;

      let html = `
        <div class="tx-header-acc-option ${isAllSelected ? 'active' : ''}" onclick="UITransactions.selectHeaderAccount('')">
          <div class="tx-header-acc-option-left">
            <div class="tx-header-acc-option-icon" style="background: rgba(13, 148, 136, 0.15); color: var(--primary);">
              <i data-lucide="wallet" style="width: 16px; height: 16px;"></i>
            </div>
            <div class="tx-header-acc-option-info" style="align-items: flex-start; text-align: left;">
              <span class="tx-header-acc-option-name" style="text-align: left;">Tất cả tài khoản</span>
              <span class="tx-header-acc-option-balance" style="text-align: left;">Xem toàn bộ giao dịch</span>
            </div>
          </div>
          ${isAllSelected ? '<i data-lucide="check" style="width: 16px; height: 16px; color: var(--primary); flex-shrink: 0;"></i>' : ''}
        </div>
      `;

      for (const acc of active) {
        const isSelected = this.filterAccountId === acc.id;
        const balFormatted = new Intl.NumberFormat('vi-VN').format(acc.balance || 0) + 'đ';
        const balColor = (acc.balance || 0) >= 0 ? 'var(--income)' : 'var(--expense)';
        const isSharedItem = !!acc._isSharedItem;
        const isSharedByMe = !isSharedItem && (acc.isShared === 1 || acc.isShared === true);
        const miniShareIndicator = isSharedItem
          ? `<div class="mini-share-indicator shared" style="position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; color: #fff; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); font-size: 7px;" title="Được chia sẻ"><i data-lucide="share-2" style="width: 7px; height: 7px;"></i></div>`
          : (isSharedByMe ? `<div class="mini-share-indicator owner" style="position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); font-size: 7px;" title="Đang chia sẻ"><i data-lucide="share-2" style="width: 7px; height: 7px;"></i></div>` : '');

        const logoBadge = (window.UIAccounts && typeof window.UIAccounts.renderLogoBadge === 'function')
          ? `<div style="position: relative; display: inline-flex;">${window.UIAccounts.renderLogoBadge(acc, 28)}${miniShareIndicator}</div>`
          : `<div style="position: relative; display: inline-flex;"><div style="width: 28px; height: 28px; border-radius: 7px; background: var(--bg-hover); display: flex; align-items: center; justify-content: center;"><i data-lucide="credit-card" style="width: 16px; height: 16px;"></i></div>${miniShareIndicator}</div>`;

        const shareTag = isSharedItem
          ? ` <span style="font-size: 0.68rem; color: #3b82f6; font-weight: 600; background: rgba(59, 130, 246, 0.12); padding: 1px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;" title="Từ: ${escapeHTML(acc._sharedFrom || 'Thành viên')}"><i data-lucide="share-2" style="width: 8px; height: 8px;"></i> Từ: ${escapeHTML(acc._sharedFrom || 'Thành viên')}</span>`
          : (isSharedByMe ? ` <span style="font-size: 0.68rem; color: #10b981; font-weight: 600; background: rgba(16, 185, 129, 0.12); padding: 1px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;"><i data-lucide="share-2" style="width: 8px; height: 8px;"></i> Đang chia sẻ</span>` : '');

        const subNotes = [];
        if (acc.description && acc.description.trim()) subNotes.push(escapeHTML(acc.description.trim()));
        const subNoteStr = subNotes.length > 0 ? ` • ${subNotes.join(' • ')}` : '';

        html += `
          <div class="tx-header-acc-option ${isSelected ? 'active' : ''}" onclick="UITransactions.selectHeaderAccount(${acc.id})">
            <div class="tx-header-acc-option-left">
              ${logoBadge}
              <div class="tx-header-acc-option-info" style="align-items: flex-start; text-align: left;">
                <span class="tx-header-acc-option-name" style="display: flex; align-items: center; gap: 4px; overflow: hidden; text-align: left;"><span style="white-space: nowrap; overflow: hidden; text-overflow: clip;">${escapeHTML(acc.name)}</span>${shareTag}</span>
                <span class="tx-header-acc-option-balance" style="color: ${balColor}; text-align: left;">Số dư: ${balFormatted}${subNoteStr}</span>
              </div>
            </div>
            ${isSelected ? '<i data-lucide="check" style="width: 16px; height: 16px; color: var(--primary); flex-shrink: 0;"></i>' : ''}
          </div>
        `;
      }

      menu.innerHTML = html;
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error('Error rendering header account dropdown list:', err);
    }
  },

  async selectHeaderAccount(accId) {
    this.closeHeaderAccountDropdown();
    await this.filterByAccount(accId);
  },

  async updateHeaderAccountDisplay() {
    const nameEl = document.getElementById('tx-header-acc-name');
    const iconEl = document.getElementById('tx-header-acc-icon');
    if (!nameEl) return;

    if (!this.filterAccountId) {
      nameEl.textContent = 'Tất cả tài khoản';
      if (iconEl) iconEl.innerHTML = '<i data-lucide="wallet" style="width: 15px; height: 15px;"></i>';
    } else {
      const acc = await db.accounts.get(Number(this.filterAccountId));
      if (acc) {
        nameEl.textContent = acc.name;
        const isSharedItem = !!acc._isSharedItem;
        const isSharedByMe = !isSharedItem && (acc.isShared === 1 || acc.isShared === true);
        const miniShareIndicator = isSharedItem
          ? `<div class="mini-share-indicator shared" style="position: absolute; bottom: -2px; right: -2px; width: 11px; height: 11px; border-radius: 50%; background: #3b82f6; color: #fff; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); font-size: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.3); z-index: 2;" title="Được chia sẻ"><i data-lucide="share-2" style="width: 6.5px; height: 6.5px;"></i></div>`
          : (isSharedByMe ? `<div class="mini-share-indicator owner" style="position: absolute; bottom: -2px; right: -2px; width: 11px; height: 11px; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); font-size: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.3); z-index: 2;" title="Đang chia sẻ"><i data-lucide="share-2" style="width: 6.5px; height: 6.5px;"></i></div>` : '');

        if (iconEl && window.UIAccounts && typeof window.UIAccounts.renderLogoBadge === 'function') {
          iconEl.innerHTML = `<div style="position: relative; display: inline-flex; align-items: center; justify-content: center;">${window.UIAccounts.renderLogoBadge(acc, 20)}${miniShareIndicator}</div>`;
        } else if (iconEl) {
          iconEl.innerHTML = `<div style="position: relative; display: inline-flex; align-items: center; justify-content: center;"><i data-lucide="wallet" style="width: 15px; height: 15px;"></i>${miniShareIndicator}</div>`;
        }
      } else {
        this.filterAccountId = null;
        nameEl.textContent = 'Tất cả tài khoản';
        if (iconEl) iconEl.innerHTML = '<i data-lucide="wallet" style="width: 15px; height: 15px;"></i>';
      }
    }
    if (window.lucide) lucide.createIcons();
  },

  /* ==================== SEARCH BAR CONTROLS ==================== */
  openSearch() {
    this.closeHeaderAccountDropdown();
    const searchBar = document.getElementById('tx-header-search-bar');
    const searchInput = document.getElementById('tx-search-input');
    const timeFilterCard = document.getElementById('tx-time-filter-card');
    const txHeaderCenter = document.getElementById('tx-header-center');
    const txHeaderSearchBtn = document.getElementById('tx-header-search-btn');

    if (searchBar) searchBar.style.display = 'flex';
    if (timeFilterCard) timeFilterCard.style.display = 'none';
    if (txHeaderCenter) txHeaderCenter.style.display = 'none';
    if (txHeaderSearchBtn) txHeaderSearchBtn.style.display = 'none';

    if (searchInput) {
      searchInput.value = this.searchKeyword || '';
      setTimeout(() => {
        searchInput.focus();
        searchInput.select();
      }, 50);
    }
    if (window.lucide) lucide.createIcons();
  },

  clearSearch() {
    const searchInput = document.getElementById('tx-search-input');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    this.searchKeyword = '';
    this.render();
  },

  closeSearch() {
    const searchBar = document.getElementById('tx-header-search-bar');
    const searchInput = document.getElementById('tx-search-input');
    const timeFilterCard = document.getElementById('tx-time-filter-card');
    const txHeaderCenter = document.getElementById('tx-header-center');
    const txHeaderSearchBtn = document.getElementById('tx-header-search-btn');

    if (searchBar) searchBar.style.display = 'none';
    if (timeFilterCard) timeFilterCard.style.display = 'block';

    const isTxView = window.app && window.app.currentView === 'transactions';
    if (txHeaderCenter) txHeaderCenter.style.display = isTxView ? 'flex' : 'none';
    if (txHeaderSearchBtn) txHeaderSearchBtn.style.display = isTxView ? 'inline-flex' : 'none';

    if (searchInput) searchInput.value = '';
    this.searchKeyword = '';
    this.render();
  },

  /* ==================== TIME FILTER (MONTH / DAY / ALL) ==================== */
  initTimeFilter() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    if (!this.filterMonth) this.filterMonth = `${y}-${m}`;
    if (!this.filterDate) this.filterDate = `${y}-${m}-${d}`;
    if (!this.filterCustomStart) this.filterCustomStart = `${y}-${m}-01`;
    if (!this.filterCustomEnd) this.filterCustomEnd = `${y}-${m}-${d}`;
    this.updateTimeDisplay();
  },

  setTimeFilterMode(mode) {
    this.timeFilterMode = mode;
    document.querySelectorAll('.tx-time-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const navBox = document.getElementById('tx-time-navigator');
    if (navBox) {
      navBox.style.display = mode === 'all' ? 'none' : 'flex';
    }

    this.updateTimeDisplay();
    this.render();
  },

  updateTimeDisplay() {
    const labelEl = document.getElementById('tx-time-display-label');
    const prevBtn = document.getElementById('tx-time-prev-btn');
    const nextBtn = document.getElementById('tx-time-next-btn');
    if (!labelEl) return;

    if (this.timeFilterMode === 'month') {
      const [y, m] = this.filterMonth.split('-');
      labelEl.textContent = `Tháng ${parseInt(m, 10)}/${y}`;
      if (prevBtn) prevBtn.style.display = 'inline-flex';
      if (nextBtn) nextBtn.style.display = 'inline-flex';
    } else if (this.timeFilterMode === 'day') {
      labelEl.textContent = this.formatDateLabel(this.filterDate);
      if (prevBtn) prevBtn.style.display = 'inline-flex';
      if (nextBtn) nextBtn.style.display = 'inline-flex';
    } else if (this.timeFilterMode === 'custom') {
      labelEl.textContent = this.formatCustomRangeLabel(this.filterCustomStart, this.filterCustomEnd);
      // Ở chế độ ngày tùy chỉnh: Ẩn 2 nút mũi tên < và > để tránh bấm nhầm nhảy mốc ngày lộn xộn
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
    } else {
      labelEl.textContent = 'Toàn bộ thời gian';
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
    }
    if (window.lucide) lucide.createIcons();
  },

  formatCustomRangeLabel(startStr, endStr) {
    if (!startStr || !endStr) return 'Ngày tuỳ chỉnh';
    const [y1, m1, d1] = startStr.split('-').map(Number);
    const [y2, m2, d2] = endStr.split('-').map(Number);
    const dd1 = String(d1).padStart(2, '0');
    const mm1 = String(m1).padStart(2, '0');
    const dd2 = String(d2).padStart(2, '0');
    const mm2 = String(m2).padStart(2, '0');

    if (startStr === endStr) {
      return `${dd1}/${mm1}/${y1}`;
    }
    if (y1 === y2) {
      return `${dd1}/${mm1} - ${dd2}/${mm2}/${y2}`;
    }
    return `${dd1}/${mm1}/${y1} - ${dd2}/${mm2}/${y2}`;
  },

  prevTimePeriod() {
    if (this.timeFilterMode === 'month') {
      const [y, m] = this.filterMonth.split('-').map(Number);
      const dt = new Date(y, m - 2, 1);
      this.filterMonth = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    } else if (this.timeFilterMode === 'day') {
      const [y, m, d] = this.filterDate.split('-').map(Number);
      const dt = new Date(y, m - 1, d - 1);
      this.filterDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    } else {
      return;
    }
    this.updateTimeDisplay();
    this.render();
  },

  nextTimePeriod() {
    if (this.timeFilterMode === 'month') {
      const [y, m] = this.filterMonth.split('-').map(Number);
      const dt = new Date(y, m, 1);
      this.filterMonth = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    } else if (this.timeFilterMode === 'day') {
      const [y, m, d] = this.filterDate.split('-').map(Number);
      const dt = new Date(y, m - 1, d + 1);
      this.filterDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    } else {
      return;
    }
    this.updateTimeDisplay();
    this.render();
  },

  openTimeFilterPickerModal() {
    if (!window.UICalendar) return;

    let initDate = `${this.filterMonth}-01`;
    if (this.timeFilterMode === 'day') {
      initDate = this.filterDate;
    } else if (this.timeFilterMode === 'custom') {
      initDate = this.filterCustomStart;
    }

    window.UICalendar.open({
      showFilterModes: true,
      filterMode: this.timeFilterMode,
      initialDate: initDate,
      customStartDate: this.filterCustomStart,
      customEndDate: this.filterCustomEnd,
      onSelect: (res) => {
        if (!res) return;
        if (res.mode === 'all') {
          this.timeFilterMode = 'all';
        } else if (res.mode === 'month') {
          this.timeFilterMode = 'month';
          this.filterMonth = res.month || res.value || this.filterMonth;
        } else if (res.mode === 'day' || res.mode === 'date') {
          this.timeFilterMode = 'day';
          this.filterDate = res.date || res.value || this.filterDate;
        } else if (res.mode === 'custom') {
          this.timeFilterMode = 'custom';
          this.filterCustomStart = res.startDate || this.filterCustomStart;
          this.filterCustomEnd = res.endDate || this.filterCustomEnd;
        }
        this.updateTimeDisplay();
        this.render();
      }
    });
  },

  /* ==================== DATE HEADER FORMATTING ==================== */
  // Định dạng ngày tháng: DD/MM/YYYY - Hôm nay; T2; T3…CN
  formatDateLabel(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);

    const dd = String(d).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const yyyy = String(y);
    const formattedDate = `${dd}/${mm}/${yyyy}`;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (dateStr === todayStr) {
      return `${formattedDate} - Hôm nay`;
    }

    const dt = new Date(y, m - 1, d);
    const dayOfWeekIndex = dt.getDay(); // 0 = CN, 1 = T2, 2 = T3, 3 = T4, 4 = T5, 5 = T6, 6 = T7
    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const dayName = dayNames[dayOfWeekIndex] || '';

    return `${formattedDate} - ${dayName}`;
  },

  bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    // Filter pills
    document.querySelectorAll('.tx-filter-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetBtn = e.target.closest('.tx-filter-pill') || e.target;
        document.querySelectorAll('.tx-filter-pill').forEach(b => b.classList.remove('active'));
        targetBtn.classList.add('active');
        this.currentFilterType = targetBtn.dataset.type;
        this.render();
      });
    });

    // Search input
    const searchInput = document.getElementById('tx-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchKeyword = e.target.value.toLowerCase().trim();
        this.render();
      });
    }

    // Fee input dot formatting
    const feeInput = document.getElementById('tx-fee-input');
    if (feeInput) {
      feeInput.addEventListener('input', (e) => {
        const raw = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = raw ? new Intl.NumberFormat('vi-VN').format(Number(raw)) : '';
      });
    }

    // Popup Keypad Button Handlers - Phản hồi tức thì <1ms, gõ nhanh không trễ và không nuốt phím
    this.bindKeypadEvents();

    // Popup Keypad Quick Chips (+10k, +50k, ...)
    const triggerChip = (chip, e) => {
      if (e && e.cancelable) {
        try { e.preventDefault(); } catch (_) {}
      }
      const val = Number(chip.dataset.val);
      this.handleKeypadQuickAdd(val);
      chip.classList.add('pressed');
      setTimeout(() => chip.classList.remove('pressed'), 80);
    };

    document.querySelectorAll('#modal-keypad .keypad-chip').forEach(chip => {
      let pointerHandled = false;

      chip.addEventListener('pointerdown', (e) => {
        pointerHandled = true;
        if (e.cancelable) {
          try { e.preventDefault(); } catch (_) {}
        }
        triggerChip(chip, e);
      }, { passive: false });

      chip.addEventListener('click', (e) => {
        if (e.cancelable) {
          try { e.preventDefault(); } catch (_) {}
        }
        if (pointerHandled) {
          pointerHandled = false;
          return;
        }
        triggerChip(chip, e);
      });
    });

    // Tap on keypad live display to toggle select-all / overwrite state
    const keypadLiveDisplay = document.getElementById('keypad-live-val');
    if (keypadLiveDisplay) {
      keypadLiveDisplay.addEventListener('click', () => {
        const cur = keypadLiveDisplay.textContent.trim();
        const raw = cur.replace(/[^0-9]/g, '');
        if (raw && Number(raw) > 0) {
          this.keypadAutoSelect = !this.keypadAutoSelect;
          keypadLiveDisplay.classList.toggle('is-selected', this.keypadAutoSelect);
        }
      });
    }

    // Close header dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('tx-type-dropdown-menu');
      const btn = document.getElementById('tx-type-dropdown-btn');
      if (menu && menu.style.display === 'block') {
        if (!menu.contains(e.target) && !btn?.contains(e.target)) {
          menu.style.display = 'none';
        }
      }
      // Close header account filter dropdown when clicking outside
      const txAccMenu = document.getElementById('tx-header-account-dropdown-menu');
      const txAccBtn = document.getElementById('tx-header-account-btn');
      if (txAccMenu && txAccMenu.style.display !== 'none') {
        if (!txAccMenu.contains(e.target) && !txAccBtn?.contains(e.target)) {
          this.closeHeaderAccountDropdown();
        }
      }
      // Close account dropdown when clicking outside
      const accMenu = document.getElementById('tx-account-dropdown-menu');
      const accRow = document.getElementById('tx-account-row');
      if (accMenu && accMenu.style.display === 'block') {
        if (!accMenu.contains(e.target) && !accRow?.contains(e.target)) {
          this.closeAccountDropdown();
        }
      }
      // Close to-account dropdown when clicking outside
      const toAccMenu = document.getElementById('tx-to-account-dropdown-menu');
      const toAccRow = document.getElementById('tx-to-account-row');
      if (toAccMenu && toAccMenu.style.display === 'block') {
        if (!toAccMenu.contains(e.target) && !toAccRow?.contains(e.target)) {
          this.closeToAccountDropdown();
        }
      }
    });

    // Transaction form submit
    // LƯU Ý: Chỉ dùng addEventListener, KHÔNG dùng onsubmit attribute trên form
    // để tránh ghi 2 lần khi bấm nút submit
    const txForm = document.getElementById('transaction-form');
    if (txForm) {
      // Xóa onsubmit attribute nếu có (được set trong HTML)
      txForm.removeAttribute('onsubmit');
      txForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        await this.handleFormSubmit();
      });
      txForm.addEventListener('input', () => this.saveDraft());
      txForm.addEventListener('change', () => this.saveDraft());

      const fromSelect = document.getElementById('tx-account-select');
      if (fromSelect) {
        fromSelect.addEventListener('change', (e) => {
          if (!this.isEditing) {
            this.userChangedAccount = true;
            this.userSelectedAccountId = e.target.value;
          }
        });
      }

      const noteInput = document.getElementById('tx-note-input');
      if (noteInput) {
        noteInput.addEventListener('input', () => {
          this.autoResizeNoteInput();
          this.hideNoteProtectedAlert();
          const val = noteInput.value.trim();
          if (val === '') {
            this.isNoteManuallyEdited = false;
          } else if (val !== (this.lastAutoNoteValue || '').trim()) {
            this.isNoteManuallyEdited = true;
          }
        });
        noteInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            // Cho phép Enter xuống dòng tự nhiên, ngăn chặn submit form
            e.stopPropagation();
          }
        });
      }
    }

    window.addEventListener('beforeunload', () => {
      if (window.UITransactions) window.UITransactions.saveDraft();
    });
  },

  autoResizeNoteInput() {
    const el = document.getElementById('tx-note-input');
    if (!el) return;
    el.style.height = 'auto';
    const newH = Math.max(28, el.scrollHeight);
    el.style.height = (newH > 180 ? 180 : newH) + 'px';
    el.style.overflowY = el.scrollHeight > 180 ? 'auto' : 'hidden';
  },

  showNoteProtectedAlert() {
    const el = document.getElementById('tx-note-protected-alert');
    if (el) {
      el.style.display = 'flex';
      if (window.lucide) lucide.createIcons();
    }
    const noteInput = document.getElementById('tx-note-input');
    if (noteInput) {
      noteInput.classList.add('is-protected-note');
      try {
        noteInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (_) {}
    }
  },

  hideNoteProtectedAlert() {
    const el = document.getElementById('tx-note-protected-alert');
    if (el) el.style.display = 'none';
    const noteInput = document.getElementById('tx-note-input');
    if (noteInput) noteInput.classList.remove('is-protected-note');
  },

  forceOverwriteScannedNote(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (this._lastScannedItemsText) {
      const noteInput = document.getElementById('tx-note-input');
      if (noteInput) {
        noteInput.value = this._lastScannedItemsText;
        this.lastAutoNoteValue = noteInput.value;
        this.isNoteManuallyEdited = false;
        this.autoResizeNoteInput();
        this.hideNoteProtectedAlert();
        showToast('✓ Đã ghi đè danh sách món từ OCR vào ghi chú', 'success');
      }
    }
  },

  /* ==================== POPUP NUMERIC KEYPAD ==================== */
  openKeypad(target = 'amount') {
    this.activeKeypadTarget = target;
    const modal = document.getElementById('modal-keypad');
    const display = document.getElementById('keypad-live-val');
    if (!modal) return;

    let cur = '0';
    const curSymbolEl = document.querySelector('#modal-keypad .keypad-live-cur');
    if (target === 'fee') {
      const feeInput = document.getElementById('tx-fee-input');
      const feeDisplay = document.getElementById('tx-fee-display');
      cur = feeInput?.value?.trim() || feeDisplay?.textContent?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = '₫';
    } else if (target === 'account-balance') {
      const accBalInput = document.getElementById('acc-balance-input');
      const accBalText = document.getElementById('acc-balance-text');
      cur = accBalText?.textContent?.trim() || accBalInput?.value?.trim() || '0';
      const curSymbol = document.getElementById('acc-currency-symbol')?.textContent?.trim() || 'đ';
      if (curSymbolEl) curSymbolEl.textContent = curSymbol;
    } else if (target === 'saving-amount') {
      const savingInput = document.getElementById('saving-amount-input');
      const savingText = document.getElementById('saving-amount-text');
      cur = savingText?.textContent?.trim() || savingInput?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = 'đ';
    } else if (target === 'loan-amount') {
      const loanInput = document.getElementById('loan-amount-input');
      const loanText = document.getElementById('loan-amount-text');
      cur = loanText?.textContent?.trim() || loanInput?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = 'đ';
    } else if (target === 'pay-loan-amount') {
      const pInput = document.getElementById('pay-loan-amount-input');
      const pText = document.getElementById('pay-loan-amount-text');
      cur = pText?.textContent?.trim() || pInput?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = 'đ';
    } else if (target === 'acc-target-amount') {
      const targetInput = document.getElementById('acc-target-amount-input');
      const targetText = document.getElementById('acc-target-amount-text');
      cur = targetText?.textContent?.trim() || targetInput?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = 'đ';
    } else if (target === 'asset-price') {
      const assetInput = document.getElementById('asset-price-input');
      const assetText = document.getElementById('asset-price-text');
      cur = assetText?.textContent?.trim() || assetInput?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = 'đ';
    } else if (target === 'acc-current-amount') {
      const input = document.getElementById('acc-current-amount-input');
      const text = document.getElementById('acc-current-amount-text');
      cur = text?.textContent?.trim() || input?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = 'đ';
    } else if (target === 'acc-recurring-amount') {
      const input = document.getElementById('acc-recurring-amount-input');
      const text = document.getElementById('acc-recurring-amount-text');
      cur = text?.textContent?.trim() || input?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = 'đ';
    } else if (target === 'asset-quantity') {
      const input = document.getElementById('asset-quantity-input');
      const text = document.getElementById('asset-quantity-text');
      cur = text?.textContent?.trim() || input?.value?.trim() || '0';
      const unitVal = (document.getElementById('asset-unit-select')?.value !== 'CUSTOM' ? document.getElementById('asset-unit-select')?.value : document.getElementById('asset-unit-input')?.value) || '';
      if (curSymbolEl) curSymbolEl.textContent = unitVal;
    } else if (target === 'asset-buyprice') {
      const input = document.getElementById('asset-buyprice-input');
      const text = document.getElementById('asset-buyprice-text');
      cur = text?.textContent?.trim() || input?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = 'đ';
    } else if (target === 'asset-currentprice') {
      const input = document.getElementById('asset-currentprice-input');
      const text = document.getElementById('asset-currentprice-text');
      cur = text?.textContent?.trim() || input?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = 'đ';
    } else if (target === 'asset-extracosts') {
      const input = document.getElementById('asset-extracosts-input');
      const text = document.getElementById('asset-extracosts-text');
      cur = text?.textContent?.trim() || input?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = 'đ';
    } else if (target === 'settle-saving-amount') {
      const input = document.getElementById('settle-saving-amount-input');
      const text = document.getElementById('settle-saving-amount-text');
      cur = text?.textContent?.trim() || input?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = 'đ';
    } else if (target === 'deposit-acc-amount') {
      const input = document.getElementById('deposit-acc-amount-input');
      const text = document.getElementById('deposit-acc-amount-text');
      cur = text?.textContent?.trim() || input?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = 'đ';
    } else if (target === 'liquidate-asset-price') {
      const input = document.getElementById('liquidate-asset-price-input');
      const text = document.getElementById('liquidate-asset-price-text');
      cur = text?.textContent?.trim() || input?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = 'đ';
    } else if (target === 'budget-form-amount') {
      const input = document.getElementById('budget-form-amount');
      cur = input?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = '₫';
    } else if (target === 'budget-cat-form-amount') {
      const input = document.getElementById('budget-cat-form-amount');
      cur = input?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = '₫';
    } else if (target === 'budget-overall-amount') {
      const input = document.getElementById('budget-overall-amount');
      cur = input?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = '₫';
    } else if (target === 'budget-lock-amount') {
      const input = document.getElementById('budget-lock-amount');
      cur = input?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = '₫';
    } else if (target === 'budget-cat-amount') {
      const input = document.getElementById('budget-cat-amount');
      cur = input?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = '₫';
    } else if (target === 'rebalance-amount') {
      const input = document.getElementById('rebalance-amount-input');
      cur = input?.value?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = '₫';
    } else if (target === 'budget-quick-amount') {
      const bPanel = document.getElementById('keypad-budget-quick-panel');
      const qRow = document.querySelector('#modal-keypad .keypad-quick-row');
      const hClose = document.querySelector('#modal-keypad .keypad-header-close-btn');
      if (bPanel) bPanel.style.display = 'flex';
      if (qRow) qRow.style.display = 'none';
      if (hClose) hClose.style.display = 'none';
      if (window.UIBudgets && window.UIBudgets.quickEditTarget) {
        const curAmt = window.UIBudgets.quickEditTarget.currentAmount || 0;
        cur = curAmt > 0 ? new Intl.NumberFormat('vi-VN').format(curAmt) : '0';
      } else {
        cur = '0';
      }
      if (curSymbolEl) curSymbolEl.textContent = '₫';
    } else if (target === 'tpl-amount') {
      const bPanel = document.getElementById('keypad-budget-quick-panel');
      const qRow = document.querySelector('#modal-keypad .keypad-quick-row');
      const hClose = document.querySelector('#modal-keypad .keypad-header-close-btn');
      if (bPanel) bPanel.style.display = 'none';
      if (qRow) qRow.style.display = 'none';
      if (hClose) hClose.style.display = 'flex';
      const input = document.getElementById('tpl-page-amount-input');
      const amountText = document.getElementById('tpl-page-amount-display');
      cur = input?.value?.trim() || amountText?.textContent?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = '₫';
    } else {
      const bPanel = document.getElementById('keypad-budget-quick-panel');
      const qRow = document.querySelector('#modal-keypad .keypad-quick-row');
      const hClose = document.querySelector('#modal-keypad .keypad-header-close-btn');
      if (bPanel) bPanel.style.display = 'none';
      if (qRow) qRow.style.display = 'none';
      if (hClose) hClose.style.display = 'flex';
      const input = document.getElementById('tx-amount-input');
      const amountText = document.getElementById('tx-amount-text');
      cur = input?.value?.trim() || amountText?.textContent?.trim() || '0';
      if (curSymbolEl) curSymbolEl.textContent = '₫';
    }

    const btnTemplates = document.getElementById('btn-keypad-templates');
    const keypadModeActions = document.getElementById('keypad-mode-actions');
    if (target === 'amount') {
      if (btnTemplates) btnTemplates.style.display = 'inline-flex';
      if (keypadModeActions) keypadModeActions.style.display = 'inline-flex';
    } else {
      if (btnTemplates) btnTemplates.style.display = 'none';
      if (keypadModeActions) keypadModeActions.style.display = 'none';
    }
    this.toggleKeypadTemplates(false);
    this.bindKeypadEvents();

    if (display) {
      display.textContent = cur || '0';
      // Tự động bôi đen (chọn toàn bộ) số liệu cũ nếu khác 0 để người dùng gõ phím mới sẽ ghi đè ngay
      const rawNum = cur.replace(/[^0-9]/g, '');
      if (rawNum && Number(rawNum) > 0) {
        this.keypadAutoSelect = true;
        display.classList.add('is-selected');
      } else {
        this.keypadAutoSelect = false;
        display.classList.remove('is-selected');
      }
    }

    modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeKeypad(skipSave = false) {
    const modal = document.getElementById('modal-keypad');
    const display = document.getElementById('keypad-live-val');
    if (!modal) return;

    if (!skipSave && this.activeKeypadTarget === 'budget-quick-amount') {
      if (window.UIBudgets && typeof window.UIBudgets.handleQuickEditSubmit === 'function') {
        window.UIBudgets.handleQuickEditSubmit();
        return;
      }
    }

    const bPanel = document.getElementById('keypad-budget-quick-panel');
    const qRow = document.querySelector('#modal-keypad .keypad-quick-row');
    const hClose = document.querySelector('#modal-keypad .keypad-header-close-btn');
    if (bPanel) bPanel.style.display = 'none';
    if (qRow) qRow.style.display = 'flex';
    if (hClose) hClose.style.display = 'flex';

    // Ghi nhận thời điểm đóng bàn phím để chặn form tự động lưu do click xuyên thấu
    this._keypadClosedTime = Date.now();
    this.toggleKeypadTemplates(false);

    // Ngăn chặn triệt để ghost click / click xuyên thấu làm nhảy lung tung hoặc kích hoạt nút bên dưới
    let blocker = document.getElementById('keypad-touch-guard');
    if (!blocker) {
      blocker = document.createElement('div');
      blocker.id = 'keypad-touch-guard';
      blocker.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999999;background:transparent;cursor:default;touch-action:none;pointer-events:all;';
      const swallow = (e) => {
        try {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        } catch (_) {}
      };
      ['click', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'].forEach(evt => {
        blocker.addEventListener(evt, swallow, { capture: true, passive: false });
      });
      document.body.appendChild(blocker);
    }
    setTimeout(() => {
      const b = document.getElementById('keypad-touch-guard');
      if (b && b.parentNode) b.remove();
    }, 450);

    if (display) {
      display.classList.remove('is-selected');
    }
    this.keypadAutoSelect = false;

    let valStr = display ? display.textContent.trim() : '0';
    const evaluated = this.evaluateAmountExpression(valStr);
    let finalFormatted = '0';

    if (this.activeKeypadTarget === 'asset-quantity') {
      let numVal = 0;
      if (evaluated !== null && evaluated > 0) {
        numVal = evaluated;
      } else {
        const rawDec = valStr.replace(/\./g, '').replace(',', '.');
        numVal = Number(rawDec) || 0;
      }
      finalFormatted = numVal > 0 ? (Number.isInteger(numVal) ? new Intl.NumberFormat('vi-VN').format(numVal) : String(numVal).replace('.', ',')) : '0';
    } else {
      if (evaluated !== null && evaluated > 0) {
        finalFormatted = new Intl.NumberFormat('vi-VN').format(evaluated);
      } else {
        const raw = valStr.replace(/[^0-9]/g, '');
        finalFormatted = raw && Number(raw) > 0 ? new Intl.NumberFormat('vi-VN').format(Number(raw)) : '0';
      }
    }

    if (this.activeKeypadTarget === 'fee') {
      const feeInput = document.getElementById('tx-fee-input');
      const feeDisplay = document.getElementById('tx-fee-display');
      if (feeInput) feeInput.value = finalFormatted;
      if (feeDisplay) feeDisplay.textContent = finalFormatted;
    } else if (this.activeKeypadTarget === 'account-balance') {
      const accBalInput = document.getElementById('acc-balance-input');
      const accBalText = document.getElementById('acc-balance-text');
      const rawNum = finalFormatted.replace(/\./g, '');
      if (accBalInput) accBalInput.value = rawNum;
      if (accBalText) accBalText.textContent = finalFormatted;
    } else if (this.activeKeypadTarget === 'saving-amount') {
      const savingInput = document.getElementById('saving-amount-input');
      const savingText = document.getElementById('saving-amount-text');
      const rawNum = finalFormatted.replace(/\./g, '');
      if (savingInput) savingInput.value = rawNum;
      if (savingText) savingText.textContent = finalFormatted;
      if (window.UIAccounts && typeof window.UIAccounts.calcSavingsPreview === 'function') {
        window.UIAccounts.calcSavingsPreview();
      }
    } else if (this.activeKeypadTarget === 'loan-amount') {
      const loanInput = document.getElementById('loan-amount-input');
      const loanText = document.getElementById('loan-amount-text');
      const rawNum = finalFormatted.replace(/\./g, '');
      if (loanInput) loanInput.value = rawNum;
      if (loanText) loanText.textContent = finalFormatted;
      if (window.UIAccounts && typeof window.UIAccounts.calcLoanPreview === 'function') {
        window.UIAccounts.calcLoanPreview();
      }
    } else if (this.activeKeypadTarget === 'pay-loan-amount') {
      const pInput = document.getElementById('pay-loan-amount-input');
      const pText = document.getElementById('pay-loan-amount-text');
      const rawNum = finalFormatted.replace(/\./g, '');
      if (pInput) pInput.value = rawNum;
      if (pText) pText.textContent = finalFormatted;
    } else if (this.activeKeypadTarget === 'acc-target-amount') {
      const targetInput = document.getElementById('acc-target-amount-input');
      const targetText = document.getElementById('acc-target-amount-text');
      const rawNum = finalFormatted.replace(/\./g, '');
      if (targetInput) targetInput.value = rawNum;
      if (targetText) targetText.textContent = finalFormatted;
    } else if (this.activeKeypadTarget === 'asset-price') {
      const assetInput = document.getElementById('asset-price-input');
      const assetText = document.getElementById('asset-price-text');
      const curPriceInput = document.getElementById('asset-currentprice-input');
      const rawNum = finalFormatted.replace(/\./g, '');
      if (assetInput) assetInput.value = rawNum;
      if (assetText) assetText.textContent = finalFormatted;
      if (curPriceInput) curPriceInput.value = rawNum;
      if (window.UIAccounts && typeof window.UIAccounts.calcAssetPreview === 'function') {
        window.UIAccounts.calcAssetPreview();
      }
    } else if (this.activeKeypadTarget === 'acc-current-amount') {
      const input = document.getElementById('acc-current-amount-input');
      const text = document.getElementById('acc-current-amount-text');
      const rawNum = finalFormatted.replace(/\./g, '');
      if (input) input.value = rawNum;
      if (text) text.textContent = finalFormatted;
    } else if (this.activeKeypadTarget === 'acc-recurring-amount') {
      const input = document.getElementById('acc-recurring-amount-input');
      const text = document.getElementById('acc-recurring-amount-text');
      const rawNum = finalFormatted.replace(/\./g, '');
      if (input) input.value = rawNum;
      if (text) text.textContent = finalFormatted;
    } else if (this.activeKeypadTarget === 'asset-quantity') {
      const input = document.getElementById('asset-quantity-input');
      const text = document.getElementById('asset-quantity-text');
      const rawDec = finalFormatted.replace(/\./g, '').replace(',', '.');
      if (input) input.value = rawDec;
      if (text) text.textContent = finalFormatted;
      if (window.UIAccounts && typeof window.UIAccounts.calcAssetPreview === 'function') {
        window.UIAccounts.calcAssetPreview();
      }
    } else if (this.activeKeypadTarget === 'asset-buyprice') {
      const input = document.getElementById('asset-buyprice-input');
      const text = document.getElementById('asset-buyprice-text');
      const rawNum = finalFormatted.replace(/\./g, '');
      if (input) input.value = rawNum;
      if (text) text.textContent = finalFormatted;
      if (Number(rawNum) > 0) {
        const giftInput = document.getElementById('asset-is-gift-input');
        if (giftInput && giftInput.checked) {
          giftInput.checked = false;
          if (window.UIAccounts && typeof window.UIAccounts.handleAssetGiftToggle === 'function') {
            window.UIAccounts.handleAssetGiftToggle(false);
          }
        }
      }
      if (window.UIAccounts && typeof window.UIAccounts.calcAssetPreview === 'function') {
        window.UIAccounts.calcAssetPreview();
      }
    } else if (this.activeKeypadTarget === 'asset-currentprice') {
      const input = document.getElementById('asset-currentprice-input');
      const text = document.getElementById('asset-currentprice-text');
      const rawNum = finalFormatted.replace(/\./g, '');
      if (input) input.value = rawNum;
      if (text) text.textContent = finalFormatted;
      if (window.UIAccounts && typeof window.UIAccounts.calcAssetPreview === 'function') {
        window.UIAccounts.calcAssetPreview();
      }
    } else if (this.activeKeypadTarget === 'asset-extracosts') {
      const input = document.getElementById('asset-extracosts-input');
      const text = document.getElementById('asset-extracosts-text');
      const rawNum = finalFormatted.replace(/\./g, '');
      if (input) input.value = rawNum;
      if (text) text.textContent = finalFormatted;
      if (window.UIAccounts && typeof window.UIAccounts.calcAssetPreview === 'function') {
        window.UIAccounts.calcAssetPreview();
      }
    } else if (this.activeKeypadTarget === 'settle-saving-amount') {
      const input = document.getElementById('settle-saving-amount-input');
      const text = document.getElementById('settle-saving-amount-text');
      const rawNum = finalFormatted.replace(/\./g, '');
      if (input) input.value = rawNum;
      if (text) text.textContent = finalFormatted;
    } else if (this.activeKeypadTarget === 'deposit-acc-amount') {
      const input = document.getElementById('deposit-acc-amount-input');
      const text = document.getElementById('deposit-acc-amount-text');
      const rawNum = finalFormatted.replace(/\./g, '');
      if (input) input.value = rawNum;
      if (text) text.textContent = finalFormatted;
    } else if (this.activeKeypadTarget === 'liquidate-asset-price') {
      const input = document.getElementById('liquidate-asset-price-input');
      const text = document.getElementById('liquidate-asset-price-text');
      const rawNum = finalFormatted.replace(/\./g, '');
      if (input) input.value = rawNum;
      if (text) text.textContent = finalFormatted;
    } else if (this.activeKeypadTarget === 'budget-form-amount') {
      const input = document.getElementById('budget-form-amount');
      if (input) input.value = finalFormatted;
    } else if (this.activeKeypadTarget === 'budget-cat-form-amount') {
      const input = document.getElementById('budget-cat-form-amount');
      if (input) input.value = finalFormatted;
    } else if (this.activeKeypadTarget === 'budget-overall-amount') {
      const input = document.getElementById('budget-overall-amount');
      if (input) input.value = finalFormatted;
    } else if (this.activeKeypadTarget === 'budget-lock-amount') {
      const input = document.getElementById('budget-lock-amount');
      if (input) input.value = finalFormatted;
    } else if (this.activeKeypadTarget === 'budget-cat-amount') {
      const input = document.getElementById('budget-cat-amount');
      if (input) input.value = finalFormatted;
    } else if (this.activeKeypadTarget === 'rebalance-amount') {
      const input = document.getElementById('rebalance-amount-input');
      if (input) {
        input.value = finalFormatted;
        try {
          input.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (_) {}
      }
    } else if (this.activeKeypadTarget === 'budget-quick-amount') {
      const input = document.getElementById('budget-quick-amount-input');
      if (input) input.value = finalFormatted;
    } else if (this.activeKeypadTarget === 'tpl-amount') {
      const input = document.getElementById('tpl-page-amount-input');
      const amountText = document.getElementById('tpl-page-amount-display');
      const rawNum = finalFormatted.replace(/\./g, '');
      if (input) input.value = rawNum;
      if (amountText) amountText.textContent = finalFormatted;
    } else {
      const input = document.getElementById('tx-amount-input');
      const amountText = document.getElementById('tx-amount-text');
      if (input) input.value = finalFormatted;
      if (amountText) amountText.textContent = finalFormatted;
    }

    modal.classList.remove('open');
    const nonTxTargets = [
      'account-balance', 'saving-amount', 'loan-amount', 'pay-loan-amount', 'acc-target-amount', 'asset-price', 'asset-quantity',
      'acc-current-amount', 'acc-recurring-amount',
      'asset-buyprice', 'asset-currentprice', 'asset-extracosts',
      'settle-saving-amount', 'deposit-acc-amount', 'liquidate-asset-price', 'budget-form-amount', 'budget-overall-amount', 'budget-lock-amount', 'budget-cat-amount', 'rebalance-amount', 'budget-quick-amount', 'tpl-amount'
    ];
    if (!nonTxTargets.includes(this.activeKeypadTarget)) {
      this.saveDraft();
    }
  },

  /* ==================== HEADER TYPE DROPDOWN ==================== */
  toggleTypeDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('tx-type-dropdown-menu');
    if (!menu) return;
    const isShown = menu.style.display === 'block';
    menu.style.display = isShown ? 'none' : 'block';
  },

  closeTypeDropdown() {
    const menu = document.getElementById('tx-type-dropdown-menu');
    if (menu) menu.style.display = 'none';
  },

  updateHeaderTypeDisplay(type) {
    const config = {
      expense: { label: 'Chi tiền', icon: 'arrow-down-circle', color: '#f43f5e' },
      income: { label: 'Thu tiền', icon: 'arrow-up-circle', color: '#10b981' },
      lend: { label: 'Cho vay', icon: 'arrow-up-right', color: '#3b82f6' },
      borrow: { label: 'Đi vay', icon: 'arrow-down-left', color: '#f59e0b' },
      adjust: { label: 'Điều chỉnh số dư', icon: 'scale', color: '#a855f7' },
      transfer: { label: 'Chuyển khoản', icon: 'arrow-right-left', color: '#0ea5e9' }
    }[type] || { label: 'Chi tiền', icon: 'arrow-down-circle', color: '#f43f5e' };

    const labelEl = document.getElementById('tx-type-current-label');
    const iconEl = document.getElementById('tx-type-current-icon');
    if (labelEl) labelEl.textContent = config.label;
    if (iconEl) {
      iconEl.innerHTML = `<i data-lucide="${config.icon}" style="width: 16px; height: 16px; color: ${config.color};"></i>`;
      if (window.lucide) lucide.createIcons();
    }

    document.querySelectorAll('.tx-type-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.type === type);
    });
  },

  bindKeypadEvents() {
    const triggerKey = (btn, e) => {
      if (e && e.cancelable) {
        try { e.preventDefault(); } catch (_) {}
      }
      const key = btn.dataset.key;
      this.handleKeypadKey(key);
      btn.classList.add('pressed');
      setTimeout(() => btn.classList.remove('pressed'), 70);
    };

    document.querySelectorAll('#modal-keypad .keypad-btn').forEach(btn => {
      if (btn._keypadBound) return;
      btn._keypadBound = true;
      let pointerHandled = false;
      const isDone = btn.dataset.key === 'done';

      if (isDone) {
        let isDonePressed = false;
        btn.addEventListener('pointerdown', (e) => {
          pointerHandled = true;
          isDonePressed = true;
          btn.classList.add('pressed');
          if (e.cancelable) {
            try { e.preventDefault(); } catch (_) {}
          }
        }, { passive: false });

        btn.addEventListener('pointerup', (e) => {
          btn.classList.remove('pressed');
          if (isDonePressed) {
            isDonePressed = false;
            if (e.cancelable) {
              try { e.preventDefault(); } catch (_) {}
            }
            triggerKey(btn, e);
          }
        }, { passive: false });

        btn.addEventListener('pointercancel', () => {
          isDonePressed = false;
          btn.classList.remove('pressed');
        });

        btn.addEventListener('click', (e) => {
          if (e.cancelable) {
            try { e.preventDefault(); } catch (_) {}
          }
          if (pointerHandled) {
            pointerHandled = false;
            return;
          }
          triggerKey(btn, e);
        });
      } else {
        btn.addEventListener('pointerdown', (e) => {
          pointerHandled = true;
          if (e.cancelable) {
            try { e.preventDefault(); } catch (_) {}
          }
          triggerKey(btn, e);
        }, { passive: false });

        btn.addEventListener('click', (e) => {
          if (e.cancelable) {
            try { e.preventDefault(); } catch (_) {}
          }
          if (pointerHandled) {
            pointerHandled = false;
            return;
          }
          triggerKey(btn, e);
        });
      }
    });
  },

  handleKeypadKey(key) {
    const display = document.getElementById('keypad-live-val');
    if (!display) return;

    const isOperator = (k) => ['+', '-', '*', 'x', '/', '÷'].includes(k);
    const getOpChar = (k) => (k === '*' || k === 'x') ? 'x' : (k === '/' || k === '÷') ? '÷' : k;

    // Xử lý khi số liệu đang ở trạng thái bôi đen (chọn toàn bộ để ghi đè)
    if (this.keypadAutoSelect) {
      this.keypadAutoSelect = false;
      display.classList.remove('is-selected');

      if (key === 'clear' || key === 'backspace') {
        display.textContent = '0';
        return;
      } else if (isOperator(key)) {
        const cur = display.textContent.trim();
        const op = getOpChar(key);
        if (cur && cur !== '0') {
          display.textContent = cur + ' ' + op + ' ';
        }
        return;
      } else if (key === 'done') {
        this.closeKeypad();
        return;
      } else if (key === ',' || key === '.') {
        display.textContent = '0,';
        return;
      } else {
        // Gõ số mới: ghi đè hoàn toàn giá trị cũ
        const raw = key.replace(/^0+/, '');
        display.textContent = raw ? new Intl.NumberFormat('vi-VN').format(Number(raw)) : '0';
        return;
      }
    }

    let cur = display.textContent.trimStart();

    if (key === 'clear') {
      display.textContent = '0';
      return;
    }

    if (key === 'done') {
      this.closeKeypad();
      return;
    }

    if (key === 'backspace') {
      if (!cur || cur === '0') {
        display.textContent = '0';
        return;
      }
      // Nếu đuôi đang là toán tử và khoảng trắng, ví dụ " + ", " - ", " x ", " ÷ "
      if (/\s[+\-x÷*\/]\s$/.test(cur)) {
        display.textContent = cur.slice(0, -3).trim() || '0';
        return;
      }
      // Xóa 1 ký tự cuối
      let next = cur.slice(0, -1).trim();
      if (!next || next === '') {
        display.textContent = '0';
        return;
      }
      // Nếu là số thuần không có toán tử thì format lại số
      if (/^[0-9.]*$/.test(next)) {
        const raw = next.replace(/\./g, '');
        display.textContent = raw ? new Intl.NumberFormat('vi-VN').format(Number(raw)) : '0';
      } else {
        display.textContent = next;
      }
      return;
    }

    // Toán tử +, -, x, ÷
    if (isOperator(key)) {
      const op = getOpChar(key);
      if (!cur || cur === '0') {
        if (key === '-') {
          display.textContent = '-';
        }
        return;
      }
      // Nếu đã có toán tử ở cuối -> thay thế bằng toán tử mới
      if (/\s[+\-x÷*\/]\s?$/.test(cur)) {
        display.textContent = cur.replace(/\s[+\-x÷*\/]\s?$/, ' ' + op + ' ');
      } else {
        display.textContent = cur + ' ' + op + ' ';
      }
      return;
    }

    // Dấu phẩy thập phân
    if (key === ',' || key === '.') {
      const tokens = cur.split(/\s[+\-x÷*\/]\s/);
      const lastToken = tokens[tokens.length - 1];
      if (!lastToken.includes(',')) {
        if (!lastToken || lastToken === '0') {
          display.textContent = cur.replace(/0$/, '') + '0,';
        } else {
          display.textContent = cur + ',';
        }
      }
      return;
    }

    // Nhập số: 0-9, 000
    if (cur.trim() === '0') {
      if (key === '000' || key === '0') return;
      display.textContent = key;
      return;
    }

    // Nếu biểu thức có chứa toán tử
    if (/[+\-x÷*\/]/.test(cur)) {
      const match = cur.match(/^(.*[+\-x÷*\/]\s)(.*)$/);
      if (match) {
        const prefix = match[1];
        let operand = match[2];
        if (operand.includes(',')) {
          display.textContent = prefix + operand + key;
        } else {
          const raw = (operand.replace(/\./g, '') + key).replace(/^0+/, '');
          const formatted = raw ? new Intl.NumberFormat('vi-VN').format(Number(raw)) : (key === '0' ? '0' : '');
          display.textContent = prefix + (formatted || '0');
        }
      } else {
        display.textContent = cur + key;
      }
    } else if (cur.includes(',')) {
      display.textContent = cur + key;
    } else {
      const raw = (cur.replace(/\./g, '') + key).replace(/^0+/, '');
      display.textContent = raw ? new Intl.NumberFormat('vi-VN').format(Number(raw)) : '0';
    }
  },

  handleKeypadQuickAdd(val) {
    const display = document.getElementById('keypad-live-val');
    if (!display) return;

    if (this.keypadAutoSelect) {
      this.keypadAutoSelect = false;
      display.classList.remove('is-selected');
    }

    const cur = display.textContent.trim();
    const evaluated = this.evaluateAmountExpression(cur) || 0;
    const next = evaluated + val;
    display.textContent = new Intl.NumberFormat('vi-VN').format(next);
  },

  evaluateAmountExpression(expr) {
    if (expr === null || expr === undefined || expr === '') return null;
    let clean = String(expr).toLowerCase().trim();
    clean = clean.replace(/(\d+(\.\d+)?)k/g, '($1 * 1000)');
    clean = clean.replace(/(\d+(\.\d+)?)tr/g, '($1 * 1000000)');
    clean = clean.replace(/(\d+(\.\d+)?)m/g, '($1 * 1000000)');
    clean = clean.replace(/÷/g, '/');
    clean = clean.replace(/x/g, '*');
    clean = clean.replace(/×/g, '*');
    clean = clean.replace(/\./g, '').replace(/,/g, '.');
    clean = clean.replace(/[+\-*/\s]+$/, '');

    if (/^[0-9+\-*/ ().]+$/.test(clean)) {
      try {
        const result = Function(`'use strict'; return (${clean})`)();
        if (typeof result === 'number' && !isNaN(result) && isFinite(result) && result >= 0) {
          if (this.activeKeypadTarget === 'asset-quantity') {
            return Math.round(result * 1000) / 1000;
          }
          return Math.round(result);
        }
      } catch (err) {
        console.warn('Invalid math expression:', err);
      }
    }
    return null;
  },

  /* ==================== TRANSACTION TEMPLATES (GHI CHÉP MẪU) ==================== */
  currentTemplateTab: 'expense',

  toggleKeypadTemplates(forceState) {
    const btn = document.getElementById('btn-keypad-templates');
    const grid = document.getElementById('keypad-calculator-grid');
    const panel = document.getElementById('keypad-templates-panel');
    if (!grid || !panel) return;

    const isCurrentlyShowing = panel.style.display !== 'none';
    const showTemplates = forceState !== undefined ? forceState : !isCurrentlyShowing;

    if (showTemplates) {
      grid.style.display = 'none';
      panel.style.display = 'flex';
      if (btn) btn.classList.add('active');
      const formType = document.getElementById('tx-type-input')?.value || 'expense';
      this.currentTemplateTab = formType === 'income' ? 'income' : 'expense';
      this.switchTemplateTab(this.currentTemplateTab);
    } else {
      panel.style.display = 'none';
      grid.style.display = 'grid';
      if (btn) btn.classList.remove('active');
    }
  },

  switchTemplateTab(tab) {
    this.currentTemplateTab = tab;
    document.querySelectorAll('.keypad-template-tab').forEach(el => el.classList.remove('active'));
    const activeTab = document.getElementById(`tab-template-${tab}`);
    if (activeTab) activeTab.classList.add('active');
    this.renderKeypadTemplates();
  },

  async getTemplates(type = null) {
    if (!db.recurring) return [];
    try {
      let list = [];
      try {
        list = await db.recurring.where('frequency').equals('template').toArray();
      } catch (_) {
        const all = await db.recurring.toArray();
        list = all.filter(t => t.frequency === 'template' || t.isTemplate === 1);
      }
      if (!list || list.length === 0) {
        await this.seedDefaultTemplates();
        try {
          list = await db.recurring.where('frequency').equals('template').toArray();
        } catch (_) {
          const all = await db.recurring.toArray();
          list = all.filter(t => t.frequency === 'template' || t.isTemplate === 1);
        }
      } else {
        // Tự động nâng cấp các mẫu mặc định cũ cho khớp với thiết kế mới (IMG_0074)
        try {
          if (!localStorage.getItem('sothuchi_tpl_migrated_v2')) {
            const legacyItems = await db.recurring.toArray();
            for (const item of legacyItems) {
              if (item.frequency === 'template' || item.isTemplate === 1) {
                if (item.title === 'Ăn sáng chay' || item.title === 'Khoáng lạt Thạch Bích') {
                  await db.recurring.delete(item.id);
                } else if (item.title === 'Ăn tiệm' && item.amount === 45000) {
                  await db.recurring.update(item.id, { amount: 20000, color: '#f43f5e' });
                }
              }
            }
            localStorage.setItem('sothuchi_tpl_migrated_v2', '1');
            const refreshed = await db.recurring.toArray();
            list = refreshed.filter(t => t.frequency === 'template' || t.isTemplate === 1);
          }
        } catch (_) {}
      }
      list = (list || []).filter(t => !t.isDeleted);
      if (type) {
        list = list.filter(t => t.type === type);
      }
      list.sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : a.id;
        const orderB = b.order !== undefined ? b.order : b.id;
        return orderA - orderB;
      });
      return list;
    } catch (err) {
      console.warn('Error loading templates:', err);
      return [];
    }
  },

  async seedDefaultTemplates() {
    try {
      const categories = await db.categories.where('isDeleted').equals(0).toArray();
      const getCat = (name, type) => categories.find(c => c.name.toLowerCase().includes(name.toLowerCase()) && c.type === type) || categories.find(c => c.type === type);

      const catAnUong = getCat('ăn uống', 'expense');
      const catXang = getCat('xăng', 'expense');
      const catCho = getCat('chợ', 'expense');
      const catLuong = getCat('lương', 'income');
      const catThuong = getCat('thưởng', 'income');

      const now = new Date().toISOString();
      const defaults = [
        {
          title: 'Ăn tiệm',
          type: 'expense',
          amount: 20000,
          categoryId: catAnUong?.id || 1,
          icon: 'utensils',
          color: catAnUong?.color || '#f43f5e',
          frequency: 'template',
          isTemplate: 1,
          isDeleted: 0,
          order: 0,
          updatedAt: now
        },
        {
          title: 'Đổ xăng',
          type: 'expense',
          amount: 50000,
          categoryId: catXang?.id || 3,
          icon: 'car',
          color: catXang?.color || '#f59e0b',
          frequency: 'template',
          isTemplate: 1,
          isDeleted: 0,
          order: 1,
          updatedAt: now
        },
        {
          title: 'Đi chợ & Siêu thị',
          type: 'expense',
          amount: 100000,
          categoryId: catCho?.id || 2,
          icon: 'shopping-cart',
          color: catCho?.color || '#ec4899',
          frequency: 'template',
          isTemplate: 1,
          isDeleted: 0,
          order: 2,
          updatedAt: now
        },
        {
          title: 'Lương tháng',
          type: 'income',
          amount: 0,
          categoryId: catLuong?.id || 13,
          icon: 'banknote',
          color: catLuong?.color || '#10b981',
          frequency: 'template',
          isTemplate: 1,
          isDeleted: 0,
          order: 0,
          updatedAt: now
        },
        {
          title: 'Thưởng & Tip',
          type: 'income',
          amount: 0,
          categoryId: catThuong?.id || 14,
          icon: 'award',
          color: catThuong?.color || '#059669',
          frequency: 'template',
          isTemplate: 1,
          isDeleted: 0,
          order: 1,
          updatedAt: now
        }
      ];

      await db.recurring.bulkAdd(defaults);
    } catch (e) {
      console.warn('seedDefaultTemplates error:', e);
    }
  },

  formatCompactAmount(amount) {
    if (!amount || amount <= 0) return '';
    if (amount >= 1000000000) {
      const val = amount / 1000000000;
      return (Number.isInteger(val) ? val : val.toFixed(1).replace('.0', '')) + 'tỷ';
    }
    if (amount >= 1000000) {
      const val = amount / 1000000;
      return (Number.isInteger(val) ? val : val.toFixed(1).replace('.0', '')) + 'tr';
    }
    if (amount >= 1000) {
      const val = amount / 1000;
      return (Number.isInteger(val) ? val : val.toFixed(1).replace('.0', '')) + 'k';
    }
    return String(amount);
  },

  async renderKeypadTemplates() {
    const container = document.getElementById('keypad-templates-grid');
    if (!container) return;

    const type = this.currentTemplateTab || 'expense';
    const templates = await this.getTemplates(type);

    let html = '';
    templates.forEach(t => {
      const bg = t.color ? t.color + '22' : 'rgba(13, 148, 136, 0.15)';
      const color = t.color || 'var(--primary)';
      const displayTitle = this.resolveTemplateVariables(t.title || 'Mẫu');
      const safeTitle = (displayTitle || 'Mẫu').replace(/"/g, '&quot;');
      const compactPrice = t.amount > 0 ? this.formatCompactAmount(t.amount) : '';
      const priceTypeClass = t.type === 'income' ? 'income' : 'expense';
      const priceTag = compactPrice ? `<span class="keypad-template-price-tag ${priceTypeClass}">${compactPrice}</span>` : '';

      html += `
        <div class="keypad-template-item" onclick="UITransactions.applyTemplate(${t.id})">
          <div class="keypad-template-icon-bubble" style="background: ${bg}; color: ${color};">
            <i data-lucide="${t.icon || 'tag'}" style="width: 20px; height: 20px;"></i>
            ${priceTag}
          </div>
          <span class="keypad-template-title">${safeTitle}</span>
        </div>
      `;
    });



    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  async applyTemplate(id) {
    const tpl = await db.recurring.get(Number(id));
    if (!tpl) return;

    // 1. Switch form type if needed
    if (tpl.type) {
      this.handleHeaderTypeChange(tpl.type);
    }

    // 2. Select category if template has category
    if (tpl.categoryId) {
      await this.selectCategoryById(Number(tpl.categoryId));
    }

    // 3. Select account if template has account preset
    if (tpl.accountId) {
      const acc = await db.accounts.get(Number(tpl.accountId));
      if (acc && !acc.isDeleted) {
        await this.selectAccount(acc.id, acc.name, acc.type);
      }
    }

    // 4. Set note with dynamic variables resolved
    const txDateStr = document.getElementById('tx-date-input')?.value;
    const dateObj = txDateStr ? new Date(txDateStr + 'T12:00:00') : new Date();

    const noteTemplate = (tpl.note !== undefined && tpl.note !== null && tpl.note !== '') 
      ? tpl.note 
      : (tpl.title || '');
    const resolvedNote = this.resolveTemplateVariables(noteTemplate, dateObj);

    const noteInput = document.getElementById('tx-note-input');
    if (noteInput) {
      noteInput.value = resolvedNote;
      try {
        noteInput.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_) {}
    }

    // 5. Set amount
    if (tpl.amount && tpl.amount > 0) {
      const display = document.getElementById('keypad-live-val');
      if (display) display.textContent = new Intl.NumberFormat('vi-VN').format(tpl.amount);
      const amtInput = document.getElementById('tx-amount-input');
      const amtText = document.getElementById('tx-amount-text');
      if (amtInput) amtInput.value = tpl.amount;
      if (amtText) amtText.textContent = new Intl.NumberFormat('vi-VN').format(tpl.amount);
      showToast(`Đã áp dụng mẫu "${tpl.title}" (${new Intl.NumberFormat('vi-VN').format(tpl.amount)}₫)`, 'success');
      this.closeKeypad();
    } else {
      showToast(`Đã chọn mẫu "${tpl.title}", hãy nhập số tiền`, 'info');
      this.toggleKeypadTemplates(false);
    }

    if (window.lucide) lucide.createIcons();
    this.saveDraft();
  },

  async openTemplateManagerPage() {
    this.closeKeypad(true);
    if (window.app) {
      window.app.switchView('template-manager');
    }
    this.currentTemplateManagerTab = this.currentTemplateTab || 'expense';
    await this.switchTemplateManagerTab(this.currentTemplateManagerTab);
    if (window.lucide) lucide.createIcons();
  },

  async switchTemplateManagerTab(tab) {
    this.currentTemplateManagerTab = tab;
    const tabExp = document.getElementById('tpl-mgr-tab-expense');
    const tabInc = document.getElementById('tpl-mgr-tab-income');
    if (tabExp) tabExp.classList.toggle('active', tab === 'expense');
    if (tabInc) tabInc.classList.toggle('active', tab === 'income');
    await this.renderTemplateManagerPage();
  },

  async renderTemplateManagerPage() {
    const container = document.getElementById('template-manager-list');
    if (!container) return;
    const type = this.currentTemplateManagerTab || 'expense';
    const templates = await this.getTemplates(type);

    if (templates.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 50px 20px;">
          <i data-lucide="inbox" style="width: 40px; height: 40px; margin: 0 auto 10px auto; opacity: 0.45; display: block;"></i>
          <div style="font-weight: 600; font-size: 0.95rem;">Chưa có mẫu ${type === 'income' ? 'thu' : 'chi'} nào</div>
          <div style="font-size: 0.8rem; margin-top: 6px; color: var(--text-muted);">Bấm nút (+) ở góc phải bên dưới để thêm mẫu mới</div>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    let html = '';
    for (let i = 0; i < templates.length; i++) {
      const t = templates[i];
      const cat = t.categoryId ? await db.categories.get(Number(t.categoryId)) : null;
      const catName = cat ? cat.name : 'Chưa gán danh mục';
      const itemColor = cat?.color || t.color || 'var(--primary)';
      const itemIcon = cat?.icon || t.icon || 'tag';
      const amtStr = t.amount > 0 ? `<span style="font-weight:600;font-size:0.8rem;color:var(--text-primary);">${new Intl.NumberFormat('vi-VN').format(t.amount)}đ</span>` : '<span style="color:var(--text-muted);font-size:0.75rem;">Nhập mỗi lần</span>';
      const isFirst = i === 0;
      const isLast = i === templates.length - 1;

      html += `
        <div class="template-manager-row" draggable="true" data-id="${t.id}">
          <!-- Kéo thả sắp xếp giống tài khoản chi tiêu -->
          <div class="template-drag-handle" title="Kéo để sắp xếp vị trí">
            <i data-lucide="grip-vertical" style="width: 16px; height: 16px;"></i>
          </div>

          <div class="template-manager-info" onclick="UITransactions.openTemplateEditor(${t.id})" style="cursor: pointer;">
            <div style="width:38px;height:38px;border-radius:10px;background:${itemColor ? itemColor + '22' : 'rgba(13, 148, 136, 0.15)'};color:${itemColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i data-lucide="${itemIcon}" style="width:19px;height:19px;"></i>
            </div>
            <div style="min-width:0;flex:1;">
              <div style="font-weight:600;font-size:0.9rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow: clip;">
                ${escapeHTML(t.title)}
              </div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">
                ${escapeHTML(catName)} • ${amtStr}
              </div>
              ${t.note ? `<div style="font-size:0.74rem;color:var(--primary);margin-top:3px;display:flex;align-items:center;gap:4px;overflow:hidden;text-overflow: clip;white-space:nowrap;"><i data-lucide="file-text" style="width:12px;height:12px;flex-shrink:0;"></i> <span>${escapeHTML(t.note)}</span> <span style="color:var(--text-muted);font-size:0.7rem;">(→ ${escapeHTML(this.resolveTemplateVariables(t.note))})</span></div>` : ''}
            </div>
          </div>

          <div class="template-manager-actions">
            <button type="button" class="btn-icon" style="width:32px;height:32px;border-radius:8px;" onclick="UITransactions.openTemplateEditor(${t.id})" title="Chỉnh sửa">
              <i data-lucide="edit-3" style="width:16px;height:16px;color:var(--primary);"></i>
            </button>
            <button type="button" class="btn-icon" style="width:32px;height:32px;border-radius:8px;" onclick="UITransactions.handleDeleteTemplate(${t.id})" title="Xóa">
              <i data-lucide="trash-2" style="width:16px;height:16px;color:var(--expense);"></i>
            </button>
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
    this.setupTemplateDragAndDrop(container);
  },

  setupTemplateDragAndDrop(container) {
    if (!container) return;
    const items = container.querySelectorAll('.template-manager-row');
    let draggedItem = null;
    let touchTargetItem = null;

    items.forEach(item => {
      // 1. Desktop HTML5 Drag & Drop
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.id);
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        items.forEach(i => i.classList.remove('drag-over'));
        draggedItem = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedItem && draggedItem !== item) {
          items.forEach(i => i.classList.remove('drag-over'));
          item.classList.add('drag-over');
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        if (draggedItem && draggedItem !== item) {
          const fromId = draggedItem.dataset.id;
          const toId = item.dataset.id;
          await this.reorderTemplates(fromId, toId);
        }
      });

      // 2. Mobile Touch Drag & Drop on the grip handle
      const handle = item.querySelector('.template-drag-handle');
      if (handle) {
        handle.addEventListener('touchstart', (e) => {
          draggedItem = item;
          touchTargetItem = null;
          item.classList.add('dragging');
          if (navigator.vibrate) {
            try { navigator.vibrate(20); } catch (_) {}
          }
        }, { passive: true });

        handle.addEventListener('touchmove', (e) => {
          if (!draggedItem) return;
          const touch = e.touches[0];
          const el = document.elementFromPoint(touch.clientX, touch.clientY);
          const targetRow = el ? el.closest('.template-manager-row') : null;

          items.forEach(i => i.classList.remove('drag-over'));
          if (targetRow && targetRow !== draggedItem && container.contains(targetRow)) {
            targetRow.classList.add('drag-over');
            touchTargetItem = targetRow;
          } else {
            touchTargetItem = null;
          }
        }, { passive: true });

        const handleTouchEnd = async () => {
          if (!draggedItem) return;
          draggedItem.classList.remove('dragging');
          items.forEach(i => i.classList.remove('drag-over'));

          if (touchTargetItem && touchTargetItem !== draggedItem) {
            const fromId = draggedItem.dataset.id;
            const toId = touchTargetItem.dataset.id;
            draggedItem = null;
            touchTargetItem = null;
            await this.reorderTemplates(fromId, toId);
          } else {
            draggedItem = null;
            touchTargetItem = null;
          }
        };

        handle.addEventListener('touchend', handleTouchEnd);
        handle.addEventListener('touchcancel', () => {
          if (draggedItem) draggedItem.classList.remove('dragging');
          items.forEach(i => i.classList.remove('drag-over'));
          draggedItem = null;
          touchTargetItem = null;
        });
      }
    });
  },

  async reorderTemplates(fromId, toId) {
    if (fromId === toId) return;
    const type = this.currentTemplateManagerTab || 'expense';
    const templates = await this.getTemplates(type);

    const fromIndex = templates.findIndex(t => String(t.id) === String(fromId));
    const toIndex = templates.findIndex(t => String(t.id) === String(toId));
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = templates.splice(fromIndex, 1);
    templates.splice(toIndex, 0, moved);

    const now = new Date().toISOString();
    for (let i = 0; i < templates.length; i++) {
      await db.recurring.update(templates[i].id, { order: i, updatedAt: now });
    }

    await this.renderTemplateManagerPage();
    await this.renderKeypadTemplates();
  },

  async moveTemplate(id, direction) {
    const type = this.currentTemplateManagerTab || 'expense';
    const list = await this.getTemplates(type);
    const index = list.findIndex(t => t.id === id);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const currentItem = list[index];
    const targetItem = list[targetIndex];

    const currentOrder = currentItem.order !== undefined ? currentItem.order : index;
    const targetOrder = targetItem.order !== undefined ? targetItem.order : targetIndex;

    const newCurrentOrder = targetOrder;
    const newTargetOrder = currentOrder === targetOrder ? (direction === 'up' ? targetOrder + 1 : targetOrder - 1) : currentOrder;

    const now = new Date().toISOString();
    await db.recurring.update(currentItem.id, { order: newCurrentOrder, updatedAt: now });
    await db.recurring.update(targetItem.id, { order: newTargetOrder, updatedAt: now });

    await this.renderTemplateManagerPage();
    await this.renderKeypadTemplates();
  },

  /* ==================== TEMPLATE EDITOR PAGE (TẠO / SỬA MẪU GHI CHÉP) ==================== */
  resolveTemplateVariables(templateStr, dateObj = new Date()) {
    if (!templateStr || typeof templateStr !== 'string') return '';
    const now = (dateObj instanceof Date && !isNaN(dateObj)) ? dateObj : new Date();

    const dd = String(now.getDate()).padStart(2, '0');
    const d = String(now.getDate());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const m = String(now.getMonth() + 1);
    const thang = `Tháng ${m}`;
    const yyyy = String(now.getFullYear());
    const yy = String(now.getFullYear()).slice(-2);

    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prev_mm = String(prevDate.getMonth() + 1).padStart(2, '0');
    const prev_m = String(prevDate.getMonth() + 1);

    const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const next_mm = String(nextDate.getMonth() + 1).padStart(2, '0');
    const next_m = String(nextDate.getMonth() + 1);

    const q = String(Math.floor(now.getMonth() / 3) + 1);
    const quy = `Quý ${q}`;

    // ISO week
    const target = new Date(now.valueOf());
    const dayNr = (now.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    const week = String(1 + Math.ceil((firstThursday - target) / 604800000));

    const daysLong = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const daysShort = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const thu = daysLong[now.getDay()];
    const t_short = daysShort[now.getDay()];

    const fullDate = `${dd}/${mm}/${yyyy}`;
    const shortDate = `${dd}/${mm}`;

    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const time = `${hh}:${min}`;

    let res = templateStr;

    const replacements = [
      { pattern: /(?:\$|{{)PREV_MM(?:}})?/gi, val: prev_mm },
      { pattern: /(?:\$|{{)PREV_M(?:}})?/gi, val: prev_m },
      { pattern: /(?:\$|{{)NEXT_MM(?:}})?/gi, val: next_mm },
      { pattern: /(?:\$|{{)NEXT_M(?:}})?/gi, val: next_m },
      { pattern: /(?:\$|{{)YYYY(?:}})?/gi, val: yyyy },
      { pattern: /(?:\$|{{)YY(?!Y)(?:}})?/gi, val: yy },
      { pattern: /(?:\$|{{)(?:THANG|MONTH)(?:}})?/gi, val: thang },
      { pattern: /(?:\$|{{)SHORT_DATE(?:}})?/gi, val: shortDate },
      { pattern: /(?:\$|{{)DATE(?:}})?/gi, val: fullDate },
      { pattern: /(?:\$|{{)TIME(?:}})?/gi, val: time },
      { pattern: /(?:\$|{{)QUY(?:}})?/gi, val: quy },
      { pattern: /(?:\$|{{)WEEK(?:}})?/gi, val: week },
      { pattern: /(?:\$|{{)(?:THU|DOW)(?:}})?/gi, val: thu },
      { pattern: /(?:\$|{{)MM(?:}})?/gi, val: mm },
      { pattern: /(?:\$|{{)M(?!M)(?:}})?/gi, val: m },
      { pattern: /(?:\$|{{)DD(?:}})?/gi, val: dd },
      { pattern: /(?:\$|{{)D(?!D)(?:}})?/gi, val: d },
      { pattern: /(?:\$|{{)Q(?:}})?/gi, val: q },
      { pattern: /(?:\$|{{)HH(?:}})?/gi, val: hh },
      { pattern: /(?:\$|{{)MIN(?:}})?/gi, val: min },
      { pattern: /(?:\$|{{)T(?!HU)(?:}})?/gi, val: t_short }
    ];

    for (const r of replacements) {
      res = res.replace(r.pattern, r.val);
    }

    return res;
  },

  async openTemplateEditor(id = null) {
    this.closeKeypad(true);
    this._templateEditorPrevView = (window.app && window.app.currentView) || 'template-manager';

    const titleEl = document.getElementById('template-editor-header-title');
    const idInput = document.getElementById('tpl-page-id-input');
    const titleInput = document.getElementById('tpl-page-title-input');
    const amountInput = document.getElementById('tpl-page-amount-input');
    const amountDisplay = document.getElementById('tpl-page-amount-display');
    const noteInput = document.getElementById('tpl-page-note-input');
    const delBtn = document.getElementById('tpl-page-delete-btn');
    const clearTitleBtn = document.getElementById('btn-clear-tpl-title');

    let currentType = 'expense';

    if (id) {
      const t = await db.recurring.get(Number(id));
      if (!t) return;
      this.editingTemplateId = t.id;
      if (titleEl) titleEl.textContent = 'Sửa Mẫu Ghi Chép';
      if (idInput) idInput.value = t.id;
      if (titleInput) {
        titleInput.value = t.title || '';
        if (clearTitleBtn) clearTitleBtn.style.display = t.title ? 'inline-flex' : 'none';
      }
      const amt = Number(t.amount) || 0;
      if (amountInput) amountInput.value = amt;
      if (amountDisplay) amountDisplay.textContent = amt > 0 ? new Intl.NumberFormat('vi-VN').format(amt) : '0';
      if (noteInput) {
        noteInput.value = t.note || '';
        this.handleTemplateNoteInput(noteInput.value);
      }
      currentType = t.type || 'expense';
      this.switchTemplateEditorType(currentType);

      if (t.categoryId) {
        const cat = await db.categories.get(Number(t.categoryId));
        if (cat) {
          this.setTemplateCategory(cat);
        } else {
          this.clearTemplateCategory();
        }
      } else {
        this.clearTemplateCategory();
      }

      if (t.accountId) {
        await this.setTemplateAccount(t.accountId);
      } else {
        this.clearTemplateAccount();
      }

      if (delBtn) delBtn.style.display = 'inline-flex';
    } else {
      this.editingTemplateId = null;
      if (titleEl) titleEl.textContent = 'Tạo Mẫu Ghi Chép';
      if (idInput) idInput.value = '';
      if (titleInput) {
        titleInput.value = '';
        if (clearTitleBtn) clearTitleBtn.style.display = 'none';
      }
      if (amountInput) amountInput.value = '0';
      if (amountDisplay) amountDisplay.textContent = '0';
      if (noteInput) {
        noteInput.value = '';
        this.handleTemplateNoteInput('');
      }
      currentType = this.currentTemplateManagerTab || this.currentTemplateTab || 'expense';
      this.switchTemplateEditorType(currentType);
      this.clearTemplateCategory();
      this.clearTemplateAccount();
      if (delBtn) delBtn.style.display = 'none';
    }

    this.toggleTemplateVariablesHelp(false);

    if (window.app) {
      window.app.switchView('template-editor');
    }

    if (window.lucide) lucide.createIcons();
  },

  closeTemplateEditor() {
    if (window.app && window.app.currentView === 'template-editor') {
      window.app.goBack();
    }
  },

  switchTemplateEditorType(type) {
    this.currentTemplateEditorType = type;
    const tabExp = document.getElementById('tpl-editor-tab-expense');
    const tabInc = document.getElementById('tpl-editor-tab-income');
    if (tabExp) tabExp.classList.toggle('active', type === 'expense');
    if (tabInc) tabInc.classList.toggle('active', type === 'income');

    const amountDisplay = document.getElementById('tpl-page-amount-display');
    if (amountDisplay) {
      amountDisplay.style.color = type === 'income' ? '#10b981' : '#f43f5e';
    }

    if (this.templateEditorCategory && this.templateEditorCategory.type !== type) {
      this.clearTemplateCategory();
    }
  },

  async openTemplateCategoryPicker() {
    this._categoryPickerMode = 'template';
    const type = this.currentTemplateEditorType || 'expense';
    this.currentCatTab = type;
    if (window.app) {
      window.app.switchView('category-picker');
    }
    const debtTabBtn = document.querySelector('.cat-tab-btn[data-tab="debt"]');
    if (debtTabBtn) debtTabBtn.style.display = 'none';
    this.switchCategoryTab(type);
    await this.renderCategoryPickerTabs();
    if (window.lucide) lucide.createIcons();
  },

  setTemplateCategory(cat) {
    if (!cat) return;
    if (cat.type && (cat.type === 'expense' || cat.type === 'income') && cat.type !== this.currentTemplateEditorType) {
      this.switchTemplateEditorType(cat.type);
    }
    this.templateEditorCategory = cat;
    const catIdInput = document.getElementById('tpl-page-category-id');
    const nameEl = document.getElementById('tpl-selected-cat-name');
    const subEl = document.getElementById('tpl-selected-cat-subtext');
    const iconBubble = document.getElementById('tpl-selected-cat-icon');
    const clearBtn = document.getElementById('btn-clear-tpl-cat');

    if (catIdInput) catIdInput.value = cat.id;
    if (nameEl) nameEl.textContent = cat.name;
    if (subEl) subEl.textContent = 'Chạm để thay đổi danh mục';
    if (iconBubble) {
      iconBubble.style.background = cat.color ? cat.color + '22' : 'rgba(13, 148, 136, 0.15)';
      iconBubble.style.color = cat.color || 'var(--primary)';
      iconBubble.innerHTML = `<i data-lucide="${cat.icon || 'tag'}"></i>`;
    }
    if (clearBtn) clearBtn.style.display = 'inline-flex';
    if (window.lucide) lucide.createIcons();
  },

  clearTemplateCategory(e) {
    if (e) e.stopPropagation();
    this.templateEditorCategory = null;
    const catIdInput = document.getElementById('tpl-page-category-id');
    const nameEl = document.getElementById('tpl-selected-cat-name');
    const subEl = document.getElementById('tpl-selected-cat-subtext');
    const iconBubble = document.getElementById('tpl-selected-cat-icon');
    const clearBtn = document.getElementById('btn-clear-tpl-cat');

    if (catIdInput) catIdInput.value = '';
    if (nameEl) nameEl.textContent = 'Chưa chọn hạng mục';
    if (subEl) subEl.textContent = 'Chạm để chọn danh mục (tùy chọn)';
    if (iconBubble) {
      iconBubble.style.background = 'rgba(148, 163, 184, 0.15)';
      iconBubble.style.color = 'var(--text-muted)';
      iconBubble.innerHTML = `<i data-lucide="tag"></i>`;
    }
    if (clearBtn) clearBtn.style.display = 'none';
    if (window.lucide) lucide.createIcons();
  },

  openTemplateAccountPicker() {
    const curVal = document.getElementById('tpl-page-account-id')?.value || '';
    const type = this.currentTemplateEditorType || 'expense';
    const title = type === 'income' ? 'Chọn Tài Khoản Nhận' : 'Chọn Nguồn Tiền';
    if (window.UIAccounts) {
      window.UIAccounts.openSourceAccountPicker({
        title: title,
        allowNone: true,
        forbidReadOnly: true,
        noneLabel: 'Chưa chọn tài khoản (Mặc định)',
        noneDesc: 'Giữ nguyên tài khoản hiện tại khi áp dụng mẫu',
        selectedId: curVal,
        onSelect: async (accId) => {
          if (!accId) {
            this.clearTemplateAccount();
          } else {
            await this.setTemplateAccount(accId);
          }
        }
      });
    }
  },

  async setTemplateAccount(accId) {
    const acc = await db.accounts.get(Number(accId));
    if (!acc) return;
    if (acc._isSharedItem && acc._sharedRole !== 'editor') {
      const owner = acc._sharedFrom ? ` (chia sẻ bởi ${acc._sharedFrom})` : '';
      showToast(`Tài khoản "${acc.name}"${owner} chỉ có quyền xem, không thể chọn vào mẫu giao dịch!`, 'error');
      return;
    }
    const input = document.getElementById('tpl-page-account-id');
    const label = document.getElementById('tpl-account-label');
    const subtext = document.getElementById('tpl-account-subtext');
    const iconBubble = document.getElementById('tpl-account-icon-bubble');
    const clearBtn = document.getElementById('btn-clear-tpl-account');

    const isSharedItem = !!acc._isSharedItem;
    const isSharedByMe = !isSharedItem && (acc.isShared === 1 || acc.isShared === true);

    const miniShareIndicator = isSharedItem
      ? `<div class=\"mini-share-indicator shared\" style=\"position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; color: #fff; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); font-size: 7px;\" title=\"Được chia sẻ\"><i data-lucide=\"share-2\" style=\"width: 7px; height: 7px;\"></i></div>`
      : (isSharedByMe ? `<div class=\"mini-share-indicator owner\" style=\"position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); font-size: 7px;\" title=\"Đang chia sẻ\"><i data-lucide=\"share-2\" style=\"width: 7px; height: 7px;\"></i></div>` : '');

    if (input) input.value = acc.id;
    if (label) {
      let shareBadge = '';
      if (isSharedItem) {
        const owner = acc._sharedFrom || 'Thành viên';
        shareBadge = `<span style=\"font-size: 0.68rem; color: #3b82f6; font-weight: 600; background: rgba(59, 130, 246, 0.12); padding: 1px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;\" title=\"Từ: ${escapeHTML(owner)}\"><i data-lucide=\"share-2\" style=\"width: 8px; height: 8px;\"></i> Từ: ${escapeHTML(owner)}</span>`;
      }
      const roleBadge = (window.UIAccounts && typeof window.UIAccounts.renderSharedRoleBadge === 'function')
        ? window.UIAccounts.renderSharedRoleBadge(acc)
        : '';
      label.innerHTML = `<span style=\"white-space: nowrap; overflow: hidden; text-overflow: clip;\">${escapeHTML(acc.name)}</span> ${roleBadge} ${shareBadge}`;
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '4px';
    }
    if (subtext) {
      const subNotes = [];
      if (acc.description && acc.description.trim()) subNotes.push(escapeHTML(acc.description.trim()));
      const subNoteStr = subNotes.length > 0 ? ` • ${subNotes.join(' • ')}` : '';
      subtext.textContent = 'Số dư: ' + new Intl.NumberFormat('vi-VN').format(acc.balance || 0) + '₫' + subNoteStr;
    }
    if (iconBubble) {
      if (window.UIAccounts && typeof window.UIAccounts.renderLogoBadge === 'function') {
        iconBubble.style.background = 'transparent';
        iconBubble.innerHTML = `<div style="position: relative; display: inline-flex;">${window.UIAccounts.renderLogoBadge(acc, 36)}${miniShareIndicator}</div>`;
      } else {
        iconBubble.style.background = acc.color ? acc.color + '22' : 'rgba(99, 102, 241, 0.15)';
        iconBubble.style.color = acc.color || 'var(--primary)';
        iconBubble.innerHTML = `<div style="position: relative; display: inline-flex;"><i data-lucide="wallet"></i>${miniShareIndicator}</div>`;
      }
    }
    if (clearBtn) clearBtn.style.display = 'inline-flex';
    if (window.lucide) lucide.createIcons();
  },

  clearTemplateAccount(e) {
    if (e) e.stopPropagation();
    const input = document.getElementById('tpl-page-account-id');
    const label = document.getElementById('tpl-account-label');
    const subtext = document.getElementById('tpl-account-subtext');
    const iconBubble = document.getElementById('tpl-account-icon-bubble');
    const clearBtn = document.getElementById('btn-clear-tpl-account');

    if (input) input.value = '';
    if (label) label.textContent = 'Chưa chọn tài khoản';
    if (subtext) subtext.textContent = 'Mặc định giữ nguyên tài khoản khi ghi';
    if (iconBubble) {
      iconBubble.style.background = 'rgba(148, 163, 184, 0.15)';
      iconBubble.style.color = 'var(--text-muted)';
    }
    if (clearBtn) clearBtn.style.display = 'none';
  },

  handleTemplateNoteInput(val) {
    const clearBtn = document.getElementById('btn-clear-tpl-note');
    if (clearBtn) {
      clearBtn.style.display = val ? 'inline-flex' : 'none';
    }
    const previewWrap = document.getElementById('tpl-note-preview-wrap');
    const previewVal = document.getElementById('tpl-note-preview-val');
    if (!val || !val.trim()) {
      if (previewWrap) previewWrap.style.display = 'none';
      return;
    }
    const resolved = this.resolveTemplateVariables(val);
    if (previewWrap && previewVal) {
      if (resolved !== val) {
        previewWrap.style.display = 'flex';
        previewVal.textContent = resolved;
      } else {
        previewWrap.style.display = 'none';
      }
    }
  },

  clearTemplateNote(e) {
    if (e) e.stopPropagation();
    const input = document.getElementById('tpl-page-note-input');
    if (input) {
      input.value = '';
      this.handleTemplateNoteInput('');
      input.focus();
    }
  },

  toggleTemplateVariablesHelp(forceState) {
    const panel = document.getElementById('tpl-variables-help-panel');
    const btn = document.getElementById('btn-tpl-var-help');
    if (!panel) return;
    const isShowing = panel.style.display !== 'none';
    const show = forceState !== undefined ? forceState : !isShowing;
    panel.style.display = show ? 'block' : 'none';
    if (btn) {
      btn.style.background = show ? 'rgba(13, 148, 136, 0.15)' : 'var(--bg-card)';
      btn.style.borderColor = show ? 'var(--primary)' : 'var(--border-color)';
    }
    if (show) {
      this.renderTemplateVariablesHelpTable();
    }
    if (window.lucide) lucide.createIcons();
  },

  insertTemplateVariable(token) {
    const input = document.getElementById('tpl-page-note-input');
    if (!input) return;
    const start = input.selectionStart || input.value.length;
    const end = input.selectionEnd || input.value.length;
    const text = input.value;
    input.value = text.substring(0, start) + token + text.substring(end);
    input.focus();
    const newPos = start + token.length;
    input.setSelectionRange(newPos, newPos);
    this.handleTemplateNoteInput(input.value);
  },

  renderTemplateVariablesHelpTable() {
    const container = document.getElementById('tpl-variables-table-list');
    if (!container) return;
    const now = new Date();
    const vars = [
      { token: '$MM', desc: 'Tháng 2 chữ số (01 - 12)', eg: this.resolveTemplateVariables('$MM', now) },
      { token: '$M', desc: 'Tháng 1-2 chữ số (1 - 12)', eg: this.resolveTemplateVariables('$M', now) },
      { token: '$PREV_MM', desc: 'Tháng trước (2 chữ số: 01 - 12)', eg: this.resolveTemplateVariables('$PREV_MM', now) },
      { token: '$NEXT_MM', desc: 'Tháng sau (2 chữ số: 01 - 12)', eg: this.resolveTemplateVariables('$NEXT_MM', now) },
      { token: '$YYYY', desc: 'Năm đầy đủ 4 chữ số', eg: this.resolveTemplateVariables('$YYYY', now) },
      { token: '$YY', desc: 'Năm 2 chữ số cuối', eg: this.resolveTemplateVariables('$YY', now) },
      { token: '$DD', desc: 'Ngày trong tháng (01 - 31)', eg: this.resolveTemplateVariables('$DD', now) },
      { token: '$D', desc: 'Ngày 1-2 chữ số (1 - 31)', eg: this.resolveTemplateVariables('$D', now) },
      { token: '$DATE', desc: 'Ngày đầy đủ (DD/MM/YYYY)', eg: this.resolveTemplateVariables('$DATE', now) },
      { token: '$SHORT_DATE', desc: 'Ngày ngắn (DD/MM)', eg: this.resolveTemplateVariables('$SHORT_DATE', now) },
      { token: '$Q', desc: 'Số quý trong năm (1 - 4)', eg: 'Q' + this.resolveTemplateVariables('$Q', now) },
      { token: '$QUY', desc: 'Tên quý tiếng Việt', eg: this.resolveTemplateVariables('$QUY', now) },
      { token: '$WEEK', desc: 'Số tuần trong năm', eg: 'Tuần ' + this.resolveTemplateVariables('$WEEK', now) },
      { token: '$THU', desc: 'Thứ trong tuần (Thứ Hai - Chủ Nhật)', eg: this.resolveTemplateVariables('$THU', now) },
      { token: '$T', desc: 'Thứ viết tắt (T2 - CN)', eg: this.resolveTemplateVariables('$T', now) },
      { token: '$TIME', desc: 'Giờ phút hiện tại (HH:MM)', eg: this.resolveTemplateVariables('$TIME', now) }
    ];

    container.innerHTML = vars.map(v => `
      <div class="tpl-var-row" onclick="UITransactions.insertTemplateVariable('${v.token}')" title="Bấm để chèn ${v.token}">
        <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
          <span class="tpl-var-badge">${v.token}</span>
          <span class="tpl-var-desc">${v.desc}</span>
        </div>
        <div class="tpl-var-val">${v.eg}</div>
      </div>
    `).join('');
  },

  async handleSaveTemplatePage(e) {
    if (e && e.preventDefault) e.preventDefault();
    const idInput = document.getElementById('tpl-page-id-input');
    const titleInput = document.getElementById('tpl-page-title-input');
    const amountInput = document.getElementById('tpl-page-amount-input');
    const catIdInput = document.getElementById('tpl-page-category-id');
    const accIdInput = document.getElementById('tpl-page-account-id');
    const noteInput = document.getElementById('tpl-page-note-input');

    const title = titleInput?.value?.trim();
    if (!title) {
      showToast('Vui lòng nhập tên mẫu ghi chép', 'warning');
      if (titleInput) titleInput.focus();
      return;
    }

    const type = this.currentTemplateEditorType || 'expense';
    const rawAmt = amountInput?.value ? String(amountInput.value).replace(/\./g, '') : '0';
    const amount = Number(rawAmt) || 0;
    const categoryId = catIdInput?.value ? Number(catIdInput.value) : null;
    const accountId = accIdInput?.value ? Number(accIdInput.value) : null;
    const note = noteInput?.value?.trim() || '';

    let cat = null;
    if (categoryId) {
      cat = await db.categories.get(categoryId);
    }

    const now = new Date().toISOString();
    const tplData = {
      title,
      type,
      amount,
      categoryId: categoryId || null,
      accountId: accountId || null,
      note,
      icon: cat?.icon || (type === 'income' ? 'arrow-up-circle' : 'arrow-down-circle'),
      color: cat?.color || (type === 'income' ? '#10b981' : '#f43f5e'),
      frequency: 'template',
      isTemplate: 1,
      isDeleted: 0,
      updatedAt: now
    };

    const targetId = idInput?.value ? Number(idInput.value) : null;
    if (targetId) {
      await db.recurring.update(targetId, tplData);
      showToast('Đã cập nhật mẫu ghi chép', 'success');
    } else {
      const existing = await this.getTemplates(type);
      const maxOrder = existing.reduce((max, t) => Math.max(max, t.order || 0), 0);
      tplData.order = maxOrder + 1;
      await db.recurring.add(tplData);
      showToast('Đã tạo mẫu ghi chép mới', 'success');
    }

    await this.renderTemplateManagerPage();
    await this.renderKeypadTemplates();

    if (window.app) {
      window.app.goBack();
    }
  },

  async handleSaveTemplate(e) {
    return this.handleSaveTemplatePage(e);
  },

  async handleDeleteTemplate(id = null) {
    const targetId = id || Number(document.getElementById('tpl-page-id-input')?.value);
    if (!targetId) return;

    let targetTitle = '';
    try {
      const t = await db.recurring.get(targetId);
      if (t && t.title) targetTitle = t.title;
    } catch (_) {}

    const confirmMsg = targetTitle 
      ? `Bạn có chắc chắn muốn xóa mẫu ghi chép <strong>"${escapeHTML(targetTitle)}"</strong> này không?`
      : 'Bạn có chắc chắn muốn xóa mẫu ghi chép này không?';

    const ok = await showConfirm({
      title: 'Xóa Mẫu Ghi Chép',
      message: confirmMsg,
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      danger: true,
      icon: 'trash-2'
    });
    if (!ok) return;

    await db.recurring.update(targetId, { isDeleted: 1, updatedAt: new Date().toISOString() });
    showToast('Đã xóa mẫu ghi chép', 'success');
    await this.renderTemplateManagerPage();
    await this.renderKeypadTemplates();

    if (window.app && window.app.currentView === 'template-editor') {
      window.app.goBack();
    }
  },

  /* ==================== QUICK CATEGORY GRID (2x4 FIXED) ==================== */
  async renderQuickCategories(targetType = null) {
    const container = document.getElementById('tx-quick-category-grid');
    if (!container) return;

    const formType = document.getElementById('tx-type-input')?.value || 'expense';
    const debtSubaction = document.getElementById('tx-debt-subaction-input')?.value || '';

    // Xác định nhóm danh mục: 'income' (Thu tiền, Đi vay, Thu nợ) hay 'expense' (Chi tiền, Cho vay, Trả nợ)
    let groupType = targetType || formType;
    if (groupType === 'borrow' || groupType === 'debt-collect') {
      groupType = 'income';
    } else if (groupType === 'lend' || groupType === 'debt-pay' || groupType === 'adjust' || groupType === 'transfer') {
      groupType = 'expense';
    }
    if (groupType !== 'income') groupType = 'expense';

    // 1. Lấy danh mục tương thích theo groupType (thu hoặc chi) từ RAM cache tức thì
    let allCats = [];
    if (this._categoriesCache && this._categoriesCache.length > 0) {
      allCats = this._categoriesCache.filter(c => c.type === groupType);
    } else {
      const all = await this.loadCategories();
      allCats = all.filter(c => c.type === groupType);
    }
    let quickCats = allCats.filter(c => c.isQuick === 1);
    if (quickCats.length === 0) {
      quickCats = allCats.slice(0, 6);
    } else {
      quickCats = quickCats.slice(0, 6);
    }

    let html = '';
    for (const cat of quickCats) {
      const isSelected = (!debtSubaction && formType === groupType && this.selectedCategory && this.selectedCategory.id === cat.id);
      html += `
        <div class="quick-cat-chip ${isSelected ? 'active' : ''}" onclick="UITransactions.selectCategoryById(${cat.id})" title="${escapeHTML(cat.name)}">
          <div class="quick-cat-icon" style="background: ${cat.color}22; color: ${cat.color};">
            <i data-lucide="${cat.icon || 'tag'}" style="width: 16px; height: 16px;"></i>
          </div>
          <span class="quick-cat-name">${escapeHTML(cat.name)}</span>
        </div>
      `;
    }

    // 2. Hai slot cuối (vị trí 7 & 8) tương thích theo nhóm:
    if (groupType === 'income') {
      // Nhóm THU TIỀN:
      // Slot 7: Đi Vay (thu tiền vay vào tài khoản)
      // Slot 8: Thu Nợ (thu hồi tiền người nợ trả vào tài khoản)
      const isBorrowActive = (formType === 'borrow' || debtSubaction === 'borrow');
      const isCollectActive = (formType === 'debt-collect' || debtSubaction === 'debt-collect');
      html += `
        <div class="quick-cat-chip ${isBorrowActive ? 'active' : ''}" onclick="UITransactions.selectDebtAction('borrow')" title="Đi Vay">
          <div class="quick-cat-icon" style="background: rgba(245, 158, 11, 0.15); color: var(--warning);">
            <i data-lucide="arrow-down-left" style="width: 16px; height: 16px;"></i>
          </div>
          <span class="quick-cat-name">Đi Vay</span>
        </div>
        <div class="quick-cat-chip ${isCollectActive ? 'active' : ''}" onclick="UITransactions.openCategoryPickerPage('debt')" title="Thu Nợ">
          <div class="quick-cat-icon" style="background: rgba(16, 185, 129, 0.15); color: var(--income);">
            <i data-lucide="check-circle-2" style="width: 16px; height: 16px;"></i>
          </div>
          <span class="quick-cat-name">Thu Nợ</span>
        </div>
      `;
    } else {
      // Nhóm CHI TIỀN:
      // Slot 7: Cho Vay (tiền chi từ tài khoản cho vay)
      // Slot 8: Trả Nợ (tiền chi từ tài khoản trả nợ)
      const isLendActive = (formType === 'lend' || debtSubaction === 'lend');
      const isPayActive = (formType === 'debt-pay' || debtSubaction === 'debt-pay');
      html += `
        <div class="quick-cat-chip ${isLendActive ? 'active' : ''}" onclick="UITransactions.selectDebtAction('lend')" title="Cho Vay">
          <div class="quick-cat-icon" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">
            <i data-lucide="arrow-up-right" style="width: 16px; height: 16px;"></i>
          </div>
          <span class="quick-cat-name">Cho Vay</span>
        </div>
        <div class="quick-cat-chip ${isPayActive ? 'active' : ''}" onclick="UITransactions.openCategoryPickerPage('debt')" title="Trả Nợ">
          <div class="quick-cat-icon" style="background: rgba(245, 158, 11, 0.15); color: var(--warning);">
            <i data-lucide="clock" style="width: 16px; height: 16px;"></i>
          </div>
          <span class="quick-cat-name">Trả Nợ</span>
        </div>
      `;
    }

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons({ root: container });
  },

  handleCategoryCardClick() {
    this.openCategoryPickerPage();
  },

  async selectCategoryById(catId) {
    let cat = null;
    if (this._categoriesCache && this._categoriesCache.length > 0) {
      cat = this._categoriesCache.find(c => c.id === Number(catId));
    }
    if (!cat) {
      cat = await db.categories.get(Number(catId));
    }
    if (cat) {
      await this.selectCategory(cat);
    }
  },

  async selectCategory(cat) {
    if (this._categoryPickerMode === 'template') {
      this._categoryPickerMode = null;
      this.setTemplateCategory(cat);
      if (window.app) {
        window.app.switchView('template-editor', true);
      }
      return;
    }
    this.selectedCategory = cat;
    document.getElementById('tx-type-input').value = cat.type;
    document.getElementById('tx-category-id-input').value = cat.id;
    document.getElementById('tx-debt-subaction-input').value = '';
    document.getElementById('tx-linked-debt-id-input').value = '';

    const typeSelector = document.getElementById('tx-type-selector');
    if (typeSelector) typeSelector.value = cat.type;
    this.updateAmountColor(cat.type);

    // Update UI badge
    const badge = document.getElementById('tx-type-badge');
    if (badge) {
      badge.className = `badge-type ${cat.type}`;
      badge.textContent = cat.type === 'expense' ? 'Chi Tiêu' : 'Thu Nhập';
    }

    // Update selected category card
    const iconBox = document.getElementById('tx-selected-cat-icon');
    const nameBox = document.getElementById('tx-selected-cat-name');
    const subBox = document.getElementById('tx-selected-cat-subtext');
    if (iconBox) {
      iconBox.style.background = `${cat.color}22`;
      iconBox.style.color = cat.color;
      iconBox.innerHTML = `<i data-lucide="${cat.icon || 'tag'}"></i>`;
    }
    if (nameBox) nameBox.textContent = cat.name;
    const catSubtext = 'Chọn danh mục';
    if (subBox) {
      if (cat.type === 'expense' && window.UIBudgets && typeof window.UIBudgets.getCategoryBudgetInfo === 'function') {
        const txDate = document.getElementById('tx-date-input')?.dataset?.rawDate || document.getElementById('tx-date-input')?.value || null;
        window.UIBudgets.getCategoryBudgetInfo(cat.id, txDate).then(info => {
          if (info && info.text) {
            subBox.textContent = info.text;
            subBox.style.color = info.isOver ? 'var(--expense)' : 'var(--income)';
          } else {
            subBox.textContent = 'Chọn danh mục';
            subBox.style.color = 'var(--text-muted)';
          }
        }).catch(() => {
          subBox.textContent = 'Chọn danh mục';
          subBox.style.color = 'var(--text-muted)';
        });
      } else {
        subBox.textContent = catSubtext;
        subBox.style.color = 'var(--text-muted)';
      }
    }
    try {
      localStorage.setItem('stc_default_cat_cache', JSON.stringify({
        name: cat.name,
        color: cat.color,
        subtext: catSubtext
      }));
    } catch (e) {}

    // Form field adaptations
    const catCard = document.getElementById('tx-category-section-card');
    if (catCard) catCard.style.display = 'flex';
    const personRow = document.getElementById('tx-debt-person-row');
    if (personRow) personRow.style.display = 'none';
    const dueRow = document.getElementById('tx-debt-due-row');
    if (dueRow) dueRow.style.display = 'none';
    const haydungContainer = document.getElementById('tx-haydung-container');
    if (haydungContainer) haydungContainer.style.display = 'flex';
    const transferGroup = document.getElementById('tx-transfer-target-group');
    if (transferGroup) transferGroup.style.display = 'none';
    const fromDirTag = document.getElementById('tx-account-dir-tag');
    if (fromDirTag) fromDirTag.style.display = 'none';


    this.updateHeaderTypeDisplay(cat.type);
    await this.renderQuickCategories(cat.type);
    this.closeCategoryPicker();
    if (window.lucide) lucide.createIcons();
    this.saveDraft();
  },

  /* ==================== DEBT & TRANSFER SUB-ACTIONS ==================== */
  async selectDebtAction(subaction, debtItem = null) {
    document.getElementById('tx-debt-subaction-input').value = subaction;
    document.getElementById('tx-category-id-input').value = '';
    const badge = document.getElementById('tx-type-badge');
    const iconBox = document.getElementById('tx-selected-cat-icon');
    const nameBox = document.getElementById('tx-selected-cat-name');
    const subBox = document.getElementById('tx-selected-cat-subtext');
    const personRow = document.getElementById('tx-debt-person-row');
    const dueRow = document.getElementById('tx-debt-due-row');
    const personBubble = document.getElementById('tx-debt-person-icon-bubble');
    const personDisplay = document.getElementById('tx-debt-person-display');
    const personSub = document.getElementById('tx-debt-person-sub');
    const curPerson = document.getElementById('tx-person-input')?.value;
    const transferGroup = document.getElementById('tx-transfer-target-group');
    const typeSelector = document.getElementById('tx-type-selector');
    const catCard = document.getElementById('tx-category-section-card');

    if (transferGroup) transferGroup.style.display = 'none';
    const fromDirTag = document.getElementById('tx-account-dir-tag');
    if (fromDirTag) fromDirTag.style.display = 'none';

    if (subaction === 'lend') {
      document.getElementById('tx-type-input').value = 'lend';
      document.getElementById('tx-linked-debt-id-input').value = '';
      if (typeSelector) typeSelector.value = 'lend';
      this.updateHeaderTypeDisplay('lend');
      this.updateAmountColor('lend');
      if (badge) { badge.className = 'badge-type lend'; badge.textContent = 'Cho Vay'; }
      if (iconBox) {
        iconBox.style.background = 'rgba(59, 130, 246, 0.15)';
        iconBox.style.color = '#3b82f6';
        iconBox.innerHTML = '<i data-lucide="arrow-up-right"></i>';
      }
      if (nameBox) nameBox.textContent = 'Cho Vay';
      if (subBox) subBox.textContent = 'Chọn danh mục';
      if (catCard) catCard.style.display = 'flex';
      if (personRow) personRow.style.display = 'flex';
      if (dueRow) dueRow.style.display = 'flex';
      const dueInput = document.getElementById('tx-due-date-input');
      if (dueInput) dueInput.placeholder = 'Ngày thu nợ';

      // Ẩn Hay dùng khi Cho vay, thay bằng thông tin người vay
      const haydungContainer = document.getElementById('tx-haydung-container');
      if (haydungContainer) haydungContainer.style.display = 'none';

      const personTitle = document.getElementById('tx-debt-person-title');
      const personDisplay = document.getElementById('tx-debt-person-display');
      if (personBubble) {
        personBubble.style.background = 'rgba(59, 130, 246, 0.15)';
        personBubble.style.color = '#3b82f6';
        personBubble.innerHTML = '<i data-lucide="user"></i>';
      }
      if (personTitle) personTitle.textContent = 'Người vay';
      if (personDisplay) personDisplay.textContent = curPerson || 'Chưa chọn ai';

      this.closeCategoryPicker();
      if (!curPerson) {
        this.openBorrowSelectPage();
      }

    } else if (subaction === 'borrow') {
      document.getElementById('tx-type-input').value = 'borrow';
      document.getElementById('tx-linked-debt-id-input').value = '';
      if (typeSelector) typeSelector.value = 'borrow';
      this.updateHeaderTypeDisplay('borrow');
      this.updateAmountColor('borrow');
      if (badge) { badge.className = 'badge-type borrow'; badge.textContent = 'Đi Vay'; }
      if (iconBox) {
        iconBox.style.background = 'rgba(245, 158, 11, 0.15)';
        iconBox.style.color = 'var(--warning)';
        iconBox.innerHTML = '<i data-lucide="arrow-down-left"></i>';
      }
      if (nameBox) nameBox.textContent = 'Đi Vay';
      if (subBox) subBox.textContent = 'Chọn danh mục';
      if (catCard) catCard.style.display = 'flex';
      if (personRow) personRow.style.display = 'flex';
      if (dueRow) dueRow.style.display = 'flex';
      const dueInput = document.getElementById('tx-due-date-input');
      if (dueInput) dueInput.placeholder = 'Ngày trả nợ';

      // Ẩn Hay dùng khi Đi vay, thay bằng thông tin người cho vay
      const haydungContainer = document.getElementById('tx-haydung-container');
      if (haydungContainer) haydungContainer.style.display = 'none';

      const personTitle = document.getElementById('tx-debt-person-title');
      const personDisplay = document.getElementById('tx-debt-person-display');
      if (personBubble) {
        personBubble.style.background = 'rgba(245, 158, 11, 0.15)';
        personBubble.style.color = '#f59e0b';
        personBubble.innerHTML = '<i data-lucide="user"></i>';
      }
      if (personTitle) personTitle.textContent = 'Người cho vay';
      if (personDisplay) personDisplay.textContent = curPerson || 'Chưa chọn ai';

      this.closeCategoryPicker();
      if (!curPerson) {
        this.openBorrowSelectPage();
      }

    } else if (subaction === 'debt-collect' && debtItem) {
      document.getElementById('tx-type-input').value = 'debt-collect';
      document.getElementById('tx-linked-debt-id-input').value = debtItem.id;
      if (typeSelector) typeSelector.value = 'income';
      this.updateHeaderTypeDisplay('income');
      this.updateAmountColor('income');
      if (badge) { badge.className = 'badge-type income'; badge.textContent = 'Thu Nợ'; }
      if (iconBox) {
        iconBox.style.background = 'rgba(16, 185, 129, 0.15)';
        iconBox.style.color = 'var(--income)';
        iconBox.innerHTML = '<i data-lucide="check-circle-2"></i>';
      }
      if (nameBox) nameBox.textContent = `Thu Nợ: ${debtItem.personName}`;
      if (subBox) subBox.textContent = 'Chọn danh mục';
      if (personRow) personRow.style.display = 'none';
      if (dueRow) dueRow.style.display = 'none';

      const haydungContainer = document.getElementById('tx-haydung-container');
      if (haydungContainer) haydungContainer.style.display = 'none';

      const formattedRem = new Intl.NumberFormat('vi-VN').format(debtItem.remainingAmount);
      document.getElementById('tx-amount-input').value = formattedRem;
      const amountVal = document.getElementById('tx-amount-text');
      if (amountVal) amountVal.textContent = formattedRem;
      document.getElementById('tx-note-input').value = `Thu nợ từ ${debtItem.personName}`;
      showToast(`Đã chọn thu nợ từ: ${debtItem.personName}`, 'info');

    } else if (subaction === 'debt-pay' && debtItem) {
      document.getElementById('tx-type-input').value = 'debt-pay';
      document.getElementById('tx-linked-debt-id-input').value = debtItem.id;
      if (typeSelector) typeSelector.value = 'expense';
      this.updateHeaderTypeDisplay('expense');
      this.updateAmountColor('expense');
      if (badge) { badge.className = 'badge-type warning'; badge.textContent = 'Trả Nợ'; }
      if (iconBox) {
        iconBox.style.background = 'rgba(245, 158, 11, 0.15)';
        iconBox.style.color = 'var(--warning)';
        iconBox.innerHTML = '<i data-lucide="clock"></i>';
      }
      if (nameBox) nameBox.textContent = `Trả Nợ: ${debtItem.personName}`;
      if (subBox) subBox.textContent = 'Chọn danh mục';
      if (personRow) personRow.style.display = 'none';
      if (dueRow) dueRow.style.display = 'none';

      const haydungContainer = document.getElementById('tx-haydung-container');
      if (haydungContainer) haydungContainer.style.display = 'none';

      const formattedRem = new Intl.NumberFormat('vi-VN').format(debtItem.remainingAmount);
      document.getElementById('tx-amount-input').value = formattedRem;
      const amountVal = document.getElementById('tx-amount-text');
      if (amountVal) amountVal.textContent = formattedRem;
      document.getElementById('tx-note-input').value = `Trả nợ cho ${debtItem.personName}`;
      showToast(`Đã chọn trả nợ cho: ${debtItem.personName}`, 'info');
    }

    this.closeCategoryPicker();
    if (window.lucide) lucide.createIcons();
    this.saveDraft();
  },

  async selectTransferAction() {
    document.getElementById('tx-type-input').value = 'transfer';
    document.getElementById('tx-category-id-input').value = '';
    document.getElementById('tx-debt-subaction-input').value = '';
    document.getElementById('tx-linked-debt-id-input').value = '';

    const typeSelector = document.getElementById('tx-type-selector');
    if (typeSelector) typeSelector.value = 'transfer';
    this.updateHeaderTypeDisplay('transfer');
    this.updateAmountColor('transfer');

    const badge = document.getElementById('tx-type-badge');
    if (badge) { badge.className = 'badge-type transfer'; badge.textContent = 'Chuyển khoản'; }

    const iconBox = document.getElementById('tx-selected-cat-icon');
    const nameBox = document.getElementById('tx-selected-cat-name');
    const subBox = document.getElementById('tx-selected-cat-subtext');
    if (iconBox) {
      iconBox.style.background = 'rgba(13, 148, 136, 0.15)';
      iconBox.style.color = '#0ea5e9';
      iconBox.innerHTML = '<i data-lucide="arrow-right-left"></i>';
    }
    if (nameBox) nameBox.textContent = 'Chuyển khoản giữa các tài khoản';
    if (subBox) subBox.textContent = 'Chuyển tiền nội bộ giữa 2 tài khoản';

    const catCard = document.getElementById('tx-category-section-card');
    if (catCard) catCard.style.display = 'none';
    const debtGroup = document.getElementById('tx-debt-person-group');
    if (debtGroup) debtGroup.style.display = 'none';
    const debtPersonRow = document.getElementById('tx-debt-person-row');
    if (debtPersonRow) debtPersonRow.style.display = 'none';
    const dueRow = document.getElementById('tx-debt-due-row');
    if (dueRow) dueRow.style.display = 'none';
    const haydungContainer = document.getElementById('tx-haydung-container');
    if (haydungContainer) haydungContainer.style.display = 'none';

    // Show direction tag and transfer target group
    const fromDirTag = document.getElementById('tx-account-dir-tag');
    if (fromDirTag) fromDirTag.style.display = 'inline-flex';
    const transferGroup = document.getElementById('tx-transfer-target-group');
    if (transferGroup) transferGroup.style.display = 'block';

    // Ensure distinct accounts for source and destination
    const fromSelect = document.getElementById('tx-account-select');
    const toSelect = document.getElementById('tx-to-account-select');
    const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
    accounts.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));

    const nonArchived = accounts.filter(a => !a.isArchived);
    const validAccounts = nonArchived.length > 0 ? nonArchived : accounts;

    if (validAccounts.length > 0) {
      if (!fromSelect.value || !validAccounts.some(a => String(a.id) === String(fromSelect.value))) {
        fromSelect.value = validAccounts[0].id;
      }
      if (!toSelect.value || toSelect.value === fromSelect.value || !validAccounts.some(a => String(a.id) === String(toSelect.value))) {
        const diffAcc = validAccounts.find(a => String(a.id) !== String(fromSelect.value));
        if (diffAcc) {
          toSelect.value = diffAcc.id;
        } else {
          toSelect.value = validAccounts[0].id;
        }
      }
    }

    await this.updateSelectedAccountDisplay();
    await this.updateSelectedToAccountDisplay();
    this.refreshAccountDropdownOptions();
    this.closeCategoryPicker();
    if (window.lucide) lucide.createIcons();
    this.saveDraft();
  },

  /* ==================== FULL CATEGORY PICKER (SUB-PAGE) ==================== */
  async openCategoryPickerPage(initialTab = null) {
    if (initialTab) {
      this.currentCatTab = initialTab;
    } else {
      const curType = document.getElementById('tx-type-input')?.value || 'expense';
      this.currentCatTab = (curType === 'income') ? 'income' : (curType === 'lend' || curType === 'borrow') ? 'debt' : 'expense';
    }
    if (window.app) {
      window.app.switchView('category-picker');
    }
    this.switchCategoryTab(this.currentCatTab);
    await this.renderCategoryPickerTabs();
  },

  openCategoryPicker() {
    this.openCategoryPickerPage();
  },

  closeCategoryPicker() {
    const modal = document.getElementById('modal-category-picker');
    if (modal) modal.classList.remove('open');
    if (window.app && window.app.currentView === 'category-picker') {
      window.app.goBack();
    }
  },

  switchCategoryTab(tab) {
    this.currentCatTab = tab;
    document.querySelectorAll('.cat-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.cat-tab-pane').forEach(pane => {
      pane.style.display = pane.id === `cat-tab-${tab}` ? 'block' : 'none';
    });
  },

  async renderCategoryPickerTabs() {
    const allCats = await this.loadCategories();
    // 1. Expense Tab
    const expenseList = document.getElementById('cat-list-expense');
    if (expenseList) {
      const expenses = allCats.filter(c => c.type === 'expense');
      expenseList.innerHTML = expenses.map(c => `
        <div class="cat-picker-item" onclick="UITransactions.selectCategoryById(${c.id})">
          <div class="category-icon-bubble" style="background: ${c.color}22; color: ${c.color};">
            <i data-lucide="${c.icon || 'tag'}"></i>
          </div>
          <span style="font-weight: 600; font-size: 0.88rem;">${escapeHTML(c.name)}</span>
        </div>
      `).join('');
    }

    // 2. Income Tab
    const incomeList = document.getElementById('cat-list-income');
    if (incomeList) {
      const incomes = allCats.filter(c => c.type === 'income');
      incomeList.innerHTML = incomes.map(c => `
        <div class="cat-picker-item" onclick="UITransactions.selectCategoryById(${c.id})">
          <div class="category-icon-bubble" style="background: ${c.color}22; color: ${c.color};">
            <i data-lucide="${c.icon || 'tag'}"></i>
          </div>
          <span style="font-weight: 600; font-size: 0.88rem;">${escapeHTML(c.name)}</span>
        </div>
      `).join('');
    }

    // 3. Debt Tab (Active Debts)
    const activeDebts = await db.debts.where('isDeleted').equals(0).and(d => d.status !== 'settled').toArray();
    const collectDebts = activeDebts.filter(d => d.type === 'lend');
    const payDebts = activeDebts.filter(d => d.type === 'borrow');

    const collectList = document.getElementById('cat-debt-collect-list');
    if (collectList) {
      if (collectDebts.length === 0) {
        collectList.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted); padding: 6px 0;">Không có khoản nợ nào cần thu</div>';
      } else {
        collectList.innerHTML = collectDebts.map(d => `
          <div class="debt-quick-item" onclick='UITransactions.selectDebtAction("debt-collect", ${JSON.stringify(d)})'>
            <div>
              <div style="font-weight: 600; font-size: 0.88rem;">${escapeHTML(d.personName)}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${d.dueDate ? 'Ngày thu: ' + d.dueDate : 'Không có ngày thu'}</div>
            </div>
            <div style="font-weight: 700; color: var(--income); font-size: 0.95rem;">
              +${new Intl.NumberFormat('vi-VN').format(d.remainingAmount)}đ
            </div>
          </div>
        `).join('');
      }
    }

    const payList = document.getElementById('cat-debt-pay-list');
    if (payList) {
      if (payDebts.length === 0) {
        payList.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted); padding: 6px 0;">Không có khoản nợ nào cần trả</div>';
      } else {
        payList.innerHTML = payDebts.map(d => `
          <div class="debt-quick-item" onclick='UITransactions.selectDebtAction("debt-pay", ${JSON.stringify(d)})'>
            <div>
              <div style="font-weight: 600; font-size: 0.88rem;">${escapeHTML(d.personName)}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${d.dueDate ? 'Ngày trả: ' + d.dueDate : 'Không có ngày trả'}</div>
            </div>
            <div style="font-weight: 700; color: var(--warning); font-size: 0.95rem;">
              -${new Intl.NumberFormat('vi-VN').format(d.remainingAmount)}đ
            </div>
          </div>
        `).join('');
      }
    }

    if (window.lucide) lucide.createIcons();
  },

  /* ==================== BORROW PERSON SUB-PAGE ==================== */
  openBorrowSelectPage() {
    const curType = document.getElementById('tx-type-input')?.value;
    const headerTitle = document.getElementById('borrow-select-header-title');
    const searchInput = document.getElementById('borrow-search-input');
    const contactsLabel = document.getElementById('borrow-contacts-label');
    const addBtnWrapper = document.getElementById('borrow-add-new-btn-wrapper');

    if (headerTitle) {
      headerTitle.textContent = curType === 'lend' ? 'Chọn Người Vay' : 'Chọn Người Cho Vay';
    }
    if (searchInput) {
      searchInput.value = '';
      searchInput.placeholder = curType === 'lend' ? '🔍 Tìm tên hoặc thêm người vay...' : '🔍 Tìm tên hoặc thêm người cho vay...';
    }
    if (contactsLabel) {
      contactsLabel.textContent = curType === 'lend' ? 'DANH BẠ NGƯỜI VAY' : 'DANH BẠ CHỦ NỢ';
    }
    if (addBtnWrapper) addBtnWrapper.style.display = 'none';

    this.renderBorrowPeopleList('');
    if (window.app) {
      window.app.switchView('borrow-select');
    }
  },

  async renderBorrowPeopleList(filter = '') {
    const listEl = document.getElementById('borrow-people-list');
    if (!listEl) return;

    try {
      const allDebts = await db.debts.where('isDeleted').equals(0).toArray();
      const peopleMap = new Map();
      allDebts.forEach(d => {
        if (d.personName && d.personName.trim()) {
          const name = d.personName.trim();
          if (!peopleMap.has(name)) {
            peopleMap.set(name, { name, phone: d.personPhone || '', count: 1 });
          } else {
            peopleMap.get(name).count++;
          }
        }
      });

      let people = Array.from(peopleMap.values());
      const query = (filter || '').toLowerCase().trim();
      if (query) {
        people = people.filter(p => p.name.toLowerCase().includes(query) || (p.phone && p.phone.includes(query)));
      }

      const addBtnWrapper = document.getElementById('borrow-add-new-btn-wrapper');
      const addBtnText = document.getElementById('borrow-add-new-btn-text');
      const hasExactMatch = people.some(p => p.name.toLowerCase() === query);

      if (query && !hasExactMatch) {
        if (addBtnWrapper) addBtnWrapper.style.display = 'block';
        if (addBtnText) addBtnText.textContent = `Thêm & chọn "${filter.trim()}"`;
      } else {
        if (addBtnWrapper) addBtnWrapper.style.display = 'none';
      }

      if (people.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 24px 12px; color: var(--text-muted); font-size: 0.88rem;">
            Chưa có người này trong danh sách.<br>
            Bấm nút phía trên để thêm trực tiếp!
          </div>
        `;
      } else {
        listEl.innerHTML = people.map(p => `
          <div class="borrow-person-item" onclick="UITransactions.selectBorrowPerson('${escapeHTML(p.name)}')">
            <div class="borrow-person-avatar">
              <i data-lucide="user"></i>
            </div>
            <div class="borrow-person-info">
              <div class="borrow-person-name">${escapeHTML(p.name)}</div>
              <div class="borrow-person-sub">${p.phone ? p.phone + ' • ' : ''}${p.count} giao dịch trước đó</div>
            </div>
            <i data-lucide="chevron-right" style="width: 16px; height: 16px; color: var(--text-muted);"></i>
          </div>
        `).join('');
      }

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error('Error rendering borrow people list:', err);
    }
  },

  handleBorrowSearch(query) {
    this.renderBorrowPeopleList(query);
  },

  confirmNewBorrowPerson() {
    const input = document.getElementById('borrow-search-input');
    const name = input ? input.value.trim() : '';
    if (!name) {
      showToast('Vui lòng nhập tên người', 'error');
      return;
    }
    this.selectBorrowPerson(name);
  },

  selectBorrowPerson(personName) {
    const curType = document.getElementById('tx-type-input')?.value;
    const noteInput = document.getElementById('tx-note-input');

    if (curType === 'lend' || curType === 'borrow') {
      const personInput = document.getElementById('tx-person-input');
      const personTitle = document.getElementById('tx-debt-person-title');
      const personDisplay = document.getElementById('tx-debt-person-display');
      const personRow = document.getElementById('tx-debt-person-row');
      const dueRow = document.getElementById('tx-debt-due-row');

      if (personInput) personInput.value = personName;
      if (personRow) personRow.style.display = 'flex';
      if (dueRow) dueRow.style.display = 'flex';
      const dueInput = document.getElementById('tx-due-date-input');
      if (dueInput) {
        dueInput.placeholder = curType === 'lend' ? 'Ngày thu nợ' : 'Ngày trả nợ';
      }

      const subBox = document.getElementById('tx-selected-cat-subtext');
      if (subBox) subBox.textContent = 'Chọn danh mục';
      const haydungContainer = document.getElementById('tx-haydung-container');
      if (haydungContainer) haydungContainer.style.display = 'none';

      if (curType === 'lend') {
        if (personTitle) personTitle.textContent = 'Người vay';
        if (personDisplay) personDisplay.textContent = personName;
        if (noteInput && (!noteInput.value || noteInput.value.startsWith('Cho ') || noteInput.value.startsWith('Vay '))) {
          noteInput.value = `Cho ${personName} vay`;
        }
      } else {
        if (personTitle) personTitle.textContent = 'Người cho vay';
        if (personDisplay) personDisplay.textContent = personName;
        if (noteInput && (!noteInput.value || noteInput.value.startsWith('Cho ') || noteInput.value.startsWith('Vay '))) {
          noteInput.value = `Vay ${personName}`;
        }
      }

      showToast(`Đã chọn: ${personName}`, 'info');
      this.saveDraft();
      if (window.app) {
        window.app.switchView('new-transaction');
      }
      return;
    }

    // Default: "Đi vay để trả" in expense extra details
    const checkbox = document.getElementById('tx-is-borrowed-checkbox');
    const input = document.getElementById('tx-borrow-person-input');
    const statusText = document.getElementById('tx-borrow-status-text');
    const badge = document.getElementById('tx-borrow-selected-badge');
    const clearBtn = document.getElementById('tx-borrow-clear-btn');
    const dueDateRow = document.getElementById('borrow-due-date-row');

    if (checkbox) checkbox.checked = true;
    if (input) input.value = personName;
    if (statusText) statusText.textContent = `Đi vay: ${personName}`;
    if (badge) {
      badge.textContent = personName;
      badge.style.display = 'inline-flex';
    }
    if (clearBtn) clearBtn.style.display = 'inline-flex';
    if (dueDateRow) dueDateRow.style.display = 'block';
    if (noteInput && !noteInput.value) {
      noteInput.value = `Vay ${personName}`;
    }

    showToast(`Đã chọn: ${personName}`, 'info');
    this.saveDraft();
    if (window.app) {
      window.app.switchView('new-transaction');
    }
  },

  clearBorrowPerson(e) {
    if (e) e.stopPropagation();
    const checkbox = document.getElementById('tx-is-borrowed-checkbox');
    const input = document.getElementById('tx-borrow-person-input');
    const statusText = document.getElementById('tx-borrow-status-text');
    const badge = document.getElementById('tx-borrow-selected-badge');
    const clearBtn = document.getElementById('tx-borrow-clear-btn');
    const dueDateRow = document.getElementById('borrow-due-date-row');
    const dueDateInput = document.getElementById('tx-borrow-due-date-input');

    if (checkbox) checkbox.checked = false;
    if (input) input.value = '';
    if (statusText) statusText.textContent = 'Chọn người cho vay';
    if (badge) badge.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
    if (dueDateRow) dueDateRow.style.display = 'none';
    if (dueDateInput) {
      dueDateInput.value = '';
      dueDateInput.dataset.rawDate = '';
    }
    this.saveDraft();
  },

  toggleExtraDetails(forceOpen = null) {
    const body = document.getElementById('extra-details-body');
    const chevron = document.getElementById('extra-details-chevron');
    if (!body) return;
    const isHidden = body.style.display === 'none' || !body.style.display;
    const shouldOpen = forceOpen !== null ? forceOpen : isHidden;
    if (shouldOpen) {
      body.style.display = 'block';
      if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
      body.style.display = 'none';
      if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
    this.saveDraft();
  },

  async openPayeePrompt() {
    const personInput = document.getElementById('tx-person-input');
    const payeeDisplay = document.getElementById('tx-payee-display');
    const clearBtn = document.getElementById('btn-clear-tx-payee');
    const currentVal = personInput?.value || '';

    let name = null;
    if (typeof showPrompt === 'function') {
      name = await showPrompt('Người nhận / Chi cho ai:', currentVal, 'Nhập tên người nhận...');
    } else {
      name = prompt('Người nhận / Chi cho ai:', currentVal);
    }

    if (name !== null) {
      name = name.trim();
      if (personInput) personInput.value = name;
      if (payeeDisplay) payeeDisplay.textContent = name || 'Chưa chọn ai';
      if (clearBtn) clearBtn.style.display = name ? 'inline-flex' : 'none';
      this.saveDraft();
    }
  },

  clearPayee(e) {
    if (e) e.stopPropagation();
    const personInput = document.getElementById('tx-person-input');
    const payeeDisplay = document.getElementById('tx-payee-display');
    const clearBtn = document.getElementById('btn-clear-tx-payee');
    if (personInput) personInput.value = '';
    if (payeeDisplay) payeeDisplay.textContent = 'Chưa chọn ai';
    if (clearBtn) clearBtn.style.display = 'none';
    this.saveDraft();
  },

  /* ==================== CATEGORY MANAGER CRUD ==================== */
  async openCategoryManager() {
    const modal = document.getElementById('modal-category-manager');
    if (!modal) return;
    this.resetCategoryForm();
    await this.renderCategoryManagerList();
    modal.classList.add('open');
  },

  closeCategoryManager() {
    const modal = document.getElementById('modal-category-manager');
    if (modal) modal.classList.remove('open');
    this.renderQuickCategories();
  },

  openAddCategoryModal(type = 'expense') {
    this.closeCategoryPicker();
    this.openCategoryManager();
    const typeSelect = document.getElementById('cat-crud-type');
    if (typeSelect) typeSelect.value = type;
  },

  resetCategoryForm() {
    this.editingCatId = null;
    const form = document.getElementById('category-crud-form');
    if (form) form.reset();
    document.getElementById('cat-crud-id').value = '';
    document.getElementById('cat-crud-form-title').textContent = 'Thêm Danh Mục Mới';
    document.getElementById('btn-cancel-cat-crud').style.display = 'none';
  },

  async handleCategoryFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('cat-crud-id').value;
    const name = document.getElementById('cat-crud-name').value.trim();
    const type = document.getElementById('cat-crud-type').value;
    const color = document.getElementById('cat-crud-color').value;
    const icon = document.getElementById('cat-crud-icon').value;
    const isQuick = document.getElementById('cat-crud-is-quick').checked ? 1 : 0;

    if (!name) {
      showToast('Vui lòng nhập tên danh mục', 'error');
      return;
    }

    if (id) {
      const cat = await db.categories.get(Number(id));
      if (cat && (cat.isSystem || cat.systemKey)) {
        showToast('Danh mục hệ thống được bảo vệ, không thể sửa đổi!', 'warning');
        return;
      }
      await updateCategory(id, { name, type, color, icon, isQuick });
      showToast('Đã cập nhật danh mục', 'success');
    } else {
      await addCategory({ name, type, color, icon, isQuick });
      showToast('Đã tạo danh mục mới', 'success');
    }

    this.resetCategoryForm();
    await this.renderCategoryManagerList();
    await this.renderQuickCategories();
  },

  async editCategory(id) {
    const cat = await db.categories.get(Number(id));
    if (!cat) return;
    if (cat.isSystem || cat.systemKey) {
      showToast('Danh mục hệ thống được bảo vệ, không thể chỉnh sửa!', 'warning');
      return;
    }
    this.editingCatId = cat.id;
    document.getElementById('cat-crud-id').value = cat.id;
    document.getElementById('cat-crud-name').value = cat.name;
    document.getElementById('cat-crud-type').value = cat.type;
    document.getElementById('cat-crud-color').value = cat.color || '#6366f1';
    document.getElementById('cat-crud-icon').value = cat.icon || 'tag';
    document.getElementById('cat-crud-is-quick').checked = cat.isQuick === 1;

    document.getElementById('cat-crud-form-title').textContent = `Sửa: ${cat.name}`;
    document.getElementById('btn-cancel-cat-crud').style.display = 'inline-block';
    document.getElementById('cat-crud-name').focus();
  },

  async deleteCategory(id) {
    const cat = await db.categories.get(Number(id));
    if (!cat) return;
    if (cat.isSystem || cat.systemKey) {
      showToast('Danh mục hệ thống được bảo vệ, không thể xóa!', 'warning');
      return;
    }
    const ok = await showConfirm({
      title: 'Xoá Danh Mục',
      message: 'Bạn có chắc muốn xóa danh mục này?<br><br><span style="color: var(--text-muted); font-size: 0.85rem;">Các giao dịch cũ vẫn được giữ nguyên.</span>',
      confirmText: 'Xoá Danh Mục',
      cancelText: 'Huỷ',
      danger: true,
      icon: 'trash-2'
    });
    if (ok) {
      await deleteCategory(id);
      showToast('Đã xóa danh mục', 'info');
      await this.renderCategoryManagerList();
      await this.renderQuickCategories();
    }
  },

  async toggleQuickCategory(id, isQuick) {
    await updateCategory(id, { isQuick: isQuick ? 1 : 0 });
    await this.renderCategoryManagerList();
    await this.renderQuickCategories();
  },

  async renderCategoryManagerList() {
    const container = document.getElementById('cat-manager-list');
    if (!container) return;

    const cats = await db.categories.where('isDeleted').equals(0).toArray();
    container.innerHTML = cats.map(c => {
      const isSys = !!(c.isSystem || c.systemKey);
      return `
      <div class="cat-manager-row">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="quick-cat-icon" style="background: ${c.color}22; color: ${c.color}; width: 32px; height: 32px;">
            <i data-lucide="${c.icon || 'tag'}" style="width: 16px; height: 16px;"></i>
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-weight: 600; font-size: 0.88rem;">${escapeHTML(c.name)}</span>
              ${isSys ? `
                <span title="Danh mục hệ thống cố định, được bảo vệ không thể sửa/xóa" style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.68rem; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: rgba(99, 102, 241, 0.12); color: var(--primary);">
                  <i data-lucide="lock" style="width: 10px; height: 10px;"></i> Hệ thống
                </span>
              ` : ''}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${c.type === 'expense' ? 'Chi Tiêu' : 'Thu Nhập'}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button type="button" class="btn-icon" title="${c.isQuick ? 'Bỏ ghim chọn nhanh' : 'Ghim vào chọn nhanh'}" onclick="UITransactions.toggleQuickCategory(${c.id}, ${!c.isQuick})">
            <i data-lucide="${c.isQuick ? 'pin-off' : 'pin'}" style="width: 16px; height: 16px; color: ${c.isQuick ? 'var(--primary)' : 'var(--text-muted)'};"></i>
          </button>
          ${isSys ? `
            <span title="Danh mục hệ thống cố định, được bảo vệ an toàn (không cho sửa/xóa)" style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; color: var(--text-muted); opacity: 0.7; cursor: not-allowed;">
              <i data-lucide="lock" style="width: 15px; height: 15px;"></i>
            </span>
          ` : `
            <button type="button" class="btn-icon" title="Sửa danh mục" onclick="UITransactions.editCategory(${c.id})"><i data-lucide="edit-2" style="width: 16px; height: 16px;"></i></button>
            <button type="button" class="btn-icon" title="Xóa danh mục" onclick="UITransactions.deleteCategory(${c.id})"><i data-lucide="trash-2" style="width: 16px; height: 16px; color: var(--expense);"></i></button>
          `}
        </div>
      </div>
    `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  /* ==================== COLLAPSIBLE DETAILS (PHÍ & ĐI VAY) ==================== */

  toggleBorrowFields() {
    const cb = document.getElementById('tx-is-borrowed-checkbox');
    const fields = document.getElementById('borrow-fields-expand');
    if (!cb || !fields) return;
    fields.style.display = cb.checked ? 'flex' : 'none';
  },

  /* ==================== ACCOUNTS ==================== */
  async populateAccounts(selectedFromId = null, selectedToId = null) {
    const fromSelect = document.getElementById('tx-account-select');
    const toSelect = document.getElementById('tx-to-account-select');
    const dropdownList = document.getElementById('tx-account-dropdown-list');
    const toDropdownList = document.getElementById('tx-to-account-dropdown-list');
    if (!fromSelect) return;

    const accounts = (await db.accounts.toArray()).filter(a => !a.isDeleted || a.isDeleted === 0);
    accounts.sort((a, b) => {
      const oA = a.order !== undefined && a.order !== null ? a.order : 999;
      const oB = b.order !== undefined && b.order !== null ? b.order : 999;
      if (oA !== oB) return oA - oB;
      return (a.id || 0) - (b.id || 0);
    });

    const iconMap = {
      cash: { icon: 'wallet', color: '#10b981' },
      bank: { icon: 'landmark', color: '#4f46e5' },
      ewallet: { icon: 'smartphone', color: '#ec4899' },
      credit: { icon: 'credit-card', color: '#f59e0b' },
      saving: { icon: 'piggy-bank', color: '#0ea5e9' }
    };

    // Default to first active writable account if none selected
    const writableAccounts = accounts.filter(a => !a.isArchived && (!a._isSharedItem || a._sharedRole === 'editor'));
    const nonArchived = accounts.filter(a => !a.isArchived);
    const defaultAccountPool = writableAccounts.length > 0 ? writableAccounts : nonArchived;
    const defaultAcc = defaultAccountPool.length > 0 ? defaultAccountPool[0] : (accounts.length > 0 ? accounts[0] : null);

    const selectedFromAcc = selectedFromId ? accounts.find(a => String(a.id) === String(selectedFromId)) : null;
    const isSelectedFromValid = selectedFromAcc && (!selectedFromAcc.isArchived || String(selectedFromAcc.id) === String(selectedFromId)) && (!selectedFromAcc._isSharedItem || selectedFromAcc._sharedRole === 'editor');
    const activeFromId = isSelectedFromValid ? selectedFromId : (defaultAcc ? defaultAcc.id : null);

    if (selectedFromId && !isSelectedFromValid && String(this.userSelectedAccountId) === String(selectedFromId)) {
      this.userChangedAccount = false;
      this.userSelectedAccountId = null;
    }

    let activeToId = selectedToId;
    const selectedToAcc = selectedToId ? accounts.find(a => String(a.id) === String(selectedToId)) : null;
    const isSelectedToValid = selectedToAcc && (!selectedToAcc.isArchived || String(selectedToAcc.id) === String(selectedToId)) && (!selectedToAcc._isSharedItem || selectedToAcc._sharedRole === 'editor');

    if (!isSelectedToValid) {
      if (defaultAccountPool.length > 1) {
        activeToId = (defaultAccountPool.find(a => String(a.id) !== String(activeFromId)) || defaultAccountPool[1])?.id || null;
      } else if (defaultAccountPool.length === 1) {
        activeToId = defaultAccountPool[0].id;
      } else {
        activeToId = accounts.length > 0 ? accounts[0].id : null;
      }
    }

    // Filter out archived accounts unless they are already selected
    const availableAccounts = accounts.filter(a => !a.isArchived || String(a.id) === String(activeFromId) || String(a.id) === String(activeToId));

    // Populate hidden native select for form reading
    const options = accounts.map(a => {
      const shareTag = a._isSharedItem ? ` (Được chia sẻ${a._sharedFrom ? ' - ' + a._sharedFrom : ''}${a._sharedRole === 'editor' ? ' [Quyền ghi]' : ' [Chỉ xem]'})` : '';
      const descTag = a.description ? ` [${a.description}]` : '';
      return `<option value="${a.id}">${escapeHTML(a.name)}${shareTag}${descTag}</option>`;
    }).join('');
    fromSelect.innerHTML = options;
    if (toSelect) toSelect.innerHTML = options;

    if (activeFromId) fromSelect.value = activeFromId;
    if (activeToId && toSelect) toSelect.value = activeToId;

    // Populate custom dropdown list for source account
    if (dropdownList) {
      dropdownList.innerHTML = availableAccounts.map(a => {
        const info = iconMap[a.type] || { icon: 'wallet', color: '#4f46e5' };
        const bal = new Intl.NumberFormat('vi-VN').format(a.balance);
        const isSelected = String(activeFromId) === String(a.id);
        const isSharedItem = !!a._isSharedItem;
        const isSharedByMe = !isSharedItem && (a.isShared === 1 || a.isShared === true);
        const isEditor = isSharedItem ? (a._sharedRole === 'editor') : true;
        const isReadOnly = isSharedItem && !isEditor;

        const miniShareIndicator = isSharedItem
          ? `<div class="mini-share-indicator shared" style="position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; color: #fff; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); font-size: 7px;" title="Được chia sẻ"><i data-lucide="share-2" style="width: 7px; height: 7px;"></i></div>`
          : (isSharedByMe ? `<div class="mini-share-indicator owner" style="position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); font-size: 7px;" title="Đang chia sẻ"><i data-lucide="share-2" style="width: 7px; height: 7px;"></i></div>` : '');

        const badgeHtml = window.UIAccounts ? `<div style="position: relative; display: inline-flex;">${window.UIAccounts.renderLogoBadge(a, 32)}${miniShareIndicator}</div>` : `
          <div class="tx-info-icon-bubble" style="background:${info.color}22; color:${info.color}; width:32px; height:32px; flex-shrink:0; position: relative; display: inline-flex;">
            <i data-lucide="${info.icon}" style="width:16px;height:16px;"></i>${miniShareIndicator}
          </div>`;

        const shareTag = isSharedItem
          ? ` <span style="font-size:0.68rem; color:#3b82f6; font-weight:600; background:rgba(59,130,246,0.12); padding:1px 5px; border-radius:4px; display:inline-flex; align-items:center; gap:2px;" title="Từ: ${escapeHTML(a._sharedFrom || 'Thành viên')}"><i data-lucide="share-2" style="width:8px;height:8px;"></i> Từ: ${escapeHTML(a._sharedFrom || 'Thành viên')}</span>`
          : '';

        const roleBadge = (window.UIAccounts && typeof window.UIAccounts.renderSharedRoleBadge === 'function')
          ? window.UIAccounts.renderSharedRoleBadge(a, !isReadOnly)
          : '';

        const subNotes = [];
        if (a.description && a.description.trim()) subNotes.push(escapeHTML(a.description.trim()));
        const subNoteStr = subNotes.length > 0 ? ` • ${subNotes.join(' • ')}` : '';

        return `
          <div class="tx-account-option ${isReadOnly ? 'disabled-readonly' : ''}" data-id="${a.id}" data-name="${a.name}" data-type="${a.type || 'cash'}" onclick="UITransactions.selectAccount(${a.id}, '${a.name}', '${a.type || 'cash'}')"
               style="${isSelected ? 'background:rgba(255,255,255,0.08);' : ''} ${isReadOnly ? 'opacity:0.55; cursor:not-allowed;' : ''}">
            ${badgeHtml}
            <div style="flex:1; min-width:0;">
              <div style="font-size:0.9rem; font-weight:600; color:var(--text-primary); display: flex; align-items: center; gap: 4px; overflow: hidden;"><span style="white-space: nowrap; overflow: hidden; text-overflow: clip;">${escapeHTML(a.name)}</span>${roleBadge}${shareTag}</div>
              <div style="font-size:0.78rem; color:var(--text-muted);">${bal}₫${subNoteStr}</div>
            </div>
            ${isSelected ? '<i data-lucide="check" style="width:16px;height:16px;color:var(--primary);flex-shrink:0;"></i>' : ''}
          </div>`;
      }).join('');
    }

    // Populate custom dropdown list for destination account
    if (toDropdownList) {
      toDropdownList.innerHTML = availableAccounts.map(a => {
        const info = iconMap[a.type] || { icon: 'wallet', color: '#4f46e5' };
        const bal = new Intl.NumberFormat('vi-VN').format(a.balance);
        const isSelected = String(activeToId) === String(a.id);
        const isSharedItem = !!a._isSharedItem;
        const isSharedByMe = !isSharedItem && (a.isShared === 1 || a.isShared === true);
        const isEditor = isSharedItem ? (a._sharedRole === 'editor') : true;
        const isReadOnly = isSharedItem && !isEditor;

        const miniShareIndicator = isSharedItem
          ? `<div class="mini-share-indicator shared" style="position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; color: #fff; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); font-size: 7px;" title="Được chia sẻ"><i data-lucide="share-2" style="width: 7px; height: 7px;"></i></div>`
          : (isSharedByMe ? `<div class="mini-share-indicator owner" style="position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); font-size: 7px;" title="Đang chia sẻ"><i data-lucide="share-2" style="width: 7px; height: 7px;"></i></div>` : '');

        const badgeHtml = window.UIAccounts ? `<div style="position: relative; display: inline-flex;">${window.UIAccounts.renderLogoBadge(a, 32)}${miniShareIndicator}</div>` : `
          <div class="tx-info-icon-bubble" style="background:${info.color}22; color:${info.color}; width:32px; height:32px; flex-shrink:0; position: relative; display: inline-flex;">
            <i data-lucide="${info.icon}" style="width:16px;height:16px;"></i>${miniShareIndicator}
          </div>`;

        const shareTag = isSharedItem
          ? ` <span style="font-size:0.68rem; color:#3b82f6; font-weight:600; background:rgba(59,130,246,0.12); padding:1px 5px; border-radius:4px; display:inline-flex; align-items:center; gap:2px;" title="Từ: ${escapeHTML(a._sharedFrom || 'Thành viên')}"><i data-lucide="share-2" style="width:8px;height:8px;"></i> Từ: ${escapeHTML(a._sharedFrom || 'Thành viên')}</span>`
          : '';

        const roleBadge = (window.UIAccounts && typeof window.UIAccounts.renderSharedRoleBadge === 'function')
          ? window.UIAccounts.renderSharedRoleBadge(a, !isReadOnly)
          : '';

        const subNotes = [];
        if (a.description && a.description.trim()) subNotes.push(escapeHTML(a.description.trim()));
        const subNoteStr = subNotes.length > 0 ? ` • ${subNotes.join(' • ')}` : '';

        return `
          <div class="tx-account-option ${isReadOnly ? 'disabled-readonly' : ''}" data-id="${a.id}" data-name="${a.name}" data-type="${a.type || 'cash'}" onclick="UITransactions.selectToAccount(${a.id}, '${a.name}', '${a.type || 'cash'}')"
               style="${isSelected ? 'background:rgba(255,255,255,0.08);' : ''} ${isReadOnly ? 'opacity:0.55; cursor:not-allowed;' : ''}">
            ${badgeHtml}
            <div style="flex:1; min-width:0;">
              <div style="font-size:0.9rem; font-weight:600; color:var(--text-primary); display: flex; align-items: center; gap: 4px; overflow: hidden;"><span style="white-space: nowrap; overflow: hidden; text-overflow: clip;">${escapeHTML(a.name)}</span>${roleBadge}${shareTag}</div>
              <div style="font-size:0.78rem; color:var(--text-muted);">${bal}₫${subNoteStr}</div>
            </div>
            ${isSelected ? '<i data-lucide="check" style="width:16px;height:16px;color:var(--primary);flex-shrink:0;"></i>' : ''}
          </div>`;
      }).join('');
    }

    if (window.lucide) lucide.createIcons();

    await this.updateSelectedAccountDisplay();
    await this.updateSelectedToAccountDisplay();
  },

  openSourceAccountPicker() {
    const curVal = document.getElementById('tx-account-select')?.value || '';
    const type = document.getElementById('tx-type-selector')?.value || 'expense';
    let title = 'Chọn Nguồn Tiền';
    if (type === 'income') title = 'Chọn Tài Khoản Nhận';
    else if (type === 'transfer') title = 'Chuyển Từ Tài Khoản';
    else if (type === 'borrow') title = 'Nhận Vào Tài Khoản';
    else if (type === 'lend') title = 'Trích Tiền Cho Vay';

    if (window.UIAccounts) {
      window.UIAccounts.openSourceAccountPicker({
        title: title,
        allowNone: false,
        forbidReadOnly: true,
        selectedId: curVal,
        onSelect: async (accId) => {
          if (!accId) return;
          this.userChangedAccount = true;
          if (!this.isEditing) {
            this.userSelectedAccountId = accId;
          }
          const fromSelect = document.getElementById('tx-account-select');
          if (fromSelect) fromSelect.value = accId;
          await this.updateSelectedAccountDisplay();
          this.saveDraft();
        }
      });
    }
  },

  openToAccountPicker() {
    const curVal = document.getElementById('tx-to-account-select')?.value || '';
    if (window.UIAccounts) {
      window.UIAccounts.openSourceAccountPicker({
        title: 'Chuyển Đến Tài Khoản',
        allowNone: false,
        forbidReadOnly: true,
        selectedId: curVal,
        onSelect: async (accId) => {
          if (!accId) return;
          const toSelect = document.getElementById('tx-to-account-select');
          if (toSelect) toSelect.value = accId;
          await this.updateSelectedToAccountDisplay();
          this.saveDraft();
        }
      });
    }
  },

  toggleAccountDropdown(e) {
    if (e) e.stopPropagation();
    this.openSourceAccountPicker();
  },

  closeAccountDropdown() {
    if (window.UIAccounts) window.UIAccounts.closeSourceAccountPicker();
  },

  toggleToAccountDropdown(e) {
    if (e) e.stopPropagation();
    this.openToAccountPicker();
  },

  closeToAccountDropdown() {
    if (window.UIAccounts) window.UIAccounts.closeSourceAccountPicker();
  },

  async selectAccount(id, name, type) {
    if (id) {
      const acc = await db.accounts.get(Number(id));
      if (acc && acc._isSharedItem && acc._sharedRole !== 'editor') {
        const owner = acc._sharedFrom ? ` (chia sẻ bởi ${acc._sharedFrom})` : '';
        showToast(`Tài khoản "${acc.name}"${owner} chỉ có quyền xem, bạn không thể chọn để ghi chép giao dịch!`, 'error');
        return;
      }
    }
    this.userChangedAccount = true;
    if (!this.isEditing) {
      this.userSelectedAccountId = id;
    }
    const fromSelect = document.getElementById('tx-account-select');
    if (fromSelect) fromSelect.value = id;
    this.closeAccountDropdown();
    await this.updateSelectedAccountDisplay();
    this.refreshAccountDropdownOptions();
    this.saveDraft();
  },

  async selectToAccount(id, name, type) {
    if (id) {
      const acc = await db.accounts.get(Number(id));
      if (acc && acc._isSharedItem && acc._sharedRole !== 'editor') {
        const owner = acc._sharedFrom ? ` (chia sẻ bởi ${acc._sharedFrom})` : '';
        showToast(`Tài khoản nhận "${acc.name}"${owner} chỉ có quyền xem, bạn không thể chọn để ghi chép giao dịch!`, 'error');
        return;
      }
    }
    const toSelect = document.getElementById('tx-to-account-select');
    if (toSelect) toSelect.value = id;
    this.closeToAccountDropdown();
    await this.updateSelectedToAccountDisplay();
    this.refreshAccountDropdownOptions();
    this.saveDraft();
  },

  async swapTransferAccounts(e) {
    if (e) e.stopPropagation();
    const fromSelect = document.getElementById('tx-account-select');
    const toSelect = document.getElementById('tx-to-account-select');
    if (!fromSelect || !toSelect) return;

    if (fromSelect.value) {
      const fromAcc = await db.accounts.get(Number(fromSelect.value));
      if (fromAcc && fromAcc._isSharedItem && fromAcc._sharedRole !== 'editor') {
        showToast(`Tài khoản "${fromAcc.name}" chỉ có quyền xem, không thể dùng để giao dịch!`, 'error');
        return;
      }
    }
    if (toSelect.value) {
      const toAcc = await db.accounts.get(Number(toSelect.value));
      if (toAcc && toAcc._isSharedItem && toAcc._sharedRole !== 'editor') {
        showToast(`Tài khoản "${toAcc.name}" chỉ có quyền xem, không thể dùng để giao dịch!`, 'error');
        return;
      }
    }

    const temp = fromSelect.value;
    fromSelect.value = toSelect.value;
    toSelect.value = temp;

    this.userChangedAccount = true;
    if (!this.isEditing) {
      this.userSelectedAccountId = fromSelect.value;
    }

    await this.updateSelectedAccountDisplay();
    await this.updateSelectedToAccountDisplay();
    this.refreshAccountDropdownOptions();
    this.saveDraft();
  },

  refreshAccountDropdownOptions() {
    const fromSelect = document.getElementById('tx-account-select');
    const toSelect = document.getElementById('tx-to-account-select');
    const activeFromId = fromSelect ? fromSelect.value : null;
    const activeToId = toSelect ? toSelect.value : null;

    if (activeFromId) {
      const fromOpts = document.querySelectorAll('#tx-account-dropdown-list .tx-account-option');
      fromOpts.forEach(opt => {
        const isSelected = String(opt.dataset.id) === String(activeFromId);
        opt.style.background = isSelected ? 'rgba(255,255,255,0.08)' : '';
        const checkIcon = opt.querySelector('[data-lucide="check"], svg.lucide-check');
        if (isSelected && !checkIcon) {
          opt.insertAdjacentHTML('beforeend', '<i data-lucide="check" style="width:16px;height:16px;color:var(--primary);"></i>');
        } else if (!isSelected && checkIcon) {
          checkIcon.remove();
        }
      });
    }

    if (activeToId) {
      const toOpts = document.querySelectorAll('#tx-to-account-dropdown-list .tx-account-option');
      toOpts.forEach(opt => {
        const isSelected = String(opt.dataset.id) === String(activeToId);
        opt.style.background = isSelected ? 'rgba(255,255,255,0.08)' : '';
        const checkIcon = opt.querySelector('[data-lucide="check"], svg.lucide-check');
        if (isSelected && !checkIcon) {
          opt.insertAdjacentHTML('beforeend', '<i data-lucide="check" style="width:16px;height:16px;color:var(--primary);"></i>');
        } else if (!isSelected && checkIcon) {
          checkIcon.remove();
        }
      });
    }
    if (window.lucide) lucide.createIcons();
  },


  /* ==================== OPEN ADD / EDIT VIEW ==================== */
  openModal(defaultType = 'expense') {
    if (window.app && window.app.currentView === 'new-transaction') {
      window.app.goBack();
    } else {
      this.openAddModal(defaultType);
    }
  },

  updateAmountColor(type) {
    const amountVal = document.getElementById('tx-amount-text');
    if (!amountVal) return;
    const colors = {
      expense: '#f43f5e',
      income: '#10b981',
      lend: '#10b981',
      borrow: '#f59e0b',
      transfer: '#0ea5e9',
      adjust: '#8b5cf6'
    };
    amountVal.style.color = colors[type] || '#f43f5e';
  },

  async handleHeaderTypeChange(type) {
    this.closeTypeDropdown();
    this.updateHeaderTypeDisplay(type);
    this.updateAmountColor(type);
    const selector = document.getElementById('tx-type-selector');
    if (selector) selector.value = type;

    if (type === 'expense' || type === 'income') {
      let defaultCat = null;
      if (this._categoriesCache && this._categoriesCache.length > 0) {
        defaultCat = this._categoriesCache.find(c => c.type === type);
      }
      if (!defaultCat) {
        defaultCat = await db.categories.where('type').equals(type).first();
      }
      if (defaultCat) await this.selectCategory(defaultCat);
    } else if (type === 'transfer') {
      await this.selectTransferAction();
    } else if (type === 'lend') {
      await this.selectDebtAction('lend');
    } else if (type === 'borrow') {
      await this.selectDebtAction('borrow');
    } else if (type === 'adjust') {
      this.selectAdjustAction();
    }
    this.saveDraft();
  },

  selectAdjustAction() {
    document.getElementById('tx-type-input').value = 'adjust';
    document.getElementById('tx-category-id-input').value = '';
    document.getElementById('tx-debt-subaction-input').value = '';
    document.getElementById('tx-linked-debt-id-input').value = '';
    this.updateAmountColor('adjust');

    const catCard = document.getElementById('tx-category-section-card');
    if (catCard) catCard.style.display = 'none';
    const personRow = document.getElementById('tx-debt-person-row');
    if (personRow) personRow.style.display = 'none';
    const dueRow = document.getElementById('tx-debt-due-row');
    if (dueRow) dueRow.style.display = 'none';
    const transferGroup = document.getElementById('tx-transfer-target-group');
    if (transferGroup) transferGroup.style.display = 'none';
    const fromDirTag = document.getElementById('tx-account-dir-tag');
    if (fromDirTag) fromDirTag.style.display = 'none';

    const noteInput = document.getElementById('tx-note-input');
    if (noteInput && !noteInput.value) {
      noteInput.value = 'Điều chỉnh số dư tài khoản';
    }
  },

  toggleHayDung() {
    const grid = document.getElementById('tx-quick-category-grid');
    const chevron = document.getElementById('haydung-chevron');
    if (!grid) return;
    const isHidden = grid.style.display === 'none';
    if (isHidden) {
      grid.style.display = 'grid';
      if (chevron) chevron.style.transform = 'rotate(0deg)';
    } else {
      grid.style.display = 'none';
      if (chevron) chevron.style.transform = 'rotate(180deg)';
    }
  },

  formatDateTimeDisplay(dateStr, timeStr) {
    try {
      let d;
      if (dateStr) {
        const [y, m, day] = dateStr.split('-').map(Number);
        const [h, min] = (timeStr || '00:00').split(':').map(Number);
        d = new Date(y, m - 1, day, h || 0, min || 0);
      } else {
        d = new Date();
      }
      const dayOfWeek = d.getDay();
      const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
      const dayText = dayNames[dayOfWeek];
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return {
        dateText: `${dayText} - ${dd}/${mm}/${yyyy}`,
        timeText: `${hh}:${min}`,
        fullText: `${dayText} - ${dd}/${mm}/${yyyy}  ${hh}:${min}`
      };
    } catch (e) {
      return {
        dateText: dateStr || '',
        timeText: timeStr || '',
        fullText: `${dateStr || ''} ${timeStr || ''}`
      };
    }
  },

  updateDateTimeDisplays(dateStr, timeStr) {
    const formatted = this.formatDateTimeDisplay(dateStr, timeStr);
    const dateEl = document.getElementById('tx-date-display');
    const timeEl = document.getElementById('tx-time-display');
    const fullEl = document.getElementById('tx-datetime-display');
    if (dateEl) dateEl.textContent = formatted.dateText;
    if (timeEl) timeEl.textContent = formatted.timeText;
    if (fullEl) fullEl.textContent = formatted.fullText;
    this.updateCategoryBudgetDisplay();
  },

  updateCategoryBudgetDisplay() {
    if (!this.selectedCategory || this.selectedCategory.type !== 'expense') return;
    const subBox = document.getElementById('tx-selected-cat-subtext');
    if (!subBox) return;
    if (window.UIBudgets && typeof window.UIBudgets.getCategoryBudgetInfo === 'function') {
      const curDate = document.getElementById('tx-date-input')?.dataset?.rawDate || document.getElementById('tx-date-input')?.value || null;
      window.UIBudgets.getCategoryBudgetInfo(this.selectedCategory.id, curDate).then(info => {
        if (info && info.text) {
          subBox.textContent = info.text;
          subBox.style.color = info.isOver ? 'var(--expense)' : 'var(--income)';
        } else {
          subBox.textContent = 'Chọn danh mục';
          subBox.style.color = 'var(--text-muted)';
        }
      }).catch(() => {
        subBox.textContent = 'Chọn danh mục';
        subBox.style.color = 'var(--text-muted)';
      });
    }
  },

  handleNativeDateTimeChange(val) {
    if (!val) return;
    const [d, t] = val.split('T');
    if (d) document.getElementById('tx-date-input').value = d;
    if (t) document.getElementById('tx-time-input').value = t;
    this.updateDateTimeDisplays(d, t);
  },

  openDateTimePicker() {
    const curDate = document.getElementById('tx-date-input')?.value || getLocalDateStr();
    const curTime = document.getElementById('tx-time-input')?.value || '12:00';

    const cal = window.UICalendar || (typeof UICalendar !== 'undefined' ? UICalendar : null);
    if (cal) {
      cal.open({
        mode: 'datetime',
        initialDate: curDate,
        initialTime: curTime,
        onSelect: (d, t) => {
          const dateInput = document.getElementById('tx-date-input');
          const timeInput = document.getElementById('tx-time-input');
          if (dateInput) dateInput.value = d;
          if (timeInput) timeInput.value = t;
          this.updateDateTimeDisplays(d, t);
          this.saveDraft();
        }
      });
    } else {
      console.warn('UICalendar is not loaded');
    }
  },

  openDueDatePicker() {
    const input = document.getElementById('tx-due-date-input');
    const curVal = input?.dataset.rawDate || input?.value || '';

    const cal = window.UICalendar || (typeof UICalendar !== 'undefined' ? UICalendar : null);
    if (cal) {
      cal.open({
        mode: 'date',
        initialDate: curVal,
        onSelect: (d) => {
          if (!input) return;
          input.dataset.rawDate = d;
          const [y, m, day] = d.split('-');
          input.value = `${day}/${m}/${y}`;
          this.saveDraft();
        }
      });
    }
  },

  openBorrowDueDatePicker() {
    const input = document.getElementById('tx-borrow-due-date-input');
    const curVal = input?.dataset.rawDate || input?.value || '';

    const cal = window.UICalendar || (typeof UICalendar !== 'undefined' ? UICalendar : null);
    if (cal) {
      cal.open({
        mode: 'date',
        initialDate: curVal,
        onSelect: (d) => {
          if (!input) return;
          input.dataset.rawDate = d;
          const [y, m, day] = d.split('-');
          input.value = `${day}/${m}/${y}`;
          this.saveDraft();
        }
      });
    }
  },

  async updateSelectedAccountDisplay() {
    const fromSelect = document.getElementById('tx-account-select');
    const bubble = document.getElementById('tx-account-icon-bubble');
    const label = document.getElementById('tx-account-label');
    const balanceEl = document.getElementById('tx-account-balance');
    if (!fromSelect || !bubble) return;
    const accId = Number(fromSelect.value);
    if (!accId) {
      if (label) label.textContent = 'Chọn tài khoản';
      if (balanceEl) balanceEl.textContent = 'Số dư: 0đ';
      return;
    }
    const acc = await db.accounts.get(accId);
    if (acc) {
      if (acc._isSharedItem && acc._sharedRole !== 'editor') {
        const writableAccs = (await db.accounts.toArray()).filter(a => !a.isDeleted && !a.isArchived && (!a._isSharedItem || a._sharedRole === 'editor'));
        if (writableAccs.length > 0) {
          fromSelect.value = writableAccs[0].id;
          return this.updateSelectedAccountDisplay();
        }
      }
      const iconMap = {
        cash: { icon: 'wallet', color: '#10b981' },
        bank: { icon: 'landmark', color: '#4f46e5' },
        ewallet: { icon: 'smartphone', color: '#ec4899' },
        credit: { icon: 'credit-card', color: '#f59e0b' },
        saving: { icon: 'piggy-bank', color: '#0ea5e9' }
      };
      const info = iconMap[acc.type] || { icon: acc.icon || 'wallet', color: acc.color || '#4f46e5' };
      const isSharedItem = !!acc._isSharedItem;
      const isSharedByMe = !isSharedItem && (acc.isShared === 1 || acc.isShared === true);

      const miniShareIndicator = isSharedItem
        ? `<div class="mini-share-indicator shared" style="position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; color: #fff; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); font-size: 7px;" title="Được chia sẻ"><i data-lucide="share-2" style="width: 7px; height: 7px;"></i></div>`
        : (isSharedByMe ? `<div class="mini-share-indicator owner" style="position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); font-size: 7px;" title="Đang chia sẻ"><i data-lucide="share-2" style="width: 7px; height: 7px;"></i></div>` : '');

      if (window.UIAccounts) {
        bubble.innerHTML = `<div style="position: relative; display: inline-flex;">${window.UIAccounts.renderLogoBadge(acc, 32)}${miniShareIndicator}</div>`;
        bubble.style.background = 'transparent';
      } else {
        bubble.innerHTML = `<div style="position: relative; display: inline-flex;"><i data-lucide="${info.icon}" style="width: 18px; height: 18px;"></i>${miniShareIndicator}</div>`;
        bubble.style.background = `${info.color}22`;
        bubble.style.color = info.color;
      }

      let shareBadge = '';
      if (isSharedItem) {
        const owner = acc._sharedFrom || 'Thành viên';
        shareBadge = `<span style="font-size: 0.68rem; color: #3b82f6; font-weight: 600; background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.25); padding: 1px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;" title="Từ: ${escapeHTML(owner)}"><i data-lucide="share-2" style="width: 9px; height: 9px;"></i> Từ: ${escapeHTML(owner)}</span>`;
      }

      const roleBadge = (window.UIAccounts && typeof window.UIAccounts.renderSharedRoleBadge === 'function')
        ? window.UIAccounts.renderSharedRoleBadge(acc)
        : '';

      if (label) {
        label.innerHTML = `<div style="display: flex; align-items: center; gap: 6px; overflow: hidden;"><span style="white-space: nowrap; overflow: hidden; text-overflow: clip; min-width: 0;">${escapeHTML(acc.name)}</span>${roleBadge}${shareBadge}</div>`;
      }

      if (balanceEl) {
        const balFormatted = new Intl.NumberFormat('vi-VN').format(acc.balance);
        const subNotes = [];
        if (acc.description && acc.description.trim()) {
          subNotes.push(escapeHTML(acc.description.trim()));
        }
        const noteStr = subNotes.length > 0 ? ` • ${subNotes.join(' • ')}` : '';
        balanceEl.innerHTML = `Số dư: ${balFormatted}đ${noteStr}`;
        balanceEl.style.color = acc.balance < 0 ? 'var(--expense)' : 'var(--text-muted)';
        try {
          localStorage.setItem('stc_last_account_cache', JSON.stringify({
            id: acc.id,
            name: acc.name,
            type: acc.type,
            color: info.color
          }));
        } catch (e) {}
      }
      if (window.lucide) lucide.createIcons();
    }
  },

  async updateSelectedToAccountDisplay() {
    const toSelect = document.getElementById('tx-to-account-select');
    const bubble = document.getElementById('tx-to-account-icon-bubble');
    const label = document.getElementById('tx-to-account-label');
    const balanceEl = document.getElementById('tx-to-account-balance');
    if (!toSelect || !bubble) return;
    const accId = Number(toSelect.value);
    if (!accId) {
      if (label) label.textContent = 'Chọn tài khoản nhận';
      if (balanceEl) balanceEl.textContent = 'Số dư: 0đ';
      return;
    }
    const acc = await db.accounts.get(accId);
    if (acc) {
      if (acc._isSharedItem && acc._sharedRole !== 'editor') {
        const fromSelect = document.getElementById('tx-account-select');
        const fromId = fromSelect ? fromSelect.value : null;
        const writableAccs = (await db.accounts.toArray()).filter(a => !a.isDeleted && !a.isArchived && String(a.id) !== String(fromId) && (!a._isSharedItem || a._sharedRole === 'editor'));
        if (writableAccs.length > 0) {
          toSelect.value = writableAccs[0].id;
          return this.updateSelectedToAccountDisplay();
        }
      }
      const iconMap = {
        cash: { icon: 'wallet', color: '#10b981' },
        bank: { icon: 'landmark', color: '#4f46e5' },
        ewallet: { icon: 'smartphone', color: '#ec4899' },
        credit: { icon: 'credit-card', color: '#f59e0b' },
        saving: { icon: 'piggy-bank', color: '#0ea5e9' }
      };
      const info = iconMap[acc.type] || { icon: acc.icon || 'landmark', color: acc.color || '#4f46e5' };
      const isSharedItem = !!acc._isSharedItem;
      const isSharedByMe = !isSharedItem && (acc.isShared === 1 || acc.isShared === true);

      const miniShareIndicator = isSharedItem
        ? `<div class="mini-share-indicator shared" style="position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; color: #fff; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); font-size: 7px;" title="Được chia sẻ"><i data-lucide="share-2" style="width: 7px; height: 7px;"></i></div>`
        : (isSharedByMe ? `<div class="mini-share-indicator owner" style="position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); font-size: 7px;" title="Đang chia sẻ"><i data-lucide="share-2" style="width: 7px; height: 7px;"></i></div>` : '');

      if (window.UIAccounts) {
        bubble.innerHTML = `<div style="position: relative; display: inline-flex;">${window.UIAccounts.renderLogoBadge(acc, 32)}${miniShareIndicator}</div>`;
        bubble.style.background = 'transparent';
      } else {
        bubble.innerHTML = `<div style="position: relative; display: inline-flex;"><i data-lucide="${info.icon}" style="width: 18px; height: 18px;"></i>${miniShareIndicator}</div>`;
        bubble.style.background = `${info.color}22`;
        bubble.style.color = info.color;
      }

      let shareBadge = '';
      if (isSharedItem) {
        const owner = acc._sharedFrom || 'Thành viên';
        shareBadge = `<span style="font-size: 0.68rem; color: #3b82f6; font-weight: 600; background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.25); padding: 1px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;" title="Từ: ${escapeHTML(owner)}"><i data-lucide="share-2" style="width: 9px; height: 9px;"></i> Từ: ${escapeHTML(owner)}</span>`;
      }

      const roleBadge = (window.UIAccounts && typeof window.UIAccounts.renderSharedRoleBadge === 'function')
        ? window.UIAccounts.renderSharedRoleBadge(acc)
        : '';

      if (label) {
        label.innerHTML = `<div style="display: flex; align-items: center; gap: 6px; overflow: hidden;"><span style="white-space: nowrap; overflow: hidden; text-overflow: clip; min-width: 0;">${escapeHTML(acc.name)}</span>${roleBadge}${shareBadge}</div>`;
      }

      if (balanceEl) {
        const balFormatted = new Intl.NumberFormat('vi-VN').format(acc.balance);
        const subNotes = [];
        if (acc.description && acc.description.trim()) {
          subNotes.push(escapeHTML(acc.description.trim()));
        }
        const noteStr = subNotes.length > 0 ? ` • ${subNotes.join(' • ')}` : '';
        balanceEl.innerHTML = `Số dư: ${balFormatted}đ${noteStr}`;
        balanceEl.style.color = acc.balance < 0 ? 'var(--expense)' : 'var(--text-muted)';
      }
      if (window.lucide) lucide.createIcons();
    }
  },

  openHistoryView() {
    this.closeModal();
    if (window.app) {
      window.app.txHistorySource = 'new-transaction';
      window.app.previousView = 'new-transaction';
    }
    // Tách biệt hoàn toàn với tab tài khoản: Luôn hiển thị Tất cả tài khoản & reset toàn bộ filter
    this.resetAllFilters(false);
    if (window.app) {
      window.app.switchView('transactions');
    }
  },

  submitForm() {
    // Chặn triệt để submit nếu bàn phím vừa được ẩn trong vòng 450ms (ngăn ghost click từ nút Ẩn bàn phím)
    if (this._keypadClosedTime && (Date.now() - this._keypadClosedTime < 450)) {
      return;
    }
    // Trigger form submit event thay vì gọi trực tiếp để tránh ghi 2 lần
    const form = document.getElementById('transaction-form');
    if (form) {
      form.dispatchEvent(new Event('submit', { bubbles: false, cancelable: true }));
    } else {
      this.handleFormSubmit();
    }
  },

  /**
   * Ẩn/hiện nút Xóa và cập nhật label tùy theo chế độ thêm mới hay sửa
   * @param {boolean} isEditing - true khi đang sửa, false khi thêm mới
   * @param {number|null} txId - ID giao dịch đang sửa (chỉ dùng khi isEditing=true)
   */
  setEditMode(isEditing, txId = null) {
    this.isEditing = isEditing;
    const deleteBtn = document.getElementById('tx-delete-btn');
    const submitLabel = document.getElementById('tx-submit-label');
    const headerTitle = document.getElementById('header-page-title');
    const backBtn = document.getElementById('tx-header-back-btn');
    const historyBtn = document.getElementById('tx-header-history-btn');

    const canBack = isEditing || (window.app && window.app.openedFromAccountMenu && !!window.app.previousView);

    if (isEditing) {
      // Chế độ Sửa: hiện nút trở về trên header
      if (backBtn) backBtn.style.display = 'inline-flex';
      // Ẩn nút lịch sử trên thanh trên cùng khi sửa ghi chú
      if (historyBtn) {
        historyBtn.style.setProperty('display', 'none', 'important');
      }
      // Hiện nút Xóa (cân đối 50-50 với nút Lưu Sửa)
      if (deleteBtn) {
        deleteBtn.dataset.txId = txId;
        deleteBtn.style.display = 'flex';
      }
      if (submitLabel) submitLabel.textContent = 'Lưu';
      if (headerTitle) headerTitle.textContent = 'Chỉnh Sửa Ghi Chép';
    } else {
      // Chế độ Thêm mới: trang độc lập/cố định - ẩn nút trở về trên header (chỉ hiện khi mở từ menu 3 chấm tài khoản)
      if (backBtn) backBtn.style.display = canBack ? 'inline-flex' : 'none';
      // Nếu có nút trở về (canBack) -> ẩn nút lịch sử để không bị chật header/đè tiêu đề
      if (historyBtn) {
        if (canBack) {
          historyBtn.style.setProperty('display', 'none', 'important');
        } else {
          historyBtn.style.removeProperty('display');
          historyBtn.style.display = '';
        }
      }
      // Ẩn nút Xóa (nút Lưu Lại chiếm toàn bộ hàng)
      if (deleteBtn) {
        deleteBtn.dataset.txId = '';
        deleteBtn.style.display = 'none';
      }
      if (submitLabel) submitLabel.textContent = 'Lưu Lại';
      if (headerTitle) headerTitle.textContent = 'Ghi Chép Mới';
    }
  },

  /* ==================== FORM DRAFT AUTO-SAVE & RESTORE ==================== */
  saveDraft() {
    // Không lưu nháp nếu đang ở chế độ chỉnh sửa giao dịch cũ
    const txId = document.getElementById('tx-id-input')?.value;
    if (txId) return;

    try {
      const amount = document.getElementById('tx-amount-input')?.value || '0';
      const note = document.getElementById('tx-note-input')?.value || '';
      const person = document.getElementById('tx-person-input')?.value || '';
      const borrowPerson = document.getElementById('tx-borrow-person-input')?.value || '';
      const isBorrowed = document.getElementById('tx-is-borrowed-checkbox')?.checked || false;

      // Nếu chưa nhập số tiền và chưa nhập ghi chú/người liên quan -> Xóa nháp rỗng
      const isBlank = (!amount || amount === '0') && (!note || note.trim() === '') && !person && !borrowPerson && !isBorrowed;
      if (isBlank) {
        this.clearDraft();
        return;
      }

      const type = document.getElementById('tx-type-input')?.value || 'expense';
      const amountText = document.getElementById('tx-amount-text')?.textContent || '0';
      const categoryId = document.getElementById('tx-category-id-input')?.value || '';
      const debtSubaction = document.getElementById('tx-debt-subaction-input')?.value || '';
      const linkedDebtId = document.getElementById('tx-linked-debt-id-input')?.value || '';
      const accountId = document.getElementById('tx-account-select')?.value || '';
      const toAccountId = document.getElementById('tx-to-account-select')?.value || '';
      const date = document.getElementById('tx-date-input')?.value || '';
      const time = document.getElementById('tx-time-input')?.value || '';
      const fee = document.getElementById('tx-fee-input')?.value || '0';
      const dueDate = document.getElementById('tx-due-date-input')?.value || '';
      const dueDateRaw = document.getElementById('tx-due-date-input')?.dataset.rawDate || '';
      const borrowDueDate = document.getElementById('tx-borrow-due-date-input')?.value || '';
      const borrowDueDateRaw = document.getElementById('tx-borrow-due-date-input')?.dataset.rawDate || '';
      const extraOpen = document.getElementById('extra-details-body')?.style.display !== 'none';
      const tripId = document.getElementById('tx-trip-id-input')?.value || '';
      const splitData = document.getElementById('tx-split-data-input')?.value || '';

      const draft = {
        type,
        amount,
        amountText,
        categoryId,
        debtSubaction,
        linkedDebtId,
        accountId,
        toAccountId,
        date,
        time,
        note,
        fee,
        person,
        tripId,
        splitData,
        dueDate,
        dueDateRaw,
        isBorrowed,
        borrowPerson,
        borrowDueDate,
        borrowDueDateRaw,
        extraOpen,
        images: this.attachedImages ? [...this.attachedImages] : [],
        userChangedAccount: this.userChangedAccount,
        userSelectedAccountId: this.userSelectedAccountId || '',
        savedAt: Date.now()
      };

      sessionStorage.setItem('stc_tx_draft', JSON.stringify(draft));
      localStorage.removeItem('stc_tx_draft');
    } catch (e) {
      console.warn('Failed to save draft:', e);
    }
  },

  clearDraft() {
    try {
      sessionStorage.removeItem('stc_tx_draft');
      localStorage.removeItem('stc_tx_draft');
    } catch (e) {}
    this.attachedImages = [];
    this.renderAttachedImages();
  },

  async restoreDraft() {
    try {
      const raw = sessionStorage.getItem('stc_tx_draft') || localStorage.getItem('stc_tx_draft');
      if (localStorage.getItem('stc_tx_draft')) {
        localStorage.removeItem('stc_tx_draft');
      }
      if (!raw) return false;
      const draft = JSON.parse(raw);
      if (!draft) return false;

      // 1. Populate accounts
      if (draft.userChangedAccount && (draft.userSelectedAccountId || draft.accountId)) {
        this.userChangedAccount = true;
        this.userSelectedAccountId = draft.userSelectedAccountId || draft.accountId;
      }
      await this.populateAccounts(draft.accountId || null, draft.toAccountId || null);

      // 2. Type & Category / Subactions
      const type = draft.type || 'expense';
      document.getElementById('tx-type-input').value = type;
      const typeSelector = document.getElementById('tx-type-selector');
      if (typeSelector) typeSelector.value = type;
      this.updateHeaderTypeDisplay(type);
      this.updateAmountColor(type);

      // 3. Category / Debt action / Transfer / Adjust
      if (type === 'transfer') {
        this.selectTransferAction();
      } else if (draft.debtSubaction) {
        if (draft.linkedDebtId) {
          const debt = await db.debts.get(Number(draft.linkedDebtId));
          this.selectDebtAction(draft.debtSubaction, debt);
        } else {
          this.selectDebtAction(draft.debtSubaction);
        }
      } else if (draft.categoryId) {
        const cat = await db.categories.get(Number(draft.categoryId));
        if (cat) {
          this.selectCategory(cat);
        }
      } else if (type === 'adjust') {
        this.selectAdjustAction();
      } else {
        const defaultCat = await db.categories.where('type').equals(type).first();
        if (defaultCat) this.selectCategory(defaultCat);
      }

      // 4. Amount (restore AFTER category/action to preserve user input)
      const amountVal = draft.amount || '0';
      const amountText = draft.amountText || amountVal || '0';
      document.getElementById('tx-amount-input').value = amountVal;
      const amountEl = document.getElementById('tx-amount-text');
      if (amountEl) amountEl.textContent = amountText;

      // 5. Date & Time
      if (draft.date) {
        document.getElementById('tx-date-input').value = draft.date;
        document.getElementById('tx-time-input').value = draft.time || '00:00';
        const nativeDt = document.getElementById('tx-datetime-native');
        if (nativeDt) nativeDt.value = `${draft.date}T${draft.time || '00:00'}`;
        this.updateDateTimeDisplays(draft.date, draft.time || '00:00');
      }

      // 6. Note (restore AFTER category/action so user note is not overwritten)
      if (draft.note !== undefined) {
        document.getElementById('tx-note-input').value = draft.note;
        this.autoResizeNoteInput();
      }

      // 7. Fee
      if (draft.fee !== undefined) {
        document.getElementById('tx-fee-input').value = draft.fee;
        const feeDisplay = document.getElementById('tx-fee-display');
        if (feeDisplay) feeDisplay.textContent = draft.fee ? new Intl.NumberFormat('vi-VN').format(draft.fee) : '0';
      }

      // 8. Person & Due Date (lend / borrow)
      if (draft.person) {
        const personInput = document.getElementById('tx-person-input');
        if (personInput) personInput.value = draft.person;
        const personDisplay = document.getElementById('tx-debt-person-display');
        if (personDisplay) personDisplay.textContent = draft.person;
        const personRow = document.getElementById('tx-debt-person-row');
        if (personRow) personRow.style.display = 'flex';
        const personTitle = document.getElementById('tx-debt-person-title');
        if (personTitle) {
          personTitle.textContent = (type === 'lend' || draft.debtSubaction === 'lend') ? 'Người vay' : 'Người cho vay';
        }
        const payeeDisplay = document.getElementById('tx-payee-display');
        if (payeeDisplay) payeeDisplay.textContent = draft.person;
      }

      if (draft.tripId && window.UITrips) {
        window.UITrips.selectTripForTx(Number(draft.tripId));
      }
      if (draft.splitData) {
        const splitDataInput = document.getElementById('tx-split-data-input');
        if (splitDataInput) splitDataInput.value = draft.splitData;
      }
      if (type === 'lend' || draft.debtSubaction === 'lend' || type === 'borrow' || draft.debtSubaction === 'borrow') {
        const haydungContainer = document.getElementById('tx-haydung-container');
        if (haydungContainer) haydungContainer.style.display = 'none';
        const personRow = document.getElementById('tx-debt-person-row');
        if (personRow) personRow.style.display = 'flex';
      }
      const subBoxDraft = document.getElementById('tx-selected-cat-subtext');
      if (subBoxDraft) subBoxDraft.textContent = 'Chọn danh mục';
      if (draft.dueDate) {
        const dueInput = document.getElementById('tx-due-date-input');
        if (dueInput) {
          dueInput.value = draft.dueDate;
          dueInput.dataset.rawDate = draft.dueDateRaw || '';
          dueInput.placeholder = (type === 'lend' || draft.debtSubaction === 'lend') ? 'Ngày thu nợ' : 'Ngày trả nợ';
        }
        const dueRow = document.getElementById('tx-debt-due-row');
        if (dueRow) dueRow.style.display = 'flex';
      }

      // 9. Borrow-to-pay
      if (draft.isBorrowed && draft.borrowPerson) {
        const checkbox = document.getElementById('tx-is-borrowed-checkbox');
        if (checkbox) checkbox.checked = true;
        const borrowInput = document.getElementById('tx-borrow-person-input');
        if (borrowInput) borrowInput.value = draft.borrowPerson;
        const statusText = document.getElementById('tx-borrow-status-text');
        if (statusText) statusText.textContent = `Đi vay: ${draft.borrowPerson}`;
        const tag = document.getElementById('tx-borrow-selected-badge');
        if (tag) {
          tag.textContent = draft.borrowPerson;
          tag.style.display = 'inline-flex';
        }
        const clearBtn = document.getElementById('tx-borrow-clear-btn');
        if (clearBtn) clearBtn.style.display = 'inline-flex';
        const dueRow = document.getElementById('borrow-due-date-row');
        if (dueRow) dueRow.style.display = 'block';
        if (draft.borrowDueDate) {
          const bDueInput = document.getElementById('tx-borrow-due-date-input');
          if (bDueInput) {
            bDueInput.value = draft.borrowDueDate;
            bDueInput.dataset.rawDate = draft.borrowDueDateRaw || '';
          }
        }
      }

      // 10. Extra details accordion
      if (draft.extraOpen) {
        const extraBody = document.getElementById('extra-details-body');
        if (extraBody) extraBody.style.display = 'block';
        const extraChevron = document.getElementById('extra-details-chevron');
        if (extraChevron) extraChevron.style.transform = 'rotate(180deg)';
      }

      // 11. Attached Images
      if (Array.isArray(draft.images)) {
        this.attachedImages = [...draft.images];
        this.renderAttachedImages();
      }

      await this.updateSelectedAccountDisplay();
      this.setEditMode(false);
      this.formInitialized = true;
      if (window.lucide) lucide.createIcons();
      return true;
    } catch (e) {
      console.warn('Failed to restore draft:', e);
      return false;
    }
  },

  /**
   * Đặt lại form ghi chép về trạng thái ban đầu để tiếp tục nhập
   * @param {string} defaultType - Loại ghi chép (expense, income, lend, borrow, adjust, transfer)
   * @param {boolean} forceDefaultAccount - Nếu true, ép buộc đưa về tài khoản mặc định (khi làm mới hoàn toàn)
   */
  async resetForm(defaultType = 'expense', forceDefaultAccount = false) {
    if (forceDefaultAccount) {
      this.userChangedAccount = false;
      this.userSelectedAccountId = null;
    }
    this.clearDraft();
    const form = document.getElementById('transaction-form');
    if (!form) return;

    form.reset();
    this.isNoteManuallyEdited = false;
    this.lastAutoNoteValue = '';
    this._lastScannedItemsText = '';
    this.hideNoteProtectedAlert();
    document.getElementById('tx-id-input').value = '';
    document.getElementById('tx-amount-input').value = '0';
    const amountVal = document.getElementById('tx-amount-text');
    if (amountVal) amountVal.textContent = '0';

    const now = new Date();
    const dateStr = getLocalDateStr(now);
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
    document.getElementById('tx-date-input').value = dateStr;
    document.getElementById('tx-time-input').value = timeStr;

    const nativeDt = document.getElementById('tx-datetime-native');
    if (nativeDt) nativeDt.value = `${dateStr}T${timeStr}`;

    this.updateDateTimeDisplays(dateStr, timeStr);

    const typeSelector = document.getElementById('tx-type-selector');
    if (typeSelector) typeSelector.value = defaultType;
    this.updateHeaderTypeDisplay(defaultType);
    this.updateAmountColor(defaultType);

    // Reset extra details
    const extraBody = document.getElementById('extra-details-body');
    if (extraBody) extraBody.style.display = 'none';
    const extraChevron = document.getElementById('extra-details-chevron');
    if (extraChevron) extraChevron.style.transform = 'rotate(0deg)';

    const feeInput = document.getElementById('tx-fee-input');
    if (feeInput) feeInput.value = '0';
    const feeDisplay = document.getElementById('tx-fee-display');
    if (feeDisplay) feeDisplay.textContent = '0';

    this.clearBorrowPerson();

    // Reset debt person row and due date
    const personRow = document.getElementById('tx-debt-person-row');
    if (personRow) personRow.style.display = 'none';
    const dueRow = document.getElementById('tx-debt-due-row');
    if (dueRow) dueRow.style.display = 'none';
    const personInput = document.getElementById('tx-person-input');
    if (personInput) personInput.value = '';
    const personTitle = document.getElementById('tx-debt-person-title');
    if (personTitle) personTitle.textContent = 'Người vay';
    const personDisplay = document.getElementById('tx-debt-person-display');
    if (personDisplay) personDisplay.textContent = 'Chưa chọn ai';

    // Reset trip & payee
    const tripInput = document.getElementById('tx-trip-id-input');
    if (tripInput) tripInput.value = '';
    const tripNameDisplay = document.getElementById('tx-trip-name-display');
    if (tripNameDisplay) {
      tripNameDisplay.textContent = 'Chưa chọn chuyến đi';
      tripNameDisplay.classList.remove('has-trip');
    }
    const tripClearBtn = document.getElementById('btn-clear-tx-trip');
    if (tripClearBtn) tripClearBtn.style.display = 'none';

    const payeeDisplay = document.getElementById('tx-payee-display');
    if (payeeDisplay) payeeDisplay.textContent = 'Chưa chọn ai';
    const payeeClearBtn = document.getElementById('btn-clear-tx-payee');
    if (payeeClearBtn) payeeClearBtn.style.display = 'none';
    const splitDataInput = document.getElementById('tx-split-data-input');
    if (splitDataInput) splitDataInput.value = '';

    const dueDateInput = document.getElementById('tx-due-date-input');
    if (dueDateInput) {
      dueDateInput.value = '';
      dueDateInput.dataset.rawDate = '';
      dueDateInput.placeholder = defaultType === 'lend' ? 'Ngày thu nợ' : 'Ngày trả nợ';
    }

    // Show category card by default
    const catCard = document.getElementById('tx-category-section-card');
    if (catCard) catCard.style.display = 'flex';

    // Hay dung default visible & open
    const haydungContainer = document.getElementById('tx-haydung-container');
    if (haydungContainer) haydungContainer.style.display = 'flex';
    const haydungGrid = document.getElementById('tx-quick-category-grid');
    if (haydungGrid) haydungGrid.style.display = 'grid';
    const chevron = document.getElementById('haydung-chevron');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
    const subBoxReset = document.getElementById('tx-selected-cat-subtext');
    if (subBoxReset) subBoxReset.textContent = 'Chọn danh mục';

    // Nạp tài khoản và giữ lại nguồn tiền đã chọn (nếu có)
    const preservedAccountId = (!forceDefaultAccount && this.userChangedAccount && this.userSelectedAccountId)
      ? this.userSelectedAccountId
      : null;
    await this.populateAccounts(preservedAccountId);
    await this.updateSelectedAccountDisplay();

    // Hiển thị danh mục tức thì từ bộ nhớ RAM (0ms) mà không cần chờ tài khoản nạp
    if (defaultType === 'transfer') {
      await this.selectTransferAction();
    } else if (defaultType === 'adjust') {
      this.selectAdjustAction();
    } else {
      const transferGroup = document.getElementById('tx-transfer-target-group');
      if (transferGroup) transferGroup.style.display = 'none';
      const fromDirTag = document.getElementById('tx-account-dir-tag');
      if (fromDirTag) fromDirTag.style.display = 'none';

      let defaultCat = null;
      if (this._categoriesCache && this._categoriesCache.length > 0) {
        defaultCat = this._categoriesCache.find(c => c.type === defaultType);
      }
      if (!defaultCat) {
        defaultCat = await db.categories.where('type').equals(defaultType).first();
      }
      if (defaultCat) {
        await this.selectCategory(defaultCat);
      } else {
        await this.renderQuickCategories(defaultType);
      }
    }

    // Chế độ thêm mới: ẩn nút Xóa
    this.attachedImages = [];
    this.renderAttachedImages();
    this.autoResizeNoteInput();
    this.updateAIStatus();
    this.setEditMode(false);
    this.formInitialized = true;
    if (window.lucide) lucide.createIcons();
  },

  async openAddModal(defaultType = 'expense') {
    const isEditing = document.getElementById('tx-id-input')?.value;

    if (isEditing) {
      // Đang ở chế độ sửa giao dịch cũ mà bấm Thêm mới -> Thoát hoàn toàn chế độ sửa, làm sạch dữ liệu cũ
      this.setEditMode(false);
      const idInput = document.getElementById('tx-id-input');
      if (idInput) idInput.value = '';
      this.clearDraft();
      await this.resetForm(defaultType);
    } else if (!this.formInitialized) {
      // Lần đầu mở form
      const hasDraft = await this.restoreDraft();
      if (!hasDraft) {
        await this.resetForm(defaultType);
      }
      this.formInitialized = true;
    } else {
      const curType = document.getElementById('tx-type-input')?.value;
      if (curType === 'transfer' || curType === 'adjust') {
        // Nếu trước đó đang mở chuyển khoản hoặc điều chỉnh số dư -> Đưa về form chi tiêu mới mặc định
        this.clearDraft();
        await this.resetForm(defaultType);
      } else {
        const curAmount = document.getElementById('tx-amount-input')?.value;
        const curNote = document.getElementById('tx-note-input')?.value;
        const isUntouched = (!curAmount || curAmount === '0') && (!curNote || curNote.trim() === '');
        if (isUntouched) {
          const now = new Date();
          const dateStr = getLocalDateStr(now);
          const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
          document.getElementById('tx-date-input').value = dateStr;
          document.getElementById('tx-time-input').value = timeStr;
          const nativeDt = document.getElementById('tx-datetime-native');
          if (nativeDt) nativeDt.value = `${dateStr}T${timeStr}`;
          this.updateDateTimeDisplays(dateStr, timeStr);
        }

        const curAccId = (this.userChangedAccount && this.userSelectedAccountId)
          ? this.userSelectedAccountId
          : (this.userChangedAccount ? document.getElementById('tx-account-select')?.value : null);
        await this.populateAccounts(curAccId || null);
        await this.updateSelectedAccountDisplay();
      }
    }

    if (window.app && window.app.currentView !== 'new-transaction') {
      window.app.switchView('new-transaction');
    }
  },

  closeModal() {
    this.closeKeypad();
    this.closeTypeDropdown();
    this.closeAccountDropdown();
    this.closeToAccountDropdown();
    this.closeCategoryPicker();
    // Trở về view trước đó (chỉ khi đang sửa giao dịch hoặc mở từ menu 3 chấm của tài khoản)
    if (window.app && window.app.currentView === 'new-transaction') {
      const isEditing = !!document.getElementById('tx-id-input')?.value;
      if (isEditing || window.app.openedFromAccountMenu) {
        window.app.goBack();
      }
    }
  },

  /* ==================== FORM SUBMIT ==================== */
  async handleFormSubmit() {
    // Chặn submit tự động nếu bàn phím số vừa ẩn trong vòng 450ms
    if (this._keypadClosedTime && (Date.now() - this._keypadClosedTime < 450)) {
      return;
    }
    const id = document.getElementById('tx-id-input').value;
    if (id) {
      const existingTx = await db.transactions.get(Number(id));
      if (existingTx && (existingTx.loanId || existingTx.loanAction)) {
        showToast('Giao dịch thuộc Sổ Vay Ngân Hàng, không thể sửa tại đây! Vui lòng chỉnh sửa trong Sổ Vay.', 'warning');
        return;
      }
    }
    const type = document.getElementById('tx-type-input').value;
    const subaction = document.getElementById('tx-debt-subaction-input').value;
    const linkedDebtId = document.getElementById('tx-linked-debt-id-input').value;

    let amountInput = document.getElementById('tx-amount-input')?.value;
    if (amountInput === undefined || amountInput === null || amountInput === '') {
      amountInput = document.getElementById('tx-amount-text')?.textContent || '0';
    }
    let evaluatedAmount = this.evaluateAmountExpression(amountInput);
    if (evaluatedAmount === null || isNaN(evaluatedAmount)) {
      const raw = String(amountInput).replace(/\./g, '').trim();
      evaluatedAmount = (raw === '' || isNaN(Number(raw))) ? null : Number(raw);
    }

    const isAdjust = (type === 'adjust');
    if (isAdjust) {
      if (evaluatedAmount === null || isNaN(evaluatedAmount) || evaluatedAmount < 0) {
        showToast('Vui lòng nhập số tiền hợp lệ', 'error');
        this.openKeypad();
        return;
      }
    } else {
      if (!evaluatedAmount || evaluatedAmount <= 0) {
        showToast('Vui lòng nhập số tiền hợp lệ', 'error');
        this.openKeypad();
        return;
      }
    }

    const accountId = document.getElementById('tx-account-select')?.value;
    if (!accountId) {
      showToast('Vui lòng chọn tài khoản', 'error');
      return;
    }
    const toAccountId = document.getElementById('tx-to-account-select')?.value;

    if (accountId) {
      const fromAcc = await db.accounts.get(Number(accountId));
      if (fromAcc && fromAcc._isSharedItem && fromAcc._sharedRole !== 'editor') {
        const owner = fromAcc._sharedFrom ? ` (chia sẻ bởi ${fromAcc._sharedFrom})` : '';
        showToast(`Tài khoản "${fromAcc.name}"${owner} chỉ có quyền xem, bạn không thể ghi chép giao dịch!`, 'error');
        return;
      }
    }
    if (type === 'transfer' && toAccountId) {
      const toAcc = await db.accounts.get(Number(toAccountId));
      if (toAcc && toAcc._isSharedItem && toAcc._sharedRole !== 'editor') {
        const owner = toAcc._sharedFrom ? ` (chia sẻ bởi ${toAcc._sharedFrom})` : '';
        showToast(`Tài khoản nhận "${toAcc.name}"${owner} chỉ có quyền xem, bạn không thể ghi chép giao dịch!`, 'error');
        return;
      }
    }
    const categoryId = document.getElementById('tx-category-id-input')?.value;
    const date = document.getElementById('tx-date-input').value;
    const time = document.getElementById('tx-time-input').value || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const note = document.getElementById('tx-note-input').value.trim();

    // Fee (Phí)
    const feeStr = document.getElementById('tx-fee-input')?.value || '0';
    const fee = Number(feeStr.replace(/\./g, '')) || 0;

    // Borrow details (Đi vay để trả)
    const isBorrowed = document.getElementById('tx-is-borrowed-checkbox')?.checked || false;
    const borrowPerson = document.getElementById('tx-borrow-person-input')?.value.trim();
    const borrowDueDate = document.getElementById('tx-borrow-due-date-input')?.dataset.rawDate || document.getElementById('tx-borrow-due-date-input')?.value;

    if (isBorrowed && !borrowPerson) {
      showToast('Vui lòng nhập tên người cho mượn tiền', 'error');
      return;
    }

    // Chuyến đi & Sự kiện và Chi cho ai (Chia tiền nhóm)
    const tripId = document.getElementById('tx-trip-id-input')?.value ? Number(document.getElementById('tx-trip-id-input').value) : null;
    const person = document.getElementById('tx-person-input')?.value?.trim() || null;
    let splitDetails = null;
    try {
      const splitRaw = document.getElementById('tx-split-data-input')?.value;
      if (splitRaw) splitDetails = JSON.parse(splitRaw);
    } catch (_) {}

    this.isSubmitting = true;
    const submitBtn = document.querySelector('.tx-submit-bottom-btn');
    const headerDoneBtn = document.querySelector('.tx-header-done-btn');
    if (submitBtn) {
      submitBtn.style.pointerEvents = 'none';
      submitBtn.style.opacity = '0.7';
    }
    if (headerDoneBtn) {
      headerDoneBtn.style.pointerEvents = 'none';
      headerDoneBtn.style.opacity = '0.7';
    }

    try {
      // 0. Adjust Account Balance
    if (type === 'adjust') {
      if (id) {
        await deleteTransaction(Number(id));
      }
      const acc = await db.accounts.get(Number(accountId));
      if (acc) {
        const diff = evaluatedAmount - acc.balance;
        const adjustType = diff >= 0 ? 'income' : 'expense';
        const absDiff = Math.abs(diff);
        const adjTx = {
          type: adjustType,
          amount: absDiff,
          accountId: Number(accountId),
          date,
          time,
          note: note || 'Điều chỉnh số dư tài khoản',
          fee: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isDeleted: 0
        };
        const uProfile = window.serverSyncService?.userProfile || window.googleDriveService?.userProfile || window.dropboxService?.userProfile;
        const uName = (uProfile?.name && uProfile.name.trim()) || (uProfile?.email && uProfile.email.trim()) || '';
        const uEmail = (uProfile?.email || '').trim();

        if (acc._isSharedItem) {
          adjTx._isSharedItem = true;
          adjTx._shareId = acc._shareId;
          adjTx._remoteId = acc._remoteId;
          adjTx._remoteTxId = typeof generateUniqueId === 'function' ? generateUniqueId() : Date.now();
          adjTx.id = adjTx._remoteTxId;
          adjTx.recordedByOther = 1;
          adjTx.createdBy = uName || 'Thành viên';
          adjTx.createdByEmail = uEmail;
        } else {
          adjTx.id = typeof generateUniqueId === 'function' ? generateUniqueId() : Date.now();
          adjTx.recordedByOther = 0;
          if (uName || uEmail) {
            adjTx.createdBy = uName;
            adjTx.createdByEmail = uEmail;
          }
        }
        await db.transactions.add(adjTx);
        await db.accounts.update(Number(accountId), {
          balance: evaluatedAmount,
          updatedAt: Date.now()
        });
        if (id) {
          this.closeModal();
        } else {
          await this.resetForm(type);
        }
        showToast('Đã điều chỉnh số dư thành công', 'success');
        window.app.refreshAll();
        if (typeof triggerAutoSync === 'function') triggerAutoSync();
        return;
      }
    }

    // 1. Transfer validation
    if (type === 'transfer') {
      if (accountId === toAccountId) {
        showToast('Tài khoản chuyển và tài khoản nhận không thể trùng nhau', 'error');
        return;
      }
      if (id) {
        await deleteTransaction(id);
      }
      await addTransaction({
        type: 'transfer',
        amount: evaluatedAmount,
        fee,
        accountId,
        toAccountId,
        date,
        time,
        note,
        images: [...this.attachedImages]
      });
      if (id) {
        this.closeModal();
      } else {
        await this.resetForm(type);
      }
      showToast('Đã ghi nhận chuyển tiền', 'success');
      window.app.refreshAll();
      return;
    }

    // 2. Cho Vay / Đi Vay (Standalone new debt)
    if (type === 'lend' || type === 'borrow') {
      const personName = document.getElementById('tx-person-input').value.trim();
      const dueDate = document.getElementById('tx-due-date-input')?.dataset.rawDate || document.getElementById('tx-due-date-input')?.value;
      if (!personName) {
        showToast(type === 'lend' ? 'Vui lòng nhập người vay hoặc chi cho ai' : 'Vui lòng nhập chủ nợ hoặc mượn từ ai', 'error');
        return;
      }

      if (id) {
        await deleteTransaction(id);
      }
      await addDebt({
        type,
        personName,
        originalAmount: evaluatedAmount,
        dueDate,
        accountId,
        note: (note ? note + ' ' : '') + `[Lúc ${time}]`
      });

      await db.transactions.add({
        type: type === 'lend' ? 'expense' : 'income',
        amount: evaluatedAmount,
        accountId: Number(accountId),
        categoryId: null,
        date,
        time,
        note: `${type === 'lend' ? 'Cho vay / Chi hộ' : 'Mượn / Đi vay'}: ${personName}${note ? ' - ' + note : ''}`,
        images: [...this.attachedImages],
        isDeleted: 0,
        updatedAt: Date.now()
      });

      if (id) {
        this.closeModal();
      } else {
        await this.resetForm(type);
      }
      showToast(type === 'lend' ? 'Đã ghi nhận khoản cho vay / chi hộ' : 'Đã ghi nhận khoản mượn / đi vay', 'success');
      window.app.refreshAll();
      return;
    }

    // 3. Thu Nợ (Debt Collection)
    if (type === 'debt-collect' && linkedDebtId) {
      await recordDebtPayment(linkedDebtId, evaluatedAmount, accountId, (note ? note + ' ' : '') + `[Thu nợ lúc ${time}]`);
      await db.transactions.add({
        type: 'income',
        amount: evaluatedAmount,
        accountId: Number(accountId),
        categoryId: null,
        date,
        time,
        note: note || 'Thu tiền nợ',
        images: [...this.attachedImages],
        isDeleted: 0,
        updatedAt: Date.now()
      });
      if (id) {
        this.closeModal();
      } else {
        await this.resetForm(type);
      }
      showToast('Đã ghi nhận thu nợ thành công', 'success');
      window.app.refreshAll();
      return;
    }

    // 4. Trả Nợ (Debt Payback)
    if (type === 'debt-pay' && linkedDebtId) {
      await recordDebtPayment(linkedDebtId, evaluatedAmount, accountId, (note ? note + ' ' : '') + `[Trả nợ lúc ${time}]`);
      await db.transactions.add({
        type: 'expense',
        amount: evaluatedAmount,
        accountId: Number(accountId),
        categoryId: null,
        date,
        time,
        note: note || 'Trả tiền nợ',
        images: [...this.attachedImages],
        isDeleted: 0,
        updatedAt: Date.now()
      });
      if (id) {
        this.closeModal();
      } else {
        await this.resetForm(type);
      }
      showToast('Đã ghi nhận trả nợ thành công', 'success');
      window.app.refreshAll();
      return;
    }

    // 5. Normal Expense / Income
    if (id) {
      // Sửa giao dịch: xóa cũ (rollback số dư) rồi thêm mới (cập nhật số dư đúng)
      const existingTx = await db.transactions.get(Number(id));
      await deleteTransaction(id);
      await addTransaction({
        type,
        amount: evaluatedAmount,
        fee,
        accountId,
        categoryId: categoryId || null,
        date,
        time,
        note,
        tripId,
        person,
        splitDetails,
        isBorrowed,
        borrowPerson,
        borrowDueDate,
        images: [...this.attachedImages],
        recordedByOther: existingTx?.recordedByOther,
        createdBy: existingTx?.createdBy,
        createdByEmail: existingTx?.createdByEmail,
        _remoteTxId: existingTx?._remoteTxId,
        _shareId: existingTx?._shareId
      });
      // Sửa xong thì quay trở về view trước đó
      this.closeModal();
      showToast('Đã cập nhật ghi chép', 'success');
    } else {
      await addTransaction({
        type,
        amount: evaluatedAmount,
        fee,
        accountId,
        categoryId: categoryId || null,
        date,
        time,
        note,
        tripId,
        person,
        splitDetails,
        isBorrowed,
        borrowPerson,
        borrowDueDate,
        images: [...this.attachedImages]
      });

      // Tự động tạo khoản nợ cần thu nếu bật tính năng chia tiền nhóm
      if (splitDetails && splitDetails.autoCreateDebt && splitDetails.breakdown && (splitDetails.payer === 'Tôi' || !splitDetails.payer)) {
        try {
          for (const [pName, pAmt] of Object.entries(splitDetails.breakdown)) {
            if (pName !== 'Tôi' && pAmt > 0) {
              await db.debts.add({
                type: 'lend',
                personName: pName,
                originalAmount: pAmt,
                remainingAmount: pAmt,
                dueDate: '',
                accountId: Number(accountId),
                note: `Chia tiền: ${note || 'Chi tiêu nhóm'}`,
                status: 'active',
                isDeleted: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
              });
            }
          }
        } catch (e) {
          console.warn('Auto create debt error:', e);
        }
      }

      // Thêm mới: KHÔNG thoát về trang trước, chỉ làm mới form để người dùng tiếp tục ghi chép
      await this.resetForm(type);
      showToast('Đã thêm ghi chép mới', 'success');
      try {
        const pageBody = document.querySelector('#view-new-transaction .tx-page-body');
        if (pageBody) pageBody.scrollTo({ top: 0, behavior: 'smooth' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (_) {}
    }
    await window.app.refreshAll();
    } catch (err) {
      console.error('Lỗi khi lưu giao dịch:', err);
      showToast('Lỗi khi lưu: ' + (err.message || err), 'error');
    } finally {
      this.isSubmitting = false;
      if (submitBtn) {
        submitBtn.style.pointerEvents = '';
        submitBtn.style.opacity = '';
      }
      if (headerDoneBtn) {
        headerDoneBtn.style.pointerEvents = '';
        headerDoneBtn.style.opacity = '';
      }
    }
  },

  getTxShareNote(t, acc) {
    if (!acc) return '';
    const hasOtherAuthor = (t.recordedByOther === 1) || !!t._isSharedItem;
    const isSharedAccount = !!(acc._isSharedItem || acc.isShared || hasOtherAuthor);
    if (!isSharedAccount) return '';

    // Giao dịch lịch sử có người khác ghi chép không được tự ý ghi đè cờ isShared của tài khoản hiện tại

    // Kiểm tra xem giao dịch này do ai ghi chép trong tài khoản chia sẻ
    const uProfile = window.serverSyncService?.userProfile || window.googleDriveService?.userProfile || window.dropboxService?.userProfile;
    const currentEmail = (uProfile?.email || '').trim().toLowerCase();
    const currentName = (uProfile?.name || '').trim().toLowerCase();

    const creatorEmail = (t.createdByEmail || '').trim().toLowerCase();
    const creatorName = (t.createdBy || '').trim().toLowerCase();
    const ownerNameOrEmail = (acc._sharedFrom || '').trim();

    // 1. Phân biệt chính xác theo vai trò của thiết bị hiện tại (Chủ sổ hay Thành viên nhận chia sẻ)
    let isMe = false;
    let authorRoleLabel = '';

    if (!acc._isSharedItem) {
      // Đang xem trên máy CHỦ SỞ HỮU:
      // - Nếu recordedByOther === 1 -> Giao dịch do THÀNH VIÊN ghi (chắc chắn KHÔNG phải Tôi)
      // - Nếu !recordedByOther || recordedByOther === 0 -> Giao dịch do CHỦ SỔ ghi (Tôi)
      if (t.recordedByOther === 1) {
        isMe = false;
        authorRoleLabel = t.createdBy || 'Thành viên';
      } else {
        isMe = true;
      }
    } else {
      // Đang xem trên máy THÀNH VIÊN NHẬN CHIA SẺ:
      // - Nếu !recordedByOther || recordedByOther === 0 -> Giao dịch do CHỦ SỔ ghi (hiển thị là Chủ sổ)
      // - Nếu recordedByOther === 1 -> Giao dịch do THÀNH VIÊN ghi
      if (!t.recordedByOther || t.recordedByOther === 0) {
        isMe = false;
        authorRoleLabel = 'Chủ sổ';
      } else {
        // Giao dịch do thành viên ghi: nếu có thông tin người tạo khác tài khoản hiện tại -> thành viên khác
        const isDifferentUser = (creatorEmail && currentEmail && creatorEmail !== currentEmail) ||
                                (!creatorEmail && creatorName && currentName && creatorName !== currentName);
        if (isDifferentUser) {
          isMe = false;
          authorRoleLabel = t.createdBy || 'Thành viên';
        } else {
          isMe = true;
        }
      }
    }

    // Nếu là do chính mình tự ghi chép thì để trống cho tinh gọn (không hiển thị "(Tôi)")
    if (isMe) {
      return '';
    }

    // Không phải là Tôi -> Hiển thị tên/vai trò người đã ghi chép: (Chủ sổ) hoặc (Tên người ghi)
    const displayText = authorRoleLabel ? `(${escapeHTML(authorRoleLabel)})` : (t.createdBy ? `(${escapeHTML(t.createdBy)})` : '(Thành viên)');
    const fullTitle = `Ghi chép bởi: ${escapeHTML(authorRoleLabel || t.createdBy || 'Thành viên')}`;
    return ` <span class="tx-share-author-note" title="${fullTitle}">${displayText}</span>`;
  },

  renderTxCardHtml(t, catMap, accMap) {
    const cat = catMap.get(t.categoryId) || (t.categoryName ? { name: t.categoryName, icon: t.categoryIcon || 'shopping-bag', color: t.categoryColor || '#f43f5e' } : null);
    const fromAcc = accMap.get(t.accountId);
    const toAcc = accMap.get(t.toAccountId);

    const hasNote = t.note && t.note.trim();
    let title = hasNote ? t.note : (t.type === 'transfer' ? 'Chuyển khoản' : (cat ? cat.name : (t.categoryName || 'Giao dịch')));
    let iconName = 'arrow-right-left';
    let iconBg = 'var(--transfer-bg)';
    let iconColor = 'var(--transfer)';
    let amountPrefix = '';
    let amountClass = 'transfer';

    const isAdjustTx = !t.categoryId && t.note && (t.note.includes('Điều chỉnh số dư') || t.note.includes('điều chỉnh số dư'));

    if (t.amount === 0) {
      amountPrefix = '';
      amountClass = 'adjust';
      if (isAdjustTx) {
        iconName = 'scale';
        iconBg = 'rgba(168, 85, 247, 0.15)';
        iconColor = '#a855f7';
      } else if (cat) {
        iconName = cat.icon || 'file-text';
        iconBg = 'var(--bg-surface)';
        iconColor = 'var(--text-muted)';
      }
    } else if (t.type === 'expense') {
      iconName = cat ? (cat.icon || 'shopping-bag') : (isAdjustTx ? 'scale' : 'shopping-bag');
      iconBg = isAdjustTx ? 'rgba(168, 85, 247, 0.15)' : (cat?.color && cat.color.startsWith('#') ? `${cat.color}22` : 'var(--expense-bg)');
      iconColor = isAdjustTx ? '#a855f7' : (cat?.color || 'var(--expense)');
      amountPrefix = '-';
      amountClass = 'expense';
    } else if (t.type === 'income') {
      iconName = cat ? (cat.icon || 'banknote') : (isAdjustTx ? 'scale' : 'banknote');
      iconBg = isAdjustTx ? 'rgba(168, 85, 247, 0.15)' : (cat?.color && cat.color.startsWith('#') ? `${cat.color}22` : 'var(--income-bg)');
      iconColor = isAdjustTx ? '#a855f7' : (cat?.color || 'var(--income)');
      amountPrefix = '+';
      amountClass = 'income';
    }

    const timeDisplay = t.time ? `<span style="color: var(--primary); font-weight: 600;">${t.time}</span> • ` : '';
    const feeDisplay = t.fee ? ` • <span style="color: var(--text-muted);">Phí: ${new Intl.NumberFormat('vi-VN').format(t.fee)}đ</span>` : '';
    const catMeta = (hasNote && cat) ? ` • <span style="color: var(--text-muted); font-size: 0.75rem;">${escapeHTML(cat.name)}</span>` : '';
    const fromShareNote = this.getTxShareNote(t, fromAcc);
    const toShareNote = this.getTxShareNote(t, toAcc);
    const accountDisplay = t.type === 'transfer' 
      ? `${timeDisplay}${fromAcc ? escapeHTML(fromAcc.name) : 'Tài khoản'}${fromShareNote} ➔ ${toAcc ? escapeHTML(toAcc.name) : 'Tài khoản'}${toShareNote}${feeDisplay}`
      : `${timeDisplay}${fromAcc ? escapeHTML(fromAcc.name) : 'Tài khoản'}${fromShareNote}${catMeta}${feeDisplay}`;

    if (t.isDeleted) {
      const isSyncSource = t.deletedSource === 'sync' || (t.deletedReason && t.deletedReason.includes('Đồng bộ'));
      const delBadge = isSyncSource
        ? `<span style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.68rem; font-weight: 600; padding: 1px 5px; border-radius: 4px; background: rgba(168, 85, 247, 0.15); color: #a855f7;"><i data-lucide="cloud" style="width: 10px; height: 10px;"></i> Đã xóa (Đồng bộ)</span>`
        : `<span style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.68rem; font-weight: 600; padding: 1px 5px; border-radius: 4px; background: rgba(239, 68, 68, 0.12); color: #ef4444;"><i data-lucide="trash-2" style="width: 10px; height: 10px;"></i> Đã xóa</span>`;

      return `
        <div class="tx-card is-deleted" style="opacity: 0.82; background: rgba(239, 68, 68, 0.03); border: 1px dashed rgba(239, 68, 68, 0.3);">
          <div class="tx-left">
            <div class="tx-icon-box" style="background: rgba(148, 163, 184, 0.15); color: var(--text-muted);">
              <i data-lucide="trash-2" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="tx-info">
              <span class="tx-title" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="text-decoration: line-through; color: var(--text-muted);">${escapeHTML(title)}</span>
                ${delBadge}
              </span>
              <span class="tx-meta">${accountDisplay}</span>
            </div>
          </div>
          <div class="tx-right" style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            <span class="tx-amount" style="text-decoration: line-through; color: var(--text-muted);">
              ${amountPrefix}${new Intl.NumberFormat('vi-VN').format(t.amount)}đ
            </span>
            <button type="button" class="btn-emerald btn-sm" onclick="event.stopPropagation(); window.restoreTransactionFromUI('${t.id}')" title="Khôi phục giao dịch này" style="padding: 2px 8px; font-size: 0.72rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 3px;">
              <i data-lucide="rotate-ccw" style="width: 11px; height: 11px;"></i>
              <span>Khôi phục</span>
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="tx-card" onclick="UITransactions.openEditModal(${t.id})">
        <div class="tx-left">
          <div class="tx-icon-box" style="background: ${iconBg}; color: ${iconColor};">
            <i data-lucide="${iconName}" style="width: 20px; height: 20px;"></i>
          </div>
          <div class="tx-info">
            <span class="tx-title" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;"><span>${escapeHTML(title)}</span>${(t.images && t.images.length > 0) ? `<span title="Có ảnh hoá đơn đính kèm" style="display: inline-flex; align-items: center; gap: 2px; font-size: 0.68rem; font-weight: 600; padding: 1px 5px; border-radius: 4px; background: rgba(13, 148, 136, 0.12); color: var(--primary);"><i data-lucide="receipt" style="width: 10px; height: 10px;"></i>${t.images.length > 1 ? ` ${t.images.length}` : ''}</span>` : ''}${(t.loanId || t.loanAction) ? `<span title="Giao dịch liên kết Sổ Vay (Được khóa bảo vệ)" style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.68rem; font-weight: 600; padding: 1px 5px; border-radius: 4px; background: rgba(99, 102, 241, 0.12); color: var(--primary);"><i data-lucide="lock" style="width: 10px; height: 10px;"></i> Sổ vay</span>` : ""}</span>
            <span class="tx-meta">${accountDisplay}</span>
          </div>
        </div>
        <div class="tx-right">
          <span class="tx-amount ${amountClass}">
            ${amountPrefix}${new Intl.NumberFormat('vi-VN').format(t.amount)}đ
          </span>
        </div>
      </div>
    `;
  },

  /* ==================== LIST RENDERING ==================== */
  async render() {
    this.initTimeFilter();

    const fullContainer = document.getElementById('transactions-list-container-full');
    const dashContainer = document.getElementById('transactions-list-container');

    if (!fullContainer && !dashContainer) return;

    let allTxs = [];
    if (this.currentFilterType === 'trash') {
      allTxs = await db.transactions.where('isDeleted').equals(1).toArray();
    } else {
      allTxs = await db.transactions.where('isDeleted').equals(0).toArray();
    }

    // 1. Lọc theo tài khoản (Hỗ trợ cả accountId và toAccountId)
    if (this.filterAccountId) {
      const targetAccId = Number(this.filterAccountId);
      allTxs = allTxs.filter(t => Number(t.accountId) === targetAccId || Number(t.toAccountId) === targetAccId);
    }

    // 2. Lọc theo thời gian (Nếu đang tìm kiếm từ khóa thì tìm trên tất cả các kỳ)
    let txs = allTxs;
    if (!this.searchKeyword) {
      if (this.timeFilterMode === 'month') {
        txs = txs.filter(t => (t.date || '').startsWith(this.filterMonth));
      } else if (this.timeFilterMode === 'day') {
        txs = txs.filter(t => t.date === this.filterDate);
      } else if (this.timeFilterMode === 'custom') {
        txs = txs.filter(t => t.date >= this.filterCustomStart && t.date <= this.filterCustomEnd);
      }
    }

    // Thống kê nhanh tổng quan kỳ đang chọn (trước khi lọc type để xem trọn vẹn thu/chi kỳ)
    const periodIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
    const periodExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
    const periodBalance = periodIncome - periodExpense;

    const sumIncomeEl = document.getElementById('tx-summary-income');
    const sumExpenseEl = document.getElementById('tx-summary-expense');
    const sumBalEl = document.getElementById('tx-summary-balance');
    if (sumIncomeEl) sumIncomeEl.textContent = `${periodIncome > 0 ? '+' : ''}${new Intl.NumberFormat('vi-VN').format(periodIncome)}đ`;
    if (sumExpenseEl) sumExpenseEl.textContent = `${periodExpense > 0 ? '-' : ''}${new Intl.NumberFormat('vi-VN').format(periodExpense)}đ`;
    if (sumBalEl) {
      const sign = periodBalance > 0 ? '+' : '';
      sumBalEl.textContent = `${sign}${new Intl.NumberFormat('vi-VN').format(periodBalance)}đ`;
      sumBalEl.style.color = periodBalance >= 0 ? 'var(--income)' : 'var(--expense)';
    }

    // Lọc theo loại giao dịch (Type filter)
    if (this.currentFilterType !== 'all' && this.currentFilterType !== 'trash') {
      txs = txs.filter(t => t.type === this.currentFilterType);
    }

    // Lọc theo từ khóa tìm kiếm (Keyword filter)
    if (this.searchKeyword) {
      const kw = this.searchKeyword.toLowerCase();
      txs = txs.filter(t => {
        const note = (t.note || '').toLowerCase();
        const amountStr = String(t.amount || '');
        return note.includes(kw) || amountStr.includes(kw);
      });
    }

    // Sort descending by date, then time, then createdAt, then id
    txs.sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      const timeA = (a.time || '').trim();
      const timeB = (b.time || '').trim();
      if (timeA !== timeB) return timeB.localeCompare(timeA);
      return (b.createdAt || 0) - (a.createdAt || 0) || ((b.id || 0) - (a.id || 0));
    });

    const categories = await db.categories.toArray();
    const accounts = await db.accounts.toArray();
    const catMap = new Map(categories.map(c => [c.id, c]));
    const accMap = new Map(accounts.map(a => [a.id, a]));

    // 1. Render Dashboard: Giới hạn chỉ hiển thị giao dịch trong ngày hiện tại (Hôm nay)
    if (dashContainer) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const todayTxs = allTxs.filter(t => t.date === todayStr);

      if (todayTxs.length === 0) {
        dashContainer.innerHTML = `
          <div style="text-align: center; padding: 36px 16px; color: var(--text-muted);">
            <i data-lucide="calendar-check" style="width: 44px; height: 44px; stroke-width: 1.5; margin-bottom: 10px; opacity: 0.45;"></i>
            <p style="font-size: 0.95rem; font-weight: 600; color: var(--text-secondary); margin: 0;">Hôm nay chưa có giao dịch nào</p>
            <p style="font-size: 0.8rem; margin-top: 4px; color: var(--text-muted);">Giao dịch phát sinh trong ngày hôm nay sẽ hiển thị tại đây</p>
          </div>
        `;
      } else {
        todayTxs.sort((a, b) => {
          const timeA = (a.time || '').trim();
          const timeB = (b.time || '').trim();
          if (timeA !== timeB) return timeB.localeCompare(timeA);
          return (b.createdAt || 0) - (a.createdAt || 0) || ((b.id || 0) - (a.id || 0));
        });
        const dateLabel = this.formatDateLabel(todayStr);
        const dayExpense = todayTxs.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0);
        const dayIncome = todayTxs.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0);

        let dashHtml = `
          <div class="transaction-group">
            <div class="transaction-date-header">
              <span>${dateLabel}</span>
              <span>
                ${dayIncome > 0 ? `<span style="color: var(--income); margin-right: 8px;">+${new Intl.NumberFormat('vi-VN').format(dayIncome)}đ</span>` : ''}
                ${dayExpense > 0 ? `<span style="color: var(--expense);">${new Intl.NumberFormat('vi-VN').format(dayExpense)}đ</span>` : ''}
              </span>
            </div>
            <div class="tx-items-wrapper">
        `;
        for (const t of todayTxs) {
          dashHtml += this.renderTxCardHtml(t, catMap, accMap);
        }
        dashHtml += `</div></div>`;
        dashContainer.innerHTML = dashHtml;
      }
    }

    // 2. Render Full List (Sổ giao dịch với bộ lọc người dùng chọn)
    if (fullContainer) {
      if (txs.length === 0) {
        const isFiltered = this.currentFilterType !== 'all' || !!this.filterAccountId || !!this.searchKeyword;
        const emptyMsg = this.currentFilterType === 'trash'
          ? 'Thùng rác trống. Chưa có giao dịch nào bị xóa.'
          : (this.searchKeyword 
            ? 'Không tìm thấy giao dịch nào phù hợp với từ khóa' 
            : (isFiltered ? 'Không có giao dịch nào phù hợp với bộ lọc hiện tại' : 'Chưa có ghi chép nào trong khoảng thời gian này'));
        const resetBtnHtml = isFiltered ? `
          <button type="button" class="btn-secondary" onclick="UITransactions.resetAllFilters(true)" style="margin: 14px auto 0; display: inline-flex; align-items: center; gap: 6px; padding: 6px 16px; font-size: 0.85rem; border-radius: 20px; cursor: pointer;">
            <i data-lucide="rotate-ccw" style="width: 14px; height: 14px;"></i>
            ${this.currentFilterType === 'trash' ? 'Quay lại sổ' : 'Đặt lại bộ lọc'}
          </button>
        ` : '';
        fullContainer.innerHTML = `
          <div style="text-align: center; padding: 48px 16px; color: var(--text-muted);">
            <i data-lucide="${this.currentFilterType === 'trash' ? 'trash-2' : 'receipt'}" style="width: 48px; height: 48px; stroke-width: 1.5; margin-bottom: 12px; opacity: 0.5;"></i>
            <p style="font-size: 1rem; font-weight: 500;">${this.currentFilterType === 'trash' ? 'Thùng rác trống' : 'Chưa có giao dịch nào'}</p>
            <p style="font-size: 0.85rem; margin-top: 4px;">${escapeHTML(emptyMsg)}</p>
            ${resetBtnHtml}
          </div>
        `;
      } else {
        // Group by Date
        const grouped = {};
        for (const t of txs) {
          if (!grouped[t.date]) grouped[t.date] = [];
          grouped[t.date].push(t);
        }

        let fullHtml = '';
        if (this.currentFilterType === 'trash') {
          fullHtml += `
            <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: var(--radius-md); padding: 10px 14px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="trash-2" style="width: 16px; height: 16px; color: #ef4444;"></i>
                <span style="font-size: 0.82rem; font-weight: 600; color: #ef4444;">Đang xem Thùng rác (${txs.length} giao dịch đã xóa)</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <button type="button" class="btn-secondary btn-sm" onclick="UISettings.openSection('trash'); window.app.showView('settings');" style="font-size: 0.74rem; padding: 3px 10px; border-radius: 6px;">
                  Quản lý thùng rác
                </button>
                <button type="button" class="btn-secondary btn-sm" onclick="UITransactions.resetAllFilters(true)" style="font-size: 0.74rem; padding: 3px 10px; border-radius: 6px;">
                  Đóng
                </button>
              </div>
            </div>
          `;
        }
        const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
        for (const dateStr of sortedDates) {
          const items = grouped[dateStr];
          items.sort((a, b) => {
            const timeA = (a.time || '').trim();
            const timeB = (b.time || '').trim();
            if (timeA !== timeB) return timeB.localeCompare(timeA);
            return (b.createdAt || 0) - (a.createdAt || 0) || ((b.id || 0) - (a.id || 0));
          });
          const dateLabel = this.formatDateLabel(dateStr);
          const dayExpense = items.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0);
          const dayIncome = items.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0);

          fullHtml += `
            <div class="transaction-group">
              <div class="transaction-date-header">
                <span>${dateLabel}</span>
                <span>
                  ${dayIncome > 0 ? `<span style="color: var(--income); margin-right: 8px;">+${new Intl.NumberFormat('vi-VN').format(dayIncome)}đ</span>` : ''}
                  ${dayExpense > 0 ? `<span style="color: var(--expense);">${new Intl.NumberFormat('vi-VN').format(dayExpense)}đ</span>` : ''}
                </span>
              </div>
              <div class="tx-items-wrapper">
          `;

          for (const t of items) {
            fullHtml += this.renderTxCardHtml(t, catMap, accMap);
          }

          fullHtml += `</div></div>`;
        }
        fullContainer.innerHTML = fullHtml;
      }
    }

    if (window.lucide) lucide.createIcons();
  },

  /* ==================== EDIT VIEW ==================== */
  async openEditModal(txId) {
    const tx = await db.transactions.get(Number(txId));
    if (!tx || tx.isDeleted) return;

    if (tx.accountId) {
      const acc = await db.accounts.get(Number(tx.accountId));
      if (acc && acc._isSharedItem && acc._sharedRole !== 'editor') {
        const owner = acc._sharedFrom ? ` (chia sẻ bởi ${acc._sharedFrom})` : '';
        showToast(`Giao dịch này thuộc tài khoản "${acc.name}"${owner} (chỉ có quyền xem), bạn không thể chỉnh sửa!`, 'warning');
        return;
      }
    }
    if (tx.toAccountId) {
      const toAcc = await db.accounts.get(Number(tx.toAccountId));
      if (toAcc && toAcc._isSharedItem && toAcc._sharedRole !== 'editor') {
        const owner = toAcc._sharedFrom ? ` (chia sẻ bởi ${toAcc._sharedFrom})` : '';
        showToast(`Giao dịch này thuộc tài khoản nhận "${toAcc.name}"${owner} (chỉ có quyền xem), bạn không thể chỉnh sửa!`, 'warning');
        return;
      }
    }

    // Nếu giao dịch liên kết với Sổ Vay Ngân Hàng: Khóa không cho sửa tại đây để bảo toàn logic
    if (tx.loanId) {
      const loan = await db.loans.get(Number(tx.loanId));
      const loanName = loan ? loan.name : 'Sổ vay ngân hàng';
      const isDisburse = tx.loanAction === 'disburse' || (tx.note && tx.note.includes('Giải ngân'));
      const actionText = isDisburse ? 'Giải ngân khoản vay' : 'Trả nợ gốc sổ vay';

      const ok = await showConfirm({
        title: 'Giao Dịch Sổ Vay',
        message: 'Giao dịch <strong>"' + actionText + '"</strong> được tạo tự động từ <strong>' + loanName + '</strong>.<br><br>Để đảm bảo tính chính xác cho số dư và nghĩa vụ nợ, giao dịch này được khóa không cho sửa trực tiếp tại đây.<br><br>Bạn có muốn mở <strong>' + loanName + '</strong> trong mục Sổ Vay Ngân Hàng để chỉnh sửa không?',
        confirmText: 'Mở Sổ Vay',
        cancelText: 'Đóng',
        icon: 'landmark'
      });
      if (ok) {
        if (window.UIAccounts && typeof window.UIAccounts.openLoanForm === 'function') {
          window.UIAccounts.openLoanForm(tx.loanId);
        }
      }
      return;
    }

    // Reset form trước để tránh dữ liệu cũ
    const form = document.getElementById('transaction-form');
    if (form) form.reset();

    document.getElementById('tx-id-input').value = tx.id;
    const formattedAmount = new Intl.NumberFormat('vi-VN').format(tx.amount);
    document.getElementById('tx-amount-input').value = formattedAmount;
    const amountVal = document.getElementById('tx-amount-text');
    if (amountVal) amountVal.textContent = formattedAmount;

    document.getElementById('tx-date-input').value = tx.date;
    document.getElementById('tx-time-input').value = tx.time || '00:00';

    const nativeDt = document.getElementById('tx-datetime-native');
    if (nativeDt) nativeDt.value = `${tx.date}T${tx.time || '00:00'}`;

    this.updateDateTimeDisplays(tx.date, tx.time || '00:00');

    const typeSelector = document.getElementById('tx-type-selector');
    if (typeSelector) typeSelector.value = tx.type;
    this.updateAmountColor(tx.type);
    this.updateHeaderTypeDisplay(tx.type);

    document.getElementById('tx-note-input').value = tx.note || '';
    this.autoResizeNoteInput();
    this.isNoteManuallyEdited = !!(tx.note && tx.note.trim());
    this.lastAutoNoteValue = '';

    // Fee
    const feeInput = document.getElementById('tx-fee-input');
    const feeDisplay = document.getElementById('tx-fee-display');
    if (feeInput) feeInput.value = tx.fee ? new Intl.NumberFormat('vi-VN').format(tx.fee) : '0';
    if (feeDisplay) feeDisplay.textContent = tx.fee ? new Intl.NumberFormat('vi-VN').format(tx.fee) : '0';

    // Reset extra details
    const extraBody = document.getElementById('extra-details-body');
    if (extraBody) extraBody.style.display = 'none';
    const extraChevron = document.getElementById('extra-details-chevron');
    if (extraChevron) extraChevron.style.transform = 'rotate(0deg)';

    // Reset debt person rows
    const personRow = document.getElementById('tx-debt-person-row');
    if (personRow) personRow.style.display = 'none';
    const dueRow = document.getElementById('tx-debt-due-row');
    if (dueRow) dueRow.style.display = 'none';

    this.userChangedAccount = true;
    await this.populateAccounts(tx.accountId, tx.toAccountId);
    await this.updateSelectedAccountDisplay();
    await this.updateSelectedToAccountDisplay();

    if (tx.type === 'transfer') {
      await this.selectTransferAction();
    } else if (tx.categoryId) {
      const cat = await db.categories.get(tx.categoryId);
      if (cat) this.selectCategory(cat);
    }

    // Render quick categories với trạng thái đã chọn
    await this.renderQuickCategories();

    // Nạp ảnh đính kèm của giao dịch
    this.attachedImages = Array.isArray(tx.images) ? [...tx.images] : [];
    this.renderAttachedImages();
    this.updateAIStatus();

    // Khôi phục Chuyến đi & Chi cho ai / Chia tiền nhóm
    const tripInput = document.getElementById('tx-trip-id-input');
    const tripNameDisplay = document.getElementById('tx-trip-name-display');
    const tripClearBtn = document.getElementById('btn-clear-tx-trip');
    if (tx.tripId && window.UITrips) {
      const trip = window.UITrips.getTripFromCache(tx.tripId);
      if (tripInput) tripInput.value = tx.tripId;
      if (tripNameDisplay) {
        tripNameDisplay.textContent = trip ? trip.name : ('Chuyến đi #' + tx.tripId);
        tripNameDisplay.classList.add('has-trip');
      }
      if (tripClearBtn) tripClearBtn.style.display = 'inline-flex';
      this.toggleExtraDetails(true);
    } else {
      if (tripInput) tripInput.value = '';
      if (tripNameDisplay) {
        tripNameDisplay.textContent = 'Chưa chọn chuyến đi';
        tripNameDisplay.classList.remove('has-trip');
      }
      if (tripClearBtn) tripClearBtn.style.display = 'none';
    }

    const payeeDisplay = document.getElementById('tx-payee-display');
    const personInput = document.getElementById('tx-person-input');
    const payeeClearBtn = document.getElementById('btn-clear-tx-payee');
    const splitDataInput = document.getElementById('tx-split-data-input');
    if (personInput) personInput.value = tx.person || '';
    if (payeeDisplay) payeeDisplay.textContent = tx.person || 'Chưa chọn ai';
    if (payeeClearBtn) payeeClearBtn.style.display = tx.person ? 'inline-flex' : 'none';
    if (splitDataInput) splitDataInput.value = tx.splitDetails ? JSON.stringify(tx.splitDetails) : '';

    if (tx.tripId || tx.person) {
      this.toggleExtraDetails(true);
    }

    // Chế độ sửa: hiện nút Hủy + Xóa
    this.setEditMode(true, tx.id);

    if (window.app) {
      window.app.editSourceView = window.app.currentView || 'transactions';
      window.app.previousView = window.app.currentView || 'transactions';
      window.app.switchView('new-transaction');
    }
    if (window.lucide) lucide.createIcons();
  },

  async openNewWithTrip(tripId) {
    await this.resetForm('expense', false);
    if (window.app) {
      window.app.editSourceView = 'trip-detail';
      window.app.previousView = 'trip-detail';
      window.app.switchView('new-transaction');
    }
    if (window.UITrips) {
      window.UITrips.selectTripForTx(Number(tripId));
    }
    this.toggleExtraDetails(true);
  },

  /* ==================== DELETE TRANSACTION ==================== */
  // Xóa giao dịch đang mở trong form sửa
  async confirmDeleteCurrentTx() {
    const deleteBtn = document.getElementById('tx-delete-btn');
    const txId = deleteBtn?.dataset.txId;
    if (!txId) return;
    await this.confirmDeleteTransaction(Number(txId));
  },

  async confirmDeleteTransaction(txId) {
    const existingTx = await db.transactions.get(Number(txId));
    if (existingTx && (existingTx.loanId || existingTx.loanAction)) {
      showToast('Giao dịch thuộc Sổ Vay Ngân Hàng, không thể xóa tại đây! Vui lòng quản lý trong mục Sổ Vay.', 'warning');
      return;
    }
    if (existingTx) {
      if (existingTx.accountId) {
        const acc = await db.accounts.get(Number(existingTx.accountId));
        if (acc && acc._isSharedItem && acc._sharedRole !== 'editor') {
          const owner = acc._sharedFrom ? ` (chia sẻ bởi ${acc._sharedFrom})` : '';
          showToast(`Tài khoản "${acc.name}"${owner} chỉ có quyền xem, bạn không thể xóa giao dịch này!`, 'error');
          return;
        }
      }
      if (existingTx.toAccountId) {
        const toAcc = await db.accounts.get(Number(existingTx.toAccountId));
        if (toAcc && toAcc._isSharedItem && toAcc._sharedRole !== 'editor') {
          const owner = toAcc._sharedFrom ? ` (chia sẻ bởi ${toAcc._sharedFrom})` : '';
          showToast(`Tài khoản nhận "${toAcc.name}"${owner} chỉ có quyền xem, bạn không thể xóa giao dịch này!`, 'error');
          return;
        }
      }
    }
    const ok = await showConfirm({
      title: 'Xoá Giao Dịch',
      message: 'Bạn có chắc muốn chuyển giao dịch này vào Thùng rác không?<br><br><span style="color: var(--text-muted); font-size: 0.85rem;">Số dư tài khoản sẽ được hoàn lại và bạn có thể khôi phục lại bất kỳ lúc nào từ Thùng rác.</span>',
      confirmText: 'Chuyển Vào Thùng Rác',
      cancelText: 'Huỷ',
      danger: true,
      icon: 'trash-2'
    });
    if (!ok) return;
    try {
      await deleteTransaction(txId);
      showToast('Đã chuyển giao dịch vào Thùng rác', 'info');
      // Nếu đang mở form sửa thì đóng lại và trở về
      if (window.app && window.app.currentView === 'new-transaction') {
        window.app.goBack();
      }
      await window.app.refreshAll();
    } catch (err) {
      console.error('Delete transaction error:', err);
      showToast('Lỗi khi xóa giao dịch', 'error');
    }
  },

  /* ==========================================================================
     ATTACHMENTS, MANUAL CROP & RECEIPT SCANNER (OFFLINE OCR)
     ========================================================================== */

  async updateAIStatus() {
    const statusPill = document.getElementById('tx-ai-status-pill');
    const statusText = document.getElementById('tx-ai-status-text');
    const scanBanner = document.getElementById('tx-ai-scan-banner');

    if (statusPill) {
      statusPill.style.display = 'inline-flex';
      statusPill.style.background = 'rgba(13, 148, 136, 0.15)';
      statusPill.style.color = 'var(--primary)';
      if (statusText) statusText.textContent = 'OCR';
    }

    if (scanBanner) {
      scanBanner.style.display = this.attachedImages.length > 0 ? 'flex' : 'none';
    }

    if (window.lucide) lucide.createIcons();
  },

  openAISettingsShortcut() {
    this.closeModal();
    if (window.app && window.app.switchView) {
      window.app.switchView('settings');
    }
    if (window.UISettings && typeof window.UISettings.openSection === 'function') {
      window.UISettings.openSection('ocr-scanner');
    }
  },

  triggerImagePicker(source) {
    if (source === 'camera') {
      const cameraInput = document.getElementById('tx-image-input-camera');
      if (cameraInput) {
        cameraInput.value = '';
        cameraInput.click();
      }
    } else {
      const galleryInput = document.getElementById('tx-image-input-gallery');
      if (galleryInput) {
        galleryInput.value = '';
        galleryInput.click();
      }
    }
  },

  triggerKeypadImagePicker(source) {
    this.closeKeypad();
    this.triggerImagePicker(source);
  },

  async handleImageFileSelect(event) {
    const files = event.target?.files;
    if (!files || files.length === 0) return;

    showToast('Đang nén và tối ưu hoá ảnh...', 'info');
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        const compressed = await this.compressImage(file);
        this.attachedImages.push(compressed);
      }
      this.renderAttachedImages();
      this.updateAIStatus();

      // Kiểm tra xem có cấu hình tự động quét OCR không
      let autoScan = false;
      if (window.UISettings) {
        autoScan = await window.UISettings.getOCRAutoScan();
      }

      if (autoScan) {
        // Tự động kích hoạt quét hoá đơn bằng OCR
        await this.scanReceiptWithOCR();
      } else {
        showToast(`Đã đính kèm ${files.length} ảnh hoá đơn`, 'success');
      }
    } catch (err) {
      console.error('Lỗi nén ảnh:', err);
      showToast('Không thể xử lý ảnh: ' + (err.message || err), 'error');
    }
  },

  async compressImage(file, maxDimension = 1280, quality = 0.78) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  renderAttachedImages() {
    const listEl = document.getElementById('tx-images-list');
    const badgeEl = document.getElementById('tx-attachment-badge');
    const scanBanner = document.getElementById('tx-ai-scan-banner');

    if (badgeEl) {
      if (this.attachedImages.length > 0) {
        badgeEl.textContent = `${this.attachedImages.length} ảnh`;
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    if (scanBanner) {
      scanBanner.style.display = this.attachedImages.length > 0 ? 'flex' : 'none';
    }

    if (this.attachedImages.length > 0) {
      const extraBody = document.getElementById('extra-details-body');
      const extraChevron = document.getElementById('extra-details-chevron');
      if (extraBody && (extraBody.style.display === 'none' || !extraBody.style.display)) {
        extraBody.style.display = 'block';
        if (extraChevron) extraChevron.style.transform = 'rotate(180deg)';
      }
    }

    if (!listEl) return;
    if (this.attachedImages.length === 0) {
      listEl.innerHTML = '';
      listEl.style.display = 'none';
      return;
    }

    listEl.style.display = 'flex';
    listEl.innerHTML = this.attachedImages.map((imgUrl, idx) => `
      <div class="tx-image-card" title="Chạm để xem phóng to">
        <img src="${imgUrl}" alt="Hoá đơn #${idx + 1}" onclick="UITransactions.openImageViewer(${idx})">
        <div class="tx-image-card-actions">
          <button type="button" class="tx-image-card-btn" onclick="event.stopPropagation(); UITransactions.openCropModal(${idx})" title="Cắt / Xoay ảnh">
            <i data-lucide="crop"></i>
          </button>
          <button type="button" class="tx-image-card-btn btn-del-img" onclick="event.stopPropagation(); UITransactions.deleteAttachedImage(${idx})" title="Xoá ảnh này">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
  },

  async deleteAttachedImage(index) {
    if (index >= 0 && index < this.attachedImages.length) {
      if (typeof showConfirm === 'function') {
        const ok = await showConfirm({
          title: 'Xoá ảnh',
          message: 'Bạn có chắc chắn muốn xoá ảnh hoá đơn này không?',
          confirmText: 'Xoá',
          cancelText: 'Huỷ',
          danger: true
        });
        if (!ok) return;
      } else if (!confirm('Bạn có chắc chắn muốn xoá ảnh hoá đơn này không?')) {
        return;
      }
      this.attachedImages.splice(index, 1);
      this.renderAttachedImages();
      this.updateAIStatus();
    }
  },

  openImageViewer(index) {
    if (index < 0 || index >= this.attachedImages.length) return;
    const modal = document.getElementById('modal-image-viewer');
    const img = document.getElementById('image-viewer-img');
    if (modal && img) {
      img.src = this.attachedImages[index];
      modal.style.display = 'flex';
      modal.classList.add('open', 'active');
      if (window.lucide) lucide.createIcons();
    }
  },

  closeImageViewer() {
    const modal = document.getElementById('modal-image-viewer');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('open', 'active');
    }
  },

  /* ==================== MANUAL CROP, ROTATE & PERSPECTIVE TOOL (iOS PHOTOS STYLE) ==================== */
  openCropModal(index) {
    if (index < 0 || index >= this.attachedImages.length) return;
    const dataUrl = this.attachedImages[index];

    this.cropState = {
      targetIndex: index,
      rotation90: 0,
      tiltAngle: 0,
      perspectiveV: 0,
      perspectiveH: 0,
      flipH: false,
      activeAdjustMode: 'tilt',
      cropNorm: { x: 0.04, y: 0.04, w: 0.92, h: 0.92 },
      sourceImg: new Image(),
      isDragging: false,
      dragMode: null,
      dragStartX: 0,
      dragStartY: 0,
      dragStartNorm: null
    };

    // Khởi tạo các vạch thước đo (61 ticks từ -30 đến +30)
    const track = document.getElementById('ios-ruler-track');
    if (track && !track.children.length) {
      let html = '';
      for (let i = -30; i <= 30; i++) {
        let cls = 'ios-ruler-tick';
        if (i === 0) cls += ' zero';
        else if (i % 10 === 0) cls += ' major';
        else if (i % 5 === 0) cls += ' med';
        html += `<div class="${cls}" data-val="${i}"><div class="ios-ruler-tick-line"></div></div>`;
      }
      track.innerHTML = html;
    }

    const modal = document.getElementById('modal-crop-image');
    this.setCropAdjustMode('tilt');

    const tiltVal = document.getElementById('persp-tab-tilt-val');
    const vertVal = document.getElementById('persp-tab-vert-val');
    const horizVal = document.getElementById('persp-tab-horiz-val');
    if (tiltVal) tiltVal.textContent = '0°';
    if (vertVal) vertVal.textContent = 'Dọc';
    if (horizVal) horizVal.textContent = 'Ngang';

    this.cropState.sourceImg.onload = () => {
      this.initCropTouchHandlers();
      this.drawCropCanvas();
      if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('open', 'active');
      }
      setTimeout(() => {
        this.drawCropCanvas();
        if (window.lucide) lucide.createIcons();
      }, 50);
    };
    this.cropState.sourceImg.src = dataUrl;
  },

  closeCropModal() {
    const modal = document.getElementById('modal-crop-image');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('open', 'active');
    }
    if (this.cropState) {
      this.cropState.isDragging = false;
    }
  },

  setCropAdjustMode(mode) {
    if (!this.cropState) return;
    this.cropState.activeAdjustMode = mode;

    ['tilt', 'vert', 'horiz'].forEach(m => {
      const btn = document.getElementById(`btn-persp-${m}`);
      if (btn) btn.classList.toggle('active', m === mode);
    });

    const slider = document.getElementById('crop-slider-adjust');
    let curVal = 0;
    if (mode === 'tilt') {
      curVal = this.cropState.tiltAngle || 0;
    } else if (mode === 'vert') {
      curVal = this.cropState.perspectiveV || 0;
    } else if (mode === 'horiz') {
      curVal = this.cropState.perspectiveH || 0;
    }

    if (slider) slider.value = curVal;
    this.updateRulerDialPosition(curVal);
  },

  updateRulerDialPosition(num) {
    const track = document.getElementById('ios-ruler-track');
    const badge = document.getElementById('ios-ruler-value-badge');
    const valueEl = document.getElementById('crop-tilt-value');
    if (badge) {
      badge.classList.toggle('has-val', num !== 0);
    }
    if (valueEl) {
      const mode = this.cropState?.activeAdjustMode;
      if (mode === 'tilt') {
        valueEl.textContent = `${num}°`;
      } else {
        valueEl.textContent = `${num > 0 ? '+' : ''}${num}`;
      }
    }
    if (track) {
      // 61 ticks (-30 đến +30), mỗi tick 7px. Tick 0 ở index 30 (210px + 3.5px nửa tick)
      const tickPos = (num + 30) * 7 + 3.5;
      track.style.transform = `translateX(calc(50% - ${tickPos}px))`;
    }
  },

  handleCropSliderAdjust(val) {
    if (!this.cropState) return;
    const num = Number(val);
    const mode = this.cropState.activeAdjustMode || 'tilt';

    if (mode === 'tilt') {
      this.cropState.tiltAngle = num;
      const tabVal = document.getElementById('persp-tab-tilt-val');
      if (tabVal) tabVal.textContent = `${num}°`;
    } else if (mode === 'vert') {
      this.cropState.perspectiveV = num;
      const tabVal = document.getElementById('persp-tab-vert-val');
      if (tabVal) tabVal.textContent = num === 0 ? 'Dọc' : `Dọc (${num > 0 ? '+' : ''}${num})`;
    } else if (mode === 'horiz') {
      this.cropState.perspectiveH = num;
      const tabVal = document.getElementById('persp-tab-horiz-val');
      if (tabVal) tabVal.textContent = num === 0 ? 'Ngang' : `Ngang (${num > 0 ? '+' : ''}${num})`;
    }

    this.updateRulerDialPosition(num);
    this.drawCropCanvas();
  },

  resetActiveCropAdjust() {
    const slider = document.getElementById('crop-slider-adjust');
    if (slider) slider.value = 0;
    this.handleCropSliderAdjust(0);
  },

  resetAllCropPerspective() {
    if (!this.cropState) return;
    this.cropState.tiltAngle = 0;
    this.cropState.perspectiveV = 0;
    this.cropState.perspectiveH = 0;
    this.cropState.rotation90 = 0;
    this.cropState.flipH = false;
    this.cropState.cropNorm = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };

    const tiltVal = document.getElementById('persp-tab-tilt-val');
    const vertVal = document.getElementById('persp-tab-vert-val');
    const horizVal = document.getElementById('persp-tab-horiz-val');
    if (tiltVal) tiltVal.textContent = '0°';
    if (vertVal) vertVal.textContent = 'Dọc';
    if (horizVal) horizVal.textContent = 'Ngang';

    this.setCropAdjustMode(this.cropState.activeAdjustMode || 'tilt');
    this.drawCropCanvas();
  },

  flipCropHorizontal() {
    if (!this.cropState) return;
    this.cropState.flipH = !this.cropState.flipH;
    this.drawCropCanvas();
  },

  initCropTouchHandlers() {
    if (this._cropTouchHandlersBound) return;
    this._cropTouchHandlersBound = true;

    const overlay = document.getElementById('crop-overlay-box');
    const container = document.getElementById('crop-canvas-container');
    if (!overlay || !container) return;

    const onPointerDown = (e) => {
      if (!this.cropState || !this.cropState.sourceImg) return;
      e.preventDefault();
      e.stopPropagation();

      const handle = e.target.getAttribute('data-handle');
      this.cropState.dragMode = handle || 'move';
      this.cropState.isDragging = true;
      this.cropState.dragStartX = e.clientX;
      this.cropState.dragStartY = e.clientY;
      this.cropState.dragStartNorm = { ...this.cropState.cropNorm };

      if (e.target.setPointerCapture && e.pointerId !== undefined) {
        try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
      }
    };

    overlay.addEventListener('pointerdown', onPointerDown);

    const onPointerMove = (e) => {
      if (!this.cropState || !this.cropState.isDragging) return;
      const canvas = document.getElementById('crop-source-canvas');
      if (!canvas) return;

      const cRect = canvas.getBoundingClientRect();
      if (cRect.width <= 0 || cRect.height <= 0) return;

      const dx = (e.clientX - this.cropState.dragStartX) / cRect.width;
      const dy = (e.clientY - this.cropState.dragStartY) / cRect.height;
      const sn = this.cropState.dragStartNorm;
      if (!sn) return;

      const minW = Math.max(0.04, 30 / cRect.width);
      const minH = Math.max(0.04, 30 / cRect.height);

      let nx = sn.x;
      let ny = sn.y;
      let nw = sn.w;
      let nh = sn.h;
      const mode = this.cropState.dragMode;

      if (mode === 'move') {
        nx = Math.max(0, Math.min(1 - sn.w, sn.x + dx));
        ny = Math.max(0, Math.min(1 - sn.h, sn.y + dy));
      } else if (mode === 'tl') {
        const newX = Math.max(0, Math.min(sn.x + sn.w - minW, sn.x + dx));
        const newY = Math.max(0, Math.min(sn.y + sn.h - minH, sn.y + dy));
        nw = (sn.x + sn.w) - newX;
        nh = (sn.y + sn.h) - newY;
        nx = newX;
        ny = newY;
      } else if (mode === 'tr') {
        const newY = Math.max(0, Math.min(sn.y + sn.h - minH, sn.y + dy));
        nw = Math.max(minW, Math.min(1 - sn.x, sn.w + dx));
        nh = (sn.y + sn.h) - newY;
        ny = newY;
      } else if (mode === 'bl') {
        const newX = Math.max(0, Math.min(sn.x + sn.w - minW, sn.x + dx));
        nw = (sn.x + sn.w) - newX;
        nh = Math.max(minH, Math.min(1 - sn.y, sn.h + dy));
        nx = newX;
      } else if (mode === 'br') {
        nw = Math.max(minW, Math.min(1 - sn.x, sn.w + dx));
        nh = Math.max(minH, Math.min(1 - sn.y, sn.h + dy));
      } else if (mode === 't') {
        const newY = Math.max(0, Math.min(sn.y + sn.h - minH, sn.y + dy));
        nh = (sn.y + sn.h) - newY;
        ny = newY;
      } else if (mode === 'b') {
        nh = Math.max(minH, Math.min(1 - sn.y, sn.h + dy));
      } else if (mode === 'l') {
        const newX = Math.max(0, Math.min(sn.x + sn.w - minW, sn.x + dx));
        nw = (sn.x + sn.w) - newX;
        nx = newX;
      } else if (mode === 'r') {
        nw = Math.max(minW, Math.min(1 - sn.x, sn.w + dx));
      }

      this.cropState.cropNorm = {
        x: Math.max(0, Math.min(1 - minW, nx)),
        y: Math.max(0, Math.min(1 - minH, ny)),
        w: Math.max(minW, Math.min(1 - nx, nw)),
        h: Math.max(minH, Math.min(1 - ny, nh))
      };

      this.updateCropBoxUI();
    };

    const onPointerUp = () => {
      if (this.cropState) {
        this.cropState.isDragging = false;
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('resize', () => {
      const modal = document.getElementById('modal-crop-image');
      if (modal && modal.style.display !== 'none') {
        this.drawCropCanvas();
      }
    });
  },

  handleCropTilt(val) {
    this.handleCropSliderAdjust(val);
  },

  resetCropTilt() {
    this.resetActiveCropAdjust();
  },

  rotateCropLeft() {
    if (!this.cropState) return;
    this.cropState.rotation90 = (this.cropState.rotation90 - 90 + 360) % 360;
    this.drawCropCanvas();
  },

  rotateCropRight() {
    if (!this.cropState) return;
    this.cropState.rotation90 = (this.cropState.rotation90 + 90) % 360;
    this.drawCropCanvas();
  },

  resetCropBoxToFull() {
    if (!this.cropState) return;
    this.cropState.cropNorm = { x: 0, y: 0, w: 1, h: 1 };
    this.updateCropBoxUI();
  },

  drawCropCanvas() {
    const canvas = document.getElementById('crop-source-canvas');
    const container = document.getElementById('crop-canvas-container');
    const img = this.cropState?.sourceImg;
    if (!canvas || !container || !img || !img.naturalWidth) return;

    const origW = img.naturalWidth;
    const origH = img.naturalHeight;
    const totalDeg = (this.cropState.rotation90 || 0) + (this.cropState.tiltAngle || 0);
    const rad = (totalDeg * Math.PI) / 180;

    const absCos = Math.abs(Math.cos(rad));
    const absSin = Math.abs(Math.sin(rad));
    const boundW = Math.round(origW * absCos + origH * absSin);
    const boundH = Math.round(origW * absSin + origH * absCos);

    // 1. Tạo canvas xoay & lật
    let workCanvas = document.createElement('canvas');
    workCanvas.width = boundW;
    workCanvas.height = boundH;
    let wCtx = workCanvas.getContext('2d');
    wCtx.fillStyle = '#ffffff';
    wCtx.fillRect(0, 0, boundW, boundH);
    wCtx.save();
    wCtx.translate(boundW / 2, boundH / 2);
    if (this.cropState.flipH) {
      wCtx.scale(-1, 1);
    }
    wCtx.rotate(rad);
    wCtx.drawImage(img, -origW / 2, -origH / 2);
    wCtx.restore();

    // 2. Phối cảnh dọc (Vertical Perspective: trên to dưới nhỏ / trên nhỏ dưới to)
    const pV = this.cropState.perspectiveV || 0;
    if (pV !== 0) {
      const k = pV / 45;
      const srcW = workCanvas.width;
      const srcH = workCanvas.height;
      const maxScale = Math.max(1 + 0.5 * k, 1 - 0.5 * k);
      const outW = Math.round(srcW * maxScale);
      const outH = srcH;

      const vCanvas = document.createElement('canvas');
      vCanvas.width = outW;
      vCanvas.height = outH;
      const vCtx = vCanvas.getContext('2d');
      vCtx.fillStyle = '#ffffff';
      vCtx.fillRect(0, 0, outW, outH);

      const N = 120;
      const sliceH = srcH / N;
      for (let i = 0; i < N; i++) {
        const t = (i + 0.5) / N;
        const scaleX = Math.max(0.1, 1 + k * (0.5 - t));
        const dw = srcW * scaleX;
        const dx = (outW - dw) / 2;
        const sy = i * sliceH;
        const sh = sliceH + 0.6;
        vCtx.drawImage(workCanvas, 0, sy, srcW, sh, dx, sy, dw, sh);
      }
      workCanvas = vCanvas;
    }

    // 3. Phối cảnh ngang (Horizontal Perspective: trái to phải nhỏ / trái nhỏ phải to)
    const pH = this.cropState.perspectiveH || 0;
    if (pH !== 0) {
      const m = pH / 45;
      const srcW = workCanvas.width;
      const srcH = workCanvas.height;
      const maxScale = Math.max(1 + 0.5 * m, 1 - 0.5 * m);
      const outW = srcW;
      const outH = Math.round(srcH * maxScale);

      const hCanvas = document.createElement('canvas');
      hCanvas.width = outW;
      hCanvas.height = outH;
      const hCtx = hCanvas.getContext('2d');
      hCtx.fillStyle = '#ffffff';
      hCtx.fillRect(0, 0, outW, outH);

      const N = 120;
      const sliceW = srcW / N;
      for (let j = 0; j < N; j++) {
        const t = (j + 0.5) / N;
        const scaleY = Math.max(0.1, 1 + m * (0.5 - t));
        const dh = srcH * scaleY;
        const dy = (outH - dh) / 2;
        const sx = j * sliceW;
        const sw = sliceW + 0.6;
        hCtx.drawImage(workCanvas, sx, 0, sw, srcH, sx, dy, sw, dh);
      }
      workCanvas = hCanvas;
    }

    // 4. Đưa hình ảnh lên canvas hiển thị
    const finalW = workCanvas.width;
    const finalH = workCanvas.height;
    canvas.width = finalW;
    canvas.height = finalH;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, finalW, finalH);
    ctx.drawImage(workCanvas, 0, 0);

    // Tính kích thước hiển thị CSS để toàn bộ hoá đơn nằm gọn trong khung
    const contW = Math.max(80, container.clientWidth - 20);
    const contH = Math.max(80, container.clientHeight - 20);
    const scale = Math.min(contW / finalW, contH / finalH, 1);

    const dispW = Math.max(40, Math.round(finalW * scale));
    const dispH = Math.max(40, Math.round(finalH * scale));

    canvas.style.width = `${dispW}px`;
    canvas.style.height = `${dispH}px`;

    this.updateCropBoxUI();
  },

  updateCropBoxUI() {
    const overlay = document.getElementById('crop-overlay-box');
    const canvas = document.getElementById('crop-source-canvas');
    const container = document.getElementById('crop-canvas-container');
    if (!overlay || !canvas || !container || !this.cropState) return;

    const cRect = canvas.getBoundingClientRect();
    const pRect = container.getBoundingClientRect();

    const offLeft = cRect.left - pRect.left;
    const offTop = cRect.top - pRect.top;

    const norm = this.cropState.cropNorm || { x: 0, y: 0, w: 1, h: 1 };
    const boxLeft = offLeft + norm.x * cRect.width;
    const boxTop = offTop + norm.y * cRect.height;
    const boxWidth = norm.w * cRect.width;
    const boxHeight = norm.h * cRect.height;

    overlay.style.left = `${Math.round(boxLeft)}px`;
    overlay.style.top = `${Math.round(boxTop)}px`;
    overlay.style.width = `${Math.max(20, Math.round(boxWidth))}px`;
    overlay.style.height = `${Math.max(20, Math.round(boxHeight))}px`;
  },

  applyCrop() {
    const canvas = document.getElementById('crop-source-canvas');
    if (!canvas || !this.cropState || this.cropState.targetIndex < 0) return;

    const norm = this.cropState.cropNorm || { x: 0, y: 0, w: 1, h: 1 };
    const sx = Math.max(0, Math.floor(norm.x * canvas.width));
    const sy = Math.max(0, Math.floor(norm.y * canvas.height));
    const sw = Math.min(canvas.width - sx, Math.floor(norm.w * canvas.width));
    const sh = Math.min(canvas.height - sy, Math.floor(norm.h * canvas.height));

    if (sw <= 15 || sh <= 15) {
      showToast('Vùng cắt quá nhỏ, vui lòng kéo rộng thêm!', 'warning');
      return;
    }

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = sw;
    cropCanvas.height = sh;
    const ctx = cropCanvas.getContext('2d');
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

    const croppedDataUrl = cropCanvas.toDataURL('image/jpeg', 0.85);
    this.attachedImages[this.cropState.targetIndex] = croppedDataUrl;
    this.renderAttachedImages();
    this.closeCropModal();
    showToast('Đã cắt và chỉnh phối cảnh hoá đơn thành công!', 'success');
  },

  /* ==================== OFFLINE QR BILL & AMOUNT PARSER ==================== */
  async scanReceiptQrOffline(dataUrl) {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
      return null;
    }
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats().catch(() => []);
      if (!formats.includes('qr_code')) return null;

      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = dataUrl;
      });

      const barcodes = await detector.detect(img);
      if (!barcodes || barcodes.length === 0) return null;

      const rawValue = (barcodes[0].rawValue || '').trim();
      if (!rawValue) return null;

      let parsedAmount = null;
      let parsedNote = '';

      if (rawValue.includes('000201')) {
        const emvStr = rawValue.substring(rawValue.indexOf('000201'));
        let i = 0;
        while (i < emvStr.length - 4) {
          const tag = emvStr.substring(i, i + 2);
          const len = parseInt(emvStr.substring(i + 2, i + 4), 10);
          if (isNaN(len) || i + 4 + len > emvStr.length) break;
          const val = emvStr.substring(i + 4, i + 4 + len);
          i += 4 + len;

          if (tag === '54') {
            const num = parseFloat(val);
            if (!isNaN(num) && num > 0) parsedAmount = Math.round(num);
          }
          if (tag === '62') {
            let j = 0;
            while (j < val.length - 4) {
              const subTag = val.substring(j, j + 2);
              const subLen = parseInt(val.substring(j + 2, j + 4), 10);
              if (isNaN(subLen) || j + 4 + subLen > val.length) break;
              const subVal = val.substring(j + 4, j + 4 + subLen);
              j += 4 + subLen;
              if (subTag === '08') parsedNote = subVal;
            }
          }
        }
      }

      if (!parsedAmount) {
        try {
          const jsonObj = JSON.parse(rawValue);
          const amt = jsonObj.total || jsonObj.tong_tien || jsonObj.tongtien || jsonObj.amount;
          if (amt && !isNaN(Number(amt))) parsedAmount = Math.round(Number(amt));
        } catch (_) {}
      }

      if (!parsedAmount) {
        const match = rawValue.match(/(?:tongtien|amount|tien|total)[^\d]*([0-9.,]{4,12})/i);
        if (match && match[1]) {
          const clean = match[1].replace(/[.,]/g, '');
          const num = parseInt(clean, 10);
          if (!isNaN(num) && num >= 1000) parsedAmount = num;
        }
      }

      return {
        raw: rawValue,
        amount: parsedAmount,
        note: parsedNote
      };
    } catch (err) {
      console.warn('[scanReceiptQrOffline] Lỗi quét QR:', err);
      return null;
    }
  },

  /* ==================== OFFLINE OCR RECEIPT SCANNER ==================== */
  extractDateTimeFromOCR(textLines) {
    let detectedDate = null;
    let detectedTime = null;

    const makeDateStr = (y, m, d) => {
      let year = parseInt(y, 10);
      if (year < 100) year += 2000;
      if (year < 2020 || year > 2035) return null;
      const month = parseInt(m, 10);
      if (month < 1 || month > 12) return null;
      const day = parseInt(d, 10);
      if (day < 1 || day > 31) return null;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };

    const makeTimeStr = (h, min, ampm) => {
      let hour = parseInt(h, 10);
      const minute = parseInt(min, 10);
      if (isNaN(hour) || isNaN(minute)) return null;
      if (minute < 0 || minute > 59) return null;
      if (ampm) {
        const ap = ampm.toLowerCase();
        if (ap === 'pm' && hour < 12) hour += 12;
        if (ap === 'am' && hour === 12) hour = 0;
      }
      if (hour < 0 || hour > 23) return null;
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    };

    for (const rawLine of textLines) {
      const line = rawLine.trim();
      if (!line) continue;

      // 1. Quét ngày: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY hoặc 2 số năm DD/MM/YY
      if (!detectedDate) {
        const dmyMatch = line.match(/(?:ngày|ngay|date|tg|thời\s*gian|thoi\s*gian|ngày\s*lập|ngay\s*lap)?\s*[:\s-]*\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})\b/i);
        if (dmyMatch) {
          const dStr = makeDateStr(dmyMatch[3], dmyMatch[2], dmyMatch[1]);
          if (dStr) detectedDate = dStr;
        } else {
          // YYYY-MM-DD hoặc YYYY/MM/DD
          const ymdMatch = line.match(/(?:ngày|ngay|date)?\s*[:\s-]*\b(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\b/i);
          if (ymdMatch) {
            const dStr = makeDateStr(ymdMatch[1], ymdMatch[2], ymdMatch[3]);
            if (dStr) detectedDate = dStr;
          }
        }
      }

      // 2. Quét giờ: HH:mm:ss hoặc HH:mm (kèm AM/PM tuỳ chọn)
      if (!detectedTime) {
        const timeMatch = line.match(/(?:giờ|gio|time|tg|thời\s*gian|thoi\s*gian)?\s*[:\s-]*\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b/i);
        if (timeMatch) {
          const isLabeled = /(?:giờ|gio|time|tg|thoi|thời|ngay|ngày)/i.test(line);
          const tStr = makeTimeStr(timeMatch[1], timeMatch[2], timeMatch[3]);
          if (tStr && (isLabeled || line.includes(':'))) {
            detectedTime = tStr;
          }
        }
      }

      if (detectedDate && detectedTime) break;
    }

    return { date: detectedDate, time: detectedTime };
  },

  extractItemsFromOCR(textLines, detectedAmount) {
    const removeAccents = (str) => (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();

    const isHeaderLine = (line) => {
      const norm = removeAccents(line);
      // Ngày tháng, giờ giấc, timestamp
      if (/\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/.test(line) || /\b\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}\b/.test(line)) return true;
      if (/(?:ngay\s*in|ngay\s*lap|thoi\s*gian|gio\s*in|gio\s*giao|dia\s*chi\s*giao|kho\s*xuat|hinh\s*thuc\s*giao)/i.test(norm)) return true;
      // Tên cửa hàng, tiêu đề hoá đơn / phiếu
      if (/(?:cong\s*ty|robinson|dienmayxanh|thegioididong|poolbar|bien\s*nhan|hoa\s*don|phieu\s*thu|receipt|invoice)/i.test(norm)) return true;
      // Liên hệ & thông tin bổ trợ
      if (/(?:phone|dien\s*thoai|tel|hotline|tax\s*number|ma\s*so\s*thue|mst|phieu\s*y\/c|so\s*luong\s*khach|so\s*ban|khach\s*hang|dia\s*chi)/i.test(norm)) return true;
      // Địa danh / địa chỉ
      if (/(?:village|commune|district|ward|street|vietnam|da\s*nang|tam\s*xuan|ha\s*noi|ho\s*chi\s*minh|tran\s*nhan\s*tong)/i.test(norm)) return true;
      return false;
    };

    const isTableHeader = (line) => {
      const norm = removeAccents(line);
      // Bất kỳ dòng nào chứa từ khóa tiêu đề cột
      if (/(?:don\s*gia|thanh\s*tien|so\s*luong|ten\s*hang|mat\s*hang|unit\s*price|quantity)/i.test(norm)) return true;
      let matches = 0;
      const kwList = ['don gia', 'so luong', 'thanh tien', 'bill', 'time', 'date', 'table', 'bang', 'stt', 'item', 'price', 'qty', 'amount'];
      for (const kw of kwList) {
        if (norm.includes(kw)) matches++;
      }
      return matches >= 2;
    };

    const isFooterOrTotal = (line) => {
      const norm = removeAccents(line);
      // Khớp Tổng, Tong, Téng, Tông, Total, Thanh toán, Service Charge, VAT, Cảm ơn...
      if (/(?:t[oeôóòỏõọéèẻẽẹếề]ng|total|thanh\s*toan|cong\s*tien|khach\s*tra|tien\s*mat|chuyen\s*khoan|tien\s*thua|tien\s*thoi|vat|thue|service\s*charge|so\s*phong|ten\s*khach|chu\s*ky|signature|cam\s*on|thanks)/i.test(norm)) return true;
      return false;
    };

    const isPureNumberOrNoise = (str) => {
      const letters = (str || '').match(/[a-zA-Z\u00C0-\u1EF9]/g);
      return !letters || letters.length < 2;
    };

    const isZeroPriceRow = (line) => {
      return /^(?:0\s*)+[0-9]*\s*(?:0\s*)*$/.test((line || '').trim());
    };

    const isPromoOrCouponLine = (line) => {
      const norm = removeAccents(line);
      return /(?:pmh|phieu\s*mua\s*hang|phieu\s*giam\s*gia|qua\s*tang|tang\s*kem|mien\s*phi|voucher|coupon|khuyen\s*mai|don\s*hang\s*tu|tri\s*gia)\b/i.test(norm);
    };

    // Làm sạch tên mặt hàng
    const cleanItemTitle = (str) => {
      let s = (str || '').trim();
      // Xoá ký tự rác đầu dòng: _ . - * ~ | • © v.v.
      s = s.replace(/^[_.\-*~|•©\s]+/, '');
      // Xoá tiền tố BE hoặc từ 1-2 ký tự rác trước số lượng hoặc tên: ví dụ "BE 00x " hoặc "BE "
      s = s.replace(/^(?:BE|8E|B[.\s]|l[.\s]|I[.\s])\s+/i, '');
      // Xoá số thứ tự đầu dòng: "1. ", "2) "
      s = s.replace(/^[0-9]+[.)]\s*/, '');
      // Xoá tiền tệ / mã ở đuôi
      s = s.replace(/[:\-_]+$/, '').replace(/\((?:vnd|vnđ|d)\s*\d+\)/i, '').trim();
      return s;
    };

    const maxItemPrice = (detectedAmount && detectedAmount > 1000) ? Math.round(detectedAmount * 1.1) : 500000000;

    const extractValidPrices = (line) => {
      if (isHeaderLine(line) || isTableHeader(line) || isPromoOrCouponLine(line)) return [];
      const matches = [...line.matchAll(/\b(\d{1,3}(?:[.,]\d{3})+|\d{4,9})\b/g)];
      const valid = [];
      for (const m of matches) {
        const raw = m[1];
        const prefix = line.slice(0, m.index);
        const suffix = line.slice(m.index + m[0].length);

        // Nếu kèm / hoặc - bên trái hoặc bên phải thì xem nó là ngày tháng năm để bỏ qua
        const isDateSepAdjacent = /[/\-]\s*$/.test(prefix) || /^\s*[/\-]/.test(suffix);
        if (isDateSepAdjacent) continue;

        // Nếu ngay trước số là "trị giá", "đơn hàng từ" -> không phải giá bán
        const normPrefix = removeAccents(prefix);
        if (/(?:tri\s*gia|don\s*hang\s*tu|giam|tang)\s*[:\s]*$/i.test(normPrefix)) continue;

        const hasSep = raw.includes('.') || raw.includes(',');
        const num = parseInt(raw.replace(/[.,]/g, ''), 10);

        // Bỏ qua số điện thoại (10 hoặc 11 chữ số bắt đầu bằng 0 và không có dấu chấm/phẩy)
        if (!hasSep && (raw.length === 10 || raw.length === 11) && raw.startsWith('0')) continue;

        if (num >= 1000 && num <= maxItemPrice) {
          valid.push({ text: raw, val: num, index: m.index });
        }
      }
      return valid;
    };

    const items = [];
    let inItemSection = false;

    for (let i = 0; i < textLines.length; i++) {
      const line = textLines[i].trim();
      if (!line) continue;

      if (isTableHeader(line)) {
        inItemSection = true;
        continue;
      }

      if (isFooterOrTotal(line)) {
        if (inItemSection || items.length > 0) break;
      }

      if (!inItemSection) {
        if (isHeaderLine(line)) continue;
      }

      // Bỏ qua dòng phiếu mua hàng / khuyến mãi
      if (isPromoOrCouponLine(line)) {
        if (i + 1 < textLines.length && isZeroPriceRow(textLines[i + 1])) {
          i++;
        }
        continue;
      }

      if (isZeroPriceRow(line)) continue;

      // 1. Dạng dòng đơn: Chứa Tên + Số lượng/Đơn giá + Thành tiền trên cùng 1 dòng
      const prices = extractValidPrices(line);
      if (prices.length > 0) {
        const firstPrice = prices[0];
        const lastPrice = prices[prices.length - 1];
        let textBefore = line.substring(0, prices.length >= 2 ? firstPrice.index : lastPrice.index).trim();
        let qty = '';

        // Kiểm tra số lượng ở đầu tên món: "1.00x ...", "2x ...", hoặc "BE 00x ..."
        const leadQtyMatch = textBefore.match(/^(?:[a-zA-Z]{1,3}\s*)?(\d+(?:\.\d+)?)\s*x\s*(.+)$/i);
        if (leadQtyMatch) {
          qty = Math.round(Number(leadQtyMatch[1])) || 1;
          textBefore = leadQtyMatch[2].trim();
        } else {
          if (prices.length >= 2) {
            const between = line.substring(firstPrice.index + firstPrice.text.length, lastPrice.index).trim();
            const betweenMatch = between.match(/\b([1-9]\d{0,2})\b/);
            if (betweenMatch) qty = parseInt(betweenMatch[1], 10);
          }
          if (!qty) {
            const qtyMatch = textBefore.match(/(?:^|\s)(?:x\s*(\d+)|\b(\d+)\s*x|\bSL[:\s]*(\d+)|\b([1-9]\d{0,2}))$/i);
            if (qtyMatch) {
              qty = parseInt(qtyMatch[1] || qtyMatch[2] || qtyMatch[3] || qtyMatch[4], 10);
              textBefore = textBefore.substring(0, qtyMatch.index).trim();
            }
          }
        }

        let cleanName = cleanItemTitle(textBefore);

        if (!isPureNumberOrNoise(cleanName) && !isHeaderLine(cleanName) && !isTableHeader(cleanName) && !isFooterOrTotal(cleanName) && !isPromoOrCouponLine(cleanName)) {
          const finalQty = qty && Number(qty) > 0 ? Number(qty) : 1;
          const qtyStr = ` (x${finalQty})`;
          items.push(`• ${cleanName}${qtyStr}: ${new Intl.NumberFormat('vi-VN').format(lastPrice.val)}đ`);
          inItemSection = true;
          continue;
        }
      }

      // 2. Dạng 2 hoặc 3 dòng
      if (i + 1 < textLines.length) {
        const nextLine = textLines[i + 1].trim();
        let nextPrices = extractValidPrices(nextLine);
        let consumed = 1;
        let extraTitle = '';

        // Nếu dòng i+1 là phụ đề (ví dụ "Kombucha Lemon") và dòng i+2 là giá tiền
        if (nextPrices.length === 0 && i + 2 < textLines.length) {
          const thirdLine = textLines[i + 2].trim();
          const thirdPrices = extractValidPrices(thirdLine);
          if (thirdPrices.length > 0 && !isFooterOrTotal(thirdLine) && !isPromoOrCouponLine(nextLine)) {
            nextPrices = thirdPrices;
            consumed = 2;
            if (!isPureNumberOrNoise(nextLine) && !isHeaderLine(nextLine) && !isTableHeader(nextLine)) {
              const cleanSub = cleanItemTitle(nextLine);
              if (cleanSub) extraTitle = ` (${cleanSub})`;
            }
          }
        }

        if (nextPrices.length > 0 && !isFooterOrTotal(line) && !isHeaderLine(line) && !isTableHeader(line) && !isPromoOrCouponLine(line)) {
          const lastNext = nextPrices[nextPrices.length - 1];
          let cleanName = line.trim();
          let qty = '';

          // Kiểm tra số lượng ở đầu tên món: 1.00x ... hoặc 2x ... hoặc BE 00x ...
          const leadQtyMatch = cleanName.match(/^(?:[a-zA-Z]{1,3}\s*)?(\d+(?:\.\d+)?)\s*x\s*(.+)$/i);
          if (leadQtyMatch) {
            qty = Math.round(Number(leadQtyMatch[1])) || 1;
            cleanName = leadQtyMatch[2].trim();
          }

          // Bảng nhiều cột: "8,990,000   1   8,990,000"
          if (!qty && nextPrices.length >= 2) {
            const between = nextLine.substring(nextPrices[0].index + nextPrices[0].text.length, nextPrices[nextPrices.length - 1].index).trim();
            const betweenMatch = between.match(/\b([1-9]\d{0,2})\b/);
            if (betweenMatch) {
              qty = parseInt(betweenMatch[1], 10);
            } else {
              const before = nextLine.substring(0, nextPrices[0].index).trim();
              const beforeMatch = before.match(/\b([1-9]\d{0,2})\b/);
              if (beforeMatch) qty = parseInt(beforeMatch[1], 10);
            }
          }

          if (!qty) {
            const qtyMatch = nextLine.match(/(?:x\s*(\\d+)|(?:^|\s)(\d+)\s*x|\bSL[:\s]*(\d+)|(?:^|\s)([1-9]\d{0,2})\s+(?:\d{1,3}(?:[.,]\d{3})+|\d{4,9}))/i);
            if (qtyMatch) qty = parseInt(qtyMatch[1] || qtyMatch[2] || qtyMatch[3] || qtyMatch[4], 10);
          }

          cleanName = cleanItemTitle(cleanName);
          cleanName += extraTitle;

          if (!isPureNumberOrNoise(cleanName) && !isHeaderLine(cleanName) && !isFooterOrTotal(cleanName) && !isTableHeader(cleanName) && !isPromoOrCouponLine(cleanName)) {
            const finalQty = qty && Number(qty) > 0 ? Number(qty) : 1;
            const qtyStr = ` (x${finalQty})`;
            items.push(`• ${cleanName}${qtyStr}: ${new Intl.NumberFormat('vi-VN').format(lastNext.val)}đ`);
            inItemSection = true;
            i += consumed;
            continue;
          }
        }
      }
    }

    return items;
  },

  async scanReceiptWithOfflineOCR(dataUrl) {
    if (typeof Tesseract === 'undefined') {
      throw new Error('Thư viện OCR chưa sẵn sàng');
    }

    this.setAIScanningState(true, 'Đang chuẩn bị quét...');

    // 1. Tiền xử lý ảnh (tăng tương phản để làm rõ nét chữ in nhiệt)
    const preprocessCanvas = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        const maxDim = 1200;
        if (w > maxDim || h > maxDim) {
          if (w >= h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        try {
          const imgData = ctx.getImageData(0, 0, w, h);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const gray = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
            const contrast = 1.35;
            const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
            const cGray = Math.max(0, Math.min(255, factor * (gray - 128) + 128));
            d[i] = cGray;
            d[i + 1] = cGray;
            d[i + 2] = cGray;
          }
          ctx.putImageData(imgData, 0, 0);
        } catch (_) {}

        resolve(canvas);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });

    // 2. Nhận diện chữ bằng Tesseract.js (Chạy song ngữ vie + eng)
    const result = await Tesseract.recognize(
      preprocessCanvas,
      'vie+eng',
      {
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            const pct = Math.round(m.progress * 100);
            this.setAIScanningState(true, `Nhận diện chữ số: ${pct}%...`);
          } else if (m.status) {
            this.setAIScanningState(true, 'Đang nhận diện hoá đơn...');
          }
        }
      }
    );

    const rawLines = result?.data?.lines || [];
    const textLines = rawLines.map(l => (l.text || '').trim()).filter(Boolean);

    let detectedAmount = null;

    const totalKeyRegex = /(?:t[oeôóòỏõọéèẻẽẹếề]ng\s*c[oộ]ng|thanh\s*to[aán]|t[oeôóòỏõọéèẻẽẹếề]ng\s*ti[eền]|c[oộ]ng\s*ti[eền]\s*h[aàng]|kh[aá]ch\s*ph[aải]\s*tr[aả]|ti[eền]\s*m[aặt]|t[oeôóòỏõọéèẻẽẹếề]ng|total|grand\s*total|amount|balance)/i;
    const amountNumRegex = /(?:[\s:=]|^)(\d{1,3}(?:[.,]\d{3})+|\d{4,9})(?:\s*(?:đ|vnd|vnđ|d))?/i;

    // Helper kiểm tra giá trị số tiền hợp lệ (không phải ngày tháng năm hay số điện thoại)
    const parseValidAmount = (rawStr, line = '', matchIndex = -1) => {
      if (!rawStr) return null;
      if (matchIndex >= 0 && line) {
        const prefix = line.slice(0, matchIndex);
        const suffix = line.slice(matchIndex + rawStr.length);
        const isDateSepAdjacent = /[/\-]\s*$/.test(prefix) || /^\s*[/\-]/.test(suffix);
        if (isDateSepAdjacent) return null;
      }
      const hasSep = rawStr.includes('.') || rawStr.includes(',');
      const num = parseInt(rawStr.replace(/[.,]/g, ''), 10);
      if (isNaN(num) || num < 1000) return null;
      // Bỏ qua số điện thoại (10 hoặc 11 chữ số bắt đầu bằng 0 và không có dấu chấm/phẩy)
      if (!hasSep && (rawStr.length === 10 || rawStr.length === 11) && rawStr.startsWith('0')) return null;
      return num;
    };

    // 3. Quét dòng chứa từ khoá thanh toán
    for (let i = textLines.length - 1; i >= 0; i--) {
      const line = textLines[i];
      if (totalKeyRegex.test(line)) {
        const match = line.match(amountNumRegex);
        if (match && match[1]) {
          const numIdx = line.indexOf(match[1], match.index);
          const num = parseValidAmount(match[1], line, numIdx);
          if (num) {
            detectedAmount = num;
            break;
          }
        }
        if (i + 1 < textLines.length) {
          const nextLine = textLines[i + 1];
          const nextMatch = nextLine.match(amountNumRegex);
          if (nextMatch && nextMatch[1]) {
            const nextIdx = nextLine.indexOf(nextMatch[1], nextMatch.index);
            const num = parseValidAmount(nextMatch[1], nextLine, nextIdx);
            if (num) {
              detectedAmount = num;
              break;
            }
          }
        }
      }
    }

    if (!detectedAmount) {
      const bottomHalf = textLines.slice(Math.floor(textLines.length * 0.4));
      let maxVal = 0;
      for (const line of bottomHalf) {
        if (/\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/.test(line) || /\b\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}\b/.test(line)) continue;
        const match = line.match(amountNumRegex);
        if (match && match[1]) {
          const numIdx = line.indexOf(match[1], match.index);
          const num = parseValidAmount(match[1], line, numIdx);
          if (num && num > maxVal) {
            maxVal = num;
          }
        }
      }
      if (maxVal > 0) detectedAmount = maxVal;
    }

    // 4. Trích xuất danh sách mặt hàng đầy đủ
    const detectedItems = this.extractItemsFromOCR(textLines, detectedAmount);

    // 5. Trích xuất ngày & giờ từ hoá đơn
    const detectedDateTime = this.extractDateTimeFromOCR(textLines);

    return {
      success: true,
      amount: detectedAmount,
      items: detectedItems,
      date: detectedDateTime.date,
      time: detectedDateTime.time,
      text: result?.data?.text || ''
    };
  },

  /* ==================== AI RECEIPT SCAN ENGINE ==================== */
  async compressImageForAI(dataUrl, maxDim = 1280, quality = 0.78) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w >= h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64Data = compressedDataUrl.replace(/^data:image\/\w+;base64,/, '');
        resolve(base64Data);
      };
      img.onerror = () => {
        resolve(dataUrl.replace(/^data:image\/\w+;base64,/, ''));
      };
      img.src = dataUrl;
    });
  },

  setAIScanningState(isScanning, customText = null) {
    this.isScanningAI = isScanning;
    const btn = document.getElementById('btn-tx-ai-scan');
    const textEl = document.getElementById('btn-ai-scan-text');
    if (btn) {
      if (isScanning) {
        btn.classList.add('is-scanning');
        if (textEl) textEl.textContent = customText || 'Đang quét hoá đơn...';
      } else {
        btn.classList.remove('is-scanning');
        if (textEl) textEl.textContent = 'Quét hoá đơn';
      }
    }
  },

  cancelAIScan() {
    if (!this.isScanningAI) return;
    this._userAbortedAI = true;
    this.setAIScanningState(false);
    showToast('Đã huỷ quét hoá đơn', 'info');
  },

  /* ==================== SMART OCR CATEGORY CLASSIFIER (MULTI-ITEM) ==================== */
  async categorizeFromOCRText(ocrText, detectedItems = []) {
    if (!ocrText || typeof ocrText !== 'string') return null;

    const removeAccents = (str) => {
      return (str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();
    };

    const rawText = ocrText.toLowerCase();
    const normText = removeAccents(rawText);

    let categories = [];
    try {
      categories = await db.categories.where('type').equals('expense').toArray();
    } catch (_) {}
    if (!categories || categories.length === 0) return null;

    // Helper kiểm tra từ khoá theo ranh giới từ (word boundary) để không bị dính từ đơn trong địa chỉ/từ khác
    const testKeyword = (text, kw) => {
      if (!kw || !text) return false;
      if (kw.includes(' ')) {
        return text.includes(kw);
      }
      const regex = new RegExp(`(?:^|[^a-z0-9])${kw}(?:[^a-z0-9]|$)`, 'i');
      return regex.test(text);
    };

    // Kiểm tra các từ ghép đặc thù để chặn nhận dạng nhầm (ví dụ: "máy lọc nước" không phải "ăn uống")
    const isWaterPurifierOrAppliance = (text) => {
      return /(?:may\s*loc\s*nuoc|loc\s*nuoc|loi\s*loc|binh\s*loc|cay\s*nuoc|cay\s*nuoc\s*nong\s*lanh|karofi|kangaroo|sunhouse|aosmith|may\s*giat|may\s*say|tu\s*lanh|may\s*hut\s*bui|am\s*sieu\s*toc|am\s*dun|bep\s*tu|bep\s*ga|dieu\s*hoa|may\s*lanh)/i.test(text);
    };

    const isCleaningOrToiletries = (text) => {
      return /(?:nuoc\s*rua\s*chen|nuoc\s*rua\s*bat|nuoc\s*lau\s*nha|nuoc\s*lau\s*san|nuoc\s*giat|nuoc\s*xa\s*vai|nuoc\s*tay|nuoc\s*hoa)/i.test(text);
    };

    // Nhóm quy tắc từ điển phân loại ngữ nghĩa
    const ruleGroups = [
      {
        group: 'housing',
        keywords: [
          'may loc nuoc', 'loc nuoc', 'loi loc', 'binh loc', 'cay nuoc nong lanh',
          'karofi', 'kangaroo', 'sunhouse', 'aosmith', 'panasonic', 'toshiba', 'electrolux',
          'philips', 'xiaomi', 'tefal', 'lock&lock', 'lock and lock',
          'noi com dien', 'noi com', 'noi chien', 'bep tu', 'bep ga', 'bep dien',
          'may hut bui', 'may giat', 'tu lanh', 'dieu hoa', 'may lanh', 'quat dien', 'quat',
          'am sieu toc', 'am dun', 'may say', 'ban ui', 'ban la', 'may say toc',
          'do gia dung', 'thiet bi', 'gia dung', 'do dung', 'dien may', 'dien may xanh', 'dmx',
          'nguyen kim', 'the gioi di dong', 'tgdd', 'cellphones', 'fpt shop', 'noi that',
          'khoa', 'bong den', 'o cam', 'day dien', 'son', 've sinh nha'
        ],
        catNamePatterns: ['nha o', 'tien thue', 'nha cua', 'thiet bi', 'gia dung', 'do dung', 'mua sam', 'home', 'housing', 'appliances']
      },
      {
        group: 'food',
        keywords: [
          'an uong', 'cafe', 'ca phe', 'coffee', 'tra sua', 'tra dao', 'quan an', 'quan nuoc',
          'quan ca phe', 'quan com', 'quan nhau', 'nha hang', 'food',
          'com', 'pho', 'bun', 'banh mi', 'lau', 'nuong', 'bbq', 'pizza', 'burger', 'kfc',
          'lotteria', 'jollibee', 'highlands', 'phuc long', 'starbucks', 'the coffee house',
          'trung nguyen', 'thit', 'hai san', 'bia', 'nuoc ngot', 'do an', 'mon an', 'an vat',
          'banh ngot', 'che', 'suon', 'ga ran', 'nem', 'goi', 'mi cay', 'dimsum', 'sushi'
        ],
        catNamePatterns: ['an uong', 'ca phe', 'cafe', 'an tiep', 'nha hang', 'am thuc', 'food', 'an']
      },
      {
        group: 'groceries',
        keywords: [
          'sieu thi', 'mart', 'winmart', 'vinmart', 'co.op', 'coop', 'bach hoa xanh', 'bhx',
          'circle k', 'gs25', '7-eleven', 'family mart', 'mega market', 'go!', 'big c',
          'lotte mart', 'aeon', 'cho', 'thuc pham', 'rau', 'cu', 'qua', 'trai cay', 'thit heo',
          'thit bo', 'ca tuoi', 'trung', 'sua', 'gao', 'gia vi', 'dau an', 'tap hoa', 'do kho',
          'nuoc rua chen', 'nuoc rua bat', 'nuoc giat', 'nuoc lau nha', 'nuoc lau san', 'giay ve sinh'
        ],
        catNamePatterns: ['di cho', 'sieu thi', 'thuc pham', 'tap hoa', 'cho', 'market', 'groceries']
      },
      {
        group: 'transport',
        keywords: [
          'xang', 'dau', 'petrolimex', 'pvoil', 'petro', 'grab', 'be', 'gojek', 'xanh sm',
          'taxi', 'mai linh', 'vina sun', 've xe', 'gui xe', 'trong xe', 'rua xe', 'sua xe',
          'bao duong', 'thay nhot', 'tram thu phi', 'vetc', 'epass', 've tau', 've may bay',
          'vietnam airlines', 'vietjet', 'bamboo'
        ],
        catNamePatterns: ['di chuyen', 'xang', 'xe', 'giao thong', 'xang xe', 'transport']
      },
      {
        group: 'shopping',
        keywords: [
          'quan ao', 'thoi trang', 'giay', 'dep', 'my pham', 'tui xach', 'dong ho', 'shopee',
          'lazada', 'tiki', 'tiktok shop', 'uniqlo', 'zara', 'h&m', 'canifa', 'ivymoda',
          'phu kien', 'son', 'kem chong nang', 'nuoc hoa', 'vay', 'ao so mi', 'shop', 'boutique'
        ],
        catNamePatterns: ['mua sam', 'thoi trang', 'quan ao', 'do dung', 'shopping']
      },
      {
        group: 'bills',
        keywords: [
          'dien luc', 'evn', 'tien dien', 'tien nuoc', 'cap nuoc', 'sawaco', 'internet',
          'viettel', 'fpt', 'vnpt', 'mobifone', 'vinaphone', 'vtvcap', 'truyen hinh',
          'rac', 'phi dich vu', 'phi chung cu', 'quan ly toa nha', 'gas', 'tien mang'
        ],
        catNamePatterns: ['hoa don', 'dien nuoc', 'tien ich', 'dich vu', 'bill', 'utilities']
      },
      {
        group: 'health',
        keywords: [
          'nha thuoc', 'duoc', 'pharmacity', 'long chau', 'an khang', 'thuoc', 'kham',
          'benh vien', 'phong kham', 'bac si', 'nha khoa', 'rang', 'kinh mat', 'xet nghiem',
          'y te', 'khau trang', 'vitamin', 'thuc pham chuc nang'
        ],
        catNamePatterns: ['suc khoe', 'y te', 'thuoc', 'kham benh', 'health', 'medical']
      },
      {
        group: 'entertainment',
        keywords: [
          'rap phim', 'cgv', 'lotte cinema', 'galaxy', 'bhd', 've xem phim', 'karaoke',
          'billiards', 'bida', 'bowling', 'du lich', 'khach san', 'hotel', 'resort',
          'homestay', 'tour', 've tham quan', 'cong vien', 'spa', 'massage', 'netflix'
        ],
        catNamePatterns: ['giai tri', 'phim anh', 'du lich', 'vui choi', 'entertainment', 'travel']
      },
      {
        group: 'education',
        keywords: [
          'hoc phi', 'truong', 'dai hoc', 'nha sach', 'fahasa', 'tien tho', 'phuong nam',
          'sach', 'giao trinh', 'vo', 'but', 'khoa hoc', 'tieng anh', 'toeic', 'ielts', 'gia su'
        ],
        catNamePatterns: ['giao duc', 'khoa hoc', 'hoc tap', 'sach', 'hoc phi', 'education']
      }
    ];

    // Chấm điểm theo nhóm ngữ nghĩa
    const groupScores = {};
    ruleGroups.forEach(r => { groupScores[r.group] = 0; });

    // 1. Phân tích đối chiếu đa item (Multi-item cross-referencing)
    const itemStrings = Array.isArray(detectedItems) && detectedItems.length > 0
      ? detectedItems.map(it => removeAccents(it))
      : [normText];

    const hasApplianceContext = isWaterPurifierOrAppliance(normText);
    const hasCleaningContext = isCleaningOrToiletries(normText);

    for (const itStr of itemStrings) {
      const itAppliance = isWaterPurifierOrAppliance(itStr);
      const itCleaning = isCleaningOrToiletries(itStr);

      if (itAppliance) {
        groupScores['housing'] = (groupScores['housing'] || 0) + 12;
      }
      if (itCleaning) {
        groupScores['groceries'] = (groupScores['groceries'] || 0) + 6;
        groupScores['housing'] = (groupScores['housing'] || 0) + 4;
      }

      for (const rule of ruleGroups) {
        // Nếu là đồ gia dụng/máy lọc nước thì KHÔNG được cộng điểm ăn uống
        if (rule.group === 'food' && (itAppliance || hasApplianceContext)) {
          continue;
        }
        for (const kw of rule.keywords) {
          if (testKeyword(itStr, kw)) {
            const weight = kw.length >= 6 ? 4 : (kw.length >= 4 ? 2 : 1);
            groupScores[rule.group] = (groupScores[rule.group] || 0) + weight;
          }
        }
      }
    }

    // 2. Chấm điểm tiêu đề quán / cửa hàng ở đầu hoá đơn
    const headerLines = normText.split('\n').slice(0, 5).join(' ');
    for (const rule of ruleGroups) {
      if (rule.group === 'food' && hasApplianceContext) continue;
      for (const kw of rule.keywords) {
        if (testKeyword(headerLines, kw)) {
          groupScores[rule.group] = (groupScores[rule.group] || 0) + (kw.length >= 6 ? 5 : 3);
        }
      }
    }

    // 3. Tìm nhóm có điểm cao nhất
    let bestGroup = null;
    let maxScore = 0;
    for (const [grp, score] of Object.entries(groupScores)) {
      if (score > maxScore) {
        maxScore = score;
        bestGroup = grp;
      }
    }

    if (bestGroup && maxScore >= 2) {
      const targetRule = ruleGroups.find(r => r.group === bestGroup);
      if (targetRule) {
        for (const cat of categories) {
          const cNorm = removeAccents(cat.name);
          const matches = targetRule.catNamePatterns.some(p => cNorm.includes(p) || p.includes(cNorm));
          if (matches) {
            return cat;
          }
        }
      }
    }

    // 4. Dự phòng: So khớp trực tiếp tên danh mục nếu người dùng đặt tên đặc thù
    if (!hasApplianceContext) {
      for (const cat of categories) {
        const cNorm = removeAccents(cat.name);
        if (cNorm.length >= 4 && normText.includes(cNorm)) {
          return cat;
        }
      }
    }

    return null;
  },

  /* ==================== AI RECEIPT SCANNER (CLOUDFLARE & GEMINI) ==================== */
  async prepareImageForAI(dataUrl, maxDim = 1280) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  },

  parseAIReceiptResponse(rawText) {
    if (!rawText) return null;
    let clean = rawText.trim();
    clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/s, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) clean = jsonMatch[0];

    let json;
    try {
      json = JSON.parse(clean);
    } catch (_) {
      return null;
    }

    let amount = null;
    if (json.totalAmount !== undefined && json.totalAmount !== null) {
      const parsed = typeof json.totalAmount === 'number' ? json.totalAmount : parseFloat(String(json.totalAmount).replace(/[^\d.]/g, ''));
      if (!isNaN(parsed) && parsed > 0) amount = parsed;
    }

    let items = [];
    if (Array.isArray(json.items)) {
      items = json.items
        .filter(it => it && (it.name || it.item))
        .map(it => {
          const name = (it.name || it.item || '').trim();
          const price = it.price ? ` - ${new Intl.NumberFormat('vi-VN').format(it.price)}đ` : '';
          const qty = it.qty && it.qty > 1 ? ` (x${it.qty})` : '';
          return `${name}${qty}${price}`;
        });
    }

    return {
      amount: amount,
      date: json.date || null,
      time: json.time || null,
      category: json.category || null,
      items: items,
      text: items.join('\n')
    };
  },

  async scanReceiptWithCloudflareAI(dataUrl, accountId, token, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error(`Timeout (${Math.round(timeoutMs / 1000)}s)`)), timeoutMs);

    try {
      const processedBase64 = await this.prepareImageForAI(dataUrl, 1280);

      const prompt = `Bạn là chuyên gia trích xuất hoá đơn (OXR / Receipt OCR). Hãy phân tích ảnh hoá đơn này và trả về JSON thuần tuý (không kèm markdown \`\`\`json, không giải thích) theo cấu trúc:
{
  "totalAmount": 125000,
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "category": "Ăn uống",
  "items": [
    { "name": "Tên món / hàng hoá", "price": 35000, "qty": 1 }
  ]
}
Quy tắc:
- totalAmount: số tiền tổng thanh toán cuối cùng (number, không chứa ký tự lạ).
- date: định dạng YYYY-MM-DD nếu thấy trên hoá đơn, nếu không có để null.
- time: định dạng HH:MM (24h) nếu có, nếu không để null.
- category: chọn 1 trong các danh mục: Ăn uống, Mua sắm, Di chuyển, Đi chợ / Siêu thị, Hoá đơn & Tiện ích, Sức khoẻ, Giải trí, Khác.
- items: danh sách các món/hàng hoá kèm giá và số lượng nếu đọc được.`;

      let res;
      let data;
      let usedProxy = false;

      // 1. Thử gọi qua endpoint proxy của server để tránh bị trình duyệt chặn CORS ("Load failed")
      try {
        const proxyRes = await fetch('./api/ai/cloudflare-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId,
            apiToken: token,
            payload: { prompt: prompt, image: processedBase64 }
          }),
          signal: controller.signal
        });
        if (proxyRes.status !== 404) {
          res = proxyRes;
          data = await proxyRes.json().catch(() => ({}));
          usedProxy = true;
        }
      } catch (proxyErr) {
        if (proxyErr.name === 'AbortError') throw proxyErr;
      }

      // 2. Dự phòng gọi trực tiếp nếu server không có proxy
      if (!usedProxy) {
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`;
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: prompt,
            image: processedBase64
          }),
          signal: controller.signal
        });
        data = await res.json().catch(() => ({}));

        // Tự động kích hoạt Meta Terms agreement nếu chưa xác nhận (lỗi 5016 / 403)
        if (res.status === 403 || (data.errors && data.errors.some(e => e.code === 5016 || /agree|terms/i.test(e.message || '')))) {
          console.log('[Cloudflare AI] Kích hoạt Meta Terms agreement và thử lại...');
          await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: 'agree' }),
            signal: controller.signal
          });
          res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt, image: processedBase64 }),
            signal: controller.signal
          });
          data = await res.json().catch(() => ({}));
        }
      }

      if (!res.ok || !data.success) {
        const errMsg = (data.errors && data.errors[0] && data.errors[0].message) || (data.error) || `HTTP ${res.status}`;
        throw new Error(errMsg);
      }

      const rawResponse = (data.result && (data.result.response || data.result.text)) || '';
      return this.parseAIReceiptResponse(rawResponse);
    } catch (err) {
      if (err.name === 'AbortError' || /Timeout/i.test(err.message)) {
        throw new Error(`AI không phản hồi sau ${Math.round(timeoutMs / 1000)}s`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async scanReceiptWithGeminiAI(dataUrl, apiKey, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error(`Timeout (${Math.round(timeoutMs / 1000)}s)`)), timeoutMs);

    try {
      const processedBase64 = await this.prepareImageForAI(dataUrl, 1280);
      const mimeMatch = processedBase64.match(/^data:([^;]+);base64,(.+)$/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const base64Data = mimeMatch ? mimeMatch[2] : processedBase64;

      const prompt = `Bạn là chuyên gia trích xuất hoá đơn (OXR / Receipt OCR). Hãy phân tích ảnh hoá đơn này và trả về JSON thuần tuý (không kèm markdown \`\`\`json, không giải thích) theo cấu trúc:
{
  "totalAmount": 125000,
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "category": "Ăn uống",
  "items": [
    { "name": "Tên món / hàng hoá", "price": 35000, "qty": 1 }
  ]
}
Quy tắc:
- totalAmount: số tiền tổng thanh toán cuối cùng (number, không chứa ký tự lạ).
- date: định dạng YYYY-MM-DD nếu thấy trên hoá đơn, nếu không có để null.
- time: định dạng HH:MM (24h) nếu có, nếu không để null.
- category: chọn 1 trong các danh mục: Ăn uống, Mua sắm, Di chuyển, Đi chợ / Siêu thị, Hoá đơn & Tiện ích, Sức khoẻ, Giải trí, Khác.
- items: danh sách các món/hàng hoá kèm giá và số lượng nếu đọc được.`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            response_mime_type: "application/json"
          }
        }),
        signal: controller.signal
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.candidates || !data.candidates[0]) {
        const errMsg = (data.error && data.error.message) || `HTTP ${res.status}`;
        throw new Error(errMsg);
      }

      const rawResponse = data.candidates[0].content.parts[0].text || '';
      return this.parseAIReceiptResponse(rawResponse);
    } catch (err) {
      if (err.name === 'AbortError' || /Timeout/i.test(err.message)) {
        throw new Error(`AI không phản hồi sau ${Math.round(timeoutMs / 1000)}s`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  /* ==================== HYBRID RECEIPT SCANNER (AI VISION + QR + TESSERACT OCR) ==================== */
  async scanReceiptWithOCR() {
    if (this.attachedImages.length === 0) {
      showToast('Vui lòng chụp hoặc chọn ảnh hoá đơn trước khi quét', 'warning');
      return;
    }

    let autoAmount = true;
    let autoDateTime = true;
    let autoItems = true;
    let autoCategory = true;
    let offlineQrEnabled = true;
    let aiEnabled = true;
    let aiTimeoutSec = 8;

    if (window.UISettings) {
      try {
        autoAmount = await window.UISettings.getOCRAutoAmount();
        autoDateTime = await window.UISettings.getOCRAutoDateTime();
        autoItems = await window.UISettings.getOCRAutoItems();
        autoCategory = await window.UISettings.getOCRAutoCategory();
        offlineQrEnabled = await window.UISettings.getOCROfflineQr();
        aiEnabled = await window.UISettings.getOCRAIEnabled();
        aiTimeoutSec = await window.UISettings.getOCRAITimeout();
      } catch (e) {
        console.warn('[scanReceiptWithOCR] Lỗi đọc cài đặt:', e);
      }
    }

    const aiTimeoutMs = (parseInt(aiTimeoutSec, 10) || 8) * 1000;
    this._userAbortedAI = false;
    const isMultiBill = this.attachedImages.length > 1;

    try {
      let totalAmount = 0;
      let billItemsList = [];
      let firstDate = null;
      let firstTime = null;
      let allTexts = [];
      let suggestedCategories = [];
      let scannedSuccessCount = 0;
      let lastEngineUsed = 'offline';

      const configuredEngine = window.UISettings ? await window.UISettings.getOCREngine() : 'cloudflare';

      for (let idx = 0; idx < this.attachedImages.length; idx++) {
        if (this._userAbortedAI) break;
        const imgDataUrl = this.attachedImages[idx];
        const billLabel = isMultiBill ? `hoá đơn ${idx + 1}/${this.attachedImages.length}` : 'hoá đơn';

        this.setAIScanningState(true, `Đang xử lý ${billLabel}...`);

        let billAmount = null;
        let billItems = [];
        let billDate = null;
        let billTime = null;
        let billText = '';
        let aiSuccess = false;

        // 1. Thử quét mã VietQR / hoá đơn điện tử QR trên ảnh này
        if (offlineQrEnabled) {
          try {
            const qrResult = await this.scanReceiptQrOffline(imgDataUrl);
            if (qrResult && qrResult.amount) {
              billAmount = qrResult.amount;
              if (qrResult.note) {
                billItems = [qrResult.note];
                billText = qrResult.note;
              }
              lastEngineUsed = 'qr';
            }
          } catch (_) {}
        }

        // 2. Quét bằng AI Vision (Cloudflare Workers AI hoặc Google Gemini) nếu bật AI
        if (aiEnabled && (!billAmount || billItems.length === 0)) {
          // 2.1 Thử Cloudflare Workers AI
          if (configuredEngine === 'cloudflare') {
            const accId = window.UISettings ? await window.UISettings.getCloudflareAccountId() : '';
            const token = window.UISettings ? await window.UISettings.getCloudflareApiToken() : '';
            if (accId && token) {
              try {
                this.setAIScanningState(true, `Cloudflare AI đang phân tích ${billLabel}... (tối đa ${aiTimeoutSec}s)`);
                const cfRes = await this.scanReceiptWithCloudflareAI(imgDataUrl, accId, token, aiTimeoutMs);
                if (cfRes) {
                  if (!billAmount && cfRes.amount) billAmount = cfRes.amount;
                  if (cfRes.items && cfRes.items.length > 0) billItems = cfRes.items;
                  if (cfRes.date) billDate = cfRes.date;
                  if (cfRes.time) billTime = cfRes.time;
                  if (cfRes.category) suggestedCategories.push(cfRes.category);
                  if (cfRes.text) billText = (billText ? billText + '\n' : '') + cfRes.text;
                  aiSuccess = true;
                  lastEngineUsed = 'cloudflare';
                }
              } catch (cfErr) {
                console.warn('[scanReceiptWithOCR] Cloudflare AI thất bại / timeout, chuyển về Tesseract OCR:', cfErr);
                showToast(`Cloudflare AI: ${cfErr.message}. Tự động chuyển sang OCR ngoại tuyến...`, 'info', 3000);
              }
            }
          }
          // 2.2 Thử Google Gemini AI
          else if (configuredEngine === 'gemini') {
            const geminiKey = window.UISettings ? await window.UISettings.getGeminiApiKey() : '';
            if (geminiKey) {
              try {
                this.setAIScanningState(true, `Gemini AI đang phân tích ${billLabel}... (tối đa ${aiTimeoutSec}s)`);
                const geminiRes = await this.scanReceiptWithGeminiAI(imgDataUrl, geminiKey, aiTimeoutMs);
                if (geminiRes) {
                  if (!billAmount && geminiRes.amount) billAmount = geminiRes.amount;
                  if (geminiRes.items && geminiRes.items.length > 0) billItems = geminiRes.items;
                  if (geminiRes.date) billDate = geminiRes.date;
                  if (geminiRes.time) billTime = geminiRes.time;
                  if (geminiRes.category) suggestedCategories.push(geminiRes.category);
                  if (geminiRes.text) billText = (billText ? billText + '\n' : '') + geminiRes.text;
                  aiSuccess = true;
                  lastEngineUsed = 'gemini';
                }
              } catch (geminiErr) {
                console.warn('[scanReceiptWithOCR] Gemini AI thất bại / timeout, chuyển về Tesseract OCR:', geminiErr);
                showToast(`Gemini AI: ${geminiErr.message}. Tự động chuyển sang OCR ngoại tuyến...`, 'info', 3000);
              }
            }
          }
        }

        // 2.3 Fallback Tesseract OCR nếu chưa có kết quả (hoặc AI bị tắt / lỗi)
        if (!aiSuccess && (!billAmount || billItems.length === 0)) {
          if (typeof Tesseract === 'undefined') {
            showToast('Thư viện OCR chưa sẵn sàng hoặc đang tải trong nền', 'warning');
            return;
          }
          this.setAIScanningState(true, `Đang quét OCR ngoại tuyến ${billLabel}...`);
          const ocrRes = await this.scanReceiptWithOfflineOCR(imgDataUrl);
          if (ocrRes) {
            if (!billAmount && ocrRes.amount) billAmount = ocrRes.amount;
            if (ocrRes.items && ocrRes.items.length > 0) billItems = ocrRes.items;
            if (ocrRes.date) billDate = ocrRes.date;
            if (ocrRes.time) billTime = ocrRes.time;
            if (ocrRes.text) billText = (billText ? billText + '\n' : '') + ocrRes.text;
            lastEngineUsed = 'offline';
          }
        }

        if (billAmount || billItems.length > 0) {
          scannedSuccessCount++;
        }

        if (billAmount) {
          totalAmount += billAmount;
        }

        if (billItems.length > 0) {
          if (isMultiBill) {
            billItemsList.push(`[Hoá đơn ${idx + 1}]:\n` + billItems.join('\n'));
          } else {
            billItemsList.push(billItems.join('\n'));
          }
        }

        if (!firstDate && billDate) firstDate = billDate;
        if (!firstTime && billTime) firstTime = billTime;
        if (billText) allTexts.push(billText);
      }

      if (scannedSuccessCount === 0 && totalAmount === 0 && billItemsList.length === 0) {
        showToast('Không thể nhận diện nội dung từ hoá đơn', 'warning');
        return;
      }

      let infoCount = 0;

      // 1. Điền số tiền (Tự động SUM nếu nhiều hoá đơn)
      if (autoAmount && totalAmount > 0) {
        const formattedAmount = new Intl.NumberFormat('vi-VN').format(totalAmount);
        const amountInput = document.getElementById('tx-amount-input');
        const amountText = document.getElementById('tx-amount-text');
        if (amountInput) amountInput.value = formattedAmount;
        if (amountText) amountText.textContent = formattedAmount;
        infoCount++;
      }

      // 2. Điền Ngày & Giờ từ hoá đơn
      if (autoDateTime && (firstDate || firstTime)) {
        const dateInput = document.getElementById('tx-date-input');
        const timeInput = document.getElementById('tx-time-input');
        const nativeDt = document.getElementById('tx-datetime-native');

        if (firstDate && dateInput) {
          dateInput.value = firstDate;
          infoCount++;
        }
        if (firstTime && timeInput) {
          timeInput.value = firstTime;
          infoCount++;
        }

        const curDate = dateInput?.value || (typeof getLocalDateStr === 'function' ? getLocalDateStr() : '');
        const curTime = timeInput?.value || '12:00';
        if (nativeDt && curDate) {
          nativeDt.value = `${curDate}T${curTime}`;
        }
        this.updateDateTimeDisplays(curDate, curTime);
      }

      // 3. Điền danh sách món & giá vào ghi chú (Ghi đè nếu máy tự chèn hoặc ô trống, chặn & cảnh báo nếu đã nhập tay)
      let noteProtected = false;
      if (autoItems && billItemsList.length > 0) {
        const noteInput = document.getElementById('tx-note-input');
        if (noteInput) {
          const currentNote = noteInput.value.trim();
          const newScannedText = billItemsList.join('\n\n');
          this._lastScannedItemsText = newScannedText;

          // Điều kiện người dùng đã nhập tay hoặc đã sửa ghi chú:
          // Nếu ô ghi chú có nội dung và khác với nội dung máy từng tự điền
          const isManual = currentNote !== '' && currentNote !== (this.lastAutoNoteValue || '').trim();

          if (isManual) {
            noteProtected = true;
            this.showNoteProtectedAlert();
          } else {
            noteInput.value = newScannedText;
            this.lastAutoNoteValue = noteInput.value;
            this.isNoteManuallyEdited = false;
            this.autoResizeNoteInput();
            this.hideNoteProtectedAlert();
            infoCount++;
          }
        }
      }

      // 4. Tự động khớp và chọn danh mục bằng kết quả OCR
      let matchedCatName = '';
      if (autoCategory && allTexts.length > 0) {
        const matchedCat = await this.categorizeFromOCRText(allTexts.join('\n'), billItemsList);
        if (matchedCat) {
          await this.selectCategory(matchedCat);
          matchedCatName = matchedCat.name;
          infoCount++;
        }
      }

      if (noteProtected) {
        const amtMsg = totalAmount > 0 ? `${new Intl.NumberFormat('vi-VN').format(totalAmount)}đ` : '';
        const catMsg = matchedCatName ? ` • Danh mục: ${matchedCatName}` : '';
        const baseMsg = amtMsg ? `✓ Đã nhận diện ${amtMsg}${catMsg}` : (isMultiBill ? `✓ Đã quét ${this.attachedImages.length} hoá đơn` : '✓ Đã nhận diện hoá đơn');
        showToast(`${baseMsg} • ⚠️ Giữ nguyên ghi chú do bạn tự nhập`, 'warning', 4500);
      } else if (infoCount > 0) {
        const catMsg = matchedCatName ? ` • Danh mục: ${matchedCatName}` : '';
        const amtMsg = totalAmount > 0 ? `${new Intl.NumberFormat('vi-VN').format(totalAmount)}đ` : '';
        const dtMsg = firstDate ? ` • Ngày: ${firstDate}` : '';
        if (isMultiBill) {
          showToast(`✓ Đã quét & tự cộng ${this.attachedImages.length} hoá đơn! Tổng tiền: ${amtMsg}${catMsg}`, 'success');
        } else {
          showToast(`✓ Nhận diện OCR thành công! ${amtMsg}${dtMsg}${catMsg}`, 'success');
        }
      } else {
        showToast('Đã quét xong nhưng chữ số trên hoá đơn chưa đủ rõ để bóc tách tự động', 'info');
      }
    } catch (err) {
      if (this._userAbortedAI) return;
      console.error('Lỗi quét OCR:', err);
      showToast('Lỗi khi quét hoá đơn: ' + (err.message || err), 'error');
    } finally {
      this.setAIScanningState(false);
      this._userAbortedAI = false;
    }
  },

  scanReceiptWithAI() {
    return this.scanReceiptWithOCR();
  }
};

window.UITransactions = UITransactions;
