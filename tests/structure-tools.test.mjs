import assert from 'node:assert/strict';
import test from 'node:test';
import {structureTools, previousPeriodLevels, peakVolumeVwap} from '../src/structure-tools.js';
const T=1700000040,step=60;
const feed=Array.from({length:80},(_,i)=>{const x=100+Math.sin(i*Math.PI/4)*2;return {time:T+i*step,open:x,close:x,high:x+1,low:x-1,volume:10+i};});
test('anchored VWAP ignores the forming bar and starts on the largest closed volume',()=>{
 const bars=feed.slice(0,22).map((bar,i)=>({...bar,volume:i===19?40:i===21?400:1}));
 const result=peakVolumeVwap(bars,step,bars[21].time);
 assert.equal(result.series.length,2);
 assert.equal(result.anchor,bars[19].time);
 assert.equal(result.series[0].value,bars[19].close);
 assert.ok(Math.abs(result.series[1].value-(40*bars[19].close+bars[20].close)/41)<1e-10);
 assert.equal(peakVolumeVwap(bars.filter((_,i)=>i!==10),step,bars[21].time),null);
});
test('profile accounts for selected candle volume and excludes forming or future data',()=>{
 const edge=feed.at(-1).time+step,one=structureTools(feed,step,edge);
 const next={time:edge,open:1000,close:1000,high:1000,low:1000,volume:1e10};
 assert.deepEqual(structureTools([...feed,next],step,edge),one);
 assert.ok(Math.abs(one.profile.total-feed.reduce((a,b)=>a+b.volume,0))<1e-6);
 assert.equal(one.profile.levels.length,3);
});
test('swing clusters require multiple confirmed pivots and stop at a gap',()=>{
 const sample=structureTools(feed,step,feed.at(-1).time+step);
 assert.ok(sample.zones.levels.length>0);
 for(const x of sample.zones.levels){assert.ok(x.anchors.length>=2);assert.ok(x.anchors.every(a=>a.confirmedAt-a.time===3*step));}
 const gap=feed.filter((_,i)=>i!==70);
 assert.equal(structureTools(gap,step,feed.at(-1).time+step).profile,null);
});

test('previous day levels use the complete UTC day and begin with the next session',()=>{
 const start=Date.parse('2026-11-16T00:00:00Z')/1000,hour=3600,day=24*hour;
 const bars=Array.from({length:28},(_,i)=>({time:start+i*hour,open:100,high:i===6?112:104,low:i===10?84:96,close:i===23?101:100,volume:5}));
 const visible=start+day+2*hour;
 const result=previousPeriodLevels(bars,hour,visible,visible,'prev-day');
 assert.deepEqual(result.levels.map(level=>[level.name,level.price]),[['High',112],['Low',84],['Close',101]]);
 assert.ok(result.guides.every(guide=>guide.points[0].time===start+day));
 assert.equal(previousPeriodLevels(bars.filter((_,i)=>i!==3),hour,visible,visible,'prev-day'),null);
 const pivots=previousPeriodLevels(bars,hour,visible,visible,'daily-pivots');
 assert.deepEqual(pivots.levels.map(level=>level.name),['Pivot','Resistance 1','Support 1']);
 const pivot=(112+84+101)/3;
 assert.deepEqual(pivots.levels.map(level=>level.price),[pivot,2*pivot-84,2*pivot-112]);
 assert.ok(pivots.guides.every(guide=>guide.points[0].time===start+day));
});

test('weekly levels need a complete Monday-to-Sunday UTC week',()=>{
 const day=86400,start=Date.parse('2026-11-09T00:00:00Z')/1000;
 const bars=Array.from({length:9},(_,i)=>({time:start+i*day,open:100,high:i===7?200:103+i,low:91+i,close:100,volume:5}));
 const visible=start+7*day;
 const result=previousPeriodLevels(bars,day,visible,visible,'prev-week');
 assert.deepEqual(result.levels.map(level=>level.price),[109,91,100]);
 assert.equal(previousPeriodLevels(bars,day,visible,visible-1,'prev-week'),null);
 assert.equal(previousPeriodLevels(bars.slice(1),day,visible,visible,'prev-week'),null);
});

test('ATR-scaled swing clustering attaches percent distance from latest close and volume-profile distances',()=>{
 const sample=structureTools(feed,step,feed.at(-1).time+step);
 assert.ok(sample.zones?.levels?.length>0);
 for(const level of sample.zones.levels){
  assert.ok(Number.isFinite(level.distancePct));
  assert.ok(['support','resistance'].includes(level.role));
 }
 assert.ok(sample.profile.levels.every(level=>Number.isFinite(level.distancePct)));
});

test('new analytical overlays detect unmitigated FVG, order blocks, ATR channels and BOS/CHoCH causally',()=>{
 const bars=Array.from({length:60},(_,i)=>{
  const base=100+Math.sin(i*0.4)*3;
  return {time:T+i*step,open:base,close:base,high:base+1,low:base-1,volume:20};
 });
 // Inject clear bearish origin candle followed by sharp bullish displacement + FVG
 bars[44]={time:T+44*step,open:101,close:99,high:101.2,low:98.8,volume:30};
 bars[45]={time:T+45*step,open:99.2,close:109.5,high:110,low:99,volume:120};
 bars[46]={time:T+46*step,open:109.5,close:111,high:112,low:106.5,volume:80};
 for(let i=47;i<60;i++){
  const p=111+(i-47)*0.3;
  bars[i]={time:T+i*step,open:p,close:p+0.2,high:p+0.8,low:p-0.4,volume:30};
 }
 const edge=bars.at(-1).time+step;
 const result=structureTools(bars,step,edge);
 assert.ok(result.fvg?.levels?.some(lv=>lv.side==='bullish'&&lv.bottom===101.2&&lv.top===106.5));
 assert.ok(result['order-blocks']?.levels?.some(lv=>lv.side==='demand'&&lv.bottom===98.8));
 assert.equal(result['atr-bands']?.levels?.length,5);
 assert.ok(result.structure?.pivots?.length>=3);
 assert.ok(result.structure?.breaks?.length>=1);
 assert.ok(result.guides.some(g=>g.type==='zone'&&g.id.startsWith('fvg-')));
 assert.ok(result.guides.some(g=>g.type==='zone'&&g.id.startsWith('order-blocks-')));
 assert.ok(result.guides.some(g=>g.type==='pivot'&&g.id.startsWith('structure-pivot-')));
 // Causal guarantee: adding an unconfirmed forming bar must not change any overlay output
 const withForming=structureTools([...bars,{time:edge,open:115,close:60,high:120,low:55,volume:999}],step,edge);
 assert.deepEqual(withForming,result);
});
