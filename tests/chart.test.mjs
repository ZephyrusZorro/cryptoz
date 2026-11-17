import {test} from 'node:test';import assert from 'node:assert/strict';
import {TerminalChart,parseStreamBar} from '../src/chart.js';
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

test('malformed live candles never reach the financial chart',()=>{assert.equal(parseStreamBar({e:'kline'}),null);assert.equal(parseStreamBar({k:{t:100000,o:'10',h:'5',l:'9',c:'11',v:'2'}}),null);assert.deepEqual(parseStreamBar({k:{t:100000,o:'10',h:'12',l:'9',c:'11',v:'2'}}),{time:100,open:10,high:12,low:9,close:11,volume:2});});

test('live indicator refresh reuses series and preserves pane sizing',()=>{let adds=0,removes=0,heights=0;const pane={setHeight(){heights++;}};const chart=new TerminalChart({host:{clientHeight:500},workspace:{drawings:{}},save(){},onQuote(){},onSummary(){},onBook(){},onStatus(){},onDrawings(){}});chart.chart={addSeries(){adds++;return {setData(){},createPriceLine(){}}},removeSeries(){removes++;},panes(){return [pane,pane]}};chart.bars=Array.from({length:80},(_,i)=>({time:6000+i*60,open:100+i,high:102+i,low:99+i,close:101+i,volume:1}));chart.indicatorSeries=[];chart.oscSeries=[];chart.studySeries=new Map();chart.draw=()=>{};chart.renderIndicators();const count=adds,sizing=heights;chart.bars.at(-1).close+=.1;chart.renderIndicators();assert.equal(adds,count);assert.equal(removes,0);assert.equal(heights,sizing);});
