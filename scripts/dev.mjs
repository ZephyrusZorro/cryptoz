import {createServer as createVite} from 'vite';
import {gateway} from '../server/gateway.js';
const server=await createVite({server:{host:'127.0.0.1',port:5187,strictPort:true}});
server.middlewares.use('/api',async(req,res)=>{try{const r=await gateway(new Request('http://localhost/api'+req.url));res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}catch{res.writeHead(500);res.end('{"error":"Gateway failure"}');}});
await server.listen();server.printUrls();
