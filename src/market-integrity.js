import {asNumber} from './numbers.js';
import {normalizeCandles} from './analytics.js';

export function mergeCandleHistory(current,snapshot,revisions=new Map(),requestRevision=0,{stale=false,limit=600}={}){
 const incoming=normalizeCandles(snapshot),existing=normalizeCandles(current);
 if(!incoming.length)return existing.slice(-limit);
 const merged=new Map(existing.map(b=>[b.time,b]));
 for(const bar of incoming)if(!stale||(merged.has(bar.time)===false)){
  if((revisions.get(bar.time)??0)<=requestRevision)merged.set(bar.time,bar);
 }
 return [...merged.values()].sort((a,b)=>a.time-b.time).slice(-limit);
}
const finite=asNumber;
export function parseLiveQuote(data,instrument,previous,now=Date.now()){
 const binance=instrument.venue==='binance';
 if((binance?data?.s:data?.product_id)!==instrument.symbol)return null;
 const value=finite(binance?data.c:data.price),time=binance?finite(data.E):Date.parse(data.time);
 const previousTime=previous?.source==='candle'?NaN:Date.parse(previous?.updatedAt);
 if(value===null||value<=0||!Number.isSafeInteger(time)||time<=0||now-time>30000||time-now>5000||Number.isFinite(previousTime)&&time<=previousTime)return null;
 const open=finite(data.open_24h),change=finite(data.P),high=finite(binance?data.h:data.high_24h),low=finite(binance?data.l:data.low_24h);
 return {venue:instrument.venue,symbol:instrument.symbol,price:value,change:change??(open>0?(value/open-1)*100:previous?.change??null),high:high>0?high:null,low:low>0?low:null,updatedAt:new Date(time).toISOString(),stale:false,source:'WebSocket'};
}
export function normalizeBook(data,limit=50){
 const read=levels=>Array.isArray(levels)&&levels.length>0?levels.slice(0,limit).map(x=>[finite(x?.[0]),finite(x?.[1])]):null;
 const bids=read(data?.bids),asks=read(data?.asks);
 if(!bids||!asks||[...bids,...asks].some(x=>x.some(v=>v===null||v<=0))||bids.some((x,i)=>i&&x[0]>=bids[i-1][0])||asks.some((x,i)=>i&&x[0]<=asks[i-1][0])||bids[0][0]>=asks[0][0])return null;
 return {bids,asks};
}

export function usableQuote(quote,instrument,now=Date.now()){
 const time=Date.parse(quote?.updatedAt);return quote&&quote.venue===instrument.venue&&quote.symbol===instrument.symbol&&quote.stale===false&&['WebSocket','REST'].includes(quote.source)&&Number.isFinite(quote.price)&&quote.price>0&&Number.isFinite(time)&&now-time<=30000&&time-now<=5000?quote:null;
}
