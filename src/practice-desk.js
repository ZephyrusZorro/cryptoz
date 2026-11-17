import {api} from './api.js';
import {bindPaperPanel,paperPanel} from './paper-panel.js';
import {esc} from './ui.js';
import {selectVenueInstrument} from './preferences.js';

export function mountPracticeDesk({root,instrument,getInstruments,storage,onInstrument,request=api,hydrate=()=>{}}){
 const scope=new AbortController();let market=instrument,session,pending,quote=null;
 root.innerHTML=`<div class="practice-controls"><label>Exchange<select id="practice-venue"><option value="binance">Binance</option><option value="coinbase">Coinbase</option></select></label><label>Trading pair<select id="practice-pair"></select></label><button class="button" id="practice-refresh" type="button">Refresh quote</button><p class="data-note" id="practice-status" role="status">Connecting to the selected exchange…</p></div><div class="practice-ledger" id="practice-ledger"></div>`;
 const venue=root.querySelector('#practice-venue'),pair=root.querySelector('#practice-pair'),badge=root.querySelector('#practice-status');
 const say=message=>{if(badge.textContent!==message)badge.textContent=message;};
 const options=()=>{
  venue.value=market.venue;const list=[...getInstruments(market.venue)];
  if(!list.some(i=>i.symbol===market.symbol))list.unshift(market);
  pair.innerHTML=list.sort((a,b)=>a.base.localeCompare(b.base)).map(x=>`<option value="${esc(x.symbol)}">${esc(x.base)}/${esc(x.quote)}</option>`).join('');
  pair.value=market.symbol;
 };
 async function refresh(){
  if(pending)return pending;
  const controller=session,i=market;if(!controller||controller.signal.aborted)return;
  const task=request('ticker?venue='+i.venue+'&symbol='+encodeURIComponent(i.symbol),{signal:controller.signal})
   .then(r=>{
    if(controller.signal.aborted||controller!==session)return;
    const value=Number(r.data?.lastPrice??r.data?.last),raw=r.data?.observedAt,updated=Date.parse(raw),now=Date.now();
    if(r.cache==='stale'||!Number.isFinite(value)||value<=0||!Number.isFinite(updated)||updated-now>5000||now-updated>30000){quote=null;say('No recent trade quote. Simulated orders are paused.');return;}
    if(updated<Date.parse(quote?.updatedAt))return;
    quote={venue:i.venue,symbol:i.symbol,price:value,source:'REST',stale:false,updatedAt:new Date(updated).toISOString()};
    say('Using a fresh exchange trade quote. Orders are simulated locally.');
   })
   .catch(()=>{if(!controller.signal.aborted&&controller===session){quote=null;say('Quote unavailable. Refresh or select another pair.');}})
   .finally(()=>{if(pending===task)pending=null;});
  pending=task;return task;
 }
 function choose(next){
  session?.abort();session=new AbortController();quote=null;pending=null;market=next;
  say('Connecting to the selected exchange…');options();onInstrument(market);
  const host=root.querySelector('#practice-ledger');host.innerHTML=paperPanel(market);
  bindPaperPanel({host,instrument:market,getQuote:()=>quote,storage,signal:session.signal});hydrate();
  refresh();
 }
 venue.addEventListener('change',()=>choose(selectVenueInstrument(market,getInstruments(venue.value),venue.value)),{signal:scope.signal});
 pair.addEventListener('change',()=>{const i=getInstruments(market.venue).find(x=>x.symbol===pair.value);if(i)choose(i);},{signal:scope.signal});
 root.querySelector('#practice-refresh').addEventListener('click',refresh,{signal:scope.signal});
 choose(instrument);const timer=setInterval(()=>{if(!document.hidden)refresh();},8000);
 return {refresh,options,currentQuote:()=>quote,dispose(){scope.abort();session?.abort();clearInterval(timer);}};
}
