// The colour behind the player: taken from the cover of the tape or album that is playing,
// so the screen takes on the look of the sleeve. Computed once per cover on a tiny canvas.
import { useEffect, useState } from 'react';

const cache = new Map<string, string | null>();

/** The cover's main colour as "r,g,b", favouring vivid pixels over greys, or null if unreadable */
function sample(url: string): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image();
    if (!url.startsWith('data:') && !url.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const S = 24, c = document.createElement('canvas'); c.width = c.height = S;
        const x = c.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D;
        x.drawImage(img, 0, 0, S, S);
        const d = x.getImageData(0, 0, S, S).data;
        let r = 0, g = 0, b = 0, w = 0, ar = 0, ag = 0, ab = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          const R = d[i], G = d[i + 1], B = d[i + 2];
          const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
          const sat = mx ? (mx - mn) / mx : 0, lum = mx / 255;
          // vivid, mid-bright pixels count most; near-black and near-white count little
          const k = 0.05 + sat * sat * (1 - Math.abs(lum - 0.6));
          r += R * k; g += G * k; b += B * k; w += k; ar += R; ag += G; ab += B;
        }
        if (!w) return resolve(null);
        resolve(`${Math.round(r / w)},${Math.round(g / w)},${Math.round(b / w)}`);
      } catch { resolve(null); } // a cross-origin cover taints the canvas
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function useCoverTint(url: string | null | undefined): string | null {
  const [tint, setTint] = useState<string | null>(() => (url && cache.get(url)) || null);
  useEffect(() => {
    if (!url) { setTint(null); return; }
    if (cache.has(url)) { setTint(cache.get(url)!); return; }
    let live = true;
    sample(url).then(t => { cache.set(url, t); if (live) setTint(t); });
    return () => { live = false; };
  }, [url]);
  return tint;
}

/** A soft wash of the cover colour that fades into the app's own background */
export const tintBackground = (rgb: string) =>
  `radial-gradient(120% 75% at 50% 38%, rgba(${rgb},.55) 0%, rgba(${rgb},.28) 45%, rgba(${rgb},0) 85%), linear-gradient(180deg, rgba(${rgb},.18), rgba(${rgb},.08))`;
