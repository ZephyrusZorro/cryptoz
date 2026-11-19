import {serializeCSV} from './exports.js';
import './style.css';
import './theme.css';
import './navigation.css';
import './liquid.css';
import './workspace.css';
import './beginner.css';
import './guided.css';
import {deskSwitch,readDesk,riskSection} from './guided-ui.js';
import {STUDIES,STUDY_PRESETS,normalizeStudyIds,normalizeSmaPeriods,MAX_STUDY_OVERLAYS,MAX_STUDY_PANES,MAX_SMA_PERIODS,MAX_SMA_LENGTH} from './studies.js';
import {ANALYST_ASSETS,analystAssetKey} from './analyst-research.js';
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
import {forecastHistoryMinimum} from './adaptive-study.js';
import {FORECAST_DEFAULT_HORIZON,FORECAST_MAX_CANDLES,forecastHistoryChoice,normalizeForecastHorizon,validForecastHorizon} from './forecast-settings.js';
import './forecast.css';
import {createForecastLedger} from './forecast-ledger.js';
import {filterMarketGroup,renderMarketCards,renderMarketGroups,renderMarketBreadth} from './market-groups.js';
import './market-groups.css';
import './navigation-layout.css';
import './learning-layout.css';
import './analyst-layout.css';
import './era.css';
import './desktop-polish.css';
import './phone-layout.css';
import {dismissSurface,motionEnabled as navigationMotion,moveSelection,reveal} from './motion.js';
import {PHONE_LAYOUT,chartScrollOptions} from './phone-layout.js';
import {BENCHMARK_RANGES,benchmarkWindow,dashboardShortcuts} from './dashboard.js';
import {createMarketMovers,marketMoversPanel} from './market-movers.js';
import {displayPrice as moverDisplayPrice} from './currency.js';
import {helpFor} from './beginner-content.js';
import {createLearningProgress} from './beginner-store.js';
import {appendPriceAlert} from './alert-plan.js';
import {createDraftStore} from './draft-store.js';
import {createDialogController} from './dialog.js';
import {closeToolMenus} from './disclosure-menu.js';
import {refreshPage} from './page-refresh.js';
import {matchesAsset,rankAssets,catalogQuery,normalizeSearch,createLatestSearch,mergeAssets,assetIdentity,isFetchAsset} from './asset-search.js';
import {newsWindow} from './news-window.js';
import {renderNewsCards} from './news-view.js';
import {PRIMARY,resolveNavigation,navigationFor,normalizeDock,readDock,saveDock} from './navigation.js';
import {createDataLoader} from './data-loader.js';
import {palette,chartOptions,readAppearance,applyAppearance} from './theme.js';
import {DISPLAY_CURRENCY_KEY,currency,axisPriceFormat,displayCurrencyStatus,nativeAndDisplay,moneyMarkup,refreshMoney,setMoneyText} from './currency.js';
import {RATES} from './currency-data.js';
import {pricePrecision} from './numbers.js';
import {BENCHMARK_ASSETS,MarketStream} from './live-market.js';
import {createLiveMarketView} from './market-live-view.js';
import {mountLearningHub} from './learning-hub.js';

import {createIcons,LayoutDashboard,ChartNoAxesCombined,Globe,Newspaper,Bookmark,Database,Search,ArrowUpRight,ArrowRight,ArrowDown,ArrowUp,RefreshCw,ChevronRight,ChevronLeft,ChevronDown,Plus,X,Download,Maximize2,Minimize2,MoreHorizontal,MousePointer2,Minus,TrendingUp,SlidersHorizontal,Bell,Check,ExternalLink,Activity,Menu,Settings2,Trash2,FileText,Upload,Target,Layers,MoveUpRight,Grid2x2,CalendarDays,Info,Wifi,WifiOff,Clock,Star,BookOpen} from 'lucide';

import {api} from './api.js';import {TerminalChart} from './chart.js';import {mountComparison} from './comparison.js';

import {AUTO_GUIDES,normalizePreferences,selectVenueInstrument,drawingValid} from './preferences.js';

import {mountRiskCalculator} from './risk-calculator.js';import {readState,writeState,validateWorkspace,crossed,freshObservation,RECOVERY_KEY,replaceWorkspace} from './state.js';

import {esc,num,compact,pct,tone,ago,stamp,icon,sectionHeading,download,toast,safeStorage} from './ui.js';



const icons={LayoutDashboard,ChartNoAxesCombined,Globe,Newspaper,Bookmark,Database,Search,ArrowUpRight,ArrowRight,ArrowDown,ArrowUp,RefreshCw,ChevronRight,ChevronLeft,ChevronDown,Plus,X,Download,Maximize2,Minimize2,MoreHorizontal,MousePointer2,Minus,TrendingUp,SlidersHorizontal,Bell,Check,ExternalLink,Activity,Menu,Settings2,Trash2,FileText,Upload,Target,Layers,MoveUpRight,Grid2x2,CalendarDays,Info,Wifi,WifiOff,Clock,Star,BookOpen};

const $=s=>document.querySelector(s);const storage=safeStorage();const drafts=createDraftStore(storage);const learningProgress=createLearningProgress(storage);let workspace=readState(storage);const data={markets:null,global:null,sentiment:null,news:null,chains:null,exchange:null};const errors={};let instruments={binance:[],coinbase:[]};let page='overview',terminal=null,mini=null,visuals=[],pageGeneration=0,marketPage=0,marketQuery='',marketSort='rank',marketUniverse='aggregate',onlyWatch=false,newsQuery='',newsTopic='all',loading=false;

let selected=workspace.preferences.lastInstrument;let selectedInterval=workspace.preferences.interval;let comparison=null,studioViewName='map';let riskCalculator;let modalGeneration=0,studioGeneration=0;const alertPrices=new Map();let learning=null,marketStream=null,miniSeries=null;let appearance=applyAppearance(readAppearance(storage),storage);

let dockMode=readDock(storage),deskMode=readDesk(storage),newsLimit=20;let searchTimer,marketSearchTimer,remoteAssets=[],marketRemoteAssets=[],remoteLoading=false,remoteError='',marketRemoteLoading=false,marketRemoteError='';const assetLookup=new Map();let dialogController,manualRefreshing=false,operationError='';
document.body.dataset.desk=deskMode;
function setDesk(mode){
 if(!['basic','pro'].includes(mode)||mode===deskMode)return false;
 deskMode=mode;document.body.dataset.desk=mode;
 try{storage.setItem('cryptoz.desk.v1',mode);}catch{}
 for(const btn of document.querySelectorAll('[data-action="desk"]'))btn.setAttribute('aria-pressed',String(btn.dataset.mode===mode));
 return true;
}
let benchmarkTask=null,benchmarkObserver=null,practice=null,practiceSelected=null,homeNewsTopic='all',marketGroup='all',insightsView=null,marketScreen=initialScreen();
let benchmarkRange='7d', benchmarkDisplayed=null;
const transparencyPreference=matchMedia('(prefers-reduced-transparency: reduce)');
let materialMode='glass';
try{
 const saved=storage.getItem('cryptoz.material.v1');
 if(saved==='solid'||saved==='system')materialMode=saved;
}catch{}
function applyMaterial(){document.documentElement.dataset.material=materialMode==='system'?(transparencyPreference.matches?'solid':'glass'):materialMode;}
applyMaterial();transparencyPreference.addEventListener('change',()=>{if(materialMode==='system')applyMaterial();});
const catalogSearch=createLatestSearch({request:(q,o)=>api('asset-search?q='+encodeURIComponent(catalogQuery(q)),o),onResult:(r,q)=>{remoteAssets=r.data;remoteLoading=false;remoteAssets.forEach(a=>assetLookup.set(a.id,a));while(assetLookup.size>200)assetLookup.delete(assetLookup.keys().next().value);if($('#command-input')&&$('#command-input').value===q)searchResults(q);},onError:(e,q)=>{remoteLoading=false;remoteError=e.message;if($('#command-input')?.value===q)searchResults(q);}});
const marketCatalogSearch=createLatestSearch({request:(q,o)=>api('asset-search?q='+encodeURIComponent(catalogQuery(q)),o),onResult:(r,q)=>{marketRemoteAssets=r.data;marketRemoteLoading=false;r.data.forEach(a=>assetLookup.set(a.id,a));while(assetLookup.size>200)assetLookup.delete(assetLookup.keys().next().value);if(isMarketPage()&&marketQuery===q)renderMarketResults();},onError:(e,q)=>{marketRemoteLoading=false;marketRemoteError=e.message;if(isMarketPage()&&marketQuery===q)renderMarketResults();}});const dataLoader=createDataLoader(k=>api(k==='exchange'?'exchange-markets':k),data,errors,{onChange:updateCurrentData});

function hydrate(){createIcons({icons,attrs:{'stroke-width':1.7}});}

function save(){const ok=writeState(storage,workspace);if(!ok)toast('Browser storage is unavailable or full. Export a backup to keep your work.');return ok;}

function meta(key){const r=data[key];return r?`${r.provider} · ${r.cache==='stale'?'STALE · ':''}snapshot · ${ago(r.data?.updatedAt??r.fetchedAt)}`:errors[key]?'Data unavailable':'Connecting…';}

function stateBadge(key){return `<span class="source ${data[key]?.cache==='stale'?'warn':''}" title="${esc(data[key]?stamp(data[key].fetchedAt):errors[key]??'Awaiting response')}">${esc(meta(key))}</span>`;}

function empty(message,detail=''){return `<div class="empty-state">${icon('database')}<strong>${esc(message)}</strong><p>${esc(detail)}</p></div>`;}

function errorOrLoading(key){return errors[key]?empty('Data unavailable',errors[key]+' · Use Refresh to retry.'):empty('Loading data','');}

function coinMark(symbol){return `<span class="coin-mark" aria-hidden="true">${esc(symbol.slice(0,2))}</span>`;}

const headingIcons={overview:'layout-dashboard',markets:'globe',screener:'sliders-horizontal',compare:'layers',studio:'grid-2x2',learn:'book-open',news:'newspaper',analysts:'file-text',practice:'layers',replay:'clock',backtest:'activity',risk:'target','market-insights':'activity',workspace:'bookmark'};
const phoneView=matchMedia(PHONE_LAYOUT);
const phoneMarketRows=16,desktopMarketRows=32;
const brandMark='<span class="cryptoz-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></span>';
let phoneMoversOpen=false;
function header(title,description,extra=''){return sectionHeading(title,description,{glyph:headingIcons[page],action:extra,className:'page-heading'});}

function syncDockAccess(){const dock=$('.sidebar');if(dock)dock.inert=dockMode==='hidden';}
function setDock(mode){dockMode=normalizeDock(mode);document.body.dataset.dock=dockMode;syncDockAccess();saveDock(storage,dockMode);for(const toggle of document.querySelectorAll('[data-action="dock-toggle"]')){toggle.setAttribute('aria-label',dockMode==='hidden'?'Show navigation':'Hide navigation');toggle.setAttribute('aria-expanded',dockMode!=='hidden');}}

function secondaryNav({primary,items,current}){
 if(items.length<2)return '';
 const links=items.map(item=>`<a href="#${item.route}" ${item===current?'aria-current="page"':''}>${esc(item.label)}</a>`).join('');
 return `<nav class="context-nav" aria-label="${primary.sectionLabel}" data-count="${items.length}">${links}</nav>`;
}

function shell(){
 const dockLinks=phone=>PRIMARY.map(item=>`<a href="#${item.route}" data-group="${item.id}" aria-label="${item.label}">${phone?'<span class="phone-selection" aria-hidden="true"></span>':''}${icon(item.icon)}<span class="dock-label" aria-hidden="true">${item.label}</span></a>`).join('');
 $('#app').innerHTML=`
  <aside class="sidebar" id="navigation-dock" aria-label="Navigation dock">
   <a href="#overview" class="dock-brand" aria-label="CRYPTOZ Home">
    ${brandMark}
   </a>
   <nav aria-label="Primary">${dockLinks(false)}</nav>
   <div class="dock-controls"><button type="button" class="icon-button" data-action="dock-hide" aria-controls="navigation-dock" aria-label="Hide navigation" title="Hide navigation">${icon('chevron-left')}</button></div>
  </aside>
  <nav class="phone-dock" aria-label="Primary">${dockLinks(true)}</nav>
  <div class="main-shell">
   <header class="topbar">
    <button type="button" class="icon-button dock-header-toggle" data-action="dock-toggle" aria-controls="navigation-dock" aria-label="Show navigation" title="Show navigation">${icon('menu')}</button>
    <div class="workspace-brand"><a href="#overview" class="topbar-brand" aria-label="CRYPTOZ Home"><span class="phone-brand" aria-hidden="true">${brandMark}</span>CRYPTOZ</a><span class="workspace-divider" aria-hidden="true">/</span><span id="workspace-location">Overview</span></div>
    <button type="button" class="search-trigger" data-action="search" aria-label="Search coins and instruments">${icon('search')}<span>Search coins</span><kbd aria-hidden="true">/</kbd></button>
    <div class="top-actions">
     <button type="button" class="icon-button appearance-button" data-action="appearance" aria-label="Appearance settings" title="Theme and motion">${icon('settings-2')}</button>
     <button type="button" class="icon-button" title="Refresh data" aria-label="Refresh data" data-action="refresh">${icon('refresh-cw')}</button>
     <a href="#workspace?section=alerts" class="icon-button" aria-label="Price alerts" title="Price alerts">${icon('bell')}<span id="alert-count" aria-hidden="true"></span></a>
    </div>
   </header>
   <div id="context-root"></div>
   <div id="connection-notice" role="status" aria-live="polite" hidden></div>
   <main id="main" tabindex="-1"></main>
   <footer class="footer"><span>CRYPTOZ</span><span><a href="https://coinpaprika.com/" target="_blank" rel="noopener noreferrer">Powered by Coinpaprika</a> · <a href="/legal/notices.txt" target="_blank" rel="noopener noreferrer">Licenses</a></span></footer>
  </div>`;
 setDock(dockMode);hydrate();
}

function syncNetworkState(){
 const relevant=page==='overview'?['global','sentiment','news']:isMarketPage()?[marketUniverse==='exchange'?'exchange':'markets']:page==='news'?['news']:page==='workspace'||page==='terminal'?['markets']:page==='studio'?[studioViewName==='defi'?'chains':'markets']:[];const offline=navigator.onLine===false,failed=relevant.some(key=>errors[key]),busy=manualRefreshing||relevant.some(key=>dataLoader.pendingKeys.includes(key));
 document.body.classList.toggle('refreshing',busy);const notice=$('#connection-notice');if(notice){const message=offline?'Internet unavailable. Displayed data may be stale.':operationError?operationError:failed?'Some market data is delayed. Last available values are retained.':busy?'Updating market data…':'';notice.hidden=!message;notice.dataset.state=busy&&!offline&&!failed&&!operationError?'loading':'notice';if(notice.dataset.message!==message){notice.dataset.message=message;notice.innerHTML=message?`<span>${esc(message)}</span>${operationError?'<button class="text-link" data-action="retry-view">Retry view</button>':failed?'<button class="text-link" data-action="refresh">Retry</button>':''}`:'';}notice.classList.toggle('warn',offline||failed||!!operationError);}
 for(const button of document.querySelectorAll('[data-action="refresh"]')){button.disabled=manualRefreshing;button.setAttribute('aria-busy',String(manualRefreshing));}
}
function updateCurrentData(key){
 if(key==='exchange'&&data.exchange)marketStream?.setSnapshots(data.exchange.data,{stale:data.exchange.cache==='stale'});
 loading=dataLoader.busy;syncNetworkState();
 if(page==='overview'){
  if(['global','sentiment'].includes(key)&&$('#home-totals'))$('#home-totals').innerHTML=marketStats();
  if(key==='markets'){if($('#home-breadth'))$('#home-breadth').innerHTML=breadthContent();if($('#home-brief'))$('#home-brief').innerHTML=marketBrief(data.markets?.data??[],workspace.watchlist);}
  if(key==='news'){renderNewsResults();if($('#home-news-meta'))$('#home-news-meta').innerHTML=stateBadge('news');}
 }else if(isMarketPage()&&key===(marketUniverse==='exchange'?'exchange':'markets'))renderMarketResults();
 else if(page==='news'&&key==='news')renderNewsResults();
 else if(page==='workspace'&&key==='markets')updateWorkspacePrices();
 else if(page==='terminal'&&key==='markets')updateWatchPanel();
 else if(page==='studio'&&(key==='markets'&&['map','momentum'].includes(studioViewName)||key==='chains'&&studioViewName==='defi'))studioView(studioViewName,pageGeneration,true);
 hydrate();
}
async function fetchData(keys=['markets','global','sentiment','news']){const task=dataLoader.load(keys);loading=dataLoader.busy;syncNetworkState();await task;loading=dataLoader.busy;syncNetworkState();}
async function refreshCurrent(){
 if(manualRefreshing)return;manualRefreshing=true;operationError='';syncNetworkState();
 try{await refreshPage({page:page==='screener'?'markets':page,universe:marketUniverse,terminal,comparison,learning,practice,insights:insightsView,loadData:keys=>fetchData(page==='markets'?[...keys,'exchange']:keys),refreshBenchmark:()=>loadBenchmark(pageGeneration),refreshStudio:()=>studioView(studioViewName,pageGeneration,true)});}catch(error){operationError='Refresh failed. Retry when the connection is available.';toast(error.message);}finally{manualRefreshing=false;syncNetworkState();}
}

const instrumentLoads=new Map();
async function loadInstruments(venues=['binance','coinbase']){
 await Promise.allSettled(venues.map(venue=>{
  if(instrumentLoads.has(venue))return instrumentLoads.get(venue);
  const job=loadVenueInstruments(venue);
  instrumentLoads.set(venue,job);
  return job;
 }));
}
async function loadVenueInstruments(venue){
 try{
  instruments[venue]=(await api('instruments?venue='+venue)).data;
  delete errors['instruments-'+venue];
  if(venue==='binance')marketStream?.setRegistry(instruments.binance);
 }catch(error){errors['instruments-'+venue]=error.message;}
 finally{instrumentLoads.delete(venue);}
 if(page==='terminal')updateInstrumentOptions();
 if(page==='compare')comparison?.updateInstruments();
 learning?.updateInstruments();
 practice?.options();
}

function cleanPage(){benchmarkObserver?.disconnect();benchmarkObserver=null;benchmarkTask?.controller.abort();benchmarkTask=null;calculatorRequest?.abort();calculatorRequest=null;practice?.dispose();practice=null;insightsView?.dispose();insightsView=null;resetForecast();riskCalculator?.dispose();riskCalculator=null;clearTimeout(marketSearchTimer);marketCatalogSearch.cancel();document.body.classList.remove('chart-focus');learning?.dispose();learning=null;miniSeries=null;comparison?.dispose();comparison=null;terminal?.dispose();terminal=null;mini?.remove();mini=null;for(const v of visuals)v.dispose();visuals=[];}

function route(){
 const animate=pageGeneration>0;
 const oldNav=navigationFor(page);
 const previousPhoneSelection=phoneView.matches?$('.phone-dock .active .phone-selection')?.getBoundingClientRect():null;
 closeModal({restoreFocus:false});
 operationError='';
 const next=resolveNavigation(location.hash);
 if(next.hash!==location.hash)history.replaceState(null,'',next.hash);
 page=next.route;
 if(page==='markets')marketGroup='all';
 marketPage=0;
 renderPage();
 window.scrollTo({top:0,behavior:'instant'});
 $('.main-shell')?.scrollTo({top:0,behavior:'instant'});
 const params=new URLSearchParams(location.hash.split('?')[1]??'');
 const target=page==='workspace'&&params.get('section')==='alerts'?$('#workspace-alerts h2'):
  page==='terminal'&&params.get('focus')==='analysis'?$('[role="tab"][aria-selected="true"]'):null;
 if(target){
  if(!target.hasAttribute('tabindex'))target.tabIndex=-1;
  target.focus({preventScroll:true});
  target.scrollIntoView({block:'start',behavior:'instant'});
 }else $('#main').focus({preventScroll:true});
 if(animate){
  const navigation=navigationFor(page);
  const sameGroup=oldNav.group===navigation.group;
  const direction=sameGroup?Math.sign(navigation.items.indexOf(navigation.current)-navigation.items.indexOf(oldNav.current)):0;
  reveal($('#main > .era-dashboard')??$('#main'),{direction,offset:direction?2:7});
  reveal($('#context-root .context-nav'),{direction,offset:2,duration:230});
  if(!sameGroup&&phoneView.matches)moveSelection(previousPhoneSelection,$('.phone-dock .active .phone-selection'));
 }
}
function renderPage(){
 cleanPage();
 pageGeneration++;
 const navigation=navigationFor(page);
 $('#workspace-location').textContent=navigation.current.label;
 document.body.dataset.page=page;
 for(const link of document.querySelectorAll('.sidebar [data-group],.phone-dock [data-group]')){
  const active=link.dataset.group===navigation.group;
  link.classList.toggle('active',active);
  if(active)link.setAttribute('aria-current',navigation.primaryCurrent);
  else link.removeAttribute('aria-current');
 }
 $('#context-root').innerHTML=secondaryNav(navigation);
 ({overview:renderOverview,markets:renderMarkets,screener:renderMarkets,terminal:renderTerminal,compare:renderComparison,studio:renderStudio,learn:renderLearning,news:renderNews,analysts:renderAnalystDesk,practice:renderPractice,replay:renderPractice,backtest:renderPractice,risk:renderRisk,'market-insights':renderInsights,workspace:renderWorkspace}[page])();hydrate();updateAlertCount();patchLiveQuotes();syncNetworkState();if(document.activeElement===document.body)$('#main').focus({preventScroll:true});
}

function liveStrip(){return `<section class="live-strip" aria-label="Live Binance prices"><div class="live-strip-label"><strong>Live prices</strong><small class="live-status" data-live-status>Connecting to Binance</small></div><div class="live-quote-track">${BENCHMARK_ASSETS.map(b=>`<button class="live-quote" data-action="live-chart" data-symbol="${b}USDT" data-live-chip="${b}USDT" aria-label="Open ${b} spot chart"><span>${b}</span><strong>—</strong><small>Awaiting quote</small></button>`).join('')}</div></section>`;}
let liveMarketView,marketMoversView,spotFallbackTimer=null,lastSpotAttempt=0;
function patchLiveStatus(status){liveMarketView?.status(status);marketMoversView?.refresh();}
function patchLiveQuotes(batch){
 if(batch){liveMarketView?.patch(batch);marketMoversView?.refresh();return;}
 const visible=page==='overview'||page==='markets'||isMarketPage()&&marketUniverse==='exchange';
 marketStream?.setActive(visible);
 liveMarketView?.sync();
 marketMoversView?.mount($('#market-movers'));
 marketMoversView?.refresh();
 if(visible&&spotFallbackTimer===null&&Date.now()-lastSpotAttempt>=35000){
  spotFallbackTimer=setTimeout(()=>{spotFallbackTimer=null;refreshSpotSnapshot();},2500);
 }
}
function appearanceModal(){
 modal('Appearance',`<div class="appearance-options"><label>Color theme<select id="appearance-theme"><option value="dark">Dark</option><option value="light">Light</option></select></label><label>Surfaces<select id="appearance-material"><option value="glass">Glass</option><option value="system">Follow device preference</option><option value="solid">Solid</option></select></label><label>Interface motion<select id="appearance-motion"><option value="auto">Follow device preference</option><option value="reduced">Reduce motion</option></select></label><label>Price display<select id="display-currency"><option value="USD">USD · US dollar</option><option value="INR">INR · Indian rupee</option></select></label><p class="data-note" id="display-currency-status">${esc(displayCurrencyStatus())}</p><p class="data-note">Chart display uses the latest reference rate for the whole view. Orders, inputs and raw exports use the exchange quote.</p></div>`);
 $('#appearance-theme').value=appearance.theme;$('#appearance-motion').value=appearance.motion;$('#appearance-material').value=materialMode;
 $('#display-currency').value=currency.selected;
 $('#display-currency').addEventListener('change',event=>{
  currency.set(event.target.value);
  try{storage.setItem(DISPLAY_CURRENCY_KEY,currency.selected);}catch{}
  syncDisplayCurrency();refreshFx();
 });
 $('#appearance-material').addEventListener('change',()=>{materialMode=$('#appearance-material').value;applyMaterial();try{storage.setItem('cryptoz.material.v1',materialMode);}catch{}});
 const update=()=>{const previousTheme=appearance.theme;appearance=applyAppearance({theme:$('#appearance-theme').value,motion:$('#appearance-motion').value},storage);if(appearance.theme===previousTheme)return;if(terminal?.bars.length)terminal.build();comparison?.applyTheme();learning?.applyTheme();if(mini){mini.applyOptions(chartOptions());miniSeries?.applyOptions({lineColor:palette().accent,topColor:palette().accent+'30',bottomColor:palette().accent+'00'});}if(page==='studio')studioView(studioViewName,pageGeneration,true);};
 $('#appearance-theme').addEventListener('change',update);$('#appearance-motion').addEventListener('change',update);
}

let currencySignature='';
const fxNextAttempt=new Map();
function syncDisplayCurrency(){
 const status=$('#display-currency-status'),label=displayCurrencyStatus();
 if(status&&status.textContent!==label)status.textContent=label;
 const signature=[currency.selected,...Object.keys(RATES).map(pair=>currency.current(pair)?.rate??'')].join(':');
 if(signature===currencySignature)return;
 currencySignature=signature;
 document.documentElement.dataset.displayCurrency=currency.selected;
 document.documentElement.dataset.currencyRevision=signature;
 refreshMoney(document);
 patchLiveQuotes();
 terminal?.applyCurrency();
 learning?.applyCurrency?.();
 if(page==='studio')studioView(studioViewName,pageGeneration,true);
 if(terminal?.focusedSignal)terminal.onSignalFocus?.(terminal.focusedSignal);
 if(miniSeries)miniSeries.applyOptions({priceFormat:axisPriceFormat(2,'USDT')});
}
function refreshFx(){
 syncDisplayCurrency();
 if(document.hidden||navigator.onLine===false)return;
 const now=Date.now(),pairs=currency.selected==='INR'?['USD-INR','USDT-USD']:['USDT-USD'];
 for(const pair of pairs){
  if((fxNextAttempt.get(pair)??0)>now)continue;
  fxNextAttempt.set(pair,now+RATES[pair].refresh);
  api('fx?pair='+pair).then(result=>{
   if(result.data?.pair===pair&&currency.accept(pair,result.data))syncDisplayCurrency();
   else fxNextAttempt.set(pair,Date.now()+60_000);
  }).catch(()=>{fxNextAttempt.set(pair,Date.now()+60_000);});
 }
}

function renderLearning(){$('#main').innerHTML=header('Learn crypto','Build the basics, read a live chart and test what you know.')+'<div id="learning-root"></div>';learning=mountLearningHub($('#learning-root'),{instruments,hydrate,storage,progress:learningProgress,initialView:new URLSearchParams(location.hash.split('?')[1]??'').get('view')??'start',onViewChange:view=>history.replaceState(null,'','#learn'+(view==='start'?'':'?view='+view)),onChart:i=>{selected=i;location.hash='terminal';}});}

function newsToolbar(){return `<div class="news-toolbar"><div class="tabs" aria-label="News topics">${['all','MARKETS','POLICY','MACRO','SECURITY','ECOSYSTEM'].map(n=>`<button class="tab ${newsTopic===n?'active':''}" data-action="news-topic" data-topic="${n}" aria-pressed="${newsTopic===n}">${n==='all'?'Latest':n[0]+n.slice(1).toLowerCase()}</button>`).join('')}</div><label class="search-field">${icon('search')}<input id="news-search" aria-label="Search news" placeholder="Search headlines" value="${esc(newsQuery)}"></label></div>`;}

function bindNewsSearch(){const field=$('#news-search');if(field)field.addEventListener('input',e=>{newsQuery=e.target.value;newsLimit=20;renderNewsResults();});}
function marketStats(){const g=data.global?.data,s=data.sentiment?.data;return `<div class="stats-grid"><article class="stat-card"><span>Market cap ${icon('globe')}</span><div>${g?moneyMarkup(g.marketCap,'USD','compact'):'—'}</div><p class="${tone(g?.change)}">${pct(g?.change)} <small>24h</small></p><small class="basic-only stat-explain">Total value of tracked coins</small>${stateBadge('global')}</article><article class="stat-card"><span>Trading volume ${icon('chart-no-axes-combined')}</span><div>${g?moneyMarkup(g.volume,'USD','compact'):'—'}</div><p class="muted">24-hour volume</p><small class="basic-only stat-explain">Value traded across venues</small>${stateBadge('global')}</article><article class="stat-card"><span>Bitcoin dominance ${icon('layers')}</span><div>${g?num(g.btcDominance)+'<small>%</small>':'—'}</div><div class="dominance-track"><span style="width:${g?.btcDominance??0}%"></span></div><small class="basic-only stat-explain">BTC’s share of total crypto cap</small>${stateBadge('global')}</article><article class="stat-card"><span>Fear & Greed ${icon('activity')}</span><div>${s?num(s.value,0)+'<small>/ 100</small>':'—'}</div><p>${s?esc(s.label):'Awaiting index'}</p><small class="basic-only stat-explain">0 = extreme fear · 100 = greed</small>${stateBadge('sentiment')}</article></div>`;}
function breadthContent(){return renderMarketBreadth(data.markets?.data)+stateBadge('markets')+'<a href="#studio" class="button full">Market maps '+icon('arrow-right')+'</a>';}
function renderAnalystDesk(){
 const key=new URLSearchParams(location.hash.split('?')[1]??'').get('asset')||analystAssetKey(selected)||'btc-bitcoin';
 const asset=(data.markets?.data??[]).find(a=>a.id===key)??assetLookup.get(key);
 const options=ANALYST_ASSETS.map(a=>`<option value="${esc(a.id)}">${esc(a.name)} · ${esc(a.symbol)}</option>`).join('');
 const uncovered=ANALYST_ASSETS.some(a=>a.id===key)?'':`<option value="${esc(key)}">${esc(asset?.name??key)}</option>`;
 $('#main').innerHTML=header('Analyst research','Read original, dated opinions and the evidence behind each view.')+`<div class="panel analyst-picker"><label>Asset <select id="analyst-asset">${uncovered}${options}</select></label><button class="button" data-action="search">${icon('search')} Find another asset</button></div><div id="analyst-review"></div>`;
 const field=$('#analyst-asset');field.value=key;
 const update=()=>{$('#analyst-review').innerHTML=analystPanel(field.value===key&&asset?asset:field.value);hydrate();};
 field.addEventListener('change',()=>{history.replaceState(null,'','#analysts?asset='+encodeURIComponent(field.value));update();});
 update();
}
function renderPractice(){
 const view={practice:'paper',replay:'replay',backtest:'strategy'}[page],labels={paper:['Paper trading','Practice with virtual balances and fresh venue quotes.'],replay:['Market replay','Step through completed exchange candles and make decisions as each bar appears.'],strategy:['Strategy lab','Test fixed rules on historical candles with fees and next-open execution.']};
 const [title,description]=labels[view];
 const basicTip=view==='paper'?'Virtual funds only — no real money or exchange account is connected. Fills include a 0.10% fee and 0.05% slippage.':view==='replay'?'Advance one candle at a time to practice decisions without seeing future prices.':'Tests run strictly on completed closes with fills at the next candle open to avoid look-ahead bias.';
 $('#main').innerHTML=header(title,description)+`<div class="guided-hint basic-only"><p><strong>Beginner note:</strong> ${esc(basicTip)}</p></div><section class="panel practice-card" id="practice-root"></section>`;
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
function basicStartStrip(){
 const steps=[
  ['1','Check market mood','See live BTC/ETH prices, dominance and Fear & Greed above.','#markets'],
  ['2','Read a guided chart','Open plain-English trend, range and indicator explanations.','#terminal'],
  ['3','Practice risk-free','Learn foundations and test ideas with virtual paper funds.','#learn']
 ];
 return `<nav class="basic-guide-strip basic-only" aria-label="Beginner start path">${steps.map(([step,title,detail,href])=>`<a href="${href}"><span class="basic-step-num" aria-hidden="true">${step}</span><span><strong>${title}</strong><small>${detail}</small></span>${icon('arrow-up-right')}</a>`).join('')}</nav>`;
}
function renderOverview(){
 const tabs=`<div class="home-news-tabs" role="group" aria-label="Home news topics">${[['all','Latest'],['MARKETS','Markets'],['MACRO','Macro'],['POLICY','Policy']].map(([key,label])=>`<button type="button" data-action="home-news-tab" data-topic="${key}" aria-pressed="${homeNewsTopic===key}">${label}</button>`).join('')}</div>`;
 const news=`<section class="panel dashboard-news wb-news"><div class="panel-top"><div><h2>Market news</h2><span class="source">Crypto, policy and macro headlines</span></div><a href="#news" class="text-link">All headlines ${icon('arrow-right')}</a></div>${tabs}<div id="news-results" class="news-reading-panel"></div><div class="panel-bottom" id="home-news-meta">${stateBadge('news')}</div></section>`;
 const ranges=`<div class="era-segment" role="group" aria-label="Bitcoin chart history">${[['24h','24H'],['7d','7D'],['30d','30D'],['1y','1Y']].map(([key,label])=>`<button data-action="benchmark-range" data-range="${key}" aria-pressed="${key===benchmarkRange}">${label}</button>`).join('')}</div>`;
 const benchmark=`<section class="panel feature-chart era-benchmark"><div class="panel-top"><h2>${coinMark('BTC')} Bitcoin <span>BTC / USDT</span></h2><a href="#terminal" data-action="default-chart" class="text-link">Full chart ${icon('arrow-up-right')}</a></div><div class="era-benchmark-tools"><div class="benchmark-quote"><strong id="benchmark-price">—</strong><span id="benchmark-change"></span></div>${ranges}</div><div id="benchmark-chart" class="benchmark-chart" aria-label="Bitcoin price history"></div><div class="panel-bottom" id="benchmark-source" role="status">Waiting for exchange candles…</div></section>`;
 const tools=`<div class="era-market-links" aria-label="More research"><a href="#market-insights">${icon('globe')} Market insights</a><a href="#screener">${icon('sliders-horizontal')} Asset screener</a><a href="#learn">${icon('book-open')} Learn crypto</a></div>`;
 const heroAction=`<div class="era-hero-controls">${deskSwitch(deskMode)}<a href="#markets" class="button primary">Explore markets</a></div>`;
 const heroSubtitle=deskMode==='basic'?'Start with live prices, guided charts and plain-English market context.':'Follow live prices, market movers and the headlines behind them.';
 benchmarkDisplayed=null;
 $('#main').innerHTML=`<div class="era-dashboard">${sectionHeading('Market overview',heroSubtitle,{glyph:headingIcons.overview,className:'era-hero',action:heroAction})}${liveStrip()}${basicStartStrip()}<div id="home-totals">${marketStats()}</div><div class="era-market-grid">${benchmark}<div class="era-market-side"><section class="panel home-breadth" id="home-breadth">${breadthContent()}</section><section id="home-brief" class="panel market-feature">${marketBrief(data.markets?.data??[],workspace.watchlist)}</section></div></div>${dashboardShortcuts()}${news}${tools}</div>`;
 placeHomeChart();renderNewsResults();observeBenchmark(pageGeneration);
}

function placeHomeChart(){
 const chart=$('.era-benchmark');
 if(phoneView.matches)$('#home-totals').before(chart);
 else $('.era-market-grid').prepend(chart);
}

function observeBenchmark(gen){
 const host=$('#benchmark-chart');if(!host)return;
 if(typeof IntersectionObserver!=='function'){loadBenchmark(gen);return;}
 const observer=new IntersectionObserver(entries=>{
  if(!entries.some(entry=>entry.isIntersecting))return;
  observer.disconnect();
  if(benchmarkObserver===observer){benchmarkObserver=null;loadBenchmark(gen);}
 },{rootMargin:'320px 0px'});
 benchmarkObserver=observer;observer.observe(host);
}
async function loadBenchmark(gen){
 if(gen!==pageGeneration||page!=='overview')return;
 const range=benchmarkRange, interval=BENCHMARK_RANGES[range].interval;
 if(benchmarkTask?.generation===gen&&benchmarkTask.range===range)return benchmarkTask.promise;
 benchmarkTask?.controller.abort();benchmarkObserver?.disconnect();benchmarkObserver=null;
 const task={generation:gen,range,controller:new AbortController()};
 const active=()=>benchmarkTask===task&&pageGeneration===gen&&!task.controller.signal.aborted;
 benchmarkTask=task;
 task.promise=(async()=>{
  try{
   const r=await api('candles?venue=binance&symbol=BTCUSDT&interval='+interval,{signal:task.controller.signal});
   if(!active())return;
   const {bars,change}=benchmarkWindow(r.data?.bars,range);
   if(!bars.length)throw Error('No candles returned by the exchange.');
   const {createChart,AreaSeries}=await import('lightweight-charts');
   if(!active())return;
   if(!mini){
    const host=$('#benchmark-chart');host.textContent='';
    mini=createChart(host,{autoSize:true,...chartOptions(),layout:{...chartOptions().layout,fontSize:11,attributionLogo:true},grid:{vertLines:{visible:false},horzLines:{color:palette().grid}},rightPriceScale:{borderVisible:false},timeScale:{borderVisible:false,timeVisible:interval!=='1d',fixLeftEdge:true,fixRightEdge:true,minBarSpacing:.18}});
    miniSeries=mini.addSeries(AreaSeries,{lineColor:palette().accent,topColor:palette().accent+'43',bottomColor:palette().accent+'00',lineWidth:2,priceLineVisible:false,lastValueVisible:false,priceFormat:axisPriceFormat(pricePrecision(bars.at(-1).close),'USDT')});
   }
   mini.timeScale().applyOptions({timeVisible:interval!=='1d'});
   miniSeries.setData(bars.map(b=>({time:b.time,value:b.close})));
   if(benchmarkDisplayed!==range)mini.timeScale().fitContent();
   benchmarkDisplayed=range;
   setMoneyText($('#benchmark-price'),bars.at(-1).close,'USDT');
   $('#benchmark-change').innerHTML=Number.isFinite(change)?`<span class="${tone(change)}">${pct(change)}</span><small>24h change</small>`:'';
   $('#benchmark-source').textContent=`Binance · ${range.toUpperCase()} · ${bars.length} × ${interval} candles · ${r.cache==='stale'?'Cached · ':''}${stamp(r.fetchedAt)}`;patchLiveQuotes();
  }catch(error){
   if(active()){
    if(!mini)$('#benchmark-chart').innerHTML=empty('Chart unavailable',error.message);
    $('#benchmark-source').textContent='History unavailable for '+range.toUpperCase()+'. Select a range to retry.';
   }
  }finally{if(benchmarkTask===task)benchmarkTask=null;}
 })();
 return task.promise;
}

function marketTable(assets,venue=false){return `<div class="table-scroll"><table class="market-table"><thead><tr><th class="col-watch"><span class="sr-only">Watchlist</span></th><th>Asset</th><th>Price</th><th class="col-change">24h</th>${venue?'':'<th class="col-cap">Market cap</th>'}<th class="col-volume">24h volume</th><th class="col-action"></th></tr></thead><tbody>${assets.map(a=>`<tr ${venue?'data-live-row="'+esc(a.id)+'"':''}><td class="col-watch"><button class="star-button ${workspace.watchlist.includes(a.id)?'selected':''}" data-action="watch" data-id="${esc(a.id)}" aria-label="${workspace.watchlist.includes(a.id)?'Remove':'Add'} ${esc(a.symbol)} ${workspace.watchlist.includes(a.id)?'from':'to'} watchlist" aria-pressed="${workspace.watchlist.includes(a.id)}">${icon('star')}</button></td><td><button class="asset-name" data-action="${venue?'exchange-chart':'asset-chart'}" data-id="${esc(a.id)}">${coinMark(a.symbol)}<span><strong>${esc(venue?a.symbol:a.name)}</strong><small>${esc(venue?a.name:a.symbol)}${a.rank?' · #'+a.rank:''}</small></span></button></td><td class="mono"><span class="price-value" ${venue?'data-live-price':''}>${moneyMarkup(a.price,venue?'USDT':'USD')}</span><small class="col-time" ${venue?'data-live-time':''} title="${esc(stamp(a.updatedAt))}">${ago(a.updatedAt)}</small></td><td class="col-change ${tone(a.change)} mono" ${venue?'data-live-change':''}>${pct(a.change)}</td>${venue?'':`<td class="mono col-cap">${moneyMarkup(a.marketCap,'USD','compact')}</td>`}<td class="mono col-volume" ${venue?'data-live-volume':''}>${moneyMarkup(a.volume,venue?'USDT':'USD','compact')}</td><td class="col-action"><button class="icon-button" data-action="${venue?'exchange-chart':'asset-chart'}" data-id="${esc(a.id)}" aria-label="Chart ${esc(a.symbol)}">${icon('arrow-up-right')}</button></td></tr>`).join('')}</tbody></table></div>`;}

function isMarketPage(){return page==='markets'||page==='screener';}

function marketMoversSection(){
 return '<button type="button" class="phone-movers-toggle button" data-action="phone-movers" aria-controls="market-movers" aria-expanded="'+phoneMoversOpen+'">24h movers '+icon('chevron-down')+'</button>'+
  marketMoversPanel({phoneOpen:phoneMoversOpen});
}

function renderMarkets(){
 const screening=page==='screener';

 $('#main').innerHTML=header(screening?'Asset screener':'Markets',screening?'Filter by size, trading volume and price movement.':'Search for a coin or check the biggest 24-hour moves.',`<div class="hero-actions"><button class="button pro-only" data-action="export-markets">${icon('download')} Export results</button></div>`)+`<div class="guided-hint basic-only"><p><strong>Tip:</strong> Asset directory shows combined USD estimates across exchanges. Binance spot shows live USDT exchange pairs.</p></div>${screening?(marketUniverse==='aggregate'?'<div id="market-sector"></div>':'')+screenerControls(marketScreen,marketUniverse)+'<div id="market-groups"></div>':marketMoversSection()}<div class="panel"><div class="market-controls"><div class="tabs" role="group" aria-label="Market universe"><button type="button" class="tab ${marketUniverse==='aggregate'?'active':''}" data-action="universe" data-universe="aggregate" aria-pressed="${marketUniverse==='aggregate'}">Asset directory <span>USD</span></button><button type="button" class="tab ${marketUniverse==='exchange'?'active':''}" data-action="universe" data-universe="exchange" aria-pressed="${marketUniverse==='exchange'}">Binance spot <span>USDT</span></button></div><label class="search-field">${icon('search')}<input id="market-search" placeholder="Search name, symbol or asset ID" value="${esc(marketQuery)}" aria-label="Search markets"></label></div><div class="filter-row"><button class="chip ${onlyWatch?'selected':''}" data-action="toggle-watch">${icon('star')} Watchlist only</button><label class="sort-label">Sort by <select id="market-sort"><option value="rank">${marketUniverse==='exchange'?'Default liquidity':'Rank'}</option>${marketUniverse==='aggregate'?'<option value="marketCap">Market cap</option>':''}<option value="volume">24h volume</option><option value="gainers">Top gainers</option><option value="losers">Top losers</option></select></label><span id="market-source"></span>${marketUniverse==='exchange'?'<span class="live-status" data-live-status></span>':''}</div><div id="market-results" tabindex="-1"></div><div id="market-catalog"></div><div id="market-pagination" class="pagination"></div></div><p class="data-note">Directory prices are aggregate USD snapshots. Binance prices use USDT; live rows show their update time. Sorting updates on refresh or filter change.</p>`;

 $('#market-sort').value=marketSort;for(const field of document.querySelectorAll('[data-screen]'))field.addEventListener('change',()=>{const key=field.dataset.screen;marketScreen={...marketScreen,[key]:key==='volume'?Number(field.value):field.value};marketPage=0;renderMarketResults();});$('#market-search').addEventListener('input',e=>{marketQuery=e.target.value;marketPage=0;queueMarketSearch();renderMarketResults();});$('#market-sort').addEventListener('change',e=>{marketSort=e.target.value;marketPage=0;renderMarketResults();});queueMarketSearch();renderMarketResults();if((!screening||marketUniverse==='exchange')&&!data.exchange)refreshSpotSnapshot();

}

let marketSectorFocus=false;
function filteredMarkets(){let list=[...(marketUniverse==='exchange'?(data.exchange?.data??[]).map(a=>{const q=marketStream?.observation(a.id)?.quote;return q?{...a,...q,id:a.id,symbol:a.symbol}:a;}):data.markets?.data??[])].filter(a=>(!onlyWatch||workspace.watchlist.includes(a.id))&&matchesAsset(a,marketQuery));if(page==='screener')list=screenMarket(list,marketScreen,marketUniverse);if(['gainers','losers','volume'].includes(marketGroup))return filterMarketGroup(list,marketGroup,marketUniverse);if(marketSort==='marketCap')list.sort((a,b)=>(b.marketCap??0)-(a.marketCap??0));if(marketSort==='volume'||marketUniverse==='exchange'&&marketSort==='rank')list.sort((a,b)=>b.volume-a.volume);if(marketSort==='gainers')list.sort((a,b)=>(b.change??-Infinity)-(a.change??-Infinity));if(marketSort==='losers')list .sort((a,b)=>(a.change??Infinity)-(b.change??Infinity));return filterMarketGroup(list,marketGroup,marketUniverse);}

function renderMarketResults(){const key=marketUniverse==='exchange'?'exchange':'markets';const list=filteredMarkets(),size=phoneView.matches?phoneMarketRows:desktopMarketRows,pages=Math.max(1,Math.ceil(list.length/size));marketPage=Math.min(marketPage,pages-1);const rows=list.slice(marketPage*size,marketPage*size+size);if($('#market-sector'))$('#market-sector').innerHTML=sectorPulse(data.markets?.data??[],marketGroup);if($('#market-groups'))$('#market-groups').innerHTML=renderMarketGroups({assets:data[key]?.data,group:marketGroup,mode:deskMode,universe:marketUniverse});$('#market-results').innerHTML=list.length?(phoneView.matches?renderMarketCards(rows,{universe:marketUniverse,watchlist:workspace.watchlist}):marketTable(rows,marketUniverse==='exchange')):data[key]?empty('No assets match your filters','Try a name, ticker or a different universe.'):errorOrLoading(key);$('#market-source').innerHTML=stateBadge(key);$('#market-pagination').innerHTML=`<span>${num(list.length,0)} results · Page ${marketPage+1} of ${pages}</span><div><button class="icon-button" data-action="prev-page" aria-label="Previous page" ${marketPage===0?'disabled':''}>${icon('chevron-left')}</button><button class="icon-button" data-action="next-page" aria-label="Next page" ${marketPage>=pages-1?'disabled':''}>${icon('chevron-right')}</button></div>`;renderMarketCatalog();hydrate();patchLiveQuotes();}

function queueMarketSearch(){clearTimeout(marketSearchTimer);marketCatalogSearch.cancel();marketRemoteAssets=[];marketRemoteError='';marketRemoteLoading=!onlyWatch&&marketGroup==='all'&&marketUniverse==='aggregate'&&normalizeSearch(marketQuery).length>=2;if(marketRemoteLoading)marketSearchTimer=setTimeout(()=>marketCatalogSearch.run(marketQuery),350);}
function renderMarketCatalog(){const host=$('#market-catalog');if(!host)return;if(onlyWatch||marketGroup!=='all'||marketUniverse!=='aggregate'||normalizeSearch(marketQuery).length<2){host.innerHTML='';return;}const shown=new Set(filteredMarkets().map(assetIdentity)),items=rankAssets(marketRemoteAssets.filter(a=>!shown.has(assetIdentity(a))),marketQuery,12);host.innerHTML=`<div class="catalog-results"><h3>Broader asset catalog</h3><p class="source">${marketRemoteLoading?'Searching…':marketRemoteError?'Catalog unavailable. Loaded prices remain above.':'Catalog identities beyond the current price list. Open an asset to check available prices and charts.'}</p>${items.map(a=>`<button class="command-row" data-action="asset-chart" data-id="${esc(a.id)}">${coinMark(a.symbol)}<span><strong>${esc(a.name)} <small>${esc(a.symbol)}</small></strong><small>${esc(a.id)}</small></span>${icon('arrow-up-right')}</button>`).join('')}</div>`;}

function capturePreferences(){if(!terminal)return;workspace.preferences=normalizePreferences({...workspace.preferences,lastInstrument:selected,interval:selectedInterval,view:terminal.viewPreset,style:terminal.style,period:terminal.period,smaPeriods:terminal.smaPeriods,rsiPeriod:terminal.rsiPeriod,oscillator:terminal.oscillator,indicators:terminal.indicators,studyIds:terminal.studyIds,autoGuide:terminal.autoGuide,signalKinds:terminal.signalKinds,markers:terminal.markers});save();}

function refreshIndicatorStrip(){
 const legend=$('#indicator-strip .active-chain');if(!terminal||!legend)return;
 const active=terminal.activeStudies(),results=(terminal.chart?terminal.studyView?.results:null)??[];
 const colors=palette();
 const groups=[['overlay','On price'],['pane','Below price']].map(([placement,title])=>({title,ids:active.filter(id=>STUDIES[id].placement===placement)}));
 const label=groups.filter(group=>group.ids.length).map(group=>`${group.ids.length} ${group.title.toLowerCase()}`).join(' · ')||'Price only';
 if(legend.textContent!==label)legend.textContent=label;
 const wrap=$('.wb-study-legend');
 wrap.hidden=!active.length;
 const lines=wrap.querySelector('.wb-study-lines');
 const content=groups.filter(group=>group.ids.length).map(({title,ids})=>`<div><strong>${title}</strong><ul>${ids.flatMap(id=>{
  const result=results.find(item=>item.id===id);
  const plots=result?.series??[];
  if(['ema','sma'].includes(id)&&plots.length)return plots.map(plot=>`<li><span class="study-swatch" style="--swatch:${colors[plot.color]}"></span>${esc(plot.title)}${Number.isFinite(plot.values.at(-1))?'':' · Awaiting history'}</li>`);
  const swatchColor=plots[0]?.color?colors[plots[0].color]:result?.levels?.[0]?.color?colors[result.levels[0].color]:colors.accent;
  return [`<li><span class="study-swatch" style="--swatch:${swatchColor}"></span>${esc(STUDIES[id].label)}${result&&!result.ready?' · Awaiting data':''}</li>`];
 }).join('')}</ul></div>`).join('');
 if(lines.dataset.content!==content){lines.dataset.content=content;lines.innerHTML=content;}
}
function updateChartWindow(info){
 const el=$('#chart-window-info'),status=$('#history-status');
 if(!el||!status)return;
 const state=info.historyStatus??'idle';
 const message=info.historyNotice||({loading:'Loading earlier candles…',end:'No earlier candles in this provider window.',limit:'History limit reached. Try a longer interval.',error:'History unavailable. Pan or zoom again to retry.',unavailable:'Chart history unavailable.'}[state]??(info.historyAnchor?'Historical view · Reset view returns to live.':info.total?'Scroll or pinch to zoom · Drag to see older candles':'Connecting to history…'));
 if(status.textContent!==message)status.textContent=message;
 const short=t=>new Date(t*1000).toLocaleDateString(undefined,{year:'2-digit',month:'short',day:'numeric',timeZone:'UTC'});
 const label=info.total?`${info.visible} / ${info.total} candles${info.start&&info.end?` · ${short(info.start)}–${short(info.end)} UTC`:''}`:state==='unavailable'?'History unavailable':'Loading history…';
 if(el.textContent!==label)el.textContent=label;
}
function setChartFocus(value){document.body.classList.toggle('chart-focus',value);const b=$('#focus-chart');if(b){b.innerHTML=icon(value?'minimize-2':'maximize-2')+(value?'<span class="phone-focus-caption">Done</span>':'');b.setAttribute('aria-label',value?'Exit chart focus':'Focus chart');b.setAttribute('aria-pressed',value);}hydrate();requestAnimationFrame(()=>terminal?.draw());}

function riskInstrument(){return ['practice','risk','replay','backtest'].includes(page)?(practiceSelected??selected):selected;}
function riskKey(){const i=riskInstrument();return i.venue+':'+i.symbol;}
function saveRiskDraft(){const form=$('#risk-form');if(form)drafts.setRisk(riskKey(),Object.fromEntries(new FormData(form)));}
function resetRisk(){const form=$('#risk-form');if(!form)return;const i=riskInstrument();if($('#risk-quote-label'))$('#risk-quote-label').textContent=i.quote;form.reset();if($('#risk-example-status'))$('#risk-example-status').textContent='Use sample prices to see how the numbers work.';for(const [key,value] of Object.entries(drafts.risk(riskKey())))if(form.elements[key])form.elements[key].value=value;$('#risk-result').textContent='Enter levels to estimate position size and fees for '+i.base+'/'+i.quote+'.';}

function renderComparison(){ $('#main').innerHTML=header('Compare','Compare price changes and risk over the same period.')+'<div id="comparison-root"></div>';comparison=mountComparison($('#comparison-root'),{instruments,hydrate});}

function layoutModal(){if(!terminal)return;modal('Saved chart layouts',`<p class="muted">Layouts save indicators, chart style, interval and instrument on this browser.</p><form id="layout-form"><label>Layout name<input name="name" required maxlength="60" placeholder="e.g. Momentum research"></label><button class="button primary" type="submit">Save current layout</button></form><div class="layout-list">${workspace.layouts.map(l=>`<div class="layout-row"><span><strong>${esc(l.name)}</strong><small>${esc(l.settings.lastInstrument.symbol)} · ${esc(l.settings.interval)} · ${esc(l.settings.style)}</small></span><button class="button" data-action="load-layout" data-id="${esc(l.id)}">Load</button><button class="icon-button" data-action="delete-layout" data-id="${esc(l.id)}" aria-label="Delete ${esc(l.name)} layout">${icon('trash-2')}</button></div>`).join('')||'<p class="muted">No named layouts yet. Current settings auto-save automatically.</p>'}</div>`);$('#layout-form').addEventListener('submit',e=>{e.preventDefault();if(workspace.layouts.length>=8){toast('Maximum 8 named layouts. Delete one to save another.');return;}capturePreferences();workspace.layouts.push({id:crypto.randomUUID(),name:new FormData(e.target).get('name').trim(),settings:structuredClone(workspace.preferences)});save();layoutModal();});}

const guideOptions=[
 ['none','None'],['range','Recent high and low'],['trend','Swing trend'],['fibonacci','Fibonacci levels'],
 ['zones','Support and resistance'],['profile','Volume by price'],['prev-day','Previous day'],['prev-week','Previous week'],['daily-pivots','Daily pivot levels'],['anchored-vwap','Anchored VWAP']
];
function autoControls(){
 const guide=normalizePreferences(workspace.preferences).autoGuide;
 return {
  menu:`<details class="chart-menu era-draw-menu" name="cryptoz-chart-tools"><summary>${icon('trending-up')} Drawings</summary><div class="chart-menu-body"><button type="button" data-action="manual-guide" aria-pressed="false">${icon('mouse-pointer-2')} Manual drawing</button><button type="button" data-action="drawings">${icon('layers')} Saved drawings</button><button type="button" data-action="suggest-studies">${icon('activity')} Suggest indicators</button></div></details>`,
  overlay:`<div class="overlay-controls"><label for="auto-overlay">${icon('layers')} Auto overlay</label><select id="auto-overlay">${guideOptions.map(([id,label])=>`<option value="${id}" ${id===guide?'selected':''}>${label}</option>`).join('')}</select><button type="button" class="text-link" data-action="inspect-overlay">View price levels ${icon('arrow-down')}</button></div>`
 };
}
function applyAutoGuide(id){
 if(!terminal||!AUTO_GUIDES.includes(id))return;
 terminal.manualDrawing=false;$('.drawing-tools').hidden=true;$('[data-action="manual-guide"]')?.setAttribute('aria-pressed','false');terminal.setTool('cursor');
 document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('selected',b.dataset.tool==='cursor'));
 terminal.setAutoGuide(id);capturePreferences();updateSummary();
}
const forecastLedger=createForecastLedger(storage);
let forecastRun=null,forecastView=null,forecastScope=null,settlePass=null,forecastHorizon=FORECAST_DEFAULT_HORIZON,activeBook=null;
function resetForecast(){
 forecastRun?.abort();forecastRun=null;forecastView=null;forecastScope=null;settlePass=null;
}
function forecastTarget(){return $('#forecast-result');}
function paintForecast(chart){
 const target=forecastTarget();if(!target)return;
 const rows=forecastLedger.list(chart.instrument,chart.interval).filter(row=>row.horizon===forecastHorizon);
 const opened=new Set([...target.querySelectorAll('details[open]')].map(node=>node.dataset.disclosure));
 target.innerHTML=(forecastView?forecastPanel(forecastView.result,{archive:Boolean(chart.historyAnchor),recorded:forecastView.recorded,superseded:!chart.historyAnchor&&forecastView.result.asOf<chart.completedCutoff(),mode:deskMode,quote:chart.instrument.quote}):'<p>Run a study to see the tested dates, sample size and baseline comparison.</p>')+forecastJournal(rows);
 target.querySelectorAll('details').forEach(node=>node.open=opened.has(node.dataset.disclosure));
}
function syncForecastScope(chart){
 const key=chart.generation+':'+chart.key;
 if(forecastScope!==key){resetForecast();forecastScope=key;paintForecast(chart);setForecastBusy(false);forecastProgress('');}
}
function acceptForecastResults(chart,through){
 if(!Number.isFinite(through)||chart.historyAnchor||chart.candleMeta?.cache==='stale')return;
 const key=[chart.generation,through,chart.studyBars.length,chart.studyBars[0]?.time].join(':');
 if(settlePass===key||!forecastLedger.list(chart.instrument,chart.interval).some(r=>!r.outcome&&r.targetCloseAt<=through))return;
 settlePass=key;const gen=chart.generation;
 forecastLedger.settle({bars:chart.studyBars,interval:chart.interval,instrument:chart.instrument,closedThrough:through}).then(result=>{
  if(terminal!==chart||chart.generation!==gen)return;
  if(!result.saved&&settlePass===key)settlePass=null;
  if(result.settled&&!forecastRun)paintForecast(chart);
 });
}
function setForecastBusy(busy){
 const run=$('[data-action="forecast-run"]'),cancel=$('#forecast-cancel');
 if(run)run.disabled=busy;
 if(cancel)cancel.hidden=!busy;
}
function forecastProgress(message){const node=$('#forecast-progress');if(node&&node.textContent!==message)node.textContent=message;}
function recommendedForecastCount(horizon){
 return Math.min(FORECAST_MAX_CANDLES,Math.max(800,forecastHistoryMinimum(horizon)+15*horizon));
}
function selectedForecastHistory(chart){
 return forecastHistoryChoice($('#forecast-history-mode').value,{
  count:$('#forecast-history-count').value,date:$('#forecast-history-date').value,latestCandle:chart.studyBars.at(-1)?.time
 });
}
async function runChartForecast(){
 const chart=terminal;if(!chart||forecastRun)return;
 const target=forecastTarget();
 if(!target||!chart.studyBars.length){if(target)forecastProgress('Wait for closed exchange candles or refresh the chart.');return;}
 const choice=selectedForecastHistory(chart);
 if(!choice){forecastProgress('Choose a valid candle count or a UTC date on or before the latest candle in this chart.');return;}
 const controller=new AbortController();forecastRun=controller;const gen=chart.generation,horizon=forecastHorizon,active=()=>terminal===chart&&chart.generation===gen&&forecastHorizon===horizon&&!controller.signal.aborted;
 const goal=choice.mode==='auto'?recommendedForecastCount(horizon):choice.maxCandles;
 const reached=()=>choice.mode==='date'?chart.studyBars[0]?.time<=choice.from:chart.studyBars.length>=goal;
 setForecastBusy(true);
 try{
  // Coinbase 4h requests are aggregated from hourly pages, so their pages can be smaller.
  for(let attempt=0;attempt<60&&!reached()&&active();attempt++){
   const before=chart.bars[0]?.time;
   forecastProgress(`Fetching earlier history · ${chart.studyBars.length.toLocaleString()} closed candles loaded…`);
   await chart.loadOlder({automatic:true,retry:attempt===0});
   if(chart.bars[0]?.time===before)break;
  }
  if(!active())return;
  const incompleteHistory=!reached()&&(choice.mode==='count'||choice.mode==='date'||chart.historyStatus==='error');
  forecastProgress('Running time-ordered tests against the baselines…');
  const asOf=chart.historyAnchor??Date.now()/1000,closedThrough=chart.completedCutoff(asOf);
  const result=await assessInWorker({bars:chart.studyBars,interval:chart.interval,instrument:chart.instrument,closedThrough,nowSeconds:asOf,horizon,
   from:choice.from,maxCandles:goal,singleHorizon:true,incompleteHistory,requiredWindowCount:choice.mode==='count'?goal:undefined,
   stale:!!chart.historyAnchor||chart.candleMeta?.cache==='stale'},controller.signal);
  if(!active())return;
  const recorded=result.forecast&&!chart.historyAnchor?await forecastLedger.record(result.forecast,undefined,{signal:controller.signal}):null;
  if(!active())return;
  forecastView={result,recorded};paintForecast(chart);forecastProgress('Study complete.');
 }catch(error){if(active())forecastProgress(error.message||'Unable to evaluate this market.');}
 finally{if(forecastRun===controller){forecastRun=null;setForecastBusy(false);}}
}
function bindForecastForm(){
 const form=$('#forecast-form'),horizon=$('#forecast-horizon'),mode=$('#forecast-history-mode'),date=$('#forecast-history-date');
 date.max=new Date().toISOString().slice(0,10);
 function updateFields(){
  const n=horizon.valueAsNumber;
  for(const button of form.querySelectorAll('[data-forecast-preset]'))button.setAttribute('aria-pressed',String(Number(button.dataset.forecastPreset)===n));
  for(const [kind,id] of [['custom','forecast-history-count'],['date','forecast-history-date']]){
   $('#'+id+'-field').hidden=mode.value!==kind;$('#'+id).disabled=mode.value!==kind;
  }
  const minimum=forecastHistoryMinimum(n);
  $('#forecast-horizon-note').textContent=minimum===null?'Choose a whole number from 1 to 48.':`About ${minimum.toLocaleString()} consecutive closes are needed for a full test at this horizon.`;
 }
 function changeStudy(){
  updateFields();forecastRun?.abort();forecastRun=null;forecastView=null;
  if(validForecastHorizon(horizon.valueAsNumber)){
   forecastHorizon=horizon.valueAsNumber;writeChartLocation();
  }
  setForecastBusy(false);forecastProgress('');if(terminal)paintForecast(terminal);
 }
 form.addEventListener('change',changeStudy);
 for(const button of form.querySelectorAll('[data-forecast-preset]'))button.addEventListener('click',()=>{
  horizon.value=button.dataset.forecastPreset;changeStudy();
 });
 form.addEventListener('submit',event=>{
  event.preventDefault();
  if(!validForecastHorizon(horizon.valueAsNumber))return;
  forecastHorizon=horizon.valueAsNumber;writeChartLocation();runChartForecast();
 });
 $('#forecast-cancel').addEventListener('click',()=>{
  forecastRun?.abort();forecastRun=null;setForecastBusy(false);forecastProgress('Study canceled.');
  $('[data-action="forecast-run"]')?.focus({preventScroll:true});
 });
 updateFields();
}
function exportForecastCases(){
 const rows=forecastView?.result?.evidence?.origins;if(!rows?.length||!terminal)return;
 const date=t=>new Date(t*1000).toISOString();
 download(`cryptoz-test-${terminal.instrument.venue}-${terminal.instrument.symbol}-${terminal.interval}-${forecastHorizon}bars.csv`,serializeCSV(['origin_close_utc','target_close_utc','training_labels_through_utc','horizon_bars','model_score_up','historical_rate_up','recent_rate_up','last_close_momentum','actual_higher','actual_return'],rows.map(r=>[date(r.asOf),date(r.targetCloseAt),date(r.trainedThrough),r.horizon??forecastHorizon,r.modelProbability,r.baselineProbability,r.recentBaselineProbability??'',r.momentumBaselineProbability??'',r.actualUp,r.actualReturn??''])),'text/csv');
}

function exportForecastJournal(){
 if(!terminal)return;
 const rows=forecastLedger.list(terminal.instrument,terminal.interval).filter(row=>row.horizon===forecastHorizon);
 if(!rows.length)return;
 const utc=time=>Number.isFinite(time)?new Date(time*1000).toISOString():'';
 download('cryptoz-recorded-forecasts.csv',serializeCSV(
  ['venue','symbol','interval','model','horizon_bars','sample_start_utc','origin_close_utc','issued_at_utc','target_close_utc','origin_price','score_up','historical_baseline_up','direction','settled_at_utc','actual_price','actual_direction'],
  rows.map(row=>[row.venue,row.symbol,row.interval,row.version,row.horizon,utc(row.sampleStart),utc(row.asOf),utc(row.issuedAt),utc(row.targetCloseAt),row.originClose,row.probabilityUp,row.baselineProbabilityUp,row.direction,utc(row.outcome?.settledAt),row.outcome?.close??'',row.outcome?.direction??''])
 ),'text/csv');
}

function activateChartPanel(value,{reflect=true}={}){
 const selectedPane=chartPanelFor(value);
 const previous=$('.wb-tabs [aria-selected=true]');
 const oldRect=previous?.querySelector('.selection-surface')?.getBoundingClientRect();
 document.querySelectorAll('[data-chart-pane]').forEach(el=>el.hidden=el.dataset.chartPane!==selectedPane);
 document.querySelectorAll('[data-action="chart-panel"]').forEach(el=>{
  el.setAttribute('aria-selected',String(el.dataset.pane===selectedPane));
  el.tabIndex=el.dataset.pane===selectedPane?0:-1;
 });
 if(selectedPane==='depth'){lastBookPaint=0;updateBook(activeBook);}
 if(previous?.dataset.pane!==selectedPane)moveSelection(oldRect,$('#wb-tab-'+selectedPane+' .selection-surface'));
 if(reflect)writeChartLocation(selectedPane);
}
function writeChartLocation(pane=$('[data-action="chart-panel"][aria-selected="true"]')?.dataset.pane){
 const params=new URLSearchParams(location.hash.split('?')[1]??'');
 if(!pane||pane==='reading')params.delete('panel');else params.set('panel',pane);
 if(forecastHorizon===FORECAST_DEFAULT_HORIZON)params.delete('horizon');else params.set('horizon',forecastHorizon);
 history.replaceState(null,'','#terminal'+(params.size?'?'+params:''));
}
function renderTerminal(){
 const params=new URLSearchParams(location.hash.split('?')[1]??'');
 const panel=chartPanelFor(params.get('panel'));
 forecastHorizon=normalizeForecastHorizon(params.get('horizon'));
 $('#main').innerHTML=chartWorkbench({interval:selectedInterval,forecastHorizon,panel,controls:autoControls()});
 placeChartLegend();
 activeBook=null;terminal=new TerminalChart({host:$('#price-chart'),phoneView,workspace,save,deskMode,onQuote:updateQuote,onSummary:updateSummary,onBook:updateBook,onStatus:updateStreamStatus,onWindow:updateChartWindow,onDrawings:()=>{if($('#drawings-count'))$('#drawings-count').textContent=(workspace.drawings[terminal?.key]??[]).length;}});
 terminal.onSignalFocus=event=>{
  const selection=$('#selected-signal');
  if(!selection)return;
  selection.hidden=!event;
  const date=event?new Date(event.confirmedAt*1000).toISOString().slice(0,16).replace('T',' '):'';
  const label=event?`Highlighted: ${event.label} · ${date} UTC · ${nativeAndDisplay(event.price,terminal.instrument.quote)}`:'';
  const status=selection.querySelector('[role="status"]');
  if(status.textContent!==label)status.textContent=label;
 };
 $('#venue').value=selected.venue;$('#chart-style').value=terminal.style;
 refreshIndicatorStrip();updateInstrumentOptions();terminal.load(selected,selectedInterval);
 bindForecastForm();
 $('.wb-tabs').addEventListener('keydown',e=>{
  const tab=e.target.closest('[role="tab"]');
  if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  const tabs=[...e.currentTarget.querySelectorAll('[role="tab"]')],current=tabs.indexOf(tab);
  const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(current+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  e.preventDefault();activateChartPanel(tabs[next].dataset.pane);tabs[next].focus();
 });
 $('#venue').addEventListener('change',e=>{const prior=selected.base;selected=selectVenueInstrument(selected,instruments[e.target.value],e.target.value);if(selected.base!==prior)toast(prior+' is not listed here; selected '+selected.base+'.');capturePreferences();updateInstrumentOptions();terminal.load(selected,selectedInterval);});
 $('#instrument').addEventListener('change',e=>{selected=instruments[selected.venue].find(x=>x.symbol===e.target.value)??selected;updateChartAnalyst();capturePreferences();terminal.load(selected,selectedInterval);});
 $('#price-chart').addEventListener('keydown',e=>{if(['+','=','-'].includes(e.key)){e.preventDefault();terminal.zoom(e.key==='-'?1.5:2/3);}});
 $('#auto-overlay').addEventListener('change',e=>applyAutoGuide(e.target.value));
 $('#compact-interval').addEventListener('change',e=>{selectedInterval=e.target.value;capturePreferences();syncTimeframe();terminal.load(selected,selectedInterval);});
 $('#chart-style').addEventListener('change',e=>{terminal.style=e.target.value;capturePreferences();if(terminal.bars.length)terminal.build();});
}
function placeChartLegend(){
 const legend=$('#indicator-strip');
 if(phoneView.matches)$('.chart-workspace').after(legend);
 else $('#selected-signal').before(legend);
}
function syncTimeframe(){for(const b of document.querySelectorAll('[data-time]')){b.classList.toggle('selected',b.dataset.time===selectedInterval);b.setAttribute('aria-pressed',String(b.dataset.time===selectedInterval));}}

function updateChartAnalyst(){const link=$('#chart-analyst');if(link)link.href='#analysts?asset='+encodeURIComponent(analystAssetKey(selected));}
function updateInstrumentOptions(){if(!$('#instrument'))return;updateChartAnalyst();const items=[...instruments[selected.venue]];if(!items.some(x=>x.symbol===selected.symbol))items.unshift(selected);items.sort((a,b)=>a.base.localeCompare(b.base));$('#instrument').innerHTML=items.map(x=>`<option value="${esc(x.symbol)}">${esc(x.base)}/${esc(x.quote)}</option>`).join('');$('#instrument').value=selected.symbol;}

function updateQuote(q){
 const quote=$('#terminal-price');
 if(!quote)return;
 setMoneyText(quote,q?.price,selected.quote);
 setMoneyText($('#terminal-native'),q?.price,selected.quote,'native');
 setMoneyText($('#terminal-high'),q?.high,selected.quote);
 setMoneyText($('#terminal-low'),q?.low,selected.quote);
 const change=$('#terminal-change'),changeLabel=Number.isFinite(q?.change)?pct(q.change):'';
 if(change.dataset.value!==changeLabel){
  change.dataset.value=changeLabel;
  change.innerHTML=changeLabel?`<span class="${tone(q.change)}">${changeLabel}</span> <small>24h</small>`:'';
 }
 if(q&&!q.stale&&q.source!=='candle')evaluateAlerts(selected,q.price,q.updatedAt);
}

function updateSummary(){
 if(!terminal||!$('#technical-summary'))return;
 syncForecastScope(terminal);
 const pov=buildStudyPov({bars:terminal.studyBars,instrument:selected,interval:selectedInterval,nowSeconds:terminal.historyAnchor??Date.now()/1000,candleMeta:terminal.candleMeta,confirmedThrough:terminal.confirmedThrough});
 updateChartReader(terminal,pov);
}
function renderSignalEvents(chart){
 const host=$('#signal-results');if(!host)return;
 const events=chart.visibleSignals??[],currentFocus=host.contains(document.activeElement)?document.activeElement.dataset.signalId:null;
 const count=$('[data-action="show-signals"]');
 if(count){
  const label=events.length?`Signal events · ${events.length}`:'Signal events';
  if(count.textContent!==label)count.textContent=label;
 }
 const rows=events.slice(-8).reverse().map(event=>{
  const date=new Date(event.confirmedAt*1000),time=date.toISOString();
  return `<li><div><strong>${esc(event.label)}</strong><small><time datetime="${time}">${esc(time.slice(0,16).replace('T',' '))} UTC</time> · ${moneyMarkup(event.price,chart.instrument.quote,'parallel')}</small><p>${esc(event.detail)}</p></div><button type="button" class="button" data-action="focus-signal" data-signal-id="${esc(event.id)}">Show on chart</button></li>`;
 }).join('');
 host.innerHTML=rows?`<ol class="wb-signal-events">${rows}</ol>`:`<p class="data-note">${chart.bars.length?'No confirmed markers in the loaded candles. Enable a signal rule or load more history.':'Waiting for exchange candles.'}</p>`;
 if(currentFocus)host.querySelector('[data-signal-id="'+CSS.escape(currentFocus)+'"]')?.focus({preventScroll:true});
}
function updateChartReader(chart,pov){
 const node=$('#technical-summary');if(!node||!chart)return;
 const key=[chart.generation,chart.analysisRevision,pov.closedAt,pov.stale,chart.manualDrawing,chart.autoGuide,chart.signalKinds?.join(','),chart.studyIds?.join(','),chart.markers,chart.rsiPeriod,pov.reason].join(':');
 if(node.dataset.context===key)return;node.dataset.context=key;refreshIndicatorStrip();renderSignalEvents(chart);
 const open=[...node.querySelectorAll('details[open] summary')].map(x=>x.textContent);const levels=$('#auto-guide-info');if(levels)levels.innerHTML=renderGuideAudit(chart.autoSetup,chart.manualDrawing?'none':chart.autoGuide,chart.instrument.quote);
 node.innerHTML=chartGuide(pov,chart.autoSetup?{...chart.autoSetup,activeGuide:'none',events:chart.visibleSignals??[]}:null,deskMode==='basic'?'basic':'hybrid',chart.activeStudies(),STUDIES);
 for(const x of node.querySelectorAll('details'))x.open=open.includes(x.querySelector('summary').textContent);
 if(pov.ready&&!chart.historyAnchor){if(!forecastRun&&forecastView?.result.asOf<pov.closedAt&&node.dataset.forecastWake!==String(pov.closedAt)){node.dataset.forecastWake=String(pov.closedAt);paintForecast(chart);}acceptForecastResults(chart,pov.closedAt);}
}

function updateStreamStatus(state){
 const status=$('#stream-status'),source=$('#candle-source');
 if(!status)return;
 const kind=navigator.onLine===false&&state!=='archive'?'offline':state;
 const labels={loading:'Connecting to exchange…',streaming:'Live exchange feed',snapshot:'Exchange snapshot',polling:'Snapshot · reconnecting',delayed:'Delayed exchange feed',stale:'Stale provider cache',unavailable:'Provider unavailable',archive:'Historical candles',offline:'Offline'};
 if(status.dataset.status!==kind){
  status.dataset.status=kind;
  status.innerHTML=`<span class="live-dot ${kind==='streaming'?'':'muted-dot'}"></span>${labels[kind]??esc(kind)}`;
  status.classList.toggle('warn',['offline','stale','delayed','unavailable'].includes(kind));
 }
 const meta=terminal?.candleMeta;
 const label=meta?`${meta.provider} · ${selected.base}/${selected.quote} · UTC bars · ${meta.cache==='stale'?'STALE · ':''}${stamp(meta.fetchedAt)}`:'Drag to pan · scroll to zoom';
 if(source&&source.textContent!==label)source.textContent=label;
}

let lastBookPaint=0;
function formatSpreadPercent(bid,ask){
 if(!bid||!ask||ask<bid)return '';
 const mid=(ask+bid)/2;
 const pctVal=(ask-bid)/mid*100;
 if(pctVal<0.01)return `${num(pctVal*100,2)} bps`;
 return `${num(pctVal,3)}%`;
}
function updateBook(r){activeBook=r;if(!$('#orderbook')||$('#wb-depth')?.hidden)return;const now=Date.now();if(r?.cache==='live'&&now-lastBookPaint<250)return;lastBookPaint=r?now:0;if(!r){$('#book-mode').textContent='AWAITING DATA';$('#orderbook').innerHTML=empty('Book unavailable','Awaiting next valid snapshot.');$('#book-source').textContent='No current snapshot';return;}$('#book-mode').textContent=r.cache==='live'?'LIVE · TOP 20':'L2 SNAPSHOT';const d=r.data,max=Math.max(...d.bids.slice(0,7).map(x=>x[1]),...d.asks.slice(0,7).map(x=>x[1]),1);const rows=(items,side)=>items.map(x=>`<div class="book-row ${side}" style="--depth:${x[1]/max*100}%"><span>${moneyMarkup(x[0],selected.quote)}</span><span>${num(x[1],5)}</span><span>${moneyMarkup(x[0]*x[1],selected.quote,'compact')}</span></div>`).join('');const bid=d.bids[0]?.[0],ask=d.asks[0]?.[0];const spreadText=formatSpreadPercent(bid,ask);$('#orderbook').innerHTML=rows(d.asks.slice(0,7).reverse(),'ask')+`<div class="book-spread"><span>Spread <strong>${moneyMarkup(ask-bid,selected.quote,'parallel')}</strong></span><small>${esc(spreadText)}</small></div>`+rows(d.bids.slice(0,7),'bid');$('#book-source').textContent=`${r.provider} · ${r.cache==='stale'?'STALE · ':''}${r.cache==='live'?'received '+new Date(r.fetchedAt).toLocaleTimeString():ago(r.fetchedAt)} · top 7 / side`;}

function updateWatchPanel(){if(!$('#terminal-watchlist'))return;const list=(data.markets?.data??[]).filter(a=>workspace.watchlist.includes(a.id));$('#terminal-watchlist').innerHTML=list.length?list.slice(0,8).map(a=>`<button class="watch-row" data-action="asset-chart" data-id="${esc(a.id)}"><span>${esc(a.symbol)}</span><span>${moneyMarkup(a.price)}<small class="${tone(a.change)}">${pct(a.change)}</small></span></button>`).join(''):empty('Watchlist empty','Star an asset in Markets to save it.');}

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

 const definitions={map:['Market capitalization map','Area = market cap. Color = 24h price change. Top 45 directory assets. Click an asset to choose its exchange chart.'],momentum:['Liquidity meets momentum','24h change vs reported trading volume (log scale). Bubble size = market cap. First 100 qualifying ranked assets.'],defi:['Where DeFi capital sits','Chain TVL is sourced from DeFiLlama. TVL depends on the provider methodology and can include overlapping protocol exposures.'],depth:[`${selected.base} / ${selected.quote} · depth snapshot`,'Cumulative base-asset size within the first 50 bid/ask levels. A partial snapshot, not total market liquidity.']};

 el.innerHTML=`<div class="studio-grid"><section class="panel"><div class="panel-top"><div><h2>${esc(definitions[view][0])}</h2></div><span class="small-tag">OBSERVED DATA</span></div><p class="chart-description">${esc(definitions[view][1])}</p><div id="studio-chart" class="studio-chart"></div><div id="studio-meta" class="panel-bottom"></div></section><aside class="panel studio-insights"><div class="panel-top"><h2>Reading this view</h2>${icon('info')}</div><div id="studio-insights"></div><a href="#markets" class="button full">View prices ${icon('arrow-up-right')}</a></aside></div>`;hydrate();

 try{const {createVisual}=await import('./visuals.js');if(!current())return;let payload,kind,key;

  if(view==='defi'){if(!data.chains)data.chains=await api('chains');payload=data.chains.data;kind='chains';key='chains';}

  else if(view==='depth'){const r=await api(`book?venue=${selected.venue}&symbol=${selected.symbol}`);if(!current())return;payload={...r.data,quote:selected.quote};kind='depth';key=null;$('#studio-meta').textContent=`${r.provider} · ${r.cache==='stale'?'STALE · ':''}${stamp(r.fetchedAt)}`;}

  else {if(!data.markets)throw Error(errors.markets??'Market prices are loading. Use Refresh to retry.');payload=data.markets.data;kind=view==='map'?'treemap':'scatter';key='markets';}

  if(!current()||!$('#studio-chart'))return;visuals.push(createVisual($('#studio-chart'),kind,payload,{onSelect:id=>chooseAsset(id)}));if(key)$('#studio-meta').innerHTML=stateBadge(key);

  updateStudioInsights(view,payload);

 }catch(e){if(current()&&$('#studio-chart'))$('#studio-chart').innerHTML=empty('Visualization unavailable',e.message);}

}

function renderWorkspace(){const list=(data.markets?.data??[]).filter(a=>workspace.watchlist.includes(a.id));$('#main').innerHTML=header('Workspace','Watchlist, alerts, notes and journal.',`<div class="inline-actions"><button class="button" data-action="export-workspace">${icon('download')} Backup</button><button class="button" data-action="import-workspace">${icon('upload')} Import</button><button class="button" data-action="restore-workspace">Recover import</button></div>`)+`<div class="callout workspace-callout">${icon('info')} Saved on this browser. Backups are unencrypted.</div><section class="panel" id="workspace-watchlist"><div class="panel-top"><h2>Watchlist <span class="count">${workspace.watchlist.length}</span></h2><a href="#markets" class="text-link">Add assets ${icon('plus')}</a></div><div id="workspace-watchlist-table">${data.markets?list.length?marketTable(list):empty('Watchlist empty','Star an asset in Markets to save it.'):errorOrLoading('markets')}</div></section><div class="workspace-grid"><section class="panel" id="workspace-alerts"><div class="panel-top"><div><h2>Price alerts</h2></div><button class="button" data-action="new-alert">${icon('plus')} Add alert</button></div><div id="alerts-list">${alertList()}</div><p class="data-note">Triggers once when a fresh price crosses the threshold. Keep this tab open.</p></section><section class="panel" id="workspace-journal"><div class="panel-top"><h2>Journal</h2>${icon('file-text')}</div><form id="journal-form"><label class="sr-only" for="journal-text">Research journal entry</label><textarea id="journal-text" maxlength="4000" placeholder="Add a journal entry…" required>${esc(drafts.journal)}</textarea><small id="journal-draft-status" class="source">Draft retained on this browser</small><button class="button primary" type="submit">Save entry ${icon('plus')}</button></form><div class="journal-list">${workspace.journal.slice().reverse().slice(0,15).map(j=>`<article><time>${esc(stamp(j.createdAt))}</time><button class="icon-button" data-action="delete-journal" data-id="${esc(j.id)}" aria-label="Delete journal entry">${icon('trash-2')}</button><p>${esc(j.text)}</p></article>`).join('')}</div></section></div><section class="panel saved-notes"><div class="panel-top"><h2>Saved instrument notes</h2></div>${Object.entries(workspace.notes).filter(([k,v])=>v.trim()).map(([k,v])=>`<article><span class="eyebrow">${esc(k)}</span><p>${esc(v)}</p></article>`).join('')||empty('No saved instrument notes','Previously saved instrument notes remain in backups.')}</section><input id="workspace-file" type="file" accept="application/json,.json" class="hidden">`;

 $('#journal-text').addEventListener('input',()=>{const persisted=drafts.setJournal($('#journal-text').value);$('#journal-draft-status').textContent=persisted?'Draft retained on this browser':'Draft in this tab only · storage unavailable';});
 $('#journal-form').addEventListener('submit',e=>{e.preventDefault();const text=$('#journal-text').value.trim();if(!text)return;const next={...workspace,journal:[...workspace.journal,{id:crypto.randomUUID(),text,createdAt:new Date().toISOString()}].slice(-200)};if(!writeState(storage,next)){toast('Cannot save entry. Draft retained; browser storage is unavailable or full.');return;}workspace=next;drafts.setJournal('');renderPage();});$('#workspace-file').addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>2000000)throw Error('Maximum backup size is 2 MB');const gen=pageGeneration,parsed=JSON.parse(await f.text());if(gen!==pageGeneration)throw Error('View changed; import the file again in Workspace.');const imported=replaceWorkspace(storage,workspace,parsed);workspace=imported;selected=workspace.preferences.lastInstrument;selectedInterval=workspace.preferences.interval;alertPrices.clear();toast('Workspace imported. Review imported alerts; at most 10 remain armed.');renderPage();}catch(err){toast('Import rejected: '+err.message);}});

}

function updateWorkspacePrices(){if(!$('#workspace-watchlist-table'))return;const list=(data.markets?.data??[]).filter(x=>workspace.watchlist.includes(x.id));$('#workspace-watchlist-table').innerHTML=data.markets?list.length?marketTable(list):empty('Watchlist empty','Star an asset in Markets to save it.'):errorOrLoading('markets');$('#workspace-watchlist .count').textContent=workspace.watchlist.length;hydrate();}

function alertList(){return workspace.alerts.length?workspace.alerts.map(a=>`<article class="alert-row"><div>${icon('bell')}<span><strong>${esc(a.symbol)}</strong><small>${esc(a.venue)} · ${a.direction} ${num(a.target,8)} · ${a.active?'Armed':a.triggeredAt?'Triggered '+ago(a.triggeredAt):'Paused'}</small></span></div><button class="chip" data-action="toggle-alert" data-id="${esc(a.id)}">${a.active?'Pause':'Rearm'}</button><button class="icon-button" data-action="delete-alert" data-id="${esc(a.id)}" aria-label="Delete alert">${icon('trash-2')}</button></article>`).join(''):empty('No price alerts','Create a threshold for an explicit exchange instrument.');}

function evaluateAlerts(instrument,value,observedAt){let changed=false;for(const a of workspace.alerts){if(!a.active||a.venue!==instrument.venue||a.symbol!==instrument.symbol)continue;const previous=alertPrices.get(a.id),observation=freshObservation(previous,value,observedAt);if(!observation)continue;alertPrices.set(a.id,observation);if(crossed(previous?.price,value,a.target,a.direction)){a.active=false;a.triggeredAt=new Date().toISOString();changed=true;toast(`${a.symbol} crossed ${a.direction} ${num(a.target,8)}`);}}if(changed){save();updateAlertCount();if(page==='workspace'){$('#alerts-list').innerHTML=alertList();hydrate();}}}

let alertBusy=false;async function pollAlerts(){if(document.hidden||alertBusy)return;const active=workspace.alerts.filter(a=>a.active);const unique=[...new Map(active.map(a=>[a.venue+':'+a.symbol,a])).values()].slice(0,10);alertBusy=true;await Promise.allSettled(unique.map(async a=>{try{const r=await api(`ticker?venue=${a.venue}&symbol=${a.symbol}`);if(r.cache==='stale')return;const value=+(r.data.lastPrice??r.data.last);if(Number.isFinite(value))evaluateAlerts(a,value,r.data.observedAt??r.fetchedAt);}catch{}}));alertBusy=false;}

function updateAlertCount(){const n=workspace.alerts.filter(a=>a.active).length;if($('#alert-count'))$('#alert-count').textContent=n?String(n):'';}



function syncSheetViewport(){
 const view=window.visualViewport;
 if(!phoneView.matches||!view||!dialogController?.isOpen)return;
 const style=$('#modal-root').style;
 style.setProperty('--phone-sheet-height',`${view.height}px`);
 style.setProperty('--phone-sheet-top',`${view.offsetTop}px`);
}
function modal(title,content,wide=false){modalGeneration++;clearTimeout(searchTimer);catalogSearch.cancel();dialogController.open(title,content,wide);syncSheetViewport();}
function closeModal(options){dialogController?.close(options);}

function openSearch(){remoteAssets=[];remoteError='';remoteLoading=false;modal('Find an asset',`<label class="command-search">${icon('search')}<input id="command-input" maxlength="80" placeholder="Name, ticker or trading pair" autocomplete="off" aria-label="Search coins and instruments"></label><div id="command-results" class="command-results"></div><div class="modal-footer"><span>Search catalog identities and supported exchange pairs.</span><span class="modal-shortcut"><kbd>ESC</kbd> to close</span></div>`,true);$('#command-input').addEventListener('input',e=>{const q=e.target.value;clearTimeout(searchTimer);catalogSearch.cancel();remoteAssets=[];remoteError='';remoteLoading=normalizeSearch(q).length>=2;searchResults(q);if(remoteLoading)searchTimer=setTimeout(()=>catalogSearch.run(q),300);});searchResults('');if(phoneView.matches)$('#command-input')?.focus({preventScroll:true});}

function searchResults(q){if(!$('#command-results'))return;const combined=mergeAssets(data.markets?.data??[],remoteAssets);const assets=rankAssets(combined,q,8),pairs=rankAssets([...instruments.binance,...instruments.coinbase],q,8);$('#command-results').innerHTML=`<div class="eyebrow">Crypto assets</div>${assets.map(a=>`<button class="command-row" data-action="asset-chart" data-id="${esc(a.id)}">${coinMark(a.symbol)}<span><strong>${esc(a.name)} <small>${esc(a.symbol)}</small></strong><small>${isFetchAsset(a)?'Fetch.ai · ':''}${esc(a.id)}</small></span><b>${a.price?moneyMarkup(a.price):'View asset'}</b>${icon('chevron-right')}</button>`).join('')||'<p class="search-note">No matching priced asset in the loaded directory.</p>'}<div class="search-note" role="status">${remoteLoading?'Searching the broader asset catalog…':remoteError?'Catalog temporarily unavailable; loaded results remain available.':q.trim().length>=2?'Catalog results show available identities. Price and chart coverage varies.':''}</div><div class="eyebrow">Exchange charts</div>${pairs.map(a=>`<button class="command-row" data-action="select-instrument" data-venue="${a.venue}" data-symbol="${esc(a.symbol)}">${coinMark(a.base)}<span><strong>${esc(a.base)}/${esc(a.quote)}</strong><small>${a.venue.toUpperCase()} spot · ${esc(a.symbol)}</small></span>${icon('arrow-up-right')}</button>`).join('')||'<p class="search-note">No matching chart pair in the connected venues.</p>'}`;hydrate();}

async function chooseAsset(id){let a=(data.markets?.data??[]).find(a=>a.id===id)??assetLookup.get(id);if(!a)return;const show=notice=>{const matches=[...instruments.binance,...instruments.coinbase].filter(x=>x.base===a.symbol);modal(`${esc(a.name)} <span class="muted">${esc(a.symbol)}</span>`,`<div class="asset-detail"><div><small>Aggregate price</small><strong>${moneyMarkup(a.price)}</strong><span class="${tone(a.change)}">${pct(a.change)} / 24h</span></div><p>${isFetchAsset(a)?'Also known as Fetch.ai.<br>':''}Asset ID: <code>${esc(a.id)}</code><br>${a.updatedAt?'Updated '+esc(stamp(a.updatedAt)):esc(notice)}</p></div><div class="callout">${matches.length?'Choose an exchange chart. Verify the listed token identity before acting.':'No Binance USDT or Coinbase USD chart is currently connected for this asset. Price and history depend on provider coverage.'}</div><div class="era-asset-research"><a class="text-link" href="#analysts?asset=${encodeURIComponent(analystAssetKey(a))}">Analyst research ${icon('arrow-up-right')}</a></div><div class="instrument-choices">${matches.map(x=>`<button class="command-row" data-action="select-instrument" data-venue="${x.venue}" data-symbol="${esc(x.symbol)}">${coinMark(x.base)}<span><strong>${esc(x.base)}/${esc(x.quote)}</strong><small>${x.venue.toUpperCase()} spot</small></span>${icon('arrow-up-right')}</button>`).join('')}</div>`);};show('Loading current price…');if(!a.price){const gen=modalGeneration;try{const r=await api('asset?id='+encodeURIComponent(id),{signal:dialogController.signal});if(gen!==modalGeneration)return;a=r.data;assetLookup.set(id,a);show('');}catch{if(gen===modalGeneration)show('Current price unavailable from the provider.');}}}

function selectInstrument(venue,symbol){const i=instruments[venue].find(x=>x.symbol===symbol);if(!i){toast('Instrument is unavailable. Refresh the directory.');return;}selected=i;closeModal();if(page==='terminal'){updateInstrumentOptions();$('#venue').value=venue;capturePreferences();terminal.load(selected,selectedInterval);}else{workspace.preferences.lastInstrument=selected;save();location.hash='terminal';}}

function indicatorModal(){
 if(!terminal)return;const selectedIds=[...terminal.activeStudies()];
 const catalog=Object.values(STUDIES).filter(s=>deskMode==='pro'||!s.proOnly);const groups=[...new Set(catalog.map(s=>s.group))];
 const proHiddenCount=deskMode==='basic'?Object.values(STUDIES).filter(s=>s.proOnly).length:0;
 const presets=Object.values(STUDY_PRESETS);
 const studyCards=groups.map(group=>`<section class="study-group" data-study-group="${esc(group)}"><h3>${esc(group)}</h3><div class="study-grid">${catalog.filter(s=>s.group===group).map(s=>`<label class="study-choice"><input type="checkbox" name="study" value="${s.id}" ${selectedIds.includes(s.id)?'checked':''}><span><strong>${esc(s.label)}</strong><small>${esc(s.meaning)}</small><small>${s.placement==='pane'?'Lower pane':'On price chart'} · ${esc(s.warmup)}</small>${s.id==='vwap'&&selectedInterval==='1d'?'<small>Choose an intraday interval to plot VWAP.</small>':''}</span></label>`).join('')}</div></section>`).join('');
 const proNote=proHiddenCount?`<div class="study-pro-note"><span>${proHiddenCount} additional advanced studies (WMA, CCI, BBW, RVOL, CMF) are available in Pro mode.</span><button type="button" class="text-link" data-action="switch-pro-studies">Switch to Pro</button></div>`:'';
 const lengths=(terminal.smaPeriods.length?terminal.smaPeriods:[terminal.period]).join(', ');
 const settings=`<fieldset class="study-settings"><legend>Indicator lengths</legend><div class="study-lengths"><label class="sma-lengths">SMA lengths<input name="smaPeriods" type="text" value="${lengths}" aria-describedby="sma-length-help" required><small id="sma-length-help">Enter up to ${MAX_SMA_PERIODS} lengths from 2 to ${MAX_SMA_LENGTH}, separated by commas or spaces.</small></label><button type="button" class="button" id="sma-quick-set">Use 20, 40, 60, 80</button><label>EMA, WMA, HMA and band length<input name="period" type="number" min="2" max="200" value="${terminal.period}" required></label><label>RSI length<input name="rsiPeriod" type="number" min="2" max="100" value="${terminal.rsiPeriod}" required></label></div></fieldset>`;
 modal('Chart studies',`<div class="study-presets" aria-label="Study presets">${presets.map(p=>`<button type="button" class="button" data-preset="${p.id}" title="${esc(p.description)}">${esc(p.label)}</button>`).join('')}<button type="button" class="button" data-preset="clear">Clear studies</button></div><form id="study-form">${settings}<div class="era-study-filters"><input id="study-search" aria-label="Find an indicator" placeholder="Find an indicator"><select id="study-category" aria-label="Indicator category"><option value="">All categories</option>${groups.map(group=>`<option>${esc(group)}</option>`).join('')}</select></div><p id="study-no-results" hidden>No indicators match.</p>${studyCards}${proNote}<footer class="study-actions"><div><p class="study-count" aria-live="polite"></p><p class="study-feedback" role="status"></p></div><button class="button primary" type="submit">Apply to chart</button></footer></form>`,true);
 const dialog=$('#modal-root'),form=$('#study-form');
 const filter=()=>{
  const query=$('#study-search').value.trim().toLowerCase(),category=$('#study-category').value;
  let count=0;
  for(const group of form.querySelectorAll('[data-study-group]')){
   let visible=0;
   for(const card of group.querySelectorAll('.study-choice')){
    card.hidden=Boolean((category&&group.dataset.studyGroup!==category)||!card.textContent.toLowerCase().includes(query));
    if(!card.hidden)visible++;
   }
   group.hidden=!visible;count+=visible;
  }
  $('#study-no-results').hidden=Boolean(count);
 };
 $('#study-search').addEventListener('input',filter);$('#study-category').addEventListener('change',filter);
 let draft=selectedIds;
 const sync=()=>{
  for(const field of form.querySelectorAll('input[name="study"]'))field.checked=draft.includes(field.value);
  const count=draft.filter(id=>STUDIES[id].placement==='pane').length;
  form.querySelector('.study-count').textContent=`${draft.length-count} / ${MAX_STUDY_OVERLAYS} overlays · ${count} / ${MAX_STUDY_PANES} lower panes`;
 };
 sync();
 const apply=()=>{terminal.studyIds=draft;capturePreferences();if(terminal.bars.length)terminal.renderIndicators();refreshIndicatorStrip();updateSummary();};
 for(const button of dialog.querySelectorAll('[data-preset]'))button.addEventListener('click',()=>{
  const p=STUDY_PRESETS[button.dataset.preset];draft=normalizeStudyIds(p?.studies??[]);sync();apply();closeModal();toast(p?p.label+' applied':'Studies cleared');
 });
 form.addEventListener('change',e=>{
  if(e.target.name!=='study')return;
  const id=e.target.value,next=e.target.checked?[...draft,id]:draft.filter(x=>x!==id);
  const capped=normalizeStudyIds(next).length<next.length;
  form.querySelector('.study-feedback').textContent=capped?`Clear a ${STUDIES[id].placement==='pane'?'lower-pane study':'price overlay'} to add this one.`:'';
  if(!capped)draft=next;
  sync();
 });
 const smaField=form.elements.smaPeriods;
 smaField.addEventListener('input',()=>smaField.setCustomValidity(''));
 $('#sma-quick-set').addEventListener('click',()=>{
  smaField.value='20, 40, 60, 80';
  smaField.setCustomValidity('');
  if(!draft.includes('sma')){
   const checkbox=form.querySelector('[value="sma"]');
   checkbox.checked=true;
   checkbox.dispatchEvent(new Event('change',{bubbles:true}));
  }
 });
 form.addEventListener('submit',e=>{
  e.preventDefault();
  const raw=smaField.value.trim().split(/[,\s]+/);
  const numbers=raw.map(Number);
  const periods=normalizeSmaPeriods(numbers);
  if(raw.some((value,i)=>!/^\d+$/.test(value)||numbers[i]<2||numbers[i]>MAX_SMA_LENGTH)||new Set(numbers).size>MAX_SMA_PERIODS){
   smaField.setCustomValidity(`Use up to ${MAX_SMA_PERIODS} whole numbers from 2 to ${MAX_SMA_LENGTH}.`);
   smaField.reportValidity();return;
  }
  terminal.smaPeriods=periods;
  terminal.period=+form.elements.period.value;
  terminal.rsiPeriod=+form.elements.rsiPeriod.value;
  apply();closeModal();
 });
}
function signalSettingsModal(){
 if(!terminal)return;
 const choices=[
  ['range','Range break','Close above the prior 20-candle high or below the prior low.'],
  ['ema','EMA 20/50 cross','The 20-candle average crosses the 50-candle average.'],
  ['macd','MACD crossover','MACD crosses its signal line.'],
  ['rsi','RSI transition','RSI moves out of the 30 or 70 extreme zone.']
 ];
 modal('Chart signals',`<form id="signal-form"><p class="data-note">Signals mark confirmed candle closes and can be used with any plotted indicator.</p><fieldset class="wb-signal-settings"><legend>Rules</legend>${choices.map(([id,label,detail])=>`<label class="study-choice"><input name="signal" value="${id}" type="checkbox" ${(id==='ema'?terminal.markers:terminal.signalKinds.includes(id))?'checked':''}><span><strong>${label}</strong><small>${detail}</small></span></label>`).join('')}</fieldset><label>RSI length<input name="rsiPeriod" type="number" min="2" max="100" value="${terminal.rsiPeriod}" required></label><button class="button primary" type="submit">Apply signals</button></form>`);
 $('#signal-form').addEventListener('submit',e=>{
  e.preventDefault();
  const settings=new FormData(e.currentTarget),kinds=settings.getAll('signal');
  terminal.markers=kinds.includes('ema');terminal.signalKinds=kinds.filter(kind=>kind!=='ema');
  terminal.rsiPeriod=Number(settings.get('rsiPeriod'));capturePreferences();
  if(terminal.bars.length)terminal.renderIndicators();
  updateSummary();closeModal();
 });
}
function historyDateModal(){
 modal('Jump to chart history',`<div class="desk-modal-body"><p>Enter a UTC date to open the available candles ending that day. Use Reset view to return to the live chart.</p><form id="history-date-form"><label>UTC date<input type="date" name="date" min="2009-01-01" max="${new Date().toISOString().slice(0,10)}" required></label><button class="button primary" type="submit">Open history</button><p id="history-date-error" role="status"></p></form></div>`);
 $('#history-date-form').addEventListener('submit',e=>{e.preventDefault();const date=new FormData(e.currentTarget).get('date');if(terminal?.jumpToDate(date))closeModal();else $('#history-date-error').textContent='Choose a valid date in the past.';});
}
function drawingModal(){if(!terminal)return;const drawings=workspace.drawings[terminal.key]??[];modal('Saved drawings',`<p class="muted">${esc(selected.symbol)} · ${selectedInterval.toUpperCase()} · Click a tool, then place anchors on the price pane. Dragging the chart preserves time/price anchors.</p><div class="drawing-list">${drawings.map(d=>`<form class="drawing-edit" data-id="${esc(d.id)}"><div><span class="small-tag">${d.type}</span><button type="button" class="icon-button" data-action="delete-drawing" data-id="${esc(d.id)}" aria-label="Delete drawing">${icon('trash-2')}</button></div><label>Annotation<input name="label" value="${esc(d.label)}" maxlength="100"></label>${d.points.map((p,i)=>`<div class="form-grid"><label>Anchor ${i+1} price<input type="number" name="price${i}" min="0" step="any" value="${p.price}" required></label><label>Anchor ${i+1} UTC<input type="datetime-local" name="time${i}" value="${new Date(p.time*1000).toISOString().slice(0,16)}" required></label></div>`).join('')}<button class="button" type="submit">Update drawing</button></form>`).join('')||empty('No drawings yet','Use horizontal, trend, Fibonacci or annotation tools on the price chart.')}<div class="data-note">Date fields are UTC. Set anchor times to existing candle openings to keep them visible.</div></div>`);document.querySelectorAll('.drawing-edit').forEach(f=>f.addEventListener('submit',e=>{e.preventDefault();const d=drawings.find(x=>x.id===f.dataset.id),values=new FormData(f);const next={...d,label:String(values.get('label')),points:d.points.map((p,i)=>({price:+values.get('price'+i),time:Date.parse(values.get('time'+i)+':00Z')/1000}))};if(!drawingValid(next)){toast('Use positive prices and valid UTC anchor times.');return;}Object.assign(d,next);if(save()){terminal.draw();toast('Drawing updated.');}}));}

function alertModal(){const count=workspace.alerts.filter(x=>x.active).length;if(count>=10){toast('Pause an alert before adding another (10 active instruments maximum).');return;}modal('Create a price alert',`<form id="alert-form"><p class="muted">${esc(selected.venue.toUpperCase())} · ${esc(selected.base)} / ${esc(selected.quote)}</p><div class="form-grid"><label>When price crosses<select name="direction"><option value="above">Above</option><option value="below">Below</option></select></label><label>Target (${esc(selected.quote)})<input name="target" type="number" min="0" step="any" value="${terminal?.currentQuote()?.price??''}" placeholder="Target price" required></label></div><div class="callout">Keep this tab open. First quote establishes a baseline; a later crossing triggers the alert once. This is an in-app alert, not a background notification.</div><button class="button primary" type="submit">Arm alert ${icon('bell')}</button></form>`);$('#alert-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);try{const next=appendPriceAlert(workspace,selected,{direction:f.get('direction'),target:f.get('target')},crypto.randomUUID());if(!writeState(storage,next))throw Error('Alert could not be saved. Browser storage is unavailable or full.');workspace=next;closeModal();toast('Alert armed. Keep CRYPTOZ open to monitor.');updateAlertCount();if(page==='workspace')renderPage();pollAlerts();}catch(error){toast(error.message);}});}

document.addEventListener('pointerdown',e=>closeToolMenus(document,e.target),true);
document.addEventListener('toggle',e=>{
 if(e.target.matches?.('.chart-menu[open]'))closeToolMenus(document,e.target);
},true);
document.addEventListener('click',e=>{
 closeToolMenus(document,e.target);
 const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;

 if(a==='skip-content'){e.preventDefault();$('#main').focus();$('#main').scrollIntoView({block:'start'});return;}

 if(b.closest('.chart-menu'))closeToolMenus(document,null,{returnFocus:true});
 if(a==='reset-chart'){terminal?.resetView();capturePreferences();return;}
 if(a==='phone-chart-zoom'){terminal?.zoom(b.dataset.zoom==='out'?1.5:2/3);return;}
 if(a==='focus-chart'){setChartFocus(!document.body.classList.contains('chart-focus'));return;}
 if(a==='benchmark-range'&&Object.hasOwn(BENCHMARK_RANGES,b.dataset.range)){
  benchmarkRange=b.dataset.range;
  document.querySelectorAll('[data-action="benchmark-range"]').forEach(button=>button.setAttribute('aria-pressed',String(button===b)));
  $('#benchmark-source').textContent='Loading '+benchmarkRange.toUpperCase()+' history…';
  loadBenchmark(pageGeneration);return;
 }
 if(a==='dock-toggle'){setDock('compact');$('.sidebar a.active')?.focus();return;}
 if(a==='dock-hide'){setDock('hidden');const reveal=document.body.classList.contains('chart-focus')?$('.focus-nav-reveal'):$('[data-action="dock-toggle"]');reveal?.focus();return;}
 if(a==='desk'){
  const mode=b.dataset.mode;
  if(setDesk(mode)){
   renderPage();
   document.querySelector('[data-action="desk"][data-mode="'+mode+'"]')?.focus({preventScroll:true});
   toast(mode==='basic'?'Basic mode: guided explanations enabled':'Pro mode: full terminal controls enabled');
  }
  return;
 }
 if(a==='switch-pro-studies'){
  setDesk('pro');
  if(terminal){terminal.deskMode='pro';terminal.renderIndicators();updateSummary();}
  indicatorModal();
  toast('Pro mode enabled · all 25 indicators available');
  return;
 }
 if(a==='retry-view'){operationError='';renderPage();return;}
 if(a==='appearance'){appearanceModal();return;}if(a==='live-chart'){
  const base=BENCHMARK_ASSETS.find(base=>base+'USDT'===b.dataset.symbol);if(!base)return;
  selected=instruments.binance.find(x=>x.symbol===b.dataset.symbol)??{venue:'binance',symbol:base+'USDT',base,quote:'USDT'};
  workspace.preferences.lastInstrument=selected;save();location.hash='terminal';return;
 }

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

 if(a==='phone-movers'){
  phoneMoversOpen=!phoneMoversOpen;
  b.setAttribute('aria-expanded',String(phoneMoversOpen));
  if($('#market-movers'))$('#market-movers').dataset.phoneOpen=String(phoneMoversOpen);
  return;
 }
 if(a==='prev-page'||a==='next-page'){
  marketPage+=a==='next-page'?1:-1;renderMarketResults();
  if(phoneView.matches){
   const results=$('#market-results');
   results?.focus({preventScroll:true});
   results?.scrollIntoView({block:'start',behavior:navigationMotion()?'smooth':'instant'});
  }
  return;
 }

 if(a==='export-markets'){const list=filteredMarkets();download('cryptoz-markets.csv',serializeCSV(['id','symbol','name','price','quote','change24h','marketCap','volume','updatedAt'],list.map(x=>[x.id,x.symbol,x.name,x.price,marketUniverse==='exchange'?'USDT':'USD',x.change,x.marketCap,x.volume,x.updatedAt])),'text/csv');return;}

 if(a==='home-news-tab'){homeNewsTopic=b.dataset.topic;document.querySelectorAll('[data-action="home-news-tab"]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderNewsResults();reveal($('#news-results'),{offset:3,duration:200});return;}
 if(a==='news-more'){newsLimit+=20;renderNewsResults();reveal($('#news-results'),{offset:3,duration:200});return;}if(a==='news-topic'){newsTopic=b.dataset.topic;newsLimit=20;document.querySelectorAll('[data-action="news-topic"]').forEach(x=>{x.classList.toggle('active',x.dataset.topic===newsTopic);x.setAttribute('aria-pressed',x.dataset.topic===newsTopic);});renderNewsResults();reveal($('#news-results'),{offset:3,duration:200});return;}

 if(a==='studio-tab'){studioView(b.dataset.view);reveal($('#studio-content'),{offset:4});return;}

 if(a==='timeframe'){selectedInterval=b.dataset.time;if($('#compact-interval'))$('#compact-interval').value=selectedInterval;capturePreferences();syncTimeframe();terminal?.load(selected,selectedInterval);return;}

 if(a==='retry-chart'){terminal?.refresh();return;}

 if(a==='layouts'){layoutModal();return;}

 if(a==='load-layout'){const l=workspace.layouts.find(x=>x.id===b.dataset.id);if(!l)return;workspace.preferences=normalizePreferences(l.settings);selected=workspace.preferences.lastInstrument;selectedInterval=workspace.preferences.interval;save();closeModal();renderPage();return;}

 if(a==='delete-layout'){workspace.layouts=workspace.layouts.filter(x=>x.id!==b.dataset.id);save();layoutModal();return;}

 if(a==='guide'){const help=helpFor(b.dataset.guide);if(help)modal(help.title,'<ol class="help-steps">'+help.items.map(([title,text])=>'<li><h3>'+esc(title)+'</h3><p>'+esc(text)+'</p></li>').join('')+'</ol>');return;}
 if(a==='indicators'){indicatorModal();return;}
 if(a==='signal-settings'){signalSettingsModal();return;}
 if(a==='chart-panel'){activateChartPanel(b.dataset.pane);return;}
 if(a==='show-signals'){
  if(document.body.classList.contains('chart-focus'))setChartFocus(false);
  activateChartPanel('signals');
  const tab=$('#wb-tab-signals');tab?.focus({preventScroll:true});tab?.scrollIntoView({block:'center',behavior:navigationMotion()?'smooth':'instant'});
  return;
 }
 if(a==='focus-signal'&&terminal){
  if(!terminal.focusSignal?.(b.dataset.signalId)){toast('This event is no longer in the loaded chart.');return;}
  const plot=$('#price-chart');plot?.focus({preventScroll:true});plot?.scrollIntoView({block:'center'});
  return;
 }
 if(a==='clear-signal'&&terminal){terminal.clearSignalFocus();$('[data-action="show-signals"]')?.focus({preventScroll:true});return;}
 if(a==='forecast-csv'){exportForecastCases();return;}
 if(a==='forecast-journal-csv'){exportForecastJournal();return;}
 if(a==='suggest-studies'&&terminal){const state=buildStudyPov({bars:terminal.studyBars,instrument:selected,interval:selectedInterval,nowSeconds:terminal.historyAnchor??Date.now()/1000,candleMeta:terminal.candleMeta,confirmedThrough:terminal.confirmedThrough});if(!state.ready){toast('Wait for enough closed candles.');return;}const highVol=Number.isFinite(state.metrics?.volumeRatio)&&state.metrics.volumeRatio>=1.5&&selectedInterval!=='1d';const presetKey=highVol?'volume':state.trend==='Mixed'?'range':'trend';const preset=STUDY_PRESETS[presetKey];const reason=highVol?'elevated intraday volume':state.trend==='Mixed'?'mixed / ranging structure':`${state.trend.toLowerCase()} trend`;terminal.studyIds=normalizeStudyIds(preset.studies);terminal.renderIndicators();refreshIndicatorStrip();updateSummary();capturePreferences();toast(`${preset.label} applied for ${reason}`);return;}
 if(a==='inspect-overlay'){
  activateChartPanel('levels');const tab=$('#wb-tab-levels');tab?.focus({preventScroll:true});tab?.scrollIntoView({block:'center',behavior:navigationMotion()?'smooth':'instant'});return;
 }
 if(a==='manual-guide'&&terminal){terminal.manualDrawing=!terminal.manualDrawing;b.setAttribute('aria-pressed',String(terminal.manualDrawing));$('.drawing-tools').hidden=!terminal.manualDrawing;$('#auto-overlay').value=terminal.manualDrawing?'none':terminal.autoGuide;terminal.setTool('cursor');terminal.setAutoGuide(terminal.autoGuide);updateSummary();return;}
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

document.addEventListener('keydown',e=>{if(dialogController?.isOpen)return;if(e.key==='Escape'){if(closeToolMenus(document,null,{returnFocus:true})){e.preventDefault();return;}if(document.body.classList.contains('chart-focus'))setChartFocus(false);terminal?.setTool('cursor');}if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();openSearch();}});

$('#modal-root').addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))closeModal();});

window.addEventListener('resize',syncDockAccess);
window.addEventListener('storage',e=>{if(e.key==='cryptoz.workspace.v2')toast('Workspace changed in another tab. Export this tab before reloading if it contains unsaved research.');});phoneView.addEventListener('change',event=>{
 if(isMarketPage()){
  marketPage=event.matches?marketPage*desktopMarketRows/phoneMarketRows:Math.floor(marketPage*phoneMarketRows/desktopMarketRows);
  renderMarketResults();
 }
 terminal?.syncScrollOptions();
 if(page==='overview')placeHomeChart();
 if(page==='terminal')placeChartLegend();
 mini?.applyOptions({handleScroll:chartScrollOptions('cursor',event.matches)});
 syncSheetViewport();
});
window.visualViewport?.addEventListener('resize',syncSheetViewport);
window.visualViewport?.addEventListener('scroll',syncSheetViewport);
window.addEventListener('hashchange',route);window.addEventListener('error',()=>{operationError='This view could not update. Retry the view.';syncNetworkState();});window.addEventListener('unhandledrejection',event=>{if(event.reason?.name==='AbortError')return;operationError='An operation could not finish. Retry the view.';syncNetworkState();});window.addEventListener('online',()=>{operationError='';syncNetworkState();refreshCurrent();});window.addEventListener('offline',syncNetworkState);

marketStream=new MarketStream({onBatch:patchLiveQuotes,onStatus:patchLiveStatus});liveMarketView=createLiveMarketView(document,marketStream);marketMoversView=createMarketMovers(document,marketStream,value=>moverDisplayPrice(value,'USDT'));shell();dialogController=createDialogController({root:$('#modal-root'),background:$('#app'),hydrate,animateExit:dismissSurface,fallbackFocus:()=>$('#main'),onClose:()=>{modalGeneration++;clearTimeout(searchTimer);catalogSearch.cancel();}});route();
marketStream.setRegistry(BENCHMARK_ASSETS.map(base=>({symbol:base+'USDT',venue:'binance',quote:'USDT'})));
fetchData();loadInstruments();
try{currency.set(storage.getItem(DISPLAY_CURRENCY_KEY));}catch{}
refreshFx();
setInterval(refreshFx,15_000);
document.addEventListener('visibilitychange',refreshFx);
window.addEventListener('online',refreshFx);

setInterval(()=>{if(!document.hidden&&!loading)fetchData(['markets','global','sentiment','news']);},120000);
function refreshSpotSnapshot(){
 if(document.hidden||navigator.onLine===false)return;
 const visibleSpotTable=page==='markets'||isMarketPage()&&marketUniverse==='exchange';
 const missingBenchmarks=page==='overview'&&BENCHMARK_ASSETS.some(base=>!marketStream.fresh(base+'USDT'));
 if((visibleSpotTable||missingBenchmarks)&&Date.now()-lastSpotAttempt>=30000){
  lastSpotAttempt=Date.now();
  if(!instruments.binance.length)loadInstruments(['binance']);
  fetchData(['exchange']);
 }
}
window.addEventListener('online',()=>loadInstruments(['binance','coinbase'].filter(venue=>!instruments[venue].length)));
setInterval(refreshSpotSnapshot,35000);

setInterval(pollAlerts,15000);

