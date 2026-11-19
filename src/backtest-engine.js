import { atr, bollinger, ema, macd, normalizeCandles, rsi, sma } from './analytics.js';
import { adxSeries, supertrendSeries } from './studies.js';
import { evaluateFormula, parseFormula } from './custom-studies.js';
import { INTERVALS } from './preferences.js';

export const BT_INDICATORS = Object.freeze([
  { id: 'close', label: 'Close price', params: [] },
  { id: 'open', label: 'Open price', params: [] },
  { id: 'high', label: 'High price', params: [] },
  { id: 'low', label: 'Low price', params: [] },
  { id: 'volume', label: 'Volume', params: [] },
  { id: 'sma', label: 'SMA', params: [{ key: 'period', label: 'Length', default: 20, min: 2, max: 400 }] },
  { id: 'ema', label: 'EMA', params: [{ key: 'period', label: 'Length', default: 20, min: 2, max: 400 }] },
  { id: 'wma', label: 'WMA', params: [{ key: 'period', label: 'Length', default: 20, min: 2, max: 400 }] },
  { id: 'hma', label: 'Hull MA', params: [{ key: 'period', label: 'Length', default: 20, min: 2, max: 400 }] },
  { id: 'rsi', label: 'RSI', params: [{ key: 'period', label: 'Length', default: 14, min: 2, max: 200 }] },
  { id: 'macd_line', label: 'MACD Line', params: [{ key: 'fast', label: 'Fast', default: 12, min: 2, max: 200 }, { key: 'slow', label: 'Slow', default: 26, min: 3, max: 300 }, { key: 'signal', label: 'Signal', default: 9, min: 2, max: 100 }] },
  { id: 'macd_signal', label: 'MACD Signal', params: [{ key: 'fast', label: 'Fast', default: 12, min: 2, max: 200 }, { key: 'slow', label: 'Slow', default: 26, min: 3, max: 300 }, { key: 'signal', label: 'Signal', default: 9, min: 2, max: 100 }] },
  { id: 'macd_hist', label: 'MACD Histogram', params: [{ key: 'fast', label: 'Fast', default: 12, min: 2, max: 200 }, { key: 'slow', label: 'Slow', default: 26, min: 3, max: 300 }, { key: 'signal', label: 'Signal', default: 9, min: 2, max: 100 }] },
  { id: 'bb_upper', label: 'Bollinger Upper', params: [{ key: 'period', label: 'Length', default: 20, min: 2, max: 400 }, { key: 'mult', label: 'Std Dev', default: 2, min: 0.5, max: 5, step: 0.1 }] },
  { id: 'bb_mid', label: 'Bollinger Mid', params: [{ key: 'period', label: 'Length', default: 20, min: 2, max: 400 }] },
  { id: 'bb_lower', label: 'Bollinger Lower', params: [{ key: 'period', label: 'Length', default: 20, min: 2, max: 400 }, { key: 'mult', label: 'Std Dev', default: 2, min: 0.5, max: 5, step: 0.1 }] },
  { id: 'supertrend', label: 'Supertrend', params: [{ key: 'period', label: 'ATR Len', default: 10, min: 2, max: 200 }, { key: 'mult', label: 'Mult', default: 3, min: 0.5, max: 8, step: 0.1 }] },
  { id: 'adx', label: 'ADX', params: [{ key: 'period', label: 'Length', default: 14, min: 2, max: 200 }] },
  { id: 'plus_di', label: '+DI', params: [{ key: 'period', label: 'Length', default: 14, min: 2, max: 200 }] },
  { id: 'minus_di', label: '−DI', params: [{ key: 'period', label: 'Length', default: 14, min: 2, max: 200 }] },
  { id: 'atr', label: 'ATR', params: [{ key: 'period', label: 'Length', default: 14, min: 2, max: 200 }] },
  { id: 'donchian_high', label: 'Prior N-Bar High', params: [{ key: 'period', label: 'Lookback', default: 20, min: 2, max: 400 }] },
  { id: 'donchian_low', label: 'Prior N-Bar Low', params: [{ key: 'period', label: 'Lookback', default: 10, min: 2, max: 400 }] },
  { id: 'rvol', label: 'Relative Volume', params: [{ key: 'period', label: 'Lookback', default: 20, min: 2, max: 200 }] },
  { id: 'roc', label: 'Rate of Change %', params: [{ key: 'period', label: 'Lookback', default: 12, min: 1, max: 200 }] },
  { id: 'stoch_k', label: 'Stochastic %K', params: [{ key: 'period', label: 'Lookback', default: 14, min: 2, max: 200 }] },
  { id: 'const', label: 'Number / Value', params: [{ key: 'value', label: 'Value', default: 30, min: -1e9, max: 1e9, step: 'any' }] },
  { id: 'formula', label: 'Custom Formula', params: [{ key: 'expr', label: 'Expression', default: 'ema(close, 12) - ema(close, 26)', text: true }] },
]);

export const BT_OPERATORS = Object.freeze([
  { id: 'crosses_above', label: 'crosses above' },
  { id: 'crosses_below', label: 'crosses below' },
  { id: '>', label: 'is above (>)' },
  { id: '<', label: 'is below (<)' },
  { id: '>=', label: '≥' },
  { id: '<=', label: '≤' },
]);

export const BT_PRESETS = Object.freeze([
  {
    id: 'ema-trend',
    name: 'EMA Crossover Trend',
    summary: 'Classic trend follower: enters when fast EMA crosses above slow EMA and exits on cross below.',
    config: {
      direction: 'long',
      entryLogic: 'AND',
      exitLogic: 'OR',
      entryRules: [{ left: { type: 'ema', period: 20 }, op: 'crosses_above', right: { type: 'ema', period: 50 } }],
      exitRules: [{ left: { type: 'ema', period: 20 }, op: 'crosses_below', right: { type: 'ema', period: 50 } }],
      shortEntryRules: [{ left: { type: 'ema', period: 20 }, op: 'crosses_below', right: { type: 'ema', period: 50 } }],
      shortExitRules: [{ left: { type: 'ema', period: 20 }, op: 'crosses_above', right: { type: 'ema', period: 50 } }],
      stopLossMode: 'none', stopLossValue: 3, takeProfitMode: 'none', takeProfitValue: 6, trailingMode: 'none', trailingValue: 2.5,
    },
  },
  {
    id: 'rsi-reversion',
    name: 'RSI Oversold Recovery',
    summary: 'Mean-reversion rule: buys when RSI recovers back above 30 and exits when RSI stretches to 70.',
    config: {
      direction: 'long',
      entryLogic: 'AND',
      exitLogic: 'OR',
      entryRules: [{ left: { type: 'rsi', period: 14 }, op: 'crosses_above', right: { type: 'const', value: 30 } }],
      exitRules: [{ left: { type: 'rsi', period: 14 }, op: '>=', right: { type: 'const', value: 70 } }],
      shortEntryRules: [{ left: { type: 'rsi', period: 14 }, op: 'crosses_below', right: { type: 'const', value: 70 } }],
      shortExitRules: [{ left: { type: 'rsi', period: 14 }, op: '<=', right: { type: 'const', value: 30 } }],
      stopLossMode: 'pct', stopLossValue: 4, takeProfitMode: 'none', takeProfitValue: 8, trailingMode: 'none', trailingValue: 2.5,
    },
  },
  {
    id: 'donchian-turtle',
    name: 'Donchian Breakout (Turtle)',
    summary: 'Breakout system: buys a close above the prior 20-bar high and exits below the prior 10-bar low.',
    config: {
      direction: 'long',
      entryLogic: 'AND',
      exitLogic: 'OR',
      entryRules: [{ left: { type: 'close' }, op: '>', right: { type: 'donchian_high', period: 20 } }],
      exitRules: [{ left: { type: 'close' }, op: '<', right: { type: 'donchian_low', period: 10 } }],
      shortEntryRules: [{ left: { type: 'close' }, op: '<', right: { type: 'donchian_low', period: 20 } }],
      shortExitRules: [{ left: { type: 'close' }, op: '>', right: { type: 'donchian_high', period: 10 } }],
      stopLossMode: 'atr', stopLossValue: 2, takeProfitMode: 'none', takeProfitValue: 6, trailingMode: 'none', trailingValue: 2,
    },
  },
  {
    id: 'supertrend-adx',
    name: 'Supertrend + ADX Filter',
    summary: 'Trend momentum with regime filter: requires Close > Supertrend AND ADX > 20 to avoid choppy whipsaws.',
    config: {
      direction: 'both',
      entryLogic: 'AND',
      exitLogic: 'OR',
      entryRules: [
        { left: { type: 'close' }, op: '>', right: { type: 'supertrend', period: 10, mult: 3 } },
        { left: { type: 'adx', period: 14 }, op: '>', right: { type: 'const', value: 20 } },
      ],
      exitRules: [{ left: { type: 'close' }, op: '<', right: { type: 'supertrend', period: 10, mult: 3 } }],
      shortEntryRules: [
        { left: { type: 'close' }, op: '<', right: { type: 'supertrend', period: 10, mult: 3 } },
        { left: { type: 'adx', period: 14 }, op: '>', right: { type: 'const', value: 20 } },
      ],
      shortExitRules: [{ left: { type: 'close' }, op: '>', right: { type: 'supertrend', period: 10, mult: 3 } }],
      stopLossMode: 'none', stopLossValue: 3, takeProfitMode: 'none', takeProfitValue: 8, trailingMode: 'atr', trailingValue: 2.5,
    },
  },
  {
    id: 'bb-snapback',
    name: 'Bollinger Lower Snapback',
    summary: 'Volatility reversion: buys when close crosses back inside the lower 2σ band and takes profit at the middle band.',
    config: {
      direction: 'long',
      entryLogic: 'AND',
      exitLogic: 'OR',
      entryRules: [{ left: { type: 'close' }, op: 'crosses_above', right: { type: 'bb_lower', period: 20, mult: 2 } }],
      exitRules: [{ left: { type: 'close' }, op: '>=', right: { type: 'bb_mid', period: 20 } }],
      shortEntryRules: [{ left: { type: 'close' }, op: 'crosses_below', right: { type: 'bb_upper', period: 20, mult: 2 } }],
      shortExitRules: [{ left: { type: 'close' }, op: '<=', right: { type: 'bb_mid', period: 20 } }],
      stopLossMode: 'pct', stopLossValue: 3.5, takeProfitMode: 'none', takeProfitValue: 7, trailingMode: 'none', trailingValue: 2,
    },
  },
  {
    id: 'macd-volume',
    name: 'MACD + Relative Volume Surge',
    summary: 'Confirmation strategy: requires positive MACD histogram crossover backed by above-average volume (RVOL > 1.2).',
    config: {
      direction: 'long',
      entryLogic: 'AND',
      exitLogic: 'OR',
      entryRules: [
        { left: { type: 'macd_hist', fast: 12, slow: 26, signal: 9 }, op: 'crosses_above', right: { type: 'const', value: 0 } },
        { left: { type: 'rvol', period: 20 }, op: '>', right: { type: 'const', value: 1.2 } },
      ],
      exitRules: [{ left: { type: 'macd_hist', fast: 12, slow: 26, signal: 9 }, op: 'crosses_below', right: { type: 'const', value: 0 } }],
      shortEntryRules: [
        { left: { type: 'macd_hist', fast: 12, slow: 26, signal: 9 }, op: 'crosses_below', right: { type: 'const', value: 0 } },
        { left: { type: 'rvol', period: 20 }, op: '>', right: { type: 'const', value: 1.2 } },
      ],
      shortExitRules: [{ left: { type: 'macd_hist', fast: 12, slow: 26, signal: 9 }, op: 'crosses_above', right: { type: 'const', value: 0 } }],
      stopLossMode: 'pct', stopLossValue: 3, takeProfitMode: 'pct', takeProfitValue: 6, trailingMode: 'none', trailingValue: 2,
    },
  },
]);

export function defaultBacktestConfig() {
  return {
    name: 'EMA Crossover Trend',
    initialCapital: 10000,
    feeBps: 10,
    slippageBps: 5,
    sizingMode: 'pct_equity', // 'pct_equity' | 'fixed_quote' | 'risk_pct'
    sizingValue: 100,
    maxHoldBars: 0,
    cooldownBars: 0,
    splitPct: 70, // 70% in-sample / 30% out-of-sample walk-forward check
    ...structuredClone(BT_PRESETS[0].config),
  };
}

function weightedMA(closes, period) {
  const denom = period * (period + 1) / 2;
  return closes.map((_, i) => {
    if (i + 1 < period) return null;
    let sum = 0;
    for (let k = 0; k < period; k++) sum += closes[i - period + 1 + k] * (k + 1);
    return sum / denom;
  });
}

function hullMA(closes, period) {
  const half = weightedMA(closes, Math.max(1, Math.floor(period / 2)));
  const full = weightedMA(closes, period);
  const diff = full.map((v, i) => v === null || half[i] === null ? null : 2 * half[i] - v);
  const sqrtP = Math.max(1, Math.floor(Math.sqrt(period)));
  const denom = sqrtP * (sqrtP + 1) / 2;
  return diff.map((_, i) => {
    if (i + 1 < sqrtP) return null;
    let sum = 0;
    for (let k = 0; k < sqrtP; k++) {
      const v = diff[i - sqrtP + 1 + k];
      if (!Number.isFinite(v)) return null;
      sum += v * (k + 1);
    }
    return sum / denom;
  });
}

function customMacd(closes, fast = 12, slow = 26, sig = 9) {
  const f = ema(closes, fast), s = ema(closes, slow);
  const line = s.map((v, i) => v === null || f[i] === null ? null : f[i] - v);
  const signal = ema(line, sig);
  const histogram = line.map((v, i) => v === null || signal[i] === null ? null : v - signal[i]);
  return { line, signal, histogram };
}

function priorChannel(bars, period, isHigh) {
  // Strictly uses PRIOR N bars [i - period .. i - 1] so comparing close > priorChannel has zero self-inclusion bias!
  return bars.map((_, i) => {
    if (i < period) return null;
    let best = isHigh ? -Infinity : Infinity;
    for (let j = i - period; j < i; j++) best = isHigh ? Math.max(best, bars[j].high) : Math.min(best, bars[j].low);
    return best;
  });
}

function relativeVolume(bars, period) {
  return bars.map((bar, i) => {
    if (i < period) return null;
    let sum = 0;
    for (let j = i - period; j < i; j++) sum += bars[j].volume;
    const avg = sum / period;
    return avg > 0 ? bar.volume / avg : null;
  });
}

function stochK(bars, period) {
  const raw = bars.map((bar, i) => {
    if (i + 1 < period) return null;
    let hi = -Infinity, lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) { hi = Math.max(hi, bars[j].high); lo = Math.min(lo, bars[j].low); }
    return hi > lo ? 100 * (bar.close - lo) / (hi - lo) : 50;
  });
  return sma(raw, 3);
}

function resolveOperand(operand, bars, closes, cache) {
  const key = JSON.stringify(operand);
  if (cache.has(key)) return cache.get(key);
  const type = operand?.type ?? 'close';
  const period = Math.max(1, Math.min(400, Math.round(Number(operand?.period) || 20)));
  const mult = Math.max(0.1, Math.min(10, Number(operand?.mult) || 2));
  let values;
  switch (type) {
    case 'close': values = closes; break;
    case 'open': values = bars.map(b => b.open); break;
    case 'high': values = bars.map(b => b.high); break;
    case 'low': values = bars.map(b => b.low); break;
    case 'volume': values = bars.map(b => b.volume); break;
    case 'const': values = Array(bars.length).fill(Number(operand?.value) || 0); break;
    case 'sma': values = sma(closes, period); break;
    case 'ema': values = ema(closes, period); break;
    case 'wma': values = weightedMA(closes, period); break;
    case 'hma': values = hullMA(closes, period); break;
    case 'rsi': values = rsi(closes, period); break;
    case 'atr': values = atr(bars, period); break;
    case 'bb_upper': values = bollinger(closes, period, mult).upper; break;
    case 'bb_mid': values = bollinger(closes, period, mult).middle; break;
    case 'bb_lower': values = bollinger(closes, period, mult).lower; break;
    case 'macd_line':
    case 'macd_signal':
    case 'macd_hist': {
      const f = Math.max(2, Math.min(200, Math.round(Number(operand?.fast) || 12)));
      const s = Math.max(f + 1, Math.min(300, Math.round(Number(operand?.slow) || 26)));
      const sg = Math.max(2, Math.min(100, Math.round(Number(operand?.signal) || 9)));
      const m = customMacd(closes, f, s, sg);
      values = type === 'macd_line' ? m.line : type === 'macd_signal' ? m.signal : m.histogram;
      break;
    }
    case 'supertrend': values = supertrendSeries(bars, period, mult).line; break;
    case 'adx': values = adxSeries(bars, period).adx; break;
    case 'plus_di': values = adxSeries(bars, period).plusDI; break;
    case 'minus_di': values = adxSeries(bars, period).minusDI; break;
    case 'donchian_high': values = priorChannel(bars, period, true); break;
    case 'donchian_low': values = priorChannel(bars, period, false); break;
    case 'rvol': values = relativeVolume(bars, period); break;
    case 'roc': values = closes.map((c, i) => i >= period && closes[i - period] > 0 ? (c / closes[i - period] - 1) * 100 : null); break;
    case 'stoch_k': values = stochK(bars, period); break;
    case 'formula': {
      const ast = parseFormula(String(operand?.expr ?? 'close'));
      values = evaluateFormula(ast, bars);
      break;
    }
    default: throw Error(`Unsupported indicator "${type}".`);
  }
  cache.set(key, values);
  return values;
}

function compileRuleSet(rules, logic, bars, closes, cache) {
  if (!Array.isArray(rules) || !rules.length) return () => false;
  const compiled = rules.map(rule => ({
    left: resolveOperand(rule.left, bars, closes, cache),
    right: resolveOperand(rule.right, bars, closes, cache),
    op: rule.op,
  }));
  const checkOne = (r, i) => {
    const l = r.left[i], rv = r.right[i];
    if (!Number.isFinite(l) || !Number.isFinite(rv)) return false;
    if (r.op === '>') return l > rv;
    if (r.op === '<') return l < rv;
    if (r.op === '>=') return l >= rv;
    if (r.op === '<=') return l <= rv;
    if (i < 1) return false;
    const pl = r.left[i - 1], pr = r.right[i - 1];
    if (!Number.isFinite(pl) || !Number.isFinite(pr)) return false;
    if (r.op === 'crosses_above') return pl <= pr && l > rv;
    if (r.op === 'crosses_below') return pl >= pr && l < rv;
    return false;
  };
  return logic === 'OR'
    ? i => compiled.some(r => checkOne(r, i))
    : i => compiled.every(r => checkOne(r, i));
}

function inferStepSeconds(bars, interval) {
  if (interval && Object.hasOwn(INTERVALS, interval)) return INTERVALS[interval];
  if (bars.length < 2) return 3600;
  const diffs = [];
  for (let i = 1; i < Math.min(bars.length, 40); i++) {
    const d = bars[i].time - bars[i - 1].time;
    if (d > 0) diffs.push(d);
  }
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)] || 3600;
}

function summarizeSegment(equitySlice, tradesSlice, initialEquity, barsPerYear) {
  if (equitySlice.length < 2 || !(initialEquity > 0)) return null;
  const startEq = equitySlice[0].value;
  const endEq = equitySlice.at(-1).value;
  const totalReturnPct = (endEq / startEq - 1) * 100;
  const nBars = equitySlice.length - 1;
  const years = nBars / barsPerYear;
  const cagrPct = years > 0 && endEq > 0 && startEq > 0 ? (Math.pow(endEq / startEq, 1 / years) - 1) * 100 : null;

  let peak = startEq, maxDD = 0, sumDD = 0;
  const rets = [];
  const drawdownCurve = [];
  for (let i = 0; i < equitySlice.length; i++) {
    const eq = equitySlice[i].value;
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? (eq / peak - 1) * 100 : 0;
    if (dd < maxDD) maxDD = dd;
    sumDD += dd;
    drawdownCurve.push({ time: equitySlice[i].time, value: dd });
    if (i > 0 && equitySlice[i - 1].value > 0) rets.push(eq / equitySlice[i - 1].value - 1);
  }
  const meanR = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const variance = rets.length > 1 ? rets.reduce((s, r) => s + (r - meanR) ** 2, 0) / (rets.length - 1) : 0;
  const stdR = Math.sqrt(variance);
  const downVals = rets.filter(r => r < 0);
  const downDev = downVals.length > 1 ? Math.sqrt(downVals.reduce((s, r) => s + r * r, 0) / rets.length) : 0;
  const sharpe = stdR > 1e-12 ? (meanR / stdR) * Math.sqrt(barsPerYear) : null;
  const sortino = downDev > 1e-12 ? (meanR / downDev) * Math.sqrt(barsPerYear) : null;
  const calmar = cagrPct !== null && maxDD < -0.01 ? cagrPct / Math.abs(maxDD) : null;

  const wins = tradesSlice.filter(t => t.pnl > 0);
  const losses = tradesSlice.filter(t => t.pnl < 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : null);
  const winRatePct = tradesSlice.length ? (wins.length / tradesSlice.length) * 100 : null;
  const avgWin = wins.length ? grossWin / wins.length : null;
  const avgLoss = losses.length ? -grossLoss / losses.length : null;
  const payoffRatio = avgWin !== null && avgLoss !== null && avgLoss < 0 ? avgWin / Math.abs(avgLoss) : null;
  const expectancy = tradesSlice.length ? tradesSlice.reduce((s, t) => s + t.pnl, 0) / tradesSlice.length : null;
  const expectancyPct = tradesSlice.length ? tradesSlice.reduce((s, t) => s + t.returnPct, 0) / tradesSlice.length : null;
  const avgBarsHeld = tradesSlice.length ? tradesSlice.reduce((s, t) => s + t.barsHeld, 0) / tradesSlice.length : null;

  let curW = 0, maxW = 0, curL = 0, maxL = 0;
  for (const t of tradesSlice) {
    if (t.pnl > 0) { curW++; curL = 0; maxW = Math.max(maxW, curW); }
    else if (t.pnl < 0) { curL++; curW = 0; maxL = Math.max(maxL, curL); }
  }
  return {
    bars: equitySlice.length,
    finalEquity: endEq,
    totalReturnPct,
    cagrPct,
    maxDrawdownPct: maxDD,
    avgDrawdownPct: sumDD / equitySlice.length,
    sharpe, sortino, calmar,
    tradesCount: tradesSlice.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct, profitFactor, expectancy, expectancyPct, avgWin, avgLoss, payoffRatio, avgBarsHeld,
    maxConsecutiveWins: maxW, maxConsecutiveLosses: maxL,
    drawdownCurve,
  };
}

export function runOpenBacktest(rawBars, userConfig = {}, { interval } = {}) {
  const bars = normalizeCandles(rawBars);
  if (bars.length < 30) return { ready: false, reason: `Backtesting needs at least 30 valid candles (${bars.length} available).` };

  const cfg = { ...defaultBacktestConfig(), ...userConfig };
  const initialCapital = Number(cfg.initialCapital);
  const feeRate = Number(cfg.feeBps) / 10000;
  const slipRate = Number(cfg.slippageBps) / 10000;
  if (!Number.isFinite(initialCapital) || initialCapital <= 0 || initialCapital > 1e12) {
    return { ready: false, reason: 'Starting capital must be a positive number.' };
  }
  if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate > 0.1 || !Number.isFinite(slipRate) || slipRate < 0 || slipRate > 0.1) {
    return { ready: false, reason: 'Fee and slippage must be between 0 and 1000 bps.' };
  }

  const closes = bars.map(b => b.close);
  const atr14 = atr(bars, 14);
  const cache = new Map();
  let checkLongEntry, checkLongExit, checkShortEntry, checkShortExit;
  try {
    checkLongEntry = cfg.direction !== 'short' ? compileRuleSet(cfg.entryRules, cfg.entryLogic, bars, closes, cache) : () => false;
    checkLongExit = cfg.direction !== 'short' ? compileRuleSet(cfg.exitRules, cfg.exitLogic, bars, closes, cache) : () => false;
    checkShortEntry = cfg.direction !== 'long' ? compileRuleSet(cfg.shortEntryRules, cfg.entryLogic, bars, closes, cache) : () => false;
    checkShortExit = cfg.direction !== 'long' ? compileRuleSet(cfg.shortExitRules, cfg.exitLogic, bars, closes, cache) : () => false;
  } catch (error) {
    return { ready: false, reason: `Rule error: ${error.message}` };
  }

  // Warmup: wait until at least 2 bars so crosses work, or skip leading all-null warmup cleanly
  const firstSignal = Math.min(20, Math.floor(bars.length * 0.15));
  const stepSec = inferStepSeconds(bars, interval);
  const barsPerYear = (365.25 * 86400) / Math.max(stepSec, 60);

  let cash = initialCapital;
  let position = null; // { side: 'long'|'short', entryIndex, entryTime, entryPrice, quantity, margin, entryFee, stopPrice, takePrice, trailExtreme }
  let pendingAction = null; // { action: 'open-long'|'open-short'|'close', reason }
  let totalFees = 0;
  let barsInMarket = 0;
  let cooldownUntil = -1;
  const trades = [];
  const equityCurve = [];
  const benchmarkCurve = [];

  const bhEntryPrice = bars[firstSignal].open * (1 + slipRate);
  const bhQty = (initialCapital / (1 + feeRate)) / bhEntryPrice;

  const computeStopDist = (mode, val, entryPrice, barAtr) => {
    const v = Number(val);
    if (!Number.isFinite(v) || v <= 0) return null;
    if (mode === 'pct') return entryPrice * (v / 100);
    if (mode === 'atr') return Number.isFinite(barAtr) && barAtr > 0 ? barAtr * v : null;
    return null;
  };

  const openPosition = (side, bar, idx) => {
    if (cash <= 0) return;
    const fillPrice = side === 'long' ? bar.open * (1 + slipRate) : bar.open * (1 - slipRate);
    if (!(fillPrice > 0)) return;
    const prevAtr = atr14[Math.max(0, idx - 1)];
    const slDist = computeStopDist(cfg.stopLossMode, cfg.stopLossValue, fillPrice, prevAtr);
    const tpDist = computeStopDist(cfg.takeProfitMode, cfg.takeProfitValue, fillPrice, prevAtr);

    let budget = cash;
    const sz = Math.max(0.01, Number(cfg.sizingValue) || 100);
    if (cfg.sizingMode === 'pct_equity') {
      budget = cash * Math.min(1, sz / 100);
    } else if (cfg.sizingMode === 'fixed_quote') {
      budget = Math.min(cash, sz);
    } else if (cfg.sizingMode === 'risk_pct' && slDist && slDist > 0) {
      const riskAmount = cash * Math.min(0.5, sz / 100);
      const qtyByRisk = riskAmount / slDist;
      budget = Math.min(cash, qtyByRisk * fillPrice * (1 + feeRate));
    }
    if (budget <= 1e-6) return;
    const entryFee = budget * feeRate / (1 + feeRate);
    const notional = budget - entryFee;
    const quantity = notional / fillPrice;
    cash -= budget;
    totalFees += entryFee;

    position = {
      side, entryIndex: idx, entryTime: bar.time, entryPrice: fillPrice,
      quantity, margin: notional, entryFee,
      stopPrice: slDist ? (side === 'long' ? fillPrice - slDist : fillPrice + slDist) : null,
      takePrice: tpDist ? (side === 'long' ? fillPrice + tpDist : fillPrice - tpDist) : null,
      trailExtreme: fillPrice,
      entryAtr: prevAtr,
    };
  };

  const closePosition = (exitPriceRaw, bar, idx, reason, applySlip = true) => {
    if (!position) return;
    const isLong = position.side === 'long';
    const exitPrice = applySlip
      ? (isLong ? exitPriceRaw * (1 - slipRate) : exitPriceRaw * (1 + slipRate))
      : exitPriceRaw;
    const safeExit = Math.max(1e-12, exitPrice);
    const grossPnl = isLong
      ? position.quantity * (safeExit - position.entryPrice)
      : position.quantity * (position.entryPrice - safeExit);
    const exitNotional = position.quantity * safeExit;
    const exitFee = exitNotional * feeRate;
    const returned = Math.max(0, position.margin + grossPnl - exitFee);
    cash += returned;
    totalFees += exitFee;
    const netPnl = returned - (position.margin + position.entryFee);
    const returnPct = (position.margin + position.entryFee) > 0 ? (netPnl / (position.margin + position.entryFee)) * 100 : 0;

    trades.push({
      id: trades.length + 1,
      side: position.side,
      entryTime: position.entryTime,
      exitTime: bar.time,
      entryPrice: position.entryPrice,
      exitPrice: safeExit,
      quantity: position.quantity,
      fees: position.entryFee + exitFee,
      pnl: netPnl,
      returnPct,
      barsHeld: idx - position.entryIndex,
      reason,
    });
    position = null;
    const cd = Math.max(0, Math.round(Number(cfg.cooldownBars) || 0));
    if (cd > 0) cooldownUntil = idx + cd;
  };

  for (let i = firstSignal; i < bars.length; i++) {
    const bar = bars[i];

    // 1. Execute pending next-bar-open order decided at previous bar's close
    if (pendingAction) {
      if (pendingAction.action === 'close' && position) {
        closePosition(bar.open, bar, i, pendingAction.reason);
      } else if (pendingAction.action === 'flip-long') {
        if (position?.side === 'short') closePosition(bar.open, bar, i, 'Signal flip');
        if (!position && i >= cooldownUntil) openPosition('long', bar, i);
      } else if (pendingAction.action === 'flip-short') {
        if (position?.side === 'long') closePosition(bar.open, bar, i, 'Signal flip');
        if (!position && i >= cooldownUntil) openPosition('short', bar, i);
      } else if (pendingAction.action === 'open-long' && !position && i >= cooldownUntil) {
        openPosition('long', bar, i);
      } else if (pendingAction.action === 'open-short' && !position && i >= cooldownUntil) {
        openPosition('short', bar, i);
      }
      pendingAction = null;
    }

    // 2. Intrabar Stop-Loss / Trailing Stop / Take-Profit check (conservative: SL evaluated before TP)
    if (position) {
      const isLong = position.side === 'long';
      const trailDist = computeStopDist(cfg.trailingMode, cfg.trailingValue, position.trailExtreme, atr14[Math.max(0, i - 1)] ?? position.entryAtr);
      let activeStop = position.stopPrice;
      if (trailDist) {
        const trailStop = isLong ? position.trailExtreme - trailDist : position.trailExtreme + trailDist;
        activeStop = activeStop === null ? trailStop : (isLong ? Math.max(activeStop, trailStop) : Math.min(activeStop, trailStop));
      }
      const hitStop = activeStop !== null && (isLong ? bar.low <= activeStop : bar.high >= activeStop);
      const hitTake = position.takePrice !== null && (isLong ? bar.high >= position.takePrice : bar.low <= position.takePrice);
      if (hitStop) {
        const fill = isLong ? Math.min(bar.open, activeStop) : Math.max(bar.open, activeStop);
        closePosition(fill, bar, i, trailDist && activeStop !== position.stopPrice ? 'Trailing stop' : 'Stop loss', true);
      } else if (hitTake) {
        const fill = isLong ? Math.max(bar.open, position.takePrice) : Math.min(bar.open, position.takePrice);
        closePosition(fill, bar, i, 'Take profit', false);
      } else {
        // Update trailing extreme after bar completes without stop-out
        position.trailExtreme = isLong ? Math.max(position.trailExtreme, bar.high) : Math.min(position.trailExtreme, bar.low);
      }
    }

    if (position) barsInMarket++;

    // 3. Mark-to-market equity at bar close
    let unrealized = 0;
    if (position) {
      unrealized = position.side === 'long'
        ? position.margin + position.quantity * (bar.close - position.entryPrice)
        : position.margin + position.quantity * (position.entryPrice - bar.close);
    }
    const equity = Math.max(0, cash + unrealized);
    const bhEquity = bhQty * bar.close;
    equityCurve.push({ time: bar.time, value: equity });
    benchmarkCurve.push({ time: bar.time, value: bhEquity });

    // 4. Evaluate signal rules on completed close for NEXT bar's open (zero lookahead!)
    if (i < bars.length - 1) {
      const maxHold = Math.max(0, Math.round(Number(cfg.maxHoldBars) || 0));
      if (position) {
        const heldTooLong = maxHold > 0 && (i - position.entryIndex) >= maxHold;
        if (heldTooLong) {
          pendingAction = { action: 'close', reason: `Max hold (${maxHold} bars)` };
        } else if (position.side === 'long') {
          if (cfg.direction === 'both' && checkShortEntry(i)) pendingAction = { action: 'flip-short', reason: 'Short signal' };
          else if (checkLongExit(i)) pendingAction = { action: 'close', reason: 'Exit rule' };
        } else {
          if (cfg.direction === 'both' && checkLongEntry(i)) pendingAction = { action: 'flip-long', reason: 'Long signal' };
          else if (checkShortExit(i)) pendingAction = { action: 'close', reason: 'Exit rule' };
        }
      } else if (i + 1 >= cooldownUntil) {
        if (checkLongEntry(i)) pendingAction = { action: 'open-long', reason: 'Entry rule' };
        else if (checkShortEntry(i)) pendingAction = { action: 'open-short', reason: 'Short entry' };
      }
    }
  }

  const fullSummary = summarizeSegment(equityCurve, trades, initialCapital, barsPerYear);
  const buyHoldReturnPct = (benchmarkCurve.at(-1).value / initialCapital - 1) * 100;
  const timeInMarketPct = equityCurve.length ? (barsInMarket / equityCurve.length) * 100 : 0;

  // Walk-forward In-Sample / Out-of-Sample split evaluation
  const splitPct = Math.max(0, Math.min(95, Number(cfg.splitPct) || 0));
  let walkForward = null;
  if (splitPct >= 20 && splitPct <= 90 && equityCurve.length >= 40) {
    const splitIdx = Math.floor(equityCurve.length * (splitPct / 100));
    const splitTime = equityCurve[splitIdx].time;
    const isTrades = trades.filter(t => t.exitTime < splitTime);
    const oosTrades = trades.filter(t => t.exitTime >= splitTime);
    walkForward = {
      splitPct,
      splitTime,
      inSample: summarizeSegment(equityCurve.slice(0, splitIdx), isTrades, equityCurve[0].value, barsPerYear),
      outOfSample: summarizeSegment(equityCurve.slice(splitIdx), oosTrades, equityCurve[splitIdx].value, barsPerYear),
    };
  }

  return {
    ready: true,
    config: cfg,
    startTime: bars[firstSignal].time,
    endTime: bars.at(-1).time,
    sampleBars: equityCurve.length,
    totalBars: bars.length,
    totalFees,
    timeInMarketPct,
    buyHoldReturnPct,
    alphaPct: fullSummary.totalReturnPct - buyHoldReturnPct,
    openPosition: position,
    ...fullSummary,
    trades,
    equityCurve,
    benchmarkCurve,
    walkForward,
  };
}

export function extractSweepableParameters(config) {
  const params = [];
  const pushRuleGroup = (groupKey, groupLabel) => {
    const rules = config[groupKey] ?? [];
    rules.forEach((rule, rIdx) => {
      for (const side of ['left', 'right']) {
        const op = rule[side];
        if (!op) continue;
        const meta = BT_INDICATORS.find(item => item.id === op.type);
        if (!meta) continue;
        for (const p of meta.params) {
          if (p.text) continue;
          params.push({
            path: `${groupKey}.${rIdx}.${side}.${p.key}`,
            label: `${groupLabel} #${rIdx + 1} · ${meta.label} ${p.label}`,
            current: Number(op[p.key] ?? p.default),
            min: p.min,
            max: p.max,
          });
        }
      }
    });
  };
  pushRuleGroup('entryRules', 'Long Entry');
  pushRuleGroup('exitRules', 'Long Exit');
  if (config.direction !== 'long') {
    pushRuleGroup('shortEntryRules', 'Short Entry');
    pushRuleGroup('shortExitRules', 'Short Exit');
  }
  if (config.stopLossMode !== 'none') params.push({ path: 'stopLossValue', label: `Stop Loss (${config.stopLossMode})`, current: Number(config.stopLossValue), min: 0.2, max: 50 });
  if (config.takeProfitMode !== 'none') params.push({ path: 'takeProfitValue', label: `Take Profit (${config.takeProfitMode})`, current: Number(config.takeProfitValue), min: 0.2, max: 200 });
  if (config.trailingMode !== 'none') params.push({ path: 'trailingValue', label: `Trailing Stop (${config.trailingMode})`, current: Number(config.trailingValue), min: 0.2, max: 50 });
  return params;
}

export function setParameterAtPath(config, path, value) {
  const clone = structuredClone(config);
  const parts = String(path).split('.');
  let cur = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (cur[k] === undefined) return clone;
    cur = cur[k];
  }
  const last = parts.at(-1);
  cur[last] = value;
  return clone;
}

export function runParameterSweep(bars, baseConfig, { path, min, max, step, rankBy = 'sharpe', interval } = {}) {
  const lo = Number(min), hi = Number(max), st = Number(step);
  if (!path || !Number.isFinite(lo) || !Number.isFinite(hi) || !Number.isFinite(st) || st <= 0 || hi < lo) {
    return { ready: false, reason: 'Specify a valid sweep range (Min ≤ Max, Step > 0).' };
  }
  const values = [];
  for (let v = lo; v <= hi + st * 1e-6 && values.length < 40; v += st) {
    values.push(Math.round(v * 1000) / 1000);
  }
  if (!values.length) return { ready: false, reason: 'No parameter values in sweep range.' };

  const rows = values.map(value => {
    const nextCfg = setParameterAtPath(baseConfig, path, value);
    const res = runOpenBacktest(bars, nextCfg, { interval });
    return {
      value,
      ready: res.ready,
      totalReturnPct: res.ready ? res.totalReturnPct : null,
      sharpe: res.ready ? res.sharpe : null,
      profitFactor: res.ready ? res.profitFactor : null,
      maxDrawdownPct: res.ready ? res.maxDrawdownPct : null,
      winRatePct: res.ready ? res.winRatePct : null,
      tradesCount: res.ready ? res.tradesCount : 0,
      oosReturnPct: res.walkForward?.outOfSample?.totalReturnPct ?? null,
    };
  }).filter(r => r.ready);

  const scoreOf = r => {
    const v = r[rankBy];
    if (v === Infinity) return 1e9;
    return Number.isFinite(v) ? v : -1e9;
  };
  rows.sort((a, b) => scoreOf(b) - scoreOf(a));
  return { ready: true, path, rankBy, rows };
}

export function parseOHLCVImport(rawText) {
  const text = String(rawText ?? '').trim();
  if (!text) throw Error('Provide CSV or JSON OHLCV data to import.');
  if (text.length > 8_000_000) throw Error('Dataset exceeds 8 MB limit.');

  let rawRows = [];
  if (text.startsWith('[') || text.startsWith('{')) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw Error('Invalid JSON OHLCV dataset.'); }
    const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.bars) ? parsed.bars : Array.isArray(parsed.data) ? parsed.data : null);
    if (!arr) throw Error('JSON must be an array of OHLCV objects or { bars: [...] }.');
    rawRows = arr.map(r => {
      if (Array.isArray(r) && r.length >= 5) {
        return { time: parseTimestamp(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5] ?? 0) };
      }
      return {
        time: parseTimestamp(r.time ?? r.timestamp ?? r.date ?? r.t),
        open: Number(r.open ?? r.o),
        high: Number(r.high ?? r.h),
        low: Number(r.low ?? r.l),
        close: Number(r.close ?? r.c),
        volume: Number(r.volume ?? r.vol ?? r.v ?? 0),
      };
    });
  } else {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 31) throw Error('CSV dataset must include at least 30 candle rows.');
    const firstCols = lines[0].split(/[,;\t]/).map(s => s.trim().toLowerCase().replace(/^"|"$/g, ''));
    const hasHeader = firstCols.some(c => ['time', 'timestamp', 'date', 'open', 'close'].includes(c));
    const idx = {
      time: hasHeader ? firstCols.findIndex(c => /^(time|timestamp|date|datetime|utc|open_time)$/.test(c)) : 0,
      open: hasHeader ? firstCols.findIndex(c => /^(open|o)$/.test(c)) : 1,
      high: hasHeader ? firstCols.findIndex(c => /^(high|h)$/.test(c)) : 2,
      low: hasHeader ? firstCols.findIndex(c => /^(low|l)$/.test(c)) : 3,
      close: hasHeader ? firstCols.findIndex(c => /^(close|c|price)$/.test(c)) : 4,
      volume: hasHeader ? firstCols.findIndex(c => /^(volume|vol|v|base_volume)$/.test(c)) : 5,
    };
    if (idx.time < 0 || idx.open < 0 || idx.high < 0 || idx.low < 0 || idx.close < 0) {
      throw Error('CSV header must include time/date, open, high, low, and close columns.');
    }
    const startRow = hasHeader ? 1 : 0;
    for (let i = startRow; i < lines.length; i++) {
      const cols = lines[i].split(/[,;\t]/).map(s => s.trim().replace(/^"|"$/g, ''));
      rawRows.push({
        time: parseTimestamp(cols[idx.time]),
        open: Number(cols[idx.open]),
        high: Number(cols[idx.high]),
        low: Number(cols[idx.low]),
        close: Number(cols[idx.close]),
        volume: idx.volume >= 0 ? Number(cols[idx.volume] || 0) : 0,
      });
    }
  }
  const bars = normalizeCandles(rawRows).slice(-6000);
  if (bars.length < 30) throw Error(`Only ${bars.length} valid OHLCV rows found (minimum 30 required).`);
  return bars;
}

function parseTimestamp(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw);
  }
  const str = String(raw ?? '').trim();
  if (/^\d{9,13}$/.test(str)) {
    const n = Number(str);
    return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  }
  const ms = Date.parse(str);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
}

export function validateStrategyImport(rawText) {
  let parsed;
  try { parsed = JSON.parse(String(rawText ?? '')); } catch { throw Error('Invalid strategy JSON.'); }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entryRules) || !parsed.entryRules.length) {
    throw Error('Strategy JSON must include at least one entry rule in "entryRules".');
  }
  const base = defaultBacktestConfig();
  return {
    ...base,
    name: String(parsed.name ?? 'Imported strategy').slice(0, 80),
    direction: ['long', 'short', 'both'].includes(parsed.direction) ? parsed.direction : 'long',
    entryLogic: parsed.entryLogic === 'OR' ? 'OR' : 'AND',
    exitLogic: parsed.exitLogic === 'AND' ? 'AND' : 'OR',
    entryRules: parsed.entryRules.slice(0, 20),
    exitRules: Array.isArray(parsed.exitRules) ? parsed.exitRules.slice(0, 20) : base.exitRules,
    shortEntryRules: Array.isArray(parsed.shortEntryRules) ? parsed.shortEntryRules.slice(0, 20) : base.shortEntryRules,
    shortExitRules: Array.isArray(parsed.shortExitRules) ? parsed.shortExitRules.slice(0, 20) : base.shortExitRules,
    initialCapital: Number.isFinite(Number(parsed.initialCapital)) && Number(parsed.initialCapital) > 0 ? Number(parsed.initialCapital) : base.initialCapital,
    feeBps: Number.isFinite(Number(parsed.feeBps)) && Number(parsed.feeBps) >= 0 ? Number(parsed.feeBps) : base.feeBps,
    slippageBps: Number.isFinite(Number(parsed.slippageBps)) && Number(parsed.slippageBps) >= 0 ? Number(parsed.slippageBps) : base.slippageBps,
    sizingMode: ['pct_equity', 'fixed_quote', 'risk_pct'].includes(parsed.sizingMode) ? parsed.sizingMode : base.sizingMode,
    sizingValue: Number.isFinite(Number(parsed.sizingValue)) && Number(parsed.sizingValue) > 0 ? Number(parsed.sizingValue) : base.sizingValue,
    stopLossMode: ['none', 'pct', 'atr'].includes(parsed.stopLossMode) ? parsed.stopLossMode : 'none',
    stopLossValue: Number.isFinite(Number(parsed.stopLossValue)) ? Number(parsed.stopLossValue) : base.stopLossValue,
    takeProfitMode: ['none', 'pct', 'atr'].includes(parsed.takeProfitMode) ? parsed.takeProfitMode : 'none',
    takeProfitValue: Number.isFinite(Number(parsed.takeProfitValue)) ? Number(parsed.takeProfitValue) : base.takeProfitValue,
    trailingMode: ['none', 'pct', 'atr'].includes(parsed.trailingMode) ? parsed.trailingMode : 'none',
    trailingValue: Number.isFinite(Number(parsed.trailingValue)) ? Number(parsed.trailingValue) : base.trailingValue,
    maxHoldBars: Math.max(0, Math.round(Number(parsed.maxHoldBars) || 0)),
    cooldownBars: Math.max(0, Math.round(Number(parsed.cooldownBars) || 0)),
    splitPct: Math.max(0, Math.min(95, Number(parsed.splitPct ?? base.splitPct))),
  };
}
