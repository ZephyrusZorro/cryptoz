export const telemetry=new Map();
const cooldown=new Map();
const directRoutes=new Set(['markets','global','sentiment','chains','instruments','exchange-markets','candles','book','ticker']);
export async function api(path,{signal}={}) {
 const key=path.split('?')[0];let serverError;
 try{
  if((cooldown.get(key)??0)>Date.now())throw Error('Hosted provider route is cooling down');
  const r=await fetch('/api/'+path,{signal:signal??AbortSignal.timeout(18000)});const b=await r.json();if(!r.ok)throw Error(b.error??`HTTP ${r.status}`);telemetry.set(key,{...b,data:undefined,ok:true,observedAt:Date.now()});return b;
 }catch(e){serverError=e;if(e.name==='AbortError')throw e;}
 if(directRoutes.has(key)){
  cooldown.set(key,Date.now()+60000);
  try{const {directApi}=await import('./direct.js');const b=await directApi(path);telemetry.set(key,{...b,data:undefined,ok:true,observedAt:Date.now()});return b;}catch(e){telemetry.set(key,{ok:false,error:`Hosted: ${serverError.message}; direct: ${e.message}`,observedAt:Date.now()});throw Error(`Market source unavailable (${e.message}).`);}
 }
 telemetry.set(key,{ok:false,error:serverError.message,observedAt:Date.now()});throw serverError;
}
