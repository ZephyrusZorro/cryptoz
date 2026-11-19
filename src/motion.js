const easing = 'cubic-bezier(.22,1,.36,1)';
const springEasing = 'cubic-bezier(.22,1.12,.36,1)';
const active = new WeakMap();

export function motionEnabled() {
  if (typeof document === 'undefined') return false;
  const reducedPref = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return document.documentElement.dataset.motion !== 'reduced' && !reducedPref;
}

function play(element, frames, duration, ease = easing, extra = {}) {
  if (!element?.animate) return;
  active.get(element)?.cancel();
  const animation = element.animate(frames, { duration, easing: ease, ...extra });
  active.set(element, animation);
  return animation;
}

export function dismissSurface(element) {
  if (!motionEnabled()) return false;
  const animation = play(element, [
    { opacity: 1, transform: 'translateY(0) scale(1)' },
    { opacity: 0, transform: 'translateY(6px) scale(.985)' }
  ], 150);
  if (!animation) return false;
  element.inert = true;
  element.style.pointerEvents = 'none';
  animation.finished.then(() => element.remove(), () => element.remove());
  return true;
}

export function reveal(element, { offset = 8, direction = 0, duration = 280 } = {}) {
  if (!element || !motionEnabled()) return;
  play(element, [
    { opacity: .45, transform: `translate3d(${direction * 14}px, ${offset}px, 0)` },
    { opacity: 1, transform: 'translate3d(0, 0, 0)' }
  ], duration);
}

export function staggerReveal(container, selector = ':scope > *', { offset = 9, step = 28, max = 7, duration = 290 } = {}) {
  if (!container || !motionEnabled()) return;
  const items = Array.from(container.querySelectorAll(selector)).slice(0, max);
  items.forEach((item, index) => {
    if (!item?.animate || item.hidden) return;
    play(item, [
      { opacity: .28, transform: `translate3d(0, ${offset}px, 0)` },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' }
    ], duration, easing, { delay: index * step, fill: 'backwards' });
  });
}

// Fluidly glide and morph a selection pill from its previous geometry to the newly selected tab.
export function moveSelection(previous, selected) {
  if (!selected || !motionEnabled()) return;
  const current = selected.getBoundingClientRect();
  if (!current.width || !current.height) return;
  const hasPrev = Boolean(previous?.width && previous?.height);
  const dx = hasPrev ? (previous.left + previous.width / 2) - (current.left + current.width / 2) : 0;
  const dy = hasPrev ? (previous.top + previous.height / 2) - (current.top + current.height / 2) : 0;
  const sx = hasPrev ? Math.max(.55, Math.min(1.65, previous.width / current.width)) : .92;
  const sy = hasPrev ? Math.max(.65, Math.min(1.5, previous.height / current.height)) : .92;
  play(selected, [
    { opacity: .62, transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})` },
    { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1, 1)' }
  ], 340, springEasing);
}

export function flashTick(element, direction) {
  if (!element?.animate || !direction || !motionEnabled()) return;
  const isUp = direction > 0;
  const tint = isUp ? 'rgba(81, 217, 176, 0.24)' : 'rgba(255, 137, 153, 0.24)';
  play(element, [
    { textShadow: `0 0 14px ${tint}`, opacity: .78 },
    { textShadow: '0 0 0 transparent', opacity: 1 }
  ], 460, 'ease-out');
}

// Subtle desktop-only parallax for the floating ambient wallpaper + specular glass hover glint.
export function mountAtmosphere(doc = globalThis.document) {
  if (!doc || typeof window === 'undefined' || typeof matchMedia !== 'function') return () => {};
  const pointerFine = matchMedia('(hover: hover) and (pointer: fine)');
  if (!pointerFine.matches) return () => {};

  let targetX = 0, targetY = 0, curX = 0, curY = 0, frame = 0;
  let lastGlowCard = null;
  const GLOW_SELECTOR = '.stat-card, .era-shortcuts a, .analyst-card, .market-insight-card, .live-quote, .bt-kpi-grid > div, .signal-card, .learning-shelf-tab';

  const tick = () => {
    frame = 0;
    if (!motionEnabled() || doc.documentElement.dataset.material === 'solid') return;
    curX += (targetX - curX) * 0.085;
    curY += (targetY - curY) * 0.085;
    const stage = doc.querySelector('.ambient-parallax');
    if (stage) {
      stage.style.transform = `translate3d(${curX.toFixed(2)}px, ${curY.toFixed(2)}px, 0)`;
    }
    if (Math.abs(targetX - curX) > 0.06 || Math.abs(targetY - curY) > 0.06) {
      frame = requestAnimationFrame(tick);
    }
  };

  const onMove = event => {
    if (!motionEnabled() || doc.documentElement.dataset.material === 'solid') return;
    const nx = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    const ny = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    targetX = -nx * 14;
    targetY = -ny * 10;
    if (!frame) frame = requestAnimationFrame(tick);

    const card = event.target?.closest?.(GLOW_SELECTOR);
    if (card !== lastGlowCard) {
      if (lastGlowCard) lastGlowCard.removeAttribute('data-glow');
      lastGlowCard = card;
    }
    if (card) {
      const rect = card.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const px = ((event.clientX - rect.left) / rect.width * 100).toFixed(1) + '%';
        const py = ((event.clientY - rect.top) / rect.height * 100).toFixed(1) + '%';
        card.style.setProperty('--spot-x', px);
        card.style.setProperty('--spot-y', py);
        card.setAttribute('data-glow', 'on');
      }
    }
  };

  const onLeave = () => {
    targetX = 0;
    targetY = 0;
    if (lastGlowCard) {
      lastGlowCard.removeAttribute('data-glow');
      lastGlowCard = null;
    }
    if (!frame) frame = requestAnimationFrame(tick);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  doc.addEventListener('pointerleave', onLeave, { passive: true });
  return () => {
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerleave', onLeave);
  };
}
