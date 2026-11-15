import { createPixelFreeze } from './pixel-freeze.js';
import { createShapes, makeBag, PIECE_COLORS } from './shapes.js';
import { loadRepoDetails } from './repos.js';
import { drawFreezeIcon } from './freeze-icon.js';
import { createButtonFx } from './button-fx.js';

loadRepoDetails();

// ---------------------------------------------------------------------------
// "I build ___" colours, dealt from a Tetris-style 7-bag of the pastel piece
// colours (the same ones the flying Tetris pieces use).
// ---------------------------------------------------------------------------
const nextColor = makeBag(Object.values(PIECE_COLORS));

// The track shows words 0..3, then slides to word 4 (a copy of word 0) and
// jumps back to 0 at the same spot to loop. Each appearance gets a fresh
// colour, and word 0 must already match word 4 when the jump happens.
//
// Colours only change on words that are out of sight, at fixed points in the
// cycle read from the animation's own clock (so a freeze pausing it is fine):
//   ~10%, word 0 showing:  new colours for words 1-3
//   ~30%, word 1 showing:  a new colour for word 4, copied to word 0
// (Recolouring on 'animationiteration' instead made word 0 flash its old
// colour: the event lands a frame or so after the jump.)
const track = document.querySelector('.words-track');
const words = [...track.children];
const last = words.length - 1;
words.forEach(w => { w.style.color = nextColor(); });
words[0].style.color = words[last].style.color;
const done = { middle: 0, end: -1 };  // cycle numbers already handled (words 1-3 start fresh)
setInterval(() => {
  const anim = track.getAnimations()[0];
  if (!anim || anim.currentTime == null) return;
  const length = anim.effect.getComputedTiming().duration;
  const cycle = Math.floor(anim.currentTime / length);
  const at = (anim.currentTime % length) / length;
  if (at >= 0.08 && at < 0.2 && done.middle !== cycle) {
    done.middle = cycle;
    for (let i = 1; i < last; i++) words[i].style.color = nextColor();
  }
  if (at >= 0.28 && at < 0.4 && done.end !== cycle) {
    done.end = cycle;
    words[last].style.color = nextColor();
    words[0].style.color = words[last].style.color;
  }
}, 100);

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
drawFreezeIcon(btn.querySelector('.fz-grid'));
const fx = createButtonFx(btn);

const pf = createPixelFreeze({
  target: document.getElementById('app'),
  blockSize: 8,
  // The ripple back is an exact mirror of the freeze: the freeze grows the
  // ring with ease-out over 1.7s; played backwards that's ease-in (t²) over the
  // same 1.7s. (The glass distortion already mirrors.)
  thawDuration: 1700,
  thawEasing: t => t * t,
  onStateChange: state => {
    const frozen = state === 'frozen' || state === 'freezing';
    btn.setAttribute('aria-label', frozen ? 'Unpixelate the page' : 'Pixelate the page');
    btn.title = frozen ? 'Unpixelate' : 'Pixelate';
    syncBusy();

    if (state === 'freezing') {
      // JS-driven motion isn't paused by pixel-freeze, so hold the shapes here.
      shapes.stop();
    }
    if (state === 'thawing') {
      shapes.start();
    }
    // The ripple back has just closed into the button: ring out, pixel dust.
    if (state === 'idle') fx.land();
  },
});

// Freezing ripples out from wherever the button was clicked; the ripple back
// always starts from the button's centre, wherever on the button you click.
//
// The freeze's page snapshot (html2canvas) ties up the browser for a moment
// before the ripple can start, and the button's squash would wait with it. So
// the squash starts first, gets a couple of frames on screen, then the freeze
// begins. (~30ms later: too short to notice on the ripple.)
const nextFrame = () => new Promise(r => requestAnimationFrame(r));
//
// The button only works when the page is fully normal or fully frozen: while
// a ripple is running (or the intro), clicks and P are ignored, and .busy
// turns off the press look and the pointer cursor.
let introPlaying = false, pressing = false;
const isBusy = () => introPlaying || pressing || (pf.state !== 'idle' && pf.state !== 'frozen');
function syncBusy() { btn.classList.toggle('busy', isBusy()); }
async function toggle(origin) {
  if (isBusy()) return;
  if (pf.state === 'frozen') { fx.tap(); pf.unfreeze(btn); return; }
  pressing = true; syncBusy();
  fx.press();
  await nextFrame(); await nextFrame();
  pressing = false;
  pf.freeze(origin); // sets 'freezing', which keeps the button busy
}
btn.addEventListener('click', e => toggle(e));
window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey &&
      !(e.target instanceof HTMLInputElement)) {
    toggle(btn);
  }
});

// ---------------------------------------------------------------------------
// Intro: the page appears already pixelated, then ripples back to normal,
// shrinking into the freeze button (the thaw ripple closes in on its origin).
// A separate, throwaway freeze instance keeps the button's own freeze state
// out of it. #intro-cover hides the page until the snapshot
// is ready, so the unpixelated page never flashes first.
// ---------------------------------------------------------------------------
const INTRO_THAW = 1100;  // ms, the ripple back into the button
// Ease-in: the ring barely moves at first (so the pixelated page reads),
// then speeds up and snaps into the button. No separate pause needed.
const introEasing = t => t * t;

async function playIntro() {
  const cover = document.getElementById('intro-cover');
  const reveal = () => cover?.remove();
  if (!cover) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { reveal(); return; }

  introPlaying = true; syncBusy();
  let intro = null;
  try {
    // Snapshot only once the fonts and images are in, so the pixels match the page.
    await document.fonts.ready;
    await Promise.all([...document.images].filter(img => !img.complete)
      .map(img => new Promise(done => { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); })));

    intro = createPixelFreeze({
      target: document.getElementById('app'),
      blockSize: 8,
      freezeDuration: 0,          // straight to pixels, no ripple
      thawDuration: INTRO_THAW,
      thawEasing: introEasing,
      unfreezeOnClick: false,
      unfreezeOnEscape: false,
      onStateChange: state => {
        if (state === 'freezing') shapes.stop();
        if (state === 'thawing') shapes.start();
        if (state === 'idle') fx.land(); // the intro ripple lands in the button too
      },
    });
    await intro.freeze(btn);
    reveal();
    await intro.unfreeze(btn);
  } catch (err) {
    console.warn('Intro skipped:', err); // e.g. no WebGL: just show the page
  } finally {
    reveal();
    intro?.destroy();
    shapes.start();
    introPlaying = false; syncBusy();
  }
}
playIntro();
