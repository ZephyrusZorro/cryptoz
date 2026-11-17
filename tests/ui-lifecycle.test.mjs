import test from 'node:test';import assert from 'node:assert/strict';
import {createDataLoader} from '../src/data-loader.js';import {refreshPage} from '../src/page-refresh.js';import {createDialogController} from '../src/dialog.js';
test('independent datasets notify the UI before a slow news request completes',async()=>{
 const pending={},updates=[],data={},loader=createDataLoader(key=>new Promise(r=>pending[key]=r),data,{}, {onChange:key=>updates.push(key)});const all=loader.load(['markets','news']);await Promise.resolve();pending.markets({data:[1]});await new Promise(r=>setImmediate(r));assert.deepEqual(updates,['markets']);assert.deepEqual(data.markets.data,[1]);assert.equal(loader.busy,true);pending.news({data:[]});await all;assert.equal(loader.busy,false);
});
test('refresh targets the active financial tool and propagates its completion',async()=>{
 const calls=[];let finish;const chart={refresh:()=>new Promise(r=>{calls.push('chart');finish=r;})};const pending=refreshPage({page:'terminal',terminal:chart,loadData:keys=>calls.push(keys)});assert.deepEqual(calls,['chart']);finish();await pending;
 await refreshPage({page:'compare',comparison:{refresh:async()=>calls.push('compare')},loadData:()=>calls.push('wrong')});assert.equal(calls.at(-1),'compare');
 await refreshPage({page:'news',loadData:async keys=>calls.push(keys)});assert.deepEqual(calls.at(-1),['news']);
});
test('dialogs make the background inert and restore focus after closing',async()=>{
 let focused='',listener;const button={isConnected:true,getClientRects:()=>[1],focus(){focused='trigger';}},first={disabled:false,getClientRects:()=>[1],focus(){focused='first';}},root={innerHTML:'',querySelectorAll:()=>[first]},background={inert:false};
 const doc={activeElement:button,body:{style:{overflow:''}},addEventListener(name,fn){listener=fn;},removeEventListener(){}};let closed=0;
 const dialog=createDialogController({root,background,document:doc,onClose:()=>closed++});dialog.open('Settings','<input>');await Promise.resolve();assert.equal(background.inert,true);assert.equal(focused,'first');listener({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});assert.equal(background.inert,false);assert.equal(focused,'trigger');assert.equal(closed,1);assert.equal(root.innerHTML,'');
});

test('overview refresh retries its benchmark alongside independent market datasets',async()=>{
 const calls=[];await refreshPage({page:'overview',loadData:async keys=>calls.push(keys),refreshBenchmark:async()=>calls.push('benchmark')});assert.ok(calls.includes('benchmark'));assert.ok(calls.some(x=>Array.isArray(x)&&x.includes('news')));
});
