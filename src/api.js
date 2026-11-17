import {abortable,throwIfAborted,deadline} from './async-task.js';
const directRoutes=new Set(['asset-search','asset','markets','global','sentiment','chains','instruments','exchange-markets','candles','book','ticker']);
const allowedRoutes=new Set([...directRoutes,'news']);
export function createApiClient({fetcher=(...args)=>fetch(...args),loadDirect=async()=>(await import('./direct.js')).directApi,now=Date.now}={}){
 const telemetry=new Map(),cooldown=new Map(),latest=new Map();let sequence=0;
 const publish=(key,id,value)=>{if(latest.get(key)!==id)return;telemetry.delete(key);telemetry.set(key,value);if(telemetry.size>32)telemetry.delete(telemetry.keys().next().value);};
 async function api(path,{signal}={}){
  throwIfAborted(signal);const key=path.split('?')[0];if(!allowedRoutes.has(key))throw Error('Unknown market API route');
  const venue=new URLSearchParams(path.split('?')[1]??'').get('venue')??'aggregate',scope=key+':'+venue,id=++sequence;latest.set(key,id);let serverError;
  if((cooldown.get(scope)??0)<=now()){
   const timing=deadline(signal,8000);
   try{const response=await abortable(fetcher('/api/'+path,{signal:timing.signal}),timing.signal),body=await abortable(response.json(),timing.signal);throwIfAborted(signal);
    if(!response.ok){const error=Error(body.error??`HTTP ${response.status}`);error.status=response.status;throw error;}
    publish(key,id,{...body,data:undefined,ok:true,observedAt:now(),venue});return body;
   }catch(error){throwIfAborted(signal);if(error.status&&error.status<500)throw error;serverError=error;}finally{timing.dispose();}
  }else serverError=Error('Hosted provider route is cooling down');
  throwIfAborted(signal);
  if(directRoutes.has(key)){
   cooldown.set(scope,now()+60000);if(cooldown.size>32)cooldown.delete(cooldown.keys().next().value);const timing=deadline(signal,12000);
   try{const direct=await abortable(loadDirect(),timing.signal);const body=await abortable(direct(path,{signal:timing.signal}),timing.signal);throwIfAborted(signal);publish(key,id,{...body,data:undefined,ok:true,observedAt:now(),venue});return body;
   }catch(error){throwIfAborted(signal);publish(key,id,{ok:false,error:error.message,observedAt:now(),venue});if(error.name==='AbortError')throw error;throw Error(`Market source unavailable (${error.message}).`);}finally{timing.dispose();}
  }
  publish(key,id,{ok:false,error:serverError.message,observedAt:now(),venue});throw serverError;
 }
 return {api,telemetry};
}
const client=createApiClient();export const api=client.api;export const telemetry=client.telemetry;
