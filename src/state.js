export const STORAGE_KEY='cryptoz.workspace.v1';
export const defaults=()=>({version:1,watchlist:[],notes:{},drawings:{},alerts:[],journal:[]});
export function validateWorkspace(data) {
 if(!data||data.version!==1||JSON.stringify(data).length>2000000)throw Error('Invalid CRYPTOZ workspace backup');
 const out=defaults();
 if(data.watchlist!==undefined){if(!Array.isArray(data.watchlist)||data.watchlist.length>200||!data.watchlist.every(s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(s)))throw Error('Invalid watchlist');out.watchlist=[...new Set(data.watchlist)];}
 if(data.notes&&typeof data.notes==='object'&&!Array.isArray(data.notes)){for(const [k,v] of Object.entries(data.notes).slice(0,200))if(/^[\w:-]{1,100}$/.test(k)&&typeof v==='string')out.notes[k]=v.slice(0,10000);}
 if(data.drawings&&typeof data.drawings==='object'){for(const [k,v] of Object.entries(data.drawings).slice(0,100)){if(!/^[\w:-]{1,100}$/.test(k)||!Array.isArray(v))continue;out.drawings[k]=v.filter(d=>d&&['horizontal','trend','fib','label'].includes(d.type)&&typeof d.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(d.id)&&Array.isArray(d.points)&&d.points.length>0&&d.points.length<=2&&d.points.every(p=>Number.isFinite(p.time)&&p.time>0&&Number.isFinite(p.price)&&p.price>0)).slice(0,40).map(d=>({id:d.id.slice(0,80),type:d.type,points:d.points,label:typeof d.label==='string'?d.label.slice(0,100):''}));}}
 if(Array.isArray(data.alerts))out.alerts=data.alerts.filter(a=>a&&typeof a.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(a.id)&&['binance','coinbase'].includes(a.venue)&&/^[A-Z0-9-]{2,30}$/.test(a.symbol)&&['above','below'].includes(a.direction)&&Number.isFinite(a.target)&&a.target>0).slice(0,100).map(a=>({...a,active:a.active!==false,last:null,triggeredAt:a.triggeredAt??null}));
 if(Array.isArray(data.journal))out.journal=data.journal.filter(j=>j&&typeof j.text==='string'&&typeof j.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(j.id)).slice(0,200).map(j=>({id:j.id.slice(0,80),text:j.text.slice(0,4000),createdAt:typeof j.createdAt==='string'?j.createdAt:''}));
 return out;
}
export function readState(storage) {try{return validateWorkspace(JSON.parse(storage.getItem(STORAGE_KEY)));}catch{return defaults();}}
export function writeState(storage,state) {try{storage.setItem(STORAGE_KEY,JSON.stringify(state));return true;}catch{return false;}}
export function crossed(previous,current,target,direction) {return Number.isFinite(previous)&&Number.isFinite(current)&&(direction==='above'?previous<target&&current>=target:previous>target&&current<=target);}
export function freshObservation(previous,price,observedAt,now=Date.now()){const time=Date.parse(observedAt);if(!Number.isFinite(price)||price<=0||!Number.isFinite(time)||now-time>30000||time-now>5000||previous&&time<=previous.time)return null;return {price,time};}
