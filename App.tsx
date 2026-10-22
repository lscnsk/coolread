import { useAppPersistence } from "./hooks/useAppPersistence";
import { useLibrary } from "./hooks/useLibrary";
import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { motion } from 'motion/react';
import LibrarySidebar from './components/LibrarySidebar';
import ChapterSidebar from './components/ChapterSidebar';
import PlayerControls from './components/PlayerControls';
import EBookReader from './components/EBookReader';
import EBookControls from './components/EBookControls';
import { Book, PersistedState, AppMode, Chapter } from './types';
import { calculateTotalProgress } from './utils/time';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { App as CapacitorApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { TextZoom } from '@capacitor/text-zoom';
// PDF and comic reader pulls in pdf.js (~470 KB); load it only when such a book is opened.
const PDFReader = lazy(() => import('./components/PDFReader'));
import { ImageLightbox } from './components/ImageLightbox';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { NowPlaying, accentOf, coverData, isNativePlayer } from './utils/nowPlaying';
import { X } from 'lucide-react';
import { AppStyles } from './components/AppStyles';
import { EmptyState } from './components/EmptyState';
import { AppHeader } from './components/AppHeader';
import { AudioBookDetailsModal } from './components/AudioBookDetailsModal';
import { useSettings } from './hooks/useSettings';
import { useBookHistory } from './hooks/useBookHistory';
import { CatalogView } from './components/CatalogView';
import { CatalogSidebar } from './components/CatalogSidebar';
import { OpdsView } from './components/OpdsView';
import { MangaDexView } from './components/MangaDexView';
import { openSite } from './utils/webBrowser';
import { OpdsSource, loadOpdsSources, saveOpdsSources } from './utils/opds';
import { listenForIncomingFiles } from './utils/incoming';
import { CatalogBook, CatalogSeries, CATALOG_SERIES, sortBooksChronologically } from './data/catalogData';
import { getStoredCatalogBooks, syncCatalogFromGitHub, downloadCatalogBookFile, buildCatalogSeriesFromBooks } from './utils/catalogSync';

import { parseM4AChapters } from './utils/mp4chapters';


function App() {
  // --- State ---
  const [mode, setMode] = useState<AppMode>(() => {
    try {
      if (typeof window !== 'undefined') {
        const historyStr = localStorage.getItem('cool_read_history');
        if (historyStr) {
          const parsed = JSON.parse(historyStr);
          let latest: any = null;
          Object.values(parsed).forEach((s: any) => {
            if (!latest || (s.lastUpdated && s.lastUpdated > latest.lastUpdated)) latest = s;
          });
          if (latest?.type) return latest.type;
        }
      }
    } catch (e) {}
    return 'ebook';
  });
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const currentBookRef = useRef(currentBook);
  useEffect(() => { currentBookRef.current = currentBook; }, [currentBook]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);

  const [books, setBooks] = useState<Book[]>([]);
  const [deletedBookIds, setDeletedBookIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [audioBookQueue, setAudioBookQueue] = useState<{ 
      folderName: string, 
      author?: string,
      series?: string,
      extractedCover?: string,
      coverFile?: File,
      generatedChapters?: Chapter[],
      files: File[], 
      allFiles: File[],
      bookObject?: Book,
      folderType?: 'audio' | 'comic_archives' | 'comic_images' | 'ebook'
  }[]>([]);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  
  // Catalog State
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  // OPDS libraries shown in the catalog; the open one replaces the catalog view
  const [opdsSources, setOpdsSources] = useState<OpdsSource[]>([]);
  const [activeOpds, setActiveOpds] = useState<OpdsSource | null>(null);
  const opdsBackRef = useRef<(() => void) | null>(null);
  useEffect(() => { loadOpdsSources().then(setOpdsSources); }, []);
  const catalogNames = ['lscnsk', ...opdsSources.map(s => s.title)].join(', ');
  const updateOpdsSources = (next: OpdsSource[]) => { setOpdsSources(next); saveOpdsSources(next); };
  const [isCatalogFilterOpen, setIsCatalogFilterOpen] = useState(false);
  const [catalogBooks, setCatalogBooks] = useState<CatalogBook[]>(() => getStoredCatalogBooks());
  const catalogSeries = React.useMemo(() => buildCatalogSeriesFromBooks(catalogBooks), [catalogBooks]);
  const [catalogFilter, setCatalogFilter] = useState<{
    type: 'all' | 'series' | 'author';
    value?: string;
    searchQuery?: string;
  }>({ type: 'all' });
  const [downloadingBookIds, setDownloadingBookIds] = useState<Set<string>>(new Set());
  const [isCatalogSyncing, setIsCatalogSyncing] = useState(false);
  
  // Custom Hook for Audio
  const { 
      audioRef, 
      isPlaying, 
      setIsPlaying, 
      togglePlay,
      currentTime, 
      setCurrentTime, 
      duration: measuredDuration, 
      durationKey,
      playbackRate, 
      setPlaybackRate, 
      isLoading: isAudioLoading,
      restoreState: restoreAudioState,
      seekTo: seekAudio
  } = useAudioPlayer(mode === 'audio' ? currentBook : null, currentChapterIndex);
  // Right after a chapter switch the measured duration still belongs to the
  // previous chapter; treat it as unknown until the new chapter reports its own.
  const duration = currentBook && durationKey === `${currentBook.id}:${currentChapterIndex}` ? measuredDuration : 0;
  
  // Reader State
  const { 
    fontSize, 
    setFontSize, 
    theme, 
    setTheme, 
    isStyledMode, 
    setIsStyledMode, 
    isBionic, 
    setIsBionic, 
    appStyle, 
    setAppStyle, 
    isSettingsLoadedRef, 
    isRsvpMode, 
    setIsRsvpMode, 
    rsvpWpm, 
    setRsvpWpm, 
    isPagedMode, 
    setIsPagedMode,
    readerFont,
    setReaderFont,
    customFonts,
    addCustomFont,
    deleteCustomFont
  } = useSettings();
  const [readerProgress, setReaderProgress] = useState(0); 
  const [highlightText, setHighlightText] = useState<string>("");
  const [highlightMatchIndex, setHighlightMatchIndex] = useState<number>(-1);

  // Animation triggers for emojis
  const [titleClickKey, setTitleClickKey] = useState(0);
  const [libraryClickKey, setLibraryClickKey] = useState(0);
  const [chaptersClickKey, setChaptersClickKey] = useState(0);

  // Modal States
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChapterListOpen, setIsChapterListOpen] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);

  
  // Persistence State
  const { bookProgressMap, setBookProgressMap, bookMetadataMap, setBookMetadataMap, saveMetadata, deleteBookHistory } = useBookHistory();
  
  const isNative = Capacitor.isNativePlatform();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRestoringRef = useRef<boolean>(false);
  const shouldRestoreAudioRef = useRef<boolean>(false);
  const pendingAudioRestoreRef = useRef<{ time: number, rate: number } | null>(null);
  
  
  const [navStack, setNavStack] = useState<{ chapterIndex: number, progress: number }[]>([]);
  
  const uiStateRef = useRef({ isSidebarOpen, isChapterListOpen, lightboxImage, hasCurrentBook: !!currentBook, isAudioModalOpen, navStack, isRsvpMode, isCatalogFilterOpen, isCatalogOpen });

  // Update ref when state changes
  useEffect(() => {
    uiStateRef.current = { isSidebarOpen, isChapterListOpen, lightboxImage, hasCurrentBook: !!currentBook, isAudioModalOpen, navStack, isRsvpMode, isCatalogFilterOpen, isCatalogOpen };
  }, [isSidebarOpen, isChapterListOpen, lightboxImage, !!currentBook, isAudioModalOpen, navStack, isRsvpMode, isCatalogFilterOpen, isCatalogOpen]);

  // Turn off RSVP mode when switching away from ebook mode or switching books
  useEffect(() => {
    if (mode !== 'ebook' && isRsvpMode) {
      setIsRsvpMode(false);
    }
  }, [mode, isRsvpMode, setIsRsvpMode]);

  useEffect(() => {
    if (isRsvpMode) {
      setIsRsvpMode(false);
    }
  }, [currentBook?.id]);

  const getBookIllustrations = useCallback(() => {
    if (!currentBook) return [];
    const urls: string[] = [];
    currentBook.chapters.forEach(ch => {
      if (!ch.content) return;
      const matches = ch.content.matchAll(/src="([^"]+)"/g);
      for (const m of matches) {
        if (m[1]) urls.push(m[1]);
      }
    });
    return urls;
  }, [currentBook]);

  const handleLightboxNavigate = useCallback((newSrc: string) => {
    if (!currentBook || !lightboxImage) return;
    setLightboxImage(newSrc);
    
    // Find chapter index matching this image url, and synchronize the active chapter index!
    const idx = currentBook.chapters.findIndex(ch => ch.content && ch.content.includes(newSrc));
    if (idx !== -1) {
      setCurrentChapterIndex(idx);
    }
  }, [currentBook, lightboxImage]);

  // --- Hardware Back Button ---
  const handleHardwareBack = useCallback(() => {
    const { isSidebarOpen, isChapterListOpen, lightboxImage, hasCurrentBook, isAudioModalOpen, navStack, isRsvpMode, isCatalogFilterOpen, isCatalogOpen } = uiStateRef.current;
    
    if (isAudioModalOpen) { setIsAudioModalOpen(false); return true; }
    if (lightboxImage) { setLightboxImage(null); return true; }
    if (isRsvpMode) { setIsRsvpMode(false); return true; }
    if (isCatalogFilterOpen) { setIsCatalogFilterOpen(false); return true; }
    if (isChapterListOpen) { setIsChapterListOpen(false); return true; }
    if (isSidebarOpen) { setIsSidebarOpen(false); return true; }
    if (isCatalogOpen && opdsBackRef.current) { opdsBackRef.current(); return true; }
    if (isCatalogOpen) { setIsCatalogOpen(false); return true; }
    
    if (navStack.length > 0) {
        const lastState = navStack[navStack.length - 1];
        setCurrentChapterIndex(lastState.chapterIndex);
        setReaderProgress(lastState.progress);
        setNavStack(prev => prev.slice(0, -1));
        return true;
    }
    
    if (hasCurrentBook) {
      // Go back to the library view
      setCurrentBook(null);
      setCurrentChapterIndex(0);
      setNavStack([]); // Clear stack when returning to library
      return true;
    }
    
    return false;
  }, []);

  useEffect(() => {
    // 1. Capacitor native hardware back button and text scaling settings
    let backListener: any = null;
    if (isNative) {
        backListener = CapacitorApp.addListener('backButton', () => {
          const handled = handleHardwareBack();
          if (!handled) CapacitorApp.exitApp();
        });
        
        // Prevent system/accessibility font scaling from affecting the app layout
        try {
            TextZoom.set({ value: 1.0 }).catch(e => console.error("TextZoom error:", e));
        } catch (e) {
            console.error("TextZoom execution error:", e);
        }
    }

    // 2. Web PWA hash/history based back button
    // We constantly push a state forward when a UI modal opens so there's always something to pop,
    // but the easiest robust way is just ensuring one state entry in history and intercepting:
    const onPopState = (e: PopStateEvent) => {
        const handled = handleHardwareBack();
        if (handled) {
            // Push it back so we maintain the trap
            window.history.pushState({ appTrap: true }, '');
        }
    };
    
    if (!isNative) {
        if (!window.history.state?.appTrap) {
            window.history.replaceState({ appTrap: true }, '');
            window.history.pushState({ appTrap: true }, '');
        }
        window.addEventListener('popstate', onPopState);
    }
    
    return () => { 
        if (backListener) backListener.then((l: any) => l.remove()); 
        if (!isNative) window.removeEventListener('popstate', onPopState);
    };
  }, [isNative, handleHardwareBack]);

  const toggleLibrary = () => {
    setIsSidebarOpen(prev => !prev);
    setIsChapterListOpen(false);
    setIsCatalogFilterOpen(false);
  };

  const toggleChapterList = () => {
    setIsChapterListOpen(prev => !prev);
    setIsSidebarOpen(false);
    setIsCatalogFilterOpen(false);
    if (!isChapterListOpen) {
        setHighlightText("");
        setHighlightMatchIndex(-1);
    }
  };
  
  const toggleSearch = () => {
      setIsChapterListOpen(true);
      setIsSidebarOpen(false);
      setIsCatalogFilterOpen(false);
  };

  const clearHighlight = () => {
      setHighlightText("");
      setHighlightMatchIndex(-1);
  };

  const closeAllSidebars = () => {
    setIsSidebarOpen(false);
    setIsChapterListOpen(false);
    setIsCatalogFilterOpen(false);
  };

  const handleAppStyleChange = (style: string) => {
    setAppStyle(style);
    setTitleClickKey(k => k + 1);
    if (style === 'Bimbo' || style === 'Surf' || style === 'Marcel') {
      setTheme('light');
    } else {
      setTheme('dark');
    }
  };


  const {
      saveState,
      handleSelectBook,
      isCurrentBookOriginallyPdf,
      handleTogglePdfFormat
  } = useAppPersistence({
      isNative,
      mode,
      setMode,
      currentBook,
      setCurrentBook,
      currentChapterIndex,
      setCurrentChapterIndex,
      currentTime,
      setCurrentTime,
      readerProgress,
      setReaderProgress,
      playbackRate,
      setPlaybackRate,
      fontSize,
      setFontSize,
      duration,
      isPlaying,
      setIsPlaying,
      setBooks,
      bookProgressMap,
      setBookProgressMap,
      restoreAudioState,
      saveMetadata,
      setIsLoading,
      setIsImmersive,
      closeAllSidebars,
      setDeletedBookIds
  });


  const {
      isLibraryReady,
      addComicDirect,
      switchMode,
      handleExternalFilePicked,
      handleExternalFolderPicked,
      handleAudioBookConfirm,
      handleDeleteBook
  } = useLibrary({
      isNative,
      mode,
      setMode,
      currentBook,
      setCurrentBook,
      setIsPlaying,
      bookProgressMap,
      setBookProgressMap,
      setBookMetadataMap,
      saveMetadata,
      deleteBookHistory,
      handleSelectBook,
      saveState,
      books,
      setBooks,
      deletedBookIds,
      setDeletedBookIds,
      isLoading,
      setIsLoading,
      audioBookQueue,
      setAudioBookQueue,
      isAudioModalOpen,
      setIsAudioModalOpen
  });

  // Catalog handlers
  const filteredCatalogBooks = React.useMemo(() => {
    let result = catalogBooks;
    if (catalogFilter.searchQuery) {
      const q = catalogFilter.searchQuery.toLowerCase().trim();
      result = result.filter(b => 
        (b.title || '').toLowerCase().includes(q) ||
        (b.author || '').toLowerCase().includes(q) ||
        (b.series || '').toLowerCase().includes(q) ||
        (b.description || '').toLowerCase().includes(q)
      );
    } else if (catalogFilter.type === 'series' && catalogFilter.value) {
      result = result.filter(b => b.series === catalogFilter.value);
    } else if (catalogFilter.type === 'author' && catalogFilter.value) {
      result = result.filter(b => b.author === catalogFilter.value);
    }
    return sortBooksChronologically(result);
  }, [catalogBooks, catalogFilter]);

  // Files opened with the app or shared to it: import once the library is loaded
  const handleExternalFilePickedRef = useRef(handleExternalFilePicked);
  handleExternalFilePickedRef.current = handleExternalFilePicked;
  useEffect(() => {
    if (!isLibraryReady) return;
    return listenForIncomingFiles(
      async (files) => {
        closeAllSidebars();
        setIsCatalogOpen(false);
        await handleExternalFilePickedRef.current(files);
      },
      () => setUnsupportedNotice(true)
    );
  }, [isLibraryReady]);
  const [unsupportedNotice, setUnsupportedNotice] = useState(false);
  useEffect(() => {
    if (!unsupportedNotice) return;
    const t = setTimeout(() => setUnsupportedNotice(false), 2500);
    return () => clearTimeout(t);
  }, [unsupportedNotice]);

  const handleDownloadCatalogBook = async (catalogBook: CatalogBook) => {
    setDownloadingBookIds(prev => new Set(prev).add(catalogBook.id));
    try {
      // Ensure catalog book is un-deleted in all caches
      setDeletedBookIds(prev => prev.filter(id => id !== catalogBook.id && id !== catalogBook.title));
      try {
        const delStr = localStorage.getItem('cool_read_deleted');
        if (delStr) {
          const clean = JSON.parse(delStr).filter((id: string) => id !== catalogBook.id && id !== catalogBook.title);
          localStorage.setItem('cool_read_deleted', JSON.stringify(clean));
          if (isNative) {
            Preferences.set({ key: 'cool_read_deleted', value: JSON.stringify(clean) });
          }
        }
      } catch (e) {}

      const file = await downloadCatalogBookFile(catalogBook);
      const namedFile = new File([file], `${catalogBook.title}.fb2`, {
        type: 'application/x-fictionbook+xml',
        lastModified: Date.now()
      });
      await handleExternalFilePicked([namedFile], {
        title: catalogBook.title,
        author: catalogBook.author,
        coverUrl: catalogBook.coverUrl,
        pageCount: catalogBook.pageCount
      });
    } catch (err: any) {
      console.error("Error downloading book:", err);
    } finally {
      setDownloadingBookIds(prev => {
        const next = new Set(prev);
        next.delete(catalogBook.id);
        return next;
      });
    }
  };

  const handleReadCatalogBook = (catalogBook: CatalogBook) => {
    const cleanCatTitle = (catalogBook.title || '').toLowerCase().trim();
    const matchingLibBook = books.find(libBook => {
      const cleanLibTitle = (libBook.title || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').trim();
      return cleanLibTitle === cleanCatTitle || cleanLibTitle.includes(cleanCatTitle) || cleanCatTitle.includes(cleanLibTitle);
    });

    if (matchingLibBook) {
      setMode('ebook');
      setIsCatalogOpen(false);
      handleSelectBook(matchingLibBook);
    }
  };

  const handleRefreshCatalog = async () => {
    setIsCatalogSyncing(true);
    try {
      const { books: updatedBooks } = await syncCatalogFromGitHub();
      setCatalogBooks(updatedBooks);
    } catch (e) {
      console.warn('Failed to sync catalog:', e);
    } finally {
      setIsCatalogSyncing(false);
    }
  };

  // No automatic catalog check on startup: the app goes online only when the
  // user refreshes the catalog or downloads a book from it.


  const lastBumpedTimeRef = useRef<number>(0);
  const lastAdvancedChapterRef = useRef<number | null>(null);
  const isAutoAdvancingRef = useRef<boolean>(false);

  // Synchronize detected audio duration into book chapters and ensure last chapter has duration
  useEffect(() => {
    if (mode === 'audio' && currentBook && duration > 0) {
      const activeCh = currentBook.chapters[currentChapterIndex];
      const isEmbedded = currentBook.chapters.some(c => c.startTime !== undefined && c.startTime > 0);
      
      let needsUpdate = false;
      const newChapters = [...currentBook.chapters];
      
      if (isEmbedded && audioRef.current && audioRef.current.duration > 0) {
        const fileDur = audioRef.current.duration;
        const lastIdx = newChapters.length - 1;
        if (newChapters[lastIdx] && (!newChapters[lastIdx].duration || !newChapters[lastIdx].endTime)) {
          const start = newChapters[lastIdx].startTime || 0;
          newChapters[lastIdx] = {
            ...newChapters[lastIdx],
            endTime: fileDur,
            duration: Math.max(0, fileDur - start)
          };
          needsUpdate = true;
        }
      }

      if (activeCh && (!activeCh.duration || Math.abs(activeCh.duration - duration) > 1)) {
        newChapters[currentChapterIndex] = {
          ...newChapters[currentChapterIndex],
          duration: duration,
          endTime: (newChapters[currentChapterIndex].startTime || 0) + duration
        };
        needsUpdate = true;
      }

      if (needsUpdate) {
        setCurrentBook(prev => prev ? { ...prev, chapters: newChapters } : prev);
        setBooks(prev => prev.map(b => b.id === currentBook.id ? { ...b, chapters: newChapters } : b));
      }
    }
  }, [duration, currentChapterIndex, currentBook?.id, mode]);

  // Measure the length of every chapter file of a multi-file audiobook in the
  // background, so the total and remaining time are exact from the start.
  useEffect(() => {
    if (mode !== 'audio' || !currentBook || currentBook.type !== 'audio') return;
    const bookId = currentBook.id;
    const missing = currentBook.chapters
      .map((ch, i) => ({ ch, i }))
      .filter(({ ch }) => !ch.duration && ch.startTime === undefined && ch.file instanceof Blob);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const found: Record<number, number> = {};
      for (const { ch, i } of missing) {
        if (cancelled) return;
        const d = await new Promise<number>(resolve => {
          const probe = new Audio();
          const url = URL.createObjectURL(ch.file as Blob);
          const done = (v: number) => { probe.removeAttribute('src'); probe.load(); URL.revokeObjectURL(url); resolve(v); };
          const timer = setTimeout(() => done(0), 15000);
          probe.preload = 'metadata';
          probe.onloadedmetadata = () => { clearTimeout(timer); done(isFinite(probe.duration) ? probe.duration : 0); };
          probe.onerror = () => { clearTimeout(timer); done(0); };
          probe.src = url;
        });
        if (d > 0) found[i] = d;
      }
      if (cancelled || Object.keys(found).length === 0) return;
      const apply = (b: Book) => b.id !== bookId ? b : { ...b, chapters: b.chapters.map((c, i) => found[i] && !c.duration ? { ...c, duration: found[i] } : c) };
      setCurrentBook(prev => prev ? apply(prev) : prev);
      setBooks(prev => prev.map(apply));
    })();
    return () => { cancelled = true; };
  }, [mode, currentBook?.id]);

  // Handle Track Auto-Next
  useEffect(() => {
    const audio = audioRef.current;
    
    // onEnded listener for independent audio files (when audio reaches physical EOF)
    const onEnded = () => {
         if (mode === 'audio' && currentBook && currentChapterIndex < currentBook.chapters.length - 1) {
            const now = Date.now();
            if (lastAdvancedChapterRef.current === currentChapterIndex || now - lastBumpedTimeRef.current < 1500 || isAutoAdvancingRef.current) {
               return;
            }
            lastAdvancedChapterRef.current = currentChapterIndex;
            lastBumpedTimeRef.current = now;
            isAutoAdvancingRef.current = true;

            const nextIndex = currentChapterIndex + 1;
            const nextCh = currentBook.chapters[nextIndex];
            setCurrentChapterIndex(nextIndex);
            setCurrentTime(0);
            if (audioRef.current && nextCh.startTime !== undefined) {
               audioRef.current.currentTime = nextCh.startTime;
            }
            setTimeout(() => {
               isAutoAdvancingRef.current = false;
            }, 1000);
        } else if (mode === 'audio' && currentBook && currentChapterIndex >= currentBook.chapters.length - 1) {
            setIsPlaying(false);
        }
    };
    
    // Virtual end listener strictly for embedded chapters sharing the same physical file
    const onTimeUpdate = () => {
       if (mode !== 'audio' || !currentBook || isAutoAdvancingRef.current) return;
       const isEmbedded = currentBook.chapters.some(c => c.startTime !== undefined && c.startTime > 0);
       if (!isEmbedded) return; // Multi-file books rely solely on native onEnded!

       const ch = currentBook.chapters[currentChapterIndex];
       if (!ch || ch.endTime === undefined) return;
       
       const chStart = ch.startTime || 0;
       // Only trigger when currentTime is genuinely within this chapter's bounds
       if (audio.currentTime < chStart || audio.currentTime > ch.endTime + 2.0) return;

       if (audio.currentTime >= ch.endTime - 0.25) {
           const now = Date.now();
           if (lastAdvancedChapterRef.current === currentChapterIndex || now - lastBumpedTimeRef.current < 1500) return;

           if (currentChapterIndex < currentBook.chapters.length - 1) {
              lastAdvancedChapterRef.current = currentChapterIndex;
              lastBumpedTimeRef.current = now;
              isAutoAdvancingRef.current = true;

              const nextIndex = currentChapterIndex + 1;
              const nextCh = currentBook.chapters[nextIndex];
              setCurrentChapterIndex(nextIndex);
              if (nextCh.startTime !== undefined) {
                  audio.currentTime = nextCh.startTime;
              }
              setCurrentTime(0);
              setTimeout(() => {
                  isAutoAdvancingRef.current = false;
              }, 1000);
           } else {
              // End of the book
              setIsPlaying(false);
              audio.pause();
           }
       }
    };

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => {
       audio.removeEventListener('ended', onEnded);
       audio.removeEventListener('timeupdate', onTimeUpdate);
    }
  }, [currentBook, currentChapterIndex, mode]);



  // --- Render ---
  const activeBooks = books.filter(b => !deletedBookIds.includes(b.id));

  // Seek within the chapter; a time before 0 or past its end goes on into the neighbouring chapters
  const seekInBook = (t: number) => {
    if (!currentBook) return;
    const chDur = duration;
    const chs = currentBook.chapters;

    if (t < -0.001 && currentChapterIndex > 0) { // Skip backwards across chapters
        let remainingBack = Math.abs(t);
        let idx = currentChapterIndex;
        while (idx > 0) {
            idx--;
            const prevDur = chs[idx].duration || 0;
            if (!prevDur || prevDur >= remainingBack || idx === 0) {
                seekAudio(Math.max(0, prevDur - remainingBack), idx);
                setCurrentChapterIndex(idx);
                return;
            }
            remainingBack -= prevDur;
        }
    } else if (t < 0) {
        seekAudio(0);
    } else if (chDur > 0 && t > chDur + 0.001 && currentChapterIndex < chs.length - 1) { // Skip forwards across chapters
        let remainingForward = t - chDur;
        let idx = currentChapterIndex;
        while (idx < chs.length - 1) {
            idx++;
            const nextDur = chs[idx].duration || 0;
            if (!nextDur || nextDur >= remainingForward || idx === chs.length - 1) {
                seekAudio(Math.min(remainingForward, nextDur || remainingForward), idx);
                setCurrentChapterIndex(idx);
                return;
            }
            remainingForward -= nextDur;
        }
    } else {
        seekAudio(chDur > 0 ? Math.min(t, chDur) : t);
    }
  };

  // Player notification for audiobooks (also on the lock screen and headphones)
  const audioActionsRef = useRef({ togglePlay, setIsPlaying, seekInBook, seekAudio, currentTime, isPlaying });
  audioActionsRef.current = { togglePlay, setIsPlaying, seekInBook, seekAudio, currentTime, isPlaying };
  const audioNotifiedRef = useRef(false);
  useEffect(() => {
    if (!isNativePlayer) return;
    const h = NowPlaying.addListener('action', e => {
      const a = audioActionsRef.current;
      if (e.action === 'play') a.setIsPlaying(true);
      else if (e.action === 'pause' || e.action === 'stop') a.setIsPlaying(false);
      else if (e.action === 'back') a.seekInBook(a.currentTime - 10);
      else if (e.action === 'forward') a.seekInBook(a.currentTime + 10);
      else if (e.action === 'seek') a.seekAudio(e.position);
    });
    return () => { h.then(x => x.remove()); };
  }, []);
  const positionBucket = Math.floor(currentTime / 5);
  useEffect(() => {
    if (!isNativePlayer) return;
    if (mode !== 'audio' || !currentBook) {
      if (audioNotifiedRef.current) NowPlaying.clear().catch(() => {});
      audioNotifiedRef.current = false;
      return;
    }
    // Shown once the book has been played, then kept up to date
    if (!isPlaying && !audioNotifiedRef.current) return;
    audioNotifiedRef.current = true;
    const book = currentBook;
    let cancelled = false;
    coverData(book.coverUrl).then(cover => {
      if (cancelled) return;
      NowPlaying.update({
        title: book.chapters[currentChapterIndex]?.name?.replace(/\.[^/.]+$/, '') || book.title,
        subtitle: book.title,
        cover,
        color: accentOf(appStyle),
        playing: isPlaying,
        loading: isPlaying && isAudioLoading,
        position: currentTime,
        duration,
        speed: playbackRate,
      }).catch(() => {});
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentBook?.id, currentChapterIndex, isPlaying, isAudioLoading, duration, playbackRate, appStyle, positionBucket]);

  const isBimbo = appStyle === 'Bimbo';
  const isSurf = appStyle === 'Surf';
  const isFF = appStyle === 'Final Fantasy' || appStyle === 'Final';
  const isDragon = appStyle === 'Dragon';
  const isMarcel = appStyle === 'Marcel';

  return (
    <div className={`flex fixed inset-0 w-full bg-[#23211f] text-[#fffff0] font-serif overflow-hidden ${isBimbo ? 'bimbo-mode' : ''} ${isSurf ? 'surf-mode' : ''} ${isFF ? 'ff-mode' : ''} ${isDragon ? 'dragon-mode' : ''} ${isMarcel ? 'marcel-mode' : ''}`}>
      <AppStyles appStyle={appStyle} theme={theme} />
      
      {/* Font Preloader - ensures theme fonts are loaded before settings menu opens */}
      <div className="fixed opacity-0 pointer-events-none -z-50 select-none overflow-hidden h-0 w-0" aria-hidden="true">
        <span className="font-bimbo">.</span>
        <span className="font-ff">.</span>
        <span className="font-dragon">.</span>
        <span className="font-surf">.</span>
        <span className="font-marcel">.</span>
        <span className="font-literata">.</span>
      </div>
      
      {(isSidebarOpen || isChapterListOpen || isCatalogFilterOpen) && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={closeAllSidebars} />
      )}

      {/* --- Lightbox Modal (Zoom, Drag & Side Navigation) --- */}
      {lightboxImage && (
          <ImageLightbox 
            src={lightboxImage}
            onClose={() => setLightboxImage(null)}
            illustrations={getBookIllustrations()}
            onNavigate={handleLightboxNavigate}
          />
      )}

      <LibrarySidebar 
        catalogNames={catalogNames}
        books={activeBooks}
        currentBookId={currentBook?.id || null}
        onSelectBook={(book, forceFormatAsFb2) => {
          setIsCatalogOpen(false);
          handleSelectBook(book, forceFormatAsFb2);
        }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        bookProgressMap={bookProgressMap}
        appStyle={appStyle}
        onAppStyleChange={handleAppStyleChange}
        currentBookFormat={currentBook?.format || null}
        // Close the library so the newly added book is visible once it opens
        onExternalFilePicked={(files) => { setIsSidebarOpen(false); setIsCatalogOpen(false); return handleExternalFilePicked(files); }}
        onExternalFolderPicked={(files) => { setIsSidebarOpen(false); setIsCatalogOpen(false); return handleExternalFolderPicked(files); }}
        onDeleteBook={handleDeleteBook}
        mode={mode}
        readerFont={readerFont}
        onReaderFontChange={setReaderFont}
        customFonts={customFonts}
        onAddCustomFont={addCustomFont}
        onDeleteCustomFont={deleteCustomFont}
        onOpenCatalog={() => {
          setIsCatalogOpen(true);
          setIsSidebarOpen(false);
        }}
      />

      <CatalogSidebar
        isOpen={isCatalogFilterOpen}
        onClose={() => setIsCatalogFilterOpen(false)}
        seriesList={catalogSeries}
        allBooks={catalogBooks}
        currentFilter={catalogFilter}
        onSelectFilter={(newFilter) => { setActiveOpds(null); setCatalogFilter(newFilter); }}
        appStyle={appStyle}
        opdsSources={opdsSources}
        activeOpdsId={activeOpds?.id || null}
        onOpenOpds={(src) => { setActiveOpds(src); setIsCatalogOpen(true); }}
        onAddOpds={(src) => {
          updateOpdsSources([...opdsSources, src]);
          if (src.kind === 'site') openSite(src.url, appStyle);
          else { setActiveOpds(src); setIsCatalogOpen(true); }
        }}
        onDeleteOpds={(id) => { updateOpdsSources(opdsSources.filter(s => s.id !== id)); if (activeOpds?.id === id) setActiveOpds(null); }}
      />

      {currentBook && (
        <ChapterSidebar 
            chapters={currentBook.chapters}
            currentChapterIndex={currentChapterIndex}
            bookTitle={currentBook.title}
            bookId={currentBook.id}
            appStyle={appStyle}
            isAudio={mode === 'audio'}
            onSelectChapter={(i) => { 
                setNavStack(prev => [...prev, { chapterIndex: currentChapterIndex, progress: readerProgress }]);
                if (mode === 'audio') {
                    setIsPlaying(false);
                    if (audioRef.current) {
                        audioRef.current.pause();
                    }
                    setCurrentTime(0);
                } else {
                    setReaderProgress(0); 
                    setIsImmersive(false);
                }
                setCurrentChapterIndex(i); 
            }}
            isOpen={isChapterListOpen}
            onClose={() => setIsChapterListOpen(false)}
            onSearchResultClick={(idx, text, matchIndex) => {
                setNavStack(prev => [...prev, { chapterIndex: currentChapterIndex, progress: readerProgress }]);
                if (mode === 'audio') {
                    setIsPlaying(false);
                    if (audioRef.current) {
                        audioRef.current.pause();
                    }
                    setCurrentTime(0);
                } else {
                    setReaderProgress(0); 
                }
                setCurrentChapterIndex(idx);
                setHighlightText(text);
                setHighlightMatchIndex(matchIndex);
                setIsChapterListOpen(false);
            }}
            onClearHighlight={clearHighlight}
            showSearch={mode === 'ebook'}
        />
      )}

      {/* Main Layout */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden transition-all duration-300 z-10">
        
        {/* Top Header */}
        <AppHeader
            isImmersive={isImmersive}
            mode={mode}
            appStyle={appStyle}
            libraryClickKey={libraryClickKey}
            titleClickKey={titleClickKey}
            chaptersClickKey={chaptersClickKey}
            currentBook={currentBook}
            isCatalogView={isCatalogOpen}
            onBackFromCatalog={() => {
                setLibraryClickKey(k => k + 1);
                setIsCatalogOpen(false);
            }}
            onToggleCatalogFilter={() => {
                setChaptersClickKey(k => k + 1);
                setIsCatalogFilterOpen(prev => !prev);
                setIsSidebarOpen(false);
            }}
            onToggleLibrary={() => {
                setLibraryClickKey(k => k + 1);
                toggleLibrary();
            }}
            onSwitchMode={() => {
                setTitleClickKey(k => k + 1);
                setIsCatalogOpen(false);
                switchMode();
            }}
            onToggleChapters={() => {
                setChaptersClickKey(k => k + 1);
                toggleChapterList();
            }}
        />

        {/* Content Area - No Margin Top, allowing full height */}
        <div className={`flex-1 overflow-hidden flex flex-col relative h-full w-full`} data-reader-container>
          
          {isCatalogOpen && activeOpds?.kind === 'mangadex' ? (
            <MangaDexView
              source={activeOpds}
              appStyle={appStyle}
              backRef={opdsBackRef}
              libraryBooks={activeBooks}
              onClose={() => setActiveOpds(null)}
              onAdd={async (file, meta, open) => {
                if (open) setIsCatalogOpen(false);
                return addComicDirect(file, meta, open);
              }}
              onOpenBook={(book) => {
                setIsCatalogOpen(false);
                setMode('ebook');
                handleSelectBook(book);
              }}
            />
          ) : isCatalogOpen && activeOpds ? (
            <OpdsView
              source={activeOpds}
              appStyle={appStyle}
              backRef={opdsBackRef}
              onClose={() => setActiveOpds(null)}
              onImport={async (file) => {
                setIsCatalogOpen(false);
                setActiveOpds(null);
                await handleExternalFilePicked([file]);
              }}
            />
          ) : isCatalogOpen ? (
            <CatalogView
              books={filteredCatalogBooks}
              libraryBooks={activeBooks}
              currentFilter={catalogFilter}
              onResetFilter={() => setCatalogFilter({ type: 'all' })}
              onDownloadBook={handleDownloadCatalogBook}
              onReadBook={handleReadCatalogBook}
              downloadingIds={downloadingBookIds}
              appStyle={appStyle}
              isLoading={isCatalogSyncing}
              onRefresh={handleRefreshCatalog}
              onOpenFilterSidebar={() => setIsCatalogFilterOpen(true)}
            />
          ) : !currentBook && isLoading ? (
             <div className="flex-1 flex items-center justify-center">
                <div className={`w-12 h-12 border-4 rounded-full animate-spin ${
                    isBimbo ? 'border-pink-200 border-t-pink-600' : 
                    isSurf ? 'border-sky-200 border-t-sky-600' : 
                    isMarcel ? 'border-[#C4B5E6] border-t-[#766594]' :
                    isFF ? 'border-[#e0d6c1] border-t-[#cca972]' :
                    'border-[#fffff0]/20 border-t-[#fffff0]'
                }`}></div>
             </div>
          ) : !currentBook ? (
             <EmptyState 
                catalogNames={catalogNames}
                isLoading={isLoading} 
                booksCount={activeBooks.length} 
                mode={mode} 
                isNative={isNative} 
                appStyle={appStyle} 
                onExternalFilePicked={handleExternalFilePicked}
                onExternalFolderPicked={handleExternalFolderPicked}
                currentBook={currentBook}
                onOpenCatalog={() => setIsCatalogOpen(true)}
             />
          ) : (
            mode === 'audio' ? (
                // Audio Player needs padding to not be hidden by header
                <div className="flex-1 flex flex-col items-center justify-center p-4 pt-20 pb-4 md:pb-8 w-full min-h-0 overflow-hidden">
                    <div className="w-full flex-1 flex flex-col items-center justify-center gap-4 md:gap-8 min-h-0">
                        <div className="relative w-full flex-1 flex items-center justify-center min-h-0 h-0 shrink overflow-hidden">
                            <div 
                                onClick={togglePlay} 
                                className={`h-full aspect-square max-w-full flex items-center justify-center relative overflow-hidden cursor-pointer active:scale-95 transition-transform rounded-2xl md:rounded-3xl shadow-xl ${
                                    currentBook.coverUrl ? 'bg-[#2c2a28]' : '' 
                                }`}
                            >
                                {currentBook.coverUrl ? (
                                    <img src={currentBook.coverUrl} className="w-full h-full object-cover" alt="Cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <span className="text-[5rem] md:text-[7rem] leading-none select-none opacity-80 emoji" style={{ fontSize: '5rem' }}>
                                            {isMarcel ? '☕' : isBimbo ? '💿' : isSurf ? '🏄' : '💽'}
                                        </span>
                                    </div>
                                )}

                                {isAudioLoading && (
                                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-20 transition-opacity">
                                        <div className={`w-12 h-12 border-4 rounded-full animate-spin ${
                                            isBimbo ? 'border-pink-200 border-t-pink-600' : 
                                            isSurf ? 'border-sky-200 border-t-sky-600' : 
                                            isMarcel ? 'border-[#C4B5E6] border-t-[#766594]' :
                                            'border-[#fffff0]/20 border-t-[#fffff0]'
                                        }`}></div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="space-y-1 w-full max-w-2xl text-center shrink-0 px-2">
                            <h2 className={`text-lg md:text-2xl font-bold font-literata leading-snug line-clamp-2 ${isMarcel ? 'text-[#2F2440]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0C4A6E]' : 'text-[#fffff0]'}`}>{currentBook.title}</h2>
                            {currentBook.author && <p className={`text-sm md:text-base italic ${isMarcel ? 'text-[#766594]' : isBimbo ? 'text-[#BE123C]/70' : isSurf ? 'text-[#0369A1]' : 'text-[#888]'}`}>{currentBook.author}</p>}
                            <p className={`text-xs line-clamp-1 mt-1 ${isMarcel ? 'text-[#9B8EAE]' : isBimbo ? 'text-[#BE123C]/50' : isSurf ? 'text-[#0EA5E9]' : 'text-[#666]'}`}>{currentBook.chapters[currentChapterIndex]?.name}</p>
                        </div>
                        <div className="w-full max-w-2xl shrink-0 pb-2 md:pb-6">
                            <PlayerControls 
                                isPlaying={isPlaying}
                                onTogglePlay={togglePlay}
                                onNext={() => { 
                                    if (currentBook && currentChapterIndex < currentBook.chapters.length - 1) { 
                                        setCurrentChapterIndex(p=>p+1); 
                                    } 
                                }}
                                onPrev={() => { 
                                    if (!currentBook) return;
                                    if (currentTime > 5) { 
                                        seekAudio(0);
                                    } else if (currentChapterIndex > 0) { 
                                        setCurrentChapterIndex(p=>p-1); 
                                    } 
                                }}
                                playbackRate={playbackRate}
                                onRateChange={setPlaybackRate}
                                currentTime={currentTime}
                                duration={duration}
                                onSeek={seekInBook}
                                totalProgress={calculateTotalProgress(
                                    currentChapterIndex,
                                    currentBook.chapters,
                                    currentTime,
                                    duration
                                )}
                                currentBook={currentBook}
                                currentChapterIndex={currentChapterIndex}
                                appStyle={appStyle}
                                globalCurrentTime={currentBook.chapters.some(ch => ch.startTime !== undefined && ch.startTime > 0) ? currentTime : ((currentBook.chapters[currentChapterIndex]?.startTime || 0) + currentTime)}
                                globalDuration={(() => {
                                    const isEmb = currentBook.chapters.some(ch => ch.startTime !== undefined && ch.startTime > 0);
                                    if (isEmb) {
                                        return audioRef.current?.duration || currentBook.chapters[currentBook.chapters.length - 1]?.endTime || duration;
                                    }
                                    return currentBook.chapters.reduce((acc, ch, idx) => {
                                        let d = ch.duration || 0;
                                        if (idx === currentChapterIndex && duration > 0) d = Math.max(d, duration);
                                        return acc + (d > 0 ? d : (duration > 0 ? duration : 1800));
                                    }, 0);
                                })()}
                                onGlobalSeek={(targetGlobalTime) => {
                                    const isEmbeddedCh = currentBook.chapters.some(ch => ch.startTime !== undefined);
                                    
                                    const matchedIndex = currentBook.chapters.findIndex(ch => {
                                        const start = ch.startTime || 0;
                                        const end = ch.endTime || (start + (ch.duration || 0));
                                        return targetGlobalTime >= start && targetGlobalTime <= end;
                                    });
                                    
                                    if (matchedIndex !== -1) {
                                        const matchedChapter = currentBook.chapters[matchedIndex];
                                        setCurrentChapterIndex(matchedIndex);
                                        
                                        if (isEmbeddedCh) {
                                            audioRef.current.currentTime = targetGlobalTime;
                                            setCurrentTime(targetGlobalTime);
                                        } else {
                                            const localSeek = targetGlobalTime - (matchedChapter.startTime || 0);
                                            setCurrentTime(localSeek);
                                            if (currentChapterIndex === matchedIndex) {
                                                audioRef.current.currentTime = localSeek;
                                            } else {
                                                const onMetadata = () => {
                                                    audioRef.current.currentTime = localSeek;
                                                    audioRef.current.removeEventListener('loadedmetadata', onMetadata);
                                                };
                                                audioRef.current.addEventListener('loadedmetadata', onMetadata);
                                            }
                                        }
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {currentBook.format === 'pdf' || currentBook.format === 'comic' ? (
                        <Suspense fallback={null}>
                        <PDFReader 
                            key={currentBook.id}
                            book={currentBook}
                            currentChapterIndex={currentChapterIndex}
                            initialProgressRatio={readerProgress}
                            theme={theme}
                            appStyle={appStyle}
                            uiVisible={!isImmersive}
                            onToggleUI={() => setIsImmersive(!isImmersive)}
                            onProgressUpdate={(ratio) => {
                                // Guard against updating progress for a book that is being swapped out
                                if (currentBookRef.current?.id === currentBook.id) {
                                    setReaderProgress(ratio);
                                }
                            }}
                            onChapterChange={(idx, align) => {
                                if (currentBookRef.current?.id === currentBook.id) {
                                    setCurrentChapterIndex(idx);
                                    setReaderProgress(align === 'end' ? 1 : 0);
                                }
                            }}
                        />
                        </Suspense>
                    ) : (
                        <EBookReader 
                            key={currentBook.id}
                            book={currentBook}
                            currentChapterIndex={currentChapterIndex}
                            initialProgressRatio={readerProgress}
                            fontSize={fontSize}
                            theme={theme}
                            uiVisible={!isImmersive}
                            onToggleUI={() => setIsImmersive(!isImmersive)}
                            onProgressUpdate={(ratio) => {
                                if (currentBookRef.current?.id === currentBook.id) {
                                    setReaderProgress(ratio);
                                }
                            }}
                            onChapterChange={(idx, align) => {
                                if (currentBookRef.current?.id === currentBook.id) {
                                    setCurrentChapterIndex(idx);
                                    setReaderProgress(align === 'end' ? 1 : 0);
                                }
                            }}
                            highlightText={highlightText}
                            highlightMatchIndex={highlightMatchIndex}
                            onHighlightClear={clearHighlight}
                            isStyledMode={isStyledMode}
                            isBionic={isBionic}
                            appStyle={appStyle}
                            isRsvpMode={isRsvpMode}
                            rsvpWpm={rsvpWpm}
                            onRsvpWpmChange={setRsvpWpm}
                            isPagedMode={isPagedMode}
                            onTogglePagedMode={() => setIsPagedMode(!isPagedMode)}
                            readerFont={readerFont}
                            onImageClick={(src) => setLightboxImage(src)}
                            onExternalLinkClick={(href) => {
                                if (href.startsWith('#') && href.length > 1) {
                                    const id = href.substring(1);
                                    const cleanId = id.replace(/^(ref-|note-)/, '').replace(/_back$/, '');
                                    
                                    const curChName = (currentBook.chapters[currentChapterIndex]?.name || '').toLowerCase();
                                    const isCurrentlyInNotes = curChName === 'сноски' || curChName === 'notes' || curChName === 'footnotes' || curChName === 'примечания';
                                    const isBackLink = id.startsWith('ref-') || id.includes('back') || href.includes('back') || isCurrentlyInNotes;

                                    let targetChapterIndex = -1;
                                    let matchedTargetId = id;
                                    let targetProgress: number | null = null;

                                    if (isBackLink) {
                                        // A. Return from Notes: Check navStack first to restore exact chapter and scroll position
                                        if (navStack.length > 0) {
                                            const lastNav = navStack[navStack.length - 1];
                                            setNavStack(prev => prev.slice(0, -1));
                                            targetChapterIndex = lastNav.chapterIndex;
                                            targetProgress = lastNav.progress;
                                            matchedTargetId = id.startsWith('ref-') ? id : `ref-${cleanId}`;
                                        }

                                        // B. If not in navStack, search other chapters for the anchor or link referring to this footnote
                                        if (targetChapterIndex === -1) {
                                            const foundIdx = currentBook.chapters.findIndex((ch: any, idx: number) => {
                                                if (idx === currentChapterIndex) return false;
                                                if (!ch.content) return false;
                                                return ch.content.includes(`id="${id}"`) ||
                                                       ch.content.includes(`id='${id}'`) ||
                                                       ch.content.includes(`id="ref-${cleanId}"`) ||
                                                       ch.content.includes(`id='ref-${cleanId}'`) ||
                                                       ch.content.includes(`name="ref-${cleanId}"`) ||
                                                       ch.content.includes(`name='ref-${cleanId}'`) ||
                                                       ch.content.includes(`href="#note-${cleanId}"`) ||
                                                       ch.content.includes(`href='#note-${cleanId}'`) ||
                                                       ch.content.includes(`href="#${cleanId}"`) ||
                                                       ch.content.includes(`href='#${cleanId}'`);
                                            });
                                            if (foundIdx !== -1) {
                                                targetChapterIndex = foundIdx;
                                                matchedTargetId = `ref-${cleanId}`;
                                            }
                                        }
                                    } else {
                                        // Forward Link (from chapter text to footnote in notes chapter or other chapter)
                                        const noteIdVariants = Array.from(new Set([
                                            id,
                                            `note-${cleanId}`,
                                            cleanId,
                                            id.startsWith('note-') ? id : `note-${id}`
                                        ])).filter(Boolean);

                                        // 1. Search in OTHER chapters (so we don't accidentally match the originating link)
                                        for (const variant of noteIdVariants) {
                                            const foundIdx = currentBook.chapters.findIndex((ch: any, idx: number) => 
                                                idx !== currentChapterIndex && ch.content && (
                                                    ch.content.includes(`id="${variant}"`) || 
                                                    ch.content.includes(`id='${variant}'`) ||
                                                    ch.content.includes(`name="${variant}"`) ||
                                                    ch.content.includes(`name='${variant}'`)
                                                )
                                            );
                                            if (foundIdx !== -1) {
                                                targetChapterIndex = foundIdx;
                                                matchedTargetId = variant;
                                                break;
                                            }
                                        }

                                        // 2. Fallback: check explicitly named Notes chapter
                                        if (targetChapterIndex === -1) {
                                            const notesChapterIdx = currentBook.chapters.findIndex((ch: any) => {
                                                const name = (ch.name || '').toLowerCase();
                                                return name === 'сноски' || name === 'notes' || name === 'footnotes' || name === 'примечания';
                                            });
                                            if (notesChapterIdx !== -1 && notesChapterIdx !== currentChapterIndex) {
                                                targetChapterIndex = notesChapterIdx;
                                                matchedTargetId = `note-${cleanId}`;
                                            } else if (id.includes('note') || id.includes('cite') || id.includes('fn')) {
                                                targetChapterIndex = currentBook.chapters.length - 1;
                                            }
                                        }
                                    }

                                    (window as any).__pendingScrollTarget = matchedTargetId;

                                    if (targetChapterIndex !== -1 && targetChapterIndex !== currentChapterIndex) {
                                        if (!isBackLink) {
                                            setNavStack(prev => [...prev, { chapterIndex: currentChapterIndex, progress: readerProgress }]);
                                        }
                                        setCurrentChapterIndex(targetChapterIndex);
                                        if (targetProgress !== null) {
                                            setReaderProgress(targetProgress);
                                        }
                                        
                                        let attempts = 0;
                                        const scrollIter = () => {
                                            const cleanIdStr = matchedTargetId.replace(/^(ref-|note-)/, '');
                                            const el = document.getElementById(matchedTargetId) ||
                                                       document.getElementsByName(matchedTargetId)[0] ||
                                                       document.querySelector(`[id="${matchedTargetId}"]`) ||
                                                       document.querySelector(`[name="${matchedTargetId}"]`) ||
                                                       document.querySelector(`[id="ref-${cleanIdStr}"]`) ||
                                                       document.querySelector(`[name="ref-${cleanIdStr}"]`) ||
                                                       document.querySelector(`a[href="#note-${cleanIdStr}"]`) ||
                                                       document.querySelector(`a[href="#${cleanIdStr}"]`);
                                            if (el) {
                                                el.scrollIntoView({behavior: 'smooth', block: 'center'});
                                            } else if (attempts < 20) {
                                                attempts++;
                                                setTimeout(scrollIter, 30);
                                            }
                                        };
                                        setTimeout(scrollIter, 30);
                                    }
                                }
                            }}
                        />
                    )}
                    {(() => {
                        const headerPages = currentBook.chapters
                            .map((ch, idx) => ({ idx, isHeader: ch.isHeader }))
                            .filter(item => item.isHeader)
                            .map(item => item.idx);
                        
                        let currentHeaderIdx = -1;
                        if (headerPages.length > 0) {
                            for (let i = 0; i < headerPages.length; i++) {
                                if (headerPages[i] <= currentChapterIndex) {
                                    currentHeaderIdx = i;
                                } else {
                                    break;
                                }
                            }
                        }

                        let computedProgress = readerProgress * 100;
                        if (currentBook.format === 'pdf' && headerPages.length > 0 && currentHeaderIdx !== -1) {
                            const A = headerPages[currentHeaderIdx];
                            const B = currentHeaderIdx + 1 < headerPages.length ? headerPages[currentHeaderIdx + 1] : currentBook.chapters.length;
                            const diff = B - A;
                            if (diff > 0) {
                                computedProgress = ((currentChapterIndex - A) / diff) * 100;
                            } else {
                                computedProgress = 100;
                            }
                        }

                        const computedChapterTitle = (currentBook.format === 'pdf' && headerPages.length > 0 && currentHeaderIdx !== -1)
                            ? currentBook.chapters[headerPages[currentHeaderIdx]]?.name
                            : currentBook.chapters[currentChapterIndex]?.name;

                        return (
                            <EBookControls 
                                fontSize={fontSize}
                                setFontSize={setFontSize}
                                chapterProgress={computedProgress}
                                bookProgress={calculateTotalProgress(currentChapterIndex, currentBook.chapters, readerProgress, 1)} 
                                chapterTitle={computedChapterTitle}
                                onOpenSearch={toggleSearch}
                                chapters={currentBook.chapters}
                                theme={theme}
                                onToggleTheme={() => setTheme(p => p === 'dark' ? 'light' : 'dark')}
                                show={!isImmersive}
                                isStyledMode={isStyledMode}
                                onToggleStyledMode={() => setIsStyledMode(!isStyledMode)}
                                isPdfSource={isCurrentBookOriginallyPdf}
                                currentBookFormat={currentBook?.format || null}
                                onTogglePdfFormat={handleTogglePdfFormat}
                                appStyle={appStyle}
                                isBionic={isBionic}
                                onToggleBionic={() => setIsBionic(!isBionic)}
                                isRsvpMode={isRsvpMode}
                                onToggleRsvpMode={() => setIsRsvpMode(!isRsvpMode)}
                                isPagedMode={isPagedMode}
                                onTogglePagedMode={() => setIsPagedMode(!isPagedMode)}
                            />
                        );
                    })()}
                </>
            )
          )}
        </div>
      </div>
        {/* Permission Overlay */}
        
        {/* Global Loading Overlay */}
        {isLoading && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-300">
                <div className={`w-16 h-16 border-4 rounded-full animate-spin ${
                    isBimbo ? 'border-pink-200 border-t-pink-600' : 
                    isSurf ? 'border-sky-200 border-t-sky-600' : 
                    isDragon ? 'border-orange-200 border-t-orange-600' :
                    isMarcel ? 'border-[#C4B5E6] border-t-[#766594]' :
                    'border-[#fffff0]/20 border-t-[#fffff0]'
                }`}></div>
            </div>
        )}
        
        {unsupportedNotice && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[110] px-4 py-2 rounded-full bg-black/80 text-white text-sm pointer-events-none">
                Unsupported file
            </div>
        )}

        <AudioBookDetailsModal 
          isOpen={isAudioModalOpen}
          suggestedTitle={audioBookQueue[0]?.folderName || ''}
          suggestedAuthor={audioBookQueue[0]?.author || ''}
          suggestedSeries={audioBookQueue[0]?.series || audioBookQueue[0]?.bookObject?.series || ''}
          appStyle={appStyle}
          onConfirm={handleAudioBookConfirm}
          onCancel={() => {
            setIsAudioModalOpen(false);
            setAudioBookQueue([]);
          }}
        />
    </div>
  );
}

export default App;