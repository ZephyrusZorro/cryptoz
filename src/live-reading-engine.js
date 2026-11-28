import { atr, bollinger, ema, macd, rsi, sma } from './analytics.js';
import { adxSeries } from './studies.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function formatCountdown(secondsLeft) {
  if (!Number.isFinite(secondsLeft) || secondsLeft <= 0) return 'closing';
  const total = Math.max(1, Math.round(secondsLeft));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours >= 1) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes >= 1) return `${minutes}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

function detectRsiDivergence(sample, rsiValues) {
  const highPivots = [];
  const lowPivots = [];
  for (let i = 16; i < sample.length - 2; i++) {
    const r = rsiValues[i];
    if (!Number.isFinite(r)) continue;
    const b = sample[i];
    const neighbors = [sample[i - 2], sample[i - 1], sample[i + 1], sample[i + 2]];
    if (neighbors.every(o => b.high > o.high)) highPivots.push({ price: b.high, rsi: r, index: i });
    if (neighbors.every(o => b.low < o.low)) lowPivots.push({ price: b.low, rsi: r, index: i });
  }
  const lastTwoHighs = highPivots.slice(-2);
  if (lastTwoHighs.length === 2 && lastTwoHighs[1].price > lastTwoHighs[0].price && lastTwoHighs[1].rsi < lastTwoHighs[0].rsi - 3) {
    return { kind: 'bearish', label: 'Bearish RSI divergence', detail: 'Higher swing high paired with lower RSI peak — upward momentum is waning.' };
  }
  const lastTwoLows = lowPivots.slice(-2);
  if (lastTwoLows.length === 2 && lastTwoLows[1].price < lastTwoLows[0].price && lastTwoLows[1].rsi > lastTwoLows[0].rsi + 3) {
    return { kind: 'bullish', label: 'Bullish RSI divergence', detail: 'Lower swing low paired with higher RSI trough — downward pressure is fading.' };
  }
  return null;
}

function extractSwingPivots(sample) {
  const highs = [];
  const lows = [];
  for (let i = 2; i < sample.length - 2; i++) {
    const b = sample[i];
    if (b.high > sample[i - 1].high && b.high >= sample[i - 2].high && b.high > sample[i + 1].high && b.high >= sample[i + 2].high) {
      highs.push({ price: b.high, index: i, age: sample.length - 1 - i, label: 'Swing high' });
    }
    if (b.low < sample[i - 1].low && b.low <= sample[i - 2].low && b.low < sample[i + 1].low && b.low <= sample[i + 2].low) {
      lows.push({ price: b.low, index: i, age: sample.length - 1 - i, label: 'Swing low' });
    }
  }
  return { highs, lows };
}

function computeWilderState(sample, period = 14) {
  const n = sample.length;
  // Wilder RSI registers (exact match to analytics.js rsi())
  let avgGain = 0;
  let avgLoss = 0;
  if (n > period) {
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
      const d = sample[i].close - sample[i - 1].close;
      if (d > 0) gains += d;
      else losses -= d;
    }
    avgGain = gains / period;
    avgLoss = losses / period;
    for (let i = period + 1; i < n; i++) {
      const d = sample[i].close - sample[i - 1].close;
      avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    }
  }

  // Wilder ATR + ADX / DI registers (exact match to studies.js adxSeries())
  let trSmooth = null;
  let plusSmooth = null;
  let minusSmooth = null;
  let adxSmooth = null;
  if (n > period * 2) {
    let trSum = 0;
    let pSum = 0;
    let mSum = 0;
    for (let i = 1; i <= period; i++) {
      const h = sample[i].high;
      const l = sample[i].low;
      const pc = sample[i - 1].close;
      const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
      const up = h - sample[i - 1].high;
      const dn = sample[i - 1].low - l;
      trSum += tr;
      pSum += up > dn && up > 0 ? up : 0;
      mSum += dn > up && dn > 0 ? dn : 0;
    }
    trSmooth = trSum;
    plusSmooth = pSum;
    minusSmooth = mSum;
    const dxList = [];
    const pushDx = () => {
      const pdi = trSmooth > 0 ? (100 * plusSmooth) / trSmooth : 0;
      const mdi = trSmooth > 0 ? (100 * minusSmooth) / trSmooth : 0;
      const sum = pdi + mdi;
      dxList.push(sum > 0 ? (100 * Math.abs(pdi - mdi)) / sum : 0);
    };
    pushDx();
    for (let i = period + 1; i < n; i++) {
      const h = sample[i].high;
      const l = sample[i].low;
      const pc = sample[i - 1].close;
      const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
      const up = h - sample[i - 1].high;
      const dn = sample[i - 1].low - l;
      trSmooth = trSmooth - trSmooth / period + tr;
      plusSmooth = plusSmooth - plusSmooth / period + (up > dn && up > 0 ? up : 0);
      minusSmooth = minusSmooth - minusSmooth / period + (dn > up && dn > 0 ? dn : 0);
      pushDx();
    }
    if (dxList.length >= period) {
      adxSmooth = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
      for (let i = period; i < dxList.length; i++) {
        adxSmooth = (adxSmooth * (period - 1) + dxList[i]) / period;
      }
    }
  }

  return { avgGain, avgLoss, trSmooth, plusSmooth, minusSmooth, adxSmooth };
}

const stateCache = new Map();
const STATE_CACHE_MAX = 24;

function cacheKeyFor(sample, duration) {
  const first = sample[0];
  const last = sample[sample.length - 1];
  return `${duration}:${sample.length}:${first.time}:${last.time}:${last.close}:${last.high}:${last.low}:${last.volume}`;
}

/**
 * Tier A: Compile immutable O(N) closed-bar recursive registers once per candle close.
 * Subsequent live ticks evaluate in O(1) without rescanning historical bars.
 */
export function compileClosedState(sample, duration) {
  const key = cacheKeyFor(sample, duration);
  const cached = stateCache.get(key);
  if (cached) return cached;

  const n = sample.length;
  const last = sample[n - 1];
  const closes = sample.map(b => b.close);

  const sma20Arr = sma(closes, 20);
  const sma50Arr = sma(closes, 50);
  const ema9Arr = ema(closes, 9);
  const ema12Arr = ema(closes, 12);
  const ema20Arr = ema(closes, 20);
  const ema26Arr = ema(closes, 26);
  const rsiArr = rsi(closes, 14);
  const atrArr = atr(sample, 14);
  const macdObj = macd(closes);
  const adxObj = adxSeries(sample, 14);
  const bb = bollinger(closes, 20, 2);

  const bbwSeries = bb.middle
    .map((m, i) => (m > 0 && Number.isFinite(bb.upper[i]) ? ((bb.upper[i] - bb.lower[i]) / m) * 100 : null))
    .filter(Number.isFinite);
  const bbwNow = bbwSeries.at(-1) ?? null;
  const bbwSorted = [...bbwSeries].sort((a, b) => a - b);
  const bbwQuartile = bbwSorted.length >= 8 ? bbwSorted[Math.floor(bbwSorted.length * 0.25)] : null;

  // Prefix/suffix sums for exact O(1) rolling SMA20, SMA50, shifted BB20 (zero cancellation at $100k+ BTC!), VWAP20, OBV10
  const varShift = last.close;
  let sumClose19 = 0;
  let sumShift19 = 0;
  let sumShift19Sq = 0;
  let vwapNum19 = 0;
  let vwapDen19 = 0;
  let recentHigh19 = -Infinity;
  let recentLow19 = Infinity;
  for (let i = Math.max(0, n - 19); i < n; i++) {
    const b = sample[i];
    sumClose19 += b.close;
    const ds = b.close - varShift;
    sumShift19 += ds;
    sumShift19Sq += ds * ds;
    const typical = (b.high + b.low + b.close) / 3;
    vwapNum19 += typical * b.volume;
    vwapDen19 += b.volume;
    if (b.high > recentHigh19) recentHigh19 = b.high;
    if (b.low < recentLow19) recentLow19 = b.low;
  }

  let sumClose49 = 0;
  for (let i = Math.max(0, n - 49); i < n; i++) sumClose49 += sample[i].close;

  let recentHigh6 = -Infinity;
  let recentLow6 = Infinity;
  for (let i = Math.max(0, n - 6); i < n; i++) {
    if (sample[i].high > recentHigh6) recentHigh6 = sample[i].high;
    if (sample[i].low < recentLow6) recentLow6 = sample[i].low;
  }

  // 20-bar closed range & 20-bar average volume
  const recent20 = sample.slice(-20);
  const closedRangeHigh = Math.max(...recent20.map(b => b.high));
  const closedRangeLow = Math.min(...recent20.map(b => b.low));
  const volAvg20 = recent20.reduce((sum, b) => sum + b.volume, 0) / recent20.length;

  // 10-bar OBV state (last 9 closed transitions + 10 closed transitions)
  let obvDelta10 = 0;
  let totalVol10 = 0;
  for (let i = n - 10; i < n; i++) {
    obvDelta10 += Math.sign(sample[i].close - sample[i - 1].close) * sample[i].volume;
    totalVol10 += sample[i].volume;
  }
  let obvDelta9 = 0;
  let totalVol9 = 0;
  for (let i = n - 9; i < n; i++) {
    obvDelta9 += Math.sign(sample[i].close - sample[i - 1].close) * sample[i].volume;
    totalVol9 += sample[i].volume;
  }

  const closedVwapNum = vwapNum19 + ((sample[n - 20].high + sample[n - 20].low + sample[n - 20].close) / 3) * sample[n - 20].volume;
  const closedVwapDen = vwapDen19 + sample[n - 20].volume;
  const closedVwap20 = closedVwapDen > 0 ? closedVwapNum / closedVwapDen : last.close;

  const wilder = computeWilderState(sample, 14);
  const pivots = extractSwingPivots(sample);
  const divergence = detectRsiDivergence(sample, rsiArr);

  const compiled = {
    key,
    duration,
    closedAt: last.time + duration,
    lastBar: last,
    close10Ago: sample[n - 11].close,
    close9Ago: sample[n - 10].close,
    closed: {
      close: last.close,
      sma20: sma20Arr.at(-1),
      sma50: sma50Arr.at(-1),
      ema9: ema9Arr.at(-1),
      ema12: ema12Arr.at(-1),
      ema20: ema20Arr.at(-1),
      ema26: ema26Arr.at(-1),
      rsi: rsiArr.at(-1),
      atr: atrArr.at(-1),
      macdLine: macdObj.line.at(-1),
      macdSignal: macdObj.signal.at(-1),
      macdHist: macdObj.histogram.at(-1),
      macdPrev: macdObj.histogram.at(-2),
      adx: adxObj.adx.at(-1),
      plusDI: adxObj.plusDI.at(-1),
      minusDI: adxObj.minusDI.at(-1),
      bbUpper: bb.upper.at(-1),
      bbLower: bb.lower.at(-1),
      bbw: bbwNow,
      vwap20: closedVwap20,
      obvFlowRatio: totalVol10 > 0 ? obvDelta10 / totalVol10 : null,
      rangeHigh: closedRangeHigh,
      rangeLow: closedRangeLow,
    },
    registers: {
      varShift,
      sumClose19,
      sumShift19,
      sumShift19Sq,
      sumClose49,
      vwapNum19,
      vwapDen19,
      recentHigh19,
      recentLow19,
      recentHigh6,
      recentLow6,
      volAvg20,
      obvDelta9,
      totalVol9,
      bbwQuartile,
      wilder,
    },
    pivots,
    divergence,
  };

  if (stateCache.size >= STATE_CACHE_MAX) {
    const oldest = stateCache.keys().next().value;
    stateCache.delete(oldest);
  }
  stateCache.set(key, compiled);
  return compiled;
}

/**
 * Compute continuous conviction score (-100 to +100) from indicator state so
 * intraday moves produce immediate, smooth, legible conviction shifts.
 */
function computeConviction({
  close, ema9, sma20, sma50, adx, plusDI, minusDI,
  macdHist, macdPrev, atrVal, rsiVal, obvFlowRatio,
  vwap20, barChangePct, closePosInBar,
}) {
  const safeAtr = Math.max(atrVal || 0, close * 0.002, 1e-9);

  // 1. MA structure & slope (±24)
  let maPts = 0;
  if (Number.isFinite(sma20) && Number.isFinite(sma50)) {
    const d20 = clamp((close - sma20) / (safeAtr * 2.2), -1, 1);
    const d50 = clamp((close - sma50) / (safeAtr * 3.5), -1, 1);
    const spread = clamp((sma20 - sma50) / (safeAtr * 2.5), -1, 1);
    const d9 = Number.isFinite(ema9) ? clamp((close - ema9) / (safeAtr * 1.4), -1, 1) : d20;
    maPts = (d9 * 0.30 + d20 * 0.32 + d50 * 0.18 + spread * 0.20) * 24;
  }

  // 2. ADX / DI directional dominance (±18)
  let adxPts = 0;
  if (Number.isFinite(adx) && Number.isFinite(plusDI) && Number.isFinite(minusDI)) {
    const diSum = plusDI + minusDI;
    const diBias = diSum > 0 ? (plusDI - minusDI) / diSum : 0;
    const strengthWeight = clamp((adx - 10) / 30, 0.2, 1);
    adxPts = diBias * strengthWeight * 18;
  }

  // 3. MACD level + acceleration (±16)
  let macdPts = 0;
  if (Number.isFinite(macdHist)) {
    const level = clamp(macdHist / (safeAtr * 0.45), -1, 1);
    const slope = Number.isFinite(macdPrev) ? clamp((macdHist - macdPrev) / (safeAtr * 0.22), -1, 1) : 0;
    macdPts = (level * 0.55 + slope * 0.45) * 16;
  }

  // 4. RSI momentum (±16)
  let rsiPts = 0;
  if (Number.isFinite(rsiVal)) {
    // Centered at 50, saturates softly near 78 / 22 so oversold exhaustion moderates extreme drag
    const raw = clamp((rsiVal - 50) / 24, -1, 1);
    const exhaust = rsiVal > 76 ? -(rsiVal - 76) / 35 : rsiVal < 24 ? (24 - rsiVal) / 35 : 0;
    rsiPts = clamp(raw + exhaust * 0.35, -1, 1) * 16;
  }

  // 5. OBV volume flow (±12)
  const obvPts = Number.isFinite(obvFlowRatio) ? clamp(obvFlowRatio / 0.45, -1, 1) * 12 : 0;

  // 6. Live candle & VWAP pressure (±14)
  const vwapDist = Number.isFinite(vwap20) && vwap20 > 0 ? clamp((close - vwap20) / (safeAtr * 2.0), -1, 1) : 0;
  const barImpulse = Number.isFinite(barChangePct) ? clamp((barChangePct / 100 * close) / (safeAtr * 1.1), -1, 1) : 0;
  const barPos = Number.isFinite(closePosInBar) ? (closePosInBar - 0.5) * 2 : 0;
  const tapePts = (vwapDist * 0.45 + barImpulse * 0.35 + barPos * 0.20) * 14;

  return Math.round(clamp(maPts + adxPts + macdPts + rsiPts + obvPts + tapePts, -100, 100));
}

function classifyTapeAction(bar, atrVal) {
  const span = Math.max(bar.high - bar.low, 1e-12);
  const body = bar.close - bar.open;
  const absBody = Math.abs(body);
  const bodyRatio = absBody / span;
  const upperWick = (bar.high - Math.max(bar.open, bar.close)) / span;
  const lowerWick = (Math.min(bar.open, bar.close) - bar.low) / span;
  const closePos = (bar.close - bar.low) / span;
  const changePct = bar.open > 0 ? (body / bar.open) * 100 : 0;
  const expansion = atrVal > 0 ? span / atrVal : 0;

  let label = 'Balanced rotation';
  let tone = 'neutral';
  if (expansion >= 0.85 && bodyRatio >= 0.55) {
    label = body >= 0 ? 'Bullish expansion bar' : 'Bearish impulse bar';
    tone = body >= 0 ? 'up' : 'down';
  } else if (lowerWick >= 0.48 && closePos >= 0.58) {
    label = 'Lower-wick bid absorption';
    tone = 'up';
  } else if (upperWick >= 0.48 && closePos <= 0.42) {
    label = 'Upper-wick supply rejection';
    tone = 'down';
  } else if (body > 0 && (changePct >= 0.35 || bodyRatio >= 0.52)) {
    label = 'Active buying pressure';
    tone = 'up';
  } else if (body < 0 && (changePct <= -0.35 || bodyRatio >= 0.52)) {
    label = 'Active selling pressure';
    tone = 'down';
  } else if (expansion < 0.32) {
    label = 'Quiet range compression';
    tone = 'neutral';
  }

  return { label, tone, changePct, bodyRatio, upperWick, lowerWick, closePos, expansion };
}

/**
 * Select actionable, non-frozen nearest structural triggers above and below live price.
 * Avoids locking triggers to a stale 20-day high/low that is 30% away while price moves intraday.
 */
function resolveAdaptiveLevels({ spot, liveAtr, closedState, liveMetrics, rangeHigh, rangeLow }) {
  const minBuffer = Math.max(liveAtr * 0.35, spot * 0.0025);
  const idealMax = Math.max(liveAtr * 4.2, spot * 0.08);
  const upCandidates = [];
  const downCandidates = [];

  const pushCandidate = (price, label, priority, { flippedUpLabel = label, flippedDownLabel = label } = {}) => {
    if (!Number.isFinite(price) || price <= 0) return;
    if (price >= spot + minBuffer) upCandidates.push({ price, label: flippedUpLabel, priority, dist: price - spot });
    else if (price <= spot - minBuffer) downCandidates.push({ price, label: flippedDownLabel, priority, dist: spot - price });
  };

  // Structural pivots (most recent first, with polarity-flip labels when broken S/R acts on the opposite side!)
  for (const p of closedState.pivots.highs.slice(-4)) pushCandidate(p.price, 'Swing high', 1.0, { flippedDownLabel: 'Prior high (R→S)' });
  for (const p of closedState.pivots.lows.slice(-4)) pushCandidate(p.price, 'Swing low', 1.0, { flippedUpLabel: 'Prior low (S→R)' });

  // Recent 7-bar micro-structure (tracks short-term shifts on 1d/4h!)
  const microHigh = Math.max(closedState.registers.recentHigh6, liveMetrics.barHigh ?? -Infinity);
  const microLow = Math.min(closedState.registers.recentLow6, liveMetrics.barLow ?? Infinity);
  pushCandidate(microHigh, '7-bar high', 1.08);
  pushCandidate(microLow, '7-bar low', 1.08);

  // Dynamic moving levels (update on every tick!)
  pushCandidate(liveMetrics.ema20, 'EMA 20', 1.15);
  pushCandidate(liveMetrics.sma20, 'SMA 20', 1.18);
  pushCandidate(liveMetrics.vwap20, '20-bar VWAP', 1.14);
  pushCandidate(liveMetrics.sma50, 'SMA 50', 1.25);
  pushCandidate(liveMetrics.bbUpper, 'Upper BB', 1.22);
  pushCandidate(liveMetrics.bbLower, 'Lower BB', 1.22);

  // 20-bar boundaries always included as fallback ceiling/floor
  pushCandidate(rangeHigh, '20-bar high', 1.3);
  pushCandidate(rangeLow, '20-bar low', 1.3);

  const pickBest = (list, fallbackPrice, fallbackLabel) => {
    if (!list.length) return { price: fallbackPrice, label: fallbackLabel, dist: Math.abs(fallbackPrice - spot) };
    // Prefer candidates within reachable volatility distance; among those pick nearest weighted by structural quality
    const reachable = list.filter(c => c.dist <= idealMax);
    const pool = reachable.length ? reachable : list;
    pool.sort((a, b) => (a.dist * a.priority) - (b.dist * b.priority));
    return pool[0];
  };

  const up = pickBest(upCandidates, Math.max(rangeHigh, spot + liveAtr * 0.75), '20-bar high');
  const down = pickBest(downCandidates, Math.max(0, Math.min(rangeLow, spot - liveAtr * 0.75)), '20-bar low');

  // Target: measured +1.5x ATR beyond trigger, or snap toward next further structural resistance/support if nearby
  const rawUpTarget = up.price + 1.5 * liveAtr;
  const rawDownTarget = Math.max(0, down.price - 1.5 * liveAtr);

  // Detect live active breakout/breakdown against prior closed 7-bar or 20-bar range
  let activeBreach = null;
  if (spot > closedState.closed.rangeHigh) {
    activeBreach = { kind: 'up', level: closedState.closed.rangeHigh, label: '20-bar high', pct: ((spot / closedState.closed.rangeHigh) - 1) * 100 };
  } else if (spot < closedState.closed.rangeLow) {
    activeBreach = { kind: 'down', level: closedState.closed.rangeLow, label: '20-bar low', pct: ((spot / closedState.closed.rangeLow) - 1) * 100 };
  } else if (spot > closedState.registers.recentHigh6) {
    activeBreach = { kind: 'up', level: closedState.registers.recentHigh6, label: '7-bar high', pct: ((spot / closedState.registers.recentHigh6) - 1) * 100 };
  } else if (spot < closedState.registers.recentLow6) {
    activeBreach = { kind: 'down', level: closedState.registers.recentLow6, label: '7-bar low', pct: ((spot / closedState.registers.recentLow6) - 1) * 100 };
  }

  return {
    upsideTrigger: up.price,
    upsideLabel: up.label,
    upsideDistPct: spot > 0 ? ((up.price / spot) - 1) * 100 : 0,
    upsideTarget: rawUpTarget,
    downsideTrigger: down.price,
    downsideLabel: down.label,
    downsideDistPct: spot > 0 ? ((down.price / spot) - 1) * 100 : 0,
    downsideTarget: rawDownTarget,
    activeBreach,
  };
}

function computeOrderBookImbalance(orderBook) {
  const bids = orderBook?.bids;
  const asks = orderBook?.asks;
  if (!Array.isArray(bids) || !Array.isArray(asks) || !bids.length || !asks.length) return null;
  let bidNotional = 0;
  let askNotional = 0;
  const depth = Math.min(10, bids.length, asks.length);
  for (let i = 0; i < depth; i++) {
    const bp = Number(bids[i]?.[0]), bs = Number(bids[i]?.[1]);
    const ap = Number(asks[i]?.[0]), as = Number(asks[i]?.[1]);
    if (Number.isFinite(bp) && Number.isFinite(bs) && bp > 0 && bs > 0) bidNotional += bp * bs;
    if (Number.isFinite(ap) && Number.isFinite(as) && ap > 0 && as > 0) askNotional += ap * as;
  }
  const total = bidNotional + askNotional;
  if (!(total > 0)) return null;
  const imbalance = (bidNotional - askNotional) / total; // -1 to +1
  return { imbalance, bidSharePct: Math.round((bidNotional / total) * 100), askSharePct: Math.round((askNotional / total) * 100) };
}

/**
 * Leading Exhaustion, Divergence & Mean-Reversion Detector:
 * Prevents blind trend-chasing at oversold bottoms (e.g., RSI <= 30 + OBV accumulation + bid absorption)
 * or overbought tops by separating lagging trend direction from leading reversal pressure.
 */
function analyzeInflection({
  spot, liveSma20, std20, liveVwap20, vwapDevPct, liveRsi, rsiDelta,
  liveObvFlowRatio, priceChange10, tape, rangePosPct, volatilitySqueeze,
  divergence, bookInfo, sentiment, conviction,
}) {
  const bbZ = std20 > 1e-9 ? (spot - liveSma20) / std20 : 0;
  const upSignals = [];
  const downSignals = [];
  let reboundScore = 0;
  let pullbackScore = 0;

  // 1. Price vs OBV Volume Divergence (smart-money accumulation/distribution)
  if (priceChange10 < 0 && Number.isFinite(liveObvFlowRatio) && liveObvFlowRatio >= 0.12) {
    const pts = liveObvFlowRatio >= 0.25 ? 30 : 22;
    reboundScore += pts;
    upSignals.push('OBV accumulation while price slips (hidden demand)');
  } else if (priceChange10 > 0 && Number.isFinite(liveObvFlowRatio) && liveObvFlowRatio <= -0.12) {
    const pts = liveObvFlowRatio <= -0.25 ? 30 : 22;
    pullbackScore += pts;
    downSignals.push('OBV distribution while price rises (hidden supply)');
  }

  // 2. Oversold / Overbought Statistical Stretch (RSI + Bollinger Z + VWAP distance)
  if (liveRsi <= 31 || bbZ <= -1.65 || vwapDevPct <= -3.5) {
    let pts = liveRsi <= 25 || bbZ <= -2.0 ? 28 : 20;
    if (rsiDelta >= 0.8) pts += 8;
    reboundScore += pts;
    upSignals.push(`Oversold stretch (RSI ${Math.round(liveRsi)}, ${bbZ.toFixed(1)}σ vs mean)`);
  } else if (liveRsi >= 69 || bbZ >= 1.65 || vwapDevPct >= 3.5) {
    let pts = liveRsi >= 75 || bbZ >= 2.0 ? 28 : 20;
    if (rsiDelta <= -0.8) pts += 8;
    pullbackScore += pts;
    downSignals.push(`Overbought stretch (RSI ${Math.round(liveRsi)}, +${bbZ.toFixed(1)}σ vs mean)`);
  }

  // 3. Confirmed Pivot RSI Divergence
  if (divergence?.kind === 'bullish') {
    reboundScore += 26;
    upSignals.push('Confirmed bullish RSI divergence');
  } else if (divergence?.kind === 'bearish') {
    pullbackScore += 26;
    downSignals.push('Confirmed bearish RSI divergence');
  }

  // 4. Wick Absorption / Rejection at Range Extremes
  if (tape.lowerWick >= 0.44 && tape.closePos >= 0.52 && rangePosPct <= 40) {
    reboundScore += 18;
    upSignals.push('Lower-wick bid absorption near range lows');
  } else if (tape.upperWick >= 0.44 && tape.closePos <= 0.48 && rangePosPct >= 60) {
    pullbackScore += 18;
    downSignals.push('Upper-wick supply rejection near range highs');
  }

  // 5. Real-Time L2 Order Book Depth Imbalance
  if (bookInfo) {
    if (bookInfo.imbalance >= 0.16) {
      reboundScore += 14;
      upSignals.push(`Live order book bid-heavy (${bookInfo.bidSharePct}% bids)`);
    } else if (bookInfo.imbalance <= -0.16) {
      pullbackScore += 14;
      downSignals.push(`Live order book ask-heavy (${bookInfo.askSharePct}% asks)`);
    }
  }

  // 6. Macro Sentiment Contrarian Extreme
  if (Number.isFinite(sentiment?.value)) {
    if (sentiment.value <= 20 && rangePosPct <= 40) {
      reboundScore += 10;
      upSignals.push(`Extreme Fear (${sentiment.value}/100) contrarian zone`);
    } else if (sentiment.value >= 80 && rangePosPct >= 60) {
      pullbackScore += 10;
      downSignals.push(`Extreme Greed (${sentiment.value}/100) crowding risk`);
    }
  }

  reboundScore = clamp(Math.round(reboundScore), 0, 100);
  pullbackScore = clamp(Math.round(pullbackScore), 0, 100);
  const netReversion = reboundScore - pullbackScore; // + = upward reversal force, - = downward reversal force

  // Blend lagging conviction with leading exhaustion/flow pressure (and dampen during tight BB squeezes!)
  const squeezeDamp = volatilitySqueeze ? 0.62 : 1.0;
  const adjustedConviction = Math.round(clamp((conviction + netReversion * 0.58) * squeezeDamp, -100, 100));
  const upLeanPct = clamp(Math.round(50 + adjustedConviction * 0.28), 22, 78);
  const downLeanPct = 100 - upLeanPct;

  const downTrendConflict = conviction <= -14 && reboundScore >= 22;
  const upTrendConflict = conviction >= 14 && pullbackScore >= 22;
  const conflict = downTrendConflict || upTrendConflict;

  let kind = 'aligned';
  let warning = null;
  let activeSignals = [];
  const fmtSignal = s => s.charAt(0).toLowerCase() + s.slice(1);
  const preserveAcronyms = s => s.replace(/\bobv\b/gi, 'OBV').replace(/\brsi\b/gi, 'RSI').replace(/\bl2\b/gi, 'L2').replace(/\bvwap\b/gi, 'VWAP');
  if (downTrendConflict) {
    kind = 'rebound-risk';
    activeSignals = upSignals.slice(0, 3);
    warning = `Reversal caution: lagging trend is down, but ${preserveAcronyms(activeSignals.slice(0, 2).map(fmtSignal).join(' and '))} warn that selling is losing force — avoid assuming straight-line downside.`;
  } else if (upTrendConflict) {
    kind = 'pullback-risk';
    activeSignals = downSignals.slice(0, 3);
    warning = `Exhaustion caution: lagging trend is up, but ${preserveAcronyms(activeSignals.slice(0, 2).map(fmtSignal).join(' and '))} warn of overhead supply and mean-reversion pullback risk.`;
  } else if (volatilitySqueeze) {
    kind = 'squeeze';
    warning = `Volatility squeeze active: tight compression makes lagging MAs unreliable — wait for a decisive break outside the nearest trigger levels to set direction.`;
  }

  return {
    bbZ,
    reboundScore,
    pullbackScore,
    netReversion,
    adjustedConviction,
    upLeanPct,
    downLeanPct,
    conflict,
    kind,
    warning,
    activeSignals,
    bookInfo,
    meanReversionTarget: liveVwap20,
  };
}

/**
 * Tier B: O(1) Real-Time Tick & Forming-Bar Evaluator.
 * Merges live forming candle + live WebSocket quote + optional L2 order book & sentiment onto compiled closed-bar registers.
 */
export function evaluateLiveReading(closedState, { liveBar = null, liveQuote = null, orderBook = null, sentiment = null, nowSeconds = Date.now() / 1000 } = {}) {
  const { duration, lastBar, closed, registers } = closedState;
  const quotePrice = Number.isFinite(liveQuote?.price) && liveQuote.price > 0 ? liveQuote.price : null;
  const validLiveBar = liveBar && Number.isFinite(liveBar.time) && Number.isFinite(liveBar.close) && liveBar.close > 0 && liveBar.time >= lastBar.time ? liveBar : null;
  if (!validLiveBar && !quotePrice) return null;

  // Build canonical active forming candle (merge quote price onto forming candle OHLCV)
  const expectedOpenTime = Math.floor(nowSeconds / duration) * duration;
  const barTime = validLiveBar && validLiveBar.time > lastBar.time
    ? validLiveBar.time
    : Math.max(lastBar.time + duration, expectedOpenTime);

  const baseOpen = validLiveBar && validLiveBar.time > lastBar.time ? validLiveBar.open : lastBar.close;
  const spot = quotePrice ?? validLiveBar.close;
  const barHigh = Math.max(baseOpen, spot, validLiveBar && validLiveBar.time > lastBar.time ? validLiveBar.high : spot);
  const barLow = Math.min(baseOpen, spot, validLiveBar && validLiveBar.time > lastBar.time ? validLiveBar.low : spot);
  const barVolume = validLiveBar && validLiveBar.time > lastBar.time && Number.isFinite(validLiveBar.volume) ? Math.max(0, validLiveBar.volume) : 0;
  const activeBar = { time: barTime, open: baseOpen, high: barHigh, low: barLow, close: spot, volume: barVolume };

  // Elapsed fraction & countdown for the active candle
  const elapsedSec = Math.max(0, nowSeconds - barTime);
  const elapsedFrac = clamp(elapsedSec / duration, 0, 1);
  const remainingSec = Math.max(0, barTime + duration - nowSeconds);

  // Exact O(1) Moving Averages
  const liveSma20 = (registers.sumClose19 + spot) / 20;
  const liveSma50 = (registers.sumClose49 + spot) / 50;
  const liveEma9 = closed.ema9 + (2 / 10) * (spot - closed.ema9);
  const liveEma20 = closed.ema20 + (2 / 21) * (spot - closed.ema20);
  const liveEma12 = closed.ema12 + (2 / 13) * (spot - closed.ema12);
  const liveEma26 = closed.ema26 + (2 / 27) * (spot - closed.ema26);
  const liveMacdLine = liveEma12 - liveEma26;
  const liveMacdSignal = closed.macdSignal + (2 / 10) * (liveMacdLine - closed.macdSignal);
  const liveMacdHist = liveMacdLine - liveMacdSignal;

  // Exact O(1) Shifted Bollinger Bandwidth (20, 2) — immune to float cancellation at $100k+ BTC
  const spotShift = spot - registers.varShift;
  const meanOff20 = (registers.sumShift19 + spotShift) / 20;
  const variance20 = Math.max(0, (registers.sumShift19Sq + spotShift * spotShift) / 20 - meanOff20 * meanOff20);
  const std20 = Math.sqrt(variance20);
  const liveBbUpper = liveSma20 + 2 * std20;
  const liveBbLower = liveSma20 - 2 * std20;
  const liveBbw = liveSma20 > 0 ? ((liveBbUpper - liveBbLower) / liveSma20) * 100 : closed.bbw;

  // Exact O(1) Wilder RSI 14
  const delta = spot - lastBar.close;
  const liveAvgGain = (registers.wilder.avgGain * 13 + (delta > 0 ? delta : 0)) / 14;
  const liveAvgLoss = (registers.wilder.avgLoss * 13 + (delta < 0 ? -delta : 0)) / 14;
  const liveRsi = liveAvgLoss === 0 ? (liveAvgGain === 0 ? 50 : 100) : 100 - 100 / (1 + liveAvgGain / liveAvgLoss);
  const rsiDelta = Number.isFinite(closed.rsi) ? liveRsi - closed.rsi : 0;

  // Exact O(1) Wilder ATR 14 & ADX 14 / +DI / -DI
  const trNow = Math.max(barHigh - barLow, Math.abs(barHigh - lastBar.close), Math.abs(barLow - lastBar.close));
  const liveAtr = Number.isFinite(closed.atr) ? (closed.atr * 13 + trNow) / 14 : trNow;

  let liveAdx = closed.adx;
  let livePlusDI = closed.plusDI;
  let liveMinusDI = closed.minusDI;
  if (Number.isFinite(registers.wilder.trSmooth) && registers.wilder.trSmooth > 0) {
    const up = barHigh - lastBar.high;
    const dn = lastBar.low - barLow;
    const trS = registers.wilder.trSmooth - registers.wilder.trSmooth / 14 + trNow;
    const pS = registers.wilder.plusSmooth - registers.wilder.plusSmooth / 14 + (up > dn && up > 0 ? up : 0);
    const mS = registers.wilder.minusSmooth - registers.wilder.minusSmooth / 14 + (dn > up && dn > 0 ? dn : 0);
    livePlusDI = trS > 0 ? (100 * pS) / trS : 0;
    liveMinusDI = trS > 0 ? (100 * mS) / trS : 0;
    const diSum = livePlusDI + liveMinusDI;
    const dxNow = diSum > 0 ? (100 * Math.abs(livePlusDI - liveMinusDI)) / diSum : 0;
    if (Number.isFinite(registers.wilder.adxSmooth)) {
      liveAdx = (registers.wilder.adxSmooth * 13 + dxNow) / 14;
    }
  }

  // Exact O(1) Live 20-bar VWAP & deviation
  const typicalNow = (barHigh + barLow + spot) / 3;
  const liveVwapDen = registers.vwapDen19 + barVolume;
  const liveVwap20 = liveVwapDen > 0 ? (registers.vwapNum19 + typicalNow * barVolume) / liveVwapDen : liveSma20;
  const vwapDevPct = liveVwap20 > 0 ? ((spot / liveVwap20) - 1) * 100 : 0;

  // Time-normalized Live Volume Pace (prevents false "0.1x quiet volume" right after candle open!)
  let volumePace = null;
  if (registers.volAvg20 > 0 && barVolume > 0) {
    // Bayesian shrinkage toward 1.0 in the first 5% of a candle so 2-second bursts don't look like 50x spikes
    const effectiveFrac = Math.max(0.05, elapsedFrac);
    const rawPace = (barVolume / effectiveFrac) / registers.volAvg20;
    const confidence = clamp(elapsedFrac / 0.12, 0.25, 1);
    volumePace = rawPace * confidence + 1.0 * (1 - confidence);
  }

  // Exact O(1) Live 10-bar OBV flow
  const liveObvDelta = registers.obvDelta9 + Math.sign(spot - lastBar.close) * barVolume;
  const liveTotalVol = registers.totalVol9 + barVolume;
  const liveObvFlowRatio = liveTotalVol > 0 ? liveObvDelta / liveTotalVol : closed.obvFlowRatio;

  // Live 20-bar range & position
  const rangeHigh = Math.max(registers.recentHigh19, barHigh);
  const rangeLow = Math.min(registers.recentLow19, barLow);
  const rangeSpan = rangeHigh - rangeLow;
  const rangePosPct = rangeSpan > 0 ? Math.round(((spot - rangeLow) / rangeSpan) * 100) : 50;

  // Tape / forming candle microstructure
  const tape = classifyTapeAction(activeBar, liveAtr);

  // Continuous Conviction (-100 to +100) for both closed bar and live tick
  const closedConviction = computeConviction({
    close: closed.close, ema9: closed.ema9, sma20: closed.sma20, sma50: closed.sma50,
    adx: closed.adx, plusDI: closed.plusDI, minusDI: closed.minusDI,
    macdHist: closed.macdHist, macdPrev: closed.macdPrev, atrVal: closed.atr,
    rsiVal: closed.rsi, obvFlowRatio: closed.obvFlowRatio, vwap20: closed.vwap20,
    barChangePct: lastBar.open > 0 ? ((lastBar.close - lastBar.open) / lastBar.open) * 100 : 0,
    closePosInBar: lastBar.high > lastBar.low ? (lastBar.close - lastBar.low) / (lastBar.high - lastBar.low) : 0.5,
  });

  const conviction = computeConviction({
    close: spot, ema9: liveEma9, sma20: liveSma20, sma50: liveSma50,
    adx: liveAdx, plusDI: livePlusDI, minusDI: liveMinusDI,
    macdHist: liveMacdHist, macdPrev: closed.macdHist, atrVal: liveAtr,
    rsiVal: liveRsi, obvFlowRatio: liveObvFlowRatio, vwap20: liveVwap20,
    barChangePct: tape.changePct, closePosInBar: tape.closePos,
  });
  const convictionShift = conviction - closedConviction;

  // Adaptive nearest structural levels (no longer frozen on stale 20-day walls!)
  const levels = resolveAdaptiveLevels({
    spot,
    liveAtr,
    closedState,
    liveMetrics: {
      barHigh, barLow, ema9: liveEma9, ema20: liveEma20,
      sma20: liveSma20, sma50: liveSma50, vwap20: liveVwap20,
      bbUpper: liveBbUpper, bbLower: liveBbLower,
    },
    rangeHigh,
    rangeLow,
  });

  const volatilitySqueeze = liveBbw !== null && registers.bbwQuartile !== null && liveBbw <= registers.bbwQuartile;
  const bookInfo = computeOrderBookImbalance(orderBook);
  const priceChange10 = spot - closedState.close9Ago;
  const inflection = analyzeInflection({
    spot, liveSma20, std20, liveVwap20, vwapDevPct, liveRsi, rsiDelta,
    liveObvFlowRatio, priceChange10, tape, rangePosPct, volatilitySqueeze,
    divergence: closedState.divergence, bookInfo, sentiment, conviction,
  });

  // Compact deterministic revision key bucketed cleanly so tiny sub-pip jitter doesn't churn DOM
  const priceSig = liveAtr > 0 ? Math.round(spot / Math.max(liveAtr * 0.008, spot * 0.00015)) : Math.round(spot * 100);
  const countdownBucket = remainingSec > 3600 ? Math.floor(remainingSec / 60) : Math.floor(remainingSec / 15);
  const bookSig = bookInfo ? Math.round(bookInfo.bidSharePct / 5) : 0;
  const revisionKey = `${closedState.closedAt}:${priceSig}:${inflection.adjustedConviction}:${countdownBucket}:${Math.round(liveRsi * 2)}:${Math.round((volumePace ?? 0) * 10)}:${bookSig}`;

  return {
    active: true,
    bar: activeBar,
    price: spot,
    barOpen: baseOpen,
    barHigh,
    barLow,
    barChangePct: tape.changePct,
    barChangeAbs: spot - baseOpen,
    elapsedPct: Math.round(elapsedFrac * 100),
    remainingSec,
    countdown: formatCountdown(remainingSec),
    updatedAt: Math.round(nowSeconds),
    metrics: {
      close: spot,
      sma20: liveSma20,
      sma50: liveSma50,
      ema9: liveEma9,
      ema20: liveEma20,
      rsi: liveRsi,
      rsiDelta,
      atr: liveAtr,
      adx: liveAdx,
      plusDI: livePlusDI,
      minusDI: liveMinusDI,
      macdHist: liveMacdHist,
      macdPrev: closed.macdHist,
      bbw: liveBbw,
      bbUpper: liveBbUpper,
      bbLower: liveBbLower,
      bbZ: inflection.bbZ,
      vwap20: liveVwap20,
      vwapDevPct,
      volumeRatio: volumePace,
      obvFlowRatio: liveObvFlowRatio,
    },
    range: { high: rangeHigh, low: rangeLow, periods: 20, posPct: rangePosPct },
    volatilitySqueeze,
    tape,
    conviction,
    adjustedConviction: inflection.adjustedConviction,
    closedConviction,
    convictionShift,
    inflection,
    levels,
    revisionKey,
  };
}
