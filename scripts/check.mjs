import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const npm=process.env.npm_execpath;
if(!npm)throw Error('Run through npm run check');
for(const args of [['test'],['run','build'],['audit','--audit-level=moderate']]){
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[npm,...args],{stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`npm ${args.join(' ')} failed (${code})`)));});
}
const {default:worker}=await import('../dist/server/index.js');
const {version}=JSON.parse(await readFile('package.json','utf8'));
const request=(path,method='GET')=>worker.fetch(new Request('https://cryptoz.invalid'+path,{method}));
const health=await request('/healthz');assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'ok',service:'CRYPTOZ',version});
assert.equal((await request('/healthz','HEAD')).body,null);assert.equal((await request('/healthz','POST')).status,405);
const home=await request('/');assert.equal(home.status,200);assert.match(home.headers.get('content-security-policy'),/object-src 'none'/);
const html=await home.text(),script=html.match(/src="([^\"]+\.js)"/)[1];assert.equal((await request(script)).status,200);
assert.equal((await request('/missing-asset.js')).status,404);assert.equal((await request('/','POST')).status,405);
console.log(`Release ${version}: Worker health, assets, CSP and method checks passed.`);
