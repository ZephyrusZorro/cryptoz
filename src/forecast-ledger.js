import { closedStudyCandles, FORECAST_HORIZON, FORECAST_HORIZONS, FORECAST_VERSION } from './adaptive-study.js';
import { FORECAST_MAX_CANDLES, validForecastHorizon } from './forecast-settings.js';
import { INTERVALS, validInstrument } from './preferences.js';

export const FORECAST_STORAGE_KEY = 'cryptoz.forecasts.v1';
const LEGACY_VERSION = 'adaptive-v1';
const PRESET_VERSION = 'adaptive-v2';
const PRIOR_VERSION = 'adaptive-v3';
const V4_VERSION = 'adaptive-v4';
const V5_VERSION = 'adaptive-v5';
const MAX_RECORDS = { [LEGACY_VERSION]: 192, [PRESET_VERSION]: 384, [PRIOR_VERSION]: 384, [V4_VERSION]: 384, [V5_VERSION]: 384, [FORECAST_VERSION]: 384 };
const MAX_PER_SCOPE = 32;
const MAX_SERIALIZED_LENGTH = 512_000;
const BENCHMARK_IDS = new Set(['historical', 'recent', 'momentum']);

const stepFor = interval => typeof interval === 'string' && Object.hasOwn(INTERVALS, interval) ? INTERVALS[interval] : 0;
const positivePrice = value => Number.isFinite(value) && value > 0;
const validProbability = value => Number.isFinite(value) && value >= 0 && value <= 1;
const marketKey = row => [row.venue, row.symbol, row.interval].join(':');
const scopeKey = row => [marketKey(row), row.version, row.horizon].join(':');
const recordKey = row => [scopeKey(row), row.asOf, row.sampleStart ?? 0].join(':');
const outcomeDirection = (close, originClose) => close > originClose ? 'up' : close < originClose ? 'down' : 'flat';

export function summarizeForecasts(rows, version=FORECAST_VERSION) {
  const first = new Map();
  for (const row of rows) {
    if (row.version !== version) continue;
    const previous = first.get(row.asOf);
    if (!previous || row.issuedAt < previous.issuedAt) first.set(row.asOf, row);
  }
  const unique = [...first.values()].sort((a,b)=>a.asOf-b.asOf);
  let end = 0, settled = 0, correct = 0, modelLoss = 0, baselineLoss = 0;
  for (const row of unique) {
    if (!row.outcome || row.asOf < end) continue;
    const up = Number(row.outcome.close > row.originClose);
    settled++;
    end = row.targetCloseAt;
    correct += Number((row.direction === 'up') === Boolean(up));
    modelLoss += (row.probabilityUp-up)**2;
    baselineLoss += (row.baselineProbabilityUp-up)**2;
  }
  return {settled, correct, pending:unique.filter(row=>!row.outcome).length,
    modelBrier:settled?modelLoss/settled:null, baselineBrier:settled?baselineLoss/settled:null};
}

function forecastFields(row) {
  if (!row || typeof row.symbol !== 'string') return null;
  const { venue, symbol, interval, version, horizon, asOf, targetCloseAt, originClose, probabilityUp, baselineProbabilityUp, direction, sampleStart } = row;
  const quote = venue === 'binance' ? 'USDT' : 'USD';
  const suffix = venue === 'binance' ? 'USDT' : '-USD';
  if (!validInstrument({ venue, symbol, base: symbol.slice(0, -suffix.length), quote })) return null;
  const step = stepFor(interval);
  const windowedVersion = version === PRIOR_VERSION || version === V4_VERSION || version === V5_VERSION || version === FORECAST_VERSION;
  const supported = version === LEGACY_VERSION && horizon === FORECAST_HORIZON
    || version === PRESET_VERSION && FORECAST_HORIZONS.includes(horizon)
    || windowedVersion && validForecastHorizon(horizon)
      && Number.isSafeInteger(sampleStart) && sampleStart > 0 && sampleStart <= asOf && sampleStart % step === 0
      && (asOf - sampleStart) / step < FORECAST_MAX_CANDLES;
  if (!step || !supported
      || !Number.isSafeInteger(asOf) || asOf <= 0 || asOf >= 1e10 || asOf % step
      || targetCloseAt !== asOf + step * horizon || !positivePrice(originClose)
      || !validProbability(probabilityUp) || !validProbability(baselineProbabilityUp)
      || !(direction === 'up' && probabilityUp >= 0.60 || direction === 'not-higher' && probabilityUp <= 0.40)) return null;

  const fields = { venue, symbol, interval, version, horizon, asOf, targetCloseAt, originClose, probabilityUp, baselineProbabilityUp, direction };
  if (windowedVersion) fields.sampleStart = sampleStart;
  const { benchmarkId, benchmarkProbabilityUp } = row;
  if (BENCHMARK_IDS.has(benchmarkId) && validProbability(benchmarkProbabilityUp)) {
    return { ...fields, benchmarkId, benchmarkProbabilityUp };
  }
  return fields;
}

function issuedInTime(row, at) {
  return Number.isFinite(at) && row.asOf <= at && at < row.asOf + stepFor(row.interval);
}

function validRecord(row) {
  const fields = forecastFields(row);
  if (!fields || !issuedInTime(fields, row.issuedAt)) return null;
  const settled = row.outcome;
  const outcome = positivePrice(settled?.close) && Number.isFinite(settled.settledAt) && settled.settledAt >= fields.targetCloseAt
    ? { close: settled.close, direction: outcomeDirection(settled.close, fields.originClose), settledAt: settled.settledAt }
    : null;
  return { ...fields, issuedAt: row.issuedAt, outcome };
}

function retain(records) {
  const firstIssuances = new Map();
  for (const row of records) {
    const key = recordKey(row);
    const first = firstIssuances.get(key);
    if (!first || row.issuedAt < first.issuedAt) firstIssuances.set(key, row);
  }
  const newest = [...firstIssuances.values()].sort((a, b) => b.issuedAt - a.issuedAt);
  const scopes = new Map();
  const versions = new Map();
  const retained = [];
  for (const row of newest) {
    const scope = scopeKey(row);
    const count = scopes.get(scope) ?? 0;
    const versionCount = versions.get(row.version) ?? 0;
    if (count >= MAX_PER_SCOPE || versionCount >= MAX_RECORDS[row.version]) continue;
    scopes.set(scope, count + 1);
    versions.set(row.version, versionCount + 1);
    retained.push(row);
  }
  return retained;
}

export function createForecastLedger(storage, locks = globalThis.navigator?.locks) {
  function read() {
    let serialized;
    try {
      serialized = storage.getItem(FORECAST_STORAGE_KEY);
    } catch {
      return null;
    }
    if (!serialized || serialized.length > MAX_SERIALIZED_LENGTH) return [];
    try {
      const records = JSON.parse(serialized);
      return Array.isArray(records) ? retain(records.map(validRecord).filter(Boolean)) : [];
    } catch {
      return [];
    }
  }

  function save(records) {
    try {
      storage.setItem(FORECAST_STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch {
      return false;
    }
  }

  async function write(operation, unavailable) {
    try {
      if (typeof locks?.request === 'function') return await locks.request(FORECAST_STORAGE_KEY, operation);
      return operation();
    } catch {
      return unavailable;
    }
  }

  return {
    async record(forecast, nowSeconds, { signal } = {}) {
      const fields = forecastFields(forecast);
      if (!fields || signal?.aborted) return null;
      return write(() => {
        if (signal?.aborted) return null;
        const records = read();
        if (!records) return null;
        const existing = records.find(row => recordKey(row) === recordKey(fields));
        if (existing) return existing;
        const issuedAt = nowSeconds === undefined ? Date.now() / 1000 : nowSeconds;
        if (!issuedInTime(fields, issuedAt)) return null;
        const entry = { ...fields, issuedAt, outcome: null };
        const retained = retain([...records, entry]);
        return retained.includes(entry) && save(retained) ? entry : null;
      }, null);
    },

    async settle({ bars, instrument, interval, closedThrough, nowSeconds = Date.now() / 1000, stale = false } = {}) {
      const skipped = { settled: 0, saved: true };
      const unavailable = { settled: 0, saved: false };
      const step = stepFor(interval);
      if (stale || !step || !validInstrument(instrument)) return skipped;
      const key = marketKey({ ...instrument, interval });
      return write(() => {
        const records = read();
        if (!records) return unavailable;
        if (!records.some(row => !row.outcome && marketKey(row) === key && row.targetCloseAt <= closedThrough && row.targetCloseAt <= nowSeconds)) return skipped;
        const closes = new Map(closedStudyCandles(bars, interval, closedThrough, nowSeconds).map(bar => [bar.time + step, bar.close]));
        let settled = 0;
        const updated = records.map(row => {
          if (row.outcome || marketKey(row) !== key) return row;
          const close = closes.get(row.targetCloseAt);
          if (close === undefined) return row;
          settled++;
          return { ...row, outcome: { close, direction: outcomeDirection(close, row.originClose), settledAt: nowSeconds } };
        });
        if (!settled) return skipped;
        return save(updated) ? { settled, saved: true } : unavailable;
      }, unavailable);
    },

    list(instrument, interval) {
      if (!validInstrument(instrument) || !stepFor(interval)) return [];
      const key = marketKey({ ...instrument, interval });
      return (read() ?? []).filter(row => marketKey(row) === key);
    },
  };
}
