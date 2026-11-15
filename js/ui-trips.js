/**
 * SỔ THU CHI - QUẢN LÝ CHUYẾN ĐI & SỰ KIỆN (TRIPS & EVENTS)
 * Quản lý chuyến đi trong Tiện ích, tích hợp vào Form Ghi chép (nằm trên Chi cho ai),
 * tích hợp chia tiền nhóm tự động, và hỗ trợ xuất báo cáo Excel & PDF.
 */

const UITrips = {
  tripsCache: [],
  currentTripId: null,
  currentTab: 'active', // 'active' | 'completed' | 'all'
  detailSubTab: 'expenses', // 'expenses' | 'split'

  async init() {
    await this.loadTrips();
  },

  async loadTrips() {
    try {
      this.tripsCache = await getTrips();
    } catch (e) {
      console.warn('UITrips loadTrips error:', e);
      this.tripsCache = [];
    }
  },

  getTripFromCache(id) {
    return this.tripsCache.find(t => Number(t.id) === Number(id));
  },

  /* ==================== 1. QUẢN LÝ TRONG TIỆN ÍCH ==================== */
  async openManager() {
    await this.loadTrips();
    if (window.app) {
      window.app.switchView('trips-manager');
      this.renderManager();
    }
  },

  setManagerTab(tab) {
    this.currentTab = tab;
    const tabs = document.querySelectorAll('.trips-filter-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    this.renderManager();
  },

  async renderManager() {
    const container = document.getElementById('trips-list-container');
    if (!container) return;

    let filtered = [...this.tripsCache];
    if (this.currentTab === 'active') {
      filtered = filtered.filter(t => t.status !== 'completed');
    } else if (this.currentTab === 'completed') {
      filtered = filtered.filter(t => t.status === 'completed');
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-list-placeholder">
          <div class="empty-icon-wrap" style="background: rgba(13, 148, 136, 0.12); color: var(--primary);">
            <i data-lucide="palmtree" style="width: 32px; height: 32px;"></i>
          </div>
          <p style="font-size: 0.95rem; font-weight: 600; margin-top: 10px;">${this.currentTab === 'completed' ? 'Chưa có chuyến đi nào đã kết thúc' : 'Chưa có chuyến đi hoặc sự kiện nào'}</p>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Tạo chuyến đi du lịch, dã ngoại, hội khóa hoặc sự kiện để theo dõi chi tiêu và chia tiền nhóm.</p>
          <button type="button" class="btn-primary" style="margin-top: 14px; padding: 8px 16px; font-size: 0.85rem;" onclick="UITrips.openTripModal()">
            <i data-lucide="plus" style="width: 16px; height: 16px;"></i> + Tạo Chuyến Đi / Sự Kiện Mới
          </button>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    // Lấy tất cả giao dịch để tính tổng chi của từng chuyến
    const allTxs = await db.transactions.where('isDeleted').equals(0).toArray();

    const html = filtered.map(trip => {
      const tripTxs = allTxs.filter(t => Number(t.tripId) === Number(trip.id));
      const totalSpent = tripTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + (t.amount || 0), 0);
      const isCompleted = trip.status === 'completed';
      const members = trip.members || [];
      const memberCount = members.length;
      const budget = trip.budget || 0;
      const budgetPercent = budget > 0 ? Math.min(100, Math.round((totalSpent / budget) * 100)) : 0;

      const dateStr = (trip.startDate || trip.endDate) 
        ? `${trip.startDate ? trip.startDate.split('-').reverse().join('/') : ''} ${trip.endDate ? '➔ ' + trip.endDate.split('-').reverse().join('/') : ''}`
        : 'Chưa đặt ngày';

      return `
        <div class="trip-card-item ${isCompleted ? 'is-completed' : ''}" onclick="UITrips.openTripDetail(${trip.id})" role="button" tabindex="0">
          <div class="trip-card-header">
            <div class="trip-card-title-wrap">
              <div class="trip-card-icon">
                <i data-lucide="palmtree"></i>
              </div>
              <div class="trip-card-info">
                <h4 class="trip-card-title">${escapeHTML(trip.name)}</h4>
                <div class="trip-card-meta">
                  <span><i data-lucide="calendar" style="width: 12px; height: 12px;"></i> ${escapeHTML(dateStr)}</span>
                  <span>•</span>
                  <span><i data-lucide="users" style="width: 12px; height: 12px;"></i> ${memberCount} người</span>
                </div>
              </div>
            </div>
            <span class="trip-status-badge ${isCompleted ? 'completed' : 'active'}">
              ${isCompleted ? 'Đã kết thúc' : 'Đang diễn ra'}
            </span>
          </div>

          <div class="trip-card-body">
            <div class="trip-card-spending-row">
              <div>
                <span class="trip-card-spent-label">Đã chi tiêu (${tripTxs.length} khoản)</span>
                <span class="trip-card-spent-val stat-amount expense-text">${new Intl.NumberFormat('vi-VN').format(totalSpent)}đ</span>
              </div>
              ${budget > 0 ? `
                <div style="text-align: right;">
                  <span class="trip-card-spent-label">Ngân sách (${budgetPercent}%)</span>
                  <span class="trip-card-budget-val stat-amount">${new Intl.NumberFormat('vi-VN').format(budget)}đ</span>
                </div>
              ` : ''}
            </div>

            ${budget > 0 ? `
              <div class="trip-progress-bar">
                <div class="trip-progress-fill ${budgetPercent > 90 ? 'danger' : ''}" style="width: ${budgetPercent}%;"></div>
              </div>
            ` : ''}

            ${members.length > 0 ? `
              <div class="trip-members-preview">
                ${members.slice(0, 5).map(m => `<span class="trip-mini-member-pill">${escapeHTML(m)}</span>`).join('')}
                ${members.length > 5 ? `<span class="trip-mini-member-pill more">+${members.length - 5}</span>` : ''}
              </div>
            ` : ''}
          </div>

          <div class="trip-card-footer" onclick="event.stopPropagation();">
            <button type="button" class="btn-trip-action-link" onclick="UITrips.openTripDetail(${trip.id}, 'split')">
              <i data-lucide="arrow-right-left" style="width: 13px; height: 13px;"></i> Chia tiền nhóm
            </button>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn-trip-icon-opt" onclick="UITrips.openTripModal(${trip.id})" title="Chỉnh sửa">
                <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
              </button>
              <button type="button" class="btn-trip-icon-opt text-danger" onclick="UITrips.confirmDeleteTrip(${trip.id})" title="Xoá">
                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  /* ==================== 2. MODAL TẠO & SỬA CHUYẾN ĐI ==================== */
  openTripModal(tripId = null) {
    const modal = document.getElementById('modal-trip-form');
    if (!modal) return;

    const idInput = document.getElementById('trip-form-id');
    const nameInput = document.getElementById('trip-form-name');
    const startInput = document.getElementById('trip-form-start');
    const endInput = document.getElementById('trip-form-end');
    const budgetInput = document.getElementById('trip-form-budget');
    const membersInput = document.getElementById('trip-form-members');
    const noteInput = document.getElementById('trip-form-note');
    const statusSelect = document.getElementById('trip-form-status');
    const titleHeader = document.getElementById('trip-form-modal-title');

    if (tripId) {
      const trip = this.getTripFromCache(tripId);
      if (trip) {
        if (idInput) idInput.value = trip.id;
        if (nameInput) nameInput.value = trip.name || '';
        if (startInput) startInput.value = trip.startDate || '';
        if (endInput) endInput.value = trip.endDate || '';
        if (budgetInput) budgetInput.value = trip.budget > 0 ? trip.budget : '';
        if (membersInput) membersInput.value = Array.isArray(trip.members) ? trip.members.join(', ') : (trip.members || '');
        if (noteInput) noteInput.value = trip.note || '';
        if (statusSelect) statusSelect.value = trip.status || 'active';
        if (titleHeader) titleHeader.textContent = 'Chỉnh Sửa Chuyến Đi / Sự Kiện';
      }
    } else {
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';
      if (startInput) startInput.value = new Date().toISOString().split('T')[0];
      if (endInput) endInput.value = '';
      if (budgetInput) budgetInput.value = '';
      if (membersInput) membersInput.value = 'Tôi, Bạn 1, Bạn 2';
      if (noteInput) noteInput.value = '';
      if (statusSelect) statusSelect.value = 'active';
      if (titleHeader) titleHeader.textContent = 'Tạo Chuyến Đi / Sự Kiện Mới';
    }

    modal.classList.add('active');
  },

  closeTripModal() {
    const modal = document.getElementById('modal-trip-form');
    if (modal) modal.classList.remove('active');
  },

  async submitTripForm() {
    const idVal = document.getElementById('trip-form-id')?.value;
    const nameVal = document.getElementById('trip-form-name')?.value?.trim();
    const startVal = document.getElementById('trip-form-start')?.value || '';
    const endVal = document.getElementById('trip-form-end')?.value || '';
    const budgetVal = Number(document.getElementById('trip-form-budget')?.value || 0);
    const membersRaw = document.getElementById('trip-form-members')?.value || '';
    const noteVal = document.getElementById('trip-form-note')?.value?.trim() || '';
    const statusVal = document.getElementById('trip-form-status')?.value || 'active';

    if (!nameVal) {
      showToast('Vui lòng nhập tên chuyến đi / sự kiện', 'warning');
      return;
    }

    const members = membersRaw.split(',').map(m => m.trim()).filter(Boolean);
    if (!members.includes('Tôi')) members.unshift('Tôi');

    const payload = {
      id: idVal ? Number(idVal) : undefined,
      name: nameVal,
      startDate: startVal,
      endDate: endVal,
      budget: budgetVal,
      members,
      note: noteVal,
      status: statusVal
    };

    try {
      const savedId = await saveTrip(payload);
      showToast(idVal ? 'Đã cập nhật chuyến đi!' : 'Đã tạo chuyến đi mới thành công!', 'success');
      this.closeTripModal();
      await this.loadTrips();

      // Cập nhật selector nếu đang mở
      this.renderManager();
      if (this.currentTripId && Number(this.currentTripId) === Number(savedId)) {
        this.renderTripDetail();
      }
    } catch (e) {
      console.warn('submitTripForm error:', e);
      showToast('Lỗi khi lưu chuyến đi', 'error');
    }
  },

  async confirmDeleteTrip(tripId) {
    const trip = this.getTripFromCache(tripId);
    if (!trip) return;

    const ok = confirm(`Bạn có chắc chắn muốn xóa chuyến đi "${trip.name}" không? (Các giao dịch thuộc chuyến đi vẫn được giữ lại)`);
    if (!ok) return;

    try {
      await deleteTrip(tripId);
      showToast('Đã xóa chuyến đi thành công', 'success');
      await this.loadTrips();
      this.renderManager();
      if (this.currentTripId && Number(this.currentTripId) === Number(tripId)) {
        window.app.switchView('trips-manager');
      }
    } catch (e) {
      console.warn('deleteTrip error:', e);
      showToast('Lỗi khi xóa chuyến đi', 'error');
    }
  },

  /* ==================== 3. TRANG CHI TIẾT CHUYẾN ĐI ==================== */
  async openTripDetail(tripId, subTab = 'expenses') {
    this.currentTripId = Number(tripId);
    this.detailSubTab = subTab;
    await this.loadTrips();

    if (window.app) {
      window.app.switchView('trip-detail');
      this.renderTripDetail();
    }
  },

  setDetailSubTab(tab) {
    this.detailSubTab = tab;
    const tabBtns = document.querySelectorAll('.trip-detail-tab-btn');
    tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));

    const expPanel = document.getElementById('trip-detail-expenses-panel');
    const splitPanel = document.getElementById('trip-detail-split-panel');

    if (tab === 'split') {
      if (expPanel) expPanel.style.display = 'none';
      if (splitPanel) splitPanel.style.display = 'block';
    } else {
      if (expPanel) expPanel.style.display = 'block';
      if (splitPanel) splitPanel.style.display = 'none';
    }
  },

  async renderTripDetail() {
    const trip = this.getTripFromCache(this.currentTripId);
    if (!trip) {
      showToast('Không tìm thấy thông tin chuyến đi', 'error');
      window.app.switchView('trips-manager');
      return;
    }

    // Tiêu đề & ngày
    const titleEl = document.getElementById('trip-detail-title');
    const datesEl = document.getElementById('trip-detail-dates');
    const statusBadgeEl = document.getElementById('trip-detail-status-badge');

    if (titleEl) titleEl.textContent = trip.name;
    if (datesEl) {
      const dateStr = (trip.startDate || trip.endDate) 
        ? `${trip.startDate ? trip.startDate.split('-').reverse().join('/') : ''} ${trip.endDate ? '➔ ' + trip.endDate.split('-').reverse().join('/') : ''}`
        : 'Chưa đặt ngày';
      datesEl.textContent = dateStr;
    }
    if (statusBadgeEl) {
      statusBadgeEl.className = `trip-status-badge ${trip.status === 'completed' ? 'completed' : 'active'}`;
      statusBadgeEl.textContent = trip.status === 'completed' ? 'Đã kết thúc' : 'Đang diễn ra';
    }

    // Danh sách giao dịch của chuyến đi
    const txs = await getTripTransactions(trip.id);
    const expenseTxs = txs.filter(t => t.type === 'expense');
    const totalSpent = expenseTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
    const budget = trip.budget || 0;
    const remainingBudget = budget - totalSpent;
    const members = trip.members || ['Tôi'];

    // Cập nhật Overview Stats
    const totalSpentEl = document.getElementById('trip-stat-total-spent');
    const budgetEl = document.getElementById('trip-stat-budget');
    const remainingEl = document.getElementById('trip-stat-remaining');
    const memberCountEl = document.getElementById('trip-stat-members');

    if (totalSpentEl) totalSpentEl.textContent = `${new Intl.NumberFormat('vi-VN').format(totalSpent)}đ`;
    if (budgetEl) budgetEl.textContent = budget > 0 ? `${new Intl.NumberFormat('vi-VN').format(budget)}đ` : 'Chưa đặt';
    if (remainingEl) {
      remainingEl.textContent = `${new Intl.NumberFormat('vi-VN').format(remainingBudget)}đ`;
      remainingEl.className = `stat-amount ${remainingBudget < 0 ? 'expense-text' : 'income-text'}`;
    }
    if (memberCountEl) memberCountEl.textContent = `${members.length} người`;

    // Render danh sách khoản chi
    this.renderTripExpenses(expenseTxs);

    // Render tích hợp chia tiền nhóm
    this.renderTripGroupSplit(trip, expenseTxs);

    this.setDetailSubTab(this.detailSubTab);
    if (window.lucide) lucide.createIcons();
  },

  renderTripExpenses(txs) {
    const container = document.getElementById('trip-expenses-list');
    if (!container) return;

    if (!txs || txs.length === 0) {
      container.innerHTML = `
        <div class="empty-list-placeholder-sm" style="padding: 24px 10px;">
          <span>Chưa có khoản chi nào trong chuyến đi này</span>
          <button type="button" class="btn-primary" style="margin-top: 10px; padding: 6px 14px; font-size: 0.82rem;" onclick="UITrips.addExpenseForCurrentTrip()">
            + Thêm khoản chi đầu tiên
          </button>
        </div>
      `;
      return;
    }

    const html = txs.map(tx => {
      const dateFormatted = tx.date ? tx.date.split('-').reverse().join('/') : '';
      const payeeText = tx.person ? `Cho: ${tx.person}` : '';

      return `
        <div class="trip-expense-item" onclick="UITransactions.openEditTransaction(${tx.id})" role="button" tabindex="0">
          <div class="trip-expense-left">
            <div class="trip-expense-icon">
              <i data-lucide="receipt"></i>
            </div>
            <div>
              <div class="trip-expense-name">${escapeHTML(tx.note || 'Chi tiêu không tên')}</div>
              <div class="trip-expense-sub">
                <span>${dateFormatted}</span>
                ${payeeText ? `<span>• ${escapeHTML(payeeText)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="trip-expense-right">
            <span class="trip-expense-amount stat-amount expense-text">-${new Intl.NumberFormat('vi-VN').format(tx.amount)}đ</span>
            <i data-lucide="chevron-right" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  },

  /**
   * TÍCH HỢP CHIA TIỀN NHÓM CHO CHUYẾN ĐI
   * Tự động tính toán tổng số tiền từng người đã chi, phần phải chịu, và thuật toán bù trừ nợ (Settlement).
   */
  renderTripGroupSplit(trip, expenseTxs) {
    const container = document.getElementById('trip-group-split-container');
    if (!container) return;

    const members = trip.members && trip.members.length > 0 ? trip.members : ['Tôi'];
    const totalSpent = expenseTxs.reduce((sum, t) => sum + (t.amount || 0), 0);

    // Tính toán số tiền mỗi người đã thanh toán (Paid)
    const paidByMember = {};
    const shareByMember = {};
    members.forEach(m => {
      paidByMember[m] = 0;
      shareByMember[m] = 0;
    });

    expenseTxs.forEach(tx => {
      const amt = tx.amount || 0;
      // Người thanh toán
      let payer = 'Tôi';
      if (tx.splitDetails && tx.splitDetails.payer) {
        payer = tx.splitDetails.payer;
      }
      if (paidByMember[payer] !== undefined) {
        paidByMember[payer] += amt;
      } else {
        paidByMember[payer] = amt;
        if (!members.includes(payer)) members.push(payer);
      }

      // Phân bổ phần phải trả (Share)
      if (tx.splitDetails && tx.splitDetails.breakdown) {
        // Nếu giao dịch đã có bảng chia tiền chi tiết
        Object.keys(tx.splitDetails.breakdown).forEach(m => {
          const mShare = tx.splitDetails.breakdown[m] || 0;
          if (shareByMember[m] !== undefined) {
            shareByMember[m] += mShare;
          } else {
            shareByMember[m] = mShare;
            if (!members.includes(m)) members.push(m);
          }
        });
      } else if (tx.person && tx.person.trim()) {
        // Nếu có danh sách người tham gia
        const participants = tx.person.split(',').map(n => n.trim()).filter(Boolean);
        if (!participants.includes('Tôi')) participants.unshift('Tôi');
        const count = participants.length || 1;
        const perPerson = Math.round(amt / count);
        participants.forEach(p => {
          if (shareByMember[p] !== undefined) shareByMember[p] += perPerson;
          else {
            shareByMember[p] = perPerson;
            if (!members.includes(p)) members.push(p);
          }
        });
      } else {
        // Mặc định chia đều cho toàn bộ thành viên chuyến đi
        const count = members.length || 1;
        const perPerson = Math.round(amt / count);
        members.forEach(m => {
          if (shareByMember[m] !== undefined) shareByMember[m] += perPerson;
          else shareByMember[m] = perPerson;
        });
      }
    });

    // Tính Chênh lệch (Net balance: Paid - Share)
    // Dương: Thu về (đã chi nhiều hơn phần mình)
    // Âm: Cần trả thêm (chưa chi đủ phần mình)
    const netBalances = {};
    members.forEach(m => {
      const paid = paidByMember[m] || 0;
      const share = shareByMember[m] || 0;
      netBalances[m] = paid - share;
    });

    // Thuật toán tối ưu hoá bù trừ nợ (Debt Simplification)
    const debtors = []; // Cần trả tiền
    const creditors = []; // Cần nhận tiền

    Object.keys(netBalances).forEach(m => {
      const val = netBalances[m];
      if (val < -100) {
        debtors.push({ name: m, amount: -val });
      } else if (val > 100) {
        creditors.push({ name: m, amount: val });
      }
    });

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlements = [];
    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const d = debtors[dIdx];
      const c = creditors[cIdx];
      const settleAmount = Math.min(d.amount, c.amount);

      if (settleAmount >= 100) {
        settlements.push({
          from: d.name,
          to: c.name,
          amount: Math.round(settleAmount)
        });
      }

      d.amount -= settleAmount;
      c.amount -= settleAmount;

      if (d.amount < 100) dIdx++;
      if (c.amount < 100) cIdx++;
    }

    // Render HTML Bảng chia tiền & Kế hoạch bù trừ
    let html = `
      <div class="trip-split-card">
        <div class="trip-split-card-header">
          <div>
            <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">
              Bảng Tổng Hợp Chi Phí Thành Viên
            </h4>
            <span style="font-size: 0.75rem; color: var(--text-muted);">
              Tổng chi: ${new Intl.NumberFormat('vi-VN').format(totalSpent)}đ • ${members.length} thành viên
            </span>
          </div>
          <button type="button" class="btn-secondary" style="font-size: 0.78rem; padding: 5px 10px;" onclick="UITrips.copyTripSplitText()">
            <i data-lucide="copy" style="width: 13px; height: 13px;"></i> Sao chép
          </button>
        </div>

        <div class="trip-members-split-table">
          ${members.map(m => {
            const paid = paidByMember[m] || 0;
            const share = shareByMember[m] || 0;
            const net = netBalances[m] || 0;
            const isProfit = net > 0;
            const isZero = Math.abs(net) < 100;

            return `
              <div class="trip-split-member-row">
                <div class="trip-member-left">
                  <div class="split-avatar">${escapeHTML(m.charAt(0).toUpperCase())}</div>
                  <div>
                    <span class="trip-member-name">${escapeHTML(m)}</span>
                    <span class="trip-member-sub">Đã chi: ${new Intl.NumberFormat('vi-VN').format(paid)}đ | Phần chịu: ${new Intl.NumberFormat('vi-VN').format(share)}đ</span>
                  </div>
                </div>
                <div class="trip-member-right">
                  <span class="trip-member-net ${isZero ? 'text-muted' : (isProfit ? 'income-text' : 'debt-text')}">
                    ${isZero ? 'Cân bằng' : (isProfit ? `+${new Intl.NumberFormat('vi-VN').format(net)}đ` : `${new Intl.NumberFormat('vi-VN').format(net)}đ`)}
                  </span>
                  <span class="trip-member-net-label">${isZero ? 'Đủ tiền' : (isProfit ? 'Nhận lại' : 'Trả thêm')}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Kế hoạch thanh toán bù trừ -->
      <div class="trip-split-card" style="margin-top: 14px;">
        <div class="trip-split-card-header">
          <div style="display: flex; align-items: center; gap: 6px;">
            <i data-lucide="arrow-right-left" style="width: 16px; height: 16px; color: var(--primary);"></i>
            <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">
              Kế Hoạch Bù Trừ Nợ Tối Ưu
            </h4>
          </div>
        </div>

        <div class="trip-settlement-list">
          ${settlements.length > 0 ? settlements.map(s => `
            <div class="trip-settlement-item">
              <div class="settle-from-to">
                <span class="settle-payer">${escapeHTML(s.from)}</span>
                <i data-lucide="arrow-right" class="settle-arrow"></i>
                <span class="settle-receiver">${escapeHTML(s.to)}</span>
              </div>
              <span class="settle-amount stat-amount income-text">
                ${new Intl.NumberFormat('vi-VN').format(s.amount)}đ
              </span>
            </div>
          `).join('') : `
            <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
              🎉 Chi phí của các thành viên đã hoàn toàn cân bằng!
            </div>
          `}
        </div>

        <div style="display: flex; gap: 8px; margin-top: 12px;">
          <button type="button" class="btn-primary" style="flex: 1; padding: 9px; font-size: 0.85rem;" onclick="UITrips.copyTripSplitText()">
            <i data-lucide="share-2" style="width: 14px; height: 14px;"></i> Gửi bảng chia tiền cho nhóm
          </button>
        </div>
      </div>
    `;

    container.innerHTML = html;
  },

  /**
   * Tạo văn bản chia tiền chuyến đi để gửi Zalo / Messenger
   */
  async generateTripShareText() {
    const trip = this.getTripFromCache(this.currentTripId);
    if (!trip) return '';

    const txs = await getTripTransactions(trip.id);
    const expenseTxs = txs.filter(t => t.type === 'expense');
    const totalSpent = expenseTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
    const members = trip.members || ['Tôi'];

    let text = `🌴 TỔNG KẾT CHI TIÊU & CHIA TIỀN: ${trip.name.toUpperCase()}\n`;
    if (trip.startDate || trip.endDate) {
      text += `📅 Thời gian: ${trip.startDate || ''} ➔ ${trip.endDate || ''}\n`;
    }
    text += `💰 Tổng chi phí: ${new Intl.NumberFormat('vi-VN').format(totalSpent)}đ\n`;
    text += `👥 Số thành viên: ${members.length} người\n`;
    text += `------------------------------------\n`;
    text += `📋 BẢNG THANH TOÁN BÙ TRỪ:\n`;

    // Tính settlements tương tự
    const paidByMember = {};
    const shareByMember = {};
    members.forEach(m => { paidByMember[m] = 0; shareByMember[m] = 0; });

    expenseTxs.forEach(tx => {
      const amt = tx.amount || 0;
      let payer = tx.splitDetails?.payer || 'Tôi';
      paidByMember[payer] = (paidByMember[payer] || 0) + amt;

      if (tx.splitDetails?.breakdown) {
        Object.keys(tx.splitDetails.breakdown).forEach(m => {
          shareByMember[m] = (shareByMember[m] || 0) + (tx.splitDetails.breakdown[m] || 0);
        });
      } else {
        const perPerson = Math.round(amt / (members.length || 1));
        members.forEach(m => {
          shareByMember[m] = (shareByMember[m] || 0) + perPerson;
        });
      }
    });

    const netBalances = {};
    members.forEach(m => {
      netBalances[m] = (paidByMember[m] || 0) - (shareByMember[m] || 0);
    });

    const debtors = [];
    const creditors = [];
    Object.keys(netBalances).forEach(m => {
      const val = netBalances[m];
      if (val < -100) debtors.push({ name: m, amount: -val });
      else if (val > 100) creditors.push({ name: m, amount: val });
    });

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    let dIdx = 0, cIdx = 0;
    let count = 0;
    while (dIdx < debtors.length && cIdx < creditors.length) {
      const d = debtors[dIdx];
      const c = creditors[cIdx];
      const settleAmount = Math.min(d.amount, c.amount);

      if (settleAmount >= 100) {
        count++;
        text += `${count}. 👉 ${d.name} chuyển cho ${c.name}: ${new Intl.NumberFormat('vi-VN').format(Math.round(settleAmount))}đ\n`;
      }
      d.amount -= settleAmount;
      c.amount -= settleAmount;
      if (d.amount < 100) dIdx++;
      if (c.amount < 100) cIdx++;
    }

    if (count === 0) {
      text += `✅ Chi phí đã cân bằng, không có ai nợ ai.\n`;
    }

    text += `------------------------------------\n`;
    text += `(Xuất từ Sổ Thu Chi PWA)`;
    return text;
  },

  async copyTripSplitText() {
    const text = await this.generateTripShareText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('Đã sao chép bảng chia tiền chuyến đi! Dán vào Zalo/Messenger', 'success');
    } catch (e) {
      showToast('Không thể sao chép văn bản', 'error');
    }
  },

  addExpenseForCurrentTrip() {
    if (!this.currentTripId) return;
    if (window.UITransactions) {
      window.UITransactions.openNewWithTrip(this.currentTripId);
    }
  },

  /* ==================== 4. HỖ TRỢ XUẤT EXCEL & PDF ==================== */
  /**
   * Xuất báo cáo chuyến đi ra file Excel (CSV UTF-8 BOM chuẩn, mở ngay không lỗi font)
   */
  async exportExcel(tripId = null) {
    const targetId = tripId || this.currentTripId;
    const trip = this.getTripFromCache(targetId);
    if (!trip) {
      showToast('Không tìm thấy thông tin chuyến đi để xuất', 'error');
      return;
    }

    const txs = await getTripTransactions(trip.id);
    const expenseTxs = txs.filter(t => t.type === 'expense');
    const totalSpent = expenseTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
    const members = trip.members || ['Tôi'];

    // Headers & Sections in CSV
    const rows = [];
    const escapeCsv = (str) => {
      const s = String(str ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };

    // 1. Header Chuyến Đi
    rows.push([escapeCsv('BÁO CÁO CHI TIÊU & CHIA TIỀN CHUYẾN ĐI / SỰ KIỆN')]);
    rows.push([escapeCsv('Tên chuyến đi:'), escapeCsv(trip.name)]);
    rows.push([escapeCsv('Thời gian:'), escapeCsv(`${trip.startDate || ''} đến ${trip.endDate || ''}`)]);
    rows.push([escapeCsv('Ngân sách:'), escapeCsv(trip.budget || 0)]);
    rows.push([escapeCsv('Tổng chi tiêu:'), escapeCsv(totalSpent)]);
    rows.push([escapeCsv('Thành viên tham gia:'), escapeCsv(members.join(', '))]);
    rows.push([]);

    // 2. Bảng kê chi tiết giao dịch
    rows.push([escapeCsv('DANH SÁCH CHI TIẾT CÁC KHOẢN CHI')]);
    rows.push([
      escapeCsv('STT'),
      escapeCsv('Ngày'),
      escapeCsv('Hạng mục / Ghi chú'),
      escapeCsv('Số tiền (VNĐ)'),
      escapeCsv('Người thanh toán'),
      escapeCsv('Người tham gia')
    ]);

    expenseTxs.forEach((tx, idx) => {
      const payer = tx.splitDetails?.payer || 'Tôi';
      rows.push([
        escapeCsv(idx + 1),
        escapeCsv(tx.date || ''),
        escapeCsv(tx.note || 'Chi tiêu'),
        escapeCsv(tx.amount || 0),
        escapeCsv(payer),
        escapeCsv(tx.person || members.join(', '))
      ]);
    });

    rows.push([]);

    // 3. Bảng Chia Tiền Nhóm
    rows.push([escapeCsv('TỔNG HỢP CHIA TIỀN & BÙ TRỪ NỢ')]);
    rows.push([
      escapeCsv('Thành viên'),
      escapeCsv('Đã thanh toán (VNĐ)'),
      escapeCsv('Phần phải chịu (VNĐ)'),
      escapeCsv('Chênh lệch (VNĐ)'),
      escapeCsv('Kết luận')
    ]);

    // Tính toán
    const paidByMember = {};
    const shareByMember = {};
    members.forEach(m => { paidByMember[m] = 0; shareByMember[m] = 0; });

    expenseTxs.forEach(tx => {
      const amt = tx.amount || 0;
      let payer = tx.splitDetails?.payer || 'Tôi';
      paidByMember[payer] = (paidByMember[payer] || 0) + amt;

      if (tx.splitDetails?.breakdown) {
        Object.keys(tx.splitDetails.breakdown).forEach(m => {
          shareByMember[m] = (shareByMember[m] || 0) + (tx.splitDetails.breakdown[m] || 0);
        });
      } else {
        const perPerson = Math.round(amt / (members.length || 1));
        members.forEach(m => { shareByMember[m] = (shareByMember[m] || 0) + perPerson; });
      }
    });

    members.forEach(m => {
      const paid = paidByMember[m] || 0;
      const share = shareByMember[m] || 0;
      const net = paid - share;
      const statusText = net > 0 ? `Nhận lại ${net}đ` : (net < 0 ? `Trả thêm ${-net}đ` : 'Cân bằng');
      rows.push([
        escapeCsv(m),
        escapeCsv(paid),
        escapeCsv(share),
        escapeCsv(net),
        escapeCsv(statusText)
      ]);
    });

    // Tạo file CSV với UTF-8 BOM
    const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = `SoThuChi_${trip.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    showToast(`Đã xuất báo cáo Excel cho chuyến đi "${trip.name}" thành công!`, 'success');
  },

  /**
   * Xuất báo cáo chuyến đi ra PDF (Trình xem in ấn chuyên nghiệp, lưu ngay dưới dạng PDF)
   */
  async exportPDF(tripId = null) {
    const targetId = tripId || this.currentTripId;
    const trip = this.getTripFromCache(targetId);
    if (!trip) {
      showToast('Không tìm thấy thông tin chuyến đi để in/xuất PDF', 'error');
      return;
    }

    const txs = await getTripTransactions(trip.id);
    const expenseTxs = txs.filter(t => t.type === 'expense');
    const totalSpent = expenseTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
    const members = trip.members || ['Tôi'];

    // Mở cửa sổ in ấn độc lập với CSS Print chuẩn đẹp
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Vui lòng cho phép popup để mở bản in PDF', 'warning');
      return;
    }

    const dateStr = (trip.startDate || trip.endDate) 
      ? `${trip.startDate ? trip.startDate.split('-').reverse().join('/') : ''} đến ${trip.endDate ? trip.endDate.split('-').reverse().join('/') : ''}`
      : 'Không xác định';

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <title>Báo cáo Chuyến Đi - ${escapeHTML(trip.name)}</title>
        <style>
          @page {
            size: A4;
            margin: 15mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #1e293b;
            background: #fff;
            padding: 20px;
            margin: 0;
            line-height: 1.5;
          }
          .header-box {
            border-bottom: 2px solid #0d9488;
            padding-bottom: 12px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .brand-title {
            color: #0d9488;
            font-size: 22px;
            font-weight: 800;
            margin: 0;
          }
          .brand-subtitle {
            font-size: 13px;
            color: #64748b;
          }
          .trip-name {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
            margin: 10px 0 4px 0;
          }
          .trip-meta {
            font-size: 13px;
            color: #475569;
          }
          .stats-row {
            display: flex;
            gap: 15px;
            margin-bottom: 20px;
          }
          .stat-card {
            flex: 1;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px;
          }
          .stat-label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: #64748b;
          }
          .stat-val {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 4px;
          }
          .stat-val.primary { color: #0d9488; }
          .stat-val.expense { color: #f43f5e; }
          
          h3 {
            font-size: 15px;
            color: #0f172a;
            margin: 20px 0 10px 0;
            padding-bottom: 4px;
            border-bottom: 1px solid #cbd5e1;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            font-size: 12px;
          }
          th {
            background: #f1f5f9;
            color: #334155;
            font-weight: 600;
            text-align: left;
            padding: 8px;
            border: 1px solid #cbd5e1;
          }
          td {
            padding: 8px;
            border: 1px solid #cbd5e1;
          }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .footer-note {
            margin-top: 30px;
            text-align: center;
            font-size: 11px;
            color: #94a3b8;
          }
          .btn-print {
            background: #0d9488;
            color: #fff;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            margin-bottom: 20px;
          }
          @media print {
            .no-print { display: none !important; }
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="text-align: center; margin-bottom: 15px;">
          <button class="btn-print" onclick="window.print()">🖨️ In Báo Cáo / Lưu PDF</button>
        </div>

        <div class="header-box">
          <div>
            <h1 class="brand-title">SỔ THU CHI</h1>
            <div class="brand-subtitle">Báo Cáo Chi Phí & Chia Tiền Nhóm</div>
            <div class="trip-name">${escapeHTML(trip.name)}</div>
            <div class="trip-meta">Thời gian: ${escapeHTML(dateStr)} • ${members.length} thành viên: ${escapeHTML(members.join(', '))}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; color: #64748b;">Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}</div>
          </div>
        </div>

        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-label">Tổng Chi Tiêu</div>
            <div class="stat-val expense">${new Intl.NumberFormat('vi-VN').format(totalSpent)}đ</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Ngân Sách Dự Kiến</div>
            <div class="stat-val">${trip.budget > 0 ? `${new Intl.NumberFormat('vi-VN').format(trip.budget)}đ` : 'Chưa đặt'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Số Khoản Chi</div>
            <div class="stat-val primary">${expenseTxs.length}</div>
          </div>
        </div>

        <h3>1. BẢNG KÊ CHI TIẾT CÁC KHOẢN CHI</h3>
        <table>
          <thead>
            <tr>
              <th class="text-center" style="width: 40px;">STT</th>
              <th>Ngày</th>
              <th>Nội dung / Ghi chú</th>
              <th>Người trả</th>
              <th>Người tham gia</th>
              <th class="text-right">Số tiền</th>
            </tr>
          </thead>
          <tbody>
            ${expenseTxs.map((tx, idx) => `
              <tr>
                <td class="text-center">${idx + 1}</td>
                <td>${tx.date || ''}</td>
                <td>${escapeHTML(tx.note || 'Chi tiêu')}</td>
                <td>${escapeHTML(tx.splitDetails?.payer || 'Tôi')}</td>
                <td>${escapeHTML(tx.person || members.join(', '))}</td>
                <td class="text-right" style="font-weight: 600;">${new Intl.NumberFormat('vi-VN').format(tx.amount || 0)}đ</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h3>2. TỔNG HỢP CHIA TIỀN NHÓM</h3>
        <p style="font-size: 12px; color: #475569; margin-top: -6px; margin-bottom: 10px;">
          Bảng phân bổ chi phí công bằng giữa các thành viên tham gia chuyến đi.
        </p>
        <table>
          <thead>
            <tr>
              <th>Thành viên</th>
              <th class="text-right">Đã chi (VNĐ)</th>
              <th class="text-right">Phần phải chịu (VNĐ)</th>
              <th class="text-right">Chênh lệch (VNĐ)</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            ${members.map(m => {
              // Tạm tính
              const paid = expenseTxs.filter(tx => (tx.splitDetails?.payer || 'Tôi') === m).reduce((s, tx) => s + (tx.amount || 0), 0);
              const share = Math.round(totalSpent / (members.length || 1));
              const net = paid - share;
              return `
                <tr>
                  <td><b>${escapeHTML(m)}</b></td>
                  <td class="text-right">${new Intl.NumberFormat('vi-VN').format(paid)}đ</td>
                  <td class="text-right">${new Intl.NumberFormat('vi-VN').format(share)}đ</td>
                  <td class="text-right" style="font-weight: 600; color: ${net >= 0 ? '#0d9488' : '#f43f5e'};">
                    ${net >= 0 ? '+' : ''}${new Intl.NumberFormat('vi-VN').format(net)}đ
                  </td>
                  <td>${net > 0 ? `Nhận lại ${new Intl.NumberFormat('vi-VN').format(net)}đ` : (net < 0 ? `Cần trả thêm ${new Intl.NumberFormat('vi-VN').format(-net)}đ` : 'Cân bằng')}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="footer-note">
          Tài liệu được kết xuất từ ứng dụng Sổ Thu Chi (Offline-First PWA).
        </div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Tự động kích hoạt hộp thoại in / lưu PDF sau khi trang tải xong
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);

    showToast('Đã mở trang in ấn & xuất PDF cho chuyến đi!', 'success');
  },

  /* ==================== 5. CHỌN CHUYẾN ĐI TRONG FORM THU CHI ==================== */
  /**
   * Mở popup chọn chuyến đi từ form Ghi chép
   */
  async openTripPicker() {
    await this.loadTrips();
    const modal = document.getElementById('modal-trip-picker');
    if (!modal) return;

    const listContainer = document.getElementById('trip-picker-list');
    const currentSelectedId = document.getElementById('tx-trip-id-input')?.value;

    if (listContainer) {
      if (this.tripsCache.length === 0) {
        listContainer.innerHTML = `
          <div class="empty-list-placeholder-sm" style="padding: 20px;">
            <span>Chưa có chuyến đi nào</span>
            <button type="button" class="btn-primary" style="margin-top: 10px; font-size: 0.8rem; padding: 6px 12px;" onclick="UITrips.openTripModal()">
              + Tạo Chuyến Đi Mới
            </button>
          </div>
        `;
      } else {
        const html = `
          <!-- Tùy chọn Không chọn chuyến đi -->
          <div class="trip-picker-item ${!currentSelectedId ? 'active' : ''}" onclick="UITrips.selectTripForTx(null)">
            <div class="trip-picker-icon" style="background: rgba(148, 163, 184, 0.15); color: #94a3b8;">
              <i data-lucide="x"></i>
            </div>
            <div class="trip-picker-info">
              <span class="trip-picker-name">Không thuộc chuyến đi / sự kiện nào</span>
            </div>
            ${!currentSelectedId ? '<i data-lucide="check" class="trip-picker-check"></i>' : ''}
          </div>

          ${this.tripsCache.map(t => {
            const isSelected = String(t.id) === String(currentSelectedId);
            return `
              <div class="trip-picker-item ${isSelected ? 'active' : ''}" onclick="UITrips.selectTripForTx(${t.id})">
                <div class="trip-picker-icon">
                  <i data-lucide="palmtree"></i>
                </div>
                <div class="trip-picker-info">
                  <span class="trip-picker-name">${escapeHTML(t.name)}</span>
                  <span class="trip-picker-sub">${t.members?.length || 0} thành viên ${t.startDate ? `• ${t.startDate}` : ''}</span>
                </div>
                ${isSelected ? '<i data-lucide="check" class="trip-picker-check"></i>' : ''}
              </div>
            `;
          }).join('')}
        `;
        listContainer.innerHTML = html;
      }
    }

    modal.classList.add('active');
    if (window.lucide) lucide.createIcons();
  },

  closeTripPicker() {
    const modal = document.getElementById('modal-trip-picker');
    if (modal) modal.classList.remove('active');
  },

  selectTripForTx(tripId) {
    const tripIdInput = document.getElementById('tx-trip-id-input');
    const tripNameDisplay = document.getElementById('tx-trip-name-display');
    const tripClearBtn = document.getElementById('btn-clear-tx-trip');

    if (tripId) {
      const trip = this.getTripFromCache(tripId);
      if (trip) {
        if (tripIdInput) tripIdInput.value = trip.id;
        if (tripNameDisplay) {
          tripNameDisplay.textContent = trip.name;
          tripNameDisplay.classList.add('has-trip');
        }
        if (tripClearBtn) tripClearBtn.style.display = 'inline-flex';

        // Gợi ý thành viên của chuyến đi vào Chi cho ai
        if (trip.members && trip.members.length > 0) {
          const payeeDisplay = document.getElementById('tx-payee-display');
          const personInput = document.getElementById('tx-person-input');
          const currentPerson = personInput?.value;

          // Nếu chưa nhập người tham gia thì tự động lấy thành viên chuyến đi
          if (!currentPerson || !currentPerson.trim()) {
            const memberNames = trip.members.join(', ');
            if (personInput) personInput.value = memberNames;
            if (payeeDisplay) payeeDisplay.textContent = memberNames;
          }
        }
      }
    } else {
      if (tripIdInput) tripIdInput.value = '';
      if (tripNameDisplay) {
        tripNameDisplay.textContent = 'Chưa chọn chuyến đi';
        tripNameDisplay.classList.remove('has-trip');
      }
      if (tripClearBtn) tripClearBtn.style.display = 'none';
    }

    this.closeTripPicker();
  },

  clearTripSelection(e) {
    if (e) e.stopPropagation();
    this.selectTripForTx(null);
  }
};

window.UITrips = UITrips;
