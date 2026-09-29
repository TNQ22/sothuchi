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
    let startDate, endDate;

    if (this.currentRange === 'month') {
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      startDate = `${year}-${month}-01`;
      endDate = `${year}-${month}-31`;
    } else {
      const year = today.getFullYear();
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
    }

    const txsAll = await db.transactions
      .where('date')
      .between(startDate, endDate, true, true)
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

    // 1. Expense Breakdown by Category
    const expenseByCat = {};
    const expenseTxs = txs.filter(t => t.type === 'expense');

    for (const t of expenseTxs) {
      const catName = t.categoryId && catMap.get(t.categoryId) ? catMap.get(t.categoryId).name : 'Khác';
      expenseByCat[catName] = (expenseByCat[catName] || 0) + t.amount;
    }

    const donutLabels = Object.keys(expenseByCat);
    const donutData = Object.values(expenseByCat);
    const donutColors = [
      '#f43f5e', '#fb7185', '#f59e0b', '#eab308', 
      '#ec4899', '#8b5cf6', '#10b981', '#06b6d4', 
      '#3b82f6', '#6366f1', '#64748b'
    ];

    this.renderDonutChart(donutLabels, donutData, donutColors);

    // 2. Income vs Expense Trend
    this.renderTrendChart(txs);
  },

  renderDonutChart(labels, data, colors) {
    const canvas = document.getElementById('chart-expense-categories');
    if (!canvas) return;

    if (this.expenseChart) {
      this.expenseChart.destroy();
    }

    if (labels.length === 0) {
      labels = ['Chưa có chi tiêu'];
      data = [1];
      colors = ['rgba(255, 255, 255, 0.1)'];
    }

    this.expenseChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: 'var(--bg-card)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: 'rgba(255, 255, 255, 0.75)',
              boxWidth: 12,
              padding: 14,
              font: { size: 11 }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const val = context.raw || 0;
                return ` ${context.label}: ${new Intl.NumberFormat('vi-VN').format(val)}đ`;
              }
            }
          }
        }
      }
    });
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
