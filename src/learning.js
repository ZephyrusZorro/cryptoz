import {createChart,LineSeries} from 'lightweight-charts';
import {api} from './api.js';
import {signalSnapshot} from './signals.js';
import {ema,normalizeCandles} from './analytics.js';
import {palette,chartOptions} from './theme.js';
import {esc,num,stamp,icon} from './ui.js';
const lessons=[
 ['candles','Candles','Candles','A candle records the open, high, low and close over an interval. Its body shows open to close; its wicks show the observed extremes. Volume is activity, not a count of unique investors.','A green candle can still sit inside a longer downtrend. Inspect the interval, venue and quote before interpreting a pattern.','On this page, the line uses completed closes only. The terminal also shows the current provisional candle.'],
 ['trend','Moving averages','Moving averages','EMA gives greater weight to recent closes. A close above EMA 20, with EMA 20 above EMA 50, meets our upward-alignment rule. The reverse meets the downward rule. Other arrangements are mixed.','Moving averages lag price. Range-bound markets can produce repeated false crossovers. An alignment is not a forecast.','Add moving averages under Indicators in Charts. The Signals panel can mark crosses on completed candles.'],
 ['momentum','RSI & MACD','RSI & MACD','Wilder RSI (14) compares smoothed gains and losses on a 0–100 scale. Above 70 is conventionally called overbought; below 30 is oversold. MACD compares EMA 12 and EMA 26; its histogram subtracts the 9-period signal.','Overbought can persist during a strong rise. A positive MACD histogram is descriptive and does not mean the next candle will rise.','Add RSI or MACD under Indicators in Charts. Read both alongside price ranges and liquidity.'],
 ['volatility','Volatility & bands','Volatility','ATR (14) smooths true range, including gaps between candles. Bollinger Bands use a 20-close simple average plus or minus two population standard deviations. Band position locates the close between those bands.','ATR has no directional sign. A band touch is not automatically a reversal. These bands do not guarantee a 95% probability interval.','Use volatility as context for your own invalidation level. The risk calculator accounts for chosen fees but cannot model all slippage.'],
 ['liquidity','Order books','Order books','The book shows visible limit orders at this venue. Spread is best ask minus best bid. Displayed depth can change or disappear before you trade; it is not total global liquidity.','A large resting order is not proof of institutional intent. Market orders can consume several levels and incur slippage.','Open the Order book panel in Charts. Binance streams partial depth and Coinbase shows timestamped snapshots.'],
 ['risk','Risk planning','Risk planning','A research plan defines the instrument, horizon, evidence, invalidation and a loss budget. Position size divides the chosen budget by loss per unit, including estimated fees.','Historical correlations and indicators change. A stop price is not a guaranteed execution price. Avoid treating any condition as a personalized recommendation.','Open Position calculator under Practice to compare the stop, target and fees for one scenario.']
];

export function closedLearningHistory(bars,seconds,fetchedAt,requestedAt) {
 const measured = Math.min(Date.parse(fetchedAt), requestedAt);
 if (!Number.isFinite(measured) || !Number.isInteger(seconds) || seconds <= 0) return [];
 return normalizeCandles(bars ?? []).filter(bar => bar.time % seconds === 0 && (bar.time + seconds) * 1000 <= measured);
}

export function mountLearning(root,{instruments,hydrate,onChart,request=api}){
 let requestController,pendingRun;
 let disposed=false,generation=0,busy=false,chart=null,lines=[],lastBars=[],lesson='candles';
 root.innerHTML=`<div class="learning-layout">
 <section class="panel learning-example">
  <div class="panel-top"><div><h2>Market example</h2><p>Compare completed closes with two moving averages.</p></div></div>
  <form class="learning-controls">
   <label>Exchange<select name="venue"><option value="binance">Binance · USDT</option><option value="coinbase">Coinbase · USD</option></select></label>
   <label>Trading pair<select name="instrument" aria-label="Learning instrument"></select></label>
   <label>Candle interval<select name="interval"><option value="1h">1 hour</option><option value="4h">4 hours</option><option value="1d">1 day</option></select></label>
   <label>Show readings<select name="family"><option value="all">All</option><option value="trend">Trend</option><option value="momentum">Momentum</option><option value="volatility">Volatility</option></select></label>
   <button type="submit" class="button" aria-label="Refresh learning data">${icon('refresh-cw')} Refresh</button>
  </form>
  <div class="learning-status" role="status">Connecting to exchange history…</div>
  <div class="learning-chart" aria-label="Completed close and EMA chart"></div>
  <div class="panel-bottom learning-chart-footer">
   <ul class="learning-color-key" aria-label="Line colors"><li>Close</li><li>EMA 20</li><li>EMA 50</li></ul>
   <button type="button" class="text-link" id="learn-open-chart">Open in Charts ${icon('arrow-up-right')}</button>
  </div>
  <div class="signal-grid"></div>
 </section>
 <section class="panel learning-terms-guide">
  <div class="panel-top"><h2>What the readings mean</h2></div>
  <div class="lesson-nav" role="group" aria-label="Learning topics">${lessons.map(([id,title])=>`<button type="button" data-lesson="${id}" aria-pressed="${id===lesson}">${esc(title)}</button>`).join('')}</div>
  <article class="lesson-content"></article>
 </section>
 </div>`;
 const form=root.querySelector('form'),status=root.querySelector('.learning-status'),host=root.querySelector('.learning-chart');let snapshot=null;
 function list(){return instruments[form.elements.venue.value]??[];}
 function fill(){const current=form.elements.instrument.value,base=current?.replace(/USDT$|-USD$/,'')||'BTC',v=form.elements.venue.value,items=list();const available=items.length?items:['BTC','ETH','SOL'].map(base=>({base,venue:v,quote:v==='binance'?'USDT':'USD',symbol:v==='binance'?base+'USDT':base+'-USD'}));form.elements.instrument.innerHTML=available.slice().sort((a,b)=>a.base.localeCompare(b.base)).map(i=>`<option value="${esc(i.symbol)}">${esc(i.base)} / ${esc(i.quote)}</option>`).join('');form.elements.instrument.value=available.find(i=>i.base===base)?.symbol??available[0].symbol;}
 function showLesson(){const x=lessons.find(x=>x[0]===lesson);root.querySelectorAll('[data-lesson]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lesson===lesson));root.querySelector('.lesson-content').innerHTML=`<h3>${esc(x[2])}</h3><p>${esc(x[3])}</p><div class="lesson-example">${esc(x[4])}</div><p>${esc(x[5])}</p><a href="https://www.coinbase.com/learn/advanced-trading/reading-financial-charts" target="_blank" rel="noopener noreferrer">Further reading · Coinbase ${icon('external-link')}</a>`;hydrate();}
 function cards(){const el=root.querySelector('.signal-grid');if(!snapshot?.ready){el.innerHTML='<p class="data-note">At least 50 completed candles are required. Missing history is not synthesized.</p>';return;}const s=snapshot,cards=[['trend','EMA ALIGNMENT',s.trend,`Close ${num(s.close,6)} · EMA 20 ${num(s.ema20,6)} · EMA 50 ${num(s.ema50,6)}`,'Rule: close > EMA 20 > EMA 50, or the reverse.','Lagging trend context'],['momentum','RSI · WILDER 14',num(s.rsi,2),`${s.momentum}. Conventional thresholds: 30 and 70.`,'Persistent extremes can accompany a continuing trend.','Momentum, not a reversal call'],['momentum','MACD HISTOGRAM',num(s.macd,6),`EMA 12 − EMA 26, less its EMA 9 signal. ${s.macd>=0?'Above':'Below'} zero on the last completed bar.`,'A change of sign can whipsaw in ranging markets.','12 / 26 / 9'],['volatility','ATR · WILDER 14',num(s.atr,6),`${num(s.volatility)}% of last close. True range in the instrument’s quote units.`,'ATR measures range, not price direction.','Volatility context'],['volatility','BOLLINGER POSITION',s.bandPosition===null?'Undefined':num(s.bandPosition,1)+'%',`Lower ${num(s.bbLower,6)} · Upper ${num(s.bbUpper,6)}. ${s.bandPosition===null?'Zero-width bands; position is undefined.':'0% is lower band; 100% is upper.'}`,'Values may exceed the bands; no probability is implied.','20 closes · ±2 standard deviations']];el.innerHTML=cards.filter(x=>form.elements.family.value==='all'||x[0]===form.elements.family.value).map(x=>`<article class="signal-card"><span>${esc(x[1])}</span><strong>${esc(x[2])}</strong><p>${esc(x[3])}</p><p>${esc(x[4])}</p><small>${esc(x[5])}</small></article>`).join('');}
 function draw(rebuild=false){if(!lastBars.length)return;const closes=lastBars.map(b=>b.close);if(chart&&!rebuild){[closes,ema(closes,20),ema(closes,50)].forEach((v,i)=>lines[i].setData(v.flatMap((x,j)=>x===null?[]:[{time:lastBars[j].time,value:x}])));return;}chart?.remove();chart=null;lines=[];host.innerHTML='';const p=palette();chart=createChart(host,{autoSize:true,...chartOptions(),layout:{...chartOptions().layout,fontFamily:'DM Sans',fontSize:11,attributionLogo:true},timeScale:{...chartOptions().timeScale,timeVisible:true}});[[closes,p.accent,'Close'],[ema(closes,20),p.gold,'EMA 20'],[ema(closes,50),p.violet,'EMA 50']].forEach(([v,color,title])=>{const s=chart.addSeries(LineSeries,{color,title,lineWidth:title==='Close'?2:1,priceLineVisible:false,lastValueVisible:false});s.setData(v.flatMap((x,i)=>x===null?[]:[{time:lastBars[i].time,value:x}]));lines.push(s);});chart.timeScale().setVisibleLogicalRange({from:Math.max(0,lastBars.length-100),to:lastBars.length+3});}
 function run(clear=false){
  if(disposed)return Promise.resolve();if(busy&&!clear)return pendingRun;
  const gen=++generation,requestedAt=Date.now();requestController?.abort();const controller=requestController=new AbortController();busy=true;
  const venue=form.elements.venue.value,symbol=form.elements.instrument.value,interval=form.elements.interval.value,seconds={'1h':3600,'4h':14400,'1d':86400}[interval];
  if(clear){chart?.remove();chart=null;lastBars=[];snapshot=null;cards();host.innerHTML='';status.textContent=`Fetching ${venue.toUpperCase()} ${symbol} · ${interval} completed candles…`;}
  pendingRun=(async()=>{
   try{const r=await request(`candles?venue=${venue}&symbol=${encodeURIComponent(symbol)}&interval=${interval}`,{signal:controller.signal});if(disposed||gen!==generation)return;const closed=closedLearningHistory(r.data?.bars,seconds,r.fetchedAt,requestedAt);if(!closed.length)throw Error('No confirmed closes in this snapshot');lastBars=closed;snapshot=signalSnapshot(lastBars,seconds);draw();cards();status.textContent=`${venue.toUpperCase()} · ${symbol} · ${r.cache==='stale'?'Delayed snapshot · ':''}${snapshot.count} completed candles · closed ${stamp((lastBars.at(-1).time+seconds)*1000)}`;}
   catch(e){if(disposed||gen!==generation||controller.signal.aborted)return;status.textContent='Unavailable: '+e.message+'. Try Refresh.';if(snapshot)status.textContent+=' Previous observations may now be delayed.';}
   finally{if(gen===generation){busy=false;pendingRun=null;}}
  })();return pendingRun;
 }
 form.addEventListener('submit',e=>{e.preventDefault();run();});form.elements.venue.addEventListener('change',()=>{fill();run(true);});form.elements.instrument.addEventListener('change',()=>run(true));form.elements.interval.addEventListener('change',()=>run(true));form.elements.family.addEventListener('change',cards);root.querySelector('.lesson-nav').addEventListener('click',e=>{const b=e.target.closest('[data-lesson]');if(b){lesson=b.dataset.lesson;showLesson();}});root.querySelector('#learn-open-chart').addEventListener('click',()=>{const venue=form.elements.venue.value,symbol=form.elements.instrument.value;onChart(list().find(i=>i.symbol===symbol)??{venue,symbol,base:symbol.replace(/USDT$|-USD$/,''),quote:venue==='binance'?'USDT':'USD'});});fill();showLesson();run(true);const timer=setInterval(()=>{if(!document.hidden)run();},15000);
 return {dispose(){disposed=true;generation++;requestController?.abort();clearInterval(timer);chart?.remove();},updateInstruments(){if(disposed)return;const previous=form.elements.instrument.value;fill();if(previous!==form.elements.instrument.value){run(true);status.textContent='Listing updated. '+status.textContent;}},applyTheme(){const range=chart?.timeScale().getVisibleLogicalRange();draw(true);if(range)chart?.timeScale().setVisibleLogicalRange(range);},refresh(){return run();}};
}
