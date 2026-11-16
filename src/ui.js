export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const num=(v,d=2)=>Number.isFinite(+v)&&v!==null?new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(+v):'—';
export const compact=v=>Number.isFinite(+v)&&v!==null?new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(+v):'—';
export const price=(v,quote='$')=>Number.isFinite(+v)&&v!==null?quote+new Intl.NumberFormat('en-US',{minimumFractionDigits:+v>=1?2:0,maximumFractionDigits:+v>=100?2:+v>=1?4:8}).format(+v):'—';
export const pct=v=>Number.isFinite(+v)&&v!==null?`${+v>0?'+':''}${num(+v)}%`:'—';
export const tone=v=>+v>=0?'positive':'negative';
export const ago=v=>{const d=Date.parse(v);if(!Number.isFinite(d))return 'time unavailable';const n=Math.max(0,(Date.now()-d)/1000);return n<60?'just now':n<3600?`${Math.floor(n/60)}m ago`:n<86400?`${Math.floor(n/3600)}h ago`:`${Math.floor(n/86400)}d ago`;};
export const stamp=v=>v?new Date(v).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}):'Unavailable';
export const icon=(name,cls='')=>`<i data-lucide="${name}" class="${cls}"></i>`;
export function download(name,content,type='text/plain'){const u=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
export function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.remove('show'),4000);}
export function safeStorage(){try{return localStorage;}catch{return {getItem:()=>null,setItem:()=>{throw Error('Storage unavailable');}};}}
