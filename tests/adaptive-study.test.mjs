import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
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

test('walk-forward forecasts beat the strongest baseline on directional regimes', () => {
  const bars = series(1_062);
  const result = evaluate(bars);
  assert.equal(result.closedCount, bars.length);
  assert.equal(result.sampleStart, start + step);
  assert.ok(result.evidence.count >= 50);
  assert.ok(result.evidence.modelBrier + 0.01 < result.evidence.strongestBaseline.brier);
  assert.ok(result.evidence.modelAccuracy >= result.evidence.strongestBaseline.accuracy);
  assert.ok(result.evidence.passed);
  assert.ok(result.reliability.current.supported);
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

test('each horizon has time-aligned held-out cases and its own strongest same-origin comparator', () => {
  const bars = series(1_550);
  const { horizons, horizon } = evaluate(bars, { horizon: 24 });
  assert.equal(horizon, 24);
  assert.deepEqual(Object.keys(horizons).map(Number), [5, 12, 24]);
  for (const length of [5, 12, 24]) {
    const { evidence } = horizons[length];
    assert.ok(evidence.count >= 50);
    const fields = ['baselineProbability', 'recentBaselineProbability', 'momentumBaselineProbability'];
    const errors = fields.map(field => evidence.origins.reduce((loss, row) =>
      loss + (row[field] - row.actualUp) ** 2, 0) / evidence.count);
    assert.deepEqual(evidence.baselines.map(b => b.brier), errors);
    assert.equal(evidence.strongestBaseline.brier, Math.min(...errors));
    for (const [i, row] of evidence.origins.entries()) {
      assert.equal(row.targetCloseAt - row.asOf, length * step);
      assert.equal(row.trainedThrough, row.asOf - step);
      if (i > 0) assert.ok(row.asOf >= evidence.origins[i - 1].targetCloseAt);
    }
  }
});

test('short history can support a shorter horizon while a longer horizon abstains', () => {
  const { horizons } = evaluate(series(600));
  assert.ok(horizons[5].evidence.count >= 50);
  assert.ok(horizons[24].evidence.count < 50);
  assert.equal(horizons[24].forecast, null);
  assert.equal(horizons[24].scenarios, null);
});

test('a custom horizon and selected candle count bound both training and evaluation', () => {
  const bars = series(1_500);
  const result = evaluate(bars, {horizon: 17, maxCandles: 1_200, singleHorizon: true});
  assert.equal(result.horizon, 17);
  assert.equal(result.closedCount, 1_200);
  assert.equal(result.sampleStart, bars[300].time + step);
  assert.deepEqual(Object.keys(result.horizons), ['17']);
  assert.ok(result.evidence.count >= 50);
  assert.ok(result.evidence.origins.every(row => row.targetCloseAt - row.asOf === 17 * step
    && row.trainedThrough === row.asOf - step));
  assert.equal(result.evidence.blocks.reduce((total, block) => total + block.count, 0), result.evidence.count);
  const future = series(1_501).at(-1);
  assert.deepEqual(evaluate([...bars, future], {
    horizon: 17, maxCandles: 1_200, singleHorizon: true,
    closedThrough: result.asOf, nowSeconds: result.asOf + 1
  }), result);
});

test('a UTC history start excludes earlier candles and incomplete requested history withholds a new direction', () => {
  const bars = series(1_062), from = bars[20].time;
  const result = evaluate(bars, {from, singleHorizon: true});
  assert.equal(result.sampleStart, from + step);
  assert.equal(result.closedCount, 1_042);
  assert.equal(result.evidence.start >= from, true);
  const partial = evaluate(bars, {incompleteHistory: true, singleHorizon: true});
  assert.equal(partial.evidence.passed, true);
  assert.equal(partial.forecast, null);
  assert.match(partial.reason, /requested history/);
});

test('held-out model calibration excludes the current outcome and earlier outcomes inside the embargo', () => {
  const { evidence, reliability } = evaluate(series(1_061));
  const band = probability => probability < 0.4 ? 0 : probability < 0.6 ? 1 : 2;
  assert.ok(reliability.calibratedOrigins > 0);
  const cases = [...evidence.calibrationOrigins, ...evidence.origins];
  for (const row of evidence.origins) {
    const prior = cases.filter(item => item.targetCloseAt <= row.asOf - step).slice(-60)
      .filter(item => band(item.rawProbability) === band(row.rawProbability));
    assert.equal(row.calibrationCount, prior.length);
    if (!row.calibrated) {
      assert.equal(row.modelProbability, row.rawProbability);
      continue;
    }
    const priorUps = prior.reduce((sum, item) => sum + item.actualUp, 0);
    assert.equal(row.modelProbability, (priorUps + 12 * row.rawProbability) / (prior.length + 12));
  }
});

test('adding later candles preserves the scores for earlier origins with the same underlying history', () => {
  const bars = series(1_100);
  const before = evaluate(bars.slice(0, 1_050)).evidence.origins;
  const after = evaluate(bars).evidence.origins;
  const earlier = new Map(before.map(row => [row.asOf, row]));
  const overlap = after.filter(row => earlier.has(row.asOf));
  assert.ok(overlap.length > 50);
  for (const row of overlap) assert.deepEqual(row, earlier.get(row.asOf));
});

test('a regime reversal can abstain even when the historical model passed its evidence checks', () => {
  const { evidence, reliability, forecast } = evaluate(series(1_061));
  assert.ok(evidence.passed);
  assert.equal(reliability.current.supported, false);
  assert.equal(forecast, null);
});

test('a strongly directional score abstains when its historical band lacks enough cases', () => {
  const bars = series(1_065, index => {
    if (index < 700) return Math.floor(index / 53) % 2 === 0 ? 1.004 : 0.996;
    return index < 1_045 ? 1.004 : 0.996;
  });
  const { evidence, reliability, forecast } = evaluate(bars);
  assert.ok(evidence.passed);
  assert.equal(reliability.current.upper, 0.4);
  assert.equal(reliability.current.count, 2);
  assert.equal(reliability.current.supported, false);
  assert.equal(forecast, null);
});

test('scenario percentiles and outcomes describe the historical returns that actually occurred', () => {
  const bars = series(1_061);
  const closeAt = new Map(bars.map(bar => [bar.time + step, bar.close]));
  const { evidence, scenarios } = evaluate(bars);
  const returns = evidence.origins.map(row => closeAt.get(row.targetCloseAt) / closeAt.get(row.asOf) - 1).sort((a, b) => a - b);
  assert.equal(scenarios.count, returns.length);
  assert.equal(scenarios.up, returns.filter(x => x > 0).length);
  assert.equal(scenarios.down, returns.filter(x => x < 0).length);
  assert.equal(scenarios.flat, returns.filter(x => x === 0).length);
  assert.equal(scenarios.lower, returns[Math.ceil(returns.length / 10) - 1]);
  assert.equal(scenarios.median, returns[Math.ceil(returns.length / 2) - 1]);
  assert.equal(scenarios.upper, returns[Math.ceil(returns.length * 0.9) - 1]);
});

test('a stable uninformative price gives the baselines equal skill and no directional call', () => {
  const result = evaluate(series(1_550, () => 1));
  for (const { evidence, forecast } of Object.values(result.horizons)) {
    assert.equal(evidence.upCount, 0);
    assert.equal(evidence.passed, false);
    assert.equal(forecast, null);
  }
});

test('the worker responds to a failed request and accepts the next valid analysis', { timeout: 3_000 }, async t => {
  const moduleUrl = new URL('../src/forecast-worker.js', import.meta.url).href;
  const bridge = `
    import { parentPort } from 'node:worker_threads';
    globalThis.self = {
      addEventListener: (type, listener) => parentPort.on(type, data => listener({ data })),
      postMessage: data => parentPort.postMessage(data),
    };
    await import(${JSON.stringify(moduleUrl)});
  `;
  const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(bridge)}`));
  t.after(() => worker.terminate());

  worker.postMessage({ id: 1, input: null });
  const [failure] = await once(worker, 'message', { signal: AbortSignal.timeout(1_000) });
  assert.equal(failure.id, 1);
  assert.equal(typeof failure.error, 'string');

  const bars = series(1_062);
  const closedThrough = bars.at(-1).time + step;
  worker.postMessage({ id: 2, input: { bars, instrument, interval, closedThrough, nowSeconds: closedThrough + 1, horizon: 12 } });
  const [response] = await once(worker, 'message', { signal: AbortSignal.timeout(2_000) });
  assert.equal(response.id, 2);
  assert.equal(response.result.horizon, 12);
  assert.ok(response.result.horizons[12].evidence.count >= 50);
});

test('adaptive-v5 exposes causal market regime, feature drivers, historical analogs, projection and Brier skill without future leakage', () => {
  const bars = series(1_062);
  const res = evaluate(bars, { singleHorizon: true });
  assert.equal(res.version, 'adaptive-v5');
  assert.ok(Number.isFinite(res.evidence.brierSkill) && res.evidence.brierSkill > 0);
  assert.ok(res.regime && ['Trending up', 'Trending down', 'Ranging / mixed'].includes(res.regime.structure));
  assert.ok(['Quiet', 'Normal', 'Elevated'].includes(res.regime.volatility));
  assert.ok(res.regime.supportLevel > 0 && res.regime.resistanceLevel >= res.regime.supportLevel);
  assert.equal(res.drivers.length, 9);
  assert.ok(res.drivers.every((d, idx) => idx === 0 || Math.abs(res.drivers[idx - 1].contribution) >= Math.abs(d.contribution)));
  assert.ok(res.analogs && res.analogs.count >= 8 && res.analogs.topMatches.length >= 1);
  assert.ok(res.projection && res.projection.corridor && res.projection.reasons.length >= 3);
  assert.equal(res.projection.expertWeights.length, 4);
});
