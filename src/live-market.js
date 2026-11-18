import {asNumber} from './numbers.js';

const PUBLIC_STREAM = 'wss://data-stream.binance.vision/ws/!miniTicker@arr';
export const BENCHMARK_ASSETS = Object.freeze(['BTC', 'ETH', 'SOL', 'BNB', 'XRP']);
const FRESH_MS = 15_000;
const FUTURE_TOLERANCE_MS = 5_000;
const CONNECT_TIMEOUT_MS = 15_000;
const STREAM_TIMEOUT_MS = 30_000;
const HEALTH_MS = 3_000;

function observationTime(time) {
  return Number.isSafeInteger(time) && time > 0 && time <= 8_640_000_000_000_000;
}

export function parseMarketTicker(raw, registry) {
  if (!raw || !registry.has(raw.s)) return null;
  const price = asNumber(raw.c), open = asNumber(raw.o), high = asNumber(raw.h), low = asNumber(raw.l);
  const change = raw.P === undefined ? (open > 0 ? (price / open - 1) * 100 : null) : asNumber(raw.P);
  const volume = asNumber(raw.q), time = asNumber(raw.E);
  if (!(price > 0 && high >= price && low > 0 && low <= price && volume !== null
    && volume >= 0 && Number.isFinite(change) && observationTime(time))) return null;
  return {symbol: raw.s, price, change, volume, high, low, time, updatedAt: new Date(time).toISOString()};
}

export function acceptTicker(previous, next) {
  return !!next && (!previous || next.time > previous.time);
}

export function parsePartialBook(data) {
  if (!data || !Number.isSafeInteger(data.lastUpdateId) || data.lastUpdateId <= 0) return null;
  const read = levels => Array.isArray(levels) && levels.length > 0 && levels.length <= 20
    ? levels.map(level => [asNumber(level?.[0]), asNumber(level?.[1])])
    : null;
  const bids = read(data.bids), asks = read(data.asks);
  if (!bids || !asks || [...bids, ...asks].some(level => level.some(value => !(value > 0)))
    || bids.some((level, index) => index && level[0] >= bids[index - 1][0])
    || asks.some((level, index) => index && level[0] <= asks[index - 1][0])
    || bids[0][0] >= asks[0][0]) return null;
  return {bids, asks, sequence: data.lastUpdateId};
}

export class MarketStream {
  constructor({
    onBatch, onStatus, now = Date.now, random = Math.random, timers = globalThis,
    visibility = globalThis.document, network = globalThis.window,
    socketFactory = url => new WebSocket(url),
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis) ?? (fn => timers.setTimeout(fn, 16)),
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis) ?? (id => timers.clearTimeout(id))
  }) {
    Object.assign(this, {onBatch, onStatus, now, random, timers, visibility, network, socketFactory, requestFrame, cancelFrame});
    this.quotes = new Map();
    this.snapshots = new Map();
    this.registry = new Set();
    this.connectionSamples = new Set();
    this.pending = new Map();
    this.state = 'idle';
    this.lastMessage = 0;
    this.connectionStarted = 0;
    this.attempt = 0;
    this.frame = null;
    this.retry = null;
    this.socket = null;
    this.closed = false;
    this.active = true;
    this.handleLifecycle = () => this.syncConnection();
    this.visibility?.addEventListener('visibilitychange', this.handleLifecycle);
    this.network?.addEventListener('online', this.handleLifecycle);
    this.network?.addEventListener('offline', this.handleLifecycle);
    this.healthTimer = this.timers.setInterval(() => this.report(), HEALTH_MS);
  }

  setRegistry(list) {
    this.registry = new Set(list.filter(item => item.venue === 'binance' && item.quote === 'USDT').map(item => item.symbol));
    for (const symbol of this.quotes.keys()) {
      if (this.registry.has(symbol)) continue;
      this.quotes.delete(symbol);
      this.pending.delete(symbol);
      this.connectionSamples.delete(symbol);
    }
    for (const symbol of this.snapshots.keys()) {
      if (!this.registry.has(symbol)) this.snapshots.delete(symbol);
    }
    this.syncConnection();
  }

  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    this.syncConnection();
  }

  setSnapshots(list, {stale = false} = {}) {
    const now = this.now();
    for (const row of list) {
      if (!row) continue;
      const price = asNumber(row.price), time = Date.parse(row.updatedAt);
      const change = asNumber(row.change), volume = asNumber(row.volume);
      if (typeof row.id !== 'string' || !row.id.endsWith('USDT') || !(price > 0)
        || !observationTime(time) || time - now > FUTURE_TOLERANCE_MS || volume === null || volume < 0
        || (this.snapshots.get(row.id)?.time ?? 0) > time) continue;
      const snapshot = {symbol: row.id, price, change, volume, time, updatedAt: new Date(time).toISOString(), stale};
      this.snapshots.set(row.id, snapshot);
      this.pending.set(row.id, snapshot);
    }
    this.scheduleFlush();
  }

  syncConnection() {
    if (this.closed) return;
    const blocked = this.network?.navigator?.onLine === false ? 'offline'
      : this.visibility?.hidden || !this.active ? 'paused' : !this.registry.size ? 'idle' : '';
    if (blocked) {
      this.stopConnection();
      this.transition(blocked);
    } else if (!this.socket && this.retry === null) {
      this.connect();
    }
  }

  connect() {
    this.connectionStarted = this.now();
    this.lastMessage = 0;
    this.transition('connecting');
    let socket;
    try {
      socket = this.socketFactory(PUBLIC_STREAM);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    socket.onmessage = event => {
      if (socket !== this.socket) return;
      let tickers;
      try { tickers = JSON.parse(event.data); } catch { return; }
      if (tickers?.e === 'serverShutdown') {
        this.scheduleRetry();
        return;
      }
      if (!Array.isArray(tickers)) return;
      const now = this.now();
      let accepted = false;
      for (const raw of tickers) {
        const quote = parseMarketTicker(raw, this.registry);
        if (!quote || now - quote.time >= FRESH_MS || quote.time - now > FUTURE_TOLERANCE_MS
          || !acceptTicker(this.quotes.get(quote.symbol), quote)) continue;
        this.quotes.set(quote.symbol, quote);
        this.pending.set(quote.symbol, quote);
        this.connectionSamples.add(quote.symbol);
        accepted = true;
      }
      if (!accepted) return;
      this.lastMessage = now;
      this.attempt = 0;
      this.transition('streaming');
      this.scheduleFlush();
    };
    socket.onclose = () => {
      if (socket === this.socket) this.scheduleRetry();
    };
    // A failed browser upgrade emits close. The watchdog also covers silent sockets.
    socket.onerror = () => {};
  }

  scheduleRetry() {
    this.stopConnection();
    if (this.closed) return;
    this.transition('reconnecting');
    const delay = Math.min(30_000, 1_500 * 2 ** Math.min(this.attempt++, 5) * (0.8 + this.random() * 0.4));
    this.retry = this.timers.setTimeout(() => {
      this.retry = null;
      this.syncConnection();
    }, delay);
  }

  stopConnection() {
    if (this.retry !== null) this.timers.clearTimeout(this.retry);
    this.retry = null;
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
    this.pending.clear();
    this.connectionSamples.clear();
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onmessage = socket.onclose = socket.onerror = null;
    socket.close();
  }

  transition(state) {
    if (state === this.state) return;
    this.state = state;
    this.publish(true);
  }

  status() {
    return {state: this.state, lastMessage: this.lastMessage};
  }

  publish(transition = false) {
    this.onStatus({...this.status(), transition});
  }

  report() {
    if (this.closed) return;
    const now = this.now();
    if (this.socket && (this.lastMessage ? now - this.lastMessage >= STREAM_TIMEOUT_MS
      : now - this.connectionStarted >= CONNECT_TIMEOUT_MS)) {
      this.scheduleRetry();
      return;
    }
    if (this.state === 'streaming' && now - this.lastMessage >= FRESH_MS) {
      this.transition('delayed');
    } else {
      this.publish();
    }
  }

  scheduleFlush() {
    if (this.frame !== null || !this.pending.size || this.visibility?.hidden || this.closed) return;
    this.frame = this.requestFrame(() => {
      this.frame = null;
      this.flush();
    });
  }

  flush() {
    if (!this.pending.size || this.closed) return;
    const batch = this.pending;
    this.pending = new Map();
    this.onBatch(batch);
  }

  fresh(symbol) {
    const quote = this.quotes.get(symbol), now = this.now();
    return this.state === 'streaming' && now - this.lastMessage < FRESH_MS
      && this.connectionSamples.has(symbol) && quote && now - quote.time < FRESH_MS
      && quote.time - now <= FUTURE_TOLERANCE_MS ? quote : null;
  }

  observation(symbol) {
    const quote = this.quotes.get(symbol), snapshot = this.snapshots.get(symbol);
    if (snapshot && (!quote || snapshot.time > quote.time)) {
      return {quote: snapshot, quality: snapshot.stale || this.now() - snapshot.time >= 60_000 ? 'last' : 'snapshot'};
    }
    if (!quote) return null;
    return {quote, quality: this.fresh(symbol) ? 'live' : 'last'};
  }

  dispose() {
    this.closed = true;
    this.stopConnection();
    this.timers.clearInterval(this.healthTimer);
    this.visibility?.removeEventListener('visibilitychange', this.handleLifecycle);
    this.network?.removeEventListener('online', this.handleLifecycle);
    this.network?.removeEventListener('offline', this.handleLifecycle);
  }
}
