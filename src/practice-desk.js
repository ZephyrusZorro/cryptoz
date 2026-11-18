import { api } from './api.js';
import { historyCursor } from './chart-window.js';
import { usableQuote } from './market-integrity.js';
import { bindPaperPanel, paperPanel } from './paper-panel.js';
import { INTERVALS, selectVenueInstrument } from './preferences.js';
import { mountReplay, preparePracticeHistory, practiceSpan } from './practice-replay.js';
import { mountStrategyLab } from './practice-lab.js';
import { esc, stamp } from './ui.js';

const labels = { '1m': '1 minute', '5m': '5 minutes', '15m': '15 minutes', '1h': '1 hour', '4h': '4 hours', '1d': '1 day' };
const exchanges = { binance: 'Binance', coinbase: 'Coinbase' };

export function mountPracticeDesk({
  root, instrument, getInstruments, storage, view = 'paper', initialInterval = '1h',
  onInstrument = () => {}, onInterval = () => {}, request = api, hydrate = () => {},
}) {
  const scope = new AbortController();
  const paper = view !== 'replay' && view !== 'strategy';
  const clock = root.ownerDocument.defaultView;
  let market = instrument;
  let interval = Object.hasOwn(INTERVALS, initialInterval) ? initialInterval : '1h';
  let session, pending, quote = null, paperView, lastObservation = 0;
  root.innerHTML = `<div class="practice-controls">
    <label>Exchange<select id="practice-venue"><option value="binance">Binance</option><option value="coinbase">Coinbase</option></select></label>
    <label>Trading pair<select id="practice-pair"></select></label>
    ${paper ? '' : `<label>Interval<select id="practice-interval">
      ${Object.entries(labels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
      </select></label>
      <label>End date (UTC)<input id="practice-date" type="date" min="2009-01-01" max="${new Date().toISOString().slice(0, 10)}"></label>`}
    <button class="button" id="practice-refresh" type="button">${paper ? 'Refresh quote' : 'Reload candles'}</button>
    <p class="data-note" id="practice-status" role="status"></p>
  </div><div class="${paper ? 'practice-ledger' : 'practice-history'}" id="practice-ledger"></div>`;
  const venue = root.querySelector('#practice-venue'), pair = root.querySelector('#practice-pair');
  const intervalSelect = root.querySelector('#practice-interval'), end = root.querySelector('#practice-date');
  const refreshButton = root.querySelector('#practice-refresh');
  const badge = root.querySelector('#practice-status'), host = root.querySelector('#practice-ledger');
  const say = (message, failed = false) => {
    if (badge.textContent !== message) badge.textContent = message;
    badge.classList.toggle('negative', failed);
  };
  const options = () => {
    venue.value = market.venue;
    const list = [...(getInstruments(market.venue) ?? [])];
    if (!list.some(item => item.symbol === market.symbol)) list.unshift(market);
    pair.innerHTML = list.sort((a, b) => a.base.localeCompare(b.base)).map(item =>
      `<option value="${esc(item.symbol)}">${esc(item.base)}/${esc(item.quote)}</option>`).join('');
    pair.value = market.symbol;
    if (intervalSelect) intervalSelect.value = interval;
  };

  function refreshQuote() {
    if (quote && !usableQuote(quote, market)) {
      quote = null;
      paperView?.refresh();
      say('Waiting for a recent trade. Simulated orders are paused.');
    }
    if (pending) return pending;
    const controller = session, selected = market;
    if (!controller || controller.signal.aborted) return;
    const params = new URLSearchParams({ venue: selected.venue, symbol: selected.symbol });
    const task = request(`trade-quote?${params}`, { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted || controller !== session) return;
        const data = response.data;
        const next = { venue: data?.venue, symbol: data?.symbol, price: data?.price, source: 'REST',
          updatedAt: data?.observedAt, stale: response.cache === 'stale' };
        if (response.provider !== exchanges[selected.venue] || !usableQuote(next, selected)) {
          quote = null;
          paperView?.refresh();
          say('No recent trade quote. Simulated orders are paused.', true);
          return;
        }
        const updated = Date.parse(next.updatedAt);
        if (updated < lastObservation) return;
        lastObservation = updated;
        quote = next;
        say('Using a fresh exchange trade quote. Fills stay in this browser.');
        paperView?.refresh();
        return paperView?.observeQuote();
      })
      .catch(() => {
        if (!controller.signal.aborted && controller === session) {
          quote = null;
          paperView?.refresh();
          say('Quote unavailable. Refresh or select another pair.', true);
        }
      })
      .finally(() => { if (pending === task) pending = null; });
    pending = task;
    return task;
  }

  async function refreshHistory() {
    session?.abort();
    const controller = new AbortController();
    session = controller;
    const selected = market, timeframe = interval;
    const requestedAt = Date.now();
    const before = end.value ? historyCursor(end.value, INTERVALS[timeframe], Math.floor(requestedAt / 1000)) : null;
    host.replaceChildren();
    refreshButton.disabled = false;
    if (end.validity.badInput || end.value && before === null) {
      say('Choose a valid date through today or clear the end date for the latest window.', true);
      return;
    }
    say('Loading closed exchange candles…');
    refreshButton.disabled = true;
    const params = new URLSearchParams({ venue: selected.venue, symbol: selected.symbol, interval: timeframe });
    if (before !== null) params.set('before', String(before));
    try {
      const response = await request(`candles?${params}`, { signal: controller.signal });
      if (controller.signal.aborted || controller !== session) return;
      const history = preparePracticeHistory(response, selected, timeframe, { requestedAt, before });
      const minimum = view === 'replay' ? 25 : 60;
      if (history.bars.length < minimum) {
        throw Error(`This view needs ${minimum} consecutive closed candles. ${history.provider} supplied ${history.bars.length} in the latest continuous segment.`);
      }
      const window = view === 'strategy' ? ` · ${practiceSpan(history.bars[0].time, history.bars.at(-1).time)}` : '';
      const origin = history.stale ? 'Cached historical snapshot' : 'Provider candle snapshot';
      const gap = history.excludedByGap ? ' · using the latest gap-free segment' : '';
      say(`${history.provider} · ${selected.base}/${selected.quote} · ${timeframe} · ${origin}${window} · observed ${stamp(history.fetchedAt)}${gap}`);
      if (view === 'replay') mountReplay({ root: host, history, instrument: selected, signal: controller.signal });
      else mountStrategyLab({ root: host, history, instrument: selected, signal: controller.signal });
      hydrate();
    } catch (error) {
      if (!controller.signal.aborted && controller === session) {
        controller.abort();
        host.replaceChildren();
        say(`Historical data unavailable. ${error.message}`, true);
      }
    } finally {
      if (controller === session) refreshButton.disabled = false;
    }
  }

  function choose(next) {
    market = next;
    options();
    onInstrument(market);
    if (!paper) return refreshHistory();
    session?.abort();
    session = new AbortController();
    quote = pending = null;
    lastObservation = 0;
    say('Connecting to the selected exchange…');
    host.innerHTML = paperPanel(market);
    paperView = bindPaperPanel({ host, instrument: market, getQuote: () => quote, storage, signal: session.signal });
    hydrate();
    return refreshQuote();
  }

  const refresh = paper ? refreshQuote : refreshHistory;
  const listen = { signal: scope.signal };
  venue.addEventListener('change', () => choose(selectVenueInstrument(market, getInstruments(venue.value) ?? [], venue.value)), listen);
  pair.addEventListener('change', () => {
    const next = getInstruments(market.venue)?.find(item => item.symbol === pair.value);
    if (next) choose(next);
  }, listen);
  refreshButton.addEventListener('click', refresh, listen);
  intervalSelect?.addEventListener('change', () => { interval = intervalSelect.value; onInterval(interval); refresh(); }, listen);
  end?.addEventListener('change', refresh, listen);
  choose(market);
  const timer = paper ? clock.setInterval(() => { if (!root.ownerDocument.hidden) refresh(); }, 8000) : null;

  return {
    refresh, options, currentQuote: () => usableQuote(quote, market),
    dispose() { scope.abort(); session?.abort(); if (timer !== null) clock.clearInterval(timer); },
  };
}
