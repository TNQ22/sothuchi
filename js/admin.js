/**
 * SỔ THU CHI - ADMIN DASHBOARD CLIENT CONTROLLER
 * Trang quản trị máy chủ sao lưu:
 * - Xác thực quản trị viên qua ADMIN_EMAIL (Google OAuth hoặc Email xác thực)
 * - Kiểm tra người dùng (thật vs test, đang hoạt động vs lãng quên)
 * - Quét và dọn dẹp dữ liệu rác (sổ trống, phiên hết hạn, liên kết hết hạn, snapshot cũ)
 * - Quản trị toàn bộ sổ & cascade delete an toàn
 * - Tối ưu hóa SQLite database (VACUUM & WAL checkpoint)
 */

(function() {
  const AdminApp = {
    token: null,
    currentAdmin: null,
    serverAuthConfig: null,
    overviewData: null,
    usersData: [],
    vaultsData: [],
    garbageData: null,
    userFilter: 'all',
    vaultFilter: 'all',
    confirmResolve: null,

    // Khởi tạo
    async init() {
      this.initTheme();
      this.bindGlobalEvents();

      // Kiểm tra token từ URL hash (khi mở trực tiếp từ Sổ Thu Chi)
      if (window.location.hash) {
        const hashStr = window.location.hash.substring(1);
        const params = new URLSearchParams(hashStr);
        const hashToken = params.get('token');
        if (hashToken) {
          this.token = hashToken;
          localStorage.setItem('stc_admin_token', hashToken);
          localStorage.setItem('syncServerToken', hashToken);
          try {
            window.history.replaceState(null, '', window.location.pathname);
          } catch (_) {}
        }
      }

      // Đọc token đã lưu (từ localStorage hoặc IndexedDB của app chính)
      if (!this.token) {
        this.token = await this.getStoredToken();
      }
      
      const authStatus = await this.checkAuth();
      if (authStatus && authStatus.authenticated) {
        this.showDashboard();
        await this.refreshAllData();
      } else {
        this.showLogin(authStatus);
      }
    },

    // Lấy token lưu trữ
    async getStoredToken() {
      let token = localStorage.getItem('stc_admin_token') || localStorage.getItem('syncServerToken');
      if (token) return token;

      // Tìm trong IndexedDB của Sổ Thu Chi (nếu cùng origin)
      try {
        const idbReq = indexedDB.open('SoThuChiDB');
        token = await new Promise((resolve) => {
          idbReq.onsuccess = (e) => {
            try {
              const idb = e.target.result;
              if (!idb.objectStoreNames.contains('settings')) return resolve(null);
              const tx = idb.transaction('settings', 'readonly');
              const store = tx.objectStore('settings');
              const req = store.get('syncServerToken');
              req.onsuccess = () => resolve(req.result ? req.result.value : null);
              req.onerror = () => resolve(null);
            } catch (_) { resolve(null); }
          };
          idbReq.onerror = () => resolve(null);
        });
      } catch (_) {}

      return token || '';
    },

    // Quản lý theme Sáng / Tối đồng bộ
    initTheme() {
      const savedTheme = localStorage.getItem('sothuchi_theme') || 'dark';
      document.documentElement.setAttribute('data-theme', savedTheme);
      this.updateThemeIcon(savedTheme);

      const btnToggle = document.getElementById('btn-theme-toggle');
      if (btnToggle) {
        btnToggle.addEventListener('click', () => {
          const current = document.documentElement.getAttribute('data-theme') || 'dark';
          const next = current === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          localStorage.setItem('sothuchi_theme', next);
          this.updateThemeIcon(next);
        });
      }
    },

    updateThemeIcon(theme) {
      const icon = document.getElementById('theme-icon');
      if (icon) {
        icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
        if (window.lucide) lucide.createIcons();
      }
    },

    // Gắn sự kiện giao diện
    bindGlobalEvents() {
      // Nút Đăng nhập Google
      const btnGoogleLogin = document.getElementById('btn-admin-google-login');
      if (btnGoogleLogin) {
        btnGoogleLogin.addEventListener('click', () => this.loginWithGoogle());
      }

      // Input thêm admin email (Enter to submit)
      const inputNewAdmin = document.getElementById('input-new-admin-email');
      if (inputNewAdmin) {
        inputNewAdmin.addEventListener('keyup', (e) => {
          if (e.key === 'Enter') this.addAdminEmail();
        });
      }

      // Nút Đăng xuất
      const btnLogout = document.getElementById('btn-admin-logout');
      if (btnLogout) {
        btnLogout.addEventListener('click', () => this.handleLogout());
      }
    },

    // Gọi API có kèm Bearer token
    async fetchApi(endpoint, options = {}) {
      const headers = options.headers ? { ...options.headers } : {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }

      const res = await fetch(endpoint, { ...options, headers });
      if (res.status === 401 || res.status === 403) {
        if (!endpoint.includes('/api/admin/auth-status')) {
          this.token = null;
          localStorage.removeItem('stc_admin_token');
          const status = await this.checkAuth();
          this.showLogin(status);
          throw new Error('Bạn không có quyền quản trị hoặc phiên đã hết hạn.');
        }
      }
      return res;
    },

    // Kiểm tra trạng thái xác thực
    async checkAuth() {
      try {
        const res = await this.fetchApi('/api/admin/auth-status');
        if (res.ok) {
          const data = await res.json();
          this.serverAuthConfig = data;
          if (data.authenticated && data.adminUser) {
            this.currentAdmin = data.adminUser;
            return data;
          }
          return data;
        }
      } catch (_) {}
      return null;
    },

    // Chuyển màn hình
    showLogin(authStatus = null) {
      document.getElementById('view-login').style.display = 'block';
      document.getElementById('view-dashboard').style.display = 'none';
      document.getElementById('admin-user-badge').style.display = 'none';
      document.getElementById('btn-admin-logout').style.display = 'none';

      const unconfiguredBox = document.getElementById('box-unconfigured-admin');
      const unauthBox = document.getElementById('box-unauthorized-user');
      const unauthEmailDisplay = document.getElementById('unauth-email-display');

      if (authStatus) {
        // Trường hợp máy chủ chưa cấu hình ADMIN_EMAIL
        if (authStatus.adminEmailsConfigured === false) {
          if (unconfiguredBox) unconfiguredBox.style.display = 'block';
          if (unauthBox) unauthBox.style.display = 'none';
        } else if (authStatus.currentUser && !authStatus.authenticated) {
          // Người dùng đã đăng nhập tài khoản nhưng email không nằm trong ADMIN_EMAIL
          if (unconfiguredBox) unconfiguredBox.style.display = 'none';
          if (unauthBox) {
            unauthBox.style.display = 'block';
            if (unauthEmailDisplay) {
              unauthEmailDisplay.textContent = authStatus.currentUser.email || 'này';
            }
          }
        } else {
          if (unconfiguredBox) unconfiguredBox.style.display = 'none';
          if (unauthBox) unauthBox.style.display = 'none';
        }
      } else {
        if (unconfiguredBox) unconfiguredBox.style.display = 'none';
        if (unauthBox) unauthBox.style.display = 'none';
      }

      if (window.lucide) lucide.createIcons();
    },

    showDashboard() {
      document.getElementById('view-login').style.display = 'none';
      document.getElementById('view-dashboard').style.display = 'block';
      
      const userBadge = document.getElementById('admin-user-badge');
      const userDisplay = document.getElementById('admin-username-display');
      const userAvatar = document.getElementById('admin-avatar-small');

      if (userBadge && userDisplay && this.currentAdmin) {
        userDisplay.textContent = this.currentAdmin.name || this.currentAdmin.email || 'Admin';
        if (userAvatar && this.currentAdmin.picture) {
          userAvatar.src = this.currentAdmin.picture;
        }
        userBadge.style.display = 'inline-flex';
      }
      document.getElementById('btn-admin-logout').style.display = 'inline-flex';
      if (window.lucide) lucide.createIcons();
    },

    showLoginError(msg) {
      const errorMsg = document.getElementById('login-error-msg');
      if (errorMsg) {
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
      }
    },

    clearLoginError() {
      const errorMsg = document.getElementById('login-error-msg');
      if (errorMsg) errorMsg.style.display = 'none';
    },

    // 1. ĐĂNG NHẬP GOOGLE OAUTH
    async loginWithGoogle() {
      this.clearLoginError();
      const btn = document.getElementById('btn-admin-google-login');
      const btnText = document.getElementById('btn-admin-google-text');

      // Lấy Client ID từ cấu hình máy chủ
      let clientId = this.serverAuthConfig?.googleClientId;
      if (!clientId) {
        try {
          const cfgRes = await fetch('/api/auth/config');
          if (cfgRes.ok) {
            const cfg = await cfgRes.json();
            clientId = cfg.google_client_id;
          }
        } catch (_) {}
      }

      if (!clientId) {
        this.showLoginError('Máy chủ chưa cấu hình GOOGLE_CLIENT_ID. Vui lòng khai báo GOOGLE_CLIENT_ID trong docker-compose.yml hoặc .env.');
        return;
      }

      if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        this.showLoginError('Thư viện Google Identity Services chưa tải xong hoặc bị chặn bởi trình duyệt.');
        return;
      }

      if (btn) btn.disabled = true;
      if (btnText) btnText.textContent = 'Đang mở cửa sổ Google...';

      try {
        const accessToken = await new Promise((resolve, reject) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              reject(new Error('Hết thời gian chờ phản hồi từ Google.'));
            }
          }, 90000);

          try {
            const tokenClient = google.accounts.oauth2.initTokenClient({
              client_id: clientId,
              scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid',
              prompt: 'select_account',
              callback: (resp) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (resp.error) {
                  if (resp.error === 'popup_closed_by_user') {
                    return reject(new Error('Cửa sổ đăng nhập Google đã bị đóng.'));
                  }
                  return reject(new Error(resp.error_description || resp.error));
                }
                resolve(resp.access_token);
              }
            });
            tokenClient.requestAccessToken();
          } catch (e) {
            settled = true;
            clearTimeout(timer);
            reject(e);
          }
        });

        if (btnText) btnText.textContent = 'Đang kiểm tra quyền Admin...';

        // Gửi token xác thực lên máy chủ
        const authRes = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: accessToken })
        });

        const authData = await authRes.json();
        if (!authRes.ok || !authData.token) {
          throw new Error(authData.error || 'Máy chủ từ chối xác thực Google');
        }

        this.token = authData.token;
        localStorage.setItem('stc_admin_token', this.token);
        localStorage.setItem('syncServerToken', this.token);

        // Kiểm tra quyền quản trị viên với ADMIN_EMAIL
        const authStatus = await this.checkAuth();
        if (authStatus && authStatus.authenticated) {
          this.showToast(`Chào mừng Quản trị viên: ${this.currentAdmin.name || this.currentAdmin.email}`, 'success');
          this.showDashboard();
          await this.refreshAllData();
        } else {
          this.showLogin(authStatus);
          this.showLoginError(`Tài khoản "${authData.user?.email}" không nằm trong danh sách ADMIN_EMAIL của máy chủ.`);
        }
      } catch (err) {
        this.showLoginError(err.message || 'Lỗi đăng nhập Google');
      } finally {
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = 'Đăng Nhập Quản Trị Bằng Google';
      }
    },

    // Đăng xuất
    async handleLogout() {
      const confirmed = await this.showConfirm(
        'Đăng Xuất Quản Trị',
        'Bạn có chắc chắn muốn đăng xuất khỏi trang quản trị máy chủ?'
      );
      if (!confirmed) return;

      try {
        await this.fetchApi('/api/auth/logout', { method: 'POST' });
      } catch (_) {}

      this.token = null;
      this.currentAdmin = null;
      localStorage.removeItem('stc_admin_token');
      this.showToast('Đã đăng xuất', 'info');
      
      const authStatus = await this.checkAuth();
      this.showLogin(authStatus);
    },

    // Chuyển Tab
    switchTab(tabId) {
      document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      document.querySelectorAll('.admin-tab-content').forEach(c => {
        c.style.display = (c.id === tabId) ? 'block' : 'none';
      });

      if (window.lucide) lucide.createIcons();
    },

    // Tải lại toàn bộ dữ liệu
    async refreshAllData() {
      const icon = document.getElementById('icon-refresh');
      if (icon) icon.classList.add('spin-animation');

      try {
        await Promise.all([
          this.loadOverview(),
          this.loadUsers(),
          this.loadVaults(),
          this.loadGarbageReport(),
          this.loadAdmins()
        ]);
        this.showToast('Đã làm mới dữ liệu máy chủ', 'info');
      } catch (err) {
        this.showToast('Lỗi tải dữ liệu: ' + err.message, 'error');
      } finally {
        if (icon) icon.classList.remove('spin-animation');
      }
    },

    // 1. TẢI TỔNG QUAN (Overview)
    async loadOverview() {
      const res = await this.fetchApi('/api/admin/overview');
      if (!res.ok) return;
      const data = await res.json();
      this.overviewData = data;

      // Header summary
      document.getElementById('hdr-engine-text').textContent = data.storage.engine || 'SQLite WAL';
      document.getElementById('hdr-db-size-text').textContent = this.formatBytes(data.storage.dbSizeBytes);
      document.getElementById('hdr-uptime-text').textContent = this.formatUptime(data.system.uptime);

      // Metric Cards
      document.getElementById('stat-users-total').textContent = data.users.total;
      document.getElementById('stat-users-sub').textContent = `${data.users.testCount} tài khoản test / quick`;

      document.getElementById('stat-vaults-total').textContent = data.vaults.total;
      document.getElementById('stat-vaults-sub').textContent = `${data.vaults.emptyCount} sổ trống, ${data.vaults.testCount} sổ test`;

      document.getElementById('stat-snapshots-total').textContent = data.storage.snapshotsTotal;
      document.getElementById('stat-storage-sub').textContent = `Dung lượng: ${this.formatBytes(data.storage.dbSizeBytes)}`;

      document.getElementById('stat-sessions-total').textContent = `${data.sessions.total} / ${data.shares.totalLinks}`;
      document.getElementById('stat-sessions-sub').textContent = `${data.sessions.expired} phiên hết hạn, ${data.shares.expiredLinks} link hết hạn`;

      // Cập nhật số đếm trên tab
      document.getElementById('tab-users-count').textContent = data.users.total;
      document.getElementById('tab-vaults-count').textContent = data.vaults.total;

      const garbageBadge = document.getElementById('tab-garbage-badge');
      if (data.garbage.totalGarbageItems > 0) {
        garbageBadge.textContent = data.garbage.totalGarbageItems;
        garbageBadge.style.display = 'inline-flex';
      } else {
        garbageBadge.style.display = 'none';
      }

      // Khối Quick Cleanup Center
      this.renderQuickCleanupBox(data);

      // Cập nhật tab Hệ Thống
      this.renderSystemTab(data);

      if (window.lucide) lucide.createIcons();
    },

    renderQuickCleanupBox(data) {
      const box = document.getElementById('quick-cleanup-box');
      const icon = document.getElementById('cleanup-status-icon');
      const title = document.getElementById('cleanup-status-title');
      const desc = document.getElementById('cleanup-status-desc');
      const itemsGrid = document.getElementById('cleanup-items-grid');
      const btnCleanAll = document.getElementById('btn-clean-all');

      const g = data.garbage;
      const hasGarbage = g.totalGarbageItems > 0;

      if (!hasGarbage) {
        box.className = 'admin-cleanup-box clean';
        icon.setAttribute('data-lucide', 'check-circle-2');
        icon.style.color = '#10b981';
        title.textContent = 'Máy chủ sạch sẽ & Tối ưu';
        desc.textContent = 'Không phát hiện phiên đăng nhập hết hạn, liên kết hết hạn, hoặc sổ trống tồn đọng trên máy chủ.';
        itemsGrid.innerHTML = `
          <div style="background: rgba(16, 185, 129, 0.08); padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid rgba(16, 185, 129, 0.2); font-size: 0.78rem; color: #10b981; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="shield-check" style="width: 16px; height: 16px;"></i>
            <span>Tất cả dữ liệu người dùng và sổ đang ở trạng thái an toàn.</span>
          </div>
        `;
        if (btnCleanAll) btnCleanAll.style.display = 'none';
        return;
      }

      box.className = 'admin-cleanup-box';
      icon.setAttribute('data-lucide', 'alert-triangle');
      icon.style.color = '#f59e0b';
      title.textContent = `Phát hiện ${g.totalGarbageItems} mục dữ liệu rác & lúc test`;
      desc.textContent = 'Bao gồm các phiên hết hạn, sổ trống tạo lúc test, tài khoản test và lịch sử snapshot cũ có thể giải phóng dung lượng.';
      if (btnCleanAll) btnCleanAll.style.display = 'inline-flex';

      let itemsHtml = '';

      if (g.expiredSessionsCount > 0) {
        itemsHtml += `
          <div style="background: var(--bg-surface); padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 700; font-size: 0.85rem; color: #ef4444;">${g.expiredSessionsCount} Phiên hết hạn</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">Token đăng nhập đã quá hạn</div>
            </div>
            <button type="button" class="btn-secondary btn-sm" onclick="AdminApp.runCleanup('purge_expired_sessions')" style="font-size: 0.72rem; padding: 4px 8px;">Dọn dẹp</button>
          </div>
        `;
      }

      if (g.expiredLinksCount > 0) {
        itemsHtml += `
          <div style="background: var(--bg-surface); padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 700; font-size: 0.85rem; color: #f59e0b;">${g.expiredLinksCount} Link share hết hạn</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">Liên kết chia sẻ đã hết thời hạn</div>
            </div>
            <button type="button" class="btn-secondary btn-sm" onclick="AdminApp.runCleanup('purge_expired_links')" style="font-size: 0.72rem; padding: 4px 8px;">Dọn dẹp</button>
          </div>
        `;
      }

      if (g.emptyVaultsCount > 0) {
        itemsHtml += `
          <div style="background: var(--bg-surface); padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 700; font-size: 0.85rem; color: #f59e0b;">${g.emptyVaultsCount} Sổ trống (0 gd)</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">Sổ mặc định chưa từng ghi chép</div>
            </div>
            <button type="button" class="btn-secondary btn-sm" onclick="AdminApp.runCleanup('delete_empty_vaults')" style="font-size: 0.72rem; padding: 4px 8px;">Xóa sổ trống</button>
          </div>
        `;
      }

      if (g.testUsersCount > 0) {
        itemsHtml += `
          <div style="background: var(--bg-surface); padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 700; font-size: 0.85rem; color: #f59e0b;">${g.testUsersCount} User test / Quick</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">Tài khoản quick_* hoặc test email</div>
            </div>
            <button type="button" class="btn-secondary btn-sm" onclick="AdminApp.runCleanup('delete_test_data')" style="font-size: 0.72rem; padding: 4px 8px;">Xóa test</button>
          </div>
        `;
      }

      if (g.snapshotsCount > 10) {
        itemsHtml += `
          <div style="background: var(--bg-surface); padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 700; font-size: 0.85rem; color: #9333ea;">${g.snapshotsCount} Bản snapshot</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">Lịch sử sao lưu dồn ứ nhiều bản</div>
            </div>
            <button type="button" class="btn-secondary btn-sm" onclick="AdminApp.runCleanup('prune_snapshots')" style="font-size: 0.72rem; padding: 4px 8px;">Thu gọn</button>
          </div>
        `;
      }

      itemsGrid.innerHTML = itemsHtml;
      if (window.lucide) lucide.createIcons();
    },

    // 2. TẢI DANH SÁCH NGƯỜI DÙNG (Users List)
    async loadUsers() {
      const res = await this.fetchApi('/api/admin/users');
      if (!res.ok) return;
      const data = await res.json();
      this.usersData = data.users || [];
      this.renderUsersList();
      this.renderRecentUsersInOverview();
    },

    setUserFilter(filter) {
      this.userFilter = filter;
      document.querySelectorAll('.user-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
      });
      this.renderUsersList();
    },

    filterUsers() {
      this.renderUsersList();
    },

    renderUsersList() {
      const container = document.getElementById('users-container-list');
      const searchVal = (document.getElementById('users-search-input').value || '').toLowerCase().trim();

      let list = this.usersData.slice();

      // Bộ lọc danh mục
      if (this.userFilter === 'real') {
        list = list.filter(u => !u.is_test_user);
      } else if (this.userFilter === 'test') {
        list = list.filter(u => u.is_test_user);
      } else if (this.userFilter === 'abandoned') {
        list = list.filter(u => u.is_abandoned);
      }

      // Bộ lọc tìm kiếm
      if (searchVal) {
        list = list.filter(u => {
          return (u.name || '').toLowerCase().includes(searchVal) ||
                 (u.email || '').toLowerCase().includes(searchVal) ||
                 (u.id || '').toLowerCase().includes(searchVal);
        });
      }

      if (list.length === 0) {
        container.innerHTML = `
          <div class="settings-card-clean" style="text-align: center; color: var(--text-muted); padding: 30px;">
            <i data-lucide="user-x" style="width: 32px; height: 32px; margin-bottom: 8px; opacity: 0.5;"></i>
            <div>Không tìm thấy người dùng nào phù hợp với bộ lọc.</div>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
      }

      container.innerHTML = list.map(u => {
        const isQuick = (u.google_id || '').startsWith('quick_');
        const badgeAccount = isQuick ?
          `<span class="settings-status-pill pill-amber" style="font-size: 0.65rem;">Tài khoản Test (Quick)</span>` :
          `<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;">Google OAuth</span>`;

        const badgeStatus = u.is_abandoned ?
          `<span class="settings-status-pill pill-red" style="font-size: 0.65rem;">Lãng quên (>30 ngày)</span>` :
          `<span class="settings-status-pill pill-gray" style="font-size: 0.65rem;">Hoạt động</span>`;

        const avatarSrc = u.picture || './assets/icons/icon.svg';

        return `
          <div class="admin-entity-card">
            <!-- Left: Avatar & Info -->
            <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
              <img src="${avatarSrc}" alt="Avatar" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1px solid var(--border-color);">
              <div style="min-width: 0; flex: 1;">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <strong style="font-size: 0.9rem; color: var(--text-primary);">${this.escapeHTML(u.name || 'Người dùng')}</strong>
                  ${badgeAccount}
                  ${badgeStatus}
                </div>
                <div style="font-size: 0.78rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;">
                  ${this.escapeHTML(u.email || 'Không có email')} &bull; <span style="font-family: monospace;">${u.id}</span>
                </div>
                <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap;">
                  <span>Sổ sở hữu: <strong>${u.owned_vaults_count}</strong></span>
                  <span>Tổng giao dịch: <strong>${u.total_transactions}</strong></span>
                  <span>Dung lượng: <strong>${this.formatBytes(u.total_size_bytes)}</strong></span>
                  <span>Hoạt động cuối: <strong>${this.formatRelative(u.last_active)}</strong></span>
                </div>
              </div>
            </div>

            <!-- Right: Actions -->
            <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
              <button type="button" class="btn-secondary btn-sm" onclick="AdminApp.viewUserDetail('${u.id}')" title="Xem chi tiết các sổ và dữ liệu">
                <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
                <span class="hide-on-mobile">Chi tiết</span>
              </button>
              <button type="button" class="btn-secondary btn-sm" onclick="AdminApp.deleteUser('${u.id}', '${this.escapeHTML(u.name)}')" title="Xóa người dùng này" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">
                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');

      if (window.lucide) lucide.createIcons();
    },

    renderRecentUsersInOverview() {
      const container = document.getElementById('overview-recent-users-list');
      if (!container) return;

      const recent = this.usersData.slice(0, 5);
      if (recent.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 12px;">Chưa có người dùng nào trên máy chủ.</div>';
        return;
      }

      container.innerHTML = recent.map(u => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 6px; border-bottom: 1px solid var(--border-color); font-size: 0.8rem;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${u.picture || './assets/icons/icon.svg'}" style="width: 26px; height: 26px; border-radius: 50%;">
            <div>
              <strong>${this.escapeHTML(u.name || 'Người dùng')}</strong>
              <span style="color: var(--text-muted); font-size: 0.74rem;">(${this.escapeHTML(u.email)})</span>
            </div>
          </div>
          <div style="color: var(--text-secondary); font-size: 0.75rem;">
            ${u.owned_vaults_count} sổ &bull; ${this.formatRelative(u.last_active)}
          </div>
        </div>
      `).join('');
    },

    // 3. TẢI TẤT CẢ SỔ (Vaults List)
    async loadVaults() {
      const res = await this.fetchApi('/api/admin/vaults');
      if (!res.ok) return;
      const data = await res.json();
      this.vaultsData = data.vaults || [];
      this.renderVaultsList();
    },

    setVaultFilter(filter) {
      this.vaultFilter = filter;
      document.querySelectorAll('.vault-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
      });
      this.renderVaultsList();
    },

    filterVaults() {
      this.renderVaultsList();
    },

    renderVaultsList() {
      const container = document.getElementById('vaults-container-list');
      const searchVal = (document.getElementById('vaults-search-input').value || '').toLowerCase().trim();

      let list = this.vaultsData.slice();

      if (this.vaultFilter === 'normal') {
        list = list.filter(v => !v.is_empty);
      } else if (this.vaultFilter === 'empty') {
        list = list.filter(v => v.is_empty);
      } else if (this.vaultFilter === 'test') {
        list = list.filter(v => v.is_test);
      } else if (this.vaultFilter === 'abandoned') {
        list = list.filter(v => v.is_abandoned);
      }

      if (searchVal) {
        list = list.filter(v => {
          return (v.name || '').toLowerCase().includes(searchVal) ||
                 (v.id || '').toLowerCase().includes(searchVal) ||
                 (v.owner_name || '').toLowerCase().includes(searchVal) ||
                 (v.owner_email || '').toLowerCase().includes(searchVal);
        });
      }

      if (list.length === 0) {
        container.innerHTML = `
          <div class="settings-card-clean" style="text-align: center; color: var(--text-muted); padding: 30px;">
            <i data-lucide="layers" style="width: 32px; height: 32px; margin-bottom: 8px; opacity: 0.5;"></i>
            <div>Không tìm thấy cuốn sổ nào phù hợp với điều kiện tìm kiếm.</div>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
      }

      container.innerHTML = list.map(v => {
        const encBadge = v.is_encrypted ?
          `<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;"><i data-lucide="lock" style="width: 10px; height: 10px; margin-right: 3px;"></i>Đã mã hóa E2EE</span>` :
          `<span class="settings-status-pill pill-gray" style="font-size: 0.65rem;">Plain text</span>`;

        const stateBadge = v.is_empty ?
          `<span class="settings-status-pill pill-amber" style="font-size: 0.65rem;">Sổ trống (0 gd)</span>` :
          (v.is_test ? `<span class="settings-status-pill pill-amber" style="font-size: 0.65rem;">Sổ Test</span>` : '');

        const abandonedBadge = v.is_abandoned ?
          `<span class="settings-status-pill pill-red" style="font-size: 0.65rem;">Lãng quên (>30 ngày)</span>` : '';

        return `
          <div class="admin-entity-card">
            <!-- Left: Vault Info -->
            <div style="min-width: 0; flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <strong style="font-size: 0.92rem; color: var(--text-primary);">${this.escapeHTML(v.name || 'Sổ không tên')}</strong>
                ${encBadge}
                ${stateBadge}
                ${abandonedBadge}
              </div>
              <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 3px;">
                Chủ sở hữu: <strong>${this.escapeHTML(v.owner_name)}</strong> (${this.escapeHTML(v.owner_email)}) &bull; ID: <code>${v.id}</code>
              </div>
              <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap;">
                <span>Giao dịch: <strong>${v.counts.transactions}</strong></span>
                <span>Tài khoản: <strong>${v.counts.accounts}</strong></span>
                <span>Danh mục: <strong>${v.counts.categories}</strong></span>
                <span>Snapshots: <strong>${v.history_count}</strong></span>
                <span>Dung lượng: <strong>${this.formatBytes(v.size_bytes)}</strong></span>
                <span>Cập nhật: <strong>${this.formatRelative(v.last_active)}</strong></span>
              </div>
            </div>

            <!-- Right: Actions -->
            <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
              <button type="button" class="btn-secondary btn-sm" onclick="AdminApp.viewVaultDetail('${v.id}')" title="Xem dữ liệu bên trong sổ">
                <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
                <span class="hide-on-mobile">Xem</span>
              </button>
              ${v.history_count > 1 ? `
                <button type="button" class="btn-secondary btn-sm" onclick="AdminApp.pruneVaultSnapshots('${v.id}')" title="Thu gọn lịch sử snapshot, chỉ giữ lại bản mới nhất" style="color: #f59e0b;">
                  <i data-lucide="archive" style="width: 14px; height: 14px;"></i>
                </button>
              ` : ''}
              <button type="button" class="btn-secondary btn-sm" onclick="AdminApp.deleteVault('${v.id}', '${this.escapeHTML(v.name)}')" title="Xóa sổ này" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">
                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');

      if (window.lucide) lucide.createIcons();
    },

    // 4. TẢI BÁO CÁO RÁC CHUYÊN SÂU (Garbage Report)
    async loadGarbageReport() {
      const res = await this.fetchApi('/api/admin/garbage');
      if (!res.ok) return;
      const data = await res.json();
      this.garbageData = data;
      this.renderGarbageTab(data);
    },

    renderGarbageTab(data) {
      const container = document.getElementById('garbage-categories-container');
      if (!container) return;

      const g = data;

      container.innerHTML = `
        <!-- Nhóm 1: Phiên hết hạn -->
        <div class="settings-card-clean" style="margin-bottom: 12px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="font-weight: 700; font-size: 0.88rem; display: flex; align-items: center; gap: 6px;">
              <i data-lucide="clock" style="width: 16px; height: 16px; color: #ef4444;"></i>
              <span>Phiên Đăng Nhập Hết Hạn (${g.expired_sessions.length})</span>
            </div>
            ${g.expired_sessions.length > 0 ? `
              <button type="button" class="btn-primary btn-sm" onclick="AdminApp.runCleanup('purge_expired_sessions')">
                Xóa tất cả phiên hết hạn
              </button>
            ` : '<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;">Sạch sẽ</span>'}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px;">
            Các phiên đăng nhập của người dùng đã quá hạn (thời hạn 90 ngày).
          </div>
          ${g.expired_sessions.length > 0 ? `
            <div style="max-height: 140px; overflow-y: auto; background: var(--bg-surface); border-radius: var(--radius-sm); padding: 6px 10px; font-size: 0.74rem;">
              ${g.expired_sessions.map(s => `
                <div style="padding: 4px 0; border-bottom: 1px dashed var(--border-color); display: flex; justify-content: space-between;">
                  <span>${this.escapeHTML(s.user_email || s.user_name || 'User')} (${s.token.slice(0, 16)}...)</span>
                  <span style="color: #ef4444;">Hết hạn: ${new Date(s.expires_at).toLocaleDateString('vi-VN')}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Nhóm 2: Liên kết chia sẻ hết hạn -->
        <div class="settings-card-clean" style="margin-bottom: 12px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="font-weight: 700; font-size: 0.88rem; display: flex; align-items: center; gap: 6px;">
              <i data-lucide="link" style="width: 16px; height: 16px; color: #f59e0b;"></i>
              <span>Liên Kết Chia Sẻ Hết Hạn (${g.expired_links.length})</span>
            </div>
            ${g.expired_links.length > 0 ? `
              <button type="button" class="btn-primary btn-sm" onclick="AdminApp.runCleanup('purge_expired_links')">
                Xóa tất cả link hết hạn
              </button>
            ` : '<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;">Sạch sẽ</span>'}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px;">
            Các liên kết mời chia sẻ mục/sổ mà người gửi đặt thời hạn và hiện tại đã hết hạn.
          </div>
        </div>

        <!-- Nhóm 3: Sổ trống & Sổ Test -->
        <div class="settings-card-clean" style="margin-bottom: 12px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="font-weight: 700; font-size: 0.88rem; display: flex; align-items: center; gap: 6px;">
              <i data-lucide="file-minus" style="width: 16px; height: 16px; color: #f59e0b;"></i>
              <span>Sổ Trống / Sổ Test Tạo Lúc Thử Nghiệm (${g.empty_vaults.length})</span>
            </div>
            ${g.empty_vaults.length > 0 ? `
              <button type="button" class="btn-primary btn-sm" onclick="AdminApp.runCleanup('delete_empty_vaults')">
                Xóa tất cả sổ trống
              </button>
            ` : '<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;">Không có</span>'}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px;">
            Các cuốn sổ có 0 giao dịch (hoặc chỉ có tài khoản trống tạo mặc định lúc test).
          </div>
          ${g.empty_vaults.length > 0 ? `
            <div style="max-height: 140px; overflow-y: auto; background: var(--bg-surface); border-radius: var(--radius-sm); padding: 6px 10px; font-size: 0.74rem;">
              ${g.empty_vaults.map(v => `
                <div style="padding: 4px 0; border-bottom: 1px dashed var(--border-color); display: flex; justify-content: space-between;">
                  <span><strong>${this.escapeHTML(v.name)}</strong> (${this.escapeHTML(v.owner_email)})</span>
                  <button type="button" class="btn-secondary btn-sm" onclick="AdminApp.deleteVault('${v.id}', '${this.escapeHTML(v.name)}')" style="font-size: 0.68rem; padding: 2px 6px; color: #ef4444;">Xóa</button>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Nhóm 4: Tài khoản Test / Quick Login -->
        <div class="settings-card-clean" style="margin-bottom: 12px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="font-weight: 700; font-size: 0.88rem; display: flex; align-items: center; gap: 6px;">
              <i data-lucide="user-x" style="width: 16px; height: 16px; color: #f59e0b;"></i>
              <span>Người Dùng Test Tạo Nhanh Quick Login (${g.test_users.length})</span>
            </div>
            ${g.test_users.length > 0 ? `
              <button type="button" class="btn-primary btn-sm" onclick="AdminApp.runCleanup('delete_test_data')">
                Xóa tài khoản test
              </button>
            ` : '<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;">Không có</span>'}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px;">
            Các tài khoản đăng nhập nhanh qua LAN hoặc email test ảo lúc thử nghiệm.
          </div>
          ${g.test_users.length > 0 ? `
            <div style="max-height: 140px; overflow-y: auto; background: var(--bg-surface); border-radius: var(--radius-sm); padding: 6px 10px; font-size: 0.74rem;">
              ${g.test_users.map(u => `
                <div style="padding: 4px 0; border-bottom: 1px dashed var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                  <span><strong>${this.escapeHTML(u.name)}</strong> (${this.escapeHTML(u.email)}) &bull; ${u.owned_vaults_count} sổ</span>
                  <button type="button" class="btn-secondary btn-sm" onclick="AdminApp.deleteUser('${u.id}', '${this.escapeHTML(u.name)}')" style="font-size: 0.68rem; padding: 2px 6px; color: #ef4444;">Xóa</button>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Nhóm 5: Bản Snapshot Cũ -->
        <div class="settings-card-clean" style="margin-bottom: 12px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="font-weight: 700; font-size: 0.88rem; display: flex; align-items: center; gap: 6px;">
              <i data-lucide="archive" style="width: 16px; height: 16px; color: #9333ea;"></i>
              <span>Bản Snapshot Lịch Sử Cũ Tích Tụ (${g.stale_snapshots.length})</span>
            </div>
            ${g.stale_snapshots.length > 0 ? `
              <button type="button" class="btn-primary btn-sm" onclick="AdminApp.runCleanup('prune_snapshots')">
                Thu gọn snapshot cũ
              </button>
            ` : '<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;">Tối ưu</span>'}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">
            Các bản snapshot cũ (vượt quá 5 bản mới nhất của mỗi sổ) có thể dọn bớt để giảm dung lượng file SQLite.
          </div>
        </div>
      `;

      if (window.lucide) lucide.createIcons();
    },

    // 5. HIỂN THỊ TAB HỆ THỐNG

    // 6. QUẢN LÝ QUYỀN QUẢN TRỊ VIÊN (Admin Permissions)
    async loadAdmins() {
      try {
        const res = await this.fetchApi('/api/admin/admins');
        if (!res.ok) return;
        const data = await res.json();
        this.renderAdminsList(data.admins || []);
      } catch (_) {}
    },

    renderAdminsList(admins) {
      const container = document.getElementById('admin-emails-container-list');
      const countEl = document.getElementById('admin-emails-count');
      if (countEl) countEl.textContent = admins.length;
      if (!container) return;

      if (!admins || admins.length === 0) {
        container.innerHTML = `
          <div style="padding: 12px; background: var(--bg-surface); border-radius: var(--radius-sm); color: var(--text-muted); font-size: 0.8rem; text-align: center;">
            Chưa có email quản trị viên nào.
          </div>
        `;
        return;
      }

      container.innerHTML = admins.map(a => {
        const isEnv = a.source === 'env';
        const badge = isEnv
          ? `<span class="settings-status-pill pill-teal" style="font-size: 0.65rem;" title="Khai báo cố định qua biến ADMIN_EMAIL trong Compose"><i data-lucide="container" style="width: 10px; height: 10px; margin-right: 3px;"></i>Compose / .env</span>`
          : `<span class="settings-status-pill pill-amber" style="font-size: 0.65rem;" title="Cấp quyền trực tiếp từ giao diện Quản trị"><i data-lucide="database" style="width: 10px; height: 10px; margin-right: 3px;"></i>Cấp qua Dashboard</span>`;

        const deleteBtn = a.can_delete
          ? `<button type="button" class="btn-secondary btn-sm" onclick="AdminApp.removeAdminEmail('${this.escapeHTML(a.email)}')" title="Thu hồi quyền quản trị của email này" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3); font-size: 0.72rem; padding: 4px 8px;">
               <i data-lucide="user-minus" style="width: 13px; height: 13px;"></i>
               <span class="hide-on-mobile">Thu hồi</span>
             </button>`
          : `<span style="font-size: 0.72rem; color: var(--text-muted); font-style: italic;">(Mặc định Compose)</span>`;

        const dateStr = a.created_at ? this.formatDate(a.created_at) : 'Khởi động máy chủ';

        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 0.82rem; gap: 8px;">
            <div style="min-width: 0; flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <strong style="color: var(--text-primary); font-size: 0.88rem;">${this.escapeHTML(a.email)}</strong>
                ${badge}
              </div>
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 3px;">
                Người cấp: <strong>${this.escapeHTML(a.added_by)}</strong> &bull; Ngày cấp: ${dateStr}
              </div>
            </div>
            <div style="flex-shrink: 0;">
              ${deleteBtn}
            </div>
          </div>
        `;
      }).join('');

      if (window.lucide) lucide.createIcons();
    },

    async addAdminEmail() {
      const input = document.getElementById('input-new-admin-email');
      const email = (input?.value || '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        this.showToast('Vui lòng nhập định dạng email hợp lệ', 'error');
        return;
      }

      const confirmed = await this.showConfirm(
        'Cấp Quyền Quản Trị Viên',
        `Bạn có chắc chắn muốn cấp quyền Quản trị viên máy chủ cho email "${email}"? Tài khoản này sẽ có toàn quyền kiểm tra, quản lý và dọn dẹp dữ liệu máy chủ.`
      );
      if (!confirmed) return;

      try {
        const res = await this.fetchApi('/api/admin/admins', {
          method: 'POST',
          body: { email }
        });
        const data = await res.json();
        if (data.success) {
          this.showToast(data.message || 'Cấp quyền admin thành công', 'success');
          if (input) input.value = '';
          this.renderAdminsList(data.admins || []);
        } else {
          throw new Error(data.error || 'Không thể cấp quyền admin');
        }
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    },

    async removeAdminEmail(email) {
      const confirmed = await this.showConfirm(
        'Thu Hồi Quyền Quản Trị',
        `Bạn có chắc chắn muốn thu hồi quyền Quản trị viên của email "${email}"?`
      );
      if (!confirmed) return;

      try {
        const res = await this.fetchApi(`/api/admin/admins/${encodeURIComponent(email)}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
          this.showToast(data.message || 'Đã thu hồi quyền admin', 'info');
          this.renderAdminsList(data.admins || []);
        } else {
          throw new Error(data.error || 'Không thể thu hồi quyền');
        }
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    },

    renderSystemTab(data) {
      this.loadAdmins();
      const emails = (data.system.adminEmails && data.system.adminEmails.length > 0) ?
        data.system.adminEmails.join(', ') : 'Chưa chỉ định (Khai báo ADMIN_EMAIL trong compose)';
      const emailsEl = document.getElementById('sys-admin-emails');
      if (emailsEl) emailsEl.textContent = emails;

      const filesContainer = document.getElementById('sys-storage-files-list');
      if (filesContainer && data.storage.files) {
        filesContainer.innerHTML = data.storage.files.map(f => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-bottom: 6px; font-size: 0.8rem;">
            <span style="font-family: monospace; font-weight: 600;">${f.name}</span>
            <span style="color: var(--text-secondary);">${this.formatBytes(f.size)}</span>
          </div>
        `).join('');
      }
    },

    // THỰC THI DỌN DẸP
    async runCleanup(action) {
      let promptTitle = 'Dọn Dẹp Dữ Liệu';
      let promptMsg = 'Bạn có chắc chắn muốn thực hiện hành động này?';

      if (action === 'all') {
        promptTitle = 'Dọn Dẹp Toàn Bộ Rác';
        promptMsg = 'Hệ thống sẽ xóa tất cả phiên hết hạn, liên kết hết hạn, thu gọn snapshot cũ và dọn dẹp các sổ trống. Bạn có chắc chắn muốn tiếp tục?';
      } else if (action === 'purge_expired_sessions') {
        promptTitle = 'Xóa Phiên Hết Hạn';
        promptMsg = 'Xóa toàn bộ các phiên đăng nhập đã quá hạn khỏi cơ sở dữ liệu?';
      } else if (action === 'delete_empty_vaults') {
        promptTitle = 'Xóa Sổ Trống';
        promptMsg = 'Xóa các cuốn sổ không có giao dịch nào?';
      } else if (action === 'delete_test_data') {
        promptTitle = 'Xóa Dữ Liệu Test';
        promptMsg = 'Xóa các tài khoản test (quick_*) và các cuốn sổ tương ứng? Dữ liệu người dùng thật sẽ được bảo toàn tuyệt đối.';
      } else if (action === 'prune_snapshots') {
        promptTitle = 'Thu Gọn Snapshot';
        promptMsg = 'Thu gọn lịch sử snapshot của tất cả các sổ, chỉ giữ lại các bản mới nhất?';
      }

      const confirmed = await this.showConfirm(promptTitle, promptMsg);
      if (!confirmed) return;

      try {
        const res = await this.fetchApi('/api/admin/cleanup', {
          method: 'POST',
          body: { action }
        });
        const data = await res.json();
        if (data.success) {
          const r = data.results;
          let summary = [];
          if (r.purged_sessions > 0) summary.push(`${r.purged_sessions} phiên`);
          if (r.purged_links > 0) summary.push(`${r.purged_links} link`);
          if (r.pruned_snapshots > 0) summary.push(`${r.pruned_snapshots} snapshot`);
          if (r.deleted_empty_vaults > 0) summary.push(`${r.deleted_empty_vaults} sổ trống`);
          if (r.deleted_test_users > 0) summary.push(`${r.deleted_test_users} user test`);

          const msg = summary.length > 0 ? `Đã dọn dẹp: ${summary.join(', ')}` : 'Đã hoàn tất dọn dẹp!';
          this.showToast(msg, 'success');
          await this.refreshAllData();
        }
      } catch (err) {
        this.showToast('Lỗi dọn dẹp: ' + err.message, 'error');
      }
    },

    // VACUUM DATABASE
    async vacuumDatabase() {
      const confirmed = await this.showConfirm(
        'Tối Ưu Hóa SQLite Database',
        'Thực hiện SQLite VACUUM và thu gọn WAL Journal để giải phóng dung lượng ổ cứng? Quá trình này hoàn toàn an toàn.'
      );
      if (!confirmed) return;

      try {
        const res = await this.fetchApi('/api/admin/vacuum', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          this.showToast(`Tối ưu thành công! Dung lượng database: ${this.formatBytes(data.storage.sizeBytes)}`, 'success');
          await this.loadOverview();
        }
      } catch (err) {
        this.showToast('Lỗi tối ưu: ' + err.message, 'error');
      }
    },

    // XÓA NGƯỜI DÙNG
    async deleteUser(userId, userName) {
      const confirmed = await this.showConfirm(
        `Xóa Người Dùng: ${userName}`,
        `CẢNH BÁO NGUY HIỂM: Hành động này sẽ xóa vĩnh viễn tài khoản người dùng "${userName}" và TOÀN BỘ các cuốn sổ, lịch sử và quyền chia sẻ thuộc sở hữu của người này. Bạn có chắc chắn muốn xóa?`
      );
      if (!confirmed) return;

      try {
        const res = await this.fetchApi(`/api/admin/users/${userId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          this.showToast(`Đã xóa người dùng "${userName}" thành công`, 'success');
          this.closeModal('modal-user-detail');
          await this.refreshAllData();
        }
      } catch (err) {
        this.showToast('Lỗi xóa người dùng: ' + err.message, 'error');
      }
    },

    // XÓA SỔ
    async deleteVault(vaultId, vaultName) {
      const confirmed = await this.showConfirm(
        `Xóa Sổ: ${vaultName}`,
        `Bạn có chắc chắn muốn xóa sổ "${vaultName}" cùng toàn bộ lịch sử snapshot và liên kết chia sẻ liên quan?`
      );
      if (!confirmed) return;

      try {
        const res = await this.fetchApi(`/api/admin/vaults/${vaultId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          this.showToast(`Đã xóa sổ "${vaultName}"`, 'success');
          this.closeModal('modal-vault-detail');
          await this.refreshAllData();
        }
      } catch (err) {
        this.showToast('Lỗi xóa sổ: ' + err.message, 'error');
      }
    },

    // THU GỌN SNAPSHOT 1 SỔ
    async pruneVaultSnapshots(vaultId) {
      try {
        const res = await this.fetchApi(`/api/admin/vaults/${vaultId}/prune-history`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          this.showToast('Đã thu gọn lịch sử snapshot của sổ', 'success');
          await this.loadVaults();
        }
      } catch (err) {
        this.showToast('Lỗi: ' + err.message, 'error');
      }
    },

    // XEM CHI TIẾT NGƯỜI DÙNG (Modal)
    async viewUserDetail(userId) {
      try {
        const res = await this.fetchApi(`/api/admin/users/${userId}`);
        if (!res.ok) throw new Error('Không tìm thấy thông tin');
        const data = await res.json();
        const u = data.user;
        const vaults = data.vaults || [];

        const content = document.getElementById('modal-user-detail-content');
        content.innerHTML = `
          <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 16px;">
            <img src="${u.picture || './assets/icons/icon.svg'}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-color);">
            <div>
              <div style="font-weight: 700; font-size: 1.05rem;">${this.escapeHTML(u.name || 'Người dùng')}</div>
              <div style="font-size: 0.82rem; color: var(--text-muted);">${this.escapeHTML(u.email || '')}</div>
              <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 2px;">
                ID: <code>${u.id}</code> &bull; Google ID: <code>${u.google_id || ''}</code>
              </div>
            </div>
          </div>

          <div style="font-size: 0.78rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">
            DANH SÁCH SỔ (${vaults.length})
          </div>

          ${vaults.length === 0 ? '<div style="color: var(--text-muted); font-size: 0.8rem; padding: 10px 0;">Người dùng này chưa có cuốn sổ nào.</div>' : `
            <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden;">
              ${vaults.map(v => `
                <div style="padding: 10px 12px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <div style="font-weight: 600; font-size: 0.86rem;">${this.escapeHTML(v.name)}</div>
                    <div style="font-size: 0.72rem; color: var(--text-muted);">
                      Vai trò: <strong>${v.role === 'owner' ? 'Chủ sở hữu' : v.role}</strong> &bull; Phiên bản: v${v.version}
                    </div>
                  </div>
                  <button type="button" class="btn-secondary btn-sm" onclick="AdminApp.viewVaultDetail('${v.id}')" style="font-size: 0.74rem;">Xem sổ</button>
                </div>
              `).join('')}
            </div>
          `}
        `;

        const btnDelete = document.getElementById('btn-modal-delete-user');
        btnDelete.onclick = () => this.deleteUser(u.id, u.name);

        this.openModal('modal-user-detail');
      } catch (err) {
        this.showToast('Lỗi xem chi tiết: ' + err.message, 'error');
      }
    },

    // XEM CHI TIẾT SỔ (Modal)
    async viewVaultDetail(vaultId) {
      try {
        const res = await this.fetchApi(`/api/admin/vaults/${vaultId}`);
        if (!res.ok) throw new Error('Không tìm thấy sổ');
        const d = await res.json();
        const v = d.vault;
        const data = d.data || {};
        const history = d.history || [];

        const isEncrypted = data.encrypted && data.payload;

        const content = document.getElementById('modal-vault-detail-content');
        document.getElementById('modal-vault-title').textContent = v.name || 'Chi Tiết Sổ';

        content.innerHTML = `
          <div style="margin-bottom: 14px;">
            <div style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">
              ${this.escapeHTML(v.name)}
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">
              ID: <code>${v.id}</code> &bull; Phiên bản: <strong>v${v.version || 1}</strong> &bull; Cập nhật: <strong>${this.formatDate(v.updated_at)}</strong>
            </div>
          </div>

          <div style="font-size: 0.78rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">
            TRẠNG THÁI DỮ LIỆU
          </div>

          ${isEncrypted ? `
            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: var(--radius-md); padding: 12px; margin-bottom: 14px; font-size: 0.8rem; color: #10b981;">
              <div style="font-weight: 700; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                <i data-lucide="shield-check" style="width: 16px; height: 16px;"></i>
                Dữ Liệu Đã Được Mã Hóa Đầu Cuối (Zero-Knowledge E2EE)
              </div>
              <div style="color: var(--text-secondary); font-size: 0.75rem;">
                Dữ liệu trên máy chủ là các khối mã hóa AES-GCM 256-bit an toàn. Chỉ người dùng có mật khẩu mã hóa mới có thể giải mã trên thiết bị cá nhân.
              </div>
            </div>
          ` : `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-bottom: 14px;">
              <div style="background: var(--bg-surface); padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center;">
                <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary);">${(data.transactions || []).length}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">Giao dịch</div>
              </div>
              <div style="background: var(--bg-surface); padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center;">
                <div style="font-size: 1.1rem; font-weight: 700;">${(data.accounts || []).length}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">Tài khoản</div>
              </div>
              <div style="background: var(--bg-surface); padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center;">
                <div style="font-size: 1.1rem; font-weight: 700;">${(data.categories || []).length}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">Danh mục</div>
              </div>
              <div style="background: var(--bg-surface); padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center;">
                <div style="font-size: 1.1rem; font-weight: 700;">${(data.debts || []).length}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">Vay nợ</div>
              </div>
            </div>
          `}

          <div style="font-size: 0.78rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">
            LỊCH SỬ SNAPSHOT (${history.length})
          </div>

          ${history.length === 0 ? '<div style="color: var(--text-muted); font-size: 0.78rem;">Chưa có bản snapshot nào.</div>' : `
            <div style="max-height: 160px; overflow-y: auto; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 8px 10px; font-size: 0.75rem;">
              ${history.map(h => `
                <div style="padding: 4px 0; border-bottom: 1px dashed var(--border-color); display: flex; justify-content: space-between;">
                  <span>v${h.version} &bull; ${this.formatDate(h.synced_at)}</span>
                  <span style="color: var(--text-muted);">${this.formatBytes(h.data_size || 0)}</span>
                </div>
              `).join('')}
            </div>
          `}
        `;

        document.getElementById('btn-modal-delete-vault').onclick = () => this.deleteVault(v.id, v.name);
        document.getElementById('btn-modal-prune-vault').onclick = () => this.pruneVaultSnapshots(v.id);

        this.openModal('modal-vault-detail');
      } catch (err) {
        this.showToast('Lỗi xem chi tiết: ' + err.message, 'error');
      }
    },

    // Modal Control
    openModal(modalId) {
      const m = document.getElementById(modalId);
      if (m) {
        m.style.display = 'flex';
        if (window.lucide) lucide.createIcons();
      }
    },

    closeModal(modalId) {
      const m = document.getElementById(modalId);
      if (m) m.style.display = 'none';
    },

    // Custom Confirm Dialog
    showConfirm(title, message) {
      return new Promise(resolve => {
        this.confirmResolve = resolve;
        document.getElementById('confirm-modal-title').textContent = title || 'Xác nhận';
        document.getElementById('confirm-modal-msg').textContent = message || '';
        document.getElementById('modal-confirm').style.display = 'flex';
        if (window.lucide) lucide.createIcons();
      });
    },

    closeConfirm(result) {
      document.getElementById('modal-confirm').style.display = 'none';
      if (this.confirmResolve) {
        this.confirmResolve(!!result);
        this.confirmResolve = null;
      }
    },

    // Toast Notifications
    showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `admin-toast ${type}`;
      toast.innerHTML = `
        <i data-lucide="${type === 'success' ? 'check' : (type === 'error' ? 'alert-circle' : 'info')}" style="width: 16px; height: 16px;"></i>
        <span>${message}</span>
      `;
      container.appendChild(toast);
      if (window.lucide) lucide.createIcons();

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    },

    // Sao chép Compose snippet
    copyComposeSnippet() {
      const code = document.getElementById('compose-snippet-code').innerText;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
          this.showToast('Đã sao chép cấu hình docker-compose.yml', 'success');
        });
      }
    },

    // Các hàm tiện ích định dạng
    formatBytes(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1) + ' ' + sizes[i];
    },

    formatUptime(seconds) {
      if (!seconds) return '0m';
      const m = Math.floor(seconds / 60);
      const h = Math.floor(m / 60);
      const d = Math.floor(h / 24);
      if (d > 0) return `${d}d ${h % 24}h`;
      if (h > 0) return `${h}h ${m % 60}m`;
      return `${m}m`;
    },

    formatDate(iso) {
      if (!iso) return 'Chưa rõ';
      try {
        return new Date(iso).toLocaleString('vi-VN');
      } catch (_) {
        return iso;
      }
    },

    formatRelative(iso) {
      if (!iso) return 'Chưa rõ';
      try {
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'Vừa xong';
        if (m < 60) return `${m} phút trước`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h} giờ trước`;
        const d = Math.floor(h / 24);
        if (d < 30) return `${d} ngày trước`;
        return new Date(iso).toLocaleDateString('vi-VN');
      } catch (_) {
        return iso;
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

  window.AdminApp = AdminApp;

  // Tự động khởi chạy khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AdminApp.init());
  } else {
    AdminApp.init();
  }
})();
