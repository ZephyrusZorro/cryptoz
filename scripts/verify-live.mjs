import {gateway} from '../server/gateway.js';
const paths=['asset-search?q=fet','asset?id=fet-artificial-superintelligence-alliance','asset?id=wban-wrapped-banano','markets','global','sentiment','news','chains','instruments?venue=binance','instruments?venue=coinbase','exchange-markets','candles?venue=binance&symbol=BTCUSDT&interval=1h','book?venue=binance&symbol=BTCUSDT','ticker?venue=binance&symbol=BTCUSDT','candles?venue=coinbase&symbol=ETH-USD&interval=4h','trade-quote?venue=binance&symbol=BTCUSDT','trade-quote?venue=coinbase&symbol=BTC-USD','insights?section=derivatives','insights?section=onchain','insights?section=macro'];
const results=await Promise.all(paths.map(async path=>{
 const start=Date.now(),response=await gateway(new Request('http://localhost/api/'+path)),body=await response.json(),data=body.data;
 const rows=Array.isArray(data)?data:data?.bars??data?.items??data?.bids;
 const feeds=path.startsWith('insights?')&&data?.feeds&&Object.fromEntries(Object.entries(data.feeds).map(([id,feed])=>[id,feed.status]));
 const valid=path.startsWith('trade-quote')?Number.isFinite(data?.price)&&data.price>0&&Number.isFinite(Date.parse(data.observedAt)):feeds?Object.values(feeds).some(s=>['observed','dated','snapshot','stale'].includes(s)):path==='news'?data?.items?.length>0:response.ok;
 return {route:path,status:response.status,provider:body.provider,count:rows?.length,feeds,valid,error:body.error,ms:Date.now()-start};
}));
console.log(JSON.stringify(results,null,2));
if(results.some(r=>r.status!==200||!r.valid))process.exitCode=1;
