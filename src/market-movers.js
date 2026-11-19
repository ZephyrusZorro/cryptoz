import {ago, pct, stamp, tone} from './ui.js';

const states = {
  idle: 'Waiting for the Binance market list',
  connecting: 'Connecting to Binance',
  streaming: 'Live · updates about every second',
  delayed: 'Live feed delayed',
  reconnecting: 'Reconnecting to Binance',
  offline: 'Offline',
  paused: 'Live feed paused'
};
const qualityText = {live:'Live', snapshot:'Snapshot', last:'Last quote'};
const groups = [['gainers','Top 5 gainers'],['losers','Top 5 losers']];

export function marketMoverRanks(observations) {
  const gainers = [], losers = [];
  for (const observation of observations) {
    const quote = observation?.quote;
    if (!quote || !Number.isFinite(quote.price) || quote.price <= 0 ||
      !Number.isFinite(quote.change) || quote.change === 0 ||
      !Number.isFinite(quote.volume) || quote.volume <= 0) continue;
    (quote.change > 0 ? gainers : losers).push(observation);
  }
  const compare = direction => (a,b) => direction * (b.quote.change - a.quote.change) ||
    a.quote.symbol.localeCompare(b.quote.symbol, 'en');
  return {
    gainers:gainers.sort(compare(1)).slice(0,5),
    losers:losers.sort(compare(-1)).slice(0,5)
  };
}

export function marketMoversPanel() {
  return `<section id="market-movers" class="era-market-movers" aria-label="Binance market movers">
    <div class="era-movers-heading"><span>Binance USDT pairs · rolling 24h</span><span data-movers-status role="status">Connecting to Binance</span></div>
    ${groups.map(([id,label])=>`<section class="panel era-movers"><div class="panel-top"><h2 id="mover-title-${id}" tabindex="-1">${label}</h2></div><div data-movers-list="${id}" aria-labelledby="mover-title-${id}"></div><p data-movers-empty="${id}" class="data-note">Loading Binance prices…</p></section>`).join('')}
  </section>`;
}

function text(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function makeRow(document, symbol) {
  const button = document.createElement('button');
  button.className = 'watch-row';
  button.type = 'button';
  button.dataset.action = 'exchange-chart';
  button.dataset.id = symbol;
  button.dataset.moverSymbol = symbol;
  button.innerHTML = '<span class="mover-identity"><b></b><small data-mover-quality></small></span><span class="mover-quote"><span data-mover-price></span> <b data-mover-change></b></span>';
  const quality = button.querySelector('[data-mover-quality]');
  button.querySelector('.mover-identity b').textContent = symbol.slice(0,-4);
  return {button, quality, price:button.querySelector('[data-mover-price]'), change:button.querySelector('[data-mover-change]')};
}

export function createMarketMovers(document, stream, formatPrice) {
  let root, status, panels;

  function mount(node) {
    if (root === node) return;
    root = node;
    if (!root) {
      status = null;
      panels = null;
      return;
    }
    status = root.querySelector('[data-movers-status]');
    panels = groups.map(([id])=>({
      id,
      list:root.querySelector('[data-movers-list="' + id + '"]'),
      empty:root.querySelector('[data-movers-empty="' + id + '"]'),
      heading:root.querySelector('#mover-title-' + id),
      rows:new Map()
    }));
  }

  function render(panel, observations, hasQuotes) {
    const {id,list,empty,heading,rows} = panel;
    const active = document.activeElement;
    const children = [...list.children];
    const focusIndex = children.indexOf(active);
    const wanted = new Set(observations.map(({quote})=>quote.symbol));

    for (const [symbol, row] of rows) {
      if (wanted.has(symbol)) continue;
      row.button.remove();
      rows.delete(symbol);
    }
    for (const [index, observation] of observations.entries()) {
      const {quote,quality} = observation;
      const row = rows.get(quote.symbol) ?? makeRow(document, quote.symbol);
      rows.set(quote.symbol, row);
      text(row.price, formatPrice(quote.price));
      text(row.change, pct(quote.change));
      const color = tone(quote.change);
      if (row.change.className !== color) row.change.className = color;
      if (row.updatedAt !== quote.updatedAt) {
        row.quality.title = stamp(quote.updatedAt);
        row.updatedAt = quote.updatedAt;
      }
      text(row.quality, quality === 'last' ? 'Last quote · ' + ago(quote.updatedAt) : qualityText[quality]);
      if (list.children[index] !== row.button) list.insertBefore(row.button, list.children[index] ?? null);
    }
    text(empty, hasQuotes ? (id === 'gainers' ? 'No positive 24-hour moves.' : 'No negative 24-hour moves.') : 'Waiting for Binance prices…');
    empty.hidden = observations.length > 0;
    if (focusIndex !== -1 && active !== document.activeElement) {
      const target = list.contains(active) ? active : list.children[Math.min(focusIndex, list.children.length - 1)] ?? heading;
      target.focus({preventScroll:true});
    }
  }

  function refresh() {
    if (!panels) return;
    const source = stream.status().state;
    const observations = [...stream.observations()];
    const ranks = marketMoverRanks(observations);
    const entries = [...ranks.gainers, ...ranks.losers];
    const mixed = source === 'streaming' && entries.some(entry=>entry.quality !== 'live');
    const caption = (states[source] ?? states.idle) +
      (mixed ? ' · fallback quotes marked' : source !== 'streaming' && entries.length ? ' · last available quotes' : '');
    text(status, caption);
    status.dataset.state = source;
    for (const panel of panels) render(panel, ranks[panel.id], observations.length > 0);
  }
  return {mount, refresh};
}
