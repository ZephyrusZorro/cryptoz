import {mountLearning} from './learning.js';
import {mountBeginner} from './beginner.js';
const views=['start','readings','glossary'];
export function mountLearningHub(root,{instruments,hydrate,onChart,storage,initialView='start',onViewChange=()=>{},mountReadings=mountLearning,mountGuide=mountBeginner}){
 let child,view,disposed=false;
 root.innerHTML='<nav class="learning-view-tabs" aria-label="Learning views"><button data-learning-view="start">Getting started</button><button data-learning-view="readings">Signal readings</button><button data-learning-view="glossary">Glossary</button></nav><div class="learning-view-content"></div>';
 function select(next){if(disposed||!views.includes(next)||next===view)return;child?.dispose();view=next;onViewChange(view);for(const b of root.querySelectorAll('[data-learning-view]'))b.setAttribute('aria-pressed',String(b.dataset.learningView===view));const host=root.querySelector('.learning-view-content');host.innerHTML='';child=view==='readings'?mountReadings(host,{instruments,hydrate,onChart}):mountGuide(host,{storage,hydrate,view});}
 const click=event=>{const button=event.target.closest('[data-learning-view]');if(button)select(button.dataset.learningView);};root.addEventListener('click',click);select(views.includes(initialView)?initialView:'start');hydrate();
 return {refresh(){return child?.refresh?.();},updateInstruments(){child?.updateInstruments?.();},applyTheme(){child?.applyTheme?.();},dispose(){disposed=true;child?.dispose();root.removeEventListener('click',click);}};
}
