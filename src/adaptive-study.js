import { atr, normalizeCandles, sma } from './analytics.js';
import { INTERVALS, validInstrument } from './preferences.js';
import { FORECAST_MAX_CANDLES, validForecastHorizon } from './forecast-settings.js';

export const FORECAST_VERSION = 'adaptive-v6';
export const FORECAST_HORIZON = 5;
export const FORECAST_HORIZONS = Object.freeze([FORECAST_HORIZON, 12, 24]);
export const MIN_HOLDOUT_ORIGINS = 50;

const METHOD = 'Walk-forward 5-expert causal ensemble (Adaptive & Ridge L2 Logistic via Newton-Raphson IRLS, Non-Linear Gradient Boosted Trees, Regime-Gated Gaussian Analog Matcher & Recency Prior) with probability-consistent quantile corridors';
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
  { id: 'move1', label: '1-bar short-term impulse' },
  { id: 'move3', label: '3-bar inflection momentum' },
  { id: 'move12', label: '12-bar intermediate trend' },
  { id: 'trendAccel', label: 'Momentum curvature / acceleration' },
  { id: 'bbZ', label: 'Bollinger band Z-stretch (16-bar)' },
  { id: 'rsiElastic', label: 'RSI exhaustion / mean-reversion elasticity' },
  { id: 'hurstTilt', label: 'Hurst variance-ratio persistence regime' },
  { id: 'rangePos', label: 'Candle close location in range' },
  { id: 'wickAsym', label: 'Lower vs upper wick absorption' },
  { id: 'rangeExp', label: 'Range expansion vs 16-bar avg' },
  { id: 'volImpulse', label: 'Volume surge vs prior avg' },
  { id: 'flowSlope', label: '10-bar directional volume flow' },
  { id: 'gkRegime', label: 'Garman-Klass volatility regime shift' },
]);

const EXPERT_LABELS = Object.freeze([
  { id: 'fast', label: 'Adaptive IRLS logistic (13-factor)' },
  { id: 'reg', label: 'Conservative ridge logistic' },
  { id: 'gbdt', label: 'Non-linear gradient boosted trees' },
  { id: 'analog', label: 'Regime-gated pattern analogs' },
  { id: 'base', label: 'Recency-weighted base-rate prior' },
]);

const BENCHMARKS = [
  { id: 'historical', label: 'Historical up rate', field: 'baselineProbability' },
  { id: 'recent', label: 'Recent up rate', field: 'recentBaselineProbability' },
  { id: 'momentum', label: 'Last-close momentum', field: 'momentumBaselineProbability' },
];

export function forecastHistoryMinimum(horizon = FORECAST_HORIZON) {
  if (!validForecastHorizon(horizon)) return null;
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
  let gainSum = 0;
  let lossSum = 0;
  let sq4 = 0;
  let count4 = 0;

  for (let j = i - LOOKBACK + 1; j <= i; j++) {
    const dc = rows[j].close - rows[j - 1].close;
    squaredMoves += dc * dc;
    if (j > i - 14) {
      if (dc > 0) gainSum += dc;
      else lossSum -= dc;
    }
    if (j >= i - LOOKBACK + 4) {
      const dc4 = rows[j].close - rows[j - 4].close;
      sq4 += dc4 * dc4;
      count4++;
    }
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
  const var1 = squaredMoves / LOOKBACK;
  const scale = Math.max(Math.sqrt(var1), 1e-8);
  const scaledMove = n => Math.tanh((rows[i].close - rows[i - n].close) / (scale * Math.sqrt(n)));

  const m1 = scaledMove(1);
  const m3 = scaledMove(3);
  const m12 = scaledMove(12);
  const trendAccel = Math.tanh((m3 - m12) * 1.15);
  const bbZ = stdClose > 1e-8 ? Math.tanh((rows[i].close - meanClose) / (2 * stdClose)) : 0;

  // Non-linear RSI exhaustion elasticity: smooth inside 30-70, accelerates sharply in oversold/overbought tails
  const rsi14 = (gainSum + lossSum) > 1e-12 ? (100 * gainSum) / (gainSum + lossSum) : 50;
  const rsiCentered = (rsi14 - 50) / 25;
  const rsiElastic = Math.tanh(rsiCentered * Math.abs(rsiCentered) * 0.85);

  // Lo-MacKinlay Variance Ratio (q=4) -> positive = trending persistence, negative = mean-reversion
  const vr = var1 > 1e-14 && count4 > 0 ? (sq4 / count4) / (4 * var1) : 1;
  const hurstTilt = Math.tanh((vr - 1) * 1.4);

  const cur = rows[i];
  const range = cur.high - cur.low;
  const rangePosition = range > 1e-8 ? (2 * (cur.close - cur.low)) / range - 1 : 0;
  const lowerWick = Math.min(cur.open, cur.close) - cur.low;
  const upperWick = cur.high - Math.max(cur.open, cur.close);
  const wickAsym = range > 1e-8 ? (lowerWick - upperWick) / range : 0;
  const rangeExpansion = totalRange > 1e-8 ? Math.tanh((LOOKBACK * range) / totalRange - 1) : 0;
  const volumeImpulse = priorVolume > 0 && cur.volume > 0
    ? Math.tanh(Math.log(cur.volume) - Math.log(priorVolume)) : 0;
  const flowSlope = absVol > 0 ? Math.tanh((signedVol / absVol) * 1.4) : 0;
  const gkShift = gkEarly > 1e-14 && gkRecent > 1e-14
    ? Math.tanh(0.5 * Math.log(gkRecent / gkEarly)) : 0;

  return new Float64Array([
    1, m1, m3, m12, trendAccel, bbZ, rsiElastic, hurstTilt,
    rangePosition, wickAsym, rangeExpansion, volumeImpulse, flowSlope, gkShift,
  ]);
}

const sigmoid = value => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));

function predictLinear(coefficients, features) {
  let logOdds = 0;
  for (let k = 0; k < coefficients.length; k++) logOdds += coefficients[k] * features[k];
  return sigmoid(logOdds);
}

// In-place Cholesky L*L^T solver for symmetric positive-definite Hessian (dim = 14)
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

// Damped Newton-Raphson / IRLS L2 Logistic Regression
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

// Pre-bin normalized [-1, +1] features into 6 histogram buckets once per bar -> 5x faster O(count) GBDT split finding!
const STUMP_THRESHOLDS = [-0.65, -0.25, 0.0, 0.25, 0.65];
const NUM_BINS = STUMP_THRESHOLDS.length + 1;

function binFeatureRow(feat) {
  if (!feat) return null;
  const dim = feat.length;
  const bins = new Uint8Array(dim);
  for (let k = 1; k < dim; k++) {
    const v = feat[k];
    let b = 0;
    while (b < STUMP_THRESHOLDS.length && v > STUMP_THRESHOLDS[b]) b++;
    bins[k] = b;
  }
  return bins;
}

function fitBoostedStumps(binnedFeatures, labels, first, last, { rounds = 8, lr = 0.20, lambda = 18 } = {}) {
  const count = last - first + 1;
  const dim = binnedFeatures[first].length;
  let ups = 0;
  for (let i = first; i <= last; i++) ups += labels[i];
  const base = (ups + 1) / (count + 2);
  const initScore = Math.log(base / (1 - base));
  const scores = new Float64Array(count).fill(initScore);
  const grads = new Float64Array(count);
  const hess = new Float64Array(count);
  const binG = new Float64Array(NUM_BINS);
  const binH = new Float64Array(NUM_BINS);
  const binN = new Int32Array(NUM_BINS);
  const featureUses = new Uint8Array(dim);
  const stumps = [];

  for (let round = 0; round < rounds; round++) {
    let totalG = 0;
    let totalH = 0;
    for (let idx = 0; idx < count; idx++) {
      const p = sigmoid(scores[idx]);
      const g = p - labels[first + idx];
      const h = Math.max(1e-5, p * (1 - p));
      grads[idx] = g;
      hess[idx] = h;
      totalG += g;
      totalH += h;
    }
    const parentGain = (totalG * totalG) / (totalH + lambda);
    let bestGain = 1e-5;
    let bestStump = null;

    for (let k = 1; k < dim; k++) {
      // Feature-diversity penalty prevents single-feature overfitting (e.g., chasing 1-bar noise)
      if (featureUses[k] >= 2) continue;
      const diversityDiscount = featureUses[k] === 0 ? 1 : 0.45;
      binG.fill(0);
      binH.fill(0);
      binN.fill(0);
      for (let idx = 0; idx < count; idx++) {
        const b = binnedFeatures[first + idx][k];
        binG[b] += grads[idx];
        binH[b] += hess[idx];
        binN[b]++;
      }
      let gL = 0, hL = 0, nL = 0;
      for (let tIdx = 0; tIdx < STUMP_THRESHOLDS.length; tIdx++) {
        gL += binG[tIdx];
        hL += binH[tIdx];
        nL += binN[tIdx];
        if (nL < 12 || count - nL < 12) continue;
        const gR = totalG - gL;
        const hR = totalH - hL;
        const gain = ((gL * gL) / (hL + lambda) + (gR * gR) / (hR + lambda) - parentGain) * diversityDiscount;
        if (gain > bestGain) {
          bestGain = gain;
          bestStump = {
            k,
            binMax: tIdx,
            thr: STUMP_THRESHOLDS[tIdx],
            leftVal: -lr * (gL / (hL + lambda)),
            rightVal: -lr * (gR / (hR + lambda)),
          };
        }
      }
    }
    if (!bestStump) break;
    featureUses[bestStump.k]++;
    stumps.push(bestStump);
    const { k: sk, binMax, leftVal, rightVal } = bestStump;
    for (let idx = 0; idx < count; idx++) {
      scores[idx] += binnedFeatures[first + idx][sk] <= binMax ? leftVal : rightVal;
    }
  }
  return { initScore, stumps };
}

function predictBoosted(model, binnedFeat) {
  let z = model.initScore;
  for (let i = 0; i < model.stumps.length; i++) {
    const s = model.stumps[i];
    z += binnedFeat[s.k] <= s.binMax ? s.leftVal : s.rightVal;
  }
  return sigmoid(z);
}

// Regime-Gated Multi-Feature Gaussian Analog Matcher (includes RSI elasticity, Hurst persistence, wick absorption & vol regime)
const ANALOG_DIMS = [
  [1, 1.45], [2, 1.25], [3, 1.0], [4, 0.9], [5, 1.1], [6, 1.1], [7, 0.85], [9, 0.75], [12, 0.85], [13, 0.85],
];

function kernelAnalogProbability(features, labels, first, last, queryFeat, baseline) {
  const inv2s2 = 1 / 0.95;
  let wSum = 0;
  let wUp = 0;
  for (let i = first; i <= last; i++) {
    const f = features[i];
    let d2 = 0;
    for (let d = 0; d < ANALOG_DIMS.length; d++) {
      const [k, wt] = ANALOG_DIMS[d];
      const diff = queryFeat[k] - f[k];
      d2 += wt * diff * diff;
    }
    const w = Math.exp(-d2 * inv2s2);
    wSum += w;
    wUp += w * labels[i];
  }
  return (wUp + 12 * baseline) / (wSum + 12);
}

function train(features, binnedFeatures, labels, rows, origin, horizon) {
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
  const recentBaseline = (recentUps + 1) / (last - recentStart + 3);
  const priorProb = 0.65 * baseline + 0.35 * recentBaseline;
  const hScale = Math.sqrt(Math.max(1, horizon / FORECAST_HORIZON));

  // Internal chronological holdout inside [first, last] for 100% shift-invariant causal expert stacking.
  const valSpan = Math.floor(count * 0.30);
  const innerValStart = last - valSpan + 1;
  const innerTrainEnd = innerValStart - horizon - EMBARGO;
  let expertWeights = [0.20, 0.32, 0.16, 0.18, 0.14];

  if (innerTrainEnd - first >= 75) {
    const innerFast = fitLogistic(features, labels, first, innerTrainEnd, 0.045 * hScale, 6);
    const innerReg = fitLogistic(features, labels, first, innerTrainEnd, 1.8 * hScale, 5);
    const innerGbdt = fitBoostedStumps(binnedFeatures, labels, first, innerTrainEnd, { rounds: 9, lr: 0.24, lambda: 10 * hScale });
    const losses = [0, 0, 0, 0, 0];
    let nVal = 0;
    for (let v = innerValStart; v <= last; v += horizon) {
      const y = labels[v];
      const fv = features[v];
      const bv = binnedFeatures[v];
      const pf = Math.max(0.01, Math.min(0.99, predictLinear(innerFast.coefficients, fv)));
      const pr = Math.max(0.01, Math.min(0.99, predictLinear(innerReg.coefficients, fv)));
      const pg = Math.max(0.01, Math.min(0.99, predictBoosted(innerGbdt, bv)));
      const pa = Math.max(0.01, Math.min(0.99, kernelAnalogProbability(features, labels, first, innerTrainEnd, fv, innerFast.base)));
      const pb = innerFast.base;
      losses[0] += (pf - y) ** 2;
      losses[1] += (pr - y) ** 2;
      losses[2] += (pg - y) ** 2;
      losses[3] += (pa - y) ** 2;
      losses[4] += (pb - y) ** 2;
      nVal++;
    }
    if (nVal >= 6) {
      const minLoss = Math.min(...losses);
      const priors = [0.85, 1.35, 1.15, 1.0, 1.40];
      const rawW = losses.map((loss, idx) => priors[idx] * Math.exp(-6.5 * (loss - minLoss)));
      const sumW = rawW.reduce((a, b) => a + b, 0);
      expertWeights = rawW.map(w => w / sumW);
    }
  }

  const fastFit = fitLogistic(features, labels, first, last, 0.045 * hScale, 7);
  const regFit = fitLogistic(features, labels, first, last, 1.8 * hScale, 6);
  const gbdtFit = fitBoostedStumps(binnedFeatures, labels, first, last, { rounds: 10, lr: 0.24, lambda: 10 * hScale });

  const fo = features[origin];
  const bo = binnedFeatures[origin];
  const pFast = Math.max(0.01, Math.min(0.99, predictLinear(fastFit.coefficients, fo)));
  const pReg = Math.max(0.01, Math.min(0.99, predictLinear(regFit.coefficients, fo)));
  const pGbdt = Math.max(0.01, Math.min(0.99, predictBoosted(gbdtFit, bo)));
  const pAnalog = Math.max(0.01, Math.min(0.99, kernelAnalogProbability(features, labels, first, last, fo, baseline)));

  const pMean =
    expertWeights[0] * pFast +
    expertWeights[1] * pReg +
    expertWeights[2] * pGbdt +
    expertWeights[3] * pAnalog +
    expertWeights[4] * priorProb;

  // Bayesian Epistemic Uncertainty Shrinkage: pulls conflicting expert estimates smoothly toward 0.50 while preserving full conviction when experts agree.
  const epistemicVar =
    expertWeights[0] * (pFast - pMean) ** 2 +
    expertWeights[1] * (pReg - pMean) ** 2 +
    expertWeights[2] * (pGbdt - pMean) ** 2 +
    expertWeights[3] * (pAnalog - pMean) ** 2 +
    expertWeights[4] * (priorProb - pMean) ** 2;
  const epistemicConfidence = 1 / (1 + 64 * epistemicVar);
  const rawProbability = Math.max(0.01, Math.min(0.99, 0.5 + (pMean - 0.5) * epistemicConfidence));

  const linearShare = Math.max(1e-6, expertWeights[0] + expertWeights[1]);
  const blendedCoeff = new Float64Array(fastFit.coefficients.length);
  for (let k = 0; k < blendedCoeff.length; k++) {
    blendedCoeff[k] = (expertWeights[0] * fastFit.coefficients[k] + expertWeights[1] * regFit.coefficients[k]) / linearShare;
  }
  const gbdtContrib = new Float64Array(fastFit.coefficients.length);
  for (const s of gbdtFit.stumps) {
    gbdtContrib[s.k] += (bo[s.k] <= s.binMax ? s.leftVal : s.rightVal) * expertWeights[2];
  }

  const move = Math.sign(rows[origin].close - rows[origin - 1].close);
  return {
    count, trainedThrough, rawProbability,
    coefficients: blendedCoeff,
    gbdtContrib,
    expertWeights,
    expertProbabilities: { fast: pFast, reg: pReg, gbdt: pGbdt, analog: pAnalog, base: priorProb },
    first, last,
    baselineProbability: baseline,
    recentBaselineProbability: recentBaseline,
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
  const blocks = Array.from({ length: BLOCKS }, () => ({ count: 0, modelLoss: 0, baselineLoss: 0 }));
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
    blocks: blocks.map(block => ({
      count: block.count,
      modelBrier: block.count ? block.modelLoss / block.count : null,
      baselineBrier: block.count ? block.baselineLoss / block.count : null,
    })),
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

function weightedQuantile(pairs, q) {
  if (!pairs.length) return null;
  const sorted = [...pairs].sort((a, b) => a.r - b.r);
  const totalW = sorted.reduce((s, x) => s + x.w, 0);
  if (!(totalW > 0)) return sorted[Math.floor(sorted.length / 2)].r;
  let acc = 0;
  for (const item of sorted) {
    acc += item.w / totalW;
    if (acc >= q) return item.r;
  }
  return sorted.at(-1).r;
}

function historicalScenarios(origins) {
  const returns = origins.map(row => row.actualReturn).filter(Number.isFinite).sort((a, b) => a - b);
  const count = returns.length;
  if (count < MIN_HOLDOUT_ORIGINS) return null;
  const up = returns.filter(value => value > 0).length;
  const down = returns.filter(value => value < 0).length;
  return { count, lower: quantile(returns, 0.1), median: quantile(returns, 0.5), upper: quantile(returns, 0.9), up, down, flat: count - up - down };
}

function marketRegime(rows, horizon, queryFeat) {
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
  const hurstTilt = queryFeat?.[7] ?? 0;
  const dynamics = hurstTilt >= 0.18 ? 'Persistent / trending'
    : hurstTilt <= -0.18 ? 'Mean-reverting / choppy'
    : 'Transitional';
  const exhaustion = queryFeat?.[6] ?? 0;
  const stretch = exhaustion <= -0.45 ? 'Oversold stretch (rebound risk)'
    : exhaustion >= 0.45 ? 'Overbought stretch (pullback risk)'
    : 'Balanced momentum';
  const recent20 = recent.slice(-20);
  const rangeHigh = Math.max(...recent20.map(bar => bar.high));
  const rangeLow = Math.min(...recent20.map(bar => bar.low));
  const horizonMoveScalePct = atrPct * Math.sqrt(horizon);
  return {
    structure, volatility, volRatio, atr: currentAtr, atrPct, horizonMoveScalePct,
    dynamics, hurstTilt, stretch,
    supportLevel: rangeLow, resistanceLevel: rangeHigh,
    atrSupport: Math.max(0, lastClose - 1.5 * currentAtr),
    atrResistance: lastClose + 1.5 * currentAtr,
  };
}

function featureDrivers(coefficients, gbdtContrib, featureRow) {
  if (!coefficients || !featureRow) return [];
  return FEATURE_META.map((meta, index) => {
    const k = index + 1;
    const value = featureRow[k];
    const linearPush = coefficients[k] * value;
    const treePush = gbdtContrib ? gbdtContrib[k] : 0;
    const contribution = linearPush + treePush;
    return {
      id: meta.id, label: meta.label, value, contribution,
      direction: contribution > 0.006 ? 'up' : contribution < -0.006 ? 'down' : 'neutral',
    };
  }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

function historicalAnalogs(features, rows, first, last, query, horizon, step) {
  const q = features[query];
  if (!q || last < first) return null;
  const scored = [];
  for (let i = first; i <= last; i++) {
    const f = features[i];
    if (!f) continue;
    let d2 = 0;
    for (let d = 0; d < ANALOG_DIMS.length; d++) {
      const [k, wt] = ANALOG_DIMS[d];
      const diff = q[k] - f[k];
      d2 += wt * diff * diff;
    }
    const fwd = rows[i + horizon].close / rows[i].close - 1;
    if (!Number.isFinite(fwd)) continue;
    scored.push({ index: i, d2, sim: Math.exp(-d2 / 2.6), fwd, originClose: rows[i].close, targetClose: rows[i + horizon].close, asOf: rows[i].time + step });
  }
  scored.sort((a, b) => a.d2 - b.d2);
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
    samples: selected.map(s => ({ r: s.fwd, w: Math.max(0.05, s.sim) })),
    topMatches: selected.slice(0, 4).map(m => ({
      asOf: m.asOf,
      similarityPct: Math.round(m.sim * 100),
      forwardReturn: m.fwd,
      originClose: m.originClose,
      targetClose: m.targetClose,
    })),
  };
}

/**
 * Probability-consistent importance-weighted quantile corridor:
 * Eliminates the classic contradiction where "Bearish 40%" showed a green "+0.04% base target".
 */
function probabilityConsistentCorridor({ currentClose, probabilityUp, analogs, scenarios, origins, horizon }) {
  const rawSamples = analogs?.samples?.length
    ? analogs.samples
    : (origins?.length ? origins.filter(o => Number.isFinite(o.actualReturn)).map(o => ({ r: o.actualReturn, w: 1 })) : []);

  if (!rawSamples.length && !scenarios) return null;

  let p10, p25, p50, p75, p90, expectedReturn, avgUp, avgDown;
  if (rawSamples.length >= 8) {
    const upSamples = rawSamples.filter(s => s.r > 0);
    const dnSamples = rawSamples.filter(s => s.r <= 0);
    const wUpTot = upSamples.reduce((s, x) => s + x.w, 0);
    const wDnTot = dnSamples.reduce((s, x) => s + x.w, 0);
    avgUp = wUpTot > 0 ? upSamples.reduce((s, x) => s + x.r * x.w, 0) / wUpTot : 0;
    avgDown = wDnTot > 0 ? dnSamples.reduce((s, x) => s + x.r * x.w, 0) / wDnTot : 0;

    // Importance-reweight the empirical return distribution so its probability mass matches calibrated probabilityUp!
    const tilted = [];
    if (wUpTot > 0 && wDnTot > 0) {
      for (const s of upSamples) tilted.push({ r: s.r, w: (s.w / wUpTot) * probabilityUp });
      for (const s of dnSamples) tilted.push({ r: s.r, w: (s.w / wDnTot) * (1 - probabilityUp) });
    } else {
      for (const s of rawSamples) tilted.push(s);
    }
    p10 = weightedQuantile(tilted, 0.10);
    p25 = weightedQuantile(tilted, 0.25);
    p50 = weightedQuantile(tilted, 0.50);
    p75 = weightedQuantile(tilted, 0.75);
    p90 = weightedQuantile(tilted, 0.90);
    expectedReturn = wUpTot > 0 && wDnTot > 0
      ? probabilityUp * avgUp + (1 - probabilityUp) * avgDown
      : rawSamples.reduce((s, x) => s + x.r * x.w, 0) / rawSamples.reduce((s, x) => s + x.w, 0);
  } else {
    p10 = scenarios.lower;
    p25 = scenarios.lower * 0.5;
    p50 = scenarios.median;
    p75 = scenarios.upper * 0.5;
    p90 = scenarios.upper;
    expectedReturn = p50;
    avgUp = Math.max(0, p75);
    avgDown = Math.min(0, p25);
  }

  const priceAt = r => Number.isFinite(r) ? Math.max(0, currentClose * (1 + r)) : null;
  const skewRatio = Math.abs(avgDown) > 1e-6 ? Math.abs(avgUp) / Math.abs(avgDown) : null;

  // Build smooth sqrt(t)-scaled multi-step trajectory curve from bar 0 -> horizon for visual fan chart
  const steps = Math.min(12, Math.max(4, horizon));
  const trajectory = [];
  for (let s = 0; s <= steps; s++) {
    const frac = s / steps;
    const volScale = Math.sqrt(frac);
    const driftScale = frac;
    const baseR = p50 * driftScale;
    const bearR = baseR + (p25 - p50) * volScale;
    const bullR = baseR + (p75 - p50) * volScale;
    const wideLoR = baseR + (p10 - p50) * volScale;
    const wideHiR = baseR + (p90 - p50) * volScale;
    trajectory.push({
      step: Math.round(frac * horizon),
      bear: priceAt(bearR),
      base: priceAt(baseR),
      bull: priceAt(bullR),
      wideLow: priceAt(wideLoR),
      wideHigh: priceAt(wideHiR),
    });
  }

  return {
    source: analogs
      ? `Probability-weighted distribution across ${analogs.count} closest regime analogs`
      : `Probability-weighted distribution across ${scenarios.count} walk-forward windows`,
    bearPrice: priceAt(p25), bearPct: p25 * 100,
    basePrice: priceAt(p50), basePct: p50 * 100,
    bullPrice: priceAt(p75), bullPct: p75 * 100,
    wideLowPrice: priceAt(p10), wideHighPrice: priceAt(p90),
    expectedReturnPct: expectedReturn * 100,
    avgUpPct: avgUp * 100,
    avgDownPct: avgDown * 100,
    skewRatio,
    trajectory,
  };
}

function buildProjection({ currentClose, probabilityUp, verifiedCall, fitted, drivers, regime, analogs, scenarios, evidence, horizon, interval }) {
  if (!Number.isFinite(currentClose) || currentClose <= 0) return null;
  const corridor = probabilityConsistentCorridor({
    currentClose, probabilityUp, analogs, scenarios, origins: evidence?.origins, horizon,
  });

  // Ensure lean label, probability, and expected return never contradict each other
  const expPct = corridor?.expectedReturnPct ?? 0;
  const lean = probabilityUp >= 0.56 ? 'Bullish directional edge'
    : probabilityUp >= 0.53 && expPct >= 0 ? 'Modest upside lean'
    : probabilityUp <= 0.44 ? 'Bearish directional edge'
    : probabilityUp <= 0.47 && expPct <= 0 ? 'Modest downside lean'
    : 'Balanced / two-sided range';
  const leanTone = probabilityUp >= 0.53 && expPct >= -0.05 ? 'up'
    : probabilityUp <= 0.47 && expPct <= 0.05 ? 'down'
    : 'neutral';

  // Expert consensus dispersion (agreement across the 5 distinct models)
  const probs = Object.values(fitted.expertProbabilities).filter(Number.isFinite);
  const upVotes = probs.filter(p => p > 0.52).length;
  const downVotes = probs.filter(p => p < 0.48).length;
  const spread = probs.length ? (Math.max(...probs) - Math.min(...probs)) * 100 : 0;
  const agreement = spread <= 8 ? 'High consensus' : spread <= 16 ? 'Moderate consensus' : 'Split experts';

  const reasons = [];
  const activeDrivers = drivers.filter(d => d.direction !== 'neutral').slice(0, 3);
  if (activeDrivers.length) {
    const desc = activeDrivers.map(d => `${d.label.toLowerCase()} (${d.direction === 'up' ? 'supports upside' : 'weighs on upside'})`).join(', ');
    reasons.push(`Primary causal model drivers learned on this coin: ${desc}.`);
  } else {
    reasons.push('Multi-scale momentum, RSI exhaustion elasticity, Hurst regime, and volume flow show balanced forces.');
  }
  if (corridor) {
    const expStr = `${corridor.expectedReturnPct >= 0 ? '+' : ''}${corridor.expectedReturnPct.toFixed(2)}%`;
    const skewStr = corridor.skewRatio !== null ? ` (upside/downside payoff ratio ${corridor.skewRatio.toFixed(2)}×)` : '';
    reasons.push(`Probability-weighted expected move over ${horizon} ${interval} bars is ${expStr}${skewStr}, with interquartile corridor ${corridor.bearPct.toFixed(2)}% to ${corridor.bullPct >= 0 ? '+' : ''}${corridor.bullPct.toFixed(2)}%.`);
  }
  if (regime) {
    reasons.push(`Regime diagnostics: ${regime.structure.toLowerCase()} structure, ${regime.dynamics.toLowerCase()} dynamics (Hurst tilt ${regime.hurstTilt >= 0 ? '+' : ''}${regime.hurstTilt.toFixed(2)}), ${regime.stretch.toLowerCase()}, and ${regime.volatility.toLowerCase()} volatility (ATR ${regime.atrPct.toFixed(2)}%/bar).`);
  }
  if (analogs) {
    reasons.push(`Across the ${analogs.count} closest regime-matched past episodes, ${Math.round(analogs.upRate * 100)}% finished higher after ${horizon} ${interval} bars (raw analog median ${analogs.medianReturn >= 0 ? '+' : ''}${(analogs.medianReturn * 100).toFixed(2)}%).`);
  }
  if (evidence) {
    const skillPct = (evidence.brierSkill * 100).toFixed(1);
    if (verifiedCall) {
      reasons.push(`Passed all 5 strict walk-forward validation gates across ${evidence.count} non-overlapping tests (${evidence.brierSkill >= 0 ? '+' : ''}${skillPct}% Brier skill vs ${evidence.strongestBaseline.label.toLowerCase()}).`);
    } else {
      const missed = Object.entries(evidence.checks).filter(([, ok]) => !ok).map(([k]) => ({
        sample: 'sample size', bothOutcomes: 'class balance', brierGain: 'Brier edge', accuracy: 'accuracy parity', stability: 'recent block stability',
      }[k] ?? k));
      reasons.push(`Probabilistic context (not a verified call): walk-forward validation missed ${missed.length ? missed.join(' & ') : 'directional confidence threshold'} against ${evidence.strongestBaseline.label.toLowerCase()}.`);
    }
  }

  const expertWeights = EXPERT_LABELS.map((meta, idx) => ({
    id: meta.id, label: meta.label,
    weightPct: Math.round((fitted.expertWeights[idx] ?? 0) * 100),
    probabilityUp: fitted.expertProbabilities[meta.id],
  }));

  return {
    currentClose, lean, leanTone, verifiedCall, probabilityUp, corridor, reasons, expertWeights,
    consensus: { agreement, upVotes, downVotes, total: probs.length, spreadPct: spread },
    invalidation: regime ? {
      supportLevel: regime.supportLevel,
      resistanceLevel: regime.resistanceLevel,
      atrSupport: regime.atrSupport,
      atrResistance: regime.atrResistance,
    } : null,
  };
}

function evaluateHorizon({ rows, features, binnedFeatures, instrument, interval, step, nowSeconds, stale, validationReason, gap, incompleteHistory }, horizon) {
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
    } = train(features, binnedFeatures, labels, rows, i, horizon);
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

  const fitted = train(features, binnedFeatures, labels, rows, query, horizon);
  result.evidence = { ...scoreOrigins(origins, fitted.count), calibrationOrigins };
  result.scenarios = historicalScenarios(origins);
  result.regime = marketRegime(rows, horizon, features[query]);
  result.drivers = featureDrivers(fitted.coefficients, fitted.gbdtContrib, features[query]);
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
  const binnedFeatures = features.map(binFeatureRow);
  const context = {
    rows, features, binnedFeatures, instrument, interval, step, nowSeconds, stale, validationReason, gap,
    incompleteHistory: incompleteHistory || Number.isSafeInteger(requiredWindowCount) && rows.length < requiredWindowCount,
  };
  const selected = validForecastHorizon(horizon) ? horizon : FORECAST_HORIZON;
  const requested = singleHorizon ? [selected] : [...new Set([...FORECAST_HORIZONS, selected])];
  const horizons = Object.fromEntries(requested.map(length => [length, evaluateHorizon(context, length)]));
  return { ...horizons[selected], horizons };
}
