import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { httpGet } from './opds';

// MangaDex through its public API (https://api.mangadex.org/docs).
// Chapters are downloaded page by page from MangaDex@Home and packed into one .cbz,
// so they open offline like any other comic.

const API = import.meta.env.VITE_MANGADEX_API || 'https://api.mangadex.org';
const UPLOADS = import.meta.env.VITE_MANGADEX_UPLOADS || 'https://uploads.mangadex.org';
const LANGS = ['ru', 'en'];
const RATINGS = ['safe', 'suggestive', 'erotica'];
const HEADERS = { Accept: 'application/json' };

export interface MdManga {
  id: string;
  title: string;
  authors: string[];
  description: string;
  coverUrl?: string;
}

export interface MdChapter {
  id: string;
  label: string; // e.g. "Vol. 1 Ch. 12 · Title"
  short: string; // the same without the volume: "Ch. 12 · Title"
  volume: string | null;
  lang: string;
  group: string;
  pages: number;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// The API allows about 5 requests per second; keep well below it.
let lastCall = 0;
async function getJson(path: string, params: [string, string][] = []): Promise<any> {
  const wait = lastCall + 250 - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const qs = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const res = await httpGet(`${API}${path}${qs ? '?' + qs : ''}`, undefined, false, HEADERS);
  if (res.status === 429) {
    await sleep(3000);
    return getJson(path, params);
  }
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  const data = JSON.parse(res.text || '{}');
  if (data.result === 'error') throw new Error(data.errors?.[0]?.detail || 'error');
  return data;
}

function pickText(map: Record<string, string> | undefined): string {
  if (!map) return '';
  return map.ru || map.en || Object.values(map)[0] || '';
}

function cleanDescription(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // markdown links
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/\n-{3,}[\s\S]*$/, '') // trailing link sections
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function searchManga(query: string, offset = 0): Promise<{ items: MdManga[]; total: number }> {
  const params: [string, string][] = [
    ['title', query],
    ['limit', '20'],
    ['offset', String(offset)],
    ['includes[]', 'cover_art'],
    ['includes[]', 'author'],
    ['order[relevance]', 'desc'],
    ...LANGS.map(l => ['availableTranslatedLanguage[]', l] as [string, string]),
    ...RATINGS.map(r => ['contentRating[]', r] as [string, string]),
  ];
  const data = await getJson('/manga', params);
  const items: MdManga[] = (data.data || []).map((m: any) => {
    const a = m.attributes || {};
    const ruAlt = (a.altTitles || []).find((t: any) => t.ru)?.ru;
    const cover = (m.relationships || []).find((r: any) => r.type === 'cover_art')?.attributes?.fileName;
    return {
      id: m.id,
      title: ruAlt || a.title?.en || pickText(a.title) || 'Untitled',
      authors: [...new Set<string>((m.relationships || []).filter((r: any) => r.type === 'author' && r.attributes?.name).map((r: any) => r.attributes.name))],
      description: cleanDescription(pickText(a.description)),
      coverUrl: cover ? `${UPLOADS}/covers/${m.id}/${cover}.256.jpg` : undefined,
    };
  });
  return { items, total: data.total || 0 };
}

const num = (s: string | null | undefined) => (s == null || s === '' ? Number.POSITIVE_INFINITY : parseFloat(s));

/**
 * All readable chapters, one per chapter number: Russian when there is one, otherwise English.
 * `external` counts chapters that only link to an official site (licensed titles).
 */
export async function fetchChapters(mangaId: string): Promise<{ chapters: MdChapter[]; external: number }> {
  const raw: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const data = await getJson(`/manga/${mangaId}/feed`, [
      ['limit', '500'],
      ['offset', String(offset)],
      ['includes[]', 'scanlation_group'],
      ['order[volume]', 'asc'],
      ['order[chapter]', 'asc'],
      ...LANGS.map(l => ['translatedLanguage[]', l] as [string, string]),
      ...RATINGS.map(r => ['contentRating[]', r] as [string, string]),
    ]);
    raw.push(...(data.data || []));
    if (offset + 500 >= (data.total || 0)) break;
  }

  const best = new Map<string, any>();
  let external = 0;
  for (const ch of raw) {
    const a = ch.attributes || {};
    // Chapters hosted by official publishers only link out and have no pages here
    if (a.externalUrl || !a.pages) {
      external++;
      continue;
    }
    const key = a.chapter ? `c${parseFloat(a.chapter)}` : `id${ch.id}`;
    const prev = best.get(key);
    const rank = LANGS.indexOf(a.translatedLanguage);
    if (!prev || rank < LANGS.indexOf(prev.attributes.translatedLanguage)) best.set(key, ch);
  }

  const chapters = [...best.values()]
    .sort((x, y) => num(x.attributes.volume) - num(y.attributes.volume) || num(x.attributes.chapter) - num(y.attributes.chapter))
    .map(ch => {
      const a = ch.attributes;
      const chPart = a.chapter ? `Ch. ${a.chapter}` : 'Oneshot';
      const parts = [a.volume ? `Vol. ${a.volume}` : '', chPart].filter(Boolean).join(' ');
      return {
        id: ch.id,
        label: a.title ? `${parts} · ${a.title}` : parts,
        short: a.title ? `${chPart} · ${a.title}` : chPart,
        volume: a.volume || null,
        lang: a.translatedLanguage,
        group: (ch.relationships || []).find((r: any) => r.type === 'scanlation_group')?.attributes?.name || '',
        pages: a.pages,
      };
    });
  return { chapters, external };
}

/** Tells MangaDex@Home how a page load went, as their rules ask of every client. */
function report(url: string, success: boolean, bytes: number, duration: number, cached: boolean) {
  if (!Capacitor.isNativePlatform() || url.includes('mangadex.org')) return;
  CapacitorHttp.post({
    url: 'https://api.mangadex.network/report',
    headers: { 'Content-Type': 'application/json' },
    data: { url, success, bytes, duration, cached },
  }).catch(() => {});
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'manga';

const PARALLEL_PAGES = 4;

/** Downloads one page; on failure asks MangaDex for another server and tries the smaller "data-saver" copy. */
async function fetchPage(chapterId: string, server: { baseUrl: string; hash: string; data: string[]; dataSaver: string[] }, i: number, refresh: () => Promise<typeof server>): Promise<{ blob: Blob; name: string }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt === 2) server = await refresh();
    const saver = attempt === 3 && server.dataSaver?.[i];
    const name = saver ? server.dataSaver[i] : server.data[i];
    const url = `${server.baseUrl}/${saver ? 'data-saver' : 'data'}/${server.hash}/${name}`;
    const started = Date.now();
    try {
      const res = await httpGet(url, undefined, true, undefined, { timeoutMs: 40000, sameProtocol: true });
      if (res.status >= 400 || !res.blob || res.blob.size === 0) throw new Error(`HTTP ${res.status}`);
      report(url, true, res.blob.size, Date.now() - started, false);
      return { blob: res.blob, name };
    } catch {
      report(url, false, 0, Date.now() - started, false);
      await sleep(800);
    }
  }
  throw new Error(`page ${i + 1} of ${chapterId} failed`);
}

async function atHome(chapterId: string) {
  const res = await getJson(`/at-home/server/${chapterId}`);
  const { hash, data, dataSaver } = res.chapter || {};
  if (!res.baseUrl || !hash || !data?.length) throw new Error('no pages');
  return { baseUrl: res.baseUrl as string, hash: hash as string, data: data as string[], dataSaver: (dataSaver || []) as string[] };
}

/** Downloads the pages of one or more chapters (a volume) into a single .cbz file. */
export async function downloadChapters(
  manga: MdManga,
  chapters: MdChapter[],
  fileLabel: string,
  onProgress?: (done: number, total: number) => void
): Promise<File> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const total = chapters.reduce((n, ch) => n + ch.pages, 0);
  let done = 0;
  onProgress?.(0, total);
  for (let c = 0; c < chapters.length; c++) {
    const ch = chapters[c];
    let server = await atHome(ch.id);
    const refresh = async () => (server = await atHome(ch.id));
    const pages: { blob: Blob; name: string }[] = new Array(server.data.length);
    let next = 0;
    // A few pages at a time: much faster than one by one, still gentle on the servers
    const worker = async () => {
      while (next < server.data.length) {
        const i = next++;
        pages[i] = await fetchPage(ch.id, server, i, refresh);
        done++;
        onProgress?.(done, Math.max(total, done));
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_PAGES, server.data.length) }, worker));
    const prefix = chapters.length > 1 ? `${String(c + 1).padStart(3, '0')}_` : '';
    const width = String(pages.length).length;
    pages.forEach((p, i) => {
      const ext = (p.name.match(/\.(\w+)$/)?.[1] || 'jpg').toLowerCase();
      zip.file(`${prefix}${String(i + 1).padStart(width, '0')}.${ext}`, p.blob);
    });
  }
  const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return new File([out], `${safeName(manga.title)} - ${safeName(fileLabel)}.cbz`, { type: 'application/x-cbz', lastModified: Date.now() });
}

/** Title the chapter gets in the library; also used to tell which chapters are already there. */
export const chapterBookTitle = (manga: MdManga, chapter: MdChapter) => `${manga.title} · ${chapter.label}`;
export const volumeBookTitle = (manga: MdManga, volume: string) => `${manga.title} · Vol. ${volume}`;
