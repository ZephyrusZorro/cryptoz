export function newsWindow(items,{source='all',topic='all',query='',sort='impact',limit=20}={}){
 const safeLimit=Number.isInteger(limit)&&limit>0?Math.min(limit,200):20,q=String(query).trim().toLowerCase();
 const filtered=items.filter(x=>{
  if(source!=='all'&&x.source!==source)return false;
  if(topic==='HIGH_IMPACT'){if(x.impact!=='high'&&x.impact!=='medium')return false;}
  else if(topic!=='all'&&classifyHeadline(x.title)!==topic)return false;
  if(q&&!String(x.title).toLowerCase().includes(q)&&!String(x.source??'').toLowerCase().includes(q))return false;
  return true;
 });
 const ordered=sort==='latest'
  ?[...filtered].sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0))
  :[...filtered].sort((a,b)=>((b.priority??0)-(a.priority??0))||((Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)));
 const visible=ordered.slice(0,safeLimit);return {items:visible,total:ordered.length,remaining:ordered.length-visible.length};
}

export function classifyHeadline(t){if(/fed\b|fomc\b|inflation|interest rate|rate cut|rate hike|treasury|dollar|cpi\b|pce\b|monetary policy/i.test(t))return 'MACRO';if(/regulat|sec\b|cftc\b|law|legislat|court|policy|enforcement|bill\b|mica\b/i.test(t))return 'POLICY';if(/hack|exploit|security|breach|drained|depeg|insolven|bankrupt/i.test(t))return 'SECURITY';if(/etf|fund|institution|blackrock|fidelity|microstrategy|sovereign|treasury buys/i.test(t))return 'INSTITUTIONAL';if(/defi|protocol|ethereum|solana|layer[- ]?2|staking|upgrade|mainnet/i.test(t))return 'ECOSYSTEM';return 'MARKETS';}
