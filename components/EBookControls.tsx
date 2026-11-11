import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Type, Sun, Moon, Pilcrow, Zap, BookOpen, Scroll, Headphones } from 'lucide-react';
import { ReadAloudSpeed, ReadAloudTransport } from './ReadAloudPanel';
import { setOpen as setReadAloudOpen, useReadAloud } from '../utils/readAloud';
import { Chapter } from '../types';
import { activeVariantFor } from '../utils/styleVariants';

interface EBookControlsProps {
  fontSize: number;
  setFontSize: (size: number) => void;
  chapterProgress: number; // 0-100
  bookProgress: number; // 0-100
  onOpenSearch?: () => void;
  chapterTitle?: string;
  chapters?: Chapter[];
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  show: boolean; // Controls visibility transition
  isStyledMode: boolean;
  onToggleStyledMode: () => void;
  isPdfSource?: boolean;
  currentBookFormat?: string | null;
  onTogglePdfFormat?: () => void;
  appStyle?: string;
  isBionic?: boolean;
  onToggleBionic?: () => void;
  isRsvpMode?: boolean;
  onToggleRsvpMode?: () => void;
  isPagedMode?: boolean;
  onTogglePagedMode?: () => void;
}

const EBookControls: React.FC<EBookControlsProps> = ({
  fontSize,
  setFontSize,
  chapterProgress,
  bookProgress,
  onOpenSearch, 
  chapterTitle,
  chapters,
  theme,
  onToggleTheme,
  show,
  isStyledMode,
  onToggleStyledMode,
  isPdfSource = false,
  currentBookFormat = null,
  onTogglePdfFormat,
  appStyle,
  isBionic = false,
  onToggleBionic,
  isRsvpMode = false,
  onToggleRsvpMode,
  isPagedMode = false,
  onTogglePagedMode
}) => {
  const isBimbo = appStyle === 'Bimbo';
  const isSurf = appStyle === 'Surf';
  // New styles colour the bionic button like their bold text
  const bionicInk = activeVariantFor(appStyle)?.reader[theme === 'light' ? 'light' : 'dark'].bold;
  const isMarcel = appStyle === 'Marcel';
  const isDragon = appStyle === 'Dragon';
  const isFF = appStyle === 'Final' || appStyle === 'Final Fantasy';
  const readAloud = useReadAloud();
  const canReadAloud = currentBookFormat !== 'pdf' && currentBookFormat !== 'comic' && !isRsvpMode;
  // While reading aloud, its controls take the place of the buttons left of the headphones
  const voiceMode = canReadAloud && readAloud.open;
  const accentColor = isMarcel ? '#544372' : isBimbo ? '#BE123C' : isSurf ? '#0ea5e9' : isDragon ? '#ea580c' : isFF ? '#cca972' : '#fffff0';

  const adjustFont = (delta: number) => {
      setFontSize(Math.max(0.5, Math.min(3.0, fontSize + delta)));
  };

  // Calculate ticks for chapter boundaries (ignoring notes/footnotes)
  const ticks = useMemo(() => {
    if (!chapters || chapters.length === 0) return [];
    
    const isNotesChapter = (name: string) => {
        const lower = (name || '').toLowerCase();
        return lower === 'сноски' || lower === 'notes' || lower === 'footnotes' || lower === 'примечания';
    };

    // Calculate total length of main chapters only (to match progress bar percentage logic)
    const totalLength = chapters.reduce((sum, ch) => {
        if (isNotesChapter(ch.name || '')) return sum;
        return sum + (ch.length || 0);
    }, 0);
    
    if (totalLength === 0) return [];

    let accumulated = 0;
    const t: number[] = [];
    
    // We want ticks at the start of each chapter (except the first one which is 0%)
    chapters.forEach((ch, idx) => {
        const isNotes = isNotesChapter(ch.name || '');
        if (idx > 0 && !isNotes) {
            t.push((accumulated / totalLength) * 100);
        }
        if (!isNotes) {
            accumulated += (ch.length || 0);
        }
    });
    
    return t;
  }, [chapters]);

  return (
    <>
    <div 
        className={`fixed bottom-0 left-0 right-0 w-full h-28 border-t pb-safe pt-3 px-4 z-30 shadow-[0_-5px_15px_rgba(0,0,0,0.15)] transition-transform duration-300 ease-in-out ${
            show ? 'translate-y-0' : 'translate-y-full'
        } ${isMarcel ? 'bg-[#F3EFFB] border-[#C4B5E6]' : isBimbo ? 'bg-[#FFF0F5] border-[#FBCFE8]' : isSurf ? 'bg-white border-[#bae6fd]' : 'bg-[#23211f] border-[#45413e]'}`}
    >
       
       <div className="max-w-4xl mx-auto w-full flex flex-col gap-3">
           
           {/* Top Row: Controls */}
           {/* While reading aloud the buttons left of the headphones step aside (keeping their room),
               so the headphones stay where they were and play sits in the middle of the row.
               The two sets of buttons cross-fade: the reading ones shrink away while the
               voice ones grow in, and back. */}
           <div className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center w-full gap-1 sm:gap-2">
               <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 z-10 flex items-center">
                 <AnimatePresence initial={false}>
                   {voiceMode && (
                     <motion.div
                       key="transport"
                       initial={{ opacity: 0, scale: 0.6 }}
                       animate={{ opacity: 1, scale: 1 }}
                       exit={{ opacity: 0, scale: 0.6 }}
                       transition={{ duration: 0.22, ease: 'easeOut' }}
                     >
                       <ReadAloudTransport appStyle={appStyle} />
                     </motion.div>
                   )}
                 </AnimatePresence>
               </div>
               
               {/* Left Group: Font Controls */}
               {/* Above the middle group: what is shown here may be wider than this column */}
               <div className="relative z-20 flex justify-start min-w-0">
                 <AnimatePresence initial={false} mode="wait">
                   {voiceMode && (
                     <motion.div
                       key="voice"
                       initial={{ opacity: 0, x: -10 }}
                       animate={{ opacity: 1, x: 0 }}
                       exit={{ opacity: 0, x: -10 }}
                       transition={{ duration: 0.12, ease: 'easeOut' }}
                     >
                       <ReadAloudSpeed appStyle={appStyle} />
                     </motion.div>
                   )}
                   {!voiceMode && currentBookFormat !== 'pdf' && currentBookFormat !== 'comic' && (
                       <motion.div
                         key="font"
                         initial={{ opacity: 0, x: -10 }}
                         animate={{ opacity: 1, x: 0 }}
                         exit={{ opacity: 0, x: -10 }}
                         transition={{ duration: 0.12, ease: 'easeOut' }}
                         className={`flex items-center gap-[1px] px-0.5 h-8 rounded-lg border flex-shrink-0 ${isMarcel ? 'bg-[#E8E0F5] border-[#C4B5E6]' : isBimbo ? 'bg-white border-[#FBCFE8]' : isSurf ? 'bg-sky-50 border-[#bae6fd]' : 'bg-[#2c2a28] border-[#45413e]'}`}>
                           <button 
                               onClick={() => adjustFont(-0.1)} 
                               className={`active:scale-90 transition-transform p-0.5 h-6 w-5 flex items-center justify-center rounded ${isMarcel ? 'text-[#2F2440]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0ea5e9]' : 'text-[#888] hover:text-white'}`}
                               
                           >
                               <Type size={10} />
                           </button>
                           
                           <span className={`text-[11px] font-mono font-bold w-[19px] inline-block text-center tabular-nums ${isMarcel ? 'text-[#2F2440]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0ea5e9]' : 'text-[#ddd]'}`}>{fontSize.toFixed(1)}</span>

                           <button 
                               onClick={() => adjustFont(0.1)} 
                               className={`active:scale-90 transition-transform p-0.5 h-6 w-5 flex items-center justify-center rounded ${isMarcel ? 'text-[#2F2440]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0ea5e9]' : 'text-[#888] hover:text-white'}`}
                               
                           >
                               <Type size={13} />
                           </button>
                       </motion.div>
                   )}
                 </AnimatePresence>
               </div>

               {/* Center: Style Toggles (Clean Group). While reading aloud its faded buttons
                   take no taps (only the headphones do), or they would steal them from the
                   voice controls drawn over them. */}
               <div className={`flex justify-center items-center gap-0 sm:gap-1 ${voiceMode ? 'pointer-events-none' : ''}`}>
                  {currentBookFormat !== 'pdf' && currentBookFormat !== 'comic' && (
                    <button 
                      onClick={onToggleStyledMode}
                      className={`${voiceMode ? 'opacity-0 scale-50' : ''} w-[30px] sm:w-8 h-8 flex items-center justify-center rounded-lg active:scale-90 transition-all duration-200 ${
                        isStyledMode 
                          ? (isMarcel ? 'text-red-700' : isBimbo ? 'text-red-600' : isSurf ? 'text-red-600' : 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]') 
                          : (isMarcel ? 'text-[#2F2440]/40 hover:text-[#2F2440]/70' : isBimbo ? 'text-[#BE123C]/40 hover:text-[#BE123C]/70' : isSurf ? 'text-[#7dd3fc] hover:text-[#0ea5e9]' : 'text-[#888] hover:text-[#fffff0]/70')
                      }`}
                      title="Буквица и книжная типографика (ё → е, т.д.)"
                    >
                       <Pilcrow size={16} />
                    </button>
                  )}

                  {currentBookFormat !== 'pdf' && currentBookFormat !== 'comic' && (
                    <button 
                      onClick={onToggleTheme}
                      className={`${voiceMode ? 'opacity-0 scale-50' : ''} w-[30px] sm:w-8 h-8 flex items-center justify-center rounded-lg active:scale-90 transition-all duration-200 ${
                        theme === 'light' 
                          ? (isMarcel ? 'text-[#b45309]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0284c7]' : 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]') 
                          : (isMarcel ? 'text-[#544372]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0284c7]' : 'text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.6)]')
                      }`}
                      title={theme === 'light' ? "Light theme" : "Dark theme"}
                    >
                       {theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                  )}

                  {currentBookFormat !== 'pdf' && currentBookFormat !== 'comic' && onToggleBionic && (
                    <button 
                      onClick={onToggleBionic}
                      className={`${voiceMode ? 'opacity-0 scale-50' : ''} w-[30px] sm:w-8 h-8 flex items-center justify-center rounded-lg active:scale-90 transition-all duration-200 select-none text-[15px] ${
                        isBionic 
                          ? `font-black ${bionicInk ? '' : isMarcel ? 'text-[#544372]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0284c7]' : 'text-violet-400 drop-shadow-[0_0_8px_rgba(167,139,250,0.6)]'}` 
                          : `font-normal ${isMarcel ? 'text-[#2F2440]/40 hover:text-[#2F2440]/70' : isBimbo ? 'text-[#BE123C]/40 hover:text-[#BE123C]/70' : isSurf ? 'text-[#7dd3fc] hover:text-[#0ea5e9]' : 'text-[#888] hover:text-[#fffff0]/70'}`
                      }`}
                      style={isBionic && bionicInk ? { color: bionicInk, filter: theme === 'light' ? undefined : `drop-shadow(0 0 6px ${bionicInk}99)` } : undefined}
                      title="Bionic reading mode"
                    >
                       B
                    </button>
                  )}

                  {currentBookFormat !== 'pdf' && currentBookFormat !== 'comic' && onToggleRsvpMode && (
                    <button 
                      onClick={onToggleRsvpMode}
                      className={`${voiceMode ? 'opacity-0 scale-50' : ''} w-[30px] sm:w-8 h-8 flex items-center justify-center rounded-lg active:scale-90 transition-all duration-200 ${
                        isRsvpMode ? (isMarcel ? 'text-[#b45309]' : isBimbo ? 'text-[#db2777]' : isSurf ? 'text-[#0284c7]' : 'text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]') 
                          : (isMarcel ? 'text-[#2F2440]/40 hover:text-[#2F2440]/70' : isBimbo ? 'text-[#BE123C]/40 hover:text-[#BE123C]/70' : isSurf ? 'text-[#7dd3fc] hover:text-[#0ea5e9]' : 'text-[#888] hover:text-[#fffff0]/70')
                      }`}
                      
                    >
                       <Zap size={16} className={isRsvpMode ? 'fill-current' : ''} />
                    </button>
                  )}

                  {currentBookFormat !== 'pdf' && currentBookFormat !== 'comic' && onTogglePagedMode && (
                    <button 
                      onClick={onTogglePagedMode}
                      className={`${voiceMode ? 'opacity-0 scale-50' : ''} w-[30px] sm:w-8 h-8 flex items-center justify-center rounded-lg active:scale-90 transition-all duration-200 ${
                        isPagedMode ? (isMarcel ? 'text-[#544372]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0284c7]' : 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]') 
                          : (isMarcel ? 'text-[#2F2440]/40 hover:text-[#2F2440]/70' : isBimbo ? 'text-[#BE123C]/40 hover:text-[#BE123C]/70' : isSurf ? 'text-[#7dd3fc] hover:text-[#0ea5e9]' : 'text-[#888] hover:text-[#fffff0]/70')
                      }`}
                      
                    >
                       {isPagedMode ? <BookOpen size={16} className="fill-current/20" /> : <Scroll size={16} />}
                    </button>
                  )}

                  {canReadAloud && (
                    <button
                      onClick={() => setReadAloudOpen(!readAloud.open)}
                      className={`pointer-events-auto w-[30px] sm:w-8 h-8 flex items-center justify-center rounded-lg active:scale-90 transition-all ${
                        readAloud.open ? (isMarcel ? 'text-[#544372]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0284c7]' : 'text-teal-400 drop-shadow-[0_0_8px_rgba(45,212,191,0.55)]')
                          : (isMarcel ? 'text-[#2F2440]/40 hover:text-[#2F2440]/70' : isBimbo ? 'text-[#BE123C]/40 hover:text-[#BE123C]/70' : isSurf ? 'text-[#7dd3fc] hover:text-[#0ea5e9]' : 'text-[#888] hover:text-[#fffff0]/70')
                      }`}
                      aria-label="Read aloud"
                    >
                       <Headphones size={16} />
                    </button>
                  )}
               </div>

                {/* Right: Stats (Chapter % / Book %) */}
               <div className="flex justify-end">
                   <div className={`flex items-center text-xs font-mono tabular-nums ${isMarcel ? 'text-[#544372]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0369a1]' : 'text-[#888]'}`}>
                       {(() => {
                           const isSpecialPdfOrComic = currentBookFormat === 'pdf' || currentBookFormat === 'comic';
                           const isDocWithChapters = currentBookFormat === 'pdf' && chapters?.some(ch => ch.isHeader);
                           if (!isSpecialPdfOrComic || isDocWithChapters) {
                               return (
                                   <>
                                       <span className={`font-bold tabular-nums inline-block w-[30px] text-right pr-1 ${isMarcel ? 'text-[#2F2440]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0ea5e9]' : 'text-[#fffff0]'}`}>
                                           {Math.round(chapterProgress)}%
                                       </span>
                                       <div className={`h-4 w-[1px] ${isMarcel ? 'bg-[#C4B5E6]' : isBimbo ? 'bg-[#FBCFE8]' : isSurf ? 'bg-sky-200' : 'bg-[#45413e]'}`}></div>
                                   </>
                               );
                           }
                           return null;
                       })()}
                       <span className={`font-bold tabular-nums inline-block w-[30px] text-right pl-1 ${isMarcel ? 'text-[#2F2440]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0369a1]' : 'text-[#aaa]'}`}>
                           {Math.round(bookProgress)}%
                       </span>
                   </div>
               </div>
           </div>

           {/* Middle: Progress Bar with Ticks */}
           <div className={`w-full h-2 rounded-full overflow-hidden relative group ${isMarcel ? 'bg-[#DBD0EF]' : isBimbo ? 'bg-[#FBCFE8]' : isSurf ? 'bg-[#e0f2fe]' : isDragon ? 'bg-[#4a2511]' : isFF ? 'bg-[#17335e]' : 'bg-[#45413e]'}`}>
                {/* Real Ticks Layer */}
                {ticks.map((tick, i) => (
                    <div 
                        key={i}
                        className={`absolute top-0 bottom-0 w-[1px] z-20 opacity-50 ${isMarcel ? 'bg-[#F3EFFB]' : isBimbo ? 'bg-white' : isSurf ? 'bg-sky-200' : 'bg-[#23211f]'}`}
                        style={{ left: `${tick}%` }}
                    />
                ))}

                <div 
                    className="h-full absolute left-0 top-0 transition-all duration-300 z-10" 
                    style={{ width: `${Math.min(100, bookProgress)}%`, backgroundColor: accentColor }}
                ></div>
           </div>

           {/* Bottom: Chapter Title */}
           <div className="w-full text-center pb-2">
               <span className={`text-xs line-clamp-1 mt-1 ${isMarcel ? 'text-[#544372]' : isBimbo ? 'text-[#BE123C]/60' : isSurf ? 'text-[#0284c7]' : 'text-[#aaa]'}`}>
                  {chapterTitle || "Reading"}
               </span>
           </div>

       </div>
    </div>
    </>
  );
};

export default EBookControls;
