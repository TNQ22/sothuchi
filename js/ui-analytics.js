/**
 * SỔ THU CHI - UI ANALYTICS MODULE (CHART.JS)
 * Phân tích trực quan: Cơ cấu chi tiêu, Thu vs Chi theo thời gian
 */

const UIAnalytics = {
  expenseChart: null,
  trendChart: null,
  currentRange: 'month', // 'month' | 'year'

  init() {
    this.bindEvents();
  },

  bindEvents() {
    document.querySelectorAll('.analytics-range-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.analytics-range-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentRange = e.target.dataset.range;
        this.render();
      });
    });
  },

  async render() {
    if (!window.Chart) return;

    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = String(today.getMonth() + 1).padStart(2, '0');
    const lastDayOfMonth = new Date(curYear, today.getMonth() + 1, 0).getDate();
    const thisMonthStart = `${curYear}-${curMonth}-01`;
    const thisMonthEnd = `${curYear}-${curMonth}-${String(lastDayOfMonth).padStart(2, '0')}`;

    // Trend chart bao quát năm hiện tại
    const yearStart = `${curYear}-01-01`;
    const yearEnd = `${curYear}-12-31`;

    const txsAll = await db.transactions
      .where('date')
      .between(yearStart, yearEnd, true, true)
      .and(t => t.isDeleted === 0)
      .toArray();

    // Loại trừ giao dịch của các tài khoản được đánh dấu "Không tính vào báo cáo"
    const excludedAccounts = await db.accounts.filter(a => !!a.excludeFromReport).toArray();
    const excludedAccountIds = new Set(excludedAccounts.map(a => a.id));

    const txs = excludedAccountIds.size > 0
      ? txsAll.filter(t => !excludedAccountIds.has(t.accountId))
      : txsAll;

    const categories = await db.categories.toArray();
    const catMap = new Map(categories.map(c => [c.id, c]));

    // 1. Cơ Cấu Chi Tiêu Tháng Này (Donut Chart + Side Legend theo mẫu IMG_9899)
    const monthExpenseTxs = txs.filter(t => t.type === 'expense' && t.date >= thisMonthStart && t.date <= thisMonthEnd);
    const expenseByCat = {};

    for (const t of monthExpenseTxs) {
      const catName = t.categoryId && catMap.get(t.categoryId) ? catMap.get(t.categoryId).name : 'Khác';
      expenseByCat[catName] = (expenseByCat[catName] || 0) + (t.amount || 0);
    }

    // Sắp xếp các danh mục giảm dần theo số tiền chi
    const sortedCats = Object.entries(expenseByCat)
      .filter(([_, amt]) => amt > 0)
      .sort((a, b) => b[1] - a[1]);

    // Bảng màu sắc tương ứng chuẩn mẫu giao diện (IMG_9899):
    // 1: Vàng cam (#f59e0b)
    // 2: Hồng đỏ (#f43f5e)
    // 3: Xanh ngọc (#10b981)
    // 4: Tím (#8b5cf6)
    // 5: Xanh dương (#0ea5e9)
    // 6: Cam đỏ - Các mục khác (#f97316)
    const DONUT_COLORS = ['#f59e0b', '#f43f5e', '#10b981', '#8b5cf6', '#0ea5e9', '#f97316'];

    let finalLabels = [];
    let finalData = [];
    let finalColors = [];

    if (sortedCats.length <= 5) {
      finalLabels = sortedCats.map(c => c[0]);
      finalData = sortedCats.map(c => c[1]);
      finalColors = sortedCats.map((_, i) => DONUT_COLORS[i % DONUT_COLORS.length]);
    } else {
      // Top 5 danh mục đầu tiên
      const top5 = sortedCats.slice(0, 5);
      finalLabels = top5.map(c => c[0]);
      finalData = top5.map(c => c[1]);
      finalColors = [DONUT_COLORS[0], DONUT_COLORS[1], DONUT_COLORS[2], DONUT_COLORS[3], DONUT_COLORS[4]];

      // Mục thứ 6: "Các mục khác" (gộp tất cả các danh mục còn lại)
      const otherAmount = sortedCats.slice(5).reduce((sum, c) => sum + c[1], 0);
      if (otherAmount > 0) {
        finalLabels.push('Các mục khác');
        finalData.push(otherAmount);
        finalColors.push(DONUT_COLORS[5]);
      }
    }

    this.renderDonutChart(finalLabels, finalData, finalColors);

    // 2. Income vs Expense Trend
    this.renderTrendChart(txs);
  },

  renderDonutChart(labels, data, colors) {
    const canvas = document.getElementById('chart-expense-categories');
    if (!canvas) return;

    if (this.expenseChart) {
      this.expenseChart.destroy();
      this.expenseChart = null;
    }

    const legendContainer = document.getElementById('chart-expense-legend');
    const total = data.reduce((a, b) => a + b, 0);

    if (labels.length === 0 || total === 0) {
      this.expenseChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: ['Chưa có chi tiêu'],
          datasets: [{
            data: [1],
            backgroundColor: ['rgba(255, 255, 255, 0.08)'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          }
        }
      });

      if (legendContainer) {
        legendContainer.innerHTML = `
          <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 24px 8px; font-style: italic;">
            Chưa có chi tiêu tháng này
          </div>
        `;
      }
      return;
    }

    const cardBg = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#ffffff';

    this.expenseChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderWidth: 2.5,
          borderColor: cardBg,
          hoverBorderColor: cardBg,
          hoverOffset: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        rotation: -90,
        plugins: {
          legend: {
            display: false // Sử dụng legend tùy chỉnh bên cạnh
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            titleColor: '#f8fafc',
            bodyColor: '#f8fafc',
            padding: 10,
            cornerRadius: 8,
            boxPadding: 4,
            callbacks: {
              label: function(context) {
                const val = context.raw || 0;
                const pct = total > 0 ? parseFloat(((val / total) * 100).toFixed(2)).toLocaleString('vi-VN') + '%' : '0%';
                return ` ${context.label}: ${new Intl.NumberFormat('vi-VN').format(val)}₫ (${pct})`;
              }
            }
          }
        }
      }
    });

    if (legendContainer) {
      let legendHtml = '';
      labels.forEach((name, idx) => {
        const val = data[idx];
        const color = colors[idx];
        const pct = total > 0 ? (val / total) * 100 : 0;
        const pctFormatted = parseFloat(pct.toFixed(2)).toLocaleString('vi-VN') + '%';
        const formattedMoney = new Intl.NumberFormat('vi-VN').format(val) + '₫';

        legendHtml += `
          <div class="expense-legend-row" data-index="${idx}" title="${name}: ${formattedMoney} (${pctFormatted})">
            <div class="expense-legend-left">
              <span class="expense-legend-dot" style="background-color: ${color};"></span>
              <span class="expense-legend-name">${name}</span>
            </div>
            <span class="expense-legend-pct">${pctFormatted}</span>
          </div>
        `;
      });
      legendContainer.innerHTML = legendHtml;

      // Tương tác hover qua lại giữa danh sách nhãn và biểu đồ
      legendContainer.querySelectorAll('.expense-legend-row').forEach(row => {
        const idx = Number(row.dataset.index);
        row.addEventListener('mouseenter', () => {
          if (this.expenseChart) {
            this.expenseChart.setActiveElements([{ datasetIndex: 0, index: idx }]);
            this.expenseChart.render();
          }
        });
        row.addEventListener('mouseleave', () => {
          if (this.expenseChart) {
            this.expenseChart.setActiveElements([]);
            this.expenseChart.render();
          }
        });
      });
    }
  },

  renderTrendChart(txs) {
    const canvas = document.getElementById('chart-income-expense-trend');
    if (!canvas) return;

    if (this.trendChart) {
      this.trendChart.destroy();
    }

    // Group by month or day
    const months = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
    const incomeData = new Array(12).fill(0);
    const expenseData = new Array(12).fill(0);

    for (const t of txs) {
      const d = new Date(t.date);
      const m = d.getMonth();
      if (t.type === 'income') incomeData[m] += t.amount;
      if (t.type === 'expense') expenseData[m] += t.amount;
    }

    this.trendChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          {
            label: 'Thu nhập',
            data: incomeData,
            backgroundColor: '#10b981',
            borderRadius: 6
          },
          {
            label: 'Chi tiêu',
            data: expenseData,
            backgroundColor: '#f43f5e',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: 'rgba(255, 255, 255, 0.6)' }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: 'rgba(255, 255, 255, 0.6)',
              callback: function(value) {
                return (value >= 1000000 ? `${value / 1000000}M` : `${value / 1000}k`);
              }
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: 'rgba(255, 255, 255, 0.75)', boxWidth: 12 }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const val = context.raw || 0;
                return ` ${context.dataset.label}: ${new Intl.NumberFormat('vi-VN').format(val)}đ`;
              }
            }
          }
        }
      }
    });
  }
};

window.UIAnalytics = UIAnalytics;
