import { usableQuote } from './market-integrity.js';
import { esc, num, price, stamp, tone } from './ui.js';
import {
  PAPER_FEE_BPS, PAPER_SLIPPAGE_BPS, PAPER_STARTING_CASH, PAPER_STORAGE_KEY, createPaperStore, paperSummary,
} from './paper-trading.js';

const percent = bps => `${(Number(bps) / 100).toFixed(2)}%`;
const metrics = [
  ['cash', 'Virtual cash'], ['quantity', 'Open position'], ['markValue', 'Estimated sell value'],
  ['openPnl', 'Open P&L'], ['realized', 'Realized P&L'], ['totalPnl', 'Total P&L'],
];
const workingLabels = { limit: 'Limit', 'stop-loss': 'Stop-loss', 'take-profit': 'Take-profit' };

export function paperPanel(instrument) {
  const base = esc(instrument.base);
  const currency = esc(instrument.quote);
  return `<div class="paper-panel" data-paper-panel>
    <div class="paper-market">
      <div><h3>${base} / ${currency}</h3><p class="muted">${esc(instrument.venue === 'coinbase' ? 'Coinbase' : 'Binance')} spot · Virtual trading</p></div>
      <div class="paper-market-quote"><span class="muted">Reference quote</span><strong class="mono" data-paper-quote>Waiting for a fresh quote</strong></div>
    </div>
    <dl class="paper-metrics">${metrics.map(([key, label]) => `<div><dt>${esc(label)}</dt><dd class="mono" data-paper-metric="${key}">—</dd></div>`).join('')}</dl>
    <form class="paper-order" data-paper-order aria-describedby="paper-costs">
      <h3>Simulated market order</h3>
      <p id="paper-costs" class="muted">USD and USDT each start with ${num(PAPER_STARTING_CASH, 0)} in virtual cash. Each fill charges a ${percent(PAPER_FEE_BPS)} fee. Buys are ${percent(PAPER_SLIPPAGE_BPS)} above the quote and sells are ${percent(PAPER_SLIPPAGE_BPS)} below. Sell up to your open position.</p>
      <div class="paper-fields">
        <label>Side<select name="side"><option value="buy">Buy</option><option value="sell">Sell</option></select></label>
        <label>Quantity (${base})<input name="quantity" type="text" inputmode="decimal" maxlength="37" autocomplete="off" spellcheck="false" required></label>
        <button class="button primary" type="submit" disabled>Place simulated order</button>
      </div>
      <p class="paper-order-status" role="status" data-paper-status></p>
    </form>
    <details class="paper-working">
      <summary>Conditional orders <span class="muted" data-working-count></span></summary>
      <p class="muted">Orders are checked while this paper market is open. Limits respect the price after slippage. Stops and targets trigger on the observed trade price. Funds are checked at execution.</p>
      <form class="practice-history-fields" data-working-form>
        <label>Type<select name="type">${Object.entries(workingLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label>
        <label>Side<select name="side"><option value="buy">Buy</option><option value="sell">Sell</option></select></label>
        <label>Quantity (${base})<input name="quantity" inputmode="decimal" maxlength="37" autocomplete="off" required></label>
        <label>Trigger (${currency})<input name="trigger" type="number" min="0" step="any" required></label>
        <button class="button primary" type="submit">Add conditional order</button>
      </form>
      <p role="status" data-working-status></p>
      <div data-working-orders></div>
    </details>
    <section class="paper-ledger">
      <div class="paper-ledger-heading"><h3 id="paper-fills-title">Practice fills</h3><p class="muted">Saved in this browser · Amounts in ${currency}</p></div>
      <p class="muted" data-paper-empty>No simulated fills for this market yet.</p>
      <div class="paper-ledger-scroll" data-paper-history role="region" aria-labelledby="paper-fills-title" tabindex="0" hidden>
        <table>
          <caption class="sr-only">Quantities in ${base} and amounts in ${currency}</caption>
          <thead><tr><th scope="col">Side</th><th scope="col">Quantity</th><th scope="col">Fill price</th><th scope="col">Realized P&amp;L</th><th scope="col">Fee</th><th scope="col">Cash change</th><th scope="col">Time</th></tr></thead>
          <tbody data-paper-fills></tbody>
        </table>
      </div>
    </section>
  </div>`;
}

function renderFills(fills) {
  return fills.map(fill => {
    const fillTime = new Date(fill.placedAt).toISOString();
    const source = `${fill.source} quote ${price(fill.referencePrice, '')} at ${stamp(fill.quoteAt)}`;
    return `<tr><th scope="row">${fill.side === 'buy' ? 'Buy' : 'Sell'}</th>
      <td>${fill.quantity}</td><td title="${esc(source)}">${price(fill.executionPrice, '')}</td>
      <td class="${tone(fill.realized)}">${num(fill.realized, 6)}</td>
      <td>${num(fill.fee, 6)}</td><td>${num(fill.cashDelta, 6)}</td>
      <td><time datetime="${fillTime}">${esc(stamp(fillTime))}</time></td></tr>`;
  }).join('');
}

function renderOrders(orders) {
  if (!orders.length) return '<p class="muted">No conditional orders for this market.</p>';
  return `<div class="practice-table" role="region" aria-label="Conditional orders" tabindex="0">
    <table><thead><tr><th scope="col">Type</th><th scope="col">Side</th><th scope="col">Quantity</th>
      <th scope="col">Trigger price</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
    <tbody>${orders.map(order => {
      const fill = order.status === 'filled' ? ` · ${price(order.executionPrice, '')}` : '';
      const error = order.status === 'rejected' ? ` · ${esc(order.error)}` : '';
      return `<tr><th scope="row">${workingLabels[order.type]}</th><td>${order.side === 'buy' ? 'Buy' : 'Sell'}</td>
        <td>${order.quantity}</td><td>${price(order.triggerPrice, '')}</td>
        <td class="${order.status === 'rejected' ? 'negative' : ''}">${order.status}${fill}${error}</td><td>
        ${order.status === 'working' ? `<button class="button" type="button" data-cancel-working="${esc(order.id)}" aria-label="Cancel ${workingLabels[order.type].toLowerCase()} ${order.side} order">Cancel</button>` : '—'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

export function bindPaperPanel({ host, instrument, getQuote, storage, signal }) {
  const panel = host.querySelector('[data-paper-panel]');
  if (!panel || signal.aborted) return;
  const win = panel.ownerDocument.defaultView;
  const form = panel.querySelector('[data-paper-order]');
  const quantity = form.elements.namedItem('quantity');
  const side = form.elements.namedItem('side');
  const submit = form.querySelector('[type="submit"]');
  const status = panel.querySelector('[data-paper-status]');
  const marketQuote = panel.querySelector('[data-paper-quote]');
  const history = panel.querySelector('[data-paper-history]');
  const empty = panel.querySelector('[data-paper-empty]');
  const rows = panel.querySelector('[data-paper-fills]');
  const workingForm = panel.querySelector('[data-working-form]');
  const workingStatus = panel.querySelector('[data-working-status]');
  const workingHost = panel.querySelector('[data-working-orders]');
  const workingCount = panel.querySelector('[data-working-count]');
  const workingSubmit = workingForm.querySelector('[type=submit]');
  const fields = Object.fromEntries(metrics.map(([key]) => [key, panel.querySelector(`[data-paper-metric="${key}"]`)]));
  const store = createPaperStore(storage);
  const hasLocks = Boolean(win.navigator.locks);
  let lastWorkingList = '';
  let placingWorking = false;
  let settling = false;
  let ledger;
  let busy = false;

  function report(message, failed = false) {
    status.textContent = message;
    status.classList.toggle('negative', failed);
  }

  function reportWorking(message, failed = false) {
    workingStatus.textContent = message;
    workingStatus.classList.toggle('negative', failed);
  }

  function renderWorking() {
    const orders = (ledger?.workingOrders ?? []).filter(order => order.instrument.venue === instrument.venue
      && order.instrument.symbol === instrument.symbol).reverse();
    const key = orders.map(({ id, status }) => `${id}:${status}`).join(',');
    if (key !== lastWorkingList || !workingHost.hasChildNodes()) {
      workingHost.innerHTML = renderOrders(orders);
      lastWorkingList = key;
    }
    const active = orders.filter(order => order.status === 'working').length;
    workingCount.textContent = active ? `· ${active} working` : '';
    workingSubmit.disabled = !hasLocks || !ledger || placingWorking;
  }

  function updateSide() {
    const field = workingForm.elements.side;
    const limit = workingForm.elements.type.value === 'limit';
    if (!limit) field.value = 'sell';
    field.disabled = !limit;
  }

  function withLock(action) {
    const run = () => { if (!signal.aborted) return action(); };
    return hasLocks ? win.navigator.locks.request(PAPER_STORAGE_KEY, { signal }, run) : run();
  }

  async function observeQuote() {
    if (!hasLocks || settling || !ledger?.workingOrders.some(order => order.status === 'working'
      && order.instrument.venue === instrument.venue && order.instrument.symbol === instrument.symbol)) return;
    settling = true;
    try {
      const before = new Map(ledger.workingOrders.map(order => [order.id, order.status]));
      await withLock(() => { ledger = store.settleWorking(instrument, getQuote()); });
      if (signal.aborted) return;
      const changed = ledger.workingOrders.filter(order => before.get(order.id) === 'working' && order.status !== 'working');
      if (changed.length) {
        const count = changed.filter(order => order.status === 'filled').length;
        const rejected = changed.filter(order => order.status === 'rejected').length;
        if (count || rejected) reportWorking(`${count} filled · ${rejected} rejected. Review conditional order history.`, rejected > 0);
      }
      refresh({ updateFills: true });
    } catch (error) {
      if (!signal.aborted) reportWorking(`Conditional orders were not updated. ${error.message}`, true);
    } finally {
      settling = false;
    }
  }

  function refresh({ updateFills = false } = {}) {
    const now = Date.now();
    const quote = usableQuote(getQuote(), instrument, now);
    marketQuote.textContent = quote ? `${price(quote.price, '')} ${instrument.quote} · ${quote.source}` : 'Waiting for a fresh quote';
    marketQuote.title = quote ? stamp(quote.updatedAt) : '';
    submit.disabled = busy || !ledger || !quote;

    const summary = ledger ? paperSummary(ledger, instrument, quote, { now }) : null;
    for (const [key, field] of Object.entries(fields)) {
      const amount = summary?.[key];
      field.textContent = amount == null ? '—' : key === 'quantity' ? `${amount} ${instrument.base}` : `${num(amount, 6)} ${instrument.quote}`;
      if (key === 'openPnl' || key === 'realized' || key === 'totalPnl') field.className = `mono ${tone(amount)}`;
    }
    if (updateFills) {
      const fills = summary?.fills ?? [];
      rows.innerHTML = renderFills(fills);
      history.hidden = fills.length === 0;
      empty.hidden = !ledger || fills.length > 0;
      renderWorking();
    }
  }

  function reload() {
    try { ledger = store.read(); }
    catch (error) { ledger = null; report(error.message, true); }
    refresh({ updateFills: true });
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !ledger) return;
    const order = { side: side.value, quantity: quantity.value };
    busy = true;
    submit.disabled = true;
    report('');
    let saved = false;
    try {
      await withLock(() => { ledger = store.fill(instrument, order, getQuote()); });
      if (signal.aborted) return;
      const fill = ledger.fills.at(-1);
      saved = true;
      if (quantity.value === order.quantity) quantity.value = '';
      const action = fill.side === 'buy' ? 'Bought' : 'Sold';
      report(`${action} ${fill.quantity} ${instrument.base} at ${price(fill.executionPrice, '')} ${instrument.quote}.`);
    } catch (error) {
      if (!signal.aborted) report(error.message, true);
    } finally {
      busy = false;
      if (!signal.aborted) refresh({ updateFills: saved });
    }
  }, { signal });
  workingForm.elements.type.addEventListener('change', updateSide, { signal });
  workingForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!hasLocks || !ledger || placingWorking) return;
    const { type, side, quantity, trigger } = workingForm.elements;
    const order = { type: type.value, side: side.value, quantity: quantity.value, triggerPrice: trigger.value };
    placingWorking = true;
    workingSubmit.disabled = true;
    try {
      await withLock(() => { ledger = store.addWorking(instrument, order); });
      if (signal.aborted) return;
      if (quantity.value === order.quantity) quantity.value = '';
      if (trigger.value === order.triggerPrice) trigger.value = '';
      reportWorking('Conditional order saved. It will evaluate new quotes for this market.');
    } catch (error) {
      if (!signal.aborted) reportWorking(error.message, true);
    } finally {
      placingWorking = false;
      if (!signal.aborted) renderWorking();
    }
  }, { signal });
  workingHost.addEventListener('click', async event => {
    const button = event.target.closest('[data-cancel-working]');
    if (!button || !hasLocks) return;
    try {
      await withLock(() => { ledger = store.cancelWorking(instrument, button.dataset.cancelWorking); });
      if (signal.aborted) return;
      const cancelled = ledger.workingOrders.find(order => order.id === button.dataset.cancelWorking).status === 'cancelled';
      reportWorking(cancelled ? 'Conditional order cancelled.' : 'This order has already settled.');
      renderWorking();
      workingForm.elements.type.focus();
    } catch (error) {
      if (!signal.aborted) reportWorking(error.message, true);
    }
  }, { signal });
  win.addEventListener('storage', event => {
    if (event.key === PAPER_STORAGE_KEY || event.key === null) reload();
  }, { signal });
  const timer = win.setInterval(refresh, 1000);
  signal.addEventListener('abort', () => win.clearInterval(timer), { once: true });
  reload();
  if (!hasLocks) reportWorking('Conditional orders require a browser that supports coordinated local storage.');
  return { observeQuote, refresh };
}
