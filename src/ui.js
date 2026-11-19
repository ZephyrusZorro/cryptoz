import {downloadBlob} from './exports.js';
import {asNumber,formatter} from './numbers.js';
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const num=(value,digits=2)=>{const n=asNumber(value),precision=Math.max(0,Math.min(12,Math.trunc(digits)||0));if(n===null)return '—';return formatter(n!==0&&Math.abs(n)<.5*10**(-precision)?{notation:'scientific',maximumSignificantDigits:6}:{maximumFractionDigits:precision}).format(n);};
export const compact=(value,currency)=>{const n=asNumber(value);return n===null?'—':formatter({notation:'compact',maximumFractionDigits:2},currency==='INR'?'en-IN':'en-US').format(n);};
export const price=(value,quote='$')=>{const n=asNumber(value);if(n===null)return '—';const absolute=Math.abs(n),locale=quote==='₹'?'en-IN':'en-US';const options=absolute>0&&absolute<1e-8?{notation:'scientific',maximumSignificantDigits:6}:{minimumFractionDigits:absolute>=1||absolute===0?2:0,maximumFractionDigits:absolute>=100?2:absolute>=1?4:8};const formatted=formatter(options,locale).format(absolute);return (n<0?'-':'')+quote+formatted;};
export const pct=value=>{const n=asNumber(value);if(n===null)return '—';const abs=Math.abs(n),sign=n>0?'+':'';if(abs>0&&abs<0.005){if(abs>=0.0001)return `${sign}${formatter({minimumFractionDigits:3,maximumFractionDigits:4}).format(n)}%`;return `${n>0?'<0.0001':'>-0.0001'}%`;}return `${sign}${num(n)}%`;};
export const tone=value=>{const n=asNumber(value);return n===null||n===0?'muted':n>0?'positive':'negative';};
export const ago=v=>{const d=Date.parse(v);if(!Number.isFinite(d))return 'time unavailable';const n=Math.max(0,(Date.now()-d)/1000);return n<60?'just now':n<3600?`${Math.floor(n/60)}m ago`:n<86400?`${Math.floor(n/3600)}h ago`:`${Math.floor(n/86400)}d ago`;};
export const stamp=v=>v?new Date(v).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}):'Unavailable';
export const icon=(name,cls='')=>`<i data-lucide="${name}" class="${cls}"></i>`;
export function sectionHeading(title,description,{glyph='activity',action='',className=''}={}){
 return `<header class="section-heading ${className}"><div class="heading-identity"><span class="heading-icon" aria-hidden="true">${icon(glyph)}</span><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div></div>${action?`<div class="heading-actions">${action}</div>`:''}</header>`;
}
export function download(name,content,type='text/plain'){downloadBlob(name,new Blob([content],{type}));}
export function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.remove('show'),4000);}
export function safeStorage(){try{return localStorage;}catch{return {getItem:()=>null,setItem:()=>{throw Error('Storage unavailable');}};}}
