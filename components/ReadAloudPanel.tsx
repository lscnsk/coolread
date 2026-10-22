import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Minus, Plus, Gauge } from './Icons';
import { SPEEDS, pause, play, setSpeed, skip, useReadAloud } from '../utils/readAloud';
import { playerPalette } from './PlayerControls';

interface ReadAloudPanelProps {
  appStyle?: string;
  visible: boolean;
  barVisible: boolean;
}

/** Small player above the reading panel, drawn like the audiobook player: speed, previous / play / next sentence, voice. */
const ReadAloudPanel: React.FC<ReadAloudPanelProps> = ({ appStyle, visible, barVisible }) => {
  const st = useReadAloud();
  const isBimbo = appStyle === 'Bimbo';
  const isSurf = appStyle === 'Surf';
  const isMarcel = appStyle === 'Marcel';

  const palette = playerPalette(appStyle);

  const speedIndex = Math.max(0, SPEEDS.findIndex(s => s >= st.speed - 0.001));
  const step = (d: number) => setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, speedIndex + d))]);
  const voiceName = st.voices.find(v => v.id === st.voice)?.name;

  return (
    <div
      // Slides out from behind the reading panel, like the other panels
      className={`fixed left-0 right-0 bottom-28 h-12 border-t px-4 flex items-center z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.15)] transition-[transform,opacity] duration-300 ease-in-out ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      } ${
        isMarcel ? 'bg-[#F3EFFB] border-[#C4B5E6]' : isBimbo ? 'bg-[#FFF0F5] border-[#FBCFE8]' : isSurf ? 'bg-white border-[#bae6fd]' : 'bg-[#23211f] border-[#45413e]'
      }`}
      style={{ transform: visible ? 'translateY(0)' : barVisible ? 'translateY(100%)' : 'translateY(calc(100% + 7rem))' }}
      onClick={e => e.stopPropagation()}
      aria-hidden={!visible}
    >
      <div className="max-w-4xl mx-auto w-full grid grid-cols-[1fr_auto_1fr] items-center gap-1 sm:gap-2">
        {/* Speed, as in the audiobook player */}
        <div className="flex justify-start">
          <div className="flex items-center gap-0.5">
            <button onClick={() => step(-1)} className="hover:opacity-80 active:scale-90 p-1" style={{ color: palette.control }} aria-label="Slower">
              <Minus size={16} />
            </button>
            <div className="flex items-center gap-1" style={{ color: palette.text }}>
              <Gauge className="w-4 h-4 opacity-90" />
              <span className="text-sm font-bold font-sans tracking-tight w-9 text-center tabular-nums">{st.speed.toFixed(2)}x</span>
            </div>
            <button onClick={() => step(1)} className="hover:opacity-80 active:scale-90 p-1" style={{ color: palette.control }} aria-label="Faster">
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Previous sentence / play / next sentence */}
        <div className="flex justify-center items-center gap-3">
          <button onClick={() => skip(-1)} className="transition-colors active:scale-95 transform" style={{ color: palette.control }} aria-label="Previous sentence">
            <SkipBack className="w-5 h-5 fill-current" />
          </button>
          <button
            onClick={() => (st.playing ? pause() : play())}
            className="w-8 h-8 rounded-full hover:scale-105 active:scale-95 flex items-center justify-center shadow-lg transition-all duration-300"
            style={{ backgroundColor: palette.accent, color: palette.onAccent }}
            aria-label={st.playing ? 'Pause' : 'Play'}
          >
            {st.playing && st.loading ? (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : st.playing ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>
          <button onClick={() => skip(1)} className="transition-colors active:scale-95 transform" style={{ color: palette.control }} aria-label="Next sentence">
            <SkipForward className="w-5 h-5 fill-current" />
          </button>
        </div>

        {/* Voice name, or what went wrong */}
        <div className="flex justify-end min-w-0 pr-1">
          <span className={`text-xs font-sans truncate ${st.error ? 'text-red-500' : ''}`} style={st.error ? undefined : { color: palette.label }}>
            {st.error ? st.error.toLowerCase() : voiceName || ''}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ReadAloudPanel;
