import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { useSyncExternalStore } from 'react';
import type { NowPlayingInfo } from './nowPlaying';

// Reading aloud with the built-in offline voice (android/.../ReadAloudPlugin.java).
// The text is split into sentences and handed to the native side, which reads them by
// itself, so it goes on with the screen off, and asks for the next chapter when it gets
// there. It reports the word being said, which is highlighted when the reader is on screen.
// In the web preview a silent <audio> element stands in for the voice.

export interface Voice {
  id: string;
  name: string;
  lang: string;
  builtIn: boolean;
}

interface ReadAloudPlugin {
  listVoices(): Promise<{ voices: Voice[] }>;
  prepare(o: { voice: string }): Promise<void>;
  speak(o: { voice: string; chapter: number; sentences: string[]; start: number; last: boolean; speed: number; title: string; info: NowPlayingInfo }): Promise<void>;
  append(o: { chapter: number; sentences: string[]; last: boolean; title: string }): Promise<void>;
  pauseSpeech(): Promise<void>;
  resumeSpeech(): Promise<{ resumed: boolean }>;
  skipSpeech(o: { delta: number }): Promise<void>;
  setSpeechSpeed(o: { speed: number }): Promise<void>;
  stopSpeech(): Promise<void>;
  addListener(event: 'speech', cb: (e: { state?: string; chapter?: number; index?: number; word?: number }) => void): Promise<unknown>;
  addListener(event: 'need', cb: (e: { chapter: number }) => void): Promise<unknown>;
}

const Native = registerPlugin<ReadAloudPlugin>('ReadAloud');
const isNative = Capacitor.isNativePlatform();

/** What the reader lets the voice do: find the text and keep the spoken word on screen. */
export interface ReaderNav {
  root: () => HTMLElement | null;
  /** Visible area of the text. */
  viewport: () => DOMRect | null;
  /** Brings a word on screen (scrolls or turns the page). */
  reveal: (rect: DOMRect) => void;
  /** Opens the next chapter; false at the end of the book. */
  nextChapter: () => boolean;
  /** Chapter on screen, number of chapters, and a chapter's text as HTML ('' if it has none). */
  chapter: () => number;
  chapterCount: () => number;
  chapterHtml: (i: number) => string;
  chapterTitle: (i: number) => string;
  /** Opens a chapter at its start. */
  openChapter: (i: number) => void;
  /** Book title, cover and colour for the player notification. */
  info: () => Promise<NowPlayingInfo>;
}

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4];

interface State {
  open: boolean;
  playing: boolean;
  loading: boolean;
  speed: number;
  voice: string | null;
  voices: Voice[];
  error: string | null;
}

let state: State = { open: false, playing: false, loading: false, speed: 1, voice: null, voices: [], error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useReadAloud = () => useSyncExternalStore(subscribe, () => state);

// ---- Settings ----

const KEY = 'cool_read_voice';

async function loadPrefs() {
  try {
    const raw = isNative ? (await Preferences.get({ key: KEY })).value : localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      set({ speed: typeof p.speed === 'number' ? p.speed : 1, voice: p.voice || null });
    }
  } catch {}
}

function savePrefs() {
  const raw = JSON.stringify({ speed: state.speed, voice: state.voice });
  try {
    if (isNative) Preferences.set({ key: KEY, value: raw });
    else localStorage.setItem(KEY, raw);
  } catch {}
}

let prefsLoaded: Promise<void> | null = null;

export async function refreshVoices(): Promise<Voice[]> {
  if (!prefsLoaded) prefsLoaded = loadPrefs();
  await prefsLoaded;
  let voices: Voice[] = [];
  try {
    voices = isNative ? (await Native.listVoices()).voices : [{ id: 'web', name: 'silent (web preview)', lang: '', builtIn: true }];
  } catch {}
  const voice = voices.some(v => v.id === state.voice) ? state.voice : (voices.find(v => v.builtIn) || voices[0])?.id || null;
  set({ voices, voice });
  return voices;
}

export function setVoice(id: string) {
  const wasPlaying = state.playing;
  stopAudio();
  set({ voice: id, error: null });
  savePrefs();
  if (wasPlaying) play();
}

export function setSpeed(speed: number) {
  set({ speed });
  if (isNative) Native.setSpeechSpeed({ speed }).catch(() => {});
  else audio.playbackRate = speed;
  savePrefs();
}

// ---- Text on screen ----

interface Piece { node: Text; start: number; }
// tok: which space-separated word of `text` the word belongs to (voices that report word times use it)
interface Sentence { start: number; end: number; block: number; text: string; words: { start: number; end: number; weight: number; tok: number }[]; }

let nav: ReaderNav | null = null;
let full = '';
let pieces: Piece[] = [];
let sentences: Sentence[] = [];
let builtFor: HTMLElement | null = null;
let builtText = '';

const BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,div,td,th,dd,dt,pre,section,article,figcaption';
const SKIP = 'script,style,sup,rt,rp,.footnote-ref,[aria-hidden="true"]';
// Soft hyphens from the layout may sit inside a word
const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’\-́\u00AD]*/gu;

function collect(root: HTMLElement) {
  extract(root);
  builtFor = root;
  builtText = root.textContent || '';
}

/** Splits the text under root into sentences (fills full, pieces and sentences). */
function extract(root: HTMLElement) {
  full = '';
  pieces = [];
  sentences = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => ((n.parentElement?.closest(SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let block: Element | null = null;
  const blockBounds: number[] = [0];
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const b = n.parentElement?.closest(BLOCKS) || root;
    if (b !== block && full.length > 0) {
      full += '\n';
      blockBounds.push(full.length);
    }
    block = b;
    pieces.push({ node: n, start: full.length });
    full += n.data;
  }
  blockBounds.push(full.length);

  for (let b = 0; b < blockBounds.length - 1; b++) {
    currentBlock = b;
    splitSentences(blockBounds[b], blockBounds[b + 1]);
  }
}

/** Sentences of a chapter that is not on screen, from its HTML. */
function sentencesOf(html: string): string[] {
  if (!html) return [];
  const saved = { full, pieces, sentences };
  try {
    extract(new DOMParser().parseFromString(html, 'text/html').body);
    return sentences.map(s => s.text);
  } catch {
    return [];
  } finally {
    ({ full, pieces, sentences } = saved);
  }
}

const MAX = 280;
let currentBlock = 0;

function splitSentences(from: number, to: number) {
  const text = full.slice(from, to);
  const ends = /[.!?…]+[»"”'’)\]]*(?=\s|$)|\n/g;
  let last = 0;
  const push = (s: number, e: number) => {
    // Very long sentences are cut at commas or spaces so synthesis starts quickly
    while (e - s > MAX) {
      const chunk = text.slice(s, s + MAX);
      let cut = Math.max(chunk.lastIndexOf(', '), chunk.lastIndexOf('; '), chunk.lastIndexOf(' — '), chunk.lastIndexOf(': '));
      if (cut < MAX / 3) cut = chunk.lastIndexOf(' ');
      if (cut < MAX / 3) cut = MAX - 1;
      add(from + s, from + s + cut + 1);
      s += cut + 1;
    }
    add(from + s, from + e);
  };
  for (let m = ends.exec(text); m; m = ends.exec(text)) {
    const e = m.index + m[0].length;
    if (e > last) push(last, e);
    last = e;
  }
  if (last < text.length) push(last, text.length);
}

function add(start: number, end: number) {
  // Soft hyphens from the layout are not spoken
  const text = full.slice(start, end).replace(/\u00AD/g, '').replace(/\s+/g, ' ').trim();
  const words: Sentence['words'] = [];
  const src = full.slice(start, end);
  WORD.lastIndex = 0;
  for (let m = WORD.exec(src); m; m = WORD.exec(src)) {
    const after = src.slice(m.index + m[0].length, m.index + m[0].length + 2);
    // Longer words take longer to say; punctuation adds a pause
    const weight = m[0].length + 1.5 + (/^[,;:—–-]/.test(after.trim()) ? 4 : 0);
    const before = src.slice(0, m.index).replace(/^\s+/, '');
    const tok = before ? before.split(/\s+/).length - 1 : 0;
    words.push({ start: start + m.index, end: start + m.index + m[0].length, weight, tok });
  }
  if (words.length) sentences.push({ start, end, block: currentBlock, text, words });
}

function pieceAt(pos: number): Piece {
  let lo = 0, hi = pieces.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pieces[mid].start <= pos) lo = mid; else hi = mid - 1;
  }
  return pieces[lo];
}

/** Text nodes again, after layout code split some of them (the text itself is unchanged). */
function refreshPieces() {
  const root = builtFor;
  if (!root) return;
  const fresh: Piece[] = [];
  let pos = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => ((n.parentElement?.closest(SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let block: Element | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const b = n.parentElement?.closest(BLOCKS) || root;
    if (b !== block && pos > 0) pos += 1;
    block = b;
    fresh.push({ node: n, start: pos });
    pos += n.data.length;
  }
  pieces = fresh;
}

function pieceValid(p: Piece, pos: number) {
  return p.node.isConnected && pos - p.start <= p.node.length;
}

function rangeOf(start: number, end: number): Range | null {
  try {
    let a = pieceAt(start), b = pieceAt(Math.max(start, end - 1));
    if (!pieceValid(a, start) || !pieceValid(b, end)) {
      refreshPieces();
      a = pieceAt(start);
      b = pieceAt(Math.max(start, end - 1));
    }
    const r = document.createRange();
    r.setStart(a.node, Math.min(a.node.length, start - a.start));
    r.setEnd(b.node, Math.min(b.node.length, end - b.start));
    return r;
  } catch {
    return null;
  }
}

/** Start of the first paragraph that is on screen, even if it begins above it. */
function firstVisible(): number {
  const view = nav?.viewport();
  if (!view) return 0;
  for (let i = 0; i < sentences.length; i++) {
    const w = sentences[i].words;
    const r = rangeOf(w[w.length - 1].start, w[w.length - 1].end)?.getBoundingClientRect();
    if (r && r.height > 0 && r.bottom > view.top + 4 && r.top < view.bottom) {
      let k = i;
      while (k > 0 && sentences[k - 1].block === sentences[i].block) k--;
      return k;
    }
  }
  return 0;
}

function isOnScreen(i: number): boolean {
  const view = nav?.viewport();
  const s = sentences[i];
  if (!view || !s) return false;
  const r = rangeOf(s.words[0].start, s.words[0].end)?.getBoundingClientRect();
  return !!r && r.height > 0 && r.bottom > view.top && r.top < view.bottom;
}

// ---- Highlight ----

const HL = 'tts-word';
const supportsHighlight = typeof CSS !== 'undefined' && 'highlights' in CSS;

function highlight(range: Range | null) {
  if (!supportsHighlight) return;
  const reg = (CSS as any).highlights;
  if (!range) reg.delete(HL);
  else reg.set(HL, new (window as any).Highlight(range));
}

// ---- Playback ----

const audio = typeof Audio !== 'undefined' ? new Audio() : ({} as HTMLAudioElement);
(audio as any).preservesPitch = true;

let current = -1;
let epoch = 0;
const cache = new Map<number, Promise<{ url: string; path: string; duration: number; marks?: number[] }>>();
let marks: number[] | undefined;
let lastWord = -1;
let raf = 0;
const AHEAD = 4;

function silentWav(seconds: number): string {
  // Web preview only: a silent file as long as the sentence would take to say
  const rate = 8000, n = Math.max(1, Math.round(seconds * rate));
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function synth(i: number) {
  let p = cache.get(i);
  if (!p) {
    const s = sentences[i];
    p = new Promise(res => {
      // Web preview: silence, with evenly spaced word times
      const d = s.text.length * 0.06, n = s.text.split(' ').length;
      setTimeout(() => res({ url: silentWav(d), path: '', duration: d, marks: s.text.split(' ').map((_, j) => (j * d) / n) }), 150);
    });
    cache.set(i, p);
  }
  return p;
}

/** Highlights word k of sentence i and keeps it on screen. */
function showWord(i: number, k: number) {
  const s = sentences[i];
  if (!s) return;
  k = Math.max(0, Math.min(s.words.length - 1, k));
  const r = rangeOf(s.words[k].start, s.words[k].end);
  highlight(r);
  const rect = r?.getBoundingClientRect();
  const view = nav?.viewport();
  if (rect && view && rect.height > 0 && (rect.bottom > view.bottom - 8 || rect.top < view.top)) nav?.reveal(rect);
}

function prefetch(i: number) {
  for (let k = i; k < Math.min(sentences.length, i + AHEAD); k++) synth(k).catch(() => {});
}

function tick() {
  raf = 0;
  if (!state.playing) return;
  const s = sentences[current];
  if (s && audio.duration > 0) {
    let k = 0;
    if (marks) {
      // The voice told us when each word starts
      for (let j = 0; j < s.words.length; j++) {
        const m = marks[s.words[j].tok];
        if (m !== undefined && m >= 0 && m <= audio.currentTime + 0.03) k = j;
      }
    } else {
      // Piper leaves a short silence at both ends of a sentence
      const lead = Math.min(0.12, audio.duration * 0.04);
      const t = Math.max(0, (audio.currentTime - lead) / Math.max(0.1, audio.duration - 2 * lead));
      const total = s.words.reduce((a, w) => a + w.weight, 0);
      let acc = 0;
      for (; k < s.words.length - 1; k++) {
        acc += s.words[k].weight;
        if (acc / total > t) break;
      }
    }
    if (k !== lastWord) {
      lastWord = k;
      showWord(current, k);
    }
  }
  raf = requestAnimationFrame(tick);
}

async function playSentence(i: number) {
  const myEpoch = epoch;
  current = i;
  lastWord = -1;
  prefetch(i);
  set({ loading: true });
  let item;
  try {
    item = await synth(i);
  } catch (e: any) {
    if (myEpoch !== epoch) return;
    set({ playing: false, loading: false, error: 'Voice error' });
    return;
  }
  if (myEpoch !== epoch) return;
  set({ loading: false });
  marks = item.marks;
  audio.src = item.url;
  audio.playbackRate = state.speed;
  (audio as any).preservesPitch = true;
  try {
    await audio.play();
  } catch {
    if (myEpoch === epoch) set({ playing: false });
    return;
  }
  if (!raf) raf = requestAnimationFrame(tick);
}

audio.onended = () => {
  if (!state.playing) return;
  if (current + 1 < sentences.length) {
    playSentence(current + 1);
    return;
  }
  // End of the chapter: open the next one and carry on from its start
  highlight(null);
  const myEpoch = ++epoch;
  cache.clear();
  if (!nav?.nextChapter()) {
    stop();
    return;
  }
  set({ loading: true });
  const oldRoot = builtFor, oldText = builtText;
  let tries = 0;
  const wait = () => {
    if (myEpoch !== epoch) return;
    const root = nav?.root();
    if (root && (root !== oldRoot || (root.textContent || '') !== oldText) && (root.textContent || '').trim()) {
      setTimeout(() => {
        if (myEpoch !== epoch) return;
        collect(nav!.root()!);
        if (sentences.length) playSentence(0);
        else audio.onended?.(new Event('ended'));
      }, 300);
    } else if (tries++ < 50) setTimeout(wait, 200);
    else stop();
  };
  setTimeout(wait, 200);
};

// ---- Native reading ----

// What the voice is saying: chapter, sentence in it, word (space-separated) in the sentence
let spoken = { chapter: -1, index: -1, word: -1 };
let speaking = false;
// The chapter the reader was last taken to by the voice; if the reader shows another one,
// the user went there and is left alone
let followed = -1;
let syncing = false;
// Sentences handed to the voice, per chapter
const handed = new Map<number, string[]>();

const norm = (t: string) => t.replace(/[\s\u00AD]+/g, '');

/** Sentence on screen that the voice's sentence `index` of the chapter on screen is. */
function mapIndex(chapter: number, index: number): number {
  const list = handed.get(chapter);
  if (!list || !list[index]) return index;
  const want = norm(list[index]);
  for (let d = 0; d < 40; d++) {
    for (const j of [index + d, index - d]) if (sentences[j] && norm(sentences[j].text) === want) return j;
  }
  return index;
}

function waitForChapter(chapter: number, oldRoot: HTMLElement | null, oldText: string, done: () => void) {
  let tries = 0;
  const check = () => {
    const root = nav?.root();
    const text = root?.textContent || '';
    if (root && nav!.chapter() === chapter && (root !== oldRoot || text !== oldText) && text.trim()) setTimeout(done, 300);
    else if (tries++ < 60) setTimeout(check, 150);
    else done();
  };
  setTimeout(check, 150);
}

/** Highlights what the voice is saying, when the reader is on screen. */
function showSpoken() {
  if (!nav || document.hidden || syncing || !speaking || spoken.index < 0) return;
  if (spoken.chapter !== nav.chapter()) {
    if (spoken.chapter === followed) return; // the user is reading elsewhere
    // The voice went on to the next chapter: take the reader there
    followed = spoken.chapter;
    syncing = true;
    highlight(null);
    const root = nav.root();
    nav.openChapter(spoken.chapter);
    waitForChapter(spoken.chapter, root, root?.textContent || '', () => {
      syncing = false;
      showSpoken();
    });
    return;
  }
  const root = nav.root();
  if (!root) return;
  if (builtFor !== root || builtText !== (root.textContent || '')) collect(root);
  const i = mapIndex(spoken.chapter, spoken.index);
  const s = sentences[i];
  if (!s) return;
  current = i;
  const k = s.words.findIndex(w => w.tok >= spoken.word);
  showWord(i, k < 0 ? s.words.length - 1 : k);
}

async function handNext(chapter: number) {
  if (!nav || !speaking) return;
  const count = nav.chapterCount();
  for (let k = chapter + 1; k < count; k++) {
    const list = sentencesOf(nav.chapterHtml(k));
    if (list.length) {
      handed.set(k, list);
      await Native.append({ chapter: k, sentences: list, last: false, title: nav.chapterTitle(k) });
      return;
    }
  }
  await Native.append({ chapter: chapter + 1, sentences: [], last: true, title: '' });
}

if (isNative) {
  Native.addListener('speech', e => {
    if (e.state) {
      if (e.state === 'playing') set({ playing: true, loading: false });
      else if (e.state === 'loading') set({ playing: true, loading: true });
      else if (e.state === 'paused') set({ playing: false, loading: false });
      else {
        // ended (end of the book) or stopped from the notification
        speaking = false;
        highlight(null);
        set({ playing: false, loading: false });
      }
      return;
    }
    spoken = { chapter: e.chapter ?? -1, index: e.index ?? -1, word: e.word ?? -1 };
    showSpoken();
  });
  Native.addListener('need', e => {
    handNext(e.chapter).catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) showSpoken();
  });
}

async function playNative(root: HTMLElement) {
  set({ playing: true, error: null });
  const sameText = builtFor === root && builtText === (root.textContent || '');
  if (speaking && spoken.chapter === nav!.chapter() && sameText && current >= 0 && isOnScreen(current)) {
    // Resume where it paused
    try {
      if ((await Native.resumeSpeech()).resumed) return;
    } catch {}
  }
  if (!sameText) collect(root);
  if (!sentences.length) {
    set({ playing: false });
    return;
  }
  const chapter = nav!.chapter();
  const list = sentences.map(s => s.text);
  const start = firstVisible();
  handed.clear();
  handed.set(chapter, list);
  speaking = true;
  followed = chapter;
  spoken = { chapter, index: -1, word: -1 };
  current = start;
  set({ loading: true });
  const info = await nav!.info().catch(() => ({ title: '', subtitle: '' }));
  try {
    await Native.speak({
      voice: state.voice || '', chapter, sentences: list, start, last: false, speed: state.speed,
      title: nav!.chapterTitle(chapter), info: { ...info, title: nav!.chapterTitle(chapter) || info.title },
    });
  } catch {
    speaking = false;
    set({ playing: false, loading: false, error: 'Voice error' });
  }
}

/** Starts reading from the first sentence on screen, or resumes a pause. */
export async function play() {
  const root = nav?.root();
  if (!root || !state.voice) {
    set({ error: state.voice ? null : 'No voice' });
    return;
  }
  if (isNative) return playNative(root);
  set({ playing: true, error: null });
  const sameText = builtFor === root && builtText === (root.textContent || '');
  if (sameText && current >= 0 && audio.src && audio.paused && isOnScreen(current)) {
    audio.playbackRate = state.speed;
    audio.play().catch(() => set({ playing: false }));
    if (!raf) raf = requestAnimationFrame(tick);
    return;
  }
  epoch++;
  cache.clear();
  if (!sameText) collect(root);
  if (!sentences.length) {
    set({ playing: false });
    return;
  }
  playSentence(firstVisible());
}

export function pause() {
  set({ playing: false, loading: false });
  if (isNative) Native.pauseSpeech().catch(() => {});
  else audio.pause?.();
}

/** Skips a sentence forward or back. */
export function skip(delta: number) {
  if (isNative) {
    if (speaking) Native.skipSpeech({ delta }).catch(() => {});
    return;
  }
  if (current < 0 || !sentences.length) return;
  const next = Math.max(0, Math.min(sentences.length - 1, current + delta));
  if (!state.playing) {
    current = next;
    highlight(rangeOf(sentences[next].words[0].start, sentences[next].words[0].end));
    audio.removeAttribute?.('src');
    return;
  }
  epoch++;
  cache.clear();
  audio.pause();
  playSentence(next);
}

function stopAudio() {
  epoch++;
  cache.clear();
  audio.pause?.();
  audio.removeAttribute?.('src');
  current = -1;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  highlight(null);
  if (isNative) {
    speaking = false;
    handed.clear();
    spoken = { chapter: -1, index: -1, word: -1 };
    Native.stopSpeech().catch(() => {});
  }
}

export function stop() {
  stopAudio();
  builtFor = null;
  set({ playing: false, loading: false });
}

export function setOpen(open: boolean) {
  if (!open) stop();
  else {
    refreshVoices().then(() => {
      if (isNative && state.voice) Native.prepare({ voice: state.voice }).catch(() => {});
    });
  }
  set({ open, error: null });
}

export function registerReader(n: ReaderNav | null) {
  nav = n;
  if (!n) {
    stop();
    set({ open: false });
  }
}
