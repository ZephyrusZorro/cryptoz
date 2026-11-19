import {planRisk} from './analytics.js';
import {asNumber} from './numbers.js';
import {esc,num,price} from './ui.js';
import {moneyMarkup} from './currency.js';

export function mountRiskCalculator({form,output,getInstrument,onDraft,readValues=()=>Object.fromEntries(new FormData(form))}){
 function invalidate(){output.textContent='Inputs changed. Calculate again to update the estimate.';}
 function edited(){onDraft();invalidate();}
 function calculate(){
  const raw=readValues(),values={side:raw.side};for(const key of ['equity','riskPercent','entry','stop','target','feePercent'])values[key]=asNumber(raw[key]);
  try{
   const r=planRisk(values),instrument=getInstrument(),base=esc(instrument.base);
   const amount=value=>moneyMarkup(value,instrument.quote,'parallel');
   output.innerHTML=`<div class="risk-metrics"><span>Position size<strong>${price(r.quantity,'')} ${base}</strong></span><span>Estimated loss at stop<strong>${amount(r.potentialLoss)}</strong></span><span>Net result at target<strong class="${r.potentialGain>0?'positive':'negative'}">${amount(r.potentialGain)}</strong></span><span>Reward / risk<strong>${num(r.rewardRisk,3)} : 1</strong></span><span>Entry cost + fee<strong>${amount(r.entryCost)}</strong></span><span>Break-even win rate<strong>${r.breakEvenWinRate===null?'Not attainable':num(r.breakEvenWinRate)+'%'}</strong></span></div><p>${r.capitalExceeded?'<span class="negative">Entry cost exceeds equity. Reduce the scenario size or revise your inputs.</span>':'Entry cost is within the entered equity.'} ${r.potentialGain<=0?'<span class="negative">The target move does not cover the selected fees.</span>':''}</p><p>Loss assumes execution at your stop and the stated fees. Slippage, funding and liquidation are excluded. Break-even assumes repeated identical wins/losses; it is not an estimated success rate.${values.side==='short'?' Short scenarios require borrowing or derivatives; this tool does not enable short selling.':''} No order is placed.</p>`;
  }catch(error){output.textContent=error.message;}
 }
 function submit(event){event.preventDefault();calculate();}
 form.addEventListener('submit',submit);form.addEventListener('input',edited);form.addEventListener('change',edited);
 return {calculate,invalidate,dispose(){form.removeEventListener('submit',submit);form.removeEventListener('input',edited);form.removeEventListener('change',edited);}};
}
