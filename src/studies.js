import {HistogramSeries, LineSeries, LineStyle} from 'lightweight-charts';
import {atr, bollinger, ema, macd, rsi, sma, vwap} from './analytics.js';
import {pricePrecision} from './numbers.js';
import {palette as chartPalette} from './theme.js';

const catalog = [
  {id: 'ema', label: 'EMA pair', group: 'Trend', placement: 'overlay',
    meaning: 'Two averages that give more weight to recent closes.', check: 'Compare price with both averages. Crossovers can lag or reverse quickly in a range.', warmup: 'The chosen lookback and 50 candles, one line at a time.'},
  {id: 'sma', label: 'Simple moving average', group: 'Trend', placement: 'overlay',
    meaning: 'The average close over the chosen number of candles.', check: 'Look at the slope and where price sits relative to the line.', warmup: 'One full lookback of closes.'},
  {id: 'wma', label: 'Weighted moving average', group: 'Trend', placement: 'overlay', proOnly: true,
    meaning: 'An average of closes with linearly increasing weights for recent candles.', check: 'Compare the slope with price and a simple average of the same length.', warmup: 'One full lookback of closes.'},
  {id: 'donchian', label: 'Donchian channel', group: 'Trend', placement: 'overlay',
    meaning: 'The high and low of the latest 20 candles.', check: 'Compare this candle with the prior channel to identify a new range extreme.', warmup: '20 candles.'},
  {id: 'levels', label: 'Recent high and low', group: 'Trend', placement: 'overlay',
    meaning: 'Horizontal levels at the highest high and lowest low of the last 20 closed candles.', check: 'Watch how price behaves when it revisits an extreme.', warmup: '20 closed candles.'},
  {id: 'rsi', label: 'Relative strength index', group: 'Momentum', placement: 'pane',
    meaning: 'Compares smoothed gains and losses on a 0 to 100 scale.', check: 'The 30 and 70 guides mark common extremes. Strong trends can stay there.', warmup: 'One more close than the RSI lookback.'},
  {id: 'macd', label: 'MACD', group: 'Momentum', placement: 'pane',
    meaning: 'The gap between the 12- and 26-candle EMAs, with a 9-candle signal EMA.', check: 'Compare MACD with its signal line. The bars show the difference.', warmup: '26 candles for MACD and 34 for the signal and bars.'},
  {id: 'stoch', label: 'Stochastic', group: 'Momentum', placement: 'pane',
    meaning: 'Shows where the close sits within its 14-candle range, smoothed twice.', check: 'Compare %K with %D around the 20 and 80 guides.', warmup: '16 candles for %K and 18 for %D, with a nonzero range.'},
  {id: 'roc', label: 'Rate of change', group: 'Momentum', placement: 'pane',
    meaning: 'The percent change from the close 12 candles ago.', check: 'Compare the sign and size with the current move in price.', warmup: '13 closes.'},
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
  {id: 'vwap', label: 'VWAP (UTC)', group: 'Volume', placement: 'overlay',
    meaning: 'An intraday, volume-weighted average of candle prices that resets at midnight UTC.', check: 'Compare price with the weighted average. The first loaded session may be partial.', warmup: 'At least one candle with volume in the UTC session. Use an intraday interval.'},
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
  {id: 'range', label: 'Check the range', description: 'See where price sits in its recent range and how wide it is.', studies: ['bb', 'levels', 'stoch']},
  {id: 'volume', label: 'Check trading activity', description: 'Compare candle volume with intraday average price and recent extremes.', studies: ['vwap', 'levels', 'volume']}
];

export const STUDY_PRESETS = Object.freeze(Object.fromEntries(presets.map(preset => [preset.id, Object.freeze({...preset, studies: Object.freeze(preset.studies)})])));
export const MAX_STUDY_OVERLAYS = 4;

export function normalizeStudyIds(ids) {
  if (!Array.isArray(ids)) return [];
  const active = [];
  let overlays = 0;
  let pane = false;
  for (let i = ids.length - 1; i >= 0; i--) {
    const id = ids[i];
    if (typeof id !== 'string' || !Object.hasOwn(STUDIES, id) || active.includes(id)) continue;
    if (STUDIES[id].placement === 'pane') {
      if (pane) continue;
      pane = true;
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

function recentLevels(bars, before) {
  const closed = bars.filter(bar => bar.time < before).slice(-20);
  if (closed.length < 20) return [];
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
  return closes.map((_, i) => {
    if (i + 1 < period) return null;
    return closes.slice(i - period + 1, i + 1).reduce((sum, close, j) => sum + close * (j + 1), 0) / totalWeight;
  });
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
  sma: ({closes, period}) => ({series: [line('main', `SMA ${period}`, sma(closes, period), 'accent')]}),
  wma: ({closes, period}) => ({series: [line('main', `WMA ${period}`, weightedAverage(closes, period), 'gold', {dashed: true})]}),
  bb: ({closes, period}) => ({series: bands('BB', bollinger(closes, period), 'cyan')}),
  bbw: ({closes, period}) => {
    const {middle, upper, lower} = bollinger(closes, period);
    const widths = middle.map((value, i) => value > 0 ? 100 * (upper[i] - lower[i]) / value : null);
    return {series: [line('main', `Bandwidth ${period}`, widths, 'cyan', {format: 'percent'})]};
  },
  vwap: ({bars, interval}) => interval === '1d'
    ? {note: 'Choose an intraday interval for UTC VWAP.'}
    : {series: [line('main', 'VWAP UTC', vwap(bars), 'up', {utcSession: true})]},
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
  levels: ({bars, completedBefore}) => ({levels: recentLevels(bars, completedBefore)}),
  rsi: ({closes, rsiPeriod}) => ({series: [line('main', `RSI ${rsiPeriod}`, rsi(closes, rsiPeriod), 'violet')], guides: [30, 70], bounds: [0, 100]}),
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
  roc: ({closes}) => ({series: [line('main', 'ROC 12', closes.map((value, i) => i >= 12 ? (value / closes[i - 12] - 1) * 100 : null), 'gold', {format: 'percent'})], guides: [0]}),
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

export function calculateStudies(bars, ids, {period = 20, rsiPeriod = 14, interval, completedBefore = Infinity} = {}) {
  const selected = normalizeStudyIds(ids);
  if (!selected.length) return [];
  const context = {
    bars, closes: bars.map(bar => bar.close), interval, completedBefore,
    period: Number.isInteger(period) && period >= 2 && period <= 200 ? period : 20,
    rsiPeriod: Number.isInteger(rsiPeriod) && rsiPeriod >= 2 && rsiPeriod <= 100 ? rsiPeriod : 14
  };
  return selected.map(id => {
    const mix = calculate[id](context);
    const result = {id, placement: STUDIES[id].placement, series: [], guides: [], levels: [], ...mix};
    result.ready = result.levels.length > 0 || result.series.some(plot => Number.isFinite(plot.values.at(-1)));
    return result;
  });
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
    // The line renderer uses this color for the segment leaving the point.
    point.color = 'transparent';
  }
  return point;
}

function seriesOptions(plot, result, colors, priceFormat) {
  const options = {title: plot.title, priceLineVisible: false, lastValueVisible: false};
  if (plot.kind === 'line') Object.assign(options, {
    color: colors[plot.color], lineWidth: 1,
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
  const hasPane = results.some(result => result.placement === 'pane' && result.series.length > 0);
  const tail = bars.at(-1);
  const beforeTail = bars.at(-2);
  const firstTime = bars[0]?.time;
  const appended = Boolean(beforeTail && bars.length === previousView?.length + 1 &&
    ['time', 'open', 'high', 'low', 'close', 'volume'].every(key => beforeTail[key] === previousView.lastBar[key]));
  const replacing = Boolean(tail && bars.length === previousView?.length && tail.time === previousView.lastBar.time);
  const incremental = options.incremental && firstTime === previousView?.firstTime && (appended || replacing);
  const precision = pricePrecision(tail?.close);
  const priceFormat = {type: 'price', precision, minMove: 10 ** -precision};

  for (const result of results) {
    const pane = result.placement === 'pane' ? 1 : 0;
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
      series.set(key, {series: s, signature, lastColor: point?.color, priorColor: priorPoint?.color});
    }
  }

  // Removing the final series in a pane also removes the pane and its resized height.
  for (const [key, entry] of previousView?.series ?? []) {
    if (!series.has(key)) chart.removeSeries(entry.series);
  }

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

  return {results, series, levels, hasPane, paneChanged: hasPane !== Boolean(previousView?.hasPane), firstTime, lastBar: tail && {...tail}, length: bars.length};
}
