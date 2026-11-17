const KEY='cryptoz.drafts.v1',fields=['side','equity','riskPercent','entry','stop','target','feePercent'];
const validKey=key=>/^(binance|coinbase):[\p{L}\p{N}-]{2,30}$/u.test(key);
const riskValues=value=>Object.fromEntries(fields.flatMap(key=>typeof value?.[key]==='string'?[[key,value[key].slice(0,64)]]:[]));
export function createDraftStore(storage){
 let journal='',risks=new Map();try{const raw=JSON.parse(storage.getItem(KEY));journal=typeof raw?.journal==='string'?raw.journal.slice(0,4000):'';for(const [key,value] of Object.entries(raw?.risks??{}).slice(-20))if(validKey(key))risks.set(key,riskValues(value));}catch{}
 const persist=()=>{try{storage.setItem(KEY,JSON.stringify({journal,risks:Object.fromEntries(risks)}));return true;}catch{return false;}};
 return {get journal(){return journal;},get size(){return risks.size;},risk(key){return {...risks.get(key)};},setJournal(value){journal=String(value).slice(0,4000);return persist();},setRisk(key,value){if(!validKey(key))return false;risks.delete(key);risks.set(key,riskValues(value));if(risks.size>20)risks.delete(risks.keys().next().value);return persist();}};
}
