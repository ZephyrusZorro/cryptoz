import {GETTING_STARTED,searchGlossary,LEARNING_SOURCES} from './beginner-content.js';
import {createLearningProgress} from './beginner-store.js';
import {esc,icon} from './ui.js';
const sources=()=>`<details class="learning-sources"><summary>Educational references</summary><div>${LEARNING_SOURCES.map(s=>`<a href="${s.href}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ${icon('external-link')}</a>`).join('')}</div></details>`;
export function renderFoundations(){
 const topics=[
  ['Market basics','A trading pair has a base asset and a quote currency. BTC/USDT tells you how many USDT buy one BTC on that exchange. Check the pair, venue and timestamp before comparing prices.','#markets','Compare prices'],
  ['Order types and fees','A market order prioritizes filling. A limit order waits for a specified price and may never fill. Spread, fees and liquidity all affect the final price.','#practice','Try a paper order'],
  ['Reading a price move','Start with candle closes and ranges, then check whether volume increased. Indicators summarize history. Several indicators derived from the same closes provide overlapping evidence.','#learn?view=readings','Read a live example'],
  ['Risk and practice','A stop is a decision level. Real fills can slip past it. Model your loss and exit before practicing, then compare simulated fills with your assumptions.','#risk','Open the calculator'],
  ['Custody and verification','Confirm the token identity and network before transferring funds. Keep recovery phrases private. Verify publisher links, then distinguish an exchange price from a token-wide estimate.','#news','Find original news links']
 ];
 return `<section class="panel lesson-primer"><div class="panel-top"><div><h2>Crypto foundations</h2><p>Open a topic to read the essentials and try it in the workspace.</p></div></div><div class="foundation-topics">${topics.map(([title,body,href,action])=>`<details class="guide-disclosure"><summary>${title}</summary><p>${body}</p><a class="text-link" href="${href}">${action} ${icon('arrow-up-right')}</a></details>`).join('')}</div></section>${sources()}`;
}
export function mountBeginner(root,{storage,hydrate,view='start',progress=createLearningProgress(storage)}){
 const events=new AbortController();
 if(view==='glossary'){
  root.innerHTML=`<section class="panel glossary-panel"><div class="panel-top"><div><h2>Crypto glossary</h2><p>Plain explanations for the tools you use.</p></div></div><label class="search-field">${icon('search')}<input type="search" id="glossary-search" aria-label="Search glossary" placeholder="Search a term or abbreviation" maxlength="100"></label><p class="source glossary-count" role="status"></p><dl class="glossary-grid"></dl></section>${sources()}`;
  const render=()=>{const results=searchGlossary(root.querySelector('#glossary-search').value);root.querySelector('.glossary-count').textContent=results.length?`${results.length} ${results.length===1?'term':'terms'}`:'No matching terms. Try another word.';root.querySelector('.glossary-grid').innerHTML=results.map(t=>`<div><dt>${esc(t.term)}</dt><dd>${esc(t.definition)}</dd></div>`).join('');};
  root.querySelector('#glossary-search').addEventListener('input',render,{signal:events.signal});render();
 }else{
  const total=GETTING_STARTED.length;
  root.innerHTML=`<section class="panel getting-started"><div class="panel-top"><div><h2>Your first research session</h2><p>Pick a coin and work through the checklist at your own pace.</p></div><output class="learning-progress" aria-live="polite">${progress.count} / ${total} reviewed</output></div><div class="learning-progress-track" role="progressbar" aria-label="Research steps reviewed" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${progress.count}"><span style="width:${progress.count/total*100}%"></span></div><ol class="research-steps">${GETTING_STARTED.map(s=>`<li><span class="step-icon" aria-hidden="true">${icon(s.icon)}</span><div class="step-content"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p><a href="${s.href}" class="text-link">${esc(s.action)} ${icon('arrow-up-right')}</a></div><label class="step-check"><input type="checkbox" data-progress-id="${s.id}" ${progress.has(s.id)?'checked':''} aria-label="Mark ${esc(s.title)} reviewed"><span>Reviewed</span></label></li>`).join('')}</ol><div class="panel-bottom"><span id="learning-save-status" role="status">Checklist progress stays on this browser.</span></div></section>${sources()}`;
  root.addEventListener('change',event=>{const id=event.target.dataset?.progressId;if(!id)return;const saved=progress.set(id,event.target.checked);root.querySelector('.learning-progress').textContent=`${progress.count} / ${total} reviewed`;const bar=root.querySelector('[role="progressbar"]');bar.setAttribute('aria-valuenow',progress.count);bar.querySelector('span').style.width=progress.count/total*100+'%';root.querySelector('#learning-save-status').textContent=saved?'Progress saved on this browser.':'Progress retained for this visit. Browser storage is unavailable.';},{signal:events.signal});
 }
 hydrate();return {dispose(){events.abort();}};
}
