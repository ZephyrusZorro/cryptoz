import { classifyHeadline } from './news-window.js';
import { ago, esc, icon, stamp } from './ui.js';

const TIER_LABELS = { official: 'Official', research: 'On-chain research', institutional: 'Institutional', investigative: 'Investigative' };

function formatDigestDate(iso, showCalendarDate) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return ago(iso);
  if (!showCalendarDate) return ago(iso);
  const formatted = new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `${formatted} · ${ago(iso)}`;
}

export function renderNewsCards(items, { window = 'latest' } = {}) {
  const showCalendarDate = window !== 'latest';
  return items.map(item => {
    if (typeof item?.title !== 'string' || !item.title.trim() || typeof item.source !== 'string' || !item.source.trim()) return '';
    let link;
    try { link = new URL(item.url); if (link.protocol !== 'https:') return ''; } catch { return ''; }
    const impactBadge = item.impact === 'high'
      ? `<span class="news-tag news-impact-high" title="${esc(item.impactReason ?? 'High-impact market catalyst')}">High impact${item.impactReason ? ' · ' + esc(item.impactReason) : ''}</span>`
      : item.impact === 'medium'
        ? `<span class="news-tag news-impact-medium" title="${esc(item.impactReason ?? 'Notable market mover')}">${esc(item.impactReason ?? 'Market mover')}</span>`
        : '';
    const tierLabel = TIER_LABELS[item.tier] ?? '';
    const corroborated = Number.isInteger(item.corroboratedBy) && item.corroboratedBy > 1
      ? `<span class="news-tag news-corroborated" title="Covered independently by ${item.corroboratedBy} publishers">${item.corroboratedBy} outlets</span>`
      : '';
    return `<article class="news-card"${item.impact === 'high' ? ' data-impact="high"' : ''}>
   <div class="news-card-top"><span class="publisher-mark" aria-hidden="true">${esc(item.source.slice(0, 1))}</span><span>${esc(item.source)}</span><time title="${esc(stamp(item.publishedAt))}">${esc(formatDigestDate(item.publishedAt, showCalendarDate))}</time></div>
   <a href="${esc(link.href)}" target="_blank" rel="noopener noreferrer" class="news-headline">${esc(item.title)}${icon('arrow-up-right')}</a>
   <div class="news-card-bottom"><span class="news-tag">${classifyHeadline(item.title)}</span>${tierLabel ? `<span class="news-tag news-tier">${esc(tierLabel)}</span>` : ''}${impactBadge}${corroborated}</div>
  </article>`;
  }).join('');
}
