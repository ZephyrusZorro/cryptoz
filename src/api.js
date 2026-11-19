import {abortable,throwIfAborted,deadline} from './async-task.js';
const directRoutes=new Set(['asset-search','asset','markets','global','sentiment','chains','instruments','exchange-markets','candles','book','ticker','trade-quote','fx']);
const allowedRoutes=new Set([...directRoutes,'news','insights']);
const waitMs=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted)return reject(Object.assign(Error('Aborted'),{name:'AbortError'}));
 const onAbort=()=>{clearTimeout(timer);reject(Object.assign(Error('Aborted'),{name:'AbortError'}));};
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve();},ms);
 signal?.addEventListener('abort',onAbort,{once:true});
});
export function createApiClient({fetcher=(...args)=>fetch(...args),loadDirect=async()=>(await import('./direct.js')).directApi,now=Date.now}={}){
 const telemetry=new Map(),cooldown=new Map(),latest=new Map();let sequence=0;
 const publish=(key,id,value)=>{if(latest.get(key)!==id)return;telemetry.delete(key);telemetry.set(key,value);if(telemetry.size>32)telemetry.delete(telemetry.keys().next().value);};
 async function api(path,{signal}={}){
  throwIfAborted(signal);const key=path.split('?')[0];if(!allowedRoutes.has(key))throw Error('Unknown market API route');
  const query=new URLSearchParams(path.split('?')[1]??''),venue=query.get('venue')??'aggregate',section=query.get('section'),isBrowserInsight=key==='insights'&&['derivatives','onchain'].includes(section),scope=key+':'+(key==='fx'?query.get('pair'):isBrowserInsight?section:venue),id=++sequence;latest.set(key,id);let serverError;
  const serverTries=directRoutes.has(key)||isBrowserInsight?1:2;
  if((cooldown.get(scope)??0)<=now()){
   for(let attempt=0;attempt<serverTries;attempt++){
    if(attempt>0)await waitMs(320,signal);
    const timing=deadline(signal,11000);
    try{const response=await abortable(fetcher('/api/'+path,{signal:timing.signal}),timing.signal),body=await abortable(response.json(),timing.signal);throwIfAborted(signal);
     if(!response.ok){const error=Error(body.error??`HTTP ${response.status}`);error.status=response.status;throw error;}
     let result=body;
     if(isBrowserInsight&&body.data?.section===section&&Object.values(body.data.feeds??{}).some(f=>f?.status==='unavailable')){
      const local=deadline(signal,7500);
      try{const direct=await abortable(loadDirect(),local.signal),fallback=await abortable(direct(path,{signal:local.signal}),local.signal);if(fallback.data?.section===section){const feeds=Object.fromEntries(Object.entries(body.data.feeds).map(([k,original])=>{const replacement=fallback.data.feeds?.[k];return [k,original.status==='unavailable'&&replacement?.status!=='unavailable'&&replacement?.values?{...replacement,transport:'browser-direct'}:original];}));result={...body,data:{...body.data,feeds}};}}
      catch{throwIfAborted(signal);}finally{local.dispose();}
     }
     publish(key,id,{...result,data:undefined,ok:true,observedAt:now(),venue});return result;
    }catch(error){throwIfAborted(signal);if(error.status&&error.status<500)throw error;serverError=error;}finally{timing.dispose();}
   }
  }else serverError=Error('Hosted provider route is cooling down');
  throwIfAborted(signal);
  if(directRoutes.has(key)||isBrowserInsight){
   cooldown.set(scope,now()+20000);if(cooldown.size>32)cooldown.delete(cooldown.keys().next().value);
   let directError;
   for(let attempt=0;attempt<2;attempt++){
    if(attempt>0)await waitMs(320,signal);
    const timing=deadline(signal,12000);
    try{const direct=await abortable(loadDirect(),timing.signal);const body=await abortable(direct(path,{signal:timing.signal}),timing.signal);throwIfAborted(signal);if(isBrowserInsight&&body.data?.section===section){const feeds=Object.fromEntries(Object.entries(body.data.feeds).map(([k,feed])=>[k,feed?.values?{...feed,transport:'browser-direct'}:feed]));body.data={...body.data,feeds};}publish(key,id,{...body,data:undefined,ok:true,observedAt:now(),venue});return body;
    }catch(error){throwIfAborted(signal);directError=error;if(error.name==='AbortError')throw error;}finally{timing.dispose();}
   }
   publish(key,id,{ok:false,error:directError.message,observedAt:now(),venue});throw Error(`Market source unavailable (${directError.message}).`);
  }
  publish(key,id,{ok:false,error:serverError.message,observedAt:now(),venue});throw serverError;
 }
 return {api,telemetry};
}
const client=createApiClient();export const api=client.api;export const telemetry=client.telemetry;
