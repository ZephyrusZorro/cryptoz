const easing = 'cubic-bezier(.2,.78,.26,1)';
const active = new WeakMap();

export function motionEnabled() {
  return document.documentElement.dataset.motion !== 'reduced' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function play(element, frames, duration) {
  if (!element?.animate) return;
  active.get(element)?.cancel();
  const animation=element.animate(frames,{duration,easing});
  active.set(element,animation);
  return animation;
}

export function dismissSurface(element) {
  if(!motionEnabled())return false;
  const animation=play(element,[{opacity:1},{opacity:0}],140);
  if(!animation)return false;
  element.inert=true;
  element.style.pointerEvents='none';
  animation.finished.then(()=>element.remove(),()=>element.remove());
  return true;
}

export function reveal(element,{offset=7,direction=0,duration=290}={}) {
  if(!motionEnabled())return;
  play(element,[
    {opacity:.68,transform:`translate(${direction*12}px, ${offset}px)`},
    {opacity:1,transform:'translate(0, 0)'}
  ],duration);
}

// Animate the selected surface from the geometry of its previous position.
export function moveSelection(previous, selected) {
  if(!selected||!motionEnabled())return;
  const current=selected.getBoundingClientRect();
  if(!current.width||!current.height)return;
  const x=previous?.width?previous.left-current.left:0;
  const y=previous?.height?previous.top-current.top:0;
  play(selected,[
    {opacity:.48,transform:`translate(${x}px, ${y}px) scale(.92)`},
    {opacity:1,transform:'translate(0,0) scale(1)'}
  ],320);
}
