export const NEWS_WINDOW_OPTIONS = Object.freeze([
  { id: 'latest', label: 'Live / 24h', subtitle: 'Real-time breaking headlines from 14 institutional, regulatory, and on-chain feeds.' },
  { id: 'week', label: 'Top of week', maxAgeMs: 7 * 86_400_000, subtitle: 'Most impactful market, ETF, macro, and security stories from the past 7 days.' },
  { id: 'month', label: 'Top of month', maxAgeMs: 31 * 86_400_000, subtitle: 'Defining crypto, institutional, and policy catalysts from the past 30 days.' },
  { id: 'year', label: 'Top of year', maxAgeMs: 366 * 86_400_000, subtitle: 'Landmark regulatory, ETF, macro, and market-cycle headlines from the past 12 months.' },
]);

export function validNewsWindow(value) {
  return NEWS_WINDOW_OPTIONS.some(option => option.id === value) ? value : 'latest';
}

export function newsWindow(items, { source = 'all', topic = 'all', query = '', sort = 'impact', window = 'latest', limit = 20, nowMs = Date.now() } = {}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 20;
  const q = String(query).trim().toLowerCase();
  const winCfg = NEWS_WINDOW_OPTIONS.find(o => o.id === window) ?? NEWS_WINDOW_OPTIONS[0];
  const filtered = (Array.isArray(items) ? items : []).filter(x => {
    if (!x) return false;
    if (winCfg.maxAgeMs) {
      const pubMs = Date.parse(x.publishedAt);
      if (Number.isFinite(pubMs) && nowMs - pubMs > winCfg.maxAgeMs) return false;
    }
    if (source !== 'all' && x.source !== source) return false;
    if (topic === 'HIGH_IMPACT') {
      if (x.impact !== 'high' && x.impact !== 'medium') return false;
    } else if (topic !== 'all' && classifyHeadline(x.title) !== topic) return false;
    if (q && !String(x.title).toLowerCase().includes(q) && !String(x.source ?? '').toLowerCase().includes(q)) return false;
    return true;
  });
  const ordered = sort === 'latest'
    ? [...filtered].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
    : [...filtered].sort((a, b) => ((b.priority ?? 0) - (a.priority ?? 0)) || ((Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0)));
  const visible = ordered.slice(0, safeLimit);
  const highCount = ordered.filter(x => x.impact === 'high').length;
  const sourceCount = new Set(ordered.map(x => x.source).filter(Boolean)).size;
  return { items: visible, total: ordered.length, remaining: ordered.length - visible.length, highCount, sourceCount, window: winCfg };
}

export function classifyHeadline(t) {
  if (/fed\b|fomc\b|inflation|interest rate|rate cut|rate hike|treasury|dollar|cpi\b|pce\b|monetary policy/i.test(t)) return 'MACRO';
  if (/regulat|sec\b|cftc\b|occ\b|law|legislat|court|policy|enforcement|bill\b|mica\b|genius act|clarity act|final rule/i.test(t)) return 'POLICY';
  if (/hack|exploit|security|breach|drained|depeg|insolven|bankrupt/i.test(t)) return 'SECURITY';
  if (/etf|fund|institution|blackrock|fidelity|microstrategy|sovereign|treasury buys|cme group|vaneck/i.test(t)) return 'INSTITUTIONAL';
  if (/defi|protocol|ethereum|solana|layer[- ]?2|staking|upgrade|mainnet/i.test(t)) return 'ECOSYSTEM';
  return 'MARKETS';
}
