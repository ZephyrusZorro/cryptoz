import test from 'node:test';import assert from 'node:assert/strict';
import {GETTING_STARTED,searchGlossary,helpFor} from '../src/beginner-content.js';
import {createLearningProgress} from '../src/beginner-store.js';
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
test('learning progress is bounded, reloadable and limited to the five reviewed tasks',()=>{
 const storage=memory(),progress=createLearningProgress(storage);assert.equal(GETTING_STARTED.length,5);for(const step of GETTING_STARTED)assert.equal(progress.set(step.id,true),true);assert.equal(progress.count,5);assert.equal(progress.set('__proto__',true),false);assert.equal(progress.count,5);const next=createLearningProgress(storage);assert.equal(next.count,5);assert.equal(next.has('risk'),true);next.set('risk',false);assert.equal(createLearningProgress(storage).count,4);
});
test('blocked or corrupt storage preserves usable in-memory learning progress',()=>{
 const progress=createLearningProgress({getItem:()=>'{',setItem(){throw Error('Quota');}});assert.equal(progress.count,0);assert.equal(progress.set('candles',true),false);assert.equal(progress.has('candles'),true);
});
test('glossary supports common abbreviations and clear empty results',()=>{
 assert.ok(searchGlossary('  moving AVERAGE ').some(t=>t.term==='EMA'));assert.ok(searchGlossary('relative strength').some(t=>t.term==='RSI'));assert.ok(searchGlossary('USDT').some(t=>t.term==='Quote currency'));assert.deepEqual(searchGlossary('zzzz-no-term'),[]);assert.ok(searchGlossary('').length>=14);
});
test('context help explains provisional candles and fee-aware manual risk without recommendations',()=>{
 assert.match(JSON.stringify(helpFor('chart')),/provisional|unfinished/i);assert.match(JSON.stringify(helpFor('risk')),/slippage/i);assert.equal(helpFor('unknown'),null);
});
