import { atr, bollinger, ema, macd, normalizeCandles, rsi, sma } from './analytics.js';
import { adxSeries } from './studies.js';
import { formatter, pricePrecision } from './numbers.js';
import { INTERVALS, validInstrument } from './preferences.js';
import { compileClosedState, evaluateLiveReading } from './live-reading-engine.js';

const SAMPLE_SIZE = 50;
const RANGE_SIZE = 20;
const price = (value, quote) => `${formatter({ maximumFractionDigits: pricePrecision(value) }).format(value)} ${quote}`;
const ratio = formatter({ maximumSignificantDigits: 2 });
const signedPct = value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

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

function buildLivePov(result, sample, duration, instrument, { liveBar, liveQuote, nowSeconds }) {
  const compiled = compileClosedState(sample, duration);
  const live = evaluateLiveReading(compiled, { liveBar, liveQuote, nowSeconds });
  if (!live) return null;

  const m = live.metrics;
  if (![m.sma20, m.sma50, m.rsi, m.atr].every(Number.isFinite)) return null;

  const quote = instrument.quote;
  const spot = live.price;
  const trend = spot > m.sma20 && m.sma20 > m.sma50 ? 'Rising' : spot < m.sma20 && m.sma20 < m.sma50 ? 'Falling' : 'Mixed';
  const trendText = trend === 'Rising'
    ? (spot > m.ema9 ? 'Live price is leading above EMA 9, SMA 20, and SMA 50 in an aligned uptrend.' : 'Live price remains above SMA 20 and SMA 50, cooling slightly beneath EMA 9.')
    : trend === 'Falling'
    ? (spot < m.ema9 ? 'Live price is trading below EMA 9, SMA 20, and SMA 50 with sellers in control.' : 'Live price is rebounding above EMA 9 inside a broader SMA 20 < SMA 50 downtrend.')
    : 'Live price and key moving averages are crossing over, signaling a transitional regime.';

  const rsiRound = Math.round(m.rsi);
  const rsiDeltaStr = Math.abs(m.rsiDelta) >= 0.4 ? ` (${m.rsiDelta > 0 ? '+' : ''}${m.rsiDelta.toFixed(1)} vs close)` : '';
  const momentum = m.rsi >= 70 ? `Live buying momentum is stretched in overbought territory${rsiDeltaStr}.`
    : m.rsi <= 30 ? `Live selling pressure sits in stretched oversold territory${rsiDeltaStr}.`
    : m.rsi >= 55 ? `Live momentum leans bullish${rsiDeltaStr} with room before overbought extremes.`
    : m.rsi <= 45 ? `Live momentum leans heavy${rsiDeltaStr} without reaching oversold extremes.`
    : `Live momentum is balanced near mid-range${rsiDeltaStr}.`;

  // 6 Live-Updating Factors
  const factors = [];
  let score = 0;

  // 1. MA structure (live spot vs EMA9 / SMA20 / SMA50)
  if (trend === 'Rising') {
    score += 1;
    factors.push({ label: 'MA alignment', state: spot > m.ema9 ? 'Bullish (Live > EMA9 > SMA20)' : 'Bullish (Above SMA20/50)', tone: 'up' });
  } else if (trend === 'Falling') {
    if (spot > m.ema9 && live.barChangePct > 0.6) {
      factors.push({ label: 'MA alignment', state: 'Counter-trend lift above EMA9', tone: 'neutral' });
    } else {
      score -= 1;
      factors.push({ label: 'MA alignment', state: 'Bearish (Live < SMA20 < SMA50)', tone: 'down' });
    }
  } else {
    const fastTilt = spot > m.ema9 && spot > m.sma20 ? 'up' : spot < m.ema9 && spot < m.sma20 ? 'down' : 'neutral';
    if (fastTilt === 'up') { score += 1; factors.push({ label: 'MA alignment', state: 'Reclaiming EMA9 & SMA20', tone: 'up' }); }
    else if (fastTilt === 'down') { score -= 1; factors.push({ label: 'MA alignment', state: 'Slipping below EMA9 & SMA20', tone: 'down' }); }
    else factors.push({ label: 'MA alignment', state: 'Mixed / transitional', tone: 'neutral' });
  }

  // 2. Live Trend strength (ADX + DI)
  if (Number.isFinite(m.adx) && Number.isFinite(m.plusDI) && Number.isFinite(m.minusDI)) {
    if (m.adx >= 25 && m.plusDI > m.minusDI) {
      score += 1;
      factors.push({ label: 'Trend strength (ADX)', state: `Active uptrend (ADX ${Math.round(m.adx)}, +DI > −DI)`, tone: 'up' });
    } else if (m.adx >= 25 && m.minusDI > m.plusDI) {
      score -= 1;
      factors.push({ label: 'Trend strength (ADX)', state: `Active downtrend (ADX ${Math.round(m.adx)}, −DI > +DI)`, tone: 'down' });
    } else {
      factors.push({ label: 'Trend strength (ADX)', state: `Ranging / building (ADX ${Math.round(m.adx)})`, tone: 'neutral' });
    }
  }

  // 3. Live MACD impulse
  if (Number.isFinite(m.macdHist) && Number.isFinite(m.macdPrev)) {
    if (m.macdHist > 0 && m.macdHist >= m.macdPrev) {
      score += 1;
      factors.push({ label: 'MACD impulse', state: 'Positive & expanding live', tone: 'up' });
    } else if (m.macdHist < 0 && m.macdHist <= m.macdPrev) {
      score -= 1;
      factors.push({ label: 'MACD impulse', state: 'Negative & deepening live', tone: 'down' });
    } else if (m.macdHist > 0) {
      factors.push({ label: 'MACD impulse', state: 'Positive, cooling intraday', tone: 'neutral' });
    } else {
      factors.push({ label: 'MACD impulse', state: 'Negative, recovering intraday', tone: 'neutral' });
    }
  }

  // 4. Live RSI momentum & divergence
  const divergence = compiled.divergence;
  if (divergence) {
    score += divergence.kind === 'bullish' ? 1 : -1;
    factors.push({ label: 'RSI momentum', state: `${divergence.label} (RSI ${rsiRound})`, tone: divergence.kind === 'bullish' ? 'up' : 'down' });
  } else if (m.rsi >= 55 && m.rsi < 75) {
    score += 1;
    factors.push({ label: 'RSI momentum', state: `Constructive (${rsiRound}${Math.abs(m.rsiDelta) >= 1 ? (m.rsiDelta > 0 ? ' ↑' : ' ↓') : ''})`, tone: 'up' });
  } else if (m.rsi <= 45 && m.rsi > 25) {
    score -= 1;
    factors.push({ label: 'RSI momentum', state: `Heavy (${rsiRound}${Math.abs(m.rsiDelta) >= 1 ? (m.rsiDelta > 0 ? ' ↑' : ' ↓') : ''})`, tone: 'down' });
  } else {
    factors.push({
      label: 'RSI momentum',
      state: m.rsi >= 75 ? `Overbought (${rsiRound})` : m.rsi <= 25 ? `Oversold (${rsiRound}${m.rsiDelta >= 1 ? ' ↑' : ''})` : `Balanced (${rsiRound})`,
      tone: 'neutral',
    });
  }

  // 5. Live Volume Pace & OBV flow
  if (m.obvFlowRatio !== null) {
    const paceTag = m.volumeRatio !== null ? ` · ${ratio.format(m.volumeRatio)}× pace` : '';
    if (m.obvFlowRatio > 0.16) {
      score += 1;
      factors.push({ label: 'Volume & OBV pace', state: `Accumulation${paceTag}`, tone: 'up' });
    } else if (m.obvFlowRatio < -0.16) {
      score -= 1;
      factors.push({ label: 'Volume & OBV pace', state: `Distribution${paceTag}`, tone: 'down' });
    } else {
      factors.push({ label: 'Volume & OBV pace', state: `Balanced flow${paceTag}`, tone: 'neutral' });
    }
  }

  // 6. Live Forming Candle & VWAP Pressure
  const vwapTone = m.vwapDevPct > 0.35 && live.tape.tone !== 'down' ? 'up' : m.vwapDevPct < -0.35 && live.tape.tone !== 'up' ? 'down' : live.tape.tone;
  if (vwapTone === 'up') score += 1;
  else if (vwapTone === 'down') score -= 1;
  factors.push({
    label: 'Live bar & VWAP',
    state: `${live.tape.label} (${signedPct(m.vwapDevPct)} vs VWAP)`,
    tone: vwapTone,
  });

  // High-resolution Bias Headline incorporating live conviction & intraday shifts
  const conv = live.conviction;
  const shift = live.convictionShift;
  let bias;
  if (conv >= 42 || score >= 4) bias = 'Bullish technical alignment';
  else if (conv >= 16 || score >= 2) bias = shift >= 10 ? 'Strengthening bullish momentum' : 'Constructive — leaning higher';
  else if (conv <= -42 || score <= -4) bias = shift >= 12 ? 'Bearish trend — intraday bounce active' : 'Bearish technical alignment';
  else if (conv <= -16 || score <= -2) bias = shift >= 10 ? 'Defensive — stabilizing intraday' : 'Defensive — leaning lower';
  else if (shift >= 12) bias = 'Transitional — live buyers stepping in';
  else if (shift <= -12) bias = 'Transitional — live supply pressing lower';
  else bias = 'Balanced — range-bound structure';

  const biasTone = (conv >= 16 || score >= 2) ? 'up' : (conv <= -16 || score <= -2) ? 'down' : 'neutral';

  const lv = live.levels;
  const upTrigStr = price(lv.upsideTrigger, quote);
  const upTgtStr = price(lv.upsideTarget, quote);
  const dnTrigStr = price(lv.downsideTrigger, quote);
  const dnTgtStr = price(lv.downsideTarget, quote);
  const spotStr = price(spot, quote);

  const breachClause = lv.activeBreach
    ? lv.activeBreach.kind === 'up'
      ? ` Live price (${spotStr}) is actively pressing ${signedPct(lv.activeBreach.pct)} above the prior ${lv.activeBreach.label.toLowerCase()} (${price(lv.activeBreach.level, quote)}).`
      : ` Live price (${spotStr}) is actively trading ${signedPct(lv.activeBreach.pct)} beneath the prior ${lv.activeBreach.label.toLowerCase()} (${price(lv.activeBreach.level, quote)}).`
    : '';

  const shiftClause = Math.abs(shift) >= 8
    ? ` Intraday conviction shifted ${shift > 0 ? '+' : ''}${shift} pts from last close (${live.tape.label.toLowerCase()}, ${signedPct(live.barChangePct)} on current bar).`
    : ` Current candle is ${signedPct(live.barChangePct)} (${live.elapsedPct}% elapsed, closes in ${live.countdown}).`;

  const directionSummary = biasTone === 'up'
    ? `Live indicators lean bullish (${score > 0 ? '+' : ''}${score}/${factors.length}, conviction ${conv > 0 ? '+' : ''}${conv}/100) at ${live.range.posPct}% of the 20-bar range.${breachClause} Clearing ${lv.upsideLabel} (${upTrigStr}, ${signedPct(lv.upsideDistPct)}) opens ${upTgtStr}, while losing ${lv.downsideLabel} (${dnTrigStr}, ${signedPct(lv.downsideDistPct)}) weakens momentum.${shiftClause}`
    : biasTone === 'down'
    ? `Live indicators align defensively (${score > 0 ? '+' : ''}${score}/${factors.length}, conviction ${conv}/100) at ${live.range.posPct}% of the 20-bar range.${breachClause} A break beneath ${lv.downsideLabel} (${dnTrigStr}, ${signedPct(lv.downsideDistPct)}) exposes ${dnTgtStr}, while reclaiming ${lv.upsideLabel} (${upTrigStr}, ${signedPct(lv.upsideDistPct)}) eases selling pressure.${shiftClause}`
    : `Live signals are balanced (${score >= 0 ? '+' : ''}${score}/${factors.length}, conviction ${conv >= 0 ? '+' : ''}${conv}/100) with spot at ${live.range.posPct}% of the 20-bar range.${breachClause}${live.volatilitySqueeze ? ' Bollinger Bandwidth is compressed in a squeeze — watch for a decisive break outside ' + dnTrigStr + ' or ' + upTrigStr + '.' : ` Watch ${lv.upsideLabel} (${upTrigStr}) above and ${lv.downsideLabel} (${dnTrigStr}) below for the next directional leg.`}${shiftClause}`;

  const volState = live.volatilitySqueeze
    ? `Live volatility squeeze (BBW ${m.bbw.toFixed(2)}%) — tight compression often precedes an expanded directional break.`
    : `Live ATR averages ${price(m.atr, quote)} per bar (${(m.atr / spot * 100).toFixed(2)}% of spot); current bar spans ${(live.tape.expansion * 100).toFixed(0)}% of ATR.`;

  const volumeNote = m.volumeRatio === null
    ? 'Live candle volume is still accumulating against the 20-bar baseline.'
    : `Forming candle is tracking ${ratio.format(m.volumeRatio)}× normal volume pace (${live.elapsedPct}% through bar).${m.obvFlowRatio !== null && Math.abs(m.obvFlowRatio) > 0.16 ? (m.obvFlowRatio > 0 ? ' 10-bar OBV shows net accumulation.' : ' 10-bar OBV shows net distribution.') : ''}`;

  const invalidationLevel = biasTone === 'up' ? Math.min(m.ema20, m.sma20) : biasTone === 'down' ? Math.max(m.ema20, m.sma20) : null;

  return {
    ...result,
    ready: true,
    reason: null,
    method: 'Real-time incremental multi-factor chart engine (O(1) live + confirmed structure)',
    trend,
    range: { high: live.range.high, low: live.range.low, periods: RANGE_SIZE },
    metrics: {
      close: spot,
      sma20: m.sma20,
      sma50: m.sma50,
      ema9: m.ema9,
      ema20: m.ema20,
      rsi: m.rsi,
      atr: m.atr,
      adx: m.adx,
      bbw: m.bbw,
      vwap20: m.vwap20,
      volumeRatio: m.volumeRatio,
      obvFlowRatio: m.obvFlowRatio,
    },
    live: {
      active: true,
      price: spot,
      barOpen: live.barOpen,
      barHigh: live.barHigh,
      barLow: live.barLow,
      barChangePct: live.barChangePct,
      elapsedPct: live.elapsedPct,
      remainingSec: live.remainingSec,
      countdown: live.countdown,
      updatedAt: live.updatedAt,
      conviction: live.conviction,
      closedConviction: live.closedConviction,
      convictionShift: live.convictionShift,
      tape: live.tape,
      vwap20: m.vwap20,
      vwapDevPct: m.vwapDevPct,
      rsiDelta: m.rsiDelta,
      upsideLabel: lv.upsideLabel,
      upsideDistPct: lv.upsideDistPct,
      downsideLabel: lv.downsideLabel,
      downsideDistPct: lv.downsideDistPct,
      activeBreach: lv.activeBreach,
      revisionKey: live.revisionKey,
    },
    outlook: {
      bias,
      biasTone,
      score,
      maxScore: factors.length,
      conviction: live.conviction,
      convictionShift: live.convictionShift,
      summary: directionSummary,
      factors,
      volatilitySqueeze: live.volatilitySqueeze,
      divergence,
      rangePosPct: live.range.posPct,
      upsideTrigger: lv.upsideTrigger,
      upsideLabel: lv.upsideLabel,
      upsideDistPct: lv.upsideDistPct,
      upsideTarget: lv.upsideTarget,
      downsideTrigger: lv.downsideTrigger,
      downsideLabel: lv.downsideLabel,
      downsideDistPct: lv.downsideDistPct,
      downsideTarget: lv.downsideTarget,
      activeBreach: lv.activeBreach,
      invalidationLevel,
    },
    observations: [
      { label: 'Price trend', text: trendText, detail: `EMA 9 ${price(m.ema9, quote)} · SMA 20 ${price(m.sma20, quote)} · SMA 50 ${price(m.sma50, quote)}${Number.isFinite(m.adx) ? ` · ADX ${Math.round(m.adx)}` : ''}` },
      { label: 'Momentum', text: divergence ? `${momentum} ${divergence.detail}` : momentum, detail: `Live RSI 14 ${rsiRound} / 100${rsiDeltaStr} · VWAP 20 ${price(m.vwap20, quote)} (${signedPct(m.vwapDevPct)})` },
      { label: 'Volatility & move', text: volState, detail: `Live ATR 14 ${price(m.atr, quote)}${m.bbw !== null ? ` · BB Width ${m.bbw.toFixed(2)}%` : ''}` },
      { label: 'Trading volume', text: volumeNote, detail: `Time-normalized pace across forming candle + 10-bar OBV flow.` },
    ],
    scenarios: [
      { label: `Upside path (${lv.upsideLabel})`, text: `Sustained trade and candle close above ${upTrigStr} (${signedPct(lv.upsideDistPct)} from live spot) targets ${upTgtStr} (+1.5× ATR measured move).` },
      { label: 'Active range rotation', text: `Between ${dnTrigStr} (${lv.downsideLabel}) and ${upTrigStr} (${lv.upsideLabel}), expect rotation around 20-bar VWAP (${price(m.vwap20, quote)}).` },
      { label: `Downside path (${lv.downsideLabel})`, text: `A confirmed close beneath ${dnTrigStr} (${signedPct(lv.downsideDistPct)} from live spot) opens downside risk toward ${dnTgtStr} (−1.5× ATR measured move).` },
    ],
  };
}

export function buildStudyPov({ bars, instrument, interval, nowSeconds = Date.now() / 1000, candleMeta, confirmedThrough, liveBar = null, liveQuote = null, includeLive = false } = {}) {
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
    live: null,
    stale: candleMeta?.cache === 'stale',
    truncatedByGap: false,
  };
  if (!validInstrument(instrument) || !duration || !Number.isFinite(nowSeconds)) return result;

  const fetchedAt = Date.parse(candleMeta?.fetchedAt) / 1000;
  const observedThrough = Number.isFinite(fetchedAt) ? fetchedAt : nowSeconds;
  const confirmed = Number.isFinite(confirmedThrough) && confirmedThrough <= nowSeconds ? confirmedThrough : 0;
  const liveObserved = includeLive && Number.isFinite(liveBar?.time) && liveBar.time <= nowSeconds ? liveBar.time : 0;
  const cutoff = Math.min(nowSeconds, Math.max(observedThrough, confirmed, liveObserved));
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

  // Real-time incremental path when live streaming data is provided
  if (includeLive && (liveBar || (Number.isFinite(liveQuote?.price) && liveQuote.price > 0))) {
    const livePov = buildLivePov(result, sample, duration, instrument, { liveBar, liveQuote, nowSeconds });
    if (livePov) return livePov;
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
