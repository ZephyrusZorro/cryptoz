import test from 'node:test';import assert from 'node:assert/strict';
import {createApiClient} from '../src/api.js';import {createGateway} from '../server/gateway.js';
test('cancelled requests stop before fetching and cancellation reaches direct fallback',async()=>{
 let fetched=0,directSignal,ready;const started=new Promise(r=>ready=r);
 const client=createApiClient({fetcher:async()=>{fetched++;return Response.json({error:'Restricted'},{status:502});},loadDirect:async()=>async(path,{signal})=>{directSignal=signal;ready();return new Promise(()=>{});}});
 const pre=new AbortController();pre.abort();await assert.rejects(client.api('markets',{signal:pre.signal}),{name:'AbortError'});assert.equal(fetched,0);
 const c=new AbortController(),request=client.api('markets',{signal:c.signal});await started;c.abort();await assert.rejects(request,{name:'AbortError'});assert.ok(directSignal.aborted);
});
test('hosted validation errors never trigger another provider request',async()=>{
 let direct=0;const client=createApiClient({fetcher:async()=>Response.json({error:'Invalid symbol'},{status:400}),loadDirect:async()=>async()=>{direct++;}});
 await assert.rejects(client.api('ticker?venue=binance&symbol=bad'),/Invalid symbol/);assert.equal(direct,0);
});
test('older requests cannot overwrite a newer transport observation',async()=>{
 let release;const client=createApiClient({fetcher:path=>String(path).includes('BTC')?new Promise(r=>release=r):Promise.resolve(Response.json({provider:'New',data:{},fetchedAt:'2026-11-17T00:00:00Z'}))});
 const first=client.api('ticker?symbol=BTCUSDT');await client.api('ticker?symbol=ETHUSDT');release(Response.json({provider:'Old',data:{}}));await first;assert.equal(client.telemetry.get('ticker').provider,'New');
});
test('one cancelled subscriber does not abort a shared gateway request',async()=>{
 let release,calls=0,upstreamSignal;const g=createGateway({fetcher:(url,{signal})=>{calls++;upstreamSignal=signal;return new Promise(r=>release=r);}});
 const a=new AbortController(),b=new AbortController(),url='http://test/api/ticker?venue=binance&symbol=BTCUSDT';
 const one=g(new Request(url,{signal:a.signal})),two=g(new Request(url,{signal:b.signal}));a.abort();await assert.rejects(one,{name:'AbortError'});assert.equal(upstreamSignal.aborted,false);release(Response.json({lastPrice:'100',closeTime:Date.now()}));assert.equal((await two).status,200);assert.equal(calls,1);
});
test('aborting the last subscriber aborts upstream without poisoning later retries',async()=>{
 let calls=0,firstSignal;const g=createGateway({fetcher:(url,{signal})=>{calls++;if(calls===1){firstSignal=signal;return new Promise(()=>{});}return Promise.resolve(Response.json({lastPrice:'100',closeTime:Date.now()}));}});const c=new AbortController(),url='http://test/api/ticker?venue=binance&symbol=BTCUSDT';
 const pending=g(new Request(url,{signal:c.signal}));c.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(firstSignal.aborted,true);assert.equal((await g(new Request(url))).status,200);assert.equal(calls,2);
});
test('invalid upstream order books are rejected before reaching a chart',async()=>{
 const g=createGateway({fetcher:async()=>Response.json({bids:[[99,-5]],asks:[[101,1]]})});assert.equal((await g(new Request('http://test/api/book?venue=binance&symbol=BTCUSDT'))).status,502);
});
