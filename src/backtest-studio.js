import { createChart, CandlestickSeries, ColorType, CrosshairMode, createSeriesMarkers } from 'lightweight-charts';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { api } from './api.js';
import {
  BT_INDICATORS, BT_OPERATORS, BT_PRESETS, defaultBacktestConfig,
  extractSweepableParameters, parseOHLCVImport, runOpenBacktest,
  runParameterSweep, setParameterAtPath, validateStrategyImport,
} from './backtest-engine.js';
import { normalizeCandles } from './analytics.js';
import { serializeCSV } from './exports.js';
import { axisPriceFormat, displayPrice, moneyMarkup } from './currency.js';
import { pricePrecision } from './numbers.js';
import { palette } from './theme.js';
import { PHONE_LAYOUT, chartScrollOptions } from './phone-layout.js';
import { reveal } from './motion.js';
import { download, esc, icon, num, pct, toast, tone } from './ui.js';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);

const INTERVAL_CHOICES = ['1m', '5m', '15m', '1h', '4h', '1d'];
const CANDLE_DEPTH_CHOICES = [
  [500, '500 candles (~fast)'],
  [1000, '1,000 candles'],
  [2000, '2,000 candles'],
  [4000, '4,000 candles (max history)'],
];

function fmtTime(sec) {
  return Number.isFinite(sec) ? new Date(sec * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—';
}

function fmtRatio(val, decimals = 2) {
  if (val === Infinity) return '∞';
  return Number.isFinite(val) ? val.toFixed(decimals) : '—';
}

function indicatorOptionHtml(selected) {
  return BT_INDICATORS.map(item => `<option value="${item.id}" ${item.id === selected ? 'selected' : ''}>${esc(item.label)}</option>`).join('');
}

function operandParamsHtml(operand, groupKey, idx, side) {
  const meta = BT_INDICATORS.find(item => item.id === operand.type);
  if (!meta || !meta.params.length) return '';
  return meta.params.map(p => {
    const val = operand[p.key] ?? p.default;
    if (p.text) {
      return `<label class="bt-param bt-param-wide"><span>${esc(p.label)}</span><input type="text" data-bt-param="${groupKey}|${idx}|${side}|${p.key}" value="${esc(String(val))}" placeholder="e.g. ema(close, 12) - ema(close, 26)"></label>`;
    }
    return `<label class="bt-param"><span>${esc(p.label)}</span><input type="number" data-bt-param="${groupKey}|${idx}|${side}|${p.key}" value="${esc(String(val))}" min="${p.min}" max="${p.max}" step="${p.step ?? 1}"></label>`;
  }).join('');
}

function renderRuleRow(rule, groupKey, idx, canDelete) {
  return `<div class="bt-rule-row" data-rule-group="${groupKey}" data-rule-idx="${idx}">
   <div class="bt-rule-side">
    <select aria-label="Left indicator" data-bt-type="${groupKey}|${idx}|left">${indicatorOptionHtml(rule.left.type)}</select>
    <div class="bt-param-strip">${operandParamsHtml(rule.left, groupKey, idx, 'left')}</div>
   </div>
   <select class="bt-rule-op" aria-label="Condition operator" data-bt-op="${groupKey}|${idx}">
    ${BT_OPERATORS.map(o => `<option value="${o.id}" ${o.id === rule.op ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
   </select>
   <div class="bt-rule-side">
    <select aria-label="Right indicator" data-bt-type="${groupKey}|${idx}|right">${indicatorOptionHtml(rule.right.type)}</select>
    <div class="bt-param-strip">${operandParamsHtml(rule.right, groupKey, idx, 'right')}</div>
   </div>
   ${canDelete ? `<button type="button" class="icon-button bt-del-rule" data-bt-del="${groupKey}|${idx}" aria-label="Remove rule">${icon('trash-2')}</button>` : '<span class="bt-rule-spacer"></span>'}
  </div>`;
}

function makeSampleCsv() {
  const start = Math.floor(Date.now() / 86400000) * 86400 - 300 * 3600;
  let price = 100;
  const rows = [];
  for (let i = 0; i < 300; i++) {
    const t = new Date((start + i * 3600) * 1000).toISOString();
    const drift = Math.sin(i / 18) * 0.008 + ((i * 17) % 11 - 5) * 0.0012;
    const open = price;
    const close = Math.max(10, open * (1 + drift));
    const high = Math.max(open, close) * 1.004;
    const low = Math.min(open, close) * 0.996;
    const vol = Math.round(120 + Math.abs(Math.cos(i / 9)) * 280);
    price = close;
    rows.push([t, open.toFixed(4), high.toFixed(4), low.toFixed(4), close.toFixed(4), vol]);
  }
  return serializeCSV(['time', 'open', 'high', 'low', 'close', 'volume'], rows);
}

export function mountBacktestStudio({ root, instrument, getInstruments, storage, hydrate, onInstrument }) {
  const controller = new AbortController();
  const { signal } = controller;

  let currentInst = instrument ?? { venue: 'binance', symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT' };
  let interval = '1h';
  let candleDepth = 1000;
  let dataSource = 'exchange'; // 'exchange' | 'custom'
  let customDatasetName = '';
  let loadedBars = [];
  let loadedMeta = '';
  let config = defaultBacktestConfig();
  let lastResult = null;
  let lastSweep = null;
  let tradeFilter = 'all';
  let activeResultTab = 'overview';
  let fetchController = null;
  let priceChart = null;
  let equityChart = null;
  let resizeObserver = null;

  try {
    const saved = storage?.getItem?.('cryptoz.backtest.v1');
    if (saved) config = validateStrategyImport(saved);
  } catch {}

  const persistConfig = () => {
    try { storage?.setItem?.('cryptoz.backtest.v1', JSON.stringify(config)); } catch {}
  };

  const disposeCharts = () => {
    resizeObserver?.disconnect(); resizeObserver = null;
    priceChart?.remove(); priceChart = null;
    equityChart?.dispose(); equityChart = null;
  };
  signal.addEventListener('abort', () => { fetchController?.abort(); disposeCharts(); }, { once: true });

  root.innerHTML = `
  <div class="bt-studio">
   <section class="panel bt-data-panel">
    <div class="panel-top">
     <div><h2>1. Historical Market Data</h2><span class="source">Use live exchange history (up to 4,000 candles) or import any custom CSV / JSON OHLCV dataset</span></div>
     <div class="news-sort-toggle" role="group" aria-label="Backtest data source">
      <button type="button" data-bt-source="exchange" aria-pressed="true">Live exchange</button>
      <button type="button" data-bt-source="custom" aria-pressed="false">Import CSV / JSON</button>
     </div>
    </div>
    <div id="bt-exchange-controls" class="bt-grid-controls">
     <label>Exchange<select id="bt-venue"><option value="binance">Binance spot</option><option value="coinbase">Coinbase spot</option></select><small class="bt-hint">Choose which exchange's historical candles to test on.</small></label>
     <label>Trading pair<select id="bt-pair"></select><small class="bt-hint">Any spot coin pair supported by the chosen venue.</small></label>
     <label>Candle interval<select id="bt-interval">${INTERVAL_CHOICES.map(iv => `<option value="${iv}" ${iv === interval ? 'selected' : ''}>${iv}</option>`).join('')}</select><small class="bt-hint">Time represented by each bar (e.g. 1h = 1 hour).</small></label>
     <label>History depth<select id="bt-depth">${CANDLE_DEPTH_CHOICES.map(([n, lbl]) => `<option value="${n}" ${n === candleDepth ? 'selected' : ''}>${lbl}</option>`).join('')}</select><small class="bt-hint">More candles = stronger statistical confidence.</small></label>
     <div class="bt-load-action"><button type="button" class="button primary" id="bt-load-btn">${icon('refresh-cw')} Load &amp; test</button></div>
    </div>
    <div id="bt-custom-controls" class="bt-custom-import" hidden>
     <div class="bt-import-row">
      <label class="bt-file-label">Upload OHLCV file (.csv or .json)<input type="file" id="bt-data-file" accept=".csv,.json,.txt"><small class="bt-hint">Columns: time/date, open, high, low, close, volume. Works with stocks, crypto, forex or synthetic data.</small></label>
      <button type="button" class="button" id="bt-sample-csv">${icon('download')} Sample CSV</button>
     </div>
     <textarea id="bt-data-paste" rows="3" placeholder="Or paste CSV / JSON OHLCV rows directly here…"></textarea>
     <div class="bt-import-actions">
      <button type="button" class="button primary" id="bt-apply-custom-data">${icon('upload')} Use imported dataset</button>
      <span id="bt-custom-status" class="source" role="status"></span>
     </div>
    </div>
    <div class="bt-status-strip" id="bt-data-status" role="status">Loading market history…</div>
   </section>

   <section class="panel bt-builder-panel">
    <div class="panel-top">
     <div><h2>2. Open Strategy Builder (Unlimited Rules &amp; Parameters)</h2><span class="source">Pick a starter template or combine unlimited custom indicators, formulas &amp; risk controls</span></div>
     <div class="bt-strategy-io">
      <button type="button" class="button" id="bt-import-strat">${icon('upload')} Import JSON</button>
      <button type="button" class="button" id="bt-export-strat">${icon('download')} Export JSON</button>
      <input type="file" id="bt-strat-file" accept=".json" hidden>
     </div>
    </div>
    <div class="bt-presets" role="group" aria-label="Strategy templates">
     ${BT_PRESETS.map(p => `<button type="button" class="chip" data-bt-preset="${p.id}" title="${esc(p.summary)}">${esc(p.name)}</button>`).join('')}
    </div>
    <p class="data-note" id="bt-preset-desc"></p>

    <div class="bt-rules-shell">
     <div class="bt-rule-card">
      <div class="bt-rule-header">
       <div><strong>Long Entry Conditions</strong><small class="bt-hint">Opens a Buy position on the next candle's open when triggered.</small></div>
       <div class="bt-rule-head-actions">
        <select id="bt-entry-logic" aria-label="Entry rule combination"><option value="AND">ALL rules match (AND)</option><option value="OR">ANY rule matches (OR)</option></select>
        <button type="button" class="button" data-bt-add="entryRules">${icon('plus')} Add rule</button>
       </div>
      </div>
      <div id="bt-rules-entryRules" class="bt-rule-list"></div>
     </div>

     <div class="bt-rule-card">
      <div class="bt-rule-header">
       <div><strong>Long Exit Conditions</strong><small class="bt-hint">Closes an open Long position on the next candle's open.</small></div>
       <div class="bt-rule-head-actions">
        <select id="bt-exit-logic" aria-label="Exit rule combination"><option value="OR">ANY rule matches (OR)</option><option value="AND">ALL rules match (AND)</option></select>
        <button type="button" class="button" data-bt-add="exitRules">${icon('plus')} Add rule</button>
       </div>
      </div>
      <div id="bt-rules-exitRules" class="bt-rule-list"></div>
     </div>

     <div class="bt-rule-card" id="bt-short-entry-card" hidden>
      <div class="bt-rule-header">
       <div><strong>Short Entry Conditions</strong><small class="bt-hint">Opens a Short (sell-first) position to profit if price drops.</small></div>
       <button type="button" class="button" data-bt-add="shortEntryRules">${icon('plus')} Add rule</button>
      </div>
      <div id="bt-rules-shortEntryRules" class="bt-rule-list"></div>
     </div>

     <div class="bt-rule-card" id="bt-short-exit-card" hidden>
      <div class="bt-rule-header">
       <div><strong>Short Exit Conditions</strong><small class="bt-hint">Covers an open Short position on the next open.</small></div>
       <button type="button" class="button" data-bt-add="shortExitRules">${icon('plus')} Add rule</button>
      </div>
      <div id="bt-rules-shortExitRules" class="bt-rule-list"></div>
     </div>
    </div>

    <details class="guide-disclosure bt-risk-box" open>
     <summary>Execution, Position Sizing, Risk Controls &amp; Walk-Forward Split</summary>
     <div class="bt-risk-grid">
      <label>Direction
       <select id="bt-direction"><option value="long">Long only (Buy → Sell)</option><option value="both">Long &amp; Short (Two-way)</option><option value="short">Short only (Sell → Cover)</option></select>
       <small class="bt-hint">Beginners usually start with Long only.</small>
      </label>
      <label>Starting capital
       <input id="bt-capital" type="number" min="1" max="1000000000" step="any">
       <small class="bt-hint">Virtual starting account balance.</small>
      </label>
      <label>Position sizing
       <select id="bt-sizing-mode"><option value="pct_equity">% of account equity</option><option value="fixed_quote">Fixed quote amount</option><option value="risk_pct">Risk % per trade (needs SL)</option></select>
       <small class="bt-hint">How much capital each trade allocates.</small>
      </label>
      <label>Sizing value
       <input id="bt-sizing-val" type="number" min="0.1" max="1000000000" step="any">
       <small class="bt-hint" id="bt-sizing-hint">% of cash deployed per trade (e.g. 100 = full balance).</small>
      </label>
      <label>Stop Loss
       <div class="bt-inline-pair"><select id="bt-sl-mode"><option value="none">Off</option><option value="pct">Percent %</option><option value="atr">ATR ×</option></select><input id="bt-sl-val" type="number" min="0.1" max="99" step="0.1"></div>
       <small class="bt-hint">Automatic loss cap tested realistically on candle lows/highs.</small>
      </label>
      <label>Take Profit
       <div class="bt-inline-pair"><select id="bt-tp-mode"><option value="none">Off</option><option value="pct">Percent %</option><option value="atr">ATR ×</option></select><input id="bt-tp-val" type="number" min="0.1" max="500" step="0.1"></div>
       <small class="bt-hint">Automatic profit target level per trade.</small>
      </label>
      <label>Trailing Stop
       <div class="bt-inline-pair"><select id="bt-tr-mode"><option value="none">Off</option><option value="pct">Percent %</option><option value="atr">ATR ×</option></select><input id="bt-tr-val" type="number" min="0.1" max="99" step="0.1"></div>
       <small class="bt-hint">Moves stop behind favorable price peaks to lock gains.</small>
      </label>
      <label>Trading fee (bps)
       <input id="bt-fee" type="number" min="0" max="1000" step="0.5">
       <small class="bt-hint">10 bps = 0.10% typical spot fee per side.</small>
      </label>
      <label>Slippage (bps)
       <input id="bt-slippage" type="number" min="0" max="1000" step="0.5">
       <small class="bt-hint">Price friction on fill (5 bps = 0.05%).</small>
      </label>
      <label>Max hold (bars)
       <input id="bt-maxhold" type="number" min="0" max="5000" step="1">
       <small class="bt-hint">0 = no limit; else forces exit after N bars.</small>
      </label>
      <label>Cooldown (bars)
       <input id="bt-cooldown" type="number" min="0" max="500" step="1">
       <small class="bt-hint">Wait N bars after exit before re-entering.</small>
      </label>
      <label>Walk-forward IS split (%)
       <input id="bt-split" type="number" min="0" max="90" step="5">
       <small class="bt-hint">70% tests the last 30% as unseen out-of-sample data.</small>
      </label>
     </div>
    </details>

    <div class="bt-run-bar">
     <button type="button" class="button primary" id="bt-run-btn">${icon('activity')} Run backtest</button>
     <button type="button" class="button" id="bt-reset-btn">Reset to default</button>
     <span class="source">Zero lookahead: signals check closed candles and fill at the next bar's open with fees &amp; slippage.</span>
    </div>
   </section>

   <section class="panel bt-results-panel" id="bt-results-shell">
    <div class="panel-top">
     <div><h2>3. Performance, Visuals &amp; Optimizer</h2><span class="source" id="bt-result-subtitle">Run a backtest to inspect equity, drawdown, trade markers, walk-forward check and parameter sweep</span></div>
     <div class="bt-result-tabs" role="tablist">
      <button type="button" class="chip selected" data-bt-rtab="overview">Overview &amp; Charts</button>
      <button type="button" class="chip" data-bt-rtab="optimizer">Parameter Optimizer</button>
      <button type="button" class="chip" data-bt-rtab="trades">Trade Ledger</button>
     </div>
    </div>
    <div id="bt-results-body"><p class="data-note">Loading candles and running initial backtest…</p></div>
    <details class="guide-disclosure bt-glossary">
     <summary>Beginner guide to backtesting &amp; performance metrics</summary>
     <dl class="chart-observations">
      <div><dt>Net Return vs Buy &amp; Hold</dt><dd>Shows whether your strategy beat simply buying the coin at the start and holding it through the same dates.</dd></div>
      <div><dt>Sharpe &amp; Sortino Ratios</dt><dd>Return earned per unit of risk (annualized 24/7 for crypto). Above 1.0 is solid; Sortino focuses strictly on downside volatility.</dd></div>
      <div><dt>Max Drawdown</dt><dd>Largest peak-to-trough drop in account value. Always check whether you could emotionally survive that drop live.</dd></div>
      <div><dt>Profit Factor &amp; Expectancy</dt><dd>Profit Factor = gross winning trades ÷ gross losing trades (&gt;1.3 is healthy). Expectancy is average net profit per trade.</dd></div>
      <div><dt>In-Sample vs Out-of-Sample</dt><dd>If a strategy looks amazing on the first 70% of bars but collapses on the unseen last 30%, it was likely overfitted to past noise.</dd></div>
     </dl>
    </details>
   </section>
  </div>`;

  const $ = sel => root.querySelector(sel);

  function syncPairs() {
    const venue = $('#bt-venue').value;
    const list = [...(getInstruments?.(venue) ?? [])];
    if (!list.some(x => x.symbol === currentInst.symbol) && currentInst.venue === venue) list.unshift(currentInst);
    list.sort((a, b) => a.base.localeCompare(b.base));
    if (!list.length) list.push({ venue, base: 'BTC', quote: venue === 'binance' ? 'USDT' : 'USD', symbol: venue === 'binance' ? 'BTCUSDT' : 'BTC-USD' });
    $('#bt-pair').innerHTML = list.map(x => `<option value="${esc(x.symbol)}">${esc(x.base)}/${esc(x.quote)}</option>`).join('');
    if (list.some(x => x.symbol === currentInst.symbol)) $('#bt-pair').value = currentInst.symbol;
    else {
      currentInst = list.find(x => x.base === 'BTC') ?? list[0];
      $('#bt-pair').value = currentInst.symbol;
    }
  }

  function renderRuleEditors() {
    for (const groupKey of ['entryRules', 'exitRules', 'shortEntryRules', 'shortExitRules']) {
      const host = $(`#bt-rules-${groupKey}`);
      if (!host) continue;
      const list = config[groupKey] ?? [];
      host.innerHTML = list.map((rule, idx) => renderRuleRow(rule, groupKey, idx, list.length > 1)).join('');
    }
    const showShort = config.direction !== 'long';
    $('#bt-short-entry-card').hidden = !showShort;
    $('#bt-short-exit-card').hidden = !showShort;
    $('#bt-entry-logic').value = config.entryLogic;
    $('#bt-exit-logic').value = config.exitLogic;
    $('#bt-direction').value = config.direction;
    $('#bt-capital').value = config.initialCapital;
    $('#bt-sizing-mode').value = config.sizingMode;
    $('#bt-sizing-val').value = config.sizingValue;
    $('#bt-sizing-hint').textContent = config.sizingMode === 'pct_equity'
      ? '% of cash deployed per trade (e.g. 100 = full balance).'
      : config.sizingMode === 'fixed_quote'
      ? 'Fixed quote amount per entry (e.g. 2500 USDT).'
      : 'Max % of account risked per Stop-Loss hit (requires Stop Loss enabled).';
    $('#bt-sl-mode').value = config.stopLossMode;
    $('#bt-sl-val').value = config.stopLossValue;
    $('#bt-sl-val').disabled = config.stopLossMode === 'none';
    $('#bt-tp-mode').value = config.takeProfitMode;
    $('#bt-tp-val').value = config.takeProfitValue;
    $('#bt-tp-val').disabled = config.takeProfitMode === 'none';
    $('#bt-tr-mode').value = config.trailingMode;
    $('#bt-tr-val').value = config.trailingValue;
    $('#bt-tr-val').disabled = config.trailingMode === 'none';
    $('#bt-fee').value = config.feeBps;
    $('#bt-slippage').value = config.slippageBps;
    $('#bt-maxhold').value = config.maxHoldBars;
    $('#bt-cooldown').value = config.cooldownBars;
    $('#bt-split').value = config.splitPct;
    hydrate?.();
  }

  function quoteLabel() {
    return dataSource === 'custom' ? 'USD' : currentInst.quote;
  }

  async function loadExchangeHistory() {
    fetchController?.abort();
    const task = new AbortController();
    fetchController = task;
    const status = $('#bt-data-status');
    status.textContent = `Fetching up to ${candleDepth.toLocaleString()} ${interval} candles for ${currentInst.base}/${currentInst.quote} (${currentInst.venue})…`;
    try {
      let all = [];
      let before = null;
      const pages = Math.ceil(candleDepth / (currentInst.venue === 'binance' ? 500 : 295));
      for (let pg = 0; pg < pages && all.length < candleDepth; pg++) {
        const url = `candles?venue=${currentInst.venue}&symbol=${encodeURIComponent(currentInst.symbol)}&interval=${interval}${before ? '&before=' + before : ''}`;
        const res = await api(url, { signal: task.signal });
        if (task.signal.aborted) return;
        const bars = normalizeCandles(res.data?.bars ?? []);
        if (!bars.length) break;
        all = normalizeCandles([...bars, ...all]);
        before = all[0].time;
        if (bars.length < 50) break;
      }
      // Drop the currently forming final candle so tests only evaluate closed bars
      loadedBars = all.length > 35 ? all.slice(-candleDepth, -1) : all;
      if (loadedBars.length < 30) throw Error('Not enough closed historical candles returned for this pair.');
      loadedMeta = `${currentInst.venue.toUpperCase()} · ${currentInst.base}/${currentInst.quote} · ${interval} · ${loadedBars.length.toLocaleString()} closed candles (${fmtTime(loadedBars[0].time)} → ${fmtTime(loadedBars.at(-1).time)})`;
      status.textContent = loadedMeta;
      executeBacktest();
    } catch (err) {
      if (task.signal.aborted) return;
      loadedBars = [];
      status.textContent = `Data error: ${err.message}`;
      $('#bt-results-body').innerHTML = `<p class="data-note negative">${esc(err.message)}</p>`;
    }
  }

  function executeBacktest() {
    persistConfig();
    if (!loadedBars.length) {
      $('#bt-results-body').innerHTML = '<p class="data-note">Load exchange candles or import a CSV/JSON OHLCV dataset above first.</p>';
      return;
    }
    lastResult = runOpenBacktest(loadedBars, config, { interval: dataSource === 'exchange' ? interval : null });
    lastSweep = null;
    renderResults();
  }

  function mountVisualCharts(result) {
    disposeCharts();
    const p = palette();
    const priceHost = $('#bt-price-chart');
    const eqHost = $('#bt-equity-chart');
    const quote = quoteLabel();

    const isPhone = typeof matchMedia !== 'undefined' && matchMedia(PHONE_LAYOUT).matches;
    if (priceHost && loadedBars.length) {
      priceChart = createChart(priceHost, {
        autoSize: true,
        handleScroll: chartScrollOptions('cursor', isPhone),
        layout: { background: { type: ColorType.Solid, color: p.panel }, textColor: p.text, fontSize: 11, fontFamily: 'ui-monospace, monospace' },
        grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: p.border, scaleMargins: { top: 0.08, bottom: 0.1 } },
        timeScale: { borderColor: p.border, timeVisible: true, secondsVisible: false },
      });
      const candleSeries = priceChart.addSeries(CandlestickSeries, {
        upColor: p.up, downColor: p.down, borderVisible: false, wickUpColor: p.up, wickDownColor: p.down,
        priceFormat: axisPriceFormat(pricePrecision(loadedBars.at(-1)?.close), quote),
      });
      candleSeries.setData(loadedBars);
      const markers = [];
      for (const t of result.trades) {
        markers.push({
          time: t.entryTime,
          position: t.side === 'long' ? 'belowBar' : 'aboveBar',
          color: t.side === 'long' ? p.up : p.down,
          shape: t.side === 'long' ? 'arrowUp' : 'arrowDown',
          text: t.side === 'long' ? 'L' : 'S',
        });
        markers.push({
          time: t.exitTime,
          position: t.side === 'long' ? 'aboveBar' : 'belowBar',
          color: t.pnl >= 0 ? p.cyan : p.gold,
          shape: 'circle',
          text: t.reason === 'Stop loss' ? 'SL' : t.reason === 'Take profit' ? 'TP' : t.reason === 'Trailing stop' ? 'TS' : 'X',
        });
      }
      markers.sort((a, b) => a.time - b.time);
      createSeriesMarkers(candleSeries, markers);
      priceChart.timeScale().fitContent();
    }

    if (eqHost && result.equityCurve.length) {
      equityChart = echarts.init(eqHost);
      const times = result.equityCurve.map(pt => new Date(pt.time * 1000).toISOString().slice(0, 16).replace('T', ' '));
      const eqVals = result.equityCurve.map(pt => Number(pt.value.toFixed(2)));
      const bhVals = result.benchmarkCurve.map(pt => Number(pt.value.toFixed(2)));
      const ddVals = result.drawdownCurve.map(pt => Number(pt.value.toFixed(2)));
      const splitLabel = result.walkForward ? new Date(result.walkForward.splitTime * 1000).toISOString().slice(0, 16).replace('T', ' ') : null;

      equityChart.setOption({
        animation: false,
        textStyle: { color: p.text, fontFamily: 'DM Sans, system-ui, sans-serif', fontSize: 11 },
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, backgroundColor: p.panel, borderColor: p.border, textStyle: { color: p.text, fontSize: 11.5 } },
        legend: { top: 0, right: 12, textStyle: { color: p.text, fontSize: 11 } },
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        grid: [
          { left: isPhone ? 52 : 66, right: isPhone ? 12 : 18, top: 42, height: '49%' },
          { left: isPhone ? 52 : 66, right: isPhone ? 12 : 18, top: '71%', height: '21%' },
        ],
        xAxis: [
          { type: 'category', data: times, gridIndex: 0, axisLabel: { show: false }, axisLine: { lineStyle: { color: p.border } } },
          { type: 'category', data: times, gridIndex: 1, axisLabel: { color: p.text, fontSize: isPhone ? 9 : 10, hideOverlap: true }, axisLine: { lineStyle: { color: p.border } } },
        ],
        yAxis: [
          { type: 'value', gridIndex: 0, scale: true, splitLine: { lineStyle: { color: p.grid } }, axisLabel: { color: p.text, fontSize: isPhone ? 9.5 : 11 } },
          { type: 'value', gridIndex: 1, max: 0, splitLine: { lineStyle: { color: p.grid } }, axisLabel: { color: p.text, fontSize: isPhone ? 9.5 : 11, formatter: v => `${v}%` } },
        ],
        series: [
          {
            name: 'Strategy equity', type: 'line', xAxisIndex: 0, yAxisIndex: 0, showSymbol: false,
            lineStyle: { color: p.accent, width: 2 }, areaStyle: { color: p.accent, opacity: 0.14 }, data: eqVals,
            markLine: splitLabel ? { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: p.gold, width: 1.3 }, label: { formatter: 'Out-of-sample →', position: 'insideEndTop', color: p.gold, fontSize: 10 }, data: [{ xAxis: splitLabel }] } : undefined,
          },
          {
            name: 'Buy & hold', type: 'line', xAxisIndex: 0, yAxisIndex: 0, showSymbol: false,
            lineStyle: { color: p.text, width: 1.3, type: 'dashed', opacity: 0.65 }, data: bhVals,
          },
          {
            name: 'Drawdown %', type: 'line', xAxisIndex: 1, yAxisIndex: 1, showSymbol: false,
            lineStyle: { color: p.down, width: 1.4 }, areaStyle: { color: p.down, opacity: 0.2 }, data: ddVals,
          },
        ],
      });
      resizeObserver = new ResizeObserver(() => equityChart?.resize());
      resizeObserver.observe(eqHost);
    }
  }

  function renderResults() {
    const body = $('#bt-results-body');
    const sub = $('#bt-result-subtitle');
    for (const btn of root.querySelectorAll('[data-bt-rtab]')) {
      btn.classList.toggle('selected', btn.dataset.btRtab === activeResultTab);
    }
    if (!lastResult || !lastResult.ready) {
      disposeCharts();
      sub.textContent = lastResult?.reason ?? 'Waiting for valid backtest result';
      body.innerHTML = `<p class="data-note negative">${esc(lastResult?.reason ?? 'Unable to run backtest.')}</p>`;
      return;
    }
    const r = lastResult;
    const quote = quoteLabel();
    sub.textContent = `${r.sampleBars.toLocaleString()} evaluated bars · ${r.tradesCount} closed trades · ${fmtTime(r.startTime)} → ${fmtTime(r.endTime)}`;

    if (activeResultTab === 'overview') {
      const kpis = [
        ['Final equity', moneyMarkup(r.finalEquity, quote), tone(r.totalReturnPct)],
        ['Strategy return', pct(r.totalReturnPct), tone(r.totalReturnPct)],
        ['Buy &amp; hold', pct(r.buyHoldReturnPct), tone(r.buyHoldReturnPct)],
        ['Alpha vs B&amp;H', pct(r.alphaPct), tone(r.alphaPct)],
        ['Sharpe ratio', fmtRatio(r.sharpe), tone(r.sharpe)],
        ['Sortino ratio', fmtRatio(r.sortino), tone(r.sortino)],
        ['Calmar ratio', fmtRatio(r.calmar), tone(r.calmar)],
        ['Max drawdown', pct(r.maxDrawdownPct), 'negative'],
        ['Win rate', r.winRatePct !== null ? pct(r.winRatePct) : '—', ''],
        ['Profit factor', fmtRatio(r.profitFactor), r.profitFactor >= 1.2 ? 'positive' : r.profitFactor < 1 ? 'negative' : ''],
        ['Expectancy / trade', r.expectancyPct !== null ? pct(r.expectancyPct) : '—', tone(r.expectancyPct)],
        ['Payoff ratio', fmtRatio(r.payoffRatio), ''],
        ['Closed trades', `${r.tradesCount} (${r.wins}W / ${r.losses}L)`, ''],
        ['Avg bars held', r.avgBarsHeld !== null ? r.avgBarsHeld.toFixed(1) : '—', ''],
        ['Time in market', `${r.timeInMarketPct.toFixed(1)}%`, ''],
        ['Total fees paid', moneyMarkup(r.totalFees, quote), ''],
      ];
      const wf = r.walkForward;
      const wfTable = wf && wf.inSample && wf.outOfSample ? `<div class="bt-wf-box">
       <h3>Walk-Forward Overfitting Check (${wf.splitPct}% In-Sample vs ${100 - wf.splitPct}% Out-of-Sample)</h3>
       <p class="bt-hint">Compares earlier training window against unseen later candles (split at ${fmtTime(wf.splitTime)}).</p>
       <div class="practice-table" tabindex="0"><table>
        <thead><tr><th>Segment</th><th>Bars</th><th>Trades</th><th>Net Return</th><th>Sharpe</th><th>Max DD</th><th>Win Rate</th><th>Profit Factor</th></tr></thead>
        <tbody>
         <tr><th scope="row">In-Sample (${wf.splitPct}%)</th><td>${wf.inSample.bars}</td><td>${wf.inSample.tradesCount}</td><td class="${tone(wf.inSample.totalReturnPct)}">${pct(wf.inSample.totalReturnPct)}</td><td>${fmtRatio(wf.inSample.sharpe)}</td><td class="negative">${pct(wf.inSample.maxDrawdownPct)}</td><td>${wf.inSample.winRatePct !== null ? pct(wf.inSample.winRatePct) : '—'}</td><td>${fmtRatio(wf.inSample.profitFactor)}</td></tr>
         <tr><th scope="row">Out-of-Sample (${100 - wf.splitPct}%)</th><td>${wf.outOfSample.bars}</td><td>${wf.outOfSample.tradesCount}</td><td class="${tone(wf.outOfSample.totalReturnPct)}">${pct(wf.outOfSample.totalReturnPct)}</td><td>${fmtRatio(wf.outOfSample.sharpe)}</td><td class="negative">${pct(wf.outOfSample.maxDrawdownPct)}</td><td>${wf.outOfSample.winRatePct !== null ? pct(wf.outOfSample.winRatePct) : '—'}</td><td>${fmtRatio(wf.outOfSample.profitFactor)}</td></tr>
        </tbody>
       </table></div>
      </div>` : '';

      body.innerHTML = `
       <dl class="bt-kpi-grid">${kpis.map(([k, v, cls]) => `<div><dt>${k}</dt><dd class="${cls}">${v}</dd></div>`).join('')}</dl>
       <div class="bt-charts-stack">
        <div class="bt-chart-card"><div class="bt-chart-title"><strong>Price chart &amp; trade execution markers</strong><small>L = Long entry · S = Short entry · X = Rule exit · SL/TP/TS = Risk exit</small></div><div id="bt-price-chart" class="bt-price-chart"></div></div>
        <div class="bt-chart-card"><div class="bt-chart-title"><strong>Equity curve vs Buy &amp; Hold + Underwater drawdown</strong><small>Track compounding and peak-to-trough pain side by side</small></div><div id="bt-equity-chart" class="bt-equity-chart"></div></div>
       </div>
       ${wfTable}
       <div class="bt-export-bar">
        <button type="button" class="button" id="bt-csv-trades">${icon('download')} Export Trades CSV</button>
        <button type="button" class="button" id="bt-csv-equity">${icon('download')} Export Equity CSV</button>
       </div>`;
      hydrate?.();
      requestAnimationFrame(() => mountVisualCharts(r));
      $('#bt-csv-trades')?.addEventListener('click', () => {
        download(`cryptoz-backtest-trades-${currentInst.symbol}.csv`, serializeCSV(['id', 'side', 'entryTime', 'exitTime', 'entryPrice', 'exitPrice', 'quantity', 'fees', 'pnl', 'returnPct', 'barsHeld', 'reason'], r.trades.map(t => [t.id, t.side, new Date(t.entryTime * 1000).toISOString(), new Date(t.exitTime * 1000).toISOString(), t.entryPrice, t.exitPrice, t.quantity, t.fees, t.pnl, t.returnPct, t.barsHeld, t.reason])), 'text/csv');
      });
      $('#bt-csv-equity')?.addEventListener('click', () => {
        download(`cryptoz-backtest-equity-${currentInst.symbol}.csv`, serializeCSV(['time', 'strategyEquity', 'buyHoldEquity', 'drawdownPct'], r.equityCurve.map((pt, i) => [new Date(pt.time * 1000).toISOString(), pt.value, r.benchmarkCurve[i].value, r.drawdownCurve[i].value])), 'text/csv');
      });
      return;
    }

    if (activeResultTab === 'optimizer') {
      disposeCharts();
      const params = extractSweepableParameters(config);
      if (!params.length) {
        body.innerHTML = '<p class="data-note">Add at least one indicator with a numeric parameter (or enable Stop Loss / Take Profit) to sweep parameters.</p>';
        return;
      }
      const firstP = params[0];
      const defMin = Math.max(firstP.min, Math.round(firstP.current * 0.5));
      const defMax = Math.min(firstP.max, Math.round(firstP.current * 1.8) + 2);
      const defStep = Math.max(1, Math.round((defMax - defMin) / 10));
      body.innerHTML = `
       <p class="data-note">Sweep any parameter across a custom range (up to 40 iterations) to see sensitivity and compare Out-of-Sample stability. Click <strong>Apply</strong> on any row to adopt that setting.</p>
       <form id="bt-sweep-form" class="bt-sweep-form">
        <label>Parameter to optimize<select name="path">${params.map(p => `<option value="${esc(p.path)}">${esc(p.label)} (now ${p.current})</option>`).join('')}</select></label>
        <label>Min<input name="min" type="number" step="any" value="${defMin}" required></label>
        <label>Max<input name="max" type="number" step="any" value="${defMax}" required></label>
        <label>Step<input name="step" type="number" min="0.01" step="any" value="${defStep}" required></label>
        <label>Rank by<select name="rankBy"><option value="sharpe">Sharpe ratio</option><option value="totalReturnPct">Net return %</option><option value="profitFactor">Profit factor</option><option value="oosReturnPct">Out-of-sample return %</option></select></label>
        <button type="submit" class="button primary">${icon('sliders-horizontal')} Run sweep</button>
       </form>
       <div id="bt-sweep-output">${renderSweepTable(lastSweep)}</div>`;
      hydrate?.();
      const sForm = $('#bt-sweep-form');
      sForm.elements.path.addEventListener('change', () => {
        const picked = params.find(p => p.path === sForm.elements.path.value);
        if (!picked) return;
        const lo = Math.max(picked.min, Math.round(picked.current * 0.5 * 10) / 10);
        const hi = Math.min(picked.max, Math.round((picked.current * 1.8 + 2) * 10) / 10);
        sForm.elements.min.value = lo;
        sForm.elements.max.value = hi;
        sForm.elements.step.value = Math.max(0.5, Math.round(((hi - lo) / 10) * 10) / 10);
      });
      sForm.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(sForm);
        lastSweep = runParameterSweep(loadedBars, config, {
          path: String(fd.get('path')),
          min: Number(fd.get('min')),
          max: Number(fd.get('max')),
          step: Number(fd.get('step')),
          rankBy: String(fd.get('rankBy')),
          interval: dataSource === 'exchange' ? interval : null,
        });
        $('#bt-sweep-output').innerHTML = renderSweepTable(lastSweep);
        bindSweepApply();
      });
      bindSweepApply();
      return;
    }

    if (activeResultTab === 'trades') {
      disposeCharts();
      const filtered = r.trades.filter(t =>
        tradeFilter === 'wins' ? t.pnl > 0
        : tradeFilter === 'losses' ? t.pnl < 0
        : tradeFilter === 'long' ? t.side === 'long'
        : tradeFilter === 'short' ? t.side === 'short'
        : true
      ).slice().reverse();
      body.innerHTML = `
       <div class="bt-trade-filters">
        ${[['all', `All (${r.trades.length})`], ['wins', `Winners (${r.wins})`], ['losses', `Losers (${r.losses})`], ['long', 'Long'], ['short', 'Short']].map(([k, lbl]) => `<button type="button" class="chip ${tradeFilter === k ? 'selected' : ''}" data-bt-tfilter="${k}">${lbl}</button>`).join('')}
       </div>
       ${filtered.length ? `<div class="practice-table" tabindex="0"><table>
        <thead><tr><th>#</th><th>Side</th><th>Entry (UTC)</th><th>Exit (UTC)</th><th>Entry</th><th>Exit</th><th>Bars</th><th>Reason</th><th>Fees</th><th>Net P&amp;L</th><th>Return</th></tr></thead>
        <tbody>${filtered.map(t => `<tr>
         <td>${t.id}</td><td class="${t.side === 'long' ? 'positive' : 'negative'}">${t.side.toUpperCase()}</td>
         <td>${esc(fmtTime(t.entryTime))}</td><td>${esc(fmtTime(t.exitTime))}</td>
         <td>${displayPrice(t.entryPrice, quote)}</td><td>${displayPrice(t.exitPrice, quote)}</td>
         <td>${t.barsHeld}</td><td>${esc(t.reason)}</td>
         <td>${moneyMarkup(t.fees, quote, 'parallel')}</td>
         <td class="${tone(t.pnl)}">${moneyMarkup(t.pnl, quote, 'parallel')}</td>
         <td class="${tone(t.returnPct)}">${pct(t.returnPct)}</td>
        </tr>`).join('')}</tbody>
       </table></div>` : '<p class="data-note">No trades match this filter.</p>'}`;
      for (const btn of body.querySelectorAll('[data-bt-tfilter]')) {
        btn.addEventListener('click', () => { tradeFilter = btn.dataset.btTfilter; renderResults(); });
      }
    }
  }

  function renderSweepTable(sweep) {
    if (!sweep) return '<p class="data-note">Configure a parameter range above and click Run sweep.</p>';
    if (!sweep.ready) return `<p class="data-note negative">${esc(sweep.reason)}</p>`;
    return `<div class="practice-table" tabindex="0"><table>
     <thead><tr><th>Value</th><th>Net Return</th><th>OOS Return</th><th>Sharpe</th><th>Profit Factor</th><th>Max DD</th><th>Win Rate</th><th>Trades</th><th></th></tr></thead>
     <tbody>${sweep.rows.map(row => `<tr>
      <td><strong>${row.value}</strong></td>
      <td class="${tone(row.totalReturnPct)}">${pct(row.totalReturnPct)}</td>
      <td class="${tone(row.oosReturnPct)}">${row.oosReturnPct !== null ? pct(row.oosReturnPct) : '—'}</td>
      <td>${fmtRatio(row.sharpe)}</td>
      <td>${fmtRatio(row.profitFactor)}</td>
      <td class="negative">${pct(row.maxDrawdownPct)}</td>
      <td>${row.winRatePct !== null ? pct(row.winRatePct) : '—'}</td>
      <td>${row.tradesCount}</td>
      <td><button type="button" class="button" data-bt-apply-val="${row.value}">Apply</button></td>
     </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function bindSweepApply() {
    for (const btn of root.querySelectorAll('[data-bt-apply-val]')) {
      btn.addEventListener('click', () => {
        if (!lastSweep?.path) return;
        const val = Number(btn.dataset.btApplyVal);
        config = setParameterAtPath(config, lastSweep.path, val);
        renderRuleEditors();
        activeResultTab = 'overview';
        executeBacktest();
        toast(`Applied parameter value ${val}`);
      });
    }
  }

  // Bind data source switchers
  for (const btn of root.querySelectorAll('[data-bt-source]')) {
    btn.addEventListener('click', () => {
      dataSource = btn.dataset.btSource;
      for (const b of root.querySelectorAll('[data-bt-source]')) b.setAttribute('aria-pressed', String(b === btn));
      $('#bt-exchange-controls').hidden = dataSource !== 'exchange';
      $('#bt-custom-controls').hidden = dataSource !== 'custom';
      if (dataSource === 'exchange' && !loadedBars.length) loadExchangeHistory();
    }, { signal });
  }

  $('#bt-venue').value = currentInst.venue;
  syncPairs();
  $('#bt-venue').addEventListener('change', () => {
    const venue = $('#bt-venue').value;
    const list = getInstruments?.(venue) ?? [];
    currentInst = list.find(x => x.base === currentInst.base) ?? list.find(x => x.base === 'BTC') ?? { venue, base: 'BTC', quote: venue === 'binance' ? 'USDT' : 'USD', symbol: venue === 'binance' ? 'BTCUSDT' : 'BTC-USD' };
    syncPairs(); onInstrument?.(currentInst); loadExchangeHistory();
  }, { signal });
  $('#bt-pair').addEventListener('change', () => {
    const venue = $('#bt-venue').value;
    const found = (getInstruments?.(venue) ?? []).find(x => x.symbol === $('#bt-pair').value);
    if (found) { currentInst = found; onInstrument?.(currentInst); }
    loadExchangeHistory();
  }, { signal });
  $('#bt-interval').addEventListener('change', e => { interval = e.target.value; loadExchangeHistory(); }, { signal });
  $('#bt-depth').addEventListener('change', e => { candleDepth = Number(e.target.value); loadExchangeHistory(); }, { signal });
  $('#bt-load-btn').addEventListener('click', loadExchangeHistory, { signal });

  // Custom OHLCV CSV / JSON dataset import
  $('#bt-sample-csv').addEventListener('click', () => download('cryptoz-sample-ohlcv.csv', makeSampleCsv(), 'text/csv'), { signal });
  $('#bt-data-file').addEventListener('change', async e => {
    const f = e.target.files?.[0]; if (!f) return;
    customDatasetName = f.name;
    try {
      $('#bt-data-paste').value = await f.text();
      $('#bt-custom-status').textContent = `Loaded ${f.name} — click Use imported dataset.`;
    } catch { $('#bt-custom-status').textContent = 'Could not read selected file.'; }
  }, { signal });
  $('#bt-apply-custom-data').addEventListener('click', () => {
    try {
      const parsed = parseOHLCVImport($('#bt-data-paste').value);
      loadedBars = parsed;
      loadedMeta = `Imported dataset${customDatasetName ? ' (' + customDatasetName + ')' : ''} · ${parsed.length.toLocaleString()} candles (${fmtTime(parsed[0].time)} → ${fmtTime(parsed.at(-1).time)})`;
      $('#bt-data-status').textContent = loadedMeta;
      $('#bt-custom-status').textContent = `Ready: ${parsed.length} valid candles imported.`;
      executeBacktest();
    } catch (err) {
      $('#bt-custom-status').textContent = err.message;
    }
  }, { signal });

  // Presets & Strategy JSON import/export
  const setPresetDesc = id => {
    const found = BT_PRESETS.find(p => p.id === id);
    $('#bt-preset-desc').textContent = found ? found.summary : 'Custom rule set — edit any indicator, operator, formula or risk control below.';
  };
  setPresetDesc(BT_PRESETS[0].id);

  for (const btn of root.querySelectorAll('[data-bt-preset]')) {
    btn.addEventListener('click', () => {
      const preset = BT_PRESETS.find(p => p.id === btn.dataset.btPreset);
      if (!preset) return;
      config = { ...config, name: preset.name, ...structuredClone(preset.config) };
      for (const b of root.querySelectorAll('[data-bt-preset]')) b.classList.toggle('selected', b === btn);
      setPresetDesc(preset.id);
      renderRuleEditors();
      executeBacktest();
    }, { signal });
  }
  $('#bt-export-strat').addEventListener('click', () => download('cryptoz-strategy.json', JSON.stringify(config, null, 2), 'application/json'), { signal });
  $('#bt-import-strat').addEventListener('click', () => $('#bt-strat-file').click(), { signal });
  $('#bt-strat-file').addEventListener('change', async e => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      config = validateStrategyImport(await f.text());
      renderRuleEditors();
      executeBacktest();
      toast(`Strategy "${config.name}" imported.`);
    } catch (err) { toast(err.message); }
    e.target.value = '';
  }, { signal });

  // Dynamic rule builder delegation
  root.addEventListener('click', e => {
    const addBtn = e.target.closest('[data-bt-add]');
    if (addBtn) {
      const groupKey = addBtn.dataset.btAdd;
      config[groupKey] = [...(config[groupKey] ?? []), { left: { type: 'rsi', period: 14 }, op: '>', right: { type: 'const', value: 50 } }];
      renderRuleEditors();
      return;
    }
    const delBtn = e.target.closest('[data-bt-del]');
    if (delBtn) {
      const [groupKey, idxStr] = delBtn.dataset.btDel.split('|');
      const idx = Number(idxStr);
      if ((config[groupKey]?.length ?? 0) > 1) {
        config[groupKey] = config[groupKey].filter((_, i) => i !== idx);
        renderRuleEditors();
      }
      return;
    }
    const rtab = e.target.closest('[data-bt-rtab]');
    if (rtab) {
      activeResultTab = rtab.dataset.btRtab;
      renderResults();
      reveal($('#bt-results-body'), { offset: 5, duration: 220 });
    }
  }, { signal });

  root.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset?.btType) {
      const [groupKey, idxStr, side] = el.dataset.btType.split('|');
      const meta = BT_INDICATORS.find(item => item.id === el.value);
      const nextOp = { type: el.value };
      for (const p of meta?.params ?? []) nextOp[p.key] = p.default;
      config[groupKey][Number(idxStr)][side] = nextOp;
      renderRuleEditors();
      return;
    }
    if (el.dataset?.btOp) {
      const [groupKey, idxStr] = el.dataset.btOp.split('|');
      config[groupKey][Number(idxStr)].op = el.value;
      return;
    }
    if (el.dataset?.btParam) {
      const [groupKey, idxStr, side, key] = el.dataset.btParam.split('|');
      config[groupKey][Number(idxStr)][side][key] = el.type === 'number' ? Number(el.value) : el.value;
      return;
    }
    const map = {
      'bt-entry-logic': () => { config.entryLogic = el.value; },
      'bt-exit-logic': () => { config.exitLogic = el.value; },
      'bt-direction': () => { config.direction = el.value; renderRuleEditors(); },
      'bt-capital': () => { config.initialCapital = Number(el.value); },
      'bt-sizing-mode': () => { config.sizingMode = el.value; renderRuleEditors(); },
      'bt-sizing-val': () => { config.sizingValue = Number(el.value); },
      'bt-sl-mode': () => { config.stopLossMode = el.value; renderRuleEditors(); },
      'bt-sl-val': () => { config.stopLossValue = Number(el.value); },
      'bt-tp-mode': () => { config.takeProfitMode = el.value; renderRuleEditors(); },
      'bt-tp-val': () => { config.takeProfitValue = Number(el.value); },
      'bt-tr-mode': () => { config.trailingMode = el.value; renderRuleEditors(); },
      'bt-tr-val': () => { config.trailingValue = Number(el.value); },
      'bt-fee': () => { config.feeBps = Number(el.value); },
      'bt-slippage': () => { config.slippageBps = Number(el.value); },
      'bt-maxhold': () => { config.maxHoldBars = Number(el.value); },
      'bt-cooldown': () => { config.cooldownBars = Number(el.value); },
      'bt-split': () => { config.splitPct = Number(el.value); },
    };
    map[el.id]?.();
  }, { signal });

  $('#bt-run-btn').addEventListener('click', executeBacktest, { signal });
  $('#bt-reset-btn').addEventListener('click', () => {
    config = defaultBacktestConfig();
    renderRuleEditors();
    executeBacktest();
    toast('Strategy reset to default.');
  }, { signal });

  renderRuleEditors();
  loadExchangeHistory();

  return {
    options: syncPairs,
    refresh() { return dataSource === 'exchange' ? loadExchangeHistory() : executeBacktest(); },
    applyTheme() { if (lastResult?.ready && activeResultTab === 'overview') mountVisualCharts(lastResult); },
    applyCurrency() { if (lastResult?.ready) renderResults(); },
    syncScrollOptions() {
      const isPhone = typeof matchMedia !== 'undefined' && matchMedia(PHONE_LAYOUT).matches;
      priceChart?.applyOptions({ handleScroll: chartScrollOptions('cursor', isPhone) });
    },
    dispose() { controller.abort(); },
  };
}
