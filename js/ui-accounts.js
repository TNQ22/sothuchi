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
    { code: 'VCB', name: 'Vietcombank', shortName: 'VCB', fullName: 'Ngoại Thương Việt Nam', type: 'bank', color: '#005a3c', logoUrl: './assets/logos/vcb.png?v=1.9.27' },
    { code: 'TCB', name: 'Techcombank', shortName: 'TCB', fullName: 'Kỹ Thương Việt Nam', type: 'bank', color: '#e11b22', logoUrl: './assets/logos/tcb.png?v=1.9.27' },
    { code: 'MB', name: 'MB Bank', shortName: 'MB', fullName: 'Quân Đội', type: 'bank', color: '#002d72', logoUrl: './assets/logos/mb.png?v=1.9.27' },
    { code: 'BIDV', name: 'BIDV', shortName: 'BIDV', fullName: 'Đầu tư & Phát triển VN', type: 'bank', color: '#0054a6', logoUrl: './assets/logos/bidv.png?v=1.9.27' },
    { code: 'CTG', name: 'VietinBank', shortName: 'VietinBank', fullName: 'Công Thương Việt Nam', type: 'bank', color: '#00549a', logoUrl: './assets/logos/ctg.png?v=1.9.27' },
    { code: 'VPB', name: 'VPBank', shortName: 'VPBank', fullName: 'Việt Nam Thịnh Vượng', type: 'bank', color: '#009140', logoUrl: './assets/logos/vpb.png?v=1.9.27' },
    { code: 'ACB', name: 'ACB', shortName: 'ACB', fullName: 'Á Châu', type: 'bank', color: '#0061a8', logoUrl: './assets/logos/acb.png?v=1.9.27' },
    { code: 'TPB', name: 'TPBank', shortName: 'TPBank', fullName: 'Tiên Phong', type: 'bank', color: '#5c2483', logoUrl: './assets/logos/tpb.png?v=1.9.27' },
    { code: 'VBA', altCodes: ['VARB'], name: 'Agribank', shortName: 'Agribank', fullName: 'Nông nghiệp & PT Nông thôn VN', type: 'bank', color: '#800000', logoUrl: './assets/logos/varb.png?v=1.9.27' },
    { code: 'STB', name: 'Sacombank', shortName: 'STB', fullName: 'Sài Gòn Thương Tín', type: 'bank', color: '#004c97', logoUrl: './assets/logos/stb.png?v=1.9.27' },
    { code: 'VIB', name: 'VIB', shortName: 'VIB', fullName: 'Quốc Tế', type: 'bank', color: '#004990', logoUrl: './assets/logos/vib.png?v=1.9.27' },
    { code: 'HDB', name: 'HDBank', shortName: 'HDB', fullName: 'Phát triển TP.HCM', type: 'bank', color: '#da251d', logoUrl: './assets/logos/hdb.png?v=1.9.27' },
    { code: 'SHB', name: 'SHB', shortName: 'SHB', fullName: 'Sài Gòn - Hà Nội', type: 'bank', color: '#ee6f2d', logoUrl: './assets/logos/shb.png?v=1.9.27' },
    { code: 'MSB', name: 'MSB', shortName: 'MSB', fullName: 'Hàng Hải Việt Nam', type: 'bank', color: '#ee3124', logoUrl: './assets/logos/msb.png?v=1.9.27' },
    { code: 'OCB', name: 'OCB', shortName: 'OCB', fullName: 'Phương Đông', type: 'bank', color: '#008852', logoUrl: './assets/logos/ocb.png?v=1.9.27' },
    { code: 'SEAB', name: 'SeABank', shortName: 'SeABank', fullName: 'Đông Nam Á', type: 'bank', color: '#cf102d', logoUrl: './assets/logos/seab.png?v=1.9.27' },
    { code: 'LPB', name: 'LPBank', shortName: 'LPBank', fullName: 'Bưu điện Liên Việt', type: 'bank', color: '#e37424', logoUrl: './assets/logos/lpb.png?v=1.9.27' },
    { code: 'EIB', name: 'Eximbank', shortName: 'Eximbank', fullName: 'Xuất Nhập Khẩu VN', type: 'bank', color: '#0068b3', logoUrl: './assets/logos/eib.png?v=1.9.27' },
    { code: 'NAB', name: 'Nam A Bank', shortName: 'Nam A Bank', fullName: 'Nam Á', type: 'bank', color: '#f0ab00', logoUrl: './assets/logos/nab.png?v=1.9.27' },
    { code: 'TIMO', name: 'Timo', shortName: 'Timo', fullName: 'Ngân hàng số Timo', type: 'bank', color: '#6b38c2', logoUrl: './assets/logos/timo.png?v=1.9.27' },
    { code: 'CAKE', name: 'Cake by VPBank', shortName: 'Cake', fullName: 'Ngân hàng số Cake', type: 'bank', color: '#ff007a', logoUrl: './assets/logos/cake.png?v=1.9.27' },

    // --- VÍ ĐIỆN TỬ (E-WALLETS) ---
    { code: 'MOMO', name: 'MoMo', shortName: 'MoMo', fullName: 'Ví điện tử MoMo', type: 'ewallet', color: '#c40068', logoUrl: './assets/logos/momo.png?v=1.9.27' },
    { code: 'ZALOPAY', name: 'ZaloPay', shortName: 'ZaloPay', fullName: 'Ví điện tử ZaloPay', type: 'ewallet', color: '#008fe5', logoUrl: './assets/logos/zalopay.png?v=1.9.27' },
    { code: 'VIETTELPAY', name: 'Viettel Money', shortName: 'Viettel', fullName: 'Viettel Money / ViettelPay', type: 'ewallet', color: '#e60000', logoUrl: './assets/logos/viettelmoney.png?v=1.9.27' },
    { code: 'VNPAY', name: 'VNPay', shortName: 'VNPay', fullName: 'Ví điện tử VNPAY', type: 'ewallet', color: '#005baa', logoUrl: './assets/logos/vnpay.png?v=1.9.27' },
    { code: 'SHOPEEPAY', name: 'ShopeePay', shortName: 'Shopee', fullName: 'Ví điện tử ShopeePay', type: 'ewallet', color: '#f53d2d', logoUrl: './assets/logos/shopeepay.png?v=1.9.27' },

    // --- MẶC ĐỊNH / KHÁC (GENERIC) ---
    { code: 'CASH', name: 'Tiền mặt', shortName: 'Tiền mặt', fullName: 'Ví tiền mặt', type: 'cash', color: '#10b981', icon: 'wallet' },
    { code: 'CREDIT', name: 'Thẻ tín dụng', shortName: 'Tín dụng', fullName: 'Thẻ tín dụng / Credit Card', type: 'credit', color: '#f59e0b', icon: 'credit-card' },
    { code: 'GENERIC_BANK', name: 'Ngân hàng khác', shortName: 'Ngân hàng', fullName: 'Tài khoản ngân hàng', type: 'bank', color: '#4f46e5', icon: 'landmark' },
    { code: 'GENERIC_EWALLET', name: 'Ví điện tử khác', shortName: 'Ví điện tử', fullName: 'Ví điện tử khác', type: 'ewallet', color: '#ec4899', icon: 'smartphone' }
  ],

  renderLogoBadge(item, size = 36) {
    if (!item) return '';
    let p = null;
    if (typeof item === 'string') {
      p = this.PROVIDERS.find(x => x.code === item || (x.altCodes && x.altCodes.includes(item)));
    } else if (item.bankCode) {
      p = this.PROVIDERS.find(x => x.code === item.bankCode || (x.altCodes && x.altCodes.includes(item.bankCode)));
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

    const radius = Math.round(size * 0.22);

    if (p && p.logoUrl) {
      return `
        <div class="bank-logo-badge" style="width:${size}px; height:${size}px; border-radius:${radius}px; background:#ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid rgba(0,0,0,0.08); display:inline-flex; align-items:center; justify-content:center; overflow:hidden; position:relative; flex-shrink:0; box-sizing:border-box;">
          <img src="${p.logoUrl}" alt="${escapeHTML(p.name)}" loading="lazy" style="width:100%; height:100%; object-fit:contain; padding:1px; box-sizing:border-box;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div style="display:none; width:100%; height:100%; background:${color}; color:#ffffff; font-weight:800; font-size:${size >= 36 ? '0.68rem' : '0.58rem'}; align-items:center; justify-content:center; text-align:center; padding:1px; line-height:1;">
            ${escapeHTML(badgeText.slice(0, 4))}
          </div>
        </div>
      `;
    }

    if (p && p.badgeText) {
      return `
        <div class="bank-logo-badge" style="width:${size}px; height:${size}px; border-radius:${radius}px; background:${color}; color:#ffffff; font-weight:800; font-size:${size >= 36 ? '0.68rem' : '0.58rem'}; display:inline-flex; align-items:center; justify-content:center; text-align:center; padding:2px; line-height:1; flex-shrink:0; box-shadow: 0 1px 3px rgba(0,0,0,0.12); box-sizing:border-box;">
          ${escapeHTML(p.badgeText)}
        </div>
      `;
    }

    return `
      <div class="bank-logo-badge" style="width:${size}px; height:${size}px; border-radius:${radius}px; background:${bg}; color:${color}; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; box-sizing:border-box;">
        <i data-lucide="${icon}" style="width:${Math.round(size * 0.52)}px; height:${Math.round(size * 0.52)}px;"></i>
      </div>
    `;
  },

  init() {
    if (this._initialized) return;
    this._initialized = true;
    this.bindEvents();
  },

  bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;
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

    // Savings Form
    const savForm = document.getElementById('savings-form');
    if (savForm) {
      savForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleSavingsSubmit();
      });
    }

    // Accumulation Form
    const accFormEl = document.getElementById('accumulation-form');
    if (accFormEl) {
      accFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleAccumulationSubmit();
      });
    }

    // Asset Form
    const astForm = document.getElementById('asset-form');
    if (astForm) {
      astForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleAssetSubmit();
      });
    }

    // Modal backdrop clicks
    const modalBackdrops = [
      { id: 'modal-account-create-type', fn: () => this.closeCreateTypeSheet() },
      { id: 'modal-asset-type-picker', fn: () => this.closeAssetTypePicker() },
      { id: 'modal-settle-saving', fn: () => this.closeSettleSavingModal() },
      { id: 'modal-pay-loan', fn: () => this.closePayLoanModal() },
      { id: 'modal-deposit-accumulation', fn: () => this.closeDepositAccModal() },
      { id: 'modal-liquidate-asset', fn: () => this.closeLiquidateModal() },
      { id: 'modal-item-actions', fn: () => this.closeItemActionSheet() },
      { id: 'modal-source-account-picker', fn: () => this.closeSourceAccountPicker() }
    ];

    modalBackdrops.forEach(({ id, fn }) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', (e) => {
          if (e.target === el) fn();
        });
      }
    });
  },

  /* ==================== TRANG CHỌN NGÂN HÀNG & VÍ ĐIỆN TỬ (FULL SCREEN) ==================== */
  openProviderPage() {
    if (this._pickerTarget === 'saving' || this._pickerTarget === 'loan') {
      this.currentProviderTab = 'bank';
    } else {
      const typeSelect = document.getElementById('acc-type-select');
      const curType = typeSelect ? typeSelect.value : 'bank';

      // Tự động nhảy sang tab phù hợp với loại tài khoản đang chọn
      if (curType === 'bank') {
        this.currentProviderTab = 'bank';
      } else if (curType === 'ewallet') {
        this.currentProviderTab = 'ewallet';
      } else if (['cash', 'credit'].includes(curType)) {
        this.currentProviderTab = 'generic';
      } else {
        this.currentProviderTab = 'all';
      }
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
    const target = this._pickerTarget;
    this._pickerTarget = null;
    if (window.app) {
      if (target === 'saving') {
        window.app.switchView('savings-form', true);
      } else if (target === 'loan') {
        window.app.switchView('loan-form', true);
      } else {
        window.app.switchView('account-form', true);
      }
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

    const currentBankCode = this._pickerTarget === 'saving' ? (document.getElementById('saving-bank-code-input')?.value || '') : (this._pickerTarget === 'loan' ? (document.getElementById('loan-bank-code-input')?.value || '') : (document.getElementById('acc-bank-code-input')?.value || ''));
    const q = this.currentProviderQuery;
    const tab = this.currentProviderTab;

    let filtered = this.PROVIDERS.filter(p => {
      // Lọc theo tab
      if (tab === 'bank' && p.type !== 'bank') return false;
      if (tab === 'ewallet' && p.type !== 'ewallet') return false;
      if (tab === 'generic' && !['cash', 'credit'].includes(p.type) && !p.code.startsWith('GENERIC_')) return false;

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

    if (this._pickerTarget === 'saving') {
      const bankInput = document.getElementById('saving-bank-code-input');
      const display = document.getElementById('saving-bank-display');
      const preview = document.getElementById('saving-bank-logo-preview');
      const nameInput = document.getElementById('saving-name-input');

      if (bankInput) bankInput.value = p.code;
      if (display) display.textContent = p.name;
      if (preview) {
        preview.innerHTML = this.renderLogoBadge(p, 32);
        preview.style.background = 'transparent';
      }

      // Tự động điền/gợi ý tên sổ nếu tên đang trống hoặc là tên mặc định
      if (nameInput) {
        const curVal = nameInput.value.trim();
        const isGeneric = !curVal || this.PROVIDERS.some(prov => curVal === prov.name || curVal === `Sổ ${prov.shortName || prov.name}` || curVal === prov.shortName);
        if (isGeneric) {
          nameInput.value = `Sổ ${p.shortName || p.name}`;
        }
      }

      this.closeProviderPage();
      if (window.lucide) lucide.createIcons();
      return;
    }

    if (this._pickerTarget === 'loan') {
      const bankInput = document.getElementById('loan-bank-code-input');
      const display = document.getElementById('loan-bank-display');
      const preview = document.getElementById('loan-bank-logo-preview');
      const nameInput = document.getElementById('loan-name-input');

      if (bankInput) bankInput.value = p.code;
      if (display) display.textContent = p.name;
      if (preview) {
        preview.innerHTML = this.renderLogoBadge(p, 32);
        preview.style.background = 'transparent';
      }

      if (nameInput) {
        const curVal = nameInput.value.trim();
        const isGeneric = !curVal || this.PROVIDERS.some(prov => curVal === prov.name || curVal === `Vay ${prov.shortName || prov.name}` || curVal === prov.shortName);
        if (isGeneric) {
          nameInput.value = `Vay ${p.shortName || p.name}`;
        }
      }

      this.closeProviderPage();
      if (window.lucide) lucide.createIcons();
      return;
    }

    const bankInput = document.getElementById('acc-bank-code-input');
    const display = document.getElementById('acc-provider-display');
    const preview = document.getElementById('acc-form-logo-preview');
    const nameInput = document.getElementById('acc-name-input');
    const typeSelect = document.getElementById('acc-type-select');

    if (bankInput) bankInput.value = p.code;
    if (display) display.textContent = p.name;
    if (preview) {
      preview.innerHTML = this.renderLogoBadge(p, 32);
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
          preview.innerHTML = this.renderLogoBadge(defProv, 32);
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
    this._pickerTarget = 'account';
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
      if (curSelect) curSelect.value = 'VND';
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
    this._pickerTarget = 'account';
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
        preview.innerHTML = this.renderLogoBadge(p || acc, 32);
      }
    } else {
      if (providerDisplay) providerDisplay.textContent = 'Mặc định';
      if (preview) {
        preview.style.background = 'transparent';
        preview.innerHTML = this.renderLogoBadge(acc, 32);
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
      const dup = existing.find(a => a.name.trim().toLowerCase() === name.toLowerCase() && a.type === type);
      if (dup) {
        showToast(`Tài khoản "${name}" đã tồn tại!`, 'warning');
        return;
      }
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


  /* ==================== CREATE TYPE BOTTOM SHEET ==================== */
  openCreateTypeSheet() {
    const modal = document.getElementById('modal-account-create-type');
    if (modal) modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeCreateTypeSheet() {
    const modal = document.getElementById('modal-account-create-type');
    if (modal) modal.classList.remove('open');
  },

  selectCreateType(type) {
    this.closeCreateTypeSheet();
    if (type === 'expense') {
      this.openAddModal();
    } else if (type === 'savings') {
      this.openSavingsForm();
    } else if (type === 'accumulation') {
      this.openAccumulationForm();
    } else if (type === 'loan') {
      this.openLoanForm();
    } else if (type === 'asset') {
      this.openAssetTypePicker();
    }
  },

  /* ==================== ASSET TYPE PICKER ==================== */
  openAssetTypePicker() {
    const modal = document.getElementById('modal-asset-type-picker');
    if (modal) modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeAssetTypePicker() {
    const modal = document.getElementById('modal-asset-type-picker');
    if (modal) modal.classList.remove('open');
  },

  selectAssetType(type) {
    this.closeAssetTypePicker();
    this.openAssetForm(type);
  },

  /* ==================== SỔ TIẾT KIỆM (SAVINGS) ==================== */
  isSettledSavingsExpanded: false,

  toggleSettledSavingsList() {
    this.isSettledSavingsExpanded = !this.isSettledSavingsExpanded;
    const list = document.getElementById('settled-savings-list');
    const chevron = document.getElementById('settled-savings-toggle-icon');
    if (list) list.style.display = this.isSettledSavingsExpanded ? 'flex' : 'none';
    if (chevron) chevron.classList.toggle('rotated', this.isSettledSavingsExpanded);
    if (window.lucide) lucide.createIcons();
  },

  async openSavingsForm(savingId = null) {
    const form = document.getElementById('savings-form');
    if (form) form.reset();

    const idInput = document.getElementById('saving-id-input');
    const titleEl = document.getElementById('savings-form-title');
    const depositDateInput = document.getElementById('saving-deposit-date-input');
    const termSelect = document.getElementById('saving-term-select');
    const rateInput = document.getElementById('saving-interest-rate-input');
    const amountInput = document.getElementById('saving-amount-input');
    const amountText = document.getElementById('saving-amount-text');
    const bankDisplay = document.getElementById('saving-bank-display');
    const bankCodeInput = document.getElementById('saving-bank-code-input');
    const bankLogoPreview = document.getElementById('saving-bank-logo-preview');

    const todayStr = new Date().toISOString().split('T')[0];

    // Populate source accounts
    await this.populateSavingsSourceAccounts();

    if (savingId) {
      const saving = await db.savings.get(Number(savingId));
      if (!saving) return;
      if (idInput) idInput.value = saving.id;
      if (titleEl) titleEl.textContent = 'Sửa Sổ Tiết Kiệm';
      document.getElementById('saving-name-input').value = saving.name || '';
      if (amountInput) amountInput.value = saving.depositAmount || saving.balance || 0;
      if (amountText) amountText.textContent = new Intl.NumberFormat('vi-VN').format(saving.depositAmount || saving.balance || 0);
      this.setDateInputValue('saving-deposit-date-input', saving.depositDate || todayStr);
      if (termSelect) termSelect.value = saving.termMonths !== undefined ? saving.termMonths : 6;
      if (rateInput) rateInput.value = saving.interestRate !== undefined ? saving.interestRate : 6.5;
      document.getElementById('saving-interest-payment-select').value = saving.interestPaymentType || 'end';
      document.getElementById('saving-maturity-action-select').value = saving.maturityAction || 'rollover_all';
      document.getElementById('saving-desc-input').value = saving.description || '';
      document.getElementById('saving-exclude-report-input').checked = !!saving.excludeFromReport;
      await this.updateSavingsSourceDisplay(saving.sourceAccountId || '');

      if (bankCodeInput) bankCodeInput.value = saving.bankCode || '';
      if (saving.bankCode) {
        const prov = this.PROVIDERS.find(x => x.code === saving.bankCode);
        if (bankDisplay) bankDisplay.textContent = prov ? prov.name : saving.bankCode;
        if (bankLogoPreview) {
          bankLogoPreview.innerHTML = this.renderLogoBadge(prov || saving.bankCode, 32);
          bankLogoPreview.style.background = 'transparent';
        }
      } else {
        if (bankDisplay) bankDisplay.textContent = 'Chưa chọn (Mặc định)';
        if (bankLogoPreview) {
          bankLogoPreview.innerHTML = '<i data-lucide="landmark"></i>';
          bankLogoPreview.style.background = 'rgba(79, 70, 229, 0.15)';
          bankLogoPreview.style.color = '#4f46e5';
        }
      }
    } else {
      if (idInput) idInput.value = '';
      if (titleEl) titleEl.textContent = 'Thêm Sổ Tiết Kiệm';
      if (amountInput) amountInput.value = '0';
      if (amountText) amountText.textContent = '0';
      this.setDateInputValue('saving-deposit-date-input', todayStr);
      if (termSelect) termSelect.value = '6';
      if (rateInput) rateInput.value = '6.5';
      if (bankCodeInput) bankCodeInput.value = '';
      if (bankDisplay) bankDisplay.textContent = 'Chưa chọn (Mặc định)';
      if (bankLogoPreview) {
        bankLogoPreview.innerHTML = '<i data-lucide="landmark"></i>';
        bankLogoPreview.style.background = 'rgba(79, 70, 229, 0.15)';
        bankLogoPreview.style.color = '#4f46e5';
      }
    }

    this.calcSavingsPreview();

    if (window.app) {
      window.app.switchView('savings-form');
    }
    if (window.lucide) lucide.createIcons();
  },

  closeSavingsForm() {
    if (window.app) window.app.switchView('accounts', true);
  },

  openSavingsKeypad() {
    if (window.UITransactions) {
      UITransactions.openKeypad('saving-amount');
    }
  },

  /* ==================== SOURCE ACCOUNT PICKER (MODAL CHỌN NGUỒN TIỀN KÈM LOGO) ==================== */
  _sourcePickerCallback: null,

  async openSourceAccountPicker(options = {}) {
    const title = options.title || 'Chọn Nguồn Tiền';
    const allowNone = options.allowNone !== false;
    const noneLabel = options.noneLabel || 'Không trích tiền (Ngoài ví / Có sẵn)';
    const noneDesc = options.noneDesc || 'Không trừ số dư ví';
    const selectedId = options.selectedId !== undefined ? String(options.selectedId || '') : '';
    this._sourcePickerCallback = options.onSelect || null;

    const modal = document.getElementById('modal-source-account-picker');
    const titleEl = document.getElementById('source-account-picker-title');
    const listEl = document.getElementById('source-account-picker-list');

    if (titleEl) titleEl.textContent = title;
    if (!listEl) return;

    listEl.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted);"><i data-lucide="loader" class="spin"></i> Đang tải danh sách ví...</div>';
    if (window.lucide) lucide.createIcons();

    if (modal) modal.classList.add('open');

    const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
    const active = accounts.filter(a => !a.isArchived);

    let html = '';

    // Tùy chọn 0: Không trích tiền / Ngoài ví
    if (allowNone) {
      const isSelected = selectedId === '';
      html += `
        <div class="source-acc-item ${isSelected ? 'active' : ''}" onclick="UIAccounts.selectSourceAccount('')">
          <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
            <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(148, 163, 184, 0.15); color: var(--text-muted); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <i data-lucide="slash" style="width: 20px; height: 20px;"></i>
            </div>
            <div style="min-width: 0;">
              <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(noneLabel)}</div>
              <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">${escapeHTML(noneDesc)}</div>
            </div>
          </div>
          ${isSelected ? '<i data-lucide="check" style="width: 20px; height: 20px; color: var(--primary); flex-shrink: 0;"></i>' : ''}
        </div>
      `;
    }

    // Các tài khoản ví ngân hàng kèm logo thực tế
    active.forEach(acc => {
      const isSelected = String(acc.id) === selectedId;
      const balanceStr = new Intl.NumberFormat('vi-VN').format(acc.balance) + 'đ';
      const balanceColor = acc.balance >= 0 ? '#10b981' : '#ef4444';
      const typeText = acc.type === 'bank' ? (acc.bankCode || 'Tài khoản ngân hàng') : (acc.type === 'ewallet' ? 'Ví điện tử' : (acc.type === 'credit' ? 'Thẻ tín dụng' : 'Tiền mặt'));

      html += `
        <div class="source-acc-item ${isSelected ? 'active' : ''}" onclick="UIAccounts.selectSourceAccount('${acc.id}')">
          <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
            ${this.renderLogoBadge(acc, 40)}
            <div style="min-width: 0;">
              <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(acc.name)}</div>
              <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">${escapeHTML(typeText)} • <span style="font-weight: 600; color: ${balanceColor};">Dư: ${balanceStr}</span></div>
            </div>
          </div>
          ${isSelected ? '<i data-lucide="check" style="width: 20px; height: 20px; color: var(--primary); flex-shrink: 0;"></i>' : ''}
        </div>
      `;
    });

    listEl.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  closeSourceAccountPicker() {
    const modal = document.getElementById('modal-source-account-picker');
    if (modal) modal.classList.remove('open');
  },

  selectSourceAccount(accId) {
    this.closeSourceAccountPicker();
    if (typeof this._sourcePickerCallback === 'function') {
      this._sourcePickerCallback(accId);
    }
  },

  /* Sổ tiết kiệm */
  openSavingsSourcePicker() {
    const curVal = document.getElementById('saving-source-account-select')?.value || '';
    this.openSourceAccountPicker({
      title: 'Chọn Nguồn Tiền Gửi',
      allowNone: true,
      noneLabel: 'Không trích tiền (Đã có sẵn / Ngoài ví)',
      noneDesc: 'Không trừ số dư ví hiện có',
      selectedId: curVal,
      onSelect: (accId) => this.updateSavingsSourceDisplay(accId)
    });
  },

  async updateSavingsSourceDisplay(accId) {
    const input = document.getElementById('saving-source-account-select');
    const logoEl = document.getElementById('saving-source-logo-preview');
    const nameEl = document.getElementById('saving-source-account-name');
    const balEl = document.getElementById('saving-source-account-balance');
    if (input) input.value = accId || '';

    if (!accId) {
      if (logoEl) {
        logoEl.innerHTML = '<i data-lucide="arrow-down-left"></i>';
        logoEl.style.background = 'rgba(16, 185, 129, 0.15)';
        logoEl.style.color = '#10b981';
      }
      if (nameEl) nameEl.textContent = 'Không trích tiền (Đã có sẵn)';
      if (balEl) balEl.textContent = 'Không trừ số dư ví';
    } else {
      const acc = await db.accounts.get(Number(accId));
      if (acc) {
        if (logoEl) {
          logoEl.innerHTML = this.renderLogoBadge(acc, 34);
          logoEl.style.background = 'transparent';
        }
        if (nameEl) nameEl.textContent = acc.name;
        if (balEl) balEl.textContent = `Số dư: ${new Intl.NumberFormat('vi-VN').format(acc.balance)}đ`;
      }
    }
    if (window.lucide) lucide.createIcons();
  },

  async populateSavingsSourceAccounts() {
    const curVal = document.getElementById('saving-source-account-select')?.value || '';
    await this.updateSavingsSourceDisplay(curVal);
  },

  openSavingsBankPicker() {
    // Open provider page and save state for savings
    this._pickerTarget = 'saving';
    this.openProviderPage();
  },

  calcSavingsPreview() {
    const amountVal = Number(document.getElementById('saving-amount-input')?.value || 0);
    const depositDateStr = this.getDateInputValue('saving-deposit-date-input');
    const termMonths = parseInt(document.getElementById('saving-term-select')?.value || '0', 10);
    const rate = parseFloat(document.getElementById('saving-interest-rate-input')?.value || '0');

    let dueDateStr = '--/--/----';
    let expectedInterest = 0;

    if (depositDateStr) {
      const d = new Date(depositDateStr);
      if (!isNaN(d.getTime())) {
        if (termMonths > 0) {
          d.setMonth(d.getMonth() + termMonths);
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          dueDateStr = `${day}/${month}/${d.getFullYear()}`;
          expectedInterest = Math.round(amountVal * (rate / 100) * (termMonths / 12));
        } else {
          dueDateStr = 'Không kỳ hạn';
          expectedInterest = Math.round(amountVal * (rate / 100) * (1 / 12));
        }
      }
    }

    const totalVal = amountVal + expectedInterest;

    const dueDateEl = document.getElementById('savings-preview-due-date');
    const interestEl = document.getElementById('savings-preview-interest-val');
    const totalEl = document.getElementById('savings-preview-total-val');

    if (dueDateEl) dueDateEl.textContent = dueDateStr;
    if (interestEl) interestEl.textContent = `+${new Intl.NumberFormat('vi-VN').format(expectedInterest)}đ`;
    if (totalEl) totalEl.textContent = `${new Intl.NumberFormat('vi-VN').format(totalVal)}đ`;
  },

  async handleSavingsSubmit() {
    if (this._isSubmittingSavings) return;
    this._isSubmittingSavings = true;
    const submitBtn = document.querySelector('#savings-form button[type="submit"]');
    const headerBtn = document.querySelector('#view-savings-form .tx-header-done-btn');
    if (submitBtn) submitBtn.disabled = true;
    if (headerBtn) headerBtn.disabled = true;

    try {
      const id = document.getElementById('saving-id-input')?.value;
      const name = document.getElementById('saving-name-input')?.value.trim();
      const amount = Number(document.getElementById('saving-amount-input')?.value || 0);
      const bankCode = document.getElementById('saving-bank-code-input')?.value || '';
      const depositDate = this.getDateInputValue('saving-deposit-date-input');
    const termMonths = parseInt(document.getElementById('saving-term-select')?.value || '6', 10);
    const interestRate = parseFloat(document.getElementById('saving-interest-rate-input')?.value || '0');
    const interestPaymentType = document.getElementById('saving-interest-payment-select')?.value;
    const maturityAction = document.getElementById('saving-maturity-action-select')?.value;
    const sourceAccountId = document.getElementById('saving-source-account-select')?.value || null;
    const description = document.getElementById('saving-desc-input')?.value.trim() || '';
    const excludeFromReport = document.getElementById('saving-exclude-report-input')?.checked ? 1 : 0;

    if (!name) {
      showToast('Vui lòng nhập tên sổ tiết kiệm', 'error');
      document.getElementById('saving-name-input')?.focus();
      return;
    }

    if (amount <= 0) {
      showToast('Vui lòng nhập số tiền gửi ban đầu > 0', 'error');
      return;
    }

    // Calculate due date & expected interest
    let dueDate = null;
    let expectedInterest = 0;
    if (depositDate) {
      const d = new Date(depositDate);
      if (termMonths > 0) {
        d.setMonth(d.getMonth() + termMonths);
        dueDate = d.toISOString().split('T')[0];
        expectedInterest = Math.round(amount * (interestRate / 100) * (termMonths / 12));
      } else {
        expectedInterest = Math.round(amount * (interestRate / 100) * (1 / 12));
      }
    }

    const payload = {
      name,
      depositAmount: amount,
      balance: amount,
      bankCode,
      depositDate,
      termMonths,
      interestRate,
      interestPaymentType,
      maturityAction,
      dueDate,
      expectedInterest,
      sourceAccountId: sourceAccountId ? Number(sourceAccountId) : null,
      description,
      excludeFromReport,
      status: 'active'
    };

    if (id) {
      await updateSaving(Number(id), payload);
      showToast('Đã cập nhật thông tin sổ tiết kiệm', 'success');
    } else {
      await addSaving(payload);
      showToast('Đã thêm sổ tiết kiệm mới', 'success');
    }

    this.closeSavingsForm();
    await window.app.refreshAll();
    } finally {
      this._isSubmittingSavings = false;
      if (submitBtn) submitBtn.disabled = false;
      if (headerBtn) headerBtn.disabled = false;
    }
  },

  async openSettleSavingModal(id) {
    const saving = await db.savings.get(Number(id));
    if (!saving) return;

    document.getElementById('settle-saving-id-input').value = saving.id;
    document.getElementById('settle-saving-name-display').value = saving.name;

    const totalEstimate = Math.round((saving.balance || saving.depositAmount || 0) + (saving.expectedInterest || 0));
    const settleInput = document.getElementById('settle-saving-amount-input');
    const settleText = document.getElementById('settle-saving-amount-text');
    if (settleInput) settleInput.value = totalEstimate;
    if (settleText) settleText.textContent = new Intl.NumberFormat('vi-VN').format(totalEstimate);
    this.setDateInputValue('settle-saving-date-input', new Date().toISOString().split('T')[0]);

    // Populate target accounts with real logos
    const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
    const active = accounts.filter(a => !a.isArchived);
    const targetId = (saving.sourceAccountId && active.some(a => a.id === saving.sourceAccountId))
      ? saving.sourceAccountId
      : (active[0]?.id || '');
    await this.updateSettleTargetDisplay(targetId);

    const modal = document.getElementById('modal-settle-saving');
    if (modal) modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeSettleSavingModal() {
    const modal = document.getElementById('modal-settle-saving');
    if (modal) modal.classList.remove('open');
  },

  async confirmSettleSaving() {
    const id = document.getElementById('settle-saving-id-input')?.value;
    const finalAmount = Number(document.getElementById('settle-saving-amount-input')?.value || 0);
    const targetAccountId = document.getElementById('settle-saving-target-account')?.value;
    const settleDate = this.getDateInputValue('settle-saving-date-input');

    if (!id || finalAmount <= 0 || !targetAccountId) {
      showToast('Vui lòng điền đầy đủ thông tin tất toán', 'error');
      return;
    }

    await settleSaving(Number(id), {
      finalAmount,
      targetAccountId: Number(targetAccountId),
      settleDate
    });

    this.closeSettleSavingModal();
    showToast('Tất toán sổ tiết kiệm thành công!', 'success');
    await window.app.refreshAll();
  },

  async deleteSavingItem(id) {
    const s = await db.savings.get(Number(id));
    if (!s) return;
    if (!confirm(`Bạn có chắc muốn xóa sổ tiết kiệm "${s.name}"?`)) return;
    await deleteSaving(Number(id));
    showToast(`Đã xóa sổ "${s.name}"`, 'info');
    await window.app.refreshAll();
  },

  /* ==================== SỔ TÍCH LŨY (ACCUMULATIONS) ==================== */
  async openAccumulationForm(accId = null) {
    const form = document.getElementById('accumulation-form');
    if (form) form.reset();

    const idInput = document.getElementById('accumulation-id-input');
    const titleEl = document.getElementById('accumulation-form-title');
    const targetInput = document.getElementById('acc-target-amount-input');
    const targetText = document.getElementById('acc-target-amount-text');
    const currentInput = document.getElementById('acc-current-amount-input');
    const startDateInput = document.getElementById('acc-start-date-input');
    const targetDateInput = document.getElementById('acc-target-date-input');

    const todayStr = new Date().toISOString().split('T')[0];
    await this.populateAccumulationSourceAccounts();

    if (accId) {
      const item = await db.accumulations.get(Number(accId));
      if (!item) return;
      if (idInput) idInput.value = item.id;
      if (titleEl) titleEl.textContent = 'Sửa Sổ Tích Lũy';
      document.getElementById('acc-goal-name-input').value = item.name || '';
      const curVal = item.currentAmount || 0;
      if (targetInput) targetInput.value = item.targetAmount || 0;
      if (targetText) targetText.textContent = new Intl.NumberFormat('vi-VN').format(item.targetAmount || 0);
      if (currentInput) currentInput.value = curVal;
      const curText = document.getElementById('acc-current-amount-text');
      if (curText) curText.textContent = new Intl.NumberFormat('vi-VN').format(curVal);
      this.setDateInputValue('acc-start-date-input', item.startDate || todayStr);
      this.setDateInputValue('acc-target-date-input', item.targetDate || '');
      document.getElementById('acc-has-recurring-input').checked = !!item.hasRecurring;
      document.getElementById('acc-recurring-box').style.display = item.hasRecurring ? 'block' : 'none';
      const recVal = item.recurringAmount || 0;
      const recInput = document.getElementById('acc-recurring-amount-input');
      const recText = document.getElementById('acc-recurring-amount-text');
      if (recInput) recInput.value = recVal;
      if (recText) recText.textContent = new Intl.NumberFormat('vi-VN').format(recVal);
      document.getElementById('acc-exclude-report-input').checked = !!item.excludeFromReport;
    } else {
      if (idInput) idInput.value = '';
      if (titleEl) titleEl.textContent = 'Thêm Tích Lũy';
      if (targetInput) targetInput.value = '0';
      if (targetText) targetText.textContent = '0';
      if (currentInput) currentInput.value = '0';
      const curText = document.getElementById('acc-current-amount-text');
      if (curText) curText.textContent = '0';
      this.setDateInputValue('acc-start-date-input', todayStr);
      this.setDateInputValue('acc-target-date-input', '');
      document.getElementById('acc-has-recurring-input').checked = false;
      document.getElementById('acc-recurring-box').style.display = 'none';
      const recInput = document.getElementById('acc-recurring-amount-input');
      const recText = document.getElementById('acc-recurring-amount-text');
      if (recInput) recInput.value = '0';
      if (recText) recText.textContent = '0';
      document.getElementById('acc-exclude-report-input').checked = false;
    }

    this.formatInputLiveHint(document.getElementById('acc-current-amount-input'), 'acc-current-amount-hint');
    this.formatInputLiveHint(document.getElementById('acc-recurring-amount-input'), 'acc-recurring-amount-hint');
    if (window.app) window.app.switchView('accumulation-form');
    if (window.lucide) lucide.createIcons();
  },

  closeAccumulationForm() {
    if (window.app) window.app.switchView('accounts', true);
  },

  openAccumulationKeypad() {
    if (window.UITransactions) {
      UITransactions.openKeypad('acc-target-amount');
    }
  },

  openAccumulationSourcePicker() {
    const curVal = document.getElementById('acc-source-account-select')?.value || '';
    this.openSourceAccountPicker({
      title: 'Chọn Nguồn Tiền Khởi Điểm',
      allowNone: true,
      noneLabel: 'Không trích tiền (Đã có sẵn)',
      noneDesc: 'Không trừ số dư ví hiện có',
      selectedId: curVal,
      onSelect: (accId) => this.updateAccumulationSourceDisplay(accId)
    });
  },

  async updateAccumulationSourceDisplay(accId) {
    const input = document.getElementById('acc-source-account-select');
    const logoEl = document.getElementById('acc-source-logo-preview');
    const nameEl = document.getElementById('acc-source-account-name');
    const balEl = document.getElementById('acc-source-account-balance');
    if (input) input.value = accId || '';

    if (!accId) {
      if (logoEl) {
        logoEl.innerHTML = '<i data-lucide="arrow-down-left"></i>';
        logoEl.style.background = 'rgba(79, 70, 229, 0.15)';
        logoEl.style.color = '#4f46e5';
      }
      if (nameEl) nameEl.textContent = 'Không trích tiền (Đã có sẵn)';
      if (balEl) balEl.textContent = 'Không trừ số dư ví';
    } else {
      const acc = await db.accounts.get(Number(accId));
      if (acc) {
        if (logoEl) {
          logoEl.innerHTML = this.renderLogoBadge(acc, 34);
          logoEl.style.background = 'transparent';
        }
        if (nameEl) nameEl.textContent = acc.name;
        if (balEl) balEl.textContent = `Số dư: ${new Intl.NumberFormat('vi-VN').format(acc.balance)}đ`;
      }
    }
    if (window.lucide) lucide.createIcons();
  },

  async populateAccumulationSourceAccounts() {
    const curVal = document.getElementById('acc-source-account-select')?.value || '';
    await this.updateAccumulationSourceDisplay(curVal);
  },

  async handleAccumulationSubmit() {
    if (this._isSubmittingAcc) return;
    this._isSubmittingAcc = true;
    const submitBtn = document.querySelector('#accumulation-form button[type="submit"]');
    const headerBtn = document.querySelector('#view-accumulation-form .tx-header-done-btn');
    if (submitBtn) submitBtn.disabled = true;
    if (headerBtn) headerBtn.disabled = true;

    try {
      const id = document.getElementById('accumulation-id-input')?.value;
      const name = document.getElementById('acc-goal-name-input')?.value.trim();
      const targetAmount = Number(document.getElementById('acc-target-amount-input')?.value || 0);
      const currentAmount = Number(document.getElementById('acc-current-amount-input')?.value || 0);
      const sourceAccountId = document.getElementById('acc-source-account-select')?.value || null;
      const startDate = this.getDateInputValue('acc-start-date-input');
      const targetDate = this.getDateInputValue('acc-target-date-input');
    const hasRecurring = document.getElementById('acc-has-recurring-input')?.checked ? 1 : 0;
    const recurringAmount = hasRecurring ? Number(document.getElementById('acc-recurring-amount-input')?.value || 0) : 0;
    const excludeFromReport = document.getElementById('acc-exclude-report-input')?.checked ? 1 : 0;

    if (!name) {
      showToast('Vui lòng nhập tên mục tiêu tích lũy', 'error');
      document.getElementById('acc-goal-name-input')?.focus();
      return;
    }

    if (targetAmount <= 0) {
      showToast('Vui lòng nhập số tiền mục tiêu > 0', 'error');
      return;
    }

    const payload = {
      name,
      targetAmount,
      currentAmount,
      sourceAccountId: sourceAccountId ? Number(sourceAccountId) : null,
      startDate,
      targetDate,
      hasRecurring,
      recurringAmount,
      excludeFromReport,
      status: currentAmount >= targetAmount ? 'completed' : 'in_progress'
    };

    if (id) {
      await updateAccumulation(Number(id), payload);
      showToast('Đã cập nhật mục tiêu tích lũy', 'success');
    } else {
      await addAccumulation(payload);
      showToast('Đã thêm mục tiêu tích lũy mới', 'success');
    }

    this.closeAccumulationForm();
    await window.app.refreshAll();
    } finally {
      this._isSubmittingAcc = false;
      if (submitBtn) submitBtn.disabled = false;
      if (headerBtn) headerBtn.disabled = false;
    }
  },

  async openDepositAccModal(id, mode = 'deposit') {
    const acc = await db.accumulations.get(Number(id));
    if (!acc) return;

    document.getElementById('deposit-acc-id-input').value = acc.id;
    document.getElementById('deposit-acc-mode').value = mode;
    document.getElementById('deposit-acc-name-display').value = acc.name;
    document.getElementById('deposit-acc-modal-title').textContent = mode === 'deposit' ? 'Nạp Tiền Tích Lũy' : 'Rút Tiền Tích Lũy';
    document.getElementById('deposit-acc-amount-label').textContent = mode === 'deposit' ? 'Số tiền nạp thêm (VNĐ)' : 'Số tiền rút ra (VNĐ)';
    const depInput = document.getElementById('deposit-acc-amount-input');
    const depText = document.getElementById('deposit-acc-amount-text');
    if (depInput) depInput.value = '0';
    if (depText) depText.textContent = '0';

    await this.updateDepositSourceDisplay(acc.sourceAccountId || '');

    const modal = document.getElementById('modal-deposit-accumulation');
    if (modal) modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeDepositAccModal() {
    const modal = document.getElementById('modal-deposit-accumulation');
    if (modal) modal.classList.remove('open');
  },

  async confirmDepositAcc() {
    const id = document.getElementById('deposit-acc-id-input')?.value;
    const mode = document.getElementById('deposit-acc-mode')?.value;
    const amount = Number(document.getElementById('deposit-acc-amount-input')?.value || 0);
    const sourceAccountId = document.getElementById('deposit-acc-source-select')?.value;

    if (!id || amount <= 0) {
      showToast('Vui lòng nhập số tiền hợp lệ', 'error');
      return;
    }

    const depositAmount = mode === 'withdraw' ? -amount : amount;
    await depositAccumulation(Number(id), depositAmount, sourceAccountId ? Number(sourceAccountId) : null);

    this.closeDepositAccModal();
    showToast(mode === 'withdraw' ? 'Đã rút tiền tích lũy' : 'Đã nạp thêm tiền tích lũy', 'success');
    await window.app.refreshAll();
  },

  async deleteAccumulationItem(id) {
    const acc = await db.accumulations.get(Number(id));
    if (!acc) return;
    if (!confirm(`Bạn có chắc muốn xóa mục tiêu "${acc.name}"?`)) return;
    await deleteAccumulation(Number(id));
    showToast(`Đã xóa mục tiêu "${acc.name}"`, 'info');
    await window.app.refreshAll();
  },

  /* ==================== QUẢN LÝ TÀI SẢN (ASSETS) ==================== */
  ASSET_SUBTYPES: {
    real_estate: [
      { id: 'land', name: 'Đất thổ cư / Đất nền' },
      { id: 'apartment', name: 'Chung cư / Căn hộ' },
      { id: 'house', name: 'Nhà phố / Liền kề' },
      { id: 'villa', name: 'Biệt thự / Nghỉ dưỡng' },
      { id: 'farmland', name: 'Đất nông nghiệp / Vườn' }
    ],
    precious_metal: [
      { id: 'sjc_gold', name: 'Vàng miếng SJC' },
      { id: 'ring_gold', name: 'Vàng nhẫn 9999 (24K)' },
      { id: 'white_gold', name: 'Vàng tây (18K, 14K)' },
      { id: 'silver', name: 'Bạc miếng / Bạc tích trữ' },
      { id: 'platinum', name: 'Bạch kim (Platinum)' }
    ],
    foreign_currency: [
      { id: 'USD', name: 'Đô la Mỹ (USD)' },
      { id: 'EUR', name: 'Đồng Euro (EUR)' },
      { id: 'JPY', name: 'Yên Nhật (JPY)' },
      { id: 'GBP', name: 'Bảng Anh (GBP)' },
      { id: 'AUD', name: 'Đô la Úc (AUD)' },
      { id: 'CAD', name: 'Đô la Canada (CAD)' },
      { id: 'SGD', name: 'Đô la Singapore (SGD)' },
      { id: 'CNY', name: 'Nhân dân tệ (CNY)' }
    ],
    crypto: [
      { id: 'USDT', name: 'USDT (Tether USD)' },
      { id: 'BTC', name: 'Bitcoin (BTC)' },
      { id: 'ETH', name: 'Ethereum (ETH)' },
      { id: 'BNB', name: 'BNB (Binance Coin)' },
      { id: 'SOL', name: 'Solana (SOL)' },
      { id: 'XRP', name: 'XRP (Ripple)' },
      { id: 'DOGE', name: 'Dogecoin (DOGE)' },
      { id: 'ADA', name: 'Cardano (ADA)' },
      { id: 'TRX', name: 'TRON (TRX)' },
      { id: 'other_crypto', name: 'Tiền điện tử khác' }
    ],
    other: [
      { id: 'car', name: 'Ô tô / Phương tiện' },
      { id: 'motorcycle', name: 'Xe máy / Moto PKL' },
      { id: 'tech', name: 'Thiết bị công nghệ (Laptop, Phone)' },
      { id: 'luxury', name: 'Đồng hồ & Đồ hiệu' },
      { id: 'general', name: 'Tài sản giá trị khác' }
    ]
  },

  async openAssetForm(assetType = 'real_estate', assetId = null) {
    const form = document.getElementById('asset-form');
    if (form) form.reset();

    const idInput = document.getElementById('asset-id-input');
    const typeInput = document.getElementById('asset-type-input');
    const titleEl = document.getElementById('asset-form-title');
    const bubbleEl = document.getElementById('asset-type-bubble');
    const qtyRow = document.getElementById('asset-quantity-row');
    const qtyLabel = document.getElementById('asset-qty-label');
    const unitInput = document.getElementById('asset-unit-input');
    const locRow = document.getElementById('asset-location-row');
    const buyPriceInput = document.getElementById('asset-buyprice-input');
    const curPriceInput = document.getElementById('asset-currentprice-input');
    const extraCostsInput = document.getElementById('asset-extracosts-input');
    const buyDateInput = document.getElementById('asset-buy-date-input');

    if (typeInput) typeInput.value = assetType;

    // Gắn sự kiện gõ tay Tên tài sản để nhận diện thông minh loại Vàng / Bạc / Đá quý
    const nameInputEl = document.getElementById('asset-name-input');
    if (nameInputEl) {
      nameInputEl.oninput = () => {
        const curType = document.getElementById('asset-type-input')?.value;
        if (curType === 'precious_metal') {
          const val = nameInputEl.value.toLowerCase();
          const subSelect = document.getElementById('asset-subtype-select');
          if (subSelect) {
            let matchedSub = null;
            if (val.includes('bạc') || val.includes('bac') || val.includes('silver')) {
              matchedSub = 'silver';
            } else if (val.includes('bạch kim') || val.includes('bach kim') || val.includes('plat')) {
              matchedSub = 'platinum';
            } else if (val.includes('tây') || val.includes('tay') || val.includes('trắng') || val.includes('trang') || val.includes('18k') || val.includes('14k') || val.includes('10k')) {
              matchedSub = 'white_gold';
            } else if (val.includes('nhẫn') || val.includes('nhan') || val.includes('9999') || val.includes('24k') || val.includes('ta') || val.includes('trơn')) {
              matchedSub = 'ring_gold';
            } else if (val.includes('sjc') || val.includes('miếng') || val.includes('mieng')) {
              matchedSub = 'sjc_gold';
            }

            if (matchedSub && subSelect.value !== matchedSub) {
              subSelect.value = matchedSub;
              this.fetchLiveMarketPrice(false, false);
            }
          }
        }
      };
    }

    // Config labels & icons by assetType
    const typeConfigs = {
      real_estate: { title: 'Tạo Bất Động Sản', icon: 'home', unit: 'm²', qtyLabel: 'Diện tích (m²)', color: '#10b981', showLoc: true },
      precious_metal: { title: 'Tạo Kim Loại Quý', icon: 'sparkles', unit: 'Chỉ', qtyLabel: 'Khối lượng / Số lượng', color: '#f59e0b', showLoc: false },
      foreign_currency: { title: 'Tạo Tài Sản Ngoại Tệ', icon: 'dollar-sign', unit: 'USD', qtyLabel: 'Số lượng *', color: '#0ea5e9', showLoc: false },
      crypto: { title: 'Tạo Tiền Điện Tử (Crypto)', icon: 'coins', unit: 'USDT', qtyLabel: 'Số lượng *', color: '#f59e0b', showLoc: false },
      other: { title: 'Tạo Tài Sản Khác', icon: 'package', unit: 'Chiếc', qtyLabel: 'Số lượng', color: '#8b5cf6', showLoc: false }
    };
    const cfg = typeConfigs[assetType] || typeConfigs.real_estate;

    if (titleEl) titleEl.textContent = assetId ? 'Sửa Tài Sản' : cfg.title;
    if (bubbleEl) {
      bubbleEl.innerHTML = `<i data-lucide="${cfg.icon}"></i>`;
      bubbleEl.style.background = `${cfg.color}22`;
      bubbleEl.style.color = cfg.color;
    }
    if (qtyLabel) qtyLabel.textContent = cfg.qtyLabel;
    if (unitInput && !assetId) unitInput.value = cfg.unit;
    if (locRow) locRow.style.display = cfg.showLoc ? 'flex' : 'none';

    // Populate sub-types and units
    this.populateAssetSubTypes(assetType);
    await this.populateAssetSourceAccounts();

    // Auto price row visibility & status
    const autoPriceRow = document.getElementById('asset-auto-price-row');
    const autoStatusEl = document.getElementById('label-auto-price-status');
    const isLiveSupported = assetType === 'foreign_currency' || assetType === 'crypto' || assetType === 'precious_metal';
    if (autoPriceRow) {
      autoPriceRow.style.display = isLiveSupported ? 'flex' : 'none';
      if (autoStatusEl) {
        if (assetType === 'crypto') autoStatusEl.textContent = 'Tự động lấy giá Crypto trực tuyến';
        else if (assetType === 'precious_metal') autoStatusEl.textContent = 'Tự động lấy giá Vàng/Bạc theo thị trường';
        else autoStatusEl.textContent = 'Tự động lấy tỷ giá ngoại tệ mới nhất';
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];

    const buyPriceText = document.getElementById('asset-buyprice-text');
    const curPriceText = document.getElementById('asset-currentprice-text');
    const extraCostsText = document.getElementById('asset-extracosts-text');

    if (assetId) {
      const item = await db.assets.get(Number(assetId));
      if (!item) return;
      if (idInput) idInput.value = item.id;
      document.getElementById('asset-name-input').value = item.name || '';
      document.getElementById('asset-is-gift-input').checked = !!item.isGift;
      this.setDateInputValue('asset-buy-date-input', item.buyDate || todayStr);
      const qVal = item.quantity !== undefined && item.quantity !== null ? item.quantity : 0;
      document.getElementById('asset-quantity-input').value = qVal;
      const qText = document.getElementById('asset-quantity-text');
      if (qText) qText.textContent = qVal > 0 ? (Number.isInteger(qVal) ? new Intl.NumberFormat('vi-VN').format(qVal) : String(qVal).replace('.', ',')) : '0';
      this.populateAssetUnits(assetType, item.unit || cfg.unit);

      // Khôi phục phân loại an toàn
      let savedSubType = item.subType || '';
      if (assetType === 'precious_metal') {
        const validSubs = ['sjc_gold', 'ring_gold', 'white_gold', 'silver', 'platinum'];
        if (!savedSubType || !validSubs.includes(savedSubType)) {
          const n = (item.name || '').toLowerCase();
          if (n.includes('bạc') || n.includes('bac') || n.includes('silver')) savedSubType = 'silver';
          else if (n.includes('bạch kim') || n.includes('bach kim') || n.includes('plat')) savedSubType = 'platinum';
          else if (n.includes('tây') || n.includes('tay') || n.includes('18k')) savedSubType = 'white_gold';
          else if (n.includes('nhẫn') || n.includes('nhan') || n.includes('9999') || n.includes('24k')) savedSubType = 'ring_gold';
          else savedSubType = 'sjc_gold';
        }
      }
      const subTypeSelect = document.getElementById('asset-subtype-select');
      if (subTypeSelect && savedSubType) {
        subTypeSelect.value = savedSubType;
      }
      const bPrice = item.buyPrice || 0;
      const cPrice = item.currentPrice || 0;
      const eCosts = item.extraCosts || 0;
      if (buyPriceInput) buyPriceInput.value = bPrice;
      if (buyPriceText) buyPriceText.textContent = new Intl.NumberFormat('vi-VN').format(bPrice);
      if (curPriceInput) curPriceInput.value = cPrice;
      if (curPriceText) curPriceText.textContent = new Intl.NumberFormat('vi-VN').format(cPrice);
      if (extraCostsInput) extraCostsInput.value = eCosts;
      if (extraCostsText) extraCostsText.textContent = new Intl.NumberFormat('vi-VN').format(eCosts);
      document.getElementById('asset-location-input').value = item.location || '';
      document.getElementById('asset-note-input').value = item.note || '';
      document.getElementById('asset-include-networth-input').checked = item.includeInNetWorth !== undefined ? !!item.includeInNetWorth : true;
      await this.updateAssetSourceDisplay(item.sourceAccountId || '');
    } else {
      if (idInput) idInput.value = '';
      this.setDateInputValue('asset-buy-date-input', todayStr);
      
      const qtyInput = document.getElementById('asset-quantity-input');
      if (qtyInput) {
        qtyInput.value = '0';
      }
      const qtyText = document.getElementById('asset-quantity-text');
      if (qtyText) {
        qtyText.textContent = '0';
      }
      
      this.populateAssetUnits(assetType, cfg.unit);
      if (buyPriceInput) buyPriceInput.value = '0';
      if (buyPriceText) buyPriceText.textContent = '0';
      if (curPriceInput) curPriceInput.value = '0';
      if (curPriceText) curPriceText.textContent = '0';
      if (extraCostsInput) extraCostsInput.value = '0';
      if (extraCostsText) extraCostsText.textContent = '0';
      document.getElementById('asset-is-gift-input').checked = false;
      document.getElementById('asset-include-networth-input').checked = true;

      // Khi chưa làm gì (mới mở form): để trống ô tên và số lượng, chỉ ghi chữ chìm "Tên tài sản *"
      const nameInput = document.getElementById('asset-name-input');
      if (nameInput) {
        nameInput.value = '';
        nameInput.placeholder = 'Tên tài sản *';
      }

      if (isLiveSupported) {
        // Chỉ tải tỷ giá tham khảo hiển thị ở dòng trạng thái, không tự ý điền vào ô giá
        this.fetchLiveMarketPrice(false, false);
      }
    }

    this.calcAssetPreview();
    this.formatInputLiveHint(document.getElementById('asset-buyprice-input'), 'asset-buyprice-hint');
    this.formatInputLiveHint(document.getElementById('asset-currentprice-input'), 'asset-curprice-hint');
    this.formatInputLiveHint(document.getElementById('asset-extracosts-input'), 'asset-extracosts-hint');

    if (window.app) window.app.switchView('asset-form');
    if (window.lucide) lucide.createIcons();
  },

  closeAssetForm() {
    if (window.app) window.app.switchView('accounts', true);
  },

  handleAssetTopAmountClick() {
    showToast('Giá trị hiện tại được tự động tính từ Số lượng và Đơn giá bên dưới', 'info');
  },

  openAssetQuantityKeypad() {
    if (window.UITransactions) {
      UITransactions.openKeypad('asset-quantity');
    }
  },

  openAssetKeypad() {
    this.handleAssetTopAmountClick();
  },

  openAccCurrentKeypad() {
    if (window.UITransactions) {
      UITransactions.openKeypad('acc-current-amount');
    }
  },

  openAccRecurringKeypad() {
    if (window.UITransactions) {
      UITransactions.openKeypad('acc-recurring-amount');
    }
  },

  openAssetBuyPriceKeypad() {
    if (window.UITransactions) {
      UITransactions.openKeypad('asset-buyprice');
    }
  },

  openAssetCurrentPriceKeypad() {
    if (window.UITransactions) {
      UITransactions.openKeypad('asset-currentprice');
    }
  },

  openAssetExtraCostsKeypad() {
    if (window.UITransactions) {
      UITransactions.openKeypad('asset-extracosts');
    }
  },

  openSettleKeypad() {
    if (window.UITransactions) {
      UITransactions.openKeypad('settle-saving-amount');
    }
  },

  openDepositAccKeypad() {
    if (window.UITransactions) {
      UITransactions.openKeypad('deposit-acc-amount');
    }
  },

  openLiquidateKeypad() {
    if (window.UITransactions) {
      UITransactions.openKeypad('liquidate-asset-price');
    }
  },

  /* ==================== DATE PICKER & FORMAT DD/MM/YYYY ==================== */
  openDatePicker(targetInputId, options = {}) {
    const input = document.getElementById(targetInputId);
    if (!input) return;
    const curVal = input.dataset.rawDate || (input.value.includes('/') ? input.value.split('/').reverse().join('-') : input.value) || new Date().toISOString().split('T')[0];

    const cal = window.UICalendar || (typeof UICalendar !== 'undefined' ? UICalendar : null);
    if (cal) {
      cal.open({
        mode: 'date',
        initialDate: curVal,
        onSelect: (isoDateStr) => {
          input.dataset.rawDate = isoDateStr;
          const [y, m, d] = isoDateStr.split('-');
          input.value = `${d}/${m}/${y}`;
          if (options.onSelect) options.onSelect(isoDateStr);
        }
      });
    }
  },

  setDateInputValue(inputId, isoDate) {
    const el = document.getElementById(inputId);
    if (!el) return;
    if (!isoDate) {
      el.value = '';
      el.dataset.rawDate = '';
      return;
    }
    const iso = isoDate.includes('T') ? isoDate.split('T')[0] : isoDate;
    el.dataset.rawDate = iso;
    const parts = iso.split('-');
    if (parts.length === 3) {
      el.value = `${parts[2]}/${parts[1]}/${parts[0]}`;
    } else {
      el.value = iso;
    }
  },

  getDateInputValue(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return '';
    if (el.dataset.rawDate) return el.dataset.rawDate;
    const val = el.value.trim();
    if (!val) return '';
    if (val.includes('/')) {
      const parts = val.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return val;
  },

  openSavingsDatePicker() {
    this.openDatePicker('saving-deposit-date-input', {
      onSelect: () => this.calcSavingsPreview()
    });
  },

  openAccStartDatePicker() {
    this.openDatePicker('acc-start-date-input');
  },

  openAccTargetDatePicker() {
    this.openDatePicker('acc-target-date-input');
  },

  openAssetBuyDatePicker() {
    this.openDatePicker('asset-buy-date-input');
  },

  openSettleDatePicker() {
    this.openDatePicker('settle-saving-date-input');
  },

  openLiquidateDatePicker() {
    this.openDatePicker('liquidate-asset-date-input');
  },

  /* ==================== CLEANUP DUPLICATE ACCUMULATIONS ==================== */
  async cleanupDuplicateAccumulations() {
    try {
      const items = await db.accumulations.where('isDeleted').equals(0).toArray();
      if (items.length <= 1) return;
      const seen = new Map();
      for (const item of items) {
        const key = `${item.name.toLowerCase().trim()}_${item.targetAmount}`;
        if (seen.has(key)) {
          const first = seen.get(key);
          const timeDiff = Math.abs((item.updatedAt || 0) - (first.updatedAt || 0));
          if (timeDiff < 15000 || item.currentAmount === first.currentAmount) {
            console.log('Tự động dọn dẹp sổ tích lũy nhân đôi:', item.id);
            await db.accumulations.update(item.id, { isDeleted: 1, updatedAt: Date.now() });
            if (item.sourceAccountId && item.currentAmount > 0) {
              const srcAcc = await db.accounts.get(item.sourceAccountId);
              if (srcAcc) {
                await db.accounts.update(item.sourceAccountId, {
                  balance: srcAcc.balance + item.currentAmount,
                  updatedAt: Date.now()
                });
                console.log(`Đã hoàn lại ${item.currentAmount}đ vào ví ${srcAcc.name}`);
              }
            }
          }
        } else {
          seen.set(key, item);
        }
      }
    } catch (err) {
      console.warn('cleanupDuplicateAccumulations error:', err);
    }
  },

  ASSET_UNITS: {
    foreign_currency: [
      { id: 'USD', name: 'USD (Đô la Mỹ)' },
      { id: 'EUR', name: 'EUR (Đồng Euro)' },
      { id: 'JPY', name: 'JPY (Yên Nhật)' },
      { id: 'GBP', name: 'GBP (Bảng Anh)' },
      { id: 'AUD', name: 'AUD (Đô Úc)' },
      { id: 'CAD', name: 'CAD (Đô Canada)' },
      { id: 'SGD', name: 'SGD (Đô Singapore)' },
      { id: 'CNY', name: 'CNY (Nhân dân tệ)' },
      { id: 'CUSTOM', name: 'Ngoại tệ khác (Tùy chỉnh)...' }
    ],
    crypto: [
      { id: 'USDT', name: 'USDT (Tether)' },
      { id: 'BTC', name: 'BTC (Bitcoin)' },
      { id: 'ETH', name: 'ETH (Ethereum)' },
      { id: 'BNB', name: 'BNB (Binance Coin)' },
      { id: 'SOL', name: 'SOL (Solana)' },
      { id: 'XRP', name: 'XRP (Ripple)' },
      { id: 'DOGE', name: 'DOGE (Dogecoin)' },
      { id: 'ADA', name: 'ADA (Cardano)' },
      { id: 'TRX', name: 'TRX (Tron)' },
      { id: 'CUSTOM', name: 'Coin / Token khác...' }
    ],
    precious_metal: [
      { id: 'Chỉ', name: 'Chỉ (3.75g)' },
      { id: 'Lượng', name: 'Lượng / Cây (37.5g)' },
      { id: 'Gram', name: 'Gram (g)' },
      { id: 'Kg', name: 'Kilogram (kg)' },
      { id: 'Ounce', name: 'Ounce (oz)' },
      { id: 'CUSTOM', name: 'Đơn vị khác...' }
    ],
    real_estate: [
      { id: 'm²', name: 'm² (Mét vuông)' },
      { id: 'ha', name: 'ha (Héc-ta)' },
      { id: 'Căn', name: 'Căn (Căn hộ / Nhà)' },
      { id: 'Lô', name: 'Lô (Đất nền)' },
      { id: 'CUSTOM', name: 'Đơn vị khác...' }
    ],
    other: [
      { id: 'Chiếc', name: 'Chiếc' },
      { id: 'Cái', name: 'Cái' },
      { id: 'Bộ', name: 'Bộ' },
      { id: 'Gói', name: 'Gói' },
      { id: 'CUSTOM', name: 'Đơn vị khác...' }
    ]
  },

  populateAssetUnits(assetType, currentUnit = '') {
    const select = document.getElementById('asset-unit-select');
    const customInput = document.getElementById('asset-unit-input');
    if (!select) return;

    const list = this.ASSET_UNITS[assetType] || this.ASSET_UNITS.other;
    select.innerHTML = list.map(u => `<option value="${u.id}">${escapeHTML(u.name)}</option>`).join('');

    const matched = list.find(u => u.id === currentUnit);
    if (matched) {
      select.value = currentUnit;
      if (customInput) {
        customInput.value = currentUnit;
        customInput.style.display = 'none';
      }
    } else if (currentUnit) {
      select.value = 'CUSTOM';
      if (customInput) {
        customInput.value = currentUnit;
        customInput.style.display = 'block';
      }
    } else {
      const defVal = list[0]?.id || '';
      select.value = defVal;
      if (customInput) {
        customInput.value = defVal;
        customInput.style.display = 'none';
      }
    }
  },

  handleAssetUnitChange(val) {
    const customInput = document.getElementById('asset-unit-input');
    const subTypeSelect = document.getElementById('asset-subtype-select');
    const assetType = document.getElementById('asset-type-input')?.value;
    const nameInput = document.getElementById('asset-name-input');

    if (val === 'CUSTOM') {
      if (customInput) {
        customInput.style.display = 'block';
        customInput.value = '';
        customInput.focus();
      }
      if (['foreign_currency', 'crypto'].includes(assetType) && subTypeSelect) {
        subTypeSelect.value = '';
      }
    } else {
      if (customInput) {
        customInput.style.display = 'none';
        customInput.value = val;
      }
      if (['foreign_currency', 'crypto'].includes(assetType) && subTypeSelect) {
        const hasOpt = Array.from(subTypeSelect.options).some(o => o.value === val);
        if (hasOpt) subTypeSelect.value = val;
      }

      if (['foreign_currency', 'crypto', 'precious_metal'].includes(assetType)) {
        this.fetchLiveMarketPrice(false, true);
      }

      if (nameInput && ['foreign_currency', 'crypto'].includes(assetType)) {
        const mapNames = {
          USD: 'Đô la Mỹ (USD)',
          EUR: 'Euro (EUR)',
          JPY: 'Yên Nhật (JPY)',
          GBP: 'Bảng Anh (GBP)',
          AUD: 'Đô Úc (AUD)',
          CAD: 'Đô Canada (CAD)',
          SGD: 'Đô Singapore (SGD)',
          CNY: 'Nhân dân tệ (CNY)',
          USDT: 'Tether (USDT)',
          BTC: 'Bitcoin (BTC)',
          ETH: 'Ethereum (ETH)',
          BNB: 'Binance Coin (BNB)',
          SOL: 'Solana (SOL)',
          XRP: 'Ripple (XRP)',
          DOGE: 'Dogecoin (DOGE)',
          ADA: 'Cardano (ADA)',
          TRX: 'Tron (TRX)'
        };
        if (mapNames[val]) {
          nameInput.value = mapNames[val];
        }
      }

      if (['foreign_currency', 'crypto'].includes(assetType)) {
        this.fetchLiveMarketPrice(false, false);
      }
    }

    this.calcAssetPreview();
  },

  populateAssetSubTypes(assetType) {
    const select = document.getElementById('asset-subtype-select');
    const row = document.getElementById('asset-subtype-row');
    const label = document.getElementById('asset-subtype-label');
    const bubble = document.getElementById('asset-subtype-bubble');
    if (!select) return;

    // Đối với Ngoại tệ và Crypto, danh sách đồng tiền đã nằm ở ô chọn Đơn vị
    if (assetType === 'foreign_currency' || assetType === 'crypto') {
      if (row) row.style.display = 'none';
      if (select) select.innerHTML = '';
      return;
    }

    if (row) row.style.display = 'flex';
    if (label) {
      if (assetType === 'precious_metal') label.textContent = 'Phân loại kim loại quý *';
      else if (assetType === 'real_estate') label.textContent = 'Loại hình BĐS *';
      else label.textContent = 'Phân loại chi tiết *';
    }

    if (bubble) {
      if (assetType === 'precious_metal') {
        bubble.innerHTML = '<i data-lucide="sparkles"></i>';
        bubble.style.background = 'rgba(245, 158, 11, 0.15)';
        bubble.style.color = '#f59e0b';
      } else if (assetType === 'real_estate') {
        bubble.innerHTML = '<i data-lucide="home"></i>';
        bubble.style.background = 'rgba(16, 185, 129, 0.15)';
        bubble.style.color = '#10b981';
      } else {
        bubble.innerHTML = '<i data-lucide="tag"></i>';
        bubble.style.background = 'rgba(139, 92, 246, 0.15)';
        bubble.style.color = '#8b5cf6';
      }
      if (window.lucide) lucide.createIcons();
    }

    const list = this.ASSET_SUBTYPES[assetType] || this.ASSET_SUBTYPES.other;
    select.innerHTML = list.map(x => `<option value="${x.id}">${escapeHTML(x.name)}</option>`).join('');

    select.onchange = () => {
      const aType = document.getElementById('asset-type-input')?.value;
      const nameInput = document.getElementById('asset-name-input');
      const selectedItem = list.find(x => x.id === select.value);
      if (selectedItem && nameInput) {
        nameInput.value = selectedItem.name;
      }
      if (['foreign_currency', 'crypto', 'precious_metal'].includes(aType)) {
        this.fetchLiveMarketPrice(false, true);
      } else {
        this.calcAssetPreview();
      }
    };
  },

  openAssetSourcePicker() {
    const curVal = document.getElementById('asset-source-account-select')?.value || '';
    this.openSourceAccountPicker({
      title: 'Chọn Nguồn Tiền Thanh Toán',
      allowNone: true,
      noneLabel: 'Không trích tiền ví (Đã trả ngoài sổ)',
      noneDesc: 'Không trừ số dư ví hiện có',
      selectedId: curVal,
      onSelect: (accId) => this.updateAssetSourceDisplay(accId)
    });
  },

  async updateAssetSourceDisplay(accId) {
    const input = document.getElementById('asset-source-account-select');
    const logoEl = document.getElementById('asset-source-logo-preview');
    const nameEl = document.getElementById('asset-source-account-name');
    const balEl = document.getElementById('asset-source-account-balance');
    if (input) input.value = accId || '';

    if (!accId) {
      if (logoEl) {
        logoEl.innerHTML = '<i data-lucide="arrow-down-left"></i>';
        logoEl.style.background = 'rgba(79, 70, 229, 0.15)';
        logoEl.style.color = '#4f46e5';
      }
      if (nameEl) nameEl.textContent = 'Không trích tiền ví (Đã trả ngoài sổ)';
      if (balEl) balEl.textContent = 'Không trừ số dư ví';
    } else {
      const acc = await db.accounts.get(Number(accId));
      if (acc) {
        if (logoEl) {
          logoEl.innerHTML = this.renderLogoBadge(acc, 34);
          logoEl.style.background = 'transparent';
        }
        if (nameEl) nameEl.textContent = acc.name;
        if (balEl) balEl.textContent = `Số dư: ${new Intl.NumberFormat('vi-VN').format(acc.balance)}đ`;
      }
    }
    if (window.lucide) lucide.createIcons();
  },

  async populateAssetSourceAccounts() {
    const curVal = document.getElementById('asset-source-account-select')?.value || '';
    await this.updateAssetSourceDisplay(curVal);
  },

  /* Settle Saving Modal Target Display */
  openSettleSourcePicker() {
    const curVal = document.getElementById('settle-saving-target-account')?.value || '';
    this.openSourceAccountPicker({
      title: 'Chọn Tài Khoản Nhận Tiền Tất Toán',
      allowNone: false,
      selectedId: curVal,
      onSelect: (accId) => this.updateSettleTargetDisplay(accId)
    });
  },

  async updateSettleTargetDisplay(accId) {
    const input = document.getElementById('settle-saving-target-account');
    const logoEl = document.getElementById('settle-target-logo-preview');
    const nameEl = document.getElementById('settle-target-account-name');
    const balEl = document.getElementById('settle-target-account-balance');
    if (input) input.value = accId || '';

    if (accId) {
      const acc = await db.accounts.get(Number(accId));
      if (acc) {
        if (logoEl) {
          logoEl.innerHTML = this.renderLogoBadge(acc, 32);
          logoEl.style.background = 'transparent';
        }
        if (nameEl) nameEl.textContent = acc.name;
        if (balEl) balEl.textContent = `Số dư: ${new Intl.NumberFormat('vi-VN').format(acc.balance)}đ`;
      }
    } else {
      if (logoEl) {
        logoEl.innerHTML = '<i data-lucide="wallet"></i>';
        logoEl.style.background = 'rgba(16, 185, 129, 0.15)';
        logoEl.style.color = '#10b981';
      }
      if (nameEl) nameEl.textContent = 'Chọn tài khoản nhận...';
      if (balEl) balEl.textContent = '--';
    }
    if (window.lucide) lucide.createIcons();
  },

  /* Deposit Acc Modal Source Display */
  openDepositSourcePicker() {
    const mode = document.getElementById('deposit-acc-mode')?.value || 'deposit';
    const curVal = document.getElementById('deposit-acc-source-select')?.value || '';
    this.openSourceAccountPicker({
      title: mode === 'withdraw' ? 'Chọn Tài Khoản Nhận Tiền Rút' : 'Chọn Nguồn Tiền Nạp',
      allowNone: true,
      noneLabel: mode === 'withdraw' ? 'Rút tiền ngoài ví (Không chuyển vào ví)' : 'Nạp tiền ngoài ví (Không trích từ ví)',
      noneDesc: 'Không thay đổi số dư ví',
      selectedId: curVal,
      onSelect: (accId) => this.updateDepositSourceDisplay(accId)
    });
  },

  async updateDepositSourceDisplay(accId) {
    const input = document.getElementById('deposit-acc-source-select');
    const logoEl = document.getElementById('deposit-source-logo-preview');
    const nameEl = document.getElementById('deposit-source-account-name');
    const balEl = document.getElementById('deposit-source-account-balance');
    if (input) input.value = accId || '';

    if (!accId) {
      if (logoEl) {
        logoEl.innerHTML = '<i data-lucide="arrow-down-left"></i>';
        logoEl.style.background = 'rgba(79, 70, 229, 0.15)';
        logoEl.style.color = '#4f46e5';
      }
      if (nameEl) nameEl.textContent = 'Không trích/chuyển ví';
      if (balEl) balEl.textContent = 'Không thay đổi số dư ví';
    } else {
      const acc = await db.accounts.get(Number(accId));
      if (acc) {
        if (logoEl) {
          logoEl.innerHTML = this.renderLogoBadge(acc, 32);
          logoEl.style.background = 'transparent';
        }
        if (nameEl) nameEl.textContent = acc.name;
        if (balEl) balEl.textContent = `Số dư: ${new Intl.NumberFormat('vi-VN').format(acc.balance)}đ`;
      }
    }
    if (window.lucide) lucide.createIcons();
  },

  /* Liquidate Asset Modal Target Display */
  openLiquidateSourcePicker() {
    const curVal = document.getElementById('liquidate-asset-target-account')?.value || '';
    this.openSourceAccountPicker({
      title: 'Chọn Ví Nhận Tiền Bán Tài Sản',
      allowNone: false,
      selectedId: curVal,
      onSelect: (accId) => this.updateLiquidateTargetDisplay(accId)
    });
  },

  async updateLiquidateTargetDisplay(accId) {
    const input = document.getElementById('liquidate-asset-target-account');
    const logoEl = document.getElementById('liquidate-target-logo-preview');
    const nameEl = document.getElementById('liquidate-target-account-name');
    const balEl = document.getElementById('liquidate-target-account-balance');
    if (input) input.value = accId || '';

    if (accId) {
      const acc = await db.accounts.get(Number(accId));
      if (acc) {
        if (logoEl) {
          logoEl.innerHTML = this.renderLogoBadge(acc, 32);
          logoEl.style.background = 'transparent';
        }
        if (nameEl) nameEl.textContent = acc.name;
        if (balEl) balEl.textContent = `Số dư: ${new Intl.NumberFormat('vi-VN').format(acc.balance)}đ`;
      }
    } else {
      if (logoEl) {
        logoEl.innerHTML = '<i data-lucide="wallet"></i>';
        logoEl.style.background = 'rgba(16, 185, 129, 0.15)';
        logoEl.style.color = '#10b981';
      }
      if (nameEl) nameEl.textContent = 'Chọn tài khoản nhận...';
      if (balEl) balEl.textContent = '--';
    }
    if (window.lucide) lucide.createIcons();
  },

  handleAssetGiftToggle(isGift) {
    const buyRow = document.getElementById('asset-buyprice-row');
    const buyInput = document.getElementById('asset-buyprice-input');
    if (isGift) {
      if (buyInput) buyInput.value = '0';
      if (buyRow) buyRow.style.opacity = '0.5';
    } else {
      if (buyRow) buyRow.style.opacity = '1';
    }
    this.calcAssetPreview();
  },

  calcAssetPreview() {
    const rawQty = document.getElementById('asset-quantity-input')?.value;
    const qty = rawQty !== '' && !isNaN(Number(rawQty)) ? Number(rawQty) : 0;
    const isGift = document.getElementById('asset-is-gift-input')?.checked;
    const buyPrice = isGift ? 0 : Number(document.getElementById('asset-buyprice-input')?.value || 0);
    const curPrice = Number(document.getElementById('asset-currentprice-input')?.value || 0);
    const extraCosts = Number(document.getElementById('asset-extracosts-input')?.value || 0);

    const totalBuy = Math.round((qty * buyPrice) + extraCosts);
    const totalCurrent = Math.round(qty * curPrice);
    const pnl = Math.round(totalCurrent - totalBuy);
    const pnlPercent = totalBuy > 0 ? ((pnl / totalBuy) * 100).toFixed(1) : 0;

    const totalBuyEl = document.getElementById('asset-preview-total-buy');
    const totalCurEl = document.getElementById('asset-preview-total-current');
    const pnlEl = document.getElementById('asset-preview-pnl');
    const assetPriceText = document.getElementById('asset-price-text');
    const assetPriceInput = document.getElementById('asset-price-input');

    if (totalBuyEl) totalBuyEl.textContent = `${new Intl.NumberFormat('vi-VN').format(totalBuy)}đ`;
    if (totalCurEl) totalCurEl.textContent = `${new Intl.NumberFormat('vi-VN').format(totalCurrent)}đ`;
    if (assetPriceText) assetPriceText.textContent = new Intl.NumberFormat('vi-VN').format(totalCurrent);
    if (assetPriceInput) assetPriceInput.value = totalCurrent;

    if (pnlEl) {
      const sign = pnl >= 0 ? '+' : '';
      const color = pnl > 0 ? 'var(--income)' : (pnl < 0 ? 'var(--expense)' : 'var(--text-muted)');
      pnlEl.style.color = color;
      pnlEl.textContent = `${sign}${new Intl.NumberFormat('vi-VN').format(pnl)}đ (${sign}${pnlPercent}%)`;
    }
  },

  async handleAssetSubmit() {
    if (this._isSubmittingAsset) return;
    this._isSubmittingAsset = true;
    const submitBtn = document.querySelector('#asset-form button[type="submit"]');
    const headerBtn = document.querySelector('#view-asset-form .tx-header-done-btn');
    if (submitBtn) submitBtn.disabled = true;
    if (headerBtn) headerBtn.disabled = true;

    try {
      const id = document.getElementById('asset-id-input')?.value;
      const assetType = document.getElementById('asset-type-input')?.value || 'real_estate';
      const unitSelect = document.getElementById('asset-unit-select')?.value;
      const customUnit = document.getElementById('asset-unit-input')?.value?.trim();
      const unit = (unitSelect && unitSelect !== 'CUSTOM' ? unitSelect : customUnit) || 'm²';
      let subType = document.getElementById('asset-subtype-select')?.value;
      if (assetType === 'precious_metal') {
        const validSubs = ['sjc_gold', 'ring_gold', 'white_gold', 'silver', 'platinum'];
        if (!subType || !validSubs.includes(subType)) {
          const n = (name || '').toLowerCase();
          if (n.includes('bạc') || n.includes('bac') || n.includes('silver')) subType = 'silver';
          else if (n.includes('bạch kim') || n.includes('bach kim') || n.includes('plat')) subType = 'platinum';
          else if (n.includes('tây') || n.includes('tay') || n.includes('18k')) subType = 'white_gold';
          else if (n.includes('nhẫn') || n.includes('nhan') || n.includes('9999') || n.includes('24k')) subType = 'ring_gold';
          else subType = 'sjc_gold';
        }
      }
      if (!subType) subType = unit;
      const name = document.getElementById('asset-name-input')?.value?.trim();
      const isGift = document.getElementById('asset-is-gift-input')?.checked ? 1 : 0;
      const buyDate = this.getDateInputValue('asset-buy-date-input');
      const qtyVal = document.getElementById('asset-quantity-input')?.value?.trim();
      const quantity = qtyVal !== '' && !isNaN(Number(qtyVal)) ? Number(qtyVal) : 0;
      const buyPrice = isGift ? 0 : Number(document.getElementById('asset-buyprice-input')?.value || 0);
      const currentPrice = Number(document.getElementById('asset-currentprice-input')?.value || 0);
      const extraCosts = Number(document.getElementById('asset-extracosts-input')?.value || 0);
      const sourceAccountId = document.getElementById('asset-source-account-select')?.value || null;
      const location = document.getElementById('asset-location-input')?.value.trim() || '';
      const note = document.getElementById('asset-note-input')?.value.trim() || '';
      const includeInNetWorth = document.getElementById('asset-include-networth-input')?.checked ? 1 : 0;

      if (!name) {
        showToast('Vui lòng nhập tên tài sản', 'warning');
        document.getElementById('asset-name-input')?.focus();
        return;
      }

      if (quantity <= 0) {
        showToast('Vui lòng nhập số lượng / khối lượng tài sản', 'warning');
        this.openAssetQuantityKeypad();
        return;
      }

    const payload = {
      assetType,
      subType,
      name,
      isGift,
      buyDate,
      quantity,
      unit,
      buyPrice,
      currentPrice,
      extraCosts,
      sourceAccountId: sourceAccountId ? Number(sourceAccountId) : null,
      location,
      note,
      includeInNetWorth,
      status: 'active'
    };

    if (id) {
      await updateAsset(Number(id), payload);
      showToast('Đã cập nhật tài sản', 'success');
    } else {
      await addAsset(payload);
      showToast('Đã thêm tài sản mới', 'success');
    }

    this.closeAssetForm();
    await window.app.refreshAll();
    } finally {
      this._isSubmittingAsset = false;
      if (submitBtn) submitBtn.disabled = false;
      if (headerBtn) headerBtn.disabled = false;
    }
  },

  async openLiquidateModal(id) {
    const asset = await db.assets.get(Number(id));
    if (!asset) return;

    document.getElementById('liquidate-asset-id-input').value = asset.id;
    document.getElementById('liquidate-asset-name-display').value = asset.name;
    const estVal = Math.round((asset.quantity || 1) * (asset.currentPrice || asset.buyPrice || 0));
    const liqInput = document.getElementById('liquidate-asset-price-input');
    const liqText = document.getElementById('liquidate-asset-price-text');
    if (liqInput) liqInput.value = estVal;
    if (liqText) liqText.textContent = new Intl.NumberFormat('vi-VN').format(estVal);
    this.setDateInputValue('liquidate-asset-date-input', new Date().toISOString().split('T')[0]);

    // Populate target accounts with real logos
    const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
    const active = accounts.filter(a => !a.isArchived);
    const targetId = (asset.sourceAccountId && active.some(a => a.id === asset.sourceAccountId))
      ? asset.sourceAccountId
      : (active[0]?.id || '');
    await this.updateLiquidateTargetDisplay(targetId);

    const modal = document.getElementById('modal-liquidate-asset');
    if (modal) modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeLiquidateModal() {
    const modal = document.getElementById('modal-liquidate-asset');
    if (modal) modal.classList.remove('open');
  },

  async confirmLiquidateAsset() {
    const id = document.getElementById('liquidate-asset-id-input')?.value;
    const price = Number(document.getElementById('liquidate-asset-price-input')?.value || 0);
    const targetAccountId = document.getElementById('liquidate-asset-target-account')?.value;
    const liquidateDate = this.getDateInputValue('liquidate-asset-date-input');

    if (!id || price <= 0 || !targetAccountId) {
      showToast('Vui lòng điền đầy đủ thông tin bán tài sản', 'error');
      return;
    }

    await liquidateAsset(Number(id), {
      price,
      targetAccountId: Number(targetAccountId),
      liquidateDate
    });

    this.closeLiquidateModal();
    showToast('Đã thanh lý tài sản thành công!', 'success');
    await window.app.refreshAll();
  },

  async deleteAssetItem(id) {
    const asset = await db.assets.get(Number(id));
    if (!asset) return;
    if (!confirm(`Bạn có chắc muốn xóa tài sản "${asset.name}"?`)) return;
    await deleteAsset(Number(id));
    showToast(`Đã xóa tài sản "${asset.name}"`, 'info');
    await window.app.refreshAll();
  },


  /* ==================== TỰ ĐỘNG KIỂM TRA GIÁ NGOẠI TỆ & TIỀN ĐIỆN TỬ ==================== */
  // Bộ nhớ đệm tỷ giá để tránh spam API
  _rateCache: null,
  _rateCacheTime: 0,

  /* Lấy giá kim loại quý (Vàng, Bạc, Bạch kim) trực tuyến */
  async getPreciousMetalPrice(subType = 'sjc_gold', unit = 'Chỉ') {
    const fx = await this.getLatestFxRates();
    const usdVnd = fx.VND || 25900;

    let ounceGoldUsd = 0;
    let ounceSilverUsd = 0;
    let ouncePlatUsd = 0;

    // 1. Lấy giá vàng từ Binance PAXG (1 PAXG = 1 troy ounce Vàng 999.9)
    try {
      const bRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT');
      if (bRes.ok) {
        const bData = await bRes.json();
        if (bData && bData.price) ounceGoldUsd = Number(bData.price);
      }
    } catch (e) {
      console.warn('Binance PAXG error, fallback to Fawaz Ahmed API:', e);
    }

    // 2. Fallback giá vàng & lấy thêm Bạc, Bạch kim từ jsDelivr currency-api
    try {
      if (!ounceGoldUsd) {
        const gRes = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.json');
        if (gRes.ok) {
          const gData = await gRes.json();
          if (gData?.xau?.usd) ounceGoldUsd = Number(gData.xau.usd);
        }
      }

      if (subType === 'silver') {
        const sRes = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xag.json');
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData?.xag?.usd) ounceSilverUsd = Number(sData.xag.usd);
        }
      } else if (subType === 'platinum') {
        const pRes = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xpt.json');
        if (pRes.ok) {
          const pData = await pRes.json();
          if (pData?.xpt?.usd) ouncePlatUsd = Number(pData.xpt.usd);
        }
      }
    } catch (e) {
      console.warn('Metal currency-api fallback error:', e);
    }

    // Giá mặc định dự phòng nếu mất mạng hoàn toàn
    if (!ounceGoldUsd) ounceGoldUsd = 4150;
    if (!ounceSilverUsd) ounceSilverUsd = 58;
    if (!ouncePlatUsd) ouncePlatUsd = 1680;

    // 1 troy ounce = 31.1034768 gram
    // 1 lượng (cây) = 37.5 gram = 1.205653 ounce
    // 1 chỉ = 3.75 gram = 0.120565 ounce
    let baseOunceUsd = ounceGoldUsd;
    let qualityRatio = 1.0; // Hệ số hàm lượng

    if (subType === 'sjc_gold') {
      baseOunceUsd = ounceGoldUsd;
      qualityRatio = 1.05; // Vàng miếng SJC trong nước có thương hiệu / chênh lệch chuẩn
    } else if (subType === 'ring_gold') {
      baseOunceUsd = ounceGoldUsd;
      qualityRatio = 1.0; // Vàng nhẫn tròn trơn 9999 (24K)
    } else if (subType === 'white_gold') {
      baseOunceUsd = ounceGoldUsd;
      qualityRatio = 0.75; // Vàng tây 18K (75%)
    } else if (subType === 'silver') {
      baseOunceUsd = ounceSilverUsd;
      qualityRatio = 1.0;
    } else if (subType === 'platinum') {
      baseOunceUsd = ouncePlatUsd;
      qualityRatio = 1.0;
    }

    const priceOunceVnd = baseOunceUsd * usdVnd * qualityRatio;
    const priceLuongVnd = priceOunceVnd * (37.5 / 31.1034768);
    const priceChiVnd = priceLuongVnd / 10;
    const priceGramVnd = priceOunceVnd / 31.1034768;

    const u = (unit || '').toLowerCase().trim();
    if (u === 'lượng' || u === 'cây' || u === 'luong' || u === 'cay') {
      return Math.round(priceLuongVnd);
    } else if (u === 'chỉ' || u === 'chi') {
      return Math.round(priceChiVnd);
    } else if (u === 'gram' || u === 'g') {
      return Math.round(priceGramVnd);
    } else if (u === 'kg' || u === 'kilogram') {
      return Math.round(priceGramVnd * 1000);
    } else if (u === 'ounce' || u === 'oz') {
      return Math.round(priceOunceVnd);
    }

    // Mặc định tính theo Chỉ (đơn vị phổ biến nhất ở VN)
    return Math.round(priceChiVnd);
  },

  async getLatestFxRates() {
    const now = Date.now();
    // Cache trong 5 phút
    if (this._rateCache && (now - this._rateCacheTime < 5 * 60 * 1000)) {
      return this._rateCache;
    }

    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!res.ok) throw new Error('Network error');
      const data = await res.json();
      if (data && data.rates) {
        this._rateCache = data.rates;
        this._rateCacheTime = now;
        return data.rates;
      }
    } catch (e) {
      console.warn('Primary FX API failed, trying fallback...', e);
      try {
        const res2 = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data2 = await res2.json();
        if (data2 && data2.rates) {
          this._rateCache = data2.rates;
          this._rateCacheTime = now;
          return data2.rates;
        }
      } catch (err2) {
        console.warn('Fallback FX API failed, using static rates...', err2);
      }
    }

    // Tỷ giá tĩnh dự phòng khi offline
    return {
      VND: 25900,
      USD: 1,
      EUR: 0.92,
      JPY: 155,
      GBP: 0.78,
      AUD: 1.55,
      CAD: 1.38,
      SGD: 1.33,
      CNY: 7.24
    };
  },

  async fetchLiveMarketPrice(showFeedback = true, applyToInput = true) {
    const assetType = document.getElementById('asset-type-input')?.value;
    const unitSelect = document.getElementById('asset-unit-select')?.value;
    const customUnit = document.getElementById('asset-unit-input')?.value?.trim();
    const subType = (unitSelect && unitSelect !== 'CUSTOM' ? unitSelect : customUnit) || document.getElementById('asset-subtype-select')?.value || 'USD';
    const curPriceInput = document.getElementById('asset-currentprice-input');
    const curPriceText = document.getElementById('asset-currentprice-text');
    const spinIcon = document.getElementById('icon-auto-price-spin');
    const autoStatusEl = document.getElementById('label-auto-price-status');

    if (!['foreign_currency', 'crypto', 'precious_metal'].includes(assetType) || !curPriceInput) return;

    if (spinIcon) spinIcon.classList.add('rotating');
    if (autoStatusEl) autoStatusEl.textContent = 'Đang tải giá mới nhất...';

    // Đánh dấu requestId để tránh kết quả cũ ghi đè khi đổi nhanh
    this._lastPriceReqId = (this._lastPriceReqId || 0) + 1;
    const curReqId = this._lastPriceReqId;

    try {
      const rates = await this.getLatestFxRates();
      const usdVnd = rates.VND || 25900;
      let calculatedPrice = 0;
      let labelName = subType;

      if (assetType === 'precious_metal') {
        const metalSub = document.getElementById('asset-subtype-select')?.value || 'sjc_gold';
        const metalUnit = (unitSelect && unitSelect !== 'CUSTOM' ? unitSelect : customUnit) || 'Chỉ';
        const subNames = {
          sjc_gold: 'Vàng SJC',
          ring_gold: 'Vàng nhẫn 9999',
          white_gold: 'Vàng tây 18K',
          silver: 'Bạc',
          platinum: 'Bạch kim'
        };
        labelName = `${subNames[metalSub] || 'Kim loại quý'} (/${metalUnit})`;
        calculatedPrice = await this.getPreciousMetalPrice(metalSub, metalUnit);
      } else if (assetType === 'foreign_currency') {
        labelName = subType;
        if (subType === 'USD') {
          calculatedPrice = Math.round(usdVnd);
        } else if (rates[subType]) {
          calculatedPrice = Math.round(usdVnd / rates[subType]);
        } else {
          calculatedPrice = Math.round(usdVnd);
        }
      } else if (assetType === 'crypto') {
        const code = subType.toUpperCase();
        labelName = code;
        if (code === 'USDT') {
          // USDT thường chênh lệch nhẹ so với USD ngân hàng (~25.500 - 25.900)
          calculatedPrice = Math.round(usdVnd);
        } else if (code !== 'OTHER_CRYPTO') {
          // Lấy giá từ Binance API
          try {
            const bRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${code}USDT`);
            if (bRes.ok) {
              const bData = await bRes.json();
              if (bData && bData.price) {
                const priceUsd = Number(bData.price);
                calculatedPrice = Math.round(priceUsd * usdVnd);
              }
            }
          } catch (bErr) {
            console.warn('Binance price fetch error, checking coingecko:', bErr);
          }

          // Fallback CoinGecko nếu Binance không lấy được
          if (!calculatedPrice) {
            const cgMap = {
              BTC: 'bitcoin',
              ETH: 'ethereum',
              BNB: 'binancecoin',
              SOL: 'solana',
              XRP: 'ripple',
              DOGE: 'dogecoin',
              ADA: 'cardano',
              TRX: 'tron'
            };
            const cgId = cgMap[code];
            if (cgId) {
              try {
                const cgRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=vnd`);
                const cgData = await cgRes.json();
                if (cgData && cgData[cgId] && cgData[cgId].vnd) {
                  calculatedPrice = Math.round(cgData[cgId].vnd);
                }
              } catch (cgErr) {
                console.warn('CoinGecko fallback error:', cgErr);
              }
            }
          }
        }
      }

      // Bỏ qua nếu người dùng đã chuyển sang đồng khác
      if (curReqId !== this._lastPriceReqId) return;

      if (calculatedPrice > 0) {
        this._latestLivePrice = calculatedPrice;
        if (applyToInput) {
          curPriceInput.value = calculatedPrice;
          const actualCurText = document.getElementById('asset-currentprice-text');
          if (actualCurText) actualCurText.textContent = new Intl.NumberFormat('vi-VN').format(calculatedPrice);

          const buyPriceInput = document.getElementById('asset-buyprice-input');
          const buyPriceText = document.getElementById('asset-buyprice-text');
          const curBuyVal = Number(buyPriceInput?.value || 0);
          if (curBuyVal === 0) {
            if (buyPriceInput) buyPriceInput.value = calculatedPrice;
            if (buyPriceText) buyPriceText.textContent = new Intl.NumberFormat('vi-VN').format(calculatedPrice);
          }

          this.calcAssetPreview();
        }

        if (autoStatusEl) {
          autoStatusEl.textContent = `Tỷ giá thị trường: ${new Intl.NumberFormat('vi-VN').format(calculatedPrice)}đ/${document.getElementById('asset-unit-select')?.value || 'đv'}`;
        }
        if (showFeedback) {
          showToast(`Đã lấy giá ${labelName}: ${new Intl.NumberFormat('vi-VN').format(calculatedPrice)}đ`, 'success');
        }
      } else {
        if (autoStatusEl) autoStatusEl.textContent = 'Chưa thể tự lấy giá đồng này';
        if (showFeedback) {
          showToast('Không lấy được giá trực tuyến tự động. Vui lòng nhập giá tay.', 'info');
        }
      }
    } catch (err) {
      console.error('Error fetching live price:', err);
      if (autoStatusEl) autoStatusEl.textContent = 'Lỗi kết nối khi lấy giá';
      if (showFeedback) {
        showToast('Lỗi kiểm tra giá trực tuyến, vui lòng thử lại', 'error');
      }
    } finally {
      if (spinIcon) spinIcon.classList.remove('rotating');
    }
  },

  async refreshAllLivePrices() {
    const iconBtn = document.getElementById('icon-refresh-all-assets');
    if (iconBtn) iconBtn.classList.add('rotating');

    try {
      const allAssets = await db.assets.where('isDeleted').equals(0).toArray();
      const liveItems = allAssets.filter(a => a.status !== 'liquidated' && ['foreign_currency', 'crypto', 'precious_metal'].includes(a.assetType));

      if (liveItems.length === 0) {
        showToast('Chưa có tài sản Ngoại tệ, Crypto hoặc Kim loại quý nào để làm mới', 'info');
        return;
      }

      showToast(`Đang làm mới giá cho ${liveItems.length} tài sản...`, 'info');
      const rates = await this.getLatestFxRates();
      const usdVnd = rates.VND || 25900;
      let updatedCount = 0;

      for (const item of liveItems) {
        let newPrice = 0;
        const sub = item.subType || '';

        if (item.assetType === 'precious_metal') {
          newPrice = await this.getPreciousMetalPrice(sub, item.unit || 'Chỉ');
        } else if (item.assetType === 'foreign_currency') {
          const fSub = sub.toUpperCase();
          if (fSub === 'USD') newPrice = usdVnd;
          else if (rates[fSub]) newPrice = usdVnd / rates[fSub];
        } else if (item.assetType === 'crypto') {
          const cSub = sub.toUpperCase();
          if (cSub === 'USDT') {
            newPrice = usdVnd;
          } else if (cSub !== 'OTHER_CRYPTO') {
            try {
              const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${cSub}USDT`);
              if (res.ok) {
                const d = await res.json();
                if (d && d.price) newPrice = Number(d.price) * usdVnd;
              }
            } catch (e) {
              console.warn('Live refresh err for ' + cSub, e);
            }
          }
        }

        if (newPrice > 0) {
          await updateAsset(item.id, { currentPrice: Math.round(newPrice) });
          updatedCount++;
        }
      }

      await window.app.refreshAll();
      showToast(`Đã cập nhật giá mới nhất cho ${updatedCount} tài sản!`, 'success');
    } catch (e) {
      console.error('refreshAllLivePrices error:', e);
      showToast('Có lỗi xảy ra khi làm mới tỷ giá', 'error');
    } finally {
      if (iconBtn) iconBtn.classList.remove('rotating');
    }
  },

  /* Helper định dạng số tiền tức thì có dấu phân cách hàng nghìn */
  formatInputLiveHint(inputEl, hintId) {
    const hintEl = document.getElementById(hintId);
    if (!hintEl) return;
    const val = Math.round(Number(inputEl?.value || 0));
    hintEl.textContent = new Intl.NumberFormat('vi-VN').format(val) + 'đ';
  },

  /* ==================== ACTION SHEET CHUNG (3 CHẤM) ==================== */
  currentItemAction: null,

  openItemActionSheet(type, id) {
    this.currentItemAction = { type, id: Number(id) };
    const modal = document.getElementById('modal-item-actions');
    const titleEl = document.getElementById('item-actions-title');
    const subtitleEl = document.getElementById('item-actions-subtitle');
    const iconEl = document.getElementById('item-actions-icon');
    const bodyEl = document.getElementById('item-actions-body');
    if (!modal || !bodyEl) return;

    if (type === 'loan') {
      db.loans.get(Number(id)).then(l => {
        if (!l) return;
        if (titleEl) titleEl.textContent = l.name;
        const remaining = l.remainingAmount !== undefined ? l.remainingAmount : (l.loanAmount || 0);
        if (subtitleEl) subtitleEl.textContent = `Dư nợ: ${new Intl.NumberFormat('vi-VN').format(remaining)}đ / ${new Intl.NumberFormat('vi-VN').format(l.loanAmount || 0)}đ ${l.status === 'settled' ? '(Đã tất toán)' : ''}`;
        if (iconEl) {
          iconEl.innerHTML = '<i data-lucide="badge-percent"></i>';
          iconEl.style.background = 'rgba(239, 68, 68, 0.15)';
          iconEl.style.color = '#ef4444';
        }

        let btns = '';
        if (l.status === 'active') {
          btns += `
            <button type="button" class="action-sheet-item" onclick="UIAccounts.closeItemActionSheet(); UIAccounts.openPayLoanModal(${l.id})">
              <div class="action-sheet-item-icon" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">
                <i data-lucide="credit-card" style="width: 20px; height: 20px;"></i>
              </div>
              <div class="action-sheet-item-text">
                <span class="action-sheet-item-title">Trả nợ gốc / Tất toán</span>
                <span class="action-sheet-item-desc">Ghi nhận đợt trả nợ gốc hoặc tất toán toàn bộ sổ vay</span>
              </div>
            </button>
          `;
        }
        btns += `
          <button type="button" class="action-sheet-item" onclick="UIAccounts.closeItemActionSheet(); UIAccounts.openLoanForm(${l.id})">
            <div class="action-sheet-item-icon" style="background: rgba(79, 70, 229, 0.15); color: #4f46e5;">
              <i data-lucide="edit-3" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="action-sheet-item-text">
              <span class="action-sheet-item-title">Sửa thông tin sổ vay</span>
              <span class="action-sheet-item-desc">Thay đổi lãi suất, kỳ hạn, ngân hàng...</span>
            </div>
          </button>
          <button type="button" class="action-sheet-item text-danger" onclick="UIAccounts.closeItemActionSheet(); UIAccounts.deleteLoanItem(${l.id})">
            <div class="action-sheet-item-icon" style="background: rgba(244, 63, 94, 0.15); color: #f43f5e;">
              <i data-lucide="trash-2" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="action-sheet-item-text">
              <span class="action-sheet-item-title">Xóa sổ vay</span>
              <span class="action-sheet-item-desc">Xóa hoàn toàn khỏi ứng dụng</span>
            </div>
          </button>
        `;
        bodyEl.innerHTML = btns;
        modal.classList.add('open');
        if (window.lucide) lucide.createIcons();
      });
      return;
    }

    if (type === 'savings') {
      db.savings.get(Number(id)).then(s => {
        if (!s) return;
        if (titleEl) titleEl.textContent = s.name;
        if (subtitleEl) subtitleEl.textContent = `Gửi: ${new Intl.NumberFormat('vi-VN').format(s.balance || s.depositAmount || 0)}đ ${s.status === 'settled' ? '(Đã tất toán)' : ''}`;
        if (iconEl) {
          iconEl.innerHTML = '<i data-lucide="piggy-bank"></i>';
          iconEl.style.background = 'rgba(14, 165, 233, 0.15)';
          iconEl.style.color = '#0ea5e9';
        }

        let btns = '';
        if (s.status === 'active') {
          btns += `
            <button type="button" class="action-sheet-item" onclick="UIAccounts.closeItemActionSheet(); UIAccounts.openSettleSavingModal(${s.id})">
              <div class="action-sheet-item-icon" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">
                <i data-lucide="check-circle" style="width: 20px; height: 20px;"></i>
              </div>
              <div class="action-sheet-item-text">
                <span class="action-sheet-item-title">Tất toán sổ tiết kiệm</span>
                <span class="action-sheet-item-desc">Rút gốc và lãi chuyển về tài khoản chi tiêu</span>
              </div>
            </button>
          `;
        }
        btns += `
          <button type="button" class="action-sheet-item" onclick="UIAccounts.closeItemActionSheet(); UIAccounts.openSavingsForm(${s.id})">
            <div class="action-sheet-item-icon" style="background: rgba(79, 70, 229, 0.15); color: #4f46e5;">
              <i data-lucide="edit-3" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="action-sheet-item-text">
              <span class="action-sheet-item-title">Sửa thông tin sổ</span>
              <span class="action-sheet-item-desc">Thay đổi kỳ hạn, lãi suất, ngân hàng...</span>
            </div>
          </button>
          <button type="button" class="action-sheet-item text-danger" onclick="UIAccounts.closeItemActionSheet(); UIAccounts.deleteSavingItem(${s.id})">
            <div class="action-sheet-item-icon" style="background: rgba(244, 63, 94, 0.15); color: #f43f5e;">
              <i data-lucide="trash-2" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="action-sheet-item-text">
              <span class="action-sheet-item-title">Xóa sổ tiết kiệm</span>
              <span class="action-sheet-item-desc">Xóa hoàn toàn khỏi ứng dụng</span>
            </div>
          </button>
        `;
        bodyEl.innerHTML = btns;
        modal.classList.add('open');
        if (window.lucide) lucide.createIcons();
      });
    } else if (type === 'accumulation') {
      db.accumulations.get(Number(id)).then(acc => {
        if (!acc) return;
        if (titleEl) titleEl.textContent = acc.name;
        if (subtitleEl) subtitleEl.textContent = `Hiện có: ${new Intl.NumberFormat('vi-VN').format(acc.currentAmount || 0)} / ${new Intl.NumberFormat('vi-VN').format(acc.targetAmount || 0)}đ`;
        if (iconEl) {
          iconEl.innerHTML = '<i data-lucide="target"></i>';
          iconEl.style.background = 'rgba(245, 158, 11, 0.15)';
          iconEl.style.color = '#f59e0b';
        }

        bodyEl.innerHTML = `
          <button type="button" class="action-sheet-item" onclick="UIAccounts.closeItemActionSheet(); UIAccounts.openDepositAccModal(${acc.id}, 'deposit')">
            <div class="action-sheet-item-icon" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">
              <i data-lucide="plus-circle" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="action-sheet-item-text">
              <span class="action-sheet-item-title">Nạp thêm tiền tích lũy</span>
              <span class="action-sheet-item-desc">Trích tiền từ ví vào mục tiêu này</span>
            </div>
          </button>
          <button type="button" class="action-sheet-item" onclick="UIAccounts.closeItemActionSheet(); UIAccounts.openDepositAccModal(${acc.id}, 'withdraw')">
            <div class="action-sheet-item-icon" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">
              <i data-lucide="minus-circle" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="action-sheet-item-text">
              <span class="action-sheet-item-title">Rút bớt tiền tích lũy</span>
              <span class="action-sheet-item-desc">Rút tiền chuyển lại vào ví</span>
            </div>
          </button>
          <button type="button" class="action-sheet-item" onclick="UIAccounts.closeItemActionSheet(); UIAccounts.openAccumulationForm(${acc.id})">
            <div class="action-sheet-item-icon" style="background: rgba(79, 70, 229, 0.15); color: #4f46e5;">
              <i data-lucide="edit-3" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="action-sheet-item-text">
              <span class="action-sheet-item-title">Sửa mục tiêu tích lũy</span>
              <span class="action-sheet-item-desc">Đổi hạn chót, số tiền mục tiêu...</span>
            </div>
          </button>
          <button type="button" class="action-sheet-item text-danger" onclick="UIAccounts.closeItemActionSheet(); UIAccounts.deleteAccumulationItem(${acc.id})">
            <div class="action-sheet-item-icon" style="background: rgba(244, 63, 94, 0.15); color: #f43f5e;">
              <i data-lucide="trash-2" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="action-sheet-item-text">
              <span class="action-sheet-item-title">Xóa sổ tích lũy</span>
              <span class="action-sheet-item-desc">Xóa hoàn toàn khỏi ứng dụng</span>
            </div>
          </button>
        `;
        modal.classList.add('open');
        if (window.lucide) lucide.createIcons();
      });
    } else if (type === 'asset') {
      db.assets.get(Number(id)).then(asset => {
        if (!asset) return;
        const totalCur = (asset.quantity || 1) * (asset.currentPrice || 0);
        if (titleEl) titleEl.textContent = asset.name;
        if (subtitleEl) subtitleEl.textContent = `Giá trị: ${new Intl.NumberFormat('vi-VN').format(totalCur)}đ`;
        if (iconEl) {
          iconEl.innerHTML = '<i data-lucide="gem"></i>';
          iconEl.style.background = 'rgba(168, 85, 247, 0.15)';
          iconEl.style.color = '#a855f7';
        }

        bodyEl.innerHTML = `
          <button type="button" class="action-sheet-item" onclick="UIAccounts.closeItemActionSheet(); UIAccounts.openLiquidateModal(${asset.id})">
            <div class="action-sheet-item-icon" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">
              <i data-lucide="dollar-sign" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="action-sheet-item-text">
              <span class="action-sheet-item-title">Bán / Thanh lý tài sản</span>
              <span class="action-sheet-item-desc">Ghi nhận tiền bán và chuyển vào ví chi tiêu</span>
            </div>
          </button>
          <button type="button" class="action-sheet-item" onclick="UIAccounts.closeItemActionSheet(); UIAccounts.openAssetForm('${asset.assetType || 'real_estate'}', ${asset.id})">
            <div class="action-sheet-item-icon" style="background: rgba(79, 70, 229, 0.15); color: #4f46e5;">
              <i data-lucide="edit-3" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="action-sheet-item-text">
              <span class="action-sheet-item-title">Cập nhật giá & thông tin</span>
              <span class="action-sheet-item-desc">Định giá lại theo thị trường hiện tại</span>
            </div>
          </button>
          <button type="button" class="action-sheet-item text-danger" onclick="UIAccounts.closeItemActionSheet(); UIAccounts.deleteAssetItem(${asset.id})">
            <div class="action-sheet-item-icon" style="background: rgba(244, 63, 94, 0.15); color: #f43f5e;">
              <i data-lucide="trash-2" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="action-sheet-item-text">
              <span class="action-sheet-item-title">Xóa tài sản</span>
              <span class="action-sheet-item-desc">Xóa hoàn toàn khỏi ứng dụng</span>
            </div>
          </button>
        `;
        modal.classList.add('open');
        if (window.lucide) lucide.createIcons();
      });
    }
  },

  closeItemActionSheet() {
    const modal = document.getElementById('modal-item-actions');
    if (modal) modal.classList.remove('open');
    this.currentItemAction = null;
  },

  
  /* ==================== SỔ VAY NGÂN HÀNG (LOANS) ==================== */
  isSettledLoansExpanded: false,

  toggleSettledLoansList() {
    this.isSettledLoansExpanded = !this.isSettledLoansExpanded;
    const list = document.getElementById('settled-loans-list');
    const chevron = document.getElementById('settled-loans-toggle-icon');
    if (list) list.style.display = this.isSettledLoansExpanded ? 'flex' : 'none';
    if (chevron) chevron.classList.toggle('rotated', this.isSettledLoansExpanded);
    if (window.lucide) lucide.createIcons();
  },

  async openLoanForm(loanId = null) {
    const idInput = document.getElementById('loan-id-input');
    const titleEl = document.getElementById('loan-form-title');
    const startDateInput = document.getElementById('loan-start-date-input');
    const termSelect = document.getElementById('loan-term-select');
    const rateInput = document.getElementById('loan-interest-rate-input');
    const amountInput = document.getElementById('loan-amount-input');
    const amountText = document.getElementById('loan-amount-text');
    const bankDisplay = document.getElementById('loan-bank-display');
    const bankCodeInput = document.getElementById('loan-bank-code-input');
    const bankLogoPreview = document.getElementById('loan-bank-logo-preview');

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    if (loanId) {
      const loan = await db.loans.get(Number(loanId));
      if (!loan) return;
      if (idInput) idInput.value = loan.id;
      if (titleEl) titleEl.textContent = 'Sửa Sổ Vay Ngân Hàng';

      document.getElementById('loan-name-input').value = loan.name || '';
      if (amountInput) amountInput.value = loan.loanAmount || 0;
      if (amountText) amountText.textContent = new Intl.NumberFormat('vi-VN').format(loan.loanAmount || 0);
      this.setDateInputValue('loan-start-date-input', loan.startDate || todayStr);
      if (termSelect) termSelect.value = loan.termMonths !== undefined ? loan.termMonths : 12;
      if (rateInput) rateInput.value = loan.interestRate !== undefined ? loan.interestRate : 8.5;
      document.getElementById('loan-repayment-type-select').value = loan.repaymentType || 'reducing';
      document.getElementById('loan-due-day-select').value = loan.dueDay || 1;
      document.getElementById('loan-desc-input').value = loan.description || '';
      document.getElementById('loan-exclude-report-input').checked = !!loan.excludeFromReport;
      await this.updateLoanDisburseDisplay(loan.disbursementAccountId || '', true);

      if (bankCodeInput) bankCodeInput.value = loan.bankCode || '';
      if (loan.bankCode) {
        const prov = this.PROVIDERS.find(x => x.code === loan.bankCode);
        if (bankDisplay) bankDisplay.textContent = prov ? prov.name : loan.bankCode;
        if (bankLogoPreview) {
          bankLogoPreview.innerHTML = this.renderLogoBadge(prov || loan.bankCode, 32);
          bankLogoPreview.style.background = 'transparent';
        }
      } else {
        if (bankDisplay) bankDisplay.textContent = 'Chưa chọn (Mặc định)';
        if (bankLogoPreview) {
          bankLogoPreview.innerHTML = '<i data-lucide="landmark"></i>';
          bankLogoPreview.style.background = 'rgba(79, 70, 229, 0.15)';
          bankLogoPreview.style.color = '#4f46e5';
        }
      }
    } else {
      if (idInput) idInput.value = '';
      if (titleEl) titleEl.textContent = 'Thêm Sổ Vay Ngân Hàng';
      document.getElementById('loan-name-input').value = '';
      if (amountInput) amountInput.value = '0';
      if (amountText) amountText.textContent = '0';
      this.setDateInputValue('loan-start-date-input', todayStr);
      if (termSelect) termSelect.value = '12';
      if (rateInput) rateInput.value = '8.5';
      document.getElementById('loan-repayment-type-select').value = 'reducing';
      document.getElementById('loan-due-day-select').value = '1';
      document.getElementById('loan-desc-input').value = '';
      document.getElementById('loan-exclude-report-input').checked = false;
      await this.updateLoanDisburseDisplay('', false);

      if (bankCodeInput) bankCodeInput.value = '';
      if (bankDisplay) bankDisplay.textContent = 'Chưa chọn (Mặc định)';
      if (bankLogoPreview) {
        bankLogoPreview.innerHTML = '<i data-lucide="landmark"></i>';
        bankLogoPreview.style.background = 'rgba(79, 70, 229, 0.15)';
        bankLogoPreview.style.color = '#4f46e5';
      }
    }

    this.calcLoanPreview();
    if (window.app) {
      window.app.switchView('loan-form');
    }
    if (window.lucide) lucide.createIcons();
  },

  closeLoanForm() {
    if (window.app) window.app.switchView('accounts', true);
  },

  openLoanKeypad() {
    if (window.UITransactions) {
      UITransactions.openKeypad('loan-amount');
    }
  },

  openLoanDatePicker() {
    this.openDatePicker('loan-start-date-input', {
      onSelect: () => this.calcLoanPreview()
    });
  },

  openLoanBankPicker() {
    this._pickerTarget = 'loan';
    this.openProviderPage();
  },

  async updateLoanDisburseDisplay(accId, isEdit = false) {
    const input = document.getElementById('loan-disburse-account-select');
    const logoEl = document.getElementById('loan-disburse-logo-preview');
    const nameEl = document.getElementById('loan-disburse-account-name');
    const balEl = document.getElementById('loan-disburse-account-balance');
    if (!input || !logoEl || !nameEl || !balEl) return;

    input.value = accId || '';
    if (!accId) {
      logoEl.innerHTML = '<i data-lucide="arrow-down-left"></i>';
      logoEl.style.background = 'rgba(16, 185, 129, 0.15)';
      logoEl.style.color = '#10b981';
      nameEl.textContent = 'Không cộng vào ví (Đã có sẵn / Ngoài ví)';
      balEl.textContent = 'Chỉ theo dõi nghĩa vụ nợ, không thay đổi số dư ví';
      if (window.lucide) lucide.createIcons();
      return;
    }

    const acc = await db.accounts.get(Number(accId));
    if (acc) {
      const prov = this.PROVIDERS.find(x => x.code === acc.bankCode);
      logoEl.innerHTML = this.renderLogoBadge(prov || acc, 36);
      logoEl.style.background = 'transparent';
      nameEl.textContent = acc.name;
      balEl.textContent = `Số dư: ${new Intl.NumberFormat('vi-VN').format(acc.balance || 0)}đ (Nhận giải ngân & ghi chú thu chi vào ví)`;
    }
    if (window.lucide) lucide.createIcons();
  },

  openLoanDisbursePicker() {
    const isEdit = !!document.getElementById('loan-id-input')?.value;
    const curVal = document.getElementById('loan-disburse-account-select')?.value || '';
    this.openSourceAccountPicker({
      title: 'Tài Khoản Nhận Giải Ngân Vào Ví',
      allowNone: true,
      noneLabel: 'Không cộng vào ví (Đã có sẵn / Ngoài ví)',
      noneDesc: 'Chỉ theo dõi nghĩa vụ nợ, không tạo giao dịch thu chi vào ví',
      selectedId: curVal,
      onSelect: (selectedId) => {
        this.updateLoanDisburseDisplay(selectedId, isEdit);
      }
    });
  },

  calcLoanPreview() {
    const amountVal = Number(document.getElementById('loan-amount-input')?.value || 0);
    const termMonths = parseInt(document.getElementById('loan-term-select')?.value || '12', 10);
    const rateYear = parseFloat(document.getElementById('loan-interest-rate-input')?.value || '0');
    const repaymentType = document.getElementById('loan-repayment-type-select')?.value || 'reducing';

    const pPrincipalEl = document.getElementById('loan-preview-principal-val');
    const pInterestEl = document.getElementById('loan-preview-interest-val');
    const pTotalEl = document.getElementById('loan-preview-total-val');
    const pTotalInterestEl = document.getElementById('loan-preview-total-interest-val');

    if (amountVal <= 0 || termMonths <= 0) {
      if (pPrincipalEl) pPrincipalEl.textContent = '0đ';
      if (pInterestEl) pInterestEl.textContent = '0đ';
      if (pTotalEl) pTotalEl.textContent = '0đ';
      if (pTotalInterestEl) pTotalInterestEl.textContent = '~0đ';
      return;
    }

    const rateMonth = (rateYear / 100) / 12;
    let firstPrincipal = 0;
    let firstInterest = Math.round(amountVal * rateMonth);
    let firstTotal = 0;
    let totalInterest = 0;

    if (repaymentType === 'reducing') {
      firstPrincipal = Math.round(amountVal / termMonths);
      firstTotal = firstPrincipal + firstInterest;
      totalInterest = Math.round(((amountVal * (termMonths + 1)) / 2) * rateMonth);
    } else if (repaymentType === 'annuity') {
      if (rateMonth > 0) {
        firstTotal = Math.round(amountVal * (rateMonth * Math.pow(1 + rateMonth, termMonths)) / (Math.pow(1 + rateMonth, termMonths) - 1));
        firstPrincipal = firstTotal - firstInterest;
        totalInterest = (firstTotal * termMonths) - amountVal;
      } else {
        firstPrincipal = Math.round(amountVal / termMonths);
        firstTotal = firstPrincipal;
        totalInterest = 0;
      }
    } else {
      // 'end': Trả gốc cuối kỳ
      firstPrincipal = 0;
      firstTotal = firstInterest;
      totalInterest = Math.round(amountVal * rateMonth * termMonths);
    }

    if (pPrincipalEl) pPrincipalEl.textContent = `${new Intl.NumberFormat('vi-VN').format(firstPrincipal)}đ`;
    if (pInterestEl) pInterestEl.textContent = `+${new Intl.NumberFormat('vi-VN').format(firstInterest)}đ`;
    if (pTotalEl) pTotalEl.textContent = `${new Intl.NumberFormat('vi-VN').format(firstTotal)}đ`;
    if (pTotalInterestEl) pTotalInterestEl.textContent = `~${new Intl.NumberFormat('vi-VN').format(totalInterest)}đ`;
  },

  async handleLoanSubmit() {
    const id = document.getElementById('loan-id-input')?.value;
    const name = document.getElementById('loan-name-input')?.value.trim();
    const loanAmount = Number(document.getElementById('loan-amount-input')?.value || 0);
    const bankCode = document.getElementById('loan-bank-code-input')?.value || '';
    const startDate = this.getDateInputValue('loan-start-date-input');
    const termMonths = parseInt(document.getElementById('loan-term-select')?.value || '12', 10);
    const interestRate = parseFloat(document.getElementById('loan-interest-rate-input')?.value || '0');
    const repaymentType = document.getElementById('loan-repayment-type-select')?.value || 'reducing';
    const dueDay = parseInt(document.getElementById('loan-due-day-select')?.value || '1', 10);
    const disbursementAccountId = document.getElementById('loan-disburse-account-select')?.value || null;
    const description = document.getElementById('loan-desc-input')?.value.trim() || '';
    const excludeFromReport = document.getElementById('loan-exclude-report-input')?.checked ? 1 : 0;

    if (!name) {
      showToast('Vui lòng nhập tên sổ vay', 'warning');
      document.getElementById('loan-name-input')?.focus();
      return;
    }
    if (loanAmount <= 0) {
      showToast('Vui lòng nhập số tiền vay', 'warning');
      this.openLoanKeypad();
      return;
    }

    const payload = {
      name,
      bankCode,
      loanAmount,
      startDate,
      termMonths,
      interestRate,
      repaymentType,
      dueDay,
      disbursementAccountId: disbursementAccountId ? Number(disbursementAccountId) : null,
      description,
      excludeFromReport
    };

    try {
      if (id) {
        await updateLoan(id, payload);
        showToast('Đã cập nhật sổ vay thành công!', 'success');
      } else {
        await addLoan(payload);
        showToast('Đã tạo sổ vay ngân hàng thành công!', 'success');
      }
      this.closeLoanForm();
      await this.render();
      if (window.app && typeof window.app.refreshAll === 'function') {
        await window.app.refreshAll();
      }
    } catch (e) {
      console.error(e);
      showToast('Lỗi lưu sổ vay: ' + e.message, 'error');
    }
  },

  async renderLoans() {
    const container = document.getElementById('loans-list-container');
    const badgeCount = document.getElementById('badge-loans-count');
    const settledSec = document.getElementById('settled-loans-section');
    const settledList = document.getElementById('settled-loans-list');
    const settledLabel = document.getElementById('settled-loans-toggle-label');
    const settledChevron = document.getElementById('settled-loans-toggle-icon');
    if (!container || !db.loans) return;

    const allLoans = await db.loans.where('isDeleted').equals(0).toArray();
    const activeLoans = allLoans.filter(l => l.status !== 'settled');
    const settledLoans = allLoans.filter(l => l.status === 'settled');

    if (badgeCount) badgeCount.textContent = activeLoans.length;

    if (activeLoans.length === 0) {
      container.innerHTML = `
        <div class="accounts-empty-card">
          <div class="empty-icon-wrap" style="background: rgba(239, 68, 68, 0.12); color: #ef4444;">
            <i data-lucide="badge-percent" style="width: 22px; height: 22px;"></i>
          </div>
          <p class="empty-text">Chưa có sổ vay ngân hàng nào</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    } else {
      container.innerHTML = activeLoans.map(l => {
        const prov = l.bankCode ? this.PROVIDERS.find(x => x.code === l.bankCode) : null;
        const remaining = l.remainingAmount !== undefined ? l.remainingAmount : (l.loanAmount || 0);
        const percentPaid = l.loanAmount > 0 ? Math.round(((l.loanAmount - remaining) / l.loanAmount) * 100) : 0;
        const dueDayText = l.dueDay ? `Trả ngày ${l.dueDay} hàng tháng` : '';

        return `
          <div class="group-item-card" onclick="UIAccounts.openItemActionSheet('loan', ${l.id})" style="width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; overflow: hidden;">
            <div class="group-card-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; min-width: 0;">
              <div class="group-card-title-row" style="display: flex; align-items: center; gap: 8px; flex: 1 1 0%; min-width: 0; max-width: calc(100% - 36px); overflow: hidden;">
                <div class="group-card-icon-wrap" style="background: transparent; flex-shrink: 0;">
                  ${this.renderLogoBadge(prov || l.bankCode || { icon: 'badge-percent', color: '#ef4444' }, 38)}
                </div>
                <div class="group-card-info-wrap" style="flex: 1 1 0%; min-width: 0; max-width: 100%; width: 0; overflow: hidden; box-sizing: border-box;">
                  <div class="group-card-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; width: 100%; max-width: 100%; font-weight: 700;" title="${escapeHTML(l.name)}">${escapeHTML(l.name)}</div>
                  <div class="group-card-sub" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    <span class="rate-badge" style="background: rgba(239, 68, 68, 0.12); color: #ef4444;">${l.interestRate || 0}%/năm</span>
                    <span class="term-badge">${l.termMonths ? l.termMonths + ' tháng' : ''}</span>
                    <span style="font-size: 0.72rem; color: var(--text-muted);">${dueDayText}</span>
                  </div>
                </div>
              </div>
              <button type="button" class="btn-icon group-card-more-btn" onclick="event.stopPropagation(); UIAccounts.openItemActionSheet('loan', ${l.id})" title="Tùy chọn" style="flex-shrink: 0; width: 28px; height: 28px; min-width: 28px; border: none; background: transparent; padding: 0; display: inline-flex; align-items: center; justify-content: center;">
                <i data-lucide="more-vertical" style="width: 17px; height: 17px;"></i>
              </button>
            </div>

            <div class="group-card-body" style="flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: baseline; width: 100%;">
                <div>
                  <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Dư nợ gốc còn lại</span>
                  <span class="group-card-amount stat-amount" style="color: #ef4444;">${new Intl.NumberFormat('vi-VN').format(remaining)}đ</span>
                </div>
                <div style="text-align: right;">
                  <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Khoản vay gốc</span>
                  <span style="font-size: 0.88rem; font-weight: 600; color: var(--text-secondary);">${new Intl.NumberFormat('vi-VN').format(l.loanAmount || 0)}đ</span>
                </div>
              </div>
              <!-- Progress bar -->
              <div style="width: 100%; height: 5px; background: rgba(148, 163, 184, 0.2); border-radius: 3px; overflow: hidden; margin-top: 2px;">
                <div style="width: ${Math.min(100, Math.max(0, percentPaid))}%; height: 100%; background: #10b981; border-radius: 3px;"></div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-muted);">
                <span>Đã trả: ${percentPaid}%</span>
                <span>Còn lại: ${100 - percentPaid}%</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    if (settledSec && settledList) {
      if (settledLoans.length === 0) {
        settledSec.style.display = 'none';
        settledList.innerHTML = '';
      } else {
        settledSec.style.display = 'block';
        if (settledLabel) settledLabel.textContent = `Sổ vay đã tất toán (${settledLoans.length})`;
        settledList.style.display = this.isSettledLoansExpanded ? 'flex' : 'none';
        if (settledChevron) settledChevron.classList.toggle('rotated', this.isSettledLoansExpanded);

        settledList.innerHTML = settledLoans.map(l => {
          const prov = l.bankCode ? this.PROVIDERS.find(x => x.code === l.bankCode) : null;
          const settleDateStr = l.settledDate ? l.settledDate.split('-').reverse().join('/') : '';

          return `
            <div class="group-item-card archived" onclick="UIAccounts.openItemActionSheet('loan', ${l.id})">
              <div class="group-card-header">
                <div class="group-card-title-row">
                  <div class="group-card-icon-wrap" style="background: transparent; opacity: 0.65;">
                    ${this.renderLogoBadge(prov || l.bankCode || { icon: 'badge-percent', color: '#ef4444' }, 36)}
                  </div>
                  <div style="min-width: 0; flex: 1;">
                    <div class="group-card-name" style="text-decoration: line-through; opacity: 0.7;">${escapeHTML(l.name)}</div>
                    <div class="group-card-sub">
                      <span class="settled-badge" style="color: #10b981; background: rgba(16, 185, 129, 0.12);"><i data-lucide="check-circle" style="width:10px;height:10px;"></i> Đã tất toán</span>
                      ${settleDateStr ? `<span style="font-size: 0.75rem; color: var(--text-muted);">${settleDateStr}</span>` : ''}
                    </div>
                  </div>
                </div>
                <button type="button" class="btn-icon" onclick="event.stopPropagation(); UIAccounts.openItemActionSheet('loan', ${l.id})">
                  <i data-lucide="more-vertical" style="width: 16px; height: 16px;"></i>
                </button>
              </div>
              <div class="group-card-body">
                <div>
                  <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Số tiền vay ban đầu</span>
                  <span class="group-card-amount stat-amount" style="opacity: 0.7;">${new Intl.NumberFormat('vi-VN').format(l.loanAmount || 0)}đ</span>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  },

  // Pay loan modal
  async openPayLoanModal(loanId) {
    const loan = await db.loans.get(Number(loanId));
    if (!loan) return;

    const remaining = loan.remainingAmount !== undefined ? loan.remainingAmount : (loan.loanAmount || 0);

    document.getElementById('pay-loan-id-input').value = loan.id;
    document.getElementById('pay-loan-name-display').value = loan.name;
    document.getElementById('pay-loan-remaining-display').value = `${new Intl.NumberFormat('vi-VN').format(remaining)}đ`;

    const pAmountInput = document.getElementById('pay-loan-amount-input');
    const pAmountText = document.getElementById('pay-loan-amount-text');
    if (pAmountInput) pAmountInput.value = '0';
    if (pAmountText) pAmountText.textContent = '0';

    this.setDateInputValue('pay-loan-date-input', new Date().toISOString().split('T')[0]);
    await this.updatePayLoanSourceDisplay('');

    const modal = document.getElementById('modal-pay-loan');
    if (modal) modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closePayLoanModal() {
    const modal = document.getElementById('modal-pay-loan');
    if (modal) modal.classList.remove('open');
  },

  openPayLoanKeypad() {
    if (window.UITransactions) {
      UITransactions.openKeypad('pay-loan-amount');
    }
  },

  openPayLoanDatePicker() {
    this.openDatePicker('pay-loan-date-input');
  },

  fillPayLoanAll() {
    const id = document.getElementById('pay-loan-id-input')?.value;
    if (!id) return;
    db.loans.get(Number(id)).then(loan => {
      if (!loan) return;
      const remaining = loan.remainingAmount !== undefined ? loan.remainingAmount : (loan.loanAmount || 0);
      const pAmountInput = document.getElementById('pay-loan-amount-input');
      const pAmountText = document.getElementById('pay-loan-amount-text');
      if (pAmountInput) pAmountInput.value = remaining;
      if (pAmountText) pAmountText.textContent = new Intl.NumberFormat('vi-VN').format(remaining);
    });
  },

  async updatePayLoanSourceDisplay(accId) {
    const input = document.getElementById('pay-loan-source-account-input');
    const logoEl = document.getElementById('pay-loan-source-logo-preview');
    const nameEl = document.getElementById('pay-loan-source-account-name');
    const balEl = document.getElementById('pay-loan-source-account-balance');
    if (!input || !logoEl || !nameEl || !balEl) return;

    input.value = accId || '';
    if (!accId) {
      logoEl.innerHTML = '<i data-lucide="wallet"></i>';
      logoEl.style.background = 'rgba(16, 185, 129, 0.15)';
      logoEl.style.color = '#10b981';
      nameEl.textContent = 'Không trích tiền ví';
      balEl.textContent = 'Không trừ số dư tài khoản';
      if (window.lucide) lucide.createIcons();
      return;
    }

    const acc = await db.accounts.get(Number(accId));
    if (acc) {
      const prov = this.PROVIDERS.find(x => x.code === acc.bankCode);
      logoEl.innerHTML = this.renderLogoBadge(prov || acc, 36);
      logoEl.style.background = 'transparent';
      nameEl.textContent = acc.name;
      balEl.textContent = `Số dư: ${new Intl.NumberFormat('vi-VN').format(acc.balance || 0)}đ`;
    }
    if (window.lucide) lucide.createIcons();
  },

  openPayLoanSourcePicker() {
    const curVal = document.getElementById('pay-loan-source-account-input')?.value || '';
    this.openSourceAccountPicker({
      title: 'Tài Khoản Trích Tiền Trả Nợ',
      allowNone: true,
      noneLabel: 'Không trích tiền ví',
      noneDesc: 'Chỉ cập nhật dư nợ sổ vay, không trừ tiền ví',
      selectedId: curVal,
      onSelect: (selectedId) => {
        this.updatePayLoanSourceDisplay(selectedId);
      }
    });
  },

  async confirmPayLoan() {
    const id = document.getElementById('pay-loan-id-input')?.value;
    const amount = Number(document.getElementById('pay-loan-amount-input')?.value || 0);
    const sourceAccountId = document.getElementById('pay-loan-source-account-input')?.value || null;
    const dateStr = this.getDateInputValue('pay-loan-date-input');

    if (!id || amount <= 0) {
      showToast('Vui lòng nhập số tiền trả nợ hợp lệ', 'warning');
      this.openPayLoanKeypad();
      return;
    }

    try {
      await payLoan(id, amount, sourceAccountId, dateStr);
      showToast('Đã ghi nhận trả nợ gốc sổ vay thành công!', 'success');
      this.closePayLoanModal();
      await this.render();
      if (window.app && typeof window.app.refreshAll === 'function') {
        await window.app.refreshAll();
      }
    } catch (e) {
      console.error(e);
      showToast('Lỗi: ' + e.message, 'error');
    }
  },

  async deleteLoanItem(id) {
    const l = await db.loans.get(Number(id));
    if (!l) return;
    if (confirm(`Bạn có chắc chắn muốn xóa sổ vay "${l.name}"?\nHành động này không thể hoàn tác.`)) {
      await deleteLoan(id);
      showToast('Đã xóa sổ vay thành công', 'success');
      await this.render();
    }
  },

  /* ==================== RENDER NET WORTH & 4 SECTIONS ==================== */
  async renderNetWorthHeader() {
    const netWorthData = await getNetWorth();

    const netWorthEl = document.getElementById('account-total-networth');
    if (netWorthEl) netWorthEl.textContent = `${new Intl.NumberFormat('vi-VN').format(netWorthData.netWorth)}đ`;

    const expEl = document.getElementById('networth-mini-expense');
    if (expEl) expEl.textContent = `${new Intl.NumberFormat('vi-VN').format(netWorthData.totalAccountBalance)}đ`;

    const savEl = document.getElementById('networth-mini-savings');
    if (savEl) savEl.textContent = `${new Intl.NumberFormat('vi-VN').format(netWorthData.totalSavings)}đ`;

    const accEl = document.getElementById('networth-mini-accumulations');
    if (accEl) accEl.textContent = `${new Intl.NumberFormat('vi-VN').format(netWorthData.totalAccumulations)}đ`;

    const astEl = document.getElementById('networth-mini-assets');
    if (astEl) astEl.textContent = `${new Intl.NumberFormat('vi-VN').format(netWorthData.totalAssets)}đ`;

    const loanEl = document.getElementById('networth-mini-loans');
    if (loanEl) loanEl.textContent = `${new Intl.NumberFormat('vi-VN').format(netWorthData.totalLoans || 0)}đ`;

    const labelLoan = document.getElementById('label-loans-total');
    if (labelLoan) labelLoan.textContent = `${new Intl.NumberFormat('vi-VN').format(netWorthData.totalLoans || 0)}đ`;

    const badgeLoan = document.getElementById('badge-loans-count');
    if (badgeLoan && db.loans) {
      const activeLoanCount = await db.loans.where('isDeleted').equals(0).and(l => l.status !== 'settled').count();
      badgeLoan.textContent = activeLoanCount;
    }

    // Section subtotal labels
    const labelExp = document.getElementById('label-expense-acc-total');
    if (labelExp) labelExp.textContent = `${new Intl.NumberFormat('vi-VN').format(netWorthData.totalAccountBalance)}đ`;

    const labelSav = document.getElementById('label-savings-total');
    if (labelSav) labelSav.textContent = `${new Intl.NumberFormat('vi-VN').format(netWorthData.totalSavings)}đ`;

    const labelAcc = document.getElementById('label-accumulations-total');
    if (labelAcc) labelAcc.textContent = `${new Intl.NumberFormat('vi-VN').format(netWorthData.totalAccumulations)}đ`;

    const labelAst = document.getElementById('label-assets-total');
    if (labelAst) labelAst.textContent = `${new Intl.NumberFormat('vi-VN').format(netWorthData.totalAssets)}đ`;

    const badgeAst = document.getElementById('badge-assets-count');
    if (badgeAst) {
      const astCount = await db.assets.where('isDeleted').equals(0).count();
      badgeAst.textContent = astCount;
    }
  },

  async renderSavings() {
    const container = document.getElementById('savings-list-container');
    const badgeCount = document.getElementById('badge-savings-count');
    const settledSec = document.getElementById('settled-savings-section');
    const settledList = document.getElementById('settled-savings-list');
    const settledLabel = document.getElementById('settled-savings-toggle-label');
    const settledChevron = document.getElementById('settled-savings-toggle-icon');

    if (!container) return;

    const allSavings = await db.savings.where('isDeleted').equals(0).toArray();
    const activeSavings = allSavings.filter(s => s.status === 'active');
    const settledSavings = allSavings.filter(s => s.status === 'settled');

    if (badgeCount) badgeCount.textContent = activeSavings.length;

    if (activeSavings.length === 0) {
      container.innerHTML = `
        <div class="accounts-empty-card">
          <div class="empty-icon-wrap" style="background: rgba(14, 165, 233, 0.12); color: #0ea5e9;">
            <i data-lucide="piggy-bank" style="width: 22px; height: 22px;"></i>
          </div>
          <p class="empty-text">Chưa có sổ tiết kiệm nào</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    } else {
      container.innerHTML = activeSavings.map(s => {
        const prov = s.bankCode ? this.PROVIDERS.find(x => x.code === s.bankCode) : null;
        const dueText = s.dueDate ? `Đáo hạn: ${s.dueDate.split('-').reverse().join('/')}` : 'Không kỳ hạn';
        const expectedProfit = s.expectedInterest ? `+Lãi dự kiến: ${new Intl.NumberFormat('vi-VN').format(s.expectedInterest)}đ` : '';

        return `
          <div class="group-item-card" onclick="UIAccounts.openItemActionSheet('savings', ${s.id})" style="width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; overflow: hidden;">
            <div class="group-card-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; min-width: 0;">
              <div class="group-card-title-row" style="display: flex; align-items: center; gap: 8px; flex: 1 1 0%; min-width: 0; max-width: calc(100% - 36px); overflow: hidden;">
                <div class="group-card-icon-wrap" style="background: transparent; flex-shrink: 0;">
                  ${this.renderLogoBadge(prov || s.bankCode || { icon: 'piggy-bank', color: '#0ea5e9' }, 38)}
                </div>
                <div class="group-card-info-wrap" style="flex: 1 1 0%; min-width: 0; max-width: 100%; width: 0; overflow: hidden; box-sizing: border-box;">
                  <div class="group-card-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; width: 100%; max-width: 100%; font-weight: 700;" title="${escapeHTML(s.name)}">${escapeHTML(s.name)}</div>
                  <div class="group-card-sub" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    <span class="rate-badge">${s.interestRate || 0}%/năm</span>
                    <span class="term-badge">${s.termMonths ? s.termMonths + ' tháng' : 'Không kỳ hạn'}</span>
                    ${s.excludeFromReport ? '<span class="account-badge exclude"><i data-lucide="eye-off" style="width:10px;height:10px;"></i> Ẩn báo cáo</span>' : ''}
                  </div>
                </div>
              </div>
              <button type="button" class="btn-icon group-card-more-btn" onclick="event.stopPropagation(); UIAccounts.openItemActionSheet('savings', ${s.id})" title="Tùy chọn" style="flex-shrink: 0; width: 28px; height: 28px; min-width: 28px; border: none; background: transparent; padding: 0; display: inline-flex; align-items: center; justify-content: center;">
                <i data-lucide="more-vertical" style="width: 17px; height: 17px;"></i>
              </button>
            </div>

            <div class="group-card-body">
              <div>
                <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Tiền gửi ban đầu</span>
                <span class="group-card-amount stat-amount">${new Intl.NumberFormat('vi-VN').format(s.balance || s.depositAmount || 0)}đ</span>
              </div>
              <div class="group-card-stat">
                <span style="color: var(--text-secondary); font-size: 0.75rem;">${dueText}</span>
                <span class="group-card-stat-val stat-amount" style="color: var(--income); font-size: 0.78rem;">${expectedProfit}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Settled savings collapsible
    if (settledSec && settledList) {
      if (settledSavings.length === 0) {
        settledSec.style.display = 'none';
        settledList.innerHTML = '';
      } else {
        settledSec.style.display = 'block';
        if (settledLabel) settledLabel.textContent = `Sổ đã tất toán (${settledSavings.length})`;
        settledList.style.display = this.isSettledSavingsExpanded ? 'flex' : 'none';
        if (settledChevron) settledChevron.classList.toggle('rotated', this.isSettledSavingsExpanded);

        settledList.innerHTML = settledSavings.map(s => {
          const prov = s.bankCode ? this.PROVIDERS.find(x => x.code === s.bankCode) : null;
          const settleDateStr = s.settledDate ? s.settledDate.split('-').reverse().join('/') : '';

          return `
            <div class="group-item-card archived" onclick="UIAccounts.openItemActionSheet('savings', ${s.id})">
              <div class="group-card-header">
                <div class="group-card-title-row">
                  <div class="group-card-icon-wrap" style="background: transparent; opacity: 0.65;">
                    ${this.renderLogoBadge(prov || s.bankCode || { icon: 'piggy-bank', color: '#0ea5e9' }, 36)}
                  </div>
                  <div style="min-width: 0; flex: 1;">
                    <div class="group-card-name" style="color: var(--text-secondary);">${escapeHTML(s.name)}</div>
                    <div class="group-card-sub">
                      <span>Đã tất toán ${settleDateStr}</span>
                    </div>
                  </div>
                </div>
                <button type="button" class="btn-icon" onclick="event.stopPropagation(); UIAccounts.openItemActionSheet('savings', ${s.id})">
                  <i data-lucide="more-vertical" style="width: 17px; height: 17px;"></i>
                </button>
              </div>
              <div class="group-card-body">
                <div>
                  <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Thực nhận khi tất toán</span>
                  <span class="group-card-amount stat-amount" style="color: var(--income);">${new Intl.NumberFormat('vi-VN').format(s.finalAmount || s.balance || 0)}đ</span>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  },

  async renderAccumulations() {
    await this.cleanupDuplicateAccumulations();
    const container = document.getElementById('accumulations-list-container');
    const badgeCount = document.getElementById('badge-accumulations-count');
    if (!container) return;

    const list = await db.accumulations.where('isDeleted').equals(0).toArray();
    if (badgeCount) badgeCount.textContent = list.length;

    if (list.length === 0) {
      container.innerHTML = `
        <div class="accounts-empty-card">
          <div class="empty-icon-wrap" style="background: rgba(245, 158, 11, 0.12); color: #f59e0b;">
            <i data-lucide="target" style="width: 22px; height: 22px;"></i>
          </div>
          <p class="empty-text">Chưa có sổ tích lũy nào</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    } else {
      container.innerHTML = list.map(item => {
        const cur = item.currentAmount || 0;
        const target = item.targetAmount || 1;
        const percent = Math.min(Math.round((cur / target) * 100), 100);
        const targetDateStr = item.targetDate ? `Hạn chót: ${item.targetDate.split('-').reverse().join('/')}` : 'Không giới hạn';

        return `
          <div class="group-item-card" onclick="UIAccounts.openItemActionSheet('accumulation', ${item.id})" style="width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; overflow: hidden;">
            <div class="group-card-header">
              <div class="group-card-title-row">
                <div class="group-card-icon-wrap" style="background: rgba(245, 158, 11, 0.12); color: #f59e0b;">
                  <i data-lucide="target" style="width: 20px; height: 20px;"></i>
                </div>
                <div class="group-card-info-wrap" style="flex: 1 1 0%; min-width: 0; max-width: 100%; width: 0; overflow: hidden; box-sizing: border-box;">
                  <div class="group-card-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; width: 100%; max-width: 100%; font-weight: 700;" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</div>
                  <div class="group-card-sub">
                    <span>${targetDateStr}</span>
                    ${item.hasRecurring ? '<span class="term-badge"><i data-lucide="repeat" style="width:10px;height:10px;"></i> Định kỳ</span>' : ''}
                  </div>
                </div>
              </div>
              <button type="button" class="btn-icon" onclick="event.stopPropagation(); UIAccounts.openDepositAccModal(${item.id}, 'deposit')" title="Nạp thêm tiền">
                <i data-lucide="plus-circle" style="width: 19px; height: 19px; color: #10b981;"></i>
              </button>
            </div>

            <!-- Progress Bar -->
            <div class="acc-progress-wrap">
              <div class="acc-progress-header">
                <span style="color: var(--text-muted); font-size: 0.74rem;">Tiến độ tích lũy</span>
                <span class="acc-progress-percent">${percent}%</span>
              </div>
              <div class="acc-progress-track">
                <div class="acc-progress-bar" style="width: ${percent}%;"></div>
              </div>
            </div>

            <div class="group-card-body" style="margin-top: 4px;">
              <div>
                <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Hiện có</span>
                <span class="group-card-amount stat-amount" style="color: #f59e0b;">${new Intl.NumberFormat('vi-VN').format(cur)}đ</span>
              </div>
              <div class="group-card-stat">
                <span style="color: var(--text-muted); font-size: 0.72rem;">Mục tiêu</span>
                <span class="group-card-stat-val stat-amount" style="color: var(--text-primary); font-size: 0.86rem;">${new Intl.NumberFormat('vi-VN').format(target)}đ</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  },

  async renderAssets() {
    const container = document.getElementById('assets-list-container');
    const badgeAst = document.getElementById('badge-assets-count');
    if (!container) return;

    const list = await db.assets.where('isDeleted').equals(0).toArray();
    if (badgeAst) badgeAst.textContent = list.length;

    if (list.length === 0) {
      container.innerHTML = `
        <div class="accounts-empty-card">
          <div class="empty-icon-wrap" style="background: rgba(168, 85, 247, 0.12); color: #a855f7;">
            <i data-lucide="gem" style="width: 22px; height: 22px;"></i>
          </div>
          <p class="empty-text">Chưa có tài sản nào</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const typeMeta = {
      real_estate: { icon: 'home', color: '#10b981', label: 'Bất động sản' },
      precious_metal: { icon: 'sparkles', color: '#f59e0b', label: 'Kim loại quý' },
      foreign_currency: { icon: 'dollar-sign', color: '#0ea5e9', label: 'Ngoại tệ' },
      crypto: { icon: 'coins', color: '#f59e0b', label: 'Tiền điện tử (Crypto)' },
      other: { icon: 'package', color: '#8b5cf6', label: 'Tài sản khác' }
    };

    const typeOrder = ['real_estate', 'precious_metal', 'foreign_currency', 'crypto', 'other'];

    // Nhóm tài sản theo từng loại (Asset Type)
    const grouped = {};
    for (const item of list) {
      const t = item.assetType || 'other';
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(item);
    }

    let html = '';
    for (const t of typeOrder) {
      const items = grouped[t];
      if (!items || items.length === 0) continue;

      const meta = typeMeta[t] || typeMeta.other;

      let groupCurTotal = 0;
      let groupBuyTotal = 0;

      const itemsHtml = items.map(item => {
        const qty = item.quantity || 1;
        const totalCur = Math.round(qty * (item.currentPrice || 0));
        const totalBuy = Math.round((qty * (item.buyPrice || 0)) + (item.extraCosts || 0));
        const pnl = Math.round(totalCur - totalBuy);
        const pnlPct = totalBuy > 0 ? ((pnl / totalBuy) * 100).toFixed(1) : 0;
        const isProf = pnl >= 0;
        const sign = isProf ? '+' : '';

        groupCurTotal += totalCur;
        groupBuyTotal += totalBuy;

        return `
          <div class="group-item-card" onclick="UIAccounts.openItemActionSheet('asset', ${item.id})" style="width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; overflow: hidden;">
            <div class="group-card-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; overflow: hidden;">
              <div class="group-card-title-row" style="display: flex; align-items: center; gap: 8px; flex: 1 1 0%; min-width: 0; max-width: calc(100% - 36px); overflow: hidden; box-sizing: border-box;">
                <div class="group-card-icon-wrap" style="background: ${meta.color}22; color: ${meta.color}; flex-shrink: 0;">
                  <i data-lucide="${meta.icon}" style="width: 20px; height: 20px;"></i>
                </div>
                <div class="group-card-info-wrap" style="flex: 1 1 0%; min-width: 0; max-width: 100%; width: 0; overflow: hidden; box-sizing: border-box;">
                  <div class="group-card-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; width: 100%; max-width: 100%; min-width: 0; font-weight: 700;" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</div>
                  <div class="group-card-sub" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0;">
                    <span class="term-badge" style="flex-shrink: 0;">${meta.label}</span>
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;">${qty} ${escapeHTML(item.unit || '')}</span>
                    ${item.location ? `<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;">• ${escapeHTML(item.location)}</span>` : ''}
                  </div>
                </div>
              </div>
              <button type="button" class="btn-icon group-card-more-btn" onclick="event.stopPropagation(); UIAccounts.openItemActionSheet('asset', ${item.id})" title="Tùy chọn" style="flex-shrink: 0; width: 28px; height: 28px; min-width: 28px; border: none; background: transparent; padding: 0; display: inline-flex; align-items: center; justify-content: center;">
                <i data-lucide="more-vertical" style="width: 17px; height: 17px;"></i>
              </button>
            </div>

            <div class="group-card-body" style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 6px; width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; overflow: hidden;">
              <div style="min-width: 0; flex: 1 1 auto; overflow: hidden;">
                <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Giá trị thị trường</span>
                <span class="group-card-amount stat-amount" style="color: #a855f7; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${new Intl.NumberFormat('vi-VN').format(totalCur)}đ</span>
              </div>
              <div class="group-card-stat" style="min-width: 0; flex-shrink: 0; max-width: 55%; overflow: hidden; text-align: right;">
                <span class="pnl-badge ${isProf ? 'profit' : 'loss'} stat-amount" style="display: inline-block; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${sign}${new Intl.NumberFormat('vi-VN').format(pnl)}đ (${sign}${pnlPct}%)</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      const groupPnl = Math.round(groupCurTotal - groupBuyTotal);
      const groupPnlPct = groupBuyTotal > 0 ? ((groupPnl / groupBuyTotal) * 100).toFixed(1) : 0;
      const isGroupProf = groupPnl >= 0;
      const groupSign = isGroupProf ? '+' : '';

      html += `
        <div class="asset-type-group" style="width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; overflow: hidden;">
          <div class="asset-type-header" style="display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; overflow: hidden;">
            <div class="asset-type-title-wrap" style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1 1 0%; max-width: calc(100% - 100px); overflow: hidden;">
              <div class="asset-type-icon" style="background: ${meta.color}22; color: ${meta.color}; flex-shrink: 0;">
                <i data-lucide="${meta.icon}" style="width: 16px; height: 16px;"></i>
              </div>
              <div class="asset-type-name-info" style="display: flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden;">
                <span class="asset-type-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${meta.label}</span>
                <span class="group-count-badge" style="flex-shrink: 0;">${items.length}</span>
              </div>
            </div>
            <div class="asset-type-header-stats" style="flex-shrink: 0; max-width: 95px; overflow: hidden; text-align: right; display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
              <span class="asset-type-subtotal stat-amount" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; display: inline-block;">${new Intl.NumberFormat('vi-VN').format(groupCurTotal)}đ</span>
              ${groupBuyTotal > 0 ? `
                <span class="asset-type-pnl stat-amount ${isGroupProf ? 'profit' : 'loss'}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">
                  ${groupSign}${new Intl.NumberFormat('vi-VN').format(groupPnl)}đ
                </span>
              ` : ''}
            </div>
          </div>
          <div class="asset-type-items-list" style="width: 100%; max-width: 100%; min-width: 0; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box; overflow: hidden;">
            ${itemsHtml}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

    /* ==================== RENDER DANH SÁCH TÀI KHOẢN ==================== */
  async render() {
    const container = document.getElementById('accounts-list-container');
    if (!container) return;

    if (typeof deduplicateAccounts === 'function') {
      await deduplicateAccounts();
    }

    const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
    accounts.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));

    const activeAccounts = accounts.filter(a => !a.isArchived);
    const badgeExpenseCount = document.getElementById('badge-expense-acc-count');
    if (badgeExpenseCount) badgeExpenseCount.textContent = activeAccounts.length;
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
        <div class="accounts-empty-card">
          <div class="empty-icon-wrap" style="background: rgba(16, 185, 129, 0.12); color: #10b981;">
            <i data-lucide="wallet" style="width: 22px; height: 22px;"></i>
          </div>
          <p class="empty-text">Chưa có tài khoản chi tiêu nào</p>
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
                ${this.renderLogoBadge(a, 36)}
              </div>
              <div class="account-info">
                <div class="account-name-row" style="display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; min-width: 0; overflow: hidden;">
                  <span class="account-name" title="${escapeHTML(a.name)}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; flex: 1 1 0%; min-width: 0; max-width: 100%; font-weight: 700;">${escapeHTML(a.name)}</span>
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
                <span class="account-balance stat-amount ${a.balance < 0 ? 'expense-text' : ''}">${new Intl.NumberFormat('vi-VN').format(a.balance)}${a.currency === 'USD' ? '$' : (a.currency === 'EUR' ? '€' : (a.currency === 'JPY' ? '¥' : 'đ'))}</span>
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
                  ${this.renderLogoBadge(a, 36)}
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
                  <span class="account-balance stat-amount" style="color: var(--text-muted);">${new Intl.NumberFormat('vi-VN').format(a.balance)}${a.currency === 'USD' ? '$' : (a.currency === 'EUR' ? '€' : (a.currency === 'JPY' ? '¥' : 'đ'))}</span>
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

    // 3. Render Net Worth Header & 3 New Groups
    await this.renderNetWorthHeader();
    await this.renderSavings();
    await this.renderAccumulations();
    await this.renderLoans();
    await this.renderAssets();

    if (window.app && typeof window.app.applyPrivacyMode === 'function') {
      window.app.applyPrivacyMode(window.app.isPrivacyMode);
    }

    if (window.lucide) lucide.createIcons();
  }
};

window.UIAccounts = UIAccounts;
