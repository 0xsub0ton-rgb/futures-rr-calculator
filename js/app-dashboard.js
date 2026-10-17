document.addEventListener('DOMContentLoaded', async () => {
  let globalTrades = [];
  let globalBalances = {};
  
  // Formatters
  const formatUsd = (val) => {
    const isNeg = val < 0;
    const v = Math.abs(val).toFixed(2);
    const text = (isNeg ? '-$' : '$') + v;
    const colorClass = isNeg ? 'red' : (val > 0 ? 'green' : '');
    return { text, colorClass };
  };
  
  const formatPct = (val) => {
    return val.toFixed(2) + '%';
  };
  
  const getBadgeClass = (result) => {
    if (result === 'win') return 'badge-win';
    if (result === 'loss') return 'badge-loss';
    return 'badge-be';
  };
  
  const getResultText = (result) => {
    if (result === 'win') return 'WIN';
    if (result === 'loss') return 'LOSS';
    return 'BE';
  };
  
  // KPI Cards Generator
  function createKPICards(stats, containerIdOrUpdateIds, options = {}) {
    const data = [
      { label: 'Чистая Прибыль (Net P&L)', val: formatUsd(stats.netPnl), sub: stats.totalTrades + ' сделок' },
      { label: 'Винрейт (Win Rate)', val: { text: formatPct(stats.winRate), colorClass: stats.winRate > 50 ? 'green' : 'red' }, sub: 'Win/Loss/BE: ' + stats.wins + '/' + stats.losses + '/' + stats.breakevens },
      { label: 'Профит Фактор (Profit Factor)', val: { text: stats.profitFactor.toFixed(2), colorClass: stats.profitFactor > 1.5 ? 'green' : (stats.profitFactor > 1 ? 'yellow' : 'red') }, sub: 'Gross: ' + formatUsd(stats.grossProfit).text + ' / ' + formatUsd(stats.grossLoss).text },
      { label: 'Ожидание (Expectancy)', val: formatUsd(stats.expectancyUsd), sub: stats.expectancyR.toFixed(2) + ' R на сделку' },
      { label: 'Средний Win', val: { text: formatUsd(stats.avgWin).text, colorClass: 'green' }, sub: 'Max: ' + (stats.bestTrade ? formatUsd(stats.bestTrade.pnl).text : '$0') },
      { label: 'Средний Loss', val: { text: formatUsd(stats.avgLoss).text, colorClass: 'red' }, sub: 'Min: ' + (stats.worstTrade ? formatUsd(stats.worstTrade.pnl).text : '$0') },
      { label: 'W/L Соотношение', val: { text: stats.avgWinLossRatio.toFixed(2), colorClass: stats.avgWinLossRatio >= 2 ? 'green' : '' }, sub: 'Целевое: > 2.0' },
      { label: 'Макс. Просадка (Max DD)', val: { text: formatUsd(-stats.maxDrawdown).text, colorClass: 'red' }, sub: formatPct(stats.maxDrawdownPct) }
    ];

    if (options.btcReturn != null && options.traderReturn != null) {
      const alpha = options.traderReturn - options.btcReturn;
      const alphaSign = alpha > 0 ? '+' : '';
      const btcSign = options.btcReturn > 0 ? '+' : '';
      data.push({
        label: 'Бенчмарк BTC',
        val: { text: btcSign + options.btcReturn.toFixed(2) + '%', colorClass: options.btcReturn >= 0 ? 'yellow' : 'red' },
        sub: 'Трейдер: ' + (options.traderReturn >= 0 ? '+' : '') + options.traderReturn.toFixed(2) + '%'
      });
      data.push({
        label: 'Альфа vs BTC (Alpha)',
        val: { text: alphaSign + alpha.toFixed(2) + '%', colorClass: alpha >= 0 ? 'green' : 'red' },
        sub: alpha >= 0 ? '🚀 Опережение рынка' : '⚠️ Отставание от рынка'
      });
    }
    
    if (typeof containerIdOrUpdateIds === 'string') {
      const container = document.getElementById(containerIdOrUpdateIds);
      if (!container) return;
      container.innerHTML = '';
      data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'metric-card';
        div.innerHTML = `
          <span class="metric-title">${item.label}</span>
          <span class="metric-value ${item.val.colorClass}">${item.val.text}</span>
          <span class="metric-sub">${item.sub}</span>
        `;
        container.appendChild(div);
      });
    } else {
      // Update by IDs
      const ids = [
        ['kpi-net-pnl', 'kpi-net-pnl-sub'],
        ['kpi-winrate', 'kpi-winrate-sub'],
        ['kpi-pf', 'kpi-pf-sub'],
        ['kpi-expectancy', 'kpi-expectancy-sub'],
        ['kpi-avg-win', 'kpi-avg-win-sub'],
        ['kpi-avg-loss', 'kpi-avg-loss-sub'],
        ['kpi-wl-ratio', 'kpi-wl-ratio-sub'],
        ['kpi-drawdown', 'kpi-drawdown-sub']
      ];
      data.slice(0, 8).forEach((item, i) => {
        const valEl = document.getElementById(ids[i][0]);
        const subEl = document.getElementById(ids[i][1]);
        if (valEl && subEl) {
          valEl.textContent = item.val.text;
          valEl.className = 'metric-value ' + item.val.colorClass;
          subEl.textContent = item.sub;
        }
      });
    }
  }

  // Create Trade Row
  function createTradeRow(trade, index) {
    const usd = formatUsd(trade.pnl);
    const tr = document.createElement('tr');
    const rrText = trade.rr != null ? trade.rr.toFixed(2) : '—';
    const dirIcon = trade.direction === 'long' ? '🟢' : '🔴';
    
    tr.innerHTML = `
      <td>${index}</td>
      <td>${trade.date}</td>
      <td><strong>${trade.ticker}</strong></td>
      <td>${dirIcon} ${trade.direction.toUpperCase()}</td>
      <td>${trade.risk_pct ? trade.risk_pct + '%' : '—'}</td>
      <td><span class="${getBadgeClass(trade.result)}">${getResultText(trade.result)}</span></td>
      <td class="${usd.colorClass}">${usd.text}</td>
      <td>${rrText}</td>
      <td>${trade.setup || '—'}</td>
      ${trade.timeframe ? `<td>${trade.timeframe}</td>` : ''}
    `;
    return tr;
  }

  // Generate Observations
  function generateObservations(stats) {
    const obs = [];
    if (stats.totalTrades === 0) {
      return [{ type: 'info', title: 'Нет данных', text: 'Недостаточно сделок для анализа.' }];
    }
    
    // Winrate
    if (stats.winRate >= 50) {
      obs.push({ type: 'positive', title: 'Высокий винрейт', text: `Винрейт составляет ${stats.winRate.toFixed(1)}%, что является отличным показателем для удержания роста капитала.` });
    } else if (stats.winRate < 40) {
      obs.push({ type: 'warning', title: 'Низкий винрейт', text: `Винрейт упал до ${stats.winRate.toFixed(1)}%. Проверьте свои сетапы или улучшите R:R.` });
    }
    
    // Profit Factor
    if (stats.profitFactor >= 2) {
      obs.push({ type: 'positive', title: 'Отличный профит фактор', text: `Profit Factor ${stats.profitFactor.toFixed(2)}. Вы зарабатываете в ${stats.profitFactor.toFixed(1)} раз больше, чем теряете.` });
    } else if (stats.profitFactor < 1) {
      obs.push({ type: 'warning', title: 'Отрицательное мат. ожидание', text: `Profit Factor ${stats.profitFactor.toFixed(2)}. Система приносит убытки, пересмотрите риски.` });
    }
    
    // W/L Ratio
    if (stats.avgWinLossRatio > 2) {
      obs.push({ type: 'positive', title: 'Хорошее соотношение W/L', text: `Средняя прибыль в ${stats.avgWinLossRatio.toFixed(1)} раз больше среднего убытка.` });
    }
    
    // Streaks
    if (stats.maxLossStreak >= 5) {
      obs.push({ type: 'warning', title: 'Затяжная просадка', text: `Зафиксирована серия из ${stats.maxLossStreak} убыточных сделок. Рекомендуется снизить риск на сделку.` });
    }
    if (stats.maxWinStreak >= 5) {
      obs.push({ type: 'positive', title: 'Серия прибылей', text: `Максимальная серия побед: ${stats.maxWinStreak} сделок подряд.` });
    }
    
    // Breakevens
    const bePct = (stats.breakevens / stats.totalTrades) * 100;
    if (bePct > 20) {
      obs.push({ type: 'info', title: 'Много сделок в безубыток', text: `${bePct.toFixed(1)}% сделок закрыты в БУ. Возможно, вы слишком рано переводите стоп.` });
    }

    // Benchmark Observation
    if (stats.benchmark) {
      const { btcReturn, traderReturn, alpha } = stats.benchmark;
      if (alpha >= 0) {
        obs.push({ 
          type: 'positive', 
          title: 'Опережение Биткоина (Alpha)', 
          text: `Ваша доходность (+${traderReturn.toFixed(2)}%) опередила движение BTC (+${btcReturn.toFixed(2)}%) на +${alpha.toFixed(2)}%. Отличный результат работы против рынка!` 
        });
      } else {
        obs.push({ 
          type: 'info', 
          title: 'Бенчмарк BTC', 
          text: `BTC вырос на +${btcReturn.toFixed(2)}%, а доходность депозита составила +${traderReturn.toFixed(2)}% (Alpha: ${alpha.toFixed(2)}%). Трейдинг дал стабильный плюс с контролируемым риском без удержания спота.` 
        });
      }
    }
    
    return obs;
  }

  // Load Data
  try {
    const response = await fetch('data/trades.json');
    if (!response.ok) throw new Error('Data not found');
    const data = await response.json();
    globalTrades = data.trades || [];
    globalBalances = data.monthly_balances || {};
  } catch (e) {
    console.warn("Failed to load trades.json, using empty data array.", e);
  }

  // 2. Initialize tab switching
  const tabs = document.querySelectorAll('.tab-btn');
  const panes = document.querySelectorAll('.tab-pane');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Manage Active Classes
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      panes.forEach(p => p.classList.remove('active'));
      
      const targetId = tab.getAttribute('data-target');
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');
      
      // Render Content based on tab
      if (targetId === 'tab-overview') renderOverview();
      else if (targetId === 'tab-monthly') renderMonthlySetup();
      else if (targetId === 'tab-comparison') renderComparison();
      else if (targetId === 'tab-log') renderTradeLog();
      else if (targetId === 'tab-reports') renderReportsSetup();
    });
  });

  // 3. Render Overview
  function renderOverview() {
    if (globalTrades.length === 0) return;
    const stats = TradingStats.calcStats(globalTrades);
    createKPICards(stats, null);
    
    const equity = TradingStats.getEquityCurve(globalTrades);
    TradingCharts.renderEquityCurve('chart-equity', equity);
    
    TradingCharts.renderWinLossDistribution('chart-distribution', stats);
    TradingCharts.renderRRDistribution('chart-rr', globalTrades);
    
    const assetData = TradingStats.getAssetBreakdown(globalTrades);
    TradingCharts.renderAssetPerformance('chart-assets', assetData.slice(0, 10)); // Top 10
    
    // Monthly Pnl
    const months = TradingStats.getAvailableMonths(globalTrades);
    const monthlyData = months.map(m => {
      const t = TradingStats.filterByMonth(globalTrades, m);
      const s = TradingStats.calcStats(t);
      return { month: m, label: TradingStats.getMonthLabel(m), netPnl: s.netPnl };
    });
    TradingCharts.renderMonthlyPnlBars('chart-monthly-pnl', monthlyData);
  }

  // 4. Render Monthly
  let monthlyInitialized = false;
  function renderMonthlySetup() {
    const months = TradingStats.getAvailableMonths(globalTrades);
    const selector = document.getElementById('month-selector');
    
    if (!monthlyInitialized) {
      selector.innerHTML = '';
      months.reverse().forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = TradingStats.getMonthLabel(m);
        selector.appendChild(opt);
      });
      
      selector.addEventListener('change', () => {
        renderMonthly(selector.value);
      });
      monthlyInitialized = true;
    }
    
    if (selector.value) {
      renderMonthly(selector.value);
    }
  }

  function renderMonthly(yearMonth) {
    const monthTrades = TradingStats.filterByMonth(globalTrades, yearMonth);
    const stats = TradingStats.calcStats(monthTrades);
    const startBal = globalBalances[yearMonth] ? globalBalances[yearMonth].starting_balance : 0;
    const btcReturn = TradingStats.getBenchmarkForMonth ? TradingStats.getBenchmarkForMonth(globalBalances, yearMonth) : null;
    let traderReturn = null;
    if (startBal > 0) {
      traderReturn = (stats.netPnl / startBal) * 100;
    }

    if (btcReturn != null && traderReturn != null) {
      stats.benchmark = {
        btcReturn,
        traderReturn,
        alpha: traderReturn - btcReturn
      };
    }
    
    createKPICards(stats, 'monthly-kpis', { btcReturn, traderReturn });
    
    const equity = TradingStats.getEquityCurve(monthTrades);
    TradingCharts.renderEquityCurve('chart-monthly-equity', equity);
    TradingCharts.renderWinLossDistribution('chart-monthly-dist', stats);
    TradingCharts.renderRRDistribution('chart-monthly-rr', monthTrades);
    
    const assetData = TradingStats.getAssetBreakdown(monthTrades);
    TradingCharts.renderAssetPerformance('chart-monthly-assets', assetData.slice(0, 8));
    
    const tbody = document.getElementById('monthly-trade-tbody');
    tbody.innerHTML = '';
    monthTrades.forEach((t, i) => {
      tbody.appendChild(createTradeRow(t, monthTrades.length - i)); // Reverse index
    });
    
    const obsContainer = document.getElementById('monthly-obs-content');
    obsContainer.innerHTML = '';
    const observations = generateObservations(stats);
    observations.forEach(o => {
      const div = document.createElement('div');
      div.className = `obs-item ${o.type}`;
      div.innerHTML = `<div><div class="obs-title">${o.title}</div><div class="obs-text">${o.text}</div></div>`;
      obsContainer.appendChild(div);
    });
  }

  // 5. Render Comparison
  function renderComparison() {
    const months = TradingStats.getAvailableMonths(globalTrades).sort();
    if (months.length === 0) return;
    
    const compData = months.map(m => {
      const t = TradingStats.filterByMonth(globalTrades, m);
      const s = TradingStats.calcStats(t);
      const startBal = globalBalances[m] ? globalBalances[m].starting_balance : 0;
      const traderReturn = startBal > 0 ? (s.netPnl / startBal) * 100 : null;
      const btcReturn = TradingStats.getBenchmarkForMonth ? TradingStats.getBenchmarkForMonth(globalBalances, m) : null;
      const alpha = (traderReturn != null && btcReturn != null) ? (traderReturn - btcReturn) : null;

      return { 
        month: m, 
        label: TradingStats.getMonthLabel(m), 
        netPnl: s.netPnl,
        winRate: s.winRate,
        profitFactor: s.profitFactor,
        trades: s.totalTrades,
        traderReturn,
        btcReturn,
        alpha
      };
    });
    
    if (TradingCharts.renderMonthlyComparison) {
       TradingCharts.renderMonthlyComparison('chart-comparison', compData);
    } else {
       TradingCharts.renderMonthlyPnlBars('chart-comparison', compData);
    }
    
    const theadTr = document.getElementById('comparison-thead-tr');
    theadTr.innerHTML = '<th>Метрика</th>';
    months.forEach(m => {
      const th = document.createElement('th');
      th.textContent = TradingStats.getMonthLabel(m);
      theadTr.appendChild(th);
    });
    
    const tbody = document.getElementById('comparison-tbody');
    tbody.innerHTML = '';
    const metricsToCompare = [
      { key: 'netPnl', label: 'Net P&L', fmt: (v) => formatUsd(v).text, colorFmt: (v) => v > 0 ? 'green' : (v < 0 ? 'red' : '') },
      { key: 'traderReturn', label: 'Доходность Трейдера (%)', fmt: (v) => v != null ? (v >= 0 ? '+' : '') + formatPct(v) : '—', colorFmt: (v) => v != null ? (v > 0 ? 'green' : (v < 0 ? 'red' : '')) : '' },
      { key: 'btcReturn', label: 'Бенчмарк BTC (%)', fmt: (v) => v != null ? (v >= 0 ? '+' : '') + formatPct(v) : '—', colorFmt: (v) => v != null ? (v >= 0 ? 'yellow' : 'red') : '' },
      { key: 'alpha', label: 'Alpha (vs BTC)', fmt: (v) => v != null ? (v >= 0 ? '+' : '') + formatPct(v) : '—', colorFmt: (v) => v != null ? (v >= 0 ? 'green' : 'red') : '' },
      { key: 'winRate', label: 'Win Rate', fmt: (v) => formatPct(v), colorFmt: (v) => v > 50 ? 'green' : 'red' },
      { key: 'profitFactor', label: 'Profit Factor', fmt: (v) => v.toFixed(2), colorFmt: (v) => v > 1.5 ? 'green' : (v < 1 ? 'red' : '') },
      { key: 'trades', label: 'Сделок', fmt: (v) => v, colorFmt: () => '' }
    ];
    
    metricsToCompare.forEach(metric => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${metric.label}</strong></td>`;
      compData.forEach(d => {
        const td = document.createElement('td');
        td.textContent = metric.fmt(d[metric.key]);
        td.className = metric.colorFmt(d[metric.key]);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    
    const dayData = TradingStats.getDayOfWeekAnalysis(globalTrades);
    if (TradingCharts.renderDayOfWeek) TradingCharts.renderDayOfWeek('chart-day-of-week', dayData);
    
    const riskData = TradingStats.getRiskBreakdown(globalTrades);
    if (TradingCharts.renderRiskPerformance) TradingCharts.renderRiskPerformance('chart-risk-perf', riskData);
  }

  // 6. Render Trade Log
  let logInitialized = false;
  function renderTradeLog() {
    const searchInput = document.getElementById('log-search');
    const resultFilter = document.getElementById('log-filter-result');
    const monthFilter = document.getElementById('log-filter-month');
    
    if (!logInitialized) {
      const months = TradingStats.getAvailableMonths(globalTrades);
      months.reverse().forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = TradingStats.getMonthLabel(m);
        monthFilter.appendChild(opt);
      });
      
      const updateLog = () => {
        const s = searchInput.value.toLowerCase();
        const r = resultFilter.value;
        const m = monthFilter.value;
        
        let filtered = globalTrades.filter(t => {
          if (s && !t.ticker.toLowerCase().includes(s)) return false;
          if (r !== 'all' && t.result !== r) return false;
          if (m !== 'all' && !t.date.startsWith(m)) return false;
          return true;
        });
        
        const tbody = document.getElementById('full-log-tbody');
        tbody.innerHTML = '';
        filtered.forEach((t, i) => {
          tbody.appendChild(createTradeRow(t, filtered.length - i));
        });
        
        const summary = document.getElementById('log-summary');
        const fStats = TradingStats.calcStats(filtered);
        summary.innerHTML = `
          <div>Показано сделок: <strong>${fStats.totalTrades}</strong></div>
          <div>Net P&L: <strong class="${fStats.netPnl > 0 ? 'green' : (fStats.netPnl < 0 ? 'red' : '')}">${formatUsd(fStats.netPnl).text}</strong></div>
          <div>Win Rate: <strong>${formatPct(fStats.winRate)}</strong></div>
        `;
      };
      
      searchInput.addEventListener('input', updateLog);
      resultFilter.addEventListener('change', updateLog);
      monthFilter.addEventListener('change', updateLog);
      
      logInitialized = true;
      updateLog();
    }
  }

  // 7. Render Reports
  let reportsInitialized = false;
  function renderReportsSetup() {
    if (!reportsInitialized) {
      const reportBtns = document.querySelectorAll('[data-report]');
      const reportQ = document.getElementById('report-quarterly');
      const reportY = document.getElementById('report-yearly');
      
      reportBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          reportBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          
          if (btn.getAttribute('data-report') === 'quarterly') {
            reportQ.style.display = 'block';
            reportY.style.display = 'none';
          } else {
            reportQ.style.display = 'none';
            reportY.style.display = 'block';
          }
        });
      });
      
      // Populate selectors
      const qSelector = document.getElementById('quarter-selector');
      const quarters = TradingStats.getAvailableQuarters(globalTrades);
      quarters.reverse().forEach(q => {
        const opt = document.createElement('option');
        opt.value = q;
        opt.textContent = TradingStats.getQuarterLabel(q);
        qSelector.appendChild(opt);
      });
      qSelector.addEventListener('change', () => renderQuarterlyReport(qSelector.value));
      
      const ySelector = document.getElementById('year-selector');
      const years = Array.from(new Set(globalTrades.map(t => t.date.split('-')[0]))).sort().reverse();
      years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y + ' Год';
        ySelector.appendChild(opt);
      });
      ySelector.addEventListener('change', () => renderYearlyReport(ySelector.value));
      
      reportsInitialized = true;
      
      if (quarters.length > 0) renderQuarterlyReport(quarters[0]);
      if (years.length > 0) renderYearlyReport(years[0]);
    }
  }

  function renderQuarterlyReport(quarter) {
    const qTrades = TradingStats.filterByQuarter(globalTrades, quarter);
    const stats = TradingStats.calcStats(qTrades);

    // Calculate quarterly compound return for trader and BTC
    const months = Array.from(new Set(qTrades.map(t => t.date.substring(0, 7)))).sort();
    let qTraderReturn = null;
    const monthlyTraderPct = [];
    months.forEach(m => {
      const mTrades = TradingStats.filterByMonth(qTrades, m);
      const s = TradingStats.calcStats(mTrades);
      const bal = globalBalances[m] ? globalBalances[m].starting_balance : 0;
      if (bal > 0) {
        monthlyTraderPct.push((s.netPnl / bal) * 100);
      }
    });
    if (monthlyTraderPct.length > 0) {
      qTraderReturn = TradingStats.getCompoundReturn(monthlyTraderPct);
    }
    const qBtcReturn = TradingStats.getQuarterBenchmark ? TradingStats.getQuarterBenchmark(globalBalances, quarter) : null;

    createKPICards(stats, 'quarterly-kpis', { btcReturn: qBtcReturn, traderReturn: qTraderReturn });
    
    const equity = TradingStats.getEquityCurve(qTrades);
    TradingCharts.renderEquityCurve('chart-quarterly-equity', equity);
    
    // Monthly breakdown inside quarter
    const tbody = document.getElementById('quarterly-months-tbody');
    tbody.innerHTML = '';
    
    months.forEach(m => {
      const mTrades = TradingStats.filterByMonth(qTrades, m);
      const s = TradingStats.calcStats(mTrades);
      const bal = globalBalances[m] ? globalBalances[m].starting_balance : 0;
      const tReturn = bal > 0 ? (s.netPnl / bal) * 100 : null;
      const bReturn = TradingStats.getBenchmarkForMonth ? TradingStats.getBenchmarkForMonth(globalBalances, m) : null;
      const alpha = (tReturn != null && bReturn != null) ? (tReturn - bReturn) : null;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${TradingStats.getMonthLabel(m)}</strong></td>
        <td>${s.totalTrades}</td>
        <td class="${s.winRate > 50 ? 'green' : 'red'}">${formatPct(s.winRate)}</td>
        <td class="${s.netPnl > 0 ? 'green' : 'red'}">${formatUsd(s.netPnl).text}</td>
        <td class="${tReturn != null ? (tReturn >= 0 ? 'green' : 'red') : ''}">${tReturn != null ? (tReturn >= 0 ? '+' : '') + formatPct(tReturn) : '—'}</td>
        <td class="${bReturn != null ? (bReturn >= 0 ? 'yellow' : 'red') : ''}">${bReturn != null ? (bReturn >= 0 ? '+' : '') + formatPct(bReturn) : '—'}</td>
        <td class="${alpha != null ? (alpha >= 0 ? 'green' : 'red') : ''}">${alpha != null ? (alpha >= 0 ? '+' : '') + formatPct(alpha) : '—'}</td>
        <td>${s.profitFactor.toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderYearlyReport(year) {
    const yTrades = TradingStats.filterByYear(globalTrades, year);
    const stats = TradingStats.calcStats(yTrades);

    // Calculate yearly compound return for trader and BTC
    const quarters = Array.from(new Set(yTrades.map(t => {
      const q = Math.ceil(parseInt(t.date.split('-')[1], 10) / 3);
      return `${year}-Q${q}`;
    }))).sort();

    const monthlyTraderPct = [];
    const months = Array.from(new Set(yTrades.map(t => t.date.substring(0, 7)))).sort();
    months.forEach(m => {
      const mTrades = TradingStats.filterByMonth(yTrades, m);
      const s = TradingStats.calcStats(mTrades);
      const bal = globalBalances[m] ? globalBalances[m].starting_balance : 0;
      if (bal > 0) {
        monthlyTraderPct.push((s.netPnl / bal) * 100);
      }
    });
    const yTraderReturn = monthlyTraderPct.length > 0 ? TradingStats.getCompoundReturn(monthlyTraderPct) : null;
    const yBtcReturn = TradingStats.getYearBenchmark ? TradingStats.getYearBenchmark(globalBalances, year) : null;

    createKPICards(stats, 'yearly-kpis', { btcReturn: yBtcReturn, traderReturn: yTraderReturn });
    
    const equity = TradingStats.getEquityCurve(yTrades);
    TradingCharts.renderEquityCurve('chart-yearly-equity', equity);
    
    const tbody = document.getElementById('yearly-quarters-tbody');
    tbody.innerHTML = '';
    
    quarters.forEach(q => {
      const qTrades = TradingStats.filterByQuarter(yTrades, q);
      const s = TradingStats.calcStats(qTrades);
      const qMonths = Array.from(new Set(qTrades.map(t => t.date.substring(0, 7)))).sort();
      const qTPct = [];
      qMonths.forEach(qm => {
        const qmTrades = TradingStats.filterByMonth(qTrades, qm);
        const qmS = TradingStats.calcStats(qmTrades);
        const bal = globalBalances[qm] ? globalBalances[qm].starting_balance : 0;
        if (bal > 0) qTPct.push((qmS.netPnl / bal) * 100);
      });
      const tReturn = qTPct.length > 0 ? TradingStats.getCompoundReturn(qTPct) : null;
      const bReturn = TradingStats.getQuarterBenchmark ? TradingStats.getQuarterBenchmark(globalBalances, q) : null;
      const alpha = (tReturn != null && bReturn != null) ? (tReturn - bReturn) : null;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${TradingStats.getQuarterLabel(q)}</strong></td>
        <td>${s.totalTrades}</td>
        <td class="${s.winRate > 50 ? 'green' : 'red'}">${formatPct(s.winRate)}</td>
        <td class="${s.netPnl > 0 ? 'green' : 'red'}">${formatUsd(s.netPnl).text}</td>
        <td class="${tReturn != null ? (tReturn >= 0 ? 'green' : 'red') : ''}">${tReturn != null ? (tReturn >= 0 ? '+' : '') + formatPct(tReturn) : '—'}</td>
        <td class="${bReturn != null ? (bReturn >= 0 ? 'yellow' : 'red') : ''}">${bReturn != null ? (bReturn >= 0 ? '+' : '') + formatPct(bReturn) : '—'}</td>
        <td class="${alpha != null ? (alpha >= 0 ? 'green' : 'red') : ''}">${alpha != null ? (alpha >= 0 ? '+' : '') + formatPct(alpha) : '—'}</td>
        <td>${s.profitFactor.toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Initialize Default Tab
  renderOverview();
});
