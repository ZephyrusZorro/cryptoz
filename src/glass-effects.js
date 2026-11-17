// One decorative sheen per animation frame; never attached to a financial canvas.
export function installGlassEffects(){
 let target=null,frame=0,event=null;
 const clear=()=>{target?.classList.remove('glass-active');target=null;};
 const enabled=()=>innerWidth>760&&matchMedia('(hover: hover) and (pointer: fine)').matches&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&document.documentElement.dataset.motion!=='reduced';
 document.addEventListener('pointermove',e=>{
  if(!enabled()){clear();return;}event=e;if(frame)return;
  frame=requestAnimationFrame(()=>{frame=0;const next=event.target.closest?.('.sidebar,.stat-card,.news-reading-panel,.modal');if(next!==target){clear();target=next;target?.classList.add('glass-active');}if(target){const r=target.getBoundingClientRect();target.style.setProperty('--sheen-x',(event.clientX-r.left-120)+'px');target.style.setProperty('--sheen-y',(event.clientY-r.top-120)+'px');}});
 },{passive:true});
 document.addEventListener('scroll',clear,{passive:true,capture:true});document.addEventListener('pointerleave',clear,{passive:true});
 return ()=>{cancelAnimationFrame(frame);clear();};
}
