// repos.js
// Fills each project's details strip with live data: last update from the
// GitHub API, plus the npm version for packages.
// Unauthenticated GitHub requests are limited to 60/hour per visitor, so
// results are cached in localStorage for a few hours. If anything fails, the
// static text already in the HTML stays as it is.

const OWNER = 'BleakBubbles';
const CACHE_MS = 6 * 60 * 60 * 1000;

const cache = {
  get(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v && Date.now() - v.t < CACHE_MS ? v.data : null;
    } catch { return null; }
  },
  set(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), data })); } catch { /* ignore */ }
  },
};

async function getJSON(url, key) {
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const data = await res.json();
  cache.set(key, data);
  return data;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function ago(iso) {
  const sec = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']];
  let v = sec;
  for (const [n, unit] of steps) {
    if (Math.abs(v) < n) return rtf.format(Math.round(v), unit);
    v /= n;
  }
}

export function loadRepoDetails() {
  document.querySelectorAll('.project[data-repo]').forEach(async card => {
    const repo = card.dataset.repo;
    const updated = card.querySelector('.m-updated');
    const extra = card.querySelector('.m-extra');

    try {
      const r = await getJSON(`https://api.github.com/repos/${OWNER}/${repo}`, `gh:${repo}`);
      if (r.pushed_at) {
        updated.textContent = `Updated ${ago(r.pushed_at)}`;
        updated.hidden = false;
      }
    } catch { /* keep static text */ }

    if (card.dataset.npm) {
      try {
        const p = await getJSON(`https://registry.npmjs.org/${card.dataset.npm}/latest`, `npm:${card.dataset.npm}`);
        if (p.version) (extra.querySelector('a') || extra).textContent = `npm v${p.version}`;
      } catch { /* keep static text */ }
    }
  });
}
