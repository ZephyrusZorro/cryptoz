import { normalizeCandles } from './analytics.js';
import { INTERVALS, validInstrument } from './preferences.js';

export const FORECAST_VERSION = 'adaptive-v1';
export const FORECAST_HORIZON = 5;
export const MIN_HOLDOUT_ORIGINS = 50;

const METHOD = 'Rolling regularized logistic regression';
const LOOKBACK = 12;
const EMBARGO = 1;
const MIN_TRAINING = 160;
const MAX_TRAINING = 780;
const MAX_HOLDOUT = 120;
const MAX_CANDLES = LOOKBACK + MAX_TRAINING + (MAX_HOLDOUT + 2) * FORECAST_HORIZON + EMBARGO;
const MIN_BRIER_IMPROVEMENT = 0.01;
const MIN_DIRECTION_PROBABILITY = 0.60;
const BLOCKS = 4;
const FIT_ITERATIONS = 54;
const RIDGE = 0.035;
const LEARNING_RATE = 0.8;
const PRICE_FIELDS = ['open', 'high', 'low', 'close', 'volume'];

export function closedStudyCandles(bars, interval, closedThrough, nowSeconds) {
  const step = Object.hasOwn(INTERVALS, interval) ? INTERVALS[interval] : 0;
  if (!step || !Number.isFinite(closedThrough) || !Number.isFinite(nowSeconds) || !Array.isArray(bars)) return [];
  const cutoff = Math.min(closedThrough, nowSeconds);
  const byTime = new Map();
  const conflicts = new Set();
  for (const bar of bars) {
    if (!Number.isSafeInteger(bar?.time) || bar.time <= 0 || bar.time >= 1e10 || bar.time % step || bar.time + step > cutoff) continue;
    const previous = byTime.get(bar.time);
    if (previous && PRICE_FIELDS.some(field => previous[field] !== bar[field])) conflicts.add(bar.time);
    byTime.set(bar.time, bar);
  }
  return normalizeCandles([...byTime.values()].filter(bar => !conflicts.has(bar.time)));
}

function studyFeatures(rows, i) {
  let squaredMoves = 0;
  let totalRange = 0;
  for (let j = i - LOOKBACK + 1; j <= i; j++) {
    squaredMoves += (rows[j].close - rows[j - 1].close) ** 2;
    totalRange += rows[j].high - rows[j].low;
  }
  const scale = Math.max(Math.sqrt(squaredMoves / LOOKBACK), 1e-8);
  const scaledMove = n => Math.tanh((rows[i].close - rows[i - n].close) / (scale * Math.sqrt(n)));
  const range = rows[i].high - rows[i].low;
  const rangePosition = range > 1e-8 ? 2 * (rows[i].close - rows[i].low) / range - 1 : 0;
  const rangeExpansion = totalRange > 1e-8 ? Math.tanh(LOOKBACK * range / totalRange - 1) : 0;
  return [1, scaledMove(1), scaledMove(3), scaledMove(LOOKBACK), rangePosition, rangeExpansion];
}

const sigmoid = value => 1 / (1 + Math.exp(-value));

function predict(coefficients, features) {
  let logOdds = 0;
  for (let k = 0; k < coefficients.length; k++) logOdds += coefficients[k] * features[k];
  return sigmoid(logOdds);
}

function train(features, labels, origin) {
  // Both methods get exactly the same labels known at least one candle before the prediction.
  const trainedThrough = origin - EMBARGO;
  const last = trainedThrough - FORECAST_HORIZON;
  const first = Math.max(LOOKBACK, last - MAX_TRAINING + 1);
  const count = last - first + 1;
  let ups = 0;
  for (let i = first; i <= last; i++) ups += labels[i];
  const baseline = (ups + 1) / (count + 2);
  const coefficients = new Float64Array(features[origin].length);
  const gradient = new Float64Array(coefficients.length);
  coefficients[0] = Math.log(baseline / (1 - baseline));

  for (let pass = 0; pass < FIT_ITERATIONS; pass++) {
    gradient.fill(0);
    for (let i = first; i <= last; i++) {
      const error = predict(coefficients, features[i]) - labels[i];
      for (let k = 0; k < coefficients.length; k++) gradient[k] += error * features[i][k];
    }
    coefficients[0] -= LEARNING_RATE * gradient[0] / count;
    for (let k = 1; k < coefficients.length; k++) {
      coefficients[k] -= LEARNING_RATE * (gradient[k] / count + RIDGE * coefficients[k]);
    }
  }
  const probability = Math.max(0.01, Math.min(0.99, predict(coefficients, features[origin])));
  return {
    count, trainedThrough, probability, baseline,
  };
}

function scoreOrigins(origins, trainingCount) {
  const count = origins.length;
  const blockGains = Array(BLOCKS).fill(0);
  let modelLoss = 0;
  let baselineLoss = 0;
  let modelCorrect = 0;
  let baselineCorrect = 0;
  let upCount = 0;
  for (const [index, row] of origins.entries()) {
    const modelError = (row.modelProbability - row.actualUp) ** 2;
    const baselineError = (row.baselineProbability - row.actualUp) ** 2;
    modelLoss += modelError;
    baselineLoss += baselineError;
    blockGains[Math.floor(index * BLOCKS / count)] += baselineError - modelError;
    modelCorrect += Number(Number(row.modelProbability >= 0.5) === row.actualUp);
    baselineCorrect += Number(Number(row.baselineProbability >= 0.5) === row.actualUp);
    upCount += row.actualUp;
  }

  const modelBrier = modelLoss / count;
  const baselineBrier = baselineLoss / count;
  const modelAccuracy = modelCorrect / count;
  const baselineAccuracy = baselineCorrect / count;
  const winningBlocks = blockGains.filter(gain => gain > 0).length;
  const notUpCount = count - upCount;
  const passed = count >= MIN_HOLDOUT_ORIGINS && upCount >= 8 && notUpCount >= 8
    && baselineBrier - modelBrier >= MIN_BRIER_IMPROVEMENT && modelAccuracy >= baselineAccuracy
    && winningBlocks >= 3 && blockGains.at(-1) > 0;
  return {
    count, start: origins[0].asOf, end: origins.at(-1).targetCloseAt, trainingCount,
    modelBrier, baselineBrier, modelAccuracy, baselineAccuracy, upCount, notUpCount,
    winningBlocks, blockCount: BLOCKS, passed, origins,
  };
}

export function evaluateAdaptiveStudy({
  bars, instrument, interval, closedThrough, nowSeconds = Date.now() / 1000, stale = false,
} = {}) {
  const step = Object.hasOwn(INTERVALS, interval) ? INTERVALS[interval] : 0;
  const result = {
    version: FORECAST_VERSION, method: METHOD, horizon: FORECAST_HORIZON,
    venue: instrument?.venue ?? null, symbol: instrument?.symbol ?? null, interval,
    closedCount: 0, sampleStart: null, asOf: null, targetCloseAt: null, reason: null,
    evidence: null, forecast: null,
  };
  const abstain = reason => ({ ...result, reason });
  if (!validInstrument(instrument) || !step || !Number.isFinite(closedThrough) || !Number.isFinite(nowSeconds)) {
    return abstain('Wait for a confirmed candle snapshot from this market.');
  }
  const closed = closedStudyCandles(bars, interval, closedThrough, nowSeconds);
  if (!closed.length) return abstain('Waiting for a completed candle from this market.');

  let first = closed.length - 1;
  while (first > 0 && closed.length - first < MAX_CANDLES && closed[first].time - closed[first - 1].time === step) first--;
  const rows = closed.slice(first);
  const query = rows.length - 1;
  const closeAt = index => rows[index].time + step;
  const asOf = closeAt(query);
  const targetCloseAt = asOf + FORECAST_HORIZON * step;
  Object.assign(result, { closedCount: rows.length, sampleStart: closeAt(0), asOf, targetCloseAt });

  const minOrigin = LOOKBACK + MIN_TRAINING - 1 + FORECAST_HORIZON + EMBARGO;
  const latestValidation = query - FORECAST_HORIZON;
  if (latestValidation < minOrigin) {
    const gap = first > 0 ? ' A data gap limits the continuous sample.' : '';
    return abstain('Load more consecutive closed candles to start the historical test.' + gap);
  }

  const logRows = rows.map(row => ({ close: Math.log(row.close), high: Math.log(row.high), low: Math.log(row.low) }));
  const features = rows.map((_, i) => i >= LOOKBACK ? studyFeatures(logRows, i) : null);
  const labels = rows.map((row, i) => i <= latestValidation ? Number(rows[i + FORECAST_HORIZON].close > row.close) : null);
  // Use UTC slots spaced one horizon apart; the holdout outcomes never overlap.
  const cadence = step * FORECAST_HORIZON;
  const origins = [];
  for (let i = latestValidation; i >= minOrigin && origins.length < MAX_HOLDOUT; i--) {
    if (closeAt(i) % cadence) continue;
    const fitted = train(features, labels, i);
    origins.push({
      asOf: closeAt(i), targetCloseAt: closeAt(i + FORECAST_HORIZON),
      trainingCount: fitted.count, trainedThrough: closeAt(fitted.trainedThrough), actualUp: labels[i],
      modelProbability: fitted.probability, baselineProbability: fitted.baseline,
    });
  }
  if (!origins.length) return abstain('Load more consecutive closed candles to start the historical test.');
  origins.reverse();

  const trainingCount = Math.min(MAX_TRAINING, query - minOrigin + MIN_TRAINING);
  result.evidence = scoreOrigins(origins, trainingCount);
  if (stale || nowSeconds - asOf >= step) return abstain('The latest expected close is unconfirmed or the candle feed is stale.');
  if (origins.length < MIN_HOLDOUT_ORIGINS) return abstain('Load more closed history for at least 50 non-overlapping test forecasts.');
  if (!result.evidence.passed) return abstain('Historical results did not consistently improve on the baseline.');
  const fitted = train(features, labels, query);
  const probabilityUp = fitted.probability;
  const direction = probabilityUp >= MIN_DIRECTION_PROBABILITY ? 'up'
    : probabilityUp <= 1 - MIN_DIRECTION_PROBABILITY ? 'not-higher' : null;
  if (!direction) return abstain('The current estimate is too close to an even chance for a directional call.');
  return {
    ...result,
    forecast: {
      venue: instrument.venue, symbol: instrument.symbol, interval, version: FORECAST_VERSION, horizon: FORECAST_HORIZON,
      asOf, targetCloseAt, originClose: rows[query].close, probabilityUp, baselineProbabilityUp: fitted.baseline, direction,
    },
  };
}
