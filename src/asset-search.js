export const normalizeSearch=value=>String(value??'').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
export const isFetchAsset=a=>['fetch-ai','fet-artificial-superintelligence-alliance'].includes(a.id)||(a.venue==='binance'&&a.symbol==='FETUSDT')||(a.venue==='coinbase'&&a.symbol==='FET-USD');
const aliases=a=>isFetchAsset(a)?'fetch ai fetch.ai artificial superintelligence alliance':'';
export function matchesAsset(asset,query){
 const q=normalizeSearch(query);if(!q)return true;
 const text=normalizeSearch([asset.name,asset.symbol,asset.base,asset.quote,asset.id,aliases(asset)].filter(Boolean).join(' '));
 return text.replaceAll(' ','').includes(q.replaceAll(' ',''))||q.split(' ').every(term=>text.includes(term));
}
export function rankAssets(items,query,limit=20){
 const q=normalizeSearch(query).replaceAll(' ','');
 const score=a=>(normalizeSearch(a.base??a.symbol).replaceAll(' ','')===q?1000:0)+(normalizeSearch(a.name).replaceAll(' ','')===q?500:0)+(normalizeSearch(a.name).startsWith(normalizeSearch(query))?100:0);
 return items.filter(a=>matchesAsset(a,query)).sort((a,b)=>score(b)-score(a)||(a.rank||999999)-(b.rank||999999)).slice(0,limit);
}
export function catalogQuery(q){const n=normalizeSearch(q);return /^(fetch ai|fetchai|artificial superintelligence(?: alliance)?)$/.test(n)?'fet':n.slice(0,80);}
// Coinpaprika currently returns these two IDs for the same FET identity.
export const assetIdentity=a=>['fetch-ai','fet-artificial-superintelligence-alliance'].includes(a.id)?'fetch-ai':a.id;
export function mergeAssets(...lists){const map=new Map();for(const a of lists.flat()){const key=assetIdentity(a),old=map.get(key);if(!old||(!old.price&&a.price))map.set(key,a);}return [...map.values()];}
export function createLatestSearch({request,onResult,onError=()=>{}}){
 let generation=0,controller;
 return {async run(query){const current=++generation;controller?.abort();controller=new AbortController();try{const result=await request(query,{signal:controller.signal});if(current===generation)onResult(result,query);}catch(error){if(current===generation&&error.name!=='AbortError')onError(error,query);}},cancel(){generation++;controller?.abort();}};
}
