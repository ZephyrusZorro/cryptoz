import test from 'node:test';
import assert from 'node:assert/strict';
import * as replay from '../src/practice-replay.js';
import * as lab from '../src/practice-lab.js';
import * as paper from '../src/paper-trading.js';

const now = Date.parse('2026-11-18T10:00:00Z');
const hour = 3600;
const btc = { venue: 'binance', symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT' };
const eth = { venue: 'binance', symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT' };
const coinbase = { venue: 'coinbase', symbol: 'BTC-USD', base: 'BTC', quote: 'USD' };
const start = now / 1000 - 70 * hour;
const bar = (index, open = 100, close = open) => ({
  time: start + index * hour, open, close,
  high: Math.max(open, close) + 1, low: Math.min(open, close) - 1, volume: 100,
});
const flat = Array.from({ length: 65 }, (_, index) => bar(index));
const quote = (price, time = now, market = btc, overrides = {}) => ({
  venue: market.venue, symbol: market.symbol, price, updatedAt: new Date(time).toISOString(),
  stale: false, source: 'REST', ...overrides,
});

test('historical input enforces venue, pair, interval, observation time and contiguous provider candles', () => {
  const fetchedAt = new Date((start + 65 * hour) * 1000).toISOString();
  const bars = [...flat.filter((_, i) => i !== 5), bar(65), bar(66)];
  const response = { provider: 'Binance', fetchedAt, cache: 'stale', data: { ...btc, interval: '1h', bars } };
  const history = replay.preparePracticeHistory(response, btc, '1h', { requestedAt: now });
  assert.equal(history.bars[0].time, bar(6).time);
  assert.equal(history.bars.at(-1).time, bar(64).time);
  assert.equal(history.stale, true);
  assert.equal(history.excludedByGap, 5);
  assert.throws(() => replay.preparePracticeHistory(response, eth, '1h', { requestedAt: now }), /match/i);
  assert.throws(() => replay.preparePracticeHistory(response, btc, '4h', { requestedAt: now }), /match/i);
  assert.throws(() => replay.preparePracticeHistory({ ...response, fetchedAt: null }, btc, '1h', { requestedAt: now }), /time/i);
  const gap = { ...response, data: { ...response.data, bars: [...bars, bar(60, 200)] } };
  assert.equal(replay.preparePracticeHistory(gap, btc, '1h', { requestedAt: now }).bars[0].time, bar(61).time);
});

test('replay exposes no unrevealed candle and fills queued orders with costs at the following open', () => {
  const bars = flat.slice(0, 24).concat(bar(24, 140, 110), bar(25, 120));
  const session = replay.createReplaySession(bars, { initialCash: 1000, feeBps: 10, slippageBps: 5 });
  const before = session.state();
  assert.equal(before.bars.length, 24);
  assert.equal(before.bars.at(-1).close, 100);
  session.queue('buy', '2');
  assert.equal(session.state().fills.length, 0);
  const after = session.step(600);
  assert.equal(after.bars.length, 25);
  assert.equal(after.fills[0].time, bar(24).time);
  assert.ok(Math.abs(after.fills[0].price - 140.07) < 1e-10);
  assert.ok(Math.abs(after.cash - 719.57986) < 1e-9);
  assert.equal(after.quantity, 2);
  assert.equal(session.step(-1).bars.length, 26);
  assert.throws(() => session.queue('sell', '2'), /next candle/i);
  assert.equal(session.reset().fills.length, 0);
});

test('replay rejects a next-open gap beyond cash and leaves no positions or phantom fee', () => {
  const session = replay.createReplaySession(flat.slice(0, 24).concat(bar(24, 200), bar(25)), { initialCash: 100 });
  session.queue('buy', '1');
  const after = session.step();
  assert.equal(after.cash, 100);
  assert.equal(after.quantity, 0);
  assert.equal(after.fills.length, 0);
  assert.equal(after.totalFees, 0);
  assert.match(after.lastError, /cash/i);
  assert.throws(() => session.queue('sell', '1'), /position/i);
  assert.throws(() => session.queue('buy', '0'), /quantity/i);
});

test('strategy decisions fill on later openings, and realized gains include entry fees', () => {
  const bars = [...flat];
  bars[50] = bar(50, 100, 110);
  bars[51] = bar(51, 120, 120);
  bars[52] = bar(52, 120, 96);
  bars[53] = bar(53, 85, 97);
  const result = lab.runStrategyBacktest(bars, { strategyId: 'channel-breakout', initialCapital: 1000, feeBps: 100, slippageBps: 100 });
  assert.equal(result.ready, true);
  assert.equal(result.trades.length, 1);
  const trade = result.trades[0];
  assert.equal(trade.entryTime, bar(51).time);
  assert.equal(trade.entryPrice, 121.2);
  assert.equal(trade.exitTime, bar(53).time);
  assert.equal(trade.exitPrice, 84.15);
  assert.ok(Math.abs(trade.pnl - (result.finalEquity - 1000)) < 1e-9);
  assert.equal(result.winRatePct, 0);
  assert.ok(result.totalFees > 10);
});

test('strategy marks an open position and leaves a final close signal unfilled', () => {
  const bars = [...flat];
  bars[62] = bar(62, 100, 110);
  bars[63] = bar(63, 125, 120);
  bars[64] = bar(64, 120, 98);
  const result = lab.runStrategyBacktest(bars, { strategyId: 'channel-breakout', feeBps: 0, slippageBps: 0 });
  assert.equal(result.trades.length, 0);
  assert.equal(result.openPosition.quantity, 80);
  assert.equal(result.finalEquity, 7840);
  assert.equal(result.pendingSide, 'sell');
  assert.equal(result.winRatePct, null);
  assert.equal(lab.runStrategyBacktest(bars, { feeBps: -1 }).ready, false);
  assert.equal(lab.runStrategyBacktest(bars, { strategyId: 'unknown' }).ready, false);
});

function workingStore() {
  let item = JSON.stringify({ version: 1, trades: [] });
  let canWrite = true;
  const store = paper.createPaperStore({
    getItem: () => item,
    setItem(_key, value) { if (!canWrite) throw Error('Quota exceeded'); item = value; },
  });
  return { store, writable: value => { canWrite = value; } };
}
const limit = { type: 'limit', side: 'buy', triggerPrice: '100', quantity: '2' };

test('working paper limit uses only newer fresh quotes from its own market and honors the execution price cap', () => {
  const { store } = workingStore();
  store.addWorking(btc, limit, { now });
  assert.equal(store.settleWorking(btc, quote(95), { now }).fills.length, 0);
  assert.equal(store.settleWorking(eth, quote(95, now + 10, eth), { now: now + 10 }).fills.length, 0);
  assert.equal(store.settleWorking(coinbase, quote(95, now + 10, coinbase), { now: now + 10 }).fills.length, 0);
  assert.equal(store.settleWorking(btc, quote(95, now + 10, btc, { stale: true }), { now: now + 10 }).fills.length, 0);
  assert.equal(store.settleWorking(btc, quote(100, now + 20), { now: now + 20 }).fills.length, 0);
  const ledger = store.settleWorking(btc, quote(99, now + 30), { now: now + 30 });
  assert.equal(ledger.fills.length, 1);
  assert.equal(ledger.workingOrders[0].status, 'filled');
  assert.equal(ledger.workingOrders[0].executionPrice, 99.0495);
  assert.equal(store.settleWorking(btc, quote(99, now + 30), { now: now + 30 }).fills.length, 1);
});

test('working paper writes atomically and rejects a triggered cash shortfall without negative cash', () => {
  const { store, writable } = workingStore();
  store.addWorking(btc, { ...limit, quantity: '1000' }, { now });
  store.addWorking(btc, limit, { now });
  writable(false);
  assert.throws(() => store.settleWorking(btc, quote(98, now + 10), { now: now + 10 }), /could not be saved/i);
  assert.deepEqual(store.read().workingOrders.map(order => order.status), ['working', 'working']);
  assert.equal(store.read().fills.length, 0);
  writable(true);
  const ledger = store.settleWorking(btc, quote(98, now + 10), { now: now + 10 });
  assert.deepEqual(ledger.workingOrders.map(order => order.status), ['rejected', 'filled']);
  const summary = paper.paperSummary(ledger, btc, null, { now: now + 10 });
  assert.equal(summary.quantity, '2');
  assert.ok(summary.cash > 0);
});

test('working stop and target orders require sells and cannot cancel orders in another market', () => {
  const { store } = workingStore();
  assert.throws(() => store.addWorking(btc, { ...limit, type: 'stop-loss' }, { now }), /sell/i);
  store.fill(btc, { side: 'buy', quantity: '1' }, quote(100), { now });
  const conditions = store.addWorking(btc, { type: 'stop-loss', side: 'sell', triggerPrice: 90, quantity: '1' }, { now });
  const order = conditions.workingOrders[0];
  assert.throws(() => store.cancelWorking(eth, order.id), /market/i);
  assert.equal(store.settleWorking(btc, quote(89, now + 20), { now: now + 20 }).workingOrders[0].status, 'filled');
  assert.equal(store.read().fills.at(-1).side, 'sell');
  const next = store.addWorking(btc, { ...limit, type: 'take-profit', side: 'sell' }, { now }).workingOrders.at(-1);
  assert.equal(store.cancelWorking(btc, next.id).workingOrders.at(-1).status, 'cancelled');
  assert.equal(store.settleWorking(btc, quote(120, now + 20), { now: now + 20 }).fills.length, 2);
});

test('the paper quote endpoint preserves trade timestamps and refuses invalid venue responses', async () => {
  const { createGateway } = await import('../server/gateway.js');
  const seen = [];
  const observed = now - 60000;
  const gateway = createGateway({ now: () => now, fetcher: async raw => {
    const endpoint = new URL(raw);
    seen.push(endpoint.pathname + endpoint.search);
    if (endpoint.hostname === 'data-api.binance.vision') {
      return Response.json(requestSymbol(endpoint) === 'ETHUSDT' ? [{}] : [{ price: '101.25', time: observed }]);
    }
    return Response.json({ price: '100.25', time: new Date(observed).toISOString() });
  } });
  const requestSymbol = endpoint => endpoint.searchParams.get('symbol');
  const get = path => gateway(new Request('http://localhost/api/trade-quote?' + path));
  const binanceResponse = await get('venue=binance&symbol=BTCUSDT');
  assert.equal(binanceResponse.status, 200);
  const binance = await binanceResponse.json();
  assert.deepEqual(binance.data, { venue: 'binance', symbol: 'BTCUSDT', price: 101.25, observedAt: '2026-11-18T09:59:00.000Z' });
  const coinbaseResponse = await get('venue=coinbase&symbol=BTC-USD');
  assert.equal(coinbaseResponse.status, 200);
  assert.equal((await coinbaseResponse.json()).data.price, 100.25);
  assert.equal((await get('venue=binance&symbol=ETHUSDT')).status, 502);
  assert.equal((await get('venue=binance&symbol=BTCUSDC')).status, 400);
  assert.deepEqual(seen, ['/api/v3/trades?symbol=BTCUSDT&limit=1', '/products/BTC-USD/ticker', '/api/v3/trades?symbol=ETHUSDT&limit=1']);
});
