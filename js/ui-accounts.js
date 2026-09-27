/**
 * SỔ THU CHI - UI ACCOUNTS & WALLETS MODULE
 * Quản lý các ví tiền, ngân hàng, số dư thực tế và tài sản ròng
 * Hỗ trợ hiển thị dạng list ngang và di chuyển, sắp xếp thứ tự
 */

const UIAccounts = {
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
        updatedAt: now
      });
      showToast('Đã tạo ví mới', 'success');
    }

    this.closeModal();
    window.app.refreshAll();
  },

  async openEditModal(accId) {
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
    window.app.refreshAll();
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
      bank: { icon: 'landmark', color: '#4f46e5', label: 'Tài khoản Ngân hàng' },
      ewallet: { icon: 'smartphone', color: '#ec4899', label: 'Ví điện tử' },
      credit: { icon: 'credit-card', color: '#f59e0b', label: 'Thẻ tín dụng' },
      saving: { icon: 'piggy-bank', color: '#0ea5e9', label: 'Sổ tiết kiệm' }
    };

    let html = '';
    accounts.forEach((a, index) => {
      const info = iconMap[a.type] || { icon: a.icon || 'wallet', color: a.color || '#4f46e5', label: 'Tài khoản' };
      const iconName = a.icon || info.icon;
      const isDefault = index === 0;

      html += `
        <div class="account-list-item" draggable="true" data-id="${a.id}" data-index="${index}">
          <div class="account-drag-handle" title="Kéo để sắp xếp vị trí">
            <i data-lucide="grip-vertical" style="width: 16px; height: 16px;"></i>
          </div>
          
          <div class="account-item-main" onclick="UIAccounts.openEditModal(${a.id})" title="Bấm để xem hoặc sửa ví">
            <div class="account-icon-bubble" style="background: ${info.color}22; color: ${info.color};">
              <i data-lucide="${iconName}" style="width: 18px; height: 18px;"></i>
            </div>
            <div class="account-info">
              <span class="account-name" title="${escapeHTML(a.name)}">${escapeHTML(a.name)}</span>
              <div class="account-sub-row">
                <span class="account-type-label">${info.label}</span>
                ${isDefault ? '<span class="account-default-badge" title="Ví mặc định"><i data-lucide="check-circle-2" style="width:12px;height:12px;"></i></span>' : ''}
              </div>
            </div>
            <div class="account-balance-wrapper">
              <span class="account-balance ${a.balance < 0 ? 'expense-text' : ''}">${new Intl.NumberFormat('vi-VN').format(a.balance)}đ</span>
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
