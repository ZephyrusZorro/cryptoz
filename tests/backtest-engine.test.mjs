import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BT_PRESETS, defaultBacktestConfig, extractSweepableParameters,
  parseOHLCVImport, runOpenBacktest, runParameterSweep, validateStrategyImport,
} from '../src/backtest-engine.js';

const start = 1700000000;
const step = 3600;
function makeWaveBars(count = 260) {
  let prev = 100;
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + Math.sin(i / 14) * 18 + i * 0.12;
    const open = prev;
    prev = close;
    const high = Math.max(open, close) + 1.2;
    const low = Math.min(open, close) - 1.2;
    return { time: start + i * step, open, high, low, close, volume: 100 + (i % 20) * 15 };
  });
}

test('all 6 built-in backtest presets run deterministically with next-bar open execution and full metrics', () => {
  const bars = makeWaveBars(300);
  for (const preset of BT_PRESETS) {
    const res = runOpenBacktest(bars, { ...defaultBacktestConfig(), ...preset.config }, { interval: '1h' });
    assert.equal(res.ready, true, `${preset.id} failed: ${res.reason}`);
    assert.equal(res.equityCurve.length, res.sampleBars);
    assert.equal(res.benchmarkCurve.length, res.sampleBars);
    assert.equal(res.drawdownCurve.length, res.sampleBars);
    assert.ok(Number.isFinite(res.finalEquity) && res.finalEquity > 0);
    assert.ok(res.maxDrawdownPct <= 0);
    assert.ok(res.walkForward && res.walkForward.inSample && res.walkForward.outOfSample);
  }
});

test('execution honors next-bar open fills with zero lookahead, fees, slippage, stop-loss and take-profit', () => {
  // Construct deterministic jump where entry triggers at bar 25 close, fills at bar 26 open, then crashes to stop loss at bar 28
  const bars = Array.from({ length: 60 }, (_, i) => ({
    time: start + i * step,
    open: 100, high: 101, low: 99, close: 100, volume: 50,
  }));
  bars[25] = { time: start + 25 * step, open: 100, high: 106, low: 100, close: 105, volume: 100 };
  bars[26] = { time: start + 26 * step, open: 106, high: 107, low: 105, close: 106, volume: 100 };
  bars[27] = { time: start + 27 * step, open: 106, high: 107, low: 105, close: 106, volume: 100 };
  bars[28] = { time: start + 28 * step, open: 105, high: 105, low: 95, close: 96, volume: 200 };

  const cfg = {
    ...defaultBacktestConfig(),
    feeBps: 10,
    slippageBps: 0,
    entryRules: [{ left: { type: 'close' }, op: '>', right: { type: 'const', value: 104 } }],
    exitRules: [{ left: { type: 'close' }, op: '<', right: { type: 'const', value: 50 } }],
    stopLossMode: 'pct',
    stopLossValue: 5,
    takeProfitMode: 'none',
  };
  const res = runOpenBacktest(bars, cfg, { interval: '1h' });
  assert.equal(res.ready, true);
  assert.equal(res.trades.length, 1);
  // Signal at bar 25 close -> filled at bar 26 open (106), NOT bar 25 close (105)!
  assert.equal(res.trades[0].entryTime, bars[26].time);
  assert.equal(res.trades[0].entryPrice, 106);
  // Stop loss at 106 * 0.95 = 100.7 triggered intrabar on bar 28 (low=95)
  assert.equal(res.trades[0].exitTime, bars[28].time);
  assert.equal(res.trades[0].reason, 'Stop loss');
  assert.ok(Math.abs(res.trades[0].exitPrice - 106 * 0.95) < 1e-6);
  assert.ok(res.totalFees > 0);
});

test('supports unlimited multi-rule AND/OR logic, custom CSP-safe formula operands, short trades and risk sizing', () => {
  const bars = makeWaveBars(260);
  const cfg = {
    ...defaultBacktestConfig(),
    direction: 'both',
    sizingMode: 'risk_pct',
    sizingValue: 2,
    stopLossMode: 'atr',
    stopLossValue: 2,
    takeProfitMode: 'atr',
    takeProfitValue: 4,
    entryLogic: 'AND',
    entryRules: [
      { left: { type: 'formula', expr: 'ema(close, 8) - ema(close, 21)' }, op: '>', right: { type: 'const', value: 0 } },
      { left: { type: 'rsi', period: 14 }, op: '>', right: { type: 'const', value: 45 } },
      { left: { type: 'close' }, op: '>', right: { type: 'sma', period: 15 } },
    ],
    exitRules: [
      { left: { type: 'formula', expr: 'ema(close, 8) - ema(close, 21)' }, op: '<', right: { type: 'const', value: 0 } },
    ],
    shortEntryRules: [
      { left: { type: 'formula', expr: 'ema(close, 8) - ema(close, 21)' }, op: '<', right: { type: 'const', value: 0 } },
      { left: { type: 'rsi', period: 14 }, op: '<', right: { type: 'const', value: 55 } },
    ],
    shortExitRules: [
      { left: { type: 'formula', expr: 'ema(close, 8) - ema(close, 21)' }, op: '>', right: { type: 'const', value: 0 } },
    ],
  };
  const res = runOpenBacktest(bars, cfg, { interval: '1h' });
  assert.equal(res.ready, true);
  assert.ok(res.trades.some(t => t.side === 'long'));
  assert.ok(res.trades.some(t => t.side === 'short'));

  // Parameter sweep works on extracted strategy parameters
  const params = extractSweepableParameters(cfg);
  assert.ok(params.length >= 4);
  const sweep = runParameterSweep(bars, cfg, { path: 'stopLossValue', min: 1.5, max: 3.5, step: 1, rankBy: 'sharpe', interval: '1h' });
  assert.equal(sweep.ready, true);
  assert.equal(sweep.rows.length, 3);
});

test('parses imported CSV & JSON OHLCV datasets and validates imported strategy JSON safely', () => {
  const bars = makeWaveBars(50);
  const csv = 'time,open,high,low,close,volume\n' + bars.map(b => `${new Date(b.time * 1000).toISOString()},${b.open},${b.high},${b.low},${b.close},${b.volume}`).join('\n');
  const fromCsv = parseOHLCVImport(csv);
  assert.equal(fromCsv.length, 50);
  assert.equal(fromCsv[0].time, bars[0].time);

  const fromJson = parseOHLCVImport(JSON.stringify(bars));
  assert.equal(fromJson.length, 50);

  const stratJson = JSON.stringify(defaultBacktestConfig());
  const importedStrat = validateStrategyImport(stratJson);
  assert.equal(importedStrat.entryRules.length, 1);

  assert.throws(() => parseOHLCVImport('not,enough,rows\n1,2,3'), /at least 30/i);
  assert.throws(() => validateStrategyImport('{}'), /entry rule/i);
});
