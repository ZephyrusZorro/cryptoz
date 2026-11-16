import {createGateway} from '../server/gateway.js';
// Same allowlisted adapters and validation as the server; transport originates in the user's browser.
const direct=createGateway({fetcher:(...args)=>fetch(...args)});
export async function directApi(path){const r=await direct(new Request('https://cryptoz.local/api/'+path));const b=await r.json();if(!r.ok)throw Error(b.error??'Direct public API unavailable');return {...b,transport:'browser-direct',notice:'Using a direct public connection from this browser because the hosted provider route is unavailable.'};}
