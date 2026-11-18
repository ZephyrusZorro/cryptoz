import {esc,icon} from './ui.js';

const periods=[['1m','1m'],['5m','5m'],['15m','15m'],['1h','1h'],['4h','4h'],['1d','1d']];
export const CHART_PANELS=['reading','levels','signals','evidence','depth'];
export function chartPanelFor(value){
 return CHART_PANELS.includes(value)?value:'reading';
}
const attrs=(value,current)=>value===current?' selected':'';
export function chartWorkbench({interval,forecastHorizon=5,panel='reading',controls}){
 panel=chartPanelFor(panel);
 const options=periods.map(([id,label])=>`<option value="${id}" ${id===interval?'selected':''}>${label}</option>`).join('');
 const buttons=periods.map(([id,label])=>`<button type="button" class="${attrs(id,interval)}" data-action="timeframe" data-time="${id}" aria-pressed="${interval===id}">${label}</button>`).join('');
 const series=[['candles','Candles'],['bars','OHLC bars'],['line','Price line'],['heikin','Heikin-Ashi']];
 const chartType=`<label class="wb-style"><span>Chart type</span><select id="chart-style" aria-label="Chart style">${series.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>`;
 const selector=`<div class="wb-instrument"><div class="wb-picker"><button type="button" class="icon-button focus-nav-reveal" data-action="dock-toggle" aria-controls="navigation-dock" aria-label="Show navigation" aria-expanded="false" title="Show navigation">${icon('menu')}</button><label><span>Exchange</span><select id="venue"><option value="binance">Binance</option><option value="coinbase">Coinbase</option></select></label>
  <label class="wb-pair"><span>Trading pair</span><select id="instrument" aria-label="Chart instrument"></select></label>
  <button class="icon-button" data-action="search" aria-label="Search all instruments" title="Search instruments">${icon('search')}</button></div>
  <div class="wb-quote"><strong id="terminal-price">—</strong><span id="terminal-change"></span></div>
  <div class="wb-24h"><span>24h high <b id="terminal-high">—</b></span><span>24h low <b id="terminal-low">—</b></span></div>
 </div>`;
 const studioTools=`<details class="chart-menu"><summary>${icon('more-horizontal')} More</summary><div class="chart-menu-body">
     <button data-action="layouts">${icon('layers')} Saved layouts</button><button data-action="drawings">${icon('settings-2')} Manage drawings</button>
     <button data-action="chart-history-date">${icon('clock')} Jump to date</button><a id="chart-analyst" href="#analysts">${icon('file-text')} Analyst research</a>
     <button data-action="chart-png">${icon('download')} Export image</button><button data-action="chart-csv">${icon('download')} Export candles</button></div></details>`;
 const filters=`<div class="wb-toolbar">
  <div class="timeframes" aria-label="Timeframe">${buttons}</div>
  <label class="wb-interval wb-mobile-interval"><span>Time per candle</span><select id="compact-interval" aria-label="Candle interval">${options}</select></label>
  ${chartType}
  <button class="button wb-study-button" data-action="indicators">${icon('sliders-horizontal')} Indicators</button>${controls}${studioTools}
  <button class="icon-button" id="focus-chart" data-action="focus-chart" aria-label="Focus chart" aria-pressed="false" title="Focus chart">${icon('maximize-2')}</button>
 </div>`;
 const selection='<div class="wb-selected-signal" hidden id="selected-signal"><span role="status"></span><button type="button" class="wb-signal-link" data-action="clear-signal">Clear highlight</button></div>';
 const canvas=`<div class="indicator-strip" id="indicator-strip"><span class="active-chain"></span><button type="button" class="wb-signal-link" data-action="show-signals">Signal events</button><small id="chart-window-info">Loading history…</small></div>${selection}<div class="chart-workspace"><div class="drawing-tools" hidden>${[['cursor','mouse-pointer-2','Pan and crosshair'],['horizontal','minus','Horizontal level'],['trend','trending-up','Trend line'],['fib','layers','Fibonacci'],['label','file-text','Annotation']].map(([id,i,t])=>`<button type="button" class="icon-button ${id==='cursor'?'selected':''}" data-action="draw-tool" data-tool="${id}" title="${t}" aria-label="${t}">${icon(i)}</button>`).join('')}</div><div class="price-chart" id="price-chart" role="region" tabindex="0" aria-label="Interactive price chart" aria-describedby="history-status"></div></div>
 <div class="history-bar" aria-label="Chart view"><button class="button" data-action="reset-chart">${icon('refresh-cw')} Reset view</button><small id="history-status" role="status">Connecting to history…</small><span id="candle-source"></span><button class="text-link" data-action="drawings">Saved drawings <span id="drawings-count">0</span></button></div>`;
 const primary=`<section class="panel wb-main pro-price">${selector}${filters}${canvas}</section>`;
 const views=[['reading','Chart reading'],['levels','Price levels'],['signals','Signals'],['evidence','Forecast'],['depth','Order book']];
 const tabs=`<div class="wb-tabs" role="tablist" aria-label="Chart analysis">${views.map(([id,label])=>`<button type="button" id="wb-tab-${id}" role="tab" tabindex="${panel===id?'0':'-1'}" data-action="chart-panel" data-pane="${id}" aria-controls="wb-${id}" aria-selected="${panel===id}">${label}</button>`).join('')}</div>`;
 const forecasts=`<div class="forecast-body wb-forecast-body"><div class="forecast-intro"><div><h3>Test a price pattern</h3><p>Compare the model's historical results with simple benchmarks. It gives a direction only when the evidence meets its checks.</p></div>
  <label>Forecast horizon<select id="forecast-horizon">${[5,12,24].map(n=>`<option value="${n}" ${forecastHorizon===n?'selected':''}>${n} candles</option>`).join('')}</select></label></div>
  <div class="forecast-actions"><button class="button primary" data-action="forecast-run">Run study</button><button class="button" data-action="forecast-run" data-deep="1">Test with more history</button></div><p id="forecast-progress" class="data-note" role="status"></p><div id="forecast-result">Waiting for closed candles.</div></div>`;
 const pane=(id,html)=>`<section id="wb-${id}" class="wb-pane" role="tabpanel" aria-labelledby="wb-tab-${id}" tabindex="0" data-chart-pane="${id}" ${panel===id?'':'hidden'}>${html}</section>`;
 return `<div class="terminal-heading"><div><h1>Charts</h1><p class="terminal-description">Explore price history, chart tools and market evidence.</p></div><span class="source" id="stream-status" role="status">Connecting…</span></div>
 <div class="chart-workbench pro-workbench">${primary}<section class="panel wb-inspector">${tabs}
 ${pane('reading','<div id="technical-summary" class="wb-reader"></div>')}${pane('levels','<div id="auto-guide-info" class="wb-reader"></div>')}${pane('signals','<header class="wb-signal-head"><div><h3>Confirmed signal events</h3><p>Markers use the closing price of the candle that confirmed the rule.</p></div><button type="button" class="button" data-action="signal-settings">Configure signals</button></header><div id="signal-results"></div>')}${pane('evidence',forecasts)}${pane('depth','<span class="source" id="book-mode"></span><div class="book-labels"><span>Price</span><span>Size (base)</span><span>Level value</span></div><div id="orderbook">Waiting for order book…</div><div class="book-footer" id="book-source"></div>')}
 </section></div>`;
}
