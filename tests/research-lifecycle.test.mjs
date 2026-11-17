import test from 'node:test';import assert from 'node:assert/strict';
import {mountComparison} from '../src/comparison.js';import {mountLearning} from '../src/learning.js';
function element(){return {value:'',innerHTML:'',textContent:'',disabled:false,events:{},classList:{toggle(){}},addEventListener(type,fn){(this.events[type]??=[]).push(fn);},fire(type){const event={target:this,preventDefault(){}};for(const fn of this.events[type]??[])fn(event);},querySelectorAll(){return [];}};}
function fixture(kind){const nodes=new Map(),form=element();form.elements=Object.fromEntries(['venue','interval','instrument','family','asset0','asset1','asset2','asset3'].map(k=>[k,element()]));Object.assign(form.elements.venue,{value:'binance'});Object.assign(form.elements.interval,{value:'1h'});const root={innerHTML:'',querySelectorAll(){return [];},querySelector(s){if(s==='form')return form;if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);}};const pending=[];const instruments={binance:[],coinbase:[]};const view=(kind==='compare'?mountComparison:mountLearning)(root,{instruments,hydrate(){},onChart(){},request:(path,options)=>new Promise((resolve,reject)=>pending.push({path,options,resolve,reject}))});return {root,form,view,pending,instruments};}
test('editing a comparison selection cancels old history and invalidates export',()=>{
 const f=fixture('compare');try{assert.equal(f.pending.length,3);f.form.elements.interval.value='4h';f.form.elements.interval.fire('change');assert.equal(f.pending[0].options?.signal?.aborted,true);assert.match(f.root.querySelector('#comparison-status').textContent,/selection changed/i);assert.equal(f.root.querySelector('#comparison-export').disabled,true);}finally{f.view.dispose();}
});
test('comparison disposal cancels all subscribers in the current request',()=>{
 const f=fixture('compare');f.view.dispose();assert.ok(f.pending.every(p=>p.options?.signal?.aborted===true));
});
test('learning catalog changes reload a changed symbol and cancel the old request',()=>{
 const f=fixture('learn');try{assert.match(f.pending[0].path,/BTCUSDT/);f.instruments.binance=[{venue:'binance',symbol:'ETHUSDT',base:'ETH',quote:'USDT'}];f.view.updateInstruments();assert.equal(f.form.elements.instrument.value,'ETHUSDT');assert.equal(f.pending[0].options?.signal?.aborted,true);assert.equal(f.pending.length,2);assert.match(f.pending[1].path,/ETHUSDT/);}finally{f.view.dispose();}
});
test('learning route disposal cancels pending exchange work',()=>{
 const f=fixture('learn');f.view.dispose();assert.equal(f.pending[0].options?.signal?.aborted,true);
});
