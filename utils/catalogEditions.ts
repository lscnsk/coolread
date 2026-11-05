import { CatalogBook } from '../data/catalogData';
import { Book } from '../types';

// Which edition of each lscnsk book the reader downloaded (catalog id -> edition hash and file size).
// When catalog.json lists another edition, the app offers to update the book.
const EDITIONS_KEY = 'cool_read_lscnsk_editions';
// After an update, where the reader was (by chapter name), applied when the new file is first opened.
const REMAP_KEY = 'cool_read_edition_remap';

type EditionRecord = { edition?: string; size?: number };

const readJson = <T,>(key: string): T | null => {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) as T : null; } catch { return null; }
};
const writeJson = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full */ }
};

export function rememberEdition(catalogId: string, edition: string | undefined, size: number) {
  const all = readJson<Record<string, EditionRecord>>(EDITIONS_KEY) || {};
  all[catalogId] = { edition, size };
  writeJson(EDITIONS_KEY, all);
}

/** The library copy of a catalog book, if the reader has it. */
export function findLibraryBook(catalogBook: CatalogBook, libraryBooks: Book[]): Book | undefined {
  return libraryBooks.find(libBook => {
    if ((libBook as any).catalogId && (libBook as any).catalogId === catalogBook.id) return true;
    const cleanLibTitle = (libBook.title || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').trim();
    const cleanCatTitle = (catalogBook.title || '').toLowerCase().trim();
    if (!cleanLibTitle || !cleanCatTitle) return false;
    return cleanLibTitle === cleanCatTitle || cleanLibTitle.includes(cleanCatTitle) || cleanCatTitle.includes(cleanLibTitle);
  });
}

/**
 * True when the catalog has another edition than the one in the library: by the edition
 * remembered at download, or, for books downloaded before editions were remembered, by file size.
 */
export function hasNewEdition(catalogBook: CatalogBook, libBook: Book | undefined): boolean {
  if (!libBook || libBook.type !== 'ebook') return false;
  const rec = (readJson<Record<string, EditionRecord>>(EDITIONS_KEY) || {})[catalogBook.id];
  if (rec?.edition && catalogBook.edition) return rec.edition !== catalogBook.edition;
  if (rec?.size) return Boolean(catalogBook.sizeBytes) && catalogBook.sizeBytes !== rec.size;
  // Downloaded before editions were remembered: only a book with exactly the catalog's title
  // (not just a similar one of the reader's own) is compared, by file size
  const sameTitle = (libBook.title || '').trim().toLowerCase() === (catalogBook.title || '').trim().toLowerCase();
  if (sameTitle && libBook.format === 'fb2' && catalogBook.sizeBytes && libBook.size) return catalogBook.sizeBytes !== libBook.size;
  return false;
}

export type EditionRemap = { chapterName?: string; time?: number; total?: number };

export function setEditionRemap(bookId: string, remap: EditionRemap) {
  const all = readJson<Record<string, EditionRemap>>(REMAP_KEY) || {};
  all[bookId] = remap;
  writeJson(REMAP_KEY, all);
}

/** Returns and forgets the place saved for a just-updated book. */
export function takeEditionRemap(bookId: string): EditionRemap | null {
  const all = readJson<Record<string, EditionRemap>>(REMAP_KEY);
  if (!all || !all[bookId]) return null;
  const remap = all[bookId];
  delete all[bookId];
  writeJson(REMAP_KEY, all);
  return remap;
}
