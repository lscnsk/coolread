import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Check } from 'lucide-react';
import {
  OpdsEntry,
  OpdsFeed,
  OpdsSource,
  buildSearchUrl,
  downloadOpdsBook,
  fetchOpdsFeed,
  opdsErrorText,
  readableFormats,
  resolveSearchTemplate,
} from '../utils/opds';

interface OpdsViewProps {
  source: OpdsSource;
  appStyle?: string;
  onClose: () => void;
  onImport: (file: File) => Promise<void>;
  // Lets the Android back button step back inside the catalog
  backRef?: React.MutableRefObject<(() => void) | null>;
}

interface StackItem {
  feed: OpdsFeed;
  scrollTop: number;
}

type DownloadState = 'loading' | 'done' | { error: string };

export const opdsPalette = (appStyle: string) => {
  switch (appStyle) {
    case 'Bimbo':
      return { text: '#881337', muted: '#BE123C', border: '#FBCFE8', card: '#FFFFFF', accent: '#BE123C', input: '#FFFFFF', btnText: '#FFFFFF' };
    case 'Surf':
      return { text: '#0C4A6E', muted: '#0369A1', border: '#BAE6FD', card: '#FFFFFF', accent: '#0284C7', input: '#FFFFFF', btnText: '#FFFFFF' };
    case 'Cozy':
      return { text: '#3B2A1E', muted: '#8A6E55', border: '#D9C3A5', card: '#F7EFE3', accent: '#9A5B22', input: '#FFFFFF', btnText: '#FFFFFF' };
    case 'Spooky':
      return { text: '#FDBA74', muted: '#9F8FBF', border: '#4C2A7A', card: '#1E1530', accent: '#F97316', input: '#120D1C', btnText: '#1E1530' };
    case 'Marcel':
      return { text: '#2F2440', muted: '#766594', border: '#C4B5E6', card: '#F3EFFB', accent: '#544372', input: '#FFFFFF', btnText: '#FFFFFF' };
    case 'Dragon':
      return { text: '#fcd34d', muted: '#b45309', border: '#7f1d1d', card: '#2a1508', accent: '#fcd34d', input: '#1f0f05', btnText: '#2a1508' };
    case 'Final':
    case 'Final Fantasy':
      return { text: '#f0deba', muted: '#8faada', border: '#406da3', card: '#0f2547', accent: '#dfc894', input: '#0b1c38', btnText: '#0f2547' };
    default:
      return { text: '#fffff0', muted: '#a8a29e', border: '#45413e', card: '#2c2a28', accent: '#fffff0', input: '#2c2a28', btnText: '#23211f' };
  }
};

export const OpdsView: React.FC<OpdsViewProps> = ({ source, appStyle = 'Cool', onClose, onImport, backRef }) => {
  const c = opdsPalette(appStyle);
  const [stack, setStack] = useState<StackItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchTemplate, setSearchTemplate] = useState<string | undefined>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const listRef = useRef<HTMLDivElement>(null);

  const current = stack[stack.length - 1]?.feed;

  const openUrl = useCallback(async (url: string, replace = false) => {
    setIsLoading(true);
    setError(null);
    try {
      let feed = await fetchOpdsFeed(url, source);
      // Flibusta-style search first asks "books or authors": go straight to books.
      const onlyNav = feed.entries.length > 0 && feed.entries.length <= 3 && feed.entries.every(e => e.navUrl && e.acquisitions.length === 0);
      const booksEntry = onlyNav ? feed.entries.find(e => /searchType=books|книг/i.test((e.navUrl || '') + ' ' + e.title)) : undefined;
      if (booksEntry?.navUrl && /search/i.test(url)) {
        feed = await fetchOpdsFeed(booksEntry.navUrl, source);
      }
      setStack(prev => {
        const saved = prev.map((s, i) => (i === prev.length - 1 ? { ...s, scrollTop: listRef.current?.scrollTop || 0 } : s));
        return replace ? [...saved.slice(0, -1), { feed, scrollTop: 0 }] : [...saved, { feed, scrollTop: 0 }];
      });
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: 0 }));
      return feed;
    } catch (e) {
      setError(opdsErrorText(e));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [source]);

  // Open the catalog root and find its search
  useEffect(() => {
    setStack([]);
    setSearchTemplate(undefined);
    setQuery('');
    (async () => {
      const root = await openUrl(source.url);
      if (root) setSearchTemplate(await resolveSearchTemplate(root, source));
    })();
  }, [source.id]);

  const goBack = () => {
    if (stack.length <= 1) {
      onClose();
      return;
    }
    const prev = stack[stack.length - 2];
    setStack(s => s.slice(0, -1));
    setError(null);
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: prev.scrollTop }));
  };

  useEffect(() => {
    if (!backRef) return;
    backRef.current = goBack;
    return () => { backRef.current = null; };
  });

  const runSearch = () => {
    const q = query.trim();
    if (!q || !searchTemplate) return;
    (document.activeElement as HTMLElement)?.blur();
    openUrl(buildSearchUrl(searchTemplate, q), stack.length > 1);
  };

  const loadMore = async () => {
    if (!current?.nextUrl || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const next = await fetchOpdsFeed(current.nextUrl, source);
      setStack(prev => {
        const top = prev[prev.length - 1];
        const merged: OpdsFeed = { ...top.feed, entries: [...top.feed.entries, ...next.entries], nextUrl: next.nextUrl };
        return [...prev.slice(0, -1), { ...top, feed: merged }];
      });
    } catch (e) {
      setError(opdsErrorText(e));
    } finally {
      setIsLoadingMore(false);
    }
  };

  const download = async (entry: OpdsEntry, format: string) => {
    const choice = readableFormats(entry).find(f => f.format === format);
    if (!choice) return;
    const key = entry.id + format;
    setDownloads(d => ({ ...d, [key]: 'loading' }));
    try {
      const file = await downloadOpdsBook(entry, format, choice.link, source);
      setDownloads(d => ({ ...d, [key]: 'done' }));
      await onImport(file);
    } catch (e) {
      setDownloads(d => ({ ...d, [key]: { error: opdsErrorText(e) } }));
    }
  };

  const toggleExpanded = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const isBimbo = appStyle === 'Bimbo', isSurf = appStyle === 'Surf', isMarcel = (appStyle === 'Marcel' || appStyle === 'Cozy');
  const isDragon = (appStyle === 'Dragon' || appStyle === 'Spooky'), isFF = appStyle === 'Final' || appStyle === 'Final Fantasy';
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

  // Only books are shown: catalog sections and author lists are left out
  const books = current ? current.entries.filter(e => e.acquisitions.length > 0) : [];
  const hasSearched = stack.length > 1;

  return (
    <div className="flex-1 w-full h-full flex flex-col pt-24" style={{ color: c.text }}>
      <div className="max-w-4xl w-full mx-auto px-4 md:px-8">
        {/* Header in the same style as the lscnsk catalog */}
        <div className={`mb-4 pb-2 border-b relative flex items-center justify-center min-h-[38px] ${headerBorder}`}>
          <span className={`lowercase select-none text-center font-literata font-bold text-sm md:text-base tracking-widest ${brandClass}`}>
            {source.title}
          </span>
        </div>
        <form
          className="flex items-center mb-2"
          onSubmit={e => {
            e.preventDefault();
            runSearch();
          }}
        >
          <span className="text-2xl cursor-default select-none mr-2">🔍</span>
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="search for a book"
            className={`flex-1 min-w-0 border rounded px-3 py-2 text-sm focus:outline-none ${inputClass}`}
          />
        </form>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
        <div className="max-w-4xl mx-auto px-4 md:px-8 pb-24">
          {error && (
            <div className="my-4 text-sm rounded-lg border px-3 py-2 font-literata whitespace-pre-line break-words select-text" style={{ borderColor: c.border }}>
              {error}
              {stack.length === 0 && (
                <button className="ml-2 underline" onClick={() => openUrl(source.url)}>Retry</button>
              )}
            </div>
          )}

          {isLoading && (
            <div className="py-10 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: c.border, borderTopColor: c.accent }} />
            </div>
          )}

          {!isLoading && hasSearched && books.length === 0 && (
            <div className="py-10 text-center text-sm font-literata opacity-70">Nothing found</div>
          )}

          {!isLoading && hasSearched && (
            <ul className="divide-y" style={{ borderColor: c.border }}>
              {books.map(entry => {
                const formats = readableFormats(entry);
                const isOpen = expanded.has(entry.id);
                return (
                  <li key={entry.id} className="py-3 flex gap-3" style={{ borderColor: c.border }}>
                    <div className="w-16 h-24 shrink-0 rounded overflow-hidden border flex items-center justify-center" style={{ borderColor: c.border, backgroundColor: c.card }}>
                      {entry.coverUrl ? (
                        <img
                          src={entry.coverUrl}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={e => ((e.target as HTMLImageElement).style.display = 'none')}
                        />
                      ) : (
                        <span className="text-2xl opacity-50">📖</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-literata font-bold text-sm leading-snug">{entry.title}</div>
                      {entry.authors.length > 0 && (
                        <div className="font-literata italic text-xs mt-0.5" style={{ color: c.muted }}>{entry.authors.join(', ')}</div>
                      )}
                      {entry.summary && (
                        <button
                          onClick={() => toggleExpanded(entry.id)}
                          className={`text-left text-xs mt-1 leading-relaxed whitespace-pre-line opacity-85 font-literata ${isOpen ? '' : 'line-clamp-3'}`}
                        >
                          {entry.summary}
                        </button>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {formats.map(({ format }) => {
                          const st = downloads[entry.id + format];
                          const busy = st === 'loading';
                          const done = st === 'done';
                          return (
                            <button
                              key={format}
                              disabled={busy}
                              onClick={() => download(entry, format)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider active:scale-95 disabled:opacity-60"
                              style={{ backgroundColor: c.accent, color: c.btnText }}
                            >
                              {busy ? (
                                <span className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: c.btnText, borderTopColor: 'transparent' }} />
                              ) : done ? (
                                <Check size={12} />
                              ) : (
                                <Download size={12} />
                              )}
                              {format}
                            </button>
                          );
                        })}
                      </div>
                      {formats.map(({ format }) => {
                        const st = downloads[entry.id + format];
                        return st && typeof st === 'object' ? (
                          <div key={format} className="text-[11px] mt-1" style={{ color: c.muted }}>{st.error}</div>
                        ) : null;
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!isLoading && hasSearched && current?.nextUrl && books.length > 0 && (
            <div className="py-4 flex justify-center">
              <button
                onClick={loadMore}
                disabled={isLoadingMore}
                className="px-4 py-2 rounded-lg border text-sm font-literata active:scale-95 disabled:opacity-60"
                style={{ borderColor: c.border }}
              >
                {isLoadingMore ? '…' : 'More'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
