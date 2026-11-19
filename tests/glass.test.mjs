import test from 'node:test';
import assert from 'node:assert/strict';
import {palette,normalizeAppearance} from '../src/theme.js';
import {parseMarketTicker,acceptTicker,parsePartialBook,MarketStream} from '../src/live-market.js';
import {signalSnapshot} from '../src/signals.js';
import {TerminalChart} from '../src/chart.js';
import {moveSelection,reveal} from '../src/motion.js';
test('appearance validates imported values and separates semantic candle colors',()=>{
 assert.deepEqual(normalizeAppearance({theme:'evil',motion:'spin'}),{theme:'dark',motion:'auto'});
 assert.equal(palette('invalid'),palette('dark'));
 for(const t of ['dark','light']){assert.notEqual(palette(t).up,palette(t).down);assert.notEqual(palette(t).text,palette(t).panel);}
});
test('Liquid Glass slides the selected tab at its previous size without fading the page backdrop',t=>{
 const dataset={material:'glass'};
 const previousDocument=globalThis.document,previousMatchMedia=globalThis.matchMedia;
 globalThis.document={documentElement:{dataset}};
 globalThis.matchMedia=()=>({matches:false});
 t.after(()=>{globalThis.document=previousDocument;globalThis.matchMedia=previousMatchMedia;});

 const calls=[];
 const surface={
  getBoundingClientRect:()=>({left:120,top:15,width:100,height:40}),
  animate:frames=>{calls.push(frames);return {cancel(){}};}
 };
 const previous={left:20,top:10,width:80,height:40};
 reveal(surface);
 moveSelection(previous,surface);
 assert.ok(calls[0].every(frame=>!Object.hasOwn(frame,'opacity')));
 assert.equal(calls[1][0].transform,'translate(-100px, -5px) scale(0.8, 1)');
 assert.equal(calls[1].at(-1).transform,'none');
 dataset.material='solid';
 reveal(surface);
 assert.equal(calls[2][0].opacity,.68);
 dataset.motion='reduced';
 moveSelection(previous,surface);
 reveal(surface);
 assert.equal(calls.length,3);
});
const raw={s:'BTCUSDT',c:'100',P:'2',q:'3000',h:'105',l:'90',E:10000};
test('live quotes reject unknown symbols, invalid prices and time reversal',()=>{
 const registry=new Set(['BTCUSDT']);const q=parseMarketTicker(raw,registry);
 assert.equal(q.price,100);assert.equal(q.symbol,'BTCUSDT');
 assert.equal(parseMarketTicker({...raw,s:'FAKEUSDT'},registry),null);
 for(const c of ['NaN','Infinity','-1','0',''])assert.equal(parseMarketTicker({...raw,c},registry),null);
 assert.equal(parseMarketTicker({...raw,E:1e20},registry),null);
 assert.equal(acceptTicker(q,{...q,time:9999}),false);assert.equal(acceptTicker(q,{...q,time:10000}),false);assert.equal(acceptTicker(q,{...q,time:10001}),true);
});
test('partial depth snapshots validate sorted uncrossed positive levels',()=>{
 const good={lastUpdateId:10,bids:[['100','2'],['99','3']],asks:[['101','1'],['102','2']]};
 assert.equal(parsePartialBook(good).bids[0][0],100);
 assert.equal(parsePartialBook({...good,asks:[['98','1']]}),null);
 assert.equal(parsePartialBook({...good,bids:[['NaN','1']]}),null);
 assert.equal(parsePartialBook({...good,bids:[['99','1'],['100','1']]}),null);
});
const bars=Array.from({length:101},(_,i)=>({time:3600*(i+1),open:100+i,close:101+i,high:102+i,low:99+i,volume:10}));
test('signals exclude the active candle and require sufficient completed history',()=>{
 const now=101*3600*1000;const a=signalSnapshot(bars,3600,now);
 assert.equal(a.count,100);assert.equal(a.close,200);assert.equal(a.time,100*3600);
 assert.deepEqual(a,signalSnapshot([...bars.slice(0,-1),{...bars.at(-1),close:999999,high:999999}],3600,now));
 assert.equal(signalSnapshot(bars.slice(0,20),3600,now).ready,false);
 assert.equal(a.trend,'Uptrend');assert.ok(a.rsi>=0&&a.rsi<=100);assert.ok(a.atr>0);
});
test('drawing overlays export actual palette colors rather than undefined anchors',()=>{
 const workspace={drawings:{'binance:BTCUSDT:1h':[{id:'test',type:'horizontal',points:[{time:3600,price:100}]}]}};
 const chart=new TerminalChart({host:{clientWidth:800,clientHeight:500},workspace});
 chart.chart={timeScale:()=>({timeToCoordinate:()=>100,width:()=>730}),panes:()=>[{getHeight:()=>500}]};chart.series={priceToCoordinate:()=>100};chart.svg={setAttribute(){},style:{}};
 chart.draw();assert.ok(chart.svg.innerHTML.includes(palette('dark').gold));assert.ok(!chart.svg.innerHTML.includes('undefined'));
});
test('market stream batches real mini tickers, ignores stale/reversed data and prunes removed instruments',()=>{
 const original=globalThis.WebSocket;globalThis.WebSocket=class {constructor(url){this.url=url;}close(){}};let batch,status;
 const stream=new MarketStream({onBatch:x=>batch=x,onStatus:x=>status=x});
 try{stream.setRegistry([{venue:'binance',symbol:'BTCUSDT',quote:'USDT'}]);assert.ok(stream.socket.url.includes('!miniTicker@arr'));
 const now=Date.now(),mini={...raw,P:undefined,o:'98',E:now};stream.socket.onmessage({data:JSON.stringify([mini])});assert.equal(batch,undefined);stream.flush();assert.equal(batch.get('BTCUSDT').price,100);assert.ok(Math.abs(batch.get('BTCUSDT').change-2.04081632653)<1e-8);assert.equal(status.state,'streaming');
 stream.socket.onmessage({data:JSON.stringify([{...mini,c:'99',E:now-1}])});assert.equal(stream.quotes.get('BTCUSDT').price,100);
 stream.socket.onmessage({data:JSON.stringify([{...mini,c:'103',E:now-60000}])});assert.equal(stream.quotes.get('BTCUSDT').price,100);
 stream.lastMessage=now-16000;stream.report();assert.equal(status.state,'delayed');
 stream.setRegistry([]);assert.equal(stream.quotes.size,0);assert.equal(!!stream.fresh('BTCUSDT'),false);
 }finally{stream.dispose();globalThis.WebSocket=original;}
});
test('flat closes have undefined Bollinger position rather than a lower-band signal',()=>{
 const flat=bars.map(b=>({...b,open:100,close:100,high:101,low:99}));assert.equal(signalSnapshot(flat,3600,Date.now()).bandPosition,null);
});
test('unchanged valid partial-depth sequences remain fresh observations',()=>{
 const original=globalThis.WebSocket;globalThis.WebSocket=class {close(){}};let books=0;
 const chart=new TerminalChart({host:{},workspace:{drawings:{}},onBook(){books++;},onStatus(){}});
 try{chart.connect(chart.generation);const message={data:JSON.stringify({lastUpdateId:10,bids:[['100','2']],asks:[['101','2']]})};chart.socket.onmessage(message);chart.lastBookAt=0;chart.socket.onmessage(message);assert.equal(books,2);assert.ok(chart.lastBookAt>0);}finally{chart.dispose();globalThis.WebSocket=original;}
});
