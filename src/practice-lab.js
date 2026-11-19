import { bollinger, ema, rsi } from './analytics.js';
import { createPracticeChart } from './practice-chart.js';
import { practiceCosts, practiceSpan, practiceTime } from './practice-replay.js';
import { esc, num, pct, tone } from './ui.js';
import {moneyMarkup} from './currency.js';

const rules = {
  'ema-cross': {
    name: 'EMA 20 / 50 crossover',
    description: 'Enter when the 20-bar EMA crosses above the 50-bar EMA. Exit on a cross below.',
    prepare(bars) {
      const closes = bars.map(bar => bar.close);
      const fast = ema(closes, 20), slow = ema(closes, 50);
      return (i, inPosition) => inPosition
        ? fast[i - 1] >= slow[i - 1] && fast[i] < slow[i]
        : fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
    },
  },
  'rsi-recovery': {
    name: 'RSI-14 recovery',
    description: 'Enter on a cross above RSI 30. Exit when RSI reaches 70 or higher.',
    prepare(bars) {
      const values = rsi(bars.map(bar => bar.close), 14);
      return (i, inPosition) => inPosition ? values[i] >= 70 : values[i - 1] <= 30 && values[i] > 30;
    },
  },
  'channel-breakout': {
    name: '20-bar channel breakout',
    description: 'Enter above the prior 20-bar high. Exit below the prior 10-bar low.',
    prepare(bars) {
      return (i, inPosition) => inPosition
        ? bars[i].close < Math.min(...bars.slice(i - 10, i).map(bar => bar.low))
        : bars[i].close > Math.max(...bars.slice(i - 20, i).map(bar => bar.high));
    },
  },
  'bollinger-recovery': {
    name: 'Bollinger Band recovery',
    description: 'Enter on a close back above the lower 20-bar, 2σ band. Exit at or above the middle band.',
    prepare(bars) {
      const { lower, middle } = bollinger(bars.map(bar => bar.close), 20, 2);
      return (i, inPosition) => inPosition
        ? bars[i].close >= middle[i] : bars[i - 1].close < lower[i - 1] && bars[i].close >= lower[i];
    },
  },
};

export function runStrategyBacktest(bars, { strategyId = 'ema-cross', initialCapital = 10000, feeBps = 10, slippageBps = 5 } = {}) {
  const firstSignal = 50;
  if (!Object.hasOwn(rules, strategyId)) return { ready: false, reason: 'Choose an available strategy rule.' };
  if (bars.length < 60) return { ready: false, reason: `Strategy testing needs 60 consecutive closed candles (${bars.length} available).` };
  let costs;
  try { costs = practiceCosts(initialCapital, feeBps, slippageBps); }
  catch (error) { return { ready: false, reason: error.message }; }
  const shouldTrade = rules[strategyId].prepare(bars);
  const entry = (budget, bar) => {
    const price = bar.open * (1 + costs.slip);
    const quantity = (budget / (1 + costs.fee)) / price;
    return { time: bar.time, price, quantity, cost: budget, fee: budget * costs.fee / (1 + costs.fee) };
  };
  const hold = entry(initialCapital, bars[firstSignal + 1]);
  let cash = initialCapital, openPosition = null, pendingSide = null;
  let peak = initialCapital, maxDrawdownPct = 0, totalFees = 0;
  const trades = [], equityCurve = [], benchmarkCurve = [];
  for (let i = firstSignal; i < bars.length; i++) {
    const bar = bars[i];
    if (pendingSide === 'buy' && cash > 0) {
      openPosition = entry(cash, bar);
      totalFees += openPosition.fee;
      cash = 0;
    } else if (pendingSide === 'sell' && openPosition) {
      const exitPrice = bar.open * (1 - costs.slip);
      const gross = openPosition.quantity * exitPrice;
      const exitFee = gross * costs.fee;
      cash = gross - exitFee;
      totalFees += exitFee;
      trades.push({
        entryTime: openPosition.time, exitTime: bar.time,
        entryPrice: openPosition.price, exitPrice, quantity: openPosition.quantity,
        fees: openPosition.fee + exitFee, pnl: cash - openPosition.cost,
      });
      openPosition = null;
    }
    const equity = openPosition ? openPosition.quantity * bar.close : cash;
    const holdEquity = i === firstSignal ? initialCapital : hold.quantity * bar.close;
    if (![equity, holdEquity, totalFees].every(Number.isFinite) || equity < 0 || holdEquity <= 0) {
      return { ready: false, reason: 'These candles exceed the supported strategy calculation range.' };
    }
    peak = Math.max(peak, equity);
    maxDrawdownPct = Math.min(maxDrawdownPct, (equity / peak - 1) * 100);
    equityCurve.push({ time: bar.time, value: equity });
    benchmarkCurve.push({ time: bar.time, value: holdEquity });
    pendingSide = shouldTrade(i, Boolean(openPosition)) ? (openPosition ? 'sell' : 'buy') : null;
  }
  const finalEquity = equityCurve.at(-1).value;
  return {
    ready: true, startTime: bars[firstSignal].time, endTime: bars.at(-1).time,
    sampleBars: bars.length - firstSignal, finalEquity, totalFees, openPosition, pendingSide,
    totalReturnPct: (finalEquity / initialCapital - 1) * 100,
    buyHoldReturnPct: (benchmarkCurve.at(-1).value / initialCapital - 1) * 100,
    maxDrawdownPct, trades, equityCurve, benchmarkCurve,
    winRatePct: trades.length ? trades.filter(trade => trade.pnl > 0).length / trades.length * 100 : null,
  };
}

export function mountStrategyLab({ root, history, instrument, signal }) {
  const currency = esc(instrument.quote);
  root.innerHTML = `<form class="practice-history-fields practice-strategy-form" data-strategy-form>
    <label>Rule<select name="rule">${Object.entries(rules).map(([id, rule]) => `<option value="${id}">${rule.name}</option>`).join('')}</select></label>
    <label>Starting cash (${currency})<input name="capital" type="number" min="1" max="100000000" step="any" value="10000" required></label>
    <label>Fee (bps)<input name="fee" type="number" min="0" max="1000" step="any" value="10" required></label>
    <label>Slippage (bps)<input name="slippage" type="number" min="0" max="1000" step="any" value="5" required></label>
    <button class="button primary" type="submit">Run test</button>
  </form>
  <p class="data-note" data-strategy-rule></p>
  <p class="data-note">Rules check the completed close. Fills use the next open plus costs. The first 50 candles are warm-up. Buys use available virtual cash. Buy and hold enters at the first eligible open with the same costs. Open positions are valued at the final close.</p>
  <p role="status" class="practice-result" data-strategy-status></p>
  <div data-strategy-results hidden></div>`;
  const form = root.querySelector('[data-strategy-form]');
  const status = root.querySelector('[data-strategy-status]');
  const results = root.querySelector('[data-strategy-results]');
  const rule = root.querySelector('[data-strategy-rule]');
  let chartController = null;
  const disposeChart = () => { chartController?.abort(); chartController = null; };
  const updateRule = () => {
    rule.textContent = rules[form.elements.rule.value].description;
    if (!results.hidden) status.textContent = 'Settings changed. Run the test for updated results.';
    disposeChart();
    results.hidden = true;
  };
  form.addEventListener('input', updateRule, { signal });
  signal.addEventListener('abort', disposeChart, { once: true });
  updateRule();

  form.addEventListener('submit', event => {
    event.preventDefault();
    disposeChart();
    const result = runStrategyBacktest(history.bars, {
      strategyId: form.elements.rule.value, initialCapital: form.elements.capital.valueAsNumber,
      feeBps: form.elements.fee.valueAsNumber, slippageBps: form.elements.slippage.valueAsNumber,
    });
    status.classList.toggle('negative', !result.ready);
    results.hidden = !result.ready;
    if (!result.ready) { status.textContent = result.reason; return; }
    const closed = result.trades.length;
    const open = result.openPosition
      ? `Open position valued at final close (${num(result.openPosition.quantity, 12)} ${instrument.base}). ` : '';
    const pending = result.pendingSide ? `Final ${result.pendingSide} signal had no next open.` : '';
    status.textContent = `${result.sampleBars} evaluated candles · ${practiceSpan(result.startTime, result.endTime)}`;
    const metrics = [
      ['Final equity', moneyMarkup(result.finalEquity,instrument.quote,'parallel')],
      ['Strategy return', pct(result.totalReturnPct), tone(result.totalReturnPct)],
      ['Buy &amp; hold return', pct(result.buyHoldReturnPct), tone(result.buyHoldReturnPct)],
      ['Max close drawdown', pct(result.maxDrawdownPct), tone(result.maxDrawdownPct)],
      ['Closed trades', num(closed, 0)],
      ['Closed-trade win rate', pct(result.winRatePct)],
      ['Fees paid', moneyMarkup(result.totalFees,instrument.quote,'parallel')],
    ].map(([label, value, css = '']) => `<div><dt>${label}</dt><dd class="mono ${css}">${value}</dd></div>`).join('');
    results.innerHTML = `<dl class="practice-metrics">${metrics}</dl>
      ${open || pending ? `<p class="data-note">${esc(open + pending)}</p>` : ''}
      <div class="practice-legend"><span>Strategy equity</span><span>Buy &amp; hold equity</span></div>
      <div class="practice-chart" role="img" aria-label="Strategy and buy-and-hold equity over the sample" data-strategy-chart></div>
      <h4>Closed trades</h4>
      ${closed ? `<div class="practice-table" role="region" aria-label="Closed strategy trades" tabindex="0">
        <table><thead><tr><th scope="col">Entry</th><th scope="col">Exit</th><th scope="col">Buy price</th><th scope="col">Sell price</th><th scope="col">Fees</th><th scope="col">Net P&amp;L</th></tr></thead>
        <tbody>${result.trades.slice().reverse().map(trade => `<tr><th scope="row">${esc(practiceTime(trade.entryTime))}</th><td>${esc(practiceTime(trade.exitTime))}</td>
          <td>${moneyMarkup(trade.entryPrice,instrument.quote,'parallel')}</td><td>${moneyMarkup(trade.exitPrice,instrument.quote,'parallel')}</td><td>${moneyMarkup(trade.fees,instrument.quote,'parallel')}</td><td class="${tone(trade.pnl)}">${moneyMarkup(trade.pnl,instrument.quote,'parallel')}</td></tr>`).join('')}</tbody></table>
      </div>` : '<p class="muted">This rule closed no trades in the sample.</p>'}
      <p class="data-note"><a href="https://www.tradingview.com/pine-script-docs/concepts/strategies/#broker-emulator" target="_blank" rel="noopener noreferrer">TradingView reference for next-bar execution</a></p>`;
    chartController = new AbortController();
    createPracticeChart(root.querySelector('[data-strategy-chart]'), 'equity', result.finalEquity, chartController.signal, instrument.quote)
      .setData(result.equityCurve, result.benchmarkCurve);
  }, { signal });
}
