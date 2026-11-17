import test from 'node:test';
import assert from 'node:assert/strict';
import {studyAnalogs} from '../src/market-analogs.js';
const sec=3600,t0=1700000000,series=(num)=>Array.from({length:num},(_,i)=>{
 const close=100*Math.exp(.014*Math.sin(i/10)+.00021*i);
 return {time:t0+i*sec,open:close,close,high:close*1.01,low:close*.99,volume:1};
});
test('local analog model excludes unclosed and overlapping periods',()=>{
 const n=650,b=series(n),closedThrough=t0+n*sec,r=studyAnalogs(b,'1h',closedThrough);
 assert.equal(r.ready,true);
 assert.deepEqual(studyAnalogs([...b,...series(n+6).slice(n)],'1h',closedThrough),r);
 assert.equal(r.count,r.up+r.down+r.flat);
 for(const m of r.matches){
  assert.ok(m.outcomeTime<=closedThrough-13*sec);
  assert.ok(r.matches.every(x=>x===m||Math.abs(x.time-m.time)>=18*sec));
 }
});
test('market analogs abstain on insufficient contiguous history and unusual conditions',()=>{
 const b=series(400),end=t0+400*sec;
 assert.equal(studyAnalogs(b.slice(250),'1h',end).ready,false);
 assert.equal(studyAnalogs(b.filter((_,i)=>i!==300),'1h',end).ready,false);
 const last=b.at(-1),jump=4*last.close;b[b.length-1]={...last,close:jump,high:jump};
 assert.equal(studyAnalogs(b,'1h',end).ready,false);
});
