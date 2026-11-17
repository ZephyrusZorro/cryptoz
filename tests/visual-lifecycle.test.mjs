import test from 'node:test';import assert from 'node:assert/strict';import {createVisualController} from '../src/visual-controller.js';import {createProviderCache} from '../server/cache.js';
test('market visualization updates preserve the existing canvas and dispose exactly once',()=>{
 const before=globalThis.ResizeObserver;globalThis.ResizeObserver=class{observe(){}disconnect(){}};let created=0,updated=0,disposed=0;
 try{const visual=createVisualController({},[{id:'btc',symbol:'BTC',marketCap:10,change:1}],{options:data=>data,init(){created++;return {setOption(){updated++;},dispose(){disposed++;},resize(){}};}});visual.update([{id:'btc',symbol:'BTC',marketCap:12,change:2}]);assert.equal(created,1);assert.equal(updated,2);visual.dispose();visual.dispose();assert.equal(disposed,1);visual.update([]);assert.equal(updated,2);}finally{globalThis.ResizeObserver=before;}
});
test('pending provider work is bounded and a synchronous loader error does not stick forever',async()=>{
 let now=100;const cache=createProviderCache({now:()=>now,maxPending:1}),c=new AbortController();let finish;const first=cache('a','Source',1,()=>new Promise(r=>finish=r),c.signal);await assert.rejects(cache('b','Source',1,async()=>2),/busy/);finish(1);await first;
 await assert.rejects(cache('x','Source',1,()=>{throw Error('Failed');}),/Failed/);now+=31000;assert.equal((await cache('x','Source',1,async()=>3)).data,3);
});
