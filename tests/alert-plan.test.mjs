import test from 'node:test';import assert from 'node:assert/strict';import {appendPriceAlert} from '../src/alert-plan.js';
const instrument={venue:'binance',symbol:'BTCUSDT',base:'BTC',quote:'USDT'};
test('new alerts accept tiny positive prices but reject invalid inputs before changing workspace',()=>{
 const current={alerts:[]},next=appendPriceAlert(current,instrument,{direction:'above',target:'1e-10'},'test-alert');assert.equal(next.alerts[0].target,1e-10);assert.equal(current.alerts.length,0);
 for(const target of ['0','-1','Infinity','',false])assert.throws(()=>appendPriceAlert(current,instrument,{direction:'above',target},'test-alert'),/positive|price/i);
 assert.throws(()=>appendPriceAlert(current,instrument,{direction:'wrong',target:1},'test-alert'),/direction/i);
});
test('new alerts enforce monitored and stored limits without silently dropping history',()=>{
 assert.throws(()=>appendPriceAlert({alerts:Array.from({length:10},()=>({active:true}))},instrument,{direction:'above',target:1},'test-alert'),/10 active/);
 assert.throws(()=>appendPriceAlert({alerts:Array.from({length:100},()=>({active:false}))},instrument,{direction:'above',target:1},'test-alert'),/100 stored/);
});
