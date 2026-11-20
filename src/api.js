import {abortable,throwIfAborted,deadline} from './async-task.js';
const directRoutes=new Set(['asset-search','asset','markets','global','sentiment','chains','instruments','exchange-markets','candles','book','ticker','trade-quote','fx']);
const allowedRoutes=new Set([...directRoutes,'news','insights']);
const hedgeRoutes=new Set(['candles','book','ticker','trade-quote','exchange-markets','instruments']);
const ROUTE_TTL={
 candles:10_000,
 'candles:archive':300_000,
 instruments:900_000,
 markets:45_000,
 global:45_000,
 sentiment:120_000,
 news:60_000,
 chains:120_000,
 'exchange-markets':8_000,
 ticker:3_000,
 book:2_000,
 fx:60_000,
};
const SESSION_PREFIX='cryptoz.swr.v1:';
const SESSION_KEYS=new Set(['candles','instruments','global','sentiment']);
const waitMs=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted)return reject(Object.assign(Error('Aborted'),{name:'AbortError'}));
 const onAbort=()=>{clearTimeout(timer);reject(Object.assign(Error('Aborted'),{name:'AbortError'}));};
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve();},ms);
 signal?.addEventListener('abort',onAbort,{once:true});
});

function readSessionCache(path){
 if(typeof sessionStorage==='undefined')return null;
 try{
  const raw=sessionStorage.getItem(SESSION_PREFIX+path);
  if(!raw)return null;
  const parsed=JSON.parse(raw);
  if(!parsed||!parsed.value||!Number.isFinite(parsed.savedAt))return null;
  // Never serve anything older than 10 minutes from session warm cache
  if(Date.now()-parsed.savedAt>600_000)return null;
  return parsed;
 }catch{return null;}
}
function writeSessionCache(path,value){
 if(typeof sessionStorage==='undefined')return;
 const key=path.split('?')[0];
 if(!SESSION_KEYS.has(key))return;
 if(key==='candles'&&path.includes('before='))return;
 try{
  const payload=JSON.stringify({savedAt:Date.now(),value});
  if(payload.length>450_000)return;
  sessionStorage.setItem(SESSION_PREFIX+path,payload);
 }catch{
  // Evict oldest swr entries if sessionStorage quota is tight
  try{
   const keys=[];
   for(let i=0;i<sessionStorage.length;i++){
    const k=sessionStorage.key(i);
    if(k?.startsWith(SESSION_PREFIX))keys.push(k);
   }
   for(const k of keys.slice(0,Math.max(1,Math.ceil(keys.length/2))))sessionStorage.removeItem(k);
  }catch{}
 }
}

export function createApiClient({fetcher=(...args)=>fetch(...args),loadDirect=async()=>(await import('./direct.js')).directApi,now=Date.now,enableCache=false,hedgeMs=0}={}){
 const telemetry=new Map(),cooldown=new Map(),latest=new Map(),cache=new Map(),inflight=new Map();let sequence=0;
 const publish=(key,id,value)=>{if(latest.get(key)!==id)return;telemetry.delete(key);telemetry.set(key,value);if(telemetry.size>32)telemetry.delete(telemetry.keys().next().value);};
 const ttlFor=path=>{
  const key=path.split('?')[0];
  if(key==='candles'&&path.includes('before='))return ROUTE_TTL['candles:archive'];
  return ROUTE_TTL[key]??0;
 };
 const remember=(path,body)=>{
  if(!enableCache)return;
  const ttl=ttlFor(path);
  if(ttl<=0)return;
  cache.delete(path);
  cache.set(path,{body,savedAt:now(),expiresAt:now()+ttl});
  if(cache.size>64)cache.delete(cache.keys().next().value);
  writeSessionCache(path,body);
 };
 function peek(path,{maxAgeMs=300_000}={}){
  if(!enableCache)return null;
  const hit=cache.get(path);
  if(hit&&now()-hit.savedAt<=maxAgeMs)return hit.body;
  const warm=readSessionCache(path);
  if(warm&&Date.now()-warm.savedAt<=maxAgeMs){
   cache.set(path,{body:warm.value,savedAt:warm.savedAt,expiresAt:warm.savedAt+ttlFor(path)});
   return warm.value;
  }
  return null;
 }
 async function runNetwork(path,key,query,venue,section,isBrowserInsight,scope,id,signal){
  let serverError;
  const serverTries=directRoutes.has(key)||isBrowserInsight?1:2;
  const fetchDirectOnce=async(directSignal)=>{
   const direct=await abortable(loadDirect(),directSignal);
   const body=await abortable(direct(path,{signal:directSignal}),directSignal);
   if(isBrowserInsight&&body.data?.section===section){
    const feeds=Object.fromEntries(Object.entries(body.data.feeds).map(([k,feed])=>[k,feed?.values?{...feed,transport:'browser-direct'}:feed]));
    body.data={...body.data,feeds};
   }
   return body;
  };
  const fetchServerOnce=async(serverSignal)=>{
   const response=await abortable(fetcher('/api/'+path,{signal:serverSignal}),serverSignal);
   const body=await abortable(response.json(),serverSignal);
   if(!response.ok){const error=Error(body.error??`HTTP ${response.status}`);error.status=response.status;throw error;}
   let result=body;
   if(isBrowserInsight&&body.data?.section===section&&Object.values(body.data.feeds??{}).some(f=>f?.status==='unavailable')){
    const local=deadline(serverSignal,7500);
    try{
     const fallback=await fetchDirectOnce(local.signal);
     if(fallback.data?.section===section){
      const feeds=Object.fromEntries(Object.entries(body.data.feeds).map(([k,original])=>{const replacement=fallback.data.feeds?.[k];return [k,original.status==='unavailable'&&replacement?.status!=='unavailable'&&replacement?.values?{...replacement,transport:'browser-direct'}:original];}));
      result={...body,data:{...body.data,feeds}};
     }
    }catch{throwIfAborted(serverSignal);}finally{local.dispose();}
   }
   return result;
  };

  if((cooldown.get(scope)??0)<=now()){
   // Hedged fast-failover for live exchange routes in browser: if /api/ takes > hedgeMs, race directApi in parallel!
   if(hedgeMs>0&&hedgeRoutes.has(key)&&!isBrowserInsight){
    const serverCtl=new AbortController(),directCtl=new AbortController();
    const relayAbort=()=>{serverCtl.abort();directCtl.abort();};
    signal?.addEventListener('abort',relayAbort,{once:true});
    const serverTiming=deadline(serverCtl.signal,9000);
    let hedgeTimer=null,directPromise=null;
    try{
     const serverPromise=fetchServerOnce(serverTiming.signal);
     const winner=await new Promise((resolve,reject)=>{
      let settled=false,pendingCount=1,sErr=null,dErr=null;
      const win=(res,fromDirect)=>{
       if(settled)return;settled=true;clearTimeout(hedgeTimer);
       if(fromDirect)serverCtl.abort();else directCtl.abort();
       resolve({res,fromDirect});
      };
      const failOne=(err,fromDirect)=>{
       if(settled)return;
       if(fromDirect)dErr=err;else sErr=err;
       // Client 4xx validation error from server should fail fast without fallback
       if(!fromDirect&&err?.status&&err.status<500){settled=true;clearTimeout(hedgeTimer);directCtl.abort();reject(err);return;}
       pendingCount--;
       if(pendingCount===0&&directPromise){settled=true;clearTimeout(hedgeTimer);reject(dErr??sErr);}
       else if(!fromDirect&&!directPromise){
        clearTimeout(hedgeTimer);
        startDirect();
       }
      };
      const startDirect=()=>{
       if(settled||directPromise)return;
       pendingCount++;
       const dt=deadline(directCtl.signal,9000);
       directPromise=fetchDirectOnce(dt.signal).then(r=>win(r,true),e=>failOne(e,true)).finally(()=>dt.dispose());
      };
      hedgeTimer=setTimeout(startDirect,hedgeMs);
      serverPromise.then(r=>win(r,false),e=>failOne(e,false));
     });
     throwIfAborted(signal);
     if(winner.fromDirect){
      cooldown.set(scope,now()+15000);
      if(cooldown.size>32)cooldown.delete(cooldown.keys().next().value);
     }
     remember(path,winner.res);
     publish(key,id,{...winner.res,data:undefined,ok:true,observedAt:now(),venue});
     return winner.res;
    }catch(error){
     throwIfAborted(signal);
     if(error?.status&&error.status<500)throw error;
     serverError=error;
    }finally{
     clearTimeout(hedgeTimer);
     serverTiming.dispose();
     signal?.removeEventListener('abort',relayAbort);
    }
   }else{
    for(let attempt=0;attempt<serverTries;attempt++){
     if(attempt>0)await waitMs(320,signal);
     const timing=deadline(signal,11000);
     try{
      const result=await fetchServerOnce(timing.signal);
      throwIfAborted(signal);
      remember(path,result);
      publish(key,id,{...result,data:undefined,ok:true,observedAt:now(),venue});
      return result;
     }catch(error){throwIfAborted(signal);if(error.status&&error.status<500)throw error;serverError=error;}finally{timing.dispose();}
    }
   }
  }else serverError=Error('Hosted provider route is cooling down');

  throwIfAborted(signal);
  if(directRoutes.has(key)||isBrowserInsight){
   cooldown.set(scope,now()+20000);if(cooldown.size>32)cooldown.delete(cooldown.keys().next().value);
   let directError;
   for(let attempt=0;attempt<2;attempt++){
    if(attempt>0)await waitMs(260,signal);
    const timing=deadline(signal,10000);
    try{
     const body=await fetchDirectOnce(timing.signal);
     throwIfAborted(signal);
     remember(path,body);
     publish(key,id,{...body,data:undefined,ok:true,observedAt:now(),venue});
     return body;
    }catch(error){throwIfAborted(signal);directError=error;if(error.name==='AbortError')throw error;}finally{timing.dispose();}
   }
   publish(key,id,{ok:false,error:directError.message,observedAt:now(),venue});throw Error(`Market source unavailable (${directError.message}).`);
  }
  publish(key,id,{ok:false,error:serverError.message,observedAt:now(),venue});throw serverError;
 }

 async function api(path,{signal,bypassCache=false}={}){
  throwIfAborted(signal);
  const key=path.split('?')[0];
  if(!allowedRoutes.has(key))throw Error('Unknown market API route');
  const query=new URLSearchParams(path.split('?')[1]??''),venue=query.get('venue')??'aggregate',section=query.get('section'),isBrowserInsight=key==='insights'&&['derivatives','onchain'].includes(section),scope=key+':'+(key==='fx'?query.get('pair'):isBrowserInsight?section:venue),id=++sequence;
  latest.set(key,id);

  if(enableCache&&!bypassCache){
   const hit=cache.get(path);
   if(hit&&hit.expiresAt>now()){
    publish(key,id,{...hit.body,data:undefined,ok:true,observedAt:now(),venue});
    return hit.body;
   }
   const shared=inflight.get(path);
   if(shared){
    shared.subscribers++;
    try{
     const res=await abortable(shared.promise,signal);
     publish(key,id,{...res,data:undefined,ok:true,observedAt:now(),venue});
     return res;
    }finally{
     shared.subscribers--;
     if(shared.subscribers<=0&&!shared.settled)shared.controller.abort();
    }
   }
   const sharedCtl=new AbortController();
   const entry={controller:sharedCtl,subscribers:1,settled:false,promise:null};
   entry.promise=runNetwork(path,key,query,venue,section,isBrowserInsight,scope,id,sharedCtl.signal)
    .finally(()=>{entry.settled=true;if(inflight.get(path)===entry)inflight.delete(path);});
   inflight.set(path,entry);
   try{
    return await abortable(entry.promise,signal);
   }finally{
    entry.subscribers--;
    if(entry.subscribers<=0&&!entry.settled)sharedCtl.abort();
   }
  }
  return runNetwork(path,key,query,venue,section,isBrowserInsight,scope,id,signal);
 }
 return {api,telemetry,peek};
}

const isBrowser=typeof window!=='undefined'&&typeof document!=='undefined';
const client=createApiClient({enableCache:isBrowser,hedgeMs:isBrowser?1500:0});
export const api=client.api;
export const telemetry=client.telemetry;
export const peekApiCache=client.peek;
