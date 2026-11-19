import {atr, ema, normalizeCandles} from './analytics.js';
const MIN_BARS=28,WINDOW=120,BINS=18;
const DAY=86_400, WEEK=7*DAY, MONDAY_OFFSET=4*DAY;
const pin=(id,label,color,price,from,to,shortLabel=label)=>({id,label,shortLabel,color,type:'horizontal',points:[{time:from,price},{time:to,price}]});
const zoneGuide=(id,label,shortLabel,color,top,bottom,from,to)=>({id,label,shortLabel,color,type:'zone',points:[{time:from,price:top},{time:to,price:bottom}]});
const pivotGuide=(id,label,color,price,time,side)=>({id,label,shortLabel:label,color,type:'pivot',side,points:[{time,price}]});
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
 return {label:'Candle-volume profile',detail:'Each closed candle’s volume is distributed evenly across its high–low span. These are approximate levels, not trade-by-trade volume.',bins,total,window:rows.length,levels:[{name:'Heavy activity price',shortLabel:'POC',price:(bins[peak].min+bins[peak].max)/2},{name:'70% area low',shortLabel:'VAL 70%',price:bins[left].min},{name:'70% area high',shortLabel:'VAH 70%',price:bins[right].max}]};
}

function detectFairValueGaps(rows,atrSeries,latest,dist){
 const bullish=[],bearish=[];
 for(let i=1;i<rows.length-1;i++){
  const prev=rows[i-1],curr=rows[i],next=rows[i+1];
  const barAtr=atrSeries[i];
  const minGap=Number.isFinite(barAtr)&&barAtr>0?barAtr*0.25:(curr.high-curr.low)*0.15;
  if(next.low>prev.high&&(next.low-prev.high)>=minGap){
   const bottom=prev.high,top=next.low;
   let mitigated=false;
   for(let j=i+2;j<rows.length;j++){if(rows[j].low<=bottom){mitigated=true;break;}}
   if(!mitigated)bullish.push({side:'bullish',top,bottom,price:(top+bottom)/2,time:curr.time,confirmedAt:next.time});
  }else if(next.high<prev.low&&(prev.low-next.high)>=minGap){
   const top=prev.low,bottom=next.high;
   let mitigated=false;
   for(let j=i+2;j<rows.length;j++){if(rows[j].high>=top){mitigated=true;break;}}
   if(!mitigated)bearish.push({side:'bearish',top,bottom,price:(top+bottom)/2,time:curr.time,confirmedAt:next.time});
  }
 }
 const nearBull=bullish.filter(z=>z.bottom<=latest.close*1.03).sort((a,b)=>Math.abs(latest.close-a.price)-Math.abs(latest.close-b.price)).slice(0,2);
 const nearBear=bearish.filter(z=>z.top>=latest.close*0.97).sort((a,b)=>Math.abs(latest.close-a.price)-Math.abs(latest.close-b.price)).slice(0,2);
 const active=[...nearBear,...nearBull];
 if(!active.length)return {fvg:null,guides:[]};
 const levels=active.map((z,idx)=>({
  name:`${z.side==='bullish'?'Bullish':'Bearish'} FVG ${idx+1}`,
  shortLabel:z.side==='bullish'?'FVG+':'FVG-',
  side:z.side,price:z.price,top:z.top,bottom:z.bottom,time:z.time,distancePct:dist(z.price)
 }));
 const guides=levels.map((lv,i)=>zoneGuide(`fvg-${i}`,lv.name,lv.shortLabel,lv.side==='bullish'?'up':'down',lv.top,lv.bottom,lv.time,latest.time));
 return {
  fvg:{label:'Fair value gaps (FVG)',detail:'Unmitigated 3-candle price imbalances wider than 0.25× ATR(14) on closed bars. Zones disappear once price trades fully through them.',levels},
  guides
 };
}

function detectOrderBlocks(rows,atrSeries,latest,dist){
 const demand=[],supply=[];
 for(let i=3;i<rows.length-1;i++){
  const impulse=rows[i],barAtr=atrSeries[i];
  if(!Number.isFinite(barAtr)||barAtr<=0)continue;
  const body=Math.abs(impulse.close-impulse.open);
  const range=impulse.high-impulse.low;
  if(body<barAtr*0.9&&range<barAtr*1.5)continue;
  const prevHigh=Math.max(rows[i-1].high,rows[i-2].high,rows[i-3].high);
  const prevLow=Math.min(rows[i-1].low,rows[i-2].low,rows[i-3].low);
  if(impulse.close>impulse.open&&impulse.close>prevHigh){
   // Last opposing bearish candle in the 3 bars before impulse
   let ob=null;
   for(let k=i-1;k>=Math.max(0,i-3);k--){if(rows[k].close<rows[k].open){ob=rows[k];break;}}
   if(!ob)ob=rows[i-1];
   let broken=false;
   for(let j=i+1;j<rows.length;j++){if(rows[j].close<ob.low){broken=true;break;}}
   if(!broken)demand.push({side:'demand',top:Math.max(ob.open,ob.close),bottom:ob.low,price:(Math.max(ob.open,ob.close)+ob.low)/2,time:ob.time,strength:range/barAtr});
  }else if(impulse.close<impulse.open&&impulse.close<prevLow){
   let ob=null;
   for(let k=i-1;k>=Math.max(0,i-3);k--){if(rows[k].close>rows[k].open){ob=rows[k];break;}}
   if(!ob)ob=rows[i-1];
   let broken=false;
   for(let j=i+1;j<rows.length;j++){if(rows[j].close>ob.high){broken=true;break;}}
   if(!broken)supply.push({side:'supply',top:ob.high,bottom:Math.min(ob.open,ob.close),price:(ob.high+Math.min(ob.open,ob.close))/2,time:ob.time,strength:range/barAtr});
  }
 }
 const pick=(list,below)=>list
  .filter(z=>below?z.bottom<=latest.close:z.top>=latest.close)
  .sort((a,b)=>Math.abs(latest.close-a.price)-Math.abs(latest.close-b.price))
  .slice(0,2);
 const chosen=[...pick(supply,false),...pick(demand,true)];
 if(!chosen.length)return {orderBlocks:null,guides:[]};
 const levels=chosen.map(z=>({
  name:z.side==='demand'?'Demand order block':'Supply order block',
  shortLabel:z.side==='demand'?'Demand OB':'Supply OB',
  side:z.side,price:z.price,top:z.top,bottom:z.bottom,time:z.time,distancePct:dist(z.price)
 }));
 const guides=levels.map((lv,i)=>zoneGuide(`order-blocks-${i}`,lv.name,lv.shortLabel,lv.side==='demand'?'cyan':'gold',lv.top,lv.bottom,lv.time,latest.time));
 return {
  orderBlocks:{label:'Order blocks (Supply & Demand)',detail:'Unmitigated origin candles preceding confirmed impulsive breakouts (>= 1.5× ATR displacement). Zones invalidate on a closed break beyond their outer wick.',levels},
  guides
 };
}

function detectAtrChannels(rows,atrSeries,latest,dist){
 const closes=rows.map(b=>b.close);
 const basis=ema(closes,20).at(-1);
 const vol=atrSeries.at(-1);
 if(!Number.isFinite(basis)||!Number.isFinite(vol)||vol<=0)return {atrBands:null,guides:[]};
 const fromTime=rows[Math.max(0,rows.length-24)].time;
 const levels=[
  {name:'Upper outer (+2.5× ATR)',shortLabel:'+2.5 ATR',color:'down',price:basis+2.5*vol},
  {name:'Upper channel (+1.5× ATR)',shortLabel:'+1.5 ATR',color:'gold',price:basis+1.5*vol},
  {name:'Volatility mean (EMA 20)',shortLabel:'EMA 20',color:'violet',price:basis},
  {name:'Lower channel (-1.5× ATR)',shortLabel:'-1.5 ATR',color:'cyan',price:basis-1.5*vol},
  {name:'Lower outer (-2.5× ATR)',shortLabel:'-2.5 ATR',color:'up',price:basis-2.5*vol},
 ].filter(lv=>lv.price>0).map(lv=>({...lv,distancePct:dist(lv.price)}));
 const guides=levels.map((lv,i)=>pin(`atr-bands-${i}`,lv.name,lv.color,lv.price,fromTime,latest.time,lv.shortLabel));
 return {
  atrBands:{label:'ATR volatility channels',detail:`20-candle EMA (${basis.toFixed(2)}) framed by ±1.5× and ±2.5× Wilder ATR(14) envelopes from closed candles.`,levels},
  guides
 };
}

function detectMarketStructure(rows,step,cutoff,latest,dist){
 const pivots=[];
 for(let i=2;i<rows.length-2;i++){
  const b=rows[i];
  if(b.time+3*step>cutoff)continue;
  const sides=[rows[i-2],rows[i-1],rows[i+1],rows[i+2]];
  const isHigh=sides.every(x=>x.high<b.high);
  const isLow=sides.every(x=>x.low>b.low);
  if(isHigh===isLow)continue;
  const kind=isHigh?'high':'low';
  const prev=pivots.at(-1);
  if(prev&&prev.kind===kind){
   if(kind==='high'?b.high>prev.price:b.low<prev.price)pivots[pivots.length-1]={index:i,time:b.time,price:b[kind],kind,confirmedAt:b.time+3*step};
  }else{
   pivots.push({index:i,time:b.time,price:b[kind],kind,confirmedAt:b.time+3*step});
  }
 }
 if(pivots.length<3)return {structure:null,guides:[]};
 let lastHigh=null,lastLow=null;
 const tagged=[];
 for(const p of pivots){
  let tag=p.kind==='high'?'H':'L';
  if(p.kind==='high'){
   if(lastHigh)tag=p.price>lastHigh.price?'HH':'LH';
   lastHigh=p;
  }else{
   if(lastLow)tag=p.price>lastLow.price?'HL':'LL';
   lastLow=p;
  }
  tagged.push({...p,tag});
 }
 // Detect causal BOS / CHoCH breaks using only already-confirmed pivots
 const breaks=[];
 let trend=null;
 let activeHigh=null,activeLow=null;
 let brokenHigh=false,brokenLow=false;
 let pIdx=0;
 for(let i=0;i<rows.length;i++){
  const b=rows[i];
  while(pIdx<tagged.length&&tagged[pIdx].confirmedAt<=b.time+step){
   const tp=tagged[pIdx++];
   if(tp.kind==='high'){activeHigh=tp;brokenHigh=false;}
   else{activeLow=tp;brokenLow=false;}
  }
  if(activeHigh&&!brokenHigh&&b.close>activeHigh.price){
   const type=trend==='down'?'CHoCH':'BOS';
   breaks.push({type,direction:'up',label:`${type} ↑`,fullLabel:type==='CHoCH'?'Bullish Change of Character':'Bullish Break of Structure',price:activeHigh.price,fromTime:activeHigh.time,breakTime:b.time});
   trend='up';brokenHigh=true;
  }else if(activeLow&&!brokenLow&&b.close<activeLow.price){
   const type=trend==='up'?'CHoCH':'BOS';
   breaks.push({type,direction:'down',label:`${type} ↓`,fullLabel:type==='CHoCH'?'Bearish Change of Character':'Bearish Break of Structure',price:activeLow.price,fromTime:activeLow.time,breakTime:b.time});
   trend='down';brokenLow=true;
  }
 }
 const recentBreaks=breaks.slice(-3);
 const recentPivots=tagged.slice(-5);
 const levels=[
  ...recentBreaks.slice().reverse().map(br=>({name:`${br.fullLabel} (${br.type})`,shortLabel:br.label,price:br.price,time:br.breakTime,distancePct:dist(br.price)})),
  ...recentPivots.slice(-2).reverse().map(p=>({name:`Latest swing ${p.tag}`,shortLabel:p.tag,price:p.price,time:p.time,distancePct:dist(p.price)})),
 ];
 const guides=[
  ...recentBreaks.map((br,i)=>({
   id:`structure-break-${i}`,type:'horizontal',label:br.fullLabel,shortLabel:br.label,
   color:br.direction==='up'?'up':'down',bounded:true,
   points:[{time:br.fromTime,price:br.price},{time:br.breakTime,price:br.price}]
  })),
  ...recentPivots.map((p,i)=>pivotGuide(`structure-pivot-${i}`,p.tag,p.kind==='high'?'gold':'cyan',p.price,p.time,p.kind))
 ];
 return {
  structure:{label:'Market structure (BOS / CHoCH)',detail:`Tracks confirmed alternating swing pivots (HH/HL/LH/LL) and closed-candle breaks of structure. Prevailing structure: ${trend==='up'?'bullish':trend==='down'?'bearish':'transitional'}.`,trend,levels,breaks:recentBreaks,pivots:recentPivots},
  guides
 };
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
  const levels=[{name:'Pivot',shortLabel:'Pivot',price:pivot},{name:'Resistance 1',shortLabel:'R1',price:2*pivot-low.low},{name:'Support 1',shortLabel:'S1',price:2*pivot-high.high}];
  return {label:'Daily pivot levels',detail:'Uses the previous complete UTC day. The pivot averages its high, low and close. R1 and S1 mark the first resistance and support references.',startTime:begin,endTime:end,levels,
   guides:levels.map(({name,shortLabel,price},i)=>pin(`${key}-${i}`,name,['violet','gold','cyan'][i],price,end,visibleTime,shortLabel))};
 }
 const levels=[
  {name:'High',shortLabel:weekly?'PWH':'PDH',price:high.high,time:high.time},
  {name:'Low',shortLabel:weekly?'PWL':'PDL',price:low.low,time:low.time},
  {name:'Close',shortLabel:weekly?'PWC':'PDC',price:last.close,time:last.time}
 ];
 const guides=levels.map(({name,shortLabel,price},i)=>pin(`${key}-${i}`,`Previous ${word} ${name.toLowerCase()}`,['gold','cyan','violet'][i],price,end,visibleTime,shortLabel));
 return {
  label:`Previous ${word} levels`,
  detail:`High, low and closing price from the previous complete ${weekly?'Monday–Sunday UTC week':'UTC day'}. The lines begin when that ${word} has closed.`,
  startTime:begin,endTime:end,levels,guides
 };
}
export function structureTools(bars,step,closedThrough){
 const empty={zones:null,profile:null,fvg:null,'order-blocks':null,'atr-bands':null,structure:null,guides:[]};
 if(!validCutoff(step,closedThrough))return empty;
 const rows=closedWindow(bars,step,closedThrough,WINDOW);if(rows.length<MIN_BARS)return empty;
 const latest=rows.at(-1),first=rows[0];
 const atrSeries=atr(rows,14);
 const atrValue=atrSeries.at(-1);
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
  supports[0]&&{name:'Support reference',shortLabel:'S1',price:supports[0].price,anchors:supports[0].anchors,distancePct:dist(supports[0].price),role:'support'},
  supports[1]&&{name:'Secondary support',shortLabel:'S2',price:supports[1].price,anchors:supports[1].anchors,distancePct:dist(supports[1].price),role:'support'},
  resistances[0]&&{name:'Resistance reference',shortLabel:'R1',price:resistances[0].price,anchors:resistances[0].anchors,distancePct:dist(resistances[0].price),role:'resistance'},
  resistances[1]&&{name:'Secondary resistance',shortLabel:'R2',price:resistances[1].price,anchors:resistances[1].anchors,distancePct:dist(resistances[1].price),role:'resistance'},
 ].filter(Boolean);
 const zones=levels.length?{label:'Confirmed swing levels',detail:'Clusters confirmed swing highs and lows using an ATR-scaled tolerance. Each level needs at least two distinct pivots confirmed by two subsequent closes. These are areas to watch, not barriers.',levels}:null;
 const profileWithDist=profile?{...profile,levels:profile.levels.map(lv=>({...lv,distancePct:dist(lv.price)}))}:null;
 const {fvg,guides:fvgGuides}=detectFairValueGaps(rows,atrSeries,latest,dist);
 const {orderBlocks,guides:obGuides}=detectOrderBlocks(rows,atrSeries,latest,dist);
 const {atrBands,guides:atrGuides}=detectAtrChannels(rows,atrSeries,latest,dist);
 const {structure,guides:structureGuides}=detectMarketStructure(rows,step,closedThrough,latest,dist);
 return {
  zones,
  profile:profileWithDist,
  fvg,
  'order-blocks':orderBlocks,
  'atr-bands':atrBands,
  structure,
  guides:[
   ...(zones?.levels??[]).map((x,i)=>pin('zones-'+i,x.name,x.role==='resistance'?'gold':'cyan',x.price,x.anchors[0].time,latest.time,x.shortLabel)),
   ...(profileWithDist?.levels??[]).map((x,i)=>pin('profile-'+i,x.name,i?'cyan':'gold',x.price,first.time,latest.time,x.shortLabel)),
   ...fvgGuides,
   ...obGuides,
   ...atrGuides,
   ...structureGuides,
  ]
 };
}
