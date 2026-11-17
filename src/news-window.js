export function newsWindow(items,{source='all',topic='all',query='',limit=20}={}){
 const safeLimit=Number.isInteger(limit)&&limit>0?Math.min(limit,200):20,q=String(query).trim().toLowerCase();
 const filtered=items.filter(x=>(source==='all'||x.source===source)&&(topic==='all'||classifyHeadline(x.title)===topic)&&String(x.title).toLowerCase().includes(q));
 const visible=filtered.slice(0,safeLimit);return {items:visible,total:filtered.length,remaining:filtered.length-visible.length};
}

export function classifyHeadline(t){if(/fed\b|inflation|interest rate|treasury|dollar|cpi\b/i.test(t))return 'MACRO';if(/regulat|sec\b|law|legislat|court|policy/i.test(t))return 'POLICY';if(/hack|exploit|security|breach/i.test(t))return 'SECURITY';if(/etf|fund|institution/i.test(t))return 'INSTITUTIONAL';if(/defi|protocol|ethereum|solana/i.test(t))return 'ECOSYSTEM';return 'MARKETS';}
