export function newsWindow(items,{source='all',query='',limit=20}={}){
 const safeLimit=Number.isInteger(limit)&&limit>0?Math.min(limit,200):20,q=String(query).trim().toLowerCase();
 const filtered=items.filter(x=>(source==='all'||x.source===source)&&String(x.title).toLowerCase().includes(q));
 const visible=filtered.slice(0,safeLimit);return {items:visible,total:filtered.length,remaining:filtered.length-visible.length};
}
