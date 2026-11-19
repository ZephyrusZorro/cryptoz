import {PHONE_LAYOUT} from './phone-layout.js';

const easing = 'cubic-bezier(.2,.78,.26,1)';
const liquidEasing = 'cubic-bezier(.22,1,.36,1)';
const active = new WeakMap();

export function usingLiquidGlass() {
  return document.documentElement.dataset.material === 'glass';
}

export function motionEnabled() {
  return document.documentElement.dataset.motion !== 'reduced' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function play(element, frames, duration, curve=easing) {
  if (!element?.animate) return;
  active.get(element)?.cancel();
  const animation=element.animate(frames,{duration,easing:curve});
  active.set(element,animation);
  return animation;
}

export function dismissSurface(element) {
  if(!motionEnabled())return false;
  const glass=usingLiquidGlass();
  const animation=play(element,[{opacity:1},{opacity:0}],glass?200:140);
  if(!animation)return false;
  if(glass){
    const offset=matchMedia(PHONE_LAYOUT).matches?27:7;
    play(element.querySelector('.modal'),[
      {transform:'none'},
      {transform:`translateY(${offset}px) scale(.98)`}
    ],200,liquidEasing);
  }
  element.inert=true;
  element.setAttribute('aria-hidden','true');
  element.style.pointerEvents='none';
  animation.finished.then(()=>element.remove(),()=>element.remove());
  return true;
}

export function reveal(element,{offset=7,direction=0,duration=290}={}) {
  if(!motionEnabled())return;
  if(usingLiquidGlass()){
    // Parent opacity would temporarily cut off the backdrop behind every card.
    play(element,[
      {transform:`translate(${direction*9}px, ${offset}px)`},
      {transform:'none'}
    ],duration,liquidEasing);
    return;
  }
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
  if(usingLiquidGlass()){
    const sx=previous?.width?previous.width/current.width:.94;
    const sy=previous?.height?previous.height/current.height:.94;
    play(selected,[
      {transformOrigin:'top left',opacity:.65,transform:`translate(${x}px, ${y}px) scale(${sx}, ${sy})`},
      {transformOrigin:'top left',opacity:1,transform:'scale(1.025, .985)',offset:.74},
      {transformOrigin:'top left',opacity:1,transform:'none'}
    ],380,liquidEasing);
    return;
  }
  play(selected,[
    {opacity:.48,transform:`translate(${x}px, ${y}px) scale(.92)`},
    {opacity:1,transform:'translate(0,0) scale(1)'}
  ],320);
}
