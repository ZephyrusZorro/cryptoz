const csvCell=value=>{
 if(typeof value==='number')return Number.isFinite(value)?String(value):'';
 let text=String(value??'');if(/^[\s]*[=+@-]|^[\t\r]/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
};
export const serializeCSV=(headers,rows)=>[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\n');
const artifacts=new Map();
export function downloadBlob(name,blob){
 const url=URL.createObjectURL(blob);artifacts.set(url,true);if(artifacts.size>5){const old=artifacts.keys().next().value;URL.revokeObjectURL(old);artifacts.delete(old);}
 const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.hidden=true;document.body.append(anchor);anchor.click();anchor.remove();
 document.querySelector('#download-notice')?.remove();const notice=document.createElement('aside');notice.id='download-notice';notice.setAttribute('role','status');const label=document.createElement('span');label.textContent='Export prepared';const link=document.createElement('a');link.href=url;link.download=name;link.textContent='Save '+name;const dismiss=document.createElement('button');dismiss.textContent='Dismiss';dismiss.setAttribute('aria-label','Dismiss export');dismiss.onclick=()=>notice.remove();notice.append(label,link,dismiss);document.body.append(notice);
 const timer=setTimeout(()=>{URL.revokeObjectURL(url);artifacts.delete(url);notice.remove();},60000);timer.unref?.();
}
export async function capturePNG({chart,overlay,watermark,color='#a6c6ff',createImage=()=>new Image(),createURL=blob=>URL.createObjectURL(blob),revokeURL=url=>URL.revokeObjectURL(url)}){
 const canvas=chart.takeScreenshot(),context=canvas.getContext('2d');if(!context)throw Error('Image canvas is unavailable');
 const url=createURL(new Blob([overlay],{type:'image/svg+xml'}));
 try{const image=createImage();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Drawing image timed out')),5000);timer.unref?.();image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(Error('Drawing image could not load'));};image.src=url;});context.drawImage(image,0,0,canvas.width,canvas.height);context.fillStyle=color;context.font='12px monospace';context.fillText(watermark,12,canvas.height-8);return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not encode PNG image')),'image/png'));
 }finally{revokeURL(url);}
}
