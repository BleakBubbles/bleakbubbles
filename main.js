import { createPixelFreeze } from './pixel-freeze.js';
import { createShapes, makeBag, PIECE_COLORS } from './shapes.js';
import { loadRepoDetails } from './repos.js';
import { createFreezeIcon } from './freeze-icon.js';

loadRepoDetails();

// ---------------------------------------------------------------------------
// "I build ___" colours, dealt from a Tetris-style 7-bag of the pastel piece
// colours (the same ones the flying Tetris pieces use).
// ---------------------------------------------------------------------------
const nextColor = makeBag(Object.values(PIECE_COLORS));

// The track shows words 0..3, then slides to word 4 (a copy of word 0) and
// loops back to 0 at the same spot. Each appearance gets a fresh colour; on
// each loop, word 0 inherits word 4's colour so the visible word doesn't flip.
const words = [...document.querySelectorAll('.words-track span')];
words.forEach(w => { w.style.color = nextColor(); });
document.querySelector('.words-track').addEventListener('animationiteration', () => {
  words[0].style.color = words[words.length - 1].style.color;
  for (let i = 1; i < words.length; i++) words[i].style.color = nextColor();
});

// ---------------------------------------------------------------------------
// Header links glide to their section. Done here rather than with CSS
// `scroll-behavior: smooth`: html2canvas copies the page into a hidden frame
// and scrolls the copy to the current position, and the CSS rule would make
// that scroll animate too, so freeze snapshots taken below the top came out
// without the flying shapes.
// ---------------------------------------------------------------------------
const smoothScroll = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelectorAll('.nav a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const target = document.querySelector(a.getAttribute('href'));
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: smoothScroll ? 'smooth' : 'auto' });
  history.pushState(null, '', a.getAttribute('href'));
}));

// ---------------------------------------------------------------------------
// Flying shapes
// ---------------------------------------------------------------------------
const shapes = createShapes(document.getElementById('shapes'), {
  front: document.getElementById('shapes-front'),
  frontFrom: 0.5, // the nearer half of the shapes fly in front of the content
});
shapes.start();

// ---------------------------------------------------------------------------
// Freeze
// ---------------------------------------------------------------------------
const btn = document.getElementById('freeze');
const icon = createFreezeIcon(btn.querySelector('.fz-grid'));

const pf = createPixelFreeze({
  target: document.getElementById('app'),
  blockSize: 8,
  onStateChange: state => {
    const frozen = state === 'frozen' || state === 'freezing';
    btn.setAttribute('aria-label', frozen ? 'Unfreeze the page' : 'Freeze the page');
    btn.title = frozen ? 'Back to the real world (P)' : 'Freeze (P)';

    if (state === 'freezing') {
      // JS-driven motion isn't paused by pixel-freeze, so hold the shapes here.
      shapes.stop();
      // pixel-freeze pauses every CSS animation on the page right after this
      // callback, in the same task. A microtask runs just after that pause:
      // keep the button's border spinning.
      queueMicrotask(() => btn.getAnimations({ subtree: true }).forEach(a => a.play()));
      // The icon builds alongside the ripple (~1.7s): pixels drop away, a voxel cube stacks up.
      icon.set(true, 1600);
    }
    if (state === 'thawing') {
      shapes.start();
      icon.set(false, 1200); // and comes apart alongside the thaw ripple (~1.3s)
    }
  },
});

btn.addEventListener('click', e => pf.toggle(e));
window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey &&
      !(e.target instanceof HTMLInputElement)) {
    pf.toggle(btn);
  }
});
