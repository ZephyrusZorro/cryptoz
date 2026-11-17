export function createVisualController(element,data,{init,options,onSelect,Observer=globalThis.ResizeObserver}){
 const chart=init(element,null,{renderer:'canvas'});chart.setOption(options(data));
 if(onSelect)chart.on('click',event=>{if(event.data?.assetId)onSelect(event.data.assetId);});
 const observer=new Observer(()=>chart.resize());observer.observe(element);let disposed=false;
 return {chart,update(next){if(!disposed)chart.setOption(options(next));},dispose(){if(disposed)return;disposed=true;observer.disconnect();chart.dispose();}};
}
