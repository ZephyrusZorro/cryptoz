import test from 'node:test';import assert from 'node:assert/strict';import {mountLearningHub} from '../src/learning-hub.js';
import {createLearningProgress} from '../src/beginner-store.js';
test('beginner help opens without market requests and leaving readings disposes its polling',()=>{
 let click,reads=0,disposed=0,updated=0;const buttons=['start','readings','glossary'].map(view=>({dataset:{learningView:view},setAttribute(){}})),host={innerHTML:''};const root={innerHTML:'',querySelector:()=>host,querySelectorAll:()=>buttons,addEventListener(type,fn){click=fn;},removeEventListener(){click=null;}};
 const hub=mountLearningHub(root,{instruments:{},storage:{},hydrate(){},onChart(){},mountGuide:()=>({dispose(){}}),mountReadings:()=>{reads++;return {dispose(){disposed++;},updateInstruments(){updated++;}};}});
 assert.equal(reads,0);click({target:{closest:()=>buttons[1]}});assert.equal(reads,1);hub.updateInstruments();assert.equal(updated,1);click({target:{closest:()=>buttons[2]}});assert.equal(disposed,1);hub.updateInstruments();assert.equal(updated,1);hub.dispose();assert.equal(click,null);
});
test('the same in-memory progress survives learning view and route remounts when storage fails',()=>{
 const storage={getItem:()=>null,setItem(){throw Error('Quota');}},progress=createLearningProgress(storage);progress.set('risk',true);let received;
 function mount(){const host={innerHTML:''};return mountLearningHub({innerHTML:'',querySelector:()=>host,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}},{instruments:{},storage,progress,hydrate(){},mountGuide:(root,options)=>{received=options.progress;return {dispose(){}};}});}
 const first=mount();assert.equal(received,progress);first.dispose();const second=mount();assert.equal(received.has('risk'),true);second.dispose();
});
