window.TradingStats = {
  filterByMonth(trades, yearMonth) {
    if (!trades || !yearMonth) return [];
    return trades.filter(t => t.date.startsWith(yearMonth));
  },
  
  filterByQuarter(trades, yearQuarter) {
    if (!trades || !yearQuarter) return [];
    const [year, q] = yearQuarter.split('-Q');
    const qNum = parseInt(q, 10);
    return trades.filter(t => {
      if (!t.date.startsWith(year)) return false;
      const month = parseInt(t.date.split('-')[1], 10);
      const tradeQ = Math.ceil(month / 3);
      return tradeQ === qNum;
    });
  },
  
  filterByYear(trades, year) {
    if (!trades || !year) return [];
    return trades.filter(t => t.date.startsWith(String(year)));
  },
  
  getAvailableMonths(trades) {
    if (!trades) return [];
    const months = new Set(trades.map(t => t.date.substring(0, 7)));
    return Array.from(months).sort();
  },
  
  getAvailableQuarters(trades) {
    if (!trades) return [];
    const quarters = new Set(trades.map(t => {
      const parts = t.date.split('-');
      const year = parts[0];
      const month = parseInt(parts[1], 10);
      const q = Math.ceil(month / 3);
      return `${year}-Q${q}`;
    }));
    return Array.from(quarters).sort();
  },
  
  getAvailableYears(trades) {
    if (!trades) return [];
    const years = new Set(trades.map(t => parseInt(t.date.substring(0, 4), 10)));
    return Array.from(years).sort();
  },
  
  calcStats(trades) {
    if (!trades || trades.length === 0) {
      return {
        totalTrades: 0, wins: 0, losses: 0, breakevens: 0,
        winRate: 0, winRateAll: 0, grossProfit: 0, grossLoss: 0, netPnl: 0,
        profitFactor: 0, avgWin: 0, avgLoss: 0, avgWinLossRatio: 0, avgRR: 0,
        expectancyR: 0, expectancyUsd: 0, maxWinStreak: 0, maxLossStreak: 0,
        bestTrade: null, worstTrade: null, maxDrawdown: 0, maxDrawdownPct: 0,
        totalRiskDeployed: 0, returnOnRisk: 0
      };
    }

    let wins = 0, losses = 0, breakevens = 0;
    let grossProfit = 0, grossLoss = 0, netPnl = 0;
    let sumRR = 0, countRR = 0;
    let bestTrade = null, worstTrade = null;
    let totalRiskDeployed = 0;
    
    let cumPnl = 0;
    let peakCumPnl = 0;
    let maxDrawdown = 0;

    let currentWinStreak = 0, currentLossStreak = 0;
    let maxWinStreak = 0, maxLossStreak = 0;

    trades.forEach(t => {
      if (t.result === 'win') {
        wins++;
        grossProfit += t.pnl;
        currentWinStreak++;
        currentLossStreak = 0;
        if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
        
        if (t.rr != null) {
          sumRR += t.rr;
          countRR++;
        }
      } else if (t.result === 'loss') {
        losses++;
        grossLoss += Math.abs(t.pnl);
        currentLossStreak++;
        currentWinStreak = 0;
        if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
      } else if (t.result === 'be') {
        breakevens++;
        currentWinStreak = 0;
        currentLossStreak = 0;
      }

      netPnl += t.pnl;
      cumPnl += t.pnl;
      
      if (cumPnl > peakCumPnl) {
        peakCumPnl = cumPnl;
      }
      const dd = peakCumPnl - cumPnl;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
      }

      if (!bestTrade || t.pnl > bestTrade.pnl) bestTrade = t;
      if (!worstTrade || t.pnl < worstTrade.pnl) worstTrade = t;
      
      if (t.risk_pct != null) {
        totalRiskDeployed += t.risk_pct;
      }
    });

    const totalTrades = trades.length;
    const decidedTrades = wins + losses;
    const winRate = decidedTrades > 0 ? (wins / decidedTrades) * 100 : 0;
    const winRateAll = (wins / totalTrades) * 100;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
    const avgWin = wins > 0 ? grossProfit / wins : 0;
    const avgLoss = losses > 0 ? grossLoss / losses : 0;
    const avgWinLossRatio = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? Infinity : 0);
    const avgRR = countRR > 0 ? sumRR / countRR : 0;
    
    const expectancyR = (winRate / 100 * avgRR) - ((100 - winRate) / 100 * 1);
    const expectancyUsd = netPnl / totalTrades;
    
    const maxDrawdownPct = peakCumPnl > 0 ? (maxDrawdown / peakCumPnl) * 100 : 0;
    
    // Average Risk % & Risk Breakdown
    const tradesWithRisk = trades.filter(t => t.risk_pct != null);
    const avgRiskPct = tradesWithRisk.length > 0 ? totalRiskDeployed / tradesWithRisk.length : 0;
    const returnOnRisk = totalRiskDeployed > 0 ? (netPnl / (totalRiskDeployed * (trades[0]?.startingBalance || 5.4))) : 0; // ratio
    const rorMultiplier = totalRiskDeployed > 0 ? (netPnl / (totalRiskDeployed * 5.4)) : 0;
    const calmarRatio = maxDrawdown > 0 ? (netPnl / maxDrawdown) : (netPnl > 0 ? 99 : 0);
    const riskCounts = {};
    trades.forEach(t => {
      const r = t.risk_pct != null ? t.risk_pct : '—';
      riskCounts[r] = (riskCounts[r] || 0) + 1;
    });

    // Advanced Risk-Adjusted Ratios (Sharpe, Sortino, Adjusted Sortino)
    const pnls = trades.map(t => t.pnl);
    const meanPnl = totalTrades > 0 ? netPnl / totalTrades : 0;
    
    // Sample variance & standard deviation
    let variance = 0;
    if (totalTrades > 1) {
      variance = pnls.reduce((sum, p) => sum + Math.pow(p - meanPnl, 2), 0) / (totalTrades - 1);
    }
    const stdDev = Math.sqrt(variance);

    // Downside deviation (only negative outcomes below target MAR = 0)
    const downsideSqSum = pnls.reduce((sum, p) => p < 0 ? sum + Math.pow(p, 2) : sum, 0);
    const downsideDev = totalTrades > 0 ? Math.sqrt(downsideSqSum / totalTrades) : 0;

    // Upside potential (mean of positive outcomes above target MAR = 0)
    const upsideSum = pnls.reduce((sum, p) => p > 0 ? sum + p : sum, 0);
    const upsidePotential = totalTrades > 0 ? upsideSum / totalTrades : 0;

    // Sharpe Ratio (annualized by sqrt(N) for the sample of trades)
    // and trade-level Sharpe
    const sharpeTrade = stdDev > 0 ? meanPnl / stdDev : 0;
    const sharpeRatio = stdDev > 0 ? (meanPnl / stdDev) * Math.sqrt(totalTrades) : 0;

    // Sortino Ratio (annualized by sqrt(N) and trade-level)
    const sortinoTrade = downsideDev > 0 ? meanPnl / downsideDev : 0;
    const sortinoRatio = downsideDev > 0 ? (meanPnl / downsideDev) * Math.sqrt(totalTrades) : 0;

    // Adjusted Sortino Ratio (Upside Potential Ratio: Upside Potential / Downside Deviation)
    // Directly measures upside reward delivered per unit of downside penalty
    const adjustedSortino = downsideDev > 0 ? upsidePotential / downsideDev : 0;

    return {
      totalTrades, wins, losses, breakevens, winRate, winRateAll,
      grossProfit, grossLoss, netPnl, profitFactor, avgWin, avgLoss,
      avgWinLossRatio, avgRR, expectancyR, expectancyUsd,
      maxWinStreak, maxLossStreak, bestTrade, worstTrade,
      maxDrawdown, maxDrawdownPct, totalRiskDeployed, returnOnRisk,
      calmarRatio, rorMultiplier,
      avgRiskPct, riskCounts,
      stdDev, downsideDev,
      sharpeTrade, sharpeRatio,
      sortinoTrade, sortinoRatio,
      adjustedSortino
    };
  },
  
  getEquityCurve(trades) {
    let cumPnl = 0;
    return trades.map((t, i) => {
      cumPnl += t.pnl;
      return {
        tradeIndex: i,
        date: t.date,
        ticker: t.ticker,
        pnl: t.pnl,
        cumPnl: cumPnl,
        result: t.result
      };
    });
  },
  
  getAssetBreakdown(trades) {
    const map = new Map();
    trades.forEach(t => {
      if (!map.has(t.ticker)) {
        map.set(t.ticker, { ticker: t.ticker, trades: 0, wins: 0, losses: 0, be: 0, netPnl: 0 });
      }
      const data = map.get(t.ticker);
      data.trades++;
      if (t.result === 'win') data.wins++;
      else if (t.result === 'loss') data.losses++;
      else if (t.result === 'be') data.be++;
      data.netPnl += t.pnl;
    });
    const result = Array.from(map.values());
    result.forEach(d => {
      const decided = d.wins + d.losses;
      d.winRate = decided > 0 ? (d.wins / decided) * 100 : 0;
    });
    return result.sort((a, b) => b.netPnl - a.netPnl);
  },
  
  getRiskBreakdown(trades) {
    const map = new Map();
    trades.forEach(t => {
      const risk = t.risk_pct != null ? t.risk_pct : 'Unknown';
      if (!map.has(risk)) {
        map.set(risk, { riskPct: risk, trades: 0, wins: 0, losses: 0, be: 0, netPnl: 0 });
      }
      const data = map.get(risk);
      data.trades++;
      if (t.result === 'win') data.wins++;
      else if (t.result === 'loss') data.losses++;
      else if (t.result === 'be') data.be++;
      data.netPnl += t.pnl;
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.riskPct === 'Unknown') return 1;
      if (b.riskPct === 'Unknown') return -1;
      return a.riskPct - b.riskPct;
    });
  },
  
  getSetupBreakdown(trades) {
    const map = new Map();
    trades.forEach(t => {
      if (t.setup == null) return;
      if (!map.has(t.setup)) {
        map.set(t.setup, { setup: t.setup, trades: 0, wins: 0, losses: 0, be: 0, netPnl: 0 });
      }
      const data = map.get(t.setup);
      data.trades++;
      if (t.result === 'win') data.wins++;
      else if (t.result === 'loss') data.losses++;
      else if (t.result === 'be') data.be++;
      data.netPnl += t.pnl;
    });
    const result = Array.from(map.values());
    result.forEach(d => {
      const decided = d.wins + d.losses;
      d.winRate = decided > 0 ? (d.wins / decided) * 100 : 0;
    });
    return result.sort((a, b) => b.netPnl - a.netPnl);
  },
  
  comparePeriodsStats(periods) {
    const result = {};
    periods.forEach(p => {
      result[p.label] = this.calcStats(p.trades);
    });
    return result;
  },
  
  getAccountPercentages(trades, startingBalance) {
    if (!startingBalance || startingBalance <= 0) {
      return trades.map(t => ({...t, accountPct: 0, cumAccountPct: 0}));
    }
    let currentBalance = startingBalance;
    return trades.map(t => {
      const accountPct = (t.pnl / startingBalance) * 100;
      currentBalance += t.pnl;
      const cumAccountPct = ((currentBalance - startingBalance) / startingBalance) * 100;
      return {
        ...t,
        accountPct,
        cumAccountPct
      };
    });
  },
  
  getStreakAnalysis(trades) {
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentType = null;
    let currentCount = 0;
    let startIdx = 0;
    const streaks = [];

    const flushStreak = (endIdx) => {
      if (currentType && currentCount > 0) {
        streaks.push({ type: currentType, count: currentCount, startIdx, endIdx });
        if (currentType === 'win' && currentCount > maxWinStreak) maxWinStreak = currentCount;
        if (currentType === 'loss' && currentCount > maxLossStreak) maxLossStreak = currentCount;
      }
    };

    trades.forEach((t, i) => {
      const type = t.result === 'win' ? 'win' : (t.result === 'loss' ? 'loss' : 'be');
      if (type === 'be') {
        flushStreak(i - 1);
        currentType = null;
        currentCount = 0;
      } else {
        if (type === currentType) {
          currentCount++;
        } else {
          flushStreak(i - 1);
          currentType = type;
          currentCount = 1;
          startIdx = i;
        }
      }
    });
    flushStreak(trades.length - 1);

    return {
      currentStreak: { type: currentType, count: currentCount },
      maxWinStreak,
      maxLossStreak,
      streaks
    };
  },
  
  getDayOfWeekAnalysis(trades) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const result = {};
    days.forEach(d => {
      result[d] = { trades: 0, wins: 0, losses: 0, netPnl: 0 };
    });
    
    trades.forEach(t => {
      const dateParts = t.date.split('-');
      if (dateParts.length !== 3) return;
      const dateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
      if (isNaN(dateObj.getTime())) return;
      const dayName = days[dateObj.getDay()];
      const d = result[dayName];
      d.trades++;
      if (t.result === 'win') d.wins++;
      else if (t.result === 'loss') d.losses++;
      d.netPnl += t.pnl;
    });
    
    return result;
  },
  
  getMonthLabel(yearMonth) {
    if (!yearMonth) return '';
    const parts = yearMonth.split('-');
    if (parts.length !== 2) return yearMonth;
    const year = parts[0];
    const month = parseInt(parts[1], 10);
    const monthsRu = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    if (month >= 1 && month <= 12) {
      return `${monthsRu[month - 1]} ${year}`;
    }
    return yearMonth;
  },
  
  getQuarterLabel(yearQuarter) {
    if (!yearQuarter) return '';
    const parts = yearQuarter.split('-Q');
    if (parts.length !== 2) return yearQuarter;
    return `Q${parts[1]} ${parts[0]}`;
  },

  // Market Benchmark Helpers
  getBenchmarkForMonth(balancesOrBenchmark, yearMonth) {
    if (!balancesOrBenchmark || !yearMonth) return null;
    if (balancesOrBenchmark.months && balancesOrBenchmark.months[yearMonth]) {
      return balancesOrBenchmark.months[yearMonth].change_pct;
    }
    if (balancesOrBenchmark[yearMonth] && balancesOrBenchmark[yearMonth].btc_change_pct != null) {
      return balancesOrBenchmark[yearMonth].btc_change_pct;
    }
    return null;
  },

  getCompoundReturn(pctArray) {
    if (!pctArray || pctArray.length === 0) return 0;
    const factor = pctArray.reduce((acc, val) => acc * (1 + (val / 100)), 1);
    return (factor - 1) * 100;
  },

  getQuarterBenchmark(balancesOrBenchmark, yearQuarter) {
    if (!balancesOrBenchmark || !yearQuarter) return null;
    const [year, q] = yearQuarter.split('-Q');
    const qNum = parseInt(q, 10);
    const startMonth = (qNum - 1) * 3 + 1;
    const quarterMonths = [
      `${year}-${String(startMonth).padStart(2, '0')}`,
      `${year}-${String(startMonth + 1).padStart(2, '0')}`,
      `${year}-${String(startMonth + 2).padStart(2, '0')}`
    ];
    const btcReturns = [];
    quarterMonths.forEach(m => {
      const val = this.getBenchmarkForMonth(balancesOrBenchmark, m);
      if (val != null) btcReturns.push(val);
    });
    if (btcReturns.length === 0) return null;
    return this.getCompoundReturn(btcReturns);
  },

  getYearBenchmark(balancesOrBenchmark, year) {
    if (!balancesOrBenchmark || !year) return null;
    const btcReturns = [];
    for (let m = 1; m <= 12; m++) {
      const ym = `${year}-${String(m).padStart(2, '0')}`;
      const val = this.getBenchmarkForMonth(balancesOrBenchmark, ym);
      if (val != null) btcReturns.push(val);
    }
    if (btcReturns.length === 0) return null;
    return this.getCompoundReturn(btcReturns);
  }
};

