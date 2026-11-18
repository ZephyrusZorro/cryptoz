export const PRIMARY=[
 {id:'home',label:'Home',icon:'layout-dashboard',route:'overview'},
 {id:'markets',label:'Markets',icon:'globe',route:'markets'},
 {id:'research',label:'Charts',icon:'chart-no-axes-combined',route:'terminal'},
 {id:'practice',label:'Practice',icon:'layers',route:'practice'},
 {id:'learn',label:'Learn',icon:'book-open',route:'learn'}
];
export const GROUPS={
 home:[{route:'overview',label:'Overview'},{route:'news',label:'News'},{route:'analysts',label:'Analyst views'}],
 markets:[{route:'markets',label:'Explore'},{route:'studio',label:'Market maps'},{route:'market-insights',label:'Insights'},{route:'workspace',label:'Watchlist & alerts'}],
 research:[{route:'terminal',label:'Chart'},{route:'compare',label:'Compare'}],
 practice:[{route:'practice',label:'Simulator'},{route:'replay',label:'Replay'},{route:'backtest',label:'Strategy lab'},{route:'risk',label:'Calculator'}],
 learn:[{route:'learn',label:'Learning desk'}]
};
const paths=new Map(Object.entries(GROUPS).flatMap(([group,items])=>items.map(x=>[x.route,group])));
export function resolveRoute(hash=''){const path=String(hash).replace(/^#/,'').split('?')[0];const resolved=({charts:'terminal','ai-intelligence':'terminal',ai:'terminal',insights:'market-insights'})[path];return paths.has(path)?path:typeof resolved==='string'?resolved:'overview';}
export function groupFor(route){return paths.get(route)??'home';}
export function normalizeDock(value){return ['compact','hidden'].includes(value)?value:'compact';}
export function readDock(storage){try{return normalizeDock(storage.getItem('cryptoz.navigation.v1'));}catch{return 'compact';}}
export function saveDock(storage,mode){try{storage.setItem('cryptoz.navigation.v1',normalizeDock(mode));return true;}catch{return false;}}
