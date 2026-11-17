import {macd, normalizeCandles, rsi} from './analytics.js';
import {formatter, pricePrecision} from './numbers.js';
import {INTERVALS} from './preferences.js';

const RANGE_WINDOW = 20;
const SWING_WINDOW = 60;
const SWING_WIDTH = 2;
const EVENT_WINDOW = 80;
const MOMENTUM_WINDOW = 100;
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

function addMomentumEvents(events, bar, step, previous, current, sampleStartTime) {
  if (Number.isFinite(previous.macd) && Number.isFinite(current.macd)) {
    const up = previous.macd <= 0 && current.macd > 0;
    const down = previous.macd >= 0 && current.macd < 0;
    if (up || down) {
      const relation = up ? 'above' : 'below';
      events.push(event(bar, step, 'macd', up ? 'up' : 'down', `MACD crossed ${relation} signal`,
        `The 12/26/9 MACD histogram moved from ${momentumText(previous.macd)} to ${momentumText(current.macd)}.`,
        {previous: previous.macd, value: current.macd, threshold: 0, sampleStartTime, sampleCount: MOMENTUM_WINDOW + 1}));
    }
  }
  const recovered = previous.rsi <= 30 && current.rsi > 30;
  const cooled = previous.rsi >= 70 && current.rsi < 70;
  if (Number.isFinite(previous.rsi) && Number.isFinite(current.rsi) && (recovered || cooled)) {
    const threshold = recovered ? 30 : 70;
    events.push(event(bar, step, 'rsi', recovered ? 'up' : 'down', `RSI moved ${recovered ? 'above' : 'below'} ${threshold}`,
      `RSI 14 moved from ${momentumText(previous.rsi)} to ${momentumText(current.rsi)} at the close.`,
      {previous: previous.rsi, value: current.rsi, threshold, sampleStartTime, sampleCount: MOMENTUM_WINDOW + 1}));
  }
}

function compareMomentum(events, bars, i, step) {
  // Both values share an indicator seed. Dropping one candle from a rolling
  // seed between the two values could create a transition with no price move.
  const sampleStart = i - MOMENTUM_WINDOW;
  const closes = bars.slice(sampleStart, i + 1).map(bar => bar.close);
  const histogram = macd(closes).histogram;
  const strength = rsi(closes);
  const valueAt = offset => {
    const value = histogram.at(offset);
    return {macd: Math.abs(value) <= closes.at(offset) * 1e-12 ? 0 : value, rsi: strength.at(offset)};
  };
  addMomentumEvents(events, bars[i], step, valueAt(-2), valueAt(-1), bars[sampleStart].time);
}

function recentEvents(closed, step) {
  const events = [];
  const eventStart = closed.at(-1).time - (EVENT_WINDOW - 1) * step;
  let runStart = Math.max(0, closed.length - EVENT_WINDOW - MOMENTUM_WINDOW);
  for (let i = runStart; i < closed.length; i++) {
    const bar = closed[i];
    if (i > runStart && bar.time - closed[i - 1].time !== step) runStart = i;
    if (bar.time < eventStart) continue;
    const previousCount = i - runStart;
    if (previousCount > RANGE_WINDOW) addRangeEvent(events, closed, i, step);
    if (previousCount >= MOMENTUM_WINDOW) compareMomentum(events, closed, i, step);
  }
  return events;
}

export function buildAutoSetup(bars, {interval, completedBefore, nowSeconds = Date.now() / 1000, stale = false} = {}) {
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
  const events = recentEvents(closed, step);
  const ready = guides.length > 0;
  const reason = sample.length < RANGE_WINDOW
    ? first > 0 ? 'A candle gap limits the recent sample.' : `Recent range needs ${RANGE_WINDOW} consecutive closed candles.`
    : 'The latest closed candles have a flat range.';
  return {
    ready, reason: ready ? null : reason, stale: base.stale || nowSeconds - closedAt >= step,
    closedAt, sampleCount: sample.length, range, trend, fibonacci, guides, events
  };
}
