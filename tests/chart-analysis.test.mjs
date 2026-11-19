import assert from 'node:assert/strict';
import test from 'node:test';
import {TerminalChart} from '../src/chart.js';
import {calculateStudies} from '../src/studies.js';

const step = 3600;
const origin = 1763510400;
const candle = (i, close = 100) => ({time: origin + i * step, open: close, close, low: close - 1, high: close + 1, volume: 2});
const make = extra => new TerminalChart({
  host: {clientHeight: 480, clientWidth: 640, classList:{toggle(){}}}, workspace: {drawings: {}}, save() {}, onQuote() {},
  onBook() {}, onSummary() {}, onStatus() {}, onDrawings() {}, ...extra
});
const snapshot = (bars, time, cache = 'miss') => ({data: {bars}, fetchedAt: new Date(time * 1000).toISOString(), cache});
const markerFixture = chart => {
  chart.chart = {addSeries: () => ({setData() {}, createPriceLine() {}}), panes: () => []};
  let markers = [];
  chart.markerApi = {setMarkers(value) {markers = value;}};
  return () => markers;
};

test('forming WebSocket candles update indicator plots without recomputing closed signals', () => {
  const chart = make();
  chart.bars = [candle(0)];
  chart.series = {update() {}};
  chart.seriesFirstTime = chart.seriesLastTime = chart.bars[0].time;
  const calls = [];
  chart.renderIndicators = (...args) => calls.push(args);
  chart.updateSeries({live: true});
  assert.deepEqual(calls, [[true, {refreshAnalysis: false}]]);
});

test('confirmed marks stay on an older loaded candle at its traded close and omit a forming breakout', () => {
  const chart = make();
  chart.studyIds = [];
  const markers = markerFixture(chart);
  chart.bars = Array.from({length: 250}, (_, i) => candle(i, i === 25 ? 104 : 100));
  const last = chart.bars.at(-1);
  chart.bars.push(candle(250, 200));
  chart.candleMeta = snapshot(chart.bars, last.time + step);
  chart.observeStudyBars(chart.bars, last.time + step);
  chart.historyAnchor = last.time + step;
  chart.renderIndicators();
  const breakout = markers().find(marker => marker.time === chart.bars[25].time);
  assert.equal(breakout?.price, 104);
  assert.equal(breakout.position, 'atPriceBottom');
  assert.ok(chart.visibleSignals.some(signal => signal.time === breakout.time && signal.price === breakout.price));
  assert.ok(markers().every(marker => marker.time !== chart.bars.at(-1).time));
});

test('RSI signal evidence matches values plotted at the selected lookback', () => {
  const chart = make();
  chart.studyIds = ['rsi'];
  chart.signalKinds = ['rsi'];
  chart.rsiPeriod = 5;
  chart.bars = [...Array.from({length:101}, (_, i) => candle(i)), candle(101, 190), candle(102, 48), candle(103, 95)];
  const cutoff = chart.bars.at(-1).time + step;
  chart.historyAnchor = cutoff;
  chart.candleMeta = snapshot(chart.bars, cutoff);
  chart.observeStudyBars(chart.bars, cutoff);
  markerFixture(chart);
  chart.renderIndicators();
  const values = calculateStudies(chart.bars, ['rsi'], {rsiPeriod: 5})[0].series[0].values;
  assert.ok(chart.visibleSignals?.length);
  for (const signal of chart.visibleSignals) {
    const index = chart.bars.findIndex(bar => bar.time === signal.time);
    assert.equal(signal.evidence.lookback, 5);
    assert.equal(signal.evidence.value, values[index]);
    assert.equal(signal.evidence.previous, values[index - 1]);
    assert.match(signal.detail, /RSI 5/);
  }
});

test('outdated REST candles never replace stream-confirmed signal evidence', () => {
  const chart = make();
  const bar = candle(2, 110);
  const cutoff = bar.time + step;
  chart.bars = [bar];
  chart.candleMeta = snapshot(chart.bars, cutoff);
  chart.barRevisions.set(bar.time, 2);
  chart.liveRevision = 2;
  chart.observeStudyBars(chart.bars, cutoff);
  chart.applyHistory(snapshot([candle(2, 100)], cutoff + 1), 1, (cutoff + 1) * 1000);
  assert.deepEqual(chart.bars, [bar]);
  assert.deepEqual(chart.studyBars, [bar]);
});

test('a final prior candle is incorporated after the next forming candle and cannot reopen', () => {
  const originalSocket = globalThis.WebSocket;
  globalThis.WebSocket = class {close() {}};
  const chart = make();
  const now = Date.now();
  const start = Math.floor(now / (step * 1000)) * step;
  chart.bars = [{...candle(0), time: start - step}];
  chart.updateSeries = () => {};
  const send = (time, close, final, eventTime) => chart.socket.onmessage({data: JSON.stringify({
    e: 'kline', E: eventTime, k: {s: 'BTCUSDT', i: '1h', t: time * 1000, o: 100, h: 115, l: 90, c: close, v: 2, x: final}
  })});
  try {
    chart.connect(chart.generation);
    send(start, 105, false, now - 3);
    send(start - step, 114, true, now - 2);
    send(start - step, 101, false, now - 1);
    assert.deepEqual(chart.bars.map(bar => bar.close), [114, 105]);
    assert.deepEqual(chart.studyBars.map(bar => bar.close), [114]);
  } finally {
    chart.dispose();
    globalThis.WebSocket = originalSocket;
  }
});

test('a signal jump centers the candle and keeps a price marker independent of hover', () => {
  const chart = make();
  chart.bars = Array.from({length:100}, (_, i) => candle(i));
  const event = {id: 'range:up:evidence', time: chart.bars[40].time, price: 100};
  chart.visibleSignals = [event];
  let range, crosshair, markers, focused;
  const scale = {
    timeToIndex: time => time === event.time ? 40 : null,
    getVisibleLogicalRange: () => range ?? {from: 80, to: 100},
    setVisibleLogicalRange: value => {range = value;}
  };
  chart.chart = {
    timeScale: () => scale,
    setCrosshairPosition: (...position) => {crosshair = position;}
  };
  chart.series = {};
  chart.markerApi = {setMarkers: value => {markers = value;}};
  chart.onSignalFocus = value => {focused = value;};
  chart.fetch = () => assert.fail('Signal selection requests old data');
  assert.equal(chart.focusSignal(event.id), true);
  assert.equal((range.from + range.to) / 2, 40);
  assert.deepEqual(crosshair, [event.price, event.time, chart.series]);
  assert.equal(focused, event);
  assert.deepEqual(markers.map(({time, price, position, shape})=>[time, price, position, shape]),
    [[event.time, event.price, 'atPriceMiddle', 'circle']]);
  chart.clearSignalFocus();
  assert.deepEqual(markers, []);
  assert.equal(focused, null);
  assert.equal(chart.focusSignal('missing'), false);
});

test('automatic guides end at the actual chart plot boundary and stay in the price pane', () => {
  const chart = make();
  chart.autoSetup = {guides:[{id:'range-high',type:'horizontal',label:'Range high',points:[{time:origin,price:100}]}]};
  chart.chart = {
    timeScale: () => ({width: () => 450, timeToCoordinate: () => 15}),
    panes: () => [{getHeight: () => 350}]
  };
  chart.series = {priceToCoordinate: () => 25};
  chart.svg = {setAttribute() {}, style:{}};
  chart.draw();
  assert.match(chart.svg.innerHTML, /x2="450"/);
  assert.equal(chart.svg.style.clipPath, 'inset(0 190px 130px 0)');
});

test('automatic levels cannot paint on a window before their actual candle anchor', () => {
 const chart=make();
 chart.autoSetup={guides:[{id:'range-high',type:'horizontal',label:'Range high',points:[{time:origin+step,price:100}]}]};
 chart.chart={timeScale:()=>({width:()=>450,timeToCoordinate:()=>560}),panes:()=>[{getHeight:()=>350}]};
 chart.series={priceToCoordinate:()=>25};
 chart.svg={setAttribute(){},style:{}};
 chart.draw();
 assert.equal(chart.svg.innerHTML,'');
});

test('a range guide cannot measure an unconfirmed provisional wick', () => {
  const confirmed = Array.from({length:20}, (_, i) => candle(i));
  const bars = [...confirmed, candle(20, 130)];
  const completedBefore = bars.at(-1).time + step;
  const [result] = calculateStudies(bars, ['levels'], {confirmed, completedBefore});
  assert.deepEqual(result.levels.map(level => level.value), [101,99]);
});

test('a warmup-only oscillator does not reserve an empty lower pane', () => {
  const chart = make();
  chart.studyIds = ['rsi'];
  chart.bars = Array.from({length:5}, (_, i) => candle(i));
  markerFixture(chart);
  chart.renderIndicators();
  assert.equal(chart.studyView.results[0].ready, false);
  assert.equal(chart.studyView.paneNumbers.size, 0);
  assert.equal(chart.studyView.series.size, 0);
});

test('an unavailable streaming socket preserves loaded candles and starts REST recovery', async () => {
  const WebSocket = globalThis.WebSocket;
  globalThis.WebSocket = class {constructor() {throw Error('WebSocket blocked');}};
  const chart = make();
  let polls = 0;
  chart.fetch = async () => snapshot([candle(0)], origin + step);
  chart.build = () => {};
  chart.poll = () => {polls++;};
  try {
    await chart.load();
    assert.equal(chart.streamState, 'polling');
    assert.equal(polls, 1);
    assert.equal(chart.bars.length, 1);
    assert.doesNotMatch(chart.host.innerHTML, /chart unavailable/i);
  } finally {
    chart.dispose();
    globalThis.WebSocket = WebSocket;
  }
});
