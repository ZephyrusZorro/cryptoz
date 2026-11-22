import assert from 'node:assert/strict';
import test from 'node:test';
import { atr, bollinger, ema, macd, rsi, sma } from '../src/analytics.js';
import { adxSeries } from '../src/studies.js';
import { compileClosedState, evaluateLiveReading, formatCountdown } from '../src/live-reading-engine.js';
import { buildStudyPov } from '../src/study-pov.js';
import { TerminalChart } from '../src/chart.js';

const DAY = 86400;
const startDay = 1_760_000_000 - (1_760_000_000 % DAY);
const instrument = { venue: 'binance', symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT' };

function makeDailyTrend(count = 55) {
  const bars = [];
  let px = 82000;
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i * 0.65) * 900;
    const close = Math.max(48000, px - 420 + wave * 0.25);
    const open = px;
    const high = Math.max(open, close) + 750 + (i % 4) * 180;
    const low = Math.min(open, close) - 680 - (i % 3) * 140;
    bars.push({
      time: startDay + i * DAY,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 1200 + (i % 7) * 240,
    });
    px = close;
  }
  return bars;
}

test('O(1) incremental live indicators match full O(N) recomputation to machine precision', () => {
  const history = makeDailyTrend(50);
  const last = history.at(-1);
  const liveBar = {
    time: last.time + DAY,
    open: last.close,
    high: last.close + 2600,
    low: last.close - 450,
    close: last.close + 2150,
    volume: 1450,
  };
  const combined = [...history, liveBar];
  const closes = combined.map(b => b.close);

  const compiled = compileClosedState(history, DAY);
  const live = evaluateLiveReading(compiled, { liveBar, nowSeconds: liveBar.time + DAY * 0.4 });
  assert.ok(live && live.active);

  const eps = 1e-7;
  assert.ok(Math.abs(live.metrics.sma20 - sma(closes, 20).at(-1)) < eps, 'SMA 20 mismatch');
  assert.ok(Math.abs(live.metrics.sma50 - sma(closes, 50).at(-1)) < eps, 'SMA 50 mismatch');
  assert.ok(Math.abs(live.metrics.ema9 - ema(closes, 9).at(-1)) < eps, 'EMA 9 mismatch');
  assert.ok(Math.abs(live.metrics.ema20 - ema(closes, 20).at(-1)) < eps, 'EMA 20 mismatch');
  assert.ok(Math.abs(live.metrics.macdHist - macd(closes).histogram.at(-1)) < eps, 'MACD histogram mismatch');
  assert.ok(Math.abs(live.metrics.rsi - rsi(closes, 14).at(-1)) < eps, 'RSI 14 mismatch');
  assert.ok(Math.abs(live.metrics.atr - atr(combined, 14).at(-1)) < eps, 'ATR 14 mismatch');

  const fullAdx = adxSeries(combined, 14);
  assert.ok(Math.abs(live.metrics.adx - fullAdx.adx.at(-1)) < eps, 'ADX 14 mismatch');
  assert.ok(Math.abs(live.metrics.plusDI - fullAdx.plusDI.at(-1)) < eps, '+DI mismatch');
  assert.ok(Math.abs(live.metrics.minusDI - fullAdx.minusDI.at(-1)) < eps, '-DI mismatch');

  const fullBb = bollinger(closes, 20, 2);
  const expectedBbw = ((fullBb.upper.at(-1) - fullBb.lower.at(-1)) / fullBb.middle.at(-1)) * 100;
  assert.ok(Math.abs(live.metrics.bbw - expectedBbw) < eps, 'BBW mismatch');

  const last20 = combined.slice(-20);
  const expectedVwap = last20.reduce((s, b) => s + ((b.high + b.low + b.close) / 3) * b.volume, 0)
    / last20.reduce((s, b) => s + b.volume, 0);
  assert.ok(Math.abs(live.metrics.vwap20 - expectedVwap) < eps, 'VWAP 20 mismatch');
});

test('Live daily Chart Reading reacts immediately to intraday moves & chooses actionable triggers instead of frozen 20-day walls', () => {
  const history = makeDailyTrend(50);
  const closedEnd = history.at(-1).time + DAY;
  const lastClose = history.at(-1).close;
  const now = closedEnd + 6 * 3600; // 25% into the new daily candle

  const calmBar = { time: closedEnd, open: lastClose, high: lastClose + 300, low: lastClose - 400, close: lastClose - 200, volume: 450 };
  const rallyBar = { time: closedEnd, open: lastClose, high: lastClose + 5200, low: lastClose - 250, close: lastClose + 4900, volume: 1900 };

  const povCalm = buildStudyPov({
    bars: history, instrument, interval: '1d', nowSeconds: now, confirmedThrough: closedEnd,
    liveBar: calmBar, liveQuote: { price: calmBar.close }, includeLive: true,
  });
  const povRally = buildStudyPov({
    bars: history, instrument, interval: '1d', nowSeconds: now, confirmedThrough: closedEnd,
    liveBar: rallyBar, liveQuote: { price: rallyBar.close }, includeLive: true,
  });

  assert.equal(povCalm.ready, true);
  assert.equal(povRally.ready, true);
  assert.equal(povCalm.live.active, true);
  assert.equal(povRally.live.active, true);

  // Conviction, RSI, revisionKey, and narrative must all react immediately!
  assert.ok(povRally.live.conviction > povCalm.live.conviction + 15, 'Live rally must lift conviction score');
  assert.ok(povRally.live.convictionShift > 10, 'Intraday rally must record positive convictionShift');
  assert.ok(povRally.metrics.rsi > povCalm.metrics.rsi + 5, 'Live RSI must advance on rally');
  assert.notEqual(povRally.live.revisionKey, povCalm.live.revisionKey);
  assert.notEqual(povRally.outlook.summary, povCalm.outlook.summary);
  assert.equal(povCalm.outlook.factors.length, 6);

  // Actionable trigger must be much closer than the stale 20-day high!
  const stale20High = Math.max(...history.slice(-20).map(b => b.high));
  assert.ok(povCalm.outlook.upsideTrigger < stale20High, 'Upside trigger should use nearer structural resistance instead of stale 20-day high');
  assert.ok(povRally.outlook.activeBreach && povRally.outlook.activeBreach.kind === 'up', 'Rally breaching 7-bar high must surface live breakout test');

  // Time-normalized volume pace: 1900 volume at 25% of day -> ~7600 projected vs ~1900 avg -> > 2.5x pace!
  assert.ok(povRally.metrics.volumeRatio > 2.5, 'Time-normalized volume pace should project active participation');
});

test('TerminalChart dispatches live throttled summaries on forming ticks and synthesizes Coinbase forming bar without mutating studyBars', () => {
  const originalSocket = globalThis.WebSocket;
  globalThis.WebSocket = class { close() {} send() {} };
  let summaryCalls = 0;
  const chart = new TerminalChart({
    host: { clientHeight: 480, clientWidth: 640, classList: { toggle() {} } },
    workspace: { drawings: {} },
    save() {},
    onQuote() {},
    onBook() {},
    onStatus() {},
    onDrawings() {},
    onSummary() { summaryCalls++; },
  });
  const step = 3600;
  const nowSec = Math.floor(Date.now() / 1000);
  const currentBucket = Math.floor(nowSec / step) * step;
  const bars = Array.from({ length: 50 }, (_, i) => ({
    time: currentBucket - (50 - i) * step,
    open: 60000 + i * 10,
    high: 60100 + i * 10,
    low: 59900 + i * 10,
    close: 60050 + i * 10,
    volume: 100,
  }));
  chart.instrument = { venue: 'coinbase', symbol: 'BTC-USD', base: 'BTC', quote: 'USD' };
  chart.interval = '1h';
  chart.bars = [...bars];
  chart.observeStudyBars(bars, currentBucket);
  chart.series = { update() {} };

  try {
    const initialStudyLen = chart.studyBars.length;
    chart.applyLiveQuoteToFormingBar({ price: 61250 });
    assert.equal(chart.bars.length, 51, 'Coinbase live quote should synthesize forming candle');
    assert.equal(chart.bars.at(-1).close, 61250);
    assert.equal(chart.studyBars.length, initialStudyLen, 'Confirmed studyBars must remain untouched');

    chart.scheduleLiveSummary(61250, { immediate: true });
    assert.equal(summaryCalls, 1);

    const liveBar = chart.getLiveBar();
    assert.equal(liveBar.time, currentBucket);
    assert.equal(liveBar.close, 61250);
  } finally {
    chart.dispose();
    globalThis.WebSocket = originalSocket;
  }
});

test('O(1) live evaluation throughput handles 5,000 consecutive ticks in under 150ms', () => {
  const history = makeDailyTrend(50);
  const closedEnd = history.at(-1).time + DAY;
  const base = history.at(-1).close;
  const compiled = compileClosedState(history, DAY);
  const t0 = performance.now();
  let sink = 0;
  for (let i = 0; i < 5000; i++) {
    const px = base + Math.sin(i * 0.05) * 1800;
    const res = evaluateLiveReading(compiled, {
      liveBar: { time: closedEnd, open: base, high: Math.max(base, px), low: Math.min(base, px), close: px, volume: 100 + i * 0.2 },
      nowSeconds: closedEnd + 3600 + i,
    });
    sink += res.conviction;
  }
  const elapsed = performance.now() - t0;
  assert.ok(Number.isFinite(sink));
  assert.ok(elapsed < 150, `Expected 5,000 O(1) ticks under 150ms, got ${elapsed.toFixed(1)}ms`);
  assert.equal(formatCountdown(5420), '1h 30m');
  assert.equal(formatCountdown(125), '2m 05s');
});
