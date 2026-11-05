import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Minus, Plus } from './Icons';
import { SPEEDS, pause, play, setSpeed, skip, useReadAloud } from '../utils/readAloud';
import { playerPalette } from './PlayerControls';

/**
 * Read-aloud controls. While reading aloud they take the place of the reading panel's
 * buttons left of the headphones: speed on the left, previous / play / next sentence in the middle.
 */
export const ReadAloudSpeed: React.FC<{ appStyle?: string }> = ({ appStyle }) => {
  const st = useReadAloud();
  const palette = playerPalette(appStyle);
  const speedIndex = Math.max(0, SPEEDS.findIndex(s => s >= st.speed - 0.001));
  const step = (d: number) => setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, speedIndex + d))]);
  if (st.error) {
    return <span className="text-xs font-sans text-red-500 truncate">{st.error.toLowerCase()}</span>;
  }
  return (
    <div className="flex items-center gap-0.5 h-8">
      <button onClick={() => step(-1)} className="hover:opacity-80 active:scale-90 p-1" style={{ color: palette.control }} aria-label="Slower">
        <Minus size={14} />
      </button>
      <span className="text-[13px] font-bold font-sans tracking-tight w-[38px] text-center tabular-nums" style={{ color: palette.text }}>
        {st.speed.toFixed(2)}x
      </span>
      <button onClick={() => step(1)} className="hover:opacity-80 active:scale-90 p-1" style={{ color: palette.control }} aria-label="Faster">
        <Plus size={14} />
      </button>
    </div>
  );
};

export const ReadAloudTransport: React.FC<{ appStyle?: string }> = ({ appStyle }) => {
  const st = useReadAloud();
  const palette = playerPalette(appStyle);
  return (
    <div className="flex items-center gap-2.5">
      <button onClick={() => skip(-1)} className="active:scale-95 transform" style={{ color: palette.control }} aria-label="Previous sentence">
        <SkipBack className="w-[18px] h-[18px] fill-current" />
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
      <button onClick={() => skip(1)} className="active:scale-95 transform" style={{ color: palette.control }} aria-label="Next sentence">
        <SkipForward className="w-[18px] h-[18px] fill-current" />
      </button>
    </div>
  );
};
