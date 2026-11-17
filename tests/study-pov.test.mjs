import assert from 'node:assert/strict';
import test from 'node:test';
import * as studyPov from '../src/study-pov.js';

const instrument = { venue: 'coinbase', symbol: 'BTC-USD', base: 'BTC', quote: 'USD' };
const first = 1_700_000_040;
const interval = '1m';
const makeBar = (i, close = 100 + i, volume = 10) => ({
  time: first + 60 * i,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume,
});
const fiftyBars = Array.from({ length: 50 }, (_, i) => makeBar(i));
const lastClose = first + 50 * 60;

function build(bars, options = {}) {
  assert.equal(typeof studyPov.buildStudyPov, 'function', 'Study POV calculator is required');
  return studyPov.buildStudyPov({ bars, instrument, interval, nowSeconds: lastClose, ...options });
}

function research(base, options) {
  assert.equal(typeof studyPov.getAnalystResearch, 'function', 'analyst research reader is required');
  return studyPov.getAnalystResearch(base, options);
}

test('Study POV excludes the current candle and preserves its observed closing timestamp', () => {
  const result = build([...fiftyBars, makeBar(50, 1_000_000, 1_000_000)]);
  assert.equal(result.ready, true);
  assert.equal(result.closedAt, lastClose);
  assert.equal(result.sampleCount, 50);
  assert.equal(result.trend, 'Rising');
  assert.deepEqual(result.range, { high: 150, low: 129, periods: 20 });
  assert.equal(result.metrics.volumeRatio, 1);
});

test('an elapsed provisional candle is excluded until a later snapshot or final stream event', () => {
  const bars = [...fiftyBars, makeBar(50, 160)];
  const options = {
    nowSeconds: lastClose + 60,
    candleMeta: { cache: 'miss', fetchedAt: new Date((lastClose + 30) * 1000).toISOString() },
  };
  assert.equal(build(bars, options).closedAt, lastClose);
  assert.equal(build(bars, options).stale, true);
  assert.equal(build(bars, { ...options, confirmedThrough: lastClose + 60 }).closedAt, lastClose + 60);
  assert.equal(build(bars, { ...options, confirmedThrough: lastClose + 60 }).stale, false);
});

test('Study POV does not calculate through a missing candle', () => {
  const result = build(fiftyBars.filter((_, i) => i !== 40));
  assert.equal(result.ready, false);
  assert.equal(result.truncatedByGap, true);
  assert.equal(result.sampleCount, 9);
  assert.equal(result.closedAt, lastClose);
  assert.deepEqual(result.scenarios, []);
});

test('stale cache status stays visible even when the sample has enough candles', () => {
  const result = build(fiftyBars, {
    candleMeta: { cache: 'stale', fetchedAt: new Date(lastClose * 1000).toISOString() },
  });
  assert.equal(result.ready, true);
  assert.equal(result.stale, true);
  assert.equal(result.closedAt, lastClose);
});

test('older history does not alter a fixed recent Study POV sample', () => {
  const older = Array.from({ length: 100 }, (_, i) => makeBar(i - 100, 1_000 + i));
  assert.deepEqual(build([...older, ...fiftyBars]), build(fiftyBars));
});

test('a declining sample reports falling trend and unavailable relative volume when there is no baseline', () => {
  const declining = fiftyBars.map((_, i) => makeBar(i, 100 - i, i === 49 ? 10 : 0));
  const result = build(declining);
  assert.equal(result.trend, 'Falling');
  assert.equal(result.metrics.rsi, 0);
  assert.equal(result.metrics.volumeRatio, null);
  assert.equal(result.scenarios.length, 3);
});

test('unverified instruments or unavailable candles yield no scenarios', () => {
  assert.equal(build(fiftyBars, { instrument: { ...instrument, quote: 'USDT' } }).ready, false);
  assert.equal(build(fiftyBars, { interval: '2m' }).ready, false);
  assert.deepEqual(build([undefined, null, makeBar(49)], { nowSeconds: lastClose - 1 }).scenarios, []);
});

test('BTC publication dates and historical windows remain available in the curated source list', () => {
  const result = research('BTC');
  const grayscale = result.views.find(view => view.publisher === 'Grayscale Research');
  const galaxy = result.views.find(view => view.publisher === 'Galaxy Research');
  assert.equal(grayscale.published, '2025-12-15');
  assert.equal(grayscale.period, 'First half of 2026');
  assert.equal(grayscale.periodEnded, true);
  assert.equal(galaxy.published, '2025-12-18');
  assert.equal(result.views.every(view => /^https:\/\//.test(view.url)), true);
});

test('unmatched, conditional, or later-dated source claims do not turn into a numeric average', () => {
  const early = research('BTC', { asOf: '2026-01-01' });
  const current = research('BTC');
  assert.equal(early.views.some(view => view.publisher === '21shares'), false);
  assert.equal(current.views.some(view => view.publisher === '21shares'), true);
  assert.equal(early.aggregate, null);
  assert.equal(current.aggregate, null);
  assert.equal(research('XRP').views.length, 0);
});
