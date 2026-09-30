/**
 * SỔ THU CHI - UI CALENDAR MODULE
 * Bộ chọn Lịch & Thời gian tùy chỉnh chuẩn giao diện hình ảnh:
 * - Header Ngày (xanh) | Giờ (xám)
 * - Nút điều hướng tháng & pill Tháng M/YYYY ▾
 * - Hàng thứ: T2, T3, T4, T5, T6, T7, CN
 * - Vòng tròn màu xanh lá cây ở ngày được chọn
 * - Nút "Hôm nay" và "Xong"
 * - Chế độ 'date': Chạm trực tiếp vào ngày sẽ tự động chọn và đóng ngay lập tức!
 */

const UICalendar = {
  mode: 'datetime', // 'datetime' | 'date' | 'month'
  selectedDate: null, // Date object (year, month, day)
  selectedTime: '12:00', // 'HH:mm'
  viewYear: 2026,
  viewMonth: 8, // 0-indexed (8 = September)
  activeTab: 'date', // 'date' | 'time'
  isMonthPickerOpen: false,
  onSelectCallback: null,
  initialized: false,

  init() {
    this.createModalDOM();
    this.bindEvents();
    this.initialized = true;
  },

  createModalDOM() {
    if (document.getElementById('modal-custom-calendar')) return;

    const modal = document.createElement('div');
    modal.id = 'modal-custom-calendar';
    modal.className = 'custom-cal-overlay';
    modal.innerHTML = `
      <div class="custom-cal-backdrop" id="custom-cal-backdrop"></div>
      <div class="custom-cal-container">
        <!-- Top Bar: Date | Time -->
        <div class="custom-cal-topbar" id="cal-topbar">
          <button type="button" class="custom-cal-top-item active" id="cal-top-date" title="Chọn ngày">
            <span id="cal-top-date-text">Hôm nay</span>
          </button>
          <div class="custom-cal-top-divider" id="cal-top-divider"></div>
          <button type="button" class="custom-cal-top-item" id="cal-top-time" title="Chọn giờ">
            <span id="cal-top-time-text">--:--</span>
          </button>
        </div>

        <!-- Main Card Dialog -->
        <div class="custom-cal-card">
          <!-- DATE PICKER VIEW -->
          <div class="custom-cal-date-view" id="cal-date-view">
            <!-- Calendar Navigation Header -->
            <div class="custom-cal-header">
              <button type="button" class="custom-cal-nav-btn" id="cal-prev-month" title="Tháng trước">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>

              <button type="button" class="custom-cal-month-pill" id="cal-month-pill" title="Chọn nhanh tháng/năm">
                <span id="cal-month-pill-text">Tháng 9/2026</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><path d="M7 10l5 5 5-5z"/></svg>
              </button>

              <button type="button" class="custom-cal-nav-btn" id="cal-next-month" title="Tháng sau">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>

            <!-- Month / Year Quick Dropdown Selector Panel -->
            <div class="custom-cal-month-selector" id="cal-month-selector" style="display: none;">
              <div class="custom-cal-year-nav">
                <button type="button" class="custom-cal-nav-btn" id="cal-prev-year">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <span class="custom-cal-year-title" id="cal-year-title">2026</span>
                <button type="button" class="custom-cal-nav-btn" id="cal-next-year">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
              </div>
              <div class="custom-cal-months-grid" id="cal-months-grid"></div>
            </div>

            <!-- Weekday Header: T2, T3, T4, T5, T6, T7, CN -->
            <div class="custom-cal-weekdays">
              <span>T2</span>
              <span>T3</span>
              <span>T4</span>
              <span>T5</span>
              <span>T6</span>
              <span>T7</span>
              <span>CN</span>
            </div>

            <!-- Days Grid -->
            <div class="custom-cal-days-grid" id="cal-days-grid"></div>
          </div>

          <!-- TIME PICKER VIEW -->
          <div class="custom-cal-time-view" id="cal-time-view" style="display: none;">
            <div class="custom-cal-time-header">Chọn thời gian</div>
            <div class="custom-cal-time-display-box">
              <div class="custom-cal-time-field">
                <span class="custom-cal-time-val" id="cal-hour-val">11</span>
                <span class="custom-cal-time-label">Giờ</span>
              </div>
              <span class="custom-cal-time-colon">:</span>
              <div class="custom-cal-time-field">
                <span class="custom-cal-time-val" id="cal-min-val">22</span>
                <span class="custom-cal-time-label">Phút</span>
              </div>
            </div>

            <!-- Time Wheel / Selectors -->
            <div class="custom-cal-time-columns">
              <div class="custom-cal-time-col">
                <div class="custom-cal-time-col-title">Giờ (0 - 23)</div>
                <div class="custom-cal-time-list" id="cal-hours-list"></div>
              </div>
              <div class="custom-cal-time-col">
                <div class="custom-cal-time-col-title">Phút (0 - 59)</div>
                <div class="custom-cal-time-list" id="cal-mins-list"></div>
              </div>
            </div>

            <!-- Quick Time Presets -->
            <div class="custom-cal-time-presets">
              <button type="button" class="cal-time-preset-btn" onclick="UICalendar.setTimeNow()">Hiện tại</button>
              <button type="button" class="cal-time-preset-btn" onclick="UICalendar.adjustMinutes(-15)">-15p</button>
              <button type="button" class="cal-time-preset-btn" onclick="UICalendar.adjustMinutes(15)">+15p</button>
              <button type="button" class="cal-time-preset-btn" onclick="UICalendar.adjustMinutes(60)">+1h</button>
            </div>
          </div>

          <!-- Bottom Action Buttons: Hôm nay & Xong -->
          <div class="custom-cal-actions">
            <button type="button" class="custom-cal-btn-today" id="cal-btn-today">Hôm nay</button>
            <button type="button" class="custom-cal-btn-done" id="cal-btn-done">Xong</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  },

  bindEvents() {
    // Backdrop click
    const backdrop = document.getElementById('custom-cal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => this.close());
    }

    // Top Bar Tabs
    const tabDate = document.getElementById('cal-top-date');
    const tabTime = document.getElementById('cal-top-time');
    if (tabDate) {
      tabDate.addEventListener('click', () => this.switchTab('date'));
    }
    if (tabTime) {
      tabTime.addEventListener('click', () => this.switchTab('time'));
    }

    // Prev / Next Month
    const btnPrev = document.getElementById('cal-prev-month');
    const btnNext = document.getElementById('cal-next-month');
    if (btnPrev) {
      btnPrev.addEventListener('click', () => this.changeMonth(-1));
    }
    if (btnNext) {
      btnNext.addEventListener('click', () => this.changeMonth(1));
    }

    // Month pill click -> toggle quick month-year selector
    const pill = document.getElementById('cal-month-pill');
    if (pill) {
      pill.addEventListener('click', () => this.toggleMonthSelector());
    }

    // Year Prev / Next
    const btnPrevYear = document.getElementById('cal-prev-year');
    const btnNextYear = document.getElementById('cal-next-year');
    if (btnPrevYear) {
      btnPrevYear.addEventListener('click', () => this.changeYear(-1));
    }
    if (btnNextYear) {
      btnNextYear.addEventListener('click', () => this.changeYear(1));
    }

    // Action buttons
    const btnToday = document.getElementById('cal-btn-today');
    const btnDone = document.getElementById('cal-btn-done');
    if (btnToday) {
      btnToday.addEventListener('click', () => this.selectToday());
    }
    if (btnDone) {
      btnDone.addEventListener('click', () => this.confirmSelection());
    }

    // Populate Hour & Minute lists
    this.populateTimeLists();
  },

  populateTimeLists() {
    const hoursList = document.getElementById('cal-hours-list');
    const minsList = document.getElementById('cal-mins-list');
    if (!hoursList || !minsList) return;

    hoursList.innerHTML = '';
    for (let h = 0; h < 24; h++) {
      const hStr = String(h).padStart(2, '0');
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'custom-cal-time-item';
      item.dataset.val = hStr;
      item.textContent = hStr;
      item.onclick = () => this.selectHour(hStr);
      hoursList.appendChild(item);
    }

    minsList.innerHTML = '';
    for (let m = 0; m < 60; m++) {
      const mStr = String(m).padStart(2, '0');
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'custom-cal-time-item';
      item.dataset.val = mStr;
      item.textContent = mStr;
      item.onclick = () => this.selectMinute(mStr);
      minsList.appendChild(item);
    }
  },

  /**
   * Open the custom calendar
   * @param {Object} options
   *   mode: 'datetime' | 'date' | 'month'
   *   initialDate: 'YYYY-MM-DD' or 'DD/MM/YYYY' (optional)
   *   initialTime: 'HH:mm' (optional)
   *   onSelect: function(dateStr, timeStr)
   */
  open(options = {}) {
    if (!this.initialized || !document.getElementById('modal-custom-calendar')) {
      this.init();
    }
    this.mode = options.mode || 'datetime';
    this.onSelectCallback = options.onSelect || null;

    // Parse initial date (Hỗ trợ linh hoạt cả YYYY-MM-DD, DD/MM/YYYY hoặc YYYY-MM)
    if (options.initialDate) {
      const dateStr = String(options.initialDate).trim();
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/').map(Number);
        if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
          this.selectedDate = new Date(parts[2], parts[1] - 1, parts[0]);
        } else {
          this.selectedDate = new Date();
        }
      } else if (dateStr.includes('-')) {
        const parts = dateStr.split('-').map(Number);
        if (parts.length === 3 && !isNaN(parts[0])) {
          this.selectedDate = new Date(parts[0], parts[1] - 1, parts[2]);
        } else if (parts.length === 2 && !isNaN(parts[0])) {
          // Month only (YYYY-MM)
          this.selectedDate = new Date(parts[0], parts[1] - 1, 1);
        } else {
          this.selectedDate = new Date();
        }
      } else {
        this.selectedDate = new Date();
      }
    } else {
      this.selectedDate = new Date();
    }
    if (!this.selectedDate || isNaN(this.selectedDate.getTime())) {
      this.selectedDate = new Date();
    }

    // Parse initial time
    if (options.initialTime && options.initialTime.includes(':')) {
      const [hh, mm] = options.initialTime.split(':');
      this.selectedTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    } else {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      this.selectedTime = `${hh}:${mm}`;
    }

    this.viewYear = this.selectedDate.getFullYear();
    this.viewMonth = this.selectedDate.getMonth();
    this.isMonthPickerOpen = false;

    // Adjust Top Bar visibility depending on mode
    const divider = document.getElementById('cal-top-divider');
    const tabTime = document.getElementById('cal-top-time');
    const tabDate = document.getElementById('cal-top-date');
    const btnToday = document.getElementById('cal-btn-today');

    if (this.mode === 'date') {
      if (divider) divider.style.display = 'none';
      if (tabTime) tabTime.style.display = 'none';
      if (tabDate) tabDate.style.flex = '1';
      if (btnToday) btnToday.textContent = 'Hôm nay';
    } else if (this.mode === 'month') {
      if (divider) divider.style.display = 'none';
      if (tabTime) tabTime.style.display = 'none';
      if (tabDate) tabDate.style.flex = '1';
      if (btnToday) btnToday.textContent = 'Tháng này';
    } else {
      if (divider) divider.style.display = 'block';
      if (tabTime) tabTime.style.display = 'flex';
      if (tabDate) tabDate.style.flex = '';
      if (btnToday) btnToday.textContent = 'Hôm nay';
    }

    // Switch to initial tab
    this.switchTab('date');

    // If month mode, open month selector directly
    if (this.mode === 'month') {
      this.openMonthSelector();
    } else {
      this.closeMonthSelector();
    }

    this.updateTopBarDisplays();
    this.renderCalendar();

    // Show modal
    const modal = document.getElementById('modal-custom-calendar');
    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('open');
    }
  },

  close() {
    const modal = document.getElementById('modal-custom-calendar');
    if (modal) {
      modal.classList.remove('open');
    }
  },

  switchTab(tab) {
    if (this.mode !== 'datetime' && tab === 'time') return;
    this.activeTab = tab;

    const tabDate = document.getElementById('cal-top-date');
    const tabTime = document.getElementById('cal-top-time');
    const dateView = document.getElementById('cal-date-view');
    const timeView = document.getElementById('cal-time-view');

    if (tab === 'date') {
      tabDate?.classList.add('active');
      tabTime?.classList.remove('active');
      if (dateView) dateView.style.display = 'block';
      if (timeView) timeView.style.display = 'none';
    } else {
      tabDate?.classList.remove('active');
      tabTime?.classList.add('active');
      if (dateView) dateView.style.display = 'none';
      if (timeView) timeView.style.display = 'flex';
      this.updateTimeView();
    }
  },

  updateTopBarDisplays() {
    const d = this.selectedDate;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();

    const dateTextEl = document.getElementById('cal-top-date-text');
    const timeTextEl = document.getElementById('cal-top-time-text');

    if (this.mode === 'month') {
      if (dateTextEl) dateTextEl.textContent = `Tháng ${mm}/${yyyy}`;
    } else {
      if (dateTextEl) dateTextEl.textContent = `${dd}/${mm}/${yyyy}`;
    }

    if (timeTextEl) timeTextEl.textContent = this.selectedTime;
  },

  renderCalendar() {
    const pillText = document.getElementById('cal-month-pill-text');
    if (pillText) {
      pillText.textContent = `Tháng ${this.viewMonth + 1}/${this.viewYear}`;
    }

    const grid = document.getElementById('cal-days-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const firstDay = new Date(this.viewYear, this.viewMonth, 1);
    // In Vietnam: Monday is 0, Sunday is 6
    const firstDayWeekday = (firstDay.getDay() + 6) % 7;
    const daysInCurrentMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(this.viewYear, this.viewMonth, 0).getDate();

    const today = new Date();
    const isCurrentMonthToday = today.getFullYear() === this.viewYear && today.getMonth() === this.viewMonth;
    const todayDateNum = today.getDate();

    const isSelectedMonth = this.selectedDate.getFullYear() === this.viewYear && this.selectedDate.getMonth() === this.viewMonth;
    const selectedDateNum = this.selectedDate.getDate();

    // 1. Previous Month Overflow Days
    for (let i = firstDayWeekday - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'custom-cal-day other-month';
      cell.textContent = dayNum;
      cell.onclick = () => {
        this.changeMonth(-1);
        this.selectDay(dayNum, this.viewMonth, this.viewYear);
      };
      grid.appendChild(cell);
    }

    // 2. Current Month Days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'custom-cal-day current-month';
      cell.textContent = d;

      if (isCurrentMonthToday && d === todayDateNum) {
        cell.classList.add('today');
      }

      if (isSelectedMonth && d === selectedDateNum) {
        cell.classList.add('selected');
      }

      cell.onclick = () => {
        this.selectDay(d, this.viewMonth, this.viewYear);
      };

      grid.appendChild(cell);
    }

    // 3. Next Month Overflow Days (Fill up to 42 cells total for consistent height)
    const totalCells = firstDayWeekday + daysInCurrentMonth;
    const remaining = 42 - totalCells;
    for (let n = 1; n <= remaining; n++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'custom-cal-day other-month';
      cell.textContent = n;
      cell.onclick = () => {
        this.changeMonth(1);
        this.selectDay(n, this.viewMonth, this.viewYear);
      };
      grid.appendChild(cell);
    }
  },

  selectDay(day, month, year) {
    this.selectedDate = new Date(year, month, day);
    this.updateTopBarDisplays();
    this.renderCalendar();
  },

  changeMonth(delta) {
    this.viewMonth += delta;
    if (this.viewMonth > 11) {
      this.viewMonth = 0;
      this.viewYear += 1;
    } else if (this.viewMonth < 0) {
      this.viewMonth = 11;
      this.viewYear -= 1;
    }
    this.renderCalendar();
    this.renderMonthSelector();
  },

  toggleMonthSelector() {
    if (this.isMonthPickerOpen) {
      this.closeMonthSelector();
    } else {
      this.openMonthSelector();
    }
  },

  openMonthSelector() {
    this.isMonthPickerOpen = true;
    const selector = document.getElementById('cal-month-selector');
    const weekdays = document.querySelector('.custom-cal-weekdays');
    const daysGrid = document.getElementById('cal-days-grid');
    if (selector) selector.style.display = 'block';
    if (weekdays) weekdays.style.display = 'none';
    if (daysGrid) daysGrid.style.display = 'none';
    this.renderMonthSelector();
  },

  closeMonthSelector() {
    this.isMonthPickerOpen = false;
    const selector = document.getElementById('cal-month-selector');
    const weekdays = document.querySelector('.custom-cal-weekdays');
    const daysGrid = document.getElementById('cal-days-grid');
    if (selector) selector.style.display = 'none';
    if (weekdays) weekdays.style.display = 'grid';
    if (daysGrid) daysGrid.style.display = 'grid';
  },

  changeYear(delta) {
    this.viewYear += delta;
    this.renderMonthSelector();
    this.renderCalendar();
  },

  renderMonthSelector() {
    const yearTitle = document.getElementById('cal-year-title');
    if (yearTitle) yearTitle.textContent = this.viewYear;

    const grid = document.getElementById('cal-months-grid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let m = 0; m < 12; m++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'custom-cal-month-item';
      btn.textContent = `Thg ${m + 1}`;

      if (m === this.viewMonth) {
        btn.classList.add('selected');
      }

      btn.onclick = () => {
        this.viewMonth = m;
        // Also update selected date's month and year
        const currentDay = this.selectedDate.getDate();
        const maxDay = new Date(this.viewYear, m + 1, 0).getDate();
        this.selectedDate = new Date(this.viewYear, m, Math.min(currentDay, maxDay));
        this.updateTopBarDisplays();
        this.closeMonthSelector();
        this.renderCalendar();
        if (this.mode === 'month') {
          this.confirmSelection();
        }
      };
      grid.appendChild(btn);
    }
  },

  /* ==================== TIME PICKER LOGIC ==================== */
  updateTimeView() {
    const [hh, mm] = this.selectedTime.split(':');
    const hourEl = document.getElementById('cal-hour-val');
    const minEl = document.getElementById('cal-min-val');
    if (hourEl) hourEl.textContent = hh;
    if (minEl) minEl.textContent = mm;

    // Highlight in lists
    document.querySelectorAll('#cal-hours-list .custom-cal-time-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === hh);
      if (btn.dataset.val === hh) {
        btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
    document.querySelectorAll('#cal-mins-list .custom-cal-time-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === mm);
      if (btn.dataset.val === mm) {
        btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  },

  selectHour(hh) {
    const [, mm] = this.selectedTime.split(':');
    this.selectedTime = `${hh}:${mm}`;
    this.updateTopBarDisplays();
    this.updateTimeView();
  },

  selectMinute(mm) {
    const [hh] = this.selectedTime.split(':');
    this.selectedTime = `${hh}:${mm}`;
    this.updateTopBarDisplays();
    this.updateTimeView();
  },

  setTimeNow() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    this.selectedTime = `${hh}:${mm}`;
    this.updateTopBarDisplays();
    this.updateTimeView();
  },

  adjustMinutes(delta) {
    const [hh, mm] = this.selectedTime.split(':').map(Number);
    let totalMins = hh * 60 + mm + delta;
    if (totalMins < 0) totalMins += 24 * 60;
    totalMins = totalMins % (24 * 60);

    const newH = String(Math.floor(totalMins / 60)).padStart(2, '0');
    const newM = String(totalMins % 60).padStart(2, '0');
    this.selectedTime = `${newH}:${newM}`;
    this.updateTopBarDisplays();
    this.updateTimeView();
  },

  /* ==================== ACTIONS ==================== */
  selectToday() {
    const now = new Date();
    this.selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    this.viewYear = now.getFullYear();
    this.viewMonth = now.getMonth();

    if (this.mode === 'datetime') {
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      this.selectedTime = `${hh}:${mm}`;
    }

    this.closeMonthSelector();
    this.updateTopBarDisplays();
    this.renderCalendar();
    if (this.activeTab === 'time') {
      this.updateTimeView();
    }
    // Chỉ cập nhật hiển thị, người dùng bấm "Xong" để xác nhận lưu và đóng
  },

  confirmSelection() {
    const yyyy = this.selectedDate.getFullYear();
    const mm = String(this.selectedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(this.selectedDate.getDate()).padStart(2, '0');

    const dateStr = `${yyyy}-${mm}-${dd}`;
    const monthStr = `${yyyy}-${mm}`;
    const timeStr = this.selectedTime;

    if (typeof this.onSelectCallback === 'function') {
      if (this.mode === 'month') {
        this.onSelectCallback(monthStr);
      } else if (this.mode === 'date') {
        this.onSelectCallback(dateStr);
      } else {
        this.onSelectCallback(dateStr, timeStr);
      }
    }

    this.close();
  }
};

// Expose to window for global access across scripts
if (typeof window !== 'undefined') {
  window.UICalendar = UICalendar;
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => UICalendar.init());
} else {
  UICalendar.init();
}
