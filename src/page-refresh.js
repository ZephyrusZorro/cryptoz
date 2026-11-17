export async function refreshPage({page,universe='aggregate',terminal,comparison,learning,loadData,refreshStudio,refreshBenchmark}){
 if(page==='terminal')return terminal?.refresh();
 if(page==='compare')return comparison?.refresh();
 if(page==='learn')return learning?.refresh();
 if(page==='news')return loadData(['news']);
 if(page==='markets')return loadData([universe==='exchange'?'exchange':'markets']);
 if(page==='workspace')return loadData(['markets']);
 if(page==='studio'){await loadData(['markets','chains']);return refreshStudio?.();}
 return Promise.all([loadData(['markets','global','sentiment','news']),refreshBenchmark?.()]);
}
