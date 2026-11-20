const validPeriod = p => { if (!Number.isInteger(p) || p < 1 || p > 500) throw Error('Period must be an integer from 1 to 500'); };

export function sma(values, period = 20) {
  validPeriod(period);
  const n = values.length;
  const out = new Array(n);
  let sum = 0, count = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (Number.isFinite(v)) { sum += v; count++; }
    if (i >= period) {
      const old = values[i - period];
      if (Number.isFinite(old)) { sum -= old; count--; }
    }
    // Periodic exact resync prevents floating-point drift on 4,000+ high-priced bars
    if (count === period && (i & 255) === 255) {
      let exact = 0;
      for (let j = i - period + 1; j <= i; j++) exact += values[j];
      sum = exact;
    }
    out[i] = i >= period - 1 && count === period ? sum / period : null;
  }
  return out;
}

export function ema(values, period = 20) {
  validPeriod(period);
  const n = values.length;
  const out = new Array(n);
  const k = 2 / (period + 1);
  const oneMinusK = 1 - k;
  let previous = null, seedSum = 0, seedCount = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      previous = null; seedSum = 0; seedCount = 0; out[i] = null; continue;
    }
    if (previous === null) {
      seedSum += v; seedCount++;
      if (seedCount < period) { out[i] = null; continue; }
      previous = seedSum / period;
    } else {
      previous = v * k + previous * oneMinusK;
    }
    out[i] = previous;
  }
  return out;
}

export function rsi(values, period = 14) {
  validPeriod(period);
  const n = values.length;
  const out = new Array(n).fill(null);
  if (n <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= period;
  loss /= period;
  const invP = 1 / period, pm1 = period - 1;
  out[period] = gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < n; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * pm1 + (d > 0 ? d : 0)) * invP;
    loss = (loss * pm1 + (d < 0 ? -d : 0)) * invP;
    out[i] = gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

// Single-pass O(N) shifted sliding variance (avoids catastrophic cancellation at BTC $90k+ prices, zero .slice() allocations)
export function bollinger(values, period = 20, multiplier = 2) {
  validPeriod(period);
  const n = values.length;
  const middle = new Array(n);
  const upper = new Array(n);
  const lower = new Array(n);
  let sum = 0, sumSq = 0, count = 0, shift = null;
  const recompute = (end) => {
    let s = 0, s2 = 0;
    const base = values[end];
    shift = base;
    for (let j = end - period + 1; j <= end; j++) {
      const d = values[j] - base;
      s += d; s2 += d * d;
    }
    sum = s; sumSq = s2;
  };
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (Number.isFinite(v)) {
      if (shift === null) shift = v;
      const d = v - shift;
      sum += d; sumSq += d * d; count++;
    } else {
      sum = 0; sumSq = 0; count = 0; shift = null;
      middle[i] = upper[i] = lower[i] = null;
      continue;
    }
    if (i >= period) {
      const old = values[i - period];
      if (Number.isFinite(old) && count > period) {
        const dOld = old - shift;
        sum -= dOld; sumSq -= dOld * dOld; count--;
      }
    }
    if (count < period) {
      middle[i] = upper[i] = lower[i] = null;
      continue;
    }
    if ((i & 127) === 127) recompute(i);
    const meanOff = sum / period;
    const m = shift + meanOff;
    let variance = sumSq / period - meanOff * meanOff;
    if (variance < 0 || !Number.isFinite(variance)) {
      recompute(i);
      const m2 = sum / period;
      variance = Math.max(0, sumSq / period - m2 * m2);
    }
    const sd = Math.sqrt(variance);
    middle[i] = m;
    upper[i] = m + sd * multiplier;
    lower[i] = m - sd * multiplier;
  }
  return { middle, upper, lower };
}

export function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const f = ema(values, fast), s = ema(values, slow), n = values.length;
  const line = new Array(n);
  for (let i = 0; i < n; i++) line[i] = f[i] === null || s[i] === null ? null : f[i] - s[i];
  const signal = ema(line, signalPeriod);
  const histogram = new Array(n);
  for (let i = 0; i < n; i++) histogram[i] = line[i] === null || signal[i] === null ? null : line[i] - signal[i];
  return { line, signal, histogram };
}

export function atr(bars, period = 14) {
  validPeriod(period);
  const n = bars.length;
  const out = new Array(n);
  let prev = null, seed = 0;
  const invP = 1 / period, pm1 = period - 1;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const tr = i === 0
      ? b.high - b.low
      : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close));
    if (i < period - 1) {
      seed += tr;
      out[i] = null;
    } else if (i === period - 1) {
      prev = (seed + tr) * invP;
      out[i] = prev;
    } else {
      prev = (prev * pm1 + tr) * invP;
      out[i] = prev;
    }
  }
  return out;
}

export function vwap(bars) {
  const n = bars.length;
  const out = new Array(n);
  let day = -1, volume = 0, value = 0;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const d = Math.floor(b.time / 86400);
    if (d !== day) { day = d; volume = 0; value = 0; }
    volume += b.volume;
    value += ((b.high + b.low + b.close) / 3) * b.volume;
    out[i] = volume > 0 ? value / volume : null;
  }
  return out;
}

// O(N) Monotonic Deque sliding window extrema (high & low) — handles any period 1..500 in linear time!
export function rollingExtrema(bars, period, { priorOnly = false } = {}) {
  const n = bars.length;
  const upper = new Array(n).fill(null);
  const lower = new Array(n).fill(null);
  if (period < 1 || n === 0) return { upper, lower };
  const maxQ = new Int32Array(n);
  const minQ = new Int32Array(n);
  let maxHead = 0, maxTail = 0, minHead = 0, minTail = 0;

  if (priorOnly) {
    // Window for bar i is [i - period .. i - 1]
    for (let i = 0; i < n; i++) {
      if (i >= period) {
        const winStart = i - period;
        while (maxHead < maxTail && maxQ[maxHead] < winStart) maxHead++;
        while (minHead < minTail && minQ[minHead] < winStart) minHead++;
        upper[i] = bars[maxQ[maxHead]].high;
        lower[i] = bars[minQ[minHead]].low;
      }
      const hi = bars[i].high, lo = bars[i].low;
      while (maxTail > maxHead && bars[maxQ[maxTail - 1]].high <= hi) maxTail--;
      maxQ[maxTail++] = i;
      while (minTail > minHead && bars[minQ[minTail - 1]].low >= lo) minTail--;
      minQ[minTail++] = i;
    }
    return { upper, lower };
  }

  // Inclusive window [i - period + 1 .. i]
  for (let i = 0; i < n; i++) {
    const hi = bars[i].high, lo = bars[i].low;
    while (maxTail > maxHead && bars[maxQ[maxTail - 1]].high <= hi) maxTail--;
    maxQ[maxTail++] = i;
    while (minTail > minHead && bars[minQ[minTail - 1]].low >= lo) minTail--;
    minQ[minTail++] = i;
    const winStart = i - period + 1;
    if (winStart >= 0) {
      while (maxQ[maxHead] < winStart) maxHead++;
      while (minQ[minHead] < winStart) minHead++;
      upper[i] = bars[maxQ[maxHead]].high;
      lower[i] = bars[minQ[minHead]].low;
    }
  }
  return { upper, lower };
}

// O(N) algebraic recurrence Weighted Moving Average with periodic resync
export function wmaFast(values, period) {
  const n = values.length;
  const out = new Array(n);
  if (period < 1) return out.fill(null);
  const denom = (period * (period + 1)) / 2;
  let count = 0, sum = 0, weighted = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) { count = 0; sum = 0; weighted = 0; out[i] = null; continue; }
    if (count < period) {
      count++;
      weighted += count * v;
      sum += v;
    } else {
      weighted += period * v - sum;
      sum += v - values[i - period];
      if ((i & 255) === 255) {
        let s = 0, w = 0;
        for (let k = 0; k < period; k++) {
          const val = values[i - period + 1 + k];
          s += val; w += val * (k + 1);
        }
        sum = s; weighted = w;
      }
    }
    out[i] = count === period ? weighted / denom : null;
  }
  return out;
}

export function heikinAshi(bars) {
  const n = bars.length;
  const result = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const p = i > 0 ? result[i - 1] : null;
    const close = (b.open + b.high + b.low + b.close) * 0.25;
    const open = p ? (p.open + p.close) * 0.5 : (b.open + b.close) * 0.5;
    result[i] = { ...b, open, close, high: Math.max(b.high, open, close), low: Math.min(b.low, open, close) };
  }
  return result;
}

export function normalizeCandles(bars) {
  const m = new Map();
  for (const b of bars) {
    if (
      b && Number.isInteger(b.time) && b.time > 0 &&
      Number.isFinite(b.open) && Number.isFinite(b.high) && Number.isFinite(b.low) &&
      Number.isFinite(b.close) && Number.isFinite(b.volume) &&
      b.low > 0 && b.volume >= 0 &&
      b.high >= Math.max(b.open, b.close, b.low) &&
      b.low <= Math.min(b.open, b.close)
    ) {
      m.set(b.time, b);
    }
  }
  return [...m.values()].sort((a, b) => a.time - b.time);
}

export function planRisk({ equity, riskPercent, entry, stop, target, side = 'long', feePercent = 0.1 }) {
  if (![equity, riskPercent, entry, stop, target, feePercent].every(Number.isFinite) || [equity, riskPercent, entry, stop, target].some(v => v <= 0) || riskPercent > 100 || feePercent < 0 || feePercent > 10) throw Error('Enter positive values; risk 0–100% and fee 0–10%.');
  if (!['long', 'short'].includes(side) || (side === 'long' && !(stop < entry && target > entry)) || (side === 'short' && !(stop > entry && target < entry))) throw Error('Long: stop < entry < target. Short: target < entry < stop.');
  const fees = (entry + stop) * feePercent / 100, riskPerUnit = Math.abs(entry - stop) + fees, rewardPerUnit = Math.abs(target - entry) - (entry + target) * feePercent / 100, budget = equity * (riskPercent / 100), quantity = budget / riskPerUnit, notional = quantity * entry, entryCost = notional * (1 + feePercent / 100), potentialGain = quantity * rewardPerUnit;
  if (![fees, riskPerUnit, rewardPerUnit, budget, quantity, notional, entryCost, potentialGain, rewardPerUnit / riskPerUnit].every(Number.isFinite) || budget <= 0 || quantity <= 0) throw Error('Values exceed the supported calculation range. Use smaller finite amounts.');
  return { budget, quantity, notional, entryCost, rewardRisk: rewardPerUnit / riskPerUnit, potentialLoss: budget, potentialGain, capitalExceeded: entryCost > equity, breakEvenWinRate: rewardPerUnit > 0 ? 100 / (1 + rewardPerUnit / riskPerUnit) : null };
}

export function technicalSummary(bars) {
  if (bars.length < 50) return { ready: false };
  const c = bars.map(b => b.close), last = c.at(-1), e20 = ema(c, 20).at(-1), e50 = ema(c, 50).at(-1), strength = rsi(c, 14).at(-1), a = atr(bars, 14).at(-1), m = macd(c).histogram.at(-1);
  return { ready: true, ema20: e20, ema50: e50, rsi: strength, atr: a, macd: m, trend: last > e20 && e20 > e50 ? 'Uptrend' : last < e20 && e20 < e50 ? 'Downtrend' : 'Mixed trend', momentum: strength >= 70 ? 'Overbought' : strength <= 30 ? 'Oversold' : 'Balanced', volatility: a / last * 100 };
}
