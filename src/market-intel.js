import { esc, num, pct, tone } from './ui.js';
import { moneyMarkup } from './currency.js';

function clamp(v, a = 0, b = 100) {
  return Math.max(a, Math.min(b, v));
}

function breadthStats(markets) {
  const sample = (Array.isArray(markets) ? markets : []).filter(a => Number.isFinite(a?.marketCap) && a.marketCap > 0 && Number.isFinite(a?.change)).slice(0, 100);
  const up = sample.filter(a => a.change > 0).length;
  const down = sample.filter(a => a.change < 0).length;
  const topVol = [...sample].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 3);
  return { count: sample.length, up, down, upPct: sample.length ? Math.round((up / sample.length) * 100) : null, topVol };
}

function renderGauge(zones, markerPct) {
  const pos = clamp(markerPct, 1.5, 98.5).toFixed(1);
  return `<div class="kpi-gauge-wrap">
   <div class="kpi-gauge-bar">${zones.map(z => `<span class="kpi-zone ${z.tone}" style="flex:${z.weight}"></span>`).join('')}<i class="kpi-gauge-pin" style="left:${pos}%" aria-hidden="true"></i></div>
   <div class="kpi-gauge-labels">${zones.map(z => `<span>${esc(z.label)}</span>`).join('')}</div>
  </div>`;
}

function renderFngSparkline(history) {
  if (!Array.isArray(history) || history.length < 3) return '';
  const w = 360, h = 76, pad = 6;
  const pts = history.map((d, i) => {
    const x = pad + (i / (history.length - 1)) * (w - pad * 2);
    const y = h - pad - (clamp(d.value, 0, 100) / 100) * (h - pad * 2);
    return [x, y, d.value];
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts.at(-1)[0].toFixed(1)},${(h - pad).toFixed(1)} L${pts[0][0].toFixed(1)},${(h - pad).toFixed(1)} Z`;
  const last = pts.at(-1);
  const y25 = h - pad - 0.25 * (h - pad * 2);
  const y75 = h - pad - 0.75 * (h - pad * 2);
  return `<div class="kpi-spark-box">
   <div class="kpi-spark-head"><span>30-day sentiment trajectory</span><small>Alternative.me daily readings (${history.length}d)</small></div>
   <svg viewBox="0 0 ${w} ${h}" class="kpi-spark-svg" role="img" aria-label="30-day Fear and Greed history chart">
    <line x1="${pad}" y1="${y25.toFixed(1)}" x2="${w - pad}" y2="${y25.toFixed(1)}" stroke="currentColor" stroke-opacity="0.18" stroke-dasharray="3 3"/>
    <line x1="${pad}" y1="${y75.toFixed(1)}" x2="${w - pad}" y2="${y75.toFixed(1)}" stroke="currentColor" stroke-opacity="0.18" stroke-dasharray="3 3"/>
    <path d="${area}" fill="var(--lime)" fill-opacity="0.14"/>
    <path d="${line}" fill="none" stroke="var(--lime)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4" fill="var(--lime)"/>
   </svg>
   <div class="kpi-spark-axis"><span>30d ago (${history[0].value})</span><span>25 · Extreme Fear line</span><span>Today (${history.at(-1).value})</span></div>
  </div>`;
}

export function buildKpiIntelligence(kpi, { global, sentiment, markets } = {}) {
  const g = global?.data ?? null;
  const s = sentiment?.data ?? null;
  const b = breadthStats(markets?.data);

  if (kpi === 'marketCap') {
    if (!g) return { title: 'Total crypto market cap', body: '<p class="data-note">Global market capitalization data is still loading.</p>' };
    const chg = Number.isFinite(g.change) ? g.change : 0;
    const turnover = g.marketCap > 0 && Number.isFinite(g.volume) ? (g.volume / g.marketCap) * 100 : null;
    const regime = chg >= 3 ? { label: 'Risk-on expansion', tone: 'positive' }
      : chg >= 0.75 ? { label: 'Constructive inflows', tone: 'positive' }
      : chg <= -3 ? { label: 'Risk-off contraction', tone: 'negative' }
      : chg <= -0.75 ? { label: 'Defensive pullback', tone: 'negative' }
      : { label: 'Range consolidation', tone: '' };
    const marker = clamp(50 + chg * 6, 4, 96);
    const meaning = chg <= -3
      ? `Total crypto value dropped ${Math.abs(chg).toFixed(2)}% in 24 hours${b.upPct !== null ? ` with ${b.down} of the top ${b.count} coins declining (${100 - b.upPct}% broad selling)` : ''}. Broad cap drawdowns of this pace reflect synchronized de-leveraging rather than isolated single-coin weakness.`
      : chg >= 3
      ? `Total market value expanded +${chg.toFixed(2)}% over 24 hours${b.upPct !== null ? ` with ${b.up} of the top ${b.count} assets advancing` : ''}, signaling net spot capital inflows and expanding risk appetite.`
      : `Global market cap sits at a steady ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% 24h change${b.upPct !== null ? ` (${b.up} advancing vs ${b.down} declining in the top ${b.count})` : ''}, indicating balanced rotation between buyers and sellers.`;
    const scenarios = [
      {
        title: 'Bullish stabilization & recovery path',
        tone: 'positive',
        text: `Look for Top-100 breadth to climb back above 55% advancing alongside steady or rising 24h volume (turnover > 3.5%). When cap contractions stop printing lower intraday lows while spot volume holds firm, capital typically re-enters BTC first before rotating into majors.`,
      },
      {
        title: 'Bearish continuation / de-risking path',
        tone: 'negative',
        text: `If total cap keeps sliding while turnover surges above 6% and Bitcoin dominance rises simultaneously, forced derivative liquidations and altcoin outflows can extend the leg lower before durable support forms.`,
      },
    ];
    return {
      title: 'Total Crypto Market Cap',
      body: `<div class="kpi-modal-hero">
       <div><small>LIVE TOTAL VALUATION</small><strong>${moneyMarkup(g.marketCap, 'USD', 'compact')}</strong></div>
       <span class="kpi-regime-pill ${regime.tone}">${esc(regime.label)}</span>
      </div>
      <dl class="kpi-stat-strip">
       <div><dt>24h change</dt><dd class="${tone(chg)}">${pct(chg)}</dd></div>
       <div><dt>Vol / MCap ratio</dt><dd>${turnover !== null ? num(turnover, 2) + '%' : '—'}</dd></div>
       <div><dt>Top-100 breadth</dt><dd>${b.count ? `${b.up} Up / ${b.down} Down` : '—'}</dd></div>
       <div><dt>Tracked assets</dt><dd>${Number.isFinite(g.activeCoins) ? g.activeCoins.toLocaleString() : '—'}</dd></div>
      </dl>
      ${renderGauge([
        { label: 'Contraction', tone: 'z-down', weight: 30 },
        { label: 'Defensive', tone: 'z-warn', weight: 20 },
        { label: 'Balanced', tone: 'z-mid', weight: 20 },
        { label: 'Expansion', tone: 'z-up', weight: 30 },
      ], marker)}
      <section class="kpi-section"><h3>What this reading means now</h3><p>${esc(meaning)}</p></section>
      <section class="kpi-section"><h3>What typically happens next</h3><div class="kpi-scenario-grid">${scenarios.map(sc => `<article class="kpi-scenario"><strong class="${sc.tone}">${esc(sc.title)}</strong><p>${esc(sc.text)}</p></article>`).join('')}</div></section>
      <section class="kpi-section"><h3>Key signals to monitor</h3><ul class="kpi-watch-list"><li><strong>Breadth flip:</strong> Top-100 advancing count crossing above 50% confirms buyers are broadening beyond Bitcoin.</li><li><strong>Turnover quality:</strong> Sustained market cap gains on turnover ≥ 3% are historically more durable than low-volume bounces.</li><li><strong>Macro sync:</strong> Sharp cap drops often coincide with macro liquidity shocks or ETF net outflow days — check the News tab.</li></ul></section>`,
    };
  }

  if (kpi === 'volume') {
    if (!g) return { title: '24-hour trading volume', body: '<p class="data-note">Global trading volume data is still loading.</p>' };
    const turnover = g.marketCap > 0 ? (g.volume / g.marketCap) * 100 : null;
    const chg = Number.isFinite(g.change) ? g.change : 0;
    const regime = turnover === null ? { label: 'Snapshot', tone: '' }
      : turnover >= 7.5 ? { label: 'Climax / high turnover', tone: 'negative' }
      : turnover >= 4.2 ? { label: 'High conviction activity', tone: 'positive' }
      : turnover >= 2.2 ? { label: 'Healthy liquidity', tone: 'positive' }
      : { label: 'Thin / low-conviction tape', tone: '' };
    const marker = turnover !== null ? clamp((turnover / 10) * 100, 3, 97) : 50;
    const matrix = chg < -1.5 && turnover >= 4
      ? `Market cap is falling (${pct(chg)}) on elevated liquidity turnover (${num(turnover, 2)}% of total market cap). High volume during selloffs signals active distribution and liquidation cascades — historically these flushes exhaust weak hands and can seed sharp relief rallies once selling pressure peaks.`
      : chg > 1.5 && turnover >= 4
      ? `Market cap is climbing (${pct(chg)}) backed by strong turnover (${num(turnover, 2)}% of total cap), confirming real institutional participation rather than a thin low-liquidity drift.`
      : turnover !== null && turnover < 2.2
      ? `Turnover sits at a quiet ${num(turnover, 2)}% of market cap. Low-volume environments make breakouts prone to fakeouts and widen order-book slippage — wait for volume expansion before trusting directional moves.`
      : `24-hour volume represents ${turnover !== null ? num(turnover, 2) + '% of total market cap' : 'normal activity'} with a ${pct(chg)} cap change. Liquidity is healthy enough for orderly price discovery without forced-liquidation panic.`;

    return {
      title: 'Global 24h Trading Volume',
      body: `<div class="kpi-modal-hero">
       <div><small>24-HOUR GLOBAL LIQUIDITY</small><strong>${moneyMarkup(g.volume, 'USD', 'compact')}</strong></div>
       <span class="kpi-regime-pill ${regime.tone}">${esc(regime.label)}</span>
      </div>
      <dl class="kpi-stat-strip">
       <div><dt>Vol / MCap turnover</dt><dd>${turnover !== null ? num(turnover, 2) + '%' : '—'}</dd></div>
       <div><dt>Cap direction (24h)</dt><dd class="${tone(chg)}">${pct(chg)}</dd></div>
       <div><dt>Top liquidity pair</dt><dd>${b.topVol[0] ? esc(b.topVol[0].symbol) : '—'}</dd></div>
       <div><dt>BTC dominance</dt><dd>${Number.isFinite(g.btcDominance) ? num(g.btcDominance, 1) + '%' : '—'}</dd></div>
      </dl>
      ${renderGauge([
        { label: '<2% Thin', tone: 'z-mid', weight: 22 },
        { label: '2–4.2% Healthy', tone: 'z-up', weight: 24 },
        { label: '4.2–7.5% Active', tone: 'z-warn', weight: 28 },
        { label: '>7.5% Climax', tone: 'z-down', weight: 26 },
      ], marker)}
      <section class="kpi-section"><h3>What this reading means now</h3><p>${esc(matrix)}</p></section>
      <section class="kpi-section"><h3>What typically happens next</h3><div class="kpi-scenario-grid">
       <article class="kpi-scenario"><strong class="positive">Volume confirms breakout / capitulation</strong><p>When volume spikes into key chart support with long lower wicks and then normalizes while price holds higher lows, it often marks seller exhaustion and a structural floor.</p></article>
       <article class="kpi-scenario"><strong class="negative">Volume dry-up / fakeout risk</strong><p>Price drifting higher while global volume shrinks (turnover dropping under 2.2%) frequently signals fading buyer appetite and vulnerability to a sharp liquidity sweep.</p></article>
      </div></section>
      ${b.topVol.length ? `<section class="kpi-section"><h3>Most actively traded right now</h3><dl class="kpi-stat-strip">${b.topVol.map(a => `<div><dt>${esc(a.symbol)} · ${esc(a.name)}</dt><dd>${moneyMarkup(a.volume, 'USD', 'compact')} <small class="${tone(a.change)}">${pct(a.change)}</small></dd></div>`).join('')}</dl></section>` : ''}`,
    };
  }

  if (kpi === 'dominance') {
    if (!g || !Number.isFinite(g.btcDominance)) return { title: 'Bitcoin dominance', body: '<p class="data-note">Bitcoin dominance data is still loading.</p>' };
    const dom = g.btcDominance;
    const eth = Number.isFinite(g.ethDominance) ? g.ethDominance : null;
    const others = Math.max(0, 100 - dom - (eth ?? 0));
    const chg = Number.isFinite(g.change) ? g.change : 0;
    const regime = dom >= 60 ? { label: 'Peak BTC concentration', tone: '' }
      : dom >= 54 ? { label: 'BTC defensive leadership', tone: '' }
      : dom >= 46 ? { label: 'Balanced large-cap rotation', tone: 'positive' }
      : { label: 'Broad altcoin season', tone: 'positive' };
    const marker = clamp(((dom - 35) / 38) * 100, 3, 97);
    const meaning = dom >= 55 && chg < 0
      ? `Bitcoin holds ${dom.toFixed(1)}% of total crypto capitalization while the market is pulling back (${pct(chg)}). High dominance during a drawdown is classic flight-to-safety: investors rotate out of higher-beta altcoins into Bitcoin and stablecoins to limit downside.`
      : dom >= 55 && chg >= 0
      ? `Bitcoin controls ${dom.toFixed(1)}% of total crypto value while total market cap rises (${pct(chg)}). This is a Bitcoin-led impulse where institutional flows (spot ETFs, treasuries) concentrate in BTC first before spilling over into altcoins.`
      : dom < 50 && chg >= 0
      ? `Bitcoin dominance is relatively compressed at ${dom.toFixed(1)}% while the market advances, showing aggressive capital rotation into Ethereum and mid/small-cap altcoins (classic risk-on altseason behavior).`
      : `Bitcoin dominance at ${dom.toFixed(1)}% sits in a transitional rotation zone${eth !== null ? ` alongside Ethereum at ${eth.toFixed(1)}% and the rest of the market at ${others.toFixed(1)}%` : ''}.`;

    return {
      title: 'Bitcoin Dominance (BTC.D)',
      body: `<div class="kpi-modal-hero">
       <div><small>SHARE OF TOTAL CRYPTO CAP</small><strong>${dom.toFixed(2)}%</strong></div>
       <span class="kpi-regime-pill ${regime.tone}">${esc(regime.label)}</span>
      </div>
      <dl class="kpi-stat-strip">
       <div><dt>Bitcoin (BTC)</dt><dd>${dom.toFixed(1)}%</dd></div>
       <div><dt>Ethereum (ETH)</dt><dd>${eth !== null ? eth.toFixed(1) + '%' : '—'}</dd></div>
       <div><dt>Alts &amp; stables</dt><dd>${others.toFixed(1)}%</dd></div>
       <div><dt>Market 24h</dt><dd class="${tone(chg)}">${pct(chg)}</dd></div>
      </dl>
      ${renderGauge([
        { label: '<46% Altseason', tone: 'z-up', weight: 28 },
        { label: '46–54% Rotation', tone: 'z-mid', weight: 24 },
        { label: '54–60% BTC Lead', tone: 'z-warn', weight: 24 },
        { label: '>60% Extreme BTC', tone: 'z-down', weight: 24 },
      ], marker)}
      <section class="kpi-section"><h3>What ${dom.toFixed(1)}% dominance means now</h3><p>${esc(meaning)}</p></section>
      <section class="kpi-section"><h3>How capital rotates next (4-quadrant playbook)</h3><div class="kpi-scenario-grid">
       <article class="kpi-scenario"><strong class="positive">If BTC stabilizes &amp; dominance rolls over (&lt; 54%)</strong><p>When Bitcoin consolidates after a move and BTC.D breaks lower, capital historically rotates down the risk curve into ETH, L1s, and DeFi — driving outperformance in altcoins.</p></article>
       <article class="kpi-scenario"><strong class="negative">If dominance pushes higher (&gt; 60%)</strong><p>Sustained climbs above 60% typically squeeze altcoin/BTC ratios lower — either during a defensive risk-off flush or a strong solo Bitcoin institutional rally.</p></article>
      </div></section>
      <section class="kpi-section"><h3>Key thresholds to watch</h3><ul class="kpi-watch-list"><li><strong>60%+ zone:</strong> High BTC defensive dominance; altcoins carry heightened relative drawdown risk until BTC finds a firm floor.</li><li><strong>54–58% zone:</strong> Institutional BTC leadership; watch ETH/BTC and Sector Rotation in Market Maps for early signs of breadth expansion.</li><li><strong>Below 50%:</strong> Broad speculative appetite; monitor overheating and leverage funding rates in Insights.</li></ul></section>`,
    };
  }

  // Fear & Greed Intelligence
  if (!s) return { title: 'Crypto Fear & Greed Index', body: '<p class="data-note">Sentiment index is currently loading.</p>' };
  const val = s.value;
  const d1 = Number.isFinite(s.yesterday) ? val - s.yesterday : null;
  const d7 = Number.isFinite(s.weekAgo) ? val - s.weekAgo : null;
  const d30 = Number.isFinite(s.monthAgo) ? val - s.monthAgo : null;
  const zoneTone = val <= 25 ? 'negative' : val >= 75 ? 'positive' : '';
  const meaning = val <= 15
    ? `At ${val}/100 (${s.label}), market psychology is in acute capitulation territory${s.extremeStreak > 1 ? ` — marking ${s.extremeStreak} consecutive days in Extreme Fear` : ''}. Forced selling, negative social sentiment, high realized volatility, and weak momentum dominate. Historically, readings at or below 15 occur near major panic flushes rather than late-stage rallies.`
    : val <= 25
    ? `At ${val}/100 (${s.label}), investors are heavily defensive and risk-averse. Capitulation fear often compresses valuations well below trend, creating asymmetric recovery potential once selling pressure slows.`
    : val <= 45
    ? `At ${val}/100 (${s.label}), caution outweighs optimism. Market participants remain hesitant after recent volatility, leaving dry powder on the sidelines if catalysts turn constructive.`
    : val <= 55
    ? `At ${val}/100 (${s.label}), sentiment is balanced without crowd crowding on either side. Price direction will likely be led by spot flows, macro prints, and technical breakouts.`
    : val <= 75
    ? `At ${val}/100 (${s.label}), bullish confidence and momentum-chasing are building. Trends can stay in Greed for weeks during bull cycles, though pullbacks become sharper when leverage builds.`
    : `At ${val}/100 (${s.label}), euphoria and crowded long positioning dominate. Historically, Extreme Greed readings warn of elevated liquidation and sharp mean-reversion pullback risk.`;

  const whatNext = val <= 25
    ? [
        { title: 'Contrarian rebound scenario (mean reversion)', tone: 'positive', text: `Extreme Fear (≤ 25) is historically a contrarian accumulation zone over multi-week horizons. When price stops making lower lows, OBV turns positive, and spot reclaims EMA 9 / VWAP, overcrowded shorts frequently fuel violent relief rallies.` },
        { title: 'Extended capitulation risk (falling knife)', tone: 'negative', text: `Sentiment alone is not a timing trigger — markets can remain in Extreme Fear (5–20) for days or weeks during macro shocks. Never assume "it can't go lower" until chart structure confirms a higher low or key reclaim.` },
      ]
    : val >= 75
    ? [
        { title: 'Blow-off continuation vs crowding', tone: 'positive', text: `Strong bull regimes can hold 75–90 Greed while spot inflows overwhelm profit-taking, so shorting blindly is hazardous while price holds above rising short-term averages.` },
        { title: 'Leverage flush / correction risk', tone: 'negative', text: `Elevated funding rates + Extreme Greed historically precede sudden −8% to −15% leverage resets. Tighten trailing risk controls rather than chasing parabolic green candles.` },
      ]
    : [
        { title: 'Trend confirmation path', tone: 'positive', text: `Neutral/moderate sentiment gives healthy room for trends to extend without immediate crowding. Watch for rising volume + reclaiming key chart resistance.` },
        { title: 'Breakdown / risk-off shift', tone: 'negative', text: `If Fear deepens below 25 alongside falling breadth and rising BTC dominance, defensive positioning takes priority until volatility peaks.` },
      ];

  return {
    title: 'Crypto Fear & Greed Index',
    body: `<div class="kpi-modal-hero">
     <div><small>MARKET SENTIMENT REGIME</small><strong>${val} <span style="font-size:16px;font-weight:500;color:var(--muted)">/ 100</span></strong></div>
     <span class="kpi-regime-pill ${zoneTone}">${esc(s.label)}${s.extremeStreak > 1 ? ` · ${s.extremeStreak}d streak` : ''}</span>
    </div>
    <dl class="kpi-stat-strip">
     <div><dt>Yesterday</dt><dd>${Number.isFinite(s.yesterday) ? `${s.yesterday} <small class="${tone(d1)}">(${d1 >= 0 ? '+' : ''}${d1})</small>` : '—'}</dd></div>
     <div><dt>7 days ago</dt><dd>${Number.isFinite(s.weekAgo) ? `${s.weekAgo} <small class="${tone(d7)}">(${d7 >= 0 ? '+' : ''}${d7})</small>` : '—'}</dd></div>
     <div><dt>30 days ago</dt><dd>${Number.isFinite(s.monthAgo) ? `${s.monthAgo} <small class="${tone(d30)}">(${d30 >= 0 ? '+' : ''}${d30})</small>` : '—'}</dd></div>
     <div><dt>Top-100 breadth</dt><dd>${b.count ? `${b.up}% advancing` : '—'}</dd></div>
    </dl>
    ${renderGauge([
      { label: '0–25 Ext. Fear', tone: 'z-down', weight: 25 },
      { label: '26–45 Fear', tone: 'z-warn', weight: 20 },
      { label: '46–55 Neutral', tone: 'z-mid', weight: 10 },
      { label: '56–75 Greed', tone: 'z-up', weight: 20 },
      { label: '76–100 Euphoria', tone: 'z-hot', weight: 25 },
    ], val)}
    ${renderFngSparkline(s.history)}
    <section class="kpi-section"><h3>What ${val}/100 (${esc(s.label)}) means now</h3><p>${esc(meaning)}</p></section>
    <section class="kpi-section"><h3>What may happen next</h3><div class="kpi-scenario-grid">${whatNext.map(sc => `<article class="kpi-scenario"><strong class="${sc.tone}">${esc(sc.title)}</strong><p>${esc(sc.text)}</p></article>`).join('')}</div></section>
    <section class="kpi-section"><h3>How professionals confirm a sentiment turn</h3><ul class="kpi-watch-list"><li><strong>Structure confirmation:</strong> Wait for a higher low or reclamation of the 20-bar VWAP / EMA 9 on the 4h or 1d chart.</li><li><strong>Derivatives check:</strong> Pair Extreme Fear with negative funding rates in Market Insights to spot crowded shorts ripe for a squeeze.</li><li><strong>Data inputs:</strong> Calculated daily from volatility (25%), momentum/volume (25%), social media (15%), BTC dominance (10%), and search trends (10%).</li></ul></section>`,
  };
}
