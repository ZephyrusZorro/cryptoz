import { closedStudyCandles } from './adaptive-study.js';
import { INTERVALS, validInstrument } from './preferences.js';
import { createPracticeChart } from './practice-chart.js';
import { esc, num, pct, tone } from './ui.js';
import {moneyMarkup} from './currency.js';

const utc = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
export const practiceTime = seconds => utc.format(seconds * 1000);
export const practiceSpan = (first, last) => `${practiceTime(first)} – ${practiceTime(last)}`;
const startingBars = 24;

export function preparePracticeHistory(response, instrument, interval, { requestedAt = Date.now(), before = null } = {}) {
  const data = response?.data;
  const provider = instrument?.venue === 'binance' ? 'Binance' : 'Coinbase';
  if (!validInstrument(instrument) || response?.provider !== provider || data?.venue !== instrument.venue
    || data?.symbol !== instrument.symbol || data?.interval !== interval
    || (data?.before ?? null) !== before || !Object.hasOwn(INTERVALS, interval)) {
    throw Error('Provider candles do not match this market and interval.');
  }
  const fetchedAt = Date.parse(response.fetchedAt);
  if (!Number.isFinite(fetchedAt) || !Number.isFinite(requestedAt)) throw Error('Candle observation time is unavailable.');
  const step = INTERVALS[interval];
  const closed = closedStudyCandles(data.bars, interval, Math.min(requestedAt / 1000, before ?? Infinity), fetchedAt / 1000);
  let first = closed.length - 1;
  while (first > 0 && closed[first].time - closed[first - 1].time === step) first--;
  const bars = closed.slice(Math.max(0, first));
  if (!bars.length) throw Error('No complete provider candles were available in this window.');
  return { bars, excludedByGap: first, provider, fetchedAt: response.fetchedAt, stale: response.cache === 'stale' };
}

export function practiceCosts(capital, feeBps, slippageBps) {
  if (!Number.isFinite(capital) || capital < 1 || capital > 1e8) throw Error('Starting cash must be between 1 and 100,000,000.');
  if (![feeBps, slippageBps].every(value => Number.isFinite(value) && value >= 0 && value <= 1000)) {
    throw Error('Set fee and slippage between 0 and 1,000 basis points.');
  }
  return { fee: feeBps / 10000, slip: slippageBps / 10000 };
}

export function createReplaySession(bars, { initialCash = 10000, feeBps = 10, slippageBps = 5 } = {}) {
  const costs = practiceCosts(initialCash, feeBps, slippageBps);
  const clean = bars.map(({ time, open, high, low, close, volume }) => ({ time, open, high, low, close, volume }));
  if (clean.length <= startingBars) throw Error('Replay needs at least 25 consecutive closed candles.');
  let visible, cash, quantity, basis, realized, totalFees, fills, pending, lastError;

  function state() {
    const bar = clean[visible - 1];
    const value = quantity * bar.close;
    const equity = cash + value;
    return {
      bar: { ...bar }, bars: clean.slice(0, visible).map(item => ({ ...item })),
      remaining: clean.length - visible, cash, quantity, equity, realized, totalFees,
      returnPct: (equity / initialCash - 1) * 100, openPnl: value - basis,
      fills: fills.map(fill => ({ ...fill })).reverse(), pending: pending && { ...pending }, lastError,
    };
  }

  function reset() {
    visible = startingBars;
    cash = initialCash;
    quantity = basis = realized = totalFees = 0;
    fills = [];
    pending = null;
    lastError = '';
    return state();
  }

  function queue(side, input) {
    if (visible >= clean.length) throw Error('There is no next candle left for a replay fill.');
    if (pending) throw Error('Advance a candle or cancel the queued order first.');
    if (!['buy', 'sell'].includes(side)) throw Error('Choose buy or sell.');
    const requested = typeof input === 'string' ? input.trim() : '';
    const amount = Number(requested);
    if (!/^(?:\d{1,24}(?:\.\d{0,12})?|\.\d{1,12})$/.test(requested) || !Number.isFinite(amount) || amount <= 0) {
      throw Error('Enter a positive quantity with up to 12 decimal places.');
    }
    const excess = amount - quantity;
    if (side === 'sell' && excess > quantity * Number.EPSILON * 4) throw Error('Sell quantity exceeds the replay position.');
    pending = { side, quantity: side === 'sell' ? Math.min(quantity, amount) : amount };
    lastError = '';
    return state();
  }

  function step() {
    if (visible >= clean.length) return state();
    const bar = clean[visible++];
    const order = pending;
    pending = null;
    lastError = '';
    if (!order) return state();
    const execution = bar.open * (1 + (order.side === 'buy' ? costs.slip : -costs.slip));
    const gross = order.quantity * execution;
    const fee = gross * costs.fee;
    if (!Number.isFinite(gross) || gross <= 0 || !Number.isFinite(gross + fee)) {
      lastError = 'The replay order exceeded the supported value range.';
      return state();
    }
    let pnl = null;
    if (order.side === 'buy') {
      const total = gross + fee;
      if (total > cash) {
        lastError = 'The next opening price plus costs exceeded replay cash.';
        return state();
      }
      cash -= total;
      quantity += order.quantity;
      basis += total;
    } else {
      const allocated = basis * (order.quantity / quantity);
      const net = gross - fee;
      pnl = net - allocated;
      cash += net;
      quantity -= order.quantity;
      basis -= allocated;
      realized += pnl;
    }
    totalFees += fee;
    fills.push({ ...order, price: execution, fee, time: bar.time, pnl });
    return state();
  }

  reset();
  return { state, step, reset, queue, cancel() { pending = null; return state(); } };
}

export function mountReplay({ root, history, instrument, signal }) {
  const session = createReplaySession(history.bars);
  const currency = esc(instrument.quote), base = esc(instrument.base);
  root.innerHTML = `<div class="practice-history-head">
    <p class="muted">Queued orders use the next open with a 0.10% fee and 0.05% adverse slippage.</p>
    <div class="practice-actions">
      <button class="button" data-replay-reset type="button">Restart</button>
      <button class="button" data-replay-play type="button">Play</button>
      <button class="button primary" data-replay-step type="button">Next candle</button>
    </div>
  </div>
  <p class="practice-candle mono" data-replay-candle></p>
  <div class="practice-chart" role="img" aria-label="Candles revealed in replay" data-replay-chart></div>
  <dl class="practice-metrics" data-replay-metrics></dl>
  <form class="practice-history-fields" data-replay-form>
    <label>Side<select name="side"><option value="buy">Buy</option><option value="sell">Sell</option></select></label>
    <label>Quantity (${base})<input name="quantity" inputmode="decimal" autocomplete="off" maxlength="37" required></label>
    <button class="button primary" type="submit">Queue for next open</button>
    <button class="button" type="button" data-replay-cancel hidden>Cancel queued order</button>
  </form>
  <p role="status" data-replay-status class="practice-result"></p>
  <div data-replay-fills></div>`;
  const select = name => root.querySelector(`[data-replay-${name}]`);
  const form = select('form'), cancel = select('cancel'), reset = select('reset'), step = select('step'), play = select('play');
  const status = select('status');
  const chart = createPracticeChart(select('chart'), 'candles', session.state().bar.close, signal, instrument.quote);
  const clock = root.ownerDocument.defaultView;
  let timer = null;

  function stop() {
    if (timer !== null) clock.clearInterval(timer);
    timer = null;
    play.textContent = 'Play';
  }

  function render(state, updateChart = '') {
    if (!state.remaining) stop();
    const bar = state.bar;
    select('candle').innerHTML = `${esc(practiceTime(bar.time))} · O ${moneyMarkup(bar.open,instrument.quote)} · H ${moneyMarkup(bar.high,instrument.quote)} · L ${moneyMarkup(bar.low,instrument.quote)} · C ${moneyMarkup(bar.close,instrument.quote,'parallel')}`;
    if (updateChart === 'reset') chart.setData(state.bars);
    if (updateChart === 'step') chart.reveal(bar, state.bars.length);
    select('metrics').innerHTML = [
      ['Replay cash', moneyMarkup(state.cash,instrument.quote,'parallel')],
      ['Equity at close', moneyMarkup(state.equity,instrument.quote,'parallel')],
      ['Position', `${num(state.quantity, 12)} ${base}`],
      ['Return', pct(state.returnPct), tone(state.returnPct)],
      ['Realized P&amp;L', moneyMarkup(state.realized,instrument.quote,'parallel'), tone(state.realized)],
      ['Total fees', moneyMarkup(state.totalFees,instrument.quote,'parallel')],
    ].map(([label, value, css = '']) => `<div><dt>${label}</dt><dd class="mono ${css}">${value}</dd></div>`).join('');
    select('fills').innerHTML = state.fills.length ? `<h4>Replay fills</h4><div class="practice-table" role="region" aria-label="Replay fills" tabindex="0">
      <table><thead><tr><th scope="col">Time</th><th scope="col">Side</th><th scope="col">Quantity</th><th scope="col">Fill (${currency})</th><th scope="col">Fee</th><th scope="col">Realized P&amp;L</th></tr></thead>
      <tbody>${state.fills.map(fill => `<tr><th scope="row">${esc(practiceTime(fill.time))}</th><td>${fill.side === 'buy' ? 'Buy' : 'Sell'}</td><td>${num(fill.quantity, 12)}</td><td>${moneyMarkup(fill.price,instrument.quote,'parallel')}</td><td>${moneyMarkup(fill.fee,instrument.quote,'parallel')}</td><td class="${tone(fill.pnl)}">${moneyMarkup(fill.pnl,instrument.quote,'parallel')}</td></tr>`).join('')}</tbody></table>
    </div>` : '';
    step.disabled = play.disabled = !state.remaining;
    form.querySelector('[type=submit]').disabled = Boolean(state.pending) || !state.remaining;
    cancel.hidden = !state.pending;
    status.classList.toggle('negative', Boolean(state.lastError));
    const nextStatus = state.lastError || (state.pending
      ? `${state.pending.side === 'buy' ? 'Buy' : 'Sell'} ${num(state.pending.quantity, 12)} ${instrument.base} queued for the next open.`
      : state.remaining ? `${num(state.remaining, 0)} candles left in this replay.` : 'End of this replay window.');
    if (status.textContent !== nextStatus) status.textContent = nextStatus;
  }

  const advance = () => render(session.step(), 'step');
  step.addEventListener('click', advance, { signal });
  reset.addEventListener('click', () => { stop(); render(session.reset(), 'reset'); }, { signal });
  play.addEventListener('click', () => {
    if (timer !== null) { stop(); return; }
    play.textContent = 'Pause';
    timer = clock.setInterval(() => { if (!root.ownerDocument.hidden) advance(); }, 750);
  }, { signal });
  cancel.addEventListener('click', () => { render(session.cancel()); form.elements.quantity.focus(); }, { signal });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try { render(session.queue(form.elements.side.value, form.elements.quantity.value)); cancel.focus(); }
    catch (error) { status.textContent = error.message; status.classList.add('negative'); }
  }, { signal });
  signal.addEventListener('abort', stop, { once: true });
  render(session.state(), 'reset');
}
