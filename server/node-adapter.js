export async function handleNodeRequest(req,res,handler,url='http://localhost'+req.url){
 const controller=new AbortController(),cancel=()=>controller.abort();
 const closed=()=>{if(!res.writableEnded)cancel();};req.once('aborted',cancel);res.once('close',closed);
 try{const response=await handler(new Request(url,{method:req.method,signal:controller.signal}));const bytes=await response.arrayBuffer();if(controller.signal.aborted||res.destroyed)return;res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(bytes));
 }catch{if(!controller.signal.aborted&&!res.destroyed){res.writeHead(500,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Request failed. Retry shortly.'}));}
 }finally{req.removeListener('aborted',cancel);res.removeListener('close',closed);}
}
