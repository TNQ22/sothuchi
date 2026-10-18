/**
 * ServerAuthModals - Quản lý Modal Xác Nhận Đăng Xuất & Lựa Chọn Chiến Lược Đồng Bộ Khi Đăng Nhập
 */
const ServerAuthModals = {
  _loginSyncResolve: null,
  _currentLoginContext: null,

  // ===========================================================================
  // 1. MODAL ĐĂNG XUẤT (LOGOUT)
  // ===========================================================================
  openLogoutModal() {
    const modal = document.getElementById('modal-server-logout');
    if (!modal) return;

    const emailEl = document.getElementById('logout-user-email');
    if (emailEl) {
      emailEl.textContent = window.serverSyncService?.userProfile?.email || 'hiện tại';
    }

    // Reset radio selection về 'keep' (mặc định cho đăng xuất độc lập an toàn)
    const radios = modal.querySelectorAll('input[name="logout-data-action"]');
    radios.forEach(r => {
      r.checked = (r.value === 'keep');
    });

    const warningBox = document.getElementById('logout-wipe-warning');
    if (warningBox) warningBox.style.display = 'none';

    const confirmBtn = document.getElementById('btn-confirm-logout');
    if (confirmBtn) {
      confirmBtn.className = 'btn-primary';
      confirmBtn.innerHTML = '<i data-lucide="log-out" style="width: 15px; height: 15px;"></i> Xác Nhận Đăng Xuất';
    }

    // Lắng nghe thay đổi radio
    radios.forEach(r => {
      r.onchange = () => {
        if (r.value === 'wipe') {
          if (warningBox) warningBox.style.display = 'block';
          if (confirmBtn) {
            confirmBtn.className = 'btn-danger';
            confirmBtn.innerHTML = '<i data-lucide="trash-2" style="width: 15px; height: 15px;"></i> Xoá Dữ Liệu & Đăng Xuất';
          }
        } else {
          if (warningBox) warningBox.style.display = 'none';
          if (confirmBtn) {
            confirmBtn.className = 'btn-primary';
            confirmBtn.innerHTML = '<i data-lucide="log-out" style="width: 15px; height: 15px;"></i> Xác Nhận Đăng Xuất';
          }
        }
        if (window.lucide) window.lucide.createIcons();
      };
    });

    modal.classList.add('open');
    if (window.lucide) window.lucide.createIcons();
  },

  closeLogoutModal() {
    const modal = document.getElementById('modal-server-logout');
    if (modal) modal.classList.remove('open');
  },

  async executeLogout() {
    const modal = document.getElementById('modal-server-logout');
    if (!modal) return;

    const selectedRadio = modal.querySelector('input[name="logout-data-action"]:checked');
    const action = selectedRadio ? selectedRadio.value : 'keep';

    this.closeLogoutModal();

    const sService = window.serverSyncService;
    if (!sService) return;

    if (action === 'wipe') {
      await sService.logout({ wipeLocal: true });
      if (typeof showToast === 'function') {
        showToast('Đã đăng xuất và xoá sạch dữ liệu trên máy để sẵn sàng đổi tài khoản!', 'success', 4500);
      }
    } else {
      await sService.logout({ wipeLocal: false });
      if (typeof showToast === 'function') {
        showToast('Đã ngắt kết nối máy chủ, chuyển sang chế độ ngoại tuyến độc lập.', 'info', 4000);
      }
    }

    if (window.app && typeof window.app.refreshAll === 'function') {
      await window.app.refreshAll();
    }
  },

  // ===========================================================================
  // 2. MODAL CHIẾN LƯỢC ĐỒNG BỘ KHI ĐĂNG NHẬP (LOGIN SYNC STRATEGY)
  // ===========================================================================
  promptLoginSyncStrategy(context) {
    return new Promise((resolve) => {
      this._loginSyncResolve = resolve;
      this._currentLoginContext = context;

      const modal = document.getElementById('modal-server-login-sync');
      if (!modal) {
        resolve('merge');
        return;
      }

      // Cập nhật thông tin context
      const emailEl = document.getElementById('login-sync-user-email');
      if (emailEl) emailEl.textContent = context.user?.email || 'Máy Chủ';

      const localCountEl = document.getElementById('login-sync-local-count');
      if (localCountEl) localCountEl.textContent = `${context.localTxCount || 0} ghi chép`;

      const serverCountEl = document.getElementById('login-sync-server-count');
      if (serverCountEl) serverCountEl.textContent = `${context.serverTxCount || 0} ghi chép`;

      // BẮT BUỘC: ĐỂ TRỐNG TẤT CẢ RADIO THEO YÊU CẦU NGƯỜI DÙNG
      const radios = modal.querySelectorAll('input[name="login-sync-strategy"]');
      radios.forEach(r => {
        r.checked = false;
      });

      // Bỏ class selected khỏi tất cả các card
      const cards = modal.querySelectorAll('.login-sync-opt-card');
      cards.forEach(c => c.classList.remove('selected'));

      // Nút xác nhận BAN ĐẦU BỊ VÔ HIỆU HÓA (DISABLED) ĐỂ BUỘC NGƯỜI DÙNG CHỌN
      const confirmBtn = document.getElementById('btn-confirm-login-sync');
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i data-lucide="check" style="width: 15px; height: 15px;"></i> Xác Nhận & Tiếp Tục';
      }

      const warningBox = document.getElementById('login-sync-warning-box');
      if (warningBox) warningBox.style.display = 'none';

      // Lắng nghe sự kiện người dùng chọn phương án
      radios.forEach(r => {
        r.onchange = () => {
          cards.forEach(c => c.classList.remove('selected'));
          const parentCard = r.closest('.login-sync-opt-card');
          if (parentCard) parentCard.classList.add('selected');

          if (confirmBtn) {
            confirmBtn.disabled = false;
          }

          if (warningBox) {
            if (r.value === 'overwrite_from_server') {
              warningBox.style.display = 'block';
              warningBox.style.background = 'rgba(59, 130, 246, 0.08)';
              warningBox.style.borderColor = 'rgba(59, 130, 246, 0.35)';
              warningBox.style.color = '#2563eb';
              warningBox.innerHTML = '<i data-lucide="info" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;"></i> <strong>Tải về & Ghi đè:</strong> Dữ liệu trên thiết bị này sẽ được thay thế bằng toàn bộ dữ liệu từ tài khoản máy chủ mới.';
            } else if (r.value === 'overwrite_to_server') {
              warningBox.style.display = 'block';
              warningBox.style.background = 'rgba(239, 68, 68, 0.08)';
              warningBox.style.borderColor = 'rgba(239, 68, 68, 0.35)';
              warningBox.style.color = '#ef4444';
              warningBox.innerHTML = '<i data-lucide="alert-triangle" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;"></i> <strong>Cảnh báo:</strong> Dữ liệu hiện có trên máy chủ của tài khoản này sẽ bị ghi đè hoàn toàn bởi dữ liệu trên máy hiện tại!';
            } else if (r.value === 'merge') {
              warningBox.style.display = 'block';
              warningBox.style.background = 'rgba(16, 185, 129, 0.08)';
              warningBox.style.borderColor = 'rgba(16, 185, 129, 0.35)';
              warningBox.style.color = '#059669';
              warningBox.innerHTML = '<i data-lucide="check-circle" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;"></i> <strong>Gộp dữ liệu:</strong> Cả dữ liệu trên máy và trên máy chủ sẽ được kết hợp đầy đủ, không làm mất ghi chép nào.';
            }
            if (window.lucide) window.lucide.createIcons();
          }
        };
      });

      modal.classList.add('open');
      if (window.lucide) window.lucide.createIcons();
    });
  },

  closeLoginSyncModal() {
    const modal = document.getElementById('modal-server-login-sync');
    if (modal) modal.classList.remove('open');
  },

  async executeLoginSync() {
    const modal = document.getElementById('modal-server-login-sync');
    if (!modal) return;

    const selectedRadio = modal.querySelector('input[name="login-sync-strategy"]:checked');
    if (!selectedRadio) {
      if (typeof showToast === 'function') {
        showToast('Vui lòng chọn 1 phương án xử lý dữ liệu trước khi tiếp tục', 'warning');
      }
      return;
    }

    const strategy = selectedRadio.value;
    const confirmBtn = document.getElementById('btn-confirm-login-sync');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i data-lucide="refresh-cw" class="spin" style="width: 15px; height: 15px;"></i> Đang xử lý...';
    }

    try {
      const sService = window.serverSyncService;
      const context = this._currentLoginContext;

      if (strategy === 'overwrite_from_server') {
        // Tải về & Ghi đè từ máy chủ (không giữ private data của account cũ)
        await sService.replaceLocalWithSnapshotData(context.serverVaultData, false);
        if (typeof showToast === 'function') {
          showToast('Đã tải và ghi đè dữ liệu từ máy chủ thành công!', 'success', 4000);
        }
      } else if (strategy === 'overwrite_to_server') {
        // Ghi đè dữ liệu máy này lên máy chủ
        await sService.forceOverwriteServer();
        if (typeof showToast === 'function') {
          showToast('Đã ghi đè toàn bộ dữ liệu máy này lên máy chủ thành công!', 'success', 4000);
        }
      } else if (strategy === 'merge') {
        // Gộp dữ liệu cả hai bên
        await sService.sync();
        if (typeof showToast === 'function') {
          showToast('Đã gộp dữ liệu thành công!', 'success', 4000);
        }
      }

      if (window.app && typeof window.app.refreshAll === 'function') {
        await window.app.refreshAll();
      }
    } catch (err) {
      if (typeof showToast === 'function') {
        showToast('Lỗi khi đồng bộ dữ liệu: ' + err.message, 'error', 5000);
      }
    } finally {
      this.closeLoginSyncModal();
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i data-lucide="check" style="width: 15px; height: 15px;"></i> Xác Nhận & Tiếp Tục';
      }
      if (this._loginSyncResolve) {
        this._loginSyncResolve(strategy);
        this._loginSyncResolve = null;
      }
    }
  },

  async cancelLoginSync() {
    this.closeLoginSyncModal();
    const sService = window.serverSyncService;
    if (sService) {
      await sService.logout({ wipeLocal: false });
    }
    if (typeof showToast === 'function') {
      showToast('Đã huỷ đăng nhập. Dữ liệu trên máy được giữ nguyên.', 'info');
    }
    if (this._loginSyncResolve) {
      this._loginSyncResolve(null);
      this._loginSyncResolve = null;
    }
  }
};

window.ServerAuthModals = ServerAuthModals;
