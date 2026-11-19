const DAY_MS = 86_400_000;
export const RATES = Object.freeze({
  'USD-INR': Object.freeze({
    url:'https://api.frankfurter.dev/v2/rate/USD/INR?providers=ecb',
    provider:'ECB via Frankfurter',
    maxAge:7*DAY_MS, refresh:3_600_000
  }),
  'USDT-USD': Object.freeze({
    url:'https://api.exchange.coinbase.com/products/USDT-USD/ticker',
    provider:'Coinbase Exchange',
    maxAge:300_000, refresh:60_000
  })
});

export function validateRate(pair, {rate, observedAt} = {}, now = Date.now()) {
  if (!Object.hasOwn(RATES, pair) || typeof observedAt !== 'string') return null;
  const at = Date.parse(observedAt);
  if (!Number.isFinite(at) || at > now || now-at > RATES[pair].maxAge) return null;
  if (pair === 'USD-INR' && observedAt !== new Date(at).toISOString().slice(0,10)) return null;
  if (!Number.isFinite(rate) || !(rate > 0)) return null;
  return {rate,observedAt,at};
}

export function readProviderRate(pair, payload, now = Date.now()) {
  const fields = pair === 'USD-INR'
    ? payload?.base === 'USD' && payload?.quote === 'INR' && {rate:payload.rate, observedAt:payload.date}
    : {rate:Number(payload?.price), observedAt:payload?.time};
  return fields ? validateRate(pair, fields, now) : null;
}
