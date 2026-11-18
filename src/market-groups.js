import {asNumber} from './numbers.js';
import {ago, compact, esc, icon, num, pct, price, stamp, tone} from './ui.js';

// Curated Coinpaprika IDs. Sources and refresh instructions are in docs/market-groups.md.
const categories = [
  {id: 'layer-1', label: 'Layer 1', detail: 'Native assets of selected base blockchain networks.', ids: new Set([
    'btc-bitcoin', 'eth-ethereum', 'bnb-binance-coin', 'sol-solana', 'trx-tron', 'hype-hyperliquid',
    'ada-cardano', 'near-near-protocol', 'bch-bitcoin-cash', 'ltc-litecoin', 'avax-avalanche',
    'toncoin-the-open-network', 'sui-sui', 'hbar-hedera-hashgraph', 'algo-algorand', 'atom-cosmos',
  ])},
  {id: 'layer-2', label: 'Layer 2', detail: 'Selected scaling networks that build on a base chain.', ids: new Set([
    'mnt-mantle', 'arb-arbitrum', 'strk-starknet', 'op-optimism', 'imx-immutable-x', 'linea-linea',
    'zk-zksync', 'metis-metis-token', 'ctsi-cartesi',
  ])},
  {id: 'defi', label: 'DeFi', detail: 'Selected projects for on-chain exchange, lending and other financial services.', ids: new Set([
    'hype-hyperliquid', 'uni-uniswap', 'aave-new', 'ena-ethena', 'jup-jupiter-exchange-token',
    'lit-lighter', 'cake-pancakeswap', 'ethfi-etherfi', 'ray-raydium', 'crv-curve-dao-token', 'pendle-pendle',
  ])},
  {id: 'stablecoins', label: 'Stablecoins', detail: 'Selected tokens that aim to track the U.S. dollar.', ids: new Set([
    'usdt-tether', 'usdc-usd-coin', 'usds-usds', 'dai-dai', 'usde-ethena-usde', 'usd1-usd1',
    'usdg-global-dollar', 'pyusd-paypal-usd', 'usdd-usdd', 'gho-gho', 'tusd-trueusd', 'fdusd-first-digital-usd',
  ])},
  {id: 'ai-compute', label: 'AI & compute', detail: 'Selected projects for AI, computing and data infrastructure.', ids: new Set([
    'fetch-ai', 'tao-bittensor', 'rndr-render-token', 'virtual-virtual-protocol', 'grt-the-graph',
    'akt-akash-network', 'theta-theta-token', 'aioz-aioz-network', 'glm-golem', 'nmr-numeraire',
    'io-ionet', 'rlc-iexec-rlc',
  ])},
  {id:'tokenized-oracles',label:'Tokenized assets & oracles',detail:'Selected tokens tied to off-chain assets or used in data networks.',ids:new Set(['paxg-pax-gold','xaut-tether-gold','link-chainlink','pyth-pyth-network'])},
  {id:'gaming',label:'Gaming & virtual worlds',detail:'Selected assets used in blockchain games, virtual worlds, or gaming infrastructure.',ids:new Set(['imx-immutable-x','axs-axie-infinity','gala-gala','sand-the-sandbox','mana-decentraland'])},
  {id: 'meme', label: 'Meme coins', detail: 'Selected assets associated with internet memes and communities.', ids: new Set([
    'doge-dogecoin', 'shib-shiba-inu', 'pepe-pepe', 'bonk-bonk', 'floki-floki-inu', 'fartcoin-fartcoin',
    'turbo-turbo', 'bome-book-of-meme', 'brett-brett-base', 'toshi-toshi', 'mew-cat-in-a-dogs-world',
  ])},
];
const activity = [
  {id: 'all', label: 'All priced', icon: 'globe', detail: 'Shows every priced result in this feed.'},
  {id: 'gainers', label: 'Gainers', icon: 'arrow-up', metric: 'change', direction: 1, detail: 'Assets that rose over 24 hours, biggest gains first.'},
  {id: 'losers', label: 'Losers', icon: 'arrow-down', metric: 'change', direction: -1, detail: 'Assets that fell over 24 hours, biggest losses first.'},
  {id: 'volume', label: 'Trading volume', icon: 'chart-no-axes-combined', metric: 'volume', direction: 1, detail: 'Assets with reported trading volume over 24 hours, highest first.'},
];
const activityById = new Map(activity.map(group => [group.id, group]));
const categoryById = new Map(categories.map(group => [group.id, group]));

export function filterMarketGroup(rows, group = 'all', universe = 'aggregate') {
  const category = universe === 'aggregate' && categoryById.get(group);
  if (category) return rows.filter(row => category.ids.has(row.id));
  const metric = activityById.get(group);
  if (!metric?.metric) return rows.slice();
  const {direction, metric: key} = metric;
  return rows
    .filter(row => asNumber(row[key]) * direction > 0)
    .sort((a, b) => direction * (b[key] - a[key]));
}

function activityValue(group, rows, universe) {
  if (!rows.length) return group.id === 'all' ? '0 assets' : 'None reported';
  if (group.id === 'all') return `${num(rows.length, 0)} assets`;
  if (group.id === 'volume') {
    const value = compact(rows[0].volume);
    return universe === 'exchange' ? `${value} USDT highest` : `$${value} highest`;
  }
  return `${esc(rows[0].symbol)} ${pct(rows[0].change)}`;
}

export function renderMarketGroups({assets, group = 'all', mode = 'basic', universe = 'aggregate'} = {}) {
  const category = universe === 'aggregate' && categoryById.get(group);
  const active = category || activityById.get(group) || activity[0];
  const scope = universe === 'exchange' ? 'Binance spot snapshot · USDT' : 'Coinpaprika snapshot · Aggregate USD';
  const button = (item, value) => `<button type="button" class="market-group-button" data-action="market-group" data-market-group="${item.id}" aria-pressed="${active.id === item.id}" aria-controls="market-results"><span class="market-group-label">${item.icon && mode === 'basic' ? `<span aria-hidden="true">${icon(item.icon)}</span>` : ''}${item.label}</span>${value ? `<small>${value}</small>` : ''}</button>`;
  const activityButtons = activity.map(item => {
    const value = assets && mode === 'basic' ? activityValue(item, filterMarketGroup(assets, item.id, universe), universe) : '';
    return button(item, value);
  }).join('');
  const categoryButtons = universe === 'aggregate' ? `<div class="market-group-categories" role="group" aria-label="Curated asset categories">
    <span class="market-group-caption">Curated categories</span>
    <div class="market-group-options">${categories.map(item => button(item, '')).join('')}</div>
  </div>` : '';
  const coverage = category && assets ? ` ${num(filterMarketGroup(assets, category.id, universe).length, 0)} of ${category.ids.size} curated assets priced in this snapshot.` : '';
  return `<section class="market-groups ${mode === 'pro' ? 'market-groups-pro' : 'market-groups-basic'}" aria-label="Discover markets">
    <div class="market-group-heading"><h2>24-hour activity</h2><span class="source">${scope}</span></div>
    <div class="market-group-options market-group-activity" role="group" aria-label="24-hour activity">${activityButtons}</div>
    ${categoryButtons}
    <p class="market-group-description" role="status">${active.detail}${coverage}</p>
  </section>`;
}

export function renderMarketCards(rows, {universe = 'aggregate', watchlist = []} = {}) {
  const exchange = universe === 'exchange';
  const saved = new Set(watchlist);
  return `<ul class="market-discovery-cards" aria-label="Market results">${rows.map(row => {
    const id = esc(row.id);
    const symbol = esc(row.symbol);
    const name = esc(exchange ? row.symbol : row.name);
    const marked = saved.has(row.id);
    const volume = asNumber(row.volume);
    const subtitle = exchange ? esc(row.name) : `${symbol}${row.rank ? ` · #${esc(row.rank)}` : ''}`;
    const shownVolume = volume === null || volume < 0 ? '—' : `${exchange ? '' : '$'}${compact(volume)}`;
    return `<li class="market-discovery-card"${exchange ? ` data-live-row="${id}"` : ''}>
      <div class="market-card-heading">
        <button type="button" class="market-card-asset" data-action="${exchange ? 'exchange-chart' : 'asset-chart'}" data-id="${id}">
          <span class="coin-mark" aria-hidden="true">${esc(row.symbol.slice(0, 2))}</span>
          <span><strong>${name}</strong><small>${subtitle}</small></span>
          <span class="market-card-arrow" aria-hidden="true">${icon('arrow-up-right')}</span>
        </button>
        <button type="button" class="star-button${marked ? ' selected' : ''}" data-action="watch" data-id="${id}" aria-label="Watch ${name}${exchange ? ' on Binance' : ''}" aria-pressed="${marked}"><span aria-hidden="true">${icon('star')}</span></button>
      </div>
      <dl class="market-card-metrics">
        <div class="market-card-price"><dt>Price · ${exchange ? 'USDT' : 'USD'}</dt><dd class="mono"${exchange ? ' data-live-price' : ''}>${price(row.price, exchange ? '' : '$')}</dd></div>
        <div><dt>24h change</dt><dd class="mono ${tone(row.change)}"${exchange ? ' data-live-change' : ''}>${pct(row.change)}</dd></div>
        <div><dt>24h volume${exchange ? ' · USDT' : ''}</dt><dd class="mono"${exchange ? ' data-live-volume' : ''}>${shownVolume}</dd></div>
        <div><dt>Updated</dt><dd title="${esc(stamp(row.updatedAt))}"${exchange ? ' data-live-time' : ''}>${ago(row.updatedAt)}</dd></div>
      </dl>
    </li>`;
  }).join('')}</ul>`;
}

export function renderMarketBreadth(assets) {
  const ranked = (assets ?? []).filter(row => asNumber(row.rank) > 0 && asNumber(row.price) > 0)
    .sort((a, b) => a.rank - b.rank).slice(0, 100);
  const changes = ranked.map(row => asNumber(row.change)).filter(change => change !== null);
  const up = changes.filter(change => change > 0).length;
  const down = changes.filter(change => change < 0).length;
  const flat = changes.length - up - down;
  const buckets = [[up, 'Up', 'positive'], [down, 'Down', 'negative'], [flat, 'Unchanged', 'muted']];
  return `<div class="panel-top"><h2>Market breadth</h2>${icon('activity')}</div>
    <div class="market-breadth">
      ${ranked.length ? `<p class="source">Coinpaprika · top ${ranked.length} ranked · ${changes.length} of ${ranked.length} with 24h data</p>` : ''}
      ${changes.length ? `<div class="market-breadth-track" aria-hidden="true">${buckets.filter(([count]) => count > 0).map(([count, , color]) => `<span class="${color}" style="flex-grow:${count}"></span>`).join('')}</div>
      <ul class="market-breadth-legend" aria-label="24-hour breadth counts">${buckets.map(([count, label, color]) => `<li><strong class="${color}">${count}</strong> ${label}</li>`).join('')}</ul>` : `<p class="source">${assets ? 'No 24h changes available.' : 'Waiting for the market snapshot…'}</p>`}
    </div>`;
}
