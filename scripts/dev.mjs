import {handleNodeRequest} from '../server/node-adapter.js';
import {createServer as createVite} from 'vite';
import {gateway} from '../server/gateway.js';
const server=await createVite({server:{host:'127.0.0.1',port:Number(process.env.PORT)||5187,strictPort:true},plugins:[{name:'cryptoz-api',configureServer(vite){vite.middlewares.use('/api',(req,res)=>handleNodeRequest(req,res,gateway,'http://localhost/api'+req.url));}}]});
await server.listen();server.printUrls();
