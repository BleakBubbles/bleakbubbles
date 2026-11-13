// shapes.js
// Flat-shaded 3D solids that tumble across the screen, drawn on a 2D canvas
// with a tiny hand-rolled projection (no library). The canvas sits behind the
// page content; cards are opaque, so shapes pass behind them.
//
// It's a requestAnimationFrame loop, which pixel-freeze can't pause on its
// own, so it exposes stop()/start() for onStateChange to call.

const COLORS = ['#ff5d8f', '#ffd166', '#4dd4ac', '#6c8cff', '#b388ff', '#2ee6ff', '#ff6b6b', '#ffa45c']; // includes every piece colour, so pieces don't stand out by colour

// Convex solids centred on the origin, radius ~1. Faces list vertex indices;
// winding doesn't matter because normals are taken from the face centroid.
const SOLIDS = {
  cube: {
    v: [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(p => p.map(c => c * 0.62)),
    f: [[0,1,2,3],[4,5,6,7],[0,1,5,4],[2,3,7,6],[1,2,6,5],[0,3,7,4]],
  },
  tetra: {
    v: [[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]].map(p => p.map(c => c * 0.7)),
    f: [[0,1,2],[0,1,3],[0,2,3],[1,2,3]],
  },
  octa: {
    v: [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],
    f: [[0,2,4],[0,4,3],[0,3,5],[0,5,2],[1,2,4],[1,4,3],[1,3,5],[1,5,2]],
  },
  prism: { // triangular prism
    v: [[0,-0.9,-0.6],[0.78,0.45,-0.6],[-0.78,0.45,-0.6],[0,-0.9,0.6],[0.78,0.45,0.6],[-0.78,0.45,0.6]],
    f: [[0,1,2],[3,4,5],[0,1,4,3],[1,2,5,4],[2,0,3,5]],
  },
};
const KINDS = Object.keys(SOLIDS);

// Tetrominoes: four unit cubes on a grid, one block deep. Built as a mesh of
// the outside faces only (faces shared by two blocks are dropped), each with
// an explicit outward normal, because the pieces aren't convex.
// Pastel versions of the Tetris colours, shared with the site palette
// (red Z and orange L are the only two added to it).
const PIECES = {
  I: { color: '#2ee6ff', cells: [[0,0],[1,0],[2,0],[3,0]] },
  O: { color: '#ffd166', cells: [[0,0],[1,0],[0,1],[1,1]] },
  T: { color: '#b388ff', cells: [[0,0],[1,0],[2,0],[1,1]] },
  S: { color: '#4dd4ac', cells: [[1,0],[2,0],[0,1],[1,1]] },
  Z: { color: '#ff6b6b', cells: [[0,0],[1,0],[1,1],[2,1]] },
  J: { color: '#6c8cff', cells: [[0,0],[0,1],[1,1],[2,1]] },
  L: { color: '#ffa45c', cells: [[2,0],[0,1],[1,1],[2,1]] },
};
// Just the colours, by piece. main.js deals the "I build ___" word colours from these.
export const PIECE_COLORS = Object.fromEntries(Object.entries(PIECES).map(([k, p]) => [k, p.color]));
const OUTLINE_SHADE = 0.78; // block seams on pieces: 1 = invisible, lower = darker lines
const PIECE_SCALE = 0.44; // one block, in shape units (the I piece spans ~1.8)

function buildPiece(cells) {
  const has = (x, y) => cells.some(([cx, cy]) => cx === x && cy === y);
  const cx = cells.reduce((a, c) => a + c[0], 0) / 4 + 0.5;
  const cy = cells.reduce((a, c) => a + c[1], 0) / 4 + 0.5;
  const v = [], f = [];
  const quad = (pts, n) => {
    const base = v.length;
    pts.forEach(([x, y, z]) => v.push([(x - cx) * PIECE_SCALE, (y - cy) * PIECE_SCALE, z * PIECE_SCALE]));
    f.push({ idx: [base, base + 1, base + 2, base + 3], n });
  };
  for (const [x, y] of cells) {
    const a = -0.5, b = 0.5;
    quad([[x, y, b], [x + 1, y, b], [x + 1, y + 1, b], [x, y + 1, b]], [0, 0, 1]);    // front
    quad([[x, y, a], [x + 1, y, a], [x + 1, y + 1, a], [x, y + 1, a]], [0, 0, -1]);   // back
    if (!has(x - 1, y)) quad([[x, y, a], [x, y + 1, a], [x, y + 1, b], [x, y, b]], [-1, 0, 0]);
    if (!has(x + 1, y)) quad([[x + 1, y, a], [x + 1, y + 1, a], [x + 1, y + 1, b], [x + 1, y, b]], [1, 0, 0]);
    if (!has(x, y - 1)) quad([[x, y, a], [x + 1, y, a], [x + 1, y, b], [x, y, b]], [0, -1, 0]);
    if (!has(x, y + 1)) quad([[x, y + 1, a], [x + 1, y + 1, a], [x + 1, y + 1, b], [x, y + 1, b]], [0, 1, 0]);
  }
  return { v, f };
}
for (const [name, p] of Object.entries(PIECES)) SOLIDS['piece' + name] = buildPiece(p.cells);

// Exactly one Tetris piece is in flight at a time: when it leaves the screen,
// the next piece from the bag takes its place straight away.

// 7-bag, as in Tetris: every item once per shuffled bag, then a fresh shuffle.
export function makeBag(items) {
  let bag = [];
  return () => {
    if (!bag.length) {
      bag = [...items];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  };
}
const nextPiece = makeBag(Object.keys(PIECES));

const LIGHT = norm([-0.45, -0.65, 0.62]); // from upper-left, towards the viewer
const FOCAL = 4.2;                          // perspective strength inside a shape

function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
const rand = (a, b) => a + Math.random() * (b - a);

function rotate([x, y, z], [ax, ay, az]) {
  let c = Math.cos(ax), s = Math.sin(ax);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ay); s = Math.sin(ay);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(az); s = Math.sin(az);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = i => Math.round(((n >> i) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// Two layers: `canvas` sits behind the page content, `front` (optional) above
// it. Shapes nearer than `frontFrom` (depth 0 far .. 1 near) are drawn on the
// front layer, so "in front" stays consistent with size and speed.
//
// Scroll modes (the canvases are always viewport-sized; only the maths changes):
//   'fixed'    shapes live on the screen and ignore scrolling
//   'page'     shapes live on the page and scroll away with the content
//   'parallax' like 'page', but far shapes scroll slower than near ones (the default)
// In the page modes, shapes are spread down the whole page, and only the ones
// currently on screen are drawn.
// Parallax: share of the page's scroll speed for the farthest and nearest shapes.
// Kept well below 1 so no shape tries to stick to the content: the canvas is
// redrawn from JavaScript a frame out of step with native scrolling, and that
// lag shows as jitter in proportion to this number.
const PARALLAX_MIN = 0.2;
const PARALLAX_MAX = 0.65;

export function createShapes(canvas, { count, front = null, frontFrom = Infinity, scroll = 'parallax' } = {}) {
  const layers = [canvas, front].filter(Boolean).map(c => ({ c, ctx: c.getContext('2d') }));
  const back = layers[0].ctx;
  const fore = front ? layers[1].ctx : back;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, maxScroll = 0, populatedFor = 0;
  const scrollFactor = depth => scroll === 'fixed' ? 0 : scroll === 'page' ? 1 : PARALLAX_MIN + (PARALLAX_MAX - PARALLAX_MIN) * depth;
  const measurePage = () => { maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight); };
  let shapes = [];
  let raf = 0, last = 0, running = false;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    measurePage();
    for (const { c, ctx } of layers) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  // depth 0 (far) .. 1 (near): nearer shapes are bigger, faster, brighter.
  function spawn(initial, isPiece = false) {
    const piece = isPiece ? nextPiece() : null;
    const depth = piece ? rand(0.45, 1) : Math.random(); // pieces stay fairly near, so they read
    const size = 18 + depth * 46;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const speed = (22 + depth * 60) * dir;
    const k = scrollFactor(depth);
    // Page y. A new piece appears in the part of the page being looked at;
    // other shapes anywhere in the band this depth can be seen through.
    const y = piece && !initial
      ? scrollY * k + rand(H * 0.1, H * 0.9)
      : rand(H * 0.05, H * 0.95 + k * maxScroll);
    return {
      kind: piece ? 'piece' + piece : KINDS[(Math.random() * KINDS.length) | 0],
      color: piece ? PIECES[piece].color : COLORS[(Math.random() * COLORS.length) | 0],
      isPiece: !!piece,
      outline: !!piece,
      depth, size,
      x: initial ? rand(0, W) : dir > 0 ? -size * (piece ? 1.1 : 2) : W + size * (piece ? 1.1 : 2), // pieces start just off the edge, so the next one shows up quickly
      y, k,
      vx: speed,
      vy: rand(-12, 12),
      rot: [rand(0, 6.3), rand(0, 6.3), rand(0, 6.3)],
      spin: [rand(-0.9, 0.9), rand(-0.9, 0.9), rand(-0.5, 0.5)],
      bob: rand(0, 6.3),
    };
  }

  function populate() {
    const perScreen = count ?? (W < 760 ? 7 : 12);
    const avgK = scroll === 'fixed' ? 0 : scroll === 'page' ? 1 : (PARALLAX_MIN + PARALLAX_MAX) / 2;
    const n = Math.min(90, Math.round(perScreen * (1 + avgK * maxScroll / H))); // same density per screen
    populatedFor = maxScroll;
    shapes = Array.from({ length: n }, (_, i) => spawn(true, i === 0)) // shape 0 is the piece slot
      .sort((a, b) => a.depth - b.depth);
  }

  function drawShape(s, ctx) {
    const solid = SOLIDS[s.kind];
    const pts = solid.v.map(p => rotate(p, s.rot));
    const faces = solid.f.map(face => {
      const idx = face.idx || face;
      const c = [0, 0, 0];
      idx.forEach(i => { c[0] += pts[i][0]; c[1] += pts[i][1]; c[2] += pts[i][2]; });
      c[0] /= idx.length; c[1] /= idx.length; c[2] /= idx.length;
      // convex solids: normal = direction to the face centre; pieces carry their own
      return { idx, n: face.n ? rotate(face.n, s.rot) : norm(c), z: c[2] };
    }).filter(f => f.n[2] > 0.001).sort((a, b) => a.z - b.z);

    const bright = 0.55 + s.depth * 0.45; // far shapes recede into the dark
    for (const f of faces) {
      const lambert = Math.max(0, f.n[0] * LIGHT[0] + f.n[1] * LIGHT[1] + f.n[2] * LIGHT[2]);
      ctx.fillStyle = shade(s.color, (0.28 + 0.72 * lambert) * bright);
      ctx.beginPath();
      f.idx.forEach((i, k) => {
        const [x, y, z] = pts[i];
        const p = FOCAL / (FOCAL - z);
        const sx = s.x + x * s.size * p, sy = s.y - scrollY * s.k + y * s.size * p;
        k ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      });
      ctx.closePath();
      ctx.fill();
      if (s.outline) { // soft block seams: a slightly darker shade of the face, so pieces read as blocks to a sharp eye
        ctx.strokeStyle = shade(s.color, (0.28 + 0.72 * lambert) * bright * OUTLINE_SHADE);
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }
  }

  function drawAll() {
    for (const { ctx } of layers) ctx.clearRect(0, 0, W, H);
    for (const s of shapes) { // far ones first
      const sy = s.y - scrollY * s.k, off = s.size * 2.5;
      if (sy < -off || sy > H + off) continue; // off screen: skip drawing
      drawShape(s, s.depth >= frontFrom ? fore : back);
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let respawned = false;
    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt + Math.sin((s.bob += dt * 0.8)) * 0.15;
      s.rot[0] += s.spin[0] * dt; s.rot[1] += s.spin[1] * dt; s.rot[2] += s.spin[2] * dt;
      const off = s.size * 2.5;
      if (s.x < -off - 1 || s.x > W + off + 1 || s.y < -off || s.y > H + s.k * maxScroll + off) {
        shapes[i] = spawn(false, s.isPiece); // a piece is replaced by the next piece
        respawned = true;
      }
    }
    if (respawned) shapes.sort((a, b) => a.depth - b.depth);
    drawAll();
    if (running) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    for (const { c } of layers) c.style.display = '';
    if (reduceMotion) { drawAll(); return; }
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  resize();
  populate();
  window.addEventListener('resize', () => { resize(); populate(); if (!running) drawAll(); });
  window.addEventListener('scroll', () => { if (!running) drawAll(); }, { passive: true });
  // The page grows as fonts, images and repo details load; keep the scroll range current.
  new ResizeObserver(() => {
    measurePage();
    if (scroll !== 'fixed' && Math.abs(maxScroll - populatedFor) > H * 0.5) { populate(); if (!running) drawAll(); }
  }).observe(document.documentElement);

  return { start, stop };
}
