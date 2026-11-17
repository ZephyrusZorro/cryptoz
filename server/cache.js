import {abortReason,throwIfAborted} from '../src/async-task.js';
export function createProviderCache({now=Date.now,maxCache=160,maxPending=32}={}){
 const values=new Map(),pending=new Map(),failures=new Map();
 function subscribe(entry,signal){
  throwIfAborted(signal);entry.users++;
  return new Promise((resolve,reject)=>{let done=false;
   const finish=(error,value)=>{if(done)return;done=true;entry.users--;signal?.removeEventListener('abort',cancel);if(error)reject(error);else resolve(value);};
   const cancel=()=>{finish(abortReason(signal));if(entry.users===0)entry.controller.abort(abortReason(signal));};
   signal?.addEventListener('abort',cancel,{once:true});entry.promise.then(value=>finish(null,value),error=>finish(error));
  });
 }
 return async function cached(key,provider,ttl,loader,signal){
  throwIfAborted(signal);const old=values.get(key),time=now();if(old&&time-old.at<ttl)return {...old.value,cache:'fresh'};
  let entry=pending.get(key);if(entry?.controller.signal.aborted){pending.delete(key);entry=null;}if(entry)return subscribe(entry,signal);
  if((failures.get(key)??0)>time){if(old&&time-old.at<1800000)return {...old.value,cache:'stale',warning:'Provider unavailable; last successful response retained.'};throw Error(`${provider} temporarily unavailable; retry after cooldown`);}
  if(pending.size>=maxPending){const error=Error('Market service is busy. Retry shortly.');error.status=503;throw error;}
  entry={controller:new AbortController(),users:0};pending.set(key,entry);
  entry.promise=(async()=>{try{const data=await loader(entry.controller.signal);throwIfAborted(entry.controller.signal);const value={provider,fetchedAt:new Date(now()).toISOString(),cache:'miss',data};values.delete(key);values.set(key,{at:now(),value});if(values.size>maxCache)values.delete(values.keys().next().value);failures.delete(key);return value;
   }catch(error){if(entry.controller.signal.aborted)throw abortReason(entry.controller.signal);failures.set(key,now()+30000);if(failures.size>maxCache)failures.delete(failures.keys().next().value);if(old&&now()-old.at<1800000)return {...old.value,cache:'stale',warning:'Provider request failed; last successful data retained.'};throw error;
   }finally{if(pending.get(key)===entry)pending.delete(key);}})();return subscribe(entry,signal);
 };
}
