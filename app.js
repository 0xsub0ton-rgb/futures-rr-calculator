/**
 * Futures Risk & Reward Calculator
 * Real-time calculation engine, canvas renderer, partial TPs, multi-orders DCA grid, pop-up trade modal, and local storage history.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Application State ---
    const savedCapital = localStorage.getItem('trading_capital');
    let initialCapital = 10000;
    if (savedCapital !== null && savedCapital !== '') {
        const parsedCap = parseFloat(savedCapital);
        if (!isNaN(parsedCap) && parsedCap > 0) {
            initialCapital = parsedCap;
        }
    }

    const state = {
        ticker: 'BTC',
        entryMode: 'single', // 'single' or 'multi'
        direction: 'long', // 'long' or 'short'
        capital: initialCapital,
        riskPercent: 1.0,
        entryPrice: 65000,
        stopLossPrice: 64000,
        leverage: 10,
        feePercent: 0.05,
        customRr: 4.0,
        multiOrders: [
            { price: 65000, weightPct: 50 },
            { price: 63000, weightPct: 50 }
        ],
        partialTps: [
            { rr: 3, allocPct: 50 },
            { rr: 6, allocPct: 30 },
            { rr: 10, allocPct: 20 }
        ],
        history: JSON.parse(localStorage.getItem('trading_rr_history') || '[]'),
        showGrid: true,
        showLiq: true
    };

    let activeModalItem = null;

    // --- DOM Elements ---
    const dom = {
        // Ticker Input
        tickerInput: document.getElementById('tickerInput'),

        // Mode & Switches
        entryModeSingle: document.getElementById('entryModeSingle'),
        entryModeMulti: document.getElementById('entryModeMulti'),
        singleEntryGroup: document.getElementById('singleEntryGroup'),
        multiEntryGroup: document.getElementById('multiEntryGroup'),
        multiOrdersList: document.getElementById('multiOrdersList'),
        addMultiOrderBtn: document.getElementById('addMultiOrderBtn'),
        multiAllocWarning: document.getElementById('multiAllocWarning'),
        multiAvgPriceDisplay: document.getElementById('multiAvgPriceDisplay'),

        // Tab & DCA table
        tabBtnMultiOrders: document.getElementById('tabBtnMultiOrders'),
        tabMultiOrders: document.getElementById('tabMultiOrders'),
        multiAvgEntrySummary: document.getElementById('multiAvgEntrySummary'),
        dcaBreakdownTbody: document.getElementById('dcaBreakdownTbody'),

        // Core Inputs
        dirLong: document.getElementById('dirLong'),
        dirShort: document.getElementById('dirShort'),
        capitalInput: document.getElementById('capitalInput'),
        riskSlider: document.getElementById('riskSlider'),
        riskPercentInput: document.getElementById('riskPercentInput'),
        riskAmountDisplay: document.getElementById('riskAmountDisplay'),
        entryPriceInput: document.getElementById('entryPriceInput'),
        stopLossInput: document.getElementById('stopLossInput'),
        stopDistanceDisplay: document.getElementById('stopDistanceDisplay'),
        leverageSlider: document.getElementById('leverageSlider'),
        leverageInput: document.getElementById('leverageInput'),
        leverageValueDisplay: document.getElementById('leverageValueDisplay'),
        feeToggle: document.getElementById('feeToggle'),
        feeContent: document.getElementById('feeContent'),
        feeInput: document.getElementById('feeInput'),
        resetBtn: document.getElementById('resetBtn'),
        customRrInput: document.getElementById('customRrInput'),

        // Cards & Displays
        cardRiskUsdt: document.getElementById('cardRiskUsdt'),
        cardRiskPct: document.getElementById('cardRiskPct'),
        cardPosUsdt: document.getElementById('cardPosUsdt'),
        cardPosCoins: document.getElementById('cardPosCoins'),
        cardMarginUsdt: document.getElementById('cardMarginUsdt'),
        cardMarginRatio: document.getElementById('cardMarginRatio'),
        cardLiqPrice: document.getElementById('cardLiqPrice'),
        cardLiqDist: document.getElementById('cardLiqDist'),
        rrCardsContainer: document.getElementById('rrCardsContainer'),

        // Partial TP
        tpStepsContainer: document.getElementById('tpStepsContainer'),
        addTpStepBtn: document.getElementById('addTpStepBtn'),
        tpTotalAllocatedPct: document.getElementById('tpTotalAllocatedPct'),
        tpWeightedRr: document.getElementById('tpWeightedRr'),
        tpTotalProfitUsdt: document.getElementById('tpTotalProfitUsdt'),
        tpTotalGrowthPct: document.getElementById('tpTotalGrowthPct'),
        allocProgressFill: document.getElementById('allocProgressFill'),

        // Canvas
        tradeCanvas: document.getElementById('tradeCanvas'),
        visToggleGrid: document.getElementById('visToggleGrid'),
        visToggleLiq: document.getElementById('visToggleLiq'),

        // Actions & History
        copySummaryBtn: document.getElementById('copySummaryBtn'),
        saveHistoryBtn: document.getElementById('saveHistoryBtn'),
        clearHistoryBtn: document.getElementById('clearHistoryBtn'),
        historyListContainer: document.getElementById('historyListContainer'),
        toast: document.getElementById('toast'),

        // Modal Elements
        tradeModal: document.getElementById('tradeModal'),
        modalTitle: document.getElementById('modalTitle'),
        modalTimestamp: document.getElementById('modalTimestamp'),
        modalBodyContent: document.getElementById('modalBodyContent'),
        closeModalBtn: document.getElementById('closeModalBtn'),
        modalCloseBtn: document.getElementById('modalCloseBtn'),
        modalRestoreBtn: document.getElementById('modalRestoreBtn'),
        modalCopyBtn: document.getElementById('modalCopyBtn'),
        modalDeleteBtn: document.getElementById('modalDeleteBtn')
    };

    // --- Core Calculations Engine ---

    function calculateTrade() {
        const isLong = state.direction === 'long';
        const isMulti = state.entryMode === 'multi';
        const sl = parseFloat(state.stopLossPrice) || 0;
        const cap = parseFloat(state.capital) || 0;
        const riskPct = parseFloat(state.riskPercent) || 0;
        const lev = parseInt(state.leverage) || 1;
        const feeRate = (parseFloat(state.feePercent) || 0) / 100;
        const riskUsdt = cap * (riskPct / 100);

        let entry = parseFloat(state.entryPrice) || 0;
        let isInvalid = false;
        let multiBreakdown = [];
        let totalAllocWeight = 100;

        if (isMulti) {
            totalAllocWeight = state.multiOrders.reduce((sum, o) => sum + (o.weightPct || 0), 0);
            
            state.multiOrders.forEach(o => {
                const p = parseFloat(o.price) || 0;
                if (p <= 0 || sl <= 0) isInvalid = true;
                else if (isLong && sl >= p) isInvalid = true;
                else if (!isLong && sl <= p) isInvalid = true;
            });

            if (!isInvalid && state.multiOrders.length > 0 && cap > 0 && riskPct > 0) {
                let sumWeightedDistRatio = 0;
                const activeOrders = state.multiOrders.filter(o => o.price > 0 && o.weightPct > 0);

                activeOrders.forEach(o => {
                    const wRatio = (o.weightPct / (totalAllocWeight || 100));
                    const distRatio = Math.abs(o.price - sl) / o.price;
                    sumWeightedDistRatio += wRatio * distRatio;
                });

                if (sumWeightedDistRatio > 0) {
                    const posValueUsdt = riskUsdt / sumWeightedDistRatio;
                    let totalCoins = 0;

                    activeOrders.forEach((o, idx) => {
                        const wRatio = (o.weightPct / (totalAllocWeight || 100));
                        const orderUsdt = posValueUsdt * wRatio;
                        const orderCoins = orderUsdt / o.price;
                        const orderMargin = orderUsdt / lev;
                        const orderDistPct = (Math.abs(o.price - sl) / o.price) * 100;

                        totalCoins += orderCoins;

                        multiBreakdown.push({
                            index: idx + 1,
                            price: o.price,
                            weightPct: o.weightPct,
                            orderUsdt,
                            orderCoins,
                            orderMargin,
                            orderDistPct
                        });
                    });

                    entry = posValueUsdt / (totalCoins || 1);
                } else {
                    isInvalid = true;
                }
            }
        } else {
            if (entry <= 0 || sl <= 0 || cap <= 0 || riskPct <= 0) {
                isInvalid = true;
            } else if (isLong && sl >= entry) {
                isInvalid = true;
            } else if (!isLong && sl <= entry) {
                isInvalid = true;
            }
        }

        let stopDistanceAbs = 0;
        let stopDistancePct = 0;

        if (isLong) {
            stopDistanceAbs = entry - sl;
        } else {
            stopDistanceAbs = sl - entry;
        }
        stopDistancePct = (stopDistanceAbs / (entry || 1)) * 100;

        let posValueUsdt = 0;
        let posCoins = 0;
        let marginUsdt = 0;

        if (!isInvalid && stopDistancePct > 0) {
            posValueUsdt = riskUsdt / (stopDistancePct / 100);
            posCoins = posValueUsdt / entry;
            marginUsdt = posValueUsdt / lev;
        }

        const mmr = 0.004;
        let liqPrice = 0;
        let liqDistPct = 0;

        if (isLong) {
            liqPrice = entry * (1 - (1 / lev) + mmr);
            liqDistPct = ((entry - liqPrice) / (entry || 1)) * 100;
        } else {
            liqPrice = entry * (1 + (1 / lev) - mmr);
            liqDistPct = ((liqPrice - entry) / (entry || 1)) * 100;
        }

        const presetRrs = [3, 5, 6, 10, parseFloat(state.customRr) || 4];
        const rrModes = presetRrs.map(r => {
            let tpPrice = 0;
            if (isLong) {
                tpPrice = entry + (r * stopDistanceAbs);
            } else {
                tpPrice = entry - (r * stopDistanceAbs);
            }

            const grossProfitUsdt = riskUsdt * r;
            const entryFeeUsdt = posValueUsdt * feeRate;
            const exitPosValueUsdt = posCoins * tpPrice;
            const exitFeeUsdt = exitPosValueUsdt * feeRate;
            const totalFeeUsdt = entryFeeUsdt + exitFeeUsdt;

            const netProfitUsdt = Math.max(0, grossProfitUsdt - totalFeeUsdt);
            const accountGrowthPct = (netProfitUsdt / cap) * 100;
            const roePct = (netProfitUsdt / (marginUsdt || 1)) * 100;

            return {
                rr: r,
                tpPrice,
                grossProfitUsdt,
                totalFeeUsdt,
                netProfitUsdt,
                accountGrowthPct,
                roePct
            };
        });

        return {
            isInvalid,
            isLong,
            isMulti,
            entry,
            sl,
            cap,
            riskPct,
            riskUsdt,
            stopDistanceAbs,
            stopDistancePct,
            posValueUsdt,
            posCoins,
            marginUsdt,
            lev,
            liqPrice,
            liqDistPct,
            rrModes,
            multiBreakdown,
            totalAllocWeight
        };
    }

    // --- Formatters ---

    function formatUsdt(val) {
        if (isNaN(val)) return '$0.00';
        return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatPrice(val) {
        if (isNaN(val) || val <= 0) return '0.00';
        if (val < 1) return val.toFixed(6);
        if (val < 10) return val.toFixed(4);
        return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatCoins(val) {
        if (isNaN(val) || val <= 0) return '0';
        if (val < 0.001) return val.toFixed(6);
        if (val < 1) return val.toFixed(4);
        if (val < 100) return val.toFixed(2);
        return val.toFixed(1);
    }

    // --- UI Update Pipeline ---

    function updateUI() {
        const trade = calculateTrade();

        // 1. Sidebar Displays
        dom.riskAmountDisplay.textContent = formatUsdt(trade.riskUsdt);
        dom.leverageValueDisplay.textContent = `${state.leverage}x`;

        if (trade.isMulti) {
            dom.multiAvgPriceDisplay.textContent = `Ср. цена: $${formatPrice(trade.entry)}`;
            if (trade.totalAllocWeight !== 100) {
                dom.multiAllocWarning.classList.add('visible');
                dom.multiAllocWarning.textContent = `Сумма долей: ${trade.totalAllocWeight}% (желательно 100%)`;
            } else {
                dom.multiAllocWarning.classList.remove('visible');
            }
        }

        if (trade.isInvalid) {
            dom.stopDistanceDisplay.textContent = 'Ошибка цены SL!';
            dom.stopDistanceDisplay.className = 'value-highlight red';
        } else {
            const prefix = trade.isLong ? '-' : '+';
            dom.stopDistanceDisplay.textContent = `${prefix}${trade.stopDistancePct.toFixed(2)}%`;
            dom.stopDistanceDisplay.className = 'value-highlight red';
        }

        // 2. Metric Cards
        dom.cardRiskUsdt.textContent = formatUsdt(trade.riskUsdt);
        dom.cardRiskPct.textContent = `${trade.riskPct.toFixed(2)}% от депозита`;

        dom.cardPosUsdt.textContent = formatUsdt(trade.posValueUsdt);
        dom.cardPosCoins.textContent = `В монетах: ${formatCoins(trade.posCoins)} Qty`;

        dom.cardMarginUsdt.textContent = formatUsdt(trade.marginUsdt);
        dom.cardMarginRatio.textContent = `При плече ${trade.lev}x`;

        dom.cardLiqPrice.textContent = `$${formatPrice(trade.liqPrice)}`;
        dom.cardLiqDist.textContent = `Дистанция: -${trade.liqDistPct.toFixed(2)}%`;

        // 3. Tab Visibility & Renderers
        if (trade.isMulti) {
            dom.tabBtnMultiOrders.classList.remove('hidden');
        } else {
            dom.tabBtnMultiOrders.classList.add('hidden');
            if (dom.tabMultiOrders.classList.contains('active')) {
                dom.tabBtnMultiOrders.classList.remove('active');
                document.querySelector('.tab-btn[data-tab="tabRrModes"]').click();
            }
        }

        renderRrCards(trade);
        renderDcaBreakdownTable(trade);
        renderPartialTpSummary(trade);
        drawVisualizerCanvas(trade);
    }

    function renderRrCards(trade) {
        dom.rrCardsContainer.innerHTML = '';

        if (trade.isInvalid) {
            dom.rrCardsContainer.innerHTML = `
                <div class="empty-state">
                    Пожалуйста, задайте корректную цену Входа и Стоп-лосса.<br>
                    Для LONG: Стоп должен быть ниже Входа.<br>
                    Для SHORT: Стоп должен быть выше Входа.
                </div>
            `;
            return;
        }

        trade.rrModes.forEach(mode => {
            const isCustom = mode.rr === parseFloat(state.customRr);
            const cardEl = document.createElement('div');
            cardEl.className = `rr-card ${isCustom ? 'custom' : ''}`;

            cardEl.innerHTML = `
                <div class="rr-card-header">
                    <span class="rr-badge">1 : ${mode.rr}</span>
                    <span class="value-highlight green">+${mode.accountGrowthPct.toFixed(2)}%</span>
                </div>
                <div class="rr-stat-group">
                    <div class="stat-row">
                        <span class="label">Целевая цена (TP):</span>
                        <span class="val highlight green">$${formatPrice(mode.tpPrice)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="label">Чистая прибыль:</span>
                        <span class="val green">${formatUsdt(mode.netProfitUsdt)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="label">ROE (на маржу):</span>
                        <span class="val">+${mode.roePct.toFixed(1)}%</span>
                    </div>
                    <div class="stat-row">
                        <span class="label">Комиссии:</span>
                        <span class="val" style="color: var(--text-dim);">${formatUsdt(mode.totalFeeUsdt)}</span>
                    </div>
                </div>
            `;
            dom.rrCardsContainer.appendChild(cardEl);
        });
    }

    function renderDcaBreakdownTable(trade) {
        dom.dcaBreakdownTbody.innerHTML = '';
        dom.multiAvgEntrySummary.textContent = `Средняя цена входа: $${formatPrice(trade.entry)}`;

        if (!trade.isMulti || trade.isInvalid || trade.multiBreakdown.length === 0) {
            dom.dcaBreakdownTbody.innerHTML = `<tr><td colspan="7" class="empty-state">Режим мульти-ордеров не активен или параметры некорректны.</td></tr>`;
            return;
        }

        trade.multiBreakdown.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>Ордер #${row.index}</b></td>
                <td class="accent">$${formatPrice(row.price)}</td>
                <td>${row.weightPct}%</td>
                <td class="green">${formatUsdt(row.orderUsdt)}</td>
                <td>${formatCoins(row.orderCoins)} Qty</td>
                <td>${formatUsdt(row.orderMargin)}</td>
                <td class="red">-${row.orderDistPct.toFixed(2)}%</td>
            `;
            dom.dcaBreakdownTbody.appendChild(tr);
        });
    }

    // --- Multi Orders Dynamic List Builder ---

    function renderMultiOrdersList() {
        dom.multiOrdersList.innerHTML = '';

        state.multiOrders.forEach((order, idx) => {
            const row = document.createElement('div');
            row.className = 'multi-order-row';

            row.innerHTML = `
                <span class="order-badge">#${idx + 1}</span>
                <div class="input-wrapper">
                    <input type="number" class="multi-price-input" data-idx="${idx}" value="${order.price}" step="any" placeholder="Цена">
                </div>
                <div class="number-suffix">
                    <input type="number" class="multi-weight-input" data-idx="${idx}" value="${order.weightPct}" step="5" min="1" max="100">
                    <span>%</span>
                </div>
                ${state.multiOrders.length > 1 ? `
                    <button type="button" class="btn-icon danger-text remove-multi-order-btn" data-idx="${idx}" title="Удалить ордер">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                ` : ''}
            `;
            dom.multiOrdersList.appendChild(row);
        });

        document.querySelectorAll('.multi-price-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                state.multiOrders[idx].price = parseFloat(e.target.value) || 0;
                updateUI();
            });
        });

        document.querySelectorAll('.multi-weight-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                state.multiOrders[idx].weightPct = parseFloat(e.target.value) || 0;
                updateUI();
            });
        });

        document.querySelectorAll('.remove-multi-order-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.dataset.idx);
                state.multiOrders.splice(idx, 1);
                renderMultiOrdersList();
                updateUI();
            });
        });
    }

    // --- Partial TP Builder ---

    function renderPartialTpSteps() {
        dom.tpStepsContainer.innerHTML = '';

        state.partialTps.forEach((step, idx) => {
            const row = document.createElement('div');
            row.className = 'tp-step-item';

            row.innerHTML = `
                <div class="tp-step-info">
                    <span class="tp-tag">TP ${idx + 1}</span>
                    <div class="custom-rr-builder">
                        <span>R:R 1:</span>
                        <input type="number" class="tp-rr-input" data-idx="${idx}" value="${step.rr}" step="0.5" min="0.5" max="100">
                    </div>
                </div>
                <div class="tp-controls">
                    <div class="number-suffix">
                        <input type="number" class="tp-alloc-input" data-idx="${idx}" value="${step.allocPct}" step="5" min="0" max="100">
                        <span>%</span>
                    </div>
                    ${state.partialTps.length > 1 ? `
                        <button class="btn-icon danger-text remove-tp-btn" data-idx="${idx}" title="Удалить цель">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    ` : ''}
                </div>
            `;
            dom.tpStepsContainer.appendChild(row);
        });

        document.querySelectorAll('.tp-rr-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                state.partialTps[idx].rr = parseFloat(e.target.value) || 1;
                updateUI();
            });
        });

        document.querySelectorAll('.tp-alloc-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                state.partialTps[idx].allocPct = parseFloat(e.target.value) || 0;
                updateUI();
            });
        });

        document.querySelectorAll('.remove-tp-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.dataset.idx);
                state.partialTps.splice(idx, 1);
                renderPartialTpSteps();
                updateUI();
            });
        });
    }

    function renderPartialTpSummary(trade) {
        if (trade.isInvalid) {
            dom.tpTotalAllocatedPct.textContent = '0%';
            dom.tpWeightedRr.textContent = '1 : 0.00';
            dom.tpTotalProfitUsdt.textContent = '$0.00';
            dom.tpTotalGrowthPct.textContent = '+0.00%';
            dom.allocProgressFill.style.width = '0%';
            return;
        }

        let totalAlloc = 0;
        let weightedRrSum = 0;
        let totalProfitUsdt = 0;

        state.partialTps.forEach(step => {
            const allocRatio = (step.allocPct || 0) / 100;
            totalAlloc += step.allocPct || 0;
            weightedRrSum += (step.rr * allocRatio);

            const stepProfit = trade.riskUsdt * step.rr * allocRatio;
            totalProfitUsdt += stepProfit;
        });

        const growthPct = (totalProfitUsdt / trade.cap) * 100;

        dom.tpTotalAllocatedPct.textContent = `${totalAlloc.toFixed(0)}%`;
        dom.tpTotalAllocatedPct.className = totalAlloc === 100 ? 'fw-bold green' : 'fw-bold warning';

        dom.tpWeightedRr.textContent = `1 : ${weightedRrSum.toFixed(2)}`;
        dom.tpTotalProfitUsdt.textContent = formatUsdt(totalProfitUsdt);
        dom.tpTotalGrowthPct.textContent = `+${growthPct.toFixed(2)}%`;

        dom.allocProgressFill.style.width = `${Math.min(100, totalAlloc)}%`;
        dom.allocProgressFill.style.background = totalAlloc === 100 ? 'var(--color-long)' : 'var(--color-warning)';
    }

    // --- Interactive Canvas Visualizer ---

    function drawVisualizerCanvas(trade) {
        const canvas = dom.tradeCanvas;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;

        ctx.fillStyle = '#060806';
        ctx.fillRect(0, 0, width, height);

        if (trade.isInvalid) {
            ctx.fillStyle = '#6A856A';
            ctx.font = '13px "Space Mono"';
            ctx.textAlign = 'center';
            ctx.fillText('Укажите корректные параметры цены для отображения графика', width / 2, height / 2);
            return;
        }

        const isLong = trade.isLong;
        const entry = trade.entry;
        const sl = trade.sl;
        const liq = trade.liqPrice;
        
        const maxRr = Math.max(...trade.rrModes.map(m => m.rr));
        const maxTpPrice = isLong ? entry + (maxRr * trade.stopDistanceAbs) : entry - (maxRr * trade.stopDistanceAbs);

        let pricesList = [entry, sl, liq, maxTpPrice];
        if (trade.isMulti) {
            trade.multiBreakdown.forEach(row => pricesList.push(row.price));
        }

        let minP = Math.min(...pricesList);
        let maxP = Math.max(...pricesList);

        const pPadding = (maxP - minP) * 0.12;
        minP -= pPadding;
        maxP += pPadding;

        function priceToY(price) {
            return height - ((price - minP) / ((maxP - minP) || 1)) * (height - 60) - 30;
        }

        if (state.showGrid) {
            ctx.strokeStyle = '#141F14';
            ctx.lineWidth = 1;
            const gridSteps = 6;
            for (let i = 0; i <= gridSteps; i++) {
                const y = (height / gridSteps) * i;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }
        }

        const entryY = priceToY(entry);
        const slY = priceToY(sl);
        const liqY = priceToY(liq);

        ctx.fillStyle = 'rgba(255, 59, 92, 0.10)';
        ctx.fillRect(0, Math.min(entryY, slY), width - 130, Math.abs(slY - entryY));

        const highestTpY = priceToY(maxTpPrice);
        ctx.fillStyle = 'rgba(34, 238, 119, 0.08)';
        ctx.fillRect(0, Math.min(entryY, highestTpY), width - 130, Math.abs(highestTpY - entryY));

        drawLevelLine(ctx, slY, '#FF3B5C', `STOP LOSS: $${formatPrice(sl)} (-${trade.stopDistancePct.toFixed(2)}%)`, width);

        if (trade.isMulti) {
            trade.multiBreakdown.forEach(row => {
                const oY = priceToY(row.price);
                ctx.setLineDash([2, 4]);
                drawLevelLine(ctx, oY, '#6A856A', `Order #${row.index}: $${formatPrice(row.price)} (${row.weightPct}%)`, width, true);
                ctx.setLineDash([]);
            });
            drawLevelLine(ctx, entryY, '#22EE77', `AVG ENTRY: $${formatPrice(entry)}`, width, false);
        } else {
            drawLevelLine(ctx, entryY, '#22EE77', `ENTRY: $${formatPrice(entry)}`, width, false);
        }

        if (state.showLiq) {
            ctx.setLineDash([4, 4]);
            drawLevelLine(ctx, liqY, '#E6B800', `LIQUIDATION: $${formatPrice(liq)}`, width);
            ctx.setLineDash([]);
        }

        trade.rrModes.forEach(mode => {
            const tpY = priceToY(mode.tpPrice);
            const label = `TP 1:${mode.rr} -> $${formatPrice(mode.tpPrice)} (+$${mode.netProfitUsdt.toFixed(0)})`;
            drawLevelLine(ctx, tpY, '#22EE77', label, width);
        });

        const candleX = 80;
        ctx.fillStyle = isLong ? '#22EE77' : '#FF3B5C';
        ctx.fillRect(candleX - 1, Math.min(entryY, slY) - 10, 2, Math.abs(slY - entryY) + 20);
        ctx.fillRect(candleX - 10, Math.min(entryY, slY), 20, Math.abs(slY - entryY));
    }

    function drawLevelLine(ctx, y, color, label, canvasWidth, isDashed = false) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = isDashed ? 1 : 1.5;

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth - 145, y);
        ctx.stroke();

        ctx.fillStyle = '#0E120E';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.fillRect(canvasWidth - 140, y - 10, 135, 20);
        ctx.strokeRect(canvasWidth - 140, y - 10, 135, 20);

        ctx.fillStyle = color;
        ctx.font = '700 10px "Space Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, canvasWidth - 135, y);
        ctx.restore();
    }

    // --- Trade Summary & History Management ---

    function generateTradeSummaryText(tradeItem = null) {
        const trade = tradeItem || calculateTrade();
        if (trade.isInvalid) return 'Ошибка: недействительные параметры сделки.';

        const isLong = trade.isLong !== undefined ? trade.isLong : (trade.direction === 'long');
        const dirSymbol = isLong ? '🟢 LONG' : '🔴 SHORT';
        const tickerName = trade.ticker || state.ticker || 'BTC';
        const lev = trade.lev || trade.leverage || 10;
        const cap = trade.cap || trade.capital || 10000;
        const riskPct = trade.riskPct || trade.riskPercent || 1.0;
        const riskUsdt = trade.riskUsdt || 100;
        const isMulti = trade.isMulti !== undefined ? trade.isMulti : (trade.mode === 'multi');

        let text = `📊 **ФЬЮЧЕРСНАЯ СДЕЛКА | ${tickerName.toUpperCase()}**\n`;
        text += `═══════════════════════════\n`;
        text += `Тип: ${dirSymbol} | Плечо: ${lev}x\n`;
        text += `Депозит: $${cap} | Риск: ${riskPct}% ($${riskUsdt.toFixed(2)})\n`;

        if (isMulti) {
            text += `Режим: 🟣 Сетка мульти-ордеров (DCA)\n`;
            text += `Средняя цена входа: $${formatPrice(trade.entry)}\n`;
            if (trade.multiBreakdown) {
                trade.multiBreakdown.forEach(row => {
                    text += ` • Ордер #${row.index}: $${formatPrice(row.price)} (${row.weightPct}%) -> $${row.orderUsdt.toFixed(2)} (${formatCoins(row.orderCoins)} Qty)\n`;
                });
            }
        } else {
            text += `Вход (Entry): $${formatPrice(trade.entry)}\n`;
        }

        text += `Стоп-лосс (SL): $${formatPrice(trade.sl)} (-${(trade.stopDistancePct || 0).toFixed(2)}%)\n`;
        text += `Маржа: $${(trade.marginUsdt || 0).toFixed(2)} | Объём: ${formatCoins(trade.posCoins)} Coin ($${(trade.posValueUsdt || trade.posUsdt || 0).toFixed(2)})\n`;
        text += `Ликвидация: $${formatPrice(trade.liqPrice)}\n\n`;
        text += `🎯 **Цели R:R (Тейк-профиты):**\n`;

        if (trade.rrModes) {
            trade.rrModes.forEach(m => {
                text += ` • 1:${m.rr} -> $${formatPrice(m.tpPrice)} | Профит: +$${m.netProfitUsdt.toFixed(2)} (+${m.accountGrowthPct.toFixed(2)}% dep)\n`;
            });
        }

        return text;
    }

    function saveCurrentTradeToHistory() {
        const trade = calculateTrade();
        if (trade.isInvalid) {
            showToast('Нельзя сохранить некорректную сделку!');
            return;
        }

        const item = {
            id: Date.now(),
            timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            ticker: (state.ticker || 'BTC').trim().toUpperCase(),
            direction: state.direction,
            mode: state.entryMode,
            capital: trade.cap,
            riskPercent: trade.riskPct,
            riskUsdt: trade.riskUsdt,
            entry: trade.entry,
            sl: trade.sl,
            stopDistancePct: trade.stopDistancePct,
            leverage: trade.lev,
            feePercent: state.feePercent,
            customRr: state.customRr,
            marginUsdt: trade.marginUsdt,
            posValueUsdt: trade.posValueUsdt,
            posCoins: trade.posCoins,
            liqPrice: trade.liqPrice,
            liqDistPct: trade.liqDistPct,
            multiOrders: JSON.parse(JSON.stringify(state.multiOrders)),
            multiBreakdown: JSON.parse(JSON.stringify(trade.multiBreakdown)),
            partialTps: JSON.parse(JSON.stringify(state.partialTps)),
            rrModes: JSON.parse(JSON.stringify(trade.rrModes))
        };

        state.history.unshift(item);
        if (state.history.length > 20) state.history.pop();

        localStorage.setItem('trading_rr_history', JSON.stringify(state.history));
        renderHistory();
        showToast(`Сделка ${item.ticker} сохранена в историю!`);
    }

    function deleteTradeFromHistory(id) {
        state.history = state.history.filter(item => item.id !== id);
        localStorage.setItem('trading_rr_history', JSON.stringify(state.history));
        renderHistory();
        closeTradeModal();
        showToast('Сделка удалена из истории');
    }

    function renderHistory() {
        dom.historyListContainer.innerHTML = '';

        if (state.history.length === 0) {
            dom.historyListContainer.innerHTML = `<div class="empty-state">История пуста. Сохраняйте расчёты для анализа.</div>`;
            return;
        }

        state.history.forEach(item => {
            const card = document.createElement('div');
            card.className = 'history-item';
            const isLong = item.direction === 'long';
            const tickerName = item.ticker || 'BTC';
            const lev = item.leverage || item.lev || 10;
            const posVal = item.posValueUsdt || item.posUsdt || 0;

            card.innerHTML = `
                <div class="history-item-header">
                    <span class="${isLong ? 'green' : 'red'}">${isLong ? '🟢 LONG' : '🔴 SHORT'} ${tickerName} (${lev}x)</span>
                    <div class="history-header-actions">
                        <span class="history-time">${item.timestamp}</span>
                        <button class="history-delete-btn" title="Удалить сделку">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>
                <div>${item.mode === 'multi' ? 'Ср. Entry' : 'Entry'}: <b>$${formatPrice(item.entry)}</b> | SL: <b>$${formatPrice(item.sl)}</b></div>
                <div style="color: var(--text-dim);">Риск: ${formatUsdt(item.riskUsdt)} | Позиция: ${formatUsdt(posVal)}</div>
            `;

            // Delete button
            const delBtn = card.querySelector('.history-delete-btn');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteTradeFromHistory(item.id);
                });
            }

            // Card click opens modal
            card.addEventListener('click', () => {
                openTradeModal(item);
            });

            dom.historyListContainer.appendChild(card);
        });
    }

    // --- Trade Pop-up Modal Controller ---

    function openTradeModal(item) {
        activeModalItem = item;
        const isLong = item.direction === 'long';
        const tickerName = item.ticker || 'BTC';
        const entry = parseFloat(item.entry) || 0;
        const sl = parseFloat(item.sl) || 0;
        const lev = parseInt(item.leverage || item.lev) || 10;
        const riskUsdt = parseFloat(item.riskUsdt) || 0;

        const stopDistanceAbs = Math.abs(entry - sl);
        const stopDistancePct = item.stopDistancePct || (entry > 0 ? (stopDistanceAbs / entry) * 100 : 0);

        const posVal = parseFloat(item.posValueUsdt || item.posUsdt) || (stopDistancePct > 0 ? riskUsdt / (stopDistancePct / 100) : 0);
        const posCoins = parseFloat(item.posCoins) || (entry > 0 ? posVal / entry : 0);
        const marginUsdt = parseFloat(item.marginUsdt) || (lev > 0 ? posVal / lev : 0);

        const cap = parseFloat(item.capital || item.cap) || (item.riskPercent ? (riskUsdt / (item.riskPercent / 100)) : (riskUsdt * 100));
        const riskPct = item.riskPercent || item.riskPct || (cap > 0 ? (riskUsdt / cap) * 100 : 1.0);

        const mmr = 0.004;
        const liqPrice = item.liqPrice || (isLong ? entry * (1 - (1 / lev) + mmr) : entry * (1 + (1 / lev) - mmr));

        dom.modalTitle.textContent = `${isLong ? '🟢 LONG' : '🔴 SHORT'} ${tickerName} (${lev}x)`;
        dom.modalTitle.className = isLong ? 'green' : 'red';
        dom.modalTimestamp.textContent = `Сохранено в ${item.timestamp}`;

        let html = `
            <div class="modal-grid-stats">
                <div class="modal-stat-box">
                    <span class="title">Капитал</span>
                    <span class="value">$${cap.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                </div>
                <div class="modal-stat-box">
                    <span class="title">Сумма Риска (SL)</span>
                    <span class="value red">${formatUsdt(riskUsdt)} (${riskPct.toFixed(2)}%)</span>
                </div>
                <div class="modal-stat-box">
                    <span class="title">${item.mode === 'multi' ? 'Ср. Цена Входа' : 'Цена Входа'}</span>
                    <span class="value accent">$${formatPrice(entry)}</span>
                </div>
                <div class="modal-stat-box">
                    <span class="title">Стоп-лосс (SL)</span>
                    <span class="value red">$${formatPrice(sl)} (-${stopDistancePct.toFixed(2)}%)</span>
                </div>
                <div class="modal-stat-box">
                    <span class="title">Объём позиции</span>
                    <span class="value accent">${formatUsdt(posVal)}</span>
                </div>
                <div class="modal-stat-box">
                    <span class="title">Маржа</span>
                    <span class="value">${formatUsdt(marginUsdt)}</span>
                </div>
                <div class="modal-stat-box">
                    <span class="title">Монеты</span>
                    <span class="value">${formatCoins(posCoins)} Qty</span>
                </div>
                <div class="modal-stat-box">
                    <span class="title">Ликвидация</span>
                    <span class="value warning">$${formatPrice(liqPrice)}</span>
                </div>
            </div>
        `;

        if (item.mode === 'multi' && item.multiBreakdown && item.multiBreakdown.length > 0) {
            html += `
                <div style="margin-top: 6px;">
                    <h4 style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px;">Сетка лимитных ордеров (DCA)</h4>
                    <table class="modal-rr-table">
                        <thead>
                            <tr>
                                <th>Ордер #</th>
                                <th>Цена входа</th>
                                <th>Доля (%)</th>
                                <th>Номинал ($)</th>
                                <th>Монеты (Qty)</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            item.multiBreakdown.forEach(row => {
                html += `
                    <tr>
                        <td><b>Ордер #${row.index}</b></td>
                        <td class="accent">$${formatPrice(row.price)}</td>
                        <td>${row.weightPct}%</td>
                        <td class="green">${formatUsdt(row.orderUsdt)}</td>
                        <td>${formatCoins(row.orderCoins)} Qty</td>
                    </tr>
                `;
            });
            html += `</tbody></table></div>`;
        }

        // Target R:R comparison table
        let rrModes = item.rrModes;
        if (!rrModes || rrModes.length === 0) {
            const feeRate = (parseFloat(item.feePercent || 0.05)) / 100;
            const presetRrs = [3, 5, 6, 10, parseFloat(item.customRr || 4)];
            rrModes = presetRrs.map(r => {
                const tpPrice = isLong ? entry + (r * stopDistanceAbs) : entry - (r * stopDistanceAbs);
                const grossProfitUsdt = riskUsdt * r;
                const entryFeeUsdt = posVal * feeRate;
                const exitPosValueUsdt = posCoins * tpPrice;
                const exitFeeUsdt = exitPosValueUsdt * feeRate;
                const totalFeeUsdt = entryFeeUsdt + exitFeeUsdt;
                const netProfitUsdt = Math.max(0, grossProfitUsdt - totalFeeUsdt);
                const accountGrowthPct = cap > 0 ? (netProfitUsdt / cap) * 100 : 0;
                const roePct = marginUsdt > 0 ? (netProfitUsdt / marginUsdt) * 100 : 0;
                return { rr: r, tpPrice, grossProfitUsdt, totalFeeUsdt, netProfitUsdt, accountGrowthPct, roePct };
            });
        }

        html += `
            <div style="margin-top: 6px;">
                <h4 style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px;">Целевые уровни Risk : Reward</h4>
                <table class="modal-rr-table">
                    <thead>
                        <tr>
                            <th>Соотношение</th>
                            <th>Целевая цена (TP)</th>
                            <th>Чистая прибыль ($)</th>
                            <th>Прирост депозита</th>
                            <th>ROE %</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        rrModes.forEach(m => {
            html += `
                <tr>
                    <td><b class="green">1 : ${m.rr}</b></td>
                    <td class="accent"><b>$${formatPrice(m.tpPrice)}</b></td>
                    <td class="green"><b>${formatUsdt(m.netProfitUsdt)}</b></td>
                    <td class="green">+${(m.accountGrowthPct || 0).toFixed(2)}%</td>
                    <td>+${(m.roePct || 0).toFixed(1)}%</td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;

        dom.modalBodyContent.innerHTML = html;
        dom.tradeModal.classList.remove('hidden');
    }

    function closeTradeModal() {
        dom.tradeModal.classList.add('hidden');
        activeModalItem = null;
    }

    function restoreTradeToCalculator(item) {
        if (!item) return;

        state.ticker = item.ticker || 'BTC';
        state.direction = item.direction || 'long';
        state.entryMode = item.mode || 'single';
        state.capital = item.capital || item.cap || 10000;
        localStorage.setItem('trading_capital', state.capital);
        state.riskPercent = item.riskPercent || item.riskPct || 1.0;
        state.entryPrice = item.entry || 65000;
        state.stopLossPrice = item.sl || 64000;
        state.leverage = item.leverage || item.lev || 10;

        if (item.feePercent !== undefined) state.feePercent = item.feePercent;
        if (item.customRr !== undefined) state.customRr = item.customRr;
        if (item.multiOrders) state.multiOrders = JSON.parse(JSON.stringify(item.multiOrders));
        if (item.partialTps) state.partialTps = JSON.parse(JSON.stringify(item.partialTps));

        dom.tickerInput.value = state.ticker;
        dom.capitalInput.value = state.capital;
        dom.riskPercentInput.value = state.riskPercent;
        dom.riskSlider.value = state.riskPercent;
        dom.entryPriceInput.value = state.entryPrice;
        dom.stopLossInput.value = state.stopLossPrice;
        dom.leverageInput.value = state.leverage;
        dom.leverageSlider.value = state.leverage;

        if (state.direction === 'long') {
            dom.dirLong.classList.add('active');
            dom.dirShort.classList.remove('active');
        } else {
            dom.dirShort.classList.add('active');
            dom.dirLong.classList.remove('active');
        }

        if (state.entryMode === 'multi') {
            dom.entryModeMulti.classList.add('active');
            dom.entryModeSingle.classList.remove('active');
            dom.singleEntryGroup.classList.add('hidden');
            dom.multiEntryGroup.classList.remove('hidden');
            renderMultiOrdersList();
        } else {
            dom.entryModeSingle.classList.add('active');
            dom.entryModeMulti.classList.remove('active');
            dom.singleEntryGroup.classList.remove('hidden');
            dom.multiEntryGroup.classList.add('hidden');
        }

        updateUI();
        closeTradeModal();
        showToast(`Сделка ${state.ticker} загружена в калькулятор!`);
    }

    function showToast(msg) {
        dom.toast.textContent = msg;
        dom.toast.classList.remove('hidden');
        setTimeout(() => {
            dom.toast.classList.add('hidden');
        }, 2500);
    }

    // --- Event Listeners Setup ---

    function setupEventListeners() {
        // Ticker input
        dom.tickerInput.addEventListener('input', (e) => {
            state.ticker = e.target.value;
            updateUI();
        });

        // Entry Mode Switcher
        dom.entryModeSingle.addEventListener('click', () => {
            state.entryMode = 'single';
            dom.entryModeSingle.classList.add('active');
            dom.entryModeMulti.classList.remove('active');
            dom.singleEntryGroup.classList.remove('hidden');
            dom.multiEntryGroup.classList.add('hidden');
            updateUI();
        });

        dom.entryModeMulti.addEventListener('click', () => {
            state.entryMode = 'multi';
            dom.entryModeMulti.classList.add('active');
            dom.entryModeSingle.classList.remove('active');
            dom.singleEntryGroup.classList.add('hidden');
            dom.multiEntryGroup.classList.remove('hidden');
            updateUI();
        });

        // Add Multi-Order button
        dom.addMultiOrderBtn.addEventListener('click', () => {
            const lastPrice = state.multiOrders.length > 0 ? state.multiOrders[state.multiOrders.length - 1].price : state.entryPrice;
            const stepOffset = state.direction === 'long' ? 0.98 : 1.02;
            const newPrice = lastPrice * stepOffset;
            state.multiOrders.push({ price: parseFloat(newPrice.toFixed(4)), weightPct: 20 });
            renderMultiOrdersList();
            updateUI();
        });

        // Direction buttons
        dom.dirLong.addEventListener('click', () => {
            state.direction = 'long';
            dom.dirLong.classList.add('active');
            dom.dirShort.classList.remove('active');
            updateUI();
        });

        dom.dirShort.addEventListener('click', () => {
            state.direction = 'short';
            dom.dirShort.classList.add('active');
            dom.dirLong.classList.remove('active');
            updateUI();
        });

        // Numeric inputs
        dom.capitalInput.addEventListener('input', (e) => {
            state.capital = parseFloat(e.target.value) || 0;
            localStorage.setItem('trading_capital', state.capital);
            updateUI();
        });

        dom.entryPriceInput.addEventListener('input', (e) => {
            state.entryPrice = parseFloat(e.target.value) || 0;
            updateUI();
        });

        dom.stopLossInput.addEventListener('input', (e) => {
            state.stopLossPrice = parseFloat(e.target.value) || 0;
            updateUI();
        });

        // Risk Slider & Input sync
        dom.riskSlider.addEventListener('input', (e) => {
            state.riskPercent = parseFloat(e.target.value);
            dom.riskPercentInput.value = state.riskPercent;
            updateUI();
        });

        dom.riskPercentInput.addEventListener('input', (e) => {
            state.riskPercent = parseFloat(e.target.value) || 0;
            dom.riskSlider.value = state.riskPercent;
            updateUI();
        });

        // Risk Presets
        document.querySelectorAll('.risk-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.risk-preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.riskPercent = parseFloat(btn.dataset.risk);
                dom.riskSlider.value = state.riskPercent;
                dom.riskPercentInput.value = state.riskPercent;
                updateUI();
            });
        });

        // Leverage Slider & Input sync
        dom.leverageSlider.addEventListener('input', (e) => {
            state.leverage = parseInt(e.target.value);
            dom.leverageInput.value = state.leverage;
            updateUI();
        });

        dom.leverageInput.addEventListener('input', (e) => {
            state.leverage = parseInt(e.target.value) || 1;
            dom.leverageSlider.value = state.leverage;
            updateUI();
        });

        // Custom R:R Input
        dom.customRrInput.addEventListener('input', (e) => {
            state.customRr = parseFloat(e.target.value) || 4;
            updateUI();
        });

        // Collapsible Fee
        dom.feeToggle.addEventListener('click', () => {
            dom.feeContent.classList.toggle('open');
        });

        dom.feeInput.addEventListener('input', (e) => {
            state.feePercent = parseFloat(e.target.value) || 0;
            updateUI();
        });

        // Tab Switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');

                if (btn.dataset.tab === 'tabVisualizer') {
                    drawVisualizerCanvas(calculateTrade());
                }
            });
        });

        // Canvas Toggles
        dom.visToggleGrid.addEventListener('click', () => {
            state.showGrid = !state.showGrid;
            dom.visToggleGrid.classList.toggle('active', state.showGrid);
            drawVisualizerCanvas(calculateTrade());
        });

        dom.visToggleLiq.addEventListener('click', () => {
            state.showLiq = !state.showLiq;
            dom.visToggleLiq.classList.toggle('active', state.showLiq);
            drawVisualizerCanvas(calculateTrade());
        });

        // Add Partial TP step
        dom.addTpStepBtn.addEventListener('click', () => {
            const nextRr = (state.partialTps.length + 1) * 3;
            state.partialTps.push({ rr: nextRr, allocPct: 20 });
            renderPartialTpSteps();
            updateUI();
        });

        // Copy & Save
        dom.copySummaryBtn.addEventListener('click', () => {
            const text = generateTradeSummaryText();
            navigator.clipboard.writeText(text).then(() => {
                showToast('Сводка скопирована в буфер обмена!');
            });
        });

        dom.saveHistoryBtn.addEventListener('click', () => {
            saveCurrentTradeToHistory();
        });

        dom.clearHistoryBtn.addEventListener('click', () => {
            state.history = [];
            localStorage.removeItem('trading_rr_history');
            renderHistory();
            showToast('История очищена');
        });

        dom.resetBtn.addEventListener('click', () => {
            state.ticker = 'BTC';
            state.capital = 10000;
            localStorage.setItem('trading_capital', 10000);
            state.riskPercent = 1.0;
            state.entryPrice = 65000;
            state.stopLossPrice = 64000;
            state.leverage = 10;
            state.entryMode = 'single';
            dom.tickerInput.value = 'BTC';
            dom.entryModeSingle.click();
            dom.capitalInput.value = 10000;
            dom.riskPercentInput.value = 1.0;
            dom.riskSlider.value = 1.0;
            dom.entryPriceInput.value = 65000;
            dom.stopLossInput.value = 64000;
            dom.leverageInput.value = 10;
            dom.leverageSlider.value = 10;
            updateUI();
        });

        // Modal Close listeners
        dom.closeModalBtn.addEventListener('click', closeTradeModal);
        dom.modalCloseBtn.addEventListener('click', closeTradeModal);
        dom.tradeModal.addEventListener('click', (e) => {
            if (e.target === dom.tradeModal) closeTradeModal();
        });

        dom.modalRestoreBtn.addEventListener('click', () => {
            if (activeModalItem) restoreTradeToCalculator(activeModalItem);
        });

        dom.modalCopyBtn.addEventListener('click', () => {
            if (activeModalItem) {
                const text = generateTradeSummaryText(activeModalItem);
                navigator.clipboard.writeText(text).then(() => {
                    showToast('Сводка сделки скопирована!');
                });
            }
        });

        dom.modalDeleteBtn.addEventListener('click', () => {
            if (activeModalItem) {
                deleteTradeFromHistory(activeModalItem.id);
            }
        });

        window.addEventListener('resize', () => {
            drawVisualizerCanvas(calculateTrade());
        });
    }

    // --- Initialize ---
    dom.capitalInput.value = state.capital;
    renderMultiOrdersList();
    renderPartialTpSteps();
    renderHistory();
    setupEventListeners();
    updateUI();
});
