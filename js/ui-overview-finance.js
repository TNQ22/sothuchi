/**
 * SỔ THU CHI - TỔNG QUAN TÀI CHÍNH HIỆN CÓ
 * Hiển thị Tài chính hiện có (Tổng có | Tổng nợ), xem chi tiết các ví, tài khoản ngân hàng,
 * tài khoản đầu tư (VND, USD), sổ tiết kiệm, tài sản và nợ phải trả.
 */

const UIOverviewFinance = {
  currentTab: 'all', // 'all' | 'assets' | 'debts'

  async init() {
    this.renderDashboardCard();
    this.initSwipeBack();
  },

  initSwipeBack() {
    const view = document.getElementById('view-finance-detail');
    if (!view || this._swipeBackBound) return;
    this._swipeBackBound = true;

    let startX = 0;
    let startY = 0;
    let isTracking = false;

    view.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      // Cho phép vuốt từ mép trái màn hình (tối đa 35% chiều rộng hoặc 120px)
      if (touch.clientX < Math.max(100, window.innerWidth * 0.35)) {
        startX = touch.clientX;
        startY = touch.clientY;
        isTracking = true;
      }
    }, { passive: true });

    view.addEventListener('touchmove', (e) => {
      if (!isTracking || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      // Nếu kéo dọc nhiều hơn vuốt ngang thì hủy thao tác vuốt trở về
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 20) {
        isTracking = false;
      }
    }, { passive: true });

    view.addEventListener('touchend', (e) => {
      if (!isTracking) return;
      isTracking = false;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);

      // Nếu vuốt ngang sang phải tối thiểu 60px và góc chéo < 60px
      if (deltaX > 60 && deltaY < 60) {
        if (window.app && typeof window.app.switchView === 'function') {
          window.app.switchView('dashboard');
        }
      }
    }, { passive: true });
  },

  async renderDashboardCard() {
    try {
      const nw = await getNetWorth();
      const currentFinanceEl = document.getElementById('stat-finance-current');
      const totalAssetsEl = document.getElementById('stat-finance-total-assets');
      const totalDebtsEl = document.getElementById('stat-finance-total-debts');

      // Tổng có: Tất cả các ví/tài khoản (ngân hàng, đầu tư, tiết kiệm, tích lũy, tài sản) như cũ
      const totalCo = nw.grandTotalAssets || 0;
      // Tổng nợ: Sổ nợ thôi (mượn nợ cá nhân + vay ngân hàng)
      const totalNo = nw.totalBorrow || 0;
      // Tài chính hiện có: Tài sản ròng
      const taiChinhHienCo = nw.netWorth !== undefined ? nw.netWorth : (totalCo - totalNo);

      if (currentFinanceEl) {
        currentFinanceEl.textContent = `${new Intl.NumberFormat('vi-VN').format(taiChinhHienCo)}đ`;
        // Riêng Tài chính hiện có: Dương thì màu trắng, Âm thì màu đỏ
        if (taiChinhHienCo < 0) {
          currentFinanceEl.style.color = '#f43f5e';
          currentFinanceEl.classList.add('debt-text');
        } else {
          currentFinanceEl.style.color = '#ffffff';
          currentFinanceEl.classList.remove('debt-text');
        }
      }

      if (totalAssetsEl) {
        totalAssetsEl.textContent = `${new Intl.NumberFormat('vi-VN').format(totalCo)}đ`;
        // Dương thì xanh ngọc, Âm thì màu đỏ
        if (totalCo < 0) {
          totalAssetsEl.style.color = '#f43f5e';
          totalAssetsEl.classList.remove('income-text');
          totalAssetsEl.classList.add('debt-text');
        } else {
          totalAssetsEl.style.color = '#10b981';
          totalAssetsEl.classList.remove('debt-text');
          totalAssetsEl.classList.add('income-text');
        }
      }

      if (totalDebtsEl) {
        totalDebtsEl.textContent = `${new Intl.NumberFormat('vi-VN').format(totalNo)}đ`;
        // Nợ > 0 thì màu đỏ, nợ = 0 thì màu xanh ngọc
        if (totalNo > 0) {
          totalDebtsEl.style.color = '#f43f5e';
          totalDebtsEl.classList.remove('income-text');
          totalDebtsEl.classList.add('debt-text');
        } else {
          totalDebtsEl.style.color = '#10b981';
          totalDebtsEl.classList.remove('debt-text');
          totalDebtsEl.classList.add('income-text');
        }
      }

      if (window.app && window.app.isPrivacyMode) {
        window.app.applyPrivacyMode(true);
      }
      if (window.lucide) lucide.createIcons();
    } catch (e) {
      console.warn('[UIOverviewFinance] renderDashboardCard error:', e);
    }
  },

  openDetailPage() {
    if (window.app) {
      window.app.switchView('finance-detail');
      this.initSwipeBack();
      this.renderDetail();
    }
  },

  setFilterTab(tab) {
    this.currentTab = tab;
    const tabBtns = document.querySelectorAll('.finance-filter-tab');
    tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    const assetsSection = document.getElementById('finance-detail-assets-section');
    const debtsSection = document.getElementById('finance-detail-debts-section');

    if (tab === 'assets') {
      if (assetsSection) assetsSection.style.display = 'block';
      if (debtsSection) debtsSection.style.display = 'none';
    } else if (tab === 'debts') {
      if (assetsSection) assetsSection.style.display = 'none';
      if (debtsSection) debtsSection.style.display = 'block';
    } else {
      if (assetsSection) assetsSection.style.display = 'block';
      if (debtsSection) debtsSection.style.display = 'block';
    }
  },

  async renderDetail() {
    try {
      this.initSwipeBack();
      const nw = await getNetWorth();
      const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
      const activeAccounts = accounts.filter(a => !a.isArchived);

      // 1. Phân loại tài khoản Tổng Có: toàn bộ các tài khoản ngân hàng, tiền mặt, ví điện tử như cũ
      const bankAndCashAccounts = activeAccounts;

      // - Tài khoản đầu tư & Tài sản (Crypto, Ngoại tệ USD/EUR, Vàng bạc, BĐS...)
      let assets = [];
      if (db.assets) {
        const rawAssets = await db.assets.where('isDeleted').equals(0).toArray();
        assets = rawAssets.filter(a => a.status !== 'liquidated');
      }

      // - Sổ tiết kiệm & Sổ tích lũy
      let savings = [];
      if (db.savings) {
        const rawSavings = await db.savings.where('isDeleted').equals(0).toArray();
        savings = rawSavings.filter(s => s.status !== 'settled');
      }

      let accumulations = [];
      if (db.accumulations) {
        const rawAcc = await db.accumulations.where('isDeleted').equals(0).toArray();
        accumulations = rawAcc.filter(a => !a._isSharedItem || a.includeInReport);
      }

      // 2. Phân loại Tổng Nợ: Sổ nợ thôi (Đi vay / Mượn nợ cá nhân + Sổ vay ngân hàng) và Khoản cho vay
      const debts = await db.debts.where('isDeleted').equals(0).toArray();
      const lendDebts = debts.filter(d => d.type === 'lend' && d.status !== 'settled');
      const borrowDebts = debts.filter(d => d.type === 'borrow' && d.status !== 'settled');

      // - Sổ vay ngân hàng (Loans)
      let loans = [];
      if (db.loans) {
        const rawLoans = await db.loans.where('isDeleted').equals(0).toArray();
        loans = rawLoans.filter(l => l.status !== 'settled');
      }

      // 3. Tính toán các con số
      // Tổng có trong chi tiết = Tổng các tài khoản (ví, tiết kiệm, tích lũy, đầu tư) + Khoản cho vay (nợ cần thu)
      const totalCo = (nw.grandTotalAssets || 0) + (nw.totalLend || 0);
      const totalNo = nw.totalBorrow || 0;
      const taiChinhHienCo = nw.netWorth !== undefined ? nw.netWorth : (totalCo - totalNo);

      // Cập nhật Header Hero Card trong trang chi tiết
      const detailMainVal = document.getElementById('finance-detail-main-val');
      const detailTotalAssets = document.getElementById('finance-detail-total-assets');
      const detailTotalDebts = document.getElementById('finance-detail-total-debts');

      if (detailMainVal) {
        detailMainVal.textContent = `${new Intl.NumberFormat('vi-VN').format(taiChinhHienCo)}đ`;
        if (taiChinhHienCo < 0) {
          detailMainVal.style.color = '#f43f5e';
          detailMainVal.classList.add('debt-text');
        } else {
          detailMainVal.style.color = '#ffffff';
          detailMainVal.classList.remove('debt-text');
        }
      }
      if (detailTotalAssets) {
        detailTotalAssets.textContent = `${new Intl.NumberFormat('vi-VN').format(totalCo)}đ`;
        if (totalCo < 0) {
          detailTotalAssets.style.color = '#f43f5e';
          detailTotalAssets.classList.remove('income-text');
          detailTotalAssets.classList.add('debt-text');
        } else {
          detailTotalAssets.style.color = '#10b981';
          detailTotalAssets.classList.remove('debt-text');
          detailTotalAssets.classList.add('income-text');
        }
      }
      if (detailTotalDebts) {
        detailTotalDebts.textContent = `${new Intl.NumberFormat('vi-VN').format(totalNo)}đ`;
        if (totalNo > 0) {
          detailTotalDebts.style.color = '#f43f5e';
          detailTotalDebts.classList.remove('income-text');
          detailTotalDebts.classList.add('debt-text');
        } else {
          detailTotalDebts.style.color = '#10b981';
          detailTotalDebts.classList.remove('debt-text');
          detailTotalDebts.classList.add('income-text');
        }
      }

      // Cập nhật Subtotals
      const subtotalAssetsEl = document.getElementById('finance-detail-assets-subtotal');
      if (subtotalAssetsEl) {
        subtotalAssetsEl.textContent = `${new Intl.NumberFormat('vi-VN').format(totalCo)}đ`;
        subtotalAssetsEl.classList.toggle('is-negative', totalCo < 0);
      }

      const subtotalDebtsEl = document.getElementById('finance-detail-debts-subtotal');
      if (subtotalDebtsEl) {
        subtotalDebtsEl.textContent = `${new Intl.NumberFormat('vi-VN').format(totalNo)}đ`;
        subtotalDebtsEl.classList.toggle('is-zero', totalNo === 0);
      }

      // 4. Render Danh Sách TỔNG CÓ
      this.renderBankAndCashList(bankAndCashAccounts);
      this.renderInvestmentsList(assets);
      this.renderSavingsAndAccList(savings, accumulations);
      this.renderLendDebtsList(lendDebts);

      // 5. Render Danh Sách TỔNG NỢ (Sổ nợ thôi)
      this.renderDebtsList(borrowDebts);
      this.renderLoansList(loans);

      // Reapply privacy mode if active
      if (window.app && window.app.isPrivacyMode) {
        window.app.applyPrivacyMode(true);
      }

      if (window.lucide) lucide.createIcons();
    } catch (e) {
      console.warn('[UIOverviewFinance] renderDetail error:', e);
    }
  },

  renderBankAndCashList(accounts) {
    const container = document.getElementById('finance-list-bank-accounts');
    if (!container) return;

    if (!accounts || accounts.length === 0) {
      container.innerHTML = `
        <div class="empty-list-placeholder-sm">
          <span>Chưa có ví hoặc tài khoản chi tiêu nào</span>
        </div>
      `;
      return;
    }

    const html = accounts.map(a => {
      const prov = window.UIAccounts && window.UIAccounts.PROVIDERS ? window.UIAccounts.PROVIDERS.find(p => p.code === a.providerCode || p.code === a.bankCode) : null;
      const logoHtml = window.UIAccounts ? window.UIAccounts.renderLogoBadge(a, 38) : `<div class="account-icon-fallback"><i data-lucide="wallet"></i></div>`;
      const cur = a.currency || 'VND';
      const isUSD = cur === 'USD';
      const curSymbol = isUSD ? '$' : (cur === 'EUR' ? '€' : (cur === 'JPY' ? '¥' : 'đ'));
      const balanceFormatted = `${new Intl.NumberFormat('vi-VN').format(a.balance)}${curSymbol}`;

      return `
        <div class="finance-item-card" onclick="UIOverviewFinance.handleAccountClick(${a.id})" role="button" tabindex="0">
          <div class="finance-item-icon-wrap">
            ${logoHtml}
          </div>
          <div class="finance-item-info">
            <div class="finance-item-title-row">
              <span class="finance-item-name" title="${escapeHTML(a.name)}">${escapeHTML(a.name)}</span>
              ${cur !== 'VND' ? `<span class="finance-currency-tag">${cur}</span>` : ''}
            </div>
            <div class="finance-item-sub-row">
              <span class="finance-item-desc">${a.description ? escapeHTML(a.description) : (prov ? escapeHTML(prov.name) : 'Tài khoản chi tiêu')}</span>
            </div>
          </div>
          <div class="finance-item-amount-wrap">
            <span class="finance-item-amount stat-amount ${a.balance < 0 ? 'expense-text' : 'income-text'}">${balanceFormatted}</span>
            <span class="finance-item-action-hint">Lịch sử <i data-lucide="chevron-right" style="width: 12px; height: 12px; vertical-align: middle;"></i></span>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  },

  renderInvestmentsList(assets) {
    const container = document.getElementById('finance-list-investments');
    if (!container) return;

    if (!assets || assets.length === 0) {
      container.innerHTML = `
        <div class="empty-list-placeholder-sm">
          <span>Chưa có tài khoản đầu tư, ngoại tệ hoặc tài sản</span>
        </div>
      `;
      return;
    }

    const typeLabels = {
      foreign_currency: { label: 'Ngoại tệ', icon: 'dollar-sign', color: '#0ea5e9' },
      crypto: { label: 'Tiền số / Crypto', icon: 'coins', color: '#f59e0b' },
      precious_metal: { label: 'Vàng / Bạc', icon: 'gem', color: '#eab308' },
      real_estate: { label: 'Bất động sản', icon: 'home', color: '#10b981' },
      other: { label: 'Tài sản khác', icon: 'briefcase', color: '#8b5cf6' }
    };

    const html = assets.map(a => {
      const typeInfo = typeLabels[a.assetType] || typeLabels.other;
      const qty = a.quantity !== undefined && !isNaN(Number(a.quantity)) ? Number(a.quantity) : 1;
      const curP = a.currentPrice !== undefined && !isNaN(Number(a.currentPrice)) ? Number(a.currentPrice) : (a.buyPrice || 0);
      const totalValVnd = Math.round(qty * curP);
      const isUsd = a.subType === 'USD' || (a.unit && a.unit.toUpperCase() === 'USD');
      const qtyText = a.quantity ? `${new Intl.NumberFormat('vi-VN').format(a.quantity)} ${a.unit || a.subType || ''}` : '';

      return `
        <div class="finance-item-card" onclick="UIOverviewFinance.handleAssetClick(${a.id})" role="button" tabindex="0">
          <div class="finance-item-icon-wrap" style="background: ${typeInfo.color}18; color: ${typeInfo.color};">
            <i data-lucide="${typeInfo.icon}"></i>
          </div>
          <div class="finance-item-info">
            <div class="finance-item-title-row">
              <span class="finance-item-name" title="${escapeHTML(a.name)}">${escapeHTML(a.name)}</span>
              ${isUsd ? `<span class="finance-currency-tag">USD</span>` : ''}
              <span class="finance-type-badge">${typeInfo.label}</span>
            </div>
            <div class="finance-item-sub-row">
              <span class="finance-item-desc">${qtyText ? `${qtyText} • ` : ''}${a.currentPrice ? `Giá: ${new Intl.NumberFormat('vi-VN').format(a.currentPrice)}đ` : ''}</span>
            </div>
          </div>
          <div class="finance-item-amount-wrap">
            <span class="finance-item-amount stat-amount income-text">${new Intl.NumberFormat('vi-VN').format(totalValVnd)}đ</span>
            ${isUsd && a.quantity ? `<span class="finance-item-sub-val stat-amount">$${new Intl.NumberFormat('en-US').format(a.quantity)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  },

  renderSavingsAndAccList(savings, accumulations) {
    const container = document.getElementById('finance-list-savings-acc');
    if (!container) return;

    const totalItems = (savings?.length || 0) + (accumulations?.length || 0);
    if (totalItems === 0) {
      container.innerHTML = `
        <div class="empty-list-placeholder-sm">
          <span>Chưa có sổ tiết kiệm hoặc sổ tích lũy</span>
        </div>
      `;
      return;
    }

    let html = '';

    // Sổ tiết kiệm
    if (savings && savings.length > 0) {
      html += savings.map(s => {
        const prov = s.bankCode && window.UIAccounts && window.UIAccounts.PROVIDERS ? window.UIAccounts.PROVIDERS.find(p => p.code === s.bankCode) : null;
        const logoHtml = window.UIAccounts ? window.UIAccounts.renderLogoBadge(prov || s.bankCode || { icon: 'piggy-bank', color: '#0ea5e9' }, 38) : `<div class="account-icon-fallback"><i data-lucide="piggy-bank"></i></div>`;
        const bal = s.balance !== undefined ? s.balance : (s.depositAmount || 0);

        return `
          <div class="finance-item-card" onclick="UIOverviewFinance.handleSavingsClick(${s.id})" role="button" tabindex="0">
            <div class="finance-item-icon-wrap">
              ${logoHtml}
            </div>
            <div class="finance-item-info">
              <div class="finance-item-title-row">
                <span class="finance-item-name" title="${escapeHTML(s.name)}">${escapeHTML(s.name)}</span>
                <span class="finance-type-badge">Tiết kiệm</span>
              </div>
              <div class="finance-item-sub-row">
                <span class="finance-item-desc">${s.interestRate ? `Lãi ${s.interestRate}%/năm • ` : ''}${s.dueDate ? `Đáo hạn: ${s.dueDate}` : 'Không kỳ hạn'}</span>
              </div>
            </div>
            <div class="finance-item-amount-wrap">
              <span class="finance-item-amount stat-amount income-text">${new Intl.NumberFormat('vi-VN').format(bal)}đ</span>
              <span class="finance-item-action-hint">Chi tiết <i data-lucide="chevron-right" style="width: 12px; height: 12px; vertical-align: middle;"></i></span>
            </div>
          </div>
        `;
      }).join('');
    }

    // Sổ tích lũy
    if (accumulations && accumulations.length > 0) {
      html += accumulations.map(a => {
        const bal = a.currentAmount || 0;
        const target = a.targetAmount || 0;
        const pct = target > 0 ? Math.min(100, Math.round((bal / target) * 100)) : 0;

        return `
          <div class="finance-item-card" onclick="UIOverviewFinance.handleAccumulationClick(${a.id})" role="button" tabindex="0">
            <div class="finance-item-icon-wrap" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">
              <i data-lucide="target"></i>
            </div>
            <div class="finance-item-info">
              <div class="finance-item-title-row">
                <span class="finance-item-name" title="${escapeHTML(a.name)}">${escapeHTML(a.name)}</span>
                <span class="finance-type-badge">Tích lũy</span>
              </div>
              <div class="finance-item-sub-row">
                <span class="finance-item-desc">Đạt ${pct}% ${target ? `(Mục tiêu: ${new Intl.NumberFormat('vi-VN').format(target)}đ)` : ''}</span>
              </div>
            </div>
            <div class="finance-item-amount-wrap">
              <span class="finance-item-amount stat-amount income-text">${new Intl.NumberFormat('vi-VN').format(bal)}đ</span>
              <span class="finance-item-action-hint">Chi tiết <i data-lucide="chevron-right" style="width: 12px; height: 12px; vertical-align: middle;"></i></span>
            </div>
          </div>
        `;
      }).join('');
    }

    container.innerHTML = html;
  },

  renderDebtsList(debts) {
    const container = document.getElementById('finance-list-debts');
    if (!container) return;

    if (!debts || debts.length === 0) {
      container.innerHTML = `
        <div class="empty-list-placeholder-sm">
          <span>Không có khoản nợ cá nhân cần trả</span>
        </div>
      `;
      return;
    }

    const html = debts.map(d => {
      const initial = (d.personName || 'N').trim().charAt(0).toUpperCase();

      return `
        <div class="finance-item-card debt-card-item" onclick="UIOverviewFinance.handleDebtClick(${d.id})" role="button" tabindex="0">
          <div class="finance-item-icon-wrap" style="background: rgba(244, 63, 94, 0.15); color: #f43f5e; font-weight: 700;">
            ${escapeHTML(initial)}
          </div>
          <div class="finance-item-info">
            <div class="finance-item-title-row">
              <span class="finance-item-name" title="${escapeHTML(d.personName)}">Chủ nợ: ${escapeHTML(d.personName)}</span>
              <span class="finance-type-badge debt-badge">Nợ phải trả</span>
            </div>
            <div class="finance-item-sub-row">
              <span class="finance-item-desc">${d.dueDate ? `Hạn trả: ${d.dueDate}` : 'Chưa có ngày hẹn'} ${d.note ? `• ${escapeHTML(d.note)}` : ''}</span>
            </div>
          </div>
          <div class="finance-item-amount-wrap">
            <span class="finance-item-amount stat-amount debt-text">-${new Intl.NumberFormat('vi-VN').format(d.remainingAmount)}đ</span>
            <span class="finance-item-action-hint">Trả nợ <i data-lucide="chevron-right" style="width: 12px; height: 12px; vertical-align: middle;"></i></span>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  },

  renderLoansList(loans) {
    const container = document.getElementById('finance-list-loans');
    if (!container) return;

    if (!loans || loans.length === 0) {
      container.innerHTML = `
        <div class="empty-list-placeholder-sm">
          <span>Không có sổ vay ngân hàng</span>
        </div>
      `;
      return;
    }

    const html = loans.map(l => {
      const prov = l.bankCode && window.UIAccounts && window.UIAccounts.PROVIDERS ? window.UIAccounts.PROVIDERS.find(p => p.code === l.bankCode) : null;
      const logoHtml = window.UIAccounts ? window.UIAccounts.renderLogoBadge(prov || l.bankCode || { icon: 'badge-percent', color: '#ef4444' }, 38) : `<div class="account-icon-fallback"><i data-lucide="badge-percent"></i></div>`;
      const rem = l.remainingAmount !== undefined ? l.remainingAmount : (l.loanAmount || 0);

      return `
        <div class="finance-item-card debt-card-item" onclick="UIOverviewFinance.handleLoanClick(${l.id})" role="button" tabindex="0">
          <div class="finance-item-icon-wrap">
            ${logoHtml}
          </div>
          <div class="finance-item-info">
            <div class="finance-item-title-row">
              <span class="finance-item-name" title="${escapeHTML(l.name)}">${escapeHTML(l.name)}</span>
              <span class="finance-type-badge debt-badge">Vay ngân hàng</span>
            </div>
            <div class="finance-item-sub-row">
              <span class="finance-item-desc">${l.interestRate ? `Lãi ${l.interestRate}% • ` : ''}${l.tenureMonths ? `Kỳ hạn: ${l.tenureMonths} tháng` : ''}</span>
            </div>
          </div>
          <div class="finance-item-amount-wrap">
            <span class="finance-item-amount stat-amount debt-text">-${new Intl.NumberFormat('vi-VN').format(rem)}đ</span>
            <span class="finance-item-action-hint">Chi tiết <i data-lucide="chevron-right" style="width: 12px; height: 12px; vertical-align: middle;"></i></span>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  },

  renderLendDebtsList(debts) {
    const container = document.getElementById('finance-list-lend-debts');
    const subhead = document.getElementById('finance-subhead-lend');
    if (!container) return;

    if (!debts || debts.length === 0) {
      if (subhead) subhead.style.display = 'none';
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    if (subhead) subhead.style.display = 'block';
    container.style.display = 'block';

    const html = debts.map(d => {
      const initial = (d.personName || 'N').trim().charAt(0).toUpperCase();

      return `
        <div class="finance-item-card" onclick="UIOverviewFinance.handleDebtClick(${d.id})" role="button" tabindex="0">
          <div class="finance-item-icon-wrap" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700;">
            ${escapeHTML(initial)}
          </div>
          <div class="finance-item-info">
            <div class="finance-item-title-row">
              <span class="finance-item-name" title="${escapeHTML(d.personName)}">Người nợ: ${escapeHTML(d.personName)}</span>
              <span class="finance-type-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">Nợ cần thu</span>
            </div>
            <div class="finance-item-sub-row">
              <span class="finance-item-desc">${d.dueDate ? `Hạn thu: ${d.dueDate}` : 'Chưa có ngày hẹn'} ${d.note ? `• ${escapeHTML(d.note)}` : ''}</span>
            </div>
          </div>
          <div class="finance-item-amount-wrap">
            <span class="finance-item-amount stat-amount income-text">+${new Intl.NumberFormat('vi-VN').format(d.remainingAmount)}đ</span>
            <span class="finance-item-action-hint">Thu nợ <i data-lucide="chevron-right" style="width: 12px; height: 12px; vertical-align: middle;"></i></span>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  },

  // Click handlers - "Chạm vào hiển thị các ví/ thông tin liên quan"
  handleAccountClick(accId) {
    if (window.UIAccounts && typeof window.UIAccounts.viewAccountHistory === 'function') {
      window.UIAccounts.viewAccountHistory(Number(accId));
    }
  },

  handleAssetClick(assetId) {
    if (window.UIAccounts && typeof window.UIAccounts.openItemActionSheet === 'function') {
      window.UIAccounts.openItemActionSheet('asset', Number(assetId));
    }
  },

  handleSavingsClick(savingsId) {
    if (window.UIAccounts && typeof window.UIAccounts.openItemActionSheet === 'function') {
      window.UIAccounts.openItemActionSheet('savings', Number(savingsId));
    }
  },

  handleAccumulationClick(accId) {
    if (window.UIAccounts && typeof window.UIAccounts.openItemActionSheet === 'function') {
      window.UIAccounts.openItemActionSheet('accumulation', Number(accId));
    }
  },

  handleDebtClick(debtId) {
    if (window.UIDebts && typeof window.UIDebts.openPaymentModal === 'function') {
      window.UIDebts.openPaymentModal(Number(debtId));
    }
  },

  handleLoanClick(loanId) {
    if (window.UIAccounts && typeof window.UIAccounts.openItemActionSheet === 'function') {
      window.UIAccounts.openItemActionSheet('loan', Number(loanId));
    }
  },

  // Tiện ích Quét hoá đơn (OCR) từ Dashboard
  openOCRScannerSheet() {
    let sheet = document.getElementById('modal-dashboard-ocr-sheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'modal-dashboard-ocr-sheet';
      sheet.className = 'modal-overlay action-sheet-overlay';
      sheet.innerHTML = `
        <div class="modal-dialog action-sheet-dialog" onclick="event.stopPropagation()">
          <div class="action-sheet-header">
            <div class="action-sheet-icon" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">
              <i data-lucide="scan-text"></i>
            </div>
            <div class="action-sheet-info">
              <h4 class="action-sheet-title">Quét Hoá Đơn (OCR Offline)</h4>
              <p class="action-sheet-subtitle">Nhận diện tự động số tiền & nội dung</p>
            </div>
            <button type="button" class="btn-icon" onclick="UIOverviewFinance.closeOCRScannerSheet()"><i data-lucide="x"></i></button>
          </div>
          <div class="action-sheet-body">
            <button type="button" class="action-sheet-item" onclick="UIOverviewFinance.triggerOCRAction('camera')">
              <div class="action-sheet-item-icon" style="background: rgba(13, 148, 136, 0.15); color: #14b8a6;">
                <i data-lucide="camera" style="width: 20px; height: 20px;"></i>
              </div>
              <div class="action-sheet-item-text">
                <span class="action-sheet-item-title">Chụp ảnh hoá đơn mới</span>
                <span class="action-sheet-item-desc">Mở máy ảnh quét ngay hoá đơn</span>
              </div>
              <i data-lucide="chevron-right" class="action-sheet-chevron"></i>
            </button>

            <button type="button" class="action-sheet-item" onclick="UIOverviewFinance.triggerOCRAction('gallery')">
              <div class="action-sheet-item-icon" style="background: rgba(14, 165, 233, 0.15); color: #0ea5e9;">
                <i data-lucide="image" style="width: 20px; height: 20px;"></i>
              </div>
              <div class="action-sheet-item-text">
                <span class="action-sheet-item-title">Chọn ảnh từ thư viện</span>
                <span class="action-sheet-item-desc">Tải ảnh chụp hoá đơn đã lưu trong máy</span>
              </div>
              <i data-lucide="chevron-right" class="action-sheet-chevron"></i>
            </button>

            <button type="button" class="action-sheet-item" onclick="UIOverviewFinance.triggerOCRAction('settings')">
              <div class="action-sheet-item-icon" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">
                <i data-lucide="sliders" style="width: 20px; height: 20px;"></i>
              </div>
              <div class="action-sheet-item-text">
                <span class="action-sheet-item-title">Cài đặt nhận diện OCR</span>
                <span class="action-sheet-item-desc">Tùy chọn tự động điền số tiền, ngày, danh mục</span>
              </div>
              <i data-lucide="chevron-right" class="action-sheet-chevron"></i>
            </button>
          </div>
          <div class="action-sheet-footer">
            <button type="button" class="btn-secondary" style="width: 100%; justify-content: center;" onclick="UIOverviewFinance.closeOCRScannerSheet()">Đóng</button>
          </div>
        </div>
      `;
      sheet.addEventListener('click', (e) => {
        if (e.target === sheet) this.closeOCRScannerSheet();
      });
      document.body.appendChild(sheet);
    }

    sheet.classList.add('active');
    sheet.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeOCRScannerSheet() {
    const sheet = document.getElementById('modal-dashboard-ocr-sheet');
    if (sheet) {
      sheet.classList.remove('active');
      sheet.classList.remove('open');
    }
  },

  async triggerOCRAction(action) {
    this.closeOCRScannerSheet();
    if (action === 'settings') {
      if (window.app && window.app.switchView) {
        window.app.switchView('settings');
      }
      if (window.UISettings && typeof window.UISettings.openSection === 'function') {
        window.UISettings.openSection('ocr-scanner');
      }
      return;
    }

    // Mở trang tạo giao dịch và kích hoạt chụp/chọn ảnh
    if (window.app && window.app.switchView) {
      window.app.switchView('new-transaction');
    }
    if (window.UITransactions && typeof window.UITransactions.openAddModal === 'function') {
      await window.UITransactions.openAddModal('expense');
    }
    setTimeout(() => {
      if (window.UITransactions && typeof window.UITransactions.triggerImagePicker === 'function') {
        window.UITransactions.triggerImagePicker(action);
      }
    }, 250);
  }
};

window.UIOverviewFinance = UIOverviewFinance;
