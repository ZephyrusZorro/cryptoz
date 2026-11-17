export function assessInWorker(input,signal){
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Study canceled','AbortError'));return;}
  const worker=new Worker(new URL('./forecast-worker.js',import.meta.url),{type:'module'});
  const finish=(settle,value)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();settle(value);};
  const abort=()=>finish(reject,new DOMException('Study canceled','AbortError'));
  const timer=setTimeout(()=>finish(reject,new Error('The local analysis timed out. Try again.')),12000);
  signal.addEventListener('abort',abort,{once:true});
  worker.addEventListener('message',({data})=>{
   if(data?.id!==1)return;
   if(data.error)finish(reject,new Error(data.error));else if(data.result)finish(resolve,data.result);
  });
  worker.addEventListener('error',()=>finish(reject,new Error('The analysis could not start in this browser.')));
  worker.postMessage({id:1,input});
 });
}
