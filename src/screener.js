import {filterMarketGroup} from './market-groups.js';
import {asNumber} from './numbers.js';
import {esc,pct,price,tone} from './ui.js';
import {moneyMarkup} from './currency.js';

const groups=[['layer-1','Layer 1'],['layer-2','Layer 2'],['defi','DeFi'],['stablecoins','Stablecoins'],['ai-compute','AI & compute'],['meme','Meme coins'],['tokenized-oracles','Tokenized assets & oracles'],['gaming','Gaming & virtual worlds']];
const choices={volume:[0,1e6,1e7,1e8],size:['all','large','mid','small'],move:['all','up5','down5']};
export const initialScreen=()=>({volume:0,size:'all',move:'all'});
export function screenMarket(rows, filters=initialScreen(), universe='aggregate'){
 const volume=choices.volume.includes(filters.volume)?filters.volume:0,size=universe==='aggregate'&&choices.size.includes(filters.size)?filters.size:'all',move=choices.move.includes(filters.move)?filters.move:'all';
 return rows.filter(a=>{
  const cap=asNumber(a.marketCap),v=asNumber(a.volume),d=asNumber(a.change);
  return (!volume||v!==null&&v>=volume)&&(size==='all'||cap!==null&&cap>0&&(size==='large'?cap>=1e10:size==='mid'?cap>=1e9&&cap<1e10:cap<1e9))&&(move==='all'||d!==null&&(move==='up5'?d>=5:d<=-5));
 });
}
export function groupPerformance(rows,group){
 const reported=filterMarketGroup(rows,group).filter(x=>Number.isFinite(x.marketCap)&&x.marketCap>0&&Number.isFinite(x.change));
 const total=reported.reduce((sum,x)=>sum+x.marketCap,0);
 const weighted=total>0&&Number.isFinite(total)?reported.reduce((sum,x)=>sum+x.change*(x.marketCap/total),0):null;
 return {count:reported.length,change:Number.isFinite(weighted)?weighted:null};
}
export function sectorPulse(rows,selected){
 return `<div class="sector-pulse" role="group" aria-label="Tracked sector changes">${groups.map(([key,label])=>{const x=groupPerformance(rows,key);return `<button type="button" data-action="market-group" data-market-group="${key}" aria-pressed="${key===selected}"><strong>${label}</strong><b class="${tone(x.change)}">${pct(x.change)}</b><small>${x.count?x.count+' with data':'No figures yet'}</small></button>`;}).join('')}</div><p class="data-note">24h market-cap-weighted movement of the tracked subset.</p>`;
}
export function screenerControls(screen,universe){
 const sel=(name,label,options)=>`<label><span>${label}</span><select data-screen="${name}">${options.map(([id,label])=>`<option value="${id}" ${screen[name]===id?'selected':''}>${label}</option>`).join('')}</select></label>`;
 return `<section class="panel market-screen" aria-label="Pro market screener"><div class="market-screen-fields">
 ${universe==='aggregate'?sel('size','Market cap',[['all','Any size'],['large','10B USD or more'],['mid','1B–10B USD'],['small','Under 1B USD']]):''}
 ${sel('volume','Minimum 24h volume',[[0,'Any volume'],[1e6,'1 million'],[1e7,'10 million'],[1e8,'100 million']])}
 ${sel('move','24h move',[['all','Any move'],['up5','Up 5% or more'],['down5','Down 5% or more']])}</div></section>`;
}
export function marketBrief(rows,watchlist){
 const priced=rows.filter(x=>Number.isFinite(x.price)&&x.price>0);
 const watch=new Set(watchlist);const saved=priced.filter(x=>watch.has(x.id)).slice(0,4);
 const ranked=priced.filter(x=>Number.isSafeInteger(x.rank)&&x.rank>0&&x.rank<=100&&Number.isFinite(x.change));
 const list=saved.length?saved:[...ranked].sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)).slice(0,4);
 return `<div class="panel-top"><h2>${saved.length?'Your watchlist':'Top 100 movers'}</h2>${saved.length?'<a class="text-link" href="#workspace">Manage</a>':''}</div>${list.length?list.map(a=>`<button class="watch-row" data-action="asset-chart" data-id="${esc(a.id)}"><span><strong>${esc(a.symbol)}</strong> <small>${esc(a.name)}</small></span><span>${moneyMarkup(a.price)} <small class="${tone(a.change)}">${pct(a.change)}</small></span></button>`).join(''):'<p class="data-note">Waiting for market snapshot.</p>'}`;
}
