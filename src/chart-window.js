export function rangeForPreset(count,preset='all'){
 if(!Number.isSafeInteger(count)||count<1)return null;
 return {from:preset==='recent'?Math.max(0,count-100):-1,to:count+3};
}
export function zoomRange(range,factor,count){
 if(!range||![range.from,range.to,factor].every(Number.isFinite)||range.to<=range.from||factor<=0||!Number.isSafeInteger(count)||count<1)return null;
 const max=count+4,span=Math.min(max,Math.max(Math.min(15,count), (range.to-range.from)*factor));
 let from=range.to>=count-1?range.to-span:(range.from+range.to-span)/2,to=from+span;
 if(to>count+3){to=count+3;from=to-span;}if(from< -1){from=-1;to=from+span;}
 return {from,to};
}
export function classifyRange(range,count){
 if(!range||!count)return 'all';
 if(range.from<=.02&&range.to>=count-1-.02)return 'all';
 const recent=rangeForPreset(count,'recent');
 return Math.abs(range.from-recent.from)<.02&&Math.abs(range.to-recent.to)<.02?'recent':'custom';
}
export function windowInfo(bars,range){
 const total=bars.length;if(!total||!range)return {visible:0,total,start:null,end:null};
 const start=Math.max(0,Math.floor(range.from)),end=Math.min(total-1,Math.ceil(range.to));
 return {visible:Math.max(0,end-start+1),total,start:bars[start]?.time??null,end:bars[end]?.time??null};
}
