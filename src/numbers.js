export function asNumber(value){if(typeof value!=='number'&&typeof value!=='string'||typeof value==='string'&&!value.trim())return null;const n=Number(value);return Number.isFinite(n)?n:null;}
const formats=new Map();
export function formatter(options,locale='en-US'){const key=locale+JSON.stringify(options);if(!formats.has(key)){formats.set(key,new Intl.NumberFormat(locale,options));if(formats.size>40)formats.delete(formats.keys().next().value);}return formats.get(key);}
export function pricePrecision(value){const n=Math.abs(asNumber(value)??0);return n>=100?2:n>=1?4:n>0?Math.min(12,Math.max(8,2-Math.floor(Math.log10(n)))):8;}
