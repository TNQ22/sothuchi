/**
 * CustomDialog - Unified Native-styled Dialogs (Confirm, Prompt, Alert)
 * Thay thế hoàn toàn popup hệ thống/trình duyệt (window.confirm, window.prompt, window.alert)
 * mang đến phong cách thiết kế đồng bộ, hiện đại, mượt mà trên mọi thiết bị.
 */
(function() {
  const CustomDialog = {
    _activeResolve: null,
    _currentType: null,

    _ensureDOM() {
      let modal = document.getElementById('modal-custom-dialog');
      if (modal) {
        if (!modal._eventsBound) {
          this._bindEvents(modal);
          modal._eventsBound = true;
        }
        return modal;
      }

      modal = document.createElement('div');
      modal.id = 'modal-custom-dialog';
      modal.className = 'modal-overlay custom-dialog-overlay';
      modal.setAttribute('style', 'z-index: 100050;');
      modal.innerHTML = `
        <div class="modal-dialog custom-dialog-box" role="dialog" aria-modal="true">
          <div class="modal-header custom-dialog-header">
            <div class="custom-dialog-title-wrap">
              <div class="custom-dialog-icon-badge" id="custom-dialog-badge">
                <i data-lucide="help-circle" id="custom-dialog-icon" style="width: 20px; height: 20px;"></i>
              </div>
              <h3 class="custom-dialog-title-text" id="custom-dialog-title-text">Xác Nhận</h3>
            </div>
            <button type="button" class="btn-icon" id="custom-dialog-btn-close" title="Đóng">
              <i data-lucide="x" style="width: 18px; height: 18px;"></i>
            </button>
          </div>
          <div class="modal-body custom-dialog-body">
            <div id="custom-dialog-message" class="custom-dialog-message"></div>
            <div id="custom-dialog-input-container" class="custom-dialog-input-wrap" style="display: none;">
              <input type="text" id="custom-dialog-input" class="custom-dialog-input" autocomplete="off" spellcheck="false">
              <div id="custom-dialog-input-hint" class="custom-dialog-input-hint" style="display: none;"></div>
            </div>
          </div>
          <div class="modal-footer custom-dialog-footer">
            <button type="button" class="btn-secondary" id="custom-dialog-btn-cancel">Huỷ</button>
            <button type="button" class="btn-primary" id="custom-dialog-btn-confirm">
              <span id="custom-dialog-confirm-text">Xác Nhận</span>
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      this._bindEvents(modal);
      modal._eventsBound = true;
      return modal;
    },

    _bindEvents(modal) {
      const btnClose = modal.querySelector('#custom-dialog-btn-close');
      const btnCancel = modal.querySelector('#custom-dialog-btn-cancel');
      const btnConfirm = modal.querySelector('#custom-dialog-btn-confirm');
      const input = modal.querySelector('#custom-dialog-input');

      const handleCancel = () => {
        const res = this._activeResolve;
        this._activeResolve = null;
        this._close();
        if (res) {
          if (this._currentType === 'prompt') res(null);
          else if (this._currentType === 'confirm') res(false);
          else res();
        }
      };

      const handleConfirm = () => {
        const res = this._activeResolve;
        this._activeResolve = null;
        const val = input.value;
        this._close();
        if (res) {
          if (this._currentType === 'prompt') res(val);
          else if (this._currentType === 'confirm') res(true);
          else res();
        }
      };

      btnClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      });

      btnCancel.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      });

      btnConfirm.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm();
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleConfirm();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          handleCancel();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) {
          e.preventDefault();
          handleCancel();
        }
      });
    },

    _close() {
      const modal = document.getElementById('modal-custom-dialog');
      if (modal) modal.classList.remove('open');
    },

    /**
     * showConfirm: Hiển thị popup xác nhận với nút Xác nhận và Huỷ
     */
    confirm(options, secondaryTitle) {
      return new Promise((resolve) => {
        const modal = this._ensureDOM();
        this._currentType = 'confirm';
        this._activeResolve = resolve;

        let opts = options;
        if (typeof options === 'string') {
          opts = {
            message: options,
            title: secondaryTitle || 'Xác Nhận'
          };
        } else if (!opts) {
          opts = {};
        }

        const title = opts.title || 'Xác Nhận';
        const message = opts.message || '';
        const confirmText = opts.confirmText || 'Xác Nhận';
        const cancelText = opts.cancelText || 'Huỷ';
        const danger = !!opts.danger;
        const iconName = opts.icon || (danger ? 'alert-triangle' : 'help-circle');

        // Elements
        const titleTextEl = modal.querySelector('#custom-dialog-title-text');
        const messageEl = modal.querySelector('#custom-dialog-message');
        const badgeEl = modal.querySelector('#custom-dialog-badge');
        const iconEl = modal.querySelector('#custom-dialog-icon');
        const inputWrap = modal.querySelector('#custom-dialog-input-container');
        const btnCancel = modal.querySelector('#custom-dialog-btn-cancel');
        const btnConfirm = modal.querySelector('#custom-dialog-btn-confirm');
        const confirmTextEl = modal.querySelector('#custom-dialog-confirm-text');

        titleTextEl.textContent = title;
        // Hỗ trợ cả văn bản có xuống dòng hoặc mã HTML an toàn
        if (typeof message === 'string' && message.includes('<')) {
          messageEl.innerHTML = message;
        } else if (typeof message === 'string' && message.includes('\n')) {
          messageEl.innerHTML = message.replace(/\n/g, '<br>');
        } else {
          messageEl.textContent = message || '';
        }

        inputWrap.style.display = 'none';

        btnCancel.style.display = 'inline-flex';
        btnCancel.textContent = cancelText;

        confirmTextEl.textContent = confirmText;
        if (danger) {
          btnConfirm.className = opts.confirmClass || 'btn-danger-solid';
          badgeEl.className = 'custom-dialog-icon-badge danger';
        } else if (opts.type === 'success' || opts.theme === 'emerald') {
          btnConfirm.className = opts.confirmClass || 'btn-emerald';
          badgeEl.className = 'custom-dialog-icon-badge success';
        } else if (opts.type === 'warning') {
          btnConfirm.className = opts.confirmClass || 'btn-primary';
          badgeEl.className = 'custom-dialog-icon-badge warning';
        } else {
          btnConfirm.className = opts.confirmClass || 'btn-primary';
          badgeEl.className = 'custom-dialog-icon-badge';
        }

        iconEl.setAttribute('data-lucide', iconName);
        modal.classList.add('open');
        if (window.lucide) lucide.createIcons();

        setTimeout(() => {
          if (danger) {
            btnCancel.focus();
          } else {
            btnConfirm.focus();
          }
        }, 50);
      });
    },

    /**
     * showPrompt: Hiển thị popup nhập liệu với input field
     */
    prompt(options, defaultValue, thirdTitle) {
      return new Promise((resolve) => {
        const modal = this._ensureDOM();
        this._currentType = 'prompt';
        this._activeResolve = resolve;

        let opts = options;
        if (typeof options === 'string') {
          opts = {
            message: options,
            defaultValue: defaultValue || '',
            title: thirdTitle || 'Nhập Liệu'
          };
        } else if (!opts) {
          opts = {};
        }

        const title = opts.title || 'Nhập Liệu';
        const message = opts.message || '';
        const defVal = opts.defaultValue !== undefined ? opts.defaultValue : '';
        const placeholder = opts.placeholder || '';
        const inputType = opts.inputType || 'text';
        const confirmText = opts.confirmText || 'Xác Nhận';
        const cancelText = opts.cancelText || 'Huỷ';
        const iconName = opts.icon || 'edit-3';
        const helperText = opts.helperText || '';

        const titleTextEl = modal.querySelector('#custom-dialog-title-text');
        const messageEl = modal.querySelector('#custom-dialog-message');
        const badgeEl = modal.querySelector('#custom-dialog-badge');
        const iconEl = modal.querySelector('#custom-dialog-icon');
        const inputWrap = modal.querySelector('#custom-dialog-input-container');
        const input = modal.querySelector('#custom-dialog-input');
        const hintEl = modal.querySelector('#custom-dialog-input-hint');
        const btnCancel = modal.querySelector('#custom-dialog-btn-cancel');
        const btnConfirm = modal.querySelector('#custom-dialog-btn-confirm');
        const confirmTextEl = modal.querySelector('#custom-dialog-confirm-text');

        titleTextEl.textContent = title;
        if (typeof message === 'string' && message.includes('<')) {
          messageEl.innerHTML = message;
        } else if (typeof message === 'string' && message.includes('\n')) {
          messageEl.innerHTML = message.replace(/\n/g, '<br>');
        } else {
          messageEl.textContent = message || '';
        }

        inputWrap.style.display = 'flex';
        input.type = inputType;
        input.value = defVal;
        input.placeholder = placeholder;

        if (helperText) {
          hintEl.textContent = helperText;
          hintEl.style.display = 'block';
        } else {
          hintEl.style.display = 'none';
        }

        btnCancel.style.display = 'inline-flex';
        btnCancel.textContent = cancelText;

        const danger = !!opts.danger;
        confirmTextEl.textContent = confirmText;
        if (danger) {
          btnConfirm.className = opts.confirmClass || 'btn-danger-solid';
          badgeEl.className = 'custom-dialog-icon-badge danger';
        } else {
          btnConfirm.className = opts.confirmClass || 'btn-primary';
          badgeEl.className = 'custom-dialog-icon-badge';
        }

        iconEl.setAttribute('data-lucide', iconName);
        modal.classList.add('open');
        if (window.lucide) lucide.createIcons();

        setTimeout(() => {
          input.focus();
          if (input.value) {
            input.select();
          }
        }, 60);
      });
    },

    /**
     * showAlert: Hiển thị popup thông báo 1 nút
     */
    alert(options, secondaryTitle) {
      return new Promise((resolve) => {
        const modal = this._ensureDOM();
        this._currentType = 'alert';
        this._activeResolve = resolve;

        let opts = options;
        if (typeof options === 'string') {
          opts = {
            message: options,
            title: secondaryTitle || 'Thông Báo'
          };
        } else if (!opts) {
          opts = {};
        }

        const title = opts.title || 'Thông Báo';
        const message = opts.message || '';
        const confirmText = opts.confirmText || 'Đã Hiểu';
        const danger = !!opts.danger;
        const iconName = opts.icon || (danger ? 'alert-triangle' : 'info');

        const titleTextEl = modal.querySelector('#custom-dialog-title-text');
        const messageEl = modal.querySelector('#custom-dialog-message');
        const badgeEl = modal.querySelector('#custom-dialog-badge');
        const iconEl = modal.querySelector('#custom-dialog-icon');
        const inputWrap = modal.querySelector('#custom-dialog-input-container');
        const btnCancel = modal.querySelector('#custom-dialog-btn-cancel');
        const btnConfirm = modal.querySelector('#custom-dialog-btn-confirm');
        const confirmTextEl = modal.querySelector('#custom-dialog-confirm-text');

        titleTextEl.textContent = title;
        if (typeof message === 'string' && message.includes('<')) {
          messageEl.innerHTML = message;
        } else if (typeof message === 'string' && message.includes('\n')) {
          messageEl.innerHTML = message.replace(/\n/g, '<br>');
        } else {
          messageEl.textContent = message || '';
        }

        inputWrap.style.display = 'none';
        btnCancel.style.display = 'none';

        confirmTextEl.textContent = confirmText;
        btnConfirm.className = danger ? 'btn-danger' : 'btn-primary';
        badgeEl.className = danger ? 'custom-dialog-icon-badge danger' : 'custom-dialog-icon-badge info';

        iconEl.setAttribute('data-lucide', iconName);
        modal.classList.add('open');
        if (window.lucide) lucide.createIcons();

        setTimeout(() => {
          btnConfirm.focus();
        }, 50);
      });
    }
  };

  // Expose globally
  window.CustomDialog = CustomDialog;
  window.showConfirm = (opts, title) => CustomDialog.confirm(opts, title);
  window.showPrompt = (opts, defVal, title) => CustomDialog.prompt(opts, defVal, title);
  window.showAlert = (opts, title) => CustomDialog.alert(opts, title);
})();
