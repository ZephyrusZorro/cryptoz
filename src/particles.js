// Living middle-canvas particle field harmonized with CRYPTOZ dark & light liquid-glass wallpapers.
// Respects prefers-reduced-motion, data-motion="reduced", data-material="solid", and tab visibility.

const DARK_PALETTE = [
  [118, 184, 255], // sapphire
  [184, 146, 255], // amethyst
  [230, 240, 255], // starlight pearl
  [94, 234, 212],  // aqua sparkle
];

const LIGHT_PALETTE = [
  [37, 99, 235],   // crisp sapphire
  [124, 58, 237],  // luminous violet
  [2, 132, 199],   // cerulean
  [79, 70, 229],   // indigo accent
];

function isReduced(doc) {
  const pref = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return pref || doc.documentElement.dataset.motion === 'reduced';
}

function isSolid(doc) {
  return doc.documentElement.dataset.material === 'solid';
}

function isLight(doc) {
  return doc.documentElement.dataset.theme === 'light';
}

// Emphasize the blank middle band while fading gently near the bottom-left and top-right ribbon corners.
function middleMask(nx, ny) {
  const blDist = Math.hypot(nx - 0.06, ny - 0.94);
  const trDist = Math.hypot(nx - 0.94, ny - 0.06);
  const cornerClear = Math.min(1, Math.max(0, (Math.min(blDist, trDist) - 0.16) / 0.28));
  const edgeClear = Math.min(1, Math.min(nx, 1 - nx, ny, 1 - ny) / 0.06);
  return cornerClear * edgeClear;
}

export function mountParticles(doc = globalThis.document) {
  if (!doc || typeof window === 'undefined') return () => {};
  const canvas = doc.querySelector('.ambient-particles');
  if (!canvas || typeof canvas.getContext !== 'function') return () => {};
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return () => {};

  let width = 0, height = 0, dpr = 1;
  let particles = [];
  let frame = 0;
  let lastTime = 0;
  let running = false;
  let pointer = { x: -9999, y: -9999, active: false };

  function makeParticle(randomY = true) {
    const isBokeh = Math.random() < 0.22;
    const x = Math.random() * width;
    const y = randomY ? Math.random() * height : height + 10 + Math.random() * 24;
    return {
      x,
      y,
      vx: (Math.random() - 0.44) * (isBokeh ? 7 : 11),
      vy: -(isBokeh ? 5 + Math.random() * 7 : 8 + Math.random() * 14),
      r: isBokeh ? 3.2 + Math.random() * 2.6 : 1.15 + Math.random() * 1.45,
      bokeh: isBokeh,
      colorIdx: Math.floor(Math.random() * 4),
      phase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.7 + Math.random() * 1.25,
      swayAmp: 6 + Math.random() * 12,
      swayFreq: 0.28 + Math.random() * 0.45,
    };
  }

  function resize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const targetCount = width <= 700 ? 32 : 56;
    if (particles.length < targetCount) {
      while (particles.length < targetCount) particles.push(makeParticle(true));
    } else if (particles.length > targetCount) {
      particles.length = targetCount;
    }
  }

  function step(now) {
    frame = 0;
    if (!running) return;
    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
    lastTime = now;
    const t = now * 0.001;

    ctx.clearRect(0, 0, width, height);
    const light = isLight(doc);
    const palette = light ? LIGHT_PALETTE : DARK_PALETTE;
    const linkDist = width <= 700 ? 92 : 122;
    const linkDistSq = linkDist * linkDist;

    const coords = new Array(particles.length);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += (p.vx + Math.sin(t * p.swayFreq + p.phase) * p.swayAmp * 0.35) * dt;
      p.y += p.vy * dt;

      if (pointer.active && !p.bokeh) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 4 && d2 < 16000) {
          const push = (1 - Math.sqrt(d2) / 126) * 28 * dt;
          p.x += (dx / Math.sqrt(d2)) * push;
          p.y += (dy / Math.sqrt(d2)) * push;
        }
      }

      if (p.y < -18) {
        p.y = height + 14;
        p.x = Math.random() * width;
      } else if (p.y > height + 28) {
        p.y = -12;
      }
      if (p.x < -18) p.x = width + 14;
      else if (p.x > width + 18) p.x = -14;

      const mask = middleMask(p.x / width, p.y / height);
      const twinkle = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(t * p.twinkleSpeed + p.phase));
      const baseAlpha = p.bokeh
        ? (light ? 0.16 : 0.17)
        : (light ? 0.56 : 0.68);
      const alpha = mask * twinkle * baseAlpha;
      coords[i] = { x: p.x, y: p.y, alpha, mask, p };
    }

    // Subtle harmonic connecting filaments between close middle-area crisp motes
    ctx.lineWidth = light ? 0.75 : 0.65;
    for (let i = 0; i < coords.length; i++) {
      const a = coords[i];
      if (a.p.bokeh || a.mask < 0.25) continue;
      for (let j = i + 1; j < coords.length; j++) {
        const b = coords[j];
        if (b.p.bokeh || b.mask < 0.25) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= linkDistSq) continue;
        const proximity = 1 - Math.sqrt(d2) / linkDist;
        const lineAlpha = proximity * Math.min(a.mask, b.mask) * (light ? 0.17 : 0.15);
        if (lineAlpha < 0.015) continue;
        const rgb = palette[a.p.colorIdx];
        ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${lineAlpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Draw particles with crisp core + soft radial halo
    for (let i = 0; i < coords.length; i++) {
      const { x, y, alpha, p } = coords[i];
      if (alpha < 0.018) continue;
      const [r, g, b] = palette[p.colorIdx];
      const haloR = p.bokeh ? p.r * 3.1 : p.r * 3.8;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, haloR);
      grad.addColorStop(0, `rgba(${r},${g},${b},${(alpha * (p.bokeh ? 0.58 : 0.85)).toFixed(3)})`);
      grad.addColorStop(0.38, `rgba(${r},${g},${b},${(alpha * 0.28).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, haloR, 0, Math.PI * 2);
      ctx.fill();

      if (!p.bokeh) {
        ctx.fillStyle = light
          ? `rgba(${r},${g},${b},${Math.min(0.88, alpha * 1.18).toFixed(3)})`
          : `rgba(244,248,255,${Math.min(0.95, alpha * 1.25).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, p.r * 0.62, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    frame = requestAnimationFrame(step);
  }

  function syncState() {
    const shouldRun = !doc.hidden && !isReduced(doc) && !isSolid(doc);
    if (shouldRun && !running) {
      running = true;
      lastTime = 0;
      resize();
      frame = requestAnimationFrame(step);
    } else if (!shouldRun && running) {
      running = false;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      ctx.clearRect(0, 0, width, height);
    } else if (!shouldRun) {
      ctx.clearRect(0, 0, width, height);
    }
  }

  const pointerFine = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  const onPointerMove = e => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true; };
  const onPointerLeave = () => { pointer.active = false; };
  const onResize = () => { if (running) resize(); };
  const reducedMq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const observer = typeof MutationObserver !== 'undefined'
    ? new MutationObserver(syncState)
    : null;

  observer?.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-motion', 'data-material'] });
  doc.addEventListener('visibilitychange', syncState);
  window.addEventListener('resize', onResize, { passive: true });
  reducedMq?.addEventListener?.('change', syncState);
  if (pointerFine) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    doc.addEventListener('pointerleave', onPointerLeave, { passive: true });
  }

  syncState();

  return () => {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    observer?.disconnect();
    doc.removeEventListener('visibilitychange', syncState);
    window.removeEventListener('resize', onResize);
    reducedMq?.removeEventListener?.('change', syncState);
    if (pointerFine) {
      window.removeEventListener('pointermove', onPointerMove);
      doc.removeEventListener('pointerleave', onPointerLeave);
    }
  };
}
