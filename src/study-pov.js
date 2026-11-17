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

const REVIEWED_ON = '2026-11-18';
const endOf2026 = '2026-12-31';
const bitwise = {
  publisher: 'Bitwise Asset Management',
  author: 'Matt Hougan and Ryan Rasmussen',
  title: 'The Year Ahead: 10 Crypto Predictions for 2026',
  url: 'https://bitwiseinvestments.com/crypto-market-insights/the-year-ahead-10-crypto-predictions-for-2026',
  published: '2025-12-15',
  period: 'Calendar year 2026',
  periodEnd: endOf2026,
};
const sources = {
  BTC: [
    {
      publisher: '21shares',
      title: 'Good time to buy bitcoin? Four signals worth watching',
      url: 'https://www.21shares.com/en-us/insights/good-time-to-buy-bitcoin',
      published: '2026-11-09',
      period: 'By year-end 2026',
      periodEnd: endOf2026,
      view: 'Projected a recovery toward US$100,000 by year-end.',
      context: 'Extrapolates from a small sample of past cycle recoveries. The separate mid-2027 view has a later deadline.',
    },
    {
      publisher: 'CF Benchmarks',
      title: 'Risk-On Reloaded: Monetary Easing, Catch-up Trades, and the Tokenization Buildout',
      url: 'https://www.cfbenchmarks.com/blog/risk-on-reloaded-monetary-easing-catch-up-trades-and-the-tokenization-buildout',
      published: '2025-12-30',
      period: 'Year-end 2026',
      periodEnd: endOf2026,
      view: 'Modeled about US$138,000 at year-end if Bitcoin’s market cap relative to gold returned to trend.',
      context: 'A conditional valuation scenario that also assumes gold’s market cap grows at its trend rate.',
    },
    {
      publisher: 'Galaxy Research',
      author: 'Alex Thorn',
      title: '26 Crypto, Bitcoin, DeFi, and AI Predictions for 2026',
      url: 'https://www.galaxy.com/insights/research/predictions-2026-crypto-bitcoin-defi',
      published: '2025-12-18',
      period: 'Calendar year 2026',
      periodEnd: endOf2026,
      view: 'Allowed for a new record in 2026 and declined to make a 2026 price forecast.',
      context: 'Cited wide option-market outcomes as evidence of uncertainty. Its price target was for the end of 2027.',
    },
    {
      ...bitwise,
      view: 'Expected Bitcoin to set a new record during 2026.',
      context: 'An at-any-point record forecast offers no year-end closing price.',
    },
    {
      publisher: 'Grayscale Research',
      title: '2026 Digital Asset Outlook: Dawn of the Institutional Era',
      url: 'https://research.grayscale.com/reports/2026-digital-asset-outlook-dawn-of-the-institutional-era',
      published: '2025-12-15',
      period: 'First half of 2026',
      periodEnd: '2026-06-30',
      view: 'Expected Bitcoin could exceed its prior high in the first half of 2026.',
      context: 'The published window ended June 30. The view relied on demand for alternative stores of value and institutional adoption.',
    },
  ],
  ETH: [{
    ...bitwise,
    view: 'Expected a new Ether record during 2026 if the CLARITY Act passed.',
    context: 'The published forecast depends on a legislative condition.',
  }],
  SOL: [{
    ...bitwise,
    view: 'Expected a new Solana record during 2026 if the CLARITY Act passed.',
    context: 'The published forecast depends on a legislative condition.',
  }],
};

export function getAnalystResearch(base, { asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const asset = typeof base === 'string' ? base.toUpperCase() : '';
  const datedViews = Object.hasOwn(sources, asset) ? sources[asset] : [];
  const views = datedViews.filter(view => view.published <= asOf).map(view => ({ ...view, periodEnded: view.periodEnd < asOf }));
  const eligibleForComparison = views.some(view => view.publisher === 'CF Benchmarks') && views.some(view => view.publisher === '21shares');
  const synthesis = eligibleForComparison
    ? 'The two year-end figures have different assumptions and publication dates. A conditional valuation and a recovery projection offer insufficient comparable evidence for an average.'
    : 'Comparable average unavailable. The reviewed sources provide too few equivalent price forecasts.';
  return {
    asOf: REVIEWED_ON,
    coverage: views.length
      ? `Curated primary publications on ${asset} for 2026. These dated examples are market-wide. Publishers may have commercial exposure to crypto.`
      : 'Reviewed coverage is limited to BTC, ETH and SOL. No dated view is available for this selection.',
    views,
    aggregate: null,
    synthesis,
  };
}
