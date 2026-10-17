window.TradingCharts = {
  // Store active chart instances for cleanup
  _instances: {},
  
  // Destroy a chart if it exists
  _destroy(id) {
    if (this._instances[id]) {
      this._instances[id].destroy();
      delete this._instances[id];
    }
  },
  
  // Common chart defaults
  _getDefaults() {
    return {
      colors: {
        green: '#22EE77',
        red: '#FF3B5C',
        gray: '#6A856A',
        yellow: '#E6B800',
        textMain: '#F0F5F0',
        textMuted: '#6A856A',
        border: '#1B261B',
        bg: '#060806'
      },
      font: { family: "'Space Mono', monospace", size: 11 }
    };
  },

  _commonOptions() {
    const defaults = this._getDefaults();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800 },
      color: defaults.colors.textMain,
      font: defaults.font,
      plugins: {
        legend: {
          labels: { color: defaults.colors.textMain, font: defaults.font }
        },
        tooltip: {
          backgroundColor: 'rgba(10, 13, 10, 0.9)',
          titleColor: defaults.colors.textMain,
          bodyColor: defaults.colors.textMain,
          borderColor: defaults.colors.border,
          borderWidth: 1,
          titleFont: defaults.font,
          bodyFont: defaults.font,
          cornerRadius: 4,
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { color: defaults.colors.border, drawBorder: false },
          ticks: { color: defaults.colors.textMuted, font: defaults.font }
        },
        y: {
          grid: { color: defaults.colors.border, drawBorder: false },
          ticks: { color: defaults.colors.textMuted, font: defaults.font }
        }
      }
    };
  },
  
  // Equity Curve - Line chart with gradient fill
  renderEquityCurve(canvasId, equityData) {
    this._destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const defaults = this._getDefaults();
    
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 400);
    gradient.addColorStop(0, 'rgba(34, 238, 119, 0.3)');
    gradient.addColorStop(1, 'rgba(34, 238, 119, 0.0)');
    
    const pointColors = equityData.map(d => {
      if (d.result === 'Win') return defaults.colors.green;
      if (d.result === 'Loss') return defaults.colors.red;
      return defaults.colors.gray;
    });

    const options = this._commonOptions();
    options.plugins.tooltip.callbacks = {
      label: (context) => {
        const d = equityData[context.dataIndex];
        return [
          `P&L: $${d.pnl || d.netPnl || 0}`,
          `Cum P&L: $${d.cumPnl}`,
          `Ticker: ${d.ticker}`,
          `Date: ${d.date}`
        ];
      }
    };
    
    options.scales.x.title = { display: true, text: 'Trade #', color: defaults.colors.textMuted, font: defaults.font };
    options.scales.y.title = { display: true, text: 'Cumulative P&L ($)', color: defaults.colors.textMuted, font: defaults.font };

    this._instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: equityData.map(d => d.tradeIndex),
        datasets: [{
          label: 'Equity Curve',
          data: equityData.map(d => d.cumPnl),
          borderColor: defaults.colors.green,
          backgroundColor: gradient,
          borderWidth: 2,
          pointBackgroundColor: pointColors,
          pointBorderColor: defaults.colors.bg,
          pointBorderWidth: 1,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.2
        }]
      },
      options: options
    });
    return this._instances[canvasId];
  },
  
  // Monthly P&L Bars - Bar chart comparing months
  renderMonthlyPnlBars(canvasId, monthlyData) {
    this._destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const defaults = this._getDefaults();
    
    const colors = monthlyData.map(d => d.netPnl >= 0 ? defaults.colors.green : defaults.colors.red);
    
    const options = this._commonOptions();
    options.scales.y.title = { display: true, text: 'Net P&L ($)', color: defaults.colors.textMuted, font: defaults.font };
    options.plugins.legend.display = false;

    this._instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthlyData.map(d => d.label || d.month),
        datasets: [{
          data: monthlyData.map(d => d.netPnl),
          backgroundColor: colors,
          borderRadius: 4
        }]
      },
      options: options
    });
    return this._instances[canvasId];
  },
  
  // Win/Loss/BE Distribution - Doughnut chart
  renderWinLossDistribution(canvasId, stats) {
    this._destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const defaults = this._getDefaults();
    
    const options = this._commonOptions();
    delete options.scales; // No scales for doughnut
    options.plugins.legend.position = 'bottom';
    
    const total = (stats.wins || 0) + (stats.losses || 0) + (stats.breakevens || 0);

    const centerTextPlugin = {
      id: 'centerText',
      beforeDraw: function(chart) {
        if (chart.config.type !== 'doughnut') return;
        const width = chart.width;
        const height = chart.height;
        const ctx = chart.ctx;
            
        ctx.restore();
        const fontSize = (height / 114).toFixed(2);
        ctx.font = fontSize + "em " + defaults.font.family;
        ctx.textBaseline = "middle";
        ctx.fillStyle = defaults.colors.textMain;

        const text = total.toString();
        const textX = Math.round((width - ctx.measureText(text).width) / 2);
        const textY = height / 2;

        ctx.fillText(text, textX, textY - 10);
        
        ctx.font = (fontSize * 0.4).toFixed(2) + "em " + defaults.font.family;
        ctx.fillStyle = defaults.colors.textMuted;
        ctx.fillText("Trades", Math.round((width - ctx.measureText("Trades").width) / 2), textY + 15);
        ctx.save();
      }
    };

    this._instances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Win', 'Loss', 'BE'],
        datasets: [{
          data: [stats.wins || 0, stats.losses || 0, stats.breakevens || 0],
          backgroundColor: [defaults.colors.green, defaults.colors.red, defaults.colors.gray],
          borderWidth: 2,
          borderColor: defaults.colors.bg
        }]
      },
      options: {
        ...options,
        cutout: '75%'
      },
      plugins: [centerTextPlugin]
    });
    return this._instances[canvasId];
  },
  
  // R:R Distribution - Horizontal bar chart of winning trades' R:R values
  renderRRDistribution(canvasId, trades) {
    this._destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const defaults = this._getDefaults();
    
    const sortedTrades = [...trades].sort((a, b) => b.rr - a.rr);
    
    const options = this._commonOptions();
    options.indexAxis = 'y';
    options.plugins.legend.display = false;

    this._instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sortedTrades.map(t => `${t.ticker} +$${(t.pnl || t.netPnl || 0).toFixed(2)}`),
        datasets: [{
          data: sortedTrades.map(t => t.rr),
          backgroundColor: defaults.colors.green,
          borderRadius: 4
        }]
      },
      options: options
    });
    return this._instances[canvasId];
  },
  
  // Asset Performance - Horizontal bar chart
  renderAssetPerformance(canvasId, assetData) {
    this._destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const defaults = this._getDefaults();
    
    const sorted = [...assetData].sort((a, b) => b.netPnl - a.netPnl);
    const colors = sorted.map(d => d.netPnl >= 0 ? defaults.colors.green : defaults.colors.red);
    
    const options = this._commonOptions();
    options.indexAxis = 'y';
    options.plugins.legend.display = false;

    this._instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sorted.map(d => d.ticker),
        datasets: [{
          data: sorted.map(d => d.netPnl),
          backgroundColor: colors,
          borderRadius: 4
        }]
      },
      options: options
    });
    return this._instances[canvasId];
  },
  
  // Monthly Comparison - Grouped bar chart comparing multiple metrics across months
  renderMonthlyComparison(canvasId, compData) {
    this._destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const defaults = this._getDefaults();
    
    const barColors = compData.map(d => d.netPnl >= 0 ? defaults.colors.green : defaults.colors.red);
    
    const options = this._commonOptions();
    options.scales = {
      x: {
        grid: { color: defaults.colors.border, drawBorder: false },
        ticks: { color: defaults.colors.textMuted, font: defaults.font }
      },
      yPnl: {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Net P&L ($)', color: defaults.colors.textMuted, font: defaults.font },
        grid: { color: defaults.colors.border, drawBorder: false },
        ticks: { color: defaults.colors.textMuted, font: defaults.font }
      },
      yWinRate: {
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: 'Win Rate (%)', color: defaults.colors.textMuted, font: defaults.font },
        grid: { drawOnChartArea: false },
        ticks: { color: defaults.colors.textMuted, font: defaults.font }
      }
    };

    const hasBtc = compData.some(d => d.btcReturn != null);
    
    const datasets = [
      {
        label: 'Net P&L ($)',
        type: 'bar',
        data: compData.map(d => d.netPnl),
        backgroundColor: barColors,
        yAxisID: 'yPnl',
        borderRadius: 4
      },
      {
        label: 'Win Rate (%)',
        type: 'line',
        data: compData.map(d => d.winRate),
        borderColor: defaults.colors.yellow,
        backgroundColor: defaults.colors.yellow,
        yAxisID: 'yWinRate',
        tension: 0.2,
        borderWidth: 2,
        pointRadius: 4
      }
    ];

    if (hasBtc) {
      datasets.push({
        label: 'BTC Return (%)',
        type: 'line',
        data: compData.map(d => d.btcReturn != null ? d.btcReturn : null),
        borderColor: '#F7931A', // Bitcoin Orange
        backgroundColor: '#F7931A',
        yAxisID: 'yWinRate',
        borderDash: [5, 5],
        tension: 0.2,
        borderWidth: 2,
        pointRadius: 4
      });
      if (compData.some(d => d.traderReturn != null)) {
        datasets.push({
          label: 'Трейдер (%)',
          type: 'line',
          data: compData.map(d => d.traderReturn != null ? d.traderReturn : null),
          borderColor: defaults.colors.green,
          backgroundColor: defaults.colors.green,
          yAxisID: 'yWinRate',
          tension: 0.2,
          borderWidth: 2,
          pointRadius: 4
        });
      }
    }

    this._instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: compData.map(d => d.label),
        datasets: datasets
      },
      options: options
    });
    return this._instances[canvasId];
  },
  
  // Risk Size Performance - Bar chart by risk % categories
  renderRiskPerformance(canvasId, riskData) {
    this._destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const defaults = this._getDefaults();
    
    const options = this._commonOptions();
    options.scales.yPnl = {
      type: 'linear',
      position: 'left',
      grid: { color: defaults.colors.border },
      ticks: { color: defaults.colors.textMuted, font: defaults.font },
      title: { display: true, text: 'Net P&L ($)', color: defaults.colors.textMuted, font: defaults.font }
    };
    options.scales.yTrades = {
      type: 'linear',
      position: 'right',
      grid: { drawOnChartArea: false },
      ticks: { color: defaults.colors.textMuted, font: defaults.font },
      title: { display: true, text: 'Trades Count', color: defaults.colors.textMuted, font: defaults.font }
    };
    delete options.scales.y;

    const barColors = riskData.map(d => d.netPnl >= 0 ? defaults.colors.green : defaults.colors.red);

    this._instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: riskData.map(d => d.riskPct),
        datasets: [
          {
            label: 'Net P&L',
            data: riskData.map(d => d.netPnl),
            backgroundColor: barColors,
            yAxisID: 'yPnl',
            borderRadius: 4
          },
          {
            label: 'Trades Count',
            data: riskData.map(d => d.trades),
            backgroundColor: defaults.colors.gray,
            yAxisID: 'yTrades',
            borderRadius: 4
          }
        ]
      },
      options: options
    });
    return this._instances[canvasId];
  },
  
  // Day of Week Performance - Bar chart
  renderDayOfWeek(canvasId, dayData) {
    this._destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const defaults = this._getDefaults();
    
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = days.map(day => dayData[day] ? dayData[day].netPnl : 0);
    const colors = data.map(val => val >= 0 ? defaults.colors.green : defaults.colors.red);
    
    const options = this._commonOptions();
    options.plugins.legend.display = false;
    options.scales.y.title = { display: true, text: 'Net P&L ($)', color: defaults.colors.textMuted, font: defaults.font };

    this._instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderRadius: 4
        }]
      },
      options: options
    });
    return this._instances[canvasId];
  },
  
  // Drawdown Chart - Area chart showing drawdown over time
  renderDrawdownChart(canvasId, equityData) {
    this._destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const defaults = this._getDefaults();
    
    let peak = -Infinity;
    const drawdowns = equityData.map(d => {
      if (d.cumPnl > peak) peak = d.cumPnl;
      return d.cumPnl - peak;
    });

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 400);
    gradient.addColorStop(0, 'rgba(255, 59, 92, 0.0)');
    gradient.addColorStop(1, 'rgba(255, 59, 92, 0.3)');

    const options = this._commonOptions();
    options.scales.x.title = { display: true, text: 'Trade #', color: defaults.colors.textMuted, font: defaults.font };
    options.scales.y.title = { display: true, text: 'Drawdown ($)', color: defaults.colors.textMuted, font: defaults.font };

    this._instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: equityData.map(d => d.tradeIndex),
        datasets: [{
          label: 'Drawdown',
          data: drawdowns,
          borderColor: defaults.colors.red,
          backgroundColor: gradient,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          tension: 0.2
        }]
      },
      options: options
    });
    return this._instances[canvasId];
  },
  
  // Destroy all charts
  destroyAll() {
    Object.keys(this._instances).forEach(id => this._destroy(id));
  }
};
