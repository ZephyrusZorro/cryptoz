import {asNumber} from './numbers.js';import {validInstrument} from './preferences.js';
export function appendPriceAlert(workspace,instrument,{direction,target},id){
 if(!validInstrument(instrument))throw Error('Choose a valid exchange instrument.');
 if(!['above','below'].includes(direction))throw Error('Choose an alert direction.');
 const value=asNumber(target);if(value===null||value<=0)throw Error('Enter a positive finite target price.');
 if(workspace.alerts.filter(a=>a.active).length>=10)throw Error('Maximum 10 active alerts. Pause one first.');
 if(workspace.alerts.length>=100)throw Error('Maximum 100 stored alerts. Remove an old alert first.');
 return {...workspace,alerts:[...workspace.alerts,{id,venue:instrument.venue,symbol:instrument.symbol,direction,target:value,active:true,last:null}]};
}
