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

    const sService = window.serverSyncService;
    const isServerReachable = Boolean(sService && (sService.connectionStatus === 'connected' || sService.serverUrl));
    const isServerLoggedIn = Boolean(sService && sService.token && sService.userProfile);

    let serverStatusText = 'Chưa kết nối';
    let serverStatusClass = 'not-connected';
    if (isServerLoggedIn) {
      serverStatusText = 'Đã kết nối';
      serverStatusClass = 'connected';
    } else if (isServerReachable) {
      serverStatusText = 'Sẵn sàng';
      serverStatusClass = 'ready';
    }

    const services = [
      {
        id: 'server',
        name: 'Máy Chủ Riêng (Self-Hosted)',
        statusText: serverStatusText,
        statusClass: serverStatusClass,
        isConnected: isServerReachable,
        isLoggedIn: isServerLoggedIn,
        supported: true,
        icon: 'server',
        desc: 'Đồng bộ tức thì 2 chiều. Chia sẻ ví & sổ độc lập qua Email hoặc Liên kết với phân quyền Xem/Sửa.'
      },
      {
        id: 'google-drive',
        name: 'Google Drive',
        statusText: 'Sắp hỗ trợ',
        statusClass: 'planned',
        isConnected: false,
        supported: false,
        icon: 'cloud',
        desc: 'Sao lưu dự phòng toàn bộ sổ vào Google Drive cá nhân. Chia sẻ độc lập từng tài khoản qua Drive đang hoàn thiện.'
      },
      {
        id: 'dropbox',
        name: 'Dropbox',
        statusText: 'Sắp hỗ trợ',
        statusClass: 'planned',
        isConnected: false,
        supported: false,
        icon: 'box',
        desc: 'Sao lưu đám mây Dropbox. Chia sẻ độc lập từng tài khoản/sổ qua Dropbox đang hoàn thiện.'
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
              <span class="share-service-status-badge ${s.statusClass}">
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
    const sService = window.serverSyncService;

    // 1. Nếu chưa có serverUrl
    if (!sService || !sService.serverUrl) {
      if (notConnectedBox) {
        notConnectedBox.style.display = 'block';
        notConnectedBox.innerHTML = `
          <div class="share-auth-prompt-card not-configured">
            <div class="share-auth-icon-wrap warn" style="margin: 0 auto 8px;">
              <i data-lucide="server-off" style="width: 32px; height: 32px; color: #f59e0b;"></i>
            </div>
            <h4 style="font-size: 0.95rem; font-weight: 700; color: #f8fafc; margin-bottom: 4px;">Chưa Cấu Hình Máy Chủ Riêng</h4>
            <p style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 14px; line-height: 1.45;">Vui lòng vào mục Cài đặt > Máy Chủ Riêng để thiết lập địa chỉ máy chủ trước khi chia sẻ.</p>
            <button type="button" class="btn-primary btn-sm" onclick="UniversalShareModal.close(); UISettings.openSection('server');">
              <i data-lucide="settings" style="width: 14px; height: 14px;"></i> Cài Đặt Máy Chủ Riêng
            </button>
          </div>
        `;
      }
      if (mainBox) mainBox.style.display = 'none';
      if (window.lucide) lucide.createIcons();
      return;
    }

    // 2. Nếu đã có serverUrl nhưng chưa có token -> thử kiểm tra refresh session
    if (!sService.token || !sService.userProfile) {
      if (typeof sService.refreshSession === 'function') {
        try {
          await sService.refreshSession();
        } catch (_) {}
      }
    }

    // 3. Nếu chưa đăng nhập: Yêu cầu đăng nhập 100% bằng tài khoản Google
    if (!sService.token || !sService.userProfile) {
      if (notConnectedBox) {
        notConnectedBox.style.display = 'block';

        notConnectedBox.innerHTML = `
          <div class="share-auth-prompt-card ready">
            <div class="share-server-status-pill">
              <span class="status-dot"></span>
              <span>Máy chủ đã kết nối: <strong>${escapeHTML(sService.serverUrl)}</strong></span>
            </div>
            <h4 style="margin: 12px 0 6px 0; font-size: 0.98rem; font-weight: 700; color: #f8fafc;">Đăng Nhập Tài Khoản Google</h4>
            <p style="font-size: 0.8rem; color: #94a3b8; line-height: 1.45; margin-bottom: 16px;">
              Để chia sẻ độc lập và phân quyền ví này cho người khác, bạn cần đăng nhập bằng tài khoản Google để xác thực quyền sở hữu dữ liệu.
            </p>

            <div style="display: flex; align-items: center; justify-content: center; margin-top: 8px;">
              <button type="button" class="btn-primary" style="padding: 10px 22px; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 8px; font-weight: 600;" onclick="UniversalShareModal.handleGoogleLogin()">
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                Đăng nhập bằng Google
              </button>
            </div>
          </div>
        `;
      }
      if (mainBox) mainBox.style.display = 'none';
      if (window.lucide) lucide.createIcons();
      return;
    }

    // 4. Đã kết nối và đăng nhập thành công
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
      const rawLinks = res.links || [];
      for (const l of rawLinks) {
        l.shareKey = await window.serverSyncService.getItemShareKey(l.token) || await window.serverSyncService.getItemShareKey(`${this.currentType}_${this.currentId}`);
      }
      this.links = rawLinks;

      this.renderEmailShares();
      this.renderShareLinks();
    } catch (err) {
      console.warn('Lỗi tải dữ liệu chia sẻ:', err);
      if (emailListEl) emailListEl.innerHTML = `<div class="share-empty-box text-danger">${escapeHTML(err.message)}</div>`;
      if (linkListEl) linkListEl.innerHTML = `<div class="share-empty-box text-danger">${escapeHTML(err.message)}</div>`;
    }
  },

  async handleGoogleLogin() {
    if (typeof showToast === 'function') showToast('Đang mở màn hình xác thực Google...', 'info');
    try {
      await window.serverSyncService.loginWithGoogle();
      if (typeof showToast === 'function') showToast('Đăng nhập Google thành công!', 'success');
      this.renderServices();
      await this.loadShareData();
    } catch (e) {
      if (typeof showToast === 'function') showToast(e.message, 'warning');
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

      const shareKey = l.shareKey || '';
      const fullUrl = shareKey
        ? `${origin}${pathname}#share_token=${l.token}&key=${encodeURIComponent(shareKey)}`
        : `${origin}${pathname}#share_token=${l.token}`;
      const dateStr = l.created_at ? new Date(l.created_at).toLocaleDateString('vi-VN') : '';

      html += `
        <div class="share-link-row">
          <div class="share-link-header-row">
            <div style="display:flex; align-items:center; gap: 8px;">
              ${roleBadge}
              <span class="badge" style="font-size: 0.68rem; background: rgba(16, 185, 129, 0.12); color: #10b981; border-radius: 999px; padding: 1px 7px;">
                <i data-lucide="shield-check" style="width: 11px; height: 11px; display: inline-block; vertical-align: middle;"></i> E2EE AES-256
              </span>
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
    const ok = await showConfirm({
      title: 'Thu Hồi Quyền Truy Cập',
      message: 'Bạn có chắc muốn thu hồi quyền truy cập của thành viên này đối với tài khoản?',
      confirmText: 'Thu Hồi',
      cancelText: 'Huỷ',
      danger: true,
      icon: 'user-x'
    });
    if (!ok) return;

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
    const ok = await showConfirm({
      title: 'Thu Hồi Liên Kết Chia Sẻ',
      message: 'Bạn có chắc muốn thu hồi liên kết này? Bất kỳ ai đang giữ liên kết này sẽ không thể xem hoặc cập nhật dữ liệu nữa.',
      confirmText: 'Thu Hồi Liên Kết',
      cancelText: 'Huỷ',
      danger: true,
      icon: 'link-2-off'
    });
    if (!ok) return;

    try {
      await window.serverSyncService.revokeItemShareLink(linkId);
      if (typeof showToast === 'function') showToast('Đã thu hồi liên kết thành công.', 'success');
      await this.loadShareData();
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message, 'error');
    }
  },

  async copyLink(token) {
    const key = (await window.serverSyncService.getItemShareKey(token)) || (await window.serverSyncService.getItemShareKey(`${this.currentType}_${this.currentId}`));
    const fullUrl = key
      ? `${window.location.origin}${window.location.pathname}#share_token=${token}&key=${encodeURIComponent(key)}`
      : `${window.location.origin}${window.location.pathname}#share_token=${token}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullUrl).then(() => {
        if (typeof showToast === 'function') showToast('Đã sao chép liên kết chia sẻ vào khay nhớ tạm!', 'success');
      }).catch(async () => {
        await showPrompt({
          title: 'Sao Chép Liên Kết',
          message: 'Sao chép liên kết chia sẻ dưới đây:',
          defaultValue: fullUrl,
          confirmText: 'Đóng',
          cancelText: 'Đóng',
          icon: 'share-2'
        });
      });
    } else {
      await showPrompt({
        title: 'Sao Chép Liên Kết',
        message: 'Sao chép liên kết chia sẻ dưới đây:',
        defaultValue: fullUrl,
        confirmText: 'Đóng',
        cancelText: 'Đóng',
        icon: 'share-2'
      });
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

    let key = null;

    // 1. Kiểm tra hash: #share_token=...&key=...
    if (window.location.hash) {
      const match = window.location.hash.match(/[#&]share_token=([^&]+)/);
      if (match) token = match[1];
      const matchKey = window.location.hash.match(/[#&]key=([^&]+)/);
      if (matchKey) key = decodeURIComponent(matchKey[1]);
    }

    // 2. Kiểm tra search: ?share_token=... hoặc ?shareToken=...
    if (!token && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      token = params.get('share_token') || params.get('shareToken');
      if (params.get('key')) key = params.get('key');
    }

    if (token) {
      this.currentKey = key;
      await this.promptWithToken(token, key);
    }
  },

  async promptManual() {
    const input = await showPrompt({
      title: 'Nhận Tài Khoản Chia Sẻ',
      message: 'Dán liên kết chia sẻ hoặc mã token được cấp vào bên dưới:',
      placeholder: 'https://... hoặc mã token',
      confirmText: 'Kiểm Tra & Nhận',
      cancelText: 'Huỷ',
      icon: 'link'
    });
    if (!input || !input.trim()) return;

    let token = input.trim();
    if (token.includes('share_token=')) {
      const match = token.match(/share_token=([^&]+)/);
      if (match) token = match[1];
    }
    await this.promptWithToken(token);
  },

  async promptWithToken(token, key = null) {
    this.currentToken = token;
    if (key) this.currentKey = key;
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
      if (typeEl) {
        let typeBadgeHtml = UniversalShareModal.getTypeLabel(info.itemType);
        if (info.isEncrypted) {
          typeBadgeHtml += ' &bull; <span style="color:#10b981; font-weight:600;"><i data-lucide="shield-check" style="width:12px;height:12px;display:inline-block;vertical-align:middle;"></i> Mã Hóa Đầu Cuối (E2EE)</span>';
        }
        typeEl.innerHTML = typeBadgeHtml;
      }
      if (ownerEl) ownerEl.textContent = `${info.ownerName || 'Chủ sở hữu'} (${info.ownerEmail || ''})`;
      if (roleEl) {
        roleEl.innerHTML = info.role === 'editor'
          ? '<span class="share-role-badge editor"><i data-lucide="edit-3" style="width:12px;height:12px;"></i> Toàn quyền Ghi chép & Chỉnh sửa</span>'
          : '<span class="share-role-badge viewer"><i data-lucide="eye" style="width:12px;height:12px;"></i> Quyền Chỉ xem (Viewer)</span>';
      }

      // Khung nhập mật khẩu nếu mục được mã hóa nhưng URL không có key
      let passBox = document.getElementById('receive-share-password-box');
      if (info.isEncrypted && !this.currentKey) {
        if (!passBox) {
          passBox = document.createElement('div');
          passBox.id = 'receive-share-password-box';
          passBox.style.marginTop = '12px';
          passBox.innerHTML = `
            <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-primary); margin-bottom:5px;">Mật khẩu mở khóa mục chia sẻ:</label>
            <input type="password" id="receive-share-password-input" class="form-control" placeholder="Nhập mật khẩu do người chia sẻ cung cấp" style="font-size:0.85rem;" />
            <small style="color:var(--text-muted); font-size:0.72rem; display:block; margin-top:4px;">* Mục này đã được mã hóa bảo vệ bằng AES-256.</small>
          `;
          const body = modal.querySelector('.modal-body');
          if (body) body.appendChild(passBox);
        } else {
          passBox.style.display = 'block';
        }
      } else if (passBox) {
        passBox.style.display = 'none';
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
      // Nếu có ô nhập mật khẩu
      const passInput = document.getElementById('receive-share-password-input');
      if (passInput && passInput.value.trim()) {
        this.currentKey = passInput.value.trim();
      }

      if (typeof showToast === 'function') showToast('Đang nhận tài khoản vào sổ...', 'info');
      const result = await window.serverSyncService.acceptShareLink(this.currentToken);

      // Lưu khóa giải mã cho item này nếu có
      if (this.currentKey) {
        if (result && result.shareId) {
          await window.serverSyncService.saveItemShareKey(result.shareId, this.currentKey);
        }
        if (this.shareData && this.shareData.itemId) {
          await window.serverSyncService.saveItemShareKey(this.shareData.itemId, this.currentKey);
          await window.serverSyncService.saveItemShareKey(`${this.shareData.itemType}_${this.shareData.itemId}`, this.currentKey);
        }
      }

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
