import { flushSync } from 'react-dom';

// Changes the look of the app (style, light/dark, styled text) with a soft cross-fade
// of the whole screen instead of an instant jump where some parts change before others.
// Where the browser has no View Transitions, colours ease over for a moment instead.
export function smoothSwitch(update: () => void) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const doc = document as Document & { startViewTransition?: (cb: () => Promise<void> | void) => unknown };
  if (reduce) { update(); return; }
  if (typeof doc.startViewTransition === 'function') {
    try {
      doc.startViewTransition(async () => {
        flushSync(update);
        // Let a style's own font come in before the new picture is taken, but never wait long
        const fonts = (document as any).fonts?.ready as Promise<unknown> | undefined;
        if (fonts) await Promise.race([fonts, new Promise(r => setTimeout(r, 120))]);
      });
      return;
    } catch { /* fall through */ }
  }
  const root = document.documentElement;
  root.classList.add('style-switching');
  update();
  window.setTimeout(() => root.classList.remove('style-switching'), 450);
}
