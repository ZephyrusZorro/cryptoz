import test from 'node:test';import assert from 'node:assert/strict';import {TerminalChart} from '../src/chart.js';
const bar=(time,close)=>({time,open:10,high:14,low:8,close,volume:2});
const make=(extra={})=>new TerminalChart({host:{},workspace:{drawings:{}},save(){},onQuote(){},onSummary(){},onBook(){},onStatus(){},onDrawings(){},...extra});
test('a pending poll cannot roll back live candles received while it was in flight',async()=>{
 const fetchBefore=globalThis.fetch;let resolveHistory;const chart=make();chart.bars=[bar(6000,10)];chart.updateSeries=()=>{};
 globalThis.fetch=async path=>String(path).includes('candles?')?new Promise(r=>{resolveHistory=r;}):Response.json({data:{lastPrice:'10',observedAt:new Date().toISOString(),bids:[[9,1]],asks:[[11,1]]},fetchedAt:new Date().toISOString(),cache:'miss'});
 try{const poll=chart.poll(chart.generation);chart.bars=[bar(6000,12),bar(9600,13)];chart.liveRevision=2;chart.barRevisions=new Map([[6000,1],[9600,2]]);resolveHistory(Response.json({data:{bars:[bar(6000,10)]},cache:'miss'}));await poll;assert.deepEqual(chart.bars.map(b=>[b.time,b.close]),[[6000,12],[9600,13]]);}finally{chart.dispose();globalThis.fetch=fetchBefore;}
});
test('terminal socket rejects reversed and negative quote messages',()=>{
 const before=globalThis.WebSocket,quotes=[];globalThis.WebSocket=class{close(){}};const chart=make({onQuote:q=>quotes.push(q)});const now=Date.now();
 try{chart.connect(chart.generation);for(const [price,time] of [['100',now],['95',now-1],['-5',now+1]])chart.socket.onmessage({data:JSON.stringify({e:'24hrTicker',s:'BTCUSDT',c:price,E:time,h:'110',l:'90',P:'1'})});assert.equal(quotes.length,1);assert.equal(quotes[0].price,100);}finally{chart.dispose();globalThis.WebSocket=before;}
});
test('live price updates use incremental chart update rather than replacing all data',()=>{
 const chart=make();let updates=0,replacements=0;chart.bars=[bar(6000,12)];chart.series={update(){updates++;},setData(){replacements++;}};chart.seriesFirstTime=6000;chart.seriesLastTime=6000;chart.renderIndicators=()=>{};chart.notifyWindow=()=>{};chart.updateSeries({live:true});assert.equal(updates,1);assert.equal(replacements,0);
});
test('older kline events cannot reverse the currently forming candle',()=>{
 const before=globalThis.WebSocket;globalThis.WebSocket=class{close(){}};const chart=make();chart.updateSeries=()=>{};const now=Date.now(),time=Math.floor(now/3600000)*3600;
 try{chart.connect(chart.generation);for(const [close,event] of [['12',now],['11',now-1]])chart.socket.onmessage({data:JSON.stringify({e:'kline',E:event,k:{s:'BTCUSDT',i:'1h',t:time*1000,o:'10',h:'14',l:'8',c:close,v:'2',x:false}})});assert.equal(chart.bars.at(-1).close,12);}finally{chart.dispose();globalThis.WebSocket=before;}
});

test('loading another instrument resets stream freshness before REST recovery',async()=>{
 const chart=make();chart.lastStream=Date.now();chart.fetch=async()=>{throw Error('no history');};chart.host={innerHTML:''};await chart.load({venue:'coinbase',symbol:'ETH-USD',base:'ETH',quote:'USD'});assert.equal(chart.freshStream(),false);chart.dispose();
});
