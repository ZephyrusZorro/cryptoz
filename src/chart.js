import {serializeCSV,capturePNG,downloadBlob} from './exports.js';
import {pricePrecision} from './numbers.js';
import {rangeForPreset,zoomRange,windowInfo,classifyRange,historyCursor} from './chart-window.js';
import {palette,chartOptions} from './theme.js';
import {mergeCandleHistory,parseLiveQuote,usableQuote} from './market-integrity.js';
import {parsePartialBook} from './live-market.js';
import {createChart,CandlestickSeries,BarSeries,LineSeries,ColorType,CrosshairMode,createSeriesMarkers} from 'lightweight-charts';
import {renderStudies,normalizeStudyIds,STUDIES} from './studies.js';
import {buildAutoSetup} from './auto-setup.js';
import {structureTools} from './structure-tools.js';
import {heikinAshi,technicalSummary,normalizeCandles} from './analytics.js';
import {emaCrossovers} from './research.js';
import {normalizePreferences} from './preferences.js';
import {api} from './api.js';import {esc,price,num,pct,stamp,download,toast} from './ui.js';
const seconds={'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400};
const HISTORY_LIMIT=4000;
const HISTORY_EDGE=34;
const sameBar=(a,b)=>a.time===b.time&&a.open===b.open&&a.high===b.high&&a.low===b.low&&a.close===b.close&&a.volume===b.volume;
const types={candles:CandlestickSeries,bars:BarSeries,line:LineSeries,heikin:CandlestickSeries};
export function parseStreamBar(d){const k=d?.k;if(!k)return null;return normalizeCandles([{time:Math.floor(+k.t/1000),open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v}])[0]??null;}
export class TerminalChart {
 constructor({host,workspace,save,onQuote,onSummary,onBook,onStatus,onDrawings,onWindow,deskMode='pro'}){Object.assign(this,{host,workspace,save,onQuote,onSummary,onBook,onStatus,onDrawings,onWindow,deskMode});this.studyBars=[];this.bars=[];this.generation=0;this.drawMode='cursor';this.pendingPoint=null;this.disposed=false;this.historyStatus='idle';this.indicators={ema:true,sma:false,bb:false,vwap:false};this.period=20;this.rsiPeriod=14;this.oscillator='rsi';this.style='candles';this.interval='1h';this.instrument={venue:'binance',symbol:'BTCUSDT',base:'BTC',quote:'USDT'};this.streamState='connecting';this.lastStream=0;this.liveRevision=0;this.barRevisions=new Map();this.barEvents=new Map();const p=normalizePreferences(workspace.preferences);this.indicators=p.indicators;this.period=p.period;this.rsiPeriod=p.rsiPeriod;this.oscillator=p.oscillator;this.autoGuide=deskMode==='basic'&&['zones','profile'].includes(p.autoGuide)?'range':p.autoGuide;this.signalKinds=p.signalKinds;this.studyIds=normalizeStudyIds((deskMode==='basic'?p.basicStudyIds??p.studyIds:p.studyIds)??[...Object.keys(p.indicators).filter(x=>p.indicators[x]),p.oscillator]);this.style=p.style;this.markers=p.markers;this.viewPreset=p.view;}
 activeStudies(){return this.studyIds.filter(id=>this.deskMode==='pro'||!STUDIES[id]?.proOnly);}
 get key(){return `${this.instrument.venue}:${this.instrument.symbol}:${this.interval}`;}
 status(s){this.streamState=s;this.onStatus(s);}
 fetch(path){return api(path,{signal:this.networkController?.signal});}
 currentQuote(now=Date.now()){return usableQuote(this.quote,this.instrument,now);}
 freshStream(){return this.lastStream>0&&Date.now()-this.lastStream<20000;}
 async refresh(){if(this.disposed)return;if(this.historyAnchor||!this.bars.length)return this.load(this.instrument,this.interval,{before:this.historyAnchor});return Promise.allSettled([this.poll(this.generation),this.reconcile(this.generation)]);}
 async load(instrument=this.instrument,interval=this.interval,{before=null}={}){
  if(this.disposed)return;
  this.instrument=instrument;this.interval=interval;this.historyAnchor=before;this.generation++;const gen=this.generation;this.stopNetwork();this.networkController=new AbortController();this.gestureController?.abort();this.liveRevision=0;this.confirmedThrough=0;this.studyBars=[];this.autoSetup=null;this.barRevisions=new Map();this.barEvents=new Map();this.observer?.disconnect();this.chart?.remove();this.chart=null;this.series=null;this.svg=null;this.bars=[];this.historyStatus='idle';this.historyNotice='';this.quote=null;this.candleMeta=null;this.lastStream=0;this.lastKlineReceived=0;this.lastBookAt=0;this.bookSequence=0;this.pendingPoint=null;this.status('loading');this.onWindow?.({visible:0,total:0,start:null,end:null});this.onQuote(null);this.onBook(null);this.onSummary({ready:false});this.host.innerHTML='<div class="chart-loading"><span class="loader"></span> Connecting to '+esc(instrument.venue)+' market data…</div>';this.onDrawings();
  try{const requestedAt=Date.now();const response=await this.fetch(`candles?venue=${instrument.venue}&symbol=${instrument.symbol}&interval=${interval}${before?'&before='+before:''}`);if(gen!==this.generation||this.disposed)return;this.bars=normalizeCandles(response.data?.bars);if(!this.bars.length)throw Error(before?'No provider candles before that date for this pair and interval.':'No valid candles available');this.candleMeta=response;this.observeStudyBars(this.bars,Math.min(before??Infinity,this.snapshotCutoff(response,requestedAt)));this.build();this.updateSummary();this.status(before?'archive':response.cache==='stale'?'stale':'snapshot');if(before)return;this.onQuote({price:this.bars.at(-1).close,source:'candle',updatedAt:response.fetchedAt,stale:response.cache==='stale'});this.connect(gen);this.poll(gen);this.pollTimer=setInterval(()=>{if(!document.hidden)this.poll(gen);},15000);this.healthTimer=setInterval(()=>{if(this.lastStream&&Date.now()-this.lastStream>20000&&this.streamState==='streaming')this.status('delayed');if(this.lastBookAt&&Date.now()-this.lastBookAt>5000){this.lastBookAt=0;this.onBook(null);}this.onStatus(this.streamState);},5000);
  }catch(e){if(gen!==this.generation||this.disposed)return;this.host.innerHTML=`<div class="chart-loading error-state"><strong>Chart unavailable</strong><p>${esc(e.message)}</p><button data-action="retry-chart" class="button">Retry connection</button><small>Select another venue or instrument. No synthetic candles are shown.</small></div>`;this.status('unavailable');this.historyStatus='unavailable';this.onWindow?.({visible:0,total:0,historyStatus:'unavailable'});}
 }
 build(){
  if(this.rangeFrame){cancelAnimationFrame(this.rangeFrame);this.rangeFrame=0;}this.pendingRangePrefetch=false;
  const p=palette();const range=this.chart?.timeScale().getVisibleLogicalRange();this.observer?.disconnect();this.chart?.remove();this.host.innerHTML='<div class="chart-canvas"></div><svg class="drawing-layer" aria-hidden="true"></svg><div class="crosshair-hud"></div>';const el=this.host.querySelector('.chart-canvas');this.svg=this.host.querySelector('svg');
  this.chart=createChart(el,{autoSize:true,layout:{background:{type:ColorType.Solid,color:p.panel},textColor:p.text,fontSize:11,fontFamily:'ui-monospace, monospace',attributionLogo:true,panes:{separatorColor:p.border,separatorHoverColor:p.accent,enableResize:true}},grid:{vertLines:{color:p.grid},horzLines:{color:p.grid}},crosshair:{mode:CrosshairMode.Normal,vertLine:{color:p.text,labelBackgroundColor:p.border},horzLine:{color:p.text,labelBackgroundColor:p.border}},rightPriceScale:{borderColor:p.border},timeScale:{borderColor:p.border,timeVisible:true,secondsVisible:false,rightOffset:3,minBarSpacing:.2},handleScroll:this.drawMode==='cursor',handleScale:true});
  const options={upColor:p.up,downColor:p.down,borderVisible:false,wickUpColor:p.up,wickDownColor:p.down,color:p.accent,lineWidth:2,priceFormat:{type:'price',precision:pricePrecision(this.bars.at(-1).close),minMove:10**-pricePrecision(this.bars.at(-1).close)}};
  this.series=this.chart.addSeries(types[this.style],options);const display=this.style==='heikin'?heikinAshi(this.bars):this.bars;this.series.setData(this.style==='line'?display.map(b=>({time:b.time,value:b.close})):display);this.seriesFirstTime=this.bars[0]?.time;this.seriesLastTime=this.bars.at(-1)?.time;
  this.studyView=null;this.markerApi=createSeriesMarkers(this.series,[]);this.renderIndicators();
  if(range)this.chart.timeScale().setVisibleLogicalRange(range);else this.setViewPreset(this.viewPreset==='recent'?'recent':'all');this.notifyWindow();
  this.chart.subscribeCrosshairMove(p=>{const el=this.host.querySelector('.crosshair-hud');if(!el)return;const b=p.seriesData.get(this.series);el.textContent=b?('open'in b?`O ${num(b.open,8)}   H ${num(b.high,8)}   L ${num(b.low,8)}   C ${num(b.close,8)}`:`Price ${num(b.value,8)}`)+(this.markerDescriptions?.has(p.time)?' · '+this.markerDescriptions.get(p.time):''):'';});
  this.chart.subscribeClick(p=>{if(this.drawMode==='cursor'||!p.point||!p.time||(p.paneIndex!==undefined&&p.paneIndex!==0))return;const value=this.series.coordinateToPrice(p.point.y);if(!Number.isFinite(value)||value<=0)return;const point={time:+p.time,price:value};if(this.drawMode==='horizontal'||this.drawMode==='label'){this.addDrawing([point]);}else if(this.pendingPoint){this.addDrawing([this.pendingPoint,point]);this.pendingPoint=null;}else{this.pendingPoint=point;toast('Click the second anchor on the price chart.');}});
  this.gestureController?.abort();this.gestureController=new AbortController();const gesture=()=>{this.viewPreset='custom';this.scheduleRangeRender(true);};for(const name of ['wheel','touchmove'])this.host.addEventListener(name,gesture,{capture:true,passive:true,signal:this.gestureController.signal});this.host.addEventListener('pointermove',e=>{if(e.buttons)gesture();},{capture:true,passive:true,signal:this.gestureController.signal});this.chart.timeScale().subscribeVisibleLogicalRangeChange(()=>this.scheduleRangeRender());this.observer=new ResizeObserver(()=>requestAnimationFrame(()=>this.resizeView()));this.observer.observe(this.host);this.draw();requestAnimationFrame(()=>{if(!this.disposed)this.notifyWindow();});
 }
 renderIndicators(incremental=false){
  if(!this.chart)return;const p=palette(),cutoff=this.completedCutoff();
  this.studyView=renderStudies(this.chart,this.series,this.studyView,this.bars,this.activeStudies(),{period:this.period,rsiPeriod:this.rsiPeriod,interval:this.interval,completedBefore:Math.floor(cutoff/seconds[this.interval])*seconds[this.interval],palette:p,incremental});
  this.autoSetup=buildAutoSetup(this.studyBars,{interval:this.interval,completedBefore:cutoff,nowSeconds:this.historyAnchor??Date.now()/1000,stale:this.candleMeta?.cache==='stale'});
  const crosses=this.markers&&this.deskMode==='pro'?emaCrossovers(this.bars,20,50,Math.floor(cutoff/seconds[this.interval])*seconds[this.interval]):[];
  if(this.deskMode==='pro'){const extra=structureTools(this.studyBars,seconds[this.interval],cutoff);this.autoSetup={...this.autoSetup,zones:extra.zones,profile:extra.profile,guides:[...this.autoSetup.guides,...extra.guides]};}
  const kinds=this.deskMode==='basic'?['range']:this.signalKinds;
  const events=(this.autoSetup.events??[]).filter(e=>kinds.includes(e.kind)&&(!this.autoSetup.stale||this.historyAnchor)).map(e=>({time:e.time,text:e.label,position:e.direction==='up'?'belowBar':'aboveBar',shape:e.direction==='up'?'arrowUp':'arrowDown'}));
  const markers=[...crosses,...events].sort((a,b)=>a.time-b.time);this.markerDescriptions=new Map();
  for(const m of markers)this.markerDescriptions.set(m.time,[this.markerDescriptions.get(m.time),m.text].filter(Boolean).join(' · '));
  this.markerApi?.setMarkers(markers.map(m=>({...m,text:'',color:m.position==='belowBar'?p.up:p.down})));
  if(this.studyView.paneChanged&&this.studyView.hasPane&&this.chart.panes().length>1){this.chart.panes()[0].setHeight(Math.max(120,this.host.clientHeight-118));this.chart.panes()[1].setHeight(100);}
  this.draw();
 }
 snapshotCutoff(response,requestedAt=Date.now()){const fetched=Date.parse(response?.fetchedAt);return Number.isFinite(fetched)?Math.floor(Math.min(fetched,requestedAt)/1000):0;}
 observeStudyBars(bars,cutoff,{stale=false}={}){const interval=seconds[this.interval];const confirmed=bars.filter(b=>b.time%interval===0&&b.time+interval<=cutoff);if(confirmed.length)this.studyBars=mergeCandleHistory(this.studyBars,confirmed,new Map(),0,{limit:HISTORY_LIMIT,stale});}
 completedCutoff(now=Math.floor(Date.now()/1000)){const edge=Math.min(now,Math.max(Math.floor(Date.parse(this.candleMeta?.fetchedAt)/1000)||0,this.confirmedThrough??0));return Math.floor(edge/seconds[this.interval])*seconds[this.interval];}
 updateSummary(){const cutoff=this.completedCutoff();this.onSummary(technicalSummary(this.studyBars.filter(b=>b.time<cutoff)));}
 applyHistory(response,revision,requestedAt=Date.now()){
  const incoming=normalizeCandles(response.data?.bars);if(!incoming.length)throw Error('Invalid historical candles');
  const previous=this.bars,previousCutoff=this.completedCutoff(),priorStudy=this.studyBars.at(-1)?.time;this.observeStudyBars(incoming,this.snapshotCutoff(response,requestedAt),{stale:response.cache==='stale'});this.bars=mergeCandleHistory(previous,incoming,this.barRevisions,revision,{stale:response.cache==='stale',limit:HISTORY_LIMIT});this.candleMeta=response;
  if(previous.length===this.bars.length&&previous.every((b,i)=>sameBar(b,this.bars[i]))){if(previousCutoff!==this.completedCutoff()||priorStudy!==this.studyBars.at(-1)?.time){this.renderIndicators();this.updateSummary();}if(response.cache==='stale'&&!this.freshStream())this.status('stale');return;}
  const retained=new Set(this.bars.map(b=>b.time));for(const time of this.barRevisions.keys())if(!retained.has(time)){this.barRevisions.delete(time);this.barEvents.delete(time);}
  this.updateSeries();this.updateSummary();if(response.cache==='stale'&&!this.freshStream())this.status('stale');
 }
 async poll(gen){
  if(this.disposed||gen!==this.generation)return;if(this.polling&&this.pollingGeneration===gen)return this.pollingPromise;
  const token=this.pollToken=Symbol();this.polling=true;this.pollingGeneration=gen;const {venue,symbol}=this.instrument,revision=this.liveRevision,requestedAt=Date.now();
  const current=()=>gen===this.generation&&!this.disposed;
  this.pollingPromise=Promise.allSettled([
   this.deskMode==='pro'?this.fetch(`book?venue=${venue}&symbol=${symbol}`).then(r=>{if(current()&&Date.now()-(this.lastBookAt??0)>5000)this.onBook(r);}).catch(()=>{if(current()&&Date.now()-(this.lastBookAt??0)>5000)this.onBook(null);}):Promise.resolve(),
   this.fetch(`ticker?venue=${venue}&symbol=${symbol}`).then(r=>{if(!current()||this.freshStream())return;const d=r.data,value=+(d.lastPrice??d.last),open=+(d.openPrice??d.open),time=Date.parse(d.observedAt??r.fetchedAt),previous=Date.parse(this.quote?.updatedAt);if(!Number.isFinite(value)||value<=0||!Number.isFinite(time)||Number.isFinite(previous)&&time<=previous)return;this.quote={venue,symbol,price:value,change:d.priceChangePercent!==null&&d.priceChangePercent!==''&&Number.isFinite(+d.priceChangePercent)?+d.priceChangePercent:open>0?(value/open-1)*100:null,high:+(d.highPrice??d.high)||null,low:+(d.lowPrice??d.low)||null,updatedAt:new Date(time).toISOString(),stale:r.cache==='stale',source:'REST'};this.onQuote(this.quote);}),
   (!this.freshStream()||venue==='coinbase'||Date.now()-(this.lastKlineReceived??0)>15000)?this.fetch(`candles?venue=${venue}&symbol=${symbol}&interval=${this.interval}`).then(r=>{if(current())this.applyHistory(r,revision,requestedAt);}).catch(()=>{if(current()&&!this.freshStream())this.status('delayed');}):Promise.resolve()
  ]).finally(()=>{if(this.pollToken===token){this.polling=false;this.pollingPromise=null;}});
  return this.pollingPromise;
 }
 async reconcile(gen){
  const requestedAt=Date.now(),revision=this.liveRevision,instrument={...this.instrument},interval=this.interval;
  try{const r=await this.fetch(`candles?venue=${instrument.venue}&symbol=${instrument.symbol}&interval=${interval}`);if(this.disposed||gen!==this.generation)return;this.applyHistory(r,revision,requestedAt);}catch{if(!this.disposed&&gen===this.generation&&!this.freshStream())this.status('delayed');}
 }
 connect(gen){
  if(this.disposed||gen!==this.generation)return;const {venue,symbol}=this.instrument;const endpoint=venue==='binance'?`wss://data-stream.binance.vision/stream?streams=${symbol.toLowerCase()}@kline_${this.interval}/${symbol.toLowerCase()}@ticker${this.deskMode==='pro'?'/'+symbol.toLowerCase()+'@depth20':''}`:'wss://ws-feed.exchange.coinbase.com';
  this.socket=new WebSocket(endpoint);this.socket.onopen=()=>{if(gen!==this.generation||this.disposed)return;this.reconcile(gen);if(venue==='coinbase')this.socket.send(JSON.stringify({type:'subscribe',product_ids:[symbol],channels:['ticker','heartbeat']}));};
  this.socket.onmessage=e=>{if(gen!==this.generation||this.disposed)return;let d;try{d=JSON.parse(e.data);d=d.data??d;}catch{return;}if(d.lastUpdateId!==undefined){const book=parsePartialBook(d);if(!book||book.sequence<(this.bookSequence??0))return;this.bookSequence=book.sequence;this.lastBookAt=Date.now();this.onBook({data:book,provider:'Binance WebSocket',cache:'live',fetchedAt:new Date().toISOString()});return;}if(d.e==='kline'){const k=d.k,b=parseStreamBar(d);if(!b||k.s&&k.s!==symbol||k.i&&k.i!==this.interval)return;const eventTime=Number(d.E),received=Date.now();if(!Number.isSafeInteger(eventTime)||received-eventTime>30000||eventTime-received>5000||eventTime<=(this.barEvents.get(b.time)??0))return;this.barEvents.set(b.time,eventTime);const last=this.bars.at(-1);if(last&&b.time<last.time)return;this.lastKlineReceived=Date.now();this.barRevisions.set(b.time,++this.liveRevision);if(last&&b.time>last.time+seconds[this.interval])this.reconcile(gen);if(last?.time===b.time)this.bars[this.bars.length-1]=b;else this.bars.push(b);if(this.bars.length>HISTORY_LIMIT){const removed=this.bars.shift();this.barRevisions.delete(removed.time);this.barEvents.delete(removed.time);}if(k.x){this.confirmedThrough=b.time+seconds[this.interval];this.observeStudyBars([b],this.confirmedThrough);}this.updateSeries({live:true,closed:k.x});if(k.x)this.updateSummary();}else if(d.e==='24hrTicker'||d.type==='ticker'){const quote=parseLiveQuote(d,this.instrument,this.quote);if(!quote)return;this.quote=quote;this.onQuote(quote);}else return;this.lastStream=Date.now();this.reconnectAttempt=0;this.status('streaming');};
  this.socket.onerror=()=>{};this.socket.onclose=()=>{if(gen!==this.generation||this.disposed)return;this.lastBookAt=0;this.onBook(null);this.status('polling');this.reconnectTimer=setTimeout(()=>this.connect(gen),Math.min(30000,1500*2**Math.min(this.reconnectAttempt??0,4)));this.reconnectAttempt=(this.reconnectAttempt??0)+1;};
 }
 scheduleRangeRender(wantOlder=false){
  this.pendingRangePrefetch=this.pendingRangePrefetch||wantOlder;
  if(this.rangeFrame)return;const chart=this.chart;
  this.rangeFrame=requestAnimationFrame(()=>{this.rangeFrame=0;const prefetch=this.pendingRangePrefetch;this.pendingRangePrefetch=false;
   if(this.disposed||chart!==this.chart)return;this.draw();this.notifyWindow();
   if(prefetch&&this.chart?.timeScale().getVisibleLogicalRange()?.from<HISTORY_EDGE)this.loadOlder({automatic:true});
  });
 }
 async loadOlder({automatic=false,retry=false}={}){
  if(this.disposed||!this.bars.length||['loading','end','limit'].includes(this.historyStatus)||automatic&&!retry&&this.historyStatus==='error')return;
  if(this.bars.length>=HISTORY_LIMIT){this.historyStatus='limit';this.notifyWindow();return;}
  const before=this.bars[0].time,gen=this.generation,{venue,symbol}=this.instrument,interval=this.interval;
  const isCurrent=()=>!this.disposed&&this.generation===gen;
  this.historyStatus='loading';this.historyNotice='';this.notifyWindow();
  try{
   const result=await this.fetch(`candles?venue=${venue}&symbol=${symbol}&interval=${interval}&before=${before}`);
   if(!isCurrent())return;
   if(!Array.isArray(result.data?.bars)||result.data.before!==undefined&&result.data.before!==before)throw Error('Invalid history page');
   const room=HISTORY_LIMIT-this.bars.length;if(room<=0){this.historyStatus='limit';return;}
   const old=normalizeCandles(result.data.bars).filter(b=>b.time<Math.min(before,this.bars[0].time)).slice(-room);
   if(!old.length){
    if(result.cache==='stale')throw Error('No fresh history page');
    this.historyStatus='end';return;
   }
   const scale=this.chart?.timeScale(),range=scale?.getVisibleLogicalRange();
   this.bars=[...old,...this.bars];this.observeStudyBars(old,before,{stale:result.cache==='stale'});this.historyStatus=this.bars.length>=HISTORY_LIMIT?'limit':'ready';
   if(result.cache==='stale')this.historyNotice='Older candles served from cache';
   this.updateSeries({preserveIndexShift:old.length});
   if(!automatic&&range&&scale){
    this.viewPreset='custom';const span=range.to-range.from;
    // Move one screen left from the old boundary; retain a sliver of overlap for orientation.
    const to=Math.min(this.bars.length+3,old.length+Math.min(12,span*.12));scale.setVisibleLogicalRange({from:Math.max(-1,to-span),to});
   }
  }catch(error){if(isCurrent()){this.historyStatus='error';this.historyNotice='Earlier candles unavailable. Use Older candles to retry.';}}
  finally{if(isCurrent())this.notifyWindow();}
 }
 updateSeries({live=false,closed=false,preserveIndexShift=0}={}){
  if(!this.series||!this.bars.length)return;const display=this.style==='heikin'?heikinAshi(this.bars):this.bars,last=display.at(-1),point=this.style==='line'?{time:last.time,value:last.close}:last;
  if(live&&this.seriesFirstTime===this.bars[0].time&&last.time>=this.seriesLastTime)this.series.update(point);
  else {const scale=this.chart?.timeScale(),visible=scale?.getVisibleRange?.(),logical=scale?.getVisibleLogicalRange?.();const wasFollowing=logical&&this.seriesLastTime!==last.time&&logical.to>=this.bars.length-2;
   this.series.setData(this.style==='line'?display.map(b=>({time:b.time,value:b.close})):display);
   if(logical&&preserveIndexShift)scale.setVisibleLogicalRange({from:logical.from+preserveIndexShift,to:logical.to+preserveIndexShift});
   else if(wasFollowing&&this.viewPreset==='recent')scale.setVisibleLogicalRange(rangeForPreset(this.bars.length,'recent'));
   else if(visible&&scale.setVisibleRange)scale.setVisibleRange(visible);else if(logical)scale.setVisibleLogicalRange(logical);}
  this.seriesFirstTime=this.bars[0].time;this.seriesLastTime=this.bars.at(-1).time;if(!live||closed){this.renderIndicators(live);this.notifyWindow();}
 }
 notifyWindow(){if(!this.chart)return;this.onWindow?.({...windowInfo(this.bars,this.chart.timeScale().getVisibleLogicalRange()),preset:this.viewPreset,selection:classifyRange(this.chart.timeScale().getVisibleLogicalRange(),this.bars.length),historyStatus:this.historyStatus,historyNotice:this.historyNotice,historyAnchor:this.historyAnchor});}
 resizeView(){if(this.disposed||!this.chart)return;if(['all','recent'].includes(this.viewPreset))this.setViewPreset(this.viewPreset);this.draw();}
 jumpToDate(date){const before=historyCursor(date,seconds[this.interval]);if(!before)return false;this.load(this.instrument,this.interval,{before});return true;}
 showLatest(){if(this.historyAnchor){this.viewPreset='recent';return this.load();}this.setViewPreset('recent');}
 setViewPreset(preset){if(!this.chart||!['all','recent'].includes(preset))return;this.viewPreset=preset;this.lastRangeGesture=0;if(preset==='all')this.chart.timeScale().fitContent();else this.chart.timeScale().setVisibleLogicalRange(rangeForPreset(this.bars.length,preset));this.notifyWindow();}
 zoom(factor){if(!this.chart)return;const range=zoomRange(this.chart.timeScale().getVisibleLogicalRange(),factor,this.bars.length);if(range){this.viewPreset='custom';this.chart.timeScale().setVisibleLogicalRange(range);this.notifyWindow();if(factor>1&&range.from<HISTORY_EDGE)this.loadOlder({automatic:true});}}
 setTool(mode,label=''){this.drawMode=mode;this.drawLabel=label;this.pendingPoint=null;this.chart?.applyOptions({handleScroll:mode==='cursor'});this.host.classList.toggle('drawing',mode!=='cursor');}
 addDrawing(points){const a=this.workspace.drawings[this.key]??=[];if(a.length>=40){toast('Maximum 40 drawings per chart.');return;}a.push({id:crypto.randomUUID(),type:this.drawMode,points,label:this.drawLabel||''});this.save();this.draw();this.onDrawings();toast('Drawing saved. Edit its levels in Drawings.');}
 draw(){
  if(!this.chart||!this.svg)return;const automatic=(this.manualDrawing?[]:this.autoSetup?.guides??[]).filter(({id})=>this.autoGuide==='range'?id.startsWith('range-'):this.autoGuide==='trend'?id==='swing-trend':this.autoGuide==='fibonacci'?id.startsWith('fibonacci-'):this.autoGuide==='zones'?id.startsWith('zones-'):this.autoGuide==='profile'?id.startsWith('profile-'):false);const drawings=[...automatic,...(this.deskMode==='pro'?this.workspace.drawings[this.key]??[]:[])];if(!drawings.length){if(this.svg.childElementCount)this.svg.replaceChildren();return;}const colors=palette();const w=this.host.clientWidth-70,h=this.chart.panes()[0]?.getHeight()??this.host.clientHeight;this.svg.setAttribute('viewBox',`0 0 ${this.host.clientWidth} ${this.host.clientHeight}`);this.svg.innerHTML=drawings.map(d=>{const p=d.points.map(p=>({x:this.chart.timeScale().timeToCoordinate(p.time),y:this.series.priceToCoordinate(p.price)}));if(p.some(p=>p.y===null))return '';const a=p[0],b=p[1];const label=esc(d.label||d.type);if(automatic.includes(d)){if(d.type==='trend'&&(a.x===null||b?.x===null))return '';const x1=a.x??0,x2=d.type==='horizontal'?w:(b?.x??w),y2=b?.y??a.y,color=colors[d.color]??colors.gold;return `<line data-auto-guide="${d.id}" x1="${x1}" y1="${a.y}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-dasharray="5 4"/>${d.id.startsWith('fibonacci-')?'':`<text x="${Math.max(8,Math.min(x1+6,w-104))}" y="${a.y-5}" fill="${color}">${label.length>34?label.slice(0,34):label}</text>`}${d.type==='trend'?`<circle cx="${x1}" cy="${a.y}" r="3" fill="${color}"/><circle cx="${x2}" cy="${y2}" r="3" fill="${color}"/>`:''}`;}if(d.type==='horizontal')return `<line x1="0" y1="${a.y}" x2="${w}" y2="${a.y}" stroke="${colors.gold}" stroke-dasharray="5 4"/><text x="12" y="${a.y-7}" fill="${colors.gold}">${label} · ${num(d.points[0].price,8)}</text>`;if(a.x===null)return '';if(d.type==='label')return `<circle cx="${a.x}" cy="${a.y}" r="4" fill="${colors.accent}"/><text x="${a.x+8}" y="${a.y-7}" fill="${colors.text}">${label}</text>`;if(!b||b.x===null)return '';if(d.type==='trend')return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${colors.accent}" stroke-width="2"/><circle cx="${a.x}" cy="${a.y}" r="3" fill="${colors.accent}"/><circle cx="${b.x}" cy="${b.y}" r="3" fill="${colors.accent}"/>`;return [0,.236,.382,.5,.618,.786,1].map(f=>{const y=a.y+(b.y-a.y)*f;return `<line x1="${Math.min(a.x,b.x)}" y1="${y}" x2="${Math.max(a.x,b.x)}" y2="${y}" stroke="${colors.violet}" opacity=".7"/><text x="${Math.max(a.x,b.x)+5}" y="${y-4}" fill="${colors.violet}">${f} · ${num(d.points[0].price+(d.points[1].price-d.points[0].price)*f,4)}</text>`;}).join('');}).join('');this.svg.style.clipPath=`inset(0 70px ${Math.max(0,this.host.clientHeight-h)}px 0)`;
 }
 exportCSV(){if(!this.bars.length){toast('Wait for market history before exporting.');return;}const cutoff=Math.floor(Date.now()/1000/seconds[this.interval])*seconds[this.interval];download(`cryptoz-${this.instrument.venue}-${this.instrument.symbol}-${this.interval}.csv`,serializeCSV(['time','open','high','low','close','volume','venue','quote','closed'],this.bars.map(b=>[new Date(b.time*1000).toISOString(),b.open,b.high,b.low,b.close,b.volume,this.instrument.venue,this.instrument.quote,b.time<cutoff])),'text/csv');}
 async exportPNG(){
  if(!this.chart||!this.svg||this.exporting)return;this.exporting=true;const instrument={...this.instrument},interval=this.interval;
  try{const blob=await capturePNG({chart:this.chart,overlay:new XMLSerializer().serializeToString(this.svg),watermark:`CRYPTOZ · ${instrument.venue.toUpperCase()} ${instrument.symbol} ${interval} · exported ${new Date().toISOString()}`,color:palette().accent});downloadBlob(`cryptoz-${instrument.venue}-${instrument.symbol}-${interval}.png`,blob);}catch(error){toast('Snapshot export failed: '+error.message);}finally{this.exporting=false;}
 }
 stopNetwork(){if(this.rangeFrame){cancelAnimationFrame(this.rangeFrame);this.rangeFrame=0;}this.pendingRangePrefetch=false;this.networkController?.abort();this.pollToken=null;clearInterval(this.pollTimer);clearInterval(this.healthTimer);clearTimeout(this.reconnectTimer);if(this.socket){this.socket.onclose=null;this.socket.onmessage=null;this.socket.onopen=null;this.socket.close();this.socket=null;}this.polling=false;}
 dispose(){this.disposed=true;this.generation++;this.stopNetwork();this.gestureController?.abort();this.observer?.disconnect();this.chart?.remove();}
}
