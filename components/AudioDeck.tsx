import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Book } from '../types';
import { DeckKey, DECK_VARS, lidArt, flapArt, generatedCover } from '../utils/deckArt';
import { PlayerKind } from '../utils/playerMode';
import { formatTime } from '../utils/time';
import { deckSounds } from '../utils/deckSounds';
import { activeDeckSkinUrl, onDeckSkinChange } from '../utils/deckSkin';
import './audioDeck.css';

interface AudioDeckProps {
  book: Book;
  /** The rest of the collection, shown in the strip under the player */
  others: Book[];
  /** The whole collection of this kind, the current book included, in library order (the tape shelf) */
  collection: Book[];
  kind: PlayerKind;
  deckKey: DeckKey;
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  isLoading: boolean;
  /** Time and length of the current chapter */
  currentTime: number;
  duration: number;
  chapterIndex: number;
  /** Listened part of the whole book, 0–100 */
  totalProgress: number;
  /** Seek within the chapter; times outside it go on into the neighbouring chapters */
  onSeek: (t: number) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  /** A track picked on the record's drum */
  onSelectChapter: (i: number) => void;
  onSelectBook: (b: Book) => void;
}

const ICON = {
  play: <svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" /></svg>,
  pause: <svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>,
  rew: <svg viewBox="0 0 24 24"><path d="M11 5v14L2 12zM22 5v14l-9-7z" /></svg>,
  ff: <svg viewBox="0 0 24 24"><path d="M13 5v14l9-7zM2 5v14l9-7z" /></svg>,
  prev: <svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>,
  next: <svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>,
  back: <svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" /></svg>,
};
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const coverOf = (b: Book) => b.coverUrl || generatedCover(b.title, b.author);
const bg = (url: string) => ({ backgroundImage: `url("${url}")` });

// Reel packs: tape moves from the left reel to the right one as the book is listened to
const RMIN = 6.5, RMAX = 15.5;
const packs = (p: number) => [Math.sqrt(RMIN * RMIN + (1 - p) * (RMAX * RMAX - RMIN * RMIN)), Math.sqrt(RMIN * RMIN + p * (RMAX * RMAX - RMIN * RMIN))];

/** Bay states: in the deck, pushed half out (ejected), or gone (between books) */
type Bay = 'in' | 'out' | 'away';

// The record's track drum: two tracks above and below the playing one, which is larger and has its number
// between two rails; the list rolls to keep it in place, with empty rows before the first and after the last track
const ROW = 30, CUR = 44;
function Drum({ names, current, onPick }: { names: string[]; current: number; onPick: (i: number) => void }) {
  // Always room for two rows above and below, so the drum keeps its size and place on every track
  const above = 2 * ROW, below = 2 * ROW;
  const cls = `dk-drum${current === 0 ? ' first' : ''}${current === names.length - 1 ? ' last' : ''}`;
  return (
    <div className={cls} aria-label="Треки" style={{ ['--above' as any]: above + 'px', ['--h' as any]: (above + CUR + below) + 'px' }}>
      <ol style={{ transform: `translateY(${above - current * ROW}px)` }}>
        {names.map((n, k) => (
          <li key={k}>
            {k === current
              ? <button type="button" className="on" aria-current="true" onClick={() => onPick(k)}><span className="num">{k + 1}.</span><span className="nm">{n}</span></button>
              : <button type="button" onClick={() => onPick(k)}><span className="nm">– {k + 1}. {n}</span></button>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A cassette with its label and reels; the one in the deck has its hubs turned by the animation loop */
function Cassette({ book, rl, rr, hubL, hubR }: { book: Book; rl: number; rr: number; hubL?: React.Ref<HTMLDivElement>; hubR?: React.Ref<HTMLDivElement> }) {
  const tracks = book.chapters.length;
  return (
    <div className="dk-cassette" style={{ ['--rl' as any]: rl.toFixed(2), ['--rr' as any]: rr.toFixed(2) }}>
      <div className="dk-shell">
        <i className="dk-screw dk-s1" /><i className="dk-screw dk-s2" /><i className="dk-screw dk-s3" /><i className="dk-screw dk-s4" />
        <div className="dk-label">
          <div className="dk-label-art" style={bg(coverOf(book))} />
          <div className="dk-label-title">{book.title}</div>
          <div className="dk-label-side">A</div>
          {book.author && <div className="dk-label-author">{book.author}</div>}
          <div className="dk-label-fmt">{tracks} {tracks === 1 ? 'track' : 'tracks'}</div>
        </div>
        <div className="dk-win">
          <div className="dk-reel L"><div className="dk-pack" /><div className="dk-hub" ref={hubL} /></div>
          <div className="dk-reel R"><div className="dk-pack" /><div className="dk-hub" ref={hubR} /></div>
          <div className="dk-glass" />
        </div>
        <div className="dk-cbottom"><i /><i /><i /></div>
      </div>
    </div>
  );
}

export function AudioDeck(props: AudioDeckProps) {
  const { book, others, kind, deckKey, isPlaying, setIsPlaying, currentTime, duration, totalProgress, onSeek } = props;
  const vars = DECK_VARS[deckKey] as React.CSSProperties;
  // The user's own door, when they have uploaded one, over every style's deck
  const [skin, setSkin] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => activeDeckSkinUrl().then(u => { if (live) setSkin(u); });
    load();
    const off = onDeckSkinChange(load);
    return () => { live = false; off(); };
  }, []);

  // Live values for the animation loop and the held keys, without re-creating them each render
  const live = useRef({ isPlaying, currentTime, wind: 0, chapter: props.chapterIndex, duration, tracks: book.chapters.length });
  live.current.isPlaying = isPlaying; live.current.currentTime = currentTime;
  live.current.chapter = props.chapterIndex; live.current.duration = duration; live.current.tracks = book.chapters.length;

  // ----- cassette: the bay, the door and the reels -----
  const [bay, setBay] = useState<Bay>('away');
  const [doorOpen, setDoorOpen] = useState(true);
  const busy = useRef(false);
  // The shelf: tapping the door takes the cassette out and puts it over the deck, among the others
  const [shelf, setShelf] = useState(false);
  // ----- record: slid out of its sleeve or not -----
  const [slid, setSlid] = useState(false);
  // The box or sleeve picked in the strip, lifted while the current one goes away
  const [picked, setPicked] = useState<string | null>(null);

  const insert = async () => {
    if (busy.current) return; busy.current = true;
    deckSounds.insert();
    setDoorOpen(true); await wait(220); setBay('in'); await wait(720); setDoorOpen(false); await wait(380);
    busy.current = false;
  };
  const eject = async () => {
    if (busy.current) return; busy.current = true;
    setIsPlaying(false); live.current.wind = 0;
    deckSounds.eject();
    setDoorOpen(true); await wait(300); setBay('out'); await wait(650);
    busy.current = false;
  };

  // A new book: the cassette goes into the deck (and waits for PLAY), the record slides out and plays
  useEffect(() => {
    setPicked(null);
    if (kind === 'tape') {
      busy.current = false; setBay('away'); setDoorOpen(true); setShelf(false);
      const t = setTimeout(insert, 350);
      return () => clearTimeout(t);
    }
    setSlid(false);
    const t = setTimeout(() => { setSlid(true); setTimeout(() => setIsPlaying(true), 850); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, kind]);

  // Reels and record turn in one animation loop; their transforms are set directly
  const hubL = useRef<HTMLDivElement>(null), hubR = useRef<HTMLDivElement>(null), spin = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0, last = performance.now(), aL = 0, aR = 0, tv = 0, vAngle = 0, vVel = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const { isPlaying: playing, wind } = live.current;
      const target = wind ? wind * 9 : (playing ? 1 : 0);
      tv += (target - tv) * Math.min(1, dt * 7);
      // the emptier reel turns faster, as on a real cassette
      const [rl, rr] = packs(Math.min(1, Math.max(0, totalRef.current / 100)));
      aL -= tv * 140 * dt * (RMIN / rl) * 2.2; aR -= tv * 140 * dt * (RMIN / rr) * 2.2;
      if (hubL.current) hubL.current.style.transform = `rotate(${aL}deg)`;
      if (hubR.current) hubR.current.style.transform = `rotate(${aR}deg)`;
      vVel += ((playing ? 200 : 0) - vVel) * Math.min(1, dt * 2.5); vAngle += vVel * dt;
      if (spin.current) spin.current.style.transform = `rotate(${vAngle % 360}deg)`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  const totalRef = useRef(totalProgress); totalRef.current = totalProgress;

  // ----- keys -----
  // PLAY and STOP act the moment they are pressed, as on a real deck
  const [tap, setTap] = useState<string | null>(null);
  const play = () => {
    if (bay === 'in') { if (isPlaying) deckSounds.keyDown(); else { deckSounds.latch(); setIsPlaying(true); } }
    else if (bay === 'out' || shelf) { deckSounds.keyDown(); setShelf(false); insert().then(() => { deckSounds.latch(); setIsPlaying(true); }); }
    else deckSounds.keyDown();
  };
  const stop = () => {
    if (isPlaying) { deckSounds.release(); setIsPlaying(false); }
    else if (bay === 'in') { deckSounds.keyDown(); eject(); }
    else deckSounds.keyDown();
  };
  // REW / FF: a tap jumps 15 s, holding winds faster and faster
  const [held, setHeld] = useState<number>(0);
  const holdRef = useRef<{ timer?: number; tick?: number; step: number; wound: boolean; ended?: boolean; hush?: () => void }>({ step: 5, wound: false });
  const startWind = (dir: number) => {
    if (bay !== 'in') return;
    setHeld(dir); deckSounds.keyDown();
    const h = holdRef.current; h.wound = false; h.ended = false; h.step = 5;
    h.timer = window.setTimeout(() => {
      h.wound = true; live.current.wind = dir; h.hush = deckSounds.wind();
      h.tick = window.setInterval(() => {
        const L = live.current, to = L.currentTime + dir * h.step;
        // The tape has run out: the deck stops winding by itself and the key springs up
        const atStart = dir < 0 && L.chapter <= 0 && to <= 0;
        const atEnd = dir > 0 && L.chapter >= L.tracks - 1 && L.duration > 0 && to >= L.duration - 1;
        if (atStart || atEnd) {
          onSeekRef.current(atStart ? 0 : Math.max(0, L.duration - 1));
          L.currentTime = atStart ? 0 : Math.max(0, L.duration - 1);
          clearInterval(h.tick); h.tick = undefined; h.hush?.(); h.hush = undefined;
          L.wind = 0; h.ended = true; deckSounds.release(); setHeld(0);
          return;
        }
        onSeekRef.current(to);
        L.currentTime = to;
        h.step = Math.min(40, h.step * 1.15);
      }, 160);
    }, 280);
  };
  const endWind = (dir: number) => {
    const h = holdRef.current;
    if (h.timer) clearTimeout(h.timer); if (h.tick) clearInterval(h.tick); h.timer = h.tick = undefined;
    h.hush?.(); h.hush = undefined; if (held === dir) deckSounds.keyUp();
    if (held === dir && !h.wound && bay === 'in') {
      // a tap jumps 15 s, but no further than the start or the end of the tape
      const L = live.current;
      let to = L.currentTime + dir * 15;
      if (L.chapter <= 0) to = Math.max(0, to);
      if (L.chapter >= L.tracks - 1 && L.duration > 0) to = Math.min(L.duration - 1, to);
      onSeekRef.current(to);
    }
    live.current.wind = 0; h.wound = false; setHeld(0);
  };
  const onSeekRef = useRef(onSeek); onSeekRef.current = onSeek;
  useEffect(() => () => { const h = holdRef.current; if (h.timer) clearTimeout(h.timer); if (h.tick) clearInterval(h.tick); h.hush?.(); }, []);


  // ----- the tape shelf -----
  const openShelf = async () => {
    if (busy.current || bay !== 'in') return; busy.current = true;
    setIsPlaying(false); live.current.wind = 0;
    deckSounds.eject();
    setDoorOpen(true); await wait(250); setBay('away'); setShelf(true); await wait(450);
    busy.current = false;
  };
  const closeShelf = () => { if (busy.current) return; setShelf(false); insert(); };
  const pickTape = (b: Book) => {
    if (busy.current) return;
    if (b.id === book.id) { closeShelf(); return; }
    deckSounds.keyUp(); setPicked(b.id);
    setTimeout(() => props.onSelectBook(b), 260);
  };
  const tapDeck = () => { if (shelf) closeShelf(); else if (bay === 'out') insert(); else if (bay === 'in') openShelf(); };
  // The shelf opens on the cassette that was in the deck
  const shelfRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = shelfRef.current?.querySelector<HTMLElement>('.dk-shelf'); if (!shelf || !el) return;
    const cur = el.querySelector<HTMLElement>('[data-current]');
    if (cur) el.scrollLeft = cur.offsetLeft + cur.offsetWidth / 2 - el.clientWidth / 2;
  }, [shelf]);

  // ----- swapping books from the strip -----
  const choose = async (b: Book) => {
    if (picked || busy.current) return;
    setPicked(b.id);
    if (kind === 'tape') {
      busy.current = true; setIsPlaying(false); live.current.wind = 0;
      deckSounds.eject();
      setDoorOpen(true); await wait(280); setBay('away'); await wait(520);
      busy.current = false;
    } else {
      setIsPlaying(false); setSlid(false); await wait(800);
    }
    props.onSelectBook(b);
  };

  // ----- record: seeking on the bar -----
  const barRef = useRef<HTMLDivElement>(null);
  const seekAt = (clientX: number) => {
    const el = barRef.current; if (!el || !(duration > 0)) return;
    const r = el.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration);
  };
  const toggleRecord = () => { if (slid) setIsPlaying(!isPlaying); else { setSlid(true); setTimeout(() => setIsPlaying(true), 850); } };

  const [rl, rr] = packs(Math.min(1, Math.max(0, totalProgress / 100)));
  const cover = coverOf(book);
  const chapterPct = duration > 0 ? Math.min(100, currentTime / duration * 100) : 0;
  const tracks = book.chapters.length;

  return (
    <div className={`dk${kind === 'tape' ? ' dk-full' : ''}`} style={vars}>
      {kind === 'tape' ? (
        <div className={`dk-tape${shelf ? ' shelf' : ''}`} ref={shelfRef}>
        {/* The shelf over the deck: the cassette taken out, among the rest of the collection */}
        <AnimatePresence>
          {shelf && (
            <motion.div className="dk-shelf" key="shelf"
              initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40, transition: { duration: 0.25 } }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
              {props.collection.map(b => (
                <motion.button key={b.id} type="button" className="dk-shelf-tape" data-current={b.id === book.id ? '' : undefined}
                  aria-label={b.id === book.id ? `Вернуть «${b.title}» в деку` : `Поставить «${b.title}»`}
                  onClick={() => pickTape(b)}
                  animate={picked === b.id ? { y: 60, scale: 0.92, opacity: 0 } : { y: 0, scale: 1, opacity: 1 }}
                  whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
                  <div className="dk-up-tape"><div className="dk-up-inner">
                    <Cassette book={b} rl={b.id === book.id ? rl : RMAX} rr={b.id === book.id ? rr : RMIN} />
                  </div></div>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="dk-deck dk-vertical">
          {/* The deck stands upright: the bay is drawn landscape and turned a quarter */}
          <div className="dk-stage">
          <div className="dk-upright" onClick={tapDeck} role="button" aria-label={shelf ? 'Вставить кассету обратно' : 'Открыть крышку и достать кассету'}>
          <div className={`dk-bay ${bay === 'in' ? '' : bay}${doorOpen ? ' open' : ''}`}>
            <div className="dk-slot">
              <Cassette book={book} rl={rl} rr={rr} hubL={hubL} hubR={hubR} />
            </div>
            <div className="dk-door">
              <div className="dk-door-face" style={bg(skin || lidArt(deckKey))} />
              <div className="dk-door-glass" /><div className="dk-door-sheen" />
            </div>
          </div>
          </div>
          </div>
          <div className="dk-keys">
            {([['rew', -1], ['play', 0], ['stop', 0], ['ff', 1]] as const).map(([k, dir]) => {
              const latched = k === 'play' && isPlaying;
              const down = latched || (dir !== 0 && held === dir) || tap === k;
              const handlers = dir !== 0
                ? { onPointerDown: (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); startWind(dir); },
                    onPointerUp: () => endWind(dir), onPointerCancel: () => endWind(dir),
                    onKeyDown: (e: React.KeyboardEvent) => { if ((e.key === ' ' || e.key === 'Enter') && bay === 'in') { e.preventDefault(); onSeek(currentTime + dir * 15); } } }
                : { onPointerDown: () => { setTap(k); (k === 'play' ? play : stop)(); },
                    onPointerUp: () => setTap(null), onPointerCancel: () => setTap(null), onPointerLeave: () => setTap(null),
                    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); (k === 'play' ? play : stop)(); } } };
              return (
                <button key={k} type="button" className={`dk-key k-${k}${down ? ' down' : ''}${latched ? ' latched' : ''}`}
                  aria-label={k === 'rew' ? 'Назад: нажмите или удерживайте' : k === 'ff' ? 'Вперёд: нажмите или удерживайте' : k === 'play' ? 'Играть' : 'Стоп, на паузе извлекает кассету'}
                  {...handlers}>
                  <i className="dk-led" />
                  {k === 'rew' ? ICON.rew : k === 'ff' ? ICON.ff : k === 'play' ? ICON.play : ICON.pause}
                  <small>{k === 'stop' ? 'STOP/EJ' : k.toUpperCase()}</small>
                </button>
              );
            })}
          </div>
        </div>
        </div>
      ) : (
        <>
          <div className="dk-lp">
            <div className={`dk-record${slid ? ' slid' : ''}`} onClick={toggleRecord}>
              <div className="dk-spin" ref={spin}><div className="dk-disc-label" style={bg(cover)} /></div>
              <div className="dk-sheen" /><div className="dk-hole" />
            </div>
            <div className="dk-jacket" style={bg(cover)} onClick={toggleRecord} role="button" aria-label={isPlaying ? 'Пауза' : 'Играть'} />
          </div>
          <div className="dk-bar" ref={barRef}
            onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); seekAt(e.clientX); }}
            onPointerMove={e => { if (e.buttons) seekAt(e.clientX); }}>
            <i style={{ width: `${chapterPct}%` }} /><b style={{ left: `${chapterPct}%` }} />
          </div>
          <div className="dk-times">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <div className="dk-ctrls">
            <button type="button" onClick={props.onPrevChapter} aria-label="Предыдущий трек">{ICON.prev}</button>
            <button type="button" onClick={() => onSeek(currentTime - 15)} aria-label="Назад на 15 секунд">{ICON.back}</button>
            <button type="button" className="dk-big" onClick={toggleRecord} aria-label={isPlaying ? 'Пауза' : 'Играть'}>{isPlaying ? ICON.pause : ICON.play}</button>
            <button type="button" onClick={() => onSeek(currentTime + 15)} aria-label="Вперёд на 15 секунд" style={{ transform: 'scaleX(-1)' }}>{ICON.back}</button>
            <button type="button" onClick={props.onNextChapter} disabled={props.chapterIndex >= tracks - 1} aria-label="Следующий трек">{ICON.next}</button>
          </div>
          <Drum names={book.chapters.map(c => (c.name || '').replace(/\.[^/.]+$/, ''))} current={props.chapterIndex}
            onPick={i => { props.onSelectChapter(i); if (!slid) setSlid(true); setTimeout(() => setIsPlaying(true), slid ? 0 : 850); }} />
        </>
      )}

      {kind === 'vinyl' && <div className="dk-strip">
        <AnimatePresence initial={false} mode="popLayout">
          {others.map(b => (
            <motion.button
              layout
              key={b.id}
              type="button"
              aria-label={`Поставить «${b.title}»`}
              onClick={() => choose(b)}
              initial={{ opacity: 0, y: -40, scale: 0.9 }}
              animate={picked === b.id ? { opacity: 1, y: -16, scale: 1.04, rotate: -3 } : { opacity: 1, y: 0, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, y: -90, scale: 0.8, transition: { duration: 0.3 } }}
              whileTap={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              <span className="dk-sleeve" style={bg(coverOf(b))} />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>}
    </div>
  );
}
