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
  showFilterModes: false,
  filterMode: 'month', // 'month' | 'day' | 'custom' | 'all'
  customStartDate: null, // Date object
  customEndDate: null,   // Date object
  customPickingTarget: null, // 'start' | 'end' | null
  customSelectionPhase: 'idle', // 'idle' | 'selecting_end' | 'manual_start' | 'manual_end'
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
        <!-- Filter Modes (Theo Tháng / Theo Ngày / Ngày tuỳ chỉnh / Tất cả) -->
        <div class="custom-cal-filter-modes" id="cal-filter-modes" style="display: none;">
          <button type="button" class="cal-filter-mode-btn" data-mode="month" onclick="UICalendar.selectFilterMode('month')">Theo Tháng</button>
          <button type="button" class="cal-filter-mode-btn" data-mode="day" onclick="UICalendar.selectFilterMode('day')">Theo Ngày</button>
          <button type="button" class="cal-filter-mode-btn" data-mode="custom" onclick="UICalendar.selectFilterMode('custom')">Ngày tuỳ chỉnh</button>
          <button type="button" class="cal-filter-mode-btn" data-mode="all" onclick="UICalendar.selectFilterMode('all')">Tất cả</button>
        </div>

        <!-- Custom Range Bar: Cho phép chọn Từ ngày -> Đến ngày khi ở chế độ 'custom' -->
        <div class="cal-custom-range-bar" id="cal-custom-range-bar" style="display: none;">
          <div class="cal-range-field active" id="cal-range-start-field" onclick="UICalendar.setCustomPickingTarget('start')">
            <span class="cal-range-sublabel">Từ ngày</span>
            <span class="cal-range-val" id="cal-range-start-text">01/10/2026</span>
          </div>
          <div class="cal-range-arrow">
            <i data-lucide="arrow-right" style="width: 16px; height: 16px;"></i>
          </div>
          <div class="cal-range-field" id="cal-range-end-field" onclick="UICalendar.setCustomPickingTarget('end')">
            <span class="cal-range-sublabel">Đến ngày</span>
            <span class="cal-range-val" id="cal-range-end-text">09/10/2026</span>
          </div>
        </div>

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
  parseDateHelper(val) {
    if (!val) return new Date();
    if (val instanceof Date) return new Date(val.getFullYear(), val.getMonth(), val.getDate());
    const str = String(val).trim();
    if (str.includes('/')) {
      const parts = str.split('/').map(Number);
      if (parts.length === 3 && !isNaN(parts[0])) return new Date(parts[2], parts[1] - 1, parts[0]);
    } else if (str.includes('-')) {
      const parts = str.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0])) return new Date(parts[0], parts[1] - 1, parts[2]);
      if (parts.length === 2 && !isNaN(parts[0])) return new Date(parts[0], parts[1] - 1, 1);
    }
    return new Date();
  },

  setCustomPickingTarget(target) {
    this.customPickingTarget = target;
    if (target === 'start') {
      this.customSelectionPhase = 'manual_start';
    } else if (target === 'end') {
      this.customSelectionPhase = 'manual_end';
    } else {
      this.customSelectionPhase = 'idle';
    }
    const startField = document.getElementById('cal-range-start-field');
    const endField = document.getElementById('cal-range-end-field');
    if (startField) startField.classList.toggle('active', target === 'start');
    if (endField) endField.classList.toggle('active', target === 'end');
  },

  updateCustomRangeDisplay() {
    const startText = document.getElementById('cal-range-start-text');
    const endText = document.getElementById('cal-range-end-text');
    if (startText && this.customStartDate) {
      const dd = String(this.customStartDate.getDate()).padStart(2, '0');
      const mm = String(this.customStartDate.getMonth() + 1).padStart(2, '0');
      const yyyy = this.customStartDate.getFullYear();
      startText.textContent = `${dd}/${mm}/${yyyy}`;
    }
    if (endText && this.customEndDate) {
      const dd = String(this.customEndDate.getDate()).padStart(2, '0');
      const mm = String(this.customEndDate.getMonth() + 1).padStart(2, '0');
      const yyyy = this.customEndDate.getFullYear();
      endText.textContent = `${dd}/${mm}/${yyyy}`;
    }
    const startField = document.getElementById('cal-range-start-field');
    const endField = document.getElementById('cal-range-end-field');
    if (startField) startField.classList.toggle('active', this.customPickingTarget === 'start');
    if (endField) endField.classList.toggle('active', this.customPickingTarget === 'end');
    if (window.lucide) lucide.createIcons();
  },

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

    this.showFilterModes = !!options.showFilterModes;
    this.filterMode = options.filterMode || 'month';

    if (options.customStartDate) {
      this.customStartDate = this.parseDateHelper(options.customStartDate);
    } else if (!this.customStartDate) {
      const now = new Date();
      this.customStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    if (options.customEndDate) {
      this.customEndDate = this.parseDateHelper(options.customEndDate);
    } else if (!this.customEndDate) {
      const now = new Date();
      this.customEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    this.customSelectionPhase = 'idle';
    this.customPickingTarget = null;

    const filterModesEl = document.getElementById('cal-filter-modes');
    const rangeBarEl = document.getElementById('cal-custom-range-bar');

    if (filterModesEl) {
      filterModesEl.style.display = this.showFilterModes ? 'grid' : 'none';
      if (this.showFilterModes) {
        document.querySelectorAll('.cal-filter-mode-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.mode === this.filterMode);
        });
      }
    }

    if (this.showFilterModes) {
      if (this.filterMode === 'month') {
        this.mode = 'month';
      } else if (this.filterMode === 'day') {
        this.mode = 'date';
      } else if (this.filterMode === 'custom') {
        this.mode = 'custom';
      } else {
        this.mode = 'all';
      }
      if (rangeBarEl) {
        rangeBarEl.style.display = this.filterMode === 'custom' ? 'flex' : 'none';
        if (this.filterMode === 'custom') this.updateCustomRangeDisplay();
      }
    } else {
      if (rangeBarEl) rangeBarEl.style.display = 'none';
    }

    // Adjust Top Bar visibility depending on mode
    const divider = document.getElementById('cal-top-divider');
    const tabTime = document.getElementById('cal-top-time');
    const tabDate = document.getElementById('cal-top-date');
    const btnToday = document.getElementById('cal-btn-today');

    const topBarEl = document.getElementById('cal-topbar');
    if (this.showFilterModes) {
      if (topBarEl) topBarEl.style.display = 'none';
      if (btnToday) btnToday.textContent = this.filterMode === 'month' ? 'Tháng này' : 'Hôm nay';
    } else {
      if (topBarEl) topBarEl.style.display = 'flex';
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

      const isCustom = this.showFilterModes && this.filterMode === 'custom';
      if (isCustom && this.customStartDate && this.customEndDate) {
        const cellTime = new Date(this.viewYear, this.viewMonth, d).getTime();
        const sTime = new Date(this.customStartDate.getFullYear(), this.customStartDate.getMonth(), this.customStartDate.getDate()).getTime();
        const eTime = new Date(this.customEndDate.getFullYear(), this.customEndDate.getMonth(), this.customEndDate.getDate()).getTime();
        const minT = Math.min(sTime, eTime);
        const maxT = Math.max(sTime, eTime);

        if (cellTime === minT && cellTime === maxT) {
          cell.classList.add('selected', 'range-start', 'range-end');
        } else if (cellTime === minT) {
          cell.classList.add('selected', 'range-start');
        } else if (cellTime === maxT) {
          cell.classList.add('selected', 'range-end');
        } else if (cellTime > minT && cellTime < maxT) {
          cell.classList.add('range-in-between');
        }
      } else {
        if (isSelectedMonth && d === selectedDateNum) {
          cell.classList.add('selected');
        }
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
    const clicked = new Date(year, month, day, 0, 0, 0, 0);

    if (this.showFilterModes && this.filterMode === 'custom') {
      const clickedTime = clicked.getTime();

      // Trường hợp 1: Người dùng chủ động bấm vào ô [Từ ngày] trên thanh range bar
      if (this.customSelectionPhase === 'manual_start') {
        const endTime = this.customEndDate ? new Date(this.customEndDate.getFullYear(), this.customEndDate.getMonth(), this.customEndDate.getDate()).getTime() : clickedTime;
        if (clickedTime <= endTime) {
          this.customStartDate = clicked;
        } else {
          this.customStartDate = clicked;
          this.customEndDate = new Date(clicked);
        }
        this.customSelectionPhase = 'idle';
        this.customPickingTarget = null;
      }
      // Trường hợp 2: Người dùng chủ động bấm vào ô [Đến ngày] trên thanh range bar
      else if (this.customSelectionPhase === 'manual_end') {
        const startTime = this.customStartDate ? new Date(this.customStartDate.getFullYear(), this.customStartDate.getMonth(), this.customStartDate.getDate()).getTime() : clickedTime;
        if (clickedTime >= startTime) {
          this.customEndDate = clicked;
        } else {
          this.customStartDate = clicked;
          this.customEndDate = new Date(clicked);
        }
        this.customSelectionPhase = 'idle';
        this.customPickingTarget = null;
      }
      // Trường hợp 3: Đang trong chu kỳ 2 chạm - chờ chạm ngày kết thúc
      else if (this.customSelectionPhase === 'selecting_end') {
        const startTime = new Date(this.customStartDate.getFullYear(), this.customStartDate.getMonth(), this.customStartDate.getDate()).getTime();
        if (clickedTime >= startTime) {
          // Hoàn tất dải chọn: từ Start -> Đến End
          this.customEndDate = clicked;
          this.customSelectionPhase = 'idle';
          this.customPickingTarget = null;
        } else {
          // Bấm ngày trước ngày bắt đầu: Tự động đổi ngày này thành Ngày bắt đầu mới!
          this.customStartDate = clicked;
          this.customEndDate = new Date(clicked);
          this.customSelectionPhase = 'selecting_end';
          this.customPickingTarget = 'end';
        }
      }
      // Trường hợp 4: Bắt đầu chu kỳ chọn dải mới (Chạm lần 1)
      else {
        this.customStartDate = clicked;
        this.customEndDate = new Date(clicked);
        this.customSelectionPhase = 'selecting_end';
        this.customPickingTarget = 'end';
      }

      this.updateCustomRangeDisplay();
      this.renderCalendar();
      return;
    }

    this.selectedDate = clicked;
    this.updateTopBarDisplays();
    this.renderCalendar();
    if (this.showFilterModes && this.filterMode === 'day') {
      this.confirmSelection();
    }
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

  /* ==================== FILTER MODES SWITCHER ==================== */
  selectFilterMode(mode) {
    if (mode === 'all') {
      this.filterMode = 'all';
      if (typeof this.onSelectCallback === 'function') {
        this.onSelectCallback({ mode: 'all' });
      }
      this.close();
      return;
    }

    this.filterMode = mode;

    document.querySelectorAll('.cal-filter-mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });

    const rangeBar = document.getElementById('cal-custom-range-bar');
    const topBarEl = document.getElementById('cal-topbar');
    const btnToday = document.getElementById('cal-btn-today');
    const btnDone = document.getElementById('cal-btn-done');

    if (mode === 'month') {
      this.mode = 'month';
      if (rangeBar) rangeBar.style.display = 'none';
      if (topBarEl) topBarEl.style.display = 'none';
      if (btnToday) {
        btnToday.style.display = 'block';
        btnToday.textContent = 'Tháng này';
      }
      if (btnDone) btnDone.textContent = 'Xong';
      this.openMonthSelector();
    } else if (mode === 'day') {
      this.mode = 'date';
      if (rangeBar) rangeBar.style.display = 'none';
      if (topBarEl) topBarEl.style.display = 'none';
      if (btnToday) {
        btnToday.style.display = 'block';
        btnToday.textContent = 'Hôm nay';
      }
      if (btnDone) btnDone.textContent = 'Xong';
      this.closeMonthSelector();
      this.renderCalendar();
    } else if (mode === 'custom') {
      this.mode = 'custom';
      if (rangeBar) rangeBar.style.display = 'flex';
      if (topBarEl) topBarEl.style.display = 'none';
      if (btnToday) {
        btnToday.style.display = 'block';
        btnToday.textContent = 'Tháng này';
      }
      if (btnDone) btnDone.textContent = 'Áp dụng';
      this.closeMonthSelector();
      this.customSelectionPhase = 'idle';
      this.customPickingTarget = null;
      this.updateCustomRangeDisplay();
      this.renderCalendar();
    }
  },

  /* ==================== ACTIONS ==================== */
  selectToday() {
    if (this.showFilterModes) {
      if (this.filterMode === 'month') {
        const now = new Date();
        this.viewYear = now.getFullYear();
        this.viewMonth = now.getMonth();
        this.selectedDate = new Date(now.getFullYear(), now.getMonth(), 1);
        this.renderMonthSelector();
        this.confirmSelection();
        return;
      }
      if (this.filterMode === 'custom') {
        const now = new Date();
        this.customStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
        this.customEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        this.viewYear = now.getFullYear();
        this.viewMonth = now.getMonth();
        this.customSelectionPhase = 'idle';
        this.customPickingTarget = null;
        this.updateCustomRangeDisplay();
        this.renderCalendar();
        return;
      }
    }
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
    if (this.showFilterModes && this.filterMode === 'custom') {
      const formatDateStr = (dt) => {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };
      const s = this.customStartDate || new Date();
      const e = this.customEndDate || new Date();
      const sTime = s.getTime();
      const eTime = e.getTime();
      const startStr = formatDateStr(sTime <= eTime ? s : e);
      const endStr = formatDateStr(sTime <= eTime ? e : s);

      if (typeof this.onSelectCallback === 'function') {
        this.onSelectCallback({
          mode: 'custom',
          startDate: startStr,
          endDate: endStr
        });
      }
      this.close();
      return;
    }

    const yyyy = this.selectedDate.getFullYear();
    const mm = String(this.selectedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(this.selectedDate.getDate()).padStart(2, '0');

    const dateStr = `${yyyy}-${mm}-${dd}`;
    const monthStr = `${yyyy}-${mm}`;
    const timeStr = this.selectedTime;

    if (typeof this.onSelectCallback === 'function') {
      if (this.showFilterModes) {
        this.onSelectCallback({
          mode: this.filterMode || this.mode,
          month: monthStr,
          date: dateStr,
          value: this.filterMode === 'day' ? dateStr : monthStr
        });
      } else if (this.mode === 'month') {
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
