import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ema, sma, rsi, bollinger, macd, atr, vwap, heikinAshi, normalizeCandles, planRisk, technicalSummary } from '../src/analytics.js';

const bars = Array.from({length:80}, (_,i)=>({time:1000+i*60,open:i+99,high:i+102,low:i+98,close:i+100,volume:10}));
test('SMA and EMA warm up without inventing history',()=>{
 assert.deepEqual(sma([1,2,3,4,5],3),[null,null,2,3,4]);
 assert.deepEqual(ema([1,2,3,4,5],3),[null,null,2,3,4]);
});
test('Wilder RSI handles rising, falling and flat series',()=>{
 assert.equal(rsi(bars.map(x=>x.close),14).at(-1),100);
 assert.equal(rsi(bars.map(x=>-x.close),14).at(-1),0);
 assert.equal(rsi(Array(30).fill(10),14).at(-1),50);
 assert.equal(rsi([1,2],14).at(-1),null);
});
test('RSI matches independent published Wilder worksheet example',()=>{
 const v=[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64];
 assert.ok(Math.abs(rsi(v,14)[14]-70.464135)<0.00001);
});
test('Bollinger uses population standard deviation and MACD is causal',()=>{
 const b=bollinger([1,2,3],3,2); assert.equal(b.middle[2],2); assert.ok(Math.abs(b.upper[2]-(2+2*Math.sqrt(2/3)))<1e-9);
 const short=macd(bars.slice(0,60).map(x=>x.close));const full=macd(bars.map(x=>x.close));assert.equal(short.histogram.at(-1),full.histogram[59]);
});
test('ATR, VWAP and Heikin Ashi use actual OHLCV',()=>{
 assert.equal(atr(bars,14).at(-1),4);
 assert.ok(vwap(bars).at(-1)>100);
 const h=heikinAshi(bars); assert.equal(h[0].close,(99+102+98+100)/4); assert.equal(h[0].open,99.5);
});
test('candles are sorted, deduplicated and invalid OHLC is removed',()=>{
 assert.deepEqual(normalizeCandles([bars[1],bars[0],bars[1],{...bars[2],high:0}]),bars.slice(0,2));
});
test('risk sizing supports long/short and rejects unsafe plans',()=>{
 assert.equal(planRisk({equity:10000,riskPercent:1,entry:100,stop:95,target:110,side:'long',feePercent:0}).quantity,20);
 assert.equal(planRisk({equity:10000,riskPercent:1,entry:100,stop:105,target:90,side:'short',feePercent:0}).rewardRisk,2);
 assert.throws(()=>planRisk({equity:1,riskPercent:1,entry:100,stop:100,target:110,side:'long'}));
 assert.throws(()=>planRisk({equity:1,riskPercent:1,entry:100,stop:90,target:110,side:'short'}));
 assert.throws(()=>planRisk({equity:1,riskPercent:101,entry:100,stop:90,target:110,side:'long'}));
});
test('fees reduce quantity and reward/risk; insufficient history is explicit',()=>{
 const p=planRisk({equity:10000,riskPercent:1,entry:100,stop:95,target:110,side:'long',feePercent:.1}); assert.ok(p.quantity<20);assert.ok(p.rewardRisk<2);
 assert.equal(technicalSummary(bars.slice(0,5)).ready,false);
 assert.equal(technicalSummary(bars).ready,true);
});
