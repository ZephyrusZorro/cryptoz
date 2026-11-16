import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGateway, parseNews } from '../server/gateway.js';

const req=(s)=>new Request('http://localhost/api/'+s);
test('rejects arbitrary upstreams, invalid symbols and invalid intervals before fetching',async()=>{
 let calls=0;const g=createGateway({fetcher:async()=>{calls++;throw Error('unexpected')}});
 for(const path of ['proxy?url=https://evil.test','candles?venue=binance&symbol=../../etc&interval=1h','candles?venue=evil&symbol=BTCUSDT&interval=1h','candles?venue=binance&symbol=BTCUSDT&interval=2z'])assert.ok((await g(req(path))).status>=400);
 assert.equal(calls,0);
});
test('coalesces requests and reports cache provenance',async()=>{
 let calls=0;const g=createGateway({fetcher:async()=>{calls++;await new Promise(r=>setTimeout(r,5));return Response.json({symbol:'BTCUSDT',lastPrice:'10'})}});
 const results=await Promise.all([g(req('ticker?venue=binance&symbol=BTCUSDT')),g(req('ticker?venue=binance&symbol=BTCUSDT'))]);
 assert.equal(calls,1);assert.equal(results[0].status,200);const body=await (await g(req('ticker?venue=binance&symbol=BTCUSDT'))).json();assert.equal(body.cache,'fresh');assert.equal(body.provider,'Binance');assert.ok(body.fetchedAt);
});
test('upstream errors are truthful and stale cache is labeled',async()=>{
 let now=100000,fail=false; const g=createGateway({now:()=>now,fetcher:async()=>{if(fail)return new Response('',{status:429});return Response.json({symbol:'BTCUSDT',lastPrice:'10'})}});
 await g(req('ticker?venue=binance&symbol=BTCUSDT'));now+=120000;fail=true;
 const b=await (await g(req('ticker?venue=binance&symbol=BTCUSDT'))).json();assert.equal(b.cache,'stale');assert.ok(b.warning);
 const r=await g(req('ticker?venue=binance&symbol=ETHUSDT'));assert.equal(r.status,502);assert.ok((await r.json()).error);
});
test('RSS parser strips markup, rejects unsafe URLs and deduplicates',()=>{
 const xml='<rss><channel><item><title><![CDATA[BTC &amp; ETH <b>rise</b>]]></title><link>https://decrypt.co/news</link><pubDate>Tue, 17 Nov 2026 10:00:00 GMT</pubDate></item><item><title>Bad</title><link>javascript:alert(1)</link></item></channel></rss>';
 const news=parseNews(xml,'Decrypt'); assert.equal(news.length,1);assert.equal(news[0].title,'BTC & ETH rise');assert.equal(news[0].source,'Decrypt');
});
test('bad provider candle payload is rejected rather than shown',async()=>{
 const g=createGateway({fetcher:async()=>Response.json({garbage:true})}); const r=await g(req('candles?venue=binance&symbol=BTCUSDT&interval=1h'));assert.equal(r.status,502);
});
test('exchange screen excludes inactive tickers and instruments outside the spot registry',async()=>{
 const g=createGateway({fetcher:async url=>Response.json(url.includes('exchangeInfo')?{symbols:[{symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true},{symbol:'OLDUSDT',baseAsset:'OLD',quoteAsset:'USDT',status:'BREAK'}]}:[{symbol:'BTCUSDT',lastPrice:'10',quoteVolume:'2',priceChangePercent:'1',closeTime:100000},{symbol:'OLDUSDT',lastPrice:'3',quoteVolume:'5',closeTime:100000}])});
 const r=await (await g(req('exchange-markets'))).json();assert.deepEqual(r.data.map(x=>x.id),['BTCUSDT']);
});
test('Coinbase quotes preserve the actual last-trade timestamp',async()=>{const when='2026-11-17T10:00:00Z';const g=createGateway({fetcher:async url=>Response.json(url.endsWith('/ticker')?{price:'100',time:when}:{last:'99',open:'90',high:'101',low:'89',volume:'1000'})});const r=await (await g(req('ticker?venue=coinbase&symbol=BTC-USD'))).json();assert.equal(r.data.observedAt,when);assert.equal(r.data.last,'100');});
