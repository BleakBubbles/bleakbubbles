// freeze-icon.js
// The freeze button's icon, drawn into its <svg class="fz-grid">: a flat 3x3
// block of grey "pixels" with the top-right corner empty.
//
// Each pixel also carries a lit copy of itself for the hover glint
// (styles.css): on hover the pixels light up one diagonal at a time, from the
// bottom-left corner to the top-right, and go back the same way on leave.

const NS = 'http://www.w3.org/2000/svg';

// The greys, by [row][col]; null is the empty corner. At rest the icon is
// dimmed; hovered, each pixel lights up to a brighter grey of its own, so the
// pattern holds (the middle diagonal goes pure white).
const GREYS = [
  ['#c4c4cc', '#8e8e9a', null],
  ['#5c5c68', '#c4c4cc', '#a6a6b0'],
  ['#3a3a44', '#76767f', '#c4c4cc'],
];
const LIT = [
  ['#ffffff', '#c8c8d0', null],
  ['#8e8e9a', '#ffffff', '#e2e2e8'],
  ['#62626e', '#acacb6', '#ffffff'],
];
const ORIGIN = 1.5, CELL = 7;   // grid position and pixel size, in the 24x24 viewBox

function square(parent, x, y, fill) {
  const p = document.createElementNS(NS, 'polygon');
  p.setAttribute('points', `${x},${y} ${x + CELL},${y} ${x + CELL},${y + CELL} ${x},${y + CELL}`);
  p.setAttribute('fill', fill);
  p.setAttribute('stroke', fill);   // hairline in its own colour hides anti-aliased seams
  p.setAttribute('stroke-width', '0.3');
  p.setAttribute('stroke-linejoin', 'round');
  parent.appendChild(p);
  return p;
}

export function drawFreezeIcon(svg) {
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    if (!GREYS[r][c]) continue;
    const x = ORIGIN + CELL * c, y = ORIGIN + CELL * r;
    const px = document.createElementNS(NS, 'g');
    px.setAttribute('class', 'fz-px');
    px.style.setProperty('--d', c + 2 - r);   // glint delay step: 0 bottom-left .. 4 top-right
    square(px, x, y, GREYS[r][c]);
    square(px, x, y, LIT[r][c]).setAttribute('class', 'fz-glint');
    svg.appendChild(px);
  }
}
