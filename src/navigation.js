export const PRIMARY=[
 {id:'home',label:'Home',icon:'layout-dashboard',route:'overview'},
 {id:'markets',label:'Markets',icon:'globe',route:'markets'},
 {id:'research',label:'Charts',icon:'chart-no-axes-combined',route:'terminal'},
 {id:'workspace',label:'Workspace',icon:'bookmark',route:'workspace'}
];
export const GROUPS={
 home:[{route:'overview',label:'Overview'},{route:'news',label:'News'}],
 markets:[{route:'markets',label:'Prices'},{route:'studio',label:'Market maps'}],
 research:[{route:'terminal',label:'Chart'},{route:'compare',label:'Compare'},{route:'learn',label:'Signals'}],
 workspace:[{route:'workspace',label:'Watchlist',target:'workspace-watchlist'},{route:'workspace',label:'Alerts',target:'workspace-alerts'},{route:'workspace',label:'Journal & notes',target:'workspace-journal'}]
};
const paths=new Map(Object.entries(GROUPS).flatMap(([group,items])=>items.map(x=>[x.route,group])));
export function resolveRoute(hash=''){const path=String(hash).replace(/^#/,'').split('?')[0];return paths.has(path)?path:'overview';}
export function groupFor(route){return paths.get(route)??'home';}
export function normalizeDock(value){return ['compact','hidden'].includes(value)?value:'compact';}
export function readDock(storage){try{return normalizeDock(storage.getItem('cryptoz.navigation.v1'));}catch{return 'compact';}}
export function saveDock(storage,mode){try{storage.setItem('cryptoz.navigation.v1',normalizeDock(mode));return true;}catch{return false;}}
