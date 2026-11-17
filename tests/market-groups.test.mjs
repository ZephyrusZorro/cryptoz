import assert from 'node:assert/strict';
import test from 'node:test';
import {filterMarketGroup, renderMarketBreadth, renderMarketCards, renderMarketGroups} from '../src/market-groups.js';

const market = (id, symbol, change, rank, volume) => ({
  id, symbol, name: symbol, change, rank, volume, price: 1, marketCap: 150, updatedAt: '2026-11-18T01:00:00Z',
});
const rows = [
  market('other-solana', 'SOL', 3, 5, 10),
  market('sol-solana', 'SOL', 4, 2, 200),
  market('btc-bitcoin', 'BTC', -2, 1, 100),
  market('usdc-usd-coin', 'USDC', 0, 3, 50),
  market('fetch-ai', 'FET', null, 4, 20),
  market('mystery', 'MYS', -7, 8, null),
];
const ids = list => list.map(row => row.id);

test('curated groups require listed Coinpaprika identities and cannot classify exchange symbols', () => {
  assert.deepEqual(ids(filterMarketGroup(rows, 'layer-1', 'aggregate')), ['sol-solana', 'btc-bitcoin']);
  assert.deepEqual(ids(filterMarketGroup(rows, 'stablecoins', 'aggregate')), ['usdc-usd-coin']);
  assert.deepEqual(ids(filterMarketGroup(rows, 'ai-compute', 'aggregate')), ['fetch-ai']);
  assert.deepEqual(ids(filterMarketGroup(rows, 'layer-1', 'exchange')), ids(rows));
});

test('activity groups rank signed returns or known positive volume without disturbing input order', () => {
  assert.deepEqual(ids(filterMarketGroup(rows, 'gainers')), ['sol-solana', 'other-solana']);
  assert.deepEqual(ids(filterMarketGroup(rows, 'losers')), ['mystery', 'btc-bitcoin']);
  assert.deepEqual(ids(filterMarketGroup(rows, 'volume')), ['sol-solana', 'btc-bitcoin', 'usdc-usd-coin', 'fetch-ai', 'other-solana']);
  assert.equal(rows[0].id, 'other-solana');
  assert.deepEqual(filterMarketGroup([market('unknown', 'UNK', false, 1, -15)], 'volume'), []);
});

test('market breadth limits itself by rank and distinguishes flat returns from missing returns', () => {
  const negativeOutsideRank = Array.from({length: 100}, (_, i) => market(`tail-${i}`, 'TAIL', -10, 100 + i, 1));
  const subset = [...negativeOutsideRank, ...rows.slice(0, 5), market('unranked', 'UNK', -5, null, 1)];
  const markup = renderMarketBreadth(subset);
  assert.match(markup, /top 100 ranked/);
  assert.match(markup, /99 of 100 with 24h data/);
  assert.match(markup, /2<\/strong> Up/);
  assert.match(markup, /96<\/strong> Down/);
  assert.match(markup, /1<\/strong> Unchanged/);
  assert.match(renderMarketBreadth([rows[4]]), /No 24h changes available/);
});

test('group controls disclose curated aggregate coverage and mark the active filter', () => {
  const basic = renderMarketGroups({assets: rows, group: 'stablecoins', mode: 'basic', universe: 'aggregate'});
  assert.match(basic, /data-action="market-group" data-market-group="stablecoins" aria-pressed="true"/);
  assert.match(basic, /Curated/);
  assert.match(basic, /1 of \d+ curated assets priced/);
  assert.match(basic, /\+4%/);
  const exchange = renderMarketGroups({assets: rows, group: 'layer-1', mode: 'pro', universe: 'exchange'});
  assert.doesNotMatch(exchange, /data-market-group="layer-1"/);
  assert.match(exchange, /data-market-group="all" aria-pressed="true"/);
  assert.match(exchange, /USDT/);
});

test('Basic results keep stable watch and chart actions and Binance live-update hooks', () => {
  const item = {...rows[1], id: 'SOLUSDT', name: '<test>'};
  const cards = renderMarketCards([item], {universe: 'exchange', watchlist: ['SOLUSDT']});
  assert.match(cards, /data-action="exchange-chart" data-id="SOLUSDT"/);
  assert.match(cards, /data-action="watch" data-id="SOLUSDT"[^>]+aria-pressed="true"/);
  assert.match(cards, /data-live-row="SOLUSDT"/);
  for (const name of ['price', 'change', 'volume', 'time']) assert.match(cards, new RegExp(`data-live-${name}`));
  assert.match(cards, /&lt;test&gt;/);
  assert.doesNotMatch(cards, /<test>/);
});
