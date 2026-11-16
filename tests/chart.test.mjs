import {test} from 'node:test';import assert from 'node:assert/strict';
import {TerminalChart} from '../src/chart.js';
test('switching instruments destroys the previous canvas before replacing its host',async()=>{
 let removed=false,replaced=false;const originalFetch=globalThis.fetch;
 const host={set innerHTML(v){assert.equal(removed,true,'old canvas must be removed before host replacement');replaced=true;}};
 const chart=new TerminalChart({host,workspace:{drawings:{}},save(){},onQuote(){},onSummary(){},onBook(){},onStatus(){},onDrawings(){}});
 chart.chart={remove(){removed=true;}};chart.build=()=>{};chart.connect=()=>{};chart.poll=()=>{};
 globalThis.fetch=async()=>Response.json({cache:'miss',provider:'Binance',fetchedAt:new Date().toISOString(),data:{bars:[{time:1,open:10,high:11,low:9,close:10,volume:1}]}});
 try{await chart.load();assert.equal(replaced,true);}finally{chart.dispose();globalThis.fetch=originalFetch;}
});
test('reconciliation fills missed intervals using authoritative candles',async()=>{
 const originalFetch=globalThis.fetch;const bar=t=>({time:t,open:10,high:11,low:9,close:10,volume:1});
 const chart=new TerminalChart({host:{},workspace:{drawings:{}},save(){},onQuote(){},onSummary(){},onBook(){},onStatus(){},onDrawings(){}});chart.bars=[bar(1000),bar(1120)];chart.updateSeries=()=>{};
 globalThis.fetch=async()=>Response.json({provider:'Binance',cache:'miss',fetchedAt:new Date().toISOString(),data:{bars:[bar(1000),bar(1060),bar(1120)]}});
 try{await chart.reconcile(chart.generation);assert.deepEqual(chart.bars.map(b=>b.time),[1000,1060,1120]);}finally{globalThis.fetch=originalFetch;chart.dispose();}
});
