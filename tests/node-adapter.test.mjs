import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {handleNodeRequest} from '../server/node-adapter.js';
test('a closed local HTTP connection cancels its server-side request',async()=>{
 let entered,cancelled;const active=new Promise(r=>entered=r),aborted=new Promise(r=>cancelled=r);
 const server=http.createServer((req,res)=>handleNodeRequest(req,res,request=>{entered();request.signal.addEventListener('abort',cancelled,{once:true});return new Promise((resolve,reject)=>request.signal.addEventListener('abort',()=>reject(request.signal.reason),{once:true}));}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const controller=new AbortController(),pending=fetch('http://127.0.0.1:'+server.address().port,{signal:controller.signal});
 try{await active;controller.abort();await assert.rejects(pending,{name:'AbortError'});await aborted;}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
