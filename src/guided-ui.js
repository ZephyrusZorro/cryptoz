export function readDesk(storage){
 try{return storage.getItem('cryptoz.desk.v1')==='pro'?'pro':'basic';}catch{return 'basic';}
}
export function deskSwitch(mode){
 return `<div class="desk-switch" role="group" aria-label="Workspace mode">${[['basic','Basic'],['pro','Pro']].map(([id,title])=>`<button type="button" data-action="desk" data-mode="${id}" aria-pressed="${mode===id}">${title}</button>`).join('')}</div>`;
}
export function riskSection(quote){
 // The selected instrument is normalized by preferences; quote is still constrained at markup.
 const currency=quote==='USD'?'USD':'USDT';
 return `<section class="panel risk-panel guided-risk" id="risk-tools">
  <div class="panel-top"><h2>Trade inputs</h2></div>
  <div class="risk-example"><button class="button" type="button" data-action="risk-example">Try an example</button><small id="risk-example-status" aria-live="polite">Use sample prices to see how the numbers work.</small></div>
  <form id="risk-form">
   <fieldset><legend><span>1</span> Set a loss budget</legend><div class="risk-inputs">
    <label><span>Practice balance (<span id="risk-quote-label">${currency}</span>)</span><input name="equity" type="number" min="0" step="any" value="10000" required><small>Cash you’re modeling.</small></label>
    <label>Maximum loss (%)<input name="riskPercent" type="number" min="0" max="100" step="any" value="1" required><small>1% of 1,000 is 10.</small></label>
   </div></fieldset>
   <fieldset><legend><span>2</span> Set price levels</legend><div class="risk-inputs risk-levels">
    <label>Entry price<input name="entry" type="number" min="0" step="any" required placeholder="e.g. 100"><small>Where you would start.</small></label>
    <label>Stop price<input name="stop" type="number" min="0" step="any" required placeholder="e.g. 95"><small>Where the idea fails.</small></label>
    <label>Target price<input name="target" type="number" min="0" step="any" required placeholder="e.g. 110"><small>Where the idea plays out.</small></label>
   </div><button class="text-link" type="button" data-action="use-price">Use current price as entry</button></fieldset>
   <div class="risk-assumptions"><label>Direction<select name="side"><option value="long">Long (price rises)</option><option value="short">Short scenario (price falls)</option></select></label><label>Fee per side (%)<input name="feePercent" type="number" min="0" max="10" step="any" value="0.1" required></label></div>
   <div class="form-action"><button class="button primary" type="submit">Calculate position</button><button class="text-link" type="button" data-action="guide" data-guide="risk">Calculator help</button></div>
   <div id="risk-result" class="risk-result" role="status" aria-live="polite">The result includes fees at entry and exit. Actual fills can differ from your stop.</div>
  </form>
 </section>`;
}
