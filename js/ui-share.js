/**
 * SỔ THU CHI - UNIVERSAL SHARE & PERMISSION MANAGER
 * Module quản lý chia sẻ độc lập từng tài khoản/sổ theo dịch vụ sao lưu (Máy Chủ Riêng, Cloud)
 * Hỗ trợ:
 * - Chọn dịch vụ sao lưu khả dụng (Máy Chủ Riêng, Google Drive, Dropbox...)
 * - Chia sẻ theo Email Google (Chỉ xem / Chỉnh sửa)
 * - Chia sẻ theo Liên kết (Share Link) với token duy nhất
 * - Quản lý danh sách ai đang có phân quyền & Thu hồi quyền bất kỳ lúc nào
 * - Hỗ trợ tất cả loại tài khoản: Ví/Tài khoản, Sổ tiết kiệm, Sổ tích luỹ, Sổ vay, Quản lý tài sản
 */

const UniversalShareModal = {
  currentType: null, // 'account' | 'savings' | 'accumulation' | 'loan' | 'asset'
  currentId: null,
  currentItem: null,
  currentService: 'server',
  currentTab: 'email',
  services: [],
  shares: [],
  links: [],
  isLoading: false,

  async open(type, id) {
    this.currentType = type;
    this.currentId = Number(id);
    this.currentItem = null;
    this.currentService = 'server';
    this.currentTab = 'email';

    // 1. Lấy thông tin tài khoản / sổ từ IndexedDB
    try {
      if (type === 'account') {
        this.currentItem = await db.accounts.get(this.currentId);
      } else if (type === 'savings') {
        this.currentItem = db.savings ? await db.savings.get(this.currentId) : null;
      } else if (type === 'accumulation') {
        this.currentItem = db.accumulations ? await db.accumulations.get(this.currentId) : null;
      } else if (type === 'loan') {
        this.currentItem = db.loans ? await db.loans.get(this.currentId) : null;
      } else if (type === 'asset') {
        this.currentItem = db.assets ? await db.assets.get(this.currentId) : null;
      }
    } catch (e) {
      console.error('Lỗi lấy thông tin mục chia sẻ:', e);
    }

    if (!this.currentItem) {
      if (typeof showToast === 'function') showToast('Không tìm thấy mục cần chia sẻ.', 'error');
      return;
    }

    // 2. Hiển thị modal
    const modal = document.getElementById('modal-universal-share');
    if (!modal) return;

    this.renderHeader();
    this.renderServices();
    this.switchTab('email');
    modal.classList.add('open');

    if (window.lucide) lucide.createIcons();

    // 3. Tải danh sách dịch vụ và dữ liệu chia sẻ
    await this.loadServices();
    await this.loadShareData();
  },

  close() {
    const modal = document.getElementById('modal-universal-share');
    if (modal) modal.classList.remove('open');
  },

  getTypeLabel(type) {
    switch (type) {
      case 'account': return 'Tài khoản thanh toán';
      case 'savings': return 'Sổ tiết kiệm';
      case 'accumulation': return 'Sổ tích luỹ';
      case 'loan': return 'Sổ vay nợ';
      case 'asset': return 'Tài sản';
      default: return 'Tài khoản';
    }
  },

  getTypeIcon(type) {
    switch (type) {
      case 'account': return this.currentItem?.icon || 'wallet';
      case 'savings': return 'piggy-bank';
      case 'accumulation': return 'target';
      case 'loan': return 'badge-percent';
      case 'asset': return 'gem';
      default: return 'wallet';
    }
  },

  renderHeader() {
    const titleEl = document.getElementById('universal-share-item-title');
    const badgeEl = document.getElementById('universal-share-item-badge');
    const iconEl = document.getElementById('universal-share-item-icon');

    if (titleEl) titleEl.textContent = this.currentItem.name || 'Không có tên';
    if (badgeEl) badgeEl.textContent = this.getTypeLabel(this.currentType);
    if (iconEl) {
      iconEl.innerHTML = `<i data-lucide="${this.getTypeIcon(this.currentType)}"></i>`;
    }
  },

  async loadServices() {
    if (window.serverSyncService && typeof window.serverSyncService.getAvailableServices === 'function') {
      const data = await window.serverSyncService.getAvailableServices();
      this.services = data.services || [];
      this.renderServices();
    }
  },

  renderServices() {
    const container = document.getElementById('universal-share-services-list');
    if (!container) return;

    const isServerConnected = window.serverSyncService?.isConnected;

    const services = [
      {
        id: 'server',
        name: 'Máy Chủ Riêng (Self-Hosted)',
        statusText: isServerConnected ? 'Đang kết nối' : 'Chưa kết nối',
        isConnected: isServerConnected,
        supported: true,
        icon: 'server',
        desc: 'Hỗ trợ chia sẻ độc lập qua Email Google và Liên kết (Link) với phân quyền Chỉ xem / Chỉnh sửa.'
      },
      {
        id: 'google-drive',
        name: 'Google Drive',
        statusText: 'Sắp hỗ trợ',
        isConnected: false,
        supported: false,
        icon: 'cloud',
        desc: 'Sao lưu toàn bộ sổ vào Google Drive cá nhân. Chia sẻ độc lập từng tài khoản qua Drive đang hoàn thiện.'
      },
      {
        id: 'dropbox',
        name: 'Dropbox',
        statusText: 'Sắp hỗ trợ',
        isConnected: false,
        supported: false,
        icon: 'box',
        desc: 'Đồng bộ thư mục Dropbox chung. Chia sẻ độc lập từng tài khoản qua Dropbox đang hoàn thiện.'
      }
    ];

    let html = '';
    services.forEach(s => {
      const isSelected = this.currentService === s.id;
      html += `
        <div class="share-service-card ${isSelected ? 'selected' : ''} ${!s.supported ? 'disabled' : ''}"
             onclick="UniversalShareModal.switchService('${s.id}')">
          <div class="share-service-icon-wrap ${s.id}">
            <i data-lucide="${s.icon}"></i>
          </div>
          <div class="share-service-body">
            <div class="share-service-top-row">
              <span class="share-service-name">${s.name}</span>
              <span class="share-service-status-badge ${s.supported && s.isConnected ? 'connected' : (s.supported ? 'not-connected' : 'planned')}">
                ${s.statusText}
              </span>
            </div>
            <p class="share-service-desc">${s.desc}</p>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  switchService(serviceId) {
    this.currentService = serviceId;
    this.renderServices();

    const serverSection = document.getElementById('universal-share-server-section');
    const cloudNoticeSection = document.getElementById('universal-share-cloud-notice');

    if (serviceId === 'server') {
      if (serverSection) serverSection.style.display = 'block';
      if (cloudNoticeSection) cloudNoticeSection.style.display = 'none';
      this.loadShareData();
    } else {
      if (serverSection) serverSection.style.display = 'none';
      if (cloudNoticeSection) {
        cloudNoticeSection.style.display = 'block';
        const serviceName = serviceId === 'google-drive' ? 'Google Drive' : 'Dropbox';
        cloudNoticeSection.innerHTML = `
          <div class="share-cloud-notice-box">
            <div class="share-notice-icon">
              <i data-lucide="info" style="width: 28px; height: 28px;"></i>
            </div>
            <h4>Dịch vụ ${serviceName}</h4>
            <p>Hiện tại dịch vụ này hỗ trợ sao lưu dự phòng toàn bộ sổ vào tài khoản đám mây cá nhân của bạn. Cơ chế chia sẻ độc lập từng tài khoản/sổ phân quyền cho ${serviceName} đang được phát triển và sẽ sẵn sàng trong bản phát hành tới.</p>
            <p style="margin-top: 10px; font-weight: 500; color: var(--primary-color);">Vui lòng chọn "Máy Chủ Riêng (Self-Hosted)" để chia sẻ và phân quyền ngay lập tức.</p>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
      }
    }
  },

  switchTab(tab) {
    this.currentTab = tab;
    const tabEmailBtn = document.getElementById('tab-share-email-btn');
    const tabLinkBtn = document.getElementById('tab-share-link-btn');
    const tabEmailContent = document.getElementById('tab-share-email-content');
    const tabLinkContent = document.getElementById('tab-share-link-content');

    if (tabEmailBtn) tabEmailBtn.classList.toggle('active', tab === 'email');
    if (tabLinkBtn) tabLinkBtn.classList.toggle('active', tab === 'link');
    if (tabEmailContent) tabEmailContent.style.display = tab === 'email' ? 'block' : 'none';
    if (tabLinkContent) tabLinkContent.style.display = tab === 'link' ? 'block' : 'none';
  },

  async loadShareData() {
    if (this.currentService !== 'server') return;

    const notConnectedBox = document.getElementById('share-server-not-connected-msg');
    const mainBox = document.getElementById('share-server-main-controls');

    if (!window.serverSyncService?.isConnected || !window.serverSyncService?.token) {
      if (notConnectedBox) notConnectedBox.style.display = 'block';
      if (mainBox) mainBox.style.display = 'none';
      return;
    }

    if (notConnectedBox) notConnectedBox.style.display = 'none';
    if (mainBox) mainBox.style.display = 'block';

    const emailListEl = document.getElementById('share-email-members-list');
    const linkListEl = document.getElementById('share-active-links-list');

    if (emailListEl) emailListEl.innerHTML = '<div class="share-loading-spinner"><i data-lucide="loader-2" class="spin"></i> Đang tải danh sách phân quyền...</div>';
    if (linkListEl) linkListEl.innerHTML = '<div class="share-loading-spinner"><i data-lucide="loader-2" class="spin"></i> Đang tải danh sách liên kết...</div>';
    if (window.lucide) lucide.createIcons();

    try {
      const res = await window.serverSyncService.getItemShares(this.currentType, this.currentId);
      this.shares = res.shares || [];
      this.links = res.links || [];

      this.renderEmailShares();
      this.renderShareLinks();
    } catch (err) {
      console.warn('Lỗi tải dữ liệu chia sẻ:', err);
      if (emailListEl) emailListEl.innerHTML = `<div class="share-empty-box text-danger">${escapeHTML(err.message)}</div>`;
      if (linkListEl) linkListEl.innerHTML = `<div class="share-empty-box text-danger">${escapeHTML(err.message)}</div>`;
    }
  },

  renderEmailShares() {
    const listEl = document.getElementById('share-email-members-list');
    if (!listEl) return;

    if (this.shares.length === 0) {
      listEl.innerHTML = `
        <div class="share-empty-box">
          <i data-lucide="user-plus" style="width: 32px; height: 32px; opacity: 0.5; margin-bottom: 6px;"></i>
          <p>Chưa có thành viên nào được phân quyền cho tài khoản này.</p>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Nhập email Google ở trên để mời thành viên.</span>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    let html = '';
    this.shares.forEach(s => {
      const isEditor = s.role === 'editor';
      const roleBadge = isEditor
        ? '<span class="share-role-badge editor"><i data-lucide="edit-3" style="width:12px;height:12px;"></i> Chỉnh sửa</span>'
        : '<span class="share-role-badge viewer"><i data-lucide="eye" style="width:12px;height:12px;"></i> Chỉ xem</span>';

      const avatarHtml = s.user_picture
        ? `<img src="${escapeHTML(s.user_picture)}" class="share-member-avatar" alt="avatar" />`
        : `<div class="share-member-avatar-placeholder"><i data-lucide="user" style="width:16px;height:16px;"></i></div>`;

      html += `
        <div class="share-member-row">
          <div class="share-member-left">
            ${avatarHtml}
            <div class="share-member-info">
              <span class="share-member-email" title="${escapeHTML(s.user_email)}">${escapeHTML(s.user_email)}</span>
              ${s.user_name ? `<span class="share-member-name">${escapeHTML(s.user_name)}</span>` : ''}
            </div>
          </div>
          <div class="share-member-right">
            ${roleBadge}
            <button type="button" class="btn-revoke-share" title="Thu hồi quyền" onclick="UniversalShareModal.handleRevokeEmailShare('${s.id}')">
              <i data-lucide="user-x" style="width: 15px; height: 15px;"></i> Thu hồi
            </button>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  renderShareLinks() {
    const listEl = document.getElementById('share-active-links-list');
    if (!listEl) return;

    if (this.links.length === 0) {
      listEl.innerHTML = `
        <div class="share-empty-box">
          <i data-lucide="link" style="width: 32px; height: 32px; opacity: 0.5; margin-bottom: 6px;"></i>
          <p>Chưa có liên kết chia sẻ nào đang hoạt động.</p>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Bấm nút "Tạo liên kết chia sẻ mới" ở trên để tạo link.</span>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    let html = '';
    const origin = window.location.origin;
    const pathname = window.location.pathname;

    this.links.forEach(l => {
      const isEditor = l.role === 'editor';
      const roleBadge = isEditor
        ? '<span class="share-role-badge editor"><i data-lucide="edit-3" style="width:12px;height:12px;"></i> Chỉnh sửa</span>'
        : '<span class="share-role-badge viewer"><i data-lucide="eye" style="width:12px;height:12px;"></i> Chỉ xem</span>';

      const fullUrl = `${origin}${pathname}#share_token=${l.token}`;
      const dateStr = l.created_at ? new Date(l.created_at).toLocaleDateString('vi-VN') : '';

      html += `
        <div class="share-link-row">
          <div class="share-link-header-row">
            <div style="display:flex; align-items:center; gap: 8px;">
              ${roleBadge}
              <span class="share-link-date">Tạo ngày ${dateStr}</span>
            </div>
            <button type="button" class="btn-revoke-share" title="Thu hồi liên kết" onclick="UniversalShareModal.handleRevokeLink('${l.id}')">
              <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Thu hồi
            </button>
          </div>
          <div class="share-link-input-group">
            <input type="text" class="share-link-url-input" readonly value="${fullUrl}" onclick="this.select()" />
            <button type="button" class="btn-copy-link" onclick="UniversalShareModal.copyLink('${l.token}')">
              <i data-lucide="copy" style="width: 15px; height: 15px;"></i> Sao chép
            </button>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  async handleAddEmailShare() {
    const input = document.getElementById('share-email-input');
    const roleSelect = document.getElementById('share-email-role');
    const email = (input?.value || '').trim();
    const role = roleSelect?.value || 'viewer';

    if (!email || !email.includes('@')) {
      if (typeof showToast === 'function') showToast('Vui lòng nhập email Google hợp lệ.', 'error');
      return;
    }

    try {
      if (typeof showToast === 'function') showToast('Đang cấp quyền chia sẻ...', 'info');
      await window.serverSyncService.shareItemWithEmail(
        this.currentType,
        this.currentId,
        this.currentItem.name,
        email,
        role
      );

      if (input) input.value = '';
      if (typeof showToast === 'function') showToast(`Đã chia sẻ thành công với ${email}`, 'success');
      await this.loadShareData();
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message, 'error');
    }
  },

  async handleRevokeEmailShare(shareId) {
    if (!confirm('Bạn có chắc muốn thu hồi quyền truy cập của thành viên này đối với tài khoản?')) {
      return;
    }

    try {
      await window.serverSyncService.revokeItemEmailShare(shareId);
      if (typeof showToast === 'function') showToast('Đã thu hồi quyền thành công.', 'success');
      await this.loadShareData();
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message, 'error');
    }
  },

  async handleCreateLink() {
    const roleSelect = document.getElementById('share-link-role');
    const role = roleSelect?.value || 'viewer';

    try {
      if (typeof showToast === 'function') showToast('Đang tạo liên kết chia sẻ...', 'info');
      await window.serverSyncService.createItemShareLink(
        this.currentType,
        this.currentId,
        this.currentItem.name,
        role
      );

      if (typeof showToast === 'function') showToast('Tạo liên kết chia sẻ thành công!', 'success');
      await this.loadShareData();
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message, 'error');
    }
  },

  async handleRevokeLink(linkId) {
    if (!confirm('Bạn có chắc muốn thu hồi liên kết này? Bất kỳ ai đang giữ liên kết này sẽ không thể xem hoặc cập nhật dữ liệu nữa.')) {
      return;
    }

    try {
      await window.serverSyncService.revokeItemShareLink(linkId);
      if (typeof showToast === 'function') showToast('Đã thu hồi liên kết thành công.', 'success');
      await this.loadShareData();
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message, 'error');
    }
  },

  copyLink(token) {
    const fullUrl = `${window.location.origin}${window.location.pathname}#share_token=${token}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullUrl).then(() => {
        if (typeof showToast === 'function') showToast('Đã sao chép liên kết chia sẻ vào khay nhớ tạm!', 'success');
      }).catch(() => {
        prompt('Sao chép liên kết chia sẻ dưới đây:', fullUrl);
      });
    } else {
      prompt('Sao chép liên kết chia sẻ dưới đây:', fullUrl);
    }
  }
};

/**
 * NHẬN TÀI KHOẢN CHIA SẺ QUA LIÊN KẾT (RECEIVE SHARE MODAL)
 */
const ReceiveShareModal = {
  currentToken: null,
  shareData: null,

  async checkUrlForShareToken() {
    let token = null;

    // 1. Kiểm tra hash: #share_token=...
    if (window.location.hash) {
      const match = window.location.hash.match(/[#&]share_token=([^&]+)/);
      if (match) token = match[1];
    }

    // 2. Kiểm tra search: ?share_token=... hoặc ?shareToken=...
    if (!token && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      token = params.get('share_token') || params.get('shareToken');
    }

    if (token) {
      await this.promptWithToken(token);
    }
  },

  async promptManual() {
    const input = prompt('Dán liên kết chia sẻ hoặc mã token:');
    if (!input) return;

    let token = input.trim();
    if (token.includes('share_token=')) {
      const match = token.match(/share_token=([^&]+)/);
      if (match) token = match[1];
    }
    await this.promptWithToken(token);
  },

  async promptWithToken(token) {
    this.currentToken = token;
    if (typeof showToast === 'function') showToast('Đang kiểm tra liên kết chia sẻ...', 'info');

    try {
      const info = await window.serverSyncService.getShareLinkInfo(token);
      this.shareData = info;

      const modal = document.getElementById('modal-receive-share');
      if (!modal) return;

      const nameEl = document.getElementById('receive-share-item-name');
      const typeEl = document.getElementById('receive-share-item-type');
      const ownerEl = document.getElementById('receive-share-owner-info');
      const roleEl = document.getElementById('receive-share-role-info');

      if (nameEl) nameEl.textContent = info.itemName || 'Tài khoản chia sẻ';
      if (typeEl) typeEl.textContent = UniversalShareModal.getTypeLabel(info.itemType);
      if (ownerEl) ownerEl.textContent = `${info.ownerName || 'Chủ sở hữu'} (${info.ownerEmail || ''})`;
      if (roleEl) {
        roleEl.innerHTML = info.role === 'editor'
          ? '<span class="share-role-badge editor"><i data-lucide="edit-3" style="width:12px;height:12px;"></i> Toàn quyền Ghi chép & Chỉnh sửa</span>'
          : '<span class="share-role-badge viewer"><i data-lucide="eye" style="width:12px;height:12px;"></i> Quyền Chỉ xem (Viewer)</span>';
      }

      modal.classList.add('open');
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message, 'error');
    }
  },

  close() {
    const modal = document.getElementById('modal-receive-share');
    if (modal) modal.classList.remove('open');
  },

  async accept() {
    if (!this.currentToken) return;

    try {
      if (typeof showToast === 'function') showToast('Đang nhận tài khoản vào sổ...', 'info');
      const result = await window.serverSyncService.acceptShareLink(this.currentToken);

      // Đồng bộ ngay dữ liệu vào IndexedDB
      await window.serverSyncService.syncReceivedSharedItems();

      if (typeof window.app?.refreshAll === 'function') {
        await window.app.refreshAll();
      }

      this.close();

      // Dọn dẹp URL để F5 không hỏi lại
      if (window.location.hash.includes('share_token=')) {
        history.replaceState(null, '', window.location.pathname + window.location.search.replace(/[?&]share_token=[^&]+/, ''));
      }

      if (typeof showToast === 'function') {
        showToast(`Đã nhận "${this.shareData?.itemName || 'Tài khoản'}" thành công!`, 'success');
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message, 'error');
    }
  }
};

window.UniversalShareModal = UniversalShareModal;
window.ReceiveShareModal = ReceiveShareModal;

// Tự động kiểm tra token chia sẻ trên URL khi tải trang
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    ReceiveShareModal.checkUrlForShareToken();
  }, 1000);
});
