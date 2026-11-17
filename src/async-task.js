export const abortReason=signal=>signal?.reason??new DOMException('Operation cancelled','AbortError');
export function throwIfAborted(signal){if(signal?.aborted)throw abortReason(signal);}
export function abortable(task,signal){
 if(!signal)return Promise.resolve(task);if(signal.aborted)return Promise.reject(abortReason(signal));
 return new Promise((resolve,reject)=>{const cancel=()=>reject(abortReason(signal));signal.addEventListener('abort',cancel,{once:true});Promise.resolve(task).then(resolve,reject).finally(()=>signal.removeEventListener('abort',cancel));});
}
export function deadline(parent,milliseconds){
 const controller=new AbortController(),cancel=()=>controller.abort(abortReason(parent));
 if(parent?.aborted)cancel();else parent?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>controller.abort(new DOMException('Provider request timed out','TimeoutError')),milliseconds);timer.unref?.();
 return {signal:controller.signal,dispose(){clearTimeout(timer);parent?.removeEventListener('abort',cancel);}};
}
