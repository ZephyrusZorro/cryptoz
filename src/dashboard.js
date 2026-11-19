import {normalizeCandles} from './analytics.js';
import {icon} from './ui.js';

export const BENCHMARK_RANGES = Object.freeze({
 '24h': {interval:'1h', count:24},
 '7d': {interval:'1h', count:168},
 '30d': {interval:'4h', count:180},
 '1y': {interval:'1d', count:365}
});

export function benchmarkWindow(bars, range) {
 const {interval,count} = BENCHMARK_RANGES[range] ?? BENCHMARK_RANGES['7d'];
 const valid = normalizeCandles(bars ?? []);
 const last = valid.at(-1), priorTime = last?.time - 86400;
 const prior = valid.find(bar => bar.time === priorTime);
 return {
  interval, bars:valid.slice(-count),
  change:last && prior ? (last.close / prior.close - 1) * 100 : null
 };
}

export function dashboardShortcuts() {
 const links=[
  ['chart-no-axes-combined','Charts','Indicators and drawing tools','#terminal'],
  ['activity','Signals','Confirmed events on the chart','#terminal?panel=signals&amp;focus=analysis'],
  ['target','Forecast','Test patterns against history','#terminal?panel=evidence&amp;focus=analysis'],
  ['layers','Market replay','Practice on past candles','#replay']
 ];
 return `<nav class="era-shortcuts" aria-label="Research tools">${links.map(([glyph,title,description,href])=>`<a href="${href}"><i class="era-tool-icon">${icon(glyph)}</i><span><strong>${title}</strong><small>${description}</small></span>${icon('arrow-up-right')}</a>`).join('')}</nav>`;
}
