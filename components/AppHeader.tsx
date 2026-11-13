import React from 'react';
import { motion } from 'motion/react';
import { Book, AppMode } from '../types';
import { variantOf } from '../utils/styleVariants';
import { deckKeyOf } from '../utils/deckArt';
import { PLAYER_EMOJI } from '../utils/playerMode';

interface AppHeaderProps {
  isImmersive: boolean;
  mode: AppMode;
  appStyle: string;
  /** The chosen style, when it is one of the added styles built on appStyle */
  styleName?: string;
  libraryClickKey: number;
  titleClickKey: number;
  chaptersClickKey: number;
  currentBook: Book | null;
  onToggleLibrary: () => void;
  onSwitchMode: () => void;
  onToggleChapters: () => void;
  isCatalogView?: boolean;
  /** In the player (tapes and albums): "…Tape" and the player's buttons */
  isPlayerMode?: boolean;
  onToggleCatalogFilter?: () => void;
  onBackFromCatalog?: () => void;
}

export function AppHeader({
  isImmersive,
  mode,
  appStyle,
  styleName,
  libraryClickKey,
  titleClickKey,
  chaptersClickKey,
  currentBook,
  onToggleLibrary,
  onSwitchMode,
  onToggleChapters,
  isCatalogView = false,
  isPlayerMode = false,
  onToggleCatalogFilter,
  onBackFromCatalog
}: AppHeaderProps) {
  const isDragon = appStyle === 'Dragon';
  const isFF = appStyle === 'Final Fantasy' || appStyle === 'Final';
  const isBimbo = appStyle === 'Bimbo';
  const isSurf = appStyle === 'Surf';
  const isMarcel = appStyle === 'Marcel';
  const v = variantOf(styleName);
  // Player mode: "…Tape" instead of "…Read", and the collection / tracks buttons of the style
  const player = isPlayerMode ? PLAYER_EMOJI[deckKeyOf(appStyle, styleName)] : null;
  const word = player ? 'Tape' : 'Read';

  return (
    <div
      className={`bimbo-header bimbo-panel absolute top-0 left-0 right-0 h-20 bg-[#23211f] border-b border-[#45413e] px-4 z-30 transition-transform duration-300 shadow-[0_5px_15px_rgba(0,0,0,0.15)] ${
        !isImmersive || mode === 'audio' ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="max-w-4xl mx-auto h-full w-full flex items-center justify-between relative">
        <div className="flex items-center gap-2 relative">
          {isCatalogView ? (
            <button
              onClick={() => {
                if (onBackFromCatalog) {
                  onBackFromCatalog();
                } else {
                  onToggleLibrary();
                }
              }}
              className="p-2 flex items-center justify-center text-3xl hover:scale-105 active:scale-95 transition-transform cursor-pointer"
              title="Назад"
              aria-label="Назад"
            >
              <motion.span
                key="catalog-back-button"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-block emoji"
              >
                ⬅️
              </motion.span>
            </button>
          ) : (
            <button
              onClick={onToggleLibrary}
              className="p-2 flex items-center justify-center text-3xl"
              title={player ? 'Коллекция' : 'Библиотека'}
              aria-label={player ? 'Коллекция' : 'Библиотека'}
            >
              <motion.span
                key={`library-pulse-${libraryClickKey}`}
                animate={libraryClickKey > 0 ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
                className="inline-block emoji"
              >
                {player ? player.collection : v ? v.libraryEmoji : isMarcel ? '🪶' : isDragon ? '🍻' : isFF ? '🎒' : isBimbo ? '💖' : isSurf ? '🏖️' : '📚'}
              </motion.span>
            </button>
          )}
        </div>

        <button
          onClick={onSwitchMode}
          className={`absolute left-1/2 top-0 h-full -translate-x-1/2 flex items-center justify-center w-[220px] md:w-[260px] transition-all active:opacity-50 duration-100 z-10 whitespace-nowrap ${
            v
              ? v.titleClass
              : isMarcel
              ? 'font-marcel font-medium text-[26px] md:text-[34px] text-[#2F2440]'
              : isDragon
              ? 'font-dragon text-2xl md:text-3xl text-[#fcd34d] drop-shadow-md'
              : isFF
              ? 'font-ff font-normal text-2xl md:text-3xl text-[#f0deba] tracking-widest drop-shadow-md'
              : isBimbo
              ? 'font-bimbo font-normal text-3xl md:text-4xl text-[#fb7185] drop-shadow-md'
              : isSurf
              ? 'font-surf font-normal text-4xl md:text-5xl text-[#0ea5e9] drop-shadow-md'
              : 'font-bold text-2xl md:text-3xl tracking-wide text-[#fffff0] font-literata'
          }`}
          
        >
          {isMarcel ? (
            <div className="flex items-center justify-center text-3xl pt-1">
              <span>Marcel{word}</span>
              <motion.span
                key={`title-emoji-${titleClickKey}`}
                animate={titleClickKey > 0 ? { scale: [1, 1.4, 1] } : { scale: 1 }}
                transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
                className="shrink-0 relative z-10 inline-block emoji ml-1 -translate-y-0.5"
              >
                ☕
              </motion.span>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center text-center w-full">
              <span className={`text-right shrink-0 truncate ${
                v ? v.nameTracking :
                isBimbo ? 'tracking-normal' : 
                isSurf ? 'tracking-normal pr-1.5 md:pr-2' : 
                isFF ? 'tracking-normal' : 
                isDragon ? 'tracking-[0.15em]' : 
                'tracking-[0.05em]'
              }`}>
                {v ? v.title : isDragon ? 'Roll' : isFF ? 'Final' : isBimbo ? 'Bimbo' : isSurf ? 'Surf' : 'Cool'}
              </span>
              <motion.span
                key={`title-emoji-${titleClickKey}`}
                animate={titleClickKey > 0 ? { scale: [1, 1.4, 1] } : { scale: 1 }}
                transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
                className={`shrink-0 relative z-10 inline-block emoji ${
                  v ? v.emojiSize : isBimbo ? 'text-4.5xl md:text-5.5xl' : isSurf ? 'text-4.5xl md:text-5.5xl' : isFF ? 'text-3.5xl md:text-4.5xl' : 'text-4.5xl md:text-5.5xl'
                } ${isDragon ? 'pt-0.5' : isFF ? 'pt-0' : 'pt-0.5'} ${isSurf ? 'mx-1 md:mx-2' : 'mx-1 md:mx-2'}`}
              >
                {v ? v.titleEmoji : isDragon ? '🐉' : isFF ? '☄️' : isBimbo ? '👑' : isSurf ? '🌊' : '💀'}
              </motion.span>
              <span className={`text-left shrink-0 truncate ${
                v ? v.readTracking :
                isBimbo ? 'tracking-[0.08em]' : 
                isSurf ? 'tracking-normal pl-0.5' : 
                isFF ? 'tracking-normal' : 
                isDragon ? 'tracking-[0.05em]' : 
                'tracking-[0.05em]'
              }`}>
                {word}
              </span>
            </div>
          )}
        </button>

        <div className="flex items-center gap-2">
          {isCatalogView ? (
            <button
              onClick={() => onToggleCatalogFilter?.()}
              className="p-2 rounded-lg flex items-center justify-center text-3xl hover:scale-105 transition-transform"
              title="Фильтр по сериям и авторам"
            >
              <motion.span
                key={`catalog-pulse-${chaptersClickKey}`}
                animate={chaptersClickKey > 0 ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
                className="inline-block emoji"
              >
                🗂️
              </motion.span>
            </button>
          ) : (
            <button
              onClick={() => {
                if (currentBook) {
                  onToggleChapters();
                }
              }}
              className={`p-2 rounded-lg flex items-center justify-center text-3xl ${
                !currentBook ? 'opacity-30' : ''
              }`}
              disabled={!currentBook}
            >
              <motion.span
                key={`chapters-pulse-${chaptersClickKey}`}
                animate={chaptersClickKey > 0 ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
                className="inline-block emoji"
              >
                {player ? player.tracks : v ? v.chaptersEmoji : isMarcel ? '🪻' : isDragon ? '🏰' : isFF ? '📜' : isBimbo ? '💎' : isSurf ? '🐚' : '📖'}
              </motion.span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
