import test from 'node:test';
import assert from 'node:assert/strict';
import {PRIMARY,GROUPS,resolveRoute,groupFor,normalizeDock,readDock,saveDock} from '../src/navigation.js';
import * as navigation from '../src/navigation.js';
test('six focused primary destinations separate Backtest, Learn and Practice from Charts',()=>{
 assert.deepEqual(PRIMARY.map(x=>x.id),['home','markets','research','backtest','practice','learn']);
 for(const [path,group] of Object.entries({overview:'home',news:'home',analysts:'home',markets:'markets',studio:'home','market-insights':'home',screener:'home',terminal:'research',compare:'research',backtest:'backtest',learn:'learn',practice:'practice',replay:'practice',risk:'practice',workspace:'home'}))assert.equal(groupFor(path),group);
 assert.deepEqual(navigation.navigationFor('markets').items.map(item=>item.route),['markets']);
 assert.deepEqual(navigation.navigationFor('backtest').items.map(item=>item.route),['backtest']);
 assert.equal(navigation.navigationFor('overview').items.some(item=>item.route==='screener'),false);
 assert.equal(navigation.navigationFor('screener').current.label,'Asset screener');
 assert.equal(GROUPS.research.some(x=>['practice','learn','backtest'].includes(x.route)),false);
 assert.equal(Object.values(GROUPS).flat().some(x=>x.route==='sources'),false);
});
test('route resolution handles old links and rejects unknown or inherited paths',()=>{
 assert.equal(resolveRoute('#terminal'),'terminal');assert.equal(resolveRoute('#compare?x=1'),'compare');
 assert.equal(resolveRoute('#ai-intelligence'),'terminal');assert.equal(resolveRoute('#insights'),'market-insights');assert.equal(resolveRoute('#workspace'),'workspace');assert.equal(resolveRoute('#learn?view=readings'),'learn');
 for(const x of ['#sources','#constructor','#__proto__','#unknown',''])assert.equal(resolveRoute(x),'overview');
});
test('legacy deep links keep unrelated query settings and land on the matching tool',()=>{
 const {resolveNavigation}=navigation;
 assert.deepEqual(resolveNavigation('#charts?section=risk-tools&from=terminal'),{route:'risk',hash:'#risk?from=terminal'});
 assert.deepEqual(resolveNavigation('#practice?from=terminal&section=risk-tools'),{route:'risk',hash:'#risk?from=terminal'});
 assert.deepEqual(resolveNavigation('#charts?section=research-note'),{route:'workspace',hash:'#workspace'});
 assert.deepEqual(resolveNavigation('#ai-intelligence?horizon=24'),{route:'terminal',hash:'#terminal?horizon=24&panel=evidence'});
 assert.deepEqual(resolveNavigation('#insights?section=macro'),{route:'market-insights',hash:'#market-insights?section=macro'});
});
test('keeps canonical route parameters stable and makes unknown paths resolve to Home',()=>{
 const {resolveNavigation}=navigation;
 for(const hash of ['#terminal?panel=evidence&horizon=12','#learn?view=readings','#market-insights?section=macro']){
  assert.equal(resolveNavigation(hash).hash,hash);
 }
 assert.deepEqual(resolveNavigation('#__proto__?x=1'),{route:'overview',hash:'#overview'});
 assert.deepEqual(resolveNavigation(''),{route:'overview',hash:''});
});
test('nested sections expose the actual page and its parent separately',()=>{
 const {navigationFor}=navigation;
 const chart=navigationFor('terminal');
 assert.equal(chart.primary.label,'Charts');
 assert.equal(chart.primaryCurrent,'page');
 const risk=navigationFor('risk');
 assert.equal(risk.primary.label,'Practice');
 assert.equal(risk.primaryCurrent,'location');
 assert.equal(risk.current.label,'Position calculator');
 assert.deepEqual(risk.items.map(item=>item.label),['Paper trading','Market replay','Position calculator']);
 assert.equal(navigationFor('learn').items.length,1);
});
test('fixed dock migrates expanded preferences to compact and preserves hidden mode',()=>{
 for(const x of ['compact','hidden'])assert.equal(normalizeDock(x),x);assert.equal(normalizeDock('expanded'),'compact');
 assert.equal(normalizeDock('anything'),'compact');assert.equal(readDock({getItem(){throw Error();}}),'compact');
 let value;const storage={getItem:()=>value,setItem:(_,x)=>{value=x;}};saveDock(storage,'expanded');assert.equal(readDock(storage),'compact');
 assert.equal(saveDock({setItem(){throw Error();}},'hidden'),false);
});
