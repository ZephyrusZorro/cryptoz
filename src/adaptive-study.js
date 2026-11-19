import { atr, normalizeCandles, sma } from './analytics.js';
import { INTERVALS, validInstrument } from './preferences.js';
import { FORECAST_MAX_CANDLES, validForecastHorizon } from './forecast-settings.js';

export const FORECAST_VERSION = 'adaptive-v4';
export const FORECAST_HORIZON = 5;
export const FORECAST_HORIZONS = Object.freeze([FORECAST_HORIZON, 12, 24]);
export const MIN_HOLDOUT_ORIGINS = 50;

const METHOD = 'Walk-forward horizon-regularized logistic regression with volatility regime & time-ordered calibration';
const LOOKBACK = 12;
const EMBARGO = 1;
const MIN_TRAINING = 160;
const MAX_TRAINING = 780;
const MAX_HOLDOUT = 120;
const MAX_CALIBRATION_ORIGINS = 60;
const MIN_BRIER_IMPROVEMENT = 0.01;
const MIN_DIRECTION_PROBABILITY = 0.60;
const MIN_RELIABILITY_CASES = 12;
const RECENT_TRAINING = 96;
const BLOCKS = 4;
const FIT_ITERATIONS = 58;
const BASE_RIDGE = 0.045;
const LEARNING_RATE = 0.75;
const PRICE_FIELDS = ['open', 'high', 'low', 'close', 'volume'];
const SCORE_BANDS = [[0, 0.4], [0.4, 0.6], [0.6, 1]];
const FEATURE_META = Object.freeze([
  { id: 'move1', label: '1-bar momentum' },
  { id: 'move3', label: '3-bar momentum' },
  { id: 'move6', label: '6-bar momentum' },
  { id: 'move12', label: '12-bar trend' },
  { id: 'rangePos', label: 'Close position in bar' },
  { id: 'rangeExp', label: 'Bar range expansion' },
  { id: 'volImpulse', label: 'Volume impulse' },
  { id: 'gkRegime', label: 'Short-term volatility shift' },
]);
const BENCHMARKS = [
  { id: 'historical', label: 'Historical up rate', field: 'baselineProbability' },
  { id: 'recent', label: 'Recent up rate', field: 'recentBaselineProbability' },
  { id: 'momentum', label: 'Last-close momentum', field: 'momentumBaselineProbability' },
];

export function forecastHistoryMinimum(horizon = FORECAST_HORIZON) {
  if (!validForecastHorizon(horizon)) return null;
  // Include room for the worst-case UTC slot alignment.
  return LOOKBACK + MIN_TRAINING + EMBARGO - 1 + (MIN_HOLDOUT_ORIGINS + 2) * horizon;
}

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
  let priorVolume = 0;
  let gkEarly = 0;
  let gkRecent = 0;
  const half = LOOKBACK >> 1;
  for (let j = i - LOOKBACK + 1; j <= i; j++) {
    squaredMoves += (rows[j].close - rows[j - 1].close) ** 2;
    const hl = rows[j].high - rows[j].low;
    totalRange += hl;
    priorVolume += rows[j - 1].volume / LOOKBACK;
    const co = rows[j].close - rows[j].open;
    const gk = Math.max(0, 0.5 * hl * hl - (2 * Math.LN2 - 1) * co * co);
    if (j <= i - half) gkEarly += gk;
    else gkRecent += gk;
  }
  const scale = Math.max(Math.sqrt(squaredMoves / LOOKBACK), 1e-8);
  const scaledMove = n => Math.tanh((rows[i].close - rows[i - n].close) / (scale * Math.sqrt(n)));
  const range = rows[i].high - rows[i].low;
  const rangePosition = range > 1e-8 ? 2 * (rows[i].close - rows[i].low) / range - 1 : 0;
  const rangeExpansion = totalRange > 1e-8 ? Math.tanh(LOOKBACK * range / totalRange - 1) : 0;
  const volumeImpulse = priorVolume > 0 && rows[i].volume > 0
    ? Math.tanh(Math.log(rows[i].volume) - Math.log(priorVolume)) : 0;
  const gkShift = gkEarly > 1e-14 && gkRecent > 1e-14
    ? Math.tanh(0.5 * Math.log(gkRecent / gkEarly)) : 0;
  return [1, scaledMove(1), scaledMove(3), scaledMove(6), scaledMove(LOOKBACK), rangePosition, rangeExpansion, volumeImpulse, gkShift];
}

const sigmoid = value => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));

function predict(coefficients, features) {
  let logOdds = 0;
  for (let k = 0; k < coefficients.length; k++) logOdds += coefficients[k] * features[k];
  return sigmoid(logOdds);
}

function train(features, labels, rows, origin, horizon) {
  // Both methods get exactly the same labels known at least one candle before the prediction.
  const trainedThrough = origin - EMBARGO;
  const last = trainedThrough - horizon;
  const first = Math.max(LOOKBACK, last - MAX_TRAINING + 1);
  const count = last - first + 1;
  const recentStart = Math.max(first, last - RECENT_TRAINING + 1);
  let ups = 0;
  let recentUps = 0;
  for (let i = first; i <= last; i++) {
    ups += labels[i];
    if (i >= recentStart) recentUps += labels[i];
  }
  const baseline = (ups + 1) / (count + 2);
  const coefficients = new Float64Array(features[origin].length);
  const gradient = new Float64Array(coefficients.length);
  coefficients[0] = Math.log(baseline / (1 - baseline));
  // Scale L2 penalty with horizon overlap because overlapping multi-bar targets reduce effective sample size.
  const ridge = BASE_RIDGE * Math.sqrt(Math.max(1, horizon / FORECAST_HORIZON));

  for (let pass = 0; pass < FIT_ITERATIONS; pass++) {
    gradient.fill(0);
    for (let i = first; i <= last; i++) {
      const error = predict(coefficients, features[i]) - labels[i];
      for (let k = 0; k < coefficients.length; k++) gradient[k] += error * features[i][k];
    }
    coefficients[0] -= LEARNING_RATE * gradient[0] / count;
    for (let k = 1; k < coefficients.length; k++) {
      coefficients[k] -= LEARNING_RATE * (gradient[k] / count + ridge * coefficients[k]);
    }
  }
  const probability = Math.max(0.01, Math.min(0.99, predict(coefficients, features[origin])));
  const move = Math.sign(rows[origin].close - rows[origin - 1].close);
  return {
    count, trainedThrough, rawProbability: probability, coefficients,
    baselineProbability: baseline,
    recentBaselineProbability: (recentUps + 1) / (last - recentStart + 3),
    momentumBaselineProbability: 0.5 + 0.25 * move,
  };
}

const bandFor = score => score < 0.4 ? 0 : score < 0.6 ? 1 : 2;
const blankBands = () => SCORE_BANDS.map(([lower, upper]) => ({ lower, upper, count: 0, ups: 0, scoreTotal: 0 }));
const brier = (score, actual) => (score - actual) ** 2;

function probabilityScore(cases, field) {
  let loss = 0;
  let logLoss = 0;
  let correct = 0;
  for (const row of cases) {
    const score = row[field];
    loss += brier(score, row.actualUp);
    logLoss -= row.actualUp ? Math.log(score) : Math.log1p(-score);
    correct += Number(Number(score >= 0.5) === row.actualUp);
  }
  return { brier: loss / cases.length, logLoss: logLoss / cases.length, accuracy: correct / cases.length };
}

function scoreOrigins(origins, trainingCount) {
  const count = origins.length;
  const blocks = Array.from({length: BLOCKS}, () => ({count: 0, modelLoss: 0, baselineLoss: 0}));
  const model = probabilityScore(origins, 'modelProbability');
  const baselines = BENCHMARKS.map(({ id, label, field }) => ({ id, label, ...probabilityScore(origins, field) }));
  const strongestBaseline = baselines.reduce((best, baseline) => baseline.brier < best.brier ? baseline : best);
  const strongestField = BENCHMARKS.find(item => item.id === strongestBaseline.id).field;
  for (const [index, row] of origins.entries()) {
    const block = blocks[Math.floor(index * BLOCKS / count)];
    block.count++;
    block.baselineLoss += brier(row[strongestField], row.actualUp);
    block.modelLoss += brier(row.modelProbability, row.actualUp);
  }
  const upCount = origins.reduce((sum, row) => sum + row.actualUp, 0);
  const notUpCount = count - upCount;
  const winningBlocks = blocks.filter(block => block.baselineLoss > block.modelLoss).length;
  const checks = {
    sample: count >= MIN_HOLDOUT_ORIGINS,
    bothOutcomes: upCount >= 8 && notUpCount >= 8,
    brierGain: strongestBaseline.brier - model.brier >= MIN_BRIER_IMPROVEMENT,
    accuracy: model.accuracy >= strongestBaseline.accuracy,
    stability: winningBlocks >= 3 && blocks.at(-1).baselineLoss > blocks.at(-1).modelLoss,
  };
  const brierSkill = strongestBaseline.brier > 0 ? 1 - model.brier / strongestBaseline.brier : 0;
  const logLossSkill = strongestBaseline.logLoss > 0 ? 1 - model.logLoss / strongestBaseline.logLoss : 0;
  return {
    count, start: origins[0].asOf, end: origins.at(-1).targetCloseAt, trainingCount,
    modelBrier: model.brier, modelLogLoss: model.logLoss, modelAccuracy: model.accuracy,
    brierSkill, logLossSkill,
    baselineBrier: baselines[0].brier, baselineAccuracy: baselines[0].accuracy, baselines, strongestBaseline,
    upCount, notUpCount, winningBlocks, blockCount: BLOCKS,
    blocks: blocks.map(block => ({count:block.count, modelBrier:block.count ? block.modelLoss/block.count : null,
      baselineBrier:block.count ? block.baselineLoss/block.count : null})),
    checks, passed: Object.values(checks).every(Boolean), origins,
  };
}

function addToBand(bands, probability, actualUp) {
  const band = bands[bandFor(probability)];
  band.count++;
  band.ups += actualUp;
  band.scoreTotal += probability;
}

function reportBand({ lower, upper, count, ups, scoreTotal }) {
  const observedRate = count ? ups / count : null;
  return { lower, upper, count, averageScore: count ? scoreTotal / count : null, observedRate };
}

function calibratedScore(band, rawProbability) {
  if (band.count < MIN_RELIABILITY_CASES) return rawProbability;
  // Shrink the observed rate toward the fitted score so a small band cannot force a near-zero/one estimate.
  return (band.ups + MIN_RELIABILITY_CASES * rawProbability) / (band.count + MIN_RELIABILITY_CASES);
}

function currentReliability(band, score) {
  const report = reportBand(band);
  let scoreLower = null;
  let scoreUpper = null;
  if (band.count >= MIN_RELIABILITY_CASES) {
    // Wilson score bounds describe this sample. Serial market dependence precludes a coverage claim.
    const z = 1.6448536269514722;
    const rate = report.observedRate;
    const scale = 1 + z ** 2 / band.count;
    const center = (rate + z ** 2 / (2 * band.count)) / scale;
    const halfWidth = z * Math.sqrt(rate * (1 - rate) / band.count + z ** 2 / (4 * band.count ** 2)) / scale;
    scoreLower = Math.max(0, center - halfWidth);
    scoreUpper = Math.min(1, center + halfWidth);
  }
  const supported = scoreLower !== null && (score >= 0.5 ? scoreLower > 0.5 : scoreUpper < 0.5);
  return { ...report, scoreLower, scoreUpper, minimumCount: MIN_RELIABILITY_CASES, supported };
}

function historicalScenarios(origins) {
  const returns = origins.map(row => row.actualReturn).filter(Number.isFinite).sort((a, b) => a - b);
  const count = returns.length;
  if (count < MIN_HOLDOUT_ORIGINS) return null;
  const at = fraction => returns[Math.ceil(fraction * count) - 1];
  const up = returns.filter(value => value > 0).length;
  const down = returns.filter(value => value < 0).length;
  return { count, lower: at(0.1), median: at(0.5), upper: at(0.9), up, down, flat: count - up - down };
}

function marketRegime(rows, horizon) {
  if (rows.length < 50) return null;
  const recent = rows.slice(-64);
  const closes = recent.map(bar => bar.close);
  const lastClose = closes.at(-1);
  const fast = sma(closes, 20).at(-1);
  const slow = sma(closes, 50).at(-1);
  const ranges = atr(recent, 14);
  const currentAtr = ranges.at(-1);
  if (![lastClose, fast, slow, currentAtr].every(Number.isFinite) || lastClose <= 0) return null;
  const atrPct = currentAtr / lastClose * 100;
  const priorAtrs = ranges.slice(0, -1).filter(Number.isFinite);
  const baselineAtr = priorAtrs.length ? priorAtrs.reduce((sum, val) => sum + val, 0) / priorAtrs.length : currentAtr;
  const volRatio = baselineAtr > 0 ? currentAtr / baselineAtr : 1;
  const volatility = volRatio >= 1.3 ? 'Elevated' : volRatio <= 0.75 ? 'Quiet' : 'Normal';
  const structure = lastClose > fast && fast > slow ? 'Trending up'
    : lastClose < fast && fast < slow ? 'Trending down' : 'Ranging / mixed';
  const recent20 = recent.slice(-20);
  const rangeHigh = Math.max(...recent20.map(bar => bar.high));
  const rangeLow = Math.min(...recent20.map(bar => bar.low));
  const horizonMoveScalePct = atrPct * Math.sqrt(horizon);
  return {
    structure, volatility, volRatio, atr: currentAtr, atrPct, horizonMoveScalePct,
    supportLevel: rangeLow, resistanceLevel: rangeHigh,
    atrSupport: Math.max(0, lastClose - 1.5 * currentAtr),
    atrResistance: lastClose + 1.5 * currentAtr,
  };
}

function featureDrivers(coefficients, featureRow) {
  if (!coefficients || !featureRow) return [];
  return FEATURE_META.map((meta, index) => {
    const k = index + 1;
    const value = featureRow[k];
    const weight = coefficients[k];
    const contribution = weight * value;
    return {
      id: meta.id, label: meta.label, value, contribution,
      direction: contribution > 0.005 ? 'up' : contribution < -0.005 ? 'down' : 'neutral',
    };
  }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

function evaluateHorizon({ rows, features, instrument, interval, step, nowSeconds, stale, validationReason, gap, incompleteHistory }, horizon) {
  const result = {
    version: FORECAST_VERSION, method: METHOD, horizon,
    venue: instrument?.venue ?? null, symbol: instrument?.symbol ?? null, interval,
    closedCount: rows.length, sampleStart: null, asOf: null, targetCloseAt: null,
    reason: null, evidence: null, forecast: null, reliability: null, scenarios: null,
    regime: null, drivers: [], rawProbabilityUp: null, calibratedProbabilityUp: null,
    requiredCandles: forecastHistoryMinimum(horizon), gap, incompleteHistory,
  };
  const abstain = reason => ({ ...result, reason });
  if (validationReason) return abstain(validationReason);
  const query = rows.length - 1;
  const closeAt = index => rows[index].time + step;
  const asOf = closeAt(query);
  const targetCloseAt = asOf + horizon * step;
  Object.assign(result, { sampleStart: closeAt(0), asOf, targetCloseAt });

  const minOrigin = LOOKBACK + MIN_TRAINING - 1 + horizon + EMBARGO;
  const latestValidation = query - horizon;
  const moreHistory = 'Load more consecutive closed candles to start the historical test.';
  if (latestValidation < minOrigin) return abstain(moreHistory + (gap ? ' A gap limits the sample.' : ''));

  const labels = rows.map((row, i) => i <= latestValidation ? Number(rows[i + horizon].close > row.close) : null);
  // Fixed UTC slots keep validation origins stable as candles arrive. Their outcome windows never overlap.
  const lastSlot = latestValidation - (closeAt(latestValidation) / step % horizon);
  const earliestSlot = lastSlot - Math.floor((lastSlot - minOrigin) / horizon) * horizon;
  const firstScoredSlot = lastSlot - (MAX_HOLDOUT - 1) * horizon;
  const firstSlot = Math.max(earliestSlot, firstScoredSlot - (MAX_CALIBRATION_ORIGINS + 1) * horizon);
  const cases = [];
  const calibrationOrigins = [];
  const scoredBands = blankBands();
  function calibrationBand(origin, rawProbability) {
    const upperLimit = closeAt(origin - EMBARGO);
    let end = cases.length;
    while (end > 0 && cases[end - 1].targetCloseAt > upperLimit) end--;
    const bandIndex = bandFor(rawProbability);
    const [lower, upper] = SCORE_BANDS[bandIndex];
    const band = { lower, upper, count: 0, ups: 0, scoreTotal: 0 };
    for (let j = Math.max(0, end - MAX_CALIBRATION_ORIGINS); j < end; j++) {
      const row = cases[j];
      if (bandFor(row.rawProbability) !== bandIndex) continue;
      band.count++;
      band.ups += row.actualUp;
      band.scoreTotal += row.rawProbability;
    }
    return band;
  }
  for (let i = firstSlot; i <= lastSlot; i += horizon) {
    const { count, trainedThrough, rawProbability, coefficients: _unused, ...baselines } = train(features, labels, rows, i, horizon);
    const record = {
      horizon, asOf: closeAt(i), targetCloseAt: closeAt(i + horizon),
      actualUp: labels[i], rawProbability, trainedThrough: closeAt(trainedThrough),
    };
    if (i < firstScoredSlot) {
      // Warm-up scores are useful for calibration, while the scored window always contains at most 120 cases.
      calibrationOrigins.push(record);
      cases.push(record);
      continue;
    }
    const band = calibrationBand(i, rawProbability);
    const modelProbability = calibratedScore(band, rawProbability);
    const actualReturn = rows[i + horizon].close / rows[i].close - 1;
    addToBand(scoredBands, modelProbability, labels[i]);
    cases.push({
      ...record, trainingCount: count, calibrationCount: band.count,
      actualReturn: Number.isFinite(actualReturn) ? actualReturn : null,
      modelProbability, calibrated: band.count >= MIN_RELIABILITY_CASES, ...baselines,
    });
  }
  const origins = cases.slice(calibrationOrigins.length);
  if (!origins.length) return abstain(moreHistory);

  const fitted = train(features, labels, rows, query, horizon);
  result.evidence = { ...scoreOrigins(origins, fitted.count), calibrationOrigins };
  result.scenarios = historicalScenarios(origins);
  result.regime = marketRegime(rows, horizon);
  result.drivers = featureDrivers(fitted.coefficients, features[query]);
  const band = calibrationBand(query, fitted.rawProbability);
  const probabilityUp = calibratedScore(band, fitted.rawProbability);
  result.rawProbabilityUp = fitted.rawProbability;
  result.calibratedProbabilityUp = probabilityUp;
  result.reliability = {
    bands: scoredBands.map(reportBand), current: currentReliability(band, probabilityUp),
    calibratedOrigins: origins.filter(row => row.calibrated).length,
  };
  if (stale || nowSeconds - asOf >= step) return abstain('The latest expected close is unconfirmed or the candle feed is stale.');
  if (incompleteHistory) return abstain('The requested history could not be loaded in full. The available sample is shown for review.');
  if (origins.length < MIN_HOLDOUT_ORIGINS) return abstain('Load more closed history for at least 50 non-overlapping test forecasts.');
  if (!result.evidence.checks.bothOutcomes) return abstain('The test needs more examples of both higher and non-higher closes.');
  if (!result.evidence.passed) return abstain('Historical results did not consistently improve on the strongest baseline.');
  const direction = probabilityUp >= MIN_DIRECTION_PROBABILITY ? 'up'
    : probabilityUp <= 1 - MIN_DIRECTION_PROBABILITY ? 'not-higher' : null;
  if (!direction) return abstain('The current estimate is too close to an even chance for a directional call.');
  if (!result.reliability.current.supported) return abstain('The current score band has insufficient directional support in past test cases.');
  const benchmarkId = result.evidence.strongestBaseline.id;
  const benchmarkField = BENCHMARKS.find(item => item.id === benchmarkId).field;
  return {
    ...result,
    forecast: {
      venue: instrument.venue, symbol: instrument.symbol, interval, version: FORECAST_VERSION, horizon,
      asOf, targetCloseAt, originClose: rows[query].close, probabilityUp, direction, sampleStart: result.sampleStart,
      baselineProbabilityUp: fitted.baselineProbability, benchmarkId, benchmarkProbabilityUp: fitted[benchmarkField],
    },
  };
}

export function evaluateAdaptiveStudy({
  bars, instrument, interval, closedThrough, nowSeconds = Date.now() / 1000, stale = false,
  horizon = FORECAST_HORIZON, maxCandles = FORECAST_MAX_CANDLES, from, singleHorizon = false,
  incompleteHistory = false, requiredWindowCount,
} = {}) {
  const step = Object.hasOwn(INTERVALS, interval) ? INTERVALS[interval] : 0;
  const valid = validInstrument(instrument) && step && Number.isFinite(closedThrough) && Number.isFinite(nowSeconds);
  const max = Number.isSafeInteger(maxCandles) && maxCandles > 0 ? Math.min(maxCandles, FORECAST_MAX_CANDLES) : FORECAST_MAX_CANDLES;
  const closed = valid ? closedStudyCandles(bars, interval, closedThrough, nowSeconds)
    .filter(bar => from === undefined || bar.time >= from) : [];
  const validationReason = !valid ? 'Wait for a confirmed candle snapshot from this market.'
    : closed.length ? null : 'Waiting for a completed candle from this market.';
  let first = Math.max(0, closed.length - 1);
  while (first > 0 && closed.length - first < max && closed[first].time - closed[first - 1].time === step) first--;
  const rows = closed.slice(first);
  const gap = first > 0 && closed[first].time - closed[first - 1].time !== step;
  const logRows = rows.map(({ open, close, high, low, volume }) => ({
    open: Math.log(open), close: Math.log(close), high: Math.log(high), low: Math.log(low), volume,
  }));
  const features = rows.map((_, index) => index >= LOOKBACK ? studyFeatures(logRows, index) : null);
  const context = { rows, features, instrument, interval, step, nowSeconds, stale, validationReason, gap,
    incompleteHistory: incompleteHistory || Number.isSafeInteger(requiredWindowCount) && rows.length<requiredWindowCount };
  const selected = validForecastHorizon(horizon) ? horizon : FORECAST_HORIZON;
  const requested = singleHorizon ? [selected] : [...new Set([...FORECAST_HORIZONS, selected])];
  const horizons = Object.fromEntries(requested.map(length => [length, evaluateHorizon(context, length)]));
  return { ...horizons[selected], horizons };
}
