import {esc,icon,price} from './ui.js';
import {getAnalystResearch} from './study-pov.js';

export function analystPanel(asset){
 const analysis=getAnalystResearch(asset);
 return `<div class="analyst-banner panel"><div><span class="page-kicker">SOURCE REVIEW</span><h2>${esc(asset)} analyst views</h2><p>${esc(analysis.coverage)}</p></div><p>${esc(analysis.synthesis)} <span class="source">Reviewed ${esc(analysis.asOf)}</span></p></div><div class="analyst-grid">${analysis.views.map(view=>`<article class="panel analyst-card">
   <div class="analyst-meta"><strong>${esc(view.publisher)}</strong><time datetime="${esc(view.published)}">${esc(view.published)}</time></div>
   <h3><a href="${esc(view.url)}" target="_blank" rel="noopener noreferrer">${esc(view.title)} ${icon('arrow-up-right')}</a></h3>
   ${view.author?`<p class="source">${esc(view.author)}</p>`:''}<p>${esc(view.view)}</p><div class="analyst-scope"><span>${esc(view.period)}${view.periodEnded?' · Horizon ended':''}</span><small>${esc(view.context)}</small></div>
  </article>`).join('')||'<p class="panel analyst-card">No verified source for this market.</p>'}</div>`;
}

export function chartGuide(pov,setup,mode,studies=[],studyCatalog={}){
 const core=pov.ready?`<div class="chart-reading-state"><strong>${esc(pov.trend)}</strong><time datetime="${new Date(pov.closedAt*1000).toISOString()}">${new Date(pov.closedAt*1000).toISOString().slice(0,16).replace('T',' ')} UTC</time></div>
 <dl class="chart-observations">${pov.observations.map(x=>`<div><dt>${esc(x.label)}</dt><dd>${esc(x.text)}${mode==='pro'?'<small>'+esc(x.detail)+'</small>':''}</dd></div>`).join('')}</dl>`:`<p class="source">${esc(pov.reason)}</p>`;
 const latestSetup=setup?.ready&&!setup.stale?setup.events?.at(-1):null;
 const selectedGuide=setup?.[setup.activeGuide];
 return `${pov.stale?'<p class="source warn">Latest confirmed history is delayed.</p>':''}${core}
 ${pov.ready?`<details class="guide-disclosure"><summary>What to watch next</summary><dl class="chart-observations">${pov.scenarios.map(s=>`<div><dt>${esc(s.label)}</dt><dd>${esc(s.text)}</dd></div>`).join('')}</dl></details>`:''}
 ${mode==='basic'?'<details class="guide-disclosure"><summary>How to read a candle</summary><p>The body shows the opening and closing price. The thin lines show the highest and lowest prices. The last candle can change until its interval ends.</p></details>':''}
 ${studies.length?`<details class="guide-disclosure"><summary>What your studies mean</summary><dl class="chart-observations">${studies.filter(id=>studyCatalog[id]).map(id=>`<div><dt>${esc(studyCatalog[id].label)}</dt><dd>${esc(studyCatalog[id].meaning)} <small>${esc(studyCatalog[id].check)}</small></dd></div>`).join('')}</dl></details>`:''}
 ${setup&&setup.activeGuide!=='none'?`<details class="guide-disclosure"><summary>${esc(selectedGuide?.label??'Automatic drawing')}</summary><p>${esc(selectedGuide?.detail??setup.reason??'No confirmed anchors for this setup yet.')}</p>${selectedGuide?.anchors?.length?`<dl class="chart-observations">${selectedGuide.anchors.map(a=>`<div><dt>${esc(a.kind)} · ${price(a.price,'')}</dt><dd>Anchor ${new Date(a.time*1000).toISOString().slice(0,16).replace('T',' ')} UTC</dd></div>`).join('')}</dl>`:''}${selectedGuide?.levels?.length?`<dl class="fib-levels">${selectedGuide.levels.map(level=>`<div><dt>${(level.ratio*100).toFixed(1)}%</dt><dd>${price(level.price,'')}</dd></div>`).join('')}</dl>`:''}</details>`:''}
 ${latestSetup?`<p class="setup-event"><b>Last closed-bar event</b><br>${esc(latestSetup.label)} <time datetime="${new Date(latestSetup.confirmedAt*1000).toISOString()}">${esc(new Date(latestSetup.confirmedAt*1000).toISOString().slice(0,16).replace('T',' '))} UTC</time><br><small>${esc(latestSetup.detail)}</small></p>`:''}`;
}

export function forecastPanel(result,{archive=false,recorded=null,superseded=false}={}){
 const number=x=>Number.isFinite(x)?x.toFixed(3):'—';
 const percent=x=>Number.isFinite(x)?(100*x).toFixed(1)+'%':'—';
 const timestamp=t=>Number.isFinite(t)?new Date(t*1000).toISOString().slice(0,16).replace('T',' ')+' UTC':'—';
 const evidence=result.evidence,f=archive||superseded?null:(recorded??result.forecast),baseline=evidence?.strongestBaseline,calibration=result.reliability,bands=calibration?.bands?.filter(x=>x.count>0)??[],sample=result.scenarios;
 return `<div class="forecast-outcome"><strong>${f?'Study leans '+(f.direction==='up'?'higher':'not higher'):archive?'Historical test only':superseded?'New candle available':'No directional call'}</strong><small>${f?`Model score for a higher close: ${percent(f.probabilityUp)} · due ${timestamp(f.targetCloseAt)}.${recorded?' Recorded in this browser.':''}`:`${archive?'Archive candles are for review. Return to Latest for a current-market study.':superseded?'Run the study again to evaluate the latest confirmed candle.':esc(result.reason??'Insufficient evidence.')}`}</small></div>
 ${result.closedCount?`<p>${result.closedCount} consecutive closed candles · up to ${timestamp(result.asOf)}. Horizon: ${result.horizon} candles (${esc(result.interval)} each).</p>`:''}
 ${evidence?`<dl class="forecast-metrics"><div><dt>Test forecasts</dt><dd>${evidence.count}</dd></div><div><dt>Time blocks improved</dt><dd>${evidence.winningBlocks} / ${evidence.blockCount}</dd></div><div><dt>Model error / baseline</dt><dd>${number(evidence.modelBrier)} / ${number(baseline?.brier??evidence.baselineBrier)}</dd></div><div class="pro-only"><dt>Accuracy / baseline</dt><dd>${percent(evidence.modelAccuracy)} / ${percent(baseline?.accuracy??evidence.baselineAccuracy)}</dd></div></dl><p class="data-note">Lower error is better. Comparison baseline: ${esc(baseline?.label??'Historical up rate')}. Each test uses only earlier information.</p><details class="guide-disclosure"><summary>Inspect the test</summary><p>${timestamp(evidence.start)} to ${timestamp(evidence.end)}. ${esc(result.method)}. Scores are past results and model estimates; they are not guaranteed odds.</p><button class="button" data-action="forecast-csv">Download test cases</button></details>`:''}
 ${bands.length?`<details class="guide-disclosure pro-only"><summary>Reliability on scored history</summary><p>Past scores are grouped into bands. A small group gives weak evidence.</p><div class="calibration-bars">${bands.map(b=>`<div><span>${percent(b.lower)}–${percent(b.upper)}</span><meter min="0" max="1" value="${b.observedRate}" aria-label="Observed higher-close rate">${percent(b.observedRate)}</meter><span>${percent(b.observedRate)} · ${b.count}</span></div>`).join('')}</div></details>`:''}
 ${sample?`<details class="guide-disclosure pro-only"><summary>Observed outcomes, ${result.horizon} candles later</summary><p>${sample.count} past outcomes · 10th / 50th / 90th percentile: ${percent(sample.lower)} / ${percent(sample.median)} / ${percent(sample.upper)}. These are historical returns, not projected price targets.</p></details>`:''}`;
}
export function forecastJournal(rows){
 if(!rows.length)return '<p class="data-note">A directional study is recorded here when it passes the evidence checks.</p>';
 const time=t=>new Date(t*1000).toISOString().slice(5,16).replace('T',' ')+' UTC';
 return `<details class="guide-disclosure"><summary>Recorded studies · ${rows.filter(r=>r.outcome).length} settled</summary><ol class="forecast-ledger">${rows.slice(0,8).map(r=>`<li><strong>${r.direction==='up'?'Higher':'Not higher'}</strong> · ${time(r.asOf)}<br>${r.outcome?`Actual: ${r.outcome.direction==='up'?'higher':'not higher'} · ${price(r.outcome.close,'')}`:`Awaiting exact close · ${time(r.targetCloseAt)}`}</li>`).join('')}</ol></details>`;
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
 if(key==='none')return '<p class="data-note">Select an automatic drawing to inspect its levels, or use the manual tools in Pro.</p>';
 if(!detail)return '<p class="data-note">This drawing needs more confirmed structure. A sparse market or gaps can leave no valid levels.</p>';
 const rows=detail.levels??detail.anchors??[];
 const label=(row)=>row.name??(Number.isFinite(row.ratio)?Math.round(row.ratio*1000)/10+'%':row.kind??'Anchor');
 const records=rows.map(row=>`<div><dt>${esc(label(row))}</dt><dd>${price(row.price,'')} ${esc(quote)}${Number.isFinite(row.time)?'<small>'+new Date(row.time*1000).toISOString().slice(0,16).replace('T',' ')+' UTC</small>':''}${row.anchors?.length?'<small>'+row.anchors.length+' distinct confirmed pivots</small>':''}</dd></div>`).join('');
 return `<h3>${esc(detail.label)}</h3><p>${esc(detail.detail)}</p>${records?`<dl class="chart-observations">${records}</dl>`:''}${setup.stale?'<p class="source warn">The most recent confirmed data is delayed.</p>':''}`;
}
