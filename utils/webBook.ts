// Turns a text page from az.lib.ru ("Классика") into a tidy FB2 book: chapters from the
// page headings, footnotes, poems and epigraphs, Russian typography, and a generated cover.
// Used by the az.lib.ru catalog and the 📥 button of the built-in browser.

import { httpGet } from './opds';
import { drawCover } from './coverArt';

export type WebBookSite = 'azlib';

export function webBookSite(url: string): WebBookSite | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'az.lib.ru' || host.endsWith('.az.lib.ru')) return 'azlib';
  } catch {}
  return null;
}

// ---------- Book model ----------

interface Section {
  title: string[]; // inline FB2 for each title line
  epigraphs: string[]; // complete <epigraph> elements
  blocks: string[]; // <p>, <subtitle>, <poem>, <cite>, <empty-line/>
  children: Section[];
}

interface Person { first?: string; middle?: string; last?: string }

export interface WebBook {
  title: string;
  authors: Person[];
  translators: Person[];
  annotation: string[]; // plain paragraphs
  date?: string;
  lang: string;
  sourceUrl: string;
  sections: Section[];
  notes: string[]; // inline FB2 of note n1, n2, ...
}

const newSection = (title: string[] = []): Section => ({ title, epigraphs: [], blocks: [], children: [] });

// ---------- Text helpers ----------

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Book typography for one piece of plain text. */
function typoText(s: string): string {
  return s
    .replace(/[   \t\r\n]+/g, ' ')
    .replace(/\.{3,}/g, '…')
    .replace(/(^|\s)(--|–|-)(?=\s)/g, '$1—')
    .replace(/(\S)--(?=\S)/g, '$1 — ')
    .replace(/ {2,}/g, ' ');
}

/**
 * Finishes a paragraph of inline FB2: typography across tag boundaries, straight quotes
 * to «ёлочки», a dash at the start of a line of dialogue, trimmed spaces.
 */
function finishInline(xml: string): string {
  const parts = xml.split(/(<[^>]+>)/);
  let open = false;
  let prev = ' ';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) continue; // a tag
    let t = typoText(parts[i]);
    let out = '';
    for (let k = 0; k < t.length; k++) {
      const c = t[k];
      if (c === '"') {
        const before = k > 0 ? t[k - 1] : prev;
        const opening = !open && (/[\s(\[«„—–-]/.test(before) || before === '');
        out += opening ? '«' : '»';
        open = opening ? true : false;
      } else out += c;
    }
    parts[i] = out;
    if (out.length) prev = out[out.length - 1];
  }
  let s = parts.join('');
  // Dialogue: a leading hyphen or dash becomes "— "
  s = s.replace(/^(\s|<[^>]+>)*?[-–—]\s*/, m => m.replace(/[-–—]\s*$/, '— '));
  s = s.replace(/^\s+|\s+$/g, '').replace(/\s+(<\/(emphasis|strong)>)/g, '$1 ').replace(/(<(emphasis|strong)>)\s+/g, ' $1');
  s = s.replace(/ {2,}/g, ' ').replace(/^\s+|\s+$/g, '');
  // Empty formatting left behind, and neighbours such as <emphasis>Ра</emphasis><emphasis>ссказ</emphasis> joined
  s = s.replace(/<(emphasis|strong|sup|sub)>\s*<\/\1>/g, '');
  s = s.replace(/<\/(emphasis|strong)>(\s*)<\1>/g, '$2');
  return s;
}

const plain = (xml: string) => xml.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

function parsePerson(name: string, lastFirst: boolean): Person {
  const words = name.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return {};
  if (words.length === 1) return { last: words[0] };
  if (lastFirst) return { last: words[0], first: words[1], middle: words.slice(2).join(' ') || undefined };
  return { first: words[0], middle: words.length > 2 ? words.slice(1, -1).join(' ') : undefined, last: words[words.length - 1] };
}

export const personName = (p: Person) => [p.first, p.middle, p.last].filter(Boolean).join(' ');

// ---------- HTML to FB2 blocks ----------

type Event =
  | { kind: 'heading'; level: number; lines: string[] }
  | { kind: 'block'; xml: string }
  | { kind: 'epigraph'; xml: string };

interface Ctx {
  /** Note number for a footnote reference element, or null if it is not one. */
  noteRef: (el: Element) => number | null;
  /** True for elements that must be skipped entirely. */
  skip: (el: Element) => boolean;
  /** Heading level of an element, or 0. */
  headingLevel: (el: Element) => number;
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'DD', 'DT', 'DL', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'CENTER', 'TABLE', 'TBODY', 'TR', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'HR', 'SECTION', 'ARTICLE', 'FORM']);
const LINE_BREAK = '\u2028';

/** Inline FB2 for the children of an element. Line breaks come back as LINE_BREAK. */
function inlineOf(node: Node, ctx: Ctx): string {
  let out = '';
  node.childNodes.forEach(child => { out += inlineNode(child, ctx); });
  return out;
}

function inlineNode(child: Node, ctx: Ctx): string {
  let out = '';
  {
    if (child.nodeType === Node.TEXT_NODE) return xmlEscape(child.textContent || '');
    if (child.nodeType !== Node.ELEMENT_NODE) return '';
    const el = child as Element;
    if (ctx.skip(el)) return '';
    const tag = el.tagName.toUpperCase();
    const note = ctx.noteRef(el);
    if (note !== null) return `<a l:href="#n${note}" type="note">[${note}]</a>`;
    switch (tag) {
      case 'BR': return LINE_BREAK;
      case 'I': case 'EM': case 'CITE': case 'VAR': case 'DFN': {
        const inner = inlineOf(el, ctx);
        return inner.trim() ? `<emphasis>${inner}</emphasis>` : inner;
      }
      case 'B': case 'STRONG': {
        const inner = inlineOf(el, ctx);
        return inner.trim() ? `<strong>${inner}</strong>` : inner;
      }
      case 'SUP': return `<sup>${inlineOf(el, ctx)}</sup>`;
      case 'SUB': return `<sub>${inlineOf(el, ctx)}</sub>`;
      case 'IMG': return '';
      default:
        if (BLOCK_TAGS.has(tag)) return LINE_BREAK + inlineOf(el, ctx) + LINE_BREAK;
        out += inlineOf(el, ctx);
    }
  }
  return out;
}

/** Splits inline FB2 at line breaks into finished paragraphs (inline formatting stays balanced). */
function splitLines(xml: string): string[] {
  const lines: string[] = [];
  const stack: string[] = [];
  let cur = '';
  for (const piece of xml.split(/(<[^>]+>|\u2028)/)) {
    if (!piece) continue;
    if (piece === LINE_BREAK) {
      cur += stack.slice().reverse().map(t => `</${t}>`).join('');
      lines.push(cur);
      cur = stack.map(t => `<${t}>`).join('');
      continue;
    }
    const m = piece.match(/^<(\/?)(emphasis|strong|sup|sub)>$/);
    if (m) {
      if (m[1]) stack.pop();
      else stack.push(m[2]);
    }
    cur += piece;
  }
  lines.push(cur);
  return lines.map(finishInline).filter(l => plain(l).length > 0);
}

const isSceneBreak = (text: string) => /^[\s*•·⁂✱×xх#~]+$/i.test(text) && /[*•·⁂✱]/.test(text) && text.replace(/\s/g, '').length <= 9;

function paragraphs(lines: string[]): string[] {
  return lines.map(l => (isSceneBreak(plain(l)) ? '<subtitle>* * *</subtitle>' : `<p>${l}</p>`));
}

function poemXml(el: Element, ctx: Ctx): string {
  // Stanzas are separated by blank lines or by separate paragraphs
  const stanzas: string[][] = [];
  const pushStanzaFrom = (node: Element) => {
    const raw = inlineOf(node, ctx).split(/\u2028\s*\u2028/);
    for (const chunk of raw) {
      const lines = splitLines(chunk);
      if (lines.length) stanzas.push(lines);
    }
  };
  const ps = Array.from(el.querySelectorAll(':scope > p'));
  if (ps.length) ps.forEach(pushStanzaFrom);
  else pushStanzaFrom(el);
  if (!stanzas.length) return '';
  return '<poem>' + stanzas.map(s => '<stanza>' + s.map(v => `<v>${v.replace(/^— /, '— ')}</v>`).join('') + '</stanza>').join('') + '</poem>';
}


function isCentered(el: Element): boolean {
  for (let e: Element | null = el, i = 0; e && i < 4; e = e.parentElement, i++) {
    if (e.tagName.toUpperCase() === 'CENTER') return true;
    if ((e.getAttribute('align') || '').toLowerCase() === 'center') return true;
    if (/text-align\s*:\s*center/i.test(e.getAttribute('style') || '')) return true;
    if (/\b(center|text-center)\b/.test(e.getAttribute('class') || '')) return true;
  }
  return false;
}

/** A short line such as "II", "Глава третья" or "ЧАСТЬ ПЕРВАЯ" that the page shows as a plain paragraph. */
function looksLikeChapterTitle(text: string, el: Element): boolean {
  const t = text.trim();
  if (!t || t.length > 70) return false;
  if (/^[IVXLCХ]{1,7}\.?$/.test(t)) return true;
  if (/^(глава|часть|книга|том|действие|явление|песнь|chapter|part)\s+[\p{L}\d]+[.:]?(\s.{0,50})?$/iu.test(t) && (isCentered(el) || /^[^a-zа-яё]*$/.test(t.split(/\s+/)[0]) || t.split(/\s+/).length <= 3)) return true;
  if (/^\d{1,3}\.?$/.test(t) && isCentered(el)) return true;
  return false;
}

const stripFormatting = (xml: string) => xml.replace(/<\/?(emphasis|strong)>/g, '');

/** Walks a content element and produces headings and blocks in reading order. */
function walk(root: Element, ctx: Ctx, events: Event[]): void {
  let pending = '';
  const flush = () => {
    if (pending.trim()) {
      for (const b of paragraphs(splitLines(pending))) events.push({ kind: 'block', xml: b });
    }
    pending = '';
  };
  root.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      pending += xmlEscape(child.textContent || '');
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as Element;
    if (ctx.skip(el)) return;
    const tag = el.tagName.toUpperCase();
    const level = ctx.headingLevel(el);
    if (level) {
      flush();
      const lines = splitLines(inlineOf(el, ctx)).map(stripFormatting);
      if (lines.length) events.push({ kind: 'heading', level, lines });
      return;
    }
    const cls = (el.getAttribute('class') || '').toLowerCase();
    if (cls.includes('epigraph')) {
      flush();
      const inner: Event[] = [];
      walk(el, ctx, inner);
      const parts: string[] = [];
      inner.forEach(e => { if (e.kind === 'block') parts.push(e.xml); });
      // The last short right-aligned line is the epigraph's author
      let author = '';
      const last = el.querySelector('.align-right, [align="right"], .text-author');
      if (last && parts.length > 1) {
        const a = splitLines(inlineOf(last, ctx)).join(' ');
        const idx = parts.findIndex(p => plain(p) === plain(a));
        if (idx === parts.length - 1) { parts.pop(); author = a; }
      }
      const body = parts.map(p => (p.startsWith('<subtitle>') ? '' : p)).join('');
      if (body) events.push({ kind: 'epigraph', xml: `<epigraph>${body}${author ? `<text-author>${author.replace(/^<emphasis>(.*)<\/emphasis>$/, '$1')}</text-author>` : ''}</epigraph>` });
      return;
    }
    if (cls.split(/\s+/).includes('poem') || tag === 'POEM') {
      flush();
      const x = poemXml(el, ctx);
      if (x) events.push({ kind: 'block', xml: x });
      return;
    }
    if (tag === 'HR') {
      flush();
      events.push({ kind: 'block', xml: '<subtitle>* * *</subtitle>' });
      return;
    }
    if (tag === 'BLOCKQUOTE') {
      flush();
      const inner: Event[] = [];
      walk(el, ctx, inner);
      const body = inner.filter(e => e.kind === 'block').map(e => (e as any).xml).join('');
      if (body) events.push({ kind: 'block', xml: `<cite>${body}</cite>` });
      return;
    }
    if (tag === 'P' || tag === 'DD' || tag === 'DT' || tag === 'LI' || tag === 'PRE') {
      // A <p> or <dd> may hold nested blocks (az.lib.ru); those are walked on their own
      if (Array.from(el.children).some(c => ctx.headingLevel(c) || (c.getAttribute('class') || '').includes('poem'))) {
        flush();
        walk(el, ctx, events);
        return;
      }
      flush();
      const lines = splitLines(inlineOf(el, ctx));
      if (lines.length === 1 && looksLikeChapterTitle(plain(lines[0]), el)) {
        events.push({ kind: 'heading', level: 40, lines: [stripFormatting(lines[0])] });
        return;
      }
      for (const b of paragraphs(lines)) events.push({ kind: 'block', xml: b });
      return;
    }
    if (BLOCK_TAGS.has(tag)) {
      flush();
      // A centered line such as <center>II</center> is a chapter title
      if (!el.querySelector('p,div,dd,li,table,br,h1,h2,h3,h4,h5,h6')) {
        const lines = splitLines(inlineOf(el, ctx));
        if (lines.length === 1 && looksLikeChapterTitle(plain(lines[0]), el)) {
          events.push({ kind: 'heading', level: 40, lines: [stripFormatting(lines[0])] });
          return;
        }
      }
      walk(el, ctx, events);
      return;
    }
    pending += inlineNode(el, ctx);
  });
  flush();
}

/** Builds nested sections from the event stream. Distinct heading levels become nesting depths. */
function buildSections(events: Event[], skipTitles: string[] = []): Section[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const skip = new Set(skipTitles.map(norm).filter(Boolean));
  // Headings that only repeat the book title or author (az.lib.ru puts them on top) are dropped
  const filtered: Event[] = [];
  let seenText = false;
  const onlyRepeats = (text: string) => {
    let rest = text;
    for (const t of [...skip].sort((a, b) => b.length - a.length)) rest = rest.split(t).join('');
    return rest.length === 0;
  };
  for (const e of events) {
    if (e.kind === 'heading' && !seenText && onlyRepeats(norm(e.lines.map(plain).join(' ')))) continue;
    if (e.kind !== 'heading') seenText = true;
    filtered.push(e);
  }
  const levels = [...new Set(filtered.filter(e => e.kind === 'heading').map(e => (e as any).level as number))].sort((a, b) => a - b);
  const depthOf = (level: number) => levels.indexOf(level);
  const root = newSection();
  const stack: { section: Section; depth: number }[] = [{ section: root, depth: -1 }];
  for (const e of filtered) {
    if (e.kind === 'heading') {
      const depth = depthOf(e.level);
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
      const s = newSection(e.lines);
      stack[stack.length - 1].section.children.push(s);
      stack.push({ section: s, depth });
      continue;
    }
    const cur = stack[stack.length - 1].section;
    if (e.kind === 'epigraph' && cur.blocks.length === 0 && cur.children.length === 0) cur.epigraphs.push(e.xml);
    else if (e.kind === 'epigraph') cur.blocks.push(e.xml.replace(/^<epigraph>/, '<cite>').replace(/<\/epigraph>$/, '</cite>'));
    else {
      // Text after sub-sections belongs to the last of them
      let target = cur;
      while (target.children.length) target = target.children[target.children.length - 1];
      target.blocks.push(e.xml);
    }
  }
  const out = root.children.slice();
  if (root.blocks.length) out.unshift({ ...newSection(), blocks: root.blocks, epigraphs: root.epigraphs });
  else if (root.epigraphs.length && out.length) out[0].epigraphs.unshift(...root.epigraphs);
  return out.filter(hasContent);
}

const hasContent = (s: Section): boolean => s.blocks.length > 0 || s.children.some(hasContent);

// ---------- Fetching ----------

export async function fetchHtml(url: string): Promise<string> {
  const res = await httpGet(url, undefined, true, { Accept: 'text/html,*/*;q=0.8' }, { timeoutMs: 60000, sameProtocol: true });
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.blob!.arrayBuffer());
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 2048)).toLowerCase();
  const declared = (res.contentType.match(/charset=([\w-]+)/i)?.[1] || head.match(/charset=["']?([\w-]+)/)?.[1] || '').toLowerCase();
  if (declared) {
    try {
      return new TextDecoder(declared === 'cp1251' ? 'windows-1251' : declared).decode(bytes);
    } catch {}
  }
  // No charset given (az.lib.ru lists often have none): UTF-8 if it is valid, otherwise the old Russian encoding
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1251').decode(bytes);
  }
}

// ---------- az.lib.ru ----------

export function parseAzLib(html: string, url: string): WebBook {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pageTitle = (doc.querySelector('title')?.textContent || '').replace(/^\s*Lib\.ru\/Классика:?\s*/i, '').trim();
  // "Фамилия Имя. Название"
  const dot = pageTitle.indexOf('. ');
  const authorRaw = dot > 0 ? pageTitle.slice(0, dot) : '';
  const title = (dot > 0 ? pageTitle.slice(dot + 2) : pageTitle).trim() || 'Без названия';

  const info = Array.from(doc.querySelectorAll('li')).map(li => (li.textContent || '').replace(/\s+/g, ' ').trim());
  const year = info.map(t => t.match(/^Год:\s*(.+)$/)?.[1]).find(Boolean);
  const transRaw = (html.match(/\(перевод:\s*([^)<]+)\)/)?.[1] || '').trim();
  const translators = transRaw && !/без указания/i.test(transRaw) ? transRaw.split(/,| и /).map(t => parsePerson(t.trim(), false)) : [];

  let annotation: string[] = [];
  const annLi = Array.from(doc.querySelectorAll('li')).find(li => /^\s*Аннотация:/.test(li.textContent || ''));
  if (annLi) {
    const t = (annLi.innerHTML || '').replace(/<b>\s*<font[^>]*>\s*Аннотация:\s*<\/font>\s*<\/b>/i, '').replace(/Аннотация:/, '');
    const d = new DOMParser().parseFromString(`<div>${t}</div>`, 'text/html');
    d.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    annotation = (d.body.textContent || '').split('\n').map(s => typoText(s).trim()).filter(Boolean);
  }

  // The text sits between the "Section Begins" and "Section Ends" comments
  let body = html;
  const b = html.indexOf('<!--Section Begins-->');
  const e = html.lastIndexOf('<!--Section Ends-->');
  if (b >= 0 && e > b) body = html.slice(b, e);
  else {
    const s = html.search(/Собственно произведение/);
    const end = html.indexOf('</noindex>', s);
    if (s >= 0) body = html.slice(s, end > s ? end : undefined);
  }
  const content = new DOMParser().parseFromString(`<div id="cr-root">${body}</div>`, 'text/html').getElementById('cr-root')!;

  // Footnotes: a "Примечания" heading near the end and numbered paragraphs after it
  const notes: string[] = [];
  const noteIds = new Map<string, number>();
  const ctx: Ctx = {
    skip: el => ['SCRIPT', 'STYLE', 'FORM', 'NOSCRIPT', 'IMG', 'SELECT'].includes(el.tagName.toUpperCase()),
    headingLevel: el => {
      const m = el.tagName.match(/^H([1-6])$/i);
      if (m) return Number(m[1]);
      return 0;
    },
    noteRef: el => {
      if (el.tagName.toUpperCase() !== 'SUP' && el.tagName.toUpperCase() !== 'A') return null;
      const key = (el.textContent || '').replace(/[\[\]{}()\s]/g, '');
      if (!/^(\d{1,3}|\*{1,3})$/.test(key)) return null;
      return noteIds.has(key) ? noteIds.get(key)! : null;
    },
  };
  extractTrailingNotes(content, ctx, notes, noteIds);

  const events: Event[] = [];
  walk(content, ctx, events);
  const person = parsePerson(authorRaw, true);
  const sections = buildSections(events, [title, authorRaw, personName(person), [person.first, person.last].filter(Boolean).join(' ')]);

  return {
    title,
    authors: authorRaw ? [parsePerson(authorRaw, true)] : [],
    translators,
    annotation,
    date: year,
    lang: 'ru',
    sourceUrl: url,
    sections,
    notes,
  };
}

/** Finds "Примечания"/"Комментарии" at the end of the text and moves numbered notes out of it. */
function extractTrailingNotes(content: Element, ctx: Ctx, notes: string[], noteIds: Map<string, number>) {
  const candidates = Array.from(content.querySelectorAll('h1,h2,h3,h4,h5,h6,b,p,div,center'))
    .filter(el => /^\s*(Примечания|Комментарии|Сноски)( переводчика| автора)?\s*\.?\s*$/i.test(el.textContent || ''));
  const head = candidates[candidates.length - 1];
  if (!head) return;
  // Everything after the heading in document order
  const all = Array.from(content.querySelectorAll('*'));
  let headTop: Element = head;
  while (headTop.parentElement && headTop.parentElement !== content && (headTop.parentElement.textContent || '').trim() === (head.textContent || '').trim()) headTop = headTop.parentElement;
  const after = all.filter(el => headTop.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && !headTop.contains(el));
  const paras = after.filter(el => /^(DD|P|LI)$/i.test(el.tagName));
  const found: { key: string; el: Element }[] = [];
  for (const p of paras) {
    const m = (p.textContent || '').replace(/^[\s ]+/, '').match(/^(\d{1,3}|\*{1,3})[\s.)\]]/);
    if (m) found.push({ key: m[1], el: p });
  }
  if (found.length === 0) return;
  for (const f of found) {
    const n = notes.length + 1;
    if (!noteIds.has(f.key)) noteIds.set(f.key, n);
    const xml = splitLines(inlineOf(f.el, { ...ctx, noteRef: () => null })).join(' ').replace(/^(\d{1,3}|\*{1,3})[\s.)\]]+/, '');
    notes.push(xml);
  }
  // Remove the notes block from the text
  after.forEach(el => { if (!el.contains(headTop)) el.remove(); });
  headTop.remove();
}

// ---------- FB2 writer ----------

function personXml(tag: string, p: Person): string {
  const parts = [
    p.first ? `<first-name>${xmlEscape(p.first)}</first-name>` : '',
    p.middle ? `<middle-name>${xmlEscape(p.middle)}</middle-name>` : '',
    `<last-name>${xmlEscape(p.last || '')}</last-name>`,
  ];
  return `<${tag}>${parts.join('')}</${tag}>`;
}

function sectionXml(s: Section, id: { n: number }): string {
  let out = `<section id="s${id.n++}">`;
  if (s.title.length) out += `<title>${s.title.map(t => `<p>${t}</p>`).join('')}</title>`;
  out += s.epigraphs.join('');
  if (s.children.length) {
    // FB2 allows either text or sub-sections in a section: text before the first one gets its own
    if (s.blocks.length) out += sectionXml({ ...newSection(), blocks: s.blocks }, id);
    out += s.children.filter(hasContent).map(c => sectionXml(c, id)).join('');
  } else {
    out += s.blocks.join('');
  }
  return out + '</section>';
}

export function buildFb2(book: WebBook, cover?: { base64: string; type: string }): string {
  const authors = book.authors.length ? book.authors : [{ last: 'Неизвестный автор' }];
  const title = xmlEscape(book.title);
  const authorLine = xmlEscape(authors.map(personName).join(', '));
  const titleInfo = [
    '<genre>prose_classic</genre>',
    ...authors.map(a => personXml('author', a)),
    `<book-title>${title}</book-title>`,
    book.annotation.length ? `<annotation>${book.annotation.map(p => `<p>${xmlEscape(p)}</p>`).join('')}</annotation>` : '',
    book.date ? `<date>${xmlEscape(book.date)}</date>` : '',
    cover ? '<coverpage><image l:href="#cover.jpg"/></coverpage>' : '',
    `<lang>${book.lang}</lang>`,
    ...book.translators.filter(t => t.last).map(t => personXml('translator', t)),
  ].join('');
  const docInfo = [
    personXml('author', { last: 'CoolRead' }),
    '<program-used>CoolRead</program-used>',
    `<date value="${new Date().toISOString().slice(0, 10)}">${new Date().toISOString().slice(0, 10)}</date>`,
    `<src-url>${xmlEscape(book.sourceUrl)}</src-url>`,
    `<id>coolread-${hash(book.sourceUrl)}</id>`,
    '<version>1.0</version>',
  ].join('');
  const id = { n: 1 };
  const sections = book.sections.length ? book.sections : [{ ...newSection(), blocks: ['<p>…</p>'] }];
  const body = `<body><title><p>${authorLine}</p><p>${title}</p></title>${sections.map(s => sectionXml(s, id)).join('')}</body>`;
  const notes = book.notes.length
    ? `<body name="notes"><title><p>Примечания</p></title>${book.notes.map((n, i) => `<section id="n${i + 1}"><title><p>${i + 1}</p></title><p>${n || '…'}</p></section>`).join('')}</body>`
    : '';
  const binary = cover ? `<binary id="cover.jpg" content-type="${cover.type}">${cover.base64}</binary>` : '';
  // Control characters (az.lib.ru texts have some) would break the XML from that point on
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink"><description><title-info>${titleInfo}</title-info><document-info>${docInfo}</document-info></description>${body}${notes}${binary}</FictionBook>`;
  return xml.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u2028\uFFFE\uFFFF]/g, '');
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

// ---------- Cover ----------


export { drawCover };

// ---------- Entry point ----------

export async function webPageToFb2(url: string): Promise<File> {
  if (!webBookSite(url)) throw new Error('This page is not from az.lib.ru');
  const html = await fetchHtml(url);
  const book = parseAzLib(html, url);
  if (!book.sections.length) throw new Error('No book text found on this page');
  const author = book.authors.map(personName).join(', ');
  const cover = await drawCover(book.title, author);
  const xml = buildFb2(book, cover);
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  const name = `${safe(author ? `${author} - ${book.title}` : book.title) || 'book'}.fb2`;
  return new File([xml], name, { type: 'application/x-fictionbook+xml', lastModified: Date.now() });
}
