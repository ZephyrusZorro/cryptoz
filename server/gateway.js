import {createProviderCache} from './cache.js';
import {abortable,deadline,throwIfAborted} from '../src/async-task.js';
import {normalizeBook} from '../src/market-integrity.js';
import { XMLParser } from 'fast-xml-parser';
import { normalizeCandles } from '../src/analytics.js';

const B='https://data-api.binance.vision/api/v3', C='https://api.exchange.coinbase.com';
const fiat=new Set(['USD','EUR','GBP','AUD','CAD','CHF','JPY','CNY','CNH','KRW','INR','BRL','TRY','RUB','UAH','PLN','ARS','IDR','MXN','ZAR']);
const intervals={'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400};
const headers={'User-Agent':'CRYPTOZ/1.0 public research terminal','Accept':'application/json, application/rss+xml, text/xml'};
const sources=[{name:'The Block',url:'https://www.theblock.co/rss.xml'},{name:'CoinDesk',url:'https://www.coindesk.com/arc/outboundfeeds/rss/'},{name:'Decrypt',url:'https://decrypt.co/feed'},{name:'Cointelegraph',url:'https://cointelegraph.com/rss'}];
export const relevantHeadline=title=>/\b(crypto|bitcoin|btc|ethereum|ether|eth|solana|sol|xrp|blockchain|stablecoin|defi|nft|token|altcoin|binance|coinbase|kraken|tether|usdt|usdc|wallet|trezor|ledger|satoshi|on-chain|web3|hyperliquid|ripple|dogecoin|doge|sec|fed|federal reserve|interest rate|inflation|treasury|cpi|etf)\b/i.test(title);
const textValue=x=>typeof x==='object'?(x?.['#text']??''):String(x??'');
const strip=s=>textValue(s).replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|#39|#\d+|#x[0-9a-f]+);/gi,e=>{const m={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"};if(m[e])return m[e];const n=e.startsWith('&#x')?parseInt(e.slice(3),16):parseInt(e.slice(2),10);return Number.isFinite(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/\s+/g,' ').trim().slice(0,500);
export function parseNews(xml,source) {
 const doc=new XMLParser({ignoreAttributes:false,processEntities:true,htmlEntities:true}).parse(xml);let items=doc?.rss?.channel?.item??doc?.feed?.entry??[];if(!Array.isArray(items))items=[items];
 const seen=new Set();return items.flatMap(item=>{const title=strip(item.title),url=textValue(item.link?.['@_href']??item.link),date=Date.parse(textValue(item.pubDate??item.published??item.updated));try{const u=new URL(url);if(u.protocol!=='https:'||!title||seen.has(u.href))return [];seen.add(u.href);return [{title,url:u.href,source,publishedAt:Number.isFinite(date)?new Date(date).toISOString():null}];}catch{return [];}}).slice(0,25);
}
export function createGateway({fetcher=fetch,now=Date.now}={}) {
 const runCached=createProviderCache({now});
 async function upstream(url,xml=false,signal){
  const timing=deadline(signal,12000);try{const response=await abortable(fetcher(url,{headers,signal:timing.signal}),timing.signal);if(!response.ok)throw Error(`Upstream HTTP ${response.status}`);return await abortable(xml?response.text():response.json(),timing.signal);}finally{timing.dispose();}
 }
 async function loadInstruments(venue,requestSignal){return runCached(`instruments:${venue}`,venue==='binance'?'Binance':'Coinbase',3600000,async signal=>{const d=await upstream(venue==='binance'?`${B}/exchangeInfo`:`${C}/products`,false,signal);if(venue==='binance'){if(!Array.isArray(d.symbols))throw Error('Invalid instruments');return d.symbols.filter(x=>x.status==='TRADING'&&x.quoteAsset==='USDT'&&!fiat.has(x.baseAsset)&&x.isSpotTradingAllowed!==false).map(x=>({symbol:x.symbol,base:x.baseAsset,quote:x.quoteAsset,venue}));}if(!Array.isArray(d))throw Error('Invalid instruments');return d.filter(x=>x.quote_currency==='USD'&&!fiat.has(x.base_currency)&&x.status==='online').map(x=>({symbol:x.id,base:x.base_currency,quote:'USD',venue}));},requestSignal);}
 return async function handle(request) {
  const cached=(key,provider,ttl,loader)=>runCached(key,provider,ttl,loader,request.signal);
  throwIfAborted(request.signal);const u=new URL(request.url),route=u.pathname.replace(/^\/api\//,''),p=u.searchParams;
  if(request.method!=='GET')return Response.json({error:'Read-only API'},{status:405});
  try {
   let result;
   if(['candles','book','ticker'].includes(route)) {
    const venue=p.get('venue')??'binance',symbol=p.get('symbol')??'BTCUSDT',interval=p.get('interval')??'1h';
    if(!['binance','coinbase'].includes(venue)||!(venue==='binance'?/^[\p{L}\p{N}]{3,30}$/u:/^[A-Z0-9]{1,20}-USD$/).test(symbol)||!Object.hasOwn(intervals,interval))return Response.json({error:'Invalid venue, instrument or interval'},{status:400});
    const provider=venue==='binance'?'Binance':'Coinbase',path=venue==='binance'?`${B}/${route==='candles'?'klines':route==='book'?'depth':'ticker/24hr'}?symbol=${symbol}${route==='candles'?`&interval=${interval}&limit=500`:route==='book'?'&limit=50':''}`:`${C}/products/${symbol}/${route==='candles'?`candles?granularity=${interval==='4h'?3600:intervals[interval]}`:route==='book'?'book?level=2':'ticker'}`;
    result=await cached(`${route}:${venue}:${symbol}:${route==='candles'?interval:''}`,provider,route==='candles'?15000:route==='book'?5000:10000,async signal=>{
     const d=await upstream(path,false,signal);
     if(route==='candles') {
      if(!Array.isArray(d))throw Error('Invalid candle response');
      let bars=normalizeCandles(d.map(x=>venue==='binance'?{time:Math.floor(+x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]}:{time:+x[0],low:+x[1],high:+x[2],open:+x[3],close:+x[4],volume:+x[5]}));
      if(venue==='coinbase'&&interval==='4h'){const m=new Map();for(const b of bars){const t=Math.floor(b.time/14400)*14400,prev=m.get(t);m.set(t,prev?{...prev,high:Math.max(prev.high,b.high),low:Math.min(prev.low,b.low),close:b.close,volume:prev.volume+b.volume}:{...b,time:t});}const currentBucket=Math.floor(now()/1000/14400)*14400;const counts=new Map();for(const b of bars){const t=Math.floor(b.time/14400)*14400;counts.set(t,(counts.get(t)??0)+1);}bars=[...m.values()].filter(b=>counts.get(b.time)===4||b.time===currentBucket);}
      if(!bars.length)throw Error('No valid candles for this instrument');return {venue,symbol,interval,bars};
     }
     if(route==='book') {if(!Array.isArray(d.bids)||!Array.isArray(d.asks))throw Error('Invalid order book');const book=normalizeBook(d);if(!book)throw Error('Invalid order book levels');return {venue,symbol,...book};}
     if(venue==='coinbase'){if(!Number.isFinite(+d.price)||+d.price<=0||!Number.isFinite(Date.parse(d.time)))throw Error('Invalid last-trade quote');const stats=await runCached(`stats:coinbase:${symbol}`,'Coinbase',60000,s=>upstream(`${C}/products/${symbol}/stats`,false,s),signal).catch(()=>({data:{}}));return {...stats.data,last:d.price,observedAt:d.time};}
     if(!Number.isFinite(+d.lastPrice)||+d.lastPrice<=0)throw Error('Invalid ticker price');const observedAt=venue==='binance'&&Number.isFinite(+d.closeTime)?new Date(+d.closeTime).toISOString():new Date(now()).toISOString();return {...d,observedAt};
    });
   } else if(route==='asset-search') {
    const q=(p.get('q')??'').trim();if(q.length<2||q.length>80||/[\x00-\x1f<>]/.test(q))return Response.json({error:'Search must contain 2–80 characters'},{status:400});
    result=await cached('asset-search:'+q.toLowerCase(),'Coinpaprika',900000,async signal=>{const d=await upstream('https://api.coinpaprika.com/v1/search?q='+encodeURIComponent(q)+'&c=currencies&limit=20',false,signal);if(!Array.isArray(d.currencies))throw Error('Invalid asset search');return d.currencies.filter(x=>x.is_active&&/^[a-z0-9-]{2,100}$/.test(x.id)&&typeof x.name==='string'&&typeof x.symbol==='string').slice(0,20).map(x=>({id:x.id,name:x.name,symbol:x.symbol,rank:x.rank,isActive:true}));});
   } else if(route==='asset') {
    const id=p.get('id')??'';if(!/^[a-z0-9][a-z0-9-]{1,99}$/.test(id))return Response.json({error:'Invalid asset identifier'},{status:400});
    result=await cached('asset:'+id,'Coinpaprika',120000,async signal=>{const d=await upstream('https://api.coinpaprika.com/v1/tickers/'+encodeURIComponent(id),false,signal);if(!d.quotes?.USD||!Number.isFinite(d.quotes.USD.price)||d.quotes.USD.price<=0)throw Error('No current price available for this catalog asset');return {id:d.id,name:d.name,symbol:d.symbol,rank:d.rank,price:d.quotes.USD.price,change:d.quotes.USD.percent_change_24h,marketCap:d.quotes.USD.market_cap,volume:d.quotes.USD.volume_24h,updatedAt:d.last_updated};});
   } else if(route==='markets') {
    result=await cached('markets','Coinpaprika',600000,async signal=>{const d=await upstream('https://api.coinpaprika.com/v1/tickers',false,signal);if(!Array.isArray(d))throw Error('Invalid market directory');return d.filter(x=>x.quotes?.USD&&+x.quotes.USD.price>0).map(x=>({id:x.id,symbol:x.symbol,name:x.name,rank:x.rank,price:x.quotes.USD.price,change:x.quotes.USD.percent_change_24h,change7d:x.quotes.USD.percent_change_7d,marketCap:x.quotes.USD.market_cap,volume:x.quotes.USD.volume_24h,updatedAt:x.last_updated})).sort((a,b)=>(a.rank||999999)-(b.rank||999999));});
   } else if(route==='instruments') {
    const venue=p.get('venue')??'binance';if(!['binance','coinbase'].includes(venue))return Response.json({error:'Invalid venue'},{status:400});
    result=await loadInstruments(venue,request.signal);
   } else if(route==='exchange-markets') {
    result=await cached('exchange-markets','Binance',30000,async signal=>{const [d,registry]=await Promise.all([upstream(`${B}/ticker/24hr`,false,signal),loadInstruments('binance',signal)]);if(!Array.isArray(d))throw Error('Invalid ticker response');const active=new Map(registry.data.map(x=>[x.symbol,x]));return d.filter(x=>active.has(x.symbol)&&+x.lastPrice>0).map(x=>({id:x.symbol,symbol:active.get(x.symbol).base,name:x.symbol,price:+x.lastPrice,change:+x.priceChangePercent,volume:+x.quoteVolume,high:+x.highPrice,low:+x.lowPrice,updatedAt:new Date(+x.closeTime).toISOString()})).sort((a,b)=>b.volume-a.volume);});
   } else if(route==='global'){try{result=await cached('global','CoinGecko',120000,async signal=>{const d=(await upstream('https://api.coingecko.com/api/v3/global',false,signal)).data;if(!d?.total_market_cap?.usd)throw Error('Invalid global data');return {marketCap:d.total_market_cap.usd,volume:d.total_volume.usd,change:d.market_cap_change_percentage_24h_usd,btcDominance:d.market_cap_percentage.btc,ethDominance:d.market_cap_percentage.eth,activeCoins:d.active_cryptocurrencies,updatedAt:new Date(d.updated_at*1000).toISOString()};});}catch{result=await cached('global-fallback','Coinpaprika',120000,async signal=>{const d=await upstream('https://api.coinpaprika.com/v1/global',false,signal);if(!Number.isFinite(d.market_cap_usd)||d.market_cap_usd<=0)throw Error('Invalid global fallback');return {marketCap:d.market_cap_usd,volume:d.volume_24h_usd,change:d.market_cap_change_24h,btcDominance:d.bitcoin_dominance_percentage,ethDominance:null,activeCoins:d.cryptocurrencies_number,updatedAt:new Date(d.last_updated*1000).toISOString()};});result.notice='CoinGecko unavailable; global statistics supplied by Coinpaprika.';}}
   else if(route==='chains')result=await cached('chains','DeFiLlama',300000,async signal=>{const d=await upstream('https://api.llama.fi/v2/chains',false,signal);if(!Array.isArray(d))throw Error('Invalid chain data');return d.filter(x=>Number.isFinite(x.tvl)&&x.tvl>0).map(x=>({name:x.name,symbol:x.tokenSymbol,tvl:x.tvl})).sort((a,b)=>b.tvl-a.tvl);});
   else if(route==='sentiment')result=await cached('sentiment','Alternative.me',3600000,async signal=>{const d=(await upstream('https://api.alternative.me/fng/?limit=1',false,signal)).data?.[0];if(!d||!Number.isFinite(+d.value))throw Error('Invalid sentiment');return {value:+d.value,label:d.value_classification,updatedAt:new Date(+d.timestamp*1000).toISOString()};});
   else if(route==='news')result=await cached('news','Publisher RSS',300000,async signal=>{const responses=await Promise.allSettled(sources.map(async s=>({source:s.name,items:parseNews(await upstream(s.url,true,signal),s.name)})));const articles=[],feeds=[];responses.forEach((r,i)=>{feeds.push({source:sources[i].name,ok:r.status==='fulfilled',count:r.status==='fulfilled'?r.value.items.length:0});if(r.status==='fulfilled')articles.push(...r.value.items);});const seen=new Set();const items=articles.filter(x=>relevantHeadline(x.title)&&!seen.has(x.url)&&seen.add(x.url)).sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0));if(!items.length)throw Error('No publisher news currently available');return {items,feeds};});
   else return Response.json({error:'Unknown API route'},{status:404});
   return Response.json(result,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch(e){throwIfAborted(request.signal);return Response.json({error:e.message||'Market provider unavailable',fetchedAt:new Date(now()).toISOString()},{status:e.status===503?503:502,headers:{'Cache-Control':'no-store',...(e.status===503?{'Retry-After':'2'}:{})}});}
 };
}
export const gateway=createGateway();
