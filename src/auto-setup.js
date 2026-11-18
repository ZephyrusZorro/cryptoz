import {ema, macd, normalizeCandles, rsi} from './analytics.js';
import {formatter, pricePrecision} from './numbers.js';
import {INTERVALS} from './preferences.js';

const RANGE_WINDOW = 20;
const SWING_WINDOW = 60;
const SWING_WIDTH = 2;
const RETRACEMENTS = [0.236, 0.382, 0.5, 0.618, 0.786];

const priceText = value => formatter({maximumFractionDigits: pricePrecision(value)}).format(value);
const momentumText = value => formatter({maximumSignificantDigits: 4}).format(value);

function rangeAnchors(bars) {
  let high = bars[0];
  let low = bars[0];
  for (const bar of bars) {
    if (bar.high > high.high) high = bar;
    if (bar.low < low.low) low = bar;
  }
  return [
    {time: high.time, price: high.high, kind: 'high'},
    {time: low.time, price: low.low, kind: 'low'}
  ];
}

function confirmedSwings(bars, step) {
  const swings = [];
  for (let i = SWING_WIDTH; i < bars.length - SWING_WIDTH; i++) {
    const bar = bars[i];
    const neighbors = bars.slice(i - SWING_WIDTH, i + SWING_WIDTH + 1).filter(other => other !== bar);
    const high = neighbors.every(other => bar.high > other.high);
    const low = neighbors.every(other => bar.low < other.low);
    // A candle that makes both extremes gives no ordering within the interval.
    if (high === low) continue;
    const kind = high ? 'high' : 'low';
    swings.push({time: bar.time, price: bar[kind], kind, confirmedAt: bars[i + SWING_WIDTH].time + step});
  }
  return swings;
}

function swingTrend(swings) {
  const lows = swings.filter(swing => swing.kind === 'low').slice(-2);
  const highs = swings.filter(swing => swing.kind === 'high').slice(-2);
  const rising = lows.length === 2 && lows[1].price > lows[0].price;
  const falling = highs.length === 2 && highs[1].price < highs[0].price;
  if (!rising && !falling) return null;
  const up = rising && (!falling || lows[1].time > highs[1].time);
  const anchors = up ? lows : highs;
  return {
    label: up ? 'Auto rising support' : 'Auto falling resistance',
    direction: up ? 'up' : 'down',
    anchors,
    confirmedAt: anchors[1].confirmedAt,
    detail: up
      ? 'Connects the two latest confirmed swing lows, with the second low higher. Each swing needs two closed candles on each side.'
      : 'Connects the two latest confirmed swing highs, with the second high lower. Each swing needs two closed candles on each side.'
  };
}

function fibonacciLeg(swings) {
  const end = swings.at(-1);
  if (!end) return null;
  const start = swings.findLast(swing => swing.kind !== end.kind);
  const up = end.kind === 'high';
  if (!start || (up ? start.price >= end.price : start.price <= end.price)) return null;
  return {
    label: 'Auto Fibonacci',
    direction: up ? 'up' : 'down',
    anchors: [start, end],
    confirmedAt: end.confirmedAt,
    detail: 'Measures retracement from the end of the latest leg between opposite confirmed swings.',
    levels: RETRACEMENTS.map(ratio => ({ratio, price: end.price + (start.price - end.price) * ratio}))
  };
}

function horizontalGuide(id, label, color, price, from, to) {
  return {id, type: 'horizontal', label, color, points: [{time: from, price}, {time: to, price}]};
}

function setupGuides(range, trend, fibonacci, lastTime) {
  const guides = [];
  if (range) {
    guides.push(
      horizontalGuide('range-high', 'Auto range high', 'gold', range.high, range.startTime, lastTime),
      horizontalGuide('range-low', 'Auto range low', 'cyan', range.low, range.startTime, lastTime)
    );
  }
  if (trend) guides.push({id: 'swing-trend', type: 'trend', label: trend.label, color: 'accent', points: trend.anchors});
  if (fibonacci) {
    for (const {ratio, price} of fibonacci.levels) {
      const label = `Auto Fib ${Math.round(ratio * 1000) / 10}%`;
      guides.push(horizontalGuide(`fibonacci-${ratio}`, label, 'violet', price, fibonacci.anchors[0].time, lastTime));
    }
  }
  return guides;
}

function event(candle, step, kind, direction, label, detail, evidence) {
  return {id: `${kind}:${direction}:${candle.time}`, kind, direction, time: candle.time, confirmedAt: candle.time + step, label, detail, evidence};
}

function breakDirection(close, [high, low]) {
  if (close > high.price) return 'up';
  if (close < low.price) return 'down';
  return null;
}

function addRangeEvent(events, bars, i, step) {
  const bar = bars[i];
  const anchors = rangeAnchors(bars.slice(i - RANGE_WINDOW, i));
  const direction = breakDirection(bar.close, anchors);
  if (!direction) return;
  const prior = rangeAnchors(bars.slice(i - RANGE_WINDOW - 1, i - 1));
  if (breakDirection(bars[i - 1].close, prior) === direction) return;
  const up = direction === 'up';
  const anchor = anchors[up ? 0 : 1];
  const label = up ? 'Close above range' : 'Close below range';
  events.push(event(bar, step, 'range', direction, label,
    `Closed at ${priceText(bar.close)} ${up ? 'above' : 'below'} the prior ${RANGE_WINDOW}-candle ${anchor.kind} of ${priceText(anchor.price)}.`,
    {close: bar.close, level: anchor.price, anchorTime: anchor.time, rangeStartTime: bars[i - RANGE_WINDOW].time, rangeEndTime: bars[i - 1].time}));
}

function crossing(before, after, tolerance) {
  if (before <= tolerance && after > tolerance) return 'up';
  if (before >= -tolerance && after < -tolerance) return 'down';
  return null;
}

function addMomentumEvents(events, bar, step, previous, current, evidence, rsiPeriod) {
  if (Number.isFinite(previous.macd) && Number.isFinite(current.macd)) {
    const direction = crossing(previous.macd, current.macd, bar.close * 1e-12);
    if (direction) {
      const relation = direction === 'up' ? 'above' : 'below';
      events.push(event(bar, step, 'macd', direction, `MACD crossed ${relation} signal`,
        `The 12/26/9 MACD histogram moved from ${momentumText(previous.macd)} to ${momentumText(current.macd)}.`,
        {...evidence, previous: previous.macd, value: current.macd, threshold: 0}));
    }
  }
  const recovered = previous.rsi <= 30 && current.rsi > 30;
  const cooled = previous.rsi >= 70 && current.rsi < 70;
  if (Number.isFinite(previous.rsi) && Number.isFinite(current.rsi) && (recovered || cooled)) {
    const threshold = recovered ? 30 : 70;
    events.push(event(bar, step, 'rsi', recovered ? 'up' : 'down', `RSI moved ${recovered ? 'above' : 'below'} ${threshold}`,
      `RSI ${rsiPeriod} moved from ${momentumText(previous.rsi)} to ${momentumText(current.rsi)} at the close.`,
      {...evidence, previous: previous.rsi, value: current.rsi, threshold, lookback: rsiPeriod}));
  }
}

export function buildAutoSetup(bars, {interval, completedBefore, nowSeconds = Date.now() / 1000, stale = false, events} = {}) {
  const step = Object.hasOwn(INTERVALS, interval) ? INTERVALS[interval] : 0;
  const base = {ready: false, stale: stale === true, closedAt: null, sampleCount: 0, range: null, trend: null, fibonacci: null, guides: [], events: []};
  if (!step || !Number.isFinite(nowSeconds) || !Number.isFinite(completedBefore)) {
    return {...base, reason: 'Waiting for confirmed market history.'};
  }
  const cutoff = Math.min(nowSeconds, completedBefore);
  const eligible = Array.isArray(bars)
    ? bars.filter(bar => Number.isInteger(bar?.time) && bar.time % step === 0 && bar.time + step <= cutoff)
    : [];
  const closed = normalizeCandles(eligible);
  if (!closed.length) return {...base, reason: 'Waiting for a completed candle from this market.'};

  const last = closed.at(-1);
  const closedAt = last.time + step;
  let first = closed.length - 1;
  while (first > 0 && closed.length - first < SWING_WINDOW && closed[first].time - closed[first - 1].time === step) first--;
  const sample = closed.slice(first);
  const recent = sample.slice(-RANGE_WINDOW);
  const anchors = recent.length === RANGE_WINDOW ? rangeAnchors(recent) : null;
  const range = anchors && anchors[0].price > anchors[1].price ? {
    label: 'Auto recent range',
    high: anchors[0].price, low: anchors[1].price,
    startTime: recent[0].time, endTime: last.time, confirmedAt: closedAt,
    lookback: RANGE_WINDOW, anchors,
    detail: `Uses the highest wick and lowest wick from the latest ${RANGE_WINDOW} consecutive closed candles.`
  } : null;
  const swings = confirmedSwings(sample, step);
  const trend = swingTrend(swings);
  const fibonacci = fibonacciLeg(swings);
  const guides = setupGuides(range, trend, fibonacci, last.time);
  const ready = guides.length > 0;
  const reason = sample.length < RANGE_WINDOW
    ? first > 0 ? 'A candle gap limits the recent sample.' : `Recent range needs ${RANGE_WINDOW} consecutive closed candles.`
    : 'The latest closed candles have a flat range.';
  return {
    ready, reason: ready ? null : reason, stale: base.stale || nowSeconds - closedAt >= step,
    closedAt, sampleCount: sample.length, range, trend, fibonacci, guides,
    events: events ?? chartSignalEvents(closed, closed, {step, kinds: ['range', 'macd', 'rsi']})
  };
}

export function chartSignalEvents(bars, confirmed, {step, kinds, rsiPeriod = 14}) {
  if (!kinds.length || !confirmed.length) return [];
  const byTime = new Map(confirmed.map(bar => [bar.time, bar]));
  // Use the same input values as the overlays and oscillators. Requiring a
  // confirmed matching close prevents an unfinished or corrected bar from
  // producing a marker that disagrees with the visible price series.
  const closes = bars.map(bar => bar.close);
  const strength = kinds.includes('rsi') ? rsi(closes, rsiPeriod) : [];
  const histogram = kinds.includes('macd') ? macd(closes).histogram : [];
  const fast = kinds.includes('ema') ? ema(closes, 20) : [];
  const slow = kinds.includes('ema') ? ema(closes, 50) : [];
  const ranges = kinds.includes('range');
  const momentum = strength.length || histogram.length;
  const events = [];
  let consecutive = 0;
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (bars[i - 1]?.time + step !== bar.time) consecutive = 0;
    const verified = byTime.get(bar.time);
    if (!verified || verified !== bar && (
      bar.close !== verified.close || bar.open !== verified.open || bar.high !== verified.high ||
      bar.low !== verified.low || bar.volume !== verified.volume
    )) {
      consecutive = 0;
      continue;
    }
    consecutive++;
    const firstEvent = events.length;
    if (ranges && consecutive > RANGE_WINDOW + 1) addRangeEvent(events, bars, i, step);
    const evidence = {sampleStartTime: bars[0].time, sampleCount: i + 1};
    if (momentum) {
      const momentumAt = index => ({
        macd: consecutive >= 35 ? histogram[index] : undefined,
        rsi: consecutive >= rsiPeriod + 2 ? strength[index] : undefined
      });
      addMomentumEvents(events, bar, step, momentumAt(i - 1), momentumAt(i), evidence, rsiPeriod);
    }
    if (consecutive >= 51 && Number.isFinite(slow[i - 1])) {
      const before = fast[i - 1] - slow[i - 1];
      const after = fast[i] - slow[i];
      const direction = crossing(before, after, bar.close * 1e-12);
      if (direction) {
        const relation = direction === 'up' ? 'above' : 'below';
        events.push(event(bar, step, 'ema', direction, `EMA 20 crossed ${relation} EMA 50`,
          `The 20-candle EMA closed at ${priceText(fast[i])} and the 50-candle EMA closed at ${priceText(slow[i])}.`,
          {...evidence, previous: before, value: after, threshold: 0, ema20: fast[i], ema50: slow[i]}));
      }
    }
    for (let index = firstEvent; index < events.length; index++) events[index].price = bar.close;
  }
  return events;
}
