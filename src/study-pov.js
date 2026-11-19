import { atr, bollinger, ema, macd, normalizeCandles, rsi, sma } from './analytics.js';
import { adxSeries } from './studies.js';
import { formatter, pricePrecision } from './numbers.js';
import { INTERVALS, validInstrument } from './preferences.js';

const SAMPLE_SIZE = 50;
const RANGE_SIZE = 20;
const price = (value, quote) => `${formatter({ maximumFractionDigits: pricePrecision(value) }).format(value)} ${quote}`;
const ratio = formatter({ maximumSignificantDigits: 2 });

function detectRsiDivergence(sample, rsiValues) {
  const highPivots = [];
  const lowPivots = [];
  for (let i = 16; i < sample.length - 2; i++) {
    const r = rsiValues[i];
    if (!Number.isFinite(r)) continue;
    const b = sample[i];
    const neighbors = [sample[i - 2], sample[i - 1], sample[i + 1], sample[i + 2]];
    if (neighbors.every(o => b.high > o.high)) highPivots.push({ price: b.high, rsi: r, index: i });
    if (neighbors.every(o => b.low < o.low)) lowPivots.push({ price: b.low, rsi: r, index: i });
  }
  const lastTwoHighs = highPivots.slice(-2);
  if (lastTwoHighs.length === 2 && lastTwoHighs[1].price > lastTwoHighs[0].price && lastTwoHighs[1].rsi < lastTwoHighs[0].rsi - 3) {
    return { kind: 'bearish', label: 'Bearish RSI divergence', detail: 'Higher swing high paired with lower RSI peak — upward momentum is waning.' };
  }
  const lastTwoLows = lowPivots.slice(-2);
  if (lastTwoLows.length === 2 && lastTwoLows[1].price < lastTwoLows[0].price && lastTwoLows[1].rsi > lastTwoLows[0].rsi + 3) {
    return { kind: 'bullish', label: 'Bullish RSI divergence', detail: 'Lower swing low paired with higher RSI trough — downward pressure is fading.' };
  }
  return null;
}

export function buildStudyPov({ bars, instrument, interval, nowSeconds = Date.now() / 1000, candleMeta, confirmedThrough } = {}) {
  const duration = Object.hasOwn(INTERVALS, interval) ? INTERVALS[interval] : 0;
  const result = {
    ready: false,
    reason: 'Choose a market and chart interval to study.',
    method: 'Rules-based multi-factor chart study',
    instrument,
    interval,
    closedAt: null,
    sampleCount: 0,
    trend: null,
    observations: [],
    scenarios: [],
    outlook: null,
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
  const sma20Series = sma(closes, 20);
  const sma20 = sma20Series.at(-1);
  const sma50 = sma(closes, 50).at(-1);
  const ema20Series = ema(closes, 20);
  const ema20 = ema20Series.at(-1);
  const rsiSeries = rsi(closes, 14);
  const strength = rsiSeries.at(-1);
  const trueRange = atr(sample, 14).at(-1);
  const macdObj = macd(closes);
  const macdHist = macdObj.histogram.at(-1);
  const macdPrev = macdObj.histogram.at(-2);
  const { adx: adxArr, plusDI, minusDI } = adxSeries(sample, 14);
  const adxVal = adxArr.at(-1);
  const pdiVal = plusDI.at(-1);
  const mdiVal = minusDI.at(-1);
  const bb = bollinger(closes, 20, 2);
  const bbwSeries = bb.middle.map((m, i) => m > 0 && Number.isFinite(bb.upper[i]) ? (bb.upper[i] - bb.lower[i]) / m * 100 : null).filter(Number.isFinite);
  const bbwNow = bbwSeries.at(-1) ?? null;
  const bbwSorted = [...bbwSeries].sort((a, b) => a - b);
  const bbwQuartile = bbwSorted.length >= 8 ? bbwSorted[Math.floor(bbwSorted.length * 0.25)] : null;
  const volatilitySqueeze = bbwNow !== null && bbwQuartile !== null && bbwNow <= bbwQuartile;

  // 10-bar OBV flow check
  let obvDelta = 0, totalVol10 = 0;
  for (let i = sample.length - 10; i < sample.length; i++) {
    obvDelta += Math.sign(sample[i].close - sample[i - 1].close) * sample[i].volume;
    totalVol10 += sample[i].volume;
  }
  const priceChange10 = last.close - sample[sample.length - 11].close;
  const obvFlowRatio = totalVol10 > 0 ? obvDelta / totalVol10 : null;
  const divergence = detectRsiDivergence(sample, rsiSeries);

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
  const momentum = strength >= 70 ? 'Recent gains dominate the momentum measure (stretched overbought zone).'
    : strength <= 30 ? 'Recent losses dominate the momentum measure (stretched oversold zone).'
    : strength >= 55 ? 'Bullish momentum leans higher without reaching overbought extremes.'
    : strength <= 45 ? 'Bearish momentum leans lower without reaching oversold extremes.'
    : 'Momentum is neutral between the commonly watched extremes.';
  const recent = sample.slice(-RANGE_SIZE);
  const high = Math.max(...recent.map(bar => bar.high));
  const low = Math.min(...recent.map(bar => bar.low));
  const rangeSpan = high - low;
  const rangePosPct = rangeSpan > 0 ? Math.round((last.close - low) / rangeSpan * 100) : 50;
  const quote = instrument.quote;
  const upper = price(high, quote);
  const lower = price(low, quote);

  // Multi-factor directional synthesis (transparent, rules-based score from -5 to +5)
  const factors = [];
  let score = 0;

  if (trend === 'Rising') { score += 1; factors.push({ label: 'MA alignment', state: 'Bullish (Close > SMA20 > SMA50)', tone: 'up' }); }
  else if (trend === 'Falling') { score -= 1; factors.push({ label: 'MA alignment', state: 'Bearish (Close < SMA20 < SMA50)', tone: 'down' }); }
  else { factors.push({ label: 'MA alignment', state: 'Mixed / transitional', tone: 'neutral' }); }

  if (Number.isFinite(adxVal) && Number.isFinite(pdiVal) && Number.isFinite(mdiVal)) {
    if (adxVal >= 25 && pdiVal > mdiVal) { score += 1; factors.push({ label: 'Trend strength (ADX)', state: `Active uptrend (ADX ${Math.round(adxVal)}, +DI > −DI)`, tone: 'up' }); }
    else if (adxVal >= 25 && mdiVal > pdiVal) { score -= 1; factors.push({ label: 'Trend strength (ADX)', state: `Active downtrend (ADX ${Math.round(adxVal)}, −DI > +DI)`, tone: 'down' }); }
    else { factors.push({ label: 'Trend strength (ADX)', state: `Weak / ranging (ADX ${Math.round(adxVal)})`, tone: 'neutral' }); }
  }

  if (Number.isFinite(macdHist) && Number.isFinite(macdPrev)) {
    if (macdHist > 0 && macdHist >= macdPrev) { score += 1; factors.push({ label: 'MACD impulse', state: 'Positive & expanding', tone: 'up' }); }
    else if (macdHist < 0 && macdHist <= macdPrev) { score -= 1; factors.push({ label: 'MACD impulse', state: 'Negative & deepening', tone: 'down' }); }
    else { factors.push({ label: 'MACD impulse', state: macdHist > 0 ? 'Positive, cooling' : 'Negative, recovering', tone: 'neutral' }); }
  }

  if (divergence) {
    score += divergence.kind === 'bullish' ? 1 : -1;
    factors.push({ label: 'RSI momentum', state: divergence.label, tone: divergence.kind === 'bullish' ? 'up' : 'down' });
  } else if (strength >= 55 && strength < 75) {
    score += 1; factors.push({ label: 'RSI momentum', state: `Constructive (${Math.round(strength)})`, tone: 'up' });
  } else if (strength <= 45 && strength > 25) {
    score -= 1; factors.push({ label: 'RSI momentum', state: `Heavy (${Math.round(strength)})`, tone: 'down' });
  } else {
    factors.push({ label: 'RSI momentum', state: strength >= 75 ? `Overbought (${Math.round(strength)})` : strength <= 25 ? `Oversold (${Math.round(strength)})` : `Balanced (${Math.round(strength)})`, tone: 'neutral' });
  }

  if (obvFlowRatio !== null) {
    if (obvFlowRatio > 0.18) { score += 1; factors.push({ label: 'Volume flow (OBV)', state: 'Accumulation bias (10-bar)', tone: 'up' }); }
    else if (obvFlowRatio < -0.18) { score -= 1; factors.push({ label: 'Volume flow (OBV)', state: 'Distribution bias (10-bar)', tone: 'down' }); }
    else { factors.push({ label: 'Volume flow (OBV)', state: 'Balanced participation', tone: 'neutral' }); }
  }

  const bias = score >= 3 ? 'Bullish technical alignment'
    : score >= 1 ? 'Constructive — leaning higher'
    : score <= -3 ? 'Bearish technical alignment'
    : score <= -1 ? 'Defensive — leaning lower'
    : 'Balanced — range-bound structure';
  const biasTone = score >= 1 ? 'up' : score <= -1 ? 'down' : 'neutral';

  const upsideTarget = high + 1.5 * trueRange;
  const downsideTarget = Math.max(0, low - 1.5 * trueRange);
  const invalidationLevel = score >= 1 ? Math.min(ema20 ?? sma20, sma20) : score <= -1 ? Math.max(ema20 ?? sma20, sma20) : null;
  const directionSummary = score >= 2
    ? `Multiple closed-bar indicators align upward (${score > 0 ? '+' : ''}${score}/${factors.length}). Price currently sits at ${rangePosPct}% of its 20-bar range; sustained closes above ${upper} favor continuation toward ${price(upsideTarget, quote)}, while a close below ${price(invalidationLevel ?? low, quote)} weakens the bullish structure.`
    : score <= -2
    ? `Multiple closed-bar indicators align downward (${score}/${factors.length}). Price currently sits at ${rangePosPct}% of its 20-bar range; a confirmed break below ${lower} exposes ${price(downsideTarget, quote)}, while reclaiming ${price(invalidationLevel ?? high, quote)} relieves immediate selling pressure.`
    : `Technical signals are mixed (${score >= 0 ? '+' : ''}${score}/${factors.length}) with price at ${rangePosPct}% of its 20-bar range (${lower} to ${upper}).${volatilitySqueeze ? ' Bollinger Bandwidth is compressed in a volatility squeeze — watch for a decisive close outside either edge to set the next directional leg.' : ' Expect two-way rotation inside the range until a confirmed close clears either boundary.'}`;

  const volState = volatilitySqueeze
    ? `Volatility squeeze (BBW ${bbwNow.toFixed(2)}%) — compression often precedes an expanded directional move.`
    : `Recent candles have moved about ${price(trueRange, quote)} per bar on average (${(trueRange / last.close * 100).toFixed(2)}% ATR).`;

  const volumeNote = volumeRatio === null
    ? 'The previous candles have no usable volume baseline.'
    : `Last closed candle traded ${ratio.format(volumeRatio)}× average volume.${obvFlowRatio !== null && Math.sign(priceChange10) !== 0 && Math.sign(obvFlowRatio) !== Math.sign(priceChange10) && Math.abs(obvFlowRatio) > 0.15 ? ' Note: 10-bar volume flow diverges from recent price direction.' : ''}`;

  return {
    ...result,
    ready: true,
    reason: null,
    trend,
    range: { high, low, periods: RANGE_SIZE },
    metrics: { close: last.close, sma20, sma50, ema20, rsi: strength, atr: trueRange, adx: adxVal, bbw: bbwNow, volumeRatio, obvFlowRatio },
    outlook: {
      bias, biasTone, score, maxScore: factors.length, summary: directionSummary, factors,
      volatilitySqueeze, divergence, rangePosPct,
      upsideTrigger: high, upsideTarget,
      downsideTrigger: low, downsideTarget,
      invalidationLevel,
    },
    observations: [
      { label: 'Price trend', text: trendText, detail: `SMA 20 ${price(sma20, quote)} · SMA 50 ${price(sma50, quote)}${Number.isFinite(adxVal) ? ` · ADX ${Math.round(adxVal)}` : ''}` },
      { label: 'Momentum', text: divergence ? `${momentum} ${divergence.detail}` : momentum, detail: `RSI 14 ${Math.round(strength)} / 100 · thresholds 30 and 70` },
      { label: 'Volatility & move', text: volState, detail: `ATR 14 ${price(trueRange, quote)}${bbwNow !== null ? ` · BB Width ${bbwNow.toFixed(2)}%` : ''}` },
      { label: 'Trading volume', text: volumeNote, detail: 'Compares base-asset volume and 10-bar OBV flow on this venue.' },
    ],
    scenarios: [
      { label: 'Upside continuation path', text: `If a later candle closes above ${upper}, watch for continuation toward ${price(upsideTarget, quote)} (+1.5× ATR measured move). Falling back inside ${upper} invalidates the breakout.` },
      { label: 'Range consolidation', text: `While closes remain between ${lower} and ${upper} (currently ${rangePosPct}% across the range), mean reversion between support and resistance stays dominant.` },
      { label: 'Downside risk path', text: `If a later candle closes below ${lower}, downside opens toward ${price(downsideTarget, quote)} (−1.5× ATR measured move). Reclaiming ${lower} neutralizes the breakdown.` },
    ],
  };
}

export { getAnalystResearch } from './analyst-research.js';
