import test from 'node:test';import assert from 'node:assert/strict';
import {planRisk} from '../src/analytics.js';import {TerminalChart} from '../src/chart.js';
const input={equity:10000,riskPercent:1,entry:100,stop:95,target:110,feePercent:.1};
test('risk plans reject overflow rather than returning Infinity or NaN',()=>{
 assert.throws(()=>planRisk({...input,equity:1e308,entry:1e308,stop:9e307,target:1.1e308,riskPercent:100}),/range|large|finite/i);
});
test('spot capital requirement includes the opening fee',()=>{
 const result=planRisk({...input,equity:1000,riskPercent:6.91525,feePercent:1});assert.ok(result.notional<1000);assert.ok(result.entryCost>1000);assert.equal(result.capitalExceeded,true);
});
test('break-even win rate uses net outcomes and is undefined for a fee-negative target',()=>{
 const result=planRisk({...input,feePercent:0});assert.equal(result.breakEvenWinRate,100/3);assert.equal(planRisk({...input,target:100.01}).breakEvenWinRate,null);
});
test('current-price assistance rejects stale, mismatched and future observations',()=>{
 const chart=new TerminalChart({host:{},workspace:{drawings:{}},save(){},onQuote(){},onSummary(){},onBook(){},onStatus(){},onDrawings(){}}),now=Date.now();
 const quote={price:100,source:'REST',venue:'binance',symbol:'BTCUSDT',updatedAt:new Date(now).toISOString(),stale:false};chart.quote=quote;assert.equal(chart.currentQuote(now)?.price,100);
 for(const change of [{stale:true},{symbol:'ETHUSDT'},{venue:'coinbase'},{updatedAt:new Date(now-31000).toISOString()},{updatedAt:new Date(now+6000).toISOString()},{price:-1}]){chart.quote={...quote,...change};assert.equal(chart.currentQuote(now),null);}
});
