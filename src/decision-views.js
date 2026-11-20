import {esc,icon,pct,price,tone} from './ui.js';
import {moneyMarkup} from './currency.js';
import {getAnalystResearch} from './analyst-research.js';
import {summarizeForecasts} from './forecast-ledger.js';

export function analystPanel(asset,marketQuote=null){
 const analysis=getAnalystResearch(asset);
 const {name,symbol}=analysis.asset;
 const title=name===symbol||!symbol?esc(name):`${esc(name)} <small class="analyst-ticker">${esc(symbol)}</small>`;
 const reviewed=new Date(analysis.asOf+'T00:00:00Z').toLocaleDateString(undefined,{dateStyle:'medium',timeZone:'UTC'});
 const spot=Number.isFinite(marketQuote?.price)&&marketQuote.price>0?marketQuote.price:null;
 const summary=analysis.summary;
 const contextStrip=(spot||analysis.views.length)?`<dl class="analyst-context-bar">
  ${spot?`<div><dt>Live spot</dt><dd>${moneyMarkup(spot,'USD')}${Number.isFinite(marketQuote.change)?` <small class="${tone(marketQuote.change)}">${pct(marketQuote.change)}</small>`:''}</dd></div>`:''}
  ${Number.isFinite(marketQuote?.marketCap)&&marketQuote.marketCap>0?`<div><dt>Market cap</dt><dd>${moneyMarkup(marketQuote.marketCap,'USD','compact')}</dd></div>`:''}
  <div><dt>Verified notes</dt><dd>${summary.totalViews}${summary.publishers.length?` <small>· ${summary.publishers.length} ${summary.publishers.length===1?'firm':'firms'}</small>`:''}</dd></div>
  ${summary.latestPublished?`<div><dt>Latest note</dt><dd><time datetime="${esc(summary.latestPublished)}">${esc(new Date(summary.latestPublished+'T00:00:00Z').toLocaleDateString(undefined,{dateStyle:'medium',timeZone:'UTC'}))}</time></dd></div>`:''}
 </dl>`:'';
 const stanceTone=s=>/Cautious/i.test(s)?'analyst-pill-warn':/Neutral/i.test(s)?'analyst-pill-neutral':'analyst-pill-positive';
 return `<header class="analyst-banner panel era-surface">
  <div class="analyst-banner-head">
   <div><h2>${title}</h2><p>${esc(analysis.coverage)}</p></div>
   ${symbol?`<button type="button" class="button" data-action="analyst-open-chart" data-symbol="${esc(symbol)}">Open live chart ${icon('arrow-up-right')}</button>`:''}
  </div>
  ${contextStrip}
  <p>${esc(analysis.synthesis)}${analysis.views.length?` <span class="source">Sources reviewed <time datetime="${esc(analysis.asOf)}">${esc(reviewed)}</time></span>`:''}</p>
 </header>${analysis.views.length?`<div class="analyst-grid">${analysis.views.map(view=>{
  const impliedGap=spot&&Number.isFinite(view.targetUsd)?((view.targetUsd/spot-1)*100):null;
  const targetLine=Number.isFinite(view.targetUsd)?`<div class="analyst-target-row"><span>Stated scenario level</span><strong>${moneyMarkup(view.targetUsd,'USD')}${impliedGap!==null?` <small class="${tone(impliedGap)}">(${pct(impliedGap)} vs spot)</small>`:''}</strong></div>`:'';
  const points=(view.drivers.length||view.keyRisks.length)?`<dl class="analyst-points">${view.drivers.length?`<div><dt>Key drivers</dt><dd>${view.drivers.map(d=>`<span>${esc(d)}</span>`).join('')}</dd></div>`:''}${view.keyRisks.length?`<div><dt>Risks / conditions</dt><dd>${view.keyRisks.map(r=>`<span>${esc(r)}</span>`).join('')}</dd></div>`:''}</dl>`:'';
  return `<article class="panel analyst-card era-surface">
   <div class="analyst-meta"><strong>${esc(view.publisher)}</strong><time datetime="${esc(view.published)}">${esc(new Date(view.published+'T00:00:00Z').toLocaleDateString(undefined,{dateStyle:'medium',timeZone:'UTC'}))}</time></div>
   <div class="analyst-tags"><span class="analyst-pill ${stanceTone(view.stance)}">${esc(view.stance)}</span><span class="analyst-pill">${esc(view.lens)}</span></div>
   <h3><a href="${esc(view.url)}" target="_blank" rel="noopener noreferrer">${esc(view.title)} ${icon('arrow-up-right')}</a></h3>
   ${view.author?`<p class="source">${esc(view.author)}</p>`:''}<p>${esc(view.view)}</p>${targetLine}${points}<div class="analyst-scope"><span>${esc(view.type)}${view.period?' · '+esc(view.period):''}${view.periodEnded?' · Horizon ended':''}</span><small>${esc(view.context)}</small></div>
  </article>`;
 }).join('')}</div>`:''}`;
}

export function chartGuide(pov,setup,mode,studies=[],studyCatalog={}){
 const quote=pov.instrument?.quote??'';
 const out=pov.outlook;
 const outlookCard=pov.ready&&out?`<section class="chart-outlook" aria-label="Technical bias and price path">
  <div class="chart-outlook-head">
   <strong class="${out.biasTone==='up'?'positive':out.biasTone==='down'?'negative':''}">${esc(out.bias)}</strong>
   <span class="chart-outlook-score">${out.score>0?'+':''}${out.score} / ${out.maxScore} factors</span>
  </div>
  <p>${esc(out.summary)}</p>
  <dl class="chart-path-grid">
   <div><dt>Upside trigger → target</dt><dd class="positive">${moneyMarkup(out.upsideTrigger,quote)} → ${moneyMarkup(out.upsideTarget,quote)}</dd></div>
   <div><dt>Downside break → risk</dt><dd class="negative">${moneyMarkup(out.downsideTrigger,quote)} → ${moneyMarkup(out.downsideTarget,quote)}</dd></div>
  </dl>
  <ul class="chart-factor-pills">${out.factors.map(f=>`<li class="factor-${f.tone}"><span>${esc(f.label)}</span><strong><i class="factor-dot" aria-hidden="true"></i>${esc(f.state)}</strong></li>`).join('')}</ul>
 </section>`:'';
 const core=pov.ready?`<div class="chart-reading-state"><strong>${esc(pov.trend)}</strong><time datetime="${new Date(pov.closedAt*1000).toISOString()}">${new Date(pov.closedAt*1000).toISOString().slice(0,16).replace('T',' ')} UTC</time></div>
 ${outlookCard}
 <dl class="chart-observations">${pov.observations.map(x=>`<div><dt>${esc(x.label)}</dt><dd>${esc(x.text)}${mode!=='basic'?'<small>'+esc(x.detail)+'</small>':''}</dd></div>`).join('')}</dl>`:`<p class="source">${esc(pov.reason)}</p>`;
 const latestSetup=setup?.ready&&!setup.stale?setup.events?.at(-1):null;
 const selectedGuide=setup?.[setup.activeGuide];
 return `${pov.stale?'<p class="source warn">Latest confirmed history is delayed.</p>':''}${core}
 ${pov.ready?`<details class="guide-disclosure"><summary>What to watch next (price paths)</summary><dl class="chart-observations">${pov.scenarios.map(s=>`<div><dt>${esc(s.label)}</dt><dd>${esc(s.text)}</dd></div>`).join('')}</dl></details>`:''}
 <details class="guide-disclosure"><summary>How to read a candle</summary><p>The body shows the opening and closing price. The thin lines show the highest and lowest prices. The unfinished candle can change until its interval ends.</p><a href="#learn?view=readings" class="text-link">Try a guided chart</a></details>
 ${studies.length?`<details class="guide-disclosure"><summary>What your studies mean</summary><dl class="chart-observations">${studies.filter(id=>studyCatalog[id]).map(id=>`<div><dt>${esc(studyCatalog[id].label)}</dt><dd>${esc(studyCatalog[id].meaning)} <small>${esc(studyCatalog[id].check)}</small></dd></div>`).join('')}</dl></details>`:''}
 ${setup&&setup.activeGuide!=='none'?`<details class="guide-disclosure"><summary>${esc(selectedGuide?.label??'Automatic drawing')}</summary><p>${esc(selectedGuide?.detail??setup.reason??'No confirmed anchors for this setup yet.')}</p>${selectedGuide?.anchors?.length?`<dl class="chart-observations">${selectedGuide.anchors.map(a=>`<div><dt>${esc(a.kind)} · ${price(a.price,'')}</dt><dd>Anchor ${new Date(a.time*1000).toISOString().slice(0,16).replace('T',' ')} UTC</dd></div>`).join('')}</dl>`:''}${selectedGuide?.levels?.length?`<dl class="fib-levels">${selectedGuide.levels.map(level=>`<div><dt>${(level.ratio*100).toFixed(1)}%</dt><dd>${price(level.price,'')}</dd></div>`).join('')}</dl>`:''}</details>`:''}
 ${latestSetup?`<p class="setup-event"><b>Last closed-bar event</b><br>${esc(latestSetup.label)} <time datetime="${new Date(latestSetup.confirmedAt*1000).toISOString()}">${esc(new Date(latestSetup.confirmedAt*1000).toISOString().slice(0,16).replace('T',' '))} UTC</time><br><small>${esc(latestSetup.detail)}</small></p>`:''}`;
}

export function forecastPanel(result,{archive=false,recorded=null,superseded=false}={}){
 const number=x=>Number.isFinite(x)?x.toFixed(3):'—';
 const percent=x=>Number.isFinite(x)?(100*x).toFixed(1)+'%':'—';
 const timestamp=t=>Number.isFinite(t)?new Date(t*1000).toISOString().slice(0,16).replace('T',' ')+' UTC':'—';
 const quote=result.venue==='coinbase'?'USD':'USDT';
 const evidence=result.evidence,f=archive||superseded?null:result.forecast,baseline=evidence?.strongestBaseline,calibration=result.reliability,bands=calibration?.bands?.filter(x=>x.count>0)??[],sample=result.scenarios;
 const proj=archive||superseded?null:result.projection,analogs=result.analogs,drivers=result.drivers??[],regime=result.regime;
 const matchingRecord=recorded&&f&&recorded.originClose===f.originClose&&recorded.probabilityUp===f.probabilityUp;
 const comparators=evidence?.baselines??[];
 const checks=evidence?[
  ['sample','At least 50 test windows',`${evidence.count} separate forecasts`],
  ['bothOutcomes','At least 8 of each outcome',`${evidence.upCount} higher · ${evidence.notUpCount} flat or lower`],
  ['brierGain','Beat the strongest baseline by 0.010',`${number((baseline?.brier??evidence.baselineBrier)-evidence.modelBrier)} improvement`],
  ['accuracy','Match or exceed baseline accuracy',`${percent(evidence.modelAccuracy)} model · ${percent(baseline?.accuracy??evidence.baselineAccuracy)} baseline`],
  ['stability','Improve in at least 3 blocks, including the latest',`${evidence.winningBlocks} / ${evidence.blockCount} time blocks improved`]
 ]:[];
 const blocks=evidence?.blocks??[];
 const projectionCard=proj?`<section class="forecast-projection" aria-label="Learned price projection">
  <div class="forecast-proj-head">
   <div>
    <span class="forecast-badge ${proj.verifiedCall?'forecast-badge-verified':'forecast-badge-context'}">${proj.verifiedCall?'Verified walk-forward call':'Historical context projection'}</span>
    <h4 class="${proj.leanTone==='up'?'positive':proj.leanTone==='down'?'negative':''}">${esc(proj.lean)} · ${percent(proj.probabilityUp)} higher-close probability</h4>
   </div>
   <small>Horizon: ${result.horizon} ${esc(result.interval)} bars (target ${timestamp(result.targetCloseAt)})</small>
  </div>
  ${proj.corridor?`<dl class="forecast-corridor">
   <div><dt>Bear case (25th %ile)</dt><dd>${moneyMarkup(proj.corridor.bearPrice,quote,'parallel')}<small class="${tone(proj.corridor.bearPct)}">${pct(proj.corridor.bearPct)}</small></dd></div>
   <div class="forecast-corridor-base"><dt>Base median target</dt><dd>${moneyMarkup(proj.corridor.basePrice,quote,'parallel')}<small class="${tone(proj.corridor.basePct)}">${pct(proj.corridor.basePct)}</small></dd></div>
   <div><dt>Bull case (75th %ile)</dt><dd>${moneyMarkup(proj.corridor.bullPrice,quote,'parallel')}<small class="${tone(proj.corridor.bullPct)}">${pct(proj.corridor.bullPct)}</small></dd></div>
  </dl>
  <p class="forecast-evidence-label">${esc(proj.corridor.source)} · 10th–90th historical band: ${moneyMarkup(proj.corridor.wideLowPrice,quote)} to ${moneyMarkup(proj.corridor.wideHighPrice,quote)}${proj.invalidation?` · Structure support ${moneyMarkup(proj.invalidation.supportLevel,quote)} / resistance ${moneyMarkup(proj.invalidation.resistanceLevel,quote)}`:''}</p>`:''}
  ${proj.reasons?.length?`<div class="forecast-reasons"><h5>Why this projection</h5><ul>${proj.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div>`:''}
 </section>`:'';
 const driversSection=drivers.length?`<details class="guide-disclosure" data-disclosure="drivers"><summary>Learned coin drivers &amp; ensemble weights</summary>
  <dl class="forecast-drivers">${drivers.slice(0,6).map(d=>`<div><dt>${esc(d.label)}</dt><dd class="${d.direction==='up'?'positive':d.direction==='down'?'negative':''}">${d.direction==='up'?'Bullish push':d.direction==='down'?'Bearish drag':'Neutral'} <small>(score ${d.contribution>=0?'+':''}${d.contribution.toFixed(3)})</small></dd></div>`).join('')}</dl>
  ${proj?.expertWeights?.length?`<table class="forecast-comparison"><thead><tr><th>Ensemble model</th><th>Learned weight</th><th>Higher-close est.</th></tr></thead><tbody>${proj.expertWeights.map(w=>`<tr><th scope="row">${esc(w.label)}</th><td>${w.weightPct}%</td><td>${percent(w.probabilityUp)}</td></tr>`).join('')}</tbody></table>`:''}
 </details>`:'';
 const analogSection=analogs?`<details class="guide-disclosure" data-disclosure="analogs"><summary>Closest historical coin setups · ${analogs.count} analogs</summary>
  <p>${analogs.upCount} higher · ${analogs.downCount} flat/lower (${percent(analogs.upRate)} higher-close rate · median move ${pct(analogs.medianReturn*100)}).</p>
  <table class="forecast-comparison"><thead><tr><th>Past setup (UTC)</th><th>Similarity</th><th>Start close</th><th>After ${result.horizon} bars</th></tr></thead><tbody>${analogs.topMatches.map(m=>`<tr><th scope="row">${timestamp(m.asOf)}</th><td>${m.similarityPct}%</td><td>${moneyMarkup(m.originClose,quote)}</td><td class="${tone(m.forwardReturn*100)}">${pct(m.forwardReturn*100)}</td></tr>`).join('')}</tbody></table>
 </details>`:'';
 return `<div class="forecast-outcome"><strong>${f?'Study leans '+(f.direction==='up'?'higher':'flat or lower'):archive?'Historical test only':superseded?'New candle available':'No directional call'}</strong><small>${f?`Estimated higher-close score ${percent(f.probabilityUp)} · target ${timestamp(f.targetCloseAt)}.${matchingRecord?' Recorded in this browser.':recorded?' The journal retains the original result for this window.':''}`:`${archive?'Use Reset view to return to live candles for a current study.':superseded?'Run a new study for the latest confirmed candle.':esc(result.reason??'Insufficient evidence.')}`}</small></div>
 ${projectionCard}
 ${result.closedCount?`<p>${result.closedCount.toLocaleString()} consecutive closed candles · ${timestamp(result.sampleStart)} to ${timestamp(result.asOf)} · ${result.horizon} candles ahead at ${esc(result.interval)} each${regime?` · Regime: ${esc(regime.structure)}, ${esc(regime.volatility.toLowerCase())} volatility`:''}.</p>`:''}
 ${result.incompleteHistory?'<p class="forecast-evidence-label">The requested window could not be filled. The results below use the available contiguous sample.</p>':result.gap?'<p class="forecast-evidence-label">A gap limits the sample to the latest consecutive candles.</p>':''}
 ${evidence?`<dl class="forecast-metrics"><div><dt>Training examples in latest fit</dt><dd>${evidence.trainingCount}</dd></div><div><dt>Historical tests</dt><dd>${evidence.count}</dd></div><div><dt>Model probability error</dt><dd>${number(evidence.modelBrier)}</dd></div><div><dt>Best baseline error</dt><dd>${number(baseline?.brier??evidence.baselineBrier)}</dd></div></dl>
 <p class="forecast-interpretation">The strongest comparison is ${esc(baseline?.label??'Historical up rate')}. A lower probability error means scores were closer to what happened in the historical tests.</p>
 <ul class="forecast-checks" aria-label="Evidence checks">${checks.map(([key,label,detail])=>`<li><strong>${evidence.checks?.[key]?'Met':'Missed'} · ${label}</strong><small>${detail}</small></li>`).join('')}</ul>
 ${driversSection}${analogSection}
 <details class="guide-disclosure" data-disclosure="test"><summary>How the study was tested</summary><p>${timestamp(evidence.start)} to ${timestamp(evidence.end)}. ${esc(result.method)}. Each test fits only to earlier outcomes and looks for a higher close after the selected number of candles.</p>
 ${comparators.length?`<table class="forecast-comparison"><thead><tr><th>Method</th><th>Error</th><th>Accuracy</th></tr></thead><tbody><tr><th scope="row">Forecast model</th><td>${number(evidence.modelBrier)}</td><td>${percent(evidence.modelAccuracy)}</td></tr>${comparators.map(row=>`<tr><th scope="row">${esc(row.label)}</th><td>${number(row.brier)}</td><td>${percent(row.accuracy)}</td></tr>`).join('')}</tbody></table>`:''}
 ${blocks.length?`<table class="forecast-comparison"><thead><tr><th>Time block</th><th>Cases</th><th>Model error</th><th>Baseline error</th></tr></thead><tbody>${blocks.map((block,index)=>`<tr><th scope="row">${index+1}${index===blocks.length-1?' · latest':''}</th><td>${block.count}</td><td>${number(block.modelBrier)}</td><td>${number(block.baselineBrier)}</td></tr>`).join('')}</tbody></table>`:''}
 <button class="button" data-action="forecast-csv">Download test cases</button></details>`:''}
 ${bands.length?`<details class="guide-disclosure" data-disclosure="reliability"><summary>How often test scores matched outcomes</summary><p>Each band shows the observed higher-close rate and the number of comparable tests.${calibration.current?` The current score band has ${calibration.current.count} comparable cases. At least ${calibration.current.minimumCount} are required before checking directional support.`:''}</p><div class="calibration-bars">${bands.map(b=>`<div><span>${percent(b.lower)}–${percent(b.upper)}</span><meter min="0" max="1" value="${b.observedRate}" aria-label="Observed higher-close rate">${percent(b.observedRate)}</meter><span>${percent(b.observedRate)} · ${b.count}</span></div>`).join('')}</div></details>`:''}
 ${sample?`<details class="guide-disclosure" data-disclosure="scenarios"><summary>Historical price changes after ${result.horizon} candles</summary><p>${sample.up} higher, ${sample.flat} flat, ${sample.down} lower. The middle outcome was ${percent(sample.median)}. The 10th to 90th percentile range was ${percent(sample.lower)} to ${percent(sample.upper)} across ${sample.count} historical tests.</p></details>`:''}`;
}
export function forecastJournal(rows){
 if(!rows.length)return '<p class="data-note">A directional study is recorded in this browser when it passes the evidence checks. Its result appears here after the exact target candle closes.</p>';
 const time=t=>new Date(t*1000).toISOString().slice(5,16).replace('T',' ')+' UTC';
 const {settled,correct,pending,modelBrier,baselineBrier}=summarizeForecasts(rows);
 const metrics=settled?`<dl class="forecast-metrics"><div><dt>Direction matched</dt><dd>${correct} / ${settled}</dd></div><div><dt>Model probability error</dt><dd>${modelBrier.toFixed(3)}</dd></div><div><dt>Historical baseline error</dt><dd>${baselineBrier.toFixed(3)}</dd></div></dl>`:'<p class="data-note">No settled forecast windows from the current model yet.</p>';
 return `<details class="guide-disclosure" data-disclosure="journal"><summary>Recorded forecasts · ${settled} scored · ${pending} pending</summary><p class="data-note">This browser’s track record uses the first forecast per candle from the current model and skips overlapping outcome windows. Lower probability error is better. Only forecasts that passed the evidence checks were recorded.</p>${metrics}<ol class="forecast-ledger">${rows.slice(0,8).map(r=>`<li><strong>${r.direction==='up'?'Higher':'Flat or lower'}</strong> · ${time(r.asOf)}${r.sampleStart?`<small> · Window starts ${time(r.sampleStart)}</small>`:''}<br>${r.outcome?`Actual close · ${r.outcome.direction==='up'?'higher':r.outcome.direction==='flat'?'flat':'lower'} · ${moneyMarkup(r.outcome.close,r.venue==='binance'?'USDT':'USD','parallel')}`:`Awaiting exact close · ${time(r.targetCloseAt)}`}</li>`).join('')}</ol><button type="button" class="button" data-action="forecast-journal-csv">Download recorded forecasts</button></details>`;
}

export function learningPrimer(){
 const topics=[
  ['Market basics','A trading pair has a base asset and a quote currency. BTC/USDT tells you how many USDT buy one BTC on that exchange. Check the pair, venue and timestamp before comparing prices.'],
  ['Order types and fees','A market order prioritizes filling. A limit order waits for a price, and may not fill at all. The spread, fees and liquidity can make two otherwise similar trades feel very different.'],
  ['Price context','Start with candle closes and ranges, then ask whether volume supports the movement. Indicators summarize history. Several indicators derived from the same closes are not independent confirmation.'],
  ['Risk and practice','A stop is a decision level; real fills can slip past it. Model your loss and exit before practicing, then compare the simulated result with your assumptions.'],
  ['Custody and verification','Confirm the token identity and network. Never share a recovery phrase. Check announcement sources and links independently, and distinguish an exchange price from a token-wide estimate.']
 ];
 return `<section class="panel lesson-primer"><div class="panel-top"><h2>Crypto foundations</h2></div>${topics.map(([title,body])=>`<details class="guide-disclosure"><summary>${title}</summary><p>${body}</p></details>`).join('')}</section>`;
}

export function renderGuideAudit(setup,key,quote){
 const detail=setup?.[key];
 if(key==='none')return '<p class="data-note">Choose an Auto overlay above the chart, or open Drawings to mark your own levels.</p>';
 if(!detail)return '<p class="data-note">This drawing needs more confirmed structure. A sparse market or gaps can leave no valid levels.</p>';
 const rows=detail.levels??detail.anchors??[];
 const label=(row)=>row.name??(Number.isFinite(row.ratio)?Math.round(row.ratio*1000)/10+'%':row.kind??'Anchor');
 const records=rows.map(row=>{
  const dist=Number.isFinite(row.distancePct)?` <small class="${tone(row.distancePct)}">(${pct(row.distancePct)} vs close)</small>`:'';
  const span=(Number.isFinite(row.bottom)&&Number.isFinite(row.top))?`<small>Zone: ${moneyMarkup(row.bottom,quote,'parallel')} – ${moneyMarkup(row.top,quote,'parallel')}</small>`:'';
  return `<div><dt>${esc(label(row))}</dt><dd>${moneyMarkup(row.price,quote,'parallel')}${dist}${span}${Number.isFinite(row.time)?'<small>'+new Date(row.time*1000).toISOString().slice(0,16).replace('T',' ')+' UTC</small>':''}${row.anchors?.length?'<small>'+row.anchors.length+' distinct confirmed pivots</small>':''}</dd></div>`;
 }).join('');
 return `<h3>${esc(detail.label)}</h3><p>${esc(detail.detail)}</p>${records?`<dl class="chart-observations">${records}</dl>`:''}${setup.stale?'<p class="source warn">The most recent confirmed data is delayed.</p>':''}`;
}
