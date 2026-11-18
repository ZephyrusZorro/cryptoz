import test from 'node:test';
import assert from 'node:assert/strict';
import {MarketStream, parseMarketTicker} from '../src/live-market.js';
import {createLiveMarketView} from '../src/market-live-view.js';
import {createGateway} from '../server/gateway.js';

const registry = ['BTC', 'ETH'].map(base => ({base, quote: 'USDT', venue: 'binance', symbol: base + 'USDT'}));
const EPOCH = Date.UTC(2026, 10, 18, 10);
const ticker = (symbol, time, close = 100) => ({s: symbol, c: String(close), o: '98', h: '110', l: '90', q: '1000', E: time});

function harness() {
  const frames = new Map(), timeouts = new Map(), sockets = [], batches = [], status = [];
  const visibility = Object.assign(new EventTarget(), {hidden: false});
  const network = Object.assign(new EventTarget(), {navigator: {onLine: true}});
  let time = EPOCH, id = 0;
  const stream = new MarketStream({
    onBatch: batch => batches.push(batch), onStatus: state => status.push(state),
    now: () => time, random: () => 0.5, visibility, network,
    socketFactory: url => {
      const socket = {url, close() { this.closed = true; }};
      sockets.push(socket);
      return socket;
    },
    timers: {
      setInterval() { return ++id; },
      clearInterval() {},
      setTimeout(callback, delay) { timeouts.set(++id, {callback, delay}); return id; },
      clearTimeout(id) { timeouts.delete(id); }
    },
    requestFrame: callback => { frames.set(++id, callback); return id; },
    cancelFrame: id => frames.delete(id)
  });
  function send(socket, tickers) {
    socket.onmessage({data: JSON.stringify(tickers)});
  }
  return {
    stream, status, batches, sockets, frames, timeouts, visibility, network, send,
    advance(ms) { time += ms; },
    paint() { const pending = [...frames.values()]; frames.clear(); pending.forEach(f => f()); },
    retry() { const pending = [...timeouts.values()]; timeouts.clear(); pending.forEach(t => t.callback()); }
  };
}

test('coalesces multiple sparse events into the next frame and sends only the changed symbols', () => {
  const h = harness();
  h.stream.setRegistry(registry);
  const [socket] = h.sockets;
  h.send(socket, [ticker('BTCUSDT', EPOCH)]);
  h.send(socket, [ticker('BTCUSDT', EPOCH + 1, 102), ticker('ETHUSDT', EPOCH + 1)]);
  h.send(socket, [ticker('BTCUSDT', EPOCH - 1, 96)]);
  assert.equal(h.status.filter(s => s.state === 'streaming').length, 1);
  assert.equal(h.stream.fresh('BTCUSDT').price, 102);
  assert.equal(h.frames.size, 1);
  assert.equal(h.batches.length, 0);
  h.paint();
  assert.equal(h.batches.length, 1);
  assert.equal(h.batches[0].get('BTCUSDT').price, 102);
  assert.equal(h.batches[0].size, 2);
  h.send(socket, [ticker('ETHUSDT', EPOCH + 2, 101)]);
  h.paint();
  assert.deepEqual([...h.batches[1].keys()], ['ETHUSDT']);
  h.stream.dispose();
});

test('a queued retry cannot replace a current socket or revive an empty or hidden registry', () => {
  const h = harness();
  h.stream.setRegistry(registry);
  const [socket] = h.sockets;
  h.send(socket, [ticker('BTCUSDT', EPOCH)]);
  const oldMessage = socket.onmessage;
  socket.onclose();
  assert.equal(h.stream.fresh('BTCUSDT'), null);
  h.stream.setRegistry(registry);
  assert.equal(h.sockets.length, 1, 'registry refresh respects backoff');
  h.visibility.hidden = true;
  h.visibility.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.status.at(-1).state, 'paused');
  h.retry();
  assert.equal(h.sockets.length, 1);
  h.visibility.hidden = false;
  h.visibility.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.sockets.length, 2);
  oldMessage({data: JSON.stringify([ticker('BTCUSDT', EPOCH + 1, 105)])});
  h.send(h.sockets[1], [ticker('ETHUSDT', EPOCH + 1)]);
  assert.equal(h.stream.fresh('BTCUSDT'), null, 'another symbol cannot revive BTC from an old connection');
  assert.equal(h.stream.fresh('ETHUSDT').price, 100);
  h.stream.setRegistry([]);
  assert.equal(h.sockets[1].closed, true);
  assert.equal(h.frames.size, 0);
  assert.equal(h.status.at(-1).state, 'idle');
  h.stream.dispose();
});

test('rejects malformed payloads, labels per-pair age, and prefers the newest observed price', () => {
  const h = harness();
  h.stream.setRegistry(registry);
  const [socket] = h.sockets;
  const onlyBtc = new Set(['BTCUSDT']);
  assert.equal(parseMarketTicker({...ticker('BTCUSDT', EPOCH), q: ''}, onlyBtc), null);
  assert.equal(parseMarketTicker({...ticker('BTCUSDT', EPOCH), P: false}, onlyBtc), null);
  h.send(socket, [ticker('BTCUSDT', EPOCH - 18_000)]);
  assert.equal(h.stream.fresh('BTCUSDT'), null);
  h.send(socket, [ticker('BTCUSDT', EPOCH)]);
  assert.equal(h.stream.observation('BTCUSDT').quality, 'live');
  const rest = {id: 'BTCUSDT', price: 103, change: 3, volume: 1000, updatedAt: new Date(EPOCH + 1).toISOString()};
  h.stream.setSnapshots([rest]);
  assert.equal(h.stream.observation('BTCUSDT').quality, 'snapshot');
  assert.equal(h.stream.observation('BTCUSDT').quote.price, 103);
  h.stream.setSnapshots([{...rest, price: 95, updatedAt: new Date(EPOCH - 1).toISOString()}]);
  assert.equal(h.stream.observation('BTCUSDT').quote.price, 103);
  h.send(socket, [ticker('BTCUSDT', EPOCH + 2, 104)]);
  assert.equal(h.stream.observation('BTCUSDT').quality, 'live');
  assert.equal(h.stream.observation('BTCUSDT').quote.price, 104);
  h.advance(16_000);
  h.send(socket, [ticker('ETHUSDT', EPOCH + 16_000, 103)]);
  assert.equal(h.stream.observation('BTCUSDT').quality, 'last');
  assert.equal(h.stream.observation('BTCUSDT').quote.price, 104);
  assert.equal(h.stream.observation('ETHUSDT').quality, 'live');
  h.stream.dispose();
});

test('loss of internet clears live status immediately and restores one subscription when online', () => {
  const h = harness();
  h.stream.setRegistry(registry);
  h.send(h.sockets[0], [ticker('BTCUSDT', EPOCH)]);
  h.network.navigator.onLine = false;
  h.network.dispatchEvent(new Event('offline'));
  assert.equal(h.sockets[0].closed, true);
  assert.equal(h.status.at(-1).state, 'offline');
  assert.equal(h.stream.observation('BTCUSDT').quality, 'last');
  h.network.navigator.onLine = true;
  h.network.dispatchEvent(new Event('online'));
  h.network.dispatchEvent(new Event('online'));
  assert.equal(h.sockets.length, 2);
  h.stream.dispose();
});

test('one malformed exchange snapshot row does not hide every valid market', async () => {
  const registered = registry.map(instrument => ({symbol: instrument.symbol, baseAsset: instrument.base,
    quoteAsset: instrument.quote, status: 'TRADING'}));
  const valid = {symbol: 'BTCUSDT', lastPrice: '100', closeTime: EPOCH, priceChangePercent: '2', quoteVolume: '1500'};
  const gateway = createGateway({now: () => EPOCH, fetcher: async url => Response.json(
    url.endsWith('/exchangeInfo') ? {symbols: registered} : [
      {...valid, symbol: 'ETHUSDT', closeTime: 'bad-date'},
      {...valid, closeTime: EPOCH + 30_000},
      valid
    ]
  )});
  const response = await gateway(new Request('https://example.test/api/exchange-markets'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data.map(({id, updatedAt, price}) => ({id, updatedAt, price})), [
    {id: 'BTCUSDT', updatedAt: new Date(EPOCH).toISOString(), price: 100}
  ]);
});

test('leaving the venue view stops market work and preserves timestamps; re-entering reconnects', () => {
  const h = harness();
  h.stream.setRegistry(registry);
  h.send(h.sockets[0], [ticker('BTCUSDT', EPOCH)]);
  h.stream.setActive(false);
  assert.equal(h.sockets[0].closed, true);
  assert.equal(h.frames.size, 0);
  assert.equal(h.stream.observation('BTCUSDT').quality, 'last');
  h.stream.setActive(true);
  assert.equal(h.sockets.length, 2);
  h.advance(16_000);
  h.stream.report();
  assert.equal(h.sockets[1].closed, true);
  assert.equal(h.status.at(-1).state, 'reconnecting');
  assert.equal(h.timeouts.size, 1);
  h.stream.dispose();
  assert.equal(h.timeouts.size, 0);
});

test('a market paint updates touched rows in place without rescanning or rewriting neighbors', () => {
  const h = harness();
  const badge = element(), btc = row('BTCUSDT'), eth = row('ETHUSDT');
  let scans = 0;
  const root = {
    querySelector: () => null,
    querySelectorAll(selector) {
      scans++;
      return selector === '[data-live-status]' ? [badge] : selector === '[data-live-row]' ? [btc, eth] : [];
    }
  };
  const view = createLiveMarketView(root, h.stream);
  h.stream.onBatch = view.patch;
  h.stream.onStatus = view.status;
  h.stream.setRegistry(registry);
  view.sync();
  const initialScans = scans;
  h.send(h.sockets[0], [ticker('BTCUSDT', EPOCH), ticker('ETHUSDT', EPOCH)]);
  h.paint();
  const valueSelector = '[data-live-price]', timeSelector = '[data-live-time]';
  assert.equal(btc.querySelector(valueSelector).textContent, '100.00');
  const ethWrites = eth.querySelector(valueSelector).writes;
  h.send(h.sockets[0], [ticker('BTCUSDT', EPOCH + 10, 105)]);
  h.paint();
  assert.equal(btc.querySelector(valueSelector).textContent, '105.00');
  assert.equal(eth.querySelector(valueSelector).writes, ethWrites);
  assert.equal(scans, initialScans);
  assert.match(btc.querySelector(timeSelector).textContent, /^Live/);
  h.sockets[0].onclose();
  assert.match(btc.querySelector(timeSelector).textContent, /^Last/);
  assert.equal(btc.querySelector(valueSelector).textContent, '105.00');
  assert.match(badge.textContent, /Reconnecting/);
  h.stream.dispose();
});

function element() {
  let text = '';
  return {
    dataset: {}, writes: 0, classList: {add() {}, remove() {}},
    get textContent() { return text; },
    set textContent(value) { text = value; this.writes++; }
  };
}

function row(symbol) {
  const children = new Map(['price', 'change', 'volume', 'time'].map(key => ['[data-live-' + key + ']', element()]));
  return {dataset: {liveRow: symbol}, querySelector: selector => children.get(selector)};
}
