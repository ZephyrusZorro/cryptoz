import {esc,icon} from './ui.js';

const periods=[['1m','1m'],['5m','5m'],['15m','15m'],['1h','1h'],['4h','4h'],['1d','1d']];
export const CHART_PANELS=['reading','levels','signals','evidence','depth'];
export function chartPanelFor(value,mode){
 return CHART_PANELS.includes(value)&&(mode==='pro'||!['depth','signals'].includes(value))?value:'reading';
}
const attrs=(value,current)=>value===current?' selected':'';
export function chartWorkbench({mode,interval,forecastHorizon=5,panel='reading',controls}){
 const basic=mode==='basic';panel=chartPanelFor(panel,mode);
 const options=periods.map(([id,label])=>`<option value="${id}" ${id===interval?'selected':''}>${label}${basic&&id==='1d'?' · one day per bar':basic&&id==='1h'?' · one hour per bar':''}</option>`).join('');
 const buttons=periods.map(([id,label])=>`<button type="button" class="${attrs(id,interval)}" data-action="timeframe" data-time="${id}" aria-pressed="${interval===id}">${label}</button>`).join('');
 const series=basic?[['line','Price line'],['candles','Candlesticks']]:[['candles','Candles'],['bars','OHLC bars'],['line','Price line'],['heikin','Heikin-Ashi']];
 const chartType=`<label class="wb-style"><span>${basic?'Display':'Chart type'}</span><select id="chart-style" aria-label="Chart style">${series.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>`;
 const selector=`<div class="wb-instrument"><div class="wb-picker"><button type="button" class="icon-button focus-nav-reveal" data-action="dock-toggle" aria-controls="navigation-dock" aria-label="Show navigation" aria-expanded="false" title="Show navigation">${icon('menu')}</button><label><span>Exchange</span><select id="venue"><option value="binance">Binance</option><option value="coinbase">Coinbase</option></select></label>
  <label class="wb-pair"><span>Trading pair</span><select id="instrument" aria-label="Chart instrument"></select></label>
  <button class="icon-button" data-action="search" aria-label="Search all instruments" title="Search instruments">${icon('search')}</button></div>
  <div class="wb-quote"><strong id="terminal-price">—</strong><span id="terminal-change"></span></div>
  <div class="wb-24h ${basic?'wb-visually-hidden':''}"><span>24h high <b id="terminal-high">—</b></span><span>24h low <b id="terminal-low">—</b></span></div>
 </div>`;
 const studioTools=basic?'':`<details class="chart-menu"><summary>${icon('more-horizontal')} Workspace tools</summary><div class="chart-menu-body">
     <button data-action="layouts">${icon('layers')} Saved layouts</button><button data-action="drawings">${icon('settings-2')} Manage drawings</button>
     <button data-action="chart-png">${icon('download')} Export image</button><button data-action="chart-csv">${icon('download')} Export candles</button></div></details>`;
 const filters=`<div class="wb-toolbar">
  ${basic?'':`<div class="timeframes" aria-label="Timeframe">${buttons}</div>`}
  <label class="wb-interval ${basic?'':'wb-mobile-interval'}"><span>${basic?'Time per candle':'Interval'}</span><select id="compact-interval" aria-label="Candle interval">${options}</select></label>
  ${chartType}<label class="wb-view ${basic?'wb-visually-hidden':''}"><span>View</span><select id="chart-view" aria-label="Chart view"><option value="all">Fit loaded</option><option value="recent">Recent 100</option><option value="custom" disabled>Custom</option></select></label>
  <div class="chart-zoom" aria-label="Chart zoom"><button class="icon-button" data-action="zoom-out" aria-label="Zoom out">${icon('minus')}</button><button class="icon-button" data-action="zoom-in" aria-label="Zoom in">${icon('plus')}</button></div>
  <button class="button wb-study-button" data-action="indicators">${icon('sliders-horizontal')} ${basic?'Chart studies':'Indicators'}</button>${studioTools}
  <button class="icon-button" id="focus-chart" data-action="focus-chart" aria-label="Focus chart" aria-pressed="false" title="Focus chart">${icon('maximize-2')}</button>
 </div>`;
 const canvas=`<div class="indicator-strip" id="indicator-strip"><span class="active-chain"></span>${basic?'':'<button type="button" class="wb-signal-link" data-action="show-signals">Signal events</button>'}<small id="chart-window-info">Loading history…</small></div><div class="chart-workspace"><div class="drawing-tools pro-only" hidden>${[['cursor','mouse-pointer-2','Pan and crosshair'],['horizontal','minus','Horizontal level'],['trend','trending-up','Trend line'],['fib','layers','Fibonacci'],['label','file-text','Annotation']].map(([id,i,t])=>`<button type="button" class="icon-button ${id==='cursor'?'selected':''}" data-action="draw-tool" data-tool="${id}" title="${t}" aria-label="${t}">${icon(i)}</button>`).join('')}</div><div class="price-chart" id="price-chart" role="region" tabindex="0" aria-label="Interactive price chart"></div></div>
 <div class="history-bar" aria-label="Chart history"><button class="button" data-action="older-candles" disabled>${icon('chevron-left')} Older candles</button><button class="button" data-action="latest-candles">Latest</button><button class="button" data-action="chart-history-date">${icon('clock')} Jump to date</button><small id="history-status" role="status">Connecting to history…</small></div>
 <div class="chart-bottom"><span id="candle-source">Drag to pan · scroll to zoom</span>${basic?'':'<button class="text-link" data-action="drawings">Saved drawings <span id="drawings-count">0</span></button>'}</div>`;
 const primary=basic?`<section class="panel wb-main beginner-price"><header class="wb-step"><span>1</span><div><h2>See the price</h2><p>Choose a market, then compare the newest price with earlier candles.</p></div></header>${selector}${filters}${canvas}</section><section class="panel wb-draw-task"><header class="wb-step"><span>2</span><div><h2>Add a guide</h2><p>Pick one drawing to add automatically. Its source levels appear in the analysis below.</p></div></header>${controls}</section>`:
 `<section class="panel wb-main pro-price">${selector}${filters}${controls}${canvas}</section>`;
 const views=basic?[['reading','Read the chart'],['levels','Drawing details'],['evidence','Test a pattern']]:[['reading','Technical brief'],['levels','Auto structure'],['signals','Signals'],['evidence','Forecast lab'],['depth','Order book']];
 const tabs=`<div class="wb-tabs" role="tablist" aria-label="Chart analysis">${views.map(([id,label])=>`<button type="button" id="wb-tab-${id}" role="tab" tabindex="${panel===id?'0':'-1'}" data-action="chart-panel" data-pane="${id}" aria-controls="wb-${id}" aria-selected="${panel===id}">${label}</button>`).join('')}</div>`;
 const forecasts=`<div class="forecast-body wb-forecast-body"><div class="forecast-intro"><div><h3>${basic?'What might happen next?':'Adaptive forecast evidence'}</h3><p>${basic?'Compare earlier market patterns. If the evidence is weak, the study will hold back a direction.':'Time-ordered estimates scored against simple baselines on matching closed candles.'}</p></div>
  <label class="${basic?'wb-visually-hidden':''}">Forecast horizon<select id="forecast-horizon">${[5,12,24].map(n=>`<option value="${n}" ${forecastHorizon===n?'selected':''}>${n} candles</option>`).join('')}</select></label></div>
  <div class="forecast-actions"><button class="button primary" data-action="forecast-run">${basic?'Test this pattern':'Run study'}</button><button class="button" data-action="forecast-run" data-deep="1">Load more &amp; test</button></div><p id="forecast-progress" class="data-note" role="status"></p><div id="forecast-result">Waiting for closed candles.</div></div>`;
 const pane=(id,html)=>`<section id="wb-${id}" class="wb-pane" role="tabpanel" aria-labelledby="wb-tab-${id}" tabindex="0" data-chart-pane="${id}" ${panel===id?'':'hidden'}>${html}</section>`;
 return `<div class="terminal-heading"><div><h1>${basic?'Price and market guide':'Chart workbench'}</h1><p class="terminal-description">${basic?'See what moved and how to read it.':'Price, indicators and market research for the selected pair.'}</p></div><span class="source" id="stream-status" role="status">Connecting…</span></div>
 <div class="chart-workbench ${basic?'beginner-workbench':'pro-workbench'}">${primary}<section class="panel wb-inspector">${basic?'<header class="wb-step"><span>3</span><div><h2>Understand the move</h2><p>See the evidence behind the chart and what to check next.</p></div></header>':''}${tabs}
 ${pane('reading','<div id="technical-summary" class="wb-reader"></div>')}${pane('levels','<div id="auto-guide-info" class="wb-reader"></div>')}${basic?'':pane('signals','<header class="wb-signal-head"><div><h3>Confirmed signal events</h3><p>Markers use the closing price of the candle that confirmed the rule.</p></div><button type="button" class="button" data-action="signal-settings">Configure signals</button></header><div id="signal-results"></div>')}${pane('evidence',forecasts)}${basic?'':pane('depth','<span class="source" id="book-mode"></span><div class="book-labels"><span>Price</span><span>Size (base)</span><span>Level value</span></div><div id="orderbook">Waiting for order book…</div><div class="book-footer" id="book-source"></div>')}
 </section></div>`;
}
