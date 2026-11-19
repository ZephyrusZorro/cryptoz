const easing = 'cubic-bezier(.22,1,.36,1)';
const active = new WeakMap();

export function motionEnabled() {
  if (typeof document === 'undefined') return false;
  const reducedPref = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return document.documentElement.dataset.motion !== 'reduced' && !reducedPref;
}

function play(element, frames, duration, ease = easing) {
  if (!element?.animate) return;
  active.get(element)?.cancel();
  const animation = element.animate(frames, { duration, easing: ease });
  active.set(element, animation);
  return animation;
}

export function dismissSurface(element) {
  if (!motionEnabled()) return false;
  const animation = play(element, [
    { opacity: 1, transform: 'translateY(0)' },
    { opacity: 0, transform: 'translateY(5px)' }
  ], 135);
  if (!animation) return false;
  element.inert = true;
  element.style.pointerEvents = 'none';
  animation.finished.then(() => element.remove(), () => element.remove());
  return true;
}

export function reveal(element, { offset = 5, direction = 0, duration = 210 } = {}) {
  if (!element || !motionEnabled()) return;
  play(element, [
    { opacity: .72, transform: `translate3d(${direction * 10}px, ${offset}px, 0)` },
    { opacity: 1, transform: 'translate3d(0, 0, 0)' }
  ], duration);
}

// Smoothly glide and resize an active selection pill from its previous geometry to the new tab.
export function moveSelection(previous, selected) {
  if (!selected || !motionEnabled()) return;
  const current = selected.getBoundingClientRect();
  if (!current.width || !current.height) return;
  const hasPrev = Boolean(previous?.width && previous?.height);
  const dx = hasPrev ? (previous.left + previous.width / 2) - (current.left + current.width / 2) : 0;
  const dy = hasPrev ? (previous.top + previous.height / 2) - (current.top + current.height / 2) : 0;
  const sx = hasPrev ? Math.max(.6, Math.min(1.55, previous.width / current.width)) : .95;
  const sy = hasPrev ? Math.max(.7, Math.min(1.4, previous.height / current.height)) : .95;
  play(selected, [
    { opacity: .7, transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})` },
    { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1, 1)' }
  ], 260, easing);
}

export function flashTick(element, direction) {
  if (!element?.animate || !direction || !motionEnabled()) return;
  play(element, [
    { opacity: .74 },
    { opacity: 1 }
  ], 320, 'ease-out');
}
