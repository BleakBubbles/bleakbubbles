import { createPixelFreeze } from './pixel-freeze.js';
import { createShapes } from './shapes.js';
import { loadRepoDetails } from './repos.js';

loadRepoDetails();

// ---------------------------------------------------------------------------
// "I build ___" colours, dealt from a Tetris-style 7-bag: the seven piece
// colours are shuffled into a bag and dealt one by one; when the bag is empty
// it's refilled and reshuffled. Pastel versions of the Tetris piece colours,
// matching the flying shapes (shapes.js uses the same values).
// ---------------------------------------------------------------------------
const PIECES = {
  I: '#2ee6ff', O: '#ffd166', T: '#b388ff', S: '#4dd4ac',
  Z: '#ff6b6b', J: '#6c8cff', L: '#ffa45c',
};
function makeBag(colors) {
  let bag = [];
  return () => {
    if (!bag.length) {
      bag = [...colors];
      for (let i = bag.length - 1; i > 0; i--) {           // Fisher–Yates
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  };
}
const nextColor = makeBag(Object.values(PIECES));

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
const btnIcon = btn.querySelector('.fz-icon');
const btnLabel = btn.querySelector('.fz-label');

const pf = createPixelFreeze({
  target: document.getElementById('app'),
  blockSize: 8,
  onStateChange: state => {
    const frozen = state === 'frozen' || state === 'freezing';
    btnIcon.textContent = frozen ? '▶' : '⏸';
    btnLabel.textContent = frozen ? 'Unfreeze' : 'Freeze';
    btn.setAttribute('aria-label', frozen ? 'Unfreeze the page' : 'Freeze the page');
    // JS-driven motion isn't paused by pixel-freeze, so hold it here.
    if (state === 'freezing') shapes.stop();
    if (state === 'thawing') shapes.start();
  },
});

btn.addEventListener('click', e => pf.toggle(e));
window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey &&
      !(e.target instanceof HTMLInputElement)) {
    pf.toggle(btn);
  }
});
