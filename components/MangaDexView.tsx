import React, { useEffect, useRef, useState } from 'react';
import { Download, Check } from 'lucide-react';
import { Book } from '../types';
import { OpdsSource, opdsErrorText } from '../utils/opds';
import { MdChapter, MdManga, chapterBookTitle, downloadChapters, fetchChapters, searchManga, volumeBookTitle } from '../utils/mangadex';
import { opdsPalette } from './OpdsView';

interface MangaDexViewProps {
  source: OpdsSource;
  appStyle?: string;
  libraryBooks: Book[];
  onClose: () => void;
  // Adds a chapter to the library; opens it when `open` is set
  onAdd: (file: File, meta: { title: string; author?: string; series?: string }, open: boolean) => Promise<Book>;
  onOpenBook: (book: Book) => void;
  backRef?: React.MutableRefObject<(() => void) | null>;
}

interface ViewState {
  query: string;
  results: MdManga[];
  total: number;
  searched: boolean;
  manga: MdManga | null;
  chapters: MdChapter[] | null;
  external: number;
  openVolumes: string[];
  listScroll: number;
}

const EMPTY: ViewState = { query: '', results: [], total: 0, searched: false, manga: null, chapters: null, external: 0, openVolumes: [], listScroll: 0 };

// Kept between visits, so coming back from a chapter returns to the same place
let saved: ViewState = EMPTY;

type Progress = { done: number; total: number } | 'error';

export const MangaDexView: React.FC<MangaDexViewProps> = ({ source, appStyle = 'Cool', libraryBooks, onClose, onAdd, onOpenBook, backRef }) => {
  const c = opdsPalette(appStyle);
  const [st, setSt] = useState<ViewState>(saved);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const stopBulk = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<ViewState>) => setSt(prev => (saved = { ...prev, ...patch }));

  useEffect(() => {
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: st.manga ? 0 : st.listScroll }));
    return () => { stopBulk.current = true; };
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setIsLoading(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(opdsErrorText(e));
    } finally {
      setIsLoading(false);
    }
  };

  const search = () => {
    const q = st.query.trim();
    if (!q) return;
    (document.activeElement as HTMLElement)?.blur();
    run(async () => {
      const { items, total } = await searchManga(q);
      update({ results: items, total, searched: true, manga: null, chapters: null, listScroll: 0 });
      listRef.current?.scrollTo({ top: 0 });
    });
  };

  const more = () =>
    run(async () => {
      const { items, total } = await searchManga(st.query.trim(), st.results.length);
      update({ results: [...st.results, ...items], total });
    });

  const openManga = (manga: MdManga) => {
    update({ manga, chapters: null, openVolumes: [], listScroll: listRef.current?.scrollTop || 0 });
    setExpanded(false);
    listRef.current?.scrollTo({ top: 0 });
    run(async () => update({ manga, ...(await fetchChapters(manga.id)) }));
  };

  const goBack = () => {
    if (st.manga) {
      stopBulk.current = true;
      const top = st.listScroll;
      update({ manga: null, chapters: null });
      setError(null);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top }));
    } else {
      onClose();
    }
  };

  useEffect(() => {
    if (!backRef) return;
    backRef.current = goBack;
    return () => { backRef.current = null; };
  });

  // What can be downloaded: whole volumes, plus chapters that belong to no volume
  type Unit = { key: string; title: string; label: string; chapters: MdChapter[]; volume?: string };
  const unitsOf = (manga: MdManga, chapters: MdChapter[]): Unit[] => {
    const units: Unit[] = [];
    const byVolume = new Map<string, Unit>();
    for (const ch of chapters) {
      if (ch.volume) {
        let u = byVolume.get(ch.volume);
        if (!u) {
          u = { key: 'v' + ch.volume, title: volumeBookTitle(manga, ch.volume), label: `Vol. ${ch.volume}`, chapters: [], volume: ch.volume };
          byVolume.set(ch.volume, u);
          units.push(u);
        }
        u.chapters.push(ch);
      } else {
        units.push({ key: 'c' + ch.id, title: chapterBookTitle(manga, ch), label: ch.label, chapters: [ch] });
      }
    }
    return units;
  };

  const bookFor = (manga: MdManga, title: string) => libraryBooks.find(b => b.title === title && b.series === manga.title);
  // A chapter counts as downloaded when its own book or its volume's book is in the library
  const chapterBook = (manga: MdManga, ch: MdChapter) =>
    bookFor(manga, chapterBookTitle(manga, ch)) || (ch.volume ? bookFor(manga, volumeBookTitle(manga, ch.volume)) : undefined);
  const unitBook = (manga: MdManga, u: Unit) => bookFor(manga, u.title) || (u.chapters.every(ch => chapterBook(manga, ch)) ? chapterBook(manga, u.chapters[0]) : undefined);

  const fetchToLibrary = async (manga: MdManga, key: string, title: string, label: string, chapters: MdChapter[], open: boolean) => {
    setProgress(p => ({ ...p, [key]: { done: 0, total: chapters.reduce((n, ch) => n + ch.pages, 0) } }));
    try {
      const file = await downloadChapters(manga, chapters, label, (done, total) => setProgress(p => ({ ...p, [key]: { done, total } })));
      await onAdd(file, { title, author: manga.authors.join(', '), series: manga.title }, open);
      setProgress(p => {
        const { [key]: _, ...rest } = p;
        return rest;
      });
      return true;
    } catch (e) {
      console.error('MangaDex download failed', e);
      setProgress(p => ({ ...p, [key]: 'error' }));
      return false;
    }
  };

  const busy = (key: string) => typeof progress[key] === 'object';

  const tapUnit = (u: Unit) => {
    if (!st.manga || bulk) return;
    const book = unitBook(st.manga, u);
    if (book) onOpenBook(book);
    else if (!busy(u.key)) fetchToLibrary(st.manga, u.key, u.title, u.label, u.chapters, true);
  };

  const tapChapter = (ch: MdChapter) => {
    if (!st.manga || bulk) return;
    const book = chapterBook(st.manga, ch);
    if (book) onOpenBook(book);
    else if (!busy('c' + ch.id)) fetchToLibrary(st.manga, 'c' + ch.id, chapterBookTitle(st.manga, ch), ch.label, [ch], true);
  };

  const downloadAll = async () => {
    if (!st.manga || !st.chapters) return;
    if (bulk) {
      stopBulk.current = true;
      return;
    }
    const manga = st.manga;
    const missing = unitsOf(manga, st.chapters).filter(u => !unitBook(manga, u));
    if (missing.length === 0) return;
    stopBulk.current = false;
    setBulk({ done: 0, total: missing.length });
    for (let i = 0; i < missing.length && !stopBulk.current; i++) {
      const u = missing[i];
      await fetchToLibrary(manga, u.key, u.title, u.label, u.chapters, false);
      setBulk({ done: i + 1, total: missing.length });
    }
    setBulk(null);
  };

  const isBimbo = appStyle === 'Bimbo', isSurf = appStyle === 'Surf', isMarcel = appStyle === 'Marcel';
  const isDragon = appStyle === 'Dragon', isFF = appStyle === 'Final' || appStyle === 'Final Fantasy';
  const brandClass = isMarcel ? 'text-[#544372]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0284C7]' : isDragon ? 'text-[#fcd34d]' : isFF ? 'text-[#dfc894]' : 'text-[#a8a29e]/80';
  const headerBorder = isMarcel ? 'border-[#C4B5E6]/70' : isBimbo ? 'border-[#FBCFE8]' : isSurf ? 'border-[#BAE6FD]' : isDragon ? 'border-[#7f1d1d]/60' : isFF ? 'border-[#406da3]/50' : 'border-[#45413e]/30';
  const inputClass = isMarcel
    ? 'bg-white border-[#C4B5E6] text-[#2F2440] placeholder-[#766594]/70 focus:border-[#766594]'
    : isBimbo
    ? 'bg-white border-[#FBCFE8] text-[#881337] placeholder-[#BE123C]/70 focus:border-[#BE123C]'
    : isSurf
    ? 'bg-white border-[#BAE6FD] text-[#0C4A6E] placeholder-[#0369A1]/70 focus:border-[#0284C7]'
    : isDragon
    ? 'bg-[#1a0f0d] border-[#7f1d1d] text-[#fcd34d] placeholder-[#b45309]/70 focus:border-[#ea580c]'
    : isFF
    ? 'bg-[#061124] border-[#406da3] text-[#f0deba] placeholder-[#8faada]/70 focus:border-[#dfc894]'
    : 'bg-[#2c2a28] border-[#45413e] text-[#fffff0] placeholder-[#888] focus:border-[#57534e]';

  const spinner = (size = 'w-8 h-8 border-4') => (
    <div className={`${size} rounded-full animate-spin`} style={{ borderColor: c.border, borderTopColor: c.accent }} />
  );

  const cover = (m: MdManga, cls: string) => (
    <div className={`${cls} shrink-0 rounded overflow-hidden border flex items-center justify-center`} style={{ borderColor: c.border, backgroundColor: c.card }}>
      {m.coverUrl ? (
        <img src={m.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover" onError={e => ((e.target as HTMLImageElement).style.display = 'none')} />
      ) : (
        <span className="text-2xl opacity-50">📖</span>
      )}
    </div>
  );

  const manga = st.manga;
  const units = manga && st.chapters ? unitsOf(manga, st.chapters) : [];
  const missingCount = manga ? units.filter(u => !unitBook(manga, u)).length : 0;
  const [openVolumes, setOpenVolumes] = [st.openVolumes || [], (v: string[]) => update({ openVolumes: v })];

  const status = (key: string, done: boolean, size = 16) => {
    const pr = progress[key];
    return (
      <div className="shrink-0 w-14 flex justify-end text-[11px] tabular-nums" style={{ color: pr ? c.accent : c.muted }}>
        {pr === 'error' ? <span>retry</span> : pr ? <span>{Math.floor((pr.done / Math.max(1, pr.total)) * 100)}%</span> : done ? <Check size={size} /> : <Download size={size} />}
      </div>
    );
  };
  const bar = (key: string) => {
    const pr = progress[key];
    return pr && pr !== 'error' ? (
      <div className="h-[2px] rounded-full overflow-hidden -mt-[2px]" style={{ backgroundColor: c.border }}>
        <div className="h-full transition-all duration-300" style={{ width: `${(pr.done / Math.max(1, pr.total)) * 100}%`, backgroundColor: c.accent }} />
      </div>
    ) : null;
  };

  return (
    <div className="flex-1 w-full h-full flex flex-col pt-24" style={{ color: c.text }}>
      <div className="max-w-4xl w-full mx-auto px-4 md:px-8">
        <div className={`mb-4 pb-2 border-b relative flex items-center justify-center min-h-[38px] ${headerBorder}`}>
          <span className={`lowercase select-none text-center font-literata font-bold text-sm md:text-base tracking-widest ${brandClass}`}>{source.title}</span>
        </div>
        <form className="flex items-center mb-2" onSubmit={e => { e.preventDefault(); search(); }}>
          <span className="text-2xl cursor-default select-none mr-2">🔍</span>
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={st.query}
            onChange={e => update({ query: e.target.value })}
            placeholder="search for a book"
            className={`flex-1 min-w-0 border rounded px-3 py-2 text-sm focus:outline-none ${inputClass}`}
          />
        </form>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
        <div className="max-w-4xl mx-auto px-4 md:px-8 pb-24">
          {error && (
            <div className="my-4 text-sm rounded-lg border px-3 py-2 font-literata" style={{ borderColor: c.border }}>
              {error}
              <button className="ml-2 underline" onClick={() => (manga ? openManga(manga) : search())}>Retry</button>
            </div>
          )}

          {manga ? (
            <>
              <div className="flex gap-3 py-3">
                {cover(manga, 'w-20 h-28')}
                <div className="flex-1 min-w-0">
                  <div className="font-literata font-bold text-base leading-snug">{manga.title}</div>
                  {manga.authors.length > 0 && <div className="font-literata italic text-xs mt-0.5" style={{ color: c.muted }}>{manga.authors.join(', ')}</div>}
                  {manga.description && (
                    <button onClick={() => setExpanded(x => !x)} className={`text-left text-xs mt-1 leading-relaxed whitespace-pre-line opacity-85 font-literata ${expanded ? '' : 'line-clamp-3'}`}>
                      {manga.description}
                    </button>
                  )}
                  {st.chapters && (bulk || missingCount > 0) && (
                    <button
                      onClick={downloadAll}
                      className="mt-2 flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider active:scale-95"
                      style={{ backgroundColor: c.accent, color: c.btnText }}
                    >
                      <Download size={12} />
                      {bulk ? `${bulk.done}/${bulk.total} · stop` : `Download all (${missingCount})`}
                    </button>
                  )}
                </div>
              </div>

              {isLoading && <div className="py-10 flex justify-center">{spinner()}</div>}
              {!isLoading && st.chapters?.length === 0 && (
                <div className="py-10 text-center text-sm font-literata opacity-70">
                  {st.external > 0 ? 'Licensed: chapters are only on official sites' : 'No Russian or English chapters'}
                </div>
              )}

              {st.chapters && st.chapters.length > 0 && (
                <ul className="divide-y border-t" style={{ borderColor: c.border }}>
                  {units.map(u => {
                    const book = unitBook(manga, u);
                    const isOpen = openVolumes.includes(u.key);
                    const groups = [...new Set(u.chapters.map(ch => ch.group).filter(Boolean))];
                    const langs = [...new Set(u.chapters.map(ch => ch.lang).filter(l => l !== 'ru'))];
                    const range = u.volume
                      ? (() => {
                          const nums = u.chapters.map(ch => ch.short.split(' · ')[0].replace('Ch. ', ''));
                          return nums.length > 1 ? `Ch. ${nums[0]}–${nums[nums.length - 1]}` : u.chapters[0].short.split(' · ')[0];
                        })()
                      : '';
                    return (
                      <li key={u.key} style={{ borderColor: c.border }}>
                        <div className="flex items-center">
                          {u.volume ? (
                            <button
                              onClick={() => setOpenVolumes(isOpen ? openVolumes.filter(k => k !== u.key) : [...openVolumes, u.key])}
                              className="shrink-0 w-6 -ml-1 py-2.5 text-xs active:opacity-60"
                              style={{ color: c.muted }}
                              aria-label="Chapters"
                            >
                              {isOpen ? '▾' : '▸'}
                            </button>
                          ) : (
                            <span className="shrink-0 w-6 -ml-1" />
                          )}
                          <button onClick={() => tapUnit(u)} className="flex-1 min-w-0 py-2.5 flex items-center gap-3 text-left active:opacity-70">
                            <div className="flex-1 min-w-0">
                              <div className={`font-literata text-sm truncate ${u.volume ? 'font-bold' : ''} ${book ? 'opacity-60' : ''}`}>{u.label}</div>
                              <div className="text-[11px] truncate" style={{ color: c.muted }}>
                                {[range, langs.join(', '), groups.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                            {status(u.key, !!book)}
                          </button>
                        </div>
                        {bar(u.key)}
                        {u.volume && isOpen && (
                          <ul className="pl-6 pb-1">
                            {u.chapters.map(ch => {
                              const chBook = chapterBook(manga, ch);
                              return (
                                <li key={ch.id}>
                                  <button onClick={() => tapChapter(ch)} className="w-full py-1.5 flex items-center gap-3 text-left active:opacity-70">
                                    <div className="flex-1 min-w-0">
                                      <div className={`font-literata text-xs truncate ${chBook ? 'opacity-60' : ''}`}>{ch.short}</div>
                                      <div className="text-[10px] truncate" style={{ color: c.muted }}>
                                        {[ch.lang !== 'ru' ? ch.lang : '', ch.group].filter(Boolean).join(' · ')}
                                      </div>
                                    </div>
                                    {status('c' + ch.id, !!chBook, 14)}
                                  </button>
                                  {bar('c' + ch.id)}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <>
              {isLoading && <div className="py-10 flex justify-center">{spinner()}</div>}
              {!isLoading && st.searched && st.results.length === 0 && !error && (
                <div className="py-10 text-center text-sm font-literata opacity-70">Nothing found</div>
              )}
              {st.searched && (
                <ul className="divide-y" style={{ borderColor: c.border }}>
                  {st.results.map(m => (
                    <li key={m.id} style={{ borderColor: c.border }}>
                      <button onClick={() => openManga(m)} className="w-full py-3 flex gap-3 text-left active:opacity-70">
                        {cover(m, 'w-16 h-24')}
                        <div className="flex-1 min-w-0">
                          <div className="font-literata font-bold text-sm leading-snug">{m.title}</div>
                          {m.authors.length > 0 && <div className="font-literata italic text-xs mt-0.5" style={{ color: c.muted }}>{m.authors.join(', ')}</div>}
                          {m.description && <div className="text-xs mt-1 leading-relaxed opacity-85 font-literata line-clamp-3">{m.description}</div>}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!isLoading && st.searched && st.results.length < st.total && (
                <div className="py-4 flex justify-center">
                  <button onClick={more} className="px-4 py-2 rounded-lg border text-sm font-literata active:scale-95" style={{ borderColor: c.border }}>
                    More
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
