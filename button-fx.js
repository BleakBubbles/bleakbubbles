// button-fx.js
// Small physical reactions on the freeze button, so pressing it and the ripple
// landing back in it feel like they have weight:
//   press(): the button squashes in and springs back, and a ring pulses out
//   tap():   a ring pulses out (pressing to unfreeze)
//   land():  a ring pulses out, and a puff of pixel dust
//            (tiny squares in the Tetris pastels) bursts straight out
//
// Everything is done with the Web Animations API on short-lived elements that
// remove themselves when finished. The button sits outside the frozen #app,
// so the freeze never pauses them.

import { PIECE_COLORS } from './shapes.js';

const DUST_COLORS = Object.values(PIECE_COLORS);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const rand = (a, b) => a + Math.random() * (b - a);

export function createButtonFx(btn) {
  // Effects layer, centred on the button and drawn outside its bounds.
  const layer = document.createElement('span');
  layer.className = 'fz-fx';
  layer.setAttribute('aria-hidden', 'true');
  btn.appendChild(layer);

  // The squash/pop goes on the face, ring and glow, not the button itself, so
  // it doesn't fight the hover/press transform in styles.css.
  const body = [...btn.querySelectorAll('.fz-face, .fz-ring, .fz-glow')];

  function bounce(frames, duration) {
    for (const el of body) el.animate(frames.map(s => ({ transform: `scale(${s})` })), { duration, easing: 'ease-out' });
  }

  // A ring the shape of the button that grows and fades.
  function pulse({ scale = 2.1, duration = 520, opacity = 0.7 } = {}) {
    const ring = document.createElement('span');
    ring.className = 'fz-pulse';
    layer.appendChild(ring);
    ring.animate(
      [{ transform: 'scale(1)', opacity }, { transform: `scale(${scale})`, opacity: 0 }],
      { duration, easing: 'cubic-bezier(.2,.7,.3,1)' },
    ).onfinish = () => ring.remove();
  }

  // Tiny pixel squares flung straight out from the button's rim, slowing as they fade (no gravity).
  function dust(count = 14) {
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'fz-dust';
      const size = Math.round(rand(3, 7));
      p.style.width = p.style.height = `${size}px`;
      p.style.background = DUST_COLORS[(Math.random() * DUST_COLORS.length) | 0];
      layer.appendChild(p);

      const angle = (i / count) * Math.PI * 2 + rand(-0.25, 0.25);
      const start = 30;                    // from the button's rim (it's 56px wide)
      const dist = rand(22, 52);
      const x0 = Math.cos(angle) * start, y0 = Math.sin(angle) * start;
      const x1 = Math.cos(angle) * (start + dist), y1 = Math.sin(angle) * (start + dist);
      const at = f => `translate(${x0 + (x1 - x0) * f}px, ${y0 + (y1 - y0) * f}px)`; // a point along the ray
      const spin = rand(-180, 180);
      p.animate(
        [
          { transform: `translate(${x0}px, ${y0}px) rotate(0deg) scale(1)`, opacity: 1 },
          { transform: `${at(0.3)} rotate(${spin * 0.3}deg) scale(1)`, opacity: 1, offset: 0.3 },
          // A long, soft tail: the dust stays visible most of the way, then fades and shrinks.
          { transform: `${at(0.7)} rotate(${spin * 0.7}deg) scale(.75)`, opacity: 0.6, offset: 0.7 },
          { transform: `translate(${x1}px, ${y1}px) rotate(${spin}deg) scale(.4)`, opacity: 0 },
        ],
        { duration: rand(1000, 1400), easing: 'cubic-bezier(.12,.6,.3,1)' },
      ).onfinish = () => p.remove();
    }
  }

  return {
    // Pressing to freeze: squash in, spring back, ring out.
    press() {
      if (reduceMotion.matches) return;
      bounce([1, 0.86, 1.08, 1], 380);
      pulse({ scale: 2.4, duration: 600, opacity: 0.55 });
    },
    // Pressing to unfreeze: just the ring out.
    tap() {
      if (reduceMotion.matches) return;
      pulse({ scale: 2.4, duration: 600, opacity: 0.55 });
    },
    // The ripple back arriving: ring out, pixel dust.
    land() {
      if (reduceMotion.matches) return;
      pulse({ scale: 1.9, duration: 480, opacity: 0.8 });
      dust();
    },
  };
}
