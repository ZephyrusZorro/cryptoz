import test from 'node:test';import assert from 'node:assert/strict';
import {createDataLoader} from '../src/data-loader.js';
test('an independent market request runs during a pending homepage request',async()=>{
 const pending={},calls=[],data={},errors={};const loader=createDataLoader(k=>{calls.push(k);return new Promise(r=>{pending[k]=r;});},data,errors);
 const home=loader.load(['markets','news']);const exchange=loader.load(['exchange']);const again=loader.load(['exchange']);await Promise.resolve();
 assert.deepEqual(calls,['markets','news','exchange']);pending.exchange({data:[1]});await exchange;await again;assert.deepEqual(data.exchange.data,[1]);assert.equal(loader.busy,true);
 pending.markets({data:[2]});pending.news({data:[3]});await home;assert.equal(loader.busy,false);
});
test('failed refresh retains labeled stale data and can be retried',async()=>{
 const data={news:{data:[1],cache:'miss'}},errors={};let fail=true;const loader=createDataLoader(async()=>{if(fail)throw Error('Unavailable');return {data:[2],cache:'miss'};},data,errors);
 await loader.load(['news']);assert.equal(data.news.cache,'stale');assert.equal(errors.news,'Unavailable');fail=false;await loader.load(['news']);assert.equal(errors.news,undefined);assert.deepEqual(data.news.data,[2]);
});
