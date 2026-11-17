import test from 'node:test';
import assert from 'node:assert/strict';
import {createGateway} from '../server/gateway.js';
import {TerminalChart} from '../src/chart.js';
import {historyCursor} from '../src/chart-window.js';
const NOW=1794873600000,B=1794787200;
const k=t=>[t*1000,10,12,9,11,3];
const c=t=>[t,9,12,10,11,3];
const bar=t=>({time:t,open:10,high:12,low:9,close:11,volume:3});
const url=(s='')=>new Request('https://local/api/candles?venue=binance&symbol=BTCUSDT&interval=1h'+s);
test('Binance historical pages use exclusive cursors, isolate caches and reject invalid boundaries',async()=>{
 const calls=[];const gateway=createGateway({now:()=>NOW,fetcher:async raw=>{
  const u=new URL(raw);calls.push(u);return Response.json([k(B-7200),k(B-3600),k(B)]);}});
 assert.equal((await gateway(url('&before=nope'))).status,400);
 assert.equal((await gateway(url('&before='+(B+1)))).status,400);
 await gateway(url());const older=await (await gateway(url('&before='+B))).json();
 assert.deepEqual(older.data.bars.map(b=>b.time),[B-7200,B-3600]);
 assert.equal(calls[1].searchParams.get('endTime'),String(B*1000-1));
 await gateway(url('&before='+B));assert.equal(calls.length,2);
 const empty=await (await gateway(url('&before='+(B-10800)))).json();assert.deepEqual(empty.data.bars,[]);
});
test('Coinbase 4h pages cap hours, keep complete aligned buckets and do not overlap',async()=>{
 const calls=[];const gateway=createGateway({now:()=>NOW,fetcher:async raw=>{
  const u=new URL(raw);calls.push(u);return Response.json([c(B),c(B-3600),c(B-7200),c(B-10800),c(B-14400),c(B-21600)]);}});
 const response=await gateway(new Request('https://local/api/candles?venue=coinbase&symbol=BTC-USD&interval=4h&before='+B));const payload=await response.json();
 assert.equal(response.status,200);assert.deepEqual(payload.data.bars.map(b=>b.time),[B-14400]);
 const params=calls[0].searchParams,start=Date.parse(params.get('start')),end=Date.parse(params.get('end'));
 assert.equal(end,B*1000-1000);assert.ok((end-start)/3600000<300);assert.equal(params.get('granularity'),'3600');
});
const terminal=()=>new TerminalChart({host:{},workspace:{drawings:{}},save(){},onQuote(){},onBook(){},onSummary(){},onStatus(){},onDrawings(){}});
test('a prepended page restores the same bar indexes and cannot evict newer streaming state',async()=>{
 const chart=terminal();chart.bars=[bar(B),bar(B+3600)];chart.series={setData(){}};chart.renderIndicators=()=>{};
 let range={from:-2,to:2};chart.chart={timeScale:()=>({getVisibleLogicalRange:()=>range,setVisibleLogicalRange:r=>{range=r;}})};
 chart.fetch=async()=>({data:{bars:[bar(B-7200),bar(B-3600)]}});
 await chart.loadOlder({automatic:true});
 assert.deepEqual(chart.bars.map(b=>b.time),[B-7200,B-3600,B,B+3600]);
 assert.deepEqual(range,{from:0,to:4});
 const latest=chart.bars.at(-1);chart.applyHistory({data:{bars:[latest]}},0);
 assert.equal(chart.bars.length,4);assert.equal(chart.bars.at(-1).time,latest.time);
});
test('older failed requests can retry and obsolete responses cannot alter the new view',async()=>{
 const chart=terminal();chart.bars=[bar(B)];chart.updateSeries=()=>{};
 chart.fetch=async()=>{throw Error('temporary');};await chart.loadOlder();assert.equal(chart.historyStatus,'error');
 let resolve;chart.fetch=()=>new Promise(r=>resolve=r);const old=chart.loadOlder();chart.generation++;chart.bars=[bar(B+3600)];resolve({data:{bars:[bar(B-3600)]}});await old;
 assert.deepEqual(chart.bars,[bar(B+3600)]);
});

test('UTC archive dates validate calendar, future and timeframe boundaries',()=>{
 assert.equal(historyCursor('2024-02-30',3600,NOW/1000),null);
 assert.equal(historyCursor('2028-01-01',3600,NOW/1000),null);
 assert.equal(historyCursor('2024-01-15',14400,NOW/1000),Date.parse('2024-01-16T00:00:00Z')/1000);
});
test('archive load is isolated from the stream and only retains closed evidence',async()=>{
 const chart=terminal(),paths=[];let opened=0,s='';chart.status=x=>{s=x;};chart.build=()=>{};chart.connect=()=>opened++;
 chart.fetch=async url=>{paths.push(url);return {data:{bars:[bar(B-3600),bar(B)]},cache:'miss',fetchedAt:new Date(NOW).toISOString()};};
 await chart.load(chart.instrument,'1h',{before:B});
 assert.match(paths[0],new RegExp('before='+B));assert.equal(s,'archive');assert.equal(opened,0);
 assert.deepEqual(chart.studyBars.map(b=>b.time),[B-3600]);chart.dispose();
});
test('crossing a close while an upstream request is in flight does not confirm that candle',()=>{
 const chart=terminal(),start=(B+3599)*1000;
 const cut=chart.snapshotCutoff({fetchedAt:new Date((B+3601)*1000).toISOString()},start);
 chart.observeStudyBars([bar(B-3600),bar(B)],cut);
 assert.deepEqual(chart.studyBars.map(b=>b.time),[B-3600]);chart.dispose();
});
