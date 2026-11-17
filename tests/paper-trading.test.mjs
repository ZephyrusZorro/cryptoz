import test from 'node:test';
import assert from 'node:assert/strict';
import * as paper from '../src/paper-trading.js';

const btc = { venue: 'binance', symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT' };
const eth = { venue: 'binance', symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT' };
const usd = { venue: 'coinbase', symbol: 'BTC-USD', base: 'BTC', quote: 'USD' };
const now = Date.parse('2026-11-18T10:00:00Z');
const quote = (price, instrument = btc, changes = {}) => ({
  venue: instrument.venue, symbol: instrument.symbol, price,
  source: 'REST', stale: false, updatedAt: new Date(now).toISOString(), ...changes,
});
const submit = (ledger, side, quantity, price, instrument = btc) =>
  paper.fillPaperOrder(ledger, instrument, { side, quantity }, quote(price, instrument), { now });
const summary = (ledger, price, instrument = btc) =>
  paper.paperSummary(ledger, instrument, price === null ? null : quote(price, instrument), { now });

test('simulated buys debit slippage and fees from virtual cash without mutating prior state', () => {
  const starting = paper.createPaperLedger();
  const bought = submit(starting, 'buy', '2', 100);
  assert.equal(summary(starting, 100).cash, 10000);
  const position = summary(bought, 100);
  assert.equal(position.cash, 9799.6999);
  assert.equal(position.quantity, '2');
  assert.equal(position.basis, 200.3001);
  assert.equal(position.fills[0].fee, .2001);
  assert.equal(position.fills[0].executionPrice, 100.05);
});

test('partial sale books realized P&L and retains proportional average cost', () => {
  const starting = paper.createPaperLedger();
  const bought = submit(submit(starting, 'buy', '1', 90), 'buy', '1', 110);
  const sold = submit(bought, 'sell', '1', 120);
  const position = summary(sold, 120);
  assert.equal(position.cash, 9919.51996);
  assert.equal(position.quantity, '1');
  assert.equal(position.basis, 100.15005);
  assert.equal(position.realized, 19.67001);
  assert.equal(position.markValue, 119.82006);
  assert.equal(position.openPnl, 19.67001);
  assert.equal(position.totalPnl, 39.34002);
  assert.equal(position.fills[0].cashDelta, 119.82006);
  const closed = summary(submit(sold, 'sell', '1', 120), null);
  assert.equal(closed.quantity, '0');
  assert.equal(closed.basis, 0);
  assert.equal(closed.openPnl, 0);
  assert.equal(closed.realized, 39.34002);
});

test('cash is shared by markets in the same quote currency and positions are isolated by pair and venue', () => {
  const bought = submit(paper.createPaperLedger(), 'buy', '2', 100);
  assert.equal(summary(bought, 100, eth).cash, 9799.6999);
  assert.equal(summary(bought, 100, usd).cash, 10000);
  assert.equal(summary(bought, 100, eth).fills.length, 0);
  assert.throws(() => submit(bought, 'sell', '1', 100, eth), /position/i);
});

test('unverified quotes cannot execute trades or mark an open position', () => {
  const bought = submit(paper.createPaperLedger(), 'buy', '2', 100);
  for (const changes of [
    { stale: true }, { source: 'candle' }, { symbol: eth.symbol }, { venue: usd.venue },
    { updatedAt: new Date(now - 30001).toISOString() }, { updatedAt: new Date(now + 5001).toISOString() },
    { updatedAt: 'unknown' }, { price: Infinity },
  ]) {
    const stale = quote(100, btc, changes);
    assert.throws(() => paper.fillPaperOrder(bought, btc, { side: 'sell', quantity: '1' }, stale, { now }), /fresh/i);
    const position = paper.paperSummary(bought, btc, stale, { now });
    assert.equal(position.markValue, null);
    assert.equal(position.openPnl, null);
    assert.equal(position.totalPnl, null);
  }
});

test('over-budget and non-long-only orders cannot consume cash or positions', () => {
  const bought = submit(paper.createPaperLedger(), 'buy', '2', 100);
  assert.throws(() => submit(bought, 'sell', '2.000000000001', 100), /position/i);
  assert.throws(() => submit(paper.createPaperLedger(), 'buy', '99.9', 100), /cash/i);
  assert.throws(() => submit(bought, 'short', '1', 100), /buy or sell/i);
  for (const quantity of ['', '-1', '0', '0x1', 'NaN', '1.0000000000001']) {
    assert.throws(() => submit(bought, 'buy', quantity, 100), /quantity/i);
  }
  assert.equal(summary(bought, 100).quantity, '2');
});

test('tiny market prices retain precision and fractional quantities close exactly', () => {
  const initial = paper.createPaperLedger();
  const smallQuote = submit(initial, 'buy', '1000000000', 1e-9);
  assert.equal(summary(smallQuote, 1e-9).basis, 1.001501);
  assert.ok(summary(smallQuote, 1e-9).fills[0].executionPrice > 1e-9);
  const first = submit(initial, 'buy', '.1', 100);
  const second = submit(first, 'buy', '0.2', 100);
  const closed = submit(second, 'sell', '0.3', 100);
  assert.equal(summary(closed, 100).quantity, '0');
  assert.equal(summary(closed, 100).basis, 0);
  assert.throws(() => submit(initial, 'buy', '.000000000001', 1e-9), /precision/i);
  assert.throws(() => submit(initial, 'buy', '1', 1e308), /range/i);
});

test('a new store replays saved fills and a failed write preserves the previous ledger', () => {
  let item = null;
  let denyWrites = false;
  const storage = {
    getItem: () => item,
    setItem(_key, value) { if (denyWrites) throw Error('Quota exceeded'); item = value; },
  };
  const a = paper.createPaperStore(storage);
  a.fill(btc, { side: 'buy', quantity: '2' }, quote(100), { now });
  const b = paper.createPaperStore(storage);
  assert.equal(summary(b.read(), 100).quantity, '2');
  denyWrites = true;
  assert.throws(() => b.fill(btc, { side: 'sell', quantity: '1' }, quote(100), { now }), /could not be saved/i);
  assert.equal(summary(a.read(), 100).quantity, '2');
  item = '{"version":1,"trades":[{}]}';
  assert.throws(() => b.read(), /saved practice history/i);
  assert.throws(() => b.fill(btc, { side: 'buy', quantity: '1' }, quote(100), { now }), /saved practice history/i);
});
