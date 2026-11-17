import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeSearch,matchesAsset,rankAssets,catalogQuery,createLatestSearch,mergeAssets} from '../src/asset-search.js';
import {createGateway} from '../server/gateway.js';
import {newsWindow,classifyHeadline} from '../src/news-window.js';
const fet={id:'fet-artificial-superintelligence-alliance',name:'Artificial Superintelligence Alliance',symbol:'FET',rank:128};
test('Fetch.ai legacy names, punctuation and current identity find FET',()=>{
 for(const q of ['fetch ai','Fetch.ai','FETCH-AI','FET','artificial superintelligence','superintelligence alliance'])assert.ok(matchesAsset(fet,q),q);
 assert.equal(normalizeSearch(' Bitcoin / USDT '),'bitcoin usdt');assert.ok(matchesAsset({base:'BTC',symbol:'BTCUSDT',quote:'USDT'},'btc/usdt'));
 assert.equal(matchesAsset({name:'Fetchr',symbol:'FETCHR'},'fetch ai'),false);
 assert.equal(matchesAsset({id:'other-fet',name:'Unrelated token',symbol:'FET'},'Fetch.ai'),false);
});
test('query terms are matched across fields; exact ticker ranks before partial',()=>{
 assert.ok(matchesAsset({name:'Bitcoin',symbol:'BTC'},'bitcoin btc'));
 assert.deepEqual(rankAssets([{id:'fetish',name:'Other',symbol:'FETISH'},fet],'fet').map(x=>x.id),[fet.id,'fetish']);
 assert.equal(catalogQuery('fetch.ai'),'fet');assert.equal(catalogQuery('x'.repeat(200)).length,80);
});
test('verified provider ID aliases merge while unrelated duplicate tickers remain separate',()=>{
 const merged=mergeAssets([{...fet,id:'fetch-ai',price:1}],[fet,{id:'other-fet',name:'Unrelated',symbol:'FET'}]);
 assert.equal(merged.length,2);assert.equal(merged[0].price,1);
});
test('a late provider response cannot replace a newer query or a closed search',async()=>{
 const pending=[];const shown=[];const s=createLatestSearch({request:q=>new Promise(r=>pending.push({q,r})),onResult:r=>shown.push(r)});
 const a=s.run('btc'),b=s.run('eth');pending[1].r(['ETH']);await b;pending[0].r(['BTC']);await a;assert.deepEqual(shown,[['ETH']]);
 const c=s.run('fet');s.cancel();pending[2].r(['FET']);await c;assert.deepEqual(shown,[['ETH']]);
});
test('catalog and quote gateway validates identifiers and bounds before fetching',async()=>{
 let calls=0;const g=createGateway({fetcher:async()=>{calls++;return Response.json({})}});
 for(const route of ['asset-search?q=x','asset-search?q='+encodeURIComponent('x'.repeat(81)),'asset?id=../../etc','asset?id='+encodeURIComponent('https://evil.test')])assert.equal((await g(new Request('http://test/api/'+route))).status,400);
 assert.equal(calls,0);
});
test('catalog search keeps active identities and caches requests without fabricating quotes',async()=>{
 let calls=0;const g=createGateway({fetcher:async url=>{calls++;assert.match(url,/coinpaprika.com\/v1\/search\?/);return Response.json({currencies:[{...fet,is_active:true},{id:'old-fetch',name:'Old',symbol:'FET',is_active:false}]})}});
 const request=()=>new Request('http://test/api/asset-search?q=fet');const r=await(await g(request())).json();assert.equal(r.data.length,1);assert.equal(r.data[0].id,fet.id);assert.equal(r.data[0].price,undefined);await g(request());assert.equal(calls,1);
});
test('news topics combine publishers rather than splitting the feed by provider',()=>{
 const items=[{title:'SEC proposes crypto rules',source:'CoinDesk'},{title:'Crypto law approved',source:'The Block'},{title:'Bitcoin price rises',source:'Decrypt'}];
 assert.equal(classifyHeadline(items[0].title),'POLICY');assert.equal(newsWindow(items,{topic:'POLICY'}).total,2);assert.equal(newsWindow(items).total,3);
});
