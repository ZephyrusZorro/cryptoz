import { usableQuote } from './market-integrity.js';
import { validInstrument } from './preferences.js';

export const PAPER_STORAGE_KEY = 'cryptoz.paper.v1';
export const PAPER_STARTING_CASH = 10000;
export const PAPER_FEE_BPS = 10n;
export const PAPER_SLIPPAGE_BPS = 5n;
const BASIS_POINTS = 10000n;
const QUOTE_SCALE = 1000000n;
const QUANTITY_SCALE = 1000000000000n;
const MAX_MONEY = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_TRADES = 500;
const MAX_WORKING_HISTORY = 100;
const EMPTY_POSITION = { quantity: 0n, basis: 0n, realized: 0n };
const instrumentKey = instrument => `${instrument.venue}:${instrument.symbol}`;
const money = amount => Number(amount) / Number(QUOTE_SCALE);
const validTimestamp = value => Number.isSafeInteger(value) && value > 0 && value <= 8.64e15;

function quantityUnits(value) {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!/^(\d{1,24}(?:\.\d{0,12})?|\.\d{1,12})$/.test(input)) {
    throw Error('Enter a positive quantity with up to 12 decimal places.');
  }
  const [whole, decimals = ''] = input.split('.');
  const units = BigInt(whole || '0') * QUANTITY_SCALE + BigInt(decimals.padEnd(12, '0'));
  if (units === 0n) throw Error('Enter a positive quantity.');
  return units;
}

function quantityText(units) {
  const whole = units / QUANTITY_SCALE;
  const decimals = String(units % QUANTITY_SCALE).padStart(12, '0').replace(/0+$/, '');
  return decimals ? `${whole}.${decimals}` : String(whole);
}

function roundRatio(numerator, denominator) {
  return (numerator + denominator / 2n) / denominator;
}

function tradeAmounts(quantity, price, side) {
  const [mantissa, exponent = '0'] = price.toString().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const shift = Number(exponent) - fraction.length;
  const scaledPrice = BigInt(whole + fraction) * 10n ** BigInt(Math.max(0, shift));
  const executionRate = side === 'buy' ? BASIS_POINTS + PAPER_SLIPPAGE_BPS : BASIS_POINTS - PAPER_SLIPPAGE_BPS;
  const numerator = quantity * scaledPrice * executionRate * QUOTE_SCALE;
  const denominator = QUANTITY_SCALE * BASIS_POINTS * 10n ** BigInt(Math.max(0, -shift));
  const notional = roundRatio(numerator, denominator);
  const fee = roundRatio(numerator * PAPER_FEE_BPS, denominator * BASIS_POINTS);
  const net = side === 'buy' ? notional + fee : notional - fee;
  return { notional, fee, net, executionPrice: price * (Number(executionRate) / Number(BASIS_POINTS)) };
}

export function createPaperLedger() {
  const startingCash = BigInt(PAPER_STARTING_CASH) * QUOTE_SCALE;
  return { cash: { USD: startingCash, USDT: startingCash }, positions: {}, fills: [], trades: [], workingOrders: [] };
}

export function fillPaperOrder(ledger, instrument, order, quote, { now = Date.now() } = {}) {
  if (!validInstrument(instrument)) throw Error('Choose a valid spot market.');
  if (!validTimestamp(now) || !usableQuote(quote, instrument, now)) {
    throw Error('A fresh quote from this exchange and pair is required for practice fills.');
  }
  if (ledger.trades.length >= MAX_TRADES) throw Error('This practice ledger has reached its 500-fill limit.');
  const side = order?.side;
  if (side !== 'buy' && side !== 'sell') throw Error('Choose buy or sell.');
  const quantity = quantityUnits(order.quantity);
  const key = instrumentKey(instrument);
  const position = ledger.positions[key] ?? EMPTY_POSITION;
  const cash = ledger.cash[instrument.quote];
  if (side === 'sell' && quantity > position.quantity) throw Error('Sell quantity exceeds your open position on this market.');
  const { notional, fee, net, executionPrice } = tradeAmounts(quantity, quote.price, side);
  if (notional === 0n) throw Error('This order is below the simulator’s quote precision.');
  if (net > MAX_MONEY) throw Error('This trade exceeds the simulator’s supported value range.');
  if (side === 'buy' && net > cash) throw Error('Insufficient virtual cash including the fee and slippage.');

  const allocatedBasis = side === 'sell' ? roundRatio(position.basis * quantity, position.quantity) : 0n;
  const realized = side === 'sell' ? net - allocatedBasis : null;
  const cashDelta = side === 'sell' ? net : -net;
  const nextCash = cash + cashDelta;
  const nextPosition = {
    quantity: position.quantity + (side === 'sell' ? -quantity : quantity),
    basis: position.basis + (side === 'sell' ? -allocatedBasis : net),
    realized: position.realized + (realized ?? 0n),
  };
  if (nextCash > MAX_MONEY || nextPosition.basis > MAX_MONEY || nextPosition.realized > MAX_MONEY || nextPosition.realized < -MAX_MONEY) {
    throw Error('This trade exceeds the simulator’s supported value range.');
  }

  const { venue, symbol, base, quote: currency } = instrument;
  const instrumentRecord = { venue, symbol, base, quote: currency };
  const fill = {
    instrument: instrumentRecord, side, quantity: quantityText(quantity), placedAt: now,
    source: quote.source, quoteAt: quote.updatedAt, referencePrice: quote.price, executionPrice,
    fee: money(fee), cashDelta: money(cashDelta), realized: realized === null ? null : money(realized),
  };
  const trade = {
    instrument: instrumentRecord, order: { side, quantity: fill.quantity }, placedAt: now,
    quote: { venue, symbol, price: quote.price, source: quote.source, updatedAt: quote.updatedAt, stale: false },
  };
  return {
    workingOrders: ledger.workingOrders,
    cash: { ...ledger.cash, [currency]: nextCash },
    positions: { ...ledger.positions, [key]: nextPosition },
    fills: [...ledger.fills, fill],
    trades: [...ledger.trades, trade],
  };
}

function normalizeWorking(order) {
  const { type, side } = order;
  if (!['limit', 'stop-loss', 'take-profit'].includes(type)) throw Error('Choose a supported order type.');
  if (!['buy', 'sell'].includes(side)) throw Error('Choose buy or sell.');
  if (type !== 'limit' && side !== 'sell') throw Error('Stop-loss and take-profit orders must sell.');
  const input = String(order.triggerPrice ?? '').trim();
  const triggerPrice = Number(input);
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(input) || !Number.isFinite(triggerPrice) || triggerPrice <= 0) {
    throw Error('Enter a finite positive trigger price.');
  }
  return { type, side, triggerPrice, quantity: quantityText(quantityUnits(order.quantity)) };
}

function readWorking(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_WORKING_HISTORY) throw Error();
  const seen = new Set();
  return value.map(order => {
    if (!validInstrument(order.instrument) || !validTimestamp(order.createdAt)
      || typeof order.id !== 'string' || !/^[a-f0-9-]{36}$/.test(order.id) || seen.has(order.id)
      || !['working', 'filled', 'rejected', 'cancelled'].includes(order.status)
      || order.observedAt !== null && (!validTimestamp(order.observedAt) || order.observedAt <= order.createdAt)
      || order.status === 'filled' && (!Number.isFinite(order.executionPrice) || order.executionPrice <= 0 || order.observedAt === null)
      || order.status === 'rejected' && (typeof order.error !== 'string' || order.error.length > 160 || order.observedAt === null)) throw Error();
    seen.add(order.id);
    return { ...order, ...normalizeWorking(order) };
  });
}

export function paperSummary(ledger, instrument, quote, { now = Date.now() } = {}) {
  const key = instrumentKey(instrument);
  const position = ledger.positions[key] ?? EMPTY_POSITION;
  const mark = usableQuote(quote, instrument, now);
  let markValue = position.quantity === 0n ? 0n : null;
  if (position.quantity > 0n && mark) {
    const { net } = tradeAmounts(position.quantity, mark.price, 'sell');
    if (net <= MAX_MONEY) markValue = net;
  }
  const openPnl = markValue === null ? null : markValue - position.basis;
  return {
    cash: money(ledger.cash[instrument.quote]), quantity: quantityText(position.quantity), basis: money(position.basis),
    realized: money(position.realized), markValue: markValue === null ? null : money(markValue),
    openPnl: openPnl === null ? null : money(openPnl),
    totalPnl: openPnl === null ? null : money(position.realized + openPnl),
    fills: ledger.fills.filter(fill => instrumentKey(fill.instrument) === key).reverse(),
  };
}

export function createPaperStore(storage) {
  function read() {
    let raw;
    try { raw = storage.getItem(PAPER_STORAGE_KEY); }
    catch { throw Error('Browser storage is unavailable for practice.'); }
    if (raw === null) return createPaperLedger();
    try {
      const stored = JSON.parse(raw);
      if (stored.version !== 1 || !Array.isArray(stored.trades) || stored.trades.length > MAX_TRADES) throw Error();
      const ledger = stored.trades.reduce((ledger, trade) => {
        if (!Number.isSafeInteger(trade.placedAt)) throw Error();
        return fillPaperOrder(ledger, trade.instrument, trade.order, trade.quote, { now: trade.placedAt });
      }, createPaperLedger());
      return { ...ledger, workingOrders: readWorking(stored.workingOrders) };
    } catch {
      throw Error('Saved practice history could not be read.');
    }
  }

  function save(next) {
    try {
      storage.setItem(PAPER_STORAGE_KEY, JSON.stringify({ version: 1, trades: next.trades, workingOrders: next.workingOrders }));
    } catch {
      throw Error('Practice change could not be saved. Check browser storage and try again.');
    }
    return next;
  }

  function fill(instrument, order, quote, options) {
    return save(fillPaperOrder(read(), instrument, order, quote, options));
  }

  function addWorking(instrument, order, { now = Date.now() } = {}) {
    if (!validInstrument(instrument) || !validTimestamp(now)) throw Error('Choose a valid practice market.');
    const condition = normalizeWorking(order);
    const ledger = read();
    const workingOrders = [...ledger.workingOrders];
    if (workingOrders.length >= MAX_WORKING_HISTORY) {
      const old = workingOrders.findIndex(item => item.status !== 'working');
      if (old < 0) throw Error('Cancel an existing order before adding another.');
      workingOrders.splice(old, 1);
    }
    workingOrders.push({
      ...condition, instrument, id: crypto.randomUUID(), status: 'working', createdAt: now, observedAt: null,
    });
    return save({ ...ledger, workingOrders });
  }

  function cancelWorking(instrument, id) {
    const ledger = read();
    const order = ledger.workingOrders.find(item => item.id === id);
    if (!validInstrument(instrument) || !order || instrumentKey(order.instrument) !== instrumentKey(instrument)) {
      throw Error('This order is unavailable on the selected market.');
    }
    if (order.status !== 'working') return ledger;
    const workingOrders = ledger.workingOrders.map(item => item.id === id ? { ...item, status: 'cancelled' } : item);
    return save({ ...ledger, workingOrders });
  }

  function settleWorking(instrument, quote, { now = Date.now() } = {}) {
    let ledger = read();
    if (!validInstrument(instrument) || !validTimestamp(now) || !usableQuote(quote, instrument, now)) return ledger;
    const observedAt = Date.parse(quote.updatedAt);
    if (observedAt > now) return ledger;
    let changed = false;
    const workingOrders = ledger.workingOrders.map(order => {
      if (order.status !== 'working' || instrumentKey(order.instrument) !== instrumentKey(instrument)
        || observedAt <= (order.observedAt ?? order.createdAt)) return order;
      changed = true;
      const checked = { ...order, observedAt };
      const { side, type, triggerPrice } = order;
      const { executionPrice } = tradeAmounts(quantityUnits(order.quantity), quote.price, side);
      const reached = type === 'stop-loss' ? quote.price <= triggerPrice
        : type === 'take-profit' ? quote.price >= triggerPrice
        : side === 'buy' ? executionPrice <= triggerPrice : executionPrice >= triggerPrice;
      if (!reached) return checked;
      try {
        ledger = fillPaperOrder(ledger, instrument, order, quote, { now });
        return { ...checked, status: 'filled', executionPrice };
      } catch (error) {
        return { ...checked, status: 'rejected', error: error.message };
      }
    });
    return changed ? save({ ...ledger, workingOrders }) : ledger;
  }

  return { read, fill, addWorking, cancelWorking, settleWorking };
}
