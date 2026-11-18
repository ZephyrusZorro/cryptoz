import test from 'node:test';
import assert from 'node:assert/strict';
import * as studies from '../src/studies.js';

const day = 1763510400;
const bars = (closes) => closes.map((close, i) => ({
  time: day + i * 3600, open: close - 1, high: close + 2, low: close - 2, close, volume: i + 1
}));
const rising = bars(Array.from({length: 60}, (_, i) => i + 10));
test('Hull moving average and Williams range preserve warmup and scale',()=>{
 const sample=bars(Array(30).fill(100));
 const hma=studies.calculateStudies(sample,['hma'],{period:16})[0].series[0].values;
 assert.equal(hma[17],null);
 assert.equal(hma[18],100);
 const range=studies.calculateStudies(rising,['williams'])[0].series[0].values;
 assert.equal(range[12],null);
 assert.ok(range[13]<0&&range[13]>-20);
});
const study = (id, candles = rising, options) => studies.calculateStudies(candles, [id], options)[0];
const values = (id, key, candles, options) => study(id, candles, options).series.find(s => s.key === key).values;
const near = (value, expected) => assert.ok(Number.isFinite(value) && Math.abs(value - expected) < 1e-9, `${value} != ${expected}`);

test('Pro studies retain explicit pane and overlay placements', () => {
  const pro = ['wma', 'cci', 'bbw', 'rvol', 'cmf'];
  assert.ok(pro.every(id => studies.STUDIES[id]?.proOnly));
  assert.equal(study('wma').placement, 'overlay');
  assert.ok(pro.slice(1).every(id => study(id).placement === 'pane'));
  assert.deepEqual(studies.normalizeStudyIds(['wma', 'rvol', 'cci']), ['wma', 'cci']);
});

test('weighted averages emphasize recent closes and wait for a full lookback', () => {
  const weighted = values('wma', 'main', bars([10, 12, 20]), {period: 2});
  assert.equal(weighted[0], null);
  near(weighted[1], 34 / 3);
  near(weighted[2], 52 / 3);
});

test('CCI uses typical-price mean absolute deviation and leaves zero deviation blank', () => {
  const asymmetric = rising.map(bar => ({...bar, high: bar.high + 6}));
  asymmetric[19].high += 3;
  const strength = values('cci', 'main', asymmetric);
  assert.equal(strength[18], null);
  near(strength[19], 10.45 / (0.015 * 5.05));
  assert.equal(values('cci', 'main', bars(Array(25).fill(100)))[24], null);
});

test('Bollinger Bandwidth reports the spread as a percentage of the middle band', () => {
  const bandwidth = study('bbw', bars([10, 12, 20]), {period: 2}).series[0];
  assert.equal(bandwidth.format, 'percent');
  assert.equal(bandwidth.values[0], null);
  near(bandwidth.values[1], 400 / 11);
  near(bandwidth.values[2], 100);
});

test('relative volume benchmarks the prior 20 candles and handles a zero-volume baseline', () => {
  const activity = values('rvol', 'main');
  assert.equal(activity[19], null);
  near(activity[20], 2);
  const quiet = rising.map((bar, i) => ({...bar, volume: i === 20 ? 5 : 0}));
  assert.equal(values('rvol', 'main', quiet)[20], null);
  assert.equal(values('rvol', 'main', quiet)[21], 0);
});

test('Chaikin Money Flow weights closes by location and counts flat bars as neutral', () => {
  const sample = Array.from({length: 20}, (_, i) => ({...rising[i], low: 100, open: 101, high: 104, close: 104, volume: 1}));
  sample[19] = {...sample[19], low: 104, open: 104};
  const flow = values('cmf', 'main', sample);
  assert.equal(flow[18], null);
  near(flow[19], 19 / 20);
  assert.equal(values('cmf', 'main', sample.map(bar => ({...bar, volume: 0})))[19], null);
  const tradesThenQuiet = [...sample.map(bar => ({...bar, volume: 0.3})), ...sample.map(bar => ({...bar, time: bar.time + 72000, volume: 0}))];
  assert.equal(values('cmf', 'main', tradesThenQuiet).at(-1), null);
});

test('chart selections cap active overlays and prefer the latest selected pane', () => {
  assert.deepEqual(studies.normalizeStudyIds(['rsi', 'ema', 'sma', 'bb', 'vwap', 'levels', 'macd', 'levels', 'constructor']), ['sma', 'bb', 'vwap', 'macd', 'levels']);
  assert.deepEqual(studies.normalizeStudyIds(undefined), []);
  for (const preset of Object.values(studies.STUDY_PRESETS)) {
    assert.deepEqual(studies.normalizeStudyIds(preset.studies), preset.studies);
    assert.ok(preset.studies.every(id => studies.STUDIES[id]));
  }
});

test('moving averages honor the selected lookback and keep their warm-up gaps', () => {
  const sample = bars([10, 12, 20, 16]);
  assert.deepEqual(values('sma', 'main', sample, {period: 2}), [null, 11, 16, 18]);
  const averages = study('ema', sample, {period: 2}).series;
  assert.deepEqual(averages[0].values.slice(0, 2), [null, 11]);
  near(averages[0].values[2], 17);
  assert.deepEqual(averages[1].values, [null, null, null, null]);
  assert.equal(study('ema', rising, {period: 50}).series.length, 1);
});

test('Bollinger bands use population standard deviation and Keltner uses true range', () => {
  const bb = study('bb', bars([10, 12, 20]), {period: 2});
  assert.deepEqual(bb.series.find(s => s.key === 'upper').values, [null, 13, 24]);
  assert.deepEqual(bb.series.find(s => s.key === 'middle').values, [null, 11, 16]);
  assert.deepEqual(bb.series.find(s => s.key === 'lower').values, [null, 9, 8]);

  const lines = study('keltner').series;
  assert.equal(lines.find(s => s.key === 'upper').values[18], null);
  near(lines.find(s => s.key === 'upper').values[19], 27.5);
  near(lines.find(s => s.key === 'lower').values[19], 11.5);
});

test('Donchian rolls the candle range and recent levels exclude an open candle', () => {
  const dc = study('donchian');
  assert.equal(dc.series.find(s => s.key === 'upper').values[18], null);
  assert.equal(dc.series.find(s => s.key === 'upper').values[20], 32);
  assert.equal(dc.series.find(s => s.key === 'lower').values[20], 9);

  const sample = bars([500, ...Array(20).fill(20), 2.5, 900]);
  const before = sample.at(-1).time;
  assert.deepEqual(study('levels', sample, {completedBefore: before}).levels.map(l => l.value), [22, 0.5]);
  assert.deepEqual(study('levels', sample, {completedBefore: sample[19].time}).levels, []);
});

test('UTC VWAP weights candle typical price and resets at midnight', () => {
  const sample = bars([10, 20, 30, 40, 60]);
  [sample[1].time, sample[2].time, sample[3].time, sample[4].time] = [day + 43200, day + 82800, day + 86400, day + 90000];
  [sample[0].volume, sample[1].volume, sample[2].volume, sample[3].volume, sample[4].volume] = [0, 2, 1, 0, 3];
  sample[2].high = 35;
  assert.deepEqual(values('vwap', 'main', sample, {interval:'1h'}), [null, 20, 23 + 2 / 3, null, 60]);
  assert.equal(study('vwap', sample, {interval:'1d'}).series.length, 0);
});

test('oscillators keep line and signal warm-ups independent', () => {
  const macd = study('macd');
  assert.equal(macd.series.find(s => s.key === 'main').values[24], null);
  near(macd.series.find(s => s.key === 'main').values[25], 7);
  assert.equal(macd.series.find(s => s.key === 'signal').values[32], null);
  near(macd.series.find(s => s.key === 'signal').values[33], 7);
  near(macd.series.find(s => s.key === 'histogram').values[33], 0);

  const rsi = study('rsi', bars([10, 10, 10, 12]), {rsiPeriod: 2});
  assert.deepEqual(rsi.series[0].values, [null, null, 50, 100]);
  assert.deepEqual(rsi.guides, [30, 70]);

  const roc = values('roc', 'main');
  assert.equal(roc[11], null);
  near(roc[12], 120);
});

test('stochastic smooths %K before %D and leaves a zero-width range undefined', () => {
  const stoch = study('stoch');
  assert.deepEqual(stoch.guides, [20, 80]);
  const k = stoch.series.find(s => s.key === 'k').values;
  const d = stoch.series.find(s => s.key === 'd').values;
  assert.equal(k[14], null);
  near(k[15], 1500 / 17);
  assert.equal(d[16], null);
  near(d[17], 1500 / 17);
  const flat = rising.map(bar => ({...bar, open: 10, high: 10, low: 10, close: 10}));
  assert.equal(values('stoch', 'k', flat).at(-1), null);
});

test('volume is raw, OBV follows changes in closes, and MFI uses directional money flow', () => {
  const candles = bars([10, 11, 11, 10, 12]);
  assert.deepEqual(values('volume', 'main', candles), [1, 2, 3, 4, 5]);
  assert.deepEqual(values('obv', 'main', candles), [0, 2, 2, -2, 3]);
  const sample = bars([...Array(13).fill(10), 20, 10]).map(bar => ({...bar, volume: 2}));
  assert.equal(values('mfi', 'main', sample)[13], null);
  near(values('mfi', 'main', sample)[14], 200 / 3);
  assert.equal(values('mfi', 'main', sample.map(bar => ({...bar, volume: 0})))[14], null);
});

test('an MFI window with no money flow is blank even after an active window', () => {
  const candles = bars([10, 10.1, 10.5, ...Array(14).fill(10.5)]).map(bar => ({...bar, volume: 1}));
  const mfi = values('mfi', 'main', candles);
  assert.equal(mfi.at(-2), 100);
  assert.equal(mfi.at(-1), null);
});

test('ATR includes gaps from previous closes', () => {
  const candles = bars([...Array(13).fill(10), 20, 20]);
  const atr = values('atr', 'main', candles);
  assert.equal(atr[12], null);
  near(atr[13], 64 / 14);
  near(atr[14], ((64 / 14) * 13 + 4) / 14);
});

test('study rendering updates the last point and keeps the resized pane when changing oscillators', () => {
  const panes = new Map([[0, {}]]);
  const plots = new Map();
  const chart = {
    addSeries(_type, options, pane) {
      if (!panes.has(pane)) panes.set(pane, {});
      const entry = {
        pane, options, replacements: 0, latest: null,
        setData(points) { this.replacements++; this.latest = points.at(-1); },
        update(point) { this.latest = point; },
        createPriceLine() {}
      };
      plots.set(entry, pane);
      return entry;
    },
    removeSeries(series) {
      plots.delete(series);
      if (series.pane && !Array.from(plots.values()).includes(series.pane)) panes.delete(series.pane);
    }
  };
  const price = {};
  const selected = ['ema', 'rsi'];
  let view = studies.renderStudies(chart, price, null, rising, selected);
  const ema = view.series.get('ema:main').series;
  const pane = panes.get(1);
  const revised = [...rising.slice(0, -1), {...rising.at(-1), close: 70}];
  view = studies.renderStudies(chart, price, view, revised, selected, {incremental: true});
  assert.equal(ema.replacements, 1);
  near(ema.latest.value, 59.5 + 2 / 21);

  const next = [...revised.slice(0, -1), {...revised.at(-1), close: 71}, {
    time: revised.at(-1).time + 3600, open: 70, high: 72, low: 68, close: 70, volume: 5
  }];
  view = studies.renderStudies(chart, price, view, next, selected, {incremental: true});
  assert.equal(ema.replacements, 2, 'refresh historical plots if the previously plotted last candle changed before appending');

  view = studies.renderStudies(chart, price, view, next, ['ema','macd']);
  assert.equal(panes.get(1), pane);
  assert.equal(view.paneChanged, false);
  view = studies.renderStudies(chart, price, view, revised, ['ema']);
  assert.equal(panes.has(1), false);
  assert.equal(view.paneChanged, true);
});
