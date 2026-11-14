// A custom skin for the cassette deck: the user downloads a template (the current style's door,
// upright, with its window cut out), paints over it in any editor and uploads it back. The skin
// then covers the door of the deck in every style. The window is always kept see-through.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { DeckKey, lidArt } from './deckArt';

// Skins are kept as pictures in their own small database (localStorage is too small and is
// already used by the library); which one is on the deck is remembered in localStorage.
const ACTIVE = 'cool_read_deck_skin_on';
const EVENT = 'coolread-deck-skin';
// The door is drawn landscape (3:2) and turned a quarter in the upright deck
const LW = 1800, LH = 1200;
// its window, as a share of the landscape door (see drawLidCanvas in deckArt.ts)
const WIN = { x: 60 / 600, y: 48 / 400, w: 480 / 600, h: 188 / 400 };

export interface DeckSkin { id: string; name: string; added: number; blob: Blob }

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  return dbp || (dbp = new Promise((ok, fail) => {
    const r = indexedDB.open('coolread_deck_skins', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('skins', { keyPath: 'id' }); };
    r.onsuccess = () => { ok(r.result); migrateOldSkin(r.result); };
    r.onerror = () => { dbp = null; fail(r.error); };
  }));
}
// The first test build kept a single skin in localStorage: move it into the list
function migrateOldSkin(d: IDBDatabase) {
  let old: string | null = null;
  try { old = localStorage.getItem('cool_read_deck_skin'); } catch { return; }
  if (!old) return;
  fetch(old).then(r => r.blob()).then(blob => {
    const skin: DeckSkin = { id: 'skin_' + Date.now().toString(36), name: 'My skin', added: Date.now(), blob };
    const t = d.transaction('skins', 'readwrite'); t.objectStore('skins').put(skin);
    t.oncomplete = () => { try { localStorage.removeItem('cool_read_deck_skin'); } catch { /* */ } setActiveDeckSkin(skin.id); };
  }).catch(() => {});
}
async function tx<T>(mode: IDBTransactionMode, run: (st: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((ok, fail) => {
    const req = run(d.transaction('skins', mode).objectStore('skins'));
    req.onsuccess = () => ok(req.result); req.onerror = () => fail(req.error);
  });
}

export async function listDeckSkins(): Promise<DeckSkin[]> {
  try { return ((await tx('readonly', st => st.getAll())) as DeckSkin[]).sort((a, b) => a.added - b.added); }
  catch { return []; }
}
export function activeDeckSkinId(): string | null {
  try { return localStorage.getItem(ACTIVE); } catch { return null; }
}
export function setActiveDeckSkin(id: string | null) {
  try { if (id) localStorage.setItem(ACTIVE, id); else localStorage.removeItem(ACTIVE); } catch { /* blocked */ }
  window.dispatchEvent(new Event(EVENT));
}
export async function deleteDeckSkin(id: string) {
  await tx('readwrite', st => st.delete(id));
  urls.delete(id);
  if (activeDeckSkinId() === id) setActiveDeckSkin(null); else window.dispatchEvent(new Event(EVENT));
}
export function onDeckSkinChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

// One object URL per skin, kept for as long as the app runs
const urls = new Map<string, string>();
export function deckSkinUrl(s: DeckSkin): string {
  let u = urls.get(s.id);
  if (!u) { u = URL.createObjectURL(s.blob); urls.set(s.id, u); }
  return u;
}
/** The picture of the skin that is on the deck, or null */
export async function activeDeckSkinUrl(): Promise<string | null> {
  const id = activeDeckSkinId(); if (!id) return null;
  try {
    const s = await tx('readonly', st => st.get(id)) as DeckSkin | undefined;
    return s ? deckSkinUrl(s) : null;
  } catch { return null; }
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((ok, fail) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('This picture cannot be read, try png or jpg')); i.src = src;
});

/** The template: the door of the current style as the user sees it, upright, 1200 × 1800 PNG */
export async function deckSkinTemplate(key: DeckKey): Promise<string> {
  const lid = await loadImage(lidArt(key));
  const W = 1200, H = 1800, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  // landscape (x, y) appears upright at (1 − y, x)
  g.translate(W, 0); g.rotate(Math.PI / 2); g.drawImage(lid, 0, 0, H, W);
  return c.toDataURL('image/png');
}

/** Takes the user's picture (upright, fitted to cover the door), cuts the window and keeps it */
export async function uploadDeckSkin(file: File): Promise<void> {
  if (file.type && !file.type.startsWith('image/')) throw new Error('Pick a picture: png, jpg or webp');
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
    const x = WIN.x * LW, y = WIN.y * LH, w = WIN.w * LW, h = WIN.h * LH, r = 42;
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill();
    const blob = await new Promise<Blob | null>(ok => c.toBlob(ok, 'image/webp', 0.9))
      .then(b => b && b.type === 'image/webp' ? b : new Promise<Blob | null>(ok => c.toBlob(ok, 'image/png')));
    if (!blob) throw new Error('Could not draw the picture');
    const skin: DeckSkin = { id: 'skin_' + Date.now().toString(36), name: file.name.replace(/\.[^.]+$/, '') || 'Skin', added: Date.now(), blob };
    await tx('readwrite', st => st.put(skin));
    setActiveDeckSkin(skin.id);
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
