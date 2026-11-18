import { createProviderCache } from './cache.js';
import { throwIfAborted } from '../src/async-task.js';
import { asNumber } from '../src/numbers.js';

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const firstDate = Date.UTC(2009, 0, 3);

export const insightSections = new Set(['derivatives', 'onchain', 'macro']);

function numeric(raw, min, max = Number.MAX_SAFE_INTEGER) {
  const value = asNumber(raw);
  return value !== null && value >= min && value <= max ? value : null;
}

function epoch(raw, now, unit = 1) {
  const value = numeric(raw, firstDate / unit, (now + 30_000) / unit);
  return Number.isInteger(value) ? value * unit : null;
}

function isoDate(raw) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = Date.parse(raw);
  return Number.isFinite(date) && new Date(date).toISOString().startsWith(raw) ? date : null;
}

const dateKey = (time) => new Date(time).toISOString().slice(0, 10);
const observation = (time, values) => ({ asOf: new Date(time).toISOString(), values });
const snapshot = (values) => ({ asOf: null, values });
const latest = (rows) => rows.reduce((best, row) => !best || row.time > best.time ? row : best, null);

function perpetual(row, time, other = {}) {
  const markPrice = numeric(row?.markPrice, 0.000001);
  const indexPrice = numeric(row?.indexPrice, 0.000001);
  const fundingRate = numeric(row?.fundingRate, -1, 1);
  const basisPct = markPrice === null || indexPrice === null ? null : (markPrice - indexPrice) / indexPrice * 100;
  const fundingPct = fundingRate === null ? null : fundingRate * 100;
  if (time === null || [basisPct, fundingPct, other.openInterestUsdt].every((value) => value == null)) return null;
  return observation(time, { markPrice, indexPrice, basisPct, fundingPct, ...other });
}

function binance(index, now) {
  if (index?.symbol !== 'BTCUSDT') return null;
  return perpetual({ ...index, fundingRate: index.lastFundingRate }, epoch(index.time, now));
}

function binanceOi(data, now) {
  if (!Array.isArray(data)) return null;
  const series = data.flatMap((row) => {
    const time = epoch(row?.timestamp, now);
    const openInterestUsdt = numeric(row?.sumOpenInterestValue, 0);
    if (row?.symbol !== 'BTCUSDT' || openInterestUsdt === null || time === null) return [];
    return [{ time, openInterestUsdt }];
  });
  const recent = latest(series);
  if (!recent) return null;
  const prior = series.find((row) => row.time === recent.time - day);
  const change24hPct = prior?.openInterestUsdt > 0
    ? (recent.openInterestUsdt / prior.openInterestUsdt - 1) * 100 : null;
  return observation(recent.time, { openInterestUsdt: recent.openInterestUsdt, change24hPct });
}

function bybit(response, now) {
  if (response?.retCode !== 0 || response?.result?.category !== 'linear' || !Array.isArray(response.result.list)) return null;
  const row = response.result.list.find((item) => item?.symbol === 'BTCUSDT');
  return perpetual(row, epoch(response.time, now), {
    fundingIntervalHours: numeric(row?.fundingIntervalHour, 1, 24),
    openInterestUsdt: numeric(row?.openInterestValue, 0),
  });
}

function dvol(response, now) {
  if (!Array.isArray(response?.result?.data)) return null;
  const completed = response.result.data.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 5) return [];
    const openTime = epoch(row[0], now);
    const volatilityPct = numeric(row[4], 0, 1000);
    if (openTime === null || openTime % hour !== 0 || openTime + hour > now || volatilityPct === null) return [];
    return [{ time: openTime + hour, volatilityPct }];
  });
  const bar = latest(completed);
  return bar && observation(bar.time, { volatilityPct: bar.volatilityPct });
}

function activity(response, now, asset) {
  if (!Array.isArray(response?.data)) return null;
  const rows = response.data.flatMap((row) => {
    if (row?.asset !== asset || typeof row.time !== 'string' || !/T00:00:00(?:\.0{1,9})?Z$/.test(row.time)) return [];
    const date = row.time.slice(0, 10);
    const time = isoDate(date);
    const activeAddresses = numeric(row.AdrActCnt, 0);
    const transactions = numeric(row.TxCnt, 0);
    if (time === null || time < firstDate || time + day > now || ![activeAddresses, transactions].some(Number.isSafeInteger)) return [];
    return [{ time, date,
      activeAddresses: Number.isSafeInteger(activeAddresses) ? activeAddresses : null,
      transactions: Number.isSafeInteger(transactions) ? transactions : null,
    }];
  });
  const row = latest(rows);
  if (!row) return null;
  const { time, ...values } = row;
  return observation(time, values);
}

function fees(response) {
  const priority = numeric(response?.fastestFee, 0);
  const halfHour = numeric(response?.halfHourFee, 0);
  const hour = numeric(response?.hourFee, 0);
  const economy = numeric(response?.economyFee, 0);
  return [priority, halfHour, hour, economy].some(Number.isFinite)
    ? snapshot({ priority, halfHour, hour, economy }) : null;
}

function hashRate(response, now) {
  if (!Array.isArray(response?.hashrates)) return null;
  const rows = response.hashrates.flatMap((row) => {
    const time = epoch(row?.timestamp, now, 1000);
    const hashPerSecond = numeric(row?.avgHashrate, 1, 1e26);
    if (time === null || time + day > now || hashPerSecond === null) return [];
    return [{ time, hashPerSecond }];
  });
  const row = latest(rows);
  return row && observation(row.time, { date: dateKey(row.time), exahashesPerSecond: row.hashPerSecond / 1e18 });
}

function stableMarketCap(data, now) {
  if (!Array.isArray(data)) return null;
  const rows = data.flatMap((row) => {
    const time = epoch(row?.date, now, 1000);
    const marketValueUsd = numeric(row?.totalCirculatingUSD?.peggedUSD, 0);
    return time === null || marketValueUsd === null ? [] : [{ time, marketValueUsd }];
  });
  const row = latest(rows);
  return row && observation(row.time, { date: dateKey(row.time), marketValueUsd: row.marketValueUsd });
}

function pegPrices(response) {
  if (!Array.isArray(response?.peggedAssets)) return null;
  const assets = response.peggedAssets.flatMap((row) => {
    const circulating = numeric(row?.circulating?.peggedUSD, 1);
    if (row?.pegType !== 'peggedUSD' || circulating === null || typeof row.name !== 'string' || !row.name.trim()
      || typeof row.symbol !== 'string' || !row.symbol.trim()) return [];
    const priceUsd = numeric(row.price, 0);
    return [{
      symbol: row.symbol.trim().slice(0, 24),
      name: row.name.trim().slice(0, 80),
      circulating, priceUsd,
      deviationBps: priceUsd === null ? null : (priceUsd - 1) * 10_000,
    }];
  }).sort((a, b) => b.circulating - a.circulating).slice(0, 8);
  return assets.length ? snapshot({ assets }) : null;
}

function yields(csv, now, series) {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  if (!new RegExp('^(?:observation_date|DATE),' + series + '$', 'i').test(header.replace(/^\uFEFF/, ''))) return null;
  const byDate = new Map();
  for (const line of lines) {
    const [date, value] = line.split(',');
    const time = isoDate(date);
    const ratePct = numeric(value, -30, 100);
    if (time !== null && time >= firstDate && time <= now && ratePct !== null) byDate.set(date, { time, date, ratePct });
  }
  const rows = [...byDate.values()].sort((a, b) => a.time - b.time);
  const newest = rows.at(-1);
  if (!newest) return null;
  const previous = rows.at(-6);
  return observation(newest.time, {
    date: newest.date,
    ratePct: newest.ratePct,
    change5ObservationsBps: previous ? Math.round((newest.ratePct - previous.ratePct) * 100) : null,
  });
}

const easternFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const eventOrder = (a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '');

function blsCalendar(ics, now) {
  if (!/^BEGIN:VCALENDAR\b/.test(ics)) return null;
  const text = ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const localNow = easternFormat.format(now);
  const events = new Map();
  let recognized = 0;
  for (const [, event] of text.matchAll(/^BEGIN:VEVENT\n([\s\S]*?)^END:VEVENT/gm)) {
    const title = /^SUMMARY:(Consumer Price Index|Employment Situation)$/m.exec(event)?.[1];
    const start = /^DTSTART;TZID=(?:US-Eastern|America\/New_York):(\d{4})(\d{2})(\d{2})T([01]\d|2[0-3])([0-5]\d)[0-5]\d$/m.exec(event);
    if (!title || !start) continue;
    const date = start.slice(1, 4).join('-');
    if (isoDate(date) === null) continue;
    recognized++;
    const time = start.slice(4).join(':');
    const localStart = date + ' ' + time;
    if (localStart < localNow || /^STATUS:CANCELLED$/mi.test(event)) continue;
    events.set(title + localStart, { title, date, time, timezone: 'ET' });
  }
  return recognized ? snapshot({ events: [...events.values()].sort(eventOrder).slice(0, 6) }) : null;
}

const monthNames = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
const monthNumber = (name) => monthNames.indexOf(name.toLowerCase().slice(0, 3)) + 1;
const padDatePart = (value) => String(value).padStart(2, '0');

function fomcCalendar(html, now) {
  const today = easternFormat.format(now).slice(0, 10);
  const nextYear = Number(today.slice(0, 4)) + 1;
  const panels = html.split(/<h4>\s*<a\b[^>]*>\s*(\d{4}) FOMC Meetings\s*<\/a>\s*<\/h4>/gi);
  const events = [];
  let recognized = 0;
  for (let index = 1; index < panels.length; index += 2) {
    const year = Number(panels[index]);
    if (year < nextYear - 1 || year > nextYear) continue;
    const rows = panels[index + 1].matchAll(/<div\b[^>]*\bfomc-meeting__month\b[^>]*>\s*(?:<strong>)?\s*([a-z]+)(?:\/([a-z]+))?\s*(?:<\/strong>)?\s*<\/div>\s*<div\b[^>]*\bfomc-meeting__date\b[^>]*>\s*(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*(?:\*|&ast;)?\s*<\/div>/gi);
    for (const [, firstMonth, lastMonth, firstDay, lastDay] of rows) {
      const startMonth = monthNumber(firstMonth);
      const endMonth = monthNumber(lastMonth ?? firstMonth);
      if (!startMonth || !endMonth) continue;
      const date = [year, padDatePart(startMonth), padDatePart(firstDay)].join('-');
      const endDate = [year + (endMonth < startMonth ? 1 : 0), padDatePart(endMonth), padDatePart(lastDay ?? firstDay)].join('-');
      const startTime = isoDate(date);
      const endTime = isoDate(endDate);
      if (startTime === null || endTime === null || endTime < startTime || endTime - startTime > 7 * day) continue;
      recognized++;
      if (endDate >= today) events.push({ title: 'FOMC meeting', date, endDate });
    }
  }
  return recognized ? snapshot({ events: events.sort(eventOrder).slice(0, 6) }) : null;
}

const fedCalendar = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
const blsIcs = 'https://www.bls.gov/schedule/news_release/bls.ics';
const coinMetricsActivity = (asset) => 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=' + asset
  + '&metrics=AdrActCnt,TxCnt&frequency=1d&limit_per_asset=4&page_size=4&paging_from=end';
const fredCsv = (series, now) => 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + series + '&cosd=' + dateKey(now - 65 * day);
const deribitUrl = (now) => 'https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=BTC&resolution=3600'
  + '&start_timestamp=' + (now - 2 * day) + '&end_timestamp=' + now;

export function createInsights({ upstream, parseNews, now }) {
  const cached = createProviderCache({ now, maxCache: 24, maxPending: 20 });
  const releaseFeed = (provider, hosts) => (xml, time) => {
    const releases = parseNews(xml, provider).filter((item) => {
      const published = Date.parse(item.publishedAt);
      return Number.isFinite(published) && published >= firstDate && published <= time && hosts.includes(new URL(item.url).hostname);
    }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 4);
    return releases.length ? observation(Date.parse(releases[0].publishedAt), { releases }) : null;
  };
  const sections = {
    derivatives: [
      { id: 'binance', provider: 'Binance USDⓈ-M Futures', sourceUrl: 'https://www.binance.com/en/futures/BTCUSDT',
        url: 'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT', parse: binance, ttl: minute, maxAge: 5 * minute },
      { id: 'binanceOi', provider: 'Binance USDⓈ-M Futures', sourceUrl: 'https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest-Statistics',
        url: 'https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=25', parse: binanceOi, ttl: 5 * minute, maxAge: 3 * hour, kind: 'dated' },
      { id: 'bybit', provider: 'Bybit', sourceUrl: 'https://bybit-exchange.github.io/docs/v5/market/tickers',
        url: 'https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT', parse: bybit, ttl: minute, maxAge: 5 * minute },
      { id: 'dvol', provider: 'Deribit', sourceUrl: 'https://docs.deribit.com/api-reference/market-data/public-get_volatility_index_data',
        url: deribitUrl, parse: dvol, ttl: 5 * minute, maxAge: 3 * hour, kind: 'dated' },
    ],
    onchain: [
      { id: 'btc', provider: 'Coin Metrics', sourceUrl: 'https://docs.coinmetrics.io/api-reference/api-conventions',
        url: coinMetricsActivity('btc'), parse: (data, time) => activity(data, time, 'btc'), ttl: 30 * minute, maxAge: 4 * day, kind: 'dated' },
      { id: 'eth', provider: 'Coin Metrics', sourceUrl: 'https://docs.coinmetrics.io/api-reference/api-conventions',
        url: coinMetricsActivity('eth'), parse: (data, time) => activity(data, time, 'eth'), ttl: 30 * minute, maxAge: 4 * day, kind: 'dated' },
      { id: 'fees', provider: 'Mempool.space', sourceUrl: 'https://mempool.space/',
        url: 'https://mempool.space/api/v1/fees/recommended', parse: fees, ttl: minute, kind: 'snapshot' },
      { id: 'hash', provider: 'Mempool.space', sourceUrl: 'https://mempool.space/graphs/mining/hashrate-difficulty',
        url: 'https://mempool.space/api/v1/mining/hashrate/1m', parse: hashRate, ttl: 30 * minute, maxAge: 4 * day, kind: 'dated' },
      { id: 'stablecap', provider: 'DeFiLlama', sourceUrl: 'https://defillama.com/stablecoins',
        url: 'https://stablecoins.llama.fi/stablecoincharts/all', parse: stableMarketCap, ttl: 20 * minute, maxAge: 4 * day, kind: 'dated' },
      { id: 'pegs', provider: 'DeFiLlama', sourceUrl: 'https://defillama.com/stablecoins',
        url: 'https://stablecoins.llama.fi/stablecoins?includePrices=true', parse: pegPrices, ttl: 5 * minute, kind: 'snapshot' },
    ],
    macro: [
      ...[['yield10', 'DGS10'], ['yield2', 'DGS2']].map(([id, series]) => ({
        id, provider: 'FRED', sourceUrl: 'https://fred.stlouisfed.org/series/' + series,
        url: (time) => fredCsv(series, time), parse: (data, time) => yields(data, time, series),
        text: true, ttl: 20 * minute, maxAge: 7 * day, kind: 'dated',
      })),
      { id: 'bls', provider: 'U.S. Bureau of Labor Statistics', sourceUrl: 'https://www.bls.gov/schedule/news_release/',
        url: blsIcs, text: true, parse: blsCalendar, ttl: 15 * minute, kind: 'schedule' },
      { id: 'fomc', provider: 'Federal Reserve', sourceUrl: fedCalendar,
        url: fedCalendar, text: true, parse: fomcCalendar, ttl: 15 * minute, kind: 'schedule' },
      { id: 'fedPress', provider: 'Federal Reserve', sourceUrl: 'https://www.federalreserve.gov/newsevents/pressreleases.htm',
        url: 'https://www.federalreserve.gov/feeds/press_all.xml', text: true, parse: releaseFeed('Federal Reserve', ['www.federalreserve.gov']),
        ttl: 10 * minute, kind: 'dated' },
      { id: 'secPress', provider: 'SEC', sourceUrl: 'https://www.sec.gov/newsroom/press-releases',
        url: 'https://www.sec.gov/news/pressreleases.rss', text: true, parse: releaseFeed('SEC', ['www.sec.gov', 'sec.gov']),
        ttl: 10 * minute, kind: 'dated' },
    ],
  };

  async function feed(entry, requestSignal) {
    const { id, provider, sourceUrl, kind = 'observed', ttl, maxAge, url, text, parse } = entry;
    const source = { provider, sourceUrl, kind };
    try {
      const result = await cached(id, provider, ttl, async (signal) => {
        const raw = await upstream(typeof url === 'function' ? url(now()) : url, text, signal);
        const data = parse(raw, now());
        if (!data) throw Error('Provider returned no valid observations.');
        return data;
      }, requestSignal);
      const tooOld = maxAge !== undefined && result.data.asOf && now() - Date.parse(result.data.asOf) > maxAge;
      return [id, {
        ...source,
        ...result.data,
        fetchedAt: result.fetchedAt,
        status: result.cache === 'stale' || tooOld ? 'stale' : kind,
        warning: result.warning ?? (tooOld ? 'Latest observation is older than expected.' : null),
        cache: result.cache,
      }];
    } catch (error) {
      throwIfAborted(requestSignal);
      return [id, { ...source, status: 'unavailable', error: error.message }];
    }
  }

  return async function loadInsights(section, signal) {
    const feeds = Object.fromEntries(await Promise.all(sections[section].map((entry) => feed(entry, signal))));
    return { provider: 'Market Insights', fetchedAt: new Date(now()).toISOString(), data: { section, feeds } };
  };
}
