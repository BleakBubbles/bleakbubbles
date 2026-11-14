// freeze-icon.js
// The freeze button's icon, drawn into its <svg class="fz-grid">:
//   • normal — a flat 3x3 block of grey "pixels", top-right corner empty
//   • frozen — the same pixels as a 3x3x3 voxel cube ("back to the real
//              world" = back to 3D), with the matching corner block missing.
//
// Two ways to get from one to the other:
//   'build'   (default) the flat pixels drop away, then the cube is stacked
//             block by block, bottom layer first, each block dropping into
//             place. Meant to play along with the ripple, so it's slower.
//   'extrude' the flat grid tilts back into the cube's top face, then the
//             sides grow down. Short; meant for after the ripple.
// Both run in reverse for the way back.
//
// Lighting matches the flying shapes: top brightest, left medium, right darkest.

const NS = 'http://www.w3.org/2000/svg';

// The flat icon's greys, by [row][col]; the cube faces reuse the pattern.
const GREYS = [
  ['#ffffff', '#b4b4be', null],
  ['#767682', '#ffffff', '#d4d4dc'],
  ['#4a4a54', '#9a9aa6', '#ffffff'],
];
const LIGHT = { top: 1, left: 0.74, right: 0.5, notchFloor: 0.82, notchWall: 0.38 };

const ORIGIN = 1.5, CELL = 7;                    // flat grid, in the 24x24 viewBox
const L = 4;                                     // cube block size
const C30 = Math.cos(Math.PI / 6);
// The missing block: x 2..3, y 0..1, z 2..3 — the cube's right corner, where
// the flat icon's empty top-right pixel ends up.
const isNotch = (x, y, z) => x === 2 && y === 0 && z === 2;

// 'build' timeline (as fractions of the whole run)
const BUILD = {
  pixelsOut: [0, 0.3],      // flat pixels drop away, staggered
  blocksIn: [0.18, 1],      // cube blocks drop in, staggered, bottom layer first
  blockLength: 0.16,        // how long each block's drop takes
  dropHeight: 9,            // how far blocks fall from (viewBox units)
};
// 'extrude' timeline
const EXTRUDE = { duration: 400, tiltEnd: 0.45, extrudeStart: 0.35 };

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = s => Math.min(255, Math.round(((n >> s) & 255) * k));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
const grey = (row, col) => GREYS[row][col] || '#d4d4dc';
const clamp01 = v => Math.max(0, Math.min(1, v));
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const easeOut = t => 1 - (1 - t) ** 3;
const easeIn = t => t * t * t;
const easeOutBack = t => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;   // small overshoot = a little "land"
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = pts => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

// Isometric projection: x back-right, y back-left, z up (0..3 each), centred
// in the viewBox. `h` (0..1) squashes heights towards the top face and keeps
// the shape centred, which the extrude uses; the full cube is h = 1.
function iso(x, y, z, h = 1) {
  const zz = 3 - (3 - z) * h;
  return [12 + (x - y) * L * C30, (6 - 6 * h) + (x + y) * L / 2 + (3 - zz) * L];
}

function polygon(parent, fill) {
  const p = document.createElementNS(NS, 'polygon');
  p.setAttribute('fill', fill);
  p.setAttribute('stroke', fill);                // hairline in its own colour hides anti-aliased seams
  p.setAttribute('stroke-width', '0.3');
  p.setAttribute('stroke-linejoin', 'round');
  parent.appendChild(p);
  return p;
}
const flatCells = () => {
  const cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    if (!GREYS[r][c]) continue;
    const x = ORIGIN + CELL * c, y = ORIGIN + CELL * r;
    cells.push({ c, r, fill: GREYS[r][c], pts: [[x, y], [x + CELL, y], [x + CELL, y + CELL], [x, y + CELL]] });
  }
  return cells;
};

// ---------------------------------------------------------------------------
// 'build': flat pixels and cube blocks as separate pieces
// ---------------------------------------------------------------------------
function buildRenderer(svg) {
  const pixels = flatCells().map((cell, i) => {
    const g = document.createElementNS(NS, 'g');
    // Inner group for the hover glint (styles.css), kept apart from the outer
    // group's transform, which the build animation drives.
    const px = document.createElementNS(NS, 'g');
    px.setAttribute('class', 'fz-px');
    px.style.setProperty('--d', cell.c + 2 - cell.r);   // diagonal index: 0 bottom-left .. 4 top-right
    polygon(px, cell.fill).setAttribute('points', fmt(cell.pts));
    const glint = polygon(px, '#ffffff');
    glint.setAttribute('class', 'fz-glint');
    glint.setAttribute('points', fmt(cell.pts));
    g.appendChild(px);
    svg.appendChild(g);
    return { g, order: [4, 1, 6, 2, 7, 0, 5, 3][i] };   // drop out in a scattered order
  });

  // One group per block, drawn far-to-near (x + y + z ascending) so nearer
  // blocks cover farther ones. Each shows its top, right (+x) and left (+y) face.
  const blocks = [];
  for (let z = 0; z < 3; z++) for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    if (isNotch(x, y, z)) continue;
    blocks.push({ x, y, z });
  }
  blocks.sort((a, b) => (a.x + a.y + a.z) - (b.x + b.y + b.z));
  for (const b of blocks) {
    b.g = document.createElementNS(NS, 'g');
    const { x, y, z } = b;
    const top = [iso(x, y, z + 1), iso(x + 1, y, z + 1), iso(x + 1, y + 1, z + 1), iso(x, y + 1, z + 1)];
    const right = [iso(x + 1, y, z + 1), iso(x + 1, y + 1, z + 1), iso(x + 1, y + 1, z), iso(x + 1, y, z)];
    const left = [iso(x, y + 1, z + 1), iso(x + 1, y + 1, z + 1), iso(x + 1, y + 1, z), iso(x, y + 1, z)];
    polygon(b.g, shade(grey(y, x), LIGHT.top)).setAttribute('points', fmt(top));
    polygon(b.g, shade(grey(2 - z, y), LIGHT.right)).setAttribute('points', fmt(right));
    polygon(b.g, shade(grey(2 - z, x), LIGHT.left)).setAttribute('points', fmt(left));
    svg.appendChild(b.g);
  }
  // Stacking order: bottom layer first; within a layer, back to front.
  const stackOrder = [...blocks].sort((a, b) => a.z - b.z || (a.x + a.y) - (b.x + b.y) || a.x - b.x);
  stackOrder.forEach((b, i) => { b.order = i; });

  const [pxStart, pxEnd] = BUILD.pixelsOut;
  const [blStart, blEnd] = BUILD.blocksIn;
  const pxStep = (pxEnd - pxStart - 0.12) / (pixels.length - 1);
  const blStep = (blEnd - blStart - BUILD.blockLength) / (blocks.length - 1);

  // progress 0 = flat icon, 1 = finished cube
  return progress => {
    for (const p of pixels) {
      const t = easeIn(clamp01((progress - (pxStart + p.order * pxStep)) / 0.12));
      p.g.setAttribute('transform', `translate(0 ${(t * 6).toFixed(2)})`);
      p.g.setAttribute('opacity', (1 - t).toFixed(3));
    }
    for (const b of blocks) {
      const t = clamp01((progress - (blStart + b.order * blStep)) / BUILD.blockLength);
      b.g.setAttribute('transform', `translate(0 ${(-(1 - easeOutBack(t)) * BUILD.dropHeight).toFixed(2)})`);
      b.g.setAttribute('opacity', clamp01(t * 3).toFixed(3));
    }
  };
}

// ---------------------------------------------------------------------------
// 'extrude': the flat pixels become the top face, then the sides grow
// ---------------------------------------------------------------------------
function extrudeRenderer(svg) {
  const parts = [];
  for (const cell of flatCells()) {
    const { c, r } = cell;
    parts.push({ el: polygon(svg, shade(cell.fill, LIGHT.top)), layer: 'top', flat: cell.pts,
      cube: h => [iso(c, r, 3, h), iso(c + 1, r, 3, h), iso(c + 1, r + 1, 3, h), iso(c, r + 1, 3, h)] });
  }
  for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) {
    if (j === 0 && k === 2) continue;                        // the notch's outer face
    parts.push({ el: polygon(svg, shade(grey(2 - k, j), LIGHT.right)), layer: 'side',
      cube: h => [iso(3, j, k + 1, h), iso(3, j + 1, k + 1, h), iso(3, j + 1, k, h), iso(3, j, k, h)] });
  }
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) {
    parts.push({ el: polygon(svg, shade(grey(2 - k, i), LIGHT.left)), layer: 'side',
      cube: h => [iso(i, 3, k + 1, h), iso(i + 1, 3, k + 1, h), iso(i + 1, 3, k, h), iso(i, 3, k, h)] });
  }
  parts.push({ el: polygon(svg, shade('#d4d4dc', LIGHT.notchFloor)), layer: 'notch',
    cube: h => [iso(2, 0, 2, h), iso(3, 0, 2, h), iso(3, 1, 2, h), iso(2, 1, 2, h)] });
  parts.push({ el: polygon(svg, shade('#d4d4dc', LIGHT.notchWall)), layer: 'notch',
    cube: h => [iso(2, 0, 3, h), iso(2, 1, 3, h), iso(2, 1, 2, h), iso(2, 0, 2, h)] });

  return progress => {
    const tilt = easeInOut(clamp01(progress / EXTRUDE.tiltEnd));
    const h = easeOut(clamp01((progress - EXTRUDE.extrudeStart) / (1 - EXTRUDE.extrudeStart)));
    for (const part of parts) {
      const cube = part.cube(h);
      const pts = part.layer === 'top'
        ? part.flat.map((p, i) => [lerp(p[0], cube[i][0], tilt), lerp(p[1], cube[i][1], tilt)])
        : cube;
      part.el.setAttribute('points', fmt(pts));
      if (part.layer !== 'top') part.el.setAttribute('opacity', clamp01(h * (part.layer === 'notch' ? 3 : 5)).toFixed(3));
    }
  };
}

// ---------------------------------------------------------------------------

export function createFreezeIcon(svg, { transition = 'build' } = {}) {
  const draw = transition === 'extrude' ? extrudeRenderer(svg) : buildRenderer(svg);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0, raf = 0;

  // Animate to the cube (true) or the flat icon (false) over `duration` ms.
  // The clock starts on the first frame, so time spent on the freeze snapshot
  // (which blocks the page briefly) isn't skipped over.
  function set(cube, duration = EXTRUDE.duration) {
    const from = current, to = cube ? 1 : 0;
    cancelAnimationFrame(raf);
    if (reduceMotion.matches || from === to) { current = to; draw(to); return; }
    const length = duration * Math.abs(to - from);
    let t0 = null;
    const step = now => {
      if (t0 === null) t0 = now;
      const t = clamp01((now - t0) / length);
      current = lerp(from, to, t);
      draw(current);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  draw(0);
  return { set, draw };
}
