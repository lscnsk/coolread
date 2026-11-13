import React, { useRef } from 'react';
import { variantOf } from '../utils/styleVariants';
import { deckKeyOf } from '../utils/deckArt';
import { PLAYER_EMOJI, PlayerKind } from '../utils/playerMode';

interface EmptyStateProps {
  isLoading: boolean;
  booksCount: number;
  mode: 'ebook' | 'audio' | 'pdf' | 'comic';
  isNative: boolean;
  appStyle: string;
  /** The chosen style, when it is one of the added styles built on appStyle */
  styleName?: string;
  onExternalFilePicked?: (files: FileList | File[] | File) => void;
  onExternalFolderPicked?: (files: File[] | FileList) => void;
  currentBook: any;
  onOpenCatalog?: () => void;
  // "lscnsk, flibusta, mangadex": the catalogs the Download button leads to
  catalogNames?: string;
  /** The player (tapes and albums): its own add buttons instead of the library's */
  isPlayerMode?: boolean;
  /** Called before the file picker opens for "add tape" / "add album" */
  onAddAudio?: (kind: PlayerKind) => void;
}

export function EmptyState({ 
  isLoading, 
  booksCount, 
  mode, 
  isNative, 
  appStyle,
  styleName,
  onExternalFilePicked,
  onExternalFolderPicked,
  currentBook,
  onOpenCatalog,
  catalogNames,
  isPlayerMode = false,
  onAddAudio
}: EmptyStateProps) {
  const isMarcel = appStyle === 'Marcel';
  const isBimbo = appStyle === 'Bimbo';
  const isSurf = appStyle === 'Surf';
  const isFF = appStyle === 'Final Fantasy' || appStyle === 'Final';
  const isDragon = appStyle === 'Dragon';
  const v = variantOf(styleName);

  const buttonStyle = isMarcel
    ? 'border-[#C4B5E6] bg-[#E8E0F5] text-[#544372] hover:bg-[#DBD0EF] hover:border-[#AC97D7]'
    : isBimbo
    ? 'border-[#FBCFE8] bg-[#FFF0F5] text-[#BE123C] hover:bg-pink-100 hover:border-[#F472B6]'
    : isSurf
    ? 'border-[#BAE6FD] bg-[#F0F9FF] text-[#0c4a6e] hover:bg-sky-100 hover:border-[#7dd3fc]'
    : isDragon
    ? 'border-[#7f1d1d] bg-[#3a1a0e] text-[#fcd34d] hover:bg-[#4a2511] hover:border-[#991b1b]'
    : isFF
    ? 'border-[#406da3] bg-[#0d2347] text-[#f0deba] hover:bg-[#17335e] hover:border-[#dfc894]'
    : 'border-[#57534e] bg-[#363330] text-[#fffff0] hover:bg-[#45413e] hover:border-[#666]';

  const bookInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-8 z-0 relative">
        <div className={`w-12 h-12 border-4 rounded-full animate-spin ${
            isBimbo ? 'border-pink-200 border-t-pink-600' : 
            isSurf ? 'border-sky-200 border-t-sky-600' : 
            isDragon ? 'border-orange-200 border-t-orange-600' :
            isMarcel ? 'border-[#C4B5E6] border-t-[#766594]' :
            isFF ? 'border-[#e0d6c1] border-t-[#cca972]' :
            'border-[#fffff0]/20 border-t-[#fffff0]'
        }`}></div>
      </div>
    );
  }

  if (!currentBook && isPlayerMode) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-8 mt-16 z-0 relative">
        <div className="text-4xl emoji">{PLAYER_EMOJI[deckKeyOf(appStyle, styleName)].collection}</div>
        <div className="max-w-xs w-full space-y-3">
          {([['tape', '📼', 'Add tape', 'plays as a cassette · mp3, m4b, m4a'], ['vinyl', '💿', 'Add album', 'plays as a record · mp3, m4b, m4a']] as const).map(([kind, emoji, title, hint]) => (
            <button
              key={kind}
              onClick={() => { onAddAudio?.(kind); audioInputRef.current?.click(); }}
              className={`w-full py-5 px-4 border-2 border-dashed rounded-2xl transition-all flex flex-col items-center gap-2 group ${buttonStyle}`}
            >
              <span className="text-3xl group-hover:scale-110 transition-transform emoji">{emoji}</span>
              <div className="flex flex-col items-center">
                <span className="text-base font-bold uppercase tracking-widest">{title}</span>
                <span className="text-[9.5px] opacity-60 font-mono text-center">{hint}</span>
              </div>
            </button>
          ))}
        </div>
        <input
          type="file"
          ref={audioInputRef}
          className="hidden"
          multiple
          accept={isNative ? undefined : ".mp3,.m4b,.m4a,.mp4,audio/*,.jpg,.jpeg,.png,.webp,image/*"}
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0 && onExternalFilePicked) onExternalFilePicked(files);
            e.target.value = '';
          }}
        />
      </div>
    );
  }

  if (!currentBook) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-8 mt-16 z-0 relative">
        <div className="text-4xl emoji">
           {v ? v.libraryEmoji : isMarcel ? '🪶' : isDragon ? '🍻' : isFF ? '🎒' : isBimbo ? '💖' : isSurf ? '🏖️' : '📚'}
        </div>
        <div className="max-w-xs w-full space-y-3">
           {/* Add books */}
           <button 
             onClick={() => bookInputRef.current?.click()}
             className={`w-full py-5 px-4 border-2 border-dashed rounded-2xl transition-all flex flex-col items-center gap-2 group ${buttonStyle}`}
           >
             <span className="text-3xl group-hover:scale-110 transition-transform emoji">➕</span>
             <div className="flex flex-col items-center">
                <span className="text-base font-bold uppercase tracking-widest">Add books</span>
                <span className="text-[9.5px] opacity-60 font-mono text-center">fb2, epub, pdf, cbz, cbr, mp3, m4b, m4a, mp4</span>
             </div>
           </button>

           {/* Add folder (hidden on Android: its file picker can't select folders; pick several files instead) */}
           {!isNative && <button 
             onClick={() => folderInputRef.current?.click()}
             className={`w-full py-5 px-4 border-2 border-dashed rounded-2xl transition-all flex flex-col items-center gap-2 group ${buttonStyle}`}
           >
             <span className="text-3xl group-hover:scale-110 transition-transform emoji">📁</span>
             <div className="flex flex-col items-center">
                <span className="text-base font-bold uppercase tracking-widest">Add folder</span>
                <span className="text-[9.5px] opacity-60 font-mono text-center">folders with mp3, cbz, cbr, images</span>
             </div>
           </button>}

           {/* Download Catalog */}
           {onOpenCatalog && (
             <button 
               onClick={onOpenCatalog}
               className={`w-full py-4 px-4 border-2 border-dashed rounded-2xl transition-all flex flex-col items-center gap-1 group ${buttonStyle}`}
             >
               <span className="text-2xl group-hover:scale-110 transition-transform emoji">📥</span>
               <div className="flex flex-col items-center">
                  <span className="text-sm font-bold uppercase tracking-widest">DOWNLOAD</span>
                  <span className="text-[9.5px] opacity-60 font-mono text-center">{catalogNames || 'lscnsk'}</span>
               </div>
             </button>
           )}
        </div>

        {/* Hidden File Input */}
        <input 
          type="file" 
          ref={bookInputRef} 
          className="hidden" 
          multiple
          accept={isNative ? undefined : ".fb2,.epub,.pdf,.cbz,.cbr,.bin,.mp3,.m4b,.m4a,.mp4,audio/*,.jpg,.jpeg,.png,.webp,image/*"}
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              if (onExternalFilePicked) onExternalFilePicked(files);
            }
            e.target.value = '';
          }}
        />

        {/* Hidden Folder Input */}
        <input 
          type="file" 
          ref={folderInputRef} 
          className="hidden" 
          multiple
          {...({ webkitdirectory: "", directory: "" } as any)}
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              if (onExternalFolderPicked) onExternalFolderPicked(files);
            }
            e.target.value = '';
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-[#444] space-y-4 mt-16 z-0 relative">
      <div className="text-6xl emoji">
        {mode === 'audio'
          ? v ? v.audioEmoji : isDragon ? '📯' : isFF ? '🎼' : isBimbo ? '💅' : isSurf ? '🏄‍♂️' : isMarcel ? '☕' : '💿'
          : v ? v.ebookEmoji : isDragon ? '📜' : isFF ? '📜' : isBimbo ? '🩰' : isSurf ? '🌊' : isMarcel ? '🪻' : '📄'}
      </div>
      <p>
        {v
          ? v.emptyPrompt
          : isDragon
          ? 'Select a scroll or artifact 🛡️'
          : isFF
          ? 'Select a tome or crystal 🔮'
          : isBimbo
          ? 'Pick something bestie 💖'
          : isSurf
          ? 'Catch a wave 🏄'
          : `Select ${mode === 'audio' ? 'an audiobook' : 'an ebook'}`}
      </p>
    </div>
  );
}
