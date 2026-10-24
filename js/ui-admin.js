/**
 * SỔ THU CHI - INTEGRATED SERVER ADMIN CONTROLLER (MOBILE FIRST)
 * Module Quản Trị Máy Chủ Tự Lưu Trữ (Self-Hosted Admin Hub):
 * - Tích hợp trực tiếp vào ứng dụng SPA Sổ Thu Chi (Settings -> Quản Trị Máy Chủ)
 * - Tối ưu 100% cho điện thoại di động & màn hình cảm ứng (Mobile-First)
 * - Đồng bộ hoàn toàn Theme (Sáng/Tối), Icon Lucide, Dialog & Toast của Sổ Thu Chi
 * - Quản lý Người dùng, Toàn bộ Sổ & Cascade Delete an toàn
 * - Trung tâm dọn dẹp dữ liệu rác 1-chạm & Quét chuyên sâu
 * - Phân quyền Admin động cho tài khoản Google
 * - Tối ưu hóa SQLite database (VACUUM & WAL checkpoint)
 */

window.UIAdmin = {
  activeTab: 'admin-tab-overview',
  overviewData: null,
  usersData: [],
  vaultsData: [],
  garbageData: null,
  adminsData: [],
  userFilter: 'all',
  vaultFilter: 'all',
  isLoading: false,

  // 1. KHỞI TẠO MODULE
  async init() {
    const sService = window.serverSyncService;
    const token = (sService && sService.token) || (typeof localStorage !== 'undefined' ? (localStorage.getItem('syncServerToken') || localStorage.getItem('stc_admin_token')) : null);
    if (!token) {
      if (typeof showToast === 'function') showToast('Yêu cầu đăng nhập máy chủ để vào Quản trị', 'error');
      if (window.UISettings && typeof window.UISettings.backToHub === 'function') window.UISettings.backToHub();
      return;
    }

    try {
      const authStatus = sService && typeof sService.checkAdminStatus === 'function' ? await sService.checkAdminStatus() : null;
      if (!authStatus || !authStatus.authenticated || !authStatus.adminUser) {
        if (typeof showToast === 'function') showToast('Bạn không có quyền quản trị máy chủ.', 'error');
        if (window.UISettings && typeof window.UISettings.backToHub === 'function') window.UISettings.backToHub();
        return;
      }
    } catch (_) {
      if (typeof showToast === 'function') showToast('Không thể xác thực quyền quản trị', 'error');
      if (window.UISettings && typeof window.UISettings.backToHub === 'function') window.UISettings.backToHub();
      return;
    }

    this.bindEventsOnce();
    this.switchTab(this.activeTab || 'admin-tab-overview');
    await this.refreshAllData();
  },

  _eventsBound: false,
  bindEventsOnce() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    // Search user
    const userInput = document.getElementById('admin-users-search');
    if (userInput) {
      userInput.addEventListener('input', () => this.renderUsersList());
    }

    // Search vault
    const vaultInput = document.getElementById('admin-vaults-search');
    if (vaultInput) {
      vaultInput.addEventListener('input', () => this.renderVaultsList());
    }

    // Add admin email input & dropdown events
    const addAdminInput = document.getElementById('admin-new-email-input');
    const adminEmailDropdown = document.getElementById('admin-new-email-dropdown');
    if (addAdminInput) {
      addAdminInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
          this.hideAdminEmailDropdown();
          this.addAdminEmail();
        }
      });
      addAdminInput.addEventListener('focus', () => {
        this.renderAdminEmailDropdown(addAdminInput.value);
      });
      addAdminInput.addEventListener('click', (e) => {
        e.stopPropagation();
        this.renderAdminEmailDropdown(addAdminInput.value);
      });
      addAdminInput.addEventListener('input', () => {
        this.renderAdminEmailDropdown(addAdminInput.value);
      });
    }

    if (adminEmailDropdown) {
      adminEmailDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.server-share-user-item');
        if (!item) return;
        const email = item.getAttribute('data-email');
        if (email) {
          this.selectAdminEmail(email);
        }
      });
    }

    document.addEventListener('click', (e) => {
      const wrapper = e.target.closest('.server-share-email-wrapper');
      if (!wrapper) {
        this.hideAdminEmailDropdown();
      }
    });
  },

  // 2. GỌI API BACKEND VỚI TOKEN XÁC THỰC HIỆN TẠI
  async fetchApi(endpoint, options = {}) {
    const sService = window.serverSyncService;
    const token = (sService && sService.token) || (typeof localStorage !== 'undefined' ? (localStorage.getItem('syncServerToken') || localStorage.getItem('stc_admin_token')) : null);

    let baseUrl = '';
    if (sService && sService.serverUrl) {
      baseUrl = sService.serverUrl.replace(/\/+$/, '');
    } else if (typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http')) {
      baseUrl = window.location.origin;
    }

    const headers = options.headers ? { ...options.headers } : {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      throw new Error('Bạn không có quyền quản trị máy chủ hoặc phiên đã hết hạn.');
    }
    return res;
  },

  // 3. CHUYỂN TAB MOBILE
  switchTab(tabId) {
    this.activeTab = tabId;

    const btns = document.querySelectorAll('.admin-nav-pill-btn');
    btns.forEach(b => {
      const target = b.getAttribute('data-tab');
      if (target === tabId) {
        b.classList.add('active');
        // Scroll button into view smoothly on mobile
        try {
          b.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } catch (_) {}
      } else {
        b.classList.remove('active');
      }
    });

    const tabs = document.querySelectorAll('.admin-tab-pane');
    tabs.forEach(t => {
      t.style.display = (t.id === tabId) ? 'block' : 'none';
    });

    if (window.lucide) lucide.createIcons();
  },

  // 4. LÀM MỚI TOÀN BỘ DỮ LIỆU
  async refreshAllData() {
    if (this.isLoading) return;
    this.isLoading = true;

    const spinIcon = document.getElementById('admin-btn-refresh-icon');
    if (spinIcon) spinIcon.classList.add('spin-animation');

    try {
      await Promise.all([
        this.loadOverview(),
        this.loadUsers(),
        this.loadVaults(),
        this.loadGarbage(),
        this.loadAdmins()
      ]);
    } catch (err) {
      console.warn('[UIAdmin] refresh error:', err);
      if (typeof showToast === 'function') {
        showToast(err.message || 'Lỗi tải dữ liệu quản trị máy chủ', 'error');
      }
    } finally {
      this.isLoading = false;
      if (spinIcon) spinIcon.classList.remove('spin-animation');
      if (window.lucide) lucide.createIcons();
    }
  },

  // 5. TAB 1: TỔNG QUAN (OVERVIEW)
  async loadOverview() {
    try {
      const res = await this.fetchApi('/api/admin/overview');
      if (!res.ok) return;
      const data = await res.json();
      this.overviewData = data;

      // Header summary badges
      const dbSizeEl = document.getElementById('admin-hdr-db-size');
      if (dbSizeEl) dbSizeEl.textContent = this.formatBytes(data.storage.dbSizeBytes);

      const uptimeEl = document.getElementById('admin-hdr-uptime');
      if (uptimeEl) uptimeEl.textContent = this.formatUptime(data.system.uptime);

      // Stat cards
      const uTotal = document.getElementById('admin-stat-users-total');
      if (uTotal) uTotal.textContent = data.users.total;
      const uSub = document.getElementById('admin-stat-users-sub');
      if (uSub) uSub.textContent = `${data.users.testCount} user test`;

      const vTotal = document.getElementById('admin-stat-vaults-total');
      if (vTotal) vTotal.textContent = data.vaults.total;
      const vSub = document.getElementById('admin-stat-vaults-sub');
      if (vSub) vSub.textContent = `${data.vaults.emptyCount} sổ trống (0 gd)`;

      const sTotal = document.getElementById('admin-stat-snapshots-total');
      if (sTotal) sTotal.textContent = data.storage.snapshotsTotal;
      const sSub = document.getElementById('admin-stat-snapshots-sub');
      if (sSub) sSub.textContent = `File DB: ${this.formatBytes(data.storage.dbSizeBytes)}`;

      const sessTotal = document.getElementById('admin-stat-sessions-total');
      if (sessTotal) sessTotal.textContent = `${data.sessions.total} / ${data.shares.totalLinks}`;
      const sessSub = document.getElementById('admin-stat-sessions-sub');
      if (sessSub) sessSub.textContent = `${data.sessions.expired} phiên hết hạn`;

      // Update counters on tab pills
      const userTabCount = document.getElementById('admin-pill-users-count');
      if (userTabCount) userTabCount.textContent = data.users.total;

      const vaultTabCount = document.getElementById('admin-pill-vaults-count');
      if (vaultTabCount) vaultTabCount.textContent = data.vaults.total;

      const garbageBadge = document.getElementById('admin-pill-garbage-badge');
      if (garbageBadge) {
        if (data.garbage.totalGarbageItems > 0) {
          garbageBadge.textContent = data.garbage.totalGarbageItems;
          garbageBadge.style.display = 'inline-flex';
        } else {
          garbageBadge.style.display = 'none';
        }
      }

      this.renderQuickCleanupBox(data);
    } catch (_) {}
  },

  renderQuickCleanupBox(data) {
    const card = document.getElementById('admin-quick-cleanup-card');
    const titleEl = document.getElementById('admin-cleanup-status-title');
    const descEl = document.getElementById('admin-cleanup-status-desc');
    const btnAll = document.getElementById('admin-btn-cleanup-all');
    const itemsContainer = document.getElementById('admin-cleanup-items-preview');

    if (!card || !titleEl || !descEl || !itemsContainer) return;

    const g = data.garbage;
    const hasGarbage = g && g.totalGarbageItems > 0;

    if (!hasGarbage) {
      card.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(13, 148, 136, 0.04))';
      card.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      titleEl.innerHTML = '<i data-lucide="check-circle-2" style="width: 17px; height: 17px; color: #10b981;"></i> Máy chủ sạch sẽ & tối ưu';
      descEl.textContent = 'Không có phiên đăng nhập hết hạn, liên kết hết hạn hoặc sổ trống lúc test.';
      if (btnAll) btnAll.style.display = 'none';
      itemsContainer.innerHTML = '';
      if (window.lucide) lucide.createIcons();
      return;
    }

    card.style.background = 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(239, 68, 68, 0.04))';
    card.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    titleEl.innerHTML = `<i data-lucide="alert-triangle" style="width: 17px; height: 17px; color: #f59e0b;"></i> Phát hiện ${g.totalGarbageItems} mục rác cần dọn`;
    descEl.textContent = 'Bao gồm các phiên hết hạn, sổ trống lúc thử nghiệm, tài khoản test và snapshot cũ.';
    if (btnAll) btnAll.style.display = 'inline-flex';

    let html = '';
    if (g.expiredSessionsCount > 0) {
      html += `
        <div class="admin-cleanup-pill-item">
          <span>${g.expiredSessionsCount} phiên hết hạn</span>
          <button type="button" class="btn-clean-mini" onclick="UIAdmin.runCleanup('purge_expired_sessions')">Dọn</button>
        </div>
      `;
    }
    if (g.expiredLinksCount > 0) {
      html += `
        <div class="admin-cleanup-pill-item">
          <span>${g.expiredLinksCount} link share hết hạn</span>
          <button type="button" class="btn-clean-mini" onclick="UIAdmin.runCleanup('purge_expired_links')">Dọn</button>
        </div>
      `;
    }
    if (g.emptyVaultsCount > 0) {
      html += `
        <div class="admin-cleanup-pill-item">
          <span>${g.emptyVaultsCount} sổ trống (0 gd)</span>
          <button type="button" class="btn-clean-mini" onclick="UIAdmin.runCleanup('delete_empty_vaults')">Xóa</button>
        </div>
      `;
    }
    if (g.testUsersCount > 0) {
      html += `
        <div class="admin-cleanup-pill-item">
          <span>${g.testUsersCount} tài khoản test</span>
          <button type="button" class="btn-clean-mini" onclick="UIAdmin.runCleanup('delete_test_data')">Xóa</button>
        </div>
      `;
    }
    if (g.snapshotsCount > 10) {
      html += `
        <div class="admin-cleanup-pill-item">
          <span>${g.snapshotsCount} snapshots lịch sử</span>
          <button type="button" class="btn-clean-mini" onclick="UIAdmin.runCleanup('prune_snapshots')">Thu gọn</button>
        </div>
      `;
    }

    itemsContainer.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  // 6. TAB 2: QUẢN LÝ NGƯỜI DÙNG
  async loadUsers() {
    try {
      const res = await this.fetchApi('/api/admin/users');
      if (!res.ok) return;
      const data = await res.json();
      this.usersData = data.users || [];
      this.renderUsersList();
    } catch (_) {}
  },

  setUserFilter(filter) {
    this.userFilter = filter;
    document.querySelectorAll('.admin-user-filter-chip').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-filter') === filter);
    });
    this.renderUsersList();
  },

  renderUsersList() {
    const container = document.getElementById('admin-users-list-container');
    if (!container) return;

    const searchVal = (document.getElementById('admin-users-search')?.value || '').toLowerCase().trim();
    let list = (this.usersData || []).slice();

    if (this.userFilter === 'real') {
      list = list.filter(u => !u.is_test_user);
    } else if (this.userFilter === 'test') {
      list = list.filter(u => u.is_test_user);
    } else if (this.userFilter === 'abandoned') {
      list = list.filter(u => u.is_abandoned);
    }

    if (searchVal) {
      list = list.filter(u => (u.name || '').toLowerCase().includes(searchVal) || (u.email || '').toLowerCase().includes(searchVal) || (u.id || '').toLowerCase().includes(searchVal));
    }

    if (list.length === 0) {
      container.innerHTML = `
        <div class="settings-card-clean" style="text-align: center; color: var(--text-muted); padding: 24px 14px;">
          <i data-lucide="user-x" style="width: 28px; height: 28px; opacity: 0.4; margin-bottom: 6px;"></i>
          <div style="font-size: 0.82rem;">Không tìm thấy người dùng nào phù hợp.</div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = list.map(u => {
      const isQuick = (u.google_id || '').startsWith('quick_');
      const badgeAccount = isQuick
        ? `<span class="settings-status-pill pill-amber" style="font-size: 0.65rem;">Test Quick</span>`
        : `<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;">Google</span>`;

      const badgeStatus = u.is_abandoned
        ? `<span class="settings-status-pill pill-red" style="font-size: 0.65rem;">>30 ngày</span>`
        : `<span class="settings-status-pill pill-gray" style="font-size: 0.65rem;">Hoạt động</span>`;

      const avatarSrc = u.picture || './assets/icons/icon.svg';

      return `
        <div class="admin-mobile-card">
          <div class="admin-mobile-card-header">
            <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
              <img src="${avatarSrc}" alt="Avatar" class="admin-user-avatar-round">
              <div style="min-width: 0; flex: 1;">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <strong style="font-size: 0.88rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHTML(u.name || 'Người dùng')}</strong>
                  ${badgeAccount}
                  ${badgeStatus}
                </div>
                <div style="font-size: 0.74rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;">
                  ${this.escapeHTML(u.email || 'Không có email')}
                </div>
              </div>
            </div>
          </div>

          <div class="admin-mobile-card-meta">
            <span>Sổ: <strong>${u.owned_vaults_count}</strong></span>
            <span>Giao dịch: <strong>${u.total_transactions}</strong></span>
            <span>Dung lượng: <strong>${this.formatBytes(u.total_size_bytes)}</strong></span>
            <span>Lần cuối: <strong>${this.formatRelative(u.last_active)}</strong></span>
          </div>

          <div class="admin-mobile-card-actions">
            <button type="button" class="btn-secondary btn-sm" onclick="UIAdmin.viewUserDetail('${u.id}')" style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.76rem; padding: 5px 10px;">
              <i data-lucide="eye" style="width: 13px; height: 13px;"></i>
              <span>Xem Sổ</span>
            </button>
            <button type="button" class="btn-secondary btn-sm" onclick="UIAdmin.deleteUser('${u.id}', '${this.escapeHTML(u.name)}')" title="Xóa người dùng này" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3); font-size: 0.76rem; padding: 5px 10px; display: inline-flex; align-items: center; gap: 4px;">
              <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
              <span>Xóa</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  // 7. TAB 3: QUẢN LÝ SỔ (VAULTS)
  async loadVaults() {
    try {
      const res = await this.fetchApi('/api/admin/vaults');
      if (!res.ok) return;
      const data = await res.json();
      this.vaultsData = data.vaults || [];
      this.renderVaultsList();
    } catch (_) {}
  },

  setVaultFilter(filter) {
    this.vaultFilter = filter;
    document.querySelectorAll('.admin-vault-filter-chip').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-filter') === filter);
    });
    this.renderVaultsList();
  },

  renderVaultsList() {
    const container = document.getElementById('admin-vaults-list-container');
    if (!container) return;

    const searchVal = (document.getElementById('admin-vaults-search')?.value || '').toLowerCase().trim();
    let list = (this.vaultsData || []).slice();

    if (this.vaultFilter === 'normal') {
      list = list.filter(v => !v.is_empty);
    } else if (this.vaultFilter === 'empty') {
      list = list.filter(v => v.is_empty);
    } else if (this.vaultFilter === 'test') {
      list = list.filter(v => v.is_test);
    }

    if (searchVal) {
      list = list.filter(v => (v.name || '').toLowerCase().includes(searchVal) || (v.id || '').toLowerCase().includes(searchVal) || (v.owner_name || '').toLowerCase().includes(searchVal) || (v.owner_email || '').toLowerCase().includes(searchVal));
    }

    if (list.length === 0) {
      container.innerHTML = `
        <div class="settings-card-clean" style="text-align: center; color: var(--text-muted); padding: 24px 14px;">
          <i data-lucide="layers" style="width: 28px; height: 28px; opacity: 0.4; margin-bottom: 6px;"></i>
          <div style="font-size: 0.82rem;">Không tìm thấy cuốn sổ nào phù hợp.</div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = list.map(v => {
      const encBadge = v.is_encrypted
        ? `<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;"><i data-lucide="lock" style="width: 10px; height: 10px; margin-right: 2px;"></i>E2EE</span>`
        : `<span class="settings-status-pill pill-gray" style="font-size: 0.65rem;">Plain</span>`;

      const emptyBadge = v.is_empty
        ? `<span class="settings-status-pill pill-amber" style="font-size: 0.65rem;">0 GD</span>`
        : '';

      return `
        <div class="admin-mobile-card">
          <div class="admin-mobile-card-header">
            <div style="min-width: 0; flex: 1;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <strong style="font-size: 0.9rem; color: var(--text-primary);">${this.escapeHTML(v.name || 'Sổ không tên')}</strong>
                ${encBadge}
                ${emptyBadge}
              </div>
              <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 2px;">
                Chủ sổ: <strong>${this.escapeHTML(v.owner_name)}</strong> (${this.escapeHTML(v.owner_email)})
              </div>
            </div>
          </div>

          <div class="admin-mobile-card-meta">
            <span>Giao dịch: <strong>${v.counts.transactions}</strong></span>
            <span>Tài khoản: <strong>${v.counts.accounts}</strong></span>
            <span>Hạng mục: <strong>${v.counts.categories}</strong></span>
            <span>Snapshots: <strong>${v.history_count}</strong></span>
            <span>Dung lượng: <strong>${this.formatBytes(v.size_bytes)}</strong></span>
            <span>Sửa: <strong>${this.formatRelative(v.last_active)}</strong></span>
          </div>

          <div class="admin-mobile-card-actions">
            <button type="button" class="btn-secondary btn-sm" onclick="UIAdmin.viewVaultDetail('${v.id}')" style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.76rem; padding: 5px 10px;">
              <i data-lucide="eye" style="width: 13px; height: 13px;"></i>
              <span>Chi tiết</span>
            </button>
            ${v.history_count > 1 ? `
              <button type="button" class="btn-secondary btn-sm" onclick="UIAdmin.pruneVaultSnapshots('${v.id}')" title="Thu gọn snapshot" style="color: #f59e0b; font-size: 0.76rem; padding: 5px 10px; display: inline-flex; align-items: center; gap: 4px;">
                <i data-lucide="archive" style="width: 13px; height: 13px;"></i>
                <span>Tỉa Lịch Sử</span>
              </button>
            ` : ''}
            <button type="button" class="btn-secondary btn-sm" onclick="UIAdmin.deleteVault('${v.id}', '${this.escapeHTML(v.name)}')" title="Xóa sổ này" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3); font-size: 0.76rem; padding: 5px 10px; display: inline-flex; align-items: center; gap: 4px;">
              <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
              <span>Xóa</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  // 8. TAB 4: QUÉT RÁC CHUYÊN SÂU (GARBAGE REPORT)
  async loadGarbage() {
    try {
      const res = await this.fetchApi('/api/admin/garbage');
      if (!res.ok) return;
      const data = await res.json();
      this.garbageData = data;
      this.renderGarbageTab(data);
    } catch (_) {}
  },

  renderGarbageTab(data) {
    const container = document.getElementById('admin-garbage-items-container');
    if (!container) return;

    const g = data;

    container.innerHTML = `
      <!-- 1. Phiên hết hạn -->
      <div class="settings-card-clean" style="margin-bottom: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <div style="font-weight: 700; font-size: 0.86rem; display: flex; align-items: center; gap: 6px;">
            <i data-lucide="clock" style="width: 15px; height: 15px; color: #ef4444;"></i>
            <span>Phiên hết hạn (${g.expired_sessions.length})</span>
          </div>
          ${g.expired_sessions.length > 0 ? `
            <button type="button" class="btn-primary btn-sm" onclick="UIAdmin.runCleanup('purge_expired_sessions')" style="font-size: 0.74rem; padding: 4px 10px;">
              Xóa hết
            </button>
          ` : '<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;">Sạch</span>'}
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
          Token đăng nhập trên máy chủ đã quá hạn 90 ngày.
        </div>
      </div>

      <!-- 2. Link share hết hạn -->
      <div class="settings-card-clean" style="margin-bottom: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <div style="font-weight: 700; font-size: 0.86rem; display: flex; align-items: center; gap: 6px;">
            <i data-lucide="link" style="width: 15px; height: 15px; color: #f59e0b;"></i>
            <span>Link share hết hạn (${g.expired_links.length})</span>
          </div>
          ${g.expired_links.length > 0 ? `
            <button type="button" class="btn-primary btn-sm" onclick="UIAdmin.runCleanup('purge_expired_links')" style="font-size: 0.74rem; padding: 4px 10px;">
              Xóa hết
            </button>
          ` : '<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;">Sạch</span>'}
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
          Liên kết chia sẻ sổ có thời hạn và hiện tại đã hết hạn.
        </div>
      </div>

      <!-- 3. Sổ trống tạo lúc test -->
      <div class="settings-card-clean" style="margin-bottom: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <div style="font-weight: 700; font-size: 0.86rem; display: flex; align-items: center; gap: 6px;">
            <i data-lucide="file-minus" style="width: 15px; height: 15px; color: #f59e0b;"></i>
            <span>Sổ trống lúc test (${g.empty_vaults.length})</span>
          </div>
          ${g.empty_vaults.length > 0 ? `
            <button type="button" class="btn-primary btn-sm" onclick="UIAdmin.runCleanup('delete_empty_vaults')" style="font-size: 0.74rem; padding: 4px 10px;">
              Xóa tất cả
            </button>
          ` : '<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;">Không có</span>'}
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
          Cuốn sổ có 0 giao dịch tạo mặc định lúc đăng nhập thử nghiệm.
        </div>
      </div>

      <!-- 4. User test -->
      <div class="settings-card-clean" style="margin-bottom: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <div style="font-weight: 700; font-size: 0.86rem; display: flex; align-items: center; gap: 6px;">
            <i data-lucide="user-x" style="width: 15px; height: 15px; color: #f59e0b;"></i>
            <span>User test / quick (${g.test_users.length})</span>
          </div>
          ${g.test_users.length > 0 ? `
            <button type="button" class="btn-primary btn-sm" onclick="UIAdmin.runCleanup('delete_test_data')" style="font-size: 0.74rem; padding: 4px 10px;">
              Xóa user test
            </button>
          ` : '<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;">Không có</span>'}
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
          Tài khoản quick login LAN hoặc email test ảo lúc kiểm tra.
        </div>
      </div>

      <!-- 5. Snapshot cũ -->
      <div class="settings-card-clean" style="margin-bottom: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <div style="font-weight: 700; font-size: 0.86rem; display: flex; align-items: center; gap: 6px;">
            <i data-lucide="archive" style="width: 15px; height: 15px; color: #9333ea;"></i>
            <span>Snapshot cũ tích tụ (${g.stale_snapshots.length})</span>
          </div>
          ${g.stale_snapshots.length > 0 ? `
            <button type="button" class="btn-primary btn-sm" onclick="UIAdmin.runCleanup('prune_snapshots')" style="font-size: 0.74rem; padding: 4px 10px;">
              Thu gọn
            </button>
          ` : '<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;">Tối ưu</span>'}
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
          Bản sao lưu lịch sử cũ hơn 5 bản gần nhất của mỗi sổ.
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  },

  // 9. TAB 5: PHÂN QUYỀN ADMIN (ADMINS)
  async loadAdmins() {
    try {
      const res = await this.fetchApi('/api/admin/admins');
      if (!res.ok) return;
      const data = await res.json();
      this.adminsData = data.admins || [];
      this.renderAdminsList(this.adminsData);
    } catch (_) {}
  },

  renderAdminsList(admins) {
    const container = document.getElementById('admin-emails-list-container');
    const countEl = document.getElementById('admin-emails-badge-count');
    if (countEl) countEl.textContent = (admins || []).length;
    if (!container) return;

    if (!admins || admins.length === 0) {
      container.innerHTML = `
        <div style="padding: 12px; background: var(--bg-surface); border-radius: var(--radius-md); color: var(--text-muted); font-size: 0.78rem; text-align: center;">
          Chưa có email quản trị viên nào.
        </div>
      `;
      return;
    }

    container.innerHTML = admins.map(a => {
      const isEnv = a.source === 'env';
      const badge = isEnv
        ? `<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;"><i data-lucide="container" style="width: 10px; height: 10px; margin-right: 2px;"></i>.env</span>`
        : `<span class="settings-status-pill pill-amber" style="font-size: 0.65rem;"><i data-lucide="database" style="width: 10px; height: 10px; margin-right: 2px;"></i>Cấp qua App</span>`;

      const deleteBtn = a.can_delete
        ? `<button type="button" class="btn-secondary btn-sm" onclick="UIAdmin.removeAdminEmail('${this.escapeHTML(a.email)}')" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3); font-size: 0.72rem; padding: 4px 8px;">Thu hồi</button>`
        : `<span style="font-size: 0.7rem; color: var(--text-muted); font-style: italic;">(Gốc .env)</span>`;

      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 0.8rem; margin-bottom: 6px; gap: 8px;">
          <div style="min-width: 0; flex: 1;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <strong style="color: var(--text-primary); font-size: 0.84rem;">${this.escapeHTML(a.email)}</strong>
              ${badge}
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">
              Cấp bởi: ${this.escapeHTML(a.added_by)}
            </div>
          </div>
          <div>${deleteBtn}</div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  // Gợi ý danh sách tài khoản để cấp quyền Admin
  async getAvailableUsersForDropdown() {
    if (this.usersData && this.usersData.length > 0) {
      return this.usersData;
    }
    try {
      const res = await this.fetchApi('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        this.usersData = data.users || [];
        return this.usersData;
      }
    } catch (_) {}
    return [];
  },

  async renderAdminEmailDropdown(filterText = '') {
    const dropdown = document.getElementById('admin-new-email-dropdown');
    if (!dropdown) return;

    const allUsers = await this.getAvailableUsersForDropdown();
    const query = (filterText || '').trim().toLowerCase();
    const adminEmailsSet = new Set((this.adminsData || []).map(a => (a.email || '').toLowerCase()));

    let users = (allUsers || []).filter(u => {
      const uEmail = (u.email || '').toLowerCase();
      if (!uEmail) return false;
      if (!query) return true;
      const uName = (u.name || '').toLowerCase();
      return uEmail.includes(query) || uName.includes(query);
    });

    if (users.length === 0) {
      if (!query) {
        dropdown.style.display = 'none';
        return;
      }
      dropdown.innerHTML = `
        <div class="server-share-user-empty">
          <span>Không tìm thấy tài khoản phù hợp trên máy chủ. Bạn có thể tiếp tục nhập đầy đủ email.</span>
        </div>
      `;
      dropdown.style.display = 'block';
      return;
    }

    const esc = (s) => this.escapeHTML(s || '');

    dropdown.innerHTML = `
      <div class="server-share-user-dropdown-header">
        <span>Tài khoản trên máy chủ (${users.length})</span>
        <span style="font-size: 0.64rem; font-weight: normal; opacity: 0.7;">Chọn để điền nhanh</span>
      </div>
      ${users.map(u => {
        const uEmail = esc(u.email || '');
        const uName = esc(u.name || u.email || 'Người dùng');
        const firstLetter = (u.name || u.email || 'U').charAt(0).toUpperCase();
        const isAdmin = adminEmailsSet.has((u.email || '').toLowerCase());
        const avatarHtml = u.picture 
          ? `<img src="${esc(u.picture)}" class="server-share-user-avatar" alt="${uName}">`
          : `<div class="server-share-user-avatar-fallback">${esc(firstLetter)}</div>`;

        const badgeHtml = isAdmin 
          ? `<span class="settings-status-pill pill-teal" style="font-size: 0.62rem; padding: 1px 6px;">Admin</span>`
          : '';

        return `
          <div class="server-share-user-item" data-email="${uEmail}">
            ${avatarHtml}
            <div class="server-share-user-info" style="min-width: 0; flex: 1;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
                <span class="server-share-user-name">${uName}</span>
                ${badgeHtml}
              </div>
              <div class="server-share-user-email">${uEmail}</div>
            </div>
          </div>
        `;
      }).join('')}
    `;

    dropdown.style.display = 'block';
  },

  hideAdminEmailDropdown() {
    const dropdown = document.getElementById('admin-new-email-dropdown');
    if (dropdown) dropdown.style.display = 'none';
  },

  selectAdminEmail(email) {
    const input = document.getElementById('admin-new-email-input');
    if (input) {
      input.value = email;
      input.focus();
    }
    this.hideAdminEmailDropdown();
  },

  async addAdminEmail() {
    this.hideAdminEmailDropdown();
    const input = document.getElementById('admin-new-email-input');
    const email = (input?.value || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      if (typeof showToast === 'function') showToast('Vui lòng nhập email hợp lệ', 'error');
      return;
    }

    let confirmed = true;
    if (typeof showConfirm === 'function') {
      confirmed = await showConfirm({
        title: 'Cấp Quyền Quản Trị',
        message: `Cấp toàn quyền Quản trị máy chủ cho email "${email}"?`,
        confirmText: 'Cấp Quyền'
      });
    }
    if (!confirmed) return;

    try {
      const res = await this.fetchApi('/api/admin/admins', {
        method: 'POST',
        body: { email }
      });
      const data = await res.json();
      if (data.success) {
        if (typeof showToast === 'function') showToast(data.message || 'Cấp quyền thành công', 'success');
        if (input) input.value = '';
        this.renderAdminsList(data.admins || []);
      } else {
        throw new Error(data.error || 'Lỗi cấp quyền');
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message, 'error');
    }
  },

  async removeAdminEmail(email) {
    let confirmed = true;
    if (typeof showConfirm === 'function') {
      confirmed = await showConfirm({
        title: 'Thu Hồi Quyền Admin',
        message: `Thu hồi quyền quản trị viên của email "${email}"?`,
        confirmText: 'Thu Hồi',
        danger: true
      });
    }
    if (!confirmed) return;

    try {
      const res = await this.fetchApi(`/api/admin/admins/${encodeURIComponent(email)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        if (typeof showToast === 'function') showToast(data.message || 'Đã thu hồi quyền', 'info');
        this.renderAdminsList(data.admins || []);
      } else {
        throw new Error(data.error || 'Lỗi thu hồi quyền');
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message, 'error');
    }
  },

  // 10. DỌN DẸP & TỐI ƯU HÓA HỆ THỐNG
  async runCleanup(action) {
    let promptTitle = 'Dọn Dẹp Dữ Liệu';
    let promptMsg = 'Bạn có chắc chắn muốn dọn dẹp các mục này?';

    if (action === 'all') {
      promptTitle = 'Dọn Toàn Bộ Rác';
      promptMsg = 'Hệ thống sẽ xóa tất cả phiên hết hạn, link hết hạn, sổ trống lúc test và thu gọn snapshot cũ.';
    } else if (action === 'purge_expired_sessions') {
      promptTitle = 'Xóa Phiên Hết Hạn';
      promptMsg = 'Xóa các token đăng nhập máy chủ đã hết hạn?';
    } else if (action === 'delete_empty_vaults') {
      promptTitle = 'Xóa Sổ Trống';
      promptMsg = 'Xóa các cuốn sổ có 0 giao dịch tạo lúc thử nghiệm?';
    } else if (action === 'delete_test_data') {
      promptTitle = 'Xóa User Test';
      promptMsg = 'Xóa tài khoản test (quick_*) và sổ tương ứng? Dữ liệu người dùng thật được giữ nguyên an toàn.';
    } else if (action === 'prune_snapshots') {
      promptTitle = 'Thu Gọn Snapshot';
      promptMsg = 'Thu gọn lịch sử snapshot của tất cả các sổ, chỉ giữ lại các bản mới nhất?';
    }

    let confirmed = true;
    if (typeof showConfirm === 'function') {
      confirmed = await showConfirm({
        title: promptTitle,
        message: promptMsg,
        confirmText: 'Thực Hiện Dọn Rác',
        danger: true
      });
    }
    if (!confirmed) return;

    try {
      const res = await this.fetchApi('/api/admin/cleanup', {
        method: 'POST',
        body: { action }
      });
      const data = await res.json();
      if (data.success) {
        if (typeof showToast === 'function') showToast('Dọn dẹp dữ liệu hoàn tất!', 'success');
        await this.refreshAllData();
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast('Lỗi dọn dẹp: ' + err.message, 'error');
    }
  },

  async vacuumDatabase() {
    let confirmed = true;
    if (typeof showConfirm === 'function') {
      confirmed = await showConfirm({
        title: 'Tối Ưu SQLite Database',
        message: 'Thực hiện SQLite VACUUM và WAL Checkpoint để thu gọn tập tin dữ liệu và giải phóng dung lượng ổ cứng?',
        confirmText: 'Tối Ưu Ngay'
      });
    }
    if (!confirmed) return;

    try {
      const res = await this.fetchApi('/api/admin/vacuum', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        if (typeof showToast === 'function') {
          showToast(`Tối ưu thành công! Dung lượng DB: ${this.formatBytes(data.storage.sizeBytes)}`, 'success');
        }
        await this.loadOverview();
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast('Lỗi tối ưu: ' + err.message, 'error');
    }
  },

  // 11. XÓA NGƯỜI DÙNG & SỔ (CASCADE DELETE)
  async deleteUser(userId, userName) {
    let confirmed = true;
    if (typeof showConfirm === 'function') {
      confirmed = await showConfirm({
        title: `Xóa User: ${userName}`,
        message: `CẢNH BÁO: Xóa vĩnh viễn tài khoản "${userName}" và TOÀN BỘ các cuốn sổ, lịch sử và phân quyền của người này?`,
        confirmText: 'Xác Nhận Xóa',
        danger: true
      });
    }
    if (!confirmed) return;

    try {
      const res = await this.fetchApi(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        if (typeof showToast === 'function') showToast(`Đã xóa tài khoản "${userName}"`, 'info');
        await this.refreshAllData();
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast('Lỗi xóa người dùng: ' + err.message, 'error');
    }
  },

  async deleteVault(vaultId, vaultName) {
    let confirmed = true;
    if (typeof showConfirm === 'function') {
      confirmed = await showConfirm({
        title: `Xóa Sổ: ${vaultName}`,
        message: `Xóa vĩnh viễn cuốn sổ "${vaultName}" cùng toàn bộ giao dịch, tài khoản và thành viên trên máy chủ?`,
        confirmText: 'Xác Nhận Xóa Sổ',
        danger: true
      });
    }
    if (!confirmed) return;

    try {
      const res = await this.fetchApi(`/api/admin/vaults/${encodeURIComponent(vaultId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        if (typeof showToast === 'function') showToast(`Đã xóa cuốn sổ "${vaultName}"`, 'info');
        await this.refreshAllData();
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast('Lỗi xóa sổ: ' + err.message, 'error');
    }
  },

  async pruneVaultSnapshots(vaultId) {
    let confirmed = true;
    if (typeof showConfirm === 'function') {
      confirmed = await showConfirm({
        title: 'Thu Gọn Snapshot Sổ',
        message: 'Chỉ giữ lại bản snapshot sao lưu mới nhất, xóa các bản lịch sử cũ để giải phóng dung lượng?',
        confirmText: 'Thu Gọn'
      });
    }
    if (!confirmed) return;

    try {
      const res = await this.fetchApi(`/api/admin/vaults/${encodeURIComponent(vaultId)}/prune-history`, {
        method: 'POST',
        body: { keep_days: 0 }
      });
      const data = await res.json();
      if (data.success) {
        if (typeof showToast === 'function') showToast(`Đã thu gọn ${data.deleted_count} snapshot cũ`, 'success');
        await this.refreshAllData();
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast('Lỗi thu gọn snapshot: ' + err.message, 'error');
    }
  },

  // 12. XEM CHI TIẾT MODAL
  async viewUserDetail(userId) {
    try {
      const res = await this.fetchApi(`/api/admin/users/${encodeURIComponent(userId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const u = data.user;

      let modalBody = `
        <div style="font-size: 0.82rem; line-height: 1.5;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
            <img src="${u.picture || './assets/icons/icon.svg'}" style="width: 38px; height: 38px; border-radius: 50%;">
            <div>
              <strong>${this.escapeHTML(u.name || 'Người dùng')}</strong>
              <div style="color: var(--text-muted); font-size: 0.74rem;">${this.escapeHTML(u.email || '')}</div>
            </div>
          </div>
          <div style="margin-bottom: 10px;">
            <div>ID: <code style="font-size: 0.75rem;">${u.id}</code></div>
            <div>Google ID: <code style="font-size: 0.75rem;">${u.google_id || 'N/A'}</code></div>
            <div>Tạo ngày: ${new Date(u.created_at).toLocaleString('vi-VN')}</div>
          </div>
          <div style="font-weight: 700; margin-bottom: 6px;">Danh sách sổ sở hữu (${(data.vaults || []).length}):</div>
          <div style="max-height: 180px; overflow-y: auto; background: var(--bg-surface); border-radius: var(--radius-md); padding: 8px;">
            ${(data.vaults || []).length === 0 ? '<div style="color: var(--text-muted); font-size: 0.75rem;">Không có sổ nào.</div>' : (data.vaults || []).map(v => `
              <div style="padding: 4px 0; border-bottom: 1px dashed var(--border-color); display: flex; justify-content: space-between;">
                <span><strong>${this.escapeHTML(v.name)}</strong> (v${v.version})</span>
                <span style="color: var(--text-muted); font-size: 0.72rem;">${v.record_count} bản ghi</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      this.openDetailModal('Chi Tiết Người Dùng', modalBody);
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message, 'error');
    }
  },

  async viewVaultDetail(vaultId) {
    try {
      const res = await this.fetchApi(`/api/admin/vaults/${encodeURIComponent(vaultId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const v = data.vault;

      let modalBody = `
        <div style="font-size: 0.82rem; line-height: 1.5;">
          <div style="margin-bottom: 10px;">
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">${this.escapeHTML(v.name)}</div>
            <div style="color: var(--text-muted); font-size: 0.74rem;">ID: <code>${v.id}</code></div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; font-size: 0.78rem;">
            <div>Phiên bản: <strong>v${v.version}</strong></div>
            <div>Bản ghi: <strong>${v.record_count}</strong></div>
            <div>Dung lượng: <strong>${this.formatBytes(v.size_bytes)}</strong></div>
            <div>Snapshots: <strong>${(data.snapshots || []).length}</strong></div>
          </div>
          <div style="font-weight: 700; margin-bottom: 6px;">Thành viên chia sẻ (${(data.shares || []).length}):</div>
          <div style="max-height: 140px; overflow-y: auto; background: var(--bg-surface); border-radius: var(--radius-md); padding: 8px; margin-bottom: 10px;">
            ${(data.shares || []).length === 0 ? '<div style="color: var(--text-muted); font-size: 0.75rem;">Chưa chia sẻ với ai.</div>' : (data.shares || []).map(s => `
              <div style="padding: 4px 0; border-bottom: 1px dashed var(--border-color); display: flex; justify-content: space-between;">
                <span>${this.escapeHTML(s.email)}</span>
                <span class="settings-status-pill pill-teal" style="font-size: 0.65rem;">${s.role}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      this.openDetailModal('Chi Tiết Sổ Sao Lưu', modalBody);
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message, 'error');
    }
  },

  openDetailModal(title, bodyHtml) {
    let overlay = document.getElementById('admin-detail-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'admin-detail-modal-overlay';
      overlay.className = 'modal-overlay';
      overlay.style.zIndex = '100060';
      overlay.innerHTML = `
        <div class="modal-dialog custom-dialog-box" style="max-width: 440px; width: 92%; margin: 20px auto;">
          <div class="modal-header custom-dialog-header">
            <h3 class="custom-dialog-title-text" id="admin-detail-modal-title">Chi Tiết</h3>
            <button type="button" class="btn-icon" onclick="UIAdmin.closeDetailModal()">
              <i data-lucide="x" style="width: 18px; height: 18px;"></i>
            </button>
          </div>
          <div class="modal-body custom-dialog-body" id="admin-detail-modal-body" style="padding: 14px 16px;"></div>
          <div class="modal-footer custom-dialog-footer" style="padding: 8px 16px 14px 16px; display: flex; justify-content: flex-end;">
            <button type="button" class="btn-secondary btn-sm" onclick="UIAdmin.closeDetailModal()">Đóng</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    document.getElementById('admin-detail-modal-title').textContent = title;
    document.getElementById('admin-detail-modal-body').innerHTML = bodyHtml;
    overlay.classList.add('open');
    if (window.lucide) lucide.createIcons();
  },

  closeDetailModal() {
    const overlay = document.getElementById('admin-detail-modal-overlay');
    if (overlay) overlay.classList.remove('open');
  },

  // 13. CÁC HÀM FORMAT TIỆN ÍCH
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  formatUptime(sec) {
    if (!sec || sec < 60) return `${sec || 0}s`;
    const m = Math.floor(sec / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m`;
  },

  formatRelative(dateStr) {
    if (!dateStr) return 'Chưa rõ';
    try {
      const now = Date.now();
      const past = new Date(dateStr).getTime();
      const diffSec = Math.floor((now - past) / 1000);
      if (diffSec < 60) return 'Vừa xong';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
      const d = Math.floor(diffSec / 86400);
      return `${d} ngày trước`;
    } catch (_) {
      return dateStr;
    }
  },

  escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};
