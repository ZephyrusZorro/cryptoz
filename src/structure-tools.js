import {atr, normalizeCandles} from './analytics.js';
const MIN_BARS=28,WINDOW=120,BINS=18;
const DAY=86_400, WEEK=7*DAY, MONDAY_OFFSET=4*DAY;
const pin=(id,label,color,price,from,to)=>({id,label,color,type:'horizontal',points:[{time:from,price},{time:to,price}]});
const validCutoff=(step,cutoff)=>Number.isSafeInteger(step)&&step>0&&Number.isFinite(cutoff);
function closedWindow(bars,step,cutoff,limit){
 const closed=normalizeCandles(bars).filter(bar=>bar.time%step===0&&bar.time+step<=cutoff);
 let start=closed.length-1;
 while(start>0&&closed.length-start<limit&&closed[start].time-closed[start-1].time===step)start--;
 return closed.slice(start);
}

export function peakVolumeVwap(bars,step,cutoff){
 if(!validCutoff(step,cutoff))return null;
 const rows=closedWindow(bars,step,cutoff,60);
 if(rows.length<20)return null;
 const anchor=rows.reduce((best,bar,i)=>bar.volume>=rows[best].volume?i:best,0);
 if(rows[anchor].volume<=0)return null;
 let total=0,weighted=0;
 const series=rows.slice(anchor).map(bar=>{
  total+=bar.volume;
  weighted+=(bar.high+bar.low+bar.close)/3*bar.volume;
  return {time:bar.time,value:weighted/total};
 });
 return {label:'Anchored VWAP',detail:`Starts at the highest-volume candle in the latest ${rows.length} consecutive closed candles. Each candle contributes its average of high, low and close, weighted by venue volume. The anchor can move as the window advances.`,
  anchor:rows[anchor].time,series,levels:[{name:'Anchor candle typical price',price:series[0].value,time:rows[anchor].time},{name:'Latest anchored VWAP',price:series.at(-1).value,time:series.at(-1).time}]};
}
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
 const empty={zones:null,profile:null,guides:[]};if(!validCutoff(step,closedThrough))return empty;
 const rows=closedWindow(bars,step,closedThrough,WINDOW);if(rows.length<MIN_BARS)return empty;
 const latest=rows.at(-1),first=rows[0];
 const atrValue=atr(rows,14).at(-1);
 const fallbackRange=rows.slice(-24).reduce((mean,b)=>mean+(b.high-b.low)/24,0);
 const wiggle=Math.max(latest.close*.001,(Number.isFinite(atrValue)&&atrValue>0?atrValue:fallbackRange)*.45);
 const profile=priceProfile(rows);
 const pocPrice=profile?.levels?.[0]?.price??null;
 const scoreZone=group=>{
  const latestTouch=Math.max(...group.anchors.map(a=>a.time));
  const recency=Math.max(0,1-(latest.time-latestTouch)/Math.max(step*WINDOW,1));
  const volumeBoost=pocPrice!==null&&Math.abs(group.price-pocPrice)<=wiggle*1.5?0.6:0;
  return group.anchors.length+recency*0.8+volumeBoost;
 };
 const pickSide=(groups,ascending)=>{
  const sorted=[...groups].sort((a,b)=>(ascending?a.price-b.price:b.price-a.price));
  if(sorted.length<=1)return sorted;
  const primary=sorted[0];
  const secondary=sorted.slice(1).filter(g=>Math.abs(g.price-primary.price)>wiggle*1.8)
   .sort((a,b)=>scoreZone(b)-scoreZone(a))[0];
  return secondary?[primary,secondary]:[primary];
 };
 const resistances=pickSide(groupPivots(rows,wiggle,'high',closedThrough,step).filter(x=>x.price>latest.close),true);
 const supports=pickSide(groupPivots(rows,wiggle,'low',closedThrough,step).filter(x=>x.price<latest.close),false);
 const dist=price=>latest.close>0?(price/latest.close-1)*100:null;
 const levels=[
  supports[0]&&{name:'Support reference',price:supports[0].price,anchors:supports[0].anchors,distancePct:dist(supports[0].price),role:'support'},
  supports[1]&&{name:'Secondary support',price:supports[1].price,anchors:supports[1].anchors,distancePct:dist(supports[1].price),role:'support'},
  resistances[0]&&{name:'Resistance reference',price:resistances[0].price,anchors:resistances[0].anchors,distancePct:dist(resistances[0].price),role:'resistance'},
  resistances[1]&&{name:'Secondary resistance',price:resistances[1].price,anchors:resistances[1].anchors,distancePct:dist(resistances[1].price),role:'resistance'},
 ].filter(Boolean);
 const zones=levels.length?{label:'Confirmed swing levels',detail:'Clusters confirmed swing highs and lows using an ATR-scaled tolerance. Each level needs at least two distinct pivots confirmed by two subsequent closes. These are areas to watch, not barriers.',levels}:null;
 const profileWithDist=profile?{...profile,levels:profile.levels.map(lv=>({...lv,distancePct:dist(lv.price)}))}:null;
 return {zones,profile:profileWithDist,guides:[...(zones?.levels??[]).map((x,i)=>pin('zones-'+i,x.name,x.role==='resistance'?'gold':'cyan',x.price,x.anchors[0].time,latest.time)),...(profileWithDist?.levels??[]).map((x,i)=>pin('profile-'+i,x.name,i?'cyan':'gold',x.price,first.time,latest.time))]};
}
