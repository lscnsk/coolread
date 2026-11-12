// Telegram version: the library shelf, reading progress and settings follow the reader's
// Telegram account to every device, through Telegram's CloudStorage for mini apps.
// Book files are too big for it (4096 characters per value), so a book read on another
// device shows here as a grey "missing" book until its file is added again; the file is
// then recognised and opens where the reader stopped.
//
// The app keeps working with its own local storage (localStorage + IndexedDB):
// - pullFromCloud() runs once before the app is drawn and merges the cloud into it;
// - syncToCloud() is called whenever the books, progress or settings change, and writes
//   what changed back, a few seconds later.
import { tg } from './telegram';
import { Book, BookType, PersistedState } from '../types';

const HISTORY = 'cool_read_history';
const META = 'cool_read_metadata';
const SETTINGS = 'cool_read_settings';
const STAMPS = 'cool_read_cloud_stamps';
const SETTINGS_KEY = 'set';
const DELETED_KEY = 'del';
const BOOK_PREFIX = 'b_';
const MAX_VALUE = 4096;
const PUSH_DELAY_MS = 4000;

interface CloudProgress { c: number; t: number; r?: number; u: number; tp?: number; fs?: number }
interface CloudBook {
  id: string;
  title: string;
  author?: string;
  series?: string;
  format?: string;
  type?: BookType;
  size?: number;
  cover?: string;
  /** when the title, author or series last changed */
  mu: number;
  p?: CloudProgress;
}
type MetaEntry = { title: string; author?: string; series?: string; coverUrl?: string; format?: string };
/** Local change times: settings, and per book [time, what the meta looked like then] */
interface Stamps { settings?: [number, string]; meta?: Record<string, [number, string]> }

interface TgCloudStorage {
  setItem(key: string, value: string, cb?: (err: unknown, ok?: boolean) => void): void;
  getItems(keys: string[], cb: (err: unknown, values?: Record<string, string>) => void): void;
  removeItem(key: string, cb?: (err: unknown, ok?: boolean) => void): void;
  getKeys(cb: (err: unknown, keys?: string[]) => void): void;
}

const storage = (): TgCloudStorage | null => {
  const app = tg() as any;
  if (!app || !app.isVersionAtLeast?.('6.9') || !app.CloudStorage) return null;
  return app.CloudStorage as TgCloudStorage;
};

const readJson = <T,>(key: string): T | null => {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) as T : null; } catch { return null; }
};
const writeJson = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* full */ } };

// Cloud keys allow A-Z a-z 0-9 _ - and up to 128 characters
const keyOf = (id: string) => {
  const k = BOOK_PREFIX + id.replace(/[^A-Za-z0-9_-]/g, '_');
  if (k.length <= 128) return k;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return k.slice(0, 110) + '_' + (h >>> 0).toString(36);
};

const call = <T,>(f: (cb: (err: unknown, v?: T) => void) => void, ms = 4000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('cloud timeout')), ms);
    try {
      f((err, v) => { clearTimeout(timer); if (err) reject(err); else resolve(v as T); });
    } catch (e) { clearTimeout(timer); reject(e); }
  });

// --- State of this session ---
let enabled = false;
const cloudBooks = new Map<string, CloudBook>();
let deleted: Record<string, number> = {};
/** What each cloud key holds now, as last read or written */
const sent = new Map<string, string>();
/** Books that were in this device's library during this session */
const seenLocal = new Set<string>();
let localBooks: Book[] = [];
let localDeleted: string[] = [];
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let preferredGhost: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => { try { l(); } catch { /* ignore */ } });

export const isCloudSyncOn = () => enabled;

export function onCloudChange(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const toProgress = (s: PersistedState): CloudProgress => ({
  c: s.chapterIndex, t: Math.round((s.time || 0) * 100) / 100, r: s.rate, u: s.lastUpdated,
  tp: s.totalProgress, fs: s.fontSize,
});
const fromProgress = (id: string, p: CloudProgress): PersistedState => ({
  bookId: id, chapterIndex: p.c, time: p.t, rate: p.r ?? 1, lastUpdated: p.u,
  totalProgress: p.tp, fontSize: p.fs,
});

const metaString = (m: MetaEntry | undefined) => JSON.stringify([m?.title || '', m?.author || '', m?.series || '']);

/**
 * Before the app is drawn: reads the cloud and merges it into local storage, so the app
 * starts with the newest progress and settings from any device. Gives up after a few
 * seconds (the app then starts with what this device has).
 */
export async function pullFromCloud(): Promise<void> {
  const cs = storage();
  if (!cs) return;
  try {
    const keys = await call<string[]>(cb => cs.getKeys(cb), 2500);
    const values: Record<string, string> = {};
    for (let i = 0; i < keys.length; i += 100) {
      const part = keys.slice(i, i + 100);
      Object.assign(values, await call<Record<string, string>>(cb => cs.getItems(part, cb), 2500));
    }
    for (const [k, v] of Object.entries(values)) if (v) sent.set(k, v);

    const stamps = readJson<Stamps>(STAMPS) || {};
    stamps.meta = stamps.meta || {};

    // Settings: the most recently changed ones win
    const set = values[SETTINGS_KEY] ? JSON.parse(values[SETTINGS_KEY]) as { u: number; v: string } : null;
    const localSettings = localStorage.getItem(SETTINGS);
    if (set && set.v && (!localSettings || set.u > (stamps.settings?.[0] || 0))) {
      localStorage.setItem(SETTINGS, set.v);
      stamps.settings = [set.u, set.v];
    }

    try { deleted = values[DELETED_KEY] ? JSON.parse(values[DELETED_KEY]) : {}; } catch { deleted = {}; }

    const history = readJson<Record<string, PersistedState>>(HISTORY) || {};
    const meta = readJson<Record<string, MetaEntry>>(META) || {};
    for (const [k, v] of Object.entries(values)) {
      if (!k.startsWith(BOOK_PREFIX) || !v) continue;
      let rec: CloudBook;
      try { rec = JSON.parse(v); } catch { continue; }
      if (!rec?.id || !rec.title) continue;
      cloudBooks.set(rec.id, rec);
      // Progress: the newest reading wins
      if (rec.p && (!history[rec.id] || rec.p.u > (history[rec.id].lastUpdated || 0))) {
        history[rec.id] = fromProgress(rec.id, rec.p);
      }
      // Title, author, series: the newest edit wins; a local cover stays local
      const local = meta[rec.id];
      const localStamp = stamps.meta[rec.id]?.[0] || 0;
      if (!local || rec.mu > localStamp) {
        meta[rec.id] = {
          ...local,
          title: rec.title, author: rec.author, series: rec.series,
          format: rec.format ?? local?.format,
          coverUrl: local?.coverUrl ?? rec.cover,
        };
        stamps.meta[rec.id] = [rec.mu, metaString(meta[rec.id])];
      }
    }
    writeJson(HISTORY, history);
    writeJson(META, meta);
    writeJson(STAMPS, stamps);
    enabled = true;
    // Unsaved changes are written when the app goes to the background
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  } catch (e) {
    console.warn('Cloud sync is off for this run', e);
  }
}

/** Called when the library, progress or settings change: writes them to the cloud a bit later */
export function syncToCloud(books: Book[], deletedIds: string[]): void {
  if (!enabled) return;
  localBooks = books.filter(b => !b.missing);
  localDeleted = deletedIds;
  localBooks.forEach(b => seenLocal.add(b.id));
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(flush, PUSH_DELAY_MS);
}

function put(cs: TgCloudStorage, key: string, value: string) {
  if (sent.get(key) === value) return;
  sent.set(key, value);
  cs.setItem(key, value, (err) => { if (err) sent.delete(key); });
}

function fit(rec: CloudBook): string {
  let s = JSON.stringify(rec);
  if (s.length > MAX_VALUE) { delete rec.cover; s = JSON.stringify(rec); }
  if (s.length > MAX_VALUE) { rec.title = rec.title.slice(0, 300); rec.author = rec.author?.slice(0, 200); rec.series = rec.series?.slice(0, 200); s = JSON.stringify(rec); }
  return s;
}

function flush() {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  const cs = storage();
  if (!enabled || !cs) return;
  const now = Date.now();
  const stamps = readJson<Stamps>(STAMPS) || {};
  stamps.meta = stamps.meta || {};

  const settings = localStorage.getItem(SETTINGS);
  if (settings) {
    if (stamps.settings?.[1] !== settings) stamps.settings = [now, settings];
    put(cs, SETTINGS_KEY, JSON.stringify({ u: stamps.settings[0], v: settings }));
  }

  const history = readJson<Record<string, PersistedState>>(HISTORY) || {};
  const meta = readJson<Record<string, MetaEntry>>(META) || {};
  let deletedChanged = false;
  for (const b of localBooks) {
    const m = meta[b.id];
    const p = history[b.id];
    // Deleted on another device: only kept if read here since then
    if (deleted[b.id] && !(p && p.lastUpdated > deleted[b.id])) continue;
    if (deleted[b.id]) { delete deleted[b.id]; deletedChanged = true; }
    const ms = metaString(m || { title: b.title, author: b.author, series: b.series });
    if (stamps.meta[b.id]?.[1] !== ms) stamps.meta[b.id] = [stamps.meta[b.id] ? now : 0, ms];
    const cover = m?.coverUrl || b.coverUrl;
    const rec: CloudBook = {
      id: b.id,
      title: m?.title || b.title,
      author: (m?.author ?? b.author) || undefined,
      series: (m?.series ?? b.series) || undefined,
      format: b.format || m?.format,
      type: b.type,
      size: b.size,
      cover: cover && /^https?:/.test(cover) ? cover : undefined,
      mu: stamps.meta[b.id][0],
      p: p ? toProgress(p) : cloudBooks.get(b.id)?.p,
    };
    cloudBooks.set(b.id, rec);
    put(cs, keyOf(b.id), fit(rec));
  }

  // Books deleted on this device leave the cloud too
  const here = new Set(localBooks.map(b => b.id));
  for (const id of Array.from(seenLocal)) {
    if (here.has(id)) continue;
    seenLocal.delete(id);
    forget(cs, id);
    deletedChanged = true;
  }
  if (deletedChanged) put(cs, DELETED_KEY, JSON.stringify(trimDeleted()));
  writeJson(STAMPS, stamps);
}

function forget(cs: TgCloudStorage, id: string) {
  const key = keyOf(id);
  cloudBooks.delete(id);
  sent.delete(key);
  deleted[id] = Date.now();
  cs.removeItem(key);
}

// The list of deleted books keeps the latest 200
function trimDeleted() {
  const entries = Object.entries(deleted).sort((a, b) => b[1] - a[1]).slice(0, 200);
  deleted = Object.fromEntries(entries);
  return deleted;
}

/** Books on the shelf of another device that this one does not have: shown grey */
export function missingBooks(): Book[] {
  if (!enabled) return [];
  const here = new Set(localBooks.map(b => b.id));
  const out: Book[] = [];
  for (const rec of cloudBooks.values()) {
    if (here.has(rec.id) || deleted[rec.id] || localDeleted.includes(rec.id)) continue;
    out.push({
      id: rec.id,
      title: rec.title,
      author: rec.author,
      series: rec.series,
      coverUrl: rec.cover,
      type: rec.type || 'ebook',
      format: rec.format as Book['format'],
      size: rec.size,
      chapters: [],
      missing: true,
    });
  }
  return out;
}

/** Removes a grey book from the shelf on every device */
export function forgetMissingBook(id: string): void {
  const cs = storage();
  if (!cs || !cloudBooks.has(id)) return;
  forget(cs, id);
  put(cs, DELETED_KEY, JSON.stringify(trimDeleted()));
  notify();
}

/** The reader tapped this grey book and is now adding its file */
export function preferMissingBook(id: string | null): void { preferredGhost = id; }

const norm = (s?: string) => (s || '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/[«»"'.,:;!?()\s-]+/g, ' ').trim();

/**
 * The id of the grey book a newly added book is, if any: the one the reader tapped,
 * or one of the same type with the same file size, or the same title and author.
 */
export function claimMissingBook(book: Pick<Book, 'title' | 'author' | 'size' | 'type'>): string | null {
  if (!enabled) return null;
  const ghosts = missingBooks();
  const tapped = preferredGhost && ghosts.find(g => g.id === preferredGhost);
  preferredGhost = null;
  if (tapped && tapped.type === book.type) return tapped.id;
  const sameType = ghosts.filter(g => g.type === book.type);
  const bySize = book.size ? sameType.find(g => g.size === book.size) : undefined;
  if (bySize) return bySize.id;
  const t = norm(book.title), a = norm(book.author);
  const byTitle = t ? sameType.find(g => norm(g.title) === t && (!a || !g.author || norm(g.author) === a)) : undefined;
  return byTitle?.id || null;
}
