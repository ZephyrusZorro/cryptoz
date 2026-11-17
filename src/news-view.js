import {classifyHeadline} from './news-window.js';
import {ago,esc,icon,stamp} from './ui.js';

export function renderNewsCards(items){
 return items.map(item=>{
  if(typeof item?.title!=='string'||!item.title.trim()||typeof item.source!=='string'||!item.source.trim())return '';
  let link;
  try{link=new URL(item.url);if(link.protocol!=='https:')return '';}catch{return '';}
  return `<article class="news-card">
   <div class="news-card-top"><span class="publisher-mark" aria-hidden="true">${esc(item.source.slice(0,1))}</span><span>${esc(item.source)}</span><time title="${esc(stamp(item.publishedAt))}">${ago(item.publishedAt)}</time></div>
   <a href="${esc(link.href)}" target="_blank" rel="noopener noreferrer" class="news-headline">${esc(item.title)}${icon('arrow-up-right')}</a>
   <div class="news-card-bottom"><span class="news-tag">${classifyHeadline(item.title)}</span></div>
  </article>`;
 }).join('');
}
