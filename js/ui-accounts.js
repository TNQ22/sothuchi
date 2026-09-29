/**
 * SỔ THU CHI - UI ACCOUNTS & WALLETS MODULE
 * Quản lý tài khoản, ngân hàng, số dư thực tế và tài sản ròng
 * Hỗ trợ Action Sheet cho menu 3 chấm, đối soát & nhập sao kê thông minh đa ngân hàng, lọc lịch sử
 */

const UIAccounts = {
  activeStatementAccountId: null,
  currentActionAccountId: null,
  pendingStatementImport: null,
  isArchivedExpanded: false,
  currentProviderTab: 'all',
  currentProviderQuery: '',

  /* Danh mục Ngân hàng & Ví điện tử phổ biến tại Việt Nam */
  PROVIDERS: [
    // --- NGÂN HÀNG (BANKS) ---
    { code: 'VCB', name: 'Vietcombank', shortName: 'VCB', fullName: 'Ngoại Thương Việt Nam', type: 'bank', color: '#005a3c', logoUrl: 'https://api.vietqr.io/img/VCB.png' },
    { code: 'TCB', name: 'Techcombank', shortName: 'TCB', fullName: 'Kỹ Thương Việt Nam', type: 'bank', color: '#e11b22', logoUrl: 'https://api.vietqr.io/img/TCB.png' },
    { code: 'MB', name: 'MB Bank', shortName: 'MB', fullName: 'Quân Đội', type: 'bank', color: '#002d72', logoUrl: 'https://api.vietqr.io/img/MB.png' },
    { code: 'BIDV', name: 'BIDV', shortName: 'BIDV', fullName: 'Đầu tư & Phát triển VN', type: 'bank', color: '#0054a6', logoUrl: 'https://api.vietqr.io/img/BIDV.png' },
    { code: 'CTG', name: 'VietinBank', shortName: 'VietinBank', fullName: 'Công Thương Việt Nam', type: 'bank', color: '#00549a', logoUrl: 'https://api.vietqr.io/img/ICB.png' },
    { code: 'VPB', name: 'VPBank', shortName: 'VPBank', fullName: 'Việt Nam Thịnh Vượng', type: 'bank', color: '#009140', logoUrl: 'https://api.vietqr.io/img/VPB.png' },
    { code: 'ACB', name: 'ACB', shortName: 'ACB', fullName: 'Á Châu', type: 'bank', color: '#0061a8', logoUrl: 'https://api.vietqr.io/img/ACB.png' },
    { code: 'TPB', name: 'TPBank', shortName: 'TPBank', fullName: 'Tiên Phong', type: 'bank', color: '#5c2483', logoUrl: 'https://api.vietqr.io/img/TPB.png' },
    { code: 'STB', name: 'Sacombank', shortName: 'STB', fullName: 'Sài Gòn Thương Tín', type: 'bank', color: '#004c97', logoUrl: 'https://api.vietqr.io/img/STB.png' },
    { code: 'VIB', name: 'VIB', shortName: 'VIB', fullName: 'Quốc Tế', type: 'bank', color: '#004990', logoUrl: 'https://api.vietqr.io/img/VIB.png' },
    { code: 'HDB', name: 'HDBank', shortName: 'HDB', fullName: 'Phát triển TP.HCM', type: 'bank', color: '#da251d', logoUrl: 'https://api.vietqr.io/img/HDB.png' },
    { code: 'SHB', name: 'SHB', shortName: 'SHB', fullName: 'Sài Gòn - Hà Nội', type: 'bank', color: '#ee6f2d', logoUrl: 'https://api.vietqr.io/img/SHB.png' },
    { code: 'MSB', name: 'MSB', shortName: 'MSB', fullName: 'Hàng Hải Việt Nam', type: 'bank', color: '#ee3124', logoUrl: 'https://api.vietqr.io/img/MSB.png' },
    { code: 'OCB', name: 'OCB', shortName: 'OCB', fullName: 'Phương Đông', type: 'bank', color: '#008852', logoUrl: 'https://api.vietqr.io/img/OCB.png' },
    { code: 'SEAB', name: 'SeABank', shortName: 'SeABank', fullName: 'Đông Nam Á', type: 'bank', color: '#cf102d', logoUrl: 'https://api.vietqr.io/img/SEAB.png' },
    { code: 'LPB', name: 'LPBank', shortName: 'LPBank', fullName: 'Bưu điện Liên Việt', type: 'bank', color: '#e37424', logoUrl: 'https://api.vietqr.io/img/LPB.png' },
    { code: 'EIB', name: 'Eximbank', shortName: 'Eximbank', fullName: 'Xuất Nhập Khẩu VN', type: 'bank', color: '#0068b3', logoUrl: 'https://api.vietqr.io/img/EIB.png' },
    { code: 'NAB', name: 'Nam A Bank', shortName: 'Nam A Bank', fullName: 'Nam Á', type: 'bank', color: '#f0ab00', logoUrl: 'https://api.vietqr.io/img/NAB.png' },
    { code: 'TIMO', name: 'Timo', shortName: 'Timo', fullName: 'Ngân hàng số Timo', type: 'bank', color: '#6b38c2', logoUrl: 'https://api.vietqr.io/img/TIMO.png' },
    { code: 'CAKE', name: 'Cake by VPBank', shortName: 'Cake', fullName: 'Ngân hàng số Cake', type: 'bank', color: '#ff007a', logoUrl: 'https://api.vietqr.io/img/CAKE.png' },

    // --- VÍ ĐIỆN TỬ (E-WALLETS) ---
    { code: 'MOMO', name: 'MoMo', shortName: 'MoMo', fullName: 'Ví điện tử MoMo', type: 'ewallet', color: '#c40068', badgeText: 'MoMo' },
    { code: 'ZALOPAY', name: 'ZaloPay', shortName: 'ZaloPay', fullName: 'Ví điện tử ZaloPay', type: 'ewallet', color: '#008fe5', badgeText: 'ZaloPay' },
    { code: 'VIETTELPAY', name: 'Viettel Money', shortName: 'Viettel', fullName: 'Viettel Money / ViettelPay', type: 'ewallet', color: '#e60000', badgeText: 'Viettel' },
    { code: 'VNPAY', name: 'VNPay', shortName: 'VNPay', fullName: 'Ví điện tử VNPAY', type: 'ewallet', color: '#005baa', badgeText: 'VNPay' },
    { code: 'SHOPEEPAY', name: 'ShopeePay', shortName: 'Shopee', fullName: 'Ví điện tử ShopeePay', type: 'ewallet', color: '#f53d2d', badgeText: 'Shopee' },

    // --- MẶC ĐỊNH / KHÁC (GENERIC) ---
    { code: 'CASH', name: 'Tiền mặt', shortName: 'Tiền mặt', fullName: 'Ví tiền mặt', type: 'cash', color: '#10b981', icon: 'wallet' },
    { code: 'CREDIT', name: 'Thẻ tín dụng', shortName: 'Tín dụng', fullName: 'Thẻ tín dụng / Credit Card', type: 'credit', color: '#f59e0b', icon: 'credit-card' },
    { code: 'SAVING', name: 'Sổ tiết kiệm', shortName: 'Tiết kiệm', fullName: 'Sổ tiết kiệm / Tích lũy', type: 'saving', color: '#0ea5e9', icon: 'piggy-bank' },
    { code: 'GENERIC_BANK', name: 'Ngân hàng khác', shortName: 'Ngân hàng', fullName: 'Tài khoản ngân hàng', type: 'bank', color: '#4f46e5', icon: 'landmark' },
    { code: 'GENERIC_EWALLET', name: 'Ví điện tử khác', shortName: 'Ví điện tử', fullName: 'Ví điện tử khác', type: 'ewallet', color: '#ec4899', icon: 'smartphone' }
  ],

  renderLogoBadge(item, size = 36) {
    if (!item) return '';
    let p = null;
    if (typeof item === 'string') {
      p = this.PROVIDERS.find(x => x.code === item);
    } else if (item.bankCode) {
      p = this.PROVIDERS.find(x => x.code === item.bankCode);
    }
    
    // Auto-detect provider by account name if not explicitly set
    if (!p && item.name && typeof item === 'object') {
      const lower = item.name.toLowerCase();
      p = this.PROVIDERS.find(x => lower.includes(x.name.toLowerCase()) || lower.includes(x.shortName.toLowerCase()));
    }

    const color = p?.color || item.color || '#4f46e5';
    const bg = `${color}22`;
    const badgeText = p?.badgeText || p?.shortName || p?.code || '';
    const icon = p?.icon || item.icon || (item.type === 'bank' ? 'landmark' : (item.type === 'ewallet' ? 'smartphone' : (item.type === 'credit' ? 'credit-card' : (item.type === 'saving' ? 'piggy-bank' : 'wallet'))));

    const radius = Math.round(size * 0.28);

    if (p && p.logoUrl) {
      return `
        <div class="bank-logo-badge" style="width:${size}px; height:${size}px; border-radius:${radius}px; background:#ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid rgba(0,0,0,0.06); display:inline-flex; align-items:center; justify-content:center; overflow:hidden; position:relative; flex-shrink:0;">
          <img src="${p.logoUrl}" alt="${escapeHTML(p.name)}" loading="lazy" style="width:100%; height:100%; object-fit:contain; padding:2px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div style="display:none; width:100%; height:100%; background:${color}; color:#ffffff; font-weight:800; font-size:${size >= 36 ? '0.68rem' : '0.58rem'}; align-items:center; justify-content:center; text-align:center; padding:1px; line-height:1;">
            ${escapeHTML(badgeText.slice(0, 4))}
          </div>
        </div>
      `;
    }

    if (p && p.badgeText) {
      return `
        <div class="bank-logo-badge" style="width:${size}px; height:${size}px; border-radius:${radius}px; background:${color}; color:#ffffff; font-weight:800; font-size:${size >= 36 ? '0.68rem' : '0.58rem'}; display:inline-flex; align-items:center; justify-content:center; text-align:center; padding:2px; line-height:1; flex-shrink:0; box-shadow: 0 1px 3px rgba(0,0,0,0.12);">
          ${escapeHTML(p.badgeText)}
        </div>
      `;
    }

    return `
      <div class="bank-logo-badge" style="width:${size}px; height:${size}px; border-radius:${radius}px; background:${bg}; color:${color}; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">
        <i data-lucide="${icon}" style="width:${Math.round(size * 0.52)}px; height:${Math.round(size * 0.52)}px;"></i>
      </div>
    `;
  },

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const accForm = document.getElementById('account-form');
    if (accForm) {
      accForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleFormSubmit();
      });
    }

    // Close action sheet or modals on clicking overlay backdrop
    const actionSheet = document.getElementById('modal-account-actions');
    if (actionSheet) {
      actionSheet.addEventListener('click', (e) => {
        if (e.target === actionSheet) {
          this.closeActionSheet();
        }
      });
    }

    const statementModal = document.getElementById('modal-account-statement');
    if (statementModal) {
      statementModal.addEventListener('click', (e) => {
        if (e.target === statementModal) {
          this.closeStatementModal();
        }
      });
    }
  },

  /* ==================== TRANG CHỌN NGÂN HÀNG & VÍ ĐIỆN TỬ (FULL SCREEN) ==================== */
  openProviderPage() {
    const typeSelect = document.getElementById('acc-type-select');
    const curType = typeSelect ? typeSelect.value : 'bank';

    // Tự động nhảy sang tab phù hợp với loại tài khoản đang chọn
    if (curType === 'bank') {
      this.currentProviderTab = 'bank';
    } else if (curType === 'ewallet') {
      this.currentProviderTab = 'ewallet';
    } else if (['cash', 'credit', 'saving'].includes(curType)) {
      this.currentProviderTab = 'generic';
    } else {
      this.currentProviderTab = 'all';
    }

    this.currentProviderQuery = '';
    const searchInput = document.getElementById('provider-search-input');
    if (searchInput) searchInput.value = '';

    // Cập nhật trạng thái tab buttons
    document.querySelectorAll('.bank-provider-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === this.currentProviderTab);
    });

    this.renderProviderGrid();

    if (window.app) {
      window.app.switchView('account-provider');
      if (window.app.syncClearableInputs) window.app.syncClearableInputs();
    }
    if (window.lucide) lucide.createIcons();
  },

  openProviderModal() {
    this.openProviderPage();
  },

  closeProviderPage() {
    if (window.app) {
      window.app.goBack();
    }
  },

  closeProviderModal() {
    this.closeProviderPage();
  },

  switchProviderTab(tab) {
    this.currentProviderTab = tab;
    document.querySelectorAll('.bank-provider-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    this.renderProviderGrid();
  },

  handleProviderSearch(query) {
    this.currentProviderQuery = (query || '').trim().toLowerCase();
    this.renderProviderGrid();
  },

  renderProviderGrid() {
    const container = document.getElementById('bank-provider-grid');
    if (!container) return;

    const currentBankCode = document.getElementById('acc-bank-code-input')?.value || '';
    const q = this.currentProviderQuery;
    const tab = this.currentProviderTab;

    let filtered = this.PROVIDERS.filter(p => {
      // Lọc theo tab
      if (tab === 'bank' && p.type !== 'bank') return false;
      if (tab === 'ewallet' && p.type !== 'ewallet') return false;
      if (tab === 'generic' && !['cash', 'credit', 'saving'].includes(p.type) && !p.code.startsWith('GENERIC_')) return false;

      // Lọc theo từ khóa tìm kiếm
      if (q) {
        const matchName = p.name.toLowerCase().includes(q);
        const matchShort = p.shortName.toLowerCase().includes(q);
        const matchCode = p.code.toLowerCase().includes(q);
        const matchFull = (p.fullName || '').toLowerCase().includes(q);
        if (!matchName && !matchShort && !matchCode && !matchFull) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 16px; color: var(--text-muted);">
          <i data-lucide="search-x" style="width: 36px; height: 36px; margin: 0 auto 10px; opacity: 0.5;"></i>
          <p style="font-size: 0.9rem; font-weight: 500;">Không tìm thấy ngân hàng hoặc ví phù hợp</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = filtered.map(p => {
      const isSelected = currentBankCode === p.code;
      const typeLabel = p.type === 'bank' ? 'Ngân hàng' : (p.type === 'ewallet' ? 'Ví điện tử' : (p.type === 'credit' ? 'Thẻ tín dụng' : (p.type === 'saving' ? 'Tiết kiệm' : 'Tiền mặt')));
      return `
        <div class="bank-provider-card ${isSelected ? 'selected' : ''}" onclick="UIAccounts.selectProvider('${p.code}')">
          ${this.renderLogoBadge(p, 36)}
          <div class="bank-provider-card-info">
            <span class="bank-provider-card-name" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</span>
            <span class="bank-provider-card-sub">${escapeHTML(p.shortName || p.code)} • ${typeLabel}</span>
          </div>
          ${isSelected ? '<i data-lucide="check-circle-2" style="width:16px;height:16px;color:var(--primary);margin-left:auto;flex-shrink:0;"></i>' : ''}
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  selectProvider(code) {
    const p = this.PROVIDERS.find(x => x.code === code);
    if (!p) return;

    const bankInput = document.getElementById('acc-bank-code-input');
    const display = document.getElementById('acc-provider-display');
    const preview = document.getElementById('acc-form-logo-preview');
    const nameInput = document.getElementById('acc-name-input');
    const typeSelect = document.getElementById('acc-type-select');

    if (bankInput) bankInput.value = p.code;
    if (display) display.textContent = p.name;
    if (preview) {
      preview.innerHTML = this.renderLogoBadge(p, 36);
      preview.style.background = 'transparent';
    }

    // Tự động nhảy sang phân loại tương ứng (Ngân hàng, Ví điện tử, Tiền mặt,...)
    if (typeSelect && p.type) {
      typeSelect.value = p.type;
      this.handleTypeChange(p.type, true);
    }

    // Tự động điền tên nếu ô tên đang để trống hoặc là tên mặc định cũ
    if (nameInput) {
      const curVal = nameInput.value.trim();
      const isGenericDefault = !curVal || this.PROVIDERS.some(prov => prov.name === curVal);
      if (isGenericDefault) {
        nameInput.value = p.name;
      }
    }

    // Quay lại màn hình nhập thông tin tài khoản
    this.closeProviderPage();
    if (window.lucide) lucide.createIcons();
  },

  /* ==================== ACTION SHEET (MENU 3 CHẤM) ==================== */
  async openAccountActions(accId) {
    const acc = await db.accounts.get(Number(accId));
    if (!acc) return;
    this.currentActionAccountId = Number(accId);

    const sheet = document.getElementById('modal-account-actions');
    if (!sheet) return;

    const iconMap = {
      cash: { icon: 'wallet', color: '#10b981', label: 'Tiền mặt' },
      bank: { icon: 'landmark', color: '#4f46e5', label: 'Ngân hàng' },
      ewallet: { icon: 'smartphone', color: '#ec4899', label: 'Ví điện tử' },
      credit: { icon: 'credit-card', color: '#f59e0b', label: 'Thẻ tín dụng' },
      saving: { icon: 'piggy-bank', color: '#0ea5e9', label: 'Sổ tiết kiệm' }
    };
    const info = iconMap[acc.type] || { icon: acc.icon || 'wallet', color: acc.color || '#4f46e5', label: 'Tài khoản' };
    const iconName = acc.icon || info.icon;

    // Header info
    const iconEl = document.getElementById('action-sheet-acc-icon');
    if (iconEl) {
      iconEl.style.background = 'transparent';
      iconEl.innerHTML = this.renderLogoBadge(acc, 44);
    }

    const nameEl = document.getElementById('action-sheet-acc-name');
    if (nameEl) nameEl.textContent = acc.name;

    const balEl = document.getElementById('action-sheet-acc-balance');
    if (balEl) {
      const curSym = acc.currency === 'USD' ? '$' : (acc.currency === 'EUR' ? '€' : (acc.currency === 'JPY' ? '¥' : 'đ'));
      const balStr = new Intl.NumberFormat('vi-VN').format(acc.balance);
      const excludeText = acc.excludeFromReport ? ' • (Không tính vào báo cáo)' : '';
      balEl.textContent = `${info.label} • Số dư: ${balStr}${curSym}${excludeText}`;
    }

    // Toggle archive button text & icon
    const isArchived = !!acc.isArchived;
    const archTitle = document.getElementById('action-sheet-archive-title');
    const archDesc = document.getElementById('action-sheet-archive-desc');
    const archIcon = document.getElementById('action-sheet-archive-icon');

    if (archTitle) archTitle.textContent = isArchived ? 'Kích hoạt lại' : 'Ngừng sử dụng';
    if (archDesc) archDesc.textContent = isArchived ? 'Mở lại tài khoản này để tiếp tục ghi chép' : 'Tạm ngưng tài khoản, ẩn khỏi danh sách ghi chép';
    if (archIcon) {
      archIcon.setAttribute('data-lucide', isArchived ? 'rotate-ccw' : 'power');
    }

    sheet.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeActionSheet() {
    const sheet = document.getElementById('modal-account-actions');
    if (sheet) sheet.classList.remove('open');
  },

  async handleActionSheetSelect(action) {
    const accId = this.currentActionAccountId;
    this.closeActionSheet();
    if (!accId) return;

    if (action === 'statement') {
      await this.openStatementHistory(accId);
    } else if (action === 'transfer') {
      await this.startTransfer(accId);
    } else if (action === 'adjust') {
      await this.startAdjust(accId);
    } else if (action === 'edit') {
      await this.openEditModal(accId);
    } else if (action === 'toggle-archive') {
      await this.toggleArchiveAccount(accId);
    } else if (action === 'delete') {
      await this.confirmDeleteAccount(accId);
    }
  },

  /* ==================== XEM LỊCH SỬ THU CHI TÀI KHOẢN ==================== */
  async viewAccountHistory(accId) {
    if (window.UITransactions && typeof window.UITransactions.filterByAccount === 'function') {
      await window.UITransactions.filterByAccount(accId);
    } else {
      if (window.app) window.app.switchView('transactions');
    }
  },

  /* ==================== CHUYỂN KHOẢN & ĐIỀU CHỈNH ==================== */
  async startTransfer(accId) {
    if (window.app) {
      window.app.openedFromAccountMenu = true;
      window.app.previousView = 'accounts';
      window.app.switchView('new-transaction');
    }
    if (window.UITransactions) {
      await window.UITransactions.handleHeaderTypeChange('transfer');
      const fromSelect = document.getElementById('tx-account-select');
      if (fromSelect) {
        fromSelect.value = accId;
        await window.UITransactions.updateSelectedAccountDisplay();
        window.UITransactions.refreshAccountDropdownOptions();
      }
    }
  },

  async startAdjust(accId) {
    if (window.app) {
      window.app.openedFromAccountMenu = true;
      window.app.previousView = 'accounts';
      window.app.switchView('new-transaction');
    }
    if (window.UITransactions) {
      await window.UITransactions.handleHeaderTypeChange('adjust');
      const fromSelect = document.getElementById('tx-account-select');
      if (fromSelect) {
        fromSelect.value = accId;
        await window.UITransactions.updateSelectedAccountDisplay();
        window.UITransactions.refreshAccountDropdownOptions();
      }
    }
  },

  async confirmDeleteAccount(accId) {
    const acc = await db.accounts.get(Number(accId));
    if (!acc) return;
    if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản "${acc.name}"? Tất cả giao dịch cũ vẫn được lưu trong sổ.`)) return;

    await db.accounts.update(Number(accId), { isDeleted: 1, updatedAt: Date.now() });
    await window.app.refreshAll();
    showToast(`Đã xóa tài khoản "${acc.name}"`, 'info');
  },

  async toggleArchiveAccount(accId) {
    const acc = await db.accounts.get(Number(accId));
    if (!acc) return;

    const isArchived = acc.isArchived ? 0 : 1;
    await db.accounts.update(Number(accId), { isArchived, updatedAt: Date.now() });
    await window.app.refreshAll();

    if (window.UITransactions && typeof window.UITransactions.populateAccounts === 'function') {
      await window.UITransactions.populateAccounts();
    }

    showToast(isArchived ? `Đã tạm ngừng sử dụng tài khoản "${acc.name}"` : `Đã kích hoạt lại tài khoản "${acc.name}"`, 'info');
  },

  /* ==================== THÔNG MINH NHẬP SAO KÊ NGÂN HÀNG (CSV) ==================== */
  parseBankCSV(csvText) {
    if (!csvText || !csvText.trim()) {
      throw new Error('File sao kê rỗng hoặc không có nội dung.');
    }

    // Strip UTF-8 BOM
    if (csvText.charCodeAt(0) === 0xFEFF) {
      csvText = csvText.slice(1);
    }

    const rawLines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    // Detect delimiter (test top lines with , ; \t |)
    const delimiters = [',', ';', '\t', '|'];
    let bestDelim = ',';
    let maxCols = 0;
    for (const d of delimiters) {
      const counts = rawLines.slice(0, 10).map(l => l.split(d).length);
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      if (avg > maxCols && avg > 1.5) {
        maxCols = avg;
        bestDelim = d;
      }
    }

    // Standard RFC-4180 CSV line parser
    function parseCSVLine(line, delim) {
      const row = [];
      let inQuotes = false;
      let field = '';
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQuotes && line[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (c === delim && !inQuotes) {
          row.push(field.trim());
          field = '';
        } else {
          field += c;
        }
      }
      row.push(field.trim());
      return row;
    }

    const allRows = [];
    for (const line of rawLines) {
      if (!line.trim()) continue;
      allRows.push(parseCSVLine(line, bestDelim));
    }

    if (allRows.length === 0) throw new Error('Không đọc được dữ liệu từ file sao kê.');

    // Look for header row: find row containing 2+ keywords
    const headerKeywords = [
      'ngày', 'date', 'thời gian', 'time', 'tiền', 'amount', 'nợ', 'có',
      'debit', 'credit', 'nội dung', 'mô tả', 'diễn giải', 'description',
      'chi tiết', 'narrative', 'ghi chú', 'phát sinh'
    ];

    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(allRows.length, 25); i++) {
      const rowStr = allRows[i].join(' ').toLowerCase();
      let matchCount = 0;
      for (const kw of headerKeywords) {
        if (rowStr.includes(kw)) matchCount++;
      }
      if (matchCount >= 2) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      headerRowIdx = 0;
    }

    const headers = allRows[headerRowIdx].map(h => h.toLowerCase().trim());

    // Map column indices
    let dateIdx = headers.findIndex(h => h.includes('ngày') || h.includes('date') || h.includes('thời gian') || h.includes('time'));
    let descIdx = headers.findIndex(h => h.includes('nội dung') || h.includes('mô tả') || h.includes('diễn giải') || h.includes('chi tiết') || h.includes('description') || h.includes('narrative') || h.includes('ghi chú'));
    let debitIdx = headers.findIndex(h => h.includes('ghi nợ') || h.includes('nợ') || h.includes('debit') || h.includes('rút tiền') || h.includes('tiền ra'));
    let creditIdx = headers.findIndex(h => h.includes('ghi có') || h.includes('có') || h.includes('credit') || h.includes('nạp tiền') || h.includes('tiền vào'));
    let amountIdx = headers.findIndex(h => h.includes('số tiền') || h.includes('amount') || h.includes('phát sinh') || h.includes('giá trị'));
    let typeIdx = headers.findIndex(h => h.includes('loại') || h.includes('type') || h === 'd/c' || h === 'cr/dr' || h === 'cd');

    if (dateIdx === -1) dateIdx = 0;
    if (descIdx === -1) descIdx = headers.length > 3 ? headers.length - 1 : (headers.length > 1 ? 1 : 0);
    if (debitIdx === -1 && creditIdx === -1 && amountIdx === -1) {
      amountIdx = headers.length > 2 ? 2 : (headers.length > 1 ? 1 : 0);
    }

    function cleanAmount(raw) {
      if (!raw) return 0;
      let s = String(raw).trim();
      let isNegative = s.includes('-') || (s.startsWith('(') && s.endsWith(')'));
      s = s.replace(/[^0-9.,]/g, '');
      if (!s) return 0;

      if (s.includes('.') && s.includes(',')) {
        if (s.indexOf('.') < s.indexOf(',')) {
          s = s.replace(/\./g, '').replace(',', '.');
        } else {
          s = s.replace(/,/g, '');
        }
      } else if (s.includes('.')) {
        const parts = s.split('.');
        if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
          s = s.replace(/\./g, '');
        }
      } else if (s.includes(',')) {
        const parts = s.split(',');
        if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
          s = s.replace(/,/g, '');
        } else {
          s = s.replace(',', '.');
        }
      }

      const num = parseFloat(s) || 0;
      return isNegative ? -Math.abs(num) : Math.abs(num);
    }

    function parseDate(raw) {
      if (!raw) return { dateStr: new Date().toISOString().slice(0, 10), timeStr: '12:00' };
      const s = String(raw).trim();
      let timeStr = '12:00';
      const timeMatch = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
      if (timeMatch) {
        timeStr = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
      }

      const dmyMatch = s.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
      if (dmyMatch) {
        const day = dmyMatch[1].padStart(2, '0');
        const month = dmyMatch[2].padStart(2, '0');
        const year = dmyMatch[3];
        return { dateStr: `${year}-${month}-${day}`, timeStr };
      }

      const ymdMatch = s.match(/(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})/);
      if (ymdMatch) {
        const year = ymdMatch[1];
        const month = ymdMatch[2].padStart(2, '0');
        const day = ymdMatch[3].padStart(2, '0');
        return { dateStr: `${year}-${month}-${day}`, timeStr };
      }

      return { dateStr: new Date().toISOString().slice(0, 10), timeStr };
    }

    const transactions = [];
    let totalIncome = 0;
    let totalExpense = 0;
    let minDate = null;
    let maxDate = null;

    for (let i = headerRowIdx + 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (!row || row.length <= 1) continue;

      const rawDate = row[dateIdx] || '';
      const rawDesc = row[descIdx] || '';
      const { dateStr, timeStr } = parseDate(rawDate);

      let type = 'expense';
      let amount = 0;

      if (debitIdx !== -1 && creditIdx !== -1) {
        const debitVal = cleanAmount(row[debitIdx]);
        const creditVal = cleanAmount(row[creditIdx]);
        if (creditVal > 0) {
          type = 'income';
          amount = creditVal;
        } else if (debitVal > 0) {
          type = 'expense';
          amount = debitVal;
        } else {
          continue;
        }
      } else if (amountIdx !== -1) {
        const rawAmt = row[amountIdx] || '';
        const parsedAmt = cleanAmount(rawAmt);
        if (parsedAmt === 0) continue;

        let isIncome = false;
        if (typeIdx !== -1 && row[typeIdx]) {
          const tVal = row[typeIdx].toLowerCase();
          if (tVal.includes('c') || tVal.includes('có') || tVal.includes('thu') || tVal.includes('+')) {
            isIncome = true;
          }
        } else if (String(rawAmt).includes('+')) {
          isIncome = true;
        } else if (String(rawAmt).includes('-') || String(rawAmt).startsWith('(')) {
          isIncome = false;
        }

        type = isIncome ? 'income' : 'expense';
        amount = Math.abs(parsedAmt);
      }

      if (amount <= 0) continue;

      if (type === 'income') {
        totalIncome += amount;
      } else {
        totalExpense += amount;
      }

      if (!minDate || dateStr < minDate) minDate = dateStr;
      if (!maxDate || dateStr > maxDate) maxDate = dateStr;

      transactions.push({
        date: dateStr,
        time: timeStr,
        type,
        amount,
        note: (rawDesc.replace(/\s+/g, ' ').slice(0, 250) || (type === 'income' ? 'Thu tiền sao kê' : 'Chi tiền sao kê')).trim()
      });
    }

    if (transactions.length === 0) {
      throw new Error('Không tìm thấy giao dịch hợp lệ nào trong file. Vui lòng kiểm tra lại định dạng CSV.');
    }

    return {
      transactions,
      totalIncome,
      totalExpense,
      minDate,
      maxDate
    };
  },

  async openStatementHistory(accId) {
    this.activeStatementAccountId = Number(accId);
    this.cancelStatementPreview();
    const acc = await db.accounts.get(this.activeStatementAccountId);
    if (!acc) return;

    const modal = document.getElementById('modal-account-statement');
    if (!modal) return;

    const titleEl = document.getElementById('statement-modal-title');
    const subtitleEl = document.getElementById('statement-modal-subtitle');
    if (titleEl) titleEl.textContent = `Sao Kê: ${acc.name}`;
    if (subtitleEl) {
      const typeLabels = { cash: 'Tiền mặt', bank: 'Ngân hàng', ewallet: 'Ví điện tử', credit: 'Thẻ tín dụng', saving: 'Sổ tiết kiệm' };
      subtitleEl.textContent = `Loại: ${typeLabels[acc.type] || 'Tài khoản'} • Số dư hiện tại: ${new Intl.NumberFormat('vi-VN').format(acc.balance)}đ`;
    }

    await this.renderStatementHistory(this.activeStatementAccountId);
    modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeStatementModal() {
    const modal = document.getElementById('modal-account-statement');
    if (modal) modal.classList.remove('open');
    this.cancelStatementPreview();
    this.activeStatementAccountId = null;
  },

  async handleStatementFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file || !this.activeStatementAccountId) return;

    try {
      const text = await file.text();
      const parsed = this.parseBankCSV(text);

      this.pendingStatementImport = {
        filename: file.name,
        filesize: file.size,
        ...parsed
      };

      this.renderStatementPreview();
    } catch (err) {
      console.error(err);
      showToast('Lỗi đọc file: ' + err.message, 'error');
      this.cancelStatementPreview();
    }
  },

  renderStatementPreview() {
    const p = this.pendingStatementImport;
    if (!p) return;

    const uploadCard = document.getElementById('statement-upload-card');
    const previewCard = document.getElementById('statement-preview-card');
    if (uploadCard) uploadCard.style.display = 'none';
    if (previewCard) previewCard.style.display = 'block';

    const filenameEl = document.getElementById('statement-preview-filename');
    if (filenameEl) filenameEl.textContent = p.filename;

    const countBadge = document.getElementById('statement-preview-count-badge');
    if (countBadge) countBadge.textContent = `${p.transactions.length} giao dịch`;

    const incomeEl = document.getElementById('statement-preview-income');
    if (incomeEl) incomeEl.textContent = `+${new Intl.NumberFormat('vi-VN').format(p.totalIncome)}đ`;

    const expenseEl = document.getElementById('statement-preview-expense');
    if (expenseEl) expenseEl.textContent = `-${new Intl.NumberFormat('vi-VN').format(p.totalExpense)}đ`;

    const daterangeEl = document.getElementById('statement-preview-daterange-text');
    if (daterangeEl) {
      daterangeEl.textContent = `${p.minDate || '--'} đến ${p.maxDate || '--'}`;
    }

    const tbody = document.getElementById('statement-preview-table-body');
    if (tbody) {
      const previewRows = p.transactions.slice(0, 5);
      tbody.innerHTML = previewRows.map(tx => {
        const isInc = tx.type === 'income';
        const color = isInc ? 'var(--success)' : 'var(--danger)';
        const sign = isInc ? '+' : '-';
        const amtStr = `${sign}${new Intl.NumberFormat('vi-VN').format(tx.amount)}đ`;
        return `
          <tr>
            <td style="color: var(--text-muted); font-size: 0.74rem;">${tx.date}</td>
            <td style="font-weight: 700; color: ${color};">${amtStr}</td>
            <td><span style="background: ${color}22; color: ${color}; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">${isInc ? 'Thu' : 'Chi'}</span></td>
            <td style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; color: var(--text-secondary);" title="${escapeHTML(tx.note)}">${escapeHTML(tx.note)}</td>
          </tr>
        `;
      }).join('');

      if (p.transactions.length > 5) {
        tbody.innerHTML += `
          <tr>
            <td colspan="4" style="text-align: center; color: var(--text-muted); font-size: 0.72rem; padding: 6px;">
              ...và ${p.transactions.length - 5} giao dịch khác sẽ được nhập
            </td>
          </tr>
        `;
      }
    }

    const confirmBtn = document.getElementById('statement-confirm-import-btn');
    if (confirmBtn) {
      confirmBtn.innerHTML = `<i data-lucide="check" style="width: 15px; height: 15px;"></i> Xác Nhận Nhập ${p.transactions.length} Giao Dịch Vào Tài Khoản`;
    }

    if (window.lucide) lucide.createIcons();
  },

  cancelStatementPreview() {
    this.pendingStatementImport = null;
    const uploadCard = document.getElementById('statement-upload-card');
    const previewCard = document.getElementById('statement-preview-card');
    if (uploadCard) uploadCard.style.display = 'block';
    if (previewCard) previewCard.style.display = 'none';

    const fileInput = document.getElementById('statement-file-input');
    if (fileInput) fileInput.value = '';
  },

  async confirmImportStatement() {
    const p = this.pendingStatementImport;
    const accId = this.activeStatementAccountId;
    if (!p || !accId) return;

    try {
      const now = Date.now();
      let importedCount = 0;
      let netBalanceChange = 0;

      for (const tx of p.transactions) {
        await db.transactions.add({
          type: tx.type,
          amount: tx.amount,
          date: tx.date,
          time: tx.time || '12:00',
          accountId: accId,
          categoryId: null,
          note: tx.note,
          isDeleted: 0,
          createdAt: now,
          updatedAt: now
        });

        if (tx.type === 'income') {
          netBalanceChange += tx.amount;
        } else {
          netBalanceChange -= tx.amount;
        }
        importedCount++;
      }

      // Update account balance
      const acc = await db.accounts.get(accId);
      if (acc) {
        const newBal = acc.balance + netBalanceChange;
        await db.accounts.update(accId, { balance: newBal, updatedAt: now });
      }

      // Log import into settings
      const logKey = `statement_logs_${accId}`;
      const logRecord = await db.settings.get(logKey);
      const logs = (logRecord && Array.isArray(logRecord.value)) ? logRecord.value : [];
      logs.unshift({
        filename: p.filename,
        importedAt: now,
        count: importedCount,
        totalIncome: p.totalIncome,
        totalExpense: p.totalExpense
      });
      await db.settings.put({ key: logKey, value: logs });

      showToast(`Đã nhập thành công ${importedCount} giao dịch từ sao kê!`, 'success');
      this.cancelStatementPreview();
      await this.renderStatementHistory(accId);
      await window.app.refreshAll();
    } catch (err) {
      console.error(err);
      showToast('Lỗi khi nhập giao dịch: ' + err.message, 'error');
    }
  },

  downloadSampleCSV() {
    const sampleContent = 
`Ngày GD,Số tiền ghi nợ,Số tiền ghi có,Nội dung chi tiết
01/09/2026,,25000000,Cong ty ABC thanh toan tien luong thang 8
03/09/2026,150000,,Thanh toan tien dien sinh hoat
05/09/2026,520000,,Sieu thi Winmart mua do an gia dinh
10/09/2026,,3500000,Nhan chuyen tien hoan tra khoan vay
15/09/2026,2400000,,Tien thue phong va tien mang`;

    const blob = new Blob([sampleContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'mau_sao_ke_ngan_hang.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Đã tải xuống file mẫu sao kê ngân hàng', 'info');
  },

  async renderStatementHistory(accId) {
    const listEl = document.getElementById('statement-history-list');
    const badgeEl = document.getElementById('statement-count-badge');
    if (!listEl) return;

    const logKey = `statement_logs_${accId}`;
    const logRecord = await db.settings.get(logKey);
    const logs = (logRecord && Array.isArray(logRecord.value)) ? logRecord.value : [];

    if (badgeEl) badgeEl.textContent = `${logs.length} đợt`;

    if (logs.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.8rem; background: var(--bg-card); border-radius: var(--radius-sm); border: 1px dashed var(--border-color);">
          <i data-lucide="inbox" style="width: 24px; height: 24px; margin: 0 auto 6px; opacity: 0.5;"></i>
          Chưa có đợt nhập sao kê nào cho tài khoản này
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    listEl.innerHTML = logs.map((log, index) => {
      const d = new Date(log.importedAt);
      const timeStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <div style="flex: 1; min-width: 0; padding-right: 8px;">
            <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(log.filename)}">
              📄 ${escapeHTML(log.filename)}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
              ${timeStr} • <strong>${log.count}</strong> giao dịch
            </div>
          </div>
          <button type="button" class="btn-icon" style="color: var(--danger); width: 28px; height: 28px; flex-shrink: 0;" title="Xóa lịch sử đợt nhập này" onclick="UIAccounts.deleteStatementHistory(${accId}, ${index})">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  async deleteStatementHistory(accId, index) {
    if (!confirm('Bạn có chắc muốn xóa lịch sử đợt nhập sao kê này? (Các giao dịch đã nhập vẫn được giữ lại)')) return;
    const logKey = `statement_logs_${accId}`;
    const logRecord = await db.settings.get(logKey);
    const logs = (logRecord && Array.isArray(logRecord.value)) ? logRecord.value : [];
    if (index >= 0 && index < logs.length) {
      logs.splice(index, 1);
      await db.settings.put({ key: logKey, value: logs });
      await this.renderStatementHistory(accId);
      showToast('Đã xóa đợt sao kê', 'info');
    }
  },

  /* ==================== ACCOUNT FORM & EDITING ==================== */
  handleTypeChange(type, skipProviderSync = false) {
    const iconMap = {
      cash: { icon: 'wallet', color: '#10b981' },
      bank: { icon: 'landmark', color: '#4f46e5' },
      ewallet: { icon: 'smartphone', color: '#ec4899' },
      credit: { icon: 'credit-card', color: '#f59e0b' },
      saving: { icon: 'piggy-bank', color: '#0ea5e9' }
    };
    const info = iconMap[type] || { icon: 'wallet', color: '#4f46e5' };
    const el = document.getElementById('acc-form-type-icon');
    if (el) {
      el.style.background = `${info.color}22`;
      el.style.color = info.color;
      el.innerHTML = `<i data-lucide="${info.icon}"></i>`;
      if (window.lucide) lucide.createIcons();
    }

    if (skipProviderSync) return;

    // Khi người dùng tự tay đổi Loại tài khoản (VD: từ Ngân hàng sang Ví điện tử hoặc Tiền mặt),
    // tự động kiểm tra và chuyển logo sang loại phù hợp
    const bankInput = document.getElementById('acc-bank-code-input');
    const curCode = bankInput ? bankInput.value : '';
    const curProv = curCode ? this.PROVIDERS.find(x => x.code === curCode) : null;

    if (!curProv || curProv.type !== type) {
      // Tìm nhà cung cấp / logo mặc định phù hợp với loại mới
      const defProv = this.PROVIDERS.find(x => x.type === type && (x.code.startsWith('GENERIC_') || ['CASH', 'CREDIT', 'SAVING'].includes(x.code)));
      const display = document.getElementById('acc-provider-display');
      const preview = document.getElementById('acc-form-logo-preview');

      if (defProv) {
        if (bankInput) bankInput.value = defProv.code;
        if (display) display.textContent = defProv.name;
        if (preview) {
          preview.innerHTML = this.renderLogoBadge(defProv, 36);
          preview.style.background = 'transparent';
        }
      } else {
        if (bankInput) bankInput.value = '';
        if (display) display.textContent = 'Mặc định';
        if (preview) {
          preview.innerHTML = `<i data-lucide="${info.icon}"></i>`;
          preview.style.background = `${info.color}22`;
          preview.style.color = info.color;
        }
      }
      if (window.lucide) lucide.createIcons();
    }
  },

  handleCurrencyChange(currency) {
    const symbolMap = { VND: 'đ', USD: '$', EUR: '€', JPY: '¥' };
    const sym = symbolMap[currency] || 'đ';
    const symEl = document.getElementById('acc-currency-symbol');
    if (symEl) symEl.textContent = sym;
  },

  openKeypad() {
    if (window.UITransactions) {
      UITransactions.openKeypad('account-balance');
    }
  },

  closeAccountFormView() {
    if (window.app) {
      window.app.switchView('accounts', true);
    }
  },

  closeModal() {
    this.closeAccountFormView();
  },

  async openAddModal() {
    const form = document.getElementById('account-form');
    if (form) form.reset();

    const idInput = document.getElementById('acc-id-input');
    if (idInput) idInput.value = '';

    const titleEl = document.getElementById('modal-account-title');
    if (titleEl) titleEl.textContent = 'Thêm Tài Khoản Mới';

    const nameInput = document.getElementById('acc-name-input');
    if (nameInput) nameInput.value = '';

    const typeSelect = document.getElementById('acc-type-select');
    if (typeSelect) {
      typeSelect.value = 'bank';
      this.handleTypeChange('bank');
    }

    const curSelect = document.getElementById('acc-currency-select');
    if (curSelect) {
      curSelect.value = 'VND';
      this.handleCurrencyChange('VND');
    }

    const balInput = document.getElementById('acc-balance-input');
    if (balInput) balInput.value = '0';
    const balText = document.getElementById('acc-balance-text');
    if (balText) balText.textContent = '0';

    const bankInput = document.getElementById('acc-bank-code-input');
    if (bankInput) bankInput.value = '';

    const providerDisplay = document.getElementById('acc-provider-display');
    if (providerDisplay) providerDisplay.textContent = 'Chưa chọn (Mặc định)';

    const preview = document.getElementById('acc-form-logo-preview');
    if (preview) {
      preview.style.background = 'rgba(79, 70, 229, 0.15)';
      preview.style.color = '#4f46e5';
      preview.innerHTML = '<i data-lucide="landmark"></i>';
    }

    const descInput = document.getElementById('acc-desc-input');
    if (descInput) descInput.value = '';

    const excludeCheck = document.getElementById('acc-exclude-report-check');
    if (excludeCheck) excludeCheck.checked = false;

    const delBtn = document.getElementById('btn-delete-account');
    if (delBtn) delBtn.style.display = 'none';

    const saveBtn = document.getElementById('btn-save-account');
    if (saveBtn) {
      const span = saveBtn.querySelector('span') || saveBtn;
      span.textContent = 'Lưu lại';
    }

    if (window.app) {
      window.app.switchView('account-form');
      if (window.app.syncClearableInputs) window.app.syncClearableInputs();
    }
    if (window.lucide) lucide.createIcons();
    setTimeout(() => document.getElementById('acc-name-input')?.focus(), 150);
  },

  async openEditModal(accId) {
    const acc = await db.accounts.get(Number(accId));
    if (!acc) return;

    this.closeActionSheet();

    const titleEl = document.getElementById('modal-account-title');
    if (titleEl) titleEl.textContent = 'Sửa Tài Khoản';

    document.getElementById('acc-id-input').value = acc.id;
    document.getElementById('acc-name-input').value = acc.name;

    const typeSelect = document.getElementById('acc-type-select');
    if (typeSelect) {
      typeSelect.value = acc.type || 'bank';
      this.handleTypeChange(acc.type || 'bank');
    }

    const curSelect = document.getElementById('acc-currency-select');
    const cur = acc.currency || 'VND';
    if (curSelect) {
      curSelect.value = cur;
      this.handleCurrencyChange(cur);
    }

    const curSymbol = (cur === 'USD' ? '$' : (cur === 'EUR' ? '€' : (cur === 'JPY' ? '¥' : 'đ')));
    const curBalFormatted = new Intl.NumberFormat('vi-VN').format(acc.balance);

    const initBal = acc.initialBalance !== undefined ? acc.initialBalance : acc.balance;
    const initBalFormatted = new Intl.NumberFormat('vi-VN').format(initBal || 0);
    const balInput = document.getElementById('acc-balance-input');
    if (balInput) balInput.value = String(initBal || 0);
    const balText = document.getElementById('acc-balance-text');
    if (balText) balText.textContent = initBalFormatted;

    const bankInput = document.getElementById('acc-bank-code-input');
    if (bankInput) bankInput.value = acc.bankCode || '';

    const providerDisplay = document.getElementById('acc-provider-display');
    const preview = document.getElementById('acc-form-logo-preview');
    if (acc.bankCode) {
      const p = this.PROVIDERS.find(x => x.code === acc.bankCode);
      if (providerDisplay) providerDisplay.textContent = p ? p.name : acc.bankCode;
      if (preview) {
        preview.style.background = 'transparent';
        preview.innerHTML = this.renderLogoBadge(p || acc, 36);
      }
    } else {
      if (providerDisplay) providerDisplay.textContent = 'Mặc định';
      if (preview) {
        preview.style.background = 'transparent';
        preview.innerHTML = this.renderLogoBadge(acc, 36);
      }
    }

    const descInput = document.getElementById('acc-desc-input');
    if (descInput) descInput.value = acc.description || '';

    const excludeCheck = document.getElementById('acc-exclude-report-check');
    if (excludeCheck) excludeCheck.checked = !!acc.excludeFromReport;

    const delBtn = document.getElementById('btn-delete-account');
    if (delBtn) delBtn.style.display = 'flex';

    const saveBtn = document.getElementById('btn-save-account');
    if (saveBtn) {
      const span = saveBtn.querySelector('span') || saveBtn;
      span.textContent = 'Lưu lại';
    }

    if (window.app) {
      window.app.switchView('account-form');
      if (window.app.syncClearableInputs) window.app.syncClearableInputs();
    }
    if (window.lucide) lucide.createIcons();
  },

  async handleFormSubmit() {
    const id = document.getElementById('acc-id-input').value;
    const name = document.getElementById('acc-name-input').value.trim();
    const type = document.getElementById('acc-type-select').value;
    const currency = document.getElementById('acc-currency-select')?.value || 'VND';
    const balanceInputVal = (document.getElementById('acc-balance-input')?.value || '0').trim();
    const cleanBal = balanceInputVal.replace(/\./g, '').replace(/,/g, '.');
    const balance = cleanBal === '' ? 0 : Number(cleanBal);
    const description = document.getElementById('acc-desc-input')?.value.trim() || '';
    const excludeFromReport = document.getElementById('acc-exclude-report-check')?.checked ? 1 : 0;
    const bankCode = (document.getElementById('acc-bank-code-input')?.value || '').trim();

    if (!name) {
      showToast('Vui lòng nhập tên tài khoản', 'error');
      document.getElementById('acc-name-input')?.focus();
      return;
    }

    if (isNaN(balance)) {
      showToast('Số dư không hợp lệ', 'error');
      document.getElementById('acc-balance-input')?.focus();
      return;
    }

    const now = Date.now();
    const typeIcons = { cash: 'wallet', bank: 'landmark', ewallet: 'smartphone', credit: 'credit-card', saving: 'piggy-bank' };
    let icon = typeIcons[type] || 'wallet';

    if (id) {
      const existingAcc = await db.accounts.get(Number(id));
      if (!existingAcc) return;

      const oldInitial = existingAcc.initialBalance !== undefined ? existingAcc.initialBalance : existingAcc.balance;
      const delta = balance - oldInitial;
      const newCurrentBalance = existingAcc.balance + delta;

      if (existingAcc.type === type && existingAcc.icon) {
        icon = existingAcc.icon;
      }

      let accColor = existingAcc.color || '#4f46e5';
      if (bankCode) {
        const prov = this.PROVIDERS.find(x => x.code === bankCode);
        if (prov && prov.color) accColor = prov.color;
      }

      await db.accounts.update(Number(id), {
        name,
        type,
        currency,
        initialBalance: balance,
        balance: newCurrentBalance,
        description,
        excludeFromReport,
        icon,
        bankCode,
        color: accColor,
        updatedAt: now
      });
      showToast('Đã cập nhật thông tin tài khoản', 'success');
    } else {
      const existing = await db.accounts.where('isDeleted').equals(0).toArray();
      const maxOrder = existing.reduce((max, a) => Math.max(max, a.order ?? 0), -1);
      const newOrder = maxOrder + 1;

      let accColor = '#4f46e5';
      if (bankCode) {
        const prov = this.PROVIDERS.find(x => x.code === bankCode);
        if (prov && prov.color) accColor = prov.color;
      }

      await db.accounts.add({
        name,
        type,
        currency,
        balance,
        initialBalance: balance,
        description,
        excludeFromReport,
        icon,
        bankCode,
        color: accColor,
        order: newOrder,
        isDeleted: 0,
        isArchived: 0,
        updatedAt: now
      });
      showToast('Đã tạo tài khoản mới', 'success');
    }

    this.closeAccountFormView();
    await window.app.refreshAll();
  },

  async handleDeleteAccount() {
    const id = document.getElementById('acc-id-input').value;
    if (!id) return;
    const acc = await db.accounts.get(Number(id));
    const accName = acc ? acc.name : '';
    if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản "${accName}"? Tất cả giao dịch cũ vẫn được lưu trong sổ.`)) return;

    await db.accounts.update(Number(id), { isDeleted: 1, updatedAt: Date.now() });
    this.closeAccountFormView();
    await window.app.refreshAll();
    showToast(`Đã xóa tài khoản "${accName}"`, 'info');
  },

  async moveAccount(id, direction) {
    const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
    accounts.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));

    const index = accounts.findIndex(a => a.id === Number(id));
    if (index === -1) return;

    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= accounts.length) return;

    const temp = accounts[index];
    accounts[index] = accounts[targetIndex];
    accounts[targetIndex] = temp;

    const now = Date.now();
    for (let i = 0; i < accounts.length; i++) {
      await db.accounts.update(accounts[i].id, { order: i, updatedAt: now });
    }

    await this.render();
    if (window.UITransactions && typeof window.UITransactions.populateAccounts === 'function') {
      await window.UITransactions.populateAccounts();
    }
    showToast('Đã cập nhật vị trí tài khoản', 'success');
  },

  async reorderAccounts(fromId, toId) {
    if (fromId === toId) return;
    const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
    accounts.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));

    const fromIndex = accounts.findIndex(a => a.id === Number(fromId));
    const toIndex = accounts.findIndex(a => a.id === Number(toId));
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = accounts.splice(fromIndex, 1);
    accounts.splice(toIndex, 0, moved);

    const now = Date.now();
    for (let i = 0; i < accounts.length; i++) {
      await db.accounts.update(accounts[i].id, { order: i, updatedAt: now });
    }

    await this.render();
    if (window.UITransactions && typeof window.UITransactions.populateAccounts === 'function') {
      await window.UITransactions.populateAccounts();
    }
    showToast('Đã sắp xếp lại thứ tự tài khoản', 'success');
  },

  setupDragAndDrop(container) {
    const items = container.querySelectorAll('.account-list-item');
    let draggedItem = null;

    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.id);
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        items.forEach(i => i.classList.remove('drag-over'));
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
          await this.reorderAccounts(fromId, toId);
        }
      });
    });
  },

  /* ==================== TÀI KHOẢN NGỪNG SỬ DỤNG (LISTDOWN) ==================== */
  toggleArchivedList() {
    this.isArchivedExpanded = !this.isArchivedExpanded;
    const list = document.getElementById('archived-accounts-list');
    const chevron = document.getElementById('archived-toggle-icon');
    if (list) {
      list.style.display = this.isArchivedExpanded ? 'flex' : 'none';
    }
    if (chevron) {
      chevron.classList.toggle('rotated', this.isArchivedExpanded);
    }
    if (window.lucide) lucide.createIcons();
  },

  /* ==================== RENDER DANH SÁCH TÀI KHOẢN ==================== */
  async render() {
    const container = document.getElementById('accounts-list-container');
    if (!container) return;

    const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
    accounts.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));

    const activeAccounts = accounts.filter(a => !a.isArchived);
    const archivedAccounts = accounts.filter(a => !!a.isArchived);

    const iconMap = {
      cash: { icon: 'wallet', color: '#10b981', label: 'Tiền mặt' },
      bank: { icon: 'landmark', color: '#4f46e5', label: 'Ngân hàng' },
      ewallet: { icon: 'smartphone', color: '#ec4899', label: 'Ví điện tử' },
      credit: { icon: 'credit-card', color: '#f59e0b', label: 'Thẻ tín dụng' },
      saving: { icon: 'piggy-bank', color: '#0ea5e9', label: 'Sổ tiết kiệm' }
    };

    // 1. Render danh sách tài khoản ĐANG HOẠT ĐỘNG
    if (activeAccounts.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 32px 20px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
          <i data-lucide="wallet" style="width: 36px; height: 36px; margin: 0 auto 10px; opacity: 0.5;"></i>
          <p style="font-weight: 600; margin-bottom: 4px;">Chưa có tài khoản nào đang hoạt động</p>
          <p style="font-size: 0.85rem;">Bấm "Thêm Tài Khoản Mới" ở trên hoặc kích hoạt lại tài khoản đã ngừng sử dụng bên dưới</p>
        </div>
      `;
    } else {
      let html = '';
      activeAccounts.forEach((a, index) => {
        const info = iconMap[a.type] || { icon: a.icon || 'wallet', color: a.color || '#4f46e5', label: 'Tài khoản' };
        const iconName = a.icon || info.icon;
        const isDefault = index === 0;

        html += `
          <div class="account-list-item" draggable="true" data-id="${a.id}" data-index="${index}">
            <div class="account-drag-handle" title="Kéo để sắp xếp vị trí">
              <i data-lucide="grip-vertical" style="width: 16px; height: 16px;"></i>
            </div>
            
            <div class="account-item-main" onclick="UIAccounts.viewAccountHistory(${a.id})" title="Bấm để xem lịch sử thu chi của tài khoản">
              <div class="account-icon-bubble" style="background: transparent;">
                ${this.renderLogoBadge(a, 40)}
              </div>
              <div class="account-info">
                <div class="account-name-row" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span class="account-name" title="${escapeHTML(a.name)}">${escapeHTML(a.name)}</span>
                  ${a.excludeFromReport ? '<span class="account-badge exclude" title="Không tính vào báo cáo"><i data-lucide="eye-off" style="width:11px;height:11px;"></i> Ẩn báo cáo</span>' : ''}
                </div>
                <div class="account-sub-row">
                  <span class="account-type-label">${info.label}</span>
                  ${a.currency && a.currency !== 'VND' ? `<span class="account-currency-tag">${escapeHTML(a.currency)}</span>` : ''}
                  ${a.description ? `<span class="account-desc-label" title="${escapeHTML(a.description)}">• ${escapeHTML(a.description)}</span>` : ''}
                  ${isDefault ? '<span class="account-default-badge" title="Tài khoản mặc định"><i data-lucide="check-circle-2" style="width:12px;height:12px;"></i></span>' : ''}
                </div>
              </div>
              <div class="account-balance-wrapper">
                <span class="account-balance ${a.balance < 0 ? 'expense-text' : ''}">${new Intl.NumberFormat('vi-VN').format(a.balance)}${a.currency === 'USD' ? '$' : (a.currency === 'EUR' ? '€' : (a.currency === 'JPY' ? '¥' : 'đ'))}</span>
              </div>
            </div>

            <div class="account-menu-wrapper" onclick="event.stopPropagation();">
              <button type="button" class="account-menu-btn" onclick="UIAccounts.openAccountActions(${a.id})" title="Tùy chọn tài khoản" aria-label="Tùy chọn tài khoản">
                <i data-lucide="more-vertical" style="width: 17px; height: 17px;"></i>
              </button>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
      this.setupDragAndDrop(container);
    }

    // 2. Render Section riêng cho TÀI KHOẢN NGỪNG SỬ DỤNG (Listdown)
    const archSec = document.getElementById('archived-accounts-section');
    const archList = document.getElementById('archived-accounts-list');
    const archLabel = document.getElementById('archived-accounts-toggle-label');
    const archChevron = document.getElementById('archived-toggle-icon');

    if (archSec && archList) {
      if (archivedAccounts.length === 0) {
        archSec.style.display = 'none';
        archList.innerHTML = '';
      } else {
        archSec.style.display = 'block';
        if (archLabel) archLabel.textContent = `Tài khoản ngừng sử dụng (${archivedAccounts.length})`;
        archList.style.display = this.isArchivedExpanded ? 'flex' : 'none';
        if (archChevron) archChevron.classList.toggle('rotated', this.isArchivedExpanded);

        let archHtml = '';
        archivedAccounts.forEach((a) => {
          const info = iconMap[a.type] || { icon: a.icon || 'wallet', color: a.color || '#4f46e5', label: 'Tài khoản' };
          const iconName = a.icon || info.icon;

          archHtml += `
            <div class="account-list-item archived" data-id="${a.id}">
              <div class="account-item-main" onclick="UIAccounts.viewAccountHistory(${a.id})" title="Bấm để xem lịch sử thu chi của tài khoản">
                <div class="account-icon-bubble" style="background: transparent; opacity: 0.65;">
                  ${this.renderLogoBadge(a, 40)}
                </div>
                <div class="account-info">
                  <div class="account-name-row" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <span class="account-name" title="${escapeHTML(a.name)}" style="color: var(--text-secondary);">${escapeHTML(a.name)}</span>
                    ${a.excludeFromReport ? '<span class="account-badge exclude" title="Không tính vào báo cáo"><i data-lucide="eye-off" style="width:11px;height:11px;"></i> Ẩn báo cáo</span>' : ''}
                  </div>
                  <div class="account-sub-row">
                    <span class="account-type-label">${info.label}</span>
                    ${a.currency && a.currency !== 'VND' ? `<span class="account-currency-tag">${escapeHTML(a.currency)}</span>` : ''}
                    ${a.description ? `<span class="account-desc-label" title="${escapeHTML(a.description)}">• ${escapeHTML(a.description)}</span>` : ''}
                    <span class="account-archived-badge" title="Đã ngừng sử dụng">Ngừng sử dụng</span>
                  </div>
                </div>
                <div class="account-balance-wrapper">
                  <span class="account-balance" style="color: var(--text-muted);">${new Intl.NumberFormat('vi-VN').format(a.balance)}${a.currency === 'USD' ? '$' : (a.currency === 'EUR' ? '€' : (a.currency === 'JPY' ? '¥' : 'đ'))}</span>
                </div>
              </div>

              <div class="account-menu-wrapper" onclick="event.stopPropagation();">
                <button type="button" class="account-menu-btn" onclick="UIAccounts.openAccountActions(${a.id})" title="Tùy chọn tài khoản" aria-label="Tùy chọn tài khoản">
                  <i data-lucide="more-vertical" style="width: 17px; height: 17px;"></i>
                </button>
              </div>
            </div>
          `;
        });
        archList.innerHTML = archHtml;
      }
    }

    if (window.lucide) lucide.createIcons();
  }
};

window.UIAccounts = UIAccounts;
