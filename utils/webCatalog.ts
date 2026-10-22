import type { OpdsEntry, OpdsFeed, OpdsLink } from './opds';
import { fetchHtml } from './webBook';
import { generatedCoverUrl } from './coverArt';

// az.lib.ru and Wikisource shown as catalogs: search gives a list of books, and a book
// is downloaded by turning its page into an fb2 (utils/webBook.ts). Addresses of these
// catalogs use the made-up scheme "coolread-web:", e.g. "coolread-web:wikisource/search?q=…".

export const WEB_CATALOG_PREFIX = 'coolread-web:';
export const AZLIB_CATALOG_URL = 'coolread-web:azlib';
export const WIKISOURCE_CATALOG_URL = 'coolread-web:wikisource';

const PAGE_SIZE = 40;
const FB2_TYPE = 'application/x-fictionbook+xml';

export const isWebCatalogUrl = (url: string) => url.startsWith(WEB_CATALOG_PREFIX);

const fb2Link = (pageUrl: string): OpdsLink => ({ href: pageUrl, type: FB2_TYPE, rel: 'http://opds-spec.org/acquisition' });

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = (s: string) => norm(s).split(' ').filter(w => w.length >= 2);
const plainText = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() || '';

/** Builds the feed for one catalog address. */
export async function fetchWebCatalogFeed(url: string): Promise<OpdsFeed> {
  const u = new URL(url.replace(WEB_CATALOG_PREFIX, 'http://web/'));
  const site = u.pathname.split('/')[1];
  const q = u.searchParams.get('q') || '';
  const offset = Number(u.searchParams.get('offset') || 0);
  const searchTemplate = `${WEB_CATALOG_PREFIX}${site}/search?q={searchTerms}`;
  if (site === 'azlib') {
    const entries = q ? await withCovers(await searchAzLib(q)) : [];
    return { title: 'az.lib.ru', url, entries, searchTemplate, searchHint: 'author, title: чехов вишневый' };
  }
  if (site === 'wikisource') {
    if (!q) return { title: 'wikisource', url, entries: [], searchTemplate };
    const { entries, nextOffset } = await searchWikisource(q, offset);
    const nextUrl = nextOffset !== undefined ? `${WEB_CATALOG_PREFIX}wikisource/search?q=${encodeURIComponent(q)}&offset=${nextOffset}` : undefined;
    return { title: 'wikisource', url, entries: await withCovers(entries), nextUrl, searchTemplate };
  }
  throw new Error('not-opds');
}

/** Small versions of the cover the downloaded book will get. */
async function withCovers(entries: OpdsEntry[]): Promise<OpdsEntry[]> {
  for (const e of entries) e.coverUrl = await generatedCoverUrl(e.title, e.authors.join(', '), 0.2);
  return entries;
}

// ---------- az.lib.ru ----------
// The site has no search: authors are listed by the first letter of the surname, and an
// author's page lists the works. So the query is matched against author names, and the
// words left over (if any) pick works by title: "конрад лагуна".

const AZ = 'http://az.lib.ru';
const AZ_LETTERS: Record<string, string> = {
  а: '/a/', б: '/b/', в: '/w/', г: '/g/', д: '/d/', е: '/e/', ж: '/z/index_zh.shtml', з: '/z/', и: '/i/',
  й: '/j/index_ij.shtml', к: '/k/', л: '/l/', м: '/m/', н: '/n/', о: '/o/', п: '/p/', р: '/r/', с: '/s/',
  т: '/t/', у: '/u/', ф: '/f/', х: '/h/', ц: '/c/', ч: '/c/index_ch.shtml', ш: '/s/index_sh.shtml',
  щ: '/s/index_sw.shtml', э: '/e/index_ae.shtml', ю: '/j/index_ju.shtml', я: '/j/index_ja.shtml',
};

type AzAuthor = { name: string; url: string; size: number };
const azIndexCache = new Map<string, Promise<AzAuthor[]>>();

function azAuthors(letterPath: string): Promise<AzAuthor[]> {
  let p = azIndexCache.get(letterPath);
  if (!p) {
    p = fetchHtml(AZ + letterPath).then(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const seen = new Set<string>();
      const out: AzAuthor[] = [];
      doc.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href') || '';
        if (!/^\/[a-z]\/[a-z0-9_]+\/$/.test(href) || seen.has(href)) return;
        const name = (a.textContent || '').replace(/\s+/g, ' ').trim();
        if (!name || !/[А-Яа-яЁё]/.test(name)) return;
        seen.add(href);
        // "(33008k,204)" after the link: the author's total size, used to put well-known authors first
        let after = '';
        for (let n = a.nextSibling; n && after.length < 120; n = n.nextSibling) after += n.textContent || '';
        const size = Number(after.match(/\((\d+)k,\s*\d+\)/)?.[1] || 0);
        out.push({ name, url: AZ + href, size });
      });
      return out;
    });
    p.catch(() => azIndexCache.delete(letterPath));
    azIndexCache.set(letterPath, p);
  }
  return p;
}

async function searchAzLib(query: string): Promise<OpdsEntry[]> {
  const qw = words(query);
  if (!qw.length) return [];
  const letters = Array.from(new Set(qw.map(w => AZ_LETTERS[w[0]]).filter(Boolean)));
  const lists = await Promise.all(letters.map(l => azAuthors(l).catch(() => [] as AzAuthor[])));

  // An author matches when a word of the query starts their surname (or another part of the name)
  const scored: { author: AzAuthor; score: number; used: Set<string> }[] = [];
  for (const author of lists.flat()) {
    const nw = words(author.name);
    let score = 0;
    const used = new Set<string>();
    for (const w of qw) {
      if (w.length < 3) continue;
      if (nw[0] === w) { score += 3; used.add(w); }
      else if (nw[0]?.startsWith(w)) { score += 2; used.add(w); }
      else if (nw.slice(1).some(n => n.length > 1 && n.startsWith(w))) { score += 1; used.add(w); }
    }
    if (score > 0 && nw[0] && used.size > 0 && Array.from(used).some(w => nw[0].startsWith(w))) scored.push({ author, score, used });
  }
  scored.sort((a, b) => b.score - a.score || b.author.size - a.author.size);
  const top = scored.filter(s => s.score === scored[0]?.score);
  const hasTitleWords = top.some(s => qw.some(w => !s.used.has(w)));
  const best = top.slice(0, hasTitleWords ? 6 : 3);

  // With title words ("чехов вишневый"), only the works whose titles match; otherwise all works
  const all: OpdsEntry[] = [];
  const picked: OpdsEntry[] = [];
  const pages = await Promise.all(best.map(b => fetchHtml(b.author.url).catch(() => '')));
  best.forEach(({ author, used }, i) => {
    if (!pages[i]) return;
    const works = azWorks(pages[i], author);
    all.push(...works);
    const rest = qw.filter(w => !used.has(w));
    if (rest.length) picked.push(...works.filter(e => rest.every(w => norm(e.title).split(' ').some(t => t.startsWith(w)))));
  });
  return picked.length ? picked : all;
}

/** The works listed on an author's page. */
function azWorks(html: string, author: AzAuthor): OpdsEntry[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: OpdsEntry[] = [];
  const seen = new Set<string>();
  // "Фамилия Имя Отчество" on the index; books show "Имя Фамилия"
  const parts = author.name.split(' ');
  const display = parts.length > 1 && !/\./.test(author.name) ? [...parts.slice(1), parts[0]].join(' ') : author.name;
  doc.querySelectorAll('dl').forEach(dl => {
    const a = Array.from(dl.querySelectorAll('a[href]')).find(x => /^text_[^/]+\.shtml$/i.test(x.getAttribute('href') || ''));
    if (!a) return;
    const href = new URL(a.getAttribute('href')!, author.url).toString();
    if (seen.has(href)) return;
    seen.add(href);
    const title = (a.textContent || '').replace(/\s+/g, ' ').trim();
    const dt = dl.querySelector('dt');
    const year = dt?.querySelector('small')?.textContent?.match(/\d{4}/)?.[0];
    const dd = dl.querySelector('dd');
    const summary = dd ? plainText(dd.innerHTML).replace(/Иллюстрации\/приложения:.*$/, '').trim() : '';
    const genres = Array.from(dt?.querySelectorAll('small') || []).map(s => s.textContent || '').find(t => /[А-Яа-я]/.test(t))
      ?.replace(/Оценка:\s*[\d.*]+/g, '').replace(/Комментарии:.*$/, '').replace(/\s+/g, ' ').trim();
    out.push({
      id: href,
      title,
      authors: [display],
      summary: [genres, summary].filter(Boolean).join(' · '),
      acquisitions: [fb2Link(href)],
      year,
      language: 'ru',
    });
  });
  return out;
}

// ---------- Wikisource ----------

const WS = 'https://ru.wikisource.org';
const WS_API = `${WS}/w/api.php`;
const wsPageUrl = (title: string) => `${WS}/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/')}`;

async function wsApi(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
  // The API answers "too many requests" to quick bursts: wait and try again
  for (let attempt = 0; ; attempt++) {
    try {
      return JSON.parse(await fetchHtml(`${WS_API}?${qs}`));
    } catch (e) {
      if (attempt >= 3 || !/HTTP 429/.test(String((e as Error)?.message))) throw e;
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

type WsPage = { title: string; categories: string[]; disambiguation: boolean; missing: boolean };

async function wsPages(titles: string[]): Promise<Map<string, WsPage>> {
  const out = new Map<string, WsPage>();
  for (let i = 0; i < titles.length; i += 50) {
    const d = await wsApi({ action: 'query', titles: titles.slice(i, i + 50).join('|'), prop: 'categories|pageprops', cllimit: 'max', clshow: '!hidden', redirects: '1' });
    for (const p of d?.query?.pages || []) {
      out.set(p.title, {
        title: p.title,
        categories: (p.categories || []).map((c: any) => String(c.title).replace(/^[^:]+:/, '')),
        disambiguation: Boolean(p.pageprops && 'disambiguation' in p.pageprops),
        missing: Boolean(p.missing),
      });
    }
  }
  return out;
}

// Dictionary and encyclopedia articles: "ЭСБЕ/…", "БСЭ1/…", "МСР/ВТ/…"
const isReference = (title: string) => /^[A-ZА-ЯЁ0-9]{2,8}\//.test(title);
const isEditionsList = (p?: WsPage) => Boolean(p?.categories.includes('Списки редакций'));
const isEdition = (p?: WsPage) => Boolean(p?.categories.includes('Тексты редакций'));

/** The page that holds the whole work for a search hit: a chapter leads to its book or edition. */
function wsRoot(title: string): string[] {
  const seg = title.split('/');
  if (seg.length === 1) return [title];
  // Both the book and its edition: which one holds the text is known only from categories
  return Array.from(new Set([seg.slice(0, 2).join('/'), seg[0]]));
}

function wsEntry(title: string, page?: WsPage): OpdsEntry {
  const seg = title.split('/');
  const m = seg[0].match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  const name = (m ? m[1] : seg[0]).trim();
  const author = m ? m[2].trim() : '';
  const edition = seg.slice(1).join(' / ');
  const cats = page?.categories || [];
  const year = cats.map(c => c.match(/^(?:Литература|Поэзия|Проза|Публицистика|Драматургия) (\d{4}) года$/)?.[1]).find(Boolean);
  const kinds = cats.filter(c => /^(Романы|Повести|Рассказы|Стихотворения|Поэмы|Пьесы|Сказки|Очерки|Статьи|Критика|Басни|Эссе|Комедии|Трагедии|Драмы)$/.test(c));
  const summary = [edition === 'ДО' ? 'дореформенная орфография' : edition ? `редакция ${edition}` : '', kinds.join(', ')].filter(Boolean).join(' · ');
  return { id: title, title: name, authors: author ? [author] : [], summary, acquisitions: [fb2Link(wsPageUrl(title))], year, language: 'ru' };
}

async function searchWikisource(query: string, offset: number): Promise<{ entries: OpdsEntry[]; nextOffset?: number }> {
  const d = await wsApi({ action: 'query', list: 'search', srsearch: query, srnamespace: '0', srlimit: String(PAGE_SIZE), sroffset: String(offset), srprop: '' });
  const hits: string[] = (d?.query?.search || []).map((h: any) => String(h.title)).filter((t: string) => !isReference(t));
  const nextOffset = d?.continue?.sroffset;

  const candidates = Array.from(new Set(hits.flatMap(wsRoot)));
  const pages = await wsPages(candidates);

  // Pick one page per hit: the edition when the chapter belongs to one, otherwise the book
  const roots: string[] = [];
  for (const hit of hits) {
    const seg = hit.split('/');
    let root = seg[0];
    if (seg.length > 1) {
      const two = seg.slice(0, 2).join('/');
      const p2 = pages.get(two);
      if (isEdition(p2) || seg[1] === 'ДО' || (p2 && !p2.missing && pages.get(seg[0])?.missing)) root = two;
    }
    const p = pages.get(root);
    if (!p || p.missing || p.disambiguation) continue;
    if (!roots.includes(root)) roots.push(root);
  }

  const entries: OpdsEntry[] = [];
  const shown = new Set<string>();
  for (const root of roots) {
    const page = pages.get(root);
    if (isEditionsList(page)) {
      // A list of editions: offer each edition as a book
      try {
        const e = await wsApi({ action: 'query', list: 'allpages', apprefix: root + '/', apnamespace: '0', aplimit: '50' });
        const eds: string[] = (e?.query?.allpages || []).map((p: any) => String(p.title)).filter((t: string) => t.split('/').length === root.split('/').length + 1);
        for (const t of eds) if (!shown.has(t)) { shown.add(t); entries.push(wsEntry(t, page)); }
      } catch {}
      continue;
    }
    if (!shown.has(root)) { shown.add(root); entries.push(wsEntry(root, page)); }
  }
  // Leave out pages that are not literature (theatre listings, decrees) and put titles that match first
  const qw = words(query);
  const matches = (e: OpdsEntry) => qw.filter(w => norm(e.title + ' ' + e.authors.join(' ')).split(' ').some(t => t.startsWith(w))).length;
  const kept = entries
    .filter(e => (e.authors[0] && !/\d/.test(e.authors[0])) || e.year || e.summary)
    .map((e, i) => ({ e, i, m: matches(e) }))
    .sort((a, b) => b.m - a.m || a.i - b.i)
    .map(x => x.e);
  return { entries: kept, nextOffset: typeof nextOffset === 'number' ? nextOffset : undefined };
}
