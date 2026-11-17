export function createDataLoader(fetcher,data,errors,{onChange=()=>{}}={}){
 const pending=new Map();
 return {
  get busy(){return pending.size>0;},get pendingKeys(){return [...pending.keys()];},
  load(keys){return Promise.allSettled([...new Set(keys)].map(key=>{
   if(pending.has(key))return pending.get(key);
   const task=Promise.resolve().then(()=>fetcher(key)).then(value=>{data[key]=value;delete errors[key];},error=>{errors[key]=error.message;if(data[key])data[key]={...data[key],cache:'stale'};}).finally(()=>{pending.delete(key);onChange(key);});pending.set(key,task);return task;
  }));}
 };
}
