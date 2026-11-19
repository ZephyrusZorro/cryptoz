import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createForecastLedger, FORECAST_STORAGE_KEY, summarizeForecasts } from '../src/forecast-ledger.js';

const btc = { venue: 'binance', symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT' };
const coinbase = { venue: 'coinbase', symbol: 'BTC-USD', base: 'BTC', quote: 'USD' };
const defaultStep = 3_600;
const asOf = 1_700_028_000;
const targetCloseAt = asOf + 5 * defaultStep;
const entry = {
  venue: btc.venue, symbol: btc.symbol, interval: '1h', version: 'adaptive-v1', horizon: 5,
  asOf, targetCloseAt, originClose: 100, probabilityUp: 0.71, baselineProbabilityUp: 0.51, direction: 'up',
};

test('recorded performance uses first-issued, settled, non-overlapping windows of the same model',()=>{
  const resolved={...entry,issuedAt:asOf+1,outcome:{close:110,direction:'up'}};
  const later={...resolved,asOf:targetCloseAt,targetCloseAt:targetCloseAt+5*defaultStep,issuedAt:targetCloseAt+1,outcome:{close:90,direction:'down'}};
  const summary=summarizeForecasts([later,{...resolved,issuedAt:asOf+2,probabilityUp:.9},{...resolved,asOf:asOf+defaultStep,issuedAt:asOf+defaultStep+1},{...resolved,version:'other'},resolved],entry.version);
  assert.equal(summary.settled,2);
  assert.equal(summary.correct,1);
  assert.equal(summary.modelBrier,((.71-1)**2+.71**2)/2);
});

function storage(initial) {
  const values = new Map(initial);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

const candle = (time, close) => ({ time, open: close, high: close, low: close, close, volume: 1 });
const target = (close = 99) => candle(targetCloseAt - defaultStep, close);
const settlement = (overrides = {}) => ({
  bars: [target()], instrument: btc, interval: '1h', closedThrough: targetCloseAt, nowSeconds: targetCloseAt + 3, ...overrides,
});

test('replicated ledger views preserve the original issuance for a market, interval and origin', async () => {
  const data = storage();
  const first = createForecastLedger(data);
  const another = createForecastLedger(data);
  await first.record(entry, asOf + 2);
  const duplicate = await another.record({ ...entry, probabilityUp: 0.85, originClose: 118 }, asOf + 45);
  assert.equal(duplicate.probabilityUp, 0.71);
  assert.equal(duplicate.originClose, 100);
  assert.equal(duplicate.issuedAt, asOf + 2);
  assert.equal(first.list(btc, '1h').length, 1);
});

test('ledger only settles a confirmed exact target from the issued market and interval', async () => {
  const ledger = createForecastLedger(storage());
  await ledger.record(entry, asOf + 2);
  for (const overrides of [
    { instrument: coinbase },
    { interval: '4h' },
    { closedThrough: targetCloseAt - 1 },
    { nowSeconds: targetCloseAt - 1 },
    { stale: true },
    { bars: [candle(targetCloseAt, 200)], closedThrough: targetCloseAt + defaultStep, nowSeconds: targetCloseAt + defaultStep },
    { bars: [target(99), target(113)] },
  ]) {
    assert.equal((await ledger.settle(settlement(overrides))).settled, 0);
    assert.equal(ledger.list(btc, '1h')[0].outcome, null);
  }

  assert.equal((await ledger.settle(settlement())).settled, 1);
  const result = ledger.list(btc, '1h')[0];
  assert.equal(result.probabilityUp, 0.71);
  assert.deepEqual(result.outcome, { close: 99, direction: 'down', settledAt: targetCloseAt + 3 });
  await ledger.settle(settlement({ bars: [target(150)] }));
  assert.deepEqual(ledger.list(btc, '1h')[0], result);
});

test('an exact tie is stored as flat', async () => {
  const ledger = createForecastLedger(storage());
  await ledger.record(entry, asOf + 2);
  await ledger.settle(settlement({ bars: [target(100)] }));
  assert.equal(ledger.list(btc, '1h')[0].outcome.direction, 'flat');
});

test('misaligned times, unsupported versions and retrospective entries cannot enter the ledger', async () => {
  const ledger = createForecastLedger(storage());
  for (const invalid of [
    { ...entry, targetCloseAt: targetCloseAt + defaultStep },
    { ...entry, asOf: asOf - 1, targetCloseAt: targetCloseAt - 1 },
    { ...entry, version: 'adaptive-v0' },
    { ...entry, probabilityUp: Infinity },
    { ...entry, direction: 'not-higher' },
    { ...entry, venue: 'coinbase' },
  ]) assert.equal(await ledger.record(invalid, asOf + 2), null);
  assert.equal(await ledger.record(entry, asOf - 1), null);
  assert.equal(await ledger.record(entry, asOf + defaultStep), null);
  assert.deepEqual(ledger.list(btc, '1h'), []);
});

test('local retention stays bounded and corrupted storage can be recovered', async () => {
  const data = storage([[FORECAST_STORAGE_KEY, '{"unknown":123}']]);
  const ledger = createForecastLedger(data);
  for (let i = 0; i < 70; i++) {
    const origin = asOf + i * defaultStep;
    await ledger.record({ ...entry, asOf: origin, targetCloseAt: origin + 5 * defaultStep }, origin + 1);
  }
  const saved = createForecastLedger(data).list(btc, '1h');
  assert.ok(saved.length >= 10 && saved.length < 70);
  assert.equal(saved[0].asOf, asOf + 69 * defaultStep);
  assert.ok(saved.every(row => row.interval === '1h' && row.symbol === btc.symbol));
  assert.deepEqual(ledger.list(coinbase, '1h'), []);
});

test('a write failure does not create an apparent local record', async () => {
  const ledger = createForecastLedger({ getItem: () => null, setItem: () => { throw Error('Quota'); } });
  assert.equal(await ledger.record(entry, asOf + 1), null);
  assert.deepEqual(ledger.list(btc, '1h'), []);
});

test('concurrent requests on the same origin issue just one immutable forecast', async () => {
  const data = storage();
  const first = createForecastLedger(data);
  const second = createForecastLedger(data);
  const [original, duplicate] = await Promise.all([
    first.record(entry, asOf + 1),
    second.record({ ...entry, probabilityUp: 0.93 }, asOf + 2),
  ]);
  assert.equal(original.probabilityUp, 0.71);
  assert.deepEqual(duplicate, original);
  assert.equal(second.list(btc, '1h').length, 1);
});

test('a temporarily unreadable ledger cannot be overwritten', async () => {
  const data = storage();
  const original = createForecastLedger(data);
  await original.record(entry, asOf + 1);
  const writingLedger = createForecastLedger({ ...data, getItem: () => { throw Error('Read blocked'); } });
  const next = { ...entry, asOf: asOf + defaultStep, targetCloseAt: targetCloseAt + defaultStep };
  assert.equal(await writingLedger.record(next, next.asOf + 1), null);
  assert.equal(original.list(btc, '1h')[0].asOf, asOf);
});

test('a duplicated stored origin keeps its first issuance', () => {
  const records = [
    { ...entry, probabilityUp: 0.68, issuedAt: asOf + 10, outcome: null },
    { ...entry, probabilityUp: 0.83, issuedAt: asOf + 20, outcome: null },
  ];
  const ledger = createForecastLedger(storage([[FORECAST_STORAGE_KEY, JSON.stringify(records)]]));
  assert.equal(ledger.list(btc, '1h').length, 1);
  assert.equal(ledger.list(btc, '1h')[0].probabilityUp, 0.68);
});

test('new horizon records coexist with legacy rows and settle only at their own target close', async () => {
  const data = storage([[FORECAST_STORAGE_KEY, JSON.stringify([{ ...entry, issuedAt: asOf + 1, outcome: null }])]]);
  const ledger = createForecastLedger(data);
  for (const horizon of [5, 12, 24]) {
    const accepted = await ledger.record({
      ...entry, version: 'adaptive-v2', horizon, targetCloseAt: asOf + horizon * defaultStep,
    }, asOf + 2);
    assert.equal(accepted.horizon, horizon);
  }
  assert.equal((await ledger.settle(settlement())).settled, 2);
  const reread = createForecastLedger(data);
  const extendedTarget = asOf + 24 * defaultStep;
  assert.equal((await reread.settle(settlement({
    bars: [candle(extendedTarget - defaultStep, 102)], closedThrough: extendedTarget, nowSeconds: extendedTarget,
  }))).settled, 1);
  const rows = reread.list(btc, '1h');
  assert.equal(rows.find(row => row.horizon === 24).outcome.close, 102);
  assert.equal(rows.find(row => row.horizon === 12).outcome, null);
  assert.equal(rows.find(row => row.version === 'adaptive-v1').outcome.close, 99);
});

test('navigation while waiting for an issuance lock leaves the journal unchanged', async () => {
  let release;
  const lock = { request: async (key, operation) => {
    await new Promise(resolve => { release = resolve; });
    return operation();
  } };
  const ledger = createForecastLedger(storage(), lock);
  const controller = new AbortController();
  const pending = ledger.record(entry, asOf + 1, { signal: controller.signal });
  controller.abort();
  release();
  assert.equal(await pending, null);
  assert.deepEqual(ledger.list(btc, '1h'), []);
});

test('custom studies retain separate immutable entries for different valid training windows', async () => {
  const ledger = createForecastLedger(storage());
  const study = { ...entry, version: 'adaptive-v3', horizon: 17, targetCloseAt: asOf + 17 * defaultStep };
  const first = { ...study, sampleStart: asOf - 1_100 * defaultStep };
  const second = { ...study, sampleStart: asOf - 1_400 * defaultStep, probabilityUp: 0.8 };
  assert.equal(await ledger.record(study, asOf + 1), null);
  assert.equal((await ledger.record(first, asOf + 1)).probabilityUp, 0.71);
  assert.equal((await ledger.record(second, asOf + 2)).probabilityUp, 0.8);
  assert.equal((await ledger.record({ ...first, probabilityUp: 0.95 }, asOf + 3)).probabilityUp, 0.71);
  assert.equal(ledger.list(btc, '1h').length, 2);
});
