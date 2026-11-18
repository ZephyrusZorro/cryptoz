import {serializeCSV,capturePNG,downloadBlob} from './exports.js';
import {pricePrecision} from './numbers.js';
import {rangeForPreset,zoomRange,windowInfo,classifyRange,historyCursor} from './chart-window.js';
import {palette} from './theme.js';
import {mergeCandleHistory,parseLiveQuote,usableQuote} from './market-integrity.js';
import {parsePartialBook} from './live-market.js';
import {createChart,CandlestickSeries,BarSeries,LineSeries,ColorType,CrosshairMode,createSeriesMarkers} from 'lightweight-charts';
import {renderStudies,normalizeStudyIds,STUDIES} from './studies.js';
import {buildAutoSetup,chartSignalEvents} from './auto-setup.js';
import {structureTools} from './structure-tools.js';
import {heikinAshi,technicalSummary,normalizeCandles} from './analytics.js';
import {normalizePreferences} from './preferences.js';
import {api} from './api.js';import {esc,num,download,toast} from './ui.js';
const seconds={'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400};
const HISTORY_LIMIT=4000;
const HISTORY_EDGE=34;
const sameBar=(a,b)=>a.time===b.time&&a.open===b.open&&a.high===b.high&&a.low===b.low&&a.close===b.close&&a.volume===b.volume;
const types={candles:CandlestickSeries,bars:BarSeries,line:LineSeries,heikin:CandlestickSeries};
export function parseStreamBar(d){const k=d?.k;if(!k)return null;return normalizeCandles([{time:Math.floor(+k.t/1000),open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v}])[0]??null;}
export class TerminalChart {
 constructor({host,workspace,save,onQuote,onSummary,onBook,onStatus,onDrawings,onWindow,deskMode='pro'}){Object.assign(this,{host,workspace,save,onQuote,onSummary,onBook,onStatus,onDrawings,onWindow,deskMode});this.studyBars=[];this.bars=[];this.visibleSignals=[];this.confirmedThrough=0;this.latestSnapshotAt=0;this.confirmedStreamBars=new Set();this.analysisRevision=0;this.generation=0;this.drawMode='cursor';this.pendingPoint=null;this.disposed=false;this.historyStatus='idle';this.indicators={ema:true,sma:false,bb:false,vwap:false};this.period=20;this.rsiPeriod=14;this.oscillator='rsi';this.style='candles';this.interval='1h';this.instrument={venue:'binance',symbol:'BTCUSDT',base:'BTC',quote:'USDT'};this.streamState='connecting';this.lastStream=0;this.liveRevision=0;this.barRevisions=new Map();this.barEvents=new Map();const p=normalizePreferences(workspace.preferences);this.indicators=p.indicators;this.period=p.period;this.rsiPeriod=p.rsiPeriod;this.oscillator=p.oscillator;this.autoGuide=deskMode==='basic'&&['zones','profile'].includes(p.autoGuide)?'range':p.autoGuide;this.signalKinds=p.signalKinds;this.studyIds=normalizeStudyIds((deskMode==='basic'?p.basicStudyIds??p.studyIds:p.studyIds)??[...Object.keys(p.indicators).filter(x=>p.indicators[x]),p.oscillator]);this.style=p.style;this.markers=p.markers;this.viewPreset=p.view;}
 activeStudies(){return this.studyIds.filter(id=>this.deskMode==='pro'||!STUDIES[id]?.proOnly);}
 get key(){return `${this.instrument.venue}:${this.instrument.symbol}:${this.interval}`;}
 status(s){if(this.streamState!==s){this.streamState=s;this.onStatus(s);}}
 fetch(path){return api(path,{signal:this.networkController?.signal});}
 currentQuote(now=Date.now()){return usableQuote(this.quote,this.instrument,now);}
 freshStream(){return this.lastStream>0&&Date.now()-this.lastStream<20000;}
 async refresh(){if(this.disposed)return;if(this.historyAnchor||!this.bars.length)return this.load(this.instrument,this.interval,{before:this.historyAnchor});return Promise.allSettled([this.poll(this.generation),this.reconcile(this.generation)]);}
 async load(instrument=this.instrument,interval=this.interval,{before=null}={}){
  if(this.disposed)return;
  this.instrument=instrument;this.interval=interval;this.historyAnchor=before;this.generation++;const gen=this.generation;this.stopNetwork();this.networkController=new AbortController();this.gestureController?.abort();this.liveRevision=0;this.confirmedThrough=0;this.latestSnapshotAt=0;this.confirmedStreamBars.clear();this.studyBars=[];this.visibleSignals=[];this.markerDescriptions=null;this.autoSetup=null;this.barRevisions=new Map();this.barEvents=new Map();this.observer?.disconnect();this.chart?.remove();this.chart=null;this.series=null;this.svg=null;this.bars=[];this.historyStatus='idle';this.historyNotice='';this.quote=null;this.candleMeta=null;this.lastStream=0;this.lastSocketFrame=0;this.reconnectAttempt=0;this.lastKlineReceived=0;this.lastBookAt=0;this.bookSequence=0;this.pendingPoint=null;this.status('loading');this.onWindow?.({visible:0,total:0,start:null,end:null});this.onQuote(null);this.onBook(null);this.onSummary({ready:false});this.host.innerHTML='<div class="chart-loading"><span class="loader"></span> Connecting to '+esc(instrument.venue)+' market data…</div>';this.onDrawings();
  try{const requestedAt=Date.now();const response=await this.fetch(`candles?venue=${instrument.venue}&symbol=${instrument.symbol}&interval=${interval}${before?'&before='+before:''}`);if(gen!==this.generation||this.disposed)return;this.bars=normalizeCandles(response.data?.bars??[]).filter(bar=>!before||bar.time<before);if(!this.bars.length)throw Error(before?'No provider candles before that date for this pair and interval.':'No valid candles available');this.candleMeta=response;this.latestSnapshotAt=this.snapshotCutoff(response,requestedAt);this.observeStudyBars(this.bars,Math.min(before??Infinity,this.latestSnapshotAt));this.build();this.updateSummary();this.status(before?'archive':response.cache==='stale'?'stale':'snapshot');if(before)return;this.onQuote({price:this.bars.at(-1).close,source:'candle',updatedAt:response.fetchedAt,stale:response.cache==='stale'});this.connect(gen);this.poll(gen);this.pollTimer=setInterval(()=>{if(!document.hidden)this.poll(gen);},15000);this.healthTimer=setInterval(()=>this.checkConnection(gen),5000);
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
  this.gestureController?.abort();this.gestureController=new AbortController();const gesture=()=>{this.viewPreset='custom';this.scheduleRangeRender(true);};for(const name of ['wheel','touchmove'])this.host.addEventListener(name,gesture,{capture:true,passive:true,signal:this.gestureController.signal});this.host.addEventListener('pointermove',e=>{if(e.buttons)gesture();},{capture:true,passive:true,signal:this.gestureController.signal});this.chart.timeScale().subscribeVisibleLogicalRangeChange(()=>this.scheduleRangeRender());this.chart.timeScale().subscribeSizeChange(()=>this.scheduleRangeRender());this.observer=new ResizeObserver(()=>requestAnimationFrame(()=>this.resizeView()));this.observer.observe(this.host);this.draw();requestAnimationFrame(()=>{if(!this.disposed)this.notifyWindow();});
 }
 renderIndicators(incremental=false,{refreshAnalysis=true}={}){
  if(!this.chart)return;const p=palette(),cutoff=this.completedCutoff();
  this.studyView=renderStudies(this.chart,this.series,this.studyView,this.bars,this.activeStudies(),{period:this.period,rsiPeriod:this.rsiPeriod,interval:this.interval,completedBefore:cutoff,palette:p,incremental,confirmed:this.studyBars});
  if(refreshAnalysis)this.renderAnalysis(cutoff,p);
  if(this.studyView.paneChanged&&this.studyView.hasPane&&this.chart.panes().length>1){this.chart.panes()[0].setHeight(Math.max(120,this.host.clientHeight-118));this.chart.panes()[1].setHeight(100);}
  this.draw();
 }
 renderAnalysis(cutoff,colors){
  const step=seconds[this.interval];
  const closed=this.studyBars.filter(bar=>bar.time+step<=cutoff);
  const kinds=this.deskMode==='basic'?['range']:[...this.signalKinds,...(this.markers?['ema']:[])];
  this.visibleSignals=chartSignalEvents(this.bars,closed,{step,kinds,rsiPeriod:this.rsiPeriod});
  this.analysisRevision++;
  const stale=this.candleMeta?.cache==='stale'&&!this.confirmedStreamBars.has(closed.at(-1)?.time);
  this.autoSetup=buildAutoSetup(closed,{interval:this.interval,completedBefore:cutoff,nowSeconds:this.historyAnchor??Date.now()/1000,stale,events:this.visibleSignals});
  if(this.deskMode==='pro'){
   const extra=structureTools(closed,step,cutoff);
   this.autoSetup={...this.autoSetup,zones:extra.zones,profile:extra.profile,guides:[...this.autoSetup.guides,...extra.guides]};
  }
  const marks=new Map();
  this.markerDescriptions=new Map();
  for(const signal of this.visibleSignals){
   const {time,label,price,direction,id}=signal,key=`${time}:${direction}`,up=direction==='up';
   this.markerDescriptions.set(time,[this.markerDescriptions.get(time),label].filter(Boolean).join(' · '));
   if(!marks.has(key))marks.set(key,{time,price,id,position:up?'atPriceBottom':'atPriceTop',shape:up?'arrowUp':'arrowDown',color:up?colors.up:colors.down});
  }
  this.markerApi?.setMarkers([...marks.values()]);
 }
 focusSignal(id){
  const signal=this.visibleSignals.find(item=>item.id===id);
  if(!signal||!this.chart||!this.series)return false;
  const scale=this.chart.timeScale(),index=scale.timeToIndex(signal.time);
  if(index===null)return false;
  const view=scale.getVisibleLogicalRange();
  const span=Math.min(this.bars.length+4,Math.max(16,Math.min(80,view?view.to-view.from:32)));
  const from=Math.max(-1,Math.min(this.bars.length+3-span,index-span/2));
  this.viewPreset='custom';
  this.pendingRangePrefetch=false;
  scale.setVisibleLogicalRange({from,to:from+span});
  this.chart.setCrosshairPosition(signal.price,signal.time,this.series);
  this.notifyWindow();
  return true;
 }
 snapshotCutoff(response,requestedAt=Date.now()){const fetched=Date.parse(response?.fetchedAt);return Number.isFinite(fetched)?Math.floor(Math.min(fetched,requestedAt)/1000):0;}
 observeStudyBars(bars,cutoff,{stale=false,revision=Infinity}={}){
  const interval=seconds[this.interval];
  const confirmed=bars.filter(b=>b.time%interval===0&&b.time+interval<=cutoff);
  if(!confirmed.length)return false;
  const previous=this.studyBars;
  const merged=mergeCandleHistory(previous,confirmed,this.barRevisions,revision,{limit:HISTORY_LIMIT,stale});
  if(previous.length===merged.length&&previous.every((bar,i)=>sameBar(bar,merged[i])))return false;
  this.studyBars=merged;
  this.confirmedThrough=merged.at(-1).time+interval;
  return true;
 }
 completedCutoff(now=Math.floor(Date.now()/1000)){return Math.min(now,this.historyAnchor??Infinity,this.confirmedThrough);}
 updateSummary(){const cutoff=this.completedCutoff();this.onSummary(technicalSummary(this.studyBars.filter(b=>b.time<cutoff)));}
 applyHistory(response,revision,requestedAt=Date.now()){
  const incoming=normalizeCandles(response.data?.bars??[]);if(!incoming.length)throw Error('Invalid historical candles');
  const previous=this.bars,stale=response.cache==='stale',cutoff=this.snapshotCutoff(response,requestedAt);
  const previousStale=this.candleMeta?.cache==='stale';
  if(cutoff&&cutoff<this.latestSnapshotAt)return;
  this.latestSnapshotAt=Math.max(this.latestSnapshotAt,cutoff);
  const confirmed=this.studyBars.length?new Set(this.studyBars.map(bar=>bar.time)):new Set();
  const candidates=incoming.filter(bar=>!this.confirmedStreamBars.has(bar.time)&&
   (!confirmed.has(bar.time)||bar.time+seconds[this.interval]<=cutoff));
  const changedStudy=this.observeStudyBars(candidates,cutoff,{stale,revision});
  this.bars=mergeCandleHistory(previous,candidates,this.barRevisions,revision,{stale,limit:HISTORY_LIMIT});this.candleMeta=response;
  if(previous.length===this.bars.length&&previous.every((b,i)=>sameBar(b,this.bars[i]))){
   if(changedStudy||previousStale!==stale){this.renderIndicators();this.updateSummary();}
   if(stale&&!this.freshStream())this.status('stale');
   return;
  }
  const retained=new Set(this.bars.map(b=>b.time));for(const time of this.barRevisions.keys())if(!retained.has(time)){this.barRevisions.delete(time);this.barEvents.delete(time);this.confirmedStreamBars.delete(time);}
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
  if(this.socket)return;
  clearTimeout(this.reconnectTimer);
  let socket;
  try{socket=new WebSocket(endpoint);}catch{
   this.retrySocket(gen);
   return;
  }
  this.socket=socket;
  this.lastSocketFrame=Date.now();
  const current=()=>gen===this.generation&&!this.disposed&&socket===this.socket;
  socket.onopen=()=>{
   if(!current())return;
   if(venue==='coinbase'){
    try{socket.send(JSON.stringify({type:'subscribe',product_ids:[symbol],channels:['ticker','heartbeat']}));}
    catch{this.retrySocket(gen,socket);return;}
   }
   this.reconcile(gen);
  };
  socket.onmessage=event=>{
   if(!current())return;
   let message;
   try{message=JSON.parse(event.data);message=message?.data??message;}catch{return;}
   if(!message)return;
   if(message.lastUpdateId!==undefined){
    const book=parsePartialBook(message);
    if(!book||book.sequence<(this.bookSequence??0))return;
    this.bookSequence=book.sequence;
    this.lastBookAt=Date.now();
    this.lastSocketFrame=this.lastBookAt;
    this.onBook({data:book,provider:'Binance WebSocket',cache:'live',fetchedAt:new Date().toISOString()});
    return;
   }
   if(message.e==='kline'){
    if(!this.acceptKline(message,symbol,gen))return;
   }else if(message.e==='24hrTicker'||message.type==='ticker'){
    const quote=parseLiveQuote(message,this.instrument,this.quote);
    if(!quote)return;
    this.quote=quote;this.onQuote(quote);
   }else if(venue==='coinbase'&&message.type==='heartbeat'&&message.product_id===symbol){
    this.lastSocketFrame=Date.now();
    this.reconnectAttempt=0;
    return;
   }else return;
   this.lastStream=Date.now();
   this.lastSocketFrame=this.lastStream;
   this.reconnectAttempt=0;
   this.status('streaming');
  };
  socket.onerror=socket.onclose=()=>{if(current())this.retrySocket(gen,socket);};
 }
 retrySocket(generation,socket){
  if(this.disposed||generation!==this.generation||socket&&socket!==this.socket)return;
  this.closeSocket();
  this.lastStream=0;
  if(this.lastBookAt){this.lastBookAt=0;this.onBook(null);}
  this.status('polling');
  clearTimeout(this.reconnectTimer);
  const wait=Math.min(30000,1500*2**Math.min(this.reconnectAttempt??0,4));
  this.reconnectAttempt=(this.reconnectAttempt??0)+1;
  this.reconnectTimer=setTimeout(()=>this.connect(generation),wait);
 }
 checkConnection(generation,now=Date.now()){
  if(this.disposed||generation!==this.generation)return;
  if(this.socket&&now-this.lastSocketFrame>30000)this.retrySocket(generation,this.socket);
  if(this.lastStream&&now-this.lastStream>20000&&this.streamState==='streaming')this.status('delayed');
  if(this.lastBookAt&&now-this.lastBookAt>5000){this.lastBookAt=0;this.onBook(null);}
  this.onStatus(this.streamState);
 }
 closeSocket(){
  const socket=this.socket;
  if(!socket)return;
  this.socket=null;
  socket.onclose=socket.onmessage=socket.onerror=socket.onopen=null;
  try{socket.close();}catch{}
 }
 acceptKline(message,symbol,generation){
  const k=message.k,bar=parseStreamBar(message),step=seconds[this.interval],now=Date.now(),eventTime=Number(message.E);
  if(!bar||k.s!==symbol||k.i!==this.interval||typeof k.x!=='boolean'||bar.time%step!==0)return false;
  if(!Number.isSafeInteger(eventTime)||now-eventTime>30000||eventTime-now>5000||eventTime<=(this.barEvents.get(bar.time)??0))return false;
  if(bar.time*1000>eventTime||k.x&&eventTime<(bar.time+step)*1000-1000||this.confirmedStreamBars.has(bar.time))return false;

  const last=this.bars.at(-1),historical=Boolean(last&&bar.time<last.time);
  if(historical&&!k.x)return false;
  const index=historical?this.bars.findIndex(item=>item.time===bar.time):this.bars.length-(last?.time===bar.time?1:0);
  if(index<0){this.reconcile(generation);return false;}
  this.barEvents.set(bar.time,eventTime);
  this.barRevisions.set(bar.time,++this.liveRevision);
  this.lastKlineReceived=now;
  if(last&&bar.time>last.time+step)this.reconcile(generation);
  this.bars[index]=bar;
  if(this.bars.length>HISTORY_LIMIT){
   const removed=this.bars.shift();
   this.barRevisions.delete(removed.time);
   this.barEvents.delete(removed.time);
   this.confirmedStreamBars.delete(removed.time);
  }
  if(k.x){
   this.confirmedStreamBars.add(bar.time);
   this.observeStudyBars([bar],bar.time+step);
  }
  this.updateSeries({live:!historical,closed:k.x});
  if(k.x)this.updateSummary();
  return true;
 }
 scheduleRangeRender(wantOlder=false){
  this.pendingRangePrefetch=this.pendingRangePrefetch||wantOlder;
  if(this.rangeFrame)return;const chart=this.chart;
  this.rangeFrame=requestAnimationFrame(()=>{this.rangeFrame=0;const prefetch=this.pendingRangePrefetch;this.pendingRangePrefetch=false;
   if(this.disposed||chart!==this.chart)return;this.draw();this.notifyWindow();
   if(prefetch&&this.chart?.timeScale().getVisibleLogicalRange()?.from<HISTORY_EDGE)this.loadOlder({automatic:true});
  });
 }
 loadOlder({automatic=false,retry=false}={}){
  if(this.disposed||!this.bars.length||['end','limit'].includes(this.historyStatus)||automatic&&!retry&&this.historyStatus==='error')return;
  if(this.historyPage?.generation===this.generation)return this.historyPage.promise;
  if(this.bars.length>=HISTORY_LIMIT){this.historyStatus='limit';this.notifyWindow();return;}
  const task={generation:this.generation};
  task.promise=this.fetchOlderPage(automatic).finally(()=>{if(this.historyPage===task)this.historyPage=null;});
  this.historyPage=task;
  return task.promise;
 }
 async fetchOlderPage(automatic){
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
   this.updateSummary();
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
  this.seriesFirstTime=this.bars[0].time;this.seriesLastTime=this.bars.at(-1).time;
  if(live&&!closed)this.renderIndicators(true,{refreshAnalysis:false});
  else {this.renderIndicators(live);this.notifyWindow();}
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
  if(!this.chart||!this.svg)return;
  const guidePrefix={range:'range-',trend:'swing-trend',fibonacci:'fibonacci-',zones:'zones-',profile:'profile-'}[this.autoGuide];
  const automatic=!this.manualDrawing&&guidePrefix
   ? (this.autoSetup?.guides??[]).filter(({id})=>id.startsWith(guidePrefix))
   : [];
  const manual=this.deskMode==='pro'?this.workspace.drawings[this.key]??[]:[];
  if(!automatic.length&&!manual.length){
   if(this.svg.childElementCount)this.svg.replaceChildren();
   return;
  }
  const colors=palette(),scale=this.chart.timeScale();
  const {clientWidth:width,clientHeight:height}=this.host;
  const plotWidth=scale.width(),paneHeight=this.chart.panes()[0]?.getHeight()??height;
  const anchors=drawing=>drawing.points.map(({time,price})=>({x:scale.timeToCoordinate(time),y:this.series.priceToCoordinate(price)}));
  const labelX=x=>Math.max(8,Math.min(x,plotWidth-104));
  const autoLine=drawing=>{
   const [first,second]=anchors(drawing),trend=drawing.type==='trend';
   if(first.y===null||trend&&(!second||second.x===null||second.y===null||first.x===null))return '';
   const x1=first.x??0,x2=trend?second.x:plotWidth,y2=trend?second.y:first.y;
   const color=colors[drawing.color]??colors.gold,label=esc((drawing.label||drawing.type).slice(0,34));
   const line=`<line data-auto-guide="${drawing.id}" x1="${x1}" y1="${first.y}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-dasharray="5 4"/>`;
   const text=drawing.id.startsWith('fibonacci-')?'':`<text x="${labelX(x1+6)}" y="${first.y-5}" fill="${color}">${label}</text>`;
   return line+text+(trend?`<circle cx="${x1}" cy="${first.y}" r="3" fill="${color}"/><circle cx="${x2}" cy="${y2}" r="3" fill="${color}"/>`:'');
  };
  const manualLine=drawing=>{
   const [first,second]=anchors(drawing),label=esc(drawing.label||drawing.type);
   if(first.y===null)return '';
   if(drawing.type==='horizontal')return `<line x1="0" y1="${first.y}" x2="${plotWidth}" y2="${first.y}" stroke="${colors.gold}" stroke-dasharray="5 4"/><text x="12" y="${first.y-7}" fill="${colors.gold}">${label} · ${num(drawing.points[0].price,8)}</text>`;
   if(first.x===null)return '';
   if(drawing.type==='label')return `<circle cx="${first.x}" cy="${first.y}" r="4" fill="${colors.accent}"/><text x="${first.x+8}" y="${first.y-7}" fill="${colors.text}">${label}</text>`;
   if(!second||second.x===null||second.y===null)return '';
   if(drawing.type==='trend')return `<line x1="${first.x}" y1="${first.y}" x2="${second.x}" y2="${second.y}" stroke="${colors.accent}" stroke-width="2"/><circle cx="${first.x}" cy="${first.y}" r="3" fill="${colors.accent}"/><circle cx="${second.x}" cy="${second.y}" r="3" fill="${colors.accent}"/>`;
   const left=Math.min(first.x,second.x),right=Math.max(first.x,second.x);
   const [from,to]=drawing.points;
   return [0,.236,.382,.5,.618,.786,1].map(ratio=>{
    const y=first.y+(second.y-first.y)*ratio,value=from.price+(to.price-from.price)*ratio;
    return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${colors.violet}" opacity=".7"/><text x="${labelX(right+5)}" y="${y-4}" fill="${colors.violet}">${ratio} · ${num(value,4)}</text>`;
   }).join('');
  };
  this.svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  this.svg.innerHTML=[...automatic.map(autoLine),...manual.map(manualLine)].join('');
  this.svg.style.clipPath=`inset(0 ${Math.max(0,width-plotWidth)}px ${Math.max(0,height-paneHeight)}px 0)`;
 }
 exportCSV(){
  if(!this.bars.length){toast('Wait for market history before exporting.');return;}
  const cutoff=this.completedCutoff(),step=seconds[this.interval];
  const confirmed=new Set(this.studyBars.filter(bar=>bar.time+step<=cutoff).map(bar=>bar.time));
  download(`cryptoz-${this.instrument.venue}-${this.instrument.symbol}-${this.interval}.csv`,serializeCSV(['time','open','high','low','close','volume','venue','quote','closed'],this.bars.map(b=>[new Date(b.time*1000).toISOString(),b.open,b.high,b.low,b.close,b.volume,this.instrument.venue,this.instrument.quote,confirmed.has(b.time)])),'text/csv');
 }
 async exportPNG(){
  if(!this.chart||!this.svg||this.exporting)return;this.exporting=true;const instrument={...this.instrument},interval=this.interval;
  try{const blob=await capturePNG({chart:this.chart,overlay:new XMLSerializer().serializeToString(this.svg),watermark:`CRYPTOZ · ${instrument.venue.toUpperCase()} ${instrument.symbol} ${interval} · exported ${new Date().toISOString()}`,color:palette().accent});downloadBlob(`cryptoz-${instrument.venue}-${instrument.symbol}-${interval}.png`,blob);}catch(error){toast('Snapshot export failed: '+error.message);}finally{this.exporting=false;}
 }
 stopNetwork(){if(this.rangeFrame){cancelAnimationFrame(this.rangeFrame);this.rangeFrame=0;}this.pendingRangePrefetch=false;this.networkController?.abort();this.historyPage=null;this.pollToken=null;clearInterval(this.pollTimer);clearInterval(this.healthTimer);clearTimeout(this.reconnectTimer);this.closeSocket();this.polling=false;}
 dispose(){this.disposed=true;this.generation++;this.stopNetwork();this.gestureController?.abort();this.observer?.disconnect();this.chart?.remove();}
}
