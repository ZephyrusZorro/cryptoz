import http from 'node:http';import worker from '../dist/server/index.js';import {handleNodeRequest} from '../server/node-adapter.js';
const port=Number(process.env.PORT)||5187;http.createServer((req,res)=>handleNodeRequest(req,res,request=>worker.fetch(request),`http://127.0.0.1:${port}${req.url}`)).listen(port,'127.0.0.1',()=>console.log(`CRYPTOZ http://127.0.0.1:${port}`));
