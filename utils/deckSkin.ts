// A custom skin for the cassette deck: the user downloads a template (the current style's door,
// upright, with its window cut out), paints over it in any editor and uploads it back. The skin
// then covers the door of the deck in every style. The window is always kept see-through.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { DeckKey, lidArt } from './deckArt';

const KEY = 'cool_read_deck_skin';
const EVENT = 'coolread-deck-skin';
// The door is drawn landscape (3:2) and turned a quarter in the upright deck
const LW = 900, LH = 600;
// its window, as a share of the landscape door (see drawLidCanvas in deckArt.ts)
const WIN = { x: 60 / 600, y: 48 / 400, w: 480 / 600, h: 188 / 400 };

export function deckSkin(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function onDeckSkinChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
function setSkin(url: string | null) {
  try { if (url) localStorage.setItem(KEY, url); else localStorage.removeItem(KEY); }
  catch { throw new Error('Not enough room to keep the skin'); }
  window.dispatchEvent(new Event(EVENT));
}
export const removeDeckSkin = () => setSkin(null);

const loadImage = (src: string) => new Promise<HTMLImageElement>((ok, fail) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('Not a picture')); i.src = src;
});

/** The template: the door of the current style as the user sees it, upright, 800 × 1200 PNG */
export async function deckSkinTemplate(key: DeckKey): Promise<string> {
  const lid = await loadImage(lidArt(key));
  const W = 800, H = 1200, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  // landscape (x, y) appears upright at (1 − y, x)
  g.translate(W, 0); g.rotate(Math.PI / 2); g.drawImage(lid, 0, 0, H, W);
  return c.toDataURL('image/png');
}

/** Takes the user's picture (upright, fitted to cover the door), cuts the window and keeps it */
export async function uploadDeckSkin(file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    // upright door, 2:3, the picture covering it
    const UW = LH, UH = LW, up = document.createElement('canvas'); up.width = UW; up.height = UH;
    const u = up.getContext('2d')!;
    const s = Math.max(UW / img.width, UH / img.height);
    u.drawImage(img, (UW - img.width * s) / 2, (UH - img.height * s) / 2, img.width * s, img.height * s);
    // turned back to the landscape door
    const c = document.createElement('canvas'); c.width = LW; c.height = LH;
    const g = c.getContext('2d')!;
    g.translate(0, LH); g.rotate(-Math.PI / 2); g.drawImage(up, 0, 0, LH, LW);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // the window stays clear, so the tape shows through whatever is painted
    g.globalCompositeOperation = 'destination-out';
    const x = WIN.x * LW, y = WIN.y * LH, w = WIN.w * LW, h = WIN.h * LH, r = 21;
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill();
    let out = c.toDataURL('image/webp', 0.9);
    if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/png');
    setSkin(out);
  } finally { URL.revokeObjectURL(url); }
}

interface SaveFilePlugin { toDownloads(o: { name: string; mime: string; base64: string }): Promise<{ path: string }> }
const SaveFile = registerPlugin<SaveFilePlugin>('SaveFile');

/** Saves the template: into Downloads on the phone, as a download in the browser. Returns where it went. */
export async function saveDeckSkinTemplate(key: DeckKey): Promise<string> {
  const data = await deckSkinTemplate(key);
  const name = `coolread-tape-skin-${key.toLowerCase()}.png`;
  if (Capacitor.isNativePlatform()) {
    const r = await SaveFile.toDownloads({ name, mime: 'image/png', base64: data.split(',')[1] });
    return r.path;
  }
  const a = document.createElement('a'); a.href = data; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  return name;
}
