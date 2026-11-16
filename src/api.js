export const telemetry=new Map();
export async function api(path,{signal}={}) {
 const key=path.split('?')[0];try{const r=await fetch('/api/'+path,{signal:signal??AbortSignal.timeout(18000)});const b=await r.json();if(!r.ok)throw Error(b.error??`HTTP ${r.status}`);telemetry.set(key,{...b,data:undefined,ok:true,observedAt:Date.now()});return b;}catch(e){if(e.name!=='AbortError')telemetry.set(key,{ok:false,error:e.message,observedAt:Date.now()});throw e;}
}
