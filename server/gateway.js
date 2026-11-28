import {createProviderCache} from './cache.js';
import {createInsights,insightSections} from './insights.js';
import {abortable,deadline,throwIfAborted} from '../src/async-task.js';
import {normalizeBook} from '../src/market-integrity.js';
import {asNumber} from '../src/numbers.js';
import { XMLParser } from 'fast-xml-parser';
import { normalizeCandles } from '../src/analytics.js';
import {RATES,readProviderRate} from '../src/currency-data.js';

const B='https://data-api.binance.vision/api/v3', C='https://api.exchange.coinbase.com';
const fiat=new Set(['USD','EUR','GBP','AUD','CAD','CHF','JPY','CNY','CNH','KRW','INR','BRL','TRY','RUB','UAH','PLN','ARS','IDR','MXN','ZAR']);
const intervals={'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400};
const headers={'User-Agent':'CRYPTOZ/1.0 public research terminal','Accept':'application/json, application/rss+xml, text/xml'};
const sources=[
 {name:'Federal Reserve',url:'https://www.federalreserve.gov/feeds/press_all.xml',tier:'official'},
 {name:'SEC',url:'https://www.sec.gov/news/pressreleases.rss',tier:'official'},
 {name:'The Block',url:'https://www.theblock.co/rss.xml',tier:'institutional'},
 {name:'Blockworks',url:'https://blockworks.co/feed',tier:'institutional'},
 {name:'Glassnode Insights',url:'https://insights.glassnode.com/rss/',tier:'research'},
 {name:'CoinMetrics',url:'https://coinmetrics.substack.com/feed',tier:'research'},
 {name:'DL News',url:'https://www.dlnews.com/arc/outboundfeeds/rss/',tier:'investigative'},
 {name:'The Defiant',url:'https://thedefiant.io/api/feed',tier:'investigative'},
 {name:'Unchained',url:'https://unchainedcrypto.com/feed/',tier:'institutional'},
 {name:'CoinDesk',url:'https://www.coindesk.com/arc/outboundfeeds/rss/',tier:'major'},
 {name:'Decrypt',url:'https://decrypt.co/feed',tier:'major'},
 {name:'CryptoSlate',url:'https://cryptoslate.com/feed/',tier:'major'},
 {name:'Cointelegraph',url:'https://cointelegraph.com/rss',tier:'major'},
 {name:'Bitcoin Magazine',url:'https://bitcoinmagazine.com/.rss/full/',tier:'major'},
];
const SOURCE_TIERS=new Map(sources.map(s=>[s.name,s.tier]));
const NEWS_WINDOWS=Object.freeze({
 latest:{maxAgeHours:Infinity,ttlMs:300000,label:'Live & 24h'},
 week:{maxAgeHours:168,ttlMs:900000,label:'Top of the week',queries:[
  '(Bitcoin OR Ethereum OR Solana OR crypto ETF OR BlackRock OR Coinbase OR Binance) when:7d',
  '(SEC crypto OR Federal Reserve OR FOMC OR stablecoin OR crypto hack OR Bitcoin reserve) when:7d',
 ]},
 month:{maxAgeHours:744,ttlMs:1800000,label:'Top of the month',queries:[
  '(Bitcoin OR Ethereum OR crypto ETF OR BlackRock OR Coinbase OR Tether OR Solana) when:30d',
  '(SEC crypto OR Fed rate OR GENIUS Act OR stablecoin bill OR crypto exploit OR Bitcoin treasury) when:30d',
 ]},
 year:{maxAgeHours:8784,ttlMs:3600000,label:'Top of the year',queries:[
  '(Bitcoin all-time high OR spot Bitcoin ETF OR Ethereum ETF OR BlackRock Bitcoin OR MicroStrategy) when:1y',
  '(SEC crypto OR GENIUS Act OR stablecoin law OR Federal Reserve crypto OR biggest crypto hack OR strategic Bitcoin reserve) when:1y',
 ]},
});
function inferPublisherTier(name){
 if(SOURCE_TIERS.has(name))return SOURCE_TIERS.get(name);
 const n=String(name??'').toLowerCase();
 if(/\b(sec|federal reserve|occ|cftc|treasury|europol|doj|fbi|bis|imf|ecb|\.gov)\b/.test(n))return 'official';
 if(/\b(glassnode|coinmetrics|messari|kaiko|chainalysis|arkham|nansen|defillama|vaneck|grayscale|galaxy|21shares|bitwise)\b/.test(n))return 'research';
 if(/\b(reuters|bloomberg|wall street journal|wsj|financial times|cnbc|barron|cme group|blackrock|fidelity|the block|blockworks|coindesk|unchained|forbes|fortune|yahoo finance|marketwatch)\b/.test(n))return 'institutional';
 if(/\b(dl news|the defiant|protos|web3 is going just great|coindesk)\b/.test(n))return 'investigative';
 return 'major';
}
export const relevantHeadline=title=>/\b(crypto|bitcoin|btc|ethereum|ether|eth|solana|sol|xrp|blockchain|stablecoin|defi|nft|token|altcoin|binance|coinbase|kraken|tether|usdt|usdc|wallet|trezor|ledger|satoshi|on-chain|onchain|web3|hyperliquid|ripple|dogecoin|doge|sec|cftc|fed|fomc|federal reserve|monetary policy|interest rate|rate cut|rate hike|inflation|treasury|cpi|pce|etf|digital asset|layer[- ]?2|l2|staking|airdrop|halving|validator|memecoin|perp|perpetual|liquidat|whale|genius act|clarity act)\b/i.test(title);
const IMPACT_RULES=[
 {weight:36,reason:'Macro catalyst',pattern:/\b(fomc|rate cut|rate hike|interest rate|cpi\b|pce\b|inflation|payroll|recession|tariff|strategic reserve|balance sheet|fed\s+(chair|holds|cuts|hikes|signals|minutes|policy|rate))\b/i},
 {weight:34,reason:'Security / liquidity',pattern:/\b(hack|hacked|exploit|drained|stolen|breach|depeg|insolven|bankrupt|halted withdrawals|liquidat|flash crash|rug pull|vulnerability|zero-day)\b/i},
 {weight:32,reason:'Regulatory / ETF',pattern:/\b(spot etf|etf (inflow|outflow|approv|fil|launch|record|flow|conversion)|sec\b|cftc\b|occ\b|lawsuit|enforcement|indict|sanction|subpoena|blackrock|fidelity|microstrategy|stablecoin (bill|law|act)|genius act|clarity act|mica\b|regulatory|charges\b|final rule)\b/i},
 {weight:22,reason:'Market mover',pattern:/\b(halving|hard fork|mainnet|all-time high|record high|\$\d+(?:\.\d+)?\s?(b|bn|m|billion|million)|whale|short squeeze|open interest|funding rate|delist|token unlock|treasury buys|institutional|futures)\b/i},
];
const TIER_WEIGHT={official:16,research:12,institutional:10,investigative:10,major:4};
export function scoreNewsImpact(item,nowMs=Date.now(),{window='latest'}={}){
 const title=String(item?.title??'');
 const tier=item?.tier??inferPublisherTier(item?.source);
 let catalyst=0,impactReason=null;
 for(const rule of IMPACT_RULES){
  if(rule.pattern.test(title)){
   catalyst+=rule.weight;
   if(!impactReason)impactReason=rule.reason;
  }
 }
 const sourceWeight=TIER_WEIGHT[tier]??4;
 const rawImpact=catalyst+sourceWeight;
 const publishedMs=Date.parse(item?.publishedAt);
 const ageHours=Number.isFinite(publishedMs)?Math.max(0,(nowMs-publishedMs)/3_600_000):72;
 if(window==='latest'){
  // Only fresh articles (< 7 days) carry High impact priority badges; stale archive items decay strongly
  const impact=ageHours>168?'normal':(rawImpact>=38?'high':rawImpact>=20?'medium':'normal');
  const freshness=Math.exp(-ageHours/32);
  const stalePenalty=ageHours>48?Math.min(55,(ageHours-48)*0.22):0;
  const priority=Math.round(((Math.min(68,catalyst)+sourceWeight+24)*(0.2+0.8*freshness)-stalePenalty)*10)/10;
  return {impact,impactReason:impact==='normal'?null:(impactReason??(tier==='official'?'Official release':tier==='research'?'Research brief':'Desk priority')),tier,priority};
 }
 // Time-windowed digest ranking (week / month / year): rank by structural impact & tier authority across the full window
 const maxHours=NEWS_WINDOWS[window]?.maxAgeHours??744;
 const impact=rawImpact>=36?'high':rawImpact>=20?'medium':'normal';
 const windowRecency=Math.exp(-ageHours/(maxHours*0.95));
 const priority=Math.round(((Math.min(82,catalyst)+sourceWeight*1.35+18)*(0.72+0.28*windowRecency))*10)/10;
 return {impact,impactReason:impact==='normal'?null:(impactReason??(tier==='official'?'Official release':tier==='research'?'Research brief':'Top story')),tier,priority};
}
function headlineTokens(title){return new Set(String(title).toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>3));}
function isNearDuplicate(a,b){
 if(a.size<3||b.size<3)return false;
 let shared=0;for(const w of a)if(b.has(w))shared++;
 return shared/(a.size+b.size-shared)>=0.66;
}
function dedupePrioritizedNews(items,{boostCorroborated=false}={}){
 const kept=[],tokens=[];
 for(const item of items){
  const t=headlineTokens(item.title);
  const matchIdx=tokens.findIndex(prev=>isNearDuplicate(prev,t));
  if(matchIdx>=0){
   const winner=kept[matchIdx];
   if(winner.source!==item.source){
    winner._sources??=new Set([winner.source]);
    if(!winner._sources.has(item.source)){
     winner._sources.add(item.source);
     winner.corroboratedBy=winner._sources.size;
     if(boostCorroborated)winner.priority=Math.round((winner.priority+6.5)*10)/10;
    }
   }
   continue;
  }
  kept.push({...item});tokens.push(t);
 }
 for(const item of kept)delete item._sources;
 if(boostCorroborated)kept.sort((a,b)=>(b.priority-a.priority)||((Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)));
 return kept;
}
const textValue=x=>typeof x==='object'?(x?.['#text']??''):String(x??'');
const strip=s=>textValue(s).replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|#39|#\d+|#x[0-9a-f]+);/gi,e=>{const m={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"};if(m[e])return m[e];const n=e.startsWith('&#x')?parseInt(e.slice(3),16):parseInt(e.slice(2),10);return Number.isFinite(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/\s+/g,' ').trim().slice(0,500);
const OFFICIAL_RELEVANT=/\b(fomc|federal funds|monetary policy|interest rate|rate cut|rate hike|inflation|cpi\b|pce\b|balance sheet|treasury|liquidity|crypto|bitcoin|ethereum|digital asset|stablecoin|etf\b|blockchain|defi|token|virtual currency|bitcoin|spot\s+bitcoin|spot\s+ether|genius act|clarity act)\b/i;
function relevantNewsItem(item){
 if(!relevantHeadline(item.title))return false;
 if(item.tier==='official')return OFFICIAL_RELEVANT.test(item.title);
 return true;
}
function extractLink(link){
 if(Array.isArray(link)){
  const pick=link.find(l=>l&&(!l['@_rel']||l['@_rel']==='alternate'))??link[0];
  return textValue(pick?.['@_href']??pick);
 }
 return textValue(link?.['@_href']??link);
}
export function parseNews(xml,source,{googleNews=false,limit=25}={}) {
 const doc=new XMLParser({ignoreAttributes:false,processEntities:true,htmlEntities:true}).parse(xml);let items=doc?.rss?.channel?.item??doc?.feed?.entry??[];if(!Array.isArray(items))items=[items];
 const seen=new Set();return items.flatMap(item=>{let title=strip(item.title),pub=source;if(googleNews){const extracted=strip(item.source);if(extracted){pub=extracted;const suffix=' - '+extracted;if(title.endsWith(suffix))title=title.slice(0,-suffix.length).trim();}else{const dash=title.lastIndexOf(' - ');if(dash>24){pub=title.slice(dash+3).trim()||source;title=title.slice(0,dash).trim();}}}const url=extractLink(item.link),date=Date.parse(textValue(item.pubDate??item.published??item.updated));try{const u=new URL(url);if(u.protocol!=='https:'||!title||seen.has(u.href))return [];seen.add(u.href);return [{title,url:u.href,source:pub,publishedAt:Number.isFinite(date)?new Date(date).toISOString():null}];}catch{return [];}}).slice(0,limit);
}
export function createGateway({fetcher=fetch,now=Date.now}={}) {
 const runCached=createProviderCache({now});
 const insights=createInsights({upstream:async(url,text,signal)=>{
  const timing=deadline(signal,6500);
  try{
   const response=await abortable(fetcher(url,{headers,signal:timing.signal,redirect:'error'}),timing.signal);
   if(!response.ok)throw Error('Upstream HTTP '+response.status);
   return await abortable(text?response.text():response.json(),timing.signal);
  }finally{timing.dispose();}
 },parseNews,now});
 async function upstream(url,xml=false,signal,timeoutMs=12000){
  const maxAttempts=timeoutMs>=8000?2:1;
  let lastError;
  for(let attempt=0;attempt<maxAttempts;attempt++){
   throwIfAborted(signal);
   const timing=deadline(signal,attempt===0?Math.min(timeoutMs,9000):timeoutMs);
   try{
    const response=await abortable(fetcher(url,{headers,signal:timing.signal}),timing.signal);
    if(!response.ok){
     const err=Error(`Upstream HTTP ${response.status}`);
     err.status=response.status;
     if(response.status>=400&&response.status<500&&response.status!==429)throw err;
     throw err;
    }
    return await abortable(xml?response.text():response.json(),timing.signal);
   }catch(err){
    throwIfAborted(signal);
    lastError=err;
    if(err.status&&err.status>=400&&err.status<500&&err.status!==429)throw err;
    if(attempt+1<maxAttempts)await new Promise(r=>setTimeout(r,220));
   }finally{timing.dispose();}
  }
  throw lastError;
 }
 async function loadInstruments(venue,requestSignal){return runCached(`instruments:${venue}`,venue==='binance'?'Binance':'Coinbase',3600000,async signal=>{const d=await upstream(venue==='binance'?`${B}/exchangeInfo`:`${C}/products`,false,signal);if(venue==='binance'){if(!Array.isArray(d.symbols))throw Error('Invalid instruments');return d.symbols.filter(x=>x.status==='TRADING'&&x.quoteAsset==='USDT'&&!fiat.has(x.baseAsset)&&x.isSpotTradingAllowed!==false).map(x=>({symbol:x.symbol,base:x.baseAsset,quote:x.quoteAsset,venue}));}if(!Array.isArray(d))throw Error('Invalid instruments');return d.filter(x=>x.quote_currency==='USD'&&!fiat.has(x.base_currency)&&x.status==='online').map(x=>({symbol:x.id,base:x.base_currency,quote:'USD',venue}));},requestSignal);}
 return async function handle(request) {
  const cached=(key,provider,ttl,loader)=>runCached(key,provider,ttl,loader,request.signal);
  throwIfAborted(request.signal);const u=new URL(request.url),route=u.pathname.replace(/^\/api\//,''),p=u.searchParams;
  if(request.method!=='GET')return Response.json({error:'Read-only API'},{status:405});
  try {
   let result;
   if(route==='fx'){
    const pair=p.get('pair');
    if(p.size!==1||!Object.hasOwn(RATES,pair))return Response.json({error:'Invalid currency pair'},{status:400});
    const source=RATES[pair];
    result=await cached('fx:'+pair,source.provider,source.refresh,async signal=>{
     const value=readProviderRate(pair,await upstream(source.url,false,signal),now());
     if(!value)throw Error('Currency reference unavailable or expired');
     return {pair,rate:value.rate,observedAt:value.observedAt};
    });
   }else if(route==='trade-quote'){
    const venue=p.get('venue'),symbol=p.get('symbol'),binance=venue==='binance';
    const validSymbol=binance?/^[\p{L}\p{N}]{1,25}USDT$/u:/^[A-Z0-9]{1,20}-USD$/;
    if(!['binance','coinbase'].includes(venue)||!symbol||!validSymbol.test(symbol)
       ||p.size!==2||p.getAll('venue').length!==1||p.getAll('symbol').length!==1){
     return Response.json({error:'Invalid trade quote market'},{status:400});
    }
    const path=binance?`${B}/trades?symbol=${encodeURIComponent(symbol)}&limit=1`:`${C}/products/${symbol}/ticker`;
    result=await cached(`trade-quote:${venue}:${symbol}`,binance?'Binance':'Coinbase',5000,async signal=>{
     const payload=await upstream(path,false,signal);
     const trade=binance?(Array.isArray(payload)&&payload.length===1?payload[0]:null):payload;
     const price=Number(trade?.price),observed=binance?trade?.time:Date.parse(trade?.time);
     if(!Number.isFinite(price)||price<=0||!Number.isSafeInteger(observed)||observed<=0||observed>now()+5000){
      throw Error('Invalid last-trade observation');
     }
     return {venue,symbol,price,observedAt:new Date(observed).toISOString()};
    });
   } else if(route==='insights'){
    const section=p.get('section')??'derivatives';
    if(!insightSections.has(section)||p.size>1||[...p.keys()].some(key=>key!=='section'))return Response.json({error:'Invalid Insights section'},{status:400});
    result=await insights(section,request.signal);
   } else if(['candles','book','ticker'].includes(route)) {
    const venue=p.get('venue')??'binance',symbol=p.get('symbol')??'BTCUSDT',interval=p.get('interval')??'1h';
    if(!['binance','coinbase'].includes(venue)||!(venue==='binance'?/^[\p{L}\p{N}]{3,30}$/u:/^[A-Z0-9]{1,20}-USD$/).test(symbol)||!Object.hasOwn(intervals,interval))return Response.json({error:'Invalid venue, instrument or interval'},{status:400});
    const rawBefore=route==='candles'?p.get('before'):null,before=rawBefore===null?null:Number(rawBefore);
    if(before!==null&&(!/^\d{9,10}$/.test(rawBefore)||p.getAll('before').length!==1||before<1230768000||before>Math.floor(now()/1000)||before%intervals[interval]!==0))return Response.json({error:'Invalid candle history cursor'},{status:400});
    const page=before!==null,step=interval==='4h'?3600:intervals[interval],pageStart=page?Math.max(1230768000,before-step*(interval==='4h'?296:299)):0;
    const provider=venue==='binance'?'Binance':'Coinbase',path=venue==='binance'?`${B}/${route==='candles'?'klines':route==='book'?'depth':'ticker/24hr'}?symbol=${symbol}${route==='candles'?`&interval=${interval}&limit=500${page?'&endTime='+(before*1000-1):''}`:route==='book'?'&limit=50':''}`:`${C}/products/${symbol}/${route==='candles'?`candles?granularity=${step}${page?`&start=${encodeURIComponent(new Date(pageStart*1000).toISOString())}&end=${encodeURIComponent(new Date((before-1)*1000).toISOString())}`:''}`:route==='book'?'book?level=2':'ticker'}`;
    result=await cached(`${route}:${venue}:${symbol}:${route==='candles'?interval+':'+(before??'latest'):''}`,provider,route==='candles'?(page?300000:15000):route==='book'?5000:10000,async signal=>{
     const d=await upstream(path,false,signal);
     if(route==='candles') {
      if(!Array.isArray(d))throw Error('Invalid candle response');
      let bars=normalizeCandles(d.map(x=>venue==='binance'?{time:Math.floor(+x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]}:{time:+x[0],low:+x[1],high:+x[2],open:+x[3],close:+x[4],volume:+x[5]}));
      if(page)bars=bars.filter(b=>b.time<before&&(venue!=='coinbase'||b.time>=pageStart));
      if(venue==='coinbase'&&interval==='4h'){const m=new Map();for(const b of bars){const t=Math.floor(b.time/14400)*14400,prev=m.get(t);m.set(t,prev?{...prev,high:Math.max(prev.high,b.high),low:Math.min(prev.low,b.low),close:b.close,volume:prev.volume+b.volume}:{...b,time:t});}const currentBucket=Math.floor(now()/1000/14400)*14400;const counts=new Map();for(const b of bars){const t=Math.floor(b.time/14400)*14400;counts.set(t,(counts.get(t)??0)+1);}bars=[...m.values()].filter(b=>counts.get(b.time)===4||b.time===currentBucket);}
      if(!bars.length&&!page)throw Error('No valid candles for this instrument');return {venue,symbol,interval,bars,...(page?{before}: {})};
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
    result=await cached('exchange-markets','Binance',30000,async signal=>{
     const [tickers,registry]=await Promise.all([upstream(`${B}/ticker/24hr`,false,signal),loadInstruments('binance',signal)]);
     if(!Array.isArray(tickers))throw Error('Invalid ticker response');
     const active=new Map(registry.data.map(item=>[item.symbol,item]));
     const quotes=new Map(),maxTime=now()+5000;
     for(const ticker of tickers){
      const instrument=active.get(ticker?.symbol);
      if(!instrument)continue;
      const id=instrument.symbol,price=asNumber(ticker.lastPrice),change=asNumber(ticker.priceChangePercent);
      const volume=asNumber(ticker.quoteVolume),time=asNumber(ticker.closeTime);
      if(!(price>0)||change===null||volume===null||volume<0||!Number.isSafeInteger(time)
       ||time<=0||time>maxTime||(quotes.get(id)?.time??0)>=time)continue;
      const high=asNumber(ticker.highPrice),low=asNumber(ticker.lowPrice);
      quotes.set(id,{id,symbol:instrument.base,name:id,price,change,volume,
       high:high>=price?high:null,low:low>0&&low<=price?low:null,time,updatedAt:new Date(time).toISOString()});
     }
     if(!quotes.size)throw Error('No valid Binance spot observations');
     return [...quotes.values()].sort((a,b)=>b.volume-a.volume);
    });
   } else if(route==='global'){try{result=await cached('global','CoinGecko',120000,async signal=>{const d=(await upstream('https://api.coingecko.com/api/v3/global',false,signal)).data;if(!d?.total_market_cap?.usd)throw Error('Invalid global data');return {marketCap:d.total_market_cap.usd,volume:d.total_volume.usd,change:d.market_cap_change_percentage_24h_usd,btcDominance:d.market_cap_percentage.btc,ethDominance:d.market_cap_percentage.eth,activeCoins:d.active_cryptocurrencies,updatedAt:new Date(d.updated_at*1000).toISOString()};});}catch{result=await cached('global-fallback','Coinpaprika',120000,async signal=>{const d=await upstream('https://api.coinpaprika.com/v1/global',false,signal);if(!Number.isFinite(d.market_cap_usd)||d.market_cap_usd<=0)throw Error('Invalid global fallback');return {marketCap:d.market_cap_usd,volume:d.volume_24h_usd,change:d.market_cap_change_24h,btcDominance:d.bitcoin_dominance_percentage,ethDominance:null,activeCoins:d.cryptocurrencies_number,updatedAt:new Date(d.last_updated*1000).toISOString()};});result.notice='CoinGecko unavailable; global statistics supplied by Coinpaprika.';}}
   else if(route==='chains')result=await cached('chains','DeFiLlama',300000,async signal=>{const d=await upstream('https://api.llama.fi/v2/chains',false,signal);if(!Array.isArray(d))throw Error('Invalid chain data');return d.filter(x=>Number.isFinite(x.tvl)&&x.tvl>0).map(x=>({name:x.name,symbol:x.tokenSymbol,tvl:x.tvl})).sort((a,b)=>b.tvl-a.tvl);});
   else if(route==='sentiment')result=await cached('sentiment','Alternative.me',3600000,async signal=>{
    const rows=(await upstream('https://api.alternative.me/fng/?limit=30',false,signal)).data;
    const d=Array.isArray(rows)?rows[0]:null;
    if(!d||!Number.isFinite(+d.value))throw Error('Invalid sentiment');
    const history=rows.filter(r=>r&&Number.isFinite(+r.value)&&Number.isFinite(+r.timestamp)).map(r=>({value:+r.value,label:r.value_classification,updatedAt:new Date(+r.timestamp*1000).toISOString()}));
    const current=+d.value;
    const zone=v=>v<=25?'Extreme Fear':v<=45?'Fear':v<=55?'Neutral':v<=75?'Greed':'Extreme Greed';
    const currentZone=zone(current);
    let streak=0;for(const h of history){if(zone(h.value)===currentZone)streak++;else break;}
    return {
     value:current,label:d.value_classification,updatedAt:new Date(+d.timestamp*1000).toISOString(),
     yesterday:history[1]?.value??null,weekAgo:history[7]?.value??null,monthAgo:history.at(-1)?.value??null,
     extremeStreak:streak,history:history.slice(0,30).reverse(),
    };
   });
   else if(route==='news'){
    const win=p.get('window')??'latest';
    if(!Object.hasOwn(NEWS_WINDOWS,win)||p.size>(p.has('window')?1:0))return Response.json({error:'Invalid news window'},{status:400});
    const cfg=NEWS_WINDOWS[win];
    result=await cached(`news:${win}`,win==='latest'?'Publisher RSS':'Publisher RSS + News Index',cfg.ttlMs,async signal=>{
     const currentNow=now();
     const maxAgeMs=cfg.maxAgeHours*3_600_000;
     const directTasks=sources.map(async s=>({source:s.name,tier:s.tier,items:parseNews(await upstream(s.url,true,signal,5500),s.name)}));
     const digestTasks=(cfg.queries??[]).map(async (q,idx)=>{
      const gUrl='https://news.google.com/rss/search?q='+encodeURIComponent(q)+'&hl=en-US&gl=US&ceid=US:en';
      return {source:`News Index (${idx+1})`,tier:'institutional',items:parseNews(await upstream(gUrl,true,signal,6500),'News Index',{googleNews:true,limit:55})};
     });
     const responses=await Promise.allSettled([...directTasks,...digestTasks]);
     const articles=[],feeds=[];
     responses.forEach((r,i)=>{
      const name=i<sources.length?sources[i].name:`Digest Query ${i-sources.length+1}`;
      const tier=i<sources.length?sources[i].tier:'institutional';
      feeds.push({source:name,tier,ok:r.status==='fulfilled',count:r.status==='fulfilled'?r.value.items.length:0});
      if(r.status==='fulfilled'){
       for(const item of r.value.items){
        const pubMs=Date.parse(item.publishedAt);
        if(Number.isFinite(maxAgeMs)&&Number.isFinite(pubMs)){
         const age=currentNow-pubMs;
         if(age>maxAgeMs||age<-86_400_000)continue;
        }
        const itemTier=i<sources.length?tier:inferPublisherTier(item.source);
        articles.push({...item,...scoreNewsImpact({...item,tier:itemTier},currentNow,{window:win})});
       }
      }
     });
     const seen=new Set();
     const filtered=articles
      .filter(x=>relevantNewsItem(x)&&!seen.has(x.url)&&seen.add(x.url))
      .sort((a,b)=>(b.priority-a.priority)||((Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)));
     const items=dedupePrioritizedNews(filtered,{boostCorroborated:win!=='latest'});
     if(!items.length)throw Error('No publisher news currently available');
     return {window:win,windowLabel:cfg.label,items,feeds};
    });
   }
   else return Response.json({error:'Unknown API route'},{status:404});
   return Response.json(result,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch(e){throwIfAborted(request.signal);return Response.json({error:e.message||'Market provider unavailable',fetchedAt:new Date(now()).toISOString()},{status:e.status===503?503:502,headers:{'Cache-Control':'no-store',...(e.status===503?{'Retry-After':'2'}:{})}});}
 };
}
export const gateway=createGateway();
