import { flushSync } from 'react-dom';

// Changes the look of the app (style, light/dark, styled text) in one quick, even motion:
// a veil in the new background colour fades in, the app changes underneath it all at once,
// and the veil fades away. Only the veil's opacity animates, which phones draw cheaply,
// and the elements' own colour transitions are switched off meanwhile, so nothing changes
// in several steps.
const IN_MS = 110;
const OUT_MS = 200;
let busy = false;

function backgroundAtCentre(): string {
  let el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) as HTMLElement | null;
  while (el) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== 'transparent' && !bg.startsWith('rgba(0, 0, 0, 0)')) return bg;
    el = el.parentElement;
  }
  return getComputedStyle(document.body).backgroundColor || '#23211f';
}

const nextPaint = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

export function smoothSwitch(update: () => void, veilColor?: string) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce || busy || typeof document.body.animate !== 'function') { update(); return; }
  busy = true;
  const root = document.documentElement;
  const veil = document.createElement('div');
  veil.className = 'style-veil';
  veil.style.background = veilColor || backgroundAtCentre();
  document.body.appendChild(veil);
  let applied = false;
  const apply = () => { if (!applied) { applied = true; flushSync(update); } };
  const done = () => { veil.remove(); root.classList.remove('style-switching'); busy = false; };
  veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: IN_MS, easing: 'ease-in', fill: 'forwards' }).finished
    .then(async () => {
      root.classList.add('style-switching');
      apply();
      await nextPaint();
      root.classList.remove('style-switching');
      await veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OUT_MS, easing: 'ease-out', fill: 'forwards' }).finished;
      done();
    })
    .catch(() => { try { apply(); } finally { done(); } });
}
