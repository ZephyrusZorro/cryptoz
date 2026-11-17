import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAdaptiveStudy } from '../src/adaptive-study.js';

const instrument = { venue: 'binance', symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT' };
const interval = '1h';
const step = 3600;
const start = 1_700_028_000;

function series(count, change = i => Math.floor(i / 53) % 2 === 0 ? 1.004 : 0.996) {
  let price = 100;
  return Array.from({ length: count }, (_, i) => {
    const open = price;
    price *= change(i);
    return {
      time: start + i * step, open, close: price, volume: 50,
      high: Math.max(open, price) * 1.001, low: Math.min(open, price) * 0.999,
    };
  });
}

function evaluate(bars, overrides = {}) {
  const closedThrough = bars.at(-1).time + step;
  return evaluateAdaptiveStudy({ bars, instrument, interval, closedThrough, nowSeconds: closedThrough + 1, ...overrides });
}

test('walk-forward forecasts beat the historical up rate on directional regimes', () => {
  const bars = series(1_061);
  const result = evaluate(bars);
  assert.equal(result.closedCount, bars.length);
  assert.equal(result.sampleStart, start + step);
  assert.ok(result.evidence.count >= 50);
  assert.ok(result.evidence.modelBrier + 0.01 < result.evidence.baselineBrier);
  assert.ok(result.evidence.modelAccuracy >= result.evidence.baselineAccuracy);
  assert.ok(result.evidence.passed);
  assert.equal(result.forecast.direction, 'up');
  assert.ok(result.forecast.probabilityUp > 0.6);
  assert.equal(result.forecast.asOf, bars.at(-1).time + step);
  assert.equal(result.forecast.targetCloseAt, result.forecast.asOf + 5 * step);
});

test('the paired evidence uses embargoed labels and scores both methods on the same non-overlapping origins', () => {
  const bars = series(1_061);
  const { evidence } = evaluate(bars);
  const sum = { modelBrier: 0, baselineBrier: 0, modelAccuracy: 0, baselineAccuracy: 0 };
  const closeAt = new Map(bars.map(bar => [bar.time + step, bar.close]));
  for (const [index, row] of evidence.origins.entries()) {
    assert.equal(row.targetCloseAt - row.asOf, 5 * step);
    assert.ok(row.trainedThrough <= row.asOf - step);
    if (index > 0) assert.ok(row.asOf >= evidence.origins[index - 1].targetCloseAt);
    const actualUp = Number(closeAt.get(row.targetCloseAt) > closeAt.get(row.asOf));
    assert.equal(row.actualUp, actualUp);
    sum.modelBrier += (row.modelProbability - actualUp) ** 2;
    sum.baselineBrier += (row.baselineProbability - actualUp) ** 2;
    sum.modelAccuracy += Number(Number(row.modelProbability >= 0.5) === actualUp);
    sum.baselineAccuracy += Number(Number(row.baselineProbability >= 0.5) === actualUp);
  }
  for (const metric of Object.keys(sum)) assert.equal(evidence[metric], sum[metric] / evidence.count);
  assert.equal(evidence.start, evidence.origins[0].asOf);
  assert.equal(evidence.end, evidence.origins.at(-1).targetCloseAt);
});

test('partial candles and future provider data cannot influence an as-of evaluation', () => {
  const bars = series(1_061);
  const original = evaluate(bars);
  const future = Array.from({ length: 6 }, (_, i) => ({
    time: original.asOf + i * step, open: 900, high: 2_000, low: 400, close: 1_500, volume: 1e15,
  }));
  const withFuture = evaluate([...bars, ...future], { nowSeconds: original.asOf + step / 2, closedThrough: original.asOf + 3 * step });
  assert.deepEqual(withFuture, original);
});

test('changing later outcomes cannot change the probability for an earlier validation origin', () => {
  const bars = series(1_061);
  const first = evaluate(bars).evidence.origins[25];
  const altered = bars.map(bar => bar.time < first.asOf ? bar : {
    ...bar, open: bar.open * 2, low: bar.low * 2, high: bar.high * 2, close: bar.close * 2,
  });
  const recomputed = evaluate(altered).evidence.origins.find(row => row.asOf === first.asOf);
  assert.equal(recomputed.modelProbability, first.modelProbability);
  assert.equal(recomputed.baselineProbability, first.baselineProbability);
});

test('a one-class history with a strong up rate is insufficient evidence for an adaptive call', () => {
  const result = evaluate(series(1_061, () => 1.004));
  assert.ok(result.evidence.count >= 50);
  assert.equal(result.evidence.passed, false);
  assert.equal(result.forecast, null);
});

test('a recent market gap limits the sample even when older history is deep', () => {
  const bars = series(1_061);
  bars.splice(-60, 1);
  const result = evaluate(bars);
  assert.equal(result.closedCount, 59);
  assert.equal(result.evidence, null);
  assert.equal(result.forecast, null);
});

test('stale market data cannot issue a new forecast', () => {
  const bars = series(1_061);
  assert.equal(evaluate(bars, { stale: true }).forecast, null);
  assert.equal(evaluate(bars, { nowSeconds: bars.at(-1).time + 2 * step }).forecast, null);
});

test('evaluation requires a validated instrument and confirmed observation cutoff', () => {
  const bars = series(1_061);
  assert.equal(evaluate(bars, { instrument: { ...instrument, symbol: 'ETHUSDT' } }).forecast, null);
  const result = evaluate(bars, { closedThrough: null });
  assert.equal(result.asOf, null);
  assert.equal(result.evidence, null);
});
