import test from 'node:test';
import assert from 'node:assert/strict';
import {benchmarkWindow} from '../src/dashboard.js';

const candles=(count,step)=>Array.from({length:count},(_,i)=>({
 time:1700006400+i*step,open:100+i,close:100+i,low:99+i,high:101+i,volume:1
}));

test('dashboard presets retrieve meaningful historical intervals and compare exact 24-hour timestamps',()=>{
 const daily=candles(400,86400);
 const year=benchmarkWindow(daily,'1y');
 assert.equal(year.interval,'1d');
 assert.equal(year.bars.length,365);
 assert.equal(year.bars[0].time,daily[35].time);
 assert.equal(year.change,(499/498-1)*100);
 const hours=candles(30,3600);
 assert.equal(benchmarkWindow(hours,'24h').bars.length,24);
 assert.equal(benchmarkWindow(hours.filter((_,i)=>i!==5),'24h').change,null);
});
