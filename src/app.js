import {serializeCSV} from './exports.js';
import './style.css';
import './theme.css';
import './navigation.css';
import './liquid.css';
import './workspace.css';
import './beginner.css';
import './guided.css';
import {readDesk,deskSwitch,riskSection} from './guided-ui.js';
import {STUDIES,STUDY_PRESETS,normalizeStudyIds} from './studies.js';
import {buildStudyPov} from './study-pov.js';
import './paper.css';
import './decision-desk.css';
import './workbench.css';
import {chartPanelFor,chartWorkbench} from './workbench.js';
import {initialScreen,screenMarket,screenerControls,sectorPulse,marketBrief} from './screener.js';
import {renderInsightsDesk} from './insights-desk.js';
import './insights-desk.css';
import './practice.css';
import {usableQuote} from './market-integrity.js';
import {mountPracticeDesk} from './practice-desk.js';
import {analystPanel,chartGuide,forecastPanel,forecastJournal,renderGuideAudit} from './decision-views.js';
import {assessInWorker} from './forecast-client.js';
import {createForecastLedger} from './forecast-ledger.js';
import {filterMarketGroup,renderMarketGroups,renderMarketCards,renderMarketBreadth} from './market-groups.js';
import './market-groups.css';
import {helpFor} from './beginner-content.js';
import {createLearningProgress} from './beginner-store.js';
import {appendPriceAlert} from './alert-plan.js';
import {createDraftStore} from './draft-store.js';
import {createDialogController} from './dialog.js';
import {refreshPage} from './page-refresh.js';
import {matchesAsset,rankAssets,catalogQuery,normalizeSearch,createLatestSearch,mergeAssets,assetIdentity,isFetchAsset} from './asset-search.js';
import {newsWindow} from './news-window.js';
import {renderNewsCards} from './news-view.js';
import {PRIMARY,GROUPS,resolveRoute,groupFor,normalizeDock,readDock,saveDock} from './navigation.js';
import {createDataLoader} from './data-loader.js';
import {palette,chartOptions,readAppearance,applyAppearance} from './theme.js';
import {MarketStream} from './live-market.js';
import {mountLearningHub} from './learning-hub.js';

import {createIcons,LayoutDashboard,ChartNoAxesCombined,Globe,Newspaper,Bookmark,Database,Search,ArrowUpRight,ArrowRight,ArrowDown,ArrowUp,RefreshCw,ChevronRight,ChevronLeft,ChevronDown,Plus,X,Download,Maximize2,Minimize2,MoreHorizontal,MousePointer2,Minus,TrendingUp,SlidersHorizontal,Bell,Check,ExternalLink,Activity,Menu,Settings2,Trash2,FileText,Upload,Target,Layers,MoveUpRight,Grid2X2,Info,Wifi,WifiOff,Clock,Star,BookOpen} from 'lucide';

import {api} from './api.js';import {TerminalChart} from './chart.js';import {mountComparison} from './comparison.js';

import {normalizePreferences,selectVenueInstrument,drawingValid} from './preferences.js';

import {mountRiskCalculator} from './risk-calculator.js';import {readState,writeState,validateWorkspace,crossed,freshObservation,RECOVERY_KEY,replaceWorkspace} from './state.js';

import {esc,num,compact,price,pct,tone,ago,stamp,icon,download,toast,safeStorage} from './ui.js';



const icons={LayoutDashboard,ChartNoAxesCombined,Globe,Newspaper,Bookmark,Database,Search,ArrowUpRight,ArrowRight,ArrowDown,ArrowUp,RefreshCw,ChevronRight,ChevronLeft,ChevronDown,Plus,X,Download,Maximize2,Minimize2,MoreHorizontal,MousePointer2,Minus,TrendingUp,SlidersHorizontal,Bell,Check,ExternalLink,Activity,Menu,Settings2,Trash2,FileText,Upload,Target,Layers,MoveUpRight,Grid2X2,Info,Wifi,WifiOff,Clock,Star,BookOpen};

const $=s=>document.querySelector(s);const storage=safeStorage();const drafts=createDraftStore(storage);const learningProgress=createLearningProgress(storage);let workspace=readState(storage);const data={markets:null,global:null,sentiment:null,news:null,chains:null,exchange:null};const errors={};let instruments={binance:[],coinbase:[]};let page='overview',terminal=null,mini=null,visuals=[],pageGeneration=0,marketPage=0,marketQuery='',marketSort='rank',marketUniverse='aggregate',onlyWatch=false,newsQuery='',newsTopic='all',loading=false;

let selected=workspace.preferences.lastInstrument;let selectedInterval=workspace.preferences.interval;let comparison=null,studioViewName='map';let riskCalculator;let modalGeneration=0,studioGeneration=0;const alertPrices=new Map();let learning=null,marketStream=null,miniSeries=null;let appearance=applyAppearance(readAppearance(storage),storage);

let dockMode=readDock(storage),newsLimit=20;let searchTimer,marketSearchTimer,remoteAssets=[],marketRemoteAssets=[],remoteLoading=false,remoteError='',marketRemoteLoading=false,marketRemoteError='';const assetLookup=new Map();let dialogController,manualRefreshing=false,operationError='';
let benchmarkTask=null,practice=null,practiceSelected=null,homeNewsTopic='all',marketGroup='all',insightsView=null,marketScreen=initialScreen();
let deskMode=readDesk(storage);document.body.dataset.desk=deskMode;
let materialMode='auto';try{materialMode=storage.getItem('cryptoz.material.v1')??'auto';}catch{}function applyMaterial(){document.documentElement.dataset.material=materialMode==='glass'?'glass':materialMode==='solid'?'solid':matchMedia('(prefers-reduced-transparency: reduce)').matches?'solid':'glass';}applyMaterial();matchMedia('(prefers-reduced-transparency: reduce)').addEventListener('change',()=>{if(materialMode==='auto')applyMaterial();});
const catalogSearch=createLatestSearch({request:(q,o)=>api('asset-search?q='+encodeURIComponent(catalogQuery(q)),o),onResult:(r,q)=>{remoteAssets=r.data;remoteLoading=false;remoteAssets.forEach(a=>assetLookup.set(a.id,a));while(assetLookup.size>200)assetLookup.delete(assetLookup.keys().next().value);if($('#command-input')&&$('#command-input').value===q)searchResults(q);},onError:(e,q)=>{remoteLoading=false;remoteError=e.message;if($('#command-input')?.value===q)searchResults(q);}});
const marketCatalogSearch=createLatestSearch({request:(q,o)=>api('asset-search?q='+encodeURIComponent(catalogQuery(q)),o),onResult:(r,q)=>{marketRemoteAssets=r.data;marketRemoteLoading=false;r.data.forEach(a=>assetLookup.set(a.id,a));while(assetLookup.size>200)assetLookup.delete(assetLookup.keys().next().value);if(page==='markets'&&marketQuery===q)renderMarketResults();},onError:(e,q)=>{marketRemoteLoading=false;marketRemoteError=e.message;if(page==='markets'&&marketQuery===q)renderMarketResults();}});const dataLoader=createDataLoader(k=>api(k==='exchange'?'exchange-markets':k),data,errors,{onChange:updateCurrentData});

function hydrate(){createIcons({icons,attrs:{'stroke-width':1.7}});}

function save(){const ok=writeState(storage,workspace);if(!ok)toast('Browser storage is unavailable or full. Export a backup to keep your work.');return ok;}

function meta(key){const r=data[key];return r?`${r.provider} · ${r.cache==='stale'?'STALE · ':''}snapshot · ${ago(r.data?.updatedAt??r.fetchedAt)}`:errors[key]?'Data unavailable':'Connecting…';}

function stateBadge(key){return `<span class="source ${data[key]?.cache==='stale'?'warn':''}" title="${esc(data[key]?stamp(data[key].fetchedAt):errors[key]??'Awaiting response')}">${esc(meta(key))}</span>`;}

function empty(message,detail=''){return `<div class="empty-state">${icon('database')}<strong>${esc(message)}</strong><p>${esc(detail)}</p></div>`;}

function errorOrLoading(key){return errors[key]?empty('Data unavailable',errors[key]+' · Use Refresh to retry.'):empty('Loading data','');}

function coinMark(symbol){return `<span class="coin-mark" aria-hidden="true">${esc(symbol.slice(0,2))}</span>`;}

function header(title,description,extra=''){return `<div class="page-heading"><div><span class="page-kicker">CRYPTO RESEARCH</span><h1>${title}</h1><p>${description}</p></div>${extra}</div>`;}

function setDesk(mode){if(!['basic','pro'].includes(mode))return;deskMode=mode;document.body.dataset.desk=mode;try{storage.setItem('cryptoz.desk.v1',mode);}catch{}for(const b of document.querySelectorAll('[data-action="desk"]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));if(mode==='basic'&&terminal&&terminal.drawMode!=='cursor'){terminal?.setTool('cursor');document.querySelectorAll('[data-tool]').forEach(el=>el.classList.toggle('selected',el.dataset.tool==='cursor'));}terminal?.draw();}
function syncDockAccess(){const dock=$('.sidebar');if(dock)dock.inert=dockMode==='hidden';}
function setDock(mode){dockMode=normalizeDock(mode);document.body.dataset.dock=dockMode;syncDockAccess();saveDock(storage,dockMode);for(const toggle of document.querySelectorAll('[data-action="dock-toggle"]')){toggle.setAttribute('aria-label',dockMode==='hidden'?'Show navigation':'Hide navigation');toggle.setAttribute('aria-expanded',dockMode!=='hidden');}}

function secondaryNav(){const group=groupFor(page),items=GROUPS[group];if(items.length<2)return '';return `<nav class="context-nav" aria-label="${PRIMARY.find(x=>x.id===group).label} tools">${items.map((x,i)=>x.target?`<button data-action="section" data-target="${x.target}" aria-pressed="${i===0}">${x.label}</button>`:`<a href="#${x.route}" ${x.route===page?'aria-current="page"':''}>${x.label}</a>`).join('')}</nav>`;}

function shell(){
 $('#app').innerHTML=`<aside class="sidebar" id="navigation-dock" aria-label="Navigation dock"><a href="#overview" class="dock-brand" aria-label="CRYPTOZ Home"><span class="brand-mark">Z</span><span class="dock-brand-name" aria-hidden="true">CRYPTOZ</span></a><nav aria-label="Primary">${PRIMARY.map(x=>`<a href="#${x.route}" data-group="${x.id}" aria-label="${x.label}">${icon(x.icon)}<span class="dock-label" aria-hidden="true">${x.label}</span><span class="dock-tip" aria-hidden="true">${x.label}</span></a>`).join('')}</nav><div class="dock-controls"><button class="icon-button" data-action="dock-hide" aria-label="Hide navigation" title="Hide navigation">${icon('chevron-left')}</button></div></aside><div class="main-shell"><header class="topbar"><button class="icon-button dock-header-toggle" data-action="dock-toggle" aria-controls="navigation-dock" aria-label="Hide navigation">${icon('menu')}</button><div class="workspace-brand"><a href="#overview" class="topbar-brand" aria-label="CRYPTOZ Home">CRYPTOZ</a><span class="workspace-divider">/</span><span id="workspace-location">Overview</span></div><button class="search-trigger" data-action="search" aria-label="Search coins and instruments">${icon('search')}<span>Search coins</span><kbd>/</kbd></button><div class="top-actions"><button class="icon-button appearance-button" data-action="appearance" aria-label="Appearance settings" title="Theme and motion">${icon('settings-2')}</button><button class="icon-button" title="Refresh data" aria-label="Refresh data" data-action="refresh">${icon('refresh-cw')}</button><a href="#workspace" class="icon-button" aria-label="Workspace alerts">${icon('bell')}<span id="alert-count"></span></a></div></header><div id="context-root"></div><div id="connection-notice" role="status" aria-live="polite" hidden></div><main id="main" tabindex="-1"></main><footer class="footer"><span>CRYPTOZ</span><span><a href="https://coinpaprika.com/" target="_blank" rel="noopener noreferrer">Powered by Coinpaprika</a> · <a href="/legal/notices.txt" target="_blank" rel="noopener noreferrer">Licenses</a></span></footer></div>`;
 setDock(dockMode);hydrate();
}

function syncNetworkState(){
 const relevant=page==='overview'?['global','sentiment','news']:page==='markets'?[marketUniverse==='exchange'?'exchange':'markets']:page==='news'?['news']:page==='workspace'||page==='terminal'?['markets']:page==='studio'?[studioViewName==='defi'?'chains':'markets']:[];const offline=navigator.onLine===false,failed=relevant.some(key=>errors[key]),busy=manualRefreshing||relevant.some(key=>dataLoader.pendingKeys.includes(key));
 document.body.classList.toggle('refreshing',busy);const notice=$('#connection-notice');if(notice){const message=offline?'Internet unavailable. Displayed data may be stale.':operationError?operationError:failed?'Some market data is delayed. Last available values are retained.':busy?'Updating market data…':'';notice.hidden=!message;if(notice.dataset.message!==message){notice.dataset.message=message;notice.innerHTML=message?`<span>${esc(message)}</span>${operationError?'<button class="text-link" data-action="retry-view">Retry view</button>':failed?'<button class="text-link" data-action="refresh">Retry</button>':''}`:'';}notice.classList.toggle('warn',offline||failed||!!operationError);}
 for(const button of document.querySelectorAll('[data-action="refresh"]')){button.disabled=manualRefreshing;button.setAttribute('aria-busy',String(manualRefreshing));}
}
function updateCurrentData(key){
 loading=dataLoader.busy;syncNetworkState();
 if(page==='overview'){
  if(['global','sentiment'].includes(key)&&$('#home-totals'))$('#home-totals').innerHTML=marketStats();
  if(key==='markets'){loadBenchmark(pageGeneration);if($('#home-breadth'))$('#home-breadth').innerHTML=breadthContent();if($('#home-brief'))$('#home-brief').innerHTML=marketBrief(data.markets?.data??[],workspace.watchlist);}
  if(key==='news'){renderNewsResults();if($('#home-news-meta'))$('#home-news-meta').innerHTML=stateBadge('news');}
 }else if(page==='markets'&&key===(marketUniverse==='exchange'?'exchange':'markets'))renderMarketResults();
 else if(page==='news'&&key==='news')renderNewsResults();
 else if(page==='workspace'&&key==='markets')updateWorkspacePrices();
 else if(page==='terminal'&&key==='markets')updateWatchPanel();
 else if(page==='studio'&&(key==='markets'&&['map','momentum'].includes(studioViewName)||key==='chains'&&studioViewName==='defi'))studioView(studioViewName,pageGeneration,true);
 hydrate();
}
async function fetchData(keys=['markets','global','sentiment','news']){const task=dataLoader.load(keys);loading=dataLoader.busy;syncNetworkState();await task;loading=dataLoader.busy;syncNetworkState();}
async function refreshCurrent(){
 if(manualRefreshing)return;manualRefreshing=true;operationError='';syncNetworkState();
 try{await refreshPage({page,universe:marketUniverse,terminal,comparison,learning,practice,insights:insightsView,loadData:fetchData,refreshBenchmark:()=>loadBenchmark(pageGeneration),refreshStudio:()=>studioView(studioViewName,pageGeneration,true)});}catch(error){operationError='Refresh failed. Retry when the connection is available.';toast(error.message);}finally{manualRefreshing=false;syncNetworkState();}
}

async function loadInstruments(){await Promise.allSettled(['binance','coinbase'].map(async v=>{try{instruments[v]=(await api('instruments?venue='+v)).data;}catch(e){errors['instruments-'+v]=e.message;}}));if(page==='terminal')updateInstrumentOptions();if(page==='compare')comparison?.updateInstruments();learning?.updateInstruments();practice?.options();marketStream?.setRegistry(instruments.binance);}

function cleanPage(){calculatorRequest?.abort();calculatorRequest=null;practice?.dispose();practice=null;insightsView?.dispose();insightsView=null;resetForecast();riskCalculator?.dispose();riskCalculator=null;clearTimeout(marketSearchTimer);marketCatalogSearch.cancel();document.body.classList.remove('chart-focus');learning?.dispose();learning=null;miniSeries=null;comparison?.dispose();comparison=null;terminal?.dispose();terminal=null;mini?.remove();mini=null;for(const v of visuals)v.dispose();visuals=[];}

function route(){closeModal({restoreFocus:false});operationError='';if(['#terminal?section=risk-tools','#practice?section=risk-tools'].includes(location.hash))history.replaceState(null,'','#risk');if(/^#(?:ai|ai-intelligence)(?:\?|$)/.test(location.hash))history.replaceState(null,'','#terminal?panel=evidence');if(location.hash==='#terminal?section=research-note')history.replaceState(null,'','#workspace');page=resolveRoute(location.hash);marketPage=0;document.body.classList.remove('menu-open');renderPage();window.scrollTo({top:0,behavior:'instant'});$('.main-shell')?.scrollTo({top:0,behavior:'instant'});$('#main').focus({preventScroll:true});}
function renderPage(){
 cleanPage();pageGeneration++;const group=groupFor(page);if($('#workspace-location'))$('#workspace-location').textContent={overview:'Overview',news:'News',markets:'Markets',terminal:'Charts',compare:'Compare',studio:'Market maps','market-insights':'Insights',learn:'Learn',practice:'Practice',replay:'Replay',backtest:'Strategy lab',risk:'Calculator',analysts:'Analyst views',workspace:'Watchlist & alerts'}[page];document.body.dataset.page=page;document.querySelectorAll('[data-group]').forEach(a=>{const active=a.dataset.group===group;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});$('#context-root').innerHTML=secondaryNav();
 ({overview:renderOverview,markets:renderMarkets,terminal:renderTerminal,compare:renderComparison,studio:renderStudio,learn:renderLearning,news:renderNews,analysts:renderAnalystDesk,practice:renderPractice,replay:renderPractice,backtest:renderPractice,risk:renderRisk,'market-insights':renderInsights,workspace:renderWorkspace}[page])();hydrate();updateAlertCount();patchLiveQuotes();syncNetworkState();if(document.activeElement===document.body)$('#main').focus({preventScroll:true});const section=new URLSearchParams(location.hash.split('?')[1]??'').get('section');if(page==='practice'&&section==='risk-tools'){const gen=pageGeneration;requestAnimationFrame(()=>{if(gen!==pageGeneration)return;const target=document.getElementById(section);target?.scrollIntoView({behavior:'instant',block:'start'});});}
}

function liveStrip(){return `<section class="live-strip" aria-label="Live Binance prices"><div class="live-strip-label"><strong>SPOT / USDT</strong><small class="live-status" data-live-status>Connecting to live prices…</small></div>${['BTC','ETH','SOL','BNB','XRP'].map(b=>`<button class="live-quote" data-action="live-chart" data-symbol="${b}USDT" data-live-chip="${b}USDT" aria-label="Open ${b} live chart"><span>${b} / USDT</span><strong>—</strong><small>Awaiting quote</small></button>`).join('')}</section>`;}
function patchLiveStatus(s){if(!marketStream?.fresh('BTCUSDT')&&$('#benchmark-change small')?.textContent==='live price · 24h')$('#benchmark-change small').textContent='last price · awaiting update';const fresh=s?.state==='streaming';for(const el of document.querySelectorAll('[data-live-status]')){el.dataset.state=s?.state??'connecting';el.textContent=fresh?'● Live Binance · ~1s':s?.state==='delayed'?'Delayed · showing last price':s?.state==='reconnecting'?'Reconnecting · last price retained':'Connecting to live prices…';}for(const el of document.querySelectorAll('[data-live-chip]')){const q=marketStream?.fresh(el.dataset.liveChip);if(!q&&el.querySelector('strong').textContent!=='—')el.querySelector('small').textContent='Last price · awaiting update';}for(const row of document.querySelectorAll('[data-live-row]')){const q=marketStream?.quotes.get(row.dataset.liveRow);const el=row.querySelector('[data-live-time]');if(q&&el){el.textContent=marketStream.fresh(q.symbol)?'Live · '+ago(q.updatedAt):'Last · '+ago(q.updatedAt);el.title=stamp(q.updatedAt);}}}
function patchLiveQuotes(){if(!marketStream)return;for(const el of document.querySelectorAll('[data-live-chip]')){const q=marketStream.fresh(el.dataset.liveChip);if(!q)continue;el.querySelector('strong').textContent=num(q.price,q.price<1?6:2);const d=el.querySelector('small');d.textContent=pct(q.change)+' · 24h';d.className=tone(q.change);}for(const row of document.querySelectorAll('[data-live-row]')){const q=marketStream.fresh(row.dataset.liveRow);if(!q)continue;row.querySelector('[data-live-price]').textContent=price(q.price,'');const d=row.querySelector('[data-live-change]');d.textContent=pct(q.change);d.classList.remove('positive','negative');d.classList.add(tone(q.change));row.querySelector('[data-live-volume]').textContent=compact(q.volume);const t=row.querySelector('[data-live-time]');t.textContent='Live · '+ago(q.updatedAt);t.title=stamp(q.updatedAt);}const q=marketStream.fresh('BTCUSDT');if(q&&$('#benchmark-price')){$('#benchmark-price').textContent=num(q.price)+' USDT';$('#benchmark-change').innerHTML=`<span class="${tone(q.change)}">${pct(q.change)}</span><small>live price · 24h</small>`;}marketStream.report();}
function appearanceModal(){
 modal('Appearance',`<div class="appearance-options"><label>Color theme<select id="appearance-theme"><option value="dark">Dark</option><option value="light">Light</option></select></label><label>Surfaces<select id="appearance-material"><option value="auto">Follow device preference</option><option value="glass">Glass</option><option value="solid">Solid</option></select></label><label>Interface motion<select id="appearance-motion"><option value="auto">Follow device preference</option><option value="reduced">Reduce motion</option></select></label><p class="data-note">Static background. Short interface transitions. Saved on this browser.</p></div>`);
 $('#appearance-theme').value=appearance.theme;$('#appearance-motion').value=appearance.motion;$('#appearance-material').value=materialMode;
 $('#appearance-material').addEventListener('change',()=>{materialMode=$('#appearance-material').value;applyMaterial();try{storage.setItem('cryptoz.material.v1',materialMode);}catch{}});
 const update=()=>{appearance=applyAppearance({theme:$('#appearance-theme').value,motion:$('#appearance-motion').value},storage);if(terminal?.bars.length)terminal.build();comparison?.applyTheme();learning?.applyTheme();if(mini){mini.applyOptions(chartOptions());miniSeries?.applyOptions({lineColor:palette().accent,topColor:palette().accent+'30',bottomColor:palette().accent+'00'});}if(page==='studio')studioView(studioViewName,pageGeneration,true);};
 $('#appearance-theme').addEventListener('change',update);$('#appearance-motion').addEventListener('change',update);
}

function renderLearning(){$('#main').innerHTML=header('Learning desk','Start with how crypto markets work, then practice reading and testing your own ideas.')+'<div id="learning-root"></div>';learning=mountLearningHub($('#learning-root'),{instruments,hydrate,storage,progress:learningProgress,initialView:new URLSearchParams(location.hash.split('?')[1]??'').get('view')??'start',onViewChange:view=>history.replaceState(null,'','#learn'+(view==='start'?'':'?view='+view)),onChart:i=>{selected=i;location.hash='terminal';}});}

function newsToolbar(){return `<div class="news-toolbar"><div class="tabs" aria-label="News topics">${['all','MARKETS','POLICY','MACRO','SECURITY','ECOSYSTEM'].map(n=>`<button class="tab ${newsTopic===n?'active':''}" data-action="news-topic" data-topic="${n}" aria-pressed="${newsTopic===n}">${n==='all'?'Latest':n[0]+n.slice(1).toLowerCase()}</button>`).join('')}</div><label class="search-field">${icon('search')}<input id="news-search" aria-label="Search news" placeholder="Search headlines" value="${esc(newsQuery)}"></label></div>`;}

function bindNewsSearch(){const field=$('#news-search');if(field)field.addEventListener('input',e=>{newsQuery=e.target.value;newsLimit=20;renderNewsResults();});}
function marketStats(){const g=data.global?.data,s=data.sentiment?.data;return `<div class="stats-grid"><article class="stat-card"><span>Market cap ${icon('globe')}</span><div>${g?'$'+compact(g.marketCap):'—'}</div><p class="${tone(g?.change)}">${pct(g?.change)} <small>24h</small></p>${stateBadge('global')}</article><article class="stat-card"><span>Trading volume ${icon('chart-no-axes-combined')}</span><div>${g?'$'+compact(g.volume):'—'}</div><p class="muted">24-hour volume</p>${stateBadge('global')}</article><article class="stat-card"><span>Bitcoin dominance ${icon('layers')}</span><div>${g?num(g.btcDominance)+'<small>%</small>':'—'}</div><div class="dominance-track"><span style="width:${g?.btcDominance??0}%"></span></div>${stateBadge('global')}</article><article class="stat-card"><span>Fear & Greed ${icon('activity')}</span><div>${s?num(s.value,0)+'<small>/ 100</small>':'—'}</div><p>${s?esc(s.label):'Awaiting index'}</p>${stateBadge('sentiment')}</article></div>`;}
function breadthContent(){return renderMarketBreadth(data.markets?.data)+stateBadge('markets')+'<a href="#studio" class="button full">Market maps '+icon('arrow-right')+'</a>';}
function renderAnalystDesk(){
 $('#main').innerHTML=header('Analyst views','Dated opinions from original research publications, with their assumptions and horizons.')+`<div class="analyst-picker"><label>Asset<select id="analyst-asset"><option value="BTC">Bitcoin · BTC</option><option value="ETH">Ethereum · ETH</option><option value="SOL">Solana · SOL</option></select></label></div><div id="analyst-review"></div>`;
 const field=$('#analyst-asset');field.value=['BTC','ETH','SOL'].includes(selected.base)?selected.base:'BTC';
 const update=()=>{$('#analyst-review').innerHTML=analystPanel(field.value);hydrate();};field.addEventListener('change',update);update();
}
function renderPractice(){
 const view={practice:'paper',replay:'replay',backtest:'strategy'}[page],labels={paper:['Paper trading','Practice with virtual balances and fresh venue quotes.'],replay:['Market replay','Step through completed exchange candles and make decisions as each bar appears.'],strategy:['Strategy lab','Test fixed rules on historical candles with fees and next-open execution.']};
 const [title,description]=labels[view];
 $('#main').innerHTML=header(title,description)+'<section class="panel practice-card" id="practice-root"></section>';
 practice=mountPracticeDesk({root:$('#practice-root'),instrument:practiceSelected??selected,getInstruments:v=>instruments[v],storage,hydrate,view,onInstrument:i=>{practiceSelected=i;}});
}
let calculatorRequest=null;
function renderRisk(){
 const current=riskInstrument();
 $('#main').innerHTML=header('Position calculator',`Estimate an illustrative position for ${esc(current.base)}/${esc(current.quote)} before using the simulator.`,'<a href="#practice" class="button">Change practice pair</a>')+riskSection(current.quote);
 resetRisk();riskCalculator=mountRiskCalculator({form:$('#risk-form'),output:$('#risk-result'),getInstrument:riskInstrument,onDraft:saveRiskDraft});
}
async function useRiskPrice(button){
 const i=riskInstrument(),form=$('#risk-form');if(!form||page!=='risk')return;
 calculatorRequest?.abort();const controller=new AbortController();calculatorRequest=controller;button.disabled=true;
 try{
  const r=await api('trade-quote?venue='+i.venue+'&symbol='+encodeURIComponent(i.symbol),{signal:controller.signal});
  if(controller.signal.aborted||form!==$('#risk-form'))return;
  const d=r.data??{};
  const quote=usableQuote({venue:d.venue,symbol:d.symbol,price:d.price,updatedAt:d.observedAt,source:'REST',stale:r.cache==='stale'},i);
  if(!quote)throw new Error('No fresh price for this pair.');
  form.elements.entry.value=quote.price;saveRiskDraft();riskCalculator?.invalidate();
 }catch(error){if(!controller.signal.aborted)toast(error.message??'Price temporarily unavailable.');}
 finally{if(calculatorRequest===controller){calculatorRequest=null;button.disabled=false;}}
}
function renderInsights(){
 $('#main').innerHTML=header('Market insights','Independent snapshots for derivatives, networks and macro events.')+'<div id="insight-body"></div>';
 const host=$('#insight-body');let section='derivatives',controller,body,failed='',loading=false,disposed=false;
 const render=()=>{if(disposed)return;const focused=document.activeElement?.dataset?.tab;host.innerHTML=renderInsightsDesk({mode:deskMode,activeTab:section,result:body,loading,error:failed});hydrate();if(focused===section)host.querySelector('[data-tab="'+section+'"]')?.focus({preventScroll:true});};
 async function load(next=section){if(disposed||!['derivatives','onchain','macro','tokenomics'].includes(next))return;
  controller?.abort();section=next;if(next==='tokenomics'){controller=null;loading=false;failed='';body=null;render();return;}const task=new AbortController();controller=task;loading=true;failed='';body=null;render();
  try{const response=await api('insights?section='+section,{signal:task.signal});if(controller===task&&!task.signal.aborted)body=response;}
  catch(error){if(controller===task&&!task.signal.aborted)failed=error.message;}
  finally{if(controller===task&&!task.signal.aborted){loading=false;render();}}
 }
 insightsView={load,dispose(){disposed=true;controller?.abort();}};
 load();
}
function renderOverview(){
 const tabs=`<div class="home-news-tabs" role="group" aria-label="Home news topics">${[['all','Latest'],['MARKETS','Markets'],['MACRO','Macro'],['POLICY','Policy']].map(([key,label])=>`<button type="button" data-action="home-news-tab" data-topic="${key}" aria-pressed="${homeNewsTopic===key}">${label}</button>`).join('')}</div>`;
 const news=`<section class="panel dashboard-news wb-news"><div class="panel-top"><div><h2>Market news</h2><span class="source">Crypto, policy and macro headlines</span></div><a href="#news" class="text-link">All headlines ${icon('arrow-right')}</a></div>${tabs}<div id="news-results" class="news-reading-panel"></div><div class="panel-bottom" id="home-news-meta">${stateBadge('news')}</div></section>`;
 const benchmark=`<section class="panel feature-chart market-feature"><div class="panel-top"><h2>${coinMark('BTC')} Bitcoin <span>BTC / USDT</span></h2><a href="#terminal" data-action="default-chart" class="text-link">Chart ${icon('arrow-up-right')}</a></div><div class="benchmark-quote"><strong id="benchmark-price">—</strong><span id="benchmark-change"></span></div><div id="benchmark-chart" class="benchmark-chart"></div><div class="panel-bottom" id="benchmark-source">Loading chart…</div></section>`;
 const breadth=`<section class="panel home-breadth" id="home-breadth">${breadthContent()}</section>`;
 const paths=`<div class="basic-path"><a href="#markets">${icon('globe')}<span><strong>Find a coin</strong><small>Check what it is and how it moved.</small></span></a><a href="#terminal">${icon('chart-no-axes-combined')}<span><strong>Read a chart</strong><small>Explore the price and add a guided drawing.</small></span></a><a href="#practice">${icon('layers')}<span><strong>Practice</strong><small>Learn how fills and fees change a result.</small></span></a></div>`;
 $('#main').innerHTML=deskMode==='basic'
  ?`<div class="pro-monitor"><section class="panel overview-hero basic-start">${header('Your crypto guide','Start with one market. See what moved, why it matters and how to test your idea.',deskSwitch(deskMode))}${paths}</section>${news}<div id="home-totals">${marketStats()}</div><div class="monitor-columns">${benchmark}${breadth}</div></div>`
  :`<div class="pro-monitor"><section class="panel pro-monitor-header">${header('Market monitor','Spot pricing, market breadth and active catalysts.',deskSwitch(deskMode))}</section>${liveStrip()}<div id="home-totals">${marketStats()}</div><div class="monitor-columns"><section id="home-brief" class="panel market-feature">${marketBrief(data.markets?.data??[],workspace.watchlist)}</section>${breadth}</div>${news}${benchmark}</div>`;
 renderNewsResults();loadBenchmark(pageGeneration);
}

async function loadBenchmark(gen){
 if(innerWidth<=650)return;if(benchmarkTask?.generation===gen)return benchmarkTask.promise;const task={generation:gen};benchmarkTask=task;task.promise=(async()=>{
 try{const r=await api('candles?venue=binance&symbol=BTCUSDT&interval=1h');if(gen!==pageGeneration||page!=='overview')return;const {createChart,AreaSeries}=await import('lightweight-charts');if(gen!==pageGeneration)return;const bars=r.data.bars;
  if(!mini){$('#benchmark-chart').innerHTML='';mini=createChart($('#benchmark-chart'),{autoSize:true,...chartOptions(),layout:{...chartOptions().layout,fontSize:11,attributionLogo:true},grid:{vertLines:{visible:false},horzLines:{color:palette().grid}},rightPriceScale:{borderVisible:false},timeScale:{borderVisible:false,timeVisible:true}});miniSeries=mini.addSeries(AreaSeries,{lineColor:palette().accent,topColor:palette().accent+'30',bottomColor:palette().accent+'00',lineWidth:2,priceLineVisible:false,lastValueVisible:false});miniSeries.setData(bars.slice(-168).map(b=>({time:b.time,value:b.close})));mini.timeScale().fitContent();}else miniSeries.setData(bars.slice(-168).map(b=>({time:b.time,value:b.close})));
  $('#benchmark-price').textContent=num(bars.at(-1).close)+' USDT';const change=(bars.at(-1).close/bars.at(-25)?.close-1)*100;$('#benchmark-change').innerHTML=`<span class="${tone(change)}">${pct(change)}</span><small>24h candles</small>`;$('#benchmark-source').textContent=`Binance · ${r.cache==='stale'?'Stale history':'1h history'} · ${stamp(r.fetchedAt)}`;patchLiveQuotes();
 }catch(e){if(gen===pageGeneration&&$('#benchmark-chart')){if(!mini)$('#benchmark-chart').innerHTML=empty('Chart unavailable',e.message);$('#benchmark-source').textContent='History delayed · Use Refresh to retry';}}finally{if(benchmarkTask===task)benchmarkTask=null;}
})();return task.promise;
}

function marketTable(assets,venue=false){return `<div class="table-scroll"><table class="market-table"><thead><tr><th class="col-watch"><span class="sr-only">Watchlist</span></th><th>Asset</th><th>Price (${venue?'USDT':'USD'})</th><th class="col-change">24h</th>${venue?'':'<th class="col-cap">Market cap</th>'}<th class="col-volume">24h volume</th><th class="col-action"></th></tr></thead><tbody>${assets.map(a=>`<tr ${venue?'data-live-row="'+esc(a.id)+'"':''}><td class="col-watch"><button class="star-button ${workspace.watchlist.includes(a.id)?'selected':''}" data-action="watch" data-id="${esc(a.id)}" aria-label="${workspace.watchlist.includes(a.id)?'Remove':'Add'} ${esc(a.symbol)} ${workspace.watchlist.includes(a.id)?'from':'to'} watchlist" aria-pressed="${workspace.watchlist.includes(a.id)}">${icon('star')}</button></td><td><button class="asset-name" data-action="${venue?'exchange-chart':'asset-chart'}" data-id="${esc(a.id)}">${coinMark(a.symbol)}<span><strong>${esc(venue?a.symbol:a.name)}</strong><small>${esc(venue?a.name:a.symbol)}${a.rank?' · #'+a.rank:''}</small></span></button></td><td class="mono"><span class="price-value" ${venue?'data-live-price':''}>${price(a.price,venue?'':'$')}</span><small class="col-time" ${venue?'data-live-time':''} title="${esc(stamp(a.updatedAt))}">${ago(a.updatedAt)}</small></td><td class="col-change ${tone(a.change)} mono" ${venue?'data-live-change':''}>${pct(a.change)}</td>${venue?'':`<td class="mono col-cap">$${compact(a.marketCap)}</td>`}<td class="mono col-volume" ${venue?'data-live-volume':''}>${venue?'':'$'}${compact(a.volume)}</td><td class="col-action"><button class="icon-button" data-action="${venue?'exchange-chart':'asset-chart'}" data-id="${esc(a.id)}" aria-label="Chart ${esc(a.symbol)}">${icon('arrow-up-right')}</button></td></tr>`).join('')}</tbody></table></div>`;}

function renderMarkets(){

 $('#main').innerHTML=header('Crypto markets','Find assets, compare prices and open exchange charts.',`<div class="hero-actions"><button class="button pro-only" data-action="export-markets">${icon('download')} Export results</button></div>`)+`<div class="guided-hint"><p class="basic-only"><strong>Start with the asset.</strong> Search its name or ticker. The directory blends prices; an exchange chart shows one specific trading pair.</p><p class="pro-only"><strong>Market scope.</strong> Aggregate USD and venue-specific USDT represent different universes. Compare like with like.</p></div>${deskMode==='pro'?(marketUniverse==='aggregate'?'<div id="market-sector"></div>':'')+screenerControls(marketScreen,marketUniverse):''}<div id="market-groups"></div><div class="panel"><div class="market-controls"><div class="tabs"><button class="tab ${marketUniverse==='aggregate'?'active':''}" data-action="universe" data-universe="aggregate">Asset directory <span>USD</span></button><button class="tab ${marketUniverse==='exchange'?'active':''}" data-action="universe" data-universe="exchange">Binance spot <span>USDT</span></button></div><label class="search-field">${icon('search')}<input id="market-search" placeholder="Search name, symbol or asset ID" value="${esc(marketQuery)}" aria-label="Search markets"></label></div><div class="filter-row"><button class="chip ${onlyWatch?'selected':''}" data-action="toggle-watch">${icon('star')} Watchlist only</button><label class="sort-label">Sort by <select id="market-sort"><option value="rank">${marketUniverse==='exchange'?'Volume':'Rank'}</option>${marketUniverse==='aggregate'?'<option value="marketCap">Market cap</option>':''}<option value="volume">24h volume</option><option value="gainers">Top gainers</option><option value="losers">Top losers</option></select></label><span id="market-source"></span><span class="live-status" data-live-status></span></div><div id="market-results"></div><div id="market-catalog"></div><div id="market-pagination" class="pagination"></div></div><p class="data-note">Directory prices are aggregate USD snapshots. Binance prices use USDT; live rows show their update time. Sorting updates on refresh or filter change.</p>`;

 $('#market-sort').value=marketSort;for(const field of document.querySelectorAll('[data-screen]'))field.addEventListener('change',()=>{const key=field.dataset.screen;marketScreen={...marketScreen,[key]:key==='volume'?Number(field.value):field.value};marketPage=0;renderMarketResults();});$('#market-search').addEventListener('input',e=>{marketQuery=e.target.value;marketPage=0;queueMarketSearch();renderMarketResults();});$('#market-sort').addEventListener('change',e=>{marketSort=e.target.value;marketPage=0;renderMarketResults();});queueMarketSearch();renderMarketResults();if(marketUniverse==='exchange'&&!data.exchange)fetchData(['exchange']);

}

let marketSectorFocus=false;
function filteredMarkets(){let list=[...(marketUniverse==='exchange'?(data.exchange?.data??[]).map(a=>{const q=marketStream?.fresh(a.id);return q?{...a,...q,id:a.id,symbol:a.symbol}:a;}):data.markets?.data??[])].filter(a=>(!onlyWatch||workspace.watchlist.includes(a.id))&&matchesAsset(a,marketQuery));if(deskMode==='pro')list=screenMarket(list,marketScreen,marketUniverse);if(['gainers','losers','volume'].includes(marketGroup))return filterMarketGroup(list,marketGroup,marketUniverse);if(marketSort==='marketCap')list.sort((a,b)=>(b.marketCap??0)-(a.marketCap??0));if(marketSort==='volume')list.sort((a,b)=>b.volume-a.volume);if(marketSort==='gainers')list.sort((a,b)=>(b.change??-Infinity)-(a.change??-Infinity));if(marketSort==='losers')list .sort((a,b)=>(a.change??Infinity)-(b.change??Infinity));return filterMarketGroup(list,marketGroup,marketUniverse);}

function renderMarketResults(){const key=marketUniverse==='exchange'?'exchange':'markets';const list=filteredMarkets(),size=deskMode==='basic'?15:40,pages=Math.max(1,Math.ceil(list.length/size));marketPage=Math.min(marketPage,pages-1);const rows=list.slice(marketPage*size,marketPage*size+size);if($('#market-sector'))$('#market-sector').innerHTML=sectorPulse(data.markets?.data??[],marketGroup);$('#market-groups').innerHTML=renderMarketGroups({assets:data[key]?.data,group:marketGroup,mode:deskMode,universe:marketUniverse});$('#market-results').innerHTML=list.length?(deskMode==='basic'?renderMarketCards(rows,{universe:marketUniverse,watchlist:workspace.watchlist}):marketTable(rows,marketUniverse==='exchange')):data[key]?empty('No assets match your filters','Try a name, ticker or a different universe.'):errorOrLoading(key);$('#market-source').innerHTML=stateBadge(key);$('#market-pagination').innerHTML=`<span>${num(list.length,0)} results · Page ${marketPage+1} of ${pages}</span><div><button class="icon-button" data-action="prev-page" aria-label="Previous page" ${marketPage===0?'disabled':''}>${icon('chevron-left')}</button><button class="icon-button" data-action="next-page" aria-label="Next page" ${marketPage>=pages-1?'disabled':''}>${icon('chevron-right')}</button></div>`;renderMarketCatalog();hydrate();patchLiveQuotes();}

function queueMarketSearch(){clearTimeout(marketSearchTimer);marketCatalogSearch.cancel();marketRemoteAssets=[];marketRemoteError='';marketRemoteLoading=!onlyWatch&&marketGroup==='all'&&marketUniverse==='aggregate'&&normalizeSearch(marketQuery).length>=2;if(marketRemoteLoading)marketSearchTimer=setTimeout(()=>marketCatalogSearch.run(marketQuery),350);}
function renderMarketCatalog(){const host=$('#market-catalog');if(!host)return;if(onlyWatch||marketGroup!=='all'||marketUniverse!=='aggregate'||normalizeSearch(marketQuery).length<2){host.innerHTML='';return;}const shown=new Set(filteredMarkets().map(assetIdentity)),items=rankAssets(marketRemoteAssets.filter(a=>!shown.has(assetIdentity(a))),marketQuery,12);host.innerHTML=`<div class="catalog-results"><h3>Broader asset catalog</h3><p class="source">${marketRemoteLoading?'Searching…':marketRemoteError?'Catalog unavailable. Loaded prices remain above.':'Catalog identities beyond the current price list. Open an asset to check available prices and charts.'}</p>${items.map(a=>`<button class="command-row" data-action="asset-chart" data-id="${esc(a.id)}">${coinMark(a.symbol)}<span><strong>${esc(a.name)} <small>${esc(a.symbol)}</small></strong><small>${esc(a.id)}</small></span>${icon('arrow-up-right')}</button>`).join('')}</div>`;}

function capturePreferences(){if(!terminal)return;workspace.preferences=normalizePreferences({...workspace.preferences,lastInstrument:selected,interval:selectedInterval,view:terminal.viewPreset,style:deskMode==='pro'?terminal.style:workspace.preferences.style,basicStyle:deskMode==='basic'?terminal.style:workspace.preferences.basicStyle,period:terminal.period,rsiPeriod:terminal.rsiPeriod,oscillator:terminal.oscillator,indicators:terminal.indicators,studyIds:deskMode==='pro'?terminal.studyIds:workspace.preferences.studyIds,basicStudyIds:deskMode==='basic'?terminal.studyIds:workspace.preferences.basicStudyIds,autoGuide:terminal.autoGuide,signalKinds:terminal.signalKinds,markers:terminal.markers});save();}

function refreshIndicatorStrip(){if(!terminal||!$('#indicator-strip'))return;const active=terminal.activeStudies().map(id=>STUDIES[id]?.label).filter(Boolean);$('#indicator-strip').innerHTML=`<span class="active-chain" title="${esc(active.join(', '))}">${esc(active.length?active.join(' · '):'Price only')}${terminal.markers?' · EMA crosses':''}</span><small id="chart-window-info">Loading history…</small>`;terminal.notifyWindow();}
function updateChartWindow(info){
 const el=$('#chart-window-info'),status=$('#history-status'),older=$('[data-action="older-candles"]');if(!el||!status||!older)return;
 const state=info.historyStatus??'idle',message=info.historyNotice||({loading:'Loading earlier candles…',end:'No older candles in the preceding provider window. Try a wider interval.',limit:'4,000 candles loaded. Choose a wider interval for a longer view.',error:'Earlier candles unavailable. Use Older candles to retry.',unavailable:'Chart history unavailable.'}[state]??(info.historyAnchor?'Historical window. Use Latest for live candles.':info.total?'Drag right to go back in time.':'Connecting to history…'));
 if(status.textContent!==message)status.textContent=message;
 older.disabled=!info.total||['loading','end','limit'].includes(state);older.setAttribute('aria-busy',String(state==='loading'));
 const short=t=>new Date(t*1000).toLocaleDateString(undefined,{year:'2-digit',month:'short',day:'numeric',timeZone:'UTC'});
 const range=info.start&&info.end?` · ${short(info.start)}–${short(info.end)} UTC`:'';
 const label=info.total?`${info.visible} visible / ${info.total} loaded${range}`:state==='unavailable'?'History unavailable':'Loading history…';
 if(el.textContent!==label)el.textContent=label;const select=$('#chart-view');if(select&&info.total)select.value=info.selection??'custom';
}
function setChartFocus(value){document.body.classList.toggle('chart-focus',value);const b=$('#focus-chart');if(b){b.innerHTML=icon(value?'minimize-2':'maximize-2');b.setAttribute('aria-label',value?'Exit chart focus':'Focus chart');b.setAttribute('aria-pressed',value);}hydrate();requestAnimationFrame(()=>terminal?.draw());}

function riskInstrument(){return ['practice','risk','replay','backtest'].includes(page)?(practiceSelected??selected):selected;}
function riskKey(){const i=riskInstrument();return i.venue+':'+i.symbol;}
function saveRiskDraft(){const form=$('#risk-form');if(form)drafts.setRisk(riskKey(),Object.fromEntries(new FormData(form)));}
function resetRisk(){const form=$('#risk-form');if(!form)return;const i=riskInstrument();if($('#risk-quote-label'))$('#risk-quote-label').textContent=i.quote;form.reset();if($('#risk-example-status'))$('#risk-example-status').textContent='Use sample prices to see how the numbers work.';for(const [key,value] of Object.entries(drafts.risk(riskKey())))if(form.elements[key])form.elements[key].value=value;$('#risk-result').textContent='Enter levels to estimate position size and fees for '+i.base+'/'+i.quote+'.';}

function renderComparison(){ $('#main').innerHTML=header('Compare','Compare price changes and risk over the same period.')+'<div id="comparison-root"></div>';comparison=mountComparison($('#comparison-root'),{instruments,hydrate});}

function layoutModal(){if(!terminal)return;modal('Saved chart layouts',`<p class="muted">Layouts save indicators, chart style, interval and instrument on this browser.</p><form id="layout-form"><label>Layout name<input name="name" required maxlength="60" placeholder="e.g. Momentum research"></label><button class="button primary" type="submit">Save current layout</button></form><div class="layout-list">${workspace.layouts.map(l=>`<div class="layout-row"><span><strong>${esc(l.name)}</strong><small>${esc(l.settings.lastInstrument.symbol)} · ${esc(l.settings.interval)} · ${esc(l.settings.style)}</small></span><button class="button" data-action="load-layout" data-id="${esc(l.id)}">Load</button><button class="icon-button" data-action="delete-layout" data-id="${esc(l.id)}" aria-label="Delete ${esc(l.name)} layout">${icon('trash-2')}</button></div>`).join('')||'<p class="muted">No named layouts yet. Current settings auto-save automatically.</p>'}</div>`);$('#layout-form').addEventListener('submit',e=>{e.preventDefault();if(workspace.layouts.length>=8){toast('Maximum 8 named layouts. Delete one to save another.');return;}capturePreferences();workspace.layouts.push({id:crypto.randomUUID(),name:new FormData(e.target).get('name').trim(),settings:structuredClone(workspace.preferences)});save();layoutModal();});}

function autoControls(){
 const saved=normalizePreferences(workspace.preferences).autoGuide,chosen=deskMode==='basic'&&['zones','profile'].includes(saved)?'range':saved;
 return `<div class="auto-controls" role="group" aria-label="Automatic drawing tools"><p>${deskMode==='basic'?'Draw for me':'Auto overlays'}</p>${[['range','Price range'],['trend','Swing trend'],['fibonacci','Fibonacci'],...(deskMode==='pro'?[['zones','Swing levels'],['profile','Volume profile']]:[]),['none','Clear']].map(([id,label])=>`<button class="button" type="button" data-action="auto-guide" data-guide="${id}" aria-pressed="${id===chosen}">${label}</button>`).join('')}${'<button class="button" type="button" data-action="suggest-studies">Suggested studies</button>'}${deskMode==='pro'?'<button class="button" type="button" data-action="manual-guide" aria-pressed="false">Manual drawing</button>':''}</div>`;
}
function applyAutoGuide(id){
 if(!terminal||!['range','trend','fibonacci','zones','profile','none'].includes(id))return;
 terminal.autoGuide=id;terminal.manualDrawing=false;$('.drawing-tools').hidden=true;$('[data-action="manual-guide"]')?.setAttribute('aria-pressed','false');terminal.setTool('cursor');
 document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('selected',b.dataset.tool==='cursor'));
 document.querySelectorAll('[data-action="auto-guide"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.guide===id)));
 capturePreferences();terminal.draw();updateSummary();
}
const forecastLedger=createForecastLedger(storage);
let forecastRun=null,forecastView=null,forecastScope=null,settlePass=null,forecastHorizon=5,activeBook=null;
function resetForecast(){
 forecastRun?.abort();forecastRun=null;forecastView=null;forecastScope=null;settlePass=null;
}
function forecastTarget(){return $('#forecast-result');}
function paintForecast(chart){
 const target=forecastTarget();if(!target)return;
 const rows=forecastLedger.list(chart.instrument,chart.interval).filter(row=>row.horizon===forecastHorizon);
 target.innerHTML=(forecastView?forecastPanel(forecastView.result,{archive:Boolean(chart.historyAnchor),recorded:forecastView.recorded,superseded:!chart.historyAnchor&&forecastView.result.asOf<chart.completedCutoff()}):'<p>Results compare this model with a simple historical baseline. A direction is shown only when the evidence meets the minimum checks.</p>')+forecastJournal(rows);
}
function syncForecastScope(chart){
 const key=chart.generation+':'+chart.key;
 if(forecastScope!==key){resetForecast();forecastScope=key;paintForecast(chart);setForecastBusy(false);}
}
function acceptForecastResults(chart,through){
 if(!Number.isFinite(through)||chart.historyAnchor||chart.candleMeta?.cache==='stale')return;
 const key=chart.generation+':'+through;
 if(settlePass===key||!forecastLedger.list(chart.instrument,chart.interval).some(r=>!r.outcome&&r.targetCloseAt<=through))return;
 settlePass=key;const gen=chart.generation;
 forecastLedger.settle({bars:chart.studyBars,interval:chart.interval,instrument:chart.instrument,closedThrough:through}).then(result=>{if(result.settled&&terminal===chart&&chart.generation===gen&&!forecastRun)paintForecast(chart);});
}
function setForecastBusy(busy){for(const b of document.querySelectorAll('[data-action="forecast-run"]'))b.disabled=busy;}
async function runChartForecast(deep){
 const chart=terminal;if(!chart||forecastRun)return;
 const target=forecastTarget();
 if(!target||!chart.studyBars.length){if(target)target.textContent='Wait for closed exchange candles or refresh the chart.';return;}
 const controller=new AbortController();forecastRun=controller;const gen=chart.generation,horizon=forecastHorizon,active=()=>terminal===chart&&chart.generation===gen&&forecastHorizon===horizon&&!controller.signal.aborted;
 setForecastBusy(true);
 try{
  if(deep){
   for(let attempt=0;attempt<12&&chart.studyBars.length<(horizon===24?1650:horizon===12?1300:1000)&&active();attempt++){
    const count=chart.studyBars.length;target.textContent=`Fetching an earlier page. ${count} verified candles loaded…`;
    await chart.loadOlder({automatic:true,retry:attempt===0});if(count===chart.studyBars.length)break;
   }
  }
  if(!active())return;
  target.textContent='Running time-ordered tests against the baseline…';
  const asOf=chart.historyAnchor??Date.now()/1000,closedThrough=chart.completedCutoff(asOf);
  const result=await assessInWorker({bars:chart.studyBars,interval:chart.interval,instrument:chart.instrument,closedThrough,nowSeconds:asOf,horizon,stale:!!chart.historyAnchor||chart.candleMeta?.cache==='stale'},controller.signal);
  if(!active())return;
  const recorded=result.forecast&&!chart.historyAnchor?await forecastLedger.record(result.forecast,undefined,{signal:controller.signal}):null;
  if(!active())return;
  forecastView={result,recorded};paintForecast(chart);
 }catch(error){if(active())target.textContent=error.message||'Unable to evaluate this market.';}
 finally{if(forecastRun===controller){forecastRun=null;setForecastBusy(false);}}
}
function exportForecastCases(){
 const rows=forecastView?.result?.evidence?.origins;if(!rows?.length||!terminal)return;
 const date=t=>new Date(t*1000).toISOString();
 download(`cryptoz-test-${terminal.instrument.venue}-${terminal.instrument.symbol}-${terminal.interval}-${forecastHorizon}bars.csv`,serializeCSV(['origin_close_utc','target_close_utc','training_labels_through_utc','horizon_bars','model_score_up','historical_rate_up','recent_rate_up','last_close_momentum','actual_higher','actual_return'],rows.map(r=>[date(r.asOf),date(r.targetCloseAt),date(r.trainedThrough),r.horizon??forecastHorizon,r.modelProbability,r.baselineProbability,r.recentBaselineProbability??'',r.momentumBaselineProbability??'',r.actualUp,r.actualReturn??''])),'text/csv');
}

function activateChartPanel(value,{reflect=true}={}){
 const selectedPane=chartPanelFor(value,deskMode);
 document.querySelectorAll('[data-chart-pane]').forEach(el=>el.hidden=el.dataset.chartPane!==selectedPane);
 document.querySelectorAll('[data-action="chart-panel"]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.pane===selectedPane)));if(selectedPane==='depth'){lastBookPaint=0;updateBook(activeBook); }
 if(reflect)history.replaceState(null,'','#terminal'+(selectedPane==='reading'?'':'?panel='+selectedPane));
}
function renderTerminal(){
 const panel=new URLSearchParams(location.hash.split('?')[1]??'').get('panel');
 if(deskMode==='basic')forecastHorizon=5;
 $('#main').innerHTML=chartWorkbench({mode:deskMode,interval:selectedInterval,forecastHorizon,panel,controls:autoControls()});
 activeBook=null;terminal=new TerminalChart({host:$('#price-chart'),workspace,save,deskMode,onQuote:updateQuote,onSummary:updateSummary,onBook:updateBook,onStatus:updateStreamStatus,onWindow:updateChartWindow,onDrawings:()=>{if($('#drawings-count'))$('#drawings-count').textContent=(workspace.drawings[terminal?.key]??[]).length;}});
 if(deskMode==='basic'){terminal.style=workspace.preferences.basicStyle??'line';terminal.viewPreset='recent';}
 $('#venue').value=selected.venue;$('#chart-style').value=terminal.style;$('#chart-view').value=terminal.viewPreset;
 refreshIndicatorStrip();updateInstrumentOptions();terminal.load(selected,selectedInterval);
 $('#forecast-horizon').addEventListener('change',e=>{const n=Number(e.target.value);if(![5,12,24].includes(n))return;forecastRun?.abort();forecastRun=null;forecastView=null;forecastHorizon=n;setForecastBusy(false);paintForecast(terminal);});
 $('#venue').addEventListener('change',e=>{const prior=selected.base;selected=selectVenueInstrument(selected,instruments[e.target.value],e.target.value);if(selected.base!==prior)toast(prior+' is not listed here; selected '+selected.base+'.');capturePreferences();updateInstrumentOptions();terminal.load(selected,selectedInterval);});
 $('#instrument').addEventListener('change',e=>{selected=instruments[selected.venue].find(x=>x.symbol===e.target.value)??selected;capturePreferences();terminal.load(selected,selectedInterval);});
 $('#chart-view').addEventListener('change',e=>{terminal.setViewPreset(e.target.value);capturePreferences();});
 $('#compact-interval').addEventListener('change',e=>{selectedInterval=e.target.value;capturePreferences();syncTimeframe();terminal.load(selected,selectedInterval);});
 $('#chart-style').addEventListener('change',e=>{terminal.style=e.target.value;capturePreferences();if(terminal.bars.length)terminal.build();});
}
function syncTimeframe(){for(const b of document.querySelectorAll('[data-time]')){b.classList.toggle('selected',b.dataset.time===selectedInterval);b.setAttribute('aria-pressed',String(b.dataset.time===selectedInterval));}}

function updateInstrumentOptions(){if(!$('#instrument'))return;const items=[...instruments[selected.venue]];if(!items.some(x=>x.symbol===selected.symbol))items.unshift(selected);items.sort((a,b)=>a.base.localeCompare(b.base));$('#instrument').innerHTML=items.map(x=>`<option value="${esc(x.symbol)}">${esc(x.base)}/${esc(x.quote)}</option>`).join('');$('#instrument').value=selected.symbol;}

function updateQuote(q){if(!$('#terminal-price'))return;$('#terminal-price').textContent=q?`${price(q.price,'')} ${selected.quote}`:'—';$('#terminal-change').innerHTML=q?.change!==undefined&&q?.change!==null?`<span class="${tone(q.change)}">${pct(q.change)}</span><small>24h</small>`:'';$('#terminal-high').textContent=q?.high?num(q.high,6):'—';$('#terminal-low').textContent=q?.low?num(q.low,6):'—';if(q&&!q.stale&&q.source!=='candle')evaluateAlerts(selected,q.price,q.updatedAt);}

function updateSummary(){
 if(!terminal||!$('#technical-summary'))return;
 syncForecastScope(terminal);
 const pov=buildStudyPov({bars:terminal.studyBars,instrument:selected,interval:selectedInterval,nowSeconds:terminal.historyAnchor??Date.now()/1000,candleMeta:terminal.candleMeta,confirmedThrough:terminal.confirmedThrough});
 updateChartReader(terminal,pov);
}
function updateChartReader(chart,pov){
 const node=$('#technical-summary');if(!node||!chart)return;
 const key=[chart.generation,pov.closedAt,pov.stale,chart.manualDrawing,chart.autoGuide,chart.signalKinds?.join(','),chart.studyIds?.join(','),pov.reason].join(':');
 if(node.dataset.context===key)return;node.dataset.context=key;
 const open=[...node.querySelectorAll('details[open] summary')].map(x=>x.textContent);const levels=$('#auto-guide-info');if(levels)levels.innerHTML=renderGuideAudit(chart.autoSetup,chart.manualDrawing?'none':chart.autoGuide,chart.instrument.quote);
 node.innerHTML=chartGuide(pov,chart.autoSetup?{...chart.autoSetup,activeGuide:'none',events:chart.autoSetup.events.filter(e=>(deskMode==='pro'?chart.signalKinds:['range']).includes(e.kind))}:null,deskMode,chart.activeStudies(),STUDIES);
 for(const x of node.querySelectorAll('details'))x.open=open.includes(x.querySelector('summary').textContent);
 if(pov.ready&&!chart.historyAnchor){if(!forecastRun&&forecastView?.result.asOf<pov.closedAt&&node.dataset.forecastWake!==String(pov.closedAt)){node.dataset.forecastWake=String(pov.closedAt);paintForecast(chart);}acceptForecastResults(chart,pov.closedAt);}
}

function updateStreamStatus(s){if(!$('#stream-status'))return;const compact=$('#compact-stream-status');if(compact){const short=navigator.onLine===false?'Offline':{loading:'Connecting',streaming:'Live',snapshot:'Snapshot',polling:'Reconnecting',delayed:'Delayed',stale:'Stale',unavailable:'Unavailable',archive:'Archive'}[s]??s;if(compact.textContent!==short)compact.textContent=short;compact.dataset.status=s;}const labels={loading:'Connecting to exchange…',streaming:'WebSocket · live messages',snapshot:'REST snapshot',polling:'REST fallback · reconnecting',delayed:'Delayed · awaiting fresh data',stale:'Stale provider cache',unavailable:'Provider unavailable',archive:'Historical window · no live quote'};$('#stream-status').innerHTML=`<span class="live-dot ${s==='streaming'?'':'muted-dot'}"></span>${labels[s]??s}`;$('#stream-status').className='source '+(['stale','delayed','unavailable'].includes(s)?'warn':'');if(terminal?.candleMeta)$('#candle-source').textContent=`${terminal.candleMeta.provider} · ${selected.base}/${selected.quote} · UTC bars · ${terminal.candleMeta.cache==='stale'?'STALE · ':''}${stamp(terminal.candleMeta.fetchedAt)}`;}

let lastBookPaint=0;
function updateBook(r){activeBook=r;if(!$('#orderbook')||$('#wb-depth')?.hidden)return;const now=Date.now();if(r?.cache==='live'&&now-lastBookPaint<250)return;lastBookPaint=r?now:0;if(!r){$('#book-mode').textContent='AWAITING DATA';$('#orderbook').innerHTML=empty('Book unavailable','Awaiting next valid snapshot.');$('#book-source').textContent='No current snapshot';return;}$('#book-mode').textContent=r.cache==='live'?'LIVE · TOP 20':'L2 SNAPSHOT';const d=r.data,max=Math.max(...d.bids.slice(0,7).map(x=>x[1]),...d.asks.slice(0,7).map(x=>x[1]),1);const rows=(items,side)=>items.map(x=>`<div class="book-row ${side}" style="--depth:${x[1]/max*100}%"><span>${num(x[0],x[0]<1?8:2)}</span><span>${num(x[1],5)}</span><span>${compact(x[0]*x[1])}</span></div>`).join('');const bid=d.bids[0]?.[0],ask=d.asks[0]?.[0];$('#orderbook').innerHTML=rows(d.asks.slice(0,7).reverse(),'ask')+`<div class="book-spread">Spread <strong>${Number.isFinite(ask-bid)?num(ask-bid,8):'—'} ${esc(selected.quote)}</strong><small>${bid&&ask?num((ask-bid)/((ask+bid)/2)*100,4)+'%':''}</small></div>`+rows(d.bids.slice(0,7),'bid');$('#book-source').textContent=`${r.provider} · ${r.cache==='stale'?'STALE · ':''}${r.cache==='live'?'received '+new Date(r.fetchedAt).toLocaleTimeString():ago(r.fetchedAt)} · top 7 / side`;}

function updateWatchPanel(){if(!$('#terminal-watchlist'))return;const list=(data.markets?.data??[]).filter(a=>workspace.watchlist.includes(a.id));$('#terminal-watchlist').innerHTML=list.length?list.slice(0,8).map(a=>`<button class="watch-row" data-action="asset-chart" data-id="${esc(a.id)}"><span>${esc(a.symbol)} <small>USD</small></span><span>${price(a.price)}<small class="${tone(a.change)}">${pct(a.change)}</small></span></button>`).join(''):empty('Watchlist empty','Star an asset in Markets to save it.');}

function renderNews(){$('#main').innerHTML=header('News','Crypto, regulation and macro market headlines.')+newsToolbar()+'<div id="news-results" class="news-reading-panel"></div><div class="news-update-note">'+stateBadge('news')+'</div>';bindNewsSearch();renderNewsResults();}
function renderNewsResults(){if(!$('#news-results'))return;for(const id of ['#news-data-meta','#home-news-meta'])if($(id))$(id).innerHTML=stateBadge('news');const result=newsWindow(data.news?.data?.items??[],{topic:page==='overview'?homeNewsTopic:newsTopic,query:page==='overview'?'':newsQuery,limit:page==='overview'?4:newsLimit});$('#news-results').innerHTML=result.items.length?renderNewsCards(result.items)+(page==='news'?`<div class="news-load"><span>${result.items.length} of ${result.total} headlines</span>${result.remaining?`<button class="button" data-action="news-more">Show more (${Math.min(20,result.remaining)})</button>`:''}</div>`:''):data.news?empty('No matching headlines','Try another topic or search.'):errorOrLoading('news');hydrate();}

async function renderStudio(){

 const gen=pageGeneration;$('#main').innerHTML=header('Market maps','View market size, liquidity and network activity.',`<a href="#terminal" class="button">${icon('chart-no-axes-combined')} Open terminal</a>`)+`<div class="studio-tabs"><button class="chip selected" data-action="studio-tab" data-view="map">Market map</button><button class="chip" data-action="studio-tab" data-view="momentum">Liquidity & momentum</button><button class="chip" data-action="studio-tab" data-view="defi">DeFi landscape</button><button class="chip" data-action="studio-tab" data-view="depth">Exchange depth</button></div><div id="studio-content"></div>`;await studioView(studioViewName,gen);

}

function updateStudioInsights(view,payload){if(!$('#studio-insights'))return;const a=data.markets?.data??[];const total=a.reduce((s,x)=>s+(x.marketCap??0),0);$('#studio-insights').innerHTML=view==='defi'?`<div class="insight-number">${payload.length}<small>chains reporting positive TVL</small></div><p>Compare the largest chain networks by reported capital locked.</p><div class="callout">TVL is not market cap, revenue or a valuation. Do not sum chains to assert unique deposits.</div>`:view==='depth'?`<div class="insight-number">50<small>levels requested per side</small></div><p>${esc(selected.venue.toUpperCase())} · ${esc(selected.symbol)}</p><div class="callout">Displayed orders can be canceled. Depth is a point-in-time snapshot and does not predict trade execution.</div>`:`<div class="insight-number">${a.length?num(a.length,0):'—'}<small>directory assets in snapshot</small></div><div class="pulse-item"><span>Top 10 cap share</span><strong>${total?num(a.slice(0,10).reduce((s,x)=>s+(x.marketCap??0),0)/total*100)+'%':'—'}</strong></div><p>Concentration and liquidity are different. Smaller assets can carry large execution risk.</p><div class="callout">${view==='map'?'A small tile can still have a large percentage move. Color is not a trade signal.':'Reported turnover is not audited executable liquidity. Log scaling spreads orders of magnitude.'}</div>${stateBadge('markets')}`;}

async function studioView(view,gen=pageGeneration,updateOnly=false){studioViewName=view;
 if(updateOnly&&visuals.length&&view!=='depth'){const payload=view==='defi'?data.chains?.data:data.markets?.data;if(payload){visuals[0].update(payload);updateStudioInsights(view,payload);if($('#studio-meta'))$('#studio-meta').innerHTML=stateBadge(view==='defi'?'chains':'markets');return;}}

 const viewGen=++studioGeneration;const current=()=>gen===pageGeneration&&viewGen===studioGeneration;

 for(const v of visuals)v.dispose();visuals=[];document.querySelectorAll('[data-action="studio-tab"]').forEach(b=>b.classList.toggle('selected',b.dataset.view===view));const el=$('#studio-content');if(!el)return;

 const definitions={map:['Market capitalization map','Area = market cap. Color = 24h price change. Top 45 directory assets. Click an asset to choose its exchange chart.'],momentum:['Liquidity meets momentum','24h change vs reported USD trading volume (log scale). Bubble size = market cap. First 100 qualifying ranked assets.'],defi:['Where DeFi capital sits','Chain TVL is sourced from DeFiLlama. TVL depends on the provider methodology and can include overlapping protocol exposures.'],depth:[`${selected.base} / ${selected.quote} · depth snapshot`,'Cumulative base-asset size within the first 50 bid/ask levels. A partial snapshot, not total market liquidity.']};

 el.innerHTML=`<div class="studio-grid"><section class="panel"><div class="panel-top"><div><h2>${esc(definitions[view][0])}</h2></div><span class="small-tag">OBSERVED DATA</span></div><p class="chart-description">${esc(definitions[view][1])}</p><div id="studio-chart" class="studio-chart"></div><div id="studio-meta" class="panel-bottom"></div></section><aside class="panel studio-insights"><div class="panel-top"><h2>Reading this view</h2>${icon('info')}</div><div id="studio-insights"></div><a href="#markets" class="button full">View prices ${icon('arrow-up-right')}</a></aside></div>`;hydrate();

 try{const {createVisual}=await import('./visuals.js');if(!current())return;let payload,kind,key;

  if(view==='defi'){if(!data.chains)data.chains=await api('chains');payload=data.chains.data;kind='chains';key='chains';}

  else if(view==='depth'){const r=await api(`book?venue=${selected.venue}&symbol=${selected.symbol}`);if(!current())return;payload=r.data;kind='depth';key=null;$('#studio-meta').textContent=`${r.provider} · ${r.cache==='stale'?'STALE · ':''}${stamp(r.fetchedAt)}`;}

  else {if(!data.markets)throw Error(errors.markets??'Market prices are loading. Use Refresh to retry.');payload=data.markets.data;kind=view==='map'?'treemap':'scatter';key='markets';}

  if(!current()||!$('#studio-chart'))return;visuals.push(createVisual($('#studio-chart'),kind,payload,{onSelect:id=>chooseAsset(id)}));if(key)$('#studio-meta').innerHTML=stateBadge(key);

  updateStudioInsights(view,payload);

 }catch(e){if(current()&&$('#studio-chart'))$('#studio-chart').innerHTML=empty('Visualization unavailable',e.message);}

}

function renderWorkspace(){const list=(data.markets?.data??[]).filter(a=>workspace.watchlist.includes(a.id));$('#main').innerHTML=header('Workspace','Watchlist, alerts, notes and journal.',`<div class="inline-actions"><button class="button" data-action="export-workspace">${icon('download')} Backup</button><button class="button" data-action="import-workspace">${icon('upload')} Import</button><button class="button" data-action="restore-workspace">Recover import</button></div>`)+`<div class="callout workspace-callout">${icon('info')} Saved on this browser. Backups are unencrypted.</div><section class="panel" id="workspace-watchlist"><div class="panel-top"><h2>Watchlist <span class="count">${workspace.watchlist.length}</span></h2><a href="#markets" class="text-link">Add assets ${icon('plus')}</a></div><div id="workspace-watchlist-table">${data.markets?list.length?marketTable(list):empty('Watchlist empty','Star an asset in Prices to save it.'):errorOrLoading('markets')}</div></section><div class="workspace-grid"><section class="panel" id="workspace-alerts"><div class="panel-top"><div><h2>Price alerts</h2></div><button class="button" data-action="new-alert">${icon('plus')} Add alert</button></div><div id="alerts-list">${alertList()}</div><p class="data-note">Triggers once when a fresh price crosses the threshold. Keep this tab open.</p></section><section class="panel" id="workspace-journal"><div class="panel-top"><h2>Journal</h2>${icon('file-text')}</div><form id="journal-form"><label class="sr-only" for="journal-text">Research journal entry</label><textarea id="journal-text" maxlength="4000" placeholder="Add a journal entry…" required>${esc(drafts.journal)}</textarea><small id="journal-draft-status" class="source">Draft retained on this browser</small><button class="button primary" type="submit">Save entry ${icon('plus')}</button></form><div class="journal-list">${workspace.journal.slice().reverse().slice(0,15).map(j=>`<article><time>${esc(stamp(j.createdAt))}</time><button class="icon-button" data-action="delete-journal" data-id="${esc(j.id)}" aria-label="Delete journal entry">${icon('trash-2')}</button><p>${esc(j.text)}</p></article>`).join('')}</div></section></div><section class="panel saved-notes"><div class="panel-top"><h2>Saved instrument notes</h2></div>${Object.entries(workspace.notes).filter(([k,v])=>v.trim()).map(([k,v])=>`<article><span class="eyebrow">${esc(k)}</span><p>${esc(v)}</p></article>`).join('')||empty('No saved instrument notes','Previously saved instrument notes remain in backups.')}</section><input id="workspace-file" type="file" accept="application/json,.json" class="hidden">`;

 $('#journal-text').addEventListener('input',()=>{const persisted=drafts.setJournal($('#journal-text').value);$('#journal-draft-status').textContent=persisted?'Draft retained on this browser':'Draft in this tab only · storage unavailable';});
 $('#journal-form').addEventListener('submit',e=>{e.preventDefault();const text=$('#journal-text').value.trim();if(!text)return;const next={...workspace,journal:[...workspace.journal,{id:crypto.randomUUID(),text,createdAt:new Date().toISOString()}].slice(-200)};if(!writeState(storage,next)){toast('Cannot save entry. Draft retained; browser storage is unavailable or full.');return;}workspace=next;drafts.setJournal('');renderPage();});$('#workspace-file').addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>2000000)throw Error('Maximum backup size is 2 MB');const gen=pageGeneration,parsed=JSON.parse(await f.text());if(gen!==pageGeneration)throw Error('View changed; import the file again in Workspace.');const imported=replaceWorkspace(storage,workspace,parsed);workspace=imported;selected=workspace.preferences.lastInstrument;selectedInterval=workspace.preferences.interval;alertPrices.clear();toast('Workspace imported. Review imported alerts; at most 10 remain armed.');renderPage();}catch(err){toast('Import rejected: '+err.message);}});

}

function updateWorkspacePrices(){if(!$('#workspace-watchlist-table'))return;const list=(data.markets?.data??[]).filter(x=>workspace.watchlist.includes(x.id));$('#workspace-watchlist-table').innerHTML=data.markets?list.length?marketTable(list):empty('Watchlist empty','Star an asset in Prices to save it.'):errorOrLoading('markets');$('#workspace-watchlist .count').textContent=workspace.watchlist.length;hydrate();}

function alertList(){return workspace.alerts.length?workspace.alerts.map(a=>`<article class="alert-row"><div>${icon('bell')}<span><strong>${esc(a.symbol)}</strong><small>${esc(a.venue)} · ${a.direction} ${num(a.target,8)} · ${a.active?'Armed':a.triggeredAt?'Triggered '+ago(a.triggeredAt):'Paused'}</small></span></div><button class="chip" data-action="toggle-alert" data-id="${esc(a.id)}">${a.active?'Pause':'Rearm'}</button><button class="icon-button" data-action="delete-alert" data-id="${esc(a.id)}" aria-label="Delete alert">${icon('trash-2')}</button></article>`).join(''):empty('No price alerts','Create a threshold for an explicit exchange instrument.');}

function evaluateAlerts(instrument,value,observedAt){let changed=false;for(const a of workspace.alerts){if(!a.active||a.venue!==instrument.venue||a.symbol!==instrument.symbol)continue;const previous=alertPrices.get(a.id),observation=freshObservation(previous,value,observedAt);if(!observation)continue;alertPrices.set(a.id,observation);if(crossed(previous?.price,value,a.target,a.direction)){a.active=false;a.triggeredAt=new Date().toISOString();changed=true;toast(`${a.symbol} crossed ${a.direction} ${num(a.target,8)}`);}}if(changed){save();updateAlertCount();if(page==='workspace'){$('#alerts-list').innerHTML=alertList();hydrate();}}}

let alertBusy=false;async function pollAlerts(){if(document.hidden||alertBusy)return;const active=workspace.alerts.filter(a=>a.active);const unique=[...new Map(active.map(a=>[a.venue+':'+a.symbol,a])).values()].slice(0,10);alertBusy=true;await Promise.allSettled(unique.map(async a=>{try{const r=await api(`ticker?venue=${a.venue}&symbol=${a.symbol}`);if(r.cache==='stale')return;const value=+(r.data.lastPrice??r.data.last);if(Number.isFinite(value))evaluateAlerts(a,value,r.data.observedAt??r.fetchedAt);}catch{}}));alertBusy=false;}

function updateAlertCount(){const n=workspace.alerts.filter(a=>a.active).length;if($('#alert-count'))$('#alert-count').textContent=n?String(n):'';}



function modal(title,content,wide=false){modalGeneration++;clearTimeout(searchTimer);catalogSearch.cancel();dialogController.open(title,content,wide);}
function closeModal(options){dialogController?.close(options);}

function openSearch(){remoteAssets=[];remoteError='';remoteLoading=false;modal('Find an asset',`<label class="command-search">${icon('search')}<input id="command-input" maxlength="80" placeholder="Name, ticker or trading pair" autocomplete="off" aria-label="Search coins and instruments"></label><div id="command-results" class="command-results"></div><div class="modal-footer">Search catalog identities and supported exchange pairs. <kbd>ESC</kbd> to close.</div>`,true);$('#command-input').addEventListener('input',e=>{const q=e.target.value;clearTimeout(searchTimer);catalogSearch.cancel();remoteAssets=[];remoteError='';remoteLoading=normalizeSearch(q).length>=2;searchResults(q);if(remoteLoading)searchTimer=setTimeout(()=>catalogSearch.run(q),300);});searchResults('');}

function searchResults(q){if(!$('#command-results'))return;const combined=mergeAssets(data.markets?.data??[],remoteAssets);const assets=rankAssets(combined,q,8),pairs=rankAssets([...instruments.binance,...instruments.coinbase],q,8);$('#command-results').innerHTML=`<div class="eyebrow">Crypto assets · USD</div>${assets.map(a=>`<button class="command-row" data-action="asset-chart" data-id="${esc(a.id)}">${coinMark(a.symbol)}<span><strong>${esc(a.name)} <small>${esc(a.symbol)}</small></strong><small>${isFetchAsset(a)?'Fetch.ai · ':''}${esc(a.id)}</small></span><b>${a.price?price(a.price):'View asset'}</b>${icon('chevron-right')}</button>`).join('')||'<p class="search-note">No matching priced asset in the loaded directory.</p>'}<div class="search-note" role="status">${remoteLoading?'Searching the broader asset catalog…':remoteError?'Catalog temporarily unavailable; loaded results remain available.':q.trim().length>=2?'Catalog results show available identities. Price and chart coverage varies.':''}</div><div class="eyebrow">Exchange charts</div>${pairs.map(a=>`<button class="command-row" data-action="select-instrument" data-venue="${a.venue}" data-symbol="${esc(a.symbol)}">${coinMark(a.base)}<span><strong>${esc(a.base)}/${esc(a.quote)}</strong><small>${a.venue.toUpperCase()} spot · ${esc(a.symbol)}</small></span>${icon('arrow-up-right')}</button>`).join('')||'<p class="search-note">No matching chart pair in the connected venues.</p>'}`;hydrate();}

async function chooseAsset(id){let a=(data.markets?.data??[]).find(a=>a.id===id)??assetLookup.get(id);if(!a)return;const show=notice=>{const matches=[...instruments.binance,...instruments.coinbase].filter(x=>x.base===a.symbol);modal(`${esc(a.name)} <span class="muted">${esc(a.symbol)}</span>`,`<div class="asset-detail"><div><small>Aggregate price · USD</small><strong>${price(a.price)}</strong><span class="${tone(a.change)}">${pct(a.change)} / 24h</span></div><p>${isFetchAsset(a)?'Also known as Fetch.ai.<br>':''}Asset ID: <code>${esc(a.id)}</code><br>${a.updatedAt?'Updated '+esc(stamp(a.updatedAt)):esc(notice)}</p></div><div class="callout">${matches.length?'Choose an exchange chart. Verify the listed token identity before acting.':'No Binance USDT or Coinbase USD chart is currently connected for this asset. Price and history depend on provider coverage.'}</div><div class="instrument-choices">${matches.map(x=>`<button class="command-row" data-action="select-instrument" data-venue="${x.venue}" data-symbol="${esc(x.symbol)}">${coinMark(x.base)}<span><strong>${esc(x.base)}/${esc(x.quote)}</strong><small>${x.venue.toUpperCase()} spot</small></span>${icon('arrow-up-right')}</button>`).join('')}</div>`);};show('Loading current price…');if(!a.price){const gen=modalGeneration;try{const r=await api('asset?id='+encodeURIComponent(id),{signal:dialogController.signal});if(gen!==modalGeneration)return;a=r.data;assetLookup.set(id,a);show('');}catch{if(gen===modalGeneration)show('Current price unavailable from the provider.');}}}

function selectInstrument(venue,symbol){const i=instruments[venue].find(x=>x.symbol===symbol);if(!i){toast('Instrument is unavailable. Refresh the directory.');return;}selected=i;closeModal();if(page==='terminal'){updateInstrumentOptions();$('#venue').value=venue;capturePreferences();terminal.load(selected,selectedInterval);}else{workspace.preferences.lastInstrument=selected;save();location.hash='terminal';}}

function indicatorModal(){
 if(!terminal)return;const selectedIds=[...terminal.activeStudies()];
 const catalog=Object.values(STUDIES).filter(s=>deskMode==='pro'||['ema','sma','bb','levels','rsi','stoch','macd','volume','vwap'].includes(s.id));const groups=[...new Set(catalog.map(s=>s.group))];
 const presets=Object.values(STUDY_PRESETS);
 modal('Chart studies',`<div class="study-presets" aria-label="Study presets">${presets.map(p=>`<button type="button" class="button" data-preset="${p.id}" title="${esc(p.description)}">${esc(p.label)}</button>`).join('')}<button type="button" class="button" data-preset="clear">Clear</button></div><p class="data-note">Presets plot immediately. Choose up to four overlays and one lower panel.</p><form id="study-form">${groups.map(group=>`<section class="study-group"><h3>${esc(group)}</h3><div class="study-grid">${catalog.filter(s=>s.group===group).map(s=>`<label class="study-choice"><input type="checkbox" name="study" value="${s.id}" ${selectedIds.includes(s.id)?'checked':''}><span><strong>${esc(s.label)}</strong><small>${esc(s.meaning)}</small><small>${esc(s.check)}</small><small class="pro-only">Needs: ${esc(s.warmup)}</small>${s.id==='vwap'&&selectedInterval==='1d'?'<small>Choose an intraday interval to plot VWAP.</small>':''}</span></label>`).join('')}</div></section>`).join('')}<div class="form-grid pro-only"><label>Overlay length<input name="period" type="number" min="2" max="200" value="${terminal.period}" required></label><label>RSI length<input name="rsiPeriod" type="number" min="2" max="100" value="${terminal.rsiPeriod}" required></label><label class="marker-setting"><input name="markers" type="checkbox" ${terminal.markers?'checked':''}> EMA 20/50 cross markers</label></div><fieldset class="pro-only signal-kinds"><legend>Closed-candle event markers</legend>${[['range','Range break'],['macd','MACD transition'],['rsi','RSI transition']].map(([key,label])=>`<label><input name="signal" value="${key}" type="checkbox" ${terminal.signalKinds.includes(key)?'checked':''}>${label}</label>`).join('')}</fieldset><p class="study-feedback" role="status"></p><button class="button primary" type="submit">Apply to chart</button></form>`,true);
 const dialog=$('#modal-root'),form=$('#study-form');
 let draft=selectedIds;
 const sync=()=>{for(const field of form.querySelectorAll('input[name="study"]'))field.checked=draft.includes(field.value);};
 const apply=()=>{terminal.studyIds=draft;capturePreferences();if(terminal.bars.length)terminal.renderIndicators();refreshIndicatorStrip();updateSummary();};
 for(const button of dialog.querySelectorAll('[data-preset]'))button.addEventListener('click',()=>{
  const p=STUDY_PRESETS[button.dataset.preset];draft=normalizeStudyIds(p?.studies??[]);sync();apply();closeModal();toast(p?p.label+' applied':'Studies cleared');
 });
 form.addEventListener('change',e=>{
  if(e.target.name!=='study')return;
  const id=e.target.value,original=draft;draft=normalizeStudyIds(e.target.checked?[...draft,id]:draft.filter(x=>x!==id));sync();
  const replaced=original.find(x=>x!==id&&!draft.includes(x));form.querySelector('.study-feedback').textContent=replaced?'Replaced '+STUDIES[replaced].label+'.':'';
 });
 form.addEventListener('submit',e=>{e.preventDefault();if(deskMode==='pro'){terminal.period=+form.elements.period.value;terminal.rsiPeriod=+form.elements.rsiPeriod.value;terminal.markers=form.elements.markers.checked;terminal.signalKinds=new FormData(form).getAll('signal');}apply();closeModal();});
}
function historyDateModal(){
 modal('Jump to chart history',`<div class="desk-modal-body"><p>Enter a UTC date to open the available candles ending that day. Use Latest to return to the live chart.</p><form id="history-date-form"><label>UTC date<input type="date" name="date" min="2009-01-01" max="${new Date().toISOString().slice(0,10)}" required></label><button class="button primary" type="submit">Open history</button><p id="history-date-error" role="status"></p></form></div>`);
 $('#history-date-form').addEventListener('submit',e=>{e.preventDefault();const date=new FormData(e.currentTarget).get('date');if(terminal?.jumpToDate(date))closeModal();else $('#history-date-error').textContent='Choose a valid date in the past.';});
}
function drawingModal(){if(!terminal)return;const drawings=workspace.drawings[terminal.key]??[];modal('Saved drawings',`<p class="muted">${esc(selected.symbol)} · ${selectedInterval.toUpperCase()} · Click a tool, then place anchors on the price pane. Dragging the chart preserves time/price anchors.</p><div class="drawing-list">${drawings.map(d=>`<form class="drawing-edit" data-id="${esc(d.id)}"><div><span class="small-tag">${d.type}</span><button type="button" class="icon-button" data-action="delete-drawing" data-id="${esc(d.id)}" aria-label="Delete drawing">${icon('trash-2')}</button></div><label>Annotation<input name="label" value="${esc(d.label)}" maxlength="100"></label>${d.points.map((p,i)=>`<div class="form-grid"><label>Anchor ${i+1} price<input type="number" name="price${i}" min="0" step="any" value="${p.price}" required></label><label>Anchor ${i+1} UTC<input type="datetime-local" name="time${i}" value="${new Date(p.time*1000).toISOString().slice(0,16)}" required></label></div>`).join('')}<button class="button" type="submit">Update drawing</button></form>`).join('')||empty('No drawings yet','Use horizontal, trend, Fibonacci or annotation tools on the price chart.')}<div class="data-note">Date fields are UTC. Set anchor times to existing candle openings to keep them visible.</div></div>`);document.querySelectorAll('.drawing-edit').forEach(f=>f.addEventListener('submit',e=>{e.preventDefault();const d=drawings.find(x=>x.id===f.dataset.id),values=new FormData(f);const next={...d,label:String(values.get('label')),points:d.points.map((p,i)=>({price:+values.get('price'+i),time:Date.parse(values.get('time'+i)+':00Z')/1000}))};if(!drawingValid(next)){toast('Use positive prices and valid UTC anchor times.');return;}Object.assign(d,next);if(save()){terminal.draw();toast('Drawing updated.');}}));}

function alertModal(){const count=workspace.alerts.filter(x=>x.active).length;if(count>=10){toast('Pause an alert before adding another (10 active instruments maximum).');return;}modal('Create a price alert',`<form id="alert-form"><p class="muted">${esc(selected.venue.toUpperCase())} · ${esc(selected.base)} / ${esc(selected.quote)}</p><div class="form-grid"><label>When price crosses<select name="direction"><option value="above">Above</option><option value="below">Below</option></select></label><label>Target (${esc(selected.quote)})<input name="target" type="number" min="0" step="any" value="${terminal?.currentQuote()?.price??''}" placeholder="Target price" required></label></div><div class="callout">Keep this tab open. First quote establishes a baseline; a later crossing triggers the alert once. This is an in-app alert, not a background notification.</div><button class="button primary" type="submit">Arm alert ${icon('bell')}</button></form>`);$('#alert-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);try{const next=appendPriceAlert(workspace,selected,{direction:f.get('direction'),target:f.get('target')},crypto.randomUUID());if(!writeState(storage,next))throw Error('Alert could not be saved. Browser storage is unavailable or full.');workspace=next;closeModal();toast('Alert armed. Keep CRYPTOZ open to monitor.');updateAlertCount();if(page==='workspace')renderPage();pollAlerts();}catch(error){toast(error.message);}});}

document.addEventListener('click',e=>{

 if(e.target.closest('[data-nav]'))document.body.classList.remove('menu-open');const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;

 if(a==='skip-content'){e.preventDefault();$('#main').focus();$('#main').scrollIntoView({block:'start'});return;}

 if(b.closest('.chart-menu'))b.closest('.chart-menu').open=false;
 if(a==='desk'){const mode=b.dataset.mode;if(page==='overview'&&['basic','pro'].includes(mode)&&mode!==deskMode){setDesk(mode);renderPage();document.querySelector('[data-action="desk"][data-mode="'+mode+'"]')?.focus({preventScroll:true});}return;}if(a==='older-candles'){terminal?.loadOlder();return;}if(a==='latest-candles'){terminal?.showLatest();capturePreferences();return;}
 if(a==='zoom-in'){terminal?.zoom(2/3);return;}if(a==='zoom-out'){terminal?.zoom(1.5);return;}if(a==='focus-chart'){setChartFocus(!document.body.classList.contains('chart-focus'));return;}
 if(a==='dock-toggle'){setDock(dockMode==='hidden'?'compact':'hidden');if(dockMode==='compact')$('.sidebar a[aria-current="page"]')?.focus();return;}
 if(a==='dock-hide'){setDock('hidden');const reveal=document.body.classList.contains('chart-focus')?$('.focus-nav-reveal'):$('[data-action="dock-toggle"]');reveal?.focus();return;}
 if(a==='section'){const target=document.getElementById(b.dataset.target);if(target){const reduced=appearance.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches;target.scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});if(b.closest('.context-nav')){b.closest('.context-nav').querySelectorAll('[data-action="section"]').forEach(x=>x.setAttribute('aria-pressed',x===b));}if(target.matches('input,textarea,select'))target.focus({preventScroll:true});}return;}
 if(a==='retry-view'){operationError='';renderPage();return;}
 if(a==='appearance'){appearanceModal();return;}if(a==='live-chart'){selected=instruments.binance.find(x=>x.symbol===b.dataset.symbol)??selected;if(page==='terminal')renderPage();else location.hash='terminal';return;}if(a==='menu'){document.body.classList.toggle('menu-open');return;}

 if(a==='search'){openSearch();return;}if(a==='close-modal'){closeModal();return;}

 if(a==='refresh'){refreshCurrent();return;}

 if(a==='watch'){const id=b.dataset.id;if(workspace.watchlist.includes(id))workspace.watchlist=workspace.watchlist.filter(x=>x!==id);else if(workspace.watchlist.length<200)workspace.watchlist.push(id);save();b.classList.toggle('selected',workspace.watchlist.includes(id));b.setAttribute('aria-pressed',workspace.watchlist.includes(id));if(page==='workspace')updateWorkspacePrices();return;}

 if(a==='view-watchlist'){onlyWatch=true;location.hash='markets';return;}

 if(a==='asset-chart'){chooseAsset(b.dataset.id);return;}

 if(a==='exchange-chart'){selectInstrument('binance',b.dataset.id);return;}

 if(a==='select-instrument'){selectInstrument(b.dataset.venue,b.dataset.symbol);return;}

 if(a==='default-chart'){selected={venue:'binance',symbol:'BTCUSDT',base:'BTC',quote:'USDT'};return;}

 if(a==='insights-tab'){insightsView?.load(b.dataset.tab);return;}
 if(a==='insights-retry'){insightsView?.load();return;}
 if(a==='market-group'){if(!b.closest('.sector-pulse'))marketSectorFocus=false;else marketSectorFocus=true;marketGroup=b.dataset.marketGroup;marketPage=0;queueMarketSearch();renderMarketResults();document.querySelector((marketSectorFocus?'#market-sector ':'#market-groups ')+'[data-market-group="'+CSS.escape(marketGroup)+'"]')?.focus({preventScroll:true});return;}
 if(a==='universe'){marketGroup='all';marketScreen=initialScreen();marketUniverse=b.dataset.universe;if(marketUniverse==='exchange'&&marketSort==='marketCap')marketSort='volume';marketPage=0;renderMarkets();hydrate();return;}

 if(a==='toggle-watch'){onlyWatch=!onlyWatch;b.classList.toggle('selected',onlyWatch);marketPage=0;renderMarketResults();return;}

 if(a==='prev-page'||a==='next-page'){marketPage+=a==='next-page'?1:-1;renderMarketResults();return;}

 if(a==='export-markets'){const list=filteredMarkets();download('cryptoz-markets.csv',serializeCSV(['id','symbol','name','price','quote','change24h','marketCap','volume','updatedAt'],list.map(x=>[x.id,x.symbol,x.name,x.price,marketUniverse==='exchange'?'USDT':'USD',x.change,x.marketCap,x.volume,x.updatedAt])),'text/csv');return;}

 if(a==='home-news-tab'){homeNewsTopic=b.dataset.topic;document.querySelectorAll('[data-action="home-news-tab"]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderNewsResults();return;}
 if(a==='news-more'){newsLimit+=20;renderNewsResults();return;}if(a==='news-topic'){newsTopic=b.dataset.topic;newsLimit=20;document.querySelectorAll('[data-action="news-topic"]').forEach(x=>{x.classList.toggle('active',x.dataset.topic===newsTopic);x.setAttribute('aria-pressed',x.dataset.topic===newsTopic);});renderNewsResults();return;}

 if(a==='studio-tab'){studioView(b.dataset.view);return;}

 if(a==='timeframe'){selectedInterval=b.dataset.time;if($('#compact-interval'))$('#compact-interval').value=selectedInterval;capturePreferences();syncTimeframe();terminal?.load(selected,selectedInterval);return;}

 if(a==='retry-chart'){terminal?.refresh();return;}

 if(a==='layouts'){layoutModal();return;}

 if(a==='load-layout'){const l=workspace.layouts.find(x=>x.id===b.dataset.id);if(!l)return;workspace.preferences=normalizePreferences(l.settings);selected=workspace.preferences.lastInstrument;selectedInterval=workspace.preferences.interval;save();closeModal();renderPage();return;}

 if(a==='delete-layout'){workspace.layouts=workspace.layouts.filter(x=>x.id!==b.dataset.id);save();layoutModal();return;}

 if(a==='guide'){const help=helpFor(b.dataset.guide);if(help)modal(help.title,'<ol class="help-steps">'+help.items.map(([title,text])=>'<li><h3>'+esc(title)+'</h3><p>'+esc(text)+'</p></li>').join('')+'</ol>');return;}
 if(a==='indicators'){indicatorModal();return;}
 if(a==='chart-panel'){activateChartPanel(b.dataset.pane);return;}
 if(a==='forecast-csv'){exportForecastCases();return;}
 if(a==='forecast-run'){runChartForecast(b.dataset.deep==='1');return;}
 if(a==='suggest-studies'&&terminal){const state=buildStudyPov({bars:terminal.studyBars,instrument:selected,interval:selectedInterval,nowSeconds:terminal.historyAnchor??Date.now()/1000,candleMeta:terminal.candleMeta,confirmedThrough:terminal.confirmedThrough});if(!state.ready){toast('Wait for enough closed candles.');return;}const preset=STUDY_PRESETS[state.trend==='Mixed'?'range':'trend'];terminal.studyIds=normalizeStudyIds(preset.studies);terminal.renderIndicators();refreshIndicatorStrip();updateSummary();capturePreferences();toast(preset.label+' studies applied');return;}
 if(a==='auto-guide'){applyAutoGuide(b.dataset.guide);return;}
 if(a==='manual-guide'&&terminal&&deskMode==='pro'){terminal.manualDrawing=!terminal.manualDrawing;b.setAttribute('aria-pressed',String(terminal.manualDrawing));$('.drawing-tools').hidden=!terminal.manualDrawing;terminal.setTool('cursor');document.querySelectorAll('[data-action="auto-guide"]').forEach(btn=>btn.setAttribute('aria-pressed',String(!terminal.manualDrawing&&btn.dataset.guide===terminal.autoGuide)));terminal.draw();updateSummary();return;}
 if(a==='chart-history-date'){historyDateModal();return;}

 if(a==='fit-chart'){terminal?.setViewPreset('all');capturePreferences();return;}

 if(a==='chart-csv'){terminal?.exportCSV();return;}if(a==='chart-png'){terminal?.exportPNG();return;}

 if(a==='draw-tool'){terminal?.setTool(b.dataset.tool,b.dataset.tool==='label'?'Research note':'');document.querySelectorAll('[data-tool]').forEach(el=>el.classList.toggle('selected',el===b));if(b.dataset.tool!=='cursor')toast(b.dataset.tool==='trend'||b.dataset.tool==='fib'?'Click two anchors on the price pane.':'Click a level on the price pane.');return;}

 if(a==='drawings'){drawingModal();return;}

 if(a==='delete-drawing'){workspace.drawings[terminal.key]=(workspace.drawings[terminal.key]??[]).filter(x=>x.id!==b.dataset.id);save();terminal.draw();$('#drawings-count').textContent=workspace.drawings[terminal.key].length;drawingModal();return;}

 if(a==='risk-example'){const form=$('#risk-form');if(!form)return;const values={side:'long',equity:1000,riskPercent:1,entry:100,stop:95,target:110,feePercent:0.1};for(const [key,value] of Object.entries(values))form.elements[key].value=value;$('#risk-example-status').textContent='Hypothetical example loaded. The prices are for practice, not current market levels.';riskCalculator?.calculate();return;}
 if(a==='use-price'){if(page==='risk'){useRiskPrice(b);return;}const quote=terminal?.currentQuote();if(quote){$('#risk-form [name="entry"]').value=quote.price;saveRiskDraft();riskCalculator?.invalidate();}else toast('No fresh quote for this instrument. Refresh or enter a price manually.');return;}


 if(a==='new-alert'){alertModal();return;}

 if(a==='toggle-alert'){const x=workspace.alerts.find(x=>x.id===b.dataset.id);if(!x.active&&workspace.alerts.filter(a=>a.active).length>=10){toast('Maximum 10 active alerts.');return;}x.active=!x.active;alertPrices.delete(x.id);save();renderPage();return;}

 if(a==='delete-alert'){workspace.alerts=workspace.alerts.filter(x=>x.id!==b.dataset.id);alertPrices.delete(b.dataset.id);save();renderPage();return;}

 if(a==='delete-journal'){workspace.journal=workspace.journal.filter(x=>x.id!==b.dataset.id);save();renderPage();return;}

 if(a==='restore-workspace'){try{workspace=replaceWorkspace(storage,workspace,JSON.parse(storage.getItem(RECOVERY_KEY)),{backup:false});selected=workspace.preferences.lastInstrument;selectedInterval=workspace.preferences.interval;alertPrices.clear();renderPage();toast('Pre-import workspace restored.');}catch(error){toast('Recovery failed: '+error.message);}return;}

 if(a==='export-workspace'){download('cryptoz-workspace.json',JSON.stringify(workspace,null,2),'application/json');return;}

 if(a==='import-workspace'){$('#workspace-file')?.click();return;}

});

document.addEventListener('keydown',e=>{if(dialogController?.isOpen)return;if(e.key==='Escape'){document.querySelectorAll('.chart-menu[open]').forEach(d=>d.open=false);if(document.body.classList.contains('chart-focus'))setChartFocus(false);terminal?.setTool('cursor');}if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();openSearch();}});

$('#modal-root').addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))closeModal();});

let homeResizeTimer;window.addEventListener('resize',()=>{syncDockAccess();clearTimeout(homeResizeTimer);if(page==='overview'&&!mini&&innerWidth>650)homeResizeTimer=setTimeout(()=>loadBenchmark(pageGeneration),180);});window.addEventListener('storage',e=>{if(e.key==='cryptoz.workspace.v2')toast('Workspace changed in another tab. Export this tab before reloading if it contains unsaved research.');});window.addEventListener('hashchange',route);window.addEventListener('error',()=>{operationError='This view could not update. Retry the view.';syncNetworkState();});window.addEventListener('unhandledrejection',event=>{if(event.reason?.name==='AbortError')return;operationError='An operation could not finish. Retry the view.';syncNetworkState();});window.addEventListener('online',()=>{operationError='';syncNetworkState();refreshCurrent();});window.addEventListener('offline',syncNetworkState);

marketStream=new MarketStream({onBatch:patchLiveQuotes,onStatus:patchLiveStatus});shell();dialogController=createDialogController({root:$('#modal-root'),background:$('#app'),hydrate,fallbackFocus:()=>$('#main'),onClose:()=>{modalGeneration++;clearTimeout(searchTimer);catalogSearch.cancel();}});route();fetchData();loadInstruments();

setInterval(()=>{if(!document.hidden&&!loading)fetchData(page==='markets'&&marketUniverse==='exchange'?['exchange']:['markets','global','sentiment','news']);},120000);

setInterval(pollAlerts,15000);

