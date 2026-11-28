import assert from 'node:assert/strict';
import test from 'node:test';
import { createGateway, parseNews, scoreNewsImpact } from '../server/gateway.js';
import { newsWindow } from '../src/news-window.js';
import { renderNewsCards } from '../src/news-view.js';
import { buildKpiIntelligence } from '../src/market-intel.js';
import { resolveCoinColors } from '../src/comparison.js';
import { buildStudyPov } from '../src/study-pov.js';

const DAY = 86400;
const startDay = 1_760_000_000 - (1_760_000_000 % DAY);
const instrument = { venue: 'binance', symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT' };

test('Stage 1: News digests score Week/Month/Year impact cleanly, extract Google News publisher, and reject invalid windows', async () => {
  const now = Date.parse('2026-11-28T12:00:00Z');
  const monthItem = {
    title: 'BlackRock Bitcoin ETF inflows hit monthly record as Fed signals rate cut',
    source: 'Reuters',
    publishedAt: '2026-11-05T10:00:00Z',
  };
  const scoredMonth = scoreNewsImpact(monthItem, now, { window: 'month' });
  assert.equal(scoredMonth.impact, 'high');
  assert.equal(scoredMonth.tier, 'institutional');
  assert.ok(scoredMonth.priority > 60);

  const gXml = `<rss><channel><item>
    <title>OCC Issues Final Rule for GENIUS Act Stablecoins - Reuters</title>
    <link>https://news.google.com/rss/articles/abc123</link>
    <pubDate>Wed, 21 Oct 2026 07:00:00 GMT</pubDate>
    <source url="https://www.reuters.com">Reuters</source>
  </item></channel></rss>`;
  const parsed = parseNews(gXml, 'News Index', { googleNews: true });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].source, 'Reuters');
  assert.equal(parsed[0].title, 'OCC Issues Final Rule for GENIUS Act Stablecoins');

  const win = newsWindow([
    { ...monthItem, url: 'https://reuters.com/1', priority: 90, impact: 'high' },
    { title: 'Bitcoin breaks resistance', source: 'CoinDesk', url: 'https://coindesk.com/1', publishedAt: '2026-11-26T10:00:00Z', priority: 50, impact: 'medium' },
  ], { window: 'week', nowMs: now });
  assert.equal(win.total, 1, 'Week window must exclude 23-day-old story');
  const cardHtml = renderNewsCards([{ ...monthItem, url: 'https://reuters.com/1', impact: 'high', corroboratedBy: 3 }], { window: 'month' });
  assert.match(cardHtml, /3 outlets/);
  assert.match(cardHtml, /(?:Nov 5, 2026|5 Nov 2026)/);

  const gw = createGateway({ fetcher: async () => Response.json({}) });
  const bad = await gw(new Request('http://localhost/api/news?window=century'));
  assert.equal(bad.status, 400);
});

test('Stage 2: Home KPI intelligence drawers explain live Market Cap, Volume, BTC Dominance & 30d Fear & Greed accurately', () => {
  const global = { data: { marketCap: 2.07e12, volume: 67.27e9, change: -5.49, btcDominance: 57.8, ethDominance: 11.4, activeCoins: 15200 } };
  const history = Array.from({ length: 30 }, (_, i) => ({ value: 32 - Math.round(i * 0.75), label: i > 20 ? 'Extreme Fear' : 'Fear', updatedAt: new Date(Date.now() - (29 - i) * 86400000).toISOString() }));
  const sentiment = { data: { value: 10, label: 'Extreme Fear', yesterday: 12, weekAgo: 15, monthAgo: 32, extremeStreak: 9, history } };
  const markets = { data: Array.from({ length: 20 }, (_, i) => ({ symbol: i === 0 ? 'BTC' : 'ALT' + i, name: 'Coin ' + i, marketCap: 1e10 - i * 1e8, volume: 2e9 - i * 5e7, change: i < 4 ? 1.5 : -4.2 })) };

  const cap = buildKpiIntelligence('marketCap', { global, sentiment, markets });
  assert.match(cap.body, /Risk-off contraction/);
  assert.match(cap.body, /4 Up \/ 16 Down/);

  const vol = buildKpiIntelligence('volume', { global, sentiment, markets });
  assert.match(vol.body, /3\.25%/);

  const dom = buildKpiIntelligence('dominance', { global, sentiment, markets });
  assert.match(dom.body, /57\.80%/);
  assert.match(dom.body, /flight-to-safety/i);

  const fng = buildKpiIntelligence('sentiment', { global, sentiment, markets });
  assert.match(fng.body, /9d streak/);
  assert.match(fng.body, /kpi-spark-svg/);
  assert.match(fng.body, /contrarian accumulation zone/i);
});

test('Stage 3: Comparison resolves distinct per-coin colors and persists custom overrides without collisions', () => {
  const defaults = resolveCoinColors(['BTC', 'ETH', 'SOL', 'XRP'], {});
  assert.equal(new Set(defaults).size, 4);
  assert.equal(defaults[0], '#f59e0b');
  assert.equal(defaults[1], '#8b7cf6');

  const custom = resolveCoinColors(['BTC', 'ETH', 'SOL'], { BTC: '#11aabb', SOL: '#ff3366' });
  assert.equal(custom[0], '#11aabb');
  assert.equal(custom[1], '#8b7cf6');
  assert.equal(custom[2], '#ff3366');
});

test('Stage 5: Chart Reading detects oversold exhaustion, OBV accumulation & L2 bid support instead of blindly calling down at bottoms', () => {
  // Simulate steady selloff down to ~$58k with strong hidden OBV accumulation on down bars + oversold RSI + lower-wick bid absorption
  const bars = [];
  let px = 76000;
  for (let i = 0; i < 50; i++) {
    const bounce = i >= 41 && i % 2 === 0;
    const close = bounce ? px + 140 : px - 410;
    const open = px;
    bars.push({
      time: startDay + i * DAY,
      open,
      high: Math.max(open, close) + 320,
      low: Math.min(open, close) - 360,
      close,
      volume: bounce ? 4200 : 1200, // strong up-bar absorption volume -> positive 10-bar OBV!
    });
    px = close;
  }
  const closedEnd = bars.at(-1).time + DAY;
  const lastClose = bars.at(-1).close;
  // Forming candle sweeps lower then reclaims with strong lower wick!
  const liveBar = {
    time: closedEnd,
    open: lastClose,
    high: lastClose + 180,
    low: lastClose - 1600,
    close: lastClose - 120,
    volume: 1600,
  };
  const orderBook = {
    bids: Array.from({ length: 10 }, (_, i) => [lastClose - 120 - i * 10, 8.5]),
    asks: Array.from({ length: 10 }, (_, i) => [lastClose - 110 + i * 10, 3.2]),
  };
  const pov = buildStudyPov({
    bars,
    instrument,
    interval: '1d',
    nowSeconds: closedEnd + 8 * 3600,
    confirmedThrough: closedEnd,
    liveBar,
    liveQuote: { price: liveBar.close },
    orderBook,
    sentiment: { value: 10, label: 'Extreme Fear' },
    includeLive: true,
  });

  assert.equal(pov.ready, true);
  assert.equal(pov.outlook.inflection.kind, 'rebound-risk');
  assert.equal(pov.outlook.inflection.conflict, true);
  assert.ok(pov.outlook.inflection.reboundScore >= 40, `Expected strong reboundScore >= 40, got ${pov.outlook.inflection.reboundScore}`);
  assert.match(pov.outlook.bias, /Rebound|Reversal/i, 'Must warn of rebound/reversal risk instead of blind bearish call');
  assert.equal(pov.outlook.biasTone, 'neutral');
  assert.ok(pov.outlook.factors.some(f => f.label === 'Order book (L2)' && f.tone === 'up'), 'Must surface live bid-heavy L2 factor');
  assert.ok(pov.outlook.inflection.upLeanPct + pov.outlook.inflection.downLeanPct === 100);
});
