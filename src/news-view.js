import {classifyHeadline} from './news-window.js';
import {ago,esc,icon,stamp} from './ui.js';

const TIER_LABELS={official:'Official',research:'On-chain research',institutional:'Institutional',investigative:'Investigative'};

export function renderNewsCards(items){
 return items.map(item=>{
  if(typeof item?.title!=='string'||!item.title.trim()||typeof item.source!=='string'||!item.source.trim())return '';
  let link;
  try{link=new URL(item.url);if(link.protocol!=='https:')return '';}catch{return '';}
  const impactBadge=item.impact==='high'
   ?`<span class="news-tag news-impact-high" title="${esc(item.impactReason??'High-impact market catalyst')}">High impact${item.impactReason?' · '+esc(item.impactReason):''}</span>`
   :item.impact==='medium'
    ?`<span class="news-tag news-impact-medium" title="${esc(item.impactReason??'Notable market mover')}">${esc(item.impactReason??'Market mover')}</span>`
    :'';
  const tierLabel=TIER_LABELS[item.tier]??'';
  return `<article class="news-card"${item.impact==='high'?' data-impact="high"':''}>
   <div class="news-card-top"><span class="publisher-mark" aria-hidden="true">${esc(item.source.slice(0,1))}</span><span>${esc(item.source)}</span><time title="${esc(stamp(item.publishedAt))}">${ago(item.publishedAt)}</time></div>
   <a href="${esc(link.href)}" target="_blank" rel="noopener noreferrer" class="news-headline">${esc(item.title)}${icon('arrow-up-right')}</a>
   <div class="news-card-bottom"><span class="news-tag">${classifyHeadline(item.title)}</span>${tierLabel?`<span class="news-tag news-tier">${esc(tierLabel)}</span>`:''}${impactBadge}</div>
  </article>`;
 }).join('');
}
