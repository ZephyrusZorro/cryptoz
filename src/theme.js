const palettes={
 dark:{panel:'#11182d',text:'#b6c2df',grid:'#25314e',border:'#344264',accent:'#8aa4ff',up:'#51d9b0',down:'#ff8999',violet:'#b9a2ff',gold:'#f1c28a',cyan:'#65cde6'},
 light:{panel:'#ffffff',text:'#506080',grid:'#e6e8f2',border:'#cfd3e6',accent:'#365bd6',up:'#087b60',down:'#c83953',violet:'#8052c9',gold:'#ab650e',cyan:'#077c9d'}
};
export function palette(theme=globalThis.document?.documentElement.dataset.theme){return palettes[theme]??palettes.dark;}
export function normalizeAppearance(x={}){return {theme:x?.theme==='light'?'light':'dark',motion:x?.motion==='reduced'?'reduced':'auto'};}
export function readAppearance(storage){try{return normalizeAppearance(JSON.parse(storage?.getItem('cryptoz.appearance.v1')??'{}'));}catch{return normalizeAppearance();}}
export function applyAppearance(value,storage){const a=normalizeAppearance(value);document.documentElement.dataset.theme=a.theme;document.documentElement.dataset.motion=a.motion;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',a.theme==='dark'?'#090e23':'#eeedf8');try{storage?.setItem('cryptoz.appearance.v1',JSON.stringify(a));}catch{}return a;}
export function chartOptions(){const p=palette();return {layout:{background:{color:p.panel},textColor:p.text},grid:{vertLines:{color:p.grid},horzLines:{color:p.grid}},rightPriceScale:{borderColor:p.border},timeScale:{borderColor:p.border},crosshair:{vertLine:{color:p.text,labelBackgroundColor:p.border},horzLine:{color:p.text,labelBackgroundColor:p.border}}};}
