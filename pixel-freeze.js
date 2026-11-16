// pixel-freeze.js
// Freezes the visible page into a pixel-art frame with a liquid-glass ripple,
// and thaws it back with the reverse ripple.
//
// How it works:
//   1. Pause CSS animations / videos so the moment is held still.
//   2. Snapshot the visible viewport of `target` with html2canvas.
//   3. Draw that snapshot through a WebGL fragment shader on a fixed overlay
//      canvas: a glass ring expands from the origin, refracting the page, and
//      everything behind it is pixelated.
//   4. While frozen, the page underneath is locked (no scroll, inert).
//   5. Unfreeze plays the ripple in reverse from a new origin and hands the
//      live page back. The HD snapshot is still in the GPU texture, so the
//      reverse starts instantly.
//
// Requires html2canvas (npm i html2canvas), passed in via the `html2canvas`
// option or available as window.html2canvas.

const U0 = 0.86;   // ring centre as a fraction of the ring image radius
const HW = 0.13;   // ring half-width, same units

const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}';

const FS = `precision highp float;
uniform sampler2D T;
uniform vec2 V;      // viewport size, CSS px
uniform vec2 O;      // viewport origin in target coords (keeps the grid aligned to the page)
uniform vec2 C;      // ripple centre, CSS px from viewport top-left
uniform float D;     // canvas pixels per CSS px
uniform float DPR;   // devicePixelRatio
uniform float R;     // ring centre radius, CSS px
uniform float B;     // block size, CSS px
uniform float AMP;   // refraction strength, CSS px
uniform float PAL;   // 1 = limit to 64 colours

vec3 hd(vec2 p){ return texture2D(T, clamp(p / V, vec2(0.0), vec2(1.0))).rgb; }
vec3 pq(vec3 c){ return PAL > 0.5 ? min(floor(c * 4.0), vec3(3.0)) / 3.0 : c; }

// One colour per block, taken from the block centre (max of a 2x2 device-pixel
// patch when the block is an even number of device pixels wide).
vec3 px(vec2 p, float b){
  if (b < 2.5) return pq(hd(p));
  vec2 q = (floor((p + O) / b) + 0.5) * b - O;
  if (mod(floor(b * DPR + 0.5), 2.0) > 0.5) return pq(hd(q));
  float k = 0.5 / DPR;
  vec3 m = max(max(hd(q + vec2(-k, -k)), hd(q + vec2(k, -k))),
               max(hd(q + vec2(-k,  k)), hd(q + vec2(k,  k))));
  return pq(m);
}

vec3 base(vec2 s){ return distance(s, C) < R ? px(s, B) : hd(s); }

void main(){
  vec2 p = vec2(gl_FragCoord.x, V.y * D - gl_FragCoord.y) / D;
  float d = distance(p, C);
  float hw = R * ${(HW / U0).toFixed(4)};
  // Outside the ring the overlay is transparent, so the live page shows through.
  if (d > R + hw) { gl_FragColor = vec4(0.0); return; }

  vec2 dir = d > 0.001 ? (p - C) / d : vec2(0.0);
  float q = (d - R) / hw, h = 0.0, g = 0.0, dh = 0.0;
  if (abs(q) < 1.0) {
    float c = cos(q * 1.5708);
    h = c * c;                                  // bump height
    g = -sin(3.14159 * q);                      // refraction direction/amount
    dh = -(1.5708 / hw) * sin(3.14159 * q);     // slope, for the highlight
  }
  vec2 off = dir * g * AMP * 0.5;
  // Slightly different refraction per channel = chromatic fringe.
  vec3 col = vec3(base(p + off * 1.14).r, base(p + off).g, base(p + off * 0.86).b);

  vec3 n = normalize(vec3(-(0.12 * R / ${U0.toFixed(2)}) * dh * dir, 1.0));
  vec3 H = normalize(normalize(vec3(-0.55, -0.55, 0.63)) + vec3(0.0, 0.0, 1.0));
  float sp = clamp(1.1 * pow(max(dot(n, H), 0.0), 22.0) * h, 0.0, 1.0);
  gl_FragColor = vec4(mix(col, vec3(1.0), sp), 1.0);
}`;

const easeOutQuad = t => 1 - (1 - t) * (1 - t);
const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * @param {object} [options]
 * @param {HTMLElement} [options.target=document.body]  Content to freeze. A wrapper around your page content works best.
 * @param {number}  [options.blockSize=8]          Pixel block size in CSS px.
 * @param {boolean} [options.palette=false]        Limit colours to a 64-colour palette.
 * @param {number}  [options.freezeDuration=1700]  ms
 * @param {number}  [options.thawDuration=1300]    ms
 * @param {(t:number)=>number} [options.thawEasing] Easing for the ripple back (0..1 -> 0..1); default ease-in-out.
 * @param {boolean} [options.unfreezeOnClick=true] Click/tap the frozen page to thaw from that point.
 * @param {boolean} [options.unfreezeOnEscape=true]
 * @param {number}  [options.zIndex=2147483000]    Overlay z-index. Put your own controls above it if they must stay usable.
 * @param {Function}[options.html2canvas]          html2canvas function; defaults to window.html2canvas.
 * @param {(doc:Document)=>void} [options.onclone] Adjust html2canvas's copy of the page before the
 *                                                 snapshot (e.g. hide styles it can't draw).
 * @param {(state:'idle'|'freezing'|'frozen'|'thawing')=>void} [options.onStateChange]
 */
export function createPixelFreeze(options = {}) {
  const o = {
    target: document.body,
    blockSize: 8,
    palette: false,
    freezeDuration: 1700,
    thawDuration: 1300,
    thawEasing: easeInOutCubic,
    unfreezeOnClick: true,
    unfreezeOnEscape: true,
    zIndex: 2147483000,
    html2canvas: typeof window !== 'undefined' ? window.html2canvas : undefined,
    onStateChange: null,
    ...options,
  };
  if (typeof o.html2canvas !== 'function') {
    throw new Error('pixel-freeze: html2canvas is required (pass it as the html2canvas option or load it globally).');
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const target = o.target;
  const isDocTarget = target === document.body || target === document.documentElement;

  // ---- overlay canvas + WebGL ---------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    zIndex: String(o.zIndex), pointerEvents: 'none', display: 'none',
  });
  document.body.appendChild(canvas);

  const gl = canvas.getContext('webgl', { antialias: false });
  if (!gl) { canvas.remove(); throw new Error('pixel-freeze: WebGL is not available.'); }

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const U = {};
  ['T', 'V', 'O', 'C', 'D', 'DPR', 'R', 'B', 'AMP', 'PAL'].forEach(n => (U[n] = gl.getUniformLocation(prog, n)));
  gl.uniform1i(U.T, 0);

  const draw = ({ R, amp = 0 }) => {
    gl.uniform1f(U.R, R);
    gl.uniform1f(U.B, o.blockSize);
    gl.uniform1f(U.AMP, amp);
    gl.uniform1f(U.PAL, o.palette ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const drawFrozen = () => draw({ R: 1e6 }); // ring far off-screen = everything pixelated

  // ---- state ---------------------------------------------------------------
  let state = 'idle';
  let token = 0;
  let textureReady = false;
  const setState = s => { state = s; if (o.onStateChange) o.onStateChange(s); };

  // ---- helpers -------------------------------------------------------------
  function resolvePoint(origin) {
    if (origin && typeof origin.clientX === 'number') return { x: origin.clientX, y: origin.clientY };
    if (origin instanceof Element) {
      const r = origin.getBoundingClientRect();
      if (r.width && r.bottom > 0 && r.top < innerHeight) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    } else if (origin && typeof origin.x === 'number') {
      return { x: origin.x, y: origin.y };
    }
    return { x: innerWidth / 2, y: innerHeight / 2 };
  }
  const farthestCorner = p => Math.max(
    Math.hypot(p.x, p.y), Math.hypot(innerWidth - p.x, p.y),
    Math.hypot(p.x, innerHeight - p.y), Math.hypot(innerWidth - p.x, innerHeight - p.y));

  function animate(duration, frame) {
    const my = ++token;
    if (reduceMotion.matches || duration <= 0) { frame(1); return Promise.resolve(true); }
    return new Promise(resolve => {
      const t0 = performance.now();
      const step = now => {
        if (my !== token) return resolve(false);
        const t = Math.min(1, (now - t0) / duration);
        frame(t);
        if (t < 1) requestAnimationFrame(step); else resolve(true);
      };
      requestAnimationFrame(step);
    });
  }

  // Pause CSS animations, transitions and videos so the frozen moment holds still.
  let pausedAnims = [], pausedVideos = [];
  // Only animations inside the frozen element are paused; anything outside it
  // (a button floating above the overlay, say) keeps moving.
  function pauseTime() {
    pausedAnims = document.getAnimations().filter(a => {
      const t = a.effect && a.effect.target;
      return a.playState === 'running' && (!t || target.contains(t));
    });
    pausedAnims.forEach(a => a.pause());
    pausedVideos = [...document.querySelectorAll('video')].filter(v => !v.paused);
    pausedVideos.forEach(v => v.pause());
  }
  function resumeTime() {
    pausedAnims.forEach(a => { try { a.play(); } catch (e) { /* element removed */ } });
    pausedVideos.forEach(v => v.play().catch(() => {}));
    pausedAnims = []; pausedVideos = [];
  }

  // html2canvas clones the DOM, which restarts CSS animations from frame 0.
  // Copy each animated element's current transform/opacity into its clone.
  function tagAnimated() {
    const els = new Set();
    document.getAnimations().forEach(a => {
      const t = a.effect && a.effect.target;
      if (t && !a.effect.pseudoElement && target.contains(t)) els.add(t);
    });
    const list = [...els];
    list.forEach((el, i) => el.setAttribute('data-pf-anim', String(i)));
    return list;
  }
  function copyAnimatedState(list, doc) {
    list.forEach((el, i) => {
      const c = doc.querySelector(`[data-pf-anim="${i}"]`);
      if (!c) return;
      const cs = getComputedStyle(el);
      c.style.animation = 'none';
      c.style.transition = 'none';
      c.style.transform = cs.transform;
      c.style.transformOrigin = cs.transformOrigin;
      if (cs.transformBox) c.style.transformBox = cs.transformBox;
      c.style.opacity = cs.opacity;
    });
  }

  // Lock the page while frozen: no scrolling, nothing focusable or clickable.
  let saved = null;
  function lockPage() {
    const de = document.documentElement;
    const inertEls = isDocTarget ? [...document.body.children].filter(c => c !== canvas) : [target];
    saved = {
      overflow: de.style.overflow,
      gutter: de.style.scrollbarGutter,
      inert: inertEls.map(el => [el, el.inert]),
    };
    if (de.scrollHeight > de.clientHeight) de.style.scrollbarGutter = 'stable'; // no layout shift when the scrollbar hides
    de.style.overflow = 'hidden';
    inertEls.forEach(el => { el.inert = true; });
    canvas.style.pointerEvents = o.unfreezeOnClick ? 'auto' : 'none';
    canvas.style.cursor = o.unfreezeOnClick ? 'pointer' : '';
  }
  function unlockPage() {
    if (!saved) return;
    const de = document.documentElement;
    de.style.overflow = saved.overflow;
    de.style.scrollbarGutter = saved.gutter;
    saved.inert.forEach(([el, v]) => { el.inert = v; });
    saved = null;
    canvas.style.pointerEvents = 'none';
    canvas.style.cursor = '';
  }

  function backgroundColor() {
    for (const el of [target, document.body, document.documentElement]) {
      const c = getComputedStyle(el).backgroundColor;
      if (c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)') return c;
    }
    return '#ffffff';
  }

  // ---- public API ----------------------------------------------------------
  async function freeze(origin) {
    if (state !== 'idle') return false;
    setState('freezing');
    textureReady = false;
    const p = resolvePoint(origin);

    pauseTime();
    const animated = tagAnimated();
    const r = target.getBoundingClientRect();
    const view = isDocTarget ? { x: scrollX, y: scrollY } : { x: -r.left, y: -r.top };

    let shot;
    try {
      shot = await o.html2canvas(target, {
        x: view.x, y: view.y, width: innerWidth, height: innerHeight,
        scale: Math.min(window.devicePixelRatio || 1, 1.5),
        backgroundColor: backgroundColor(),
        logging: false, useCORS: true,
        ignoreElements: el => el === canvas,
        onclone: doc => { copyAnimatedState(animated, doc); o.onclone?.(doc); },
      });
    } catch (err) {
      resumeTime();
      setState('idle');
      throw err;
    } finally {
      animated.forEach(el => el.removeAttribute('data-pf-anim'));
    }

    const D = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * D);
    canvas.height = Math.round(innerHeight * D);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, shot);
    gl.uniform2f(U.V, innerWidth, innerHeight);
    gl.uniform2f(U.O, view.x, view.y);
    gl.uniform2f(U.C, p.x, p.y);
    gl.uniform1f(U.D, D);
    gl.uniform1f(U.DPR, window.devicePixelRatio || 1);
    textureReady = true;

    lockPage();
    const Rend = (farthestCorner(p) + 30) / (U0 - HW);
    const amp0 = Math.min(90, 40 + Rend * 0.03);
    draw({ R: 1, amp: amp0 });
    canvas.style.display = 'block';

    const done = await animate(o.freezeDuration, t => {
      draw({ R: Math.max(1, easeOutQuad(t) * Rend * U0), amp: amp0 * (1 - 0.45 * t) });
    });
    if (done) { drawFrozen(); setState('frozen'); }
    return done;
  }

  async function unfreeze(origin) {
    if (!textureReady || (state !== 'frozen' && state !== 'freezing')) return false;
    setState('thawing');
    resumeTime(); // revealed areas come back to life as the ripple passes
    const p = resolvePoint(origin);
    gl.uniform2f(U.C, p.x, p.y);
    const Rend = (farthestCorner(p) + 30) / (U0 - HW);
    const amp0 = Math.min(90, 40 + Rend * 0.03);
    // Start with the ring's outer edge just touching the farthest corner, so
    // the thaw shows from the first frame. (Starting from the freeze's end
    // radius, well past the corner, spent the first part of the thaw on
    // nothing visible.)
    const R0 = (farthestCorner(p) + 2) * U0 / (U0 + HW);

    const done = await animate(o.thawDuration, t => {
      draw({ R: Math.max(1, (1 - o.thawEasing(t)) * R0), amp: amp0 * (0.55 + 0.45 * t) });
    });
    if (done) {
      canvas.style.display = 'none';
      unlockPage();
      textureReady = false;
      setState('idle');
    }
    return done;
  }

  function toggle(origin) {
    return state === 'idle' ? freeze(origin) : unfreeze(origin);
  }

  function setBlockSize(px) {
    o.blockSize = Math.max(1, Math.round(px));
    if (state === 'frozen') drawFrozen();
  }
  function setPalette(on) {
    o.palette = !!on;
    if (state === 'frozen') drawFrozen();
  }

  // ---- input -----------------------------------------------------------------
  const onCanvasClick = e => { if (state === 'frozen') unfreeze(e); };
  const onKey = e => { if (o.unfreezeOnEscape && e.key === 'Escape' && state === 'frozen') unfreeze(); };
  canvas.addEventListener('click', onCanvasClick);
  window.addEventListener('keydown', onKey);

  function destroy() {
    token++;
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('click', onCanvasClick);
    unlockPage();
    resumeTime();
    canvas.remove();
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    state = 'idle';
  }

  return {
    freeze, unfreeze, toggle, setBlockSize, setPalette, destroy,
    get state() { return state; },
    get canvas() { return canvas; },
  };
}
