import {HistogramSeries, LineSeries, LineStyle} from 'lightweight-charts';
import {atr, bollinger, ema, macd, rsi, sma, vwap} from './analytics.js';
import {evaluateCustomStudy} from './custom-studies.js';
import {pricePrecision} from './numbers.js';
import {axisPriceFormat} from './currency.js';
import {palette as chartPalette} from './theme.js';

const catalog = [
  {id: 'ema', label: 'EMA pair', group: 'Trend', placement: 'overlay',
    meaning: 'Two averages that give more weight to recent closes.', check: 'Compare price with both averages. Crossovers can lag or reverse quickly in a range.', warmup: 'The chosen lookback and 50 candles, one line at a time.'},
  {id: 'ema-ribbon', label: 'EMA Ribbon (8/13/21/55/200)', group: 'Trend', placement: 'overlay',
    meaning: 'Five exponential averages stacked from fast swing to macro trend.', check: 'Expanding, aligned bands confirm sustained directional flow; compressed bands signal consolidation.', warmup: 'Each ribbon line starts after its own length (up to 200 bars).'},
  {id: 'sma', label: 'Simple moving average', group: 'Trend', placement: 'overlay',
    meaning: 'Plot up to 10 simultaneous simple moving averages, each with its own length.', check: 'Compare the slopes and see where price sits relative to faster and slower averages.', warmup: 'Each line needs its own full lookback.'},
  {id: 'supertrend', label: 'Supertrend (10, 3×)', group: 'Trend', placement: 'overlay',
    meaning: 'Volatility-adjusted trailing trend stop built from 10-bar Wilder ATR.', check: 'Line sits below price during uptrends and flips above price on a confirmed bearish break.', warmup: '10 candles.'},
  {id: 'ichimoku', label: 'Ichimoku Cloud (9/26/52)', group: 'Trend', placement: 'overlay',
    meaning: 'Tenkan-sen (9), Kijun-sen (26), and Span A/B trend equilibrium cloud.', check: 'Price above Span A & B signals bullish equilibrium; Tenkan/Kijun crosses track short-term momentum.', warmup: '52 candles for full cloud spans.'},
  {id: 'psar', label: 'Parabolic SAR', group: 'Trend', placement: 'overlay',
    meaning: 'Accelerating stop-and-reverse curve tracking directional trend momentum.', check: 'Watch flips across price as trailing momentum shifts; whipsaws can occur in flat ranges.', warmup: '2 candles.'},
  {id: 'vwma', label: 'Volume-weighted moving average', group: 'Trend', placement: 'overlay',
    meaning: 'A 20-candle average of closes that gives busier candles more weight.', check: 'Compare it with SMA 20 to see how volume shifts the average.', warmup: '20 candles with some traded volume.'},
  {id: 'wma', label: 'Weighted moving average', group: 'Trend', placement: 'overlay', proOnly: true,
    meaning: 'An average of closes with linearly increasing weights for recent candles.', check: 'Compare the slope with price and a simple average of the same length.', warmup: 'One full lookback of closes.'},
  {id: 'hma', label: 'Hull moving average', group: 'Trend', placement: 'overlay',
    meaning: 'A weighted price average designed to respond quickly to changes.', check: 'Compare its slope with price. Quick changes can reverse in a sideways market.', warmup: 'One lookback plus the square-root smoothing window.'},
  {id: 'donchian', label: 'Donchian channel', group: 'Trend', placement: 'overlay',
    meaning: 'The high and low of the latest 20 candles.', check: 'Compare this candle with the prior channel to identify a new range extreme.', warmup: '20 candles.'},
  {id: 'levels', label: 'Recent high and low', group: 'Trend', placement: 'overlay',
    meaning: 'Horizontal levels at the highest high and lowest low of the last 20 closed candles.', check: 'Watch how price behaves when it revisits an extreme.', warmup: '20 closed candles.'},
  {id: 'rsi', label: 'Relative strength index', group: 'Momentum', placement: 'pane',
    meaning: 'Compares smoothed gains and losses on a 0 to 100 scale.', check: 'The 30 and 70 guides mark common extremes. Strong trends can stay there.', warmup: 'One more close than the RSI lookback.'},
  {id: 'stoch-rsi', label: 'Stochastic RSI (14)', group: 'Momentum', placement: 'pane',
    meaning: 'Applies a Stochastic oscillator to RSI-14 to spotlight short-term overbought/oversold swings.', check: 'Watch %K/%D crosses near 20 and 80 in ranging or pullback regimes.', warmup: '30 candles.'},
  {id: 'adx', label: 'ADX & Directional Index (14)', group: 'Momentum', placement: 'pane',
    meaning: 'Measures trend strength (ADX) alongside bullish (+DI) and bearish (−DI) directional pressure.', check: 'ADX above 25 signals an active trend; compare +DI vs −DI for direction.', warmup: '28 candles.'},
  {id: 'macd', label: 'MACD', group: 'Momentum', placement: 'pane',
    meaning: 'The gap between the 12- and 26-candle EMAs, with a 9-candle signal EMA.', check: 'Compare MACD with its signal line. The bars show the difference.', warmup: '26 candles for MACD and 34 for the signal and bars.'},
  {id: 'stoch', label: 'Stochastic', group: 'Momentum', placement: 'pane',
    meaning: 'Shows where the close sits within its 14-candle range, smoothed twice.', check: 'Compare %K with %D around the 20 and 80 guides.', warmup: '16 candles for %K and 18 for %D, with a nonzero range.'},
  {id: 'williams', label: 'Williams %R', group: 'Momentum', placement: 'pane',
    meaning: 'Shows where the close sits in the 14-candle high–low range, on a −100 to 0 scale.', check: 'Read −20 and −80 as reference levels. Near 0 means the close is near the high.', warmup: '14 candles with a nonzero range.'},
  {id: 'roc', label: 'Rate of change', group: 'Momentum', placement: 'pane',
    meaning: 'The percent change from the close 12 candles ago.', check: 'Compare the sign and size with the current move in price.', warmup: '13 closes.'},
  {id: 'ppo', label: 'Percentage price oscillator', group: 'Momentum', placement: 'pane',
    meaning: 'Shows the gap between EMA 12 and EMA 26 as a percentage of EMA 26.', check: 'Compare the oscillator with its 9-candle signal line and the zero level.', warmup: '26 candles for the oscillator and 34 for the signal and bars.'},
  {id: 'cci', label: 'Commodity Channel Index', group: 'Momentum', placement: 'pane', proOnly: true,
    meaning: 'Expresses typical price’s distance from its 20-candle average using mean absolute deviation.', check: 'Read ±100 as reference levels. The index can extend in either direction.', warmup: '20 candles with variation in typical price.'},
  {id: 'bb', label: 'Bollinger Bands', group: 'Volatility', placement: 'overlay',
    meaning: 'A moving average plus and minus twice the standard deviation of closes.', check: 'Watch for bands that widen or narrow as volatility changes.', warmup: 'One full lookback of closes.'},
  {id: 'keltner', label: 'Keltner channel', group: 'Volatility', placement: 'overlay',
    meaning: 'A 20-candle EMA with bands set at twice the 10-candle average true range.', check: 'Compare channel width across periods of quiet and wider trading ranges.', warmup: '20 candles.'},
  {id: 'atr', label: 'Average true range', group: 'Volatility', placement: 'pane',
    meaning: 'The smoothed size of candle ranges, including gaps, in quote currency.', check: 'Compare the current 14-candle range measure with its earlier values.', warmup: '14 candles.'},
  {id: 'bbw', label: 'Bollinger Bandwidth', group: 'Volatility', placement: 'pane', proOnly: true,
    meaning: 'The width of the Bollinger Bands as a percentage of their middle band.', check: 'Compare recent widths to see whether volatility is expanding or contracting.', warmup: 'One full lookback of closes.'},
  {id: 'chop', label: 'Choppiness index', group: 'Volatility', placement: 'pane',
    meaning: 'Compares total movement with the high–low span over 14 candles.', check: 'Higher readings indicate back-and-forth trading. Lower readings indicate a more directional move.', warmup: '14 candles with a nonzero price span.'},
  {id: 'vwap', label: 'VWAP (UTC)', group: 'Volume', placement: 'overlay',
    meaning: 'An intraday, volume-weighted average of candle prices that resets at midnight UTC.', check: 'Compare price with the weighted average. The first loaded session may be partial.', warmup: 'At least one candle with volume in the UTC session. Use an intraday interval.'},
  {id: 'vwap-bands', label: 'VWAP ±1σ / ±2σ Bands', group: 'Volume', placement: 'overlay',
    meaning: 'Intraday UTC VWAP framed by volume-weighted standard deviation envelopes.', check: 'Stretched moves near ±2σ often mean-revert in range regimes or ride the outer band in breakouts.', warmup: 'Intraday candles with traded volume.'},
  {id: 'volume', label: 'Volume', group: 'Volume', placement: 'pane',
    meaning: 'The base asset amount traded at the selected venue during each candle.', check: 'Compare activity with recent bars. Bar color follows the candle’s price direction.', warmup: 'Available from the first candle.'},
  {id: 'obv', label: 'On-balance volume', group: 'Volume', placement: 'pane',
    meaning: 'Adds candle volume on a higher close and subtracts it on a lower close.', check: 'Compare the direction with price. The total starts at zero in the first loaded candle.', warmup: 'The first close sets the baseline. Changes start at the second candle.'},
  {id: 'mfi', label: 'Money flow index', group: 'Volume', placement: 'pane',
    meaning: 'A 0 to 100 measure of positive and negative price movement weighted by volume.', check: 'Compare the value with the 20 and 80 guides and check recent volume.', warmup: '15 candles and some volume-weighted price movement.'},
  {id: 'rvol', label: 'Relative volume', group: 'Volume', placement: 'pane', proOnly: true,
    meaning: 'Candle volume divided by average volume over the previous 20 candles on this venue.', check: 'A reading of 1.5 means volume is 1.5 times the prior average. An open candle’s volume is still building.', warmup: '20 earlier candles with a positive average volume.'},
  {id: 'cmf', label: 'Chaikin Money Flow', group: 'Volume', placement: 'pane', proOnly: true,
    meaning: 'Combines candle volume with where each close falls in its range over 20 candles.', check: 'Positive readings mean higher-in-range closes carried more weight.', warmup: '20 candles with some total volume.'}
];

export const STUDIES = Object.freeze(Object.fromEntries(catalog.map(study => [study.id, Object.freeze(study)])));

const presets = [
  {id: 'trend', label: 'Follow the trend', description: 'Compare price with moving averages and check momentum.', studies: ['ema', 'levels', 'rsi']},
  {id: 'institutional', label: 'Institutional swing', description: 'Supertrend, 5-line EMA Ribbon, ADX trend strength and volume.', studies: ['supertrend', 'ema-ribbon', 'adx', 'volume']},
  {id: 'breakout', label: 'Breakout & flow', description: 'Donchian channel, Bollinger Bands, Stochastic RSI and relative volume.', studies: ['donchian', 'bb', 'stoch-rsi', 'rvol']},
  {id: 'range', label: 'Check the range', description: 'See where price sits in its recent range and how wide it is.', studies: ['bb', 'levels', 'stoch']},
  {id: 'volume', label: 'Check trading activity', description: 'Compare candle volume with intraday VWAP bands and recent extremes.', studies: ['vwap-bands', 'levels', 'volume']}
];

export const STUDY_PRESETS = Object.freeze(Object.fromEntries(presets.map(preset => [preset.id, Object.freeze({...preset, studies: Object.freeze(preset.studies)})])));
export const MAX_STUDY_OVERLAYS = 12;
export const MAX_STUDY_PANES = 3;
export const MAX_SMA_PERIODS = 10;
export const MAX_SMA_LENGTH = 400;

export function normalizeSmaPeriods(values) {
  if(!Array.isArray(values))return [];
  return [...new Set(values.filter(n=>Number.isInteger(n)&&n>=2&&n<=MAX_SMA_LENGTH))].slice(0,MAX_SMA_PERIODS);
}

export function normalizeStudyIds(ids) {
  if (!Array.isArray(ids)) return [];
  const active = [];
  let overlays = 0;
  let panes = 0;
  for (let i = ids.length - 1; i >= 0; i--) {
    const id = ids[i];
    if (typeof id !== 'string' || !Object.hasOwn(STUDIES, id) || active.includes(id)) continue;
    if (STUDIES[id].placement === 'pane') {
      if (panes >= MAX_STUDY_PANES) continue;
      panes++;
    } else {
      if (overlays >= MAX_STUDY_OVERLAYS) continue;
      overlays++;
    }
    active.push(id);
  }
  return active.reverse();
}

function channel(bars, period) {
  const upper = [];
  const lower = [];
  for (let i = 0; i < bars.length; i++) {
    if (i + 1 < period) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let high = -Infinity;
    let low = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      high = Math.max(high, bars[j].high);
      low = Math.min(low, bars[j].low);
    }
    upper.push(high);
    lower.push(low);
  }
  return {upper, lower};
}

export function supertrendSeries(bars, period = 10, multiplier = 3) {
  const ranges = atr(bars, period);
  const finalUpper = [], finalLower = [], line = [], trend = [];
  for (let i = 0; i < bars.length; i++) {
    const r = ranges[i];
    if (!Number.isFinite(r)) {
      finalUpper.push(null); finalLower.push(null); line.push(null); trend.push(0);
      continue;
    }
    const hl2 = (bars[i].high + bars[i].low) / 2;
    const basicUpper = hl2 + multiplier * r;
    const basicLower = hl2 - multiplier * r;
    const prevUpper = finalUpper[i - 1], prevLower = finalLower[i - 1], prevClose = bars[i - 1]?.close;
    const upper = prevUpper === null || prevUpper === undefined
      ? basicUpper : (basicUpper < prevUpper || prevClose > prevUpper ? basicUpper : prevUpper);
    const lower = prevLower === null || prevLower === undefined
      ? basicLower : (basicLower > prevLower || prevClose < prevLower ? basicLower : prevLower);
    finalUpper.push(upper);
    finalLower.push(lower);
    const prevTrend = trend[i - 1] || 1;
    let dir = prevTrend;
    if (prevTrend === 1 && bars[i].close < lower) dir = -1;
    else if (prevTrend === -1 && bars[i].close > upper) dir = 1;
    trend.push(dir);
    line.push(dir === 1 ? lower : upper);
  }
  return {line, trend};
}

export function adxSeries(bars, period = 14) {
  const n = bars.length;
  const adx = Array(n).fill(null), plusDI = Array(n).fill(null), minusDI = Array(n).fill(null);
  if (n < period * 2) return {adx, plusDI, minusDI};
  const tr = Array(n).fill(0), pdm = Array(n).fill(0), mdm = Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    pdm[i] = up > down && up > 0 ? up : 0;
    mdm[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
  }
  let sTR = 0, sPDM = 0, sMDM = 0;
  for (let i = 1; i <= period; i++) { sTR += tr[i]; sPDM += pdm[i]; sMDM += mdm[i]; }
  const dx = Array(n).fill(null);
  for (let i = period; i < n; i++) {
    if (i > period) {
      sTR = sTR - sTR / period + tr[i];
      sPDM = sPDM - sPDM / period + pdm[i];
      sMDM = sMDM - sMDM / period + mdm[i];
    }
    if (sTR > 0) {
      const pdi = 100 * sPDM / sTR;
      const mdi = 100 * sMDM / sTR;
      plusDI[i] = pdi;
      minusDI[i] = mdi;
      dx[i] = (pdi + mdi) > 0 ? 100 * Math.abs(pdi - mdi) / (pdi + mdi) : 0;
    }
  }
  let adxSum = 0, adxCount = 0;
  for (let i = period; i < period * 2; i++) {
    if (dx[i] !== null) { adxSum += dx[i]; adxCount++; }
  }
  if (adxCount === period) {
    adx[period * 2 - 1] = adxSum / period;
    for (let i = period * 2; i < n; i++) {
      if (dx[i] !== null && adx[i - 1] !== null) {
        adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
      }
    }
  }
  return {adx, plusDI, minusDI};
}

function ichimokuLines(bars) {
  const mid = (period) => {
    const {upper, lower} = channel(bars, period);
    return upper.map((u, i) => u === null || lower[i] === null ? null : (u + lower[i]) / 2);
  };
  const tenkan = mid(9), kijun = mid(26), spanB = mid(52);
  const spanA = tenkan.map((t, i) => t === null || kijun[i] === null ? null : (t + kijun[i]) / 2);
  return {tenkan, kijun, spanA, spanB};
}

function parabolicSar(bars, step = 0.02, maxStep = 0.2) {
  if (bars.length < 2) return bars.map(() => null);
  const out = [null];
  let bull = bars[1].close >= bars[0].close;
  let af = step;
  let ep = bull ? Math.max(bars[0].high, bars[1].high) : Math.min(bars[0].low, bars[1].low);
  let sar = bull ? bars[0].low : bars[0].high;
  out.push(sar);
  for (let i = 2; i < bars.length; i++) {
    let next = sar + af * (ep - sar);
    if (bull) {
      next = Math.min(next, bars[i - 1].low, bars[i - 2].low);
      if (bars[i].low < next) {
        bull = false; next = ep; ep = bars[i].low; af = step;
      } else if (bars[i].high > ep) {
        ep = bars[i].high; af = Math.min(maxStep, af + step);
      }
    } else {
      next = Math.max(next, bars[i - 1].high, bars[i - 2].high);
      if (bars[i].high > next) {
        bull = true; next = ep; ep = bars[i].high; af = step;
      } else if (bars[i].low < ep) {
        ep = bars[i].low; af = Math.min(maxStep, af + step);
      }
    }
    sar = next;
    out.push(sar);
  }
  return out;
}

function vwapWithBands(bars) {
  let day = null, pv = 0, vol = 0, pv2 = 0;
  const mean = [], upper1 = [], lower1 = [], upper2 = [], lower2 = [];
  for (const b of bars) {
    const currentDay = Math.floor(b.time / 86400);
    if (currentDay !== day) { day = currentDay; pv = 0; vol = 0; pv2 = 0; }
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * b.volume;
    pv2 += tp * tp * b.volume;
    vol += b.volume;
    if (vol > 0) {
      const m = pv / vol;
      const variance = Math.max(0, pv2 / vol - m * m);
      const sd = Math.sqrt(variance);
      mean.push(m); upper1.push(m + sd); lower1.push(m - sd); upper2.push(m + 2 * sd); lower2.push(m - 2 * sd);
    } else {
      mean.push(null); upper1.push(null); lower1.push(null); upper2.push(null); lower2.push(null);
    }
  }
  return {mean, upper1, lower1, upper2, lower2};
}

function stochasticRsi(closes, period = 14) {
  const r = rsi(closes, period);
  const raw = r.map((v, i) => {
    if (v === null || i < period * 2 - 1) return null;
    let hi = -Infinity, lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (r[j] === null) return null;
      hi = Math.max(hi, r[j]); lo = Math.min(lo, r[j]);
    }
    return hi > lo ? 100 * (v - lo) / (hi - lo) : 50;
  });
  const k = sma(raw, 3);
  return {k, d: sma(k, 3)};
}

function recentLevels(bars, before) {
  const end = bars.findLastIndex(bar => bar.time < before) + 1;
  if (end < 20) return [];
  const closed = bars.slice(end - 20, end);
  return [
    {key: 'high', title: '20-bar high', value: Math.max(...closed.map(b => b.high)), color: 'gold'},
    {key: 'low', title: '20-bar low', value: Math.min(...closed.map(b => b.low)), color: 'cyan'}
  ];
}

function stochastic(bars) {
  const {upper, lower} = channel(bars, 14);
  const raw = bars.map((bar, i) => {
    const range = upper[i] - lower[i];
    return range > 0 ? 100 * (bar.close - lower[i]) / range : null;
  });
  const k = sma(raw, 3);
  return {k, d: sma(k, 3)};
}

function moneyFlow(bars) {
  const typical = bars.map(b => (b.high + b.low + b.close) / 3);
  const flow = typical.map((price, i) => i ? Math.sign(price - typical[i - 1]) * price * bars[i].volume : 0);
  return flow.map((_, i) => {
    if (i < 14) return null;
    let positive = 0;
    let negative = 0;
    for (let j = i - 13; j <= i; j++) {
      positive += Math.max(0, flow[j]);
      negative += Math.max(0, -flow[j]);
    }
    const total = positive + negative;
    return total > 0 ? 100 * (positive / total) : null;
  });
}

function weightedAverage(closes, period) {
  const totalWeight = period * (period + 1) / 2;
  let count=0,sum=0,weighted=0;
  return closes.map((close, i) => {
    if(!Number.isFinite(close)){count=0;sum=0;weighted=0;return null;}
    if(count<period){
      count++;
      weighted+=count*close;
      sum+=close;
    }else{
      weighted+=period*close-sum;
      sum+=close-closes[i-period];
    }
    return count===period?weighted/totalWeight:null;
  });
}

function hullAverage(closes, period) {
  const fast=weightedAverage(closes,Math.max(1,Math.floor(period/2)));
  const slow=weightedAverage(closes,period);
  return weightedAverage(slow.map((value,i)=>value===null?null:2*fast[i]-value),Math.max(1,Math.floor(Math.sqrt(period))));
}

function commodityChannel(bars) {
  const period = 20;
  const typical = bars.map(bar => (bar.high + bar.low + bar.close) / 3);
  return sma(typical, period).map((average, i) => {
    if (average === null) return null;
    const gap = typical[i] - average;
    const deviation = typical.slice(i - period + 1, i + 1).reduce((sum, price) => sum + Math.abs(price - average), 0) / period;
    return deviation > average * Number.EPSILON * period ? gap / (0.015 * deviation) : null;
  });
}

function relativeVolume(bars) {
  const period = 20;
  return bars.map((bar, i) => {
    if (i < period) return null;
    const average = bars.slice(i - period, i).reduce((sum, previous) => sum + previous.volume, 0) / period;
    return average > 0 ? bar.volume / average : null;
  });
}

function chaikinFlow(bars) {
  const period = 20;
  const multipliers = bars.map(bar => bar.high > bar.low ? 2 * ((bar.close - bar.low) / (bar.high - bar.low)) - 1 : 0);
  return bars.map((_, i) => {
    if (i + 1 < period) return null;
    let volume = 0;
    let flow = 0;
    for (let j = i - period + 1; j <= i; j++) {
      volume += bars[j].volume;
      flow += multipliers[j] * bars[j].volume;
    }
    return volume > 0 ? flow / volume : null;
  });
}

function choppiness(bars) {
  const period=14;
  const ranges=atr(bars,1), mean=sma(ranges,period);
  const {upper,lower}=channel(bars,period);
  return mean.map((value,i)=>{
    const span=upper[i]-lower[i];
    return value>0&&span>0?100*Math.log10(value*period/span)/Math.log10(period):null;
  });
}

const SMA_COLORS = ['accent', 'gold', 'cyan', 'violet', 'up', 'down', 'text', 'accent', 'gold', 'cyan'];
const line = (key, title, values, color, options = {}) => ({key, title, values, color, kind: 'line', ...options});
const histogram = (key, title, values, coloring, format) => ({key, title, values, coloring, format, kind: 'histogram'});
const bands = (title, values, color) => [
  line('upper', `${title} upper`, values.upper, color),
  line('middle', `${title} middle`, values.middle, 'text', {dashed: true}),
  line('lower', `${title} lower`, values.lower, color)
];

const calculate = {
  ema: ({closes, period}) => ({series: [
    line('main', `EMA ${period}`, ema(closes, period), 'gold'),
    ...(period === 50 ? [] : [line('slow', 'EMA 50', ema(closes, 50), 'violet')])
  ]}),
  'ema-ribbon': ({closes}) => ({series: [
    line('ema8', 'EMA 8', ema(closes, 8), 'up'),
    line('ema13', 'EMA 13', ema(closes, 13), 'cyan'),
    line('ema21', 'EMA 21', ema(closes, 21), 'accent'),
    line('ema55', 'EMA 55', ema(closes, 55), 'gold'),
    line('ema200', 'EMA 200', ema(closes, 200), 'violet')
  ]}),
  sma: ({closes, smaPeriods}) => ({series: smaPeriods.map((length,index)=>
    line(index?`sma-${length}`:'main',`SMA ${length}`,sma(closes,length),SMA_COLORS[index % SMA_COLORS.length], index >= 6 ? {dashed: true} : {})
  )}),
  supertrend: ({bars}) => {
    const {line: stLine, trend} = supertrendSeries(bars, 10, 3);
    return {series: [
      line('up', 'Supertrend ↑', stLine.map((v, i) => trend[i] === 1 ? v : null), 'up'),
      line('down', 'Supertrend ↓', stLine.map((v, i) => trend[i] === -1 ? v : null), 'down')
    ]};
  },
  ichimoku: ({bars}) => {
    const {tenkan, kijun, spanA, spanB} = ichimokuLines(bars);
    return {series: [
      line('tenkan', 'Tenkan 9', tenkan, 'cyan'),
      line('kijun', 'Kijun 26', kijun, 'gold'),
      line('spanA', 'Span A', spanA, 'up', {dashed: true}),
      line('spanB', 'Span B', spanB, 'down', {dashed: true})
    ]};
  },
  psar: ({bars}) => ({series: [line('main', 'Parabolic SAR', parabolicSar(bars), 'gold', {dashed: true})]}),
  vwma: ({bars}) => {
    const meanVolume=sma(bars.map(bar=>bar.volume),20);
    const weighted=sma(bars.map(bar=>bar.close*bar.volume),20);
    return {series:[line('main','VWMA 20',weighted.map((value,i)=>meanVolume[i]>0?value/meanVolume[i]:null),'up',{dashed:true})]};
  },
  wma: ({closes, period}) => ({series: [line('main', `WMA ${period}`, weightedAverage(closes, period), 'gold', {dashed: true})]}),
  hma: ({closes, period}) => ({series: [line('main', `HMA ${period}`, hullAverage(closes, period), 'violet')]}),
  bb: ({closes, period}) => ({series: bands('BB', bollinger(closes, period), 'cyan')}),
  bbw: ({closes, period}) => {
    const {middle, upper, lower} = bollinger(closes, period);
    const widths = middle.map((value, i) => value > 0 ? 100 * (upper[i] - lower[i]) / value : null);
    return {series: [line('main', `Bandwidth ${period}`, widths, 'cyan', {format: 'percent'})]};
  },
  vwap: ({bars, interval}) => interval === '1d'
    ? {note: 'Choose an intraday interval for UTC VWAP.'}
    : {series: [line('main', 'VWAP UTC', vwap(bars), 'up', {utcSession: true})]},
  'vwap-bands': ({bars, interval}) => {
    if (interval === '1d') return {note: 'Choose an intraday interval for UTC VWAP bands.'};
    const v = vwapWithBands(bars);
    return {series: [
      line('main', 'VWAP UTC', v.mean, 'up', {utcSession: true}),
      line('u1', 'VWAP +1σ', v.upper1, 'cyan', {dashed: true, utcSession: true}),
      line('l1', 'VWAP −1σ', v.lower1, 'cyan', {dashed: true, utcSession: true}),
      line('u2', 'VWAP +2σ', v.upper2, 'violet', {dashed: true, utcSession: true}),
      line('l2', 'VWAP −2σ', v.lower2, 'violet', {dashed: true, utcSession: true})
    ]};
  },
  donchian: ({bars}) => {
    const {upper, lower} = channel(bars, 20);
    return {series: [line('upper', 'Donchian high', upper, 'accent'), line('lower', 'Donchian low', lower, 'accent')]};
  },
  keltner: ({bars, closes}) => {
    const middle = ema(closes, 20);
    const range = atr(bars, 10);
    return {series: bands('Keltner', {
      middle,
      upper: middle.map((m, i) => m === null ? null : m + 2 * range[i]),
      lower: middle.map((m, i) => m === null ? null : m - 2 * range[i])
    }, 'violet')};
  },
  levels: ({confirmed, completedBefore}) => ({levels: recentLevels(confirmed, completedBefore)}),
  rsi: ({closes, rsiPeriod}) => ({series: [line('main', `RSI ${rsiPeriod}`, rsi(closes, rsiPeriod), 'violet')], guides: [30, 70], bounds: [0, 100]}),
  'stoch-rsi': ({closes, rsiPeriod}) => {
    const {k, d} = stochasticRsi(closes, rsiPeriod);
    return {series: [line('k', 'StochRSI %K', k, 'cyan'), line('d', 'StochRSI %D', d, 'gold')], guides: [20, 80], bounds: [0, 100]};
  },
  adx: ({bars}) => {
    const {adx, plusDI, minusDI} = adxSeries(bars, 14);
    return {series: [line('adx', 'ADX 14', adx, 'gold'), line('pdi', '+DI', plusDI, 'up'), line('mdi', '−DI', minusDI, 'down')], guides: [25]};
  },
  macd: ({closes}) => {
    const values = macd(closes);
    return {series: [
      line('main', 'MACD', values.line, 'gold', {format: 'price'}),
      line('signal', 'Signal', values.signal, 'violet', {format: 'price'}),
      histogram('histogram', 'MACD histogram', values.histogram, 'sign', 'price')
    ], guides: [0]};
  },
  volume: ({bars}) => ({series: [histogram('main', 'Volume', bars.map(bar => bar.volume), 'candle', 'volume')]}),
  atr: ({bars}) => ({series: [line('main', 'ATR 14', atr(bars), 'cyan', {format: 'price'})]}),
  stoch: ({bars}) => {
    const {k, d} = stochastic(bars);
    return {series: [line('k', '%K', k, 'gold'), line('d', '%D', d, 'violet')], guides: [20, 80], bounds: [0, 100]};
  },
  williams: ({bars}) => {
    const {upper,lower}=channel(bars,14);
    const values=bars.map((bar,i)=>upper[i]>lower[i]?100*(bar.close-upper[i])/(upper[i]-lower[i]):null);
    return {series:[line('main','Williams %R 14',values,'violet')],guides:[-80,-20],bounds:[-100,0]};
  },
  roc: ({closes}) => ({series: [line('main', 'ROC 12', closes.map((value, i) => i >= 12 ? (value / closes[i - 12] - 1) * 100 : null), 'gold', {format: 'percent'})], guides: [0]}),
  ppo: ({closes}) => {
    const fast=ema(closes,12),slow=ema(closes,26);
    const values=slow.map((value,i)=>value>0?(fast[i]-value)/value*100:null);
    const signal=ema(values,9);
    const difference=values.map((value,i)=>signal[i]===null?null:value-signal[i]);
    return {series:[line('main','PPO',values,'gold',{format:'percent'}),line('signal','Signal',signal,'violet',{format:'percent'}),histogram('histogram','PPO histogram',difference,'sign','percent')],guides:[0]};
  },
  chop: ({bars}) => ({series:[line('main','Choppiness 14',choppiness(bars),'cyan')],guides:[38.2,61.8]}),
  obv: ({bars}) => {
    let total = 0;
    return {series: [line('main', 'OBV', bars.map((bar, i) => {
      if (i > 0) total += Math.sign(bar.close - bars[i - 1].close) * bar.volume;
      return total;
    }), 'cyan', {format: 'volume'})]};
  },
  mfi: ({bars}) => ({series: [line('main', 'MFI 14', moneyFlow(bars), 'up')], guides: [20, 80], bounds: [0, 100]}),
  cci: ({bars}) => ({series: [line('main', 'CCI 20', commodityChannel(bars), 'gold')], guides: [-100, 0, 100]}),
  rvol: ({bars}) => ({series: [line('main', 'Relative volume', relativeVolume(bars), 'cyan')], guides: [1]}),
  cmf: ({bars}) => ({series: [line('main', 'CMF 20', chaikinFlow(bars), 'up')], guides: [0], bounds: [-1, 1]})
};

export function calculateStudies(bars, ids, {period = 20, smaPeriods, rsiPeriod = 14, interval, completedBefore = Infinity, confirmed = bars, customStudies = []} = {}) {
  const selected = normalizeStudyIds(ids);
  const activeCustom = Array.isArray(customStudies) ? customStudies.filter(c => c && c.enabled !== false && c.formula) : [];
  if (!selected.length && !activeCustom.length) return [];
  const defaultLength = Number.isInteger(period) && period >= 2 && period <= 200 ? period : 20;
  const lengths = normalizeSmaPeriods(smaPeriods);
  const context = {
    bars, closes: bars.map(bar => bar.close), interval, completedBefore, confirmed,
    period: defaultLength,
    smaPeriods: lengths.length ? lengths : [defaultLength],
    rsiPeriod: Number.isInteger(rsiPeriod) && rsiPeriod >= 2 && rsiPeriod <= 100 ? rsiPeriod : 14
  };
  const builtin = selected.map(id => {
    const mix = calculate[id](context);
    const result = {id, placement: STUDIES[id].placement, series: [], guides: [], levels: [], ...mix};
    result.ready = result.levels.length > 0 || result.series.some(plot => Number.isFinite(plot.values.at(-1)));
    return result;
  });
  const extra = [];
  for (const custom of activeCustom) {
    try { extra.push(evaluateCustomStudy(custom, bars)); } catch {}
  }
  return [...builtin, ...extra];
}

const utcDay = time => Math.floor(time / 86400);

function pointAt(plot, bars, i, colors) {
  const value = plot.values[i];
  const bar = bars[i];
  if (!Number.isFinite(value)) return {time: bar.time};
  const point = {time: bar.time, value};
  if (plot.kind === 'histogram') {
    const positive = plot.coloring === 'sign' ? value >= 0 : bar.close >= bar.open;
    point.color = (positive ? colors.up : colors.down) + '99';
  } else if (bars[i + 1] && (!Number.isFinite(plot.values[i + 1]) || (plot.utcSession && utcDay(bar.time) !== utcDay(bars[i + 1].time)))) {
    point.color = 'transparent';
  }
  return point;
}

function seriesOptions(plot, result, colors, priceFormat) {
  const options = {title: plot.title, priceLineVisible: false, lastValueVisible: false};
  if (plot.kind === 'line') Object.assign(options, {
    color: colors[plot.color] ?? colors.cyan, lineWidth: 1,
    lineStyle: plot.dashed ? LineStyle.Dashed : LineStyle.Solid,
    crosshairMarkerVisible: false
  });
  if (result.placement === 'overlay' || plot.format === 'price') options.priceFormat = priceFormat;
  else if (plot.format) options.priceFormat = {type: plot.format};
  if (result.bounds) {
    const [minValue, maxValue] = result.bounds;
    options.autoscaleInfoProvider = original => original() && ({priceRange: {minValue, maxValue}});
  } else if (result.guides.length) {
    options.autoscaleInfoProvider = original => {
      const scale = original();
      if (!scale?.priceRange) return scale;
      const {minValue, maxValue} = scale.priceRange;
      return {...scale, priceRange: {minValue: Math.min(...result.guides, minValue), maxValue: Math.max(...result.guides, maxValue)}};
    };
  }
  return options;
}

export function renderStudies(chart, priceSeries, previousView, bars, ids, options = {}) {
  const colors = options.palette ?? chartPalette();
  const results = calculateStudies(bars, ids, options);
  const series = new Map();
  const levels = new Map();
  const lower = results.filter(result => result.placement === 'pane' &&
    result.series.some(plot => plot.values.some(Number.isFinite)));
  const paneNumbers = new Map();
  const usedPanes = new Set();
  for(const {id} of lower){
    const old = previousView?.paneNumbers.get(id);
    if(old){paneNumbers.set(id,old);usedPanes.add(old);}
  }
  for(const {id} of lower){
    if(paneNumbers.has(id))continue;
    let index=1;
    while(usedPanes.has(index))index++;
    paneNumbers.set(id,index);
    usedPanes.add(index);
  }
  const tail = bars.at(-1);
  const beforeTail = bars.at(-2);
  const firstTime = bars[0]?.time;
  const appended = Boolean(beforeTail && bars.length === previousView?.length + 1 &&
    ['time', 'open', 'high', 'low', 'close', 'volume'].every(key => beforeTail[key] === previousView.lastBar[key]));
  const replacing = Boolean(tail && bars.length === previousView?.length && tail.time === previousView.lastBar.time);
  const incremental = options.incremental && firstTime === previousView?.firstTime && (appended || replacing);
  const precision = pricePrecision(tail?.close);
  const priceFormat = axisPriceFormat(precision,options.quote);

  for (const result of results) {
    const pane = result.placement === 'pane' ? paneNumbers.get(result.id) : 0;
    if (pane === undefined) continue;
    for (const [index, plot] of result.series.entries()) {
      const key = `${result.id}:${plot.key}`;
      const old = previousView?.series.get(key);
      const signature = `${plot.title}:${plot.color ? colors[plot.color] : ''}:${precision}`;
      const s = old?.series ?? chart.addSeries(plot.kind === 'line' ? LineSeries : HistogramSeries, seriesOptions(plot, result, colors, priceFormat), pane);
      if (old && signature !== old.signature) s.applyOptions(seriesOptions(plot, result, colors, priceFormat));
      const lastIndex = bars.length - 1;
      const point = lastIndex >= 0 ? pointAt(plot, bars, lastIndex, colors) : null;
      const priorPoint = lastIndex > 0 ? pointAt(plot, bars, lastIndex - 1, colors) : null;
      const changedPrior = priorPoint?.color !== old?.[appended ? 'lastColor' : 'priorColor'];
      if (incremental && old && signature === old.signature && point && !changedPrior) s.update(point);
      else s.setData(bars.map((_, i) => pointAt(plot, bars, i, colors)));

      if (!old && index === 0) {
        for (const price of result.guides) s.createPriceLine({price, color: colors.border, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true});
      }
      series.set(key, {series: s, signature, lastColor: point?.color, priorColor: priorPoint?.color, usesQuote:result.placement==='overlay'||plot.format==='price'});
    }
  }

  for (const [key, entry] of previousView?.series ?? []) {
    if (!series.has(key)) chart.removeSeries(entry.series);
  }
  const orderedPanes = [...paneNumbers.entries()].sort(([,a],[,b])=>a-b);
  orderedPanes.forEach(([id],i)=>paneNumbers.set(id,i+1));

  for (const level of results.flatMap(result => result.levels)) {
    const old = previousView?.levels.get(level.key);
    const color = colors[level.color];
    const priceLineOptions = {price: level.value, title: level.title, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true};
    const priceLine = old?.priceLine ?? priceSeries.createPriceLine(priceLineOptions);
    if (old && (old.value !== level.value || old.color !== color)) priceLine.applyOptions(priceLineOptions);
    levels.set(level.key, {priceLine, value: level.value, color});
  }
  for (const [key, entry] of previousView?.levels ?? []) {
    if (!levels.has(key)) priceSeries.removePriceLine(entry.priceLine);
  }

  return {results, series, levels, paneNumbers, paneChanged: paneNumbers.size !== (previousView?.paneNumbers.size??0), firstTime, lastBar: tail && {...tail}, length: bars.length};
}
