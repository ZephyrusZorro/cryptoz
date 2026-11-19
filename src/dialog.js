export function createDialogController({root,background,document:doc=globalThis.document,onClose=()=>{},hydrate=()=>{},fallbackFocus=()=>null,animateExit}){
 let open=false,previousFocus,previousInert=false,previousOverflow='',controller,revision=0;
 const focusable=()=>[...root.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length>0);
 function close({restoreFocus=true}={}){
  if(!open)return;open=false;revision++;controller?.abort();doc.removeEventListener('keydown',keydown,true);
  if(!restoreFocus||!animateExit?.(root.firstElementChild))root.innerHTML='';
  background.inert=previousInert;doc.body.style.overflow=previousOverflow;onClose();
  if(restoreFocus){const target=previousFocus?.isConnected&&previousFocus.getClientRects().length?previousFocus:fallbackFocus();target?.focus({preventScroll:true});}
 }
 function keydown(event){
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
  if(event.key!=='Tab')return;const fields=focusable(),first=fields[0],last=fields.at(-1);if(!first){event.preventDefault();return;}
  if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
 }
 return {get isOpen(){return open;},get signal(){return controller?.signal;},close,
  open(title,content,wide=false){
   if(!open){previousFocus=doc.activeElement;previousInert=background.inert;previousOverflow=doc.body.style.overflow;}else{controller?.abort();doc.removeEventListener('keydown',keydown,true);}
   controller=new AbortController();open=true;const current=++revision;background.inert=true;doc.body.style.overflow='hidden';
   root.innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Close dialog"><i data-lucide="x"></i></button></div><div class="modal-body">${content}</div></section></div>`;
   hydrate();doc.addEventListener('keydown',keydown,true);
   queueMicrotask(()=>{
    if(!open||revision!==current)return;
    const fields=focusable();
    if(!fields.includes(doc.activeElement))fields[0]?.focus();
   });
  }
 };
}
