import test from 'node:test';import assert from 'node:assert/strict';
import {createDraftStore} from '../src/draft-store.js';
import {replaceWorkspace,defaults,STORAGE_KEY,RECOVERY_KEY,validateWorkspace} from '../src/state.js';
import {price,pct,tone,num} from '../src/ui.js';
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};
test('journal and per-instrument risk drafts survive controller recreation',()=>{
 const storage=memory(),draft=createDraftStore(storage);draft.setJournal('Unfinished research');draft.setRisk('binance:BTCUSDT',{entry:'100',stop:'95',target:'110',side:'long'});
 const next=createDraftStore(storage);assert.equal(next.journal,'Unfinished research');assert.equal(next.risk('binance:BTCUSDT').entry,'100');assert.deepEqual(next.risk('coinbase:BTC-USD'),{});next.setJournal('');assert.equal(createDraftStore(storage).journal,'');
});
test('drafts stay bounded and report failed persistence without throwing away memory',()=>{
 const draft=createDraftStore({getItem:()=>null,setItem(){throw Error('Quota');}});assert.equal(draft.setJournal('research'),false);assert.equal(draft.journal,'research');for(let i=0;i<30;i++)draft.setRisk('binance:COIN'+i+'USDT',{entry:'1'});assert.ok(draft.size<=20);
});
test('workspace replacement commits only after persistence succeeds and preserves recovery',()=>{
 const storage=memory(),current=defaults();current.notes['binance:BTCUSDT']='Original';storage.setItem(STORAGE_KEY,JSON.stringify(current));const incoming={...defaults(),journal:[{id:'new',text:'Imported',createdAt:''}]};
 const failing={getItem:storage.getItem,setItem(k,v){if(k===STORAGE_KEY)throw Error('Quota');storage.setItem(k,v);}};
 assert.throws(()=>replaceWorkspace(failing,current,incoming),/persist|storage/i);assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).notes['binance:BTCUSDT'],'Original');assert.equal(current.journal.length,0);
 assert.equal(replaceWorkspace(storage,current,incoming).journal[0].text,'Imported');assert.equal(JSON.parse(storage.getItem(RECOVERY_KEY)).notes['binance:BTCUSDT'],'Original');
});
test('imported alerts exceeding the monitored limit remain present but are paused',()=>{
 const s=validateWorkspace({...defaults(),alerts:Array.from({length:15},(_,i)=>({id:'alert'+i,venue:'binance',symbol:'BTCUSDT',direction:'above',target:100,active:true}))});assert.equal(s.alerts.length,15);assert.equal(s.alerts.filter(a=>a.active).length,10);
});
test('missing values and tiny prices are represented truthfully',()=>{
 for(const v of ['',null,undefined,false]){assert.equal(price(v),'—');assert.equal(pct(v),'—');assert.equal(tone(v),'muted');}assert.equal(price(0),'$0.00');assert.notEqual(price(1e-10),'$0');assert.match(price(1e-10),/E-10|0\.0000000001/);
});

test('small nonzero values stay visible in alerts, studies and drawing labels',()=>{
 assert.match(num(1e-10,8),/1E-10|0\.0000000001/);assert.notEqual(num(-1e-10,8),'-0');assert.equal(num(0,8),'0');assert.equal(num(42.125,2),'42.13');
});

test('small percentage changes format cleanly without scientific notation',()=>{
 assert.equal(pct(0.00406467),'+0.0041%');
 assert.equal(pct(-0.00121437),'-0.0012%');
 assert.equal(pct(0.00001),'<0.0001%');
 assert.equal(pct(-0.00001),'>-0.0001%');
 assert.equal(pct(1.41),'+1.41%');
});
