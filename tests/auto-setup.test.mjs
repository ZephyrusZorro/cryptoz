import test from 'node:test';
import assert from 'node:assert/strict';
import * as auto from '../src/auto-setup.js';

const start = 1763510400;
const step = 3600;
const time = i => start + i * step;
const candle = (i, close, overrides) => ({
  time: time(i), open: close, high: close + 1, low: close - 1, close, volume: 5, ...overrides
});
const candles = closes => closes.map((close, i) => candle(i, close));
const setup = (bars, before, options) => {
  assert.equal(typeof auto.buildAutoSetup, 'function');
  return auto.buildAutoSetup(bars, {interval: '1h', completedBefore: time(before), nowSeconds: time(before), ...options});
};

test('the recent range uses exactly 20 closed candles and exposes observed extrema', () => {
  const bars = candles(Array(21).fill(100));
  bars[0] = candle(0, 120);
  bars[20] = candle(20, 100, {high: 110, low: 90});
  bars.push(candle(21, 220));
  const result = setup(bars, 21);
  assert.equal(result.closedAt, time(21));
  assert.equal(result.range.high, 110);
  assert.equal(result.range.low, 90);
  assert.equal(result.range.startTime, time(1));
  assert.deepEqual(result.range.anchors.map(({time, price}) => [time, price]), [[time(20), 110], [time(20), 90]]);
  const guides = result.guides.filter(guide => guide.id.startsWith('range-'));
  assert.equal(guides.length, 2);
  assert.ok(guides.every(guide => guide.type === 'horizontal' && guide.label.startsWith('Auto ') && guide.points.at(-1).time === time(20)));
});

test('gaps reset the automatic range and confirmation never exceeds wall clock', () => {
  const bars = candles(Array(31).fill(100));
  bars.splice(24, 1);
  const result = setup(bars, 35, {nowSeconds: time(30)});
  assert.equal(result.closedAt, time(30));
  assert.equal(result.sampleCount, 5);
  assert.equal(result.range, null);
  assert.match(result.reason, /gap/i);
  assert.equal(setup(bars, 29, {nowSeconds: time(30)}).stale, true);
  assert.equal(setup(bars, 29, {stale: true}).stale, true);
  assert.equal(setup(bars, -1).closedAt, null);
  assert.deepEqual(setup(bars, -1).guides, []);
});

test('swing trend and Fibonacci anchors only appear after both right-side candles close', () => {
  const bars = candles([104, 102, 100, 103, 104, 106, 107, 104, 102, 105, 106, 110, 107, 106, 105]);
  const early = setup(bars, 10);
  assert.equal(early.trend, null);
  const pending = setup(bars, 13);
  assert.deepEqual(pending.trend.anchors.map(({time, price, confirmedAt}) => [time, price, confirmedAt]), [
    [time(2), 99, time(5)], [time(8), 101, time(11)]
  ]);
  assert.equal(pending.trend.direction, 'up');
  assert.deepEqual(pending.fibonacci.anchors.map(anchor => anchor.time), [time(6), time(8)]);
  const confirmed = setup(bars, 14).fibonacci;
  assert.deepEqual(confirmed.anchors.map(({time, price, confirmedAt}) => [time, price, confirmedAt]), [
    [time(8), 101, time(11)], [time(11), 111, time(14)]
  ]);
  assert.equal(confirmed.direction, 'up');
  assert.equal(confirmed.levels.find(level => level.ratio === 0.5).price, 106);
  assert.equal(confirmed.levels.find(level => level.ratio === 0.618).price, 104.82);
});

test('falling swing highs form resistance even when the swing lows are falling too', () => {
  const bars = candles([103, 105, 111, 104, 101, 103, 107, 103, 99, 102, 103, 104]);
  const {trend, fibonacci} = setup(bars, 12);
  assert.equal(trend.direction, 'down');
  assert.deepEqual(trend.anchors.map(anchor => anchor.price), [112, 108]);
  assert.equal(fibonacci.direction, 'down');
  assert.equal(fibonacci.levels.find(level => level.ratio === 0.5).price, 103);
});

test('range events compare with the prior 20 bars and require the close to clear the level', () => {
  const bars = candles([...Array(21).fill(100), 102, 104, 104, 94, 90]);
  bars[23] = candle(23, 104, {high: 110});
  const {events} = setup(bars, 26);
  assert.deepEqual(events.map(({time, confirmedAt, kind, direction}) => [time, confirmedAt, kind, direction]), [
    [time(21), time(22), 'range', 'up'], [time(24), time(25), 'range', 'down']
  ]);
  assert.equal(events[0].evidence.level, 101);
  assert.equal(events[0].evidence.close, 102);
  assert.equal(events[1].evidence.level, 99);
  assert.deepEqual(setup(bars, 21).events, []);
});

test('momentum transitions use a fixed trailing sample and remain stable as history extends', () => {
  const bars = candles([...Array(100).fill(100), 150, 50, 10, 100]);
  const prefix = setup(bars, 102);
  const full = setup(bars, 104);
  const prepended = setup([candle(-1, 700), ...bars], 104);
  assert.deepEqual(full.events, prepended.events);
  assert.deepEqual(prefix.events, full.events.filter(event => event.confirmedAt <= time(102)));
  const momentum = full.events.filter(event => event.kind !== 'range');
  assert.ok(momentum.some(event => event.kind === 'macd' && event.direction === 'up' && event.time === time(100) && event.evidence.previous === 0 && event.evidence.value > 0));
  assert.ok(momentum.some(event => event.kind === 'macd' && event.direction === 'down' && event.time === time(101) && event.evidence.previous > 0 && event.evidence.value < 0));
  assert.ok(momentum.some(event => event.kind === 'rsi' && event.direction === 'down' && event.time === time(101) && event.evidence.threshold === 70));
  assert.ok(momentum.some(event => event.kind === 'rsi' && event.direction === 'up' && event.time === time(103) && event.evidence.threshold === 30));
  assert.ok(momentum.every(event => event.detail.length > 0 && event.confirmedAt === event.time + step));
});
