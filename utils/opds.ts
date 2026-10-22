import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// OPDS (Atom) catalogs such as Flibusta, Calibre or COPS.
// On Android requests go through the native HTTP layer, so servers that do not
// send CORS headers still work. In a browser plain fetch is used.

export interface OpdsSource {
  id: string;
  title: string;
  url: string;
  username?: string;
  password?: string;
  // 'mangadex' opens the MangaDex search instead of an OPDS feed
  kind?: 'mangadex' | 'site'; // no kind: an OPDS catalog; 'site': a web page opened in the built-in browser
}

export interface OpdsLink {
  href: string;
  type: string;
  rel: string;
  title?: string;
}

export interface OpdsEntry {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  coverUrl?: string;
  // Book files the server offers
  acquisitions: OpdsLink[];
  // A sub-catalog to open (for navigation entries)
  navUrl?: string;
  language?: string;
  year?: string;
}

export interface OpdsFeed {
  title: string;
  url: string;
  entries: OpdsEntry[];
  nextUrl?: string;
  searchTemplate?: string;
  openSearchUrl?: string;
}

const STORAGE_KEY = 'cool_read_opds_sources';
const isNative = Capacitor.isNativePlatform();

export const MANGADEX_SOURCE: OpdsSource = { id: 'mangadex', title: 'mangadex', url: 'https://mangadex.org', kind: 'mangadex' };
// Not a catalog: the built-in browser, whose downloads go to the library
const FLIBUSTA_SOURCE: OpdsSource = { id: 'opds_preset_flibusta', title: 'flibusta', url: 'https://flibusta.is/opds' };

// Catalogs present on first launch; the user can delete them like any other.
// Set per build with VITE_OPDS_PRESET, e.g. "mangadex" or "flibusta,mangadex"; empty for a clean build.
const PRESET_SOURCES: OpdsSource[] = String(import.meta.env.VITE_OPDS_PRESET || '')
  .split(',')
  .map(s => s.trim())
  .flatMap(name => (name === 'flibusta' ? [FLIBUSTA_SOURCE] : name === 'mangadex' ? [MANGADEX_SOURCE] : []));

// Sites whose pages the built-in browser turns into fb2 books (📥). Added once; the user can delete them.
const BOOK_SITES: OpdsSource[] = [
  { id: 'site_preset_azlib', title: 'az.lib.ru', url: 'http://az.lib.ru/', kind: 'site' },
  { id: 'site_preset_wikisource', title: 'wikisource', url: 'https://ru.wikisource.org/', kind: 'site' },
];
const BOOK_SITES_KEY = 'cool_read_book_sites_added';

async function addBookSitesOnce(sources: OpdsSource[]): Promise<OpdsSource[]> {
  const get = async () => (isNative ? (await Preferences.get({ key: BOOK_SITES_KEY })).value : localStorage.getItem(BOOK_SITES_KEY));
  if (await get()) return sources;
  const missing = BOOK_SITES.filter(b => !sources.some(s => s.id === b.id || s.url.replace(/^https?:\/\//, '').startsWith(b.url.replace(/^https?:\/\//, ''))));
  const next = [...sources, ...missing];
  await saveOpdsSources(next);
  try {
    if (isNative) await Preferences.set({ key: BOOK_SITES_KEY, value: '1' });
    else localStorage.setItem(BOOK_SITES_KEY, '1');
  } catch {}
  return next;
}

export async function loadOpdsSources(): Promise<OpdsSource[]> {
  try {
    const raw = isNative ? (await Preferences.get({ key: STORAGE_KEY })).value : localStorage.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) return await addBookSitesOnce(PRESET_SOURCES);
    // Older builds named the preset Flibusta in Russian
    const sources = (JSON.parse(raw) as OpdsSource[]).map(s => (s.id === FLIBUSTA_SOURCE.id ? { ...s, title: FLIBUSTA_SOURCE.title } : s));
    return await addBookSitesOnce(sources);
  } catch {
    return [];
  }
}

export async function saveOpdsSources(sources: OpdsSource[]): Promise<void> {
  const raw = JSON.stringify(sources);
  try {
    if (isNative) await Preferences.set({ key: STORAGE_KEY, value: raw });
    else localStorage.setItem(STORAGE_KEY, raw);
  } catch {}
}

/** Adds https:// when missing and trims spaces. */
export function normalizeOpdsUrl(input: string): string {
  let url = input.trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

function authHeader(source?: OpdsSource): Record<string, string> {
  if (source?.username) {
    const token = btoa(unescape(encodeURIComponent(`${source.username}:${source.password || ''}`)));
    return { Authorization: `Basic ${token}` };
  }
  return {};
}

const TIMEOUT_MS = 12000;

export type HttpResult = { status: number; text?: string; blob?: Blob; contentType: string };

/**
 * GET with fallbacks: native HTTP first, then the WebView fetch, then the same
 * address over the other protocol (http <-> https). The error keeps every
 * attempt's reason so the user sees what actually failed.
 */
export async function httpGet(
  url: string,
  source: OpdsSource | undefined,
  binary: boolean,
  extraHeaders?: Record<string, string>,
  opts: { timeoutMs?: number; sameProtocol?: boolean } = {}
): Promise<HttpResult> {
  const reasons: string[] = [];
  const alt = opts.sameProtocol ? null : url.startsWith('https://') ? 'http://' + url.slice(8) : url.startsWith('http://') ? 'https://' + url.slice(7) : null;
  const attempts: [string, boolean][] = isNative
    ? [[url, true], [url, false], ...(alt ? [[alt, true] as [string, boolean]] : [])]
    : [[url, false]];
  for (const [u, native] of attempts) {
    try {
      // Hard limit per attempt: a blocked site can hang the connection
      // without ever triggering the socket timeouts.
      const limit = opts.timeoutMs ?? (binary ? 180000 : 15000);
      return await Promise.race([
        httpGetOnce(u, source, binary, native, extraHeaders),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer in ${limit / 1000} s`)), limit)),
      ]);
    } catch (e: any) {
      reasons.push(`${native ? 'native' : 'webview'} ${u.split('/')[0]}: ${e?.message || e}`);
    }
  }
  throw new Error('network: ' + reasons.join(' | '));
}

async function httpGetOnce(url: string, source: OpdsSource | undefined, binary: boolean, native: boolean, extraHeaders?: Record<string, string>): Promise<HttpResult> {
  const headers = {
    Accept: binary ? '*/*' : 'application/atom+xml, application/xml;q=0.9, */*;q=0.8',
    ...authHeader(source),
    ...extraHeaders,
  };
  if (native) {
    const res = await CapacitorHttp.get({
      url,
      headers,
      responseType: binary ? 'blob' : 'text',
      connectTimeout: TIMEOUT_MS,
      readTimeout: binary ? 120000 : TIMEOUT_MS,
    });
    const ctKey = Object.keys(res.headers || {}).find(k => k.toLowerCase() === 'content-type');
    const contentType = ctKey ? String(res.headers[ctKey]) : '';
    if (binary) {
      // Native layer returns binary data as base64
      const data = typeof res.data === 'string' ? res.data : '';
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      return { status: res.status, blob: new Blob([bytes], { type: contentType }), contentType };
    }
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    return { status: res.status, text, contentType };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), binary ? 120000 : TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const contentType = res.headers.get('content-type') || '';
    if (binary) return { status: res.status, blob: await res.blob(), contentType };
    return { status: res.status, text: await res.text(), contentType };
  } finally {
    clearTimeout(timer);
  }
}

function resolve(href: string | null | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

function childText(el: Element, localName: string): string {
  for (const c of Array.from(el.children)) {
    if (c.localName === localName) return (c.textContent || '').trim();
  }
  return '';
}

/** Turns the HTML annotation many catalogs send into plain text with line breaks. */
function htmlToText(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  doc.querySelectorAll('p, div, li').forEach(p => p.append('\n'));
  return (doc.body.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

export function parseOpdsFeed(xml: string, url: string): OpdsFeed {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'feed') {
    throw new Error('not-opds');
  }
  const root = doc.documentElement;
  const feed: OpdsFeed = { title: childText(root, 'title'), url, entries: [] };

  for (const link of Array.from(root.children).filter(c => c.localName === 'link')) {
    const rel = link.getAttribute('rel') || '';
    const type = link.getAttribute('type') || '';
    const href = link.getAttribute('href');
    if (rel === 'next') feed.nextUrl = resolve(href, url);
    if (rel === 'search') {
      if (type.includes('opensearchdescription')) feed.openSearchUrl = resolve(href, url);
      else if (href && href.includes('{searchTerms}')) feed.searchTemplate = resolve(href, url)?.replace(/%7BsearchTerms%7D/gi, '{searchTerms}');
    }
  }

  for (const entry of Array.from(root.children).filter(c => c.localName === 'entry')) {
    const authors = Array.from(entry.children)
      .filter(c => c.localName === 'author')
      .map(a => childText(a, 'name'))
      .filter(Boolean);

    let summary = '';
    for (const c of Array.from(entry.children)) {
      if (c.localName === 'content' || c.localName === 'summary') {
        const type = c.getAttribute('type') || 'text';
        const raw = type === 'xhtml' ? c.innerHTML : (c.textContent || '');
        const text = type === 'text' ? raw.trim() : htmlToText(raw);
        if (text.length > summary.length) summary = text;
      }
    }

    const item: OpdsEntry = {
      id: childText(entry, 'id') || Math.random().toString(36).slice(2),
      title: childText(entry, 'title') || 'Untitled',
      authors,
      summary,
      acquisitions: [],
      language: childText(entry, 'language'),
      year: childText(entry, 'issued'),
    };

    let thumb: string | undefined;
    let image: string | undefined;
    for (const link of Array.from(entry.children).filter(c => c.localName === 'link')) {
      const rel = link.getAttribute('rel') || '';
      const type = link.getAttribute('type') || '';
      const href = resolve(link.getAttribute('href'), url);
      if (!href) continue;
      if (rel.includes('opds-spec.org/acquisition')) {
        item.acquisitions.push({ href, type, rel, title: link.getAttribute('title') || undefined });
      } else if (rel === 'http://opds-spec.org/image/thumbnail' || rel === 'x-stanza-cover-image-thumbnail') {
        thumb = thumb || href;
      } else if (rel === 'http://opds-spec.org/image' || rel === 'x-stanza-cover-image') {
        image = image || href;
      } else if (type.includes('atom+xml') && !item.navUrl && rel !== 'alternate' && !rel.includes('related')) {
        item.navUrl = href;
      }
    }
    item.coverUrl = thumb || image;
    // A book with files does not need a sub-catalog link
    if (item.acquisitions.length > 0) item.navUrl = undefined;
    feed.entries.push(item);
  }
  return feed;
}

export async function fetchOpdsFeed(url: string, source?: OpdsSource): Promise<OpdsFeed> {
  const res = await httpGet(url, source, false);
  if (res.status === 401 || res.status === 403) throw new Error('auth');
  if (res.status >= 400) throw new Error(`http-${res.status}`);
  return parseOpdsFeed(res.text || '', url);
}

/** Finds the search URL template of a catalog: direct Atom template or OpenSearch description. */
export async function resolveSearchTemplate(feed: OpdsFeed, source?: OpdsSource): Promise<string | undefined> {
  if (feed.searchTemplate) return feed.searchTemplate;
  if (!feed.openSearchUrl) return undefined;
  try {
    const res = await httpGet(feed.openSearchUrl, source, false);
    const doc = new DOMParser().parseFromString(res.text || '', 'application/xml');
    const urls = Array.from(doc.getElementsByTagName('*')).filter(e => e.localName === 'Url');
    const pick = urls.find(u => (u.getAttribute('type') || '').includes('atom')) || urls[0];
    const tpl = pick?.getAttribute('template');
    return tpl ? resolve(tpl, feed.openSearchUrl)?.replace(/%7BsearchTerms%7D/gi, '{searchTerms}') : undefined;
  } catch {
    return undefined;
  }
}

export function buildSearchUrl(template: string, query: string): string {
  return template
    .replace('{searchTerms}', encodeURIComponent(query))
    .replace(/\{startPage\??\}/g, '1')
    .replace(/\{startIndex\??\}/g, '0')
    .replace(/\{[a-zA-Z:]+\?\}/g, '');
}

const FORMAT_ORDER = ['fb2', 'epub', 'pdf', 'mobi', 'txt', 'other'];

export function formatOf(link: OpdsLink): string {
  const t = link.type.toLowerCase();
  const h = link.href.toLowerCase();
  if (t.includes('fb2') || t.includes('fictionbook') || /\/fb2\/?$|\.fb2(\.zip)?$/.test(h)) return 'fb2';
  if (t.includes('epub') || /\/epub\/?$|\.epub$/.test(h)) return 'epub';
  if (t.includes('pdf') || /\.pdf$/.test(h)) return 'pdf';
  if (t.includes('mobi') || t.includes('kindle') || /\/mobi\/?$/.test(h)) return 'mobi';
  if (t.includes('text/plain') || /\/txt\/?$/.test(h)) return 'txt';
  return 'other';
}

/** Book files the reader can open, best format first, one per format. */
export function readableFormats(entry: OpdsEntry): { format: string; link: OpdsLink }[] {
  const seen = new Map<string, OpdsLink>();
  for (const link of entry.acquisitions) {
    const f = formatOf(link);
    if ((f === 'fb2' || f === 'epub' || f === 'pdf') && !seen.has(f)) seen.set(f, link);
  }
  return Array.from(seen.entries())
    .sort((a, b) => FORMAT_ORDER.indexOf(a[0]) - FORMAT_ORDER.indexOf(b[0]))
    .map(([format, link]) => ({ format, link }));
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'book';

/** Downloads a book and returns a File the library import understands (zips are unpacked). */
export async function downloadOpdsBook(entry: OpdsEntry, format: string, link: OpdsLink, source?: OpdsSource): Promise<File> {
  const res = await httpGet(link.href, source, true);
  if (res.status === 401 || res.status === 403) throw new Error('auth');
  if (res.status >= 400 || !res.blob) throw new Error(`http-${res.status}`);
  let blob = res.blob;
  const base = safeName(entry.title);

  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (isZip && format !== 'epub') {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(blob);
    const files = Object.values(zip.files).filter(f => !f.dir);
    const inner = files.find(f => f.name.toLowerCase().endsWith('.' + format)) || files[0];
    if (!inner) throw new Error('empty-zip');
    blob = await inner.async('blob');
  } else {
    // Some servers send HTML error pages with status 200
    const start = await blob.slice(0, 200).text();
    if (/^\s*<!doctype html|^\s*<html/i.test(start)) throw new Error('not-a-book');
  }

  const mime = format === 'fb2' ? 'application/x-fictionbook+xml' : format === 'epub' ? 'application/epub+zip' : 'application/pdf';
  return new File([blob], `${base}.${format}`, { type: mime, lastModified: Date.now() });
}

export function opdsErrorText(e: any): string {
  const m = String(e?.message || e || '');
  if (m === 'auth') return 'Login required';
  if (m === 'not-opds') return 'Not an OPDS catalog';
  if (m === 'not-a-book' || m === 'empty-zip') return 'Download failed';
  return 'Unable to connect';
}

