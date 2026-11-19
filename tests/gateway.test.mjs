import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGateway, parseNews, relevantHeadline, scoreNewsImpact } from '../server/gateway.js';

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
test('global statistics fall back to an explicitly attributed independent provider',async()=>{const g=createGateway({fetcher:async url=>url.includes('coingecko')?new Response('',{status:429}):Response.json({market_cap_usd:1000,volume_24h_usd:100,bitcoin_dominance_percentage:50,market_cap_change_24h:1,cryptocurrencies_number:2000,last_updated:100000})});const r=await (await g(req('global'))).json();assert.equal(r.provider,'Coinpaprika');assert.equal(r.data.marketCap,1000);});
test('news stays relevant to crypto and macro market catalysts',()=>{assert.equal(relevantHeadline('Bitcoin miner rewards disrupted'),true);assert.equal(relevantHeadline('Fed interest rate decision'),true);assert.equal(relevantHeadline('Alibaba launches a downloadable AI assistant'),false);});
test('crypto instrument directory excludes ordinary fiat base currencies',async()=>{const g=createGateway({fetcher:async()=>Response.json({symbols:[{symbol:'EURUSDT',baseAsset:'EUR',quoteAsset:'USDT',status:'TRADING'},{symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT',status:'TRADING'}]})});const r=await(await g(req('instruments?venue=binance'))).json();assert.deepEqual(r.data.map(x=>x.base),['BTC']);});

test('all twelve venue/timeframe combinations normalize genuine OHLCV shapes',async()=>{for(const venue of ['binance','coinbase'])for(const interval of ['1m','5m','15m','1h','4h','1d']){const g=createGateway({fetcher:async()=>Response.json(venue==='binance'?[[1700000000000,'10','12','9','11','4']]:Array.from({length:8},(_,i)=>[1699992000+i*3600,9,12,10,11,4]))});const r=await g(req(`candles?venue=${venue}&symbol=${venue==='binance'?'BTCUSDT':'BTC-USD'}&interval=${interval}`));const b=await r.json();assert.equal(r.status,200,venue+' '+interval);assert.ok(b.data.bars.length);assert.equal(b.data.bars[0].open,10);assert.equal(b.data.bars[0].close,11);}});
test('inherited timeframe names are rejected before upstream requests',async()=>{let calls=0;const g=createGateway({fetcher:async()=>{calls++;return Response.json([])}});for(const interval of ['constructor','__proto__','toString'])assert.equal((await g(req('candles?venue=binance&symbol=BTCUSDT&interval='+interval))).status,400);assert.equal(calls,0);});

test('four-hour aggregation excludes incomplete historical source buckets',async()=>{const base=Math.floor(1700000000/14400)*14400,times=[base+3600,base+7200,...Array.from({length:4},(_,i)=>base+14400+i*3600)];const g=createGateway({now:()=>((base+10*14400)*1000),fetcher:async()=>Response.json(times.map(t=>[t,9,12,10,11,2]))});const b=await(await g(req('candles?venue=coinbase&symbol=BTC-USD&interval=4h'))).json();assert.equal(b.data.bars.length,1);assert.equal(b.data.bars[0].time,base+14400);assert.equal(b.data.bars[0].volume,8);});

test('news impact scoring prioritizes fresh market-moving headlines over stale archives',()=>{
 const now=Date.parse('2026-11-19T12:00:00Z');
 const fed=scoreNewsImpact({title:'Federal Reserve announces FOMC interest rate cut decision',source:'Federal Reserve',publishedAt:'2026-11-19T11:30:00Z'},now);
 const hack=scoreNewsImpact({title:'Major DeFi protocol drained in $120M bridge exploit',source:'DL News',publishedAt:'2026-11-19T11:45:00Z'},now);
 const minor=scoreNewsImpact({title:'Bitcoin community hosts local weekend meetup',source:'Decrypt',publishedAt:'2026-11-19T11:50:00Z'},now);
 const stale=scoreNewsImpact({title:'Bitcoin tops $80,000 as Clarity Act nears Senate floor with Fed chair',source:'DL News',publishedAt:'2026-05-04T10:00:00Z'},now);
 assert.equal(fed.impact,'high');
 assert.equal(hack.impact,'high');
 assert.equal(minor.impact,'normal');
 assert.equal(stale.impact,'normal');
 assert.ok(fed.priority>minor.priority);
 assert.ok(hack.priority>minor.priority);
 assert.ok(minor.priority>stale.priority,'fresh headline must outrank 6-month-old archive');
});
