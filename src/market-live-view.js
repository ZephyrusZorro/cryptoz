import {ago,pct,stamp,tone} from './ui.js';
import {setMoneyText} from './currency.js';

const statusLabels = {
  idle: 'Waiting for Binance markets',
  connecting: 'Connecting to Binance',
  streaming: 'Binance stream · ~1s',
  delayed: 'Updates delayed',
  reconnecting: 'Reconnecting to Binance',
  offline: 'Offline · last update retained',
  paused: 'Updates paused'
};
const qualityLabels = {live: 'Live', snapshot: 'Snapshot', last: 'Last'};

function text(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function tint(node, value) {
  if (!node) return;
  const next = tone(value);
  if (node.dataset.priceTone === next) return;
  node.classList.remove('positive', 'negative', 'muted');
  node.classList.add(next);
  node.dataset.priceTone = next;
}

export function createLiveMarketView(root, stream) {
  let bySymbol = new Map(), badges = [];
  const register = (symbol, view) => {
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push(view);
  };

  function paint(symbol) {
    const targets = bySymbol.get(symbol);
    if (!targets) return;
    const observation = stream.observation(symbol);
    if (!observation) return;
    const {quote, quality} = observation;
    for (const view of targets) {
      const {time, change, volume, value} = view;
      if (view.timestamp !== quote.updatedAt) {
        setMoneyText(value,quote.price,'USDT');
        setMoneyText(volume,quote.volume,'USDT','compact');
        if (time) time.title = stamp(quote.updatedAt);
        if (change) change.title = stamp(quote.updatedAt);
        tint(change, quote.change);
      }
      if (view.kind === 'chip') {
        const suffix = quality === 'live' ? '24h' : quality === 'snapshot' ? 'snapshot' : 'last update';
        text(change, pct(quote.change) + ' · ' + suffix);
      } else {
        text(change, pct(quote.change));
        text(time, view.kind === 'benchmark' ? qualityLabels[quality] + ' · 24h'
          : qualityLabels[quality] + ' · ' + ago(quote.updatedAt));
      }
      view.timestamp = quote.updatedAt;
    }
  }

  function updateBadges(state) {
    for (const badge of badges) {
      if (badge.dataset.state === state) continue;
      badge.dataset.state = state;
      text(badge, statusLabels[state] ?? statusLabels.connecting);
    }
  }

  function sync() {
    bySymbol = new Map();
    badges = Array.from(root.querySelectorAll('[data-live-status]'));
    for (const chip of root.querySelectorAll('[data-live-chip]')) {
      register(chip.dataset.liveChip, {kind: 'chip', value: chip.querySelector('strong'), change: chip.querySelector('small')});
    }
    for (const row of root.querySelectorAll('[data-live-row]')) {
      register(row.dataset.liveRow, {
        kind: 'row', value: row.querySelector('[data-live-price]'), change: row.querySelector('[data-live-change]'),
        volume: row.querySelector('[data-live-volume]'), time: row.querySelector('[data-live-time]')
      });
    }
    const value = root.querySelector('#benchmark-price'), details = root.querySelector('#benchmark-change');
    if (value && details) {
      const change = details.querySelector('span') ?? details.appendChild(root.createElement('span'));
      const time = details.querySelector('small') ?? details.appendChild(root.createElement('small'));
      register('BTCUSDT', {kind: 'benchmark', value, change, time});
    }
    updateBadges(stream.status().state);
    bySymbol.forEach((_, symbol) => paint(symbol));
  }

  return {
    sync,
    patch(batch) {
      for (const symbol of batch.keys()) paint(symbol);
    },
    status({state, transition}) {
      updateBadges(state);
      if (state === 'streaming' && transition) return;
      bySymbol.forEach((_, symbol) => paint(symbol));
    }
  };
}
