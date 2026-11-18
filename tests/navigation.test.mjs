import test from 'node:test';
import assert from 'node:assert/strict';
import {PRIMARY,GROUPS,resolveRoute,groupFor,normalizeDock,readDock,saveDock} from '../src/navigation.js';
test('five focused primary destinations separate Learn and Practice from Charts',()=>{
 assert.deepEqual(PRIMARY.map(x=>x.id),['home','markets','research','practice','learn']);
 for(const [path,group] of Object.entries({overview:'home',news:'home',analysts:'home',markets:'markets',studio:'markets','market-insights':'markets',terminal:'research',compare:'research',learn:'learn',practice:'practice',replay:'practice',backtest:'practice',risk:'practice',workspace:'markets'}))assert.equal(groupFor(path),group);
 assert.equal(GROUPS.research.some(x=>['practice','learn'].includes(x.route)),false);
 assert.equal(Object.values(GROUPS).flat().some(x=>x.route==='sources'),false);
});
test('route resolution handles old links and rejects unknown or inherited paths',()=>{
 assert.equal(resolveRoute('#terminal'),'terminal');assert.equal(resolveRoute('#compare?x=1'),'compare');
 assert.equal(resolveRoute('#ai-intelligence'),'terminal');assert.equal(resolveRoute('#insights'),'market-insights');assert.equal(resolveRoute('#workspace'),'workspace');assert.equal(resolveRoute('#learn?view=readings'),'learn');
 for(const x of ['#sources','#constructor','#__proto__','#unknown',''])assert.equal(resolveRoute(x),'overview');
});
test('fixed dock migrates expanded preferences to compact and preserves hidden mode',()=>{
 for(const x of ['compact','hidden'])assert.equal(normalizeDock(x),x);assert.equal(normalizeDock('expanded'),'compact');
 assert.equal(normalizeDock('anything'),'compact');assert.equal(readDock({getItem(){throw Error();}}),'compact');
 let value;const storage={getItem:()=>value,setItem:(_,x)=>{value=x;}};saveDock(storage,'expanded');assert.equal(readDock(storage),'compact');
 assert.equal(saveDock({setItem(){throw Error();}},'hidden'),false);
});
