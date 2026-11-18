import test from 'node:test';import assert from 'node:assert/strict';import {mountLearningHub} from '../src/learning-hub.js';
import {createLearningProgress} from '../src/beginner-store.js';
import {closedLearningHistory} from '../src/learning.js';
test('beginner help opens without market requests and leaving readings disposes its polling',()=>{
 let reads=0,disposed=0,updated=0;const events={};const buttons=['start','readings','glossary'].map(view=>({dataset:{learningView:view},setAttribute(){}})),host={innerHTML:''};const root={innerHTML:'',querySelector:()=>host,querySelectorAll:()=>buttons,addEventListener(type,fn){events[type]=fn;},removeEventListener(type){delete events[type];}};
 const hub=mountLearningHub(root,{instruments:{},storage:{},hydrate(){},onChart(){},mountGuide:()=>({dispose(){}}),mountReadings:()=>{reads++;return {dispose(){disposed++;},updateInstruments(){updated++;}};}});
 assert.equal(reads,0);events.click({target:{closest:()=>buttons[1]}});assert.equal(reads,1);hub.updateInstruments();assert.equal(updated,1);events.click({target:{closest:()=>buttons[2]}});assert.equal(disposed,1);hub.updateInstruments();assert.equal(updated,1);hub.dispose();assert.deepEqual(events,{});
});

test('Learn uses accessible tab activation and does not request history on arrow focus',()=>{
 const events={},panes=new Map(),changes=[];
 let focus='',reads=0;
 const tabs=['start','foundations','readings','exercises','glossary'].map(learningView=>({
  dataset:{learningView},setAttribute(name,value){this[name]=value;},focus(){focus=learningView;}
 }));
 const root={innerHTML:'',querySelector(s){
  if(s.startsWith('#learn-tab-'))return tabs.find(item=>s.endsWith(item.dataset.learningView));
  if(!panes.has(s))panes.set(s,{innerHTML:'',hidden:true});
  return panes.get(s);
 },querySelectorAll:()=>tabs,addEventListener(key,fn){events[key]=fn;},removeEventListener(){}};
 const hub=mountLearningHub(root,{instruments:{},storage:{},hydrate(){},onChart(){},initialView:'foundations',
  onViewChange:next=>changes.push(next),mountGuide:()=>({dispose(){}}),mountReadings(){reads++;return {dispose(){}};}});
 try{
  assert.equal(tabs[1]['aria-selected'],'true');
  events.keydown({key:'ArrowRight',target:{closest:()=>tabs[1]},preventDefault(){}});
  assert.equal(focus,'readings');
  assert.equal(reads,0);
  events.click({target:{closest:()=>tabs[2]}});
  assert.equal(tabs[2]['aria-selected'],'true');
  assert.equal(panes.get('#learn-pane-foundations').hidden,true);
  assert.equal(panes.get('#learn-pane-readings').hidden,false);
  assert.deepEqual(changes,['foundations','readings']);
  assert.equal(reads,1);
 }finally {hub.dispose();}
});

test('an older learning snapshot cannot confirm a bar that was still open when fetched',()=>{
 const hour=3600,older={time:hour,open:10,high:12,low:9,close:11,volume:2},forming={...older,time:2*hour};
 const fetched=2*hour*1000+100;
 assert.deepEqual(closedLearningHistory([forming,older],hour,new Date(fetched).toISOString(),4*hour*1000),[older]);
 assert.deepEqual(closedLearningHistory([older],hour,null,4*hour*1000),[]);
 assert.deepEqual(closedLearningHistory([older],hour,new Date(fetched).toISOString(),hour*1000),[]);
});
test('the same in-memory progress survives learning view and route remounts when storage fails',()=>{
 const storage={getItem:()=>null,setItem(){throw Error('Quota');}},progress=createLearningProgress(storage);progress.set('risk',true);let received;
 function mount(){const host={innerHTML:''};return mountLearningHub({innerHTML:'',querySelector:()=>host,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}},{instruments:{},storage,progress,hydrate(){},mountGuide:(root,options)=>{received=options.progress;return {dispose(){}};}});}
 const first=mount();assert.equal(received,progress);first.dispose();const second=mount();assert.equal(received.has('risk'),true);second.dispose();
});
