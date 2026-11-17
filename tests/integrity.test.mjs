import test from 'node:test';import assert from 'node:assert/strict';
import {mergeCandleHistory,parseLiveQuote,normalizeBook} from '../src/market-integrity.js';
const bar=(time,close)=>({time,open:10,high:Math.max(14,close),low:Math.min(8,close),close,volume:2});
test('history fills gaps while protecting every candle changed after the request started',()=>{
 const current=[bar(6000,12),bar(9600,13)],snapshot=[bar(2400,10),bar(6000,10)];
 assert.deepEqual(mergeCandleHistory(current,snapshot,new Map([[6000,2],[9600,3]]),1).map(b=>[b.time,b.close]),[[2400,10],[6000,12],[9600,13]]);
 assert.equal(mergeCandleHistory(current,[bar(6000,11)],new Map(),1).find(b=>b.time===6000).close,11);
 assert.equal(mergeCandleHistory(current,[bar(6000,9)],new Map(),1,{stale:true}).find(b=>b.time===6000).close,12);
});
test('live quotes reject negative, wrong-identity, stale, future and reversed observations',()=>{
 const now=Date.now(),instrument={venue:'binance',symbol:'BTCUSDT'},tick={s:'BTCUSDT',c:'100',h:'110',l:'90',P:'2',E:now};
 const good=parseLiveQuote(tick,instrument,null,now);assert.equal(good.price,100);
 for(const changed of [{c:'-1'},{s:'ETHUSDT'},{E:now-40000},{E:now+10000},{E:now-1}])assert.equal(parseLiveQuote({...tick,...changed},instrument,good,now),null);
 assert.equal(parseLiveQuote({...tick,c:'101',E:now+1},instrument,good,now).price,101);
 assert.equal(parseLiveQuote({product_id:'ETH-USD',price:'2',time:new Date(now).toISOString()},{venue:'coinbase',symbol:'BTC-USD'},null,now),null);
});
test('order books cannot contain negative, crossed or unsorted levels',()=>{
 assert.ok(normalizeBook({bids:[[99,2],[98,3]],asks:[[101,2],[102,4]]}));
 for(const b of [{bids:[[99,-1]],asks:[[101,2]]},{bids:[[102,1]],asks:[[101,2]]},{bids:[[98,1],[99,1]],asks:[[101,2]]}])assert.equal(normalizeBook(b),null);
});
