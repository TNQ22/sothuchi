/**
 * SỔ THU CHI - UI ACCOUNTS & WALLETS MODULE
 * Quản lý các ví tiền, ngân hàng, số dư thực tế và tài sản ròng
 * Hỗ trợ hiển thị dạng list, menu 3 chấm tùy chọn, sắp xếp thứ tự và xem lịch sử thu chi
 */

const UIAccounts = {
  activeStatementAccountId: null,

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

    // Close account dropdown menus on click outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.account-menu-wrapper')) {
        this.closeAllMenus();
      }
    });
  },

  toggleMenu(accId, e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById(`account-menu-${accId}`);
    if (!menu) return;
    const wasOpen = menu.classList.contains('open');
    this.closeAllMenus();
    if (!wasOpen) {
      menu.classList.add('open');
    }
  },

  closeAllMenus() {
    document.querySelectorAll('.account-dropdown-menu.open').forEach(el => el.classList.remove('open'));
  },

  async viewAccountHistory(accId) {
    this.closeAllMenus();
    if (window.UITransactions && typeof window.UITransactions.filterByAccount === 'function') {
      await window.UITransactions.filterByAccount(accId);
    } else {
      if (window.app) window.app.switchView('transactions');
    }
  },

  async startTransfer(accId) {
    this.closeAllMenus();
    if (window.app) window.app.switchView('new-transaction');
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
    this.closeAllMenus();
    if (window.app) window.app.switchView('new-transaction');
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
    this.closeAllMenus();
    const acc = await db.accounts.get(Number(accId));
    if (!acc) return;
    if (!confirm(`Bạn có chắc chắn muốn xóa ví "${acc.name}"? Tất cả giao dịch cũ vẫn được lưu trong sổ.`)) return;

    await db.accounts.update(Number(accId), { isDeleted: 1, updatedAt: Date.now() });
    await window.app.refreshAll();
    showToast(`Đã xóa ví "${acc.name}"`, 'info');
  },

  async toggleArchiveAccount(accId) {
    this.closeAllMenus();
    const acc = await db.accounts.get(Number(accId));
    if (!acc) return;

    const isArchived = acc.isArchived ? 0 : 1;
    await db.accounts.update(Number(accId), { isArchived, updatedAt: Date.now() });
    await window.app.refreshAll();
    showToast(isArchived ? `Đã ngừng sử dụng ví "${acc.name}"` : `Đã kích hoạt lại ví "${acc.name}"`, 'success');
  },

  async openStatementHistory(accId) {
    this.closeAllMenus();
    const acc = await db.accounts.get(Number(accId));
    if (!acc) return;

    this.activeStatementAccountId = Number(accId);
    const modal = document.getElementById('modal-account-statement');
    const title = document.getElementById('statement-modal-title');
    const subtitle = document.getElementById('statement-modal-subtitle');
    const countBadge = document.getElementById('statement-count-badge');
    const list = document.getElementById('statement-history-list');

    if (title) title.textContent = `Sao Kê: ${acc.name}`;
    if (subtitle) subtitle.textContent = `Loại: ${acc.type === 'bank' ? 'Ngân hàng' : 'Ví'} • Số dư hiện tại: ${new Intl.NumberFormat('vi-VN').format(acc.balance)}đ`;

    const logKey = `statement_logs_${accId}`;
    const logRecord = await db.settings.get(logKey);
    const logs = (logRecord && Array.isArray(logRecord.value)) ? logRecord.value : [];

    if (countBadge) countBadge.textContent = `${logs.length} đợt`;

    if (list) {
      if (logs.length === 0) {
        list.innerHTML = `
          <div style="text-align: center; padding: 24px 12px; color: var(--text-muted); background: var(--bg-surface); border-radius: var(--radius-sm); border: 1px dashed var(--border-color);">
            <i data-lucide="inbox" style="width: 28px; height: 28px; margin: 0 auto 6px; opacity: 0.5;"></i>
            <p style="font-size: 0.85rem; font-weight: 500; margin-bottom: 2px;">Chưa có file sao kê nào</p>
            <p style="font-size: 0.75rem;">Bấm nút "Chọn File Sao Kê CSV" ở trên để nhập dữ liệu ngân hàng</p>
          </div>
        `;
      } else {
        list.innerHTML = logs.map(l => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
            <div>
              <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary);">${escapeHTML(l.filename || 'Sao kê')}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${new Date(l.importedAt).toLocaleString('vi-VN')} • +${l.count} giao dịch</div>
            </div>
            <span style="font-size: 0.75rem; color: #10b981; font-weight: 600; background: rgba(16, 185, 129, 0.12); padding: 2px 8px; border-radius: 4px;">Thành công</span>
          </div>
        `).join('');
      }
    }

    if (modal) modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeStatementModal() {
    const modal = document.getElementById('modal-account-statement');
    if (modal) modal.classList.remove('open');
    this.activeStatementAccountId = null;
    const fileInput = document.getElementById('statement-file-input');
    if (fileInput) fileInput.value = '';
  },

  async handleStatementFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file || !this.activeStatementAccountId) return;

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length <= 1) {
        showToast('File CSV không có dữ liệu giao dịch', 'warning');
        return;
      }

      let importedCount = 0;
      const now = Date.now();
      const accId = this.activeStatementAccountId;

      const headerLine = lines[0].toLowerCase();
      const isCustomExport = headerLine.includes('mã gd') || headerLine.includes('loại giao dịch');

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim().replace(/^"(.*)"$/, '$1'));
        if (parts.length < 3) continue;

        let dateStr = new Date().toISOString().split('T')[0];
        let amount = 0;
        let note = 'Sao kê: ' + file.name;
        let type = 'expense';

        if (isCustomExport) {
          dateStr = parts[1] || dateStr;
          const typeStr = parts[3] || '';
          type = typeStr.includes('Thu') ? 'income' : (typeStr.includes('Chuyển') ? 'transfer' : 'expense');
          amount = Math.abs(Number(parts[4])) || 0;
          note = parts[8] || note;
        } else {
          if (/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
            dateStr = parts[0];
          }
          const rawAmt = Number(parts[parts.length - 1].replace(/[^0-9.-]/g, '')) || 0;
          if (rawAmt > 0) {
            amount = rawAmt;
            type = 'income';
          } else if (rawAmt < 0) {
            amount = Math.abs(rawAmt);
            type = 'expense';
          } else {
            amount = Number(parts[1].replace(/[^0-9.-]/g, '')) || 0;
          }
          note = parts.slice(1, parts.length - 1).join(' - ') || note;
        }

        if (amount > 0) {
          await db.transactions.add({
            type,
            amount,
            date: dateStr,
            time: '00:00',
            accountId: accId,
            categoryId: null,
            note: note.slice(0, 100),
            isDeleted: 0,
            createdAt: now,
            updatedAt: now
          });

          const acc = await db.accounts.get(accId);
          if (acc) {
            const newBal = type === 'income' ? (acc.balance + amount) : (acc.balance - amount);
            await db.accounts.update(accId, { balance: newBal, updatedAt: now });
          }
          importedCount++;
        }
      }

      if (importedCount > 0) {
        const logKey = `statement_logs_${accId}`;
        const logRecord = await db.settings.get(logKey);
        const logs = (logRecord && Array.isArray(logRecord.value)) ? logRecord.value : [];
        logs.unshift({
          filename: file.name,
          importedAt: now,
          count: importedCount
        });
        await db.settings.put({ key: logKey, value: logs });

        showToast(`Đã nhập thành công ${importedCount} giao dịch từ sao kê`, 'success');
        this.openStatementHistory(accId);
        await window.app.refreshAll();
      } else {
        showToast('Không tìm thấy giao dịch hợp lệ trong file', 'warning');
      }
    } catch (err) {
      console.error(err);
      showToast('Lỗi khi đọc file sao kê: ' + err.message, 'error');
    }
  },

  async openAddModal() {
    const modal = document.getElementById('modal-account');
    const form = document.getElementById('account-form');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('acc-id-input').value = '';
    const delBtn = document.getElementById('btn-delete-account');
    if (delBtn) delBtn.style.display = 'none';

    modal.classList.add('open');
    setTimeout(() => document.getElementById('acc-name-input')?.focus(), 150);
  },

  closeModal() {
    const modal = document.getElementById('modal-account');
    if (modal) modal.classList.remove('open');
  },

  async handleFormSubmit() {
    const id = document.getElementById('acc-id-input').value;
    const name = document.getElementById('acc-name-input').value.trim();
    const type = document.getElementById('acc-type-select').value;
    const balance = Number(document.getElementById('acc-balance-input').value) || 0;

    if (!name) {
      showToast('Vui lòng nhập tên ví / tài khoản', 'error');
      return;
    }

    const now = Date.now();
    if (id) {
      await db.accounts.update(Number(id), { name, type, balance, updatedAt: now });
      showToast('Đã cập nhật thông tin ví', 'success');
    } else {
      let icon = 'wallet';
      if (type === 'bank') icon = 'landmark';
      if (type === 'ewallet') icon = 'smartphone';
      if (type === 'credit') icon = 'credit-card';
      if (type === 'saving') icon = 'piggy-bank';

      const existing = await db.accounts.where('isDeleted').equals(0).toArray();
      const maxOrder = existing.reduce((max, a) => Math.max(max, a.order ?? 0), -1);
      const newOrder = maxOrder + 1;

      await db.accounts.add({
        name,
        type,
        balance,
        initialBalance: balance,
        icon,
        color: '#4f46e5',
        order: newOrder,
        isDeleted: 0,
        isArchived: 0,
        updatedAt: now
      });
      showToast('Đã tạo ví mới', 'success');
    }

    this.closeModal();
    await window.app.refreshAll();
  },

  async openEditModal(accId) {
    this.closeAllMenus();
    const acc = await db.accounts.get(Number(accId));
    if (!acc) return;

    const modal = document.getElementById('modal-account');
    if (!modal) return;

    document.getElementById('acc-id-input').value = acc.id;
    document.getElementById('acc-name-input').value = acc.name;
    document.getElementById('acc-type-select').value = acc.type;
    document.getElementById('acc-balance-input').value = acc.balance;

    const delBtn = document.getElementById('btn-delete-account');
    if (delBtn) delBtn.style.display = 'block';

    modal.classList.add('open');
  },

  async handleDeleteAccount() {
    const id = document.getElementById('acc-id-input').value;
    if (!id) return;
    if (!confirm('Bạn có chắc muốn xóa ví này? Tất cả giao dịch cũ vẫn được lưu trong sổ.')) return;

    await db.accounts.update(Number(id), { isDeleted: 1, updatedAt: Date.now() });
    this.closeModal();
    await window.app.refreshAll();
    showToast('Đã xóa ví', 'info');
  },

  async moveAccount(id, direction) {
    const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
    accounts.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));

    const index = accounts.findIndex(a => a.id === Number(id));
    if (index === -1) return;

    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= accounts.length) return;

    // Swap items
    const temp = accounts[index];
    accounts[index] = accounts[targetIndex];
    accounts[targetIndex] = temp;

    // Update order for all
    const now = Date.now();
    for (let i = 0; i < accounts.length; i++) {
      await db.accounts.update(accounts[i].id, { order: i, updatedAt: now });
    }

    await this.render();
    if (window.UITransactions && typeof window.UITransactions.populateAccounts === 'function') {
      await window.UITransactions.populateAccounts();
    }
    showToast('Đã cập nhật vị trí ví', 'success');
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
    showToast('Đã sắp xếp lại thứ tự ví', 'success');
  },

  setupDragAndDrop(container) {
    let draggedItem = null;

    container.querySelectorAll('.account-list-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.id);
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        container.querySelectorAll('.account-list-item').forEach(el => el.classList.remove('drag-over'));
        draggedItem = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedItem && draggedItem !== item) {
          item.classList.add('drag-over');
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        if (!draggedItem || draggedItem === item) return;
        const fromId = Number(draggedItem.dataset.id);
        const toId = Number(item.dataset.id);
        await this.reorderAccounts(fromId, toId);
      });
    });
  },

  async render() {
    const container = document.getElementById('accounts-list-container');
    if (!container) return;

    const accounts = await db.accounts.where('isDeleted').equals(0).toArray();
    accounts.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));

    if (accounts.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
          <i data-lucide="wallet" style="width: 40px; height: 40px; margin: 0 auto 12px; opacity: 0.5;"></i>
          <p style="font-weight: 600; margin-bottom: 4px;">Chưa có ví nào</p>
          <p style="font-size: 0.85rem;">Bấm "Thêm Ví Mới" ở trên để bắt đầu quản lý số dư</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const iconMap = {
      cash: { icon: 'wallet', color: '#10b981', label: 'Tiền mặt' },
      bank: { icon: 'landmark', color: '#4f46e5', label: 'Ngân hàng' },
      ewallet: { icon: 'smartphone', color: '#ec4899', label: 'Ví điện tử' },
      credit: { icon: 'credit-card', color: '#f59e0b', label: 'Thẻ tín dụng' },
      saving: { icon: 'piggy-bank', color: '#0ea5e9', label: 'Sổ tiết kiệm' }
    };

    let html = '';
    accounts.forEach((a, index) => {
      const info = iconMap[a.type] || { icon: a.icon || 'wallet', color: a.color || '#4f46e5', label: 'Tài khoản' };
      const iconName = a.icon || info.icon;
      const isDefault = index === 0;
      const isArchived = !!a.isArchived;

      html += `
        <div class="account-list-item ${isArchived ? 'archived' : ''}" draggable="true" data-id="${a.id}" data-index="${index}">
          <div class="account-drag-handle" title="Kéo để sắp xếp vị trí">
            <i data-lucide="grip-vertical" style="width: 16px; height: 16px;"></i>
          </div>
          
          <div class="account-item-main" onclick="UIAccounts.viewAccountHistory(${a.id})" title="Bấm để xem lịch sử thu chi của ví">
            <div class="account-icon-bubble" style="background: ${info.color}22; color: ${info.color};">
              <i data-lucide="${iconName}" style="width: 18px; height: 18px;"></i>
            </div>
            <div class="account-info">
              <span class="account-name" title="${escapeHTML(a.name)}">${escapeHTML(a.name)}</span>
              <div class="account-sub-row">
                <span class="account-type-label">${info.label}</span>
                ${isDefault ? '<span class="account-default-badge" title="Ví mặc định"><i data-lucide="check-circle-2" style="width:12px;height:12px;"></i></span>' : ''}
                ${isArchived ? '<span class="account-archived-badge" title="Đã ngừng sử dụng">Ngừng sử dụng</span>' : ''}
              </div>
            </div>
            <div class="account-balance-wrapper">
              <span class="account-balance ${a.balance < 0 ? 'expense-text' : ''}">${new Intl.NumberFormat('vi-VN').format(a.balance)}đ</span>
            </div>
          </div>

          <div class="account-menu-wrapper" onclick="event.stopPropagation();">
            <button type="button" class="account-menu-btn" onclick="UIAccounts.toggleMenu(${a.id}, event)" title="Tùy chọn ví">
              <i data-lucide="more-vertical" style="width: 16px; height: 16px;"></i>
            </button>
            <div class="account-dropdown-menu" id="account-menu-${a.id}">
              <div class="account-dropdown-item" onclick="UIAccounts.openStatementHistory(${a.id})">
                <i data-lucide="file-text" style="width: 16px; height: 16px; color: var(--primary);"></i>
                <span>Lịch sử nhập sao kê</span>
              </div>
              <div class="account-dropdown-item" onclick="UIAccounts.startTransfer(${a.id})">
                <i data-lucide="arrow-right-left" style="width: 16px; height: 16px; color: #0ea5e9;"></i>
                <span>Chuyển khoản</span>
              </div>
              <div class="account-dropdown-item" onclick="UIAccounts.startAdjust(${a.id})">
                <i data-lucide="scale" style="width: 16px; height: 16px; color: #f59e0b;"></i>
                <span>Điều chỉnh số dư</span>
              </div>
              <div class="account-dropdown-item" onclick="UIAccounts.openEditModal(${a.id})">
                <i data-lucide="edit-3" style="width: 16px; height: 16px; color: #8b5cf6;"></i>
                <span>Chỉnh sửa</span>
              </div>
              <div class="account-dropdown-divider"></div>
              <div class="account-dropdown-item" onclick="UIAccounts.toggleArchiveAccount(${a.id})">
                <i data-lucide="${isArchived ? 'rotate-ccw' : 'power'}" style="width: 16px; height: 16px; color: var(--text-muted);"></i>
                <span>${isArchived ? 'Kích hoạt lại' : 'Ngừng sử dụng'}</span>
              </div>
              <div class="account-dropdown-item danger" onclick="UIAccounts.confirmDeleteAccount(${a.id})">
                <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                <span>Xóa</span>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    this.setupDragAndDrop(container);
    if (window.lucide) lucide.createIcons();
  }
};

window.UIAccounts = UIAccounts;
