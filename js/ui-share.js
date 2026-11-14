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
  serverUsersCache: [],
  isLoading: false,

  async getPreferredService(type, id) {
    const sService = window.serverSyncService;
    const gService = window.googleDriveService;

    // 1. Kiểm tra trạng thái khả dụng thực tế của từng dịch vụ (đang kích hoạt / có thể chia sẻ):
    // - Máy Chủ Riêng (Self-Hosted): Đang có URL kết nối, có token xác thực người dùng và autoSync !== false
    const isServerActive = Boolean(sService && sService.serverUrl && sService.token && sService.userProfile && sService.autoSync !== false);
    // - Google Drive: Đang kết nối OAuth với tài khoản Google (có accessToken) và autoSync !== false
    const isDriveActive = Boolean(gService && gService.isConnected && gService.accessToken && gService.autoSync !== false);

    // 2. Nếu mục này ĐÃ có liên kết / tệp chia sẻ trên Google Drive và Google Drive đang kích hoạt:
    if (isDriveActive && gService && typeof gService.getSharedFileId === 'function') {
      try {
        const gDriveFileId = await gService.getSharedFileId(type, id);
        if (gDriveFileId) {
          return 'google-drive';
        }
      } catch (_) {}
    }

    // 3. Tự chọn dịch vụ đang khả dụng gần nhất theo thứ tự danh sách từ trên xuống dưới (đang kích hoạt):
    // [1] Máy Chủ Riêng (Self-Hosted)
    // [2] Google Drive
    if (isServerActive) {
      return 'server';
    }
    if (isDriveActive) {
      return 'google-drive';
    }

    // Nếu không có dịch vụ nào đang kích hoạt: Mặc định chọn dịch vụ đầu danh sách ('server')
    return 'server';
  },

  getActiveService() {
    return this.currentService === 'google-drive' ? window.googleDriveService : window.serverSyncService;
  },

  async open(type, id) {
    this.currentType = type;
    this.currentId = Number(id);
    this.currentItem = null;
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

    // Tự chọn tính năng share qua máy chủ hay drive đang khả dụng gần nhất theo danh sách từ trên xuống dưới
    this.currentService = await this.getPreferredService(type, this.currentId);

    // 2. Hiển thị modal
    const modal = document.getElementById('modal-universal-share');
    if (!modal) return;

    this.closeServiceDropdown();
    this.hideShareUserDropdown();
    const emailInput = document.getElementById('share-email-input');
    if (emailInput) {
      emailInput.value = '';
      emailInput.placeholder = this.currentService === 'google-drive'
        ? 'Nhập Email Google của người nhận...'
        : 'Email người dùng hoặc chọn từ máy chủ...';
    }

    this.renderHeader();
    this.renderServices();
    this.switchTab('email');
    modal.classList.add('open');

    if (window.lucide) lucide.createIcons();

    // 3. Tải danh sách dịch vụ và dữ liệu chia sẻ
    await this.loadServices();
    await this.loadShareData();
    if (this.currentService === 'server') {
      this.loadServerUsersForShare();
    }

    // Tự động cập nhật bản chiếu mới nhất lên dịch vụ đã chọn
    const activeService = this.getActiveService();
    if (activeService && activeService.isConnected && typeof activeService.projectAndPushItem === 'function') {
      activeService.projectAndPushItem(type, this.currentId).catch(err => {
        console.warn('[ShareModal] Cập nhật bản chiếu tự động:', err?.message || err);
      });
    }
  },

  close() {
    this.closeServiceDropdown();
    this.hideShareUserDropdown();
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
    this.renderServices();
  },

  toggleServiceDropdown(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const menu = document.getElementById('share-service-dropdown-menu');
    const btn = document.getElementById('share-service-dropdown-btn');
    if (!menu) return;
    const isShown = menu.classList.contains('show') || menu.style.display === 'flex';
    if (isShown) {
      this.closeServiceDropdown();
    } else {
      menu.classList.add('show');
      menu.style.setProperty('display', 'flex', 'important');
      if (btn) btn.classList.add('active');
    }
  },

  closeServiceDropdown() {
    const menu = document.getElementById('share-service-dropdown-menu');
    const btn = document.getElementById('share-service-dropdown-btn');
    if (menu) {
      menu.classList.remove('show');
      menu.style.setProperty('display', 'none', 'important');
    }
    if (btn) btn.classList.remove('active');
  },

  selectService(serviceId, e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    this.currentService = serviceId;
    this.closeServiceDropdown();
    this.hideShareUserDropdown();
    const emailInput = document.getElementById('share-email-input');
    if (emailInput) {
      emailInput.placeholder = serviceId === 'google-drive'
        ? 'Nhập Email Google của người nhận...'
        : 'Email người dùng hoặc chọn từ máy chủ...';
    }
    this.renderServices();
    this.loadShareData();
    if (serviceId === 'server') {
      this.loadServerUsersForShare();
    }
  },

  renderServices() {
    const sService = window.serverSyncService;
    const isServerLoggedIn = Boolean(sService && sService.token && sService.userProfile);
    const isServerReachable = Boolean(sService && sService.connectionStatus === 'connected');

    let serverStatusText = 'Chưa kết nối';
    let serverStatusClass = 'not-connected';
    if (isServerLoggedIn && sService.autoSync !== false) {
      serverStatusText = 'Đã kết nối';
      serverStatusClass = 'connected';
    } else if (isServerLoggedIn) {
      serverStatusText = 'Đã tắt đồng bộ';
      serverStatusClass = 'ready';
    } else if (isServerReachable) {
      serverStatusText = 'Chưa đăng nhập';
      serverStatusClass = 'ready';
    }

    const statusStyles = {
      'connected': { bg: 'rgba(16, 185, 129, 0.16)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' },
      'ready': { bg: 'rgba(59, 130, 246, 0.16)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' },
      'not-connected': { bg: 'rgba(239, 68, 68, 0.16)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' },
      'planned': { bg: 'rgba(148, 163, 184, 0.16)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.25)' }
    };

    // Cập nhật badge trên menu option của Server
    const serverPill = document.getElementById('share-service-option-server-pill');
    if (serverPill) {
      serverPill.textContent = serverStatusText;
      serverPill.className = `share-service-status-pill ${serverStatusClass}`;
      const sSt = statusStyles[serverStatusClass] || statusStyles['ready'];
      serverPill.style.background = sSt.bg;
      serverPill.style.color = sSt.color;
      serverPill.style.border = sSt.border;
    }

    // Cập nhật badge trên menu option của Google Drive
    const gService = window.googleDriveService;
    const isDriveConnected = Boolean(gService && (gService.userProfile || gService.isConnected));
    let driveStatusText = 'Chưa kết nối';
    let driveStatusClass = 'not-connected';
    if (isDriveConnected) {
      driveStatusText = 'Đã kết nối';
      driveStatusClass = 'connected';
    }

    const gdrivePill = document.getElementById('share-service-option-gdrive-pill');
    if (gdrivePill) {
      gdrivePill.textContent = driveStatusText;
      gdrivePill.className = `share-service-status-pill ${driveStatusClass}`;
      const gSt = statusStyles[driveStatusClass] || statusStyles['ready'];
      gdrivePill.style.background = gSt.bg;
      gdrivePill.style.color = gSt.color;
      gdrivePill.style.border = gSt.border;
    }

    const configs = {
      'server': {
        label: 'Máy Chủ Riêng (Self-Hosted)',
        iconHtml: '<i data-lucide="server" style="width: 18px; height: 18px; color: #10b981;"></i>',
        statusText: serverStatusText,
        statusClass: serverStatusClass
      },
      'google-drive': {
        label: 'Google Drive',
        iconHtml: '<svg viewBox="0 0 87.3 78" style="width: 18px; height: 16px;"><path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"/><path fill="#00ac47" d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z"/><path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z"/><path fill="#00832d" d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"/><path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"/><path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z"/></svg>',
        statusText: driveStatusText,
        statusClass: driveStatusClass
      },
      'dropbox': {
        label: 'Dropbox',
        iconHtml: '<i data-lucide="box" style="width: 18px; height: 18px; color: #0061ff;"></i>',
        statusText: 'Sắp hỗ trợ',
        statusClass: 'planned'
      }
    };

    const cur = configs[this.currentService] || configs['server'];

    const iconEl = document.getElementById('share-service-current-icon');
    const labelEl = document.getElementById('share-service-current-label');
    const statusEl = document.getElementById('share-service-current-status');

    if (iconEl) iconEl.innerHTML = cur.iconHtml;
    if (labelEl) labelEl.textContent = cur.label;
    if (statusEl) {
      statusEl.textContent = cur.statusText;
      statusEl.className = `share-service-status-pill ${cur.statusClass}`;
      const cSt = statusStyles[cur.statusClass] || statusStyles['planned'];
      statusEl.style.background = cSt.bg;
      statusEl.style.color = cSt.color;
      statusEl.style.border = cSt.border;
    }

    // Đánh dấu active trong menu
    document.querySelectorAll('.share-service-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.service === this.currentService);
    });

    if (window.lucide) lucide.createIcons();
  },

  switchService(serviceId) {
    this.selectService(serviceId);
  },

  goToSettings(section) {
    const targetSection = section || (this.currentService === 'google-drive' ? 'google-drive' : (this.currentService === 'dropbox' ? 'dropbox' : 'server'));
    this.close();
    if (window.app && typeof window.app.switchView === 'function') {
      window.app.switchView('settings');
    }
    if (window.UISettings && typeof window.UISettings.openSection === 'function') {
      setTimeout(() => {
        window.UISettings.openSection(targetSection);
      }, 100);
    }
  },

  switchTab(tab) {
    this.currentTab = tab;
    this.hideShareUserDropdown();
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
    const notConnectedBox = document.getElementById('share-server-not-connected-msg');
    const mainBox = document.getElementById('share-server-main-controls');
    const cloudNoticeSection = document.getElementById('universal-share-cloud-notice');
    const serverSection = document.getElementById('universal-share-server-section');
    const sService = window.serverSyncService;

    // 1. MÁY CHỦ RIÊNG (SELF-HOSTED)
    if (this.currentService === 'server') {
      if (serverSection) serverSection.style.display = 'block';
      if (cloudNoticeSection) cloudNoticeSection.style.display = 'none';

      // Thử refresh session nếu đã có serverUrl và token nhưng profile chưa sync
      if (sService && sService.serverUrl && sService.token && !sService.userProfile) {
        if (typeof sService.refreshSession === 'function') {
          try { await sService.refreshSession(); } catch (_) {}
        }
      }

      const isServerLoggedIn = Boolean(sService && sService.serverUrl && sService.token && sService.userProfile);

      if (!isServerLoggedIn) {
        if (mainBox) mainBox.style.display = 'none';
        if (notConnectedBox) {
          notConnectedBox.style.display = 'block';
          notConnectedBox.innerHTML = `
            <div class="share-auth-prompt-card not-configured" style="text-align: center; padding: 24px 18px;">
              <div class="share-auth-icon-wrap warn" style="margin: 0 auto 12px; width: 48px; height: 48px; border-radius: 50%; background: rgba(245, 158, 11, 0.15); display: flex; align-items: center; justify-content: center;">
                <i data-lucide="cloud-off" style="width: 24px; height: 24px; color: #f59e0b;"></i>
              </div>
              <h4 style="font-size: 0.95rem; font-weight: 700; color: #f8fafc; margin-bottom: 6px;">Cần kết nối tới dịch vụ sao lưu để có thể bắt đầu chia sẻ.</h4>
              <p style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 18px; line-height: 1.45;">Vui lòng hoàn tất kết nối và đăng nhập tài khoản trong phần Cài đặt của ứng dụng.</p>
              <button type="button" class="btn-primary" style="padding: 10px 22px; font-size: 0.84rem; display: inline-flex; align-items: center; gap: 8px; margin: 0 auto; border-radius: 8px; font-weight: 600;" onclick="UniversalShareModal.goToSettings('server')">
                <i data-lucide="settings" style="width: 15px; height: 15px;"></i> Chuyển đến Cài đặt
              </button>
            </div>
          `;
        }
        if (window.lucide) lucide.createIcons();
        return;
      }

      // Đã kết nối và đăng nhập thành công
      if (notConnectedBox) notConnectedBox.style.display = 'none';
      if (mainBox) mainBox.style.display = 'block';

      // Cập nhật banner trạng thái máy chủ
      const existingStatus = document.getElementById('share-server-active-pill');
      if (!existingStatus) {
        const pillDiv = document.createElement('div');
        pillDiv.id = 'share-server-active-pill';
        pillDiv.className = 'share-server-status-pill';
        pillDiv.style.marginBottom = '12px';
        pillDiv.innerHTML = `
          <span class="status-dot"></span>
          <span>Máy chủ: <strong>${escapeHTML(sService.serverUrl)}</strong> (${escapeHTML(sService.userProfile.email)})</span>
        `;
        mainBox.insertBefore(pillDiv, mainBox.firstChild);
      } else {
        existingStatus.innerHTML = `
          <span class="status-dot"></span>
          <span>Máy chủ: <strong>${escapeHTML(sService.serverUrl)}</strong> (${escapeHTML(sService.userProfile.email)})</span>
        `;
      }

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

        const totalShares = (this.shares.length || 0) + (this.links.length || 0);
        await this.updateItemSharedState(totalShares > 0 ? 1 : 0);

        try {
          const shareKey = await window.serverSyncService.getItemShareKey(`${this.currentType}_${this.currentId}`);
          if (shareKey && this.shares.length > 0) {
            for (const s of this.shares) {
              if (!s.share_key && s.user_email) {
                window.serverSyncService.shareItemWithEmail(this.currentType, this.currentId, this.currentItem.name, s.user_email, s.role, shareKey).catch(() => {});
              }
            }
          }
        } catch (_) {}
      } catch (err) {
        console.warn('Lỗi tải dữ liệu chia sẻ:', err);
        if (emailListEl) emailListEl.innerHTML = `<div class="share-empty-box text-danger">${escapeHTML(err.message)}</div>`;
        if (linkListEl) linkListEl.innerHTML = `<div class="share-empty-box text-danger">${escapeHTML(err.message)}</div>`;
      }
      this.renderSharedServicesSummary();
      return;
    }

    // 2. GOOGLE DRIVE
    if (this.currentService === 'google-drive') {
      const gService = window.googleDriveService;
      const isDriveConnected = Boolean(gService && (gService.userProfile || gService.isConnected));

      if (!isDriveConnected) {
        if (serverSection) serverSection.style.display = 'none';
        if (cloudNoticeSection) {
          cloudNoticeSection.style.display = 'block';
          cloudNoticeSection.innerHTML = `
            <div class="share-auth-prompt-card not-configured" style="text-align: center; padding: 24px 18px;">
              <div class="share-auth-icon-wrap warn" style="margin: 0 auto 12px; width: 48px; height: 48px; border-radius: 50%; background: rgba(245, 158, 11, 0.15); display: flex; align-items: center; justify-content: center;">
                <i data-lucide="cloud-off" style="width: 24px; height: 24px; color: #f59e0b;"></i>
              </div>
              <h4 style="font-size: 0.95rem; font-weight: 700; color: #f8fafc; margin-bottom: 6px;">Cần kết nối tới Google Drive để có thể bắt đầu chia sẻ.</h4>
              <p style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 18px; line-height: 1.45;">Vui lòng kết nối tài khoản Google Drive trong phần Cài đặt.</p>
              <button type="button" class="btn-primary" style="padding: 10px 22px; font-size: 0.84rem; display: inline-flex; align-items: center; gap: 8px; margin: 0 auto; border-radius: 8px; font-weight: 600;" onclick="UniversalShareModal.goToSettings('google-drive')">
                <i data-lucide="settings" style="width: 15px; height: 15px;"></i> Chuyển đến Cài đặt
              </button>
            </div>
          `;
        }
        if (window.lucide) lucide.createIcons();
        this.renderSharedServicesSummary();
        return;
      }

      // Đã kết nối Google Drive thành công
      if (cloudNoticeSection) cloudNoticeSection.style.display = 'none';
      if (serverSection) serverSection.style.display = 'block';
      if (notConnectedBox) notConnectedBox.style.display = 'none';
      if (mainBox) mainBox.style.display = 'block';

      // Cập nhật banner trạng thái Google Drive
      const gEmail = gService.userProfile?.email || 'Google Drive';
      const existingStatus = document.getElementById('share-server-active-pill');
      const pillHtml = `
        <span class="status-dot"></span>
        <span>Google Drive: <strong>${escapeHTML(gEmail)}</strong> (Trực tiếp REST API v3)</span>
      `;
      if (!existingStatus) {
        const pillDiv = document.createElement('div');
        pillDiv.id = 'share-server-active-pill';
        pillDiv.className = 'share-server-status-pill';
        pillDiv.style.marginBottom = '12px';
        pillDiv.innerHTML = pillHtml;
        mainBox.insertBefore(pillDiv, mainBox.firstChild);
      } else {
        existingStatus.innerHTML = pillHtml;
      }

      const emailListEl = document.getElementById('share-email-members-list');
      const linkListEl = document.getElementById('share-active-links-list');

      if (emailListEl) emailListEl.innerHTML = '<div class="share-loading-spinner"><i data-lucide="loader-2" class="spin"></i> Đang tải danh sách phân quyền từ Google Drive...</div>';
      if (linkListEl) linkListEl.innerHTML = '<div class="share-loading-spinner"><i data-lucide="loader-2" class="spin"></i> Đang tải danh sách liên kết...</div>';
      if (window.lucide) lucide.createIcons();

      try {
        const res = await window.googleDriveService.getItemShares(this.currentType, this.currentId);
        this.shares = res.shares || [];
        const rawLinks = res.links || [];
        for (const l of rawLinks) {
          l.shareKey = await window.googleDriveService.getItemShareKey(l.token) || await window.googleDriveService.getItemShareKey(`${this.currentType}_${this.currentId}`);
        }
        this.links = rawLinks;

        this.renderEmailShares();
        this.renderShareLinks();

        const totalShares = (this.shares.length || 0) + (this.links.length || 0);
        await this.updateItemSharedState(totalShares > 0 ? 1 : 0);
      } catch (err) {
        console.warn('[ShareModal] Lỗi tải dữ liệu chia sẻ Google Drive:', err);
        if (emailListEl) emailListEl.innerHTML = `<div class="share-empty-box text-danger">${escapeHTML(err.message)}</div>`;
        if (linkListEl) linkListEl.innerHTML = `<div class="share-empty-box text-danger">${escapeHTML(err.message)}</div>`;
      }
      this.renderSharedServicesSummary();
      return;
    }

    // 3. DROPBOX
    if (this.currentService === 'dropbox') {
      if (serverSection) serverSection.style.display = 'none';
      const isDropboxConnected = Boolean(window.dropboxService && (window.dropboxService.userProfile || window.dropboxService.isConnected));

      if (!isDropboxConnected) {
        if (cloudNoticeSection) {
          cloudNoticeSection.style.display = 'block';
          cloudNoticeSection.innerHTML = `
            <div class="share-auth-prompt-card not-configured" style="text-align: center; padding: 24px 18px;">
              <div class="share-auth-icon-wrap warn" style="margin: 0 auto 12px; width: 48px; height: 48px; border-radius: 50%; background: rgba(245, 158, 11, 0.15); display: flex; align-items: center; justify-content: center;">
                <i data-lucide="cloud-off" style="width: 24px; height: 24px; color: #f59e0b;"></i>
              </div>
              <h4 style="font-size: 0.95rem; font-weight: 700; color: #f8fafc; margin-bottom: 6px;">Cần kết nối tới dịch vụ sao lưu để có thể bắt đầu chia sẻ.</h4>
              <p style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 18px; line-height: 1.45;">Vui lòng kết nối tài khoản Dropbox trong phần Cài đặt.</p>
              <button type="button" class="btn-primary" style="padding: 10px 22px; font-size: 0.84rem; display: inline-flex; align-items: center; gap: 8px; margin: 0 auto; border-radius: 8px; font-weight: 600;" onclick="UniversalShareModal.goToSettings('dropbox')">
                <i data-lucide="settings" style="width: 15px; height: 15px;"></i> Chuyển đến Cài đặt
              </button>
            </div>
          `;
        }
      } else {
        if (cloudNoticeSection) {
          cloudNoticeSection.style.display = 'block';
          cloudNoticeSection.innerHTML = `
            <div class="share-cloud-notice-box">
              <div class="share-notice-icon">
                <i data-lucide="info" style="width: 28px; height: 28px;"></i>
              </div>
              <h4>Dịch vụ Dropbox</h4>
              <p>Hiện tại Dropbox hỗ trợ sao lưu dự phòng toàn bộ sổ vào đám mây. Cơ chế chia sẻ độc lập từng tài khoản/sổ qua Dropbox đang được hoàn thiện.</p>
              <p style="margin-top: 10px; font-weight: 500; color: var(--primary-color);">Vui lòng chọn <strong>Máy Chủ Riêng (Self-Hosted)</strong> để phân quyền và chia sẻ tức thì.</p>
            </div>
          `;
        }
      }
      if (window.lucide) lucide.createIcons();
      return;
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
      if (e.possible2FA || (e.duration > 3500 && (e.message?.includes('popup_closed') || e.message?.includes('Đã đóng')))) {
        if (typeof showToast === 'function') showToast('Đã xác thực Google xong! Vui lòng bấm Đăng nhập lại 1 lần để hoàn tất.', 'info', 6000);
      } else if (typeof showToast === 'function') {
        showToast(e.message, 'warning');
      }
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
        ? '<span class="share-role-badge editor" title="Quyền Chỉnh sửa (Editor)"><i data-lucide="edit-3" style="width:14px;height:14px;"></i></span>'
        : '<span class="share-role-badge viewer" title="Quyền Chỉ xem (Viewer)"><i data-lucide="eye" style="width:14px;height:14px;"></i></span>';

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
            <button type="button" class="btn-revoke-share" title="Thu hồi quyền" aria-label="Thu hồi quyền" onclick="UniversalShareModal.handleRevokeEmailShare('${s.id}')">
              <i data-lucide="user-x" style="width: 15px; height: 15px;"></i>
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

  async updateItemSharedState(isShared) {
    const val = isShared ? 1 : 0;
    const currentService = this.currentService || 'server';

    try {
      let ownedList = [];
      if (db.settings) {
        const ownedSetting = await db.settings.get('syncOwnedSharedProjections');
        ownedList = (ownedSetting && Array.isArray(ownedSetting.value)) ? [...ownedSetting.value] : [];
      }

      if (val === 1) {
        // Ghi nhận projection cho dịch vụ hiện tại nếu chưa có
        const exists = ownedList.some(x => x.itemType === this.currentType && String(x.itemId) === String(this.currentId) && (x.service === currentService || (!x.service && currentService === 'server')));
        if (!exists) {
          ownedList.push({
            itemType: this.currentType,
            itemId: String(this.currentId),
            service: currentService
          });
          if (db.settings) {
            await db.settings.put({ key: 'syncOwnedSharedProjections', value: ownedList });
          }
        }
      } else {
        // Chỉ gỡ projection của dịch vụ hiện tại (không ảnh hưởng dịch vụ đồng bộ khác)
        ownedList = ownedList.filter(x => {
          const matchItem = x.itemType === this.currentType && String(x.itemId) === String(this.currentId);
          if (!matchItem) return true;
          const svc = x.service || 'server';
          return svc !== currentService;
        });
        if (db.settings) {
          await db.settings.put({ key: 'syncOwnedSharedProjections', value: ownedList });
        }
      }

      // Xác định cờ isShared chung cho item: Nếu item còn bất kỳ projection nào ở bất kỳ dịch vụ nào -> 1, ngược lại -> 0
      const stillSharedAnywhere = ownedList.some(x => x.itemType === this.currentType && String(x.itemId) === String(this.currentId));
      const finalVal = stillSharedAnywhere ? 1 : 0;

      if (this.currentItem) this.currentItem.isShared = finalVal;

      if (this.currentType === 'account') {
        await db.accounts.update(this.currentId, { isShared: finalVal, updatedAt: Date.now() });
      } else if (this.currentType === 'savings' && db.savings) {
        await db.savings.update(this.currentId, { isShared: finalVal, updatedAt: Date.now() });
      } else if (this.currentType === 'accumulation' && db.accumulations) {
        await db.accumulations.update(this.currentId, { isShared: finalVal, updatedAt: Date.now() });
      } else if (this.currentType === 'loan' && db.loans) {
        await db.loans.update(this.currentId, { isShared: finalVal, updatedAt: Date.now() });
      } else if (this.currentType === 'asset' && db.assets) {
        await db.assets.update(this.currentId, { isShared: finalVal, updatedAt: Date.now() });
      }

      window.dispatchEvent(new CustomEvent('shared-items-updated', {
        detail: { itemType: this.currentType, itemId: this.currentId, isShared: finalVal, service: currentService }
      }));

      if (window.app && typeof window.app.refreshAll === 'function') {
        await window.app.refreshAll();
      }
    } catch (e) {
      console.warn('[UniversalShareModal] updateItemSharedState error:', e);
    }
  },

  async renderSharedServicesSummary() {
    const listEl = document.getElementById('universal-share-summary-list');
    const badgeEl = document.getElementById('universal-share-summary-total-badge');
    if (!listEl) return;

    const sService = window.serverSyncService;
    const gService = window.googleDriveService;

    // Lấy thông tin chia sẻ từ Máy Chủ Riêng
    let serverSharesCount = 0;
    let serverLinksCount = 0;
    let serverStatus = 'not-connected';
    let serverStatusText = 'Chưa kết nối';
    if (sService && sService.token && sService.serverUrl) {
      serverStatus = sService.autoSync !== false ? 'connected' : 'disabled';
      serverStatusText = sService.autoSync !== false ? 'Đã kết nối' : 'Đã vô hiệu hóa';
      try {
        const sRes = await sService.getItemShares(this.currentType, this.currentId);
        serverSharesCount = sRes?.shares?.length || 0;
        serverLinksCount = sRes?.links?.length || 0;
      } catch (_) {}
    }

    // Lấy thông tin chia sẻ từ Google Drive
    let driveSharesCount = 0;
    let driveLinksCount = 0;
    let driveStatus = 'not-connected';
    let driveStatusText = 'Chưa kết nối';
    if (gService && gService.isConnected) {
      driveStatus = gService.autoSync !== false ? 'connected' : 'disabled';
      driveStatusText = gService.autoSync !== false ? 'Đã kết nối' : 'Đã vô hiệu hóa';
      try {
        const gRes = await gService.getItemShares(this.currentType, this.currentId);
        driveSharesCount = gRes?.shares?.length || 0;
        driveLinksCount = gRes?.links?.length || 0;
      } catch (_) {}
    }

    const services = [
      {
        id: 'server',
        name: 'Máy Chủ Riêng (Self-Hosted)',
        iconHtml: '<i data-lucide="server" style="width: 15px; height: 15px; color: #10b981;"></i>',
        status: serverStatus,
        statusText: serverStatusText,
        sharesCount: serverSharesCount,
        linksCount: serverLinksCount,
        isCurrent: this.currentService === 'server'
      },
      {
        id: 'google-drive',
        name: 'Google Drive',
        iconHtml: '<svg viewBox="0 0 87.3 78" style="width: 15px; height: 14px;"><path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"/><path fill="#00ac47" d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z"/><path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z"/><path fill="#00832d" d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"/><path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"/><path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z"/></svg>',
        status: driveStatus,
        statusText: driveStatusText,
        sharesCount: driveSharesCount,
        linksCount: driveLinksCount,
        isCurrent: this.currentService === 'google-drive'
      },
      {
        id: 'dropbox',
        name: 'Dropbox',
        iconHtml: '<i data-lucide="box" style="width: 15px; height: 15px; color: #0061ff;"></i>',
        status: 'planned',
        statusText: 'Sắp hỗ trợ',
        sharesCount: 0,
        linksCount: 0,
        isCurrent: this.currentService === 'dropbox',
        isPlanned: true
      }
    ];

    let totalActiveMembers = serverSharesCount + driveSharesCount;
    let totalActiveLinks = serverLinksCount + driveLinksCount;
    let activePlatformsCount = (serverSharesCount + serverLinksCount > 0 ? 1 : 0) + (driveSharesCount + driveLinksCount > 0 ? 1 : 0);

    if (badgeEl) {
      if (activePlatformsCount > 0) {
        badgeEl.textContent = `Đang share trên ${activePlatformsCount} dịch vụ (${totalActiveMembers} email, ${totalActiveLinks} link)`;
        badgeEl.style.background = 'rgba(16, 185, 129, 0.16)';
        badgeEl.style.color = '#10b981';
        badgeEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      } else {
        badgeEl.textContent = 'Chưa chia sẻ trên dịch vụ nào';
        badgeEl.style.background = 'rgba(148, 163, 184, 0.15)';
        badgeEl.style.color = '#94a3b8';
        badgeEl.style.borderColor = 'rgba(148, 163, 184, 0.25)';
      }
    }

    listEl.innerHTML = services.map(s => {
      const hasShares = (s.sharesCount + s.linksCount) > 0;
      let shareDetailText = 'Chưa có thành viên nào';
      if (s.isPlanned) {
        shareDetailText = 'Hiện hỗ trợ sao lưu toàn bộ sổ';
      } else if (hasShares) {
        const parts = [];
        if (s.sharesCount > 0) parts.push(`<strong>${s.sharesCount}</strong> email`);
        if (s.linksCount > 0) parts.push(`<strong>${s.linksCount}</strong> link`);
        shareDetailText = `Đang chia sẻ: ${parts.join(', ')}`;
      }

      const statusBadgeStyles = {
        connected: 'background: rgba(16, 185, 129, 0.14); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.28);',
        disabled: 'background: rgba(245, 158, 11, 0.14); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.28);',
        'not-connected': 'background: rgba(239, 68, 68, 0.14); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.28);',
        planned: 'background: rgba(148, 163, 184, 0.14); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.25);'
      }[s.status] || 'background: rgba(148, 163, 184, 0.14); color: #94a3b8;';

      const rowBorder = s.isCurrent ? 'border: 1px solid rgba(59, 130, 246, 0.45); background: rgba(59, 130, 246, 0.08);' : 'border: 1px solid rgba(255, 255, 255, 0.06); background: rgba(30, 41, 59, 0.4);';

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; border-radius: 8px; ${rowBorder}">
          <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
            <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              ${s.iconHtml}
            </div>
            <div style="min-width: 0; flex: 1;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="font-size: 0.82rem; font-weight: 700; color: var(--text-primary); white-space: nowrap;">${s.name}</span>
                <span style="font-size: 0.65rem; font-weight: 600; padding: 1px 6px; border-radius: 9999px; ${statusBadgeStyles}">${s.statusText}</span>
                ${s.isCurrent ? '<span style="font-size: 0.65rem; font-weight: 600; padding: 1px 6px; border-radius: 9999px; background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.35);">Đang mở</span>' : ''}
              </div>
              <div style="font-size: 0.74rem; color: ${hasShares ? '#10b981' : 'var(--text-muted)'}; margin-top: 1px;">
                ${shareDetailText}
              </div>
            </div>
          </div>
          ${!s.isCurrent && !s.isPlanned ? `
            <button type="button" class="btn-secondary btn-sm" onclick="UniversalShareModal.selectService('${s.id}', event)" style="padding: 4px 10px; font-size: 0.75rem; white-space: nowrap; flex-shrink: 0; display: inline-flex; align-items: center; gap: 4px;">
              <span>Quản lý</span>
              <i data-lucide="chevron-right" style="width: 12px; height: 12px;"></i>
            </button>
          ` : ''}
        </div>
      `;
    }).join('');

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
      const syncService = this.getActiveService();
      await syncService.shareItemWithEmail(
        this.currentType,
        this.currentId,
        this.currentItem.name,
        email,
        role
      );

      if (input) input.value = '';
      this.hideShareUserDropdown();
      await this.updateItemSharedState(1);
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
      const syncService = this.getActiveService();
      await syncService.revokeItemEmailShare(shareId, this.currentType, this.currentId);
      if (typeof showToast === 'function') showToast('Đã thu hồi quyền thành công.', 'success');
      await this.loadShareData();
      if ((this.shares.length || 0) + (this.links.length || 0) === 0) {
        await this.updateItemSharedState(0);
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message, 'error');
    }
  },

  async handleCreateLink() {
    const roleSelect = document.getElementById('share-link-role');
    const role = roleSelect?.value || 'viewer';

    try {
      if (typeof showToast === 'function') showToast('Đang tạo liên kết chia sẻ...', 'info');
      const syncService = this.getActiveService();
      await syncService.createItemShareLink(
        this.currentType,
        this.currentId,
        this.currentItem.name,
        role
      );

      if (typeof showToast === 'function') showToast('Tạo liên kết chia sẻ thành công!', 'success');
      await this.updateItemSharedState(1);
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
      const syncService = this.getActiveService();
      await syncService.revokeItemShareLink(linkId, this.currentType, this.currentId);
      if (typeof showToast === 'function') showToast('Đã thu hồi liên kết thành công.', 'success');
      await this.loadShareData();
      if ((this.shares.length || 0) + (this.links.length || 0) === 0) {
        await this.updateItemSharedState(0);
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message, 'error');
    }
  },

  async copyLink(token) {
    const syncService = this.getActiveService();
    const key = (await syncService.getItemShareKey(token)) || (await syncService.getItemShareKey(`${this.currentType}_${this.currentId}`));
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
  },

  // Tải danh sách người dùng trên server để gợi ý autocomplete
  async loadServerUsersForShare() {
    const sService = window.serverSyncService;
    if (!sService || !sService.serverUrl || !sService.token) return;
    if (window.UISettings && Array.isArray(window.UISettings.serverUsersCache) && window.UISettings.serverUsersCache.length > 0) {
      this.serverUsersCache = window.UISettings.serverUsersCache;
    }
    try {
      const users = await sService.fetchServerUsers();
      if (Array.isArray(users)) {
        this.serverUsersCache = users;
        if (window.UISettings) {
          window.UISettings.serverUsersCache = users;
        }
      }
    } catch (e) {
      console.warn('[UniversalShareModal] loadServerUsersForShare error:', e);
    }
  },

  renderShareUserDropdown(filterText = '') {
    const dropdown = document.getElementById('universal-share-user-dropdown');
    if (!dropdown) return;

    // Chỉ tìm kiếm danh sách người dùng khi đang chia sẻ qua Máy Chủ Riêng (Server)
    if (this.currentService !== 'server') {
      dropdown.style.display = 'none';
      return;
    }

    const sService = window.serverSyncService;
    if (!sService || !sService.serverUrl || !sService.token) {
      dropdown.style.display = 'none';
      return;
    }

    // Nếu chưa có cache mà đang kết nối server, fetch ngay
    if ((!this.serverUsersCache || this.serverUsersCache.length === 0) && sService.userProfile) {
      this.loadServerUsersForShare().then(() => {
        if (this.serverUsersCache && this.serverUsersCache.length > 0) {
          this.renderShareUserDropdown(filterText);
        }
      });
    }

    const currentEmail = (sService?.userProfile?.email || '').toLowerCase();
    const query = (filterText || '').trim().toLowerCase();

    // Lọc người dùng: loại trừ bản thân người dùng hiện tại
    let users = (this.serverUsersCache || []).filter(u => {
      const uEmail = (u.email || '').toLowerCase();
      if (uEmail === currentEmail) return false;
      if (!query) return true;
      const uName = (u.name || '').toLowerCase();
      return uEmail.includes(query) || uName.includes(query);
    });

    // Nếu không có user nào khớp thì ẩn luôn, không che nút bên dưới
    if (users.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    const esc = typeof escapeHTML === 'function' ? escapeHTML : (s => s || '');

    dropdown.innerHTML = `
      <div class="server-share-user-dropdown-header">
        <span>TÀI KHOẢN TRÊN MÁY CHỦ (${users.length})</span>
        <span style="font-size: 0.64rem; font-weight: normal; opacity: 0.7;">CHỌN ĐỂ ĐIỀN NHANH</span>
      </div>
      ${users.map(u => {
        const uEmail = esc(u.email || '');
        const uName = esc(u.name || u.email || 'Người dùng');
        const firstLetter = (u.name || u.email || 'U').charAt(0).toUpperCase();
        const avatarHtml = u.picture 
          ? `<img src="${esc(u.picture)}" class="server-share-user-avatar" alt="${uName}">`
          : `<div class="server-share-user-avatar-fallback">${esc(firstLetter)}</div>`;

        return `
          <div class="server-share-user-item" data-email="${uEmail}">
            ${avatarHtml}
            <div class="server-share-user-info">
              <div class="server-share-user-name">${uName}</div>
              <div class="server-share-user-email">${uEmail}</div>
            </div>
          </div>
        `;
      }).join('')}
    `;

    dropdown.style.display = 'block';
  },

  hideShareUserDropdown() {
    const dropdown = document.getElementById('universal-share-user-dropdown');
    if (dropdown) dropdown.style.display = 'none';
  },

  selectShareUser(email) {
    const emailInput = document.getElementById('share-email-input');
    if (emailInput) {
      emailInput.value = email;
      emailInput.focus();
    }
    this.hideShareUserDropdown();
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
    const matchKey = input.match(/[#&?]key=([^&]+)/);
    const key = matchKey ? decodeURIComponent(matchKey[1]) : null;
    await this.promptWithToken(token, key);
  },

  // Đồng bộ và tự động nhận các sổ được chia sẻ từ Google Drive & Server
  async pickGoogleDrive() {
    if (typeof showToast === 'function') showToast('Đang quét và đồng bộ các sổ được chia sẻ...', 'info');
    if (window.UIAccounts && typeof UIAccounts.manualSyncSharedItems === 'function') {
      await UIAccounts.manualSyncSharedItems();
    }
  },

  async promptWithToken(token, key = null) {
    this.currentToken = token;
    if (key) this.currentKey = key;
    if (typeof showToast === 'function') showToast('Đang kiểm tra liên kết chia sẻ...', 'info');

    try {
      const isGDrive = token.startsWith('gdrive_');
      const syncService = isGDrive ? window.googleDriveService : window.serverSyncService;
      if (!syncService) throw new Error('Dịch vụ đồng bộ chưa sẵn sàng.');

      let info;
      try {
        info = await syncService.getShareLinkInfo(token);
      } catch (linkErr) {
        if (isGDrive && window.googleDriveService && (linkErr.message?.includes('404') || linkErr.message?.includes('quyền truy cập') || linkErr.message?.includes('không tồn tại'))) {
          throw new Error('Không thể tìm thấy hoặc truy cập tệp chia sẻ này trên Google Drive. Vui lòng đảm bảo chủ sở hữu đã chia sẻ đúng tài khoản Google của bạn, hoặc bấm nút "Kiểm tra & Đồng bộ" để tự động nhận sổ.');
        }
        throw linkErr;
      }
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
        if (info.service === 'google-drive') {
          typeBadgeHtml += ' &bull; <span style="color:#2563eb; font-weight:600;"><i data-lucide="cloud" style="width:12px;height:12px;display:inline-block;vertical-align:middle;"></i> Google Drive</span>';
        }
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
      const isGDrive = this.currentToken.startsWith('gdrive_');
      const syncService = isGDrive ? window.googleDriveService : window.serverSyncService;
      if (!syncService) throw new Error('Dịch vụ đồng bộ chưa sẵn sàng.');

      const result = await syncService.acceptShareLink(this.currentToken, this.currentKey);

      // Lưu khóa giải mã cho item này nếu có
      if (this.currentKey) {
        const targetShareId = result?.shareId || result?.fileId;
        if (targetShareId) {
          await syncService.saveItemShareKey(targetShareId, this.currentKey);
        }
        if (this.shareData && this.shareData.itemId) {
          await syncService.saveItemShareKey(this.shareData.itemId, this.currentKey);
          await syncService.saveItemShareKey(`${this.shareData.itemType}_${this.shareData.itemId}`, this.currentKey);
        }
      }

      // Đồng bộ ngay dữ liệu vào IndexedDB
      await syncService.syncReceivedSharedItems();

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

// Đóng dropdown dịch vụ khi click hoặc chạm ngoài
['click', 'touchend'].forEach(evtType => {
  document.addEventListener(evtType, (e) => {
    if (!e.target.closest('#share-service-dropdown-wrapper')) {
      if (window.UniversalShareModal) UniversalShareModal.closeServiceDropdown();
    }
  }, { passive: true });
});

// Email Auto-complete & User Dropdown cho UniversalShareModal
const initUniversalShareEmailDropdown = () => {
  const shareEmailInput = document.getElementById('share-email-input');
  const shareUserDropdown = document.getElementById('universal-share-user-dropdown');

  if (shareEmailInput) {
    shareEmailInput.addEventListener('focus', () => {
      if (window.UniversalShareModal) UniversalShareModal.renderShareUserDropdown(shareEmailInput.value);
    });
    shareEmailInput.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.UniversalShareModal) UniversalShareModal.renderShareUserDropdown(shareEmailInput.value);
    });
    shareEmailInput.addEventListener('input', () => {
      if (window.UniversalShareModal) UniversalShareModal.renderShareUserDropdown(shareEmailInput.value);
    });
  }

  if (shareUserDropdown) {
    shareUserDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = e.target.closest('.server-share-user-item');
      if (!item) return;
      const email = item.getAttribute('data-email');
      if (email && window.UniversalShareModal) {
        UniversalShareModal.selectShareUser(email);
      }
    });
  }

  document.addEventListener('click', (e) => {
    const wrapper = e.target.closest('#universal-share-email-wrapper');
    if (!wrapper) {
      if (window.UniversalShareModal) UniversalShareModal.hideShareUserDropdown();
    }
  });
};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initUniversalShareEmailDropdown);
} else {
  initUniversalShareEmailDropdown();
}

