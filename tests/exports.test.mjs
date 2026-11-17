import test from 'node:test';import assert from 'node:assert/strict';import {serializeCSV,capturePNG} from '../src/exports.js';
test('CSV escapes quotes, preserves numbers, and neutralizes spreadsheet formulas in text',()=>{
 const csv=serializeCSV(['name','change'],[['A "coin"',-2],['=HYPERLINK("evil")',1]]);assert.match(csv,/"A ""coin""",-2/);assert.match(csv,/"'=HYPERLINK/);
});
test('PNG encoding failure rejects clearly and always releases its temporary image URL',async()=>{
 let revoked=0;const chart={takeScreenshot:()=>({width:100,height:100,getContext:()=>({drawImage(){},fillText(){}}),toBlob:callback=>callback(null)})};
 const image={set src(value){queueMicrotask(()=>this.onload());}};
 await assert.rejects(capturePNG({chart,overlay:'<svg/>',watermark:'snapshot',createImage:()=>image,createURL:()=> 'blob:test',revokeURL:()=>revoked++}),/encode/i);assert.equal(revoked,1);
});
