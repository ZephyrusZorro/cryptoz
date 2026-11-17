import {normalizeCandles,technicalSummary,bollinger} from './analytics.js';
export function signalSnapshot(bars,seconds=3600,now=Date.now()){
 if(!Number.isFinite(seconds)||seconds<=0)return {ready:false,count:0};
 const completed=normalizeCandles(bars).filter(b=>(b.time+seconds)*1000<=now);
 const summary=technicalSummary(completed);if(!summary.ready)return {ready:false,count:completed.length};
 const last=completed.at(-1),bb=bollinger(completed.map(b=>b.close));
 return {...summary,count:completed.length,time:last.time,close:last.close,bbUpper:bb.upper.at(-1),bbLower:bb.lower.at(-1),bandPosition:bb.upper.at(-1)===bb.lower.at(-1)?null:(last.close-bb.lower.at(-1))/(bb.upper.at(-1)-bb.lower.at(-1))*100};
}
