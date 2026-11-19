export const FORECAST_PRESETS = Object.freeze([1, 3, 5, 12, 24, 36, 48]);
export const FORECAST_MIN_HORIZON = 1;
export const FORECAST_MAX_HORIZON = 48;
export const FORECAST_DEFAULT_HORIZON = 5;
export const FORECAST_MAX_CANDLES = 4_000;
export const FORECAST_MIN_CANDLES = 250;

export function validForecastHorizon(value) {
  return Number.isSafeInteger(value) && value >= FORECAST_MIN_HORIZON && value <= FORECAST_MAX_HORIZON;
}

export function normalizeForecastHorizon(value) {
  const horizon = Number(value);
  return validForecastHorizon(horizon) ? horizon : FORECAST_DEFAULT_HORIZON;
}

export function parseForecastStart(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date
    || ms < 1_230_768_000_000 || ms >= 1e13) return null;
  return ms / 1000;
}

export function forecastHistoryChoice(mode, {count, date, latestCandle} = {}) {
  if (mode === 'auto') return {mode};
  if (mode === 'max') return {mode, maxCandles: FORECAST_MAX_CANDLES};
  if (mode === 'date') {
    const from = parseForecastStart(date);
    return from !== null && from <= latestCandle ? {mode, from} : null;
  }
  const goal = Number(mode === 'custom' ? count : mode);
  return Number.isSafeInteger(goal) && goal >= FORECAST_MIN_CANDLES && goal <= FORECAST_MAX_CANDLES
    ? {mode: 'count', maxCandles: goal} : null;
}
