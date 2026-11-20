import { atr, normalizeCandles, sma } from './analytics.js';
import { INTERVALS, validInstrument } from './preferences.js';
import { FORECAST_MAX_CANDLES, validForecastHorizon } from './forecast-settings.js';

export const FORECAST_VERSION = 'adaptive-v5';
export const FORECAST_HORIZON = 5;
export const FORECAST_HORIZONS = Object.freeze([FORECAST_HORIZON, 12, 24]);
export const MIN_HOLDOUT_ORIGINS = 50;

const METHOD = 'Walk-forward 4-expert causal ensemble (adaptive & conservative L2 logistic, Gaussian historical analog matcher & base-rate prior) with time-ordered calibration';
const LOOKBACK = 16;
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
const PRICE_FIELDS = ['open', 'high', 'low', 'close', 'volume'];
const SCORE_BANDS = [[0, 0.4], [0.4, 0.6], [0.6, 1]];
const FEATURE_META = Object.freeze([
  { id: 'move1', label: '1-bar short-term return' },
  { id: 'move3', label: '3-bar inflection momentum' },
  { id: 'move12', label: '12-bar medium trend' },
  { id: 'bbZ', label: 'Bollinger band stretch (16-bar)' },
  { id: 'rangePos', label: 'Candle close location' },
  { id: 'rangeExp', label: 'Range expansion vs 16-bar avg' },
  { id: 'volImpulse', label: 'Volume surge vs prior avg' },
  { id: 'flowSlope', label: '10-bar directional volume flow' },
  { id: 'gkRegime', label: 'Garman-Klass volatility shift' },
]);
const EXPERT_LABELS = Object.freeze([
  { id: 'fast', label: 'Adaptive trend / reversion model' },
  { id: 'reg', label: 'Conservative ridge model' },
  { id: 'analog', label: 'Historical pattern analogs' },
  { id: 'base', label: 'Historical base-rate prior' },
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
  let sumClose = 0;
  let signedVol = 0;
  let absVol = 0;
  for (let j = i - LOOKBACK + 1; j <= i; j++) {
    const dc = rows[j].close - rows[j - 1].close;
    squaredMoves += dc * dc;
    const hl = rows[j].high - rows[j].low;
    totalRange += hl;
    priorVolume += rows[j - 1].volume / LOOKBACK;
    sumClose += rows[j].close;
    const co = rows[j].close - rows[j].open;
    const gk = Math.max(0, 0.5 * hl * hl - (2 * Math.LN2 - 1) * co * co);
    if (j <= i - 6) gkEarly += gk / (LOOKBACK - 6);
    else gkRecent += gk / 6;
    if (j > i - 10) {
      const sign = co > 0 ? 1 : co < 0 ? -1 : 0;
      signedVol += sign * rows[j].volume;
      absVol += rows[j].volume;
    }
  }
  const meanClose = sumClose / LOOKBACK;
  let varClose = 0;
  for (let j = i - LOOKBACK + 1; j <= i; j++) varClose += (rows[j].close - meanClose) ** 2;
  const stdClose = Math.sqrt(varClose / LOOKBACK);
  const scale = Math.max(Math.sqrt(squaredMoves / LOOKBACK), 1e-8);
  const scaledMove = n => Math.tanh((rows[i].close - rows[i - n].close) / (scale * Math.sqrt(n)));
  const bbZ = stdClose > 1e-8 ? Math.tanh((rows[i].close - meanClose) / (2 * stdClose)) : 0;
  const range = rows[i].high - rows[i].low;
  const rangePosition = range > 1e-8 ? 2 * (rows[i].close - rows[i].low) / range - 1 : 0;
  const rangeExpansion = totalRange > 1e-8 ? Math.tanh(LOOKBACK * range / totalRange - 1) : 0;
  const volumeImpulse = priorVolume > 0 && rows[i].volume > 0
    ? Math.tanh(Math.log(rows[i].volume) - Math.log(priorVolume)) : 0;
  const flowSlope = absVol > 0 ? Math.tanh((signedVol / absVol) * 1.4) : 0;
  const gkShift = gkEarly > 1e-14 && gkRecent > 1e-14
    ? Math.tanh(0.5 * Math.log(gkRecent / gkEarly)) : 0;
  return new Float64Array([1, scaledMove(1), scaledMove(3), scaledMove(12), bbZ, rangePosition, rangeExpansion, volumeImpulse, flowSlope, gkShift]);
}

const sigmoid = value => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));

function predict(coefficients, features) {
  let logOdds = 0;
  for (let k = 0; k < coefficients.length; k++) logOdds += coefficients[k] * features[k];
  return sigmoid(logOdds);
}

// In-place Cholesky L*L^T solver for small symmetric positive-definite Hessian (dim = 10)
function solveCholesky(H, g, dim, delta) {
  const L = new Float64Array(dim * dim);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = H[i * dim + j];
      for (let k = 0; k < j; k++) sum -= L[i * dim + k] * L[j * dim + k];
      if (i === j) {
        if (!(sum > 1e-12)) return false;
        L[i * dim + j] = Math.sqrt(sum);
      } else {
        L[i * dim + j] = sum / L[j * dim + j];
      }
    }
  }
  const y = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    let sum = g[i];
    for (let k = 0; k < i; k++) sum -= L[i * dim + k] * y[k];
    y[i] = sum / L[i * dim + i];
  }
  for (let i = dim - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < dim; k++) sum -= L[k * dim + i] * delta[k];
    delta[i] = sum / L[i * dim + i];
  }
  return true;
}

// Damped Newton-Raphson / IRLS solver: converges quadratically to the exact global L2-logistic optimum in ~5-7 steps (vs 52 GD steps)
function fitLogistic(features, labels, first, last, ridge, maxIters = 7) {
  const dim = features[first].length;
  const count = last - first + 1;
  const invCount = 1 / count;
  const coefficients = new Float64Array(dim);
  const gradient = new Float64Array(dim);
  const hessian = new Float64Array(dim * dim);
  const step = new Float64Array(dim);
  let ups = 0;
  for (let i = first; i <= last; i++) ups += labels[i];
  const base = (ups + 1) / (count + 2);
  coefficients[0] = Math.log(base / (1 - base));

  for (let iter = 0; iter < maxIters; iter++) {
    gradient.fill(0);
    hessian.fill(0);
    for (let i = first; i <= last; i++) {
      const f = features[i];
      let z = 0;
      for (let k = 0; k < dim; k++) z += coefficients[k] * f[k];
      const p = sigmoid(z);
      const err = p - labels[i];
      const w = Math.max(1e-6, p * (1 - p));
      for (let r = 0; r < dim; r++) {
        const fr = f[r];
        gradient[r] += err * fr;
        const wf = w * fr;
        const rowOff = r * dim;
        for (let c = 0; c <= r; c++) hessian[rowOff + c] += wf * f[c];
      }
    }
    gradient[0] *= invCount;
    hessian[0] = hessian[0] * invCount + 1e-6;
    for (let r = 1; r < dim; r++) {
      gradient[r] = gradient[r] * invCount + ridge * coefficients[r];
      const rowOff = r * dim;
      for (let c = 0; c <= r; c++) hessian[rowOff + c] *= invCount;
      hessian[rowOff + r] += ridge + 1e-6;
    }
    if (!solveCholesky(hessian, gradient, dim, step)) break;
    let maxStep = 0;
    for (let k = 0; k < dim; k++) {
      const s = Math.max(-2.5, Math.min(2.5, step[k]));
      coefficients[k] -= s;
      const absS = Math.abs(s);
      if (absS > maxStep) maxStep = absS;
    }
    if (maxStep < 1e-5) break;
  }
  return { coefficients, base };
}

function kernelAnalogProbability(features, labels, first, last, queryFeat, baseline) {
  const q1 = queryFeat[1], q2 = queryFeat[2], q3 = queryFeat[3], q4 = queryFeat[4], q9 = queryFeat[9];
  const inv2s2 = 1 / 0.75;
  let wSum = 0;
  let wUp = 0;
  for (let i = first; i <= last; i++) {
    const f = features[i];
    const d1 = q1 - f[1], d2 = q2 - f[2], d3 = q3 - f[3], d4 = q4 - f[4], d9 = q9 - f[9];
    const wt = Math.exp(-(1.4 * d1 * d1 + 1.2 * d2 * d2 + d3 * d3 + d4 * d4 + d9 * d9) * inv2s2);
    wSum += wt;
    wUp += wt * labels[i];
  }
  return (wUp + 14 * baseline) / (wSum + 14);
}

function train(features, labels, rows, origin, horizon) {
  // All experts use strictly embargoed past labels known before the prediction origin.
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
  const hScale = Math.sqrt(Math.max(1, horizon / FORECAST_HORIZON));

  // Internal chronological holdout inside [first, last] for 100% shift-invariant causal expert weighting.
  const valSpan = Math.floor(count * 0.30);
  const innerValStart = last - valSpan + 1;
  const innerTrainEnd = innerValStart - horizon - EMBARGO;
  let expertWeights = [0.22, 0.35, 0.23, 0.20];

  if (innerTrainEnd - first >= 75) {
    const innerFast = fitLogistic(features, labels, first, innerTrainEnd, 0.05 * hScale, 6);
    const innerReg = fitLogistic(features, labels, first, innerTrainEnd, 1.8 * hScale, 5);
    const losses = [0, 0, 0, 0];
    let nVal = 0;
    for (let v = innerValStart; v <= last; v += horizon) {
      const y = labels[v];
      const fv = features[v];
      const pf = Math.max(0.01, Math.min(0.99, predict(innerFast.coefficients, fv)));
      const pr = Math.max(0.01, Math.min(0.99, predict(innerReg.coefficients, fv)));
      const pa = Math.max(0.01, Math.min(0.99, kernelAnalogProbability(features, labels, first, innerTrainEnd, fv, innerFast.base)));
      const pb = innerFast.base;
      losses[0] += (pf - y) ** 2;
      losses[1] += (pr - y) ** 2;
      losses[2] += (pa - y) ** 2;
      losses[3] += (pb - y) ** 2;
      nVal++;
    }
    if (nVal >= 6) {
      const minLoss = Math.min(...losses);
      const priors = [0.7, 1.4, 1.0, 1.5];
      const rawW = losses.map((loss, idx) => priors[idx] * Math.exp(-6.0 * (loss - minLoss)));
      const sumW = rawW.reduce((a, b) => a + b, 0);
      expertWeights = rawW.map(w => w / sumW);
    }
  }

  const fastFit = fitLogistic(features, labels, first, last, 0.045 * hScale, 7);
  const regFit = fitLogistic(features, labels, first, last, 1.8 * hScale, 6);
  const fo = features[origin];
  const pFast = Math.max(0.01, Math.min(0.99, predict(fastFit.coefficients, fo)));
  const pReg = Math.max(0.01, Math.min(0.99, predict(regFit.coefficients, fo)));
  const pAnalog = Math.max(0.01, Math.min(0.99, kernelAnalogProbability(features, labels, first, last, fo, baseline)));
  const rawProbability = Math.max(0.01, Math.min(0.99,
    expertWeights[0] * pFast + expertWeights[1] * pReg + expertWeights[2] * pAnalog + expertWeights[3] * baseline));

  // Blended effective linear coefficients for transparent driver attribution
  const linearShare = Math.max(1e-6, expertWeights[0] + expertWeights[1]);
  const blendedCoeff = new Float64Array(fastFit.coefficients.length);
  for (let k = 0; k < blendedCoeff.length; k++) {
    blendedCoeff[k] = (expertWeights[0] * fastFit.coefficients[k] + expertWeights[1] * regFit.coefficients[k]) / linearShare;
  }

  const move = Math.sign(rows[origin].close - rows[origin - 1].close);
  return {
    count, trainedThrough, rawProbability,
    coefficients: blendedCoeff,
    expertWeights,
    expertProbabilities: { fast: pFast, reg: pReg, analog: pAnalog, base: baseline },
    first, last,
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

function quantile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

function historicalScenarios(origins) {
  const returns = origins.map(row => row.actualReturn).filter(Number.isFinite).sort((a, b) => a - b);
  const count = returns.length;
  if (count < MIN_HOLDOUT_ORIGINS) return null;
  const up = returns.filter(value => value > 0).length;
  const down = returns.filter(value => value < 0).length;
  return { count, lower: quantile(returns, 0.1), median: quantile(returns, 0.5), upper: quantile(returns, 0.9), up, down, flat: count - up - down };
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

function historicalAnalogs(features, rows, first, last, query, horizon, step) {
  const q = features[query];
  if (!q || last < first) return null;
  const dims = [1, 2, 3, 4, 9];
  const scored = [];
  for (let i = first; i <= last; i++) {
    const f = features[i];
    if (!f) continue;
    let d2 = 0;
    for (const k of dims) { const diff = q[k] - f[k]; d2 += diff * diff; }
    const fwd = rows[i + horizon].close / rows[i].close - 1;
    if (!Number.isFinite(fwd)) continue;
    scored.push({ index: i, d2, fwd, originClose: rows[i].close, targetClose: rows[i + horizon].close, asOf: rows[i].time + step });
  }
  scored.sort((a, b) => a.d2 - b.d2);
  // Select up to 24 non-overlapping independent historical analog episodes
  const selected = [];
  const minSep = Math.max(3, Math.floor(horizon / 2));
  for (const item of scored) {
    if (selected.some(prev => Math.abs(prev.index - item.index) < minSep)) continue;
    selected.push(item);
    if (selected.length >= 24) break;
  }
  if (selected.length < 8) return null;
  const returns = selected.map(s => s.fwd).sort((a, b) => a - b);
  const upCount = selected.filter(s => s.fwd > 0).length;
  return {
    count: selected.length,
    upRate: upCount / selected.length,
    upCount,
    downCount: selected.length - upCount,
    p10Return: quantile(returns, 0.1),
    p25Return: quantile(returns, 0.25),
    medianReturn: quantile(returns, 0.5),
    p75Return: quantile(returns, 0.75),
    p90Return: quantile(returns, 0.9),
    topMatches: selected.slice(0, 3).map(m => ({
      asOf: m.asOf,
      similarityPct: Math.round(Math.exp(-m.d2 / 2.2) * 100),
      forwardReturn: m.fwd,
      originClose: m.originClose,
      targetClose: m.targetClose,
    })),
  };
}

function buildProjection({ currentClose, probabilityUp, verifiedCall, fitted, drivers, regime, analogs, scenarios, evidence, horizon, interval }) {
  if (!Number.isFinite(currentClose) || currentClose <= 0) return null;
  const lean = probabilityUp >= 0.54 ? 'Bullish lean' : probabilityUp <= 0.46 ? 'Bearish lean' : 'Balanced / neutral';
  const leanTone = probabilityUp >= 0.54 ? 'up' : probabilityUp <= 0.46 ? 'down' : 'neutral';
  const retDist = analogs ?? (scenarios ? {
    p10Return: scenarios.lower, p25Return: scenarios.lower * 0.5, medianReturn: scenarios.median,
    p75Return: scenarios.upper * 0.5, p90Return: scenarios.upper,
  } : null);
  const priceAt = r => Number.isFinite(r) ? Math.max(0, currentClose * (1 + r)) : null;
  const corridor = retDist ? {
    source: analogs ? `Based on ${analogs.count} closest historical coin setups` : `Based on ${scenarios.count} held-out walk-forward windows`,
    bearPrice: priceAt(retDist.p25Return), bearPct: retDist.p25Return * 100,
    basePrice: priceAt(retDist.medianReturn), basePct: retDist.medianReturn * 100,
    bullPrice: priceAt(retDist.p75Return), bullPct: retDist.p75Return * 100,
    wideLowPrice: priceAt(retDist.p10Return), wideHighPrice: priceAt(retDist.p90Return),
  } : null;

  const reasons = [];
  const activeDrivers = drivers.filter(d => d.direction !== 'neutral').slice(0, 2);
  if (activeDrivers.length) {
    const desc = activeDrivers.map(d => `${d.label.toLowerCase()} (${d.direction === 'up' ? 'supports upside' : 'weighs on upside'})`).join(' and ');
    reasons.push(`Primary learned signals from this coin’s history: ${desc}.`);
  } else {
    reasons.push('Short- and medium-term momentum, Bollinger stretch, and volume flow are currently balanced with no extreme skew.');
  }
  if (analogs) {
    const medPct = (analogs.medianReturn * 100).toFixed(2);
    reasons.push(`Across the ${analogs.count} closest past setups in this coin’s history, ${Math.round(analogs.upRate * 100)}% closed higher after ${horizon} ${interval} bars (median move ${analogs.medianReturn >= 0 ? '+' : ''}${medPct}%).`);
  }
  if (regime) {
    reasons.push(`Market structure is ${regime.structure.toLowerCase()} with ${regime.volatility.toLowerCase()} volatility (ATR ${regime.atrPct.toFixed(2)}%/bar; typical ${horizon}-bar swing scale ±${regime.horizonMoveScalePct.toFixed(1)}%).`);
  }
  if (evidence) {
    const skillPct = (evidence.brierSkill * 100).toFixed(1);
    if (verifiedCall) {
      reasons.push(`Walk-forward validation passed all 5 checks across ${evidence.count} non-overlapping tests (${evidence.brierSkill >= 0 ? '+' : ''}${skillPct}% Brier skill vs ${evidence.strongestBaseline.label.toLowerCase()}).`);
    } else {
      reasons.push(`Exploratory historical projection: walk-forward gates did not confirm a durable edge over ${evidence.strongestBaseline.label.toLowerCase()} on this sample, so treat the target range as historical context rather than a trade signal.`);
    }
  }
  const expertWeights = EXPERT_LABELS.map((meta, idx) => ({
    id: meta.id, label: meta.label,
    weightPct: Math.round((fitted.expertWeights[idx] ?? 0) * 100),
    probabilityUp: fitted.expertProbabilities[meta.id],
  }));
  return {
    currentClose, lean, leanTone, verifiedCall, probabilityUp, corridor, reasons, expertWeights,
    invalidation: regime ? {
      supportLevel: regime.supportLevel,
      resistanceLevel: regime.resistanceLevel,
      atrSupport: regime.atrSupport,
      atrResistance: regime.atrResistance,
    } : null,
  };
}

function evaluateHorizon({ rows, features, instrument, interval, step, nowSeconds, stale, validationReason, gap, incompleteHistory }, horizon) {
  const result = {
    version: FORECAST_VERSION, method: METHOD, horizon,
    venue: instrument?.venue ?? null, symbol: instrument?.symbol ?? null, interval,
    closedCount: rows.length, sampleStart: null, asOf: null, targetCloseAt: null,
    reason: null, evidence: null, forecast: null, reliability: null, scenarios: null,
    regime: null, drivers: [], analogs: null, projection: null,
    rawProbabilityUp: null, calibratedProbabilityUp: null,
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
    const {
      count, trainedThrough, rawProbability,
      baselineProbability, recentBaselineProbability, momentumBaselineProbability,
    } = train(features, labels, rows, i, horizon);
    const record = {
      horizon, asOf: closeAt(i), targetCloseAt: closeAt(i + horizon),
      actualUp: labels[i], rawProbability, trainedThrough: closeAt(trainedThrough),
    };
    if (i < firstScoredSlot) {
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
      modelProbability, calibrated: band.count >= MIN_RELIABILITY_CASES,
      baselineProbability, recentBaselineProbability, momentumBaselineProbability,
    });
  }
  const origins = cases.slice(calibrationOrigins.length);
  if (!origins.length) return abstain(moreHistory);

  const fitted = train(features, labels, rows, query, horizon);
  result.evidence = { ...scoreOrigins(origins, fitted.count), calibrationOrigins };
  result.scenarios = historicalScenarios(origins);
  result.regime = marketRegime(rows, horizon);
  result.drivers = featureDrivers(fitted.coefficients, features[query]);
  result.analogs = historicalAnalogs(features, rows, fitted.first, fitted.last, query, horizon, step);
  const band = calibrationBand(query, fitted.rawProbability);
  const probabilityUp = calibratedScore(band, fitted.rawProbability);
  result.rawProbabilityUp = fitted.rawProbability;
  result.calibratedProbabilityUp = probabilityUp;
  result.reliability = {
    bands: scoredBands.map(reportBand), current: currentReliability(band, probabilityUp),
    calibratedOrigins: origins.filter(row => row.calibrated).length,
  };

  const attachProjection = verifiedCall => {
    result.projection = buildProjection({
      currentClose: rows[query].close, probabilityUp, verifiedCall, fitted,
      drivers: result.drivers, regime: result.regime, analogs: result.analogs,
      scenarios: result.scenarios, evidence: result.evidence, horizon, interval,
    });
  };

  if (stale || nowSeconds - asOf >= step) { attachProjection(false); return abstain('The latest expected close is unconfirmed or the candle feed is stale.'); }
  if (incompleteHistory) { attachProjection(false); return abstain('The requested history could not be loaded in full. The available sample is shown for review.'); }
  if (origins.length < MIN_HOLDOUT_ORIGINS) { attachProjection(false); return abstain('Load more closed history for at least 50 non-overlapping test forecasts.'); }
  if (!result.evidence.checks.bothOutcomes) { attachProjection(false); return abstain('The test needs more examples of both higher and non-higher closes.'); }
  if (!result.evidence.passed) { attachProjection(false); return abstain('Historical results did not consistently improve on the strongest baseline.'); }
  const direction = probabilityUp >= MIN_DIRECTION_PROBABILITY ? 'up'
    : probabilityUp <= 1 - MIN_DIRECTION_PROBABILITY ? 'not-higher' : null;
  if (!direction) { attachProjection(false); return abstain('The current estimate is too close to an even chance for a directional call.'); }
  if (!result.reliability.current.supported) { attachProjection(false); return abstain('The current score band has insufficient directional support in past test cases.'); }
  attachProjection(true);
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
    incompleteHistory: incompleteHistory || Number.isSafeInteger(requiredWindowCount) && rows.length < requiredWindowCount };
  const selected = validForecastHorizon(horizon) ? horizon : FORECAST_HORIZON;
  const requested = singleHorizon ? [selected] : [...new Set([...FORECAST_HORIZONS, selected])];
  const horizons = Object.fromEntries(requested.map(length => [length, evaluateHorizon(context, length)]));
  return { ...horizons[selected], horizons };
}
