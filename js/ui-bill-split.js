/**
 * SỔ THU CHI - TÍNH NĂNG CHIA TIỀN NHÓM (BILL SPLIT)
 * Hỗ trợ chia tiền nhóm nhanh chóng, kết hợp "Chi cho ai" trong ghi chép giao dịch,
 * chia đều / tuỳ chỉnh / chia theo phần, tự động tính bù trừ nợ và sao chép gửi Zalo/Messenger.
 */

const UIBillSplit = {
  currentParticipants: [], // ['Tôi', 'Nam', 'Hoàng', ...]
  splitType: 'equal', // 'equal' | 'custom' | 'shares'
  payer: 'Tôi',
  totalAmount: 0,
  customAmounts: {}, // { 'Nam': 150000, 'Hoàng': 200000 }
  customShares: {}, // { 'Nam': 1, 'Hoàng': 2 }
  mode: 'standalone', // 'standalone' | 'transaction'
  tripMembersCache: [],
  openedFrom: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    // Event listeners if needed
  },

  /**
   * Khởi tạo trang chia tiền độc lập (Dedicated Sub-page trong Cài Đặt)
   */
  initStandalonePage(prefillAmount = 0, defaultTitle = '') {
    this.mode = 'standalone';
    if (prefillAmount && Number(prefillAmount) > 0) {
      this.totalAmount = Number(prefillAmount);
    }
    this.payer = this.payer || 'Tôi';
    this.splitType = this.splitType || 'equal';
    this.customAmounts = this.customAmounts || {};
    this.customShares = this.customShares || {};

    if (!this.currentParticipants || this.currentParticipants.length === 0) {
      this.currentParticipants = ['Tôi', 'Bạn 1', 'Bạn 2'];
    }

    const titleInput = document.getElementById('split-title-input');
    const amountInput = document.getElementById('split-amount-input');
    if (titleInput && defaultTitle) titleInput.value = defaultTitle;
    if (amountInput && this.totalAmount > 0) {
      amountInput.value = this.totalAmount;
    }

    this.renderModal();
  },

  /**
   * Mở trang chia tiền nhóm độc lập (Dedicated Page) thay vì modal popup
   */
  openStandalonePage(prefillAmount = 0, defaultTitle = '') {
    if (window.app) {
      window.app.switchView('bill-split');
    }
    this.initStandalonePage(prefillAmount, defaultTitle);
  },

  /**
   * Tương thích ngược: Mở trang chia tiền từ mục Tiện ích (Standalone)
   */
  openStandaloneModal(prefillAmount = 0, defaultTitle = '') {
    this.openStandalonePage(prefillAmount, defaultTitle);
  },

  /**
   * Mở modal chia tiền từ form Thêm/Sửa giao dịch (Kết hợp "Chi cho ai")
   */
  openFromTransaction() {
    this.mode = 'transaction';
    const amountVal = Number(document.getElementById('tx-amount-input')?.value || 0);
    this.totalAmount = amountVal;
    this.payer = 'Tôi';

    // Lấy thông tin người tham gia hiện tại từ form thu chi nếu có
    const currentPerson = document.getElementById('tx-person-input')?.value || '';
    const splitDataStr = document.getElementById('tx-split-data-input')?.value || '';

    if (splitDataStr) {
      try {
        const parsed = JSON.parse(splitDataStr);
        if (parsed.participants && parsed.participants.length > 0) {
          this.currentParticipants = [...parsed.participants];
          this.splitType = parsed.splitType || 'equal';
          this.payer = parsed.payer || 'Tôi';
          this.customAmounts = parsed.customAmounts || {};
          this.customShares = parsed.customShares || {};
        }
      } catch (_) {}
    } else if (currentPerson && currentPerson.trim()) {
      const names = currentPerson.split(',').map(n => n.trim()).filter(Boolean);
      if (!names.includes('Tôi')) names.unshift('Tôi');
      this.currentParticipants = names;
    } else {
      // Nếu có chọn Chuyến đi sự kiện, lấy danh sách thành viên của chuyến đi
      const selectedTripId = document.getElementById('tx-trip-id-input')?.value;
      if (selectedTripId && window.UITrips) {
        const trip = window.UITrips.getTripFromCache(selectedTripId);
        if (trip && trip.members && trip.members.length > 0) {
          this.currentParticipants = [...trip.members];
        } else {
          this.currentParticipants = ['Tôi', 'Bạn A', 'Bạn B'];
        }
      } else {
        this.currentParticipants = ['Tôi', 'Bạn A', 'Bạn B'];
      }
    }

    const noteVal = document.getElementById('tx-note-input')?.value || '';
    if (window.app) window.app.switchView('bill-split');
    this.initStandalonePage(this.totalAmount, noteVal || 'Chi tiêu nhóm');
    this.mode = 'transaction';
  },

  closeModal() {
    if (window.app && window.app.currentView === 'bill-split') {
      window.app.goBack();
      return;
    }
    const modal = document.getElementById('modal-bill-split');
    if (modal) {
      modal.classList.remove('open');
      modal.classList.remove('active');
    }
  },

  addParticipant(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    if (!this.currentParticipants.includes(trimmed)) {
      this.currentParticipants.push(trimmed);
      this.renderModal();
    }
  },

  removeParticipant(index) {
    if (this.currentParticipants.length <= 1) {
      showToast('Cần ít nhất 1 người tham gia', 'warning');
      return;
    }
    const removed = this.currentParticipants[index];
    this.currentParticipants.splice(index, 1);
    delete this.customAmounts[removed];
    delete this.customShares[removed];

    if (this.payer === removed) {
      this.payer = this.currentParticipants[0] || 'Tôi';
    }
    this.renderModal();
  },

  handleAmountChange(val) {
    const num = Number(String(val).replace(/\D/g, '')) || 0;
    this.totalAmount = num;
    this.calculateAndRenderResults();
  },

  setSplitType(type) {
    this.splitType = type;
    this.renderModal();
  },

  setPayer(name) {
    this.payer = name;
    this.calculateAndRenderResults();
  },

  handleCustomAmountInput(name, val) {
    const num = Number(String(val).replace(/\D/g, '')) || 0;
    this.customAmounts[name] = num;
    this.calculateAndRenderResults();
  },

  handleCustomShareInput(name, val) {
    const num = Math.max(1, Number(val) || 1);
    this.customShares[name] = num;
    this.calculateAndRenderResults();
  },

  renderModal() {
    const participantsContainer = document.getElementById('split-participants-tags');
    const payerSelect = document.getElementById('split-payer-select');
    const splitTypeTabs = document.querySelectorAll('.split-type-tab');

    // Cập nhật tab kiểu chia
    if (splitTypeTabs) {
      splitTypeTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.type === this.splitType);
      });
    }

    // Render tags người tham gia
    if (participantsContainer) {
      participantsContainer.innerHTML = this.currentParticipants.map((p, idx) => `
        <span class="split-member-tag">
          <span class="split-member-name">${escapeHTML(p)}</span>
          <button type="button" class="btn-remove-tag" onclick="UIBillSplit.removeParticipant(${idx})" title="Xóa">
            <i data-lucide="x" style="width: 12px; height: 12px;"></i>
          </button>
        </span>
      `).join('');
    }

    // Render danh sách chọn người trả tiền
    if (payerSelect) {
      payerSelect.innerHTML = this.currentParticipants.map(p => `
        <option value="${escapeHTML(p)}" ${p === this.payer ? 'selected' : ''}>${escapeHTML(p)}</option>
      `).join('');
    }

    this.calculateAndRenderResults();
    if (window.lucide) lucide.createIcons();
  },

  calculateBreakdown() {
    const total = this.totalAmount || 0;
    const count = this.currentParticipants.length || 1;
    const result = {};

    if (this.splitType === 'equal') {
      // Chia đều
      const perPerson = Math.round(total / count);
      let runningSum = 0;
      this.currentParticipants.forEach((p, idx) => {
        if (idx === count - 1) {
          result[p] = total - runningSum; // Làm tròn khoản thừa/thiếu vào người cuối
        } else {
          result[p] = perPerson;
          runningSum += perPerson;
        }
      });
    } else if (this.splitType === 'shares') {
      // Chia theo phần
      let totalShares = 0;
      this.currentParticipants.forEach(p => {
        totalShares += (this.customShares[p] || 1);
      });
      if (totalShares <= 0) totalShares = count;

      let runningSum = 0;
      this.currentParticipants.forEach((p, idx) => {
        const share = this.customShares[p] || 1;
        if (idx === count - 1) {
          result[p] = total - runningSum;
        } else {
          const part = Math.round((total * share) / totalShares);
          result[p] = part;
          runningSum += part;
        }
      });
    } else {
      // Chia tuỳ chỉnh số tiền
      this.currentParticipants.forEach(p => {
        result[p] = this.customAmounts[p] || 0;
      });
    }

    return result;
  },

  calculateAndRenderResults() {
    const breakdown = this.calculateBreakdown();
    const listContainer = document.getElementById('split-breakdown-list');
    const summaryBox = document.getElementById('split-summary-box');
    const copyBtn = document.getElementById('btn-split-copy');
    const total = this.totalAmount || 0;

    if (!listContainer) return;

    let html = '';

    this.currentParticipants.forEach(p => {
      const shareVal = breakdown[p] || 0;
      const isPayer = (p === this.payer);

      let customInputHtml = '';
      if (this.splitType === 'custom') {
        customInputHtml = `
          <div class="split-custom-input-wrap">
            <input type="text" inputmode="numeric" class="form-control split-custom-input" 
              value="${shareVal > 0 ? new Intl.NumberFormat('vi-VN').format(shareVal) : ''}" 
              placeholder="0"
              oninput="UIBillSplit.handleCustomAmountInput('${escapeHTML(p)}', this.value)">
            <span class="split-cur-suffix">đ</span>
          </div>
        `;
      } else if (this.splitType === 'shares') {
        const curShare = this.customShares[p] || 1;
        customInputHtml = `
          <div class="split-shares-input-wrap">
            <input type="number" min="1" max="100" class="form-control split-shares-input" 
              value="${curShare}" 
              oninput="UIBillSplit.handleCustomShareInput('${escapeHTML(p)}', this.value)">
            <span class="split-cur-suffix">phần</span>
          </div>
        `;
      }

      html += `
        <div class="split-row-item ${isPayer ? 'is-payer' : ''}">
          <div class="split-row-left">
            <div class="split-avatar">${escapeHTML(p.charAt(0).toUpperCase())}</div>
            <div class="split-row-names">
              <span class="split-row-name">${escapeHTML(p)}</span>
              ${isPayer ? `<span class="split-payer-badge">Đã trả cả bill</span>` : ''}
            </div>
          </div>
          <div class="split-row-right">
            ${customInputHtml}
            <div class="split-row-val ${shareVal > 0 ? 'text-primary' : ''}">
              ${new Intl.NumberFormat('vi-VN').format(shareVal)}đ
            </div>
          </div>
        </div>
      `;
    });

    listContainer.innerHTML = html;

    // Hiển thị tóm tắt ai cần chuyển cho ai
    if (summaryBox) {
      const debtsToPay = [];
      this.currentParticipants.forEach(p => {
        if (p !== this.payer) {
          const amt = breakdown[p] || 0;
          if (amt > 0) {
            debtsToPay.push(`${p} chuyển cho ${this.payer}: <b>${new Intl.NumberFormat('vi-VN').format(amt)}đ</b>`);
          }
        }
      });

      if (debtsToPay.length > 0 && total > 0) {
        summaryBox.innerHTML = `
          <div class="split-summary-title"><i data-lucide="arrow-right-left" style="width: 14px; height: 14px;"></i> Thanh toán bù trừ:</div>
          <ul class="split-summary-debts">
            ${debtsToPay.map(d => `<li>${d}</li>`).join('')}
          </ul>
        `;
        summaryBox.style.display = 'block';
      } else {
        summaryBox.style.display = 'none';
      }
    }

    if (window.lucide) lucide.createIcons();
  },

  /**
   * Tạo văn bản chia tiền đẹp mắt để gửi Zalo / Messenger
   */
  generateShareText() {
    const title = document.getElementById('split-title-input')?.value?.trim() || 'Chia tiền nhóm';
    const total = this.totalAmount || 0;
    const breakdown = this.calculateBreakdown();

    let text = `💸 BẢNG CHIA TIỀN: ${title.toUpperCase()}\n`;
    text += `💰 Tổng bill: ${new Intl.NumberFormat('vi-VN').format(total)}đ\n`;
    text += `👤 Người thanh toán: ${this.payer}\n`;
    text += `--------------------------\n`;
    text += `📋 Chi tiết từng người:\n`;

    this.currentParticipants.forEach(p => {
      const amt = breakdown[p] || 0;
      text += `• ${p}: ${new Intl.NumberFormat('vi-VN').format(amt)}đ\n`;
    });

    text += `--------------------------\n`;
    text += `🔄 Cần chuyển khoản:\n`;
    this.currentParticipants.forEach(p => {
      if (p !== this.payer) {
        const amt = breakdown[p] || 0;
        if (amt > 0) {
          text += `👉 ${p} ➔ ${this.payer}: ${new Intl.NumberFormat('vi-VN').format(amt)}đ\n`;
        }
      }
    });

    return text;
  },

  async copyShareText() {
    const text = this.generateShareText();
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
      showToast('Đã sao chép bảng chia tiền! Dán vào Zalo/Messenger', 'success');
    } catch (e) {
      showToast('Không thể sao chép tự động', 'error');
    }
  },

  /**
   * Áp dụng kết quả chia tiền vào Form Giao dịch (view-new-transaction)
   */
  applyToTransactionForm() {
    const breakdown = this.calculateBreakdown();
    const participantNames = this.currentParticipants.join(', ');

    // Cập nhật trường "Chi cho ai"
    const payeeDisplay = document.getElementById('tx-payee-display');
    const personInput = document.getElementById('tx-person-input');
    const splitDataInput = document.getElementById('tx-split-data-input');
    const autoCreateDebtCheckbox = document.getElementById('split-auto-debt-checkbox');

    if (personInput) personInput.value = participantNames;
    if (payeeDisplay) {
      payeeDisplay.textContent = participantNames || 'Chưa chọn ai';
    }

    // Lưu chi tiết chia tiền vào input ẩn để lưu cùng transaction
    if (splitDataInput) {
      splitDataInput.value = JSON.stringify({
        participants: this.currentParticipants,
        splitType: this.splitType,
        payer: this.payer,
        breakdown,
        customAmounts: this.customAmounts,
        customShares: this.customShares,
        autoCreateDebt: !!(autoCreateDebtCheckbox && autoCreateDebtCheckbox.checked)
      });
    }

    // Nếu số tiền chia khác 0 và khác form, cập nhật lại form
    if (this.totalAmount > 0) {
      const curTxAmount = Number(document.getElementById('tx-amount-input')?.value || 0);
      if (curTxAmount === 0 && window.UITransactions) {
        document.getElementById('tx-amount-input').value = this.totalAmount;
        document.getElementById('tx-amount-text').textContent = new Intl.NumberFormat('vi-VN').format(this.totalAmount);
      }
    }

    showToast('Đã áp dụng người tham gia & chia tiền vào giao dịch', 'success');
    this.closeModal();
  },

  /**
   * Lưu lại một đợt chia tiền độc lập (Standalone) vào Sổ Thu Chi
   */
  async saveStandaloneRecord() {
    const title = document.getElementById('split-title-input')?.value?.trim() || 'Chia tiền nhóm';
    const total = this.totalAmount || 0;
    const breakdown = this.calculateBreakdown();
    const autoCreateDebtCheckbox = document.getElementById('split-auto-debt-checkbox');
    const shouldCreateDebt = autoCreateDebtCheckbox && autoCreateDebtCheckbox.checked;

    if (total <= 0) {
      showToast('Vui lòng nhập số tiền cần chia', 'error');
      return;
    }

    try {
      // 1. Lưu bản ghi split vào bảng db.splits
      const splitId = await saveSplit({
        title,
        totalAmount: total,
        paidBy: this.payer,
        splitType: this.splitType,
        participants: this.currentParticipants,
        breakdown,
        status: 'active'
      });

      // 2. Nếu người dùng chọn tự động tạo nợ cần thu trong Sổ Nợ
      if (shouldCreateDebt && this.payer === 'Tôi') {
        const defaultAcc = (await db.accounts.where('isDeleted').equals(0).toArray())[0];
        const accId = defaultAcc ? defaultAcc.id : 1;
        const todayStr = new Date().toISOString().split('T')[0];

        for (const p of this.currentParticipants) {
          if (p !== 'Tôi') {
            const amt = breakdown[p] || 0;
            if (amt > 0) {
              await db.debts.add({
                type: 'lend', // Tôi cho người khác vay / người khác nợ tôi
                personName: p,
                originalAmount: amt,
                remainingAmount: amt,
                dueDate: '',
                accountId: accId,
                note: `Chia tiền: ${title}`,
                status: 'active',
                isDeleted: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
              });
            }
          }
        }
        showToast('Đã lưu & tạo các khoản nợ cần thu vào Sổ Nợ!', 'success');
      } else {
        showToast('Đã lưu đợt chia tiền thành công!', 'success');
      }

      this.closeModal();
      if (window.app) window.app.refreshAll();
    } catch (e) {
      console.warn('saveStandaloneRecord error:', e);
      showToast('Lỗi khi lưu đợt chia tiền', 'error');
    }
  }
};

window.UIBillSplit = UIBillSplit;
