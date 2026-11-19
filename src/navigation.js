export const PRIMARY = [
 { id: 'home', label: 'Home', icon: 'layout-dashboard', route: 'overview', sectionLabel: 'Home sections' },
 { id: 'markets', label: 'Markets', icon: 'globe', route: 'markets', sectionLabel: 'Market tools' },
 { id: 'research', label: 'Charts', icon: 'chart-no-axes-combined', route: 'terminal', sectionLabel: 'Chart tools' },
 { id: 'backtest', label: 'Backtest', icon: 'activity', route: 'backtest', sectionLabel: 'Backtesting studio' },
 { id: 'practice', label: 'Practice', icon: 'layers', route: 'practice', sectionLabel: 'Practice tools' },
 { id: 'learn', label: 'Learn', icon: 'book-open', route: 'learn' }
];

export const GROUPS = {
 home: [
  { route: 'overview', label: 'Overview' },
  { route: 'news', label: 'News' },
  { route: 'analysts', label: 'Analyst research' },
  { route: 'studio', label: 'Market maps', context:false },
  { route: 'market-insights', label: 'Market insights', context:false },
  { route: 'screener', label: 'Asset screener', context:false },
  { route: 'workspace', label: 'Watchlist & alerts', context:false }
 ],
 markets: [
  { route: 'markets', label: 'Markets' }
 ],
 research: [
  { route: 'terminal', label: 'Workbench' },
  { route: 'compare', label: 'Compare' }
 ],
 backtest: [
  { route: 'backtest', label: 'Backtest studio' }
 ],
 practice: [
  { route: 'practice', label: 'Paper trading' },
  { route: 'replay', label: 'Market replay' },
  { route: 'risk', label: 'Position calculator' }
 ],
 learn: [{ route: 'learn', label: 'Learning desk' }]
};

const paths = new Map(Object.entries(GROUPS).flatMap(([group, items]) => items.map(item => [item.route, group])));
const aliases = new Map([
 ['charts', 'terminal'], ['ai-intelligence', 'terminal'], ['ai', 'terminal'], ['insights', 'market-insights']
]);

export function resolveNavigation(hash = '') {
 const [path, ...query] = String(hash).replace(/^#/, '').split('?');
 let route = paths.has(path) ? path : aliases.get(path);
 if (!route) return { route: 'overview', hash: path || query.length ? '#overview' : '' };

 const search = query.join('?');
 const params = new URLSearchParams(search);
 const section = params.get('section');
 if ((route === 'practice' || route === 'terminal') && section === 'risk-tools') {
  route = 'risk';
  params.delete('section');
 } else if (route === 'terminal' && section === 'research-note') {
  route = 'workspace';
  params.delete('section');
 } else if (path === 'ai' || path === 'ai-intelligence') {
  params.set('panel', 'evidence');
 }

 if (route === path) return { route, hash: '#' + path + (query.length ? '?' + search : '') };
 const redirectedSearch = params.toString();
 return { route, hash: '#' + route + (redirectedSearch ? '?' + redirectedSearch : '') };
}

export function resolveRoute(hash) {
 return resolveNavigation(hash).route;
}

export function groupFor(route) {
 return paths.get(route) ?? 'home';
}

export function navigationFor(route) {
 const group = groupFor(route);
 const primary = PRIMARY.find(item => item.id === group);
 const entries=GROUPS[group];
 const current=entries.find(item=>item.route===route)??entries[0];
 const items=entries.filter(item=>item.context!==false||item===current);
 return { group, primary, items, current, primaryCurrent: primary.route === current.route ? 'page' : 'location' };
}

export function normalizeDock(value) {
 return value === 'hidden' ? 'hidden' : 'compact';
}

const dockStorageKey = 'cryptoz.navigation.v1';

export function readDock(storage) {
 try { return normalizeDock(storage.getItem(dockStorageKey)); }
 catch { return 'compact'; }
}

export function saveDock(storage, mode) {
 try { storage.setItem(dockStorageKey, normalizeDock(mode)); return true; }
 catch { return false; }
}
