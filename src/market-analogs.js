import {normalizeCandles} from './analytics.js';
import {INTERVALS} from './preferences.js';

const LOOKBACK=12,HORIZON=5,SEPARATION=LOOKBACK+HORIZON+1,MIN_MATCHES=8,NEIGHBORS=20;
const average=(xs)=>xs.reduce((sum,x)=>sum+x,0)/xs.length;
const quantile=(values,q)=>{
 const a=[...values].sort((x,y)=>x-y),i=(a.length-1)*q,j=Math.floor(i);
 return a[j]+(a[Math.ceil(i)]-a[j])*(i-j);
};
const features=(rows,i)=>{
 const closes=rows.slice(i-LOOKBACK,i+1);
 const close=Math.log(rows[i].close),first=Math.log(closes[0].close);
 return [close-first,close-average(closes.map(b=>Math.log(b.close))),average(closes.map(b=>Math.log(b.high)-Math.log(b.low)))];
};
const percent=(a,b)=>Math.expm1(Math.log(b.close)-Math.log(a.close))*100;
export function studyAnalogs(bars,interval,closedThrough){
 const step=INTERVALS[interval],miss=reason=>({ready:false,reason});
 if(!step||!Number.isFinite(closedThrough))return miss('Wait for a confirmed chart snapshot.');
 const all=normalizeCandles(bars).filter(b=>b.time+step<=closedThrough);
 let start=all.length-1;
 while(start>0&&all[start].time-all[start-1].time===step)start--;
 const rows=all.slice(start),query=rows.length-1;
 if(rows.length<225)return miss('Load more earlier candles or use a wider interval. The comparison needs at least 225 consecutive closed candles.');
 const candidates=[];
 for(let i=LOOKBACK;i<=query-SEPARATION;i++){
  const f=features(rows,i),result=percent(rows[i],rows[i+HORIZON]);
  if(f.every(Number.isFinite)&&Number.isFinite(result))candidates.push({i,f,result,time:rows[i].time+step,outcomeTime:rows[i+HORIZON].time+step});
 }
 if(candidates.length<MIN_MATCHES)return miss('Too few complete historical examples.');
 const queryFeatures=features(rows,query),means=queryFeatures.map((_,i)=>average(candidates.map(x=>x.f[i])));
 const scales=means.map((mean,i)=>Math.max(1e-8,Math.sqrt(average(candidates.map(x=>(x.f[i]-mean)**2)))));
 for(const row of candidates)row.distance=Math.sqrt(average(row.f.map((v,i)=>((v-queryFeatures[i])/scales[i])**2)));
 const baseline=candidates.filter((_,i)=>i%SEPARATION===0).map(x=>x.result);
 const chosen=[];
 for(const row of [...candidates].sort((a,b)=>a.distance-b.distance||b.i-a.i)){
  if(row.distance>2||chosen.length===NEIGHBORS)break;
  if(chosen.every(x=>Math.abs(x.i-row.i)>=SEPARATION))chosen.push(row);
 }
 if(chosen.length<MIN_MATCHES)return miss('This market pattern did not have enough close historical matches.');
 const outcomes=chosen.map(x=>x.result);
 return {ready:true,sample:rows.length,horizon:HORIZON,closedThrough:rows[query].time+step,count:chosen.length,up:outcomes.filter(x=>x>0).length,down:outcomes.filter(x=>x<0).length,flat:outcomes.filter(x=>x===0).length,median:quantile(outcomes,.5),lower:quantile(outcomes,.25),upper:quantile(outcomes,.75),baselineMedian:quantile(baseline,.5),baselineCount:baseline.length,matches:chosen.map(({time,outcomeTime,result,distance})=>({time,outcomeTime,result,distance}))};
}
