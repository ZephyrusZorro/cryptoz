import assert from 'node:assert/strict';
import test from 'node:test';
import {structureTools} from '../src/structure-tools.js';
const T=1700000040,step=60;
const feed=Array.from({length:80},(_,i)=>{const x=100+Math.sin(i*Math.PI/4)*2;return {time:T+i*step,open:x,close:x,high:x+1,low:x-1,volume:10+i};});
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
