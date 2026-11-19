import {createVisualController} from './visual-controller.js';
import {palette} from './theme.js';
import * as echarts from 'echarts/core';
import { TreemapChart, ScatterChart, BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, MarkLineComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import {compact,num,pct} from './ui.js';
import {displayCompact,displayPrice} from './currency.js';
echarts.use([TreemapChart,ScatterChart,BarChart,LineChart,PieChart,GridComponent,TooltipComponent,LegendComponent,TitleComponent,MarkLineComponent,DataZoomComponent,CanvasRenderer]);

function heatColor(change,isLight){
 const c=Number.isFinite(change)?Math.max(-12,Math.min(12,change)):0;
 const t=Math.min(1,Math.abs(c)/10);
 if(Math.abs(c)<0.18)return isLight?'#6b7e96':'#2c3954';
 if(c>0){
  const r=Math.round(isLight?36-20*t:22-8*t);
  const g=Math.round(isLight?136+34*t:82+78*t);
  const b=Math.round(isLight?108+18*t:76+50*t);
  return `rgb(${r},${g},${b})`;
 }
 const r=Math.round(isLight?184+42*t:115+95*t);
 const g=Math.round(isLight?62-20*t:46+14*t);
 const b=Math.round(isLight?78-18*t:62+18*t);
 return `rgb(${r},${g},${b})`;
}

export function visualOptions(kind,data){
 const p=palette(),green=p.up,red=p.down,muted=p.text,grid=p.grid;
 const isLight=typeof document!=='undefined'&&document.documentElement.dataset.theme==='light';
 const compactView=typeof window!=='undefined'&&window.innerWidth<=700;
 const base={
  animation:typeof matchMedia!=='undefined'&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&document.documentElement.dataset.motion!=='reduced',
  animationDuration:240,animationDurationUpdate:160,
  textStyle:{color:muted,fontFamily:'DM Sans, system-ui, sans-serif'},
  tooltip:{trigger:'item',backgroundColor:p.panel,borderColor:p.border,borderWidth:1,padding:[8,11],textStyle:{color:p.text,fontSize:12}}
 };
 let option={};

 if(kind==='treemap'){
  const rows=Array.isArray(data)?data:(data?.rows??[]);
  const metric=Array.isArray(data)?'marketCap':(data?.metric==='volume'?'volume':'marketCap');
  const limit=Array.isArray(data)?45:(data?.limit??45);
  const totalMetric=rows.reduce((s,x)=>s+(x[metric]>0?x[metric]:0),0)||1;
  const items=rows.filter(x=>x[metric]>0).sort((a,b)=>b[metric]-a[metric]).slice(0,limit);
  option={
   series:[{
    type:'treemap',roam:false,nodeClick:false,breadcrumb:{show:false},squareRatio:1.15,
    label:{
     show:true,
     formatter:info=>{
      const share=info.value/totalMetric*100;
      return share>=2.2
       ?`{sym|${info.name}}\n{chg|${pct(info.data.change)}}\n{sub|${displayCompact(info.value)}}`
       :`{sym|${info.name}}\n{chg|${pct(info.data.change)}}`;
     },
     rich:{
      sym:{fontSize:13,fontWeight:700,color:'#f7fff9',lineHeight:18},
      chg:{fontSize:11,fontWeight:600,color:'rgba(247,255,249,0.92)',lineHeight:16},
      sub:{fontSize:10,color:'rgba(247,255,249,0.72)',lineHeight:15}
     }
    },
    upperLabel:{show:false},
    itemStyle:{borderWidth:2,borderColor:p.panel,gapWidth:3,borderRadius:6},
    levels:[{itemStyle:{borderWidth:0}}],
    data:items.map(x=>({
     name:x.symbol,fullName:x.name,value:x[metric],price:x.price,marketCap:x.marketCap,volume:x.volume,
     change:x.change,change7d:x.change7d,assetId:x.id,share:x[metric]/totalMetric*100,
     itemStyle:{color:heatColor(x.change,isLight)}
    }))
   }],
   tooltip:{
    ...base.tooltip,
    formatter:info=>{
     const d=info.data;if(!d)return '';
     const turn=d.marketCap>0&&d.volume>0?`${(d.volume/d.marketCap*100).toFixed(1)}%`:'—';
     return `<strong>${d.fullName} (${d.name})</strong><br/>Price: ${displayPrice(d.price,'USD')}<br/>24h: ${pct(d.change)}${Number.isFinite(d.change7d)?' · 7d: '+pct(d.change7d):''}<br/>Market cap: ${displayCompact(d.marketCap)} (${d.share.toFixed(1)}% share)<br/>24h volume: ${displayCompact(d.volume)} · Turnover ${turn}`;
    }
   }
  };
 }

 if(kind==='scatter'){
  const eligible=data.filter(x=>x.volume>10000&&Number.isFinite(x.change)).slice(0,100);
  const vols=eligible.map(x=>x.volume).sort((a,b)=>a-b);
  const medVol=vols.length?vols[Math.floor(vols.length/2)]:1e7;
  const maxCap=Math.max(...eligible.map(x=>x.marketCap||1),1);
  option={
   grid:compactView?{left:54,right:14,top:24,bottom:48}:{left:68,right:28,top:28,bottom:56},
   dataZoom:compactView?undefined:[{type:'inside',xAxisIndex:0,filterMode:'none'},{type:'inside',yAxisIndex:0,filterMode:'none'}],
   xAxis:{name:'24h change (%)',nameLocation:'middle',nameGap:30,splitLine:{lineStyle:{color:grid}},axisLabel:{color:muted,fontSize:compactView?10:11,hideOverlap:true,formatter:v=>`${v>0?'+':''}${v}%`}},
   yAxis:{name:compactView?'':'24h volume (log)',type:'log',splitLine:{lineStyle:{color:grid}},axisLabel:{formatter:value=>displayCompact(value),color:muted,fontSize:compactView?10:11}},
   series:[{
    type:'scatter',
    data:eligible.map(x=>({
     name:x.symbol,fullName:x.name,price:x.price,value:[x.change,x.volume,x.marketCap],assetId:x.id,
     itemStyle:{color:(x.change>=0?green:red)+'b8',borderColor:x.change>=0?green:red,borderWidth:1.5}
    })),
    symbolSize:v=>Math.max(compactView?7:9,Math.min(compactView?36:50,10+(compactView?28:40)*Math.pow(Math.max(v[2],1)/maxCap,0.34))),
    label:{show:true,formatter:info=>info.name,position:'top',color:muted,fontSize:compactView?9:10,fontWeight:600},
    labelLayout:{hideOverlap:true},
    markLine:{
     silent:true,symbol:'none',lineStyle:{type:'dashed',color:p.border,width:1.2},
     label:{color:muted,fontSize:10},
     data:[
      {xAxis:0,label:{formatter:'0% flat',position:'insideEndTop'}},
      {yAxis:medVol,label:{formatter:`Med ${displayCompact(medVol)}`,position:'insideEndTop'}}
     ]
    }
   }],
   tooltip:{
    ...base.tooltip,
    formatter:info=>{
     const d=info.data;if(!d)return '';
     const turn=d.value[2]>0?(d.value[1]/d.value[2]*100).toFixed(1)+'%':'—';
     return `<strong>${d.fullName} (${d.name})</strong><br/>Price: ${displayPrice(d.price,'USD')}<br/>24h change: ${pct(d.value[0])}<br/>24h volume: ${displayCompact(d.value[1])}<br/>Market cap: ${displayCompact(d.value[2])} · Turnover ${turn}`;
    }
   }
  };
 }

 if(kind==='sectors'){
  const rows=Array.isArray(data)?data:[];
  option={
   grid:compactView?{left:98,right:56,top:14,bottom:28}:{left:156,right:66,top:18,bottom:34},
   xAxis:{type:'value',axisLabel:{color:muted,fontSize:compactView?10:11,hideOverlap:true,formatter:v=>`${v>0?'+':''}${v}%`},splitLine:{lineStyle:{color:grid}}},
   yAxis:{type:'category',inverse:true,data:rows.map(r=>r.label),axisLabel:{color:p.text,fontSize:compactView?10.5:12,fontWeight:600,width:compactView?90:146,overflow:'truncate'},axisLine:{show:false},axisTick:{show:false}},
   series:[{
    type:'bar',barMaxWidth:24,
    data:rows.map(r=>({
     name:r.label,value:Number.isFinite(r.change)?Number(r.change.toFixed(2)):0,
     count:r.count,totalCap:r.totalCap,leader:r.leader,laggard:r.laggard,sectorKey:r.key,
     itemStyle:{color:r.change>=0?green:red,borderRadius:r.change>=0?[0,6,6,0]:[6,0,0,6]},
     label:{position:r.change>=0?'right':'left'}
    })),
    label:{show:true,formatter:info=>pct(info.value),color:p.text,fontSize:compactView?10:11,fontWeight:600},
    markLine:{silent:true,symbol:'none',lineStyle:{color:p.border,width:1},data:[{xAxis:0}]}
   }],
   tooltip:{
    ...base.tooltip,
    formatter:info=>{
     const d=info.data;if(!d)return '';
     return `<strong>${d.name}</strong><br/>Cap-weighted 24h: ${pct(d.value)}<br/>Tracked cap: ${displayCompact(d.totalCap)} (${d.count} assets)`
      +(d.leader?`<br/>Leader: ${d.leader.symbol} (${pct(d.leader.change)})`:'')
      +(d.laggard&&d.laggard.symbol!==d.leader?.symbol?`<br/>Laggard: ${d.laggard.symbol} (${pct(d.laggard.change)})`:'');
    }
   }
  };
 }

 if(kind==='chains'){
  const top=data.slice(0,15);
  const totalTvl=data.reduce((s,x)=>s+(x.tvl>0?x.tvl:0),0)||1;
  option={
   grid:compactView?{left:78,right:66,top:12,bottom:26}:{left:112,right:102,top:14,bottom:28},
   xAxis:{type:'value',axisLabel:{formatter:value=>displayCompact(value),color:muted,fontSize:compactView?10:11,hideOverlap:true},splitLine:{lineStyle:{color:grid}}},
   yAxis:{type:'category',inverse:true,data:top.map(x=>x.name),axisLabel:{color:p.text,fontSize:compactView?10.5:11.5,fontWeight:600,width:compactView?70:104,overflow:'truncate'},axisLine:{show:false},axisTick:{show:false}},
   series:[{
    type:'bar',barMaxWidth:18,
    data:top.map((x,idx)=>({
     name:x.name,value:x.tvl,share:x.tvl/totalTvl*100,symbol:x.symbol,
     itemStyle:{color:idx===0?p.accent:idx<3?green:p.cyan,borderRadius:[0,6,6,0]}
    })),
    label:{show:true,position:'right',formatter:info=>compactView?displayCompact(info.value):`${displayCompact(info.value)} (${info.data.share.toFixed(1)}%)`,color:muted,fontSize:compactView?9.5:10.5}
   }],
   tooltip:{...base.tooltip,formatter:info=>`<strong>${info.name}</strong>${info.data.symbol?' ('+info.data.symbol+')':''}<br/>Reported TVL: ${displayCompact(info.value)}<br/>Share of reported chains: ${info.data.share.toFixed(2)}%`}
  };
 }

 if(kind==='breadth'){
  const up=data.filter(x=>x.change>0).length,down=data.filter(x=>x.change<0).length,flat=data.length-up-down;
  option={series:[{type:'pie',radius:['62%','86%'],center:['50%','48%'],label:{show:false},data:[{name:'Advancing',value:up,itemStyle:{color:green}},{name:'Declining',value:down,itemStyle:{color:red}},{name:'Unchanged / unavailable',value:flat,itemStyle:{color:p.border}}]}],title:{text:`${num(data.length,0)}`,subtext:'assets in snapshot',left:'center',top:'34%',textStyle:{fontSize:28,color:p.text},subtextStyle:{color:muted}},legend:{bottom:0,textStyle:{color:muted},itemWidth:8,itemHeight:8}};
 }

 if(kind==='depth'){
  const bids=[...data.bids].sort((a,b)=>b[0]-a[0]),asks=[...data.asks].sort((a,b)=>a[0]-b[0]);
  let b=0,a=0;
  const bd=bids.map(x=>[x[0],b+=x[1]]).reverse(),ad=asks.map(x=>[x[0],a+=x[1]]);
  const bestBid=bids[0]?.[0],bestAsk=asks[0]?.[0];
  const mid=bestBid&&bestAsk?(bestBid+bestAsk)/2:null;
  option={
   grid:compactView?{left:48,right:14,top:46,bottom:34}:{left:64,right:22,top:40,bottom:38},
   legend:compactView?{top:2,left:'center',itemWidth:12,itemHeight:8,textStyle:{color:muted,fontSize:10.5}}:{top:2,right:12,textStyle:{color:muted,fontSize:11}},
   xAxis:{type:'value',scale:true,axisLabel:{color:muted,fontSize:compactView?9.5:11,hideOverlap:true,formatter:value=>displayPrice(value,data.quote??'USD')},splitLine:{show:false}},
   yAxis:{type:'value',name:compactView?'':'Cumulative size',nameGap:12,nameTextStyle:{color:muted,fontSize:10},axisLabel:{color:muted,fontSize:compactView?9.5:11,formatter:compact},splitLine:{lineStyle:{color:grid}}},
   series:[
    {type:'line',name:'Cumulative bids',showSymbol:false,step:'end',lineStyle:{color:green,width:2},areaStyle:{color:green,opacity:.18},data:bd,
     markLine:mid?{silent:true,symbol:'none',lineStyle:{type:'dashed',color:p.gold,width:1.2},label:{formatter:`Mid ${displayPrice(mid,data.quote??'USD')}`,position:'insideMiddleTop',distance:[0,6],color:p.gold,backgroundColor:p.panel,padding:[2,5],borderRadius:4,fontSize:compactView?9.5:10},data:[{xAxis:mid}]}:undefined},
    {type:'line',name:'Cumulative asks',showSymbol:false,step:'start',lineStyle:{color:red,width:2},areaStyle:{color:red,opacity:.18},data:ad}
   ],
   tooltip:{...base.tooltip,trigger:'axis'}
  };
 }
 return {...base,...option};
}
export function createVisual(el,kind,data,{onSelect,init=echarts.init}={}){return createVisualController(el,data,{init,onSelect,options:next=>visualOptions(kind,next)});}
