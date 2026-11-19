import {normalizeCandles} from './analytics.js';
const MIN_BARS=28,WINDOW=120,BINS=18;
const DAY=86_400, WEEK=7*DAY, MONDAY_OFFSET=4*DAY;
const pin=(id,label,color,price,from,to)=>({id,label,color,type:'horizontal',points:[{time:from,price},{time:to,price}]});
function groupPivots(rows,wiggle,kind,cutoff,step){
 const groups=[];
 for(let i=2;i<rows.length-2;i++){
  const b=rows[i],p=b[kind];const sides=[rows[i-2],rows[i-1],rows[i+1],rows[i+2]];
  if(b.time+3*step>cutoff||!sides.every(x=>kind==='high'?x.high<p:x.low>p))continue;
  const a={time:b.time,price:p,confirmedAt:b.time+3*step,kind};
  const near=groups.find(g=>Math.abs(g.price-p)<=wiggle);
  if(near){near.anchors.push(a);near.price+=(p-near.price)/near.anchors.length;}
  else groups.push({price:p,anchors:[a]});
 }
 return groups.filter(g=>g.anchors.length>=2);
}
function priceProfile(rows){
 const min=Math.min(...rows.map(b=>b.low)),max=Math.max(...rows.map(b=>b.high)),width=(max-min)/BINS;
 if(!(width>0)||!Number.isFinite(width))return null;
 const bins=Array.from({length:BINS},(_,i)=>({min:min+i*width,max:min+(i+1)*width,volume:0}));
 for(const b of rows){
  if(!b.volume)continue;
  if(b.high===b.low){bins[Math.min(BINS-1,Math.max(0,Math.floor((b.close-min)/width)))].volume+=b.volume;continue;}
  for(const bin of bins){const intersection=Math.max(0,Math.min(b.high,bin.max)-Math.max(b.low,bin.min));bin.volume+=b.volume*(intersection/(b.high-b.low));}
 }
 const total=bins.reduce((sum,bin)=>sum+bin.volume,0);
 if(!Number.isFinite(total)||total<=0)return null;
 const peak=bins.reduce((best,bin,i)=>bin.volume>bins[best].volume?i:best,0);
 let left=peak,right=peak,amount=bins[peak].volume;
 while(amount<total*.70&&(left>0||right<BINS-1)){
  if(right===BINS-1||left>0&&bins[left-1].volume>=bins[right+1].volume){--left;amount+=bins[left].volume;}
  else{++right;amount+=bins[right].volume;}
 }
 return {label:'Candle-volume profile',detail:'Each closed candle’s volume is distributed evenly across its high–low span. These are approximate levels, not trade-by-trade volume.',bins,total,window:rows.length,levels:[{name:'Heavy activity price',price:(bins[peak].min+bins[peak].max)/2},{name:'70% area low',price:bins[left].min},{name:'70% area high',price:bins[right].max}]};
}

export function previousPeriodLevels(bars,step,visibleTime,cutoff,key){
 const weekly=key==='prev-week';
 const pivots=key==='daily-pivots';
 if(!weekly&&!pivots&&key!=='prev-day'||!Number.isSafeInteger(step)||step<=0||DAY%step||
  !Number.isFinite(visibleTime)||!Number.isFinite(cutoff))return null;
 const period=weekly?WEEK:DAY,offset=weekly?MONDAY_OFFSET:0;
 const end=Math.floor((visibleTime-offset)/period)*period+offset;
 const begin=end-period;
 if(cutoff<end)return null;
 const rows=bars.filter(bar=>bar.time>=begin&&bar.time<end);
 if(rows.length!==period/step||!rows.every((bar,index)=>bar.time===begin+index*step))return null;
 const high=rows.reduce((best,bar)=>bar.high>best.high?bar:best);
 const low=rows.reduce((best,bar)=>bar.low<best.low?bar:best);
 const last=rows.at(-1),word=weekly?'week':'day';
 if(pivots){
  const pivot=(high.high+low.low+last.close)/3;
  const levels=[{name:'Pivot',price:pivot},{name:'Resistance 1',price:2*pivot-low.low},{name:'Support 1',price:2*pivot-high.high}];
  return {label:'Daily pivot levels',detail:'Uses the previous complete UTC day. The pivot averages its high, low and close. R1 and S1 mark the first resistance and support references.',startTime:begin,endTime:end,levels,
   guides:levels.map(({name,price},i)=>pin(`${key}-${i}`,name,['violet','gold','cyan'][i],price,end,visibleTime))};
 }
 const levels=[
  {name:'High',price:high.high,time:high.time},
  {name:'Low',price:low.low,time:low.time},
  {name:'Close',price:last.close,time:last.time}
 ];
 const guides=levels.map(({name,price},i)=>pin(`${key}-${i}`,`Previous ${word} ${name.toLowerCase()}`,['gold','cyan','violet'][i],price,end,visibleTime));
 return {
  label:`Previous ${word} levels`,
  detail:`High, low and closing price from the previous complete ${weekly?'Monday–Sunday UTC week':'UTC day'}. The lines begin when that ${word} has closed.`,
  startTime:begin,endTime:end,levels,guides
 };
}
export function structureTools(bars,step,closedThrough){
 const empty={zones:null,profile:null,guides:[]};if(!Number.isSafeInteger(step)||step<=0||!Number.isFinite(closedThrough))return empty;
 const closed=normalizeCandles(bars).filter(b=>b.time%step===0&&b.time+step<=closedThrough);
 let start=closed.length-1;while(start>0&&closed.length-start<WINDOW&&closed[start].time-closed[start-1].time===step)start--;
 const rows=closed.slice(start);if(rows.length<MIN_BARS)return empty;
 const latest=rows.at(-1),first=rows[0],wiggle=Math.max(latest.close*.001,rows.slice(-24).reduce((mean,b)=>mean+(b.high-b.low)/24,0)*.4);
 const above=groupPivots(rows,wiggle,'high',closedThrough,step).filter(x=>x.price>latest.close).sort((a,b)=>a.price-b.price)[0];
 const below=groupPivots(rows,wiggle,'low',closedThrough,step).filter(x=>x.price<latest.close).sort((a,b)=>b.price-a.price)[0];
 const levels=[below&&{name:'Support reference',price:below.price,anchors:below.anchors},above&&{name:'Resistance reference',price:above.price,anchors:above.anchors}].filter(Boolean);
 const zones=levels.length?{label:'Confirmed swing levels',detail:'Groups earlier confirmed highs or lows near the same price. Each level needs at least two distinct pivots. These are areas to watch, not barriers.',levels}:null;
 const profile=priceProfile(rows);
 return {zones,profile,guides:[...(zones?.levels??[]).map((x,i)=>pin('zones-'+i,x.name,i?'gold':'cyan',x.price,x.anchors[0].time,latest.time)),...(profile?.levels??[]).map((x,i)=>pin('profile-'+i,x.name,i?'cyan':'gold',x.price,first.time,latest.time))]};
}
