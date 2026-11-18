import { compact, esc, icon, num } from './ui.js';

const tabs = [
  ['derivatives', 'Derivatives', 'activity', 'Compare funding, open interest and options volatility for Bitcoin. Funding is a transfer between long and short positions.'],
  ['onchain', 'On-chain', 'layers', 'Compare network activity, Bitcoin fees and stablecoin prices. A wallet can use multiple addresses.'],
  ['macro', 'Macro & calendar', 'calendar-days', 'Check Treasury yields and upcoming U.S. releases before reviewing moves around an announcement.'],
  ['tokenomics', 'Protocol references', 'book-open', 'Check how the protocol issues tokens and when existing tokens become transferable. An unlock can change circulating supply before any token changes hands.'],
];

const statusLabels = {
  observed: 'Reported',
  dated: 'Dated observation',
  snapshot: 'Provider snapshot',
  schedule: 'Published schedule',
  stale: 'Stale',
  unavailable: 'Unavailable',
};

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
});
const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });
const available = (value) => Number.isFinite(value);
const count = (value) => available(value) ? num(value, 0) : null;
const amount = (value, suffix, digits = 2) => available(value) ? num(value, digits) + suffix : null;
const signed = (value, suffix, digits = 2) => available(value) ? (value > 0 ? '+' : '') + amount(value, suffix, digits) : null;
const large = (value, suffix) => available(value) ? compact(value) + suffix : null;
const timeLabel = (value, dateOnly) => Number.isFinite(Date.parse(value))
  ? (dateOnly ? dateFormat.format(Date.parse(value)) : timeFormat.format(Date.parse(value)) + ' UTC') : null;

function sourceLink(name, url) {
  try {
    const link = new URL(url);
    if (link.protocol === 'https:' && !link.username && !link.password) {
      return '<a href="' + esc(link.href) + '" target="_blank" rel="noopener noreferrer">' + esc(name) + ' ' + icon('arrow-up-right') + '</a>';
    }
  } catch {}
  return esc(name);
}

function timeMarkup(value, display = timeLabel(value)) {
  return display ? '<time datetime="' + esc(value) + '">' + esc(display) + '</time>' : '';
}

function feedFooter(feed) {
  if (!feed) return '';
  const dated = timeLabel(feed.asOf, Boolean(feed.values?.date));
  const retrieved = timeLabel(feed.fetchedAt);
  return `<footer class="market-insight-source">${sourceLink(feed.provider, feed.sourceUrl)}
    ${dated ? timeMarkup(feed.values?.date ?? feed.asOf, dated) : retrieved ? 'Retrieved ' + timeMarkup(feed.fetchedAt, retrieved) : ''}
    ${feed.warning ? '<span class="market-insight-warning">' + esc(feed.warning) + '</span>' : ''}</footer>`;
}

function feedCard(title, feed, content, { wide = false, loading } = {}) {
  const status = feed?.status ?? (loading ? 'loading' : 'unavailable');
  const label = statusLabels[status] ?? 'Loading';
  return `<article class="market-insight-card${wide ? ' market-insight-wide' : ''}">
    <header><h3>${esc(title)}</h3><span class="market-insight-status" data-status="${esc(status)}">${esc(label)}</span></header>
    ${feed?.values ? content(feed.values) : '<p class="market-insight-unavailable">' + esc(feed?.error ?? (loading ? 'Contacting data source…' : 'No observation available.')) + '</p>'}
    ${feedFooter(feed)}
  </article>`;
}

const field = ([name, value]) => `<div><dt>${esc(name)}</dt><dd>${esc(value ?? 'Unavailable')}</dd></div>`;
const fields = (...rows) => '<dl class="market-insight-values">' + rows.map(field).join('') + '</dl>';

function fundingFields(values, includeInterest = false) {
  const funding = signed(values.fundingPct, '%', 5);
  return fields(
    ['Funding rate', values.fundingIntervalHours && funding ? funding + ' / ' + values.fundingIntervalHours + 'h' : funding],
    ['Mark vs. index', signed(values.basisPct, '%', 4)],
    ...(includeInterest ? [['Open interest value', large(values.openInterestUsdt, ' USDT')]] : []),
  );
}

function derivativeCards(feeds, loading) {
  return [
    feedCard('Binance BTCUSDT perpetual', feeds.binance, (values) => fundingFields(values), { loading }),
    feedCard('Bybit BTCUSDT perpetual', feeds.bybit, (values) => fundingFields(values, true), { loading }),
    feedCard('Binance BTCUSDT open interest', feeds.binanceOi, (values) => fields(
      ['Open interest value', large(values.openInterestUsdt, ' USDT')], ['24h value change', signed(values.change24hPct, '%')],
    ), { loading }),
    feedCard('Bitcoin DVOL', feeds.dvol, (values) => fields(
      ['30-day implied volatility', amount(values.volatilityPct, '%')], ['Observation window', 'Completed 1-hour candle'],
    ), { loading }),
  ].join('');
}

function pegTable({ assets }) {
  const usd = (value) => available(value) ? '$' + num(value, 5) : 'Unavailable';
  return `<div class="market-insight-table-wrap"><table aria-label="Largest USD stablecoins by circulating supply" class="market-insight-table">
    <thead><tr><th scope="col">Asset</th><th scope="col">Circulating</th><th scope="col">USD price</th><th scope="col">From $1</th></tr></thead>
    <tbody>${assets.map((row) => `<tr><th scope="row"><abbr title="${esc(row.name)}">${esc(row.symbol)}</abbr></th>
      <td>${esc(large(row.circulating, '') ?? 'Unavailable')}</td><td>${esc(usd(row.priceUsd))}</td>
      <td>${esc(signed(row.deviationBps, ' bp', 1) ?? 'Unavailable')}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

function networkCards(feeds, loading) {
  const addressFields = (values) => fields(['Active addresses', count(values.activeAddresses)], ['Transactions', count(values.transactions)]);
  return [
    feedCard('Bitcoin activity', feeds.btc, addressFields, { loading }),
    feedCard('Ethereum L1 activity', feeds.eth, addressFields, { loading }),
    feedCard('Bitcoin fee estimates', feeds.fees, (values) => fields(
      ['Priority', amount(values.priority, ' sat/vB')], ['30-minute', amount(values.halfHour, ' sat/vB')],
      ['1-hour', amount(values.hour, ' sat/vB')], ['Economy', amount(values.economy, ' sat/vB')],
    ), { loading }),
    feedCard('Bitcoin mining hashrate', feeds.hash, (values) => fields(['Daily average', amount(values.exahashesPerSecond, ' EH/s', 1)]), { loading }),
    feedCard('USD-pegged stablecoin value', feeds.stablecap, (values) => fields(['Circulating market value', large(values.marketValueUsd, ' USD')]), { wide: true, loading }),
    feedCard('USD stablecoin price and supply', feeds.pegs, pegTable, { wide: true, loading }),
  ].join('');
}

function calendarEvents({ events }) {
  if (!events.length) return '<p class="market-insight-unavailable">No upcoming dates are listed in this schedule.</p>';
  return '<ul class="market-insight-events">' + events.map((event) => `<li><strong>${esc(event.title)}</strong>
    <span>${timeMarkup(event.date, timeLabel(event.date, true))}
      ${event.endDate && event.endDate !== event.date ? '– ' + timeMarkup(event.endDate, timeLabel(event.endDate, true)) : ''}
      ${event.time ? ' · ' + esc(event.time + ' ' + event.timezone) : ''}</span></li>`).join('') + '</ul>';
}

function pressReleases({ releases }) {
  return '<ul class="market-insight-events"><li>' + releases.map((release) =>
    sourceLink(release.title, release.url) + timeMarkup(release.publishedAt)).join('</li><li>') + '</li></ul>';
}

function macroCards(feeds, loading) {
  const yieldFields = (values) => fields(['Yield', amount(values.ratePct, '%')], ['Change over five observations', signed(values.change5ObservationsBps, ' bp', 0)]);
  return [
    feedCard('U.S. 10-year Treasury', feeds.yield10, yieldFields, { loading }),
    feedCard('U.S. 2-year Treasury', feeds.yield2, yieldFields, { loading }),
    feedCard('CPI & employment releases', feeds.bls, calendarEvents, { loading }),
    feedCard('Federal Reserve meetings', feeds.fomc, calendarEvents, { loading }),
    feedCard('Federal Reserve announcements', feeds.fedPress, pressReleases, { loading }),
    feedCard('SEC announcements', feeds.secPress, pressReleases, { loading }),
  ].join('');
}

const protocolSources = [
  ['Bitcoin', 'Block subsidies and the halving schedule.', 'Bitcoin issuance FAQ', 'https://bitcoin.org/en/faq#how-are-bitcoins-created'],
  ['Ethereum', 'Staking issuance and fee burn both affect the supply of ETH.', 'Ethereum issuance documentation', 'https://ethereum.org/roadmap/merge/issuance/'],
  ['Solana', 'SOL inflation and the distribution of staking rewards.', 'Solana staking and inflation FAQ', 'https://solana.com/staking'],
  ['Arbitrum', 'ARB circulation methodology and allocations subject to transfer restrictions.', 'Arbitrum token supply documentation', 'https://docs.arbitrum.foundation/token-supply'],
  ['Sui', 'Projected SUI supply and the foundation’s published release schedule.', 'Sui token release schedule', 'https://www.sui.io/token-schedule'],
  ['XRP Ledger', 'Conditions for releasing tokens from an escrow on the XRP Ledger.', 'XRP Ledger escrow documentation', 'https://xrpl.org/docs/concepts/payment-types/escrow'],
];

function tokenomicsCards() {
  return protocolSources.map(([name, description, source, url]) => `<article class="market-insight-card">
    <header><h3>${esc(name)}</h3></header><p class="market-insight-description">${esc(description)}</p>
    <footer class="market-insight-source">${sourceLink(source, url)}</footer></article>`).join('');
}

const renderCards = { derivatives: derivativeCards, onchain: networkCards, macro: macroCards, tokenomics: tokenomicsCards };

export function renderInsightsDesk({ mode = 'basic', activeTab = 'derivatives', result, loading = false, error = '' } = {}) {
  const [tab, title, , description] = tabs.find(([id]) => id === activeTab) ?? tabs[0];
  const isReference = tab === 'tokenomics';
  const feeds = result?.data?.section === tab ? result.data.feeds ?? {} : {};
  const allUnavailable = Object.keys(feeds).length > 0 && Object.values(feeds).every((feed) => feed.status === 'unavailable');
  return `<section class="market-insight-desk" data-mode="${mode === 'pro' ? 'pro' : 'basic'}" aria-label="Market Insights">
    <div class="market-insight-toolbar">
      <div class="market-insight-tabs" role="group" aria-label="Market Insights sections">
        ${tabs.map(([id, label, glyph]) => `<button type="button" class="button" data-action="insights-tab" data-tab="${id}" aria-pressed="${id === tab}">${icon(glyph)} ${label}</button>`).join('')}
      </div>
      ${isReference ? '' : `<button type="button" class="button market-insight-retry" data-action="insights-retry" ${loading ? 'disabled' : ''}>${icon('refresh-cw')} ${loading ? 'Refreshing…' : 'Refresh feeds'}</button>`}
    </div>
    ${mode !== 'pro' ? '<p class="market-insight-description">' + esc(description) + '</p>' : ''}
    <div aria-live="polite" role="status" class="market-insight-message">${esc(error || (allUnavailable ? 'The providers are currently unavailable. Refresh to check again.' : ''))}</div>
    <div class="market-insight-grid" aria-label="${esc(title)}${isReference ? '' : ' observations'}" aria-busy="${loading}">
      ${renderCards[tab](feeds, loading)}
    </div>
  </section>`;
}
