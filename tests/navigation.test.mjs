import test from 'node:test';
import assert from 'node:assert/strict';
import {PRIMARY,GROUPS,resolveRoute,groupFor,normalizeDock,readDock,saveDock} from '../src/navigation.js';
test('four primary destinations contain every retained feature without a Sources route',()=>{
 assert.deepEqual(PRIMARY.map(x=>x.id),['home','markets','research','workspace']);
 for(const [path,group] of Object.entries({overview:'home',news:'home',markets:'markets',studio:'markets',terminal:'research',compare:'research',learn:'research',workspace:'workspace'}))assert.equal(groupFor(path),group);
 assert.equal(Object.values(GROUPS).flat().some(x=>x.route==='sources'),false);
});
test('route resolution handles old links and rejects unknown or inherited paths',()=>{
 assert.equal(resolveRoute('#terminal'),'terminal');assert.equal(resolveRoute('#compare?x=1'),'compare');
 for(const x of ['#sources','#constructor','#__proto__','#unknown',''])assert.equal(resolveRoute(x),'overview');
});
test('fixed dock migrates expanded preferences to compact and preserves hidden mode',()=>{
 for(const x of ['compact','hidden'])assert.equal(normalizeDock(x),x);assert.equal(normalizeDock('expanded'),'compact');
 assert.equal(normalizeDock('anything'),'compact');assert.equal(readDock({getItem(){throw Error();}}),'compact');
 let value;const storage={getItem:()=>value,setItem:(_,x)=>{value=x;}};saveDock(storage,'expanded');assert.equal(readDock(storage),'compact');
 assert.equal(saveDock({setItem(){throw Error();}},'hidden'),false);
});
