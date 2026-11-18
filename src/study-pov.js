import { atr, normalizeCandles, rsi, sma } from './analytics.js';
import { formatter, pricePrecision } from './numbers.js';
import { INTERVALS, validInstrument } from './preferences.js';

const SAMPLE_SIZE = 50;
const RANGE_SIZE = 20;
const price = (value, quote) => `${formatter({ maximumFractionDigits: pricePrecision(value) }).format(value)} ${quote}`;
const ratio = formatter({ maximumSignificantDigits: 2 });

export function buildStudyPov({ bars, instrument, interval, nowSeconds = Date.now() / 1000, candleMeta, confirmedThrough } = {}) {
  const duration = Object.hasOwn(INTERVALS, interval) ? INTERVALS[interval] : 0;
  const result = {
    ready: false,
    reason: 'Choose a market and chart interval to study.',
    method: 'Rules-based chart study',
    instrument,
    interval,
    closedAt: null,
    sampleCount: 0,
    trend: null,
    observations: [],
    scenarios: [],
    stale: candleMeta?.cache === 'stale',
    truncatedByGap: false,
  };
  if (!validInstrument(instrument) || !duration || !Number.isFinite(nowSeconds)) return result;

  const fetchedAt = Date.parse(candleMeta?.fetchedAt) / 1000;
  const observedThrough = Number.isFinite(fetchedAt) ? fetchedAt : nowSeconds;
  const confirmed = Number.isFinite(confirmedThrough) && confirmedThrough <= nowSeconds ? confirmedThrough : 0;
  const cutoff = Math.min(nowSeconds, Math.max(observedThrough, confirmed));
  const eligible = Array.isArray(bars) ? bars.filter(bar => bar && bar.time % duration === 0 && bar.time + duration <= cutoff) : [];
  const closed = normalizeCandles(eligible);
  if (!closed.length) return { ...result, reason: 'Waiting for a completed candle from this market.' };

  // Only use a continuous recent sample so a page of older history cannot change the study.
  let first = closed.length - 1;
  while (first > 0 && closed.length - first < SAMPLE_SIZE && closed[first].time - closed[first - 1].time === duration) first--;
  const sample = closed.slice(first);
  const closedAt = closed.at(-1).time + duration;
  result.closedAt = closedAt;
  result.sampleCount = sample.length;
  result.stale ||= nowSeconds - closedAt >= duration;
  result.truncatedByGap = first > 0 && sample.length < SAMPLE_SIZE;
  if (sample.length < SAMPLE_SIZE) {
    const missing = result.truncatedByGap ? 'A gap limits the recent sample.' : 'More market history is needed.';
    return { ...result, reason: `Study POV needs ${SAMPLE_SIZE} consecutive closed candles. ${missing}` };
  }

  const last = sample.at(-1);
  const closes = sample.map(bar => bar.close);
  const sma20 = sma(closes, 20).at(-1);
  const sma50 = sma(closes, 50).at(-1);
  const strength = rsi(closes, 14).at(-1);
  const trueRange = atr(sample, 14).at(-1);
  const priorVolume = sample.slice(-(RANGE_SIZE + 1), -1).reduce((sum, bar) => sum + bar.volume / RANGE_SIZE, 0);
  const comparison = priorVolume > 0 ? last.volume / priorVolume : null;
  const volumeRatio = Number.isFinite(comparison) ? comparison : null;
  if (![sma20, sma50, strength, trueRange].every(Number.isFinite)) {
    return { ...result, reason: 'These candles are outside the supported calculation range.' };
  }

  const trend = last.close > sma20 && sma20 > sma50 ? 'Rising' : last.close < sma20 && sma20 < sma50 ? 'Falling' : 'Mixed';
  const trendText = {
    Rising: 'The latest close is above its shorter and longer averages, and the shorter average is higher.',
    Falling: 'The latest close is below its shorter and longer averages, and the shorter average is lower.',
    Mixed: 'The latest close and its shorter and longer averages do not line up in one direction.',
  }[trend];
  const momentum = strength >= 70 ? 'Recent gains dominate the momentum measure.' : strength <= 30 ? 'Recent losses dominate the momentum measure.' : 'Momentum is between the commonly watched extremes.';
  const recent = sample.slice(-RANGE_SIZE);
  const high = Math.max(...recent.map(bar => bar.high));
  const low = Math.min(...recent.map(bar => bar.low));
  const quote = instrument.quote;
  const upper = price(high, quote);
  const lower = price(low, quote);

  return {
    ...result,
    ready: true,
    reason: null,
    trend,
    range: { high, low, periods: RANGE_SIZE },
    metrics: { close: last.close, sma20, sma50, rsi: strength, atr: trueRange, volumeRatio },
    observations: [
      { label: 'Price trend', text: trendText, detail: `SMA 20 ${price(sma20, quote)} · SMA 50 ${price(sma50, quote)}` },
      { label: 'Momentum', text: momentum, detail: `RSI 14 ${Math.round(strength)} / 100 · thresholds 30 and 70` },
      { label: 'Typical move', text: `Recent candles have moved about ${price(trueRange, quote)} per bar on average.`, detail: `ATR 14 uses trading ranges and gaps from the previous candle’s close.` },
      { label: 'Trading volume', text: volumeRatio === null ? 'The previous candles have no usable volume baseline.' : `The last closed candle traded ${ratio.format(volumeRatio)}× the prior average volume.`, detail: 'Compares base-asset volume with the previous 20 candles from this venue.' },
    ],
    scenarios: [
      { label: 'Close above the range', text: `If a later candle closes above ${upper}, check whether subsequent closes hold above that level. A close back inside the range weakens the breakout reading.` },
      { label: 'Close inside the range', text: `If later candles close between ${lower} and ${upper}, the recent range still contains price. Wicks beyond the edges can happen without a close outside.` },
      { label: 'Close below the range', text: `If a later candle closes below ${lower}, check whether it stays below. A close back inside the range weakens the breakdown reading.` },
    ],
  };
}

export { getAnalystResearch } from './analyst-research.js';
