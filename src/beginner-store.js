import {GETTING_STARTED} from './beginner-content.js';
const KEY='cryptoz.learning.v1',ids=new Set(GETTING_STARTED.map(x=>x.id));
export function createLearningProgress(storage){
 let completed=new Set();try{const text=storage.getItem(KEY);if(text?.length>2048)throw Error('Oversized progress');const raw=JSON.parse(text);if(Array.isArray(raw?.completed))completed=new Set(raw.completed.filter(id=>ids.has(id)));}catch{}
 return {get count(){return completed.size;},has(id){return completed.has(id);},set(id,value){if(!ids.has(id)||typeof value!=='boolean')return false;if(value)completed.add(id);else completed.delete(id);try{storage.setItem(KEY,JSON.stringify({completed:[...completed]}));return true;}catch{return false;}}};
}
