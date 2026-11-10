// Silero TTS v5 (Russian), voice "eugene", for the web and Telegram versions.
//
// A step-by-step port of android/.../SileroTts.java, which has the full description: the same
// model files, the same text processing, the same way of turning the spectrum into sound.
// Keep the two in step. This file knows nothing about the browser: the ONNX sessions are made
// by whoever uses it (silero/worker.ts in the app, a Node script when comparing with Java).

import { say } from './roman';
import { SYMBOLS, clean, spellOut } from './text';

export interface OrtLike {
  Tensor: new (type: any, data: any, dims: number[]) => any;
}
export interface SessionLike {
  outputNames: readonly string[];
  run(feeds: Record<string, any>): Promise<Record<string, { data: any }>>;
}
export interface SileroData {
  ngrams: string;
  exceptions: string;
  homodict: string;
  vocab: string;
  accentor: ArrayBuffer;
}
export interface SileroResult {
  audio: Float32Array;
  /** Start time in seconds of each whitespace-separated word of the input, or -1 if it is not spoken. */
  marks: number[];
}

export const SAMPLE_RATE = 48000;
const HOP = 600, NFFT = 2400, BINS = NFFT / 2 + 1, SPEAKER = 3, DIM = 128;
const VOWELS = 'аоуыэиеяёю';
const FACTORS = [5, 5, 3, 2, 2, 2, 2, 2];
const f32 = Math.fround;

// One layer of a classifier: weights row by row, then the biases
interface Layer { out: number; inn: number; w: Float32Array; b: Float32Array; }

const isLower = (c: string) => /\p{Lowercase}/u.test(c);
const isPunct = (c: string) => /[!-\/:-@\[-`{-~]|\p{P}/u.test(c);
const countVowels = (s: string) => [...s].filter(c => VOWELS.includes(c)).length;
const keepCyrillic = (s: string) => s.replace(/[^А-яёЁ]/g, '');
/** Rounds halves to the even number, as the original does. */
const rint = (x: number) => {
  const r = Math.round(x);
  return r - x === 0.5 && r % 2 !== 0 ? r - 1 : r;
};

export class Silero {
  // Accentor
  private ngrams = new Map<string, number>();
  private unkGram: number;
  private embQ: Int8Array;
  private embScale: number;
  private embZero: number;
  private embDim: number;
  private stressClf: Layer[] = [];
  private yoClf: Layer[] = [];
  private exceptions = new Map<string, [number, number]>();

  // Homographs
  private homodict = new Map<string, string[]>();
  private vocab = new Map<string, number>();
  private unkId: number;
  private clsId: number;
  private sepId: number;
  private homoStart: number;
  private homoEnd: number;

  private window = new Float64Array(NFFT);
  private cosT = new Float64Array(NFFT);
  private sinT = new Float64Array(NFFT);

  constructor(private ort: OrtLike, private front: SessionLike, private back: SessionLike, private homo: SessionLike, data: SileroData) {
    data.ngrams.split('\n').forEach((g, i) => this.ngrams.set(g, i));
    this.unkGram = this.ngrams.get('UNK')!;

    const view = new DataView(data.accentor);
    let at = 0;
    const int = () => { const v = view.getInt32(at, true); at += 4; return v; };
    const float = () => { const v = view.getFloat32(at, true); at += 4; return v; };
    const floats = (n: number) => {
      const f = new Float32Array(n);
      for (let i = 0; i < n; i++) f[i] = float();
      return f;
    };
    const rows = int();
    this.embDim = int();
    this.embScale = float();
    this.embZero = float();
    this.embQ = new Int8Array(data.accentor.slice(at, at + rows * this.embDim));
    at += rows * this.embDim;
    for (const clf of [this.stressClf, this.yoClf]) {
      for (let l = 0; l < 4; l++) {
        const out = int(), inn = int();
        clf.push({ out, inn, w: floats(out * inn), b: floats(out) });
      }
    }

    for (const line of data.exceptions.split('\n')) {
      const p = line.split(' ');
      if (p.length === 3) this.exceptions.set(p[0], [parseInt(p[1], 10), parseInt(p[2], 10)]);
    }
    for (const line of data.homodict.split('\n')) {
      const p = line.split('\t');
      if (p.length > 1) this.homodict.set(p[0], p.slice(1).sort());
    }
    data.vocab.split('\n').forEach((t, i) => this.vocab.set(t, i));
    this.unkId = this.vocab.get('[UNK]')!;
    this.clsId = this.vocab.get('[CLS]')!;
    this.sepId = this.vocab.get('[SEP]')!;
    this.homoStart = this.vocab.get('[HOMO]')!;
    this.homoEnd = this.vocab.get('[/HOMO]')!;

    for (let n = 0; n < NFFT; n++) {
      this.window[n] = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / NFFT);
      this.cosT[n] = Math.cos(2 * Math.PI * n / NFFT);
      this.sinT[n] = Math.sin(2 * Math.PI * n / NFFT);
    }
  }

  private longs(values: number[], dims: number[]) {
    return new this.ort.Tensor('int64', BigInt64Array.from(values.map(v => BigInt(v))), dims);
  }

  // ---- Homographs (HomoSolver) ----

  private async solveHomographs(sentence: string): Promise<string> {
    const re = /(?=.*[а-яё])[а-яё+]+/giu;
    const found: { start: number; end: number; word: string; logit: number }[] = [];
    for (let m = re.exec(sentence); m; m = re.exec(sentence)) {
      const word = m[0];
      if (!this.homodict.has(word.toLowerCase())) continue;
      const end = m.index + word.length;
      const ids = this.bertIds(sentence.slice(0, m.index) + ' [HOMO] ' + word + ' [/HOMO] ' + sentence.slice(end));
      const r = await this.homo.run({
        ids: this.longs(ids, [1, ids.length]),
        start: this.longs([ids.indexOf(this.homoStart)], [1]),
        end: this.longs([ids.indexOf(this.homoEnd)], [1]),
      });
      found.push({ start: m.index, end, word, logit: r[this.homo.outputNames[0]].data[0] });
    }
    let out = sentence;
    let offset = 0;
    for (const f of found) {
      const start = f.start + offset, end = f.end + offset;
      // round(sigmoid(logit)) picks the second (sorted) reading when the logit is positive
      const variants = this.homodict.get(f.word.toLowerCase())!;
      const pick = variants[Math.min(f.logit > 0 ? 1 : 0, variants.length - 1)];
      const stressIdx = pick.indexOf('+');
      const plain = pick.replace(/\+/g, '');
      let w = '';
      for (let k = 0; k < Math.min(f.word.length, plain.length); k++) {
        w += isLower(f.word[k]) ? plain[k].toLowerCase() : plain[k].toUpperCase();
      }
      // Stress goes on every word, one-vowel words too
      w = w.slice(0, stressIdx) + '+' + w.slice(stressIdx);
      offset += 1;
      out = out.slice(0, start) + w + out.slice(end);
    }
    return out;
  }

  /** BERT tokenizer of the homograph model: split on spaces and punctuation, then WordPiece. */
  private bertIds(text: string): number[] {
    const basic: string[] = [];
    for (const tok of text.split(/[ \t\n\v\f\r]+/)) {
      if (!tok) continue;
      if (tok === '[HOMO]' || tok === '[/HOMO]') { basic.push(tok); continue; }
      let cur = '';
      for (const c of tok.split('')) {
        if (isPunct(c)) {
          if (cur) { basic.push(cur); cur = ''; }
          basic.push(c);
        } else cur += c;
      }
      if (cur) basic.push(cur);
    }
    const ids = [this.clsId];
    for (const tok of basic) {
      if (tok.length > 100) { ids.push(this.unkId); continue; }
      const sub: number[] = [];
      let start = 0;
      let bad = false;
      while (start < tok.length) {
        let end = tok.length;
        let found: number | undefined;
        while (start < end) {
          found = this.vocab.get((start > 0 ? '##' : '') + tok.slice(start, end));
          if (found !== undefined) break;
          end--;
        }
        if (found === undefined) { bad = true; break; }
        sub.push(found);
        start = end;
      }
      if (bad) ids.push(this.unkId);
      else ids.push(...sub);
    }
    ids.push(this.sepId);
    return ids;
  }

  // ---- Stress and "ё" (AccentorNgram) ----

  // Single precision throughout, so borderline words come out as on Android
  private accentPredict(word: string): [Float32Array, Float32Array] {
    const w = '<' + word + '>';
    const idx: number[] = [];
    for (let n = 1; n <= word.length + 3; n++) {
      for (let i = 0; i + n <= w.length; i++) {
        const id = this.ngrams.get(w.slice(i, i + n));
        if (id !== undefined) idx.push(id);
      }
    }
    if (!idx.length) idx.push(this.unkGram);
    const e = new Float32Array(this.embDim);
    for (const id of idx) {
      const o = id * this.embDim;
      for (let k = 0; k < this.embDim; k++) e[k] = f32(e[k] + f32(this.embScale * f32(this.embQ[o + k] - this.embZero)));
    }
    for (let k = 0; k < this.embDim; k++) e[k] = f32(e[k] / idx.length);
    return [softmax(mlp(this.stressClf, e)), softmax(mlp(this.yoClf, e))];
  }

  private accentuate(sentence: string): string {
    const raw: string[] = [];
    const mask: boolean[] = [];
    // Words and the spaces between them
    for (const piece of sentence.split(/([ \t\n\v\f\r]+)/)) {
      const parts = piece.split('-');
      if (parts.length === 1) {
        raw.push(piece);
        mask.push(true);
      } else {
        for (let i = 0; i < parts.length - 1; i++) { raw.push(parts[i] + '-'); mask.push(true); }
        raw.push(parts[parts.length - 1]);
        mask.push(parts[parts.length - 1] !== 'то');
      }
    }
    let out = '';
    raw.forEach((rawWord, wi) => {
      const lower = rawWord.toLowerCase();
      const cleaned = keepCyrillic(lower);
      if (!mask[wi] || !cleaned) { out += rawWord; return; }
      const haveStress = lower.includes('+'), haveYo = lower.includes('ё');
      if (haveStress && haveYo) { out += rawWord; return; }
      if (!haveStress && haveYo) {
        let w = rawWord, ins = 0;
        for (let i = 0; i < lower.length; i++) {
          if (lower[i] === 'ё') { w = w.slice(0, i + ins) + '+' + w.slice(i + ins); ins++; }
        }
        out += w;
        return;
      }
      const exc = this.exceptions.get(cleaned);
      if (exc) { out += exception(rawWord, exc, haveStress); return; }

      const [pStress, pYo] = this.accentPredict(cleaned);
      const stressPred = argmax(pStress), yoPred = argmax(pYo);
      let setStress = pStress[stressPred] > 0.5 && !haveStress;
      const setYo = pYo[yoPred] > 0.5;
      const stressIds = haveStress ? lower.split('+').map(countVowels) : [stressPred];

      const vowelIds: number[] = [], yeIds: number[] = [];
      for (let i = 0; i < lower.length; i++) {
        if (VOWELS.includes(lower[i])) vowelIds.push(i);
        if (lower[i] === 'е') yeIds.push(i);
      }
      if (!vowelIds.length) { out += rawWord; return; }
      let stressPos = stressIds.filter(id => id < vowelIds.length).map(id => vowelIds[id]);
      const yoPos = yoPred > 0 && yoPred - 1 < yeIds.length ? [yeIds[yoPred - 1]] : [];
      let word = rawWord;
      for (const pos of yoPos) {
        if (stressPos.includes(pos) && setYo && lower[pos] === 'е') {
          word = word.slice(0, pos) + (isLower(word[pos]) ? 'ё' : 'Ё') + word.slice(pos + 1);
        }
      }
      if (vowelIds.length === 1) {
        stressPos = [vowelIds[0]];
        setStress = true;
      }
      if (!haveStress && setStress) {
        stressPos.forEach((p, i) => { word = word.slice(0, p + i) + '+' + word.slice(p + i); });
      }
      out += word;
    });
    return out;
  }

  /** The text exactly as the model reads it: stress marks and "ё" in place. */
  async prepare(sentence: string): Promise<string> {
    return this.accentuate(await this.solveHomographs(sentence));
  }

  // ---- Speech ----

  async synthesize(text: string): Promise<SileroResult> {
    const tokens = text.split(/[ \t\n\v\f\r]+/).filter(Boolean);
    const tokenWord: number[] = [];
    const said: string[] = [];
    let words = 0;
    tokens.forEach((_, i) => {
      const c = clean(spellOut(say(tokens, i)));
      if (!c) { tokenWord.push(-1); return; }
      tokenWord.push(words);
      words += c.split(' ').length;
      said.push(c);
    });
    let sentence = said.join(' ');
    const marks: number[] = tokens.map(() => -1);
    if (!/[а-я-]/.test(sentence)) return { audio: new Float32Array(SAMPLE_RATE / 4), marks };

    if (sentence.length > 1200) sentence = sentence.slice(0, 1200);
    const prepared = await this.prepare(sentence);
    const seqText = '|' + prepared + '~';
    const T = seqText.length;
    const seq = [...seqText].map(c => Math.max(0, SYMBOLS.indexOf(c)));

    const r1 = await this.front.run({ seq: this.longs(seq, [1, T]), spk: this.longs([SPEAKER], [1]) });
    const logDur = r1[this.front.outputNames[0]].data as Float32Array;
    const enc = r1[this.front.outputNames[1]].data as Float32Array;

    // Durations in frames, with the same limits as the original model
    const dur = new Int32Array(T);
    for (let i = 0; i < T; i++) dur[i] = rint(Math.max(0, f32(f32(Math.exp(logDur[i])) - 1)));
    dur[0] = Math.min(dur[0], 5);
    dur[T - 1] = Math.min(dur[T - 1], 7);
    dur[T - 2] = 13;
    dur[T - 3] = Math.min(dur[T - 3], 13);
    let frames = 0;
    for (let i = 0; i < T; i++) frames += dur[i];
    frames = Math.min(frames, 4990);

    // Word starts: where each word's first character begins
    const cum = new Int32Array(T + 1);
    for (let i = 0; i < T; i++) cum[i + 1] = cum[i] + dur[i];
    const wordStart = [cum[1]];
    for (let i = 0; i < prepared.length; i++) if (prepared[i] === ' ') wordStart.push(cum[i + 2]);
    tokens.forEach((_, i) => {
      const w = tokenWord[i];
      if (w >= 0 && w < wordStart.length) marks[i] = wordStart[w] * HOP / SAMPLE_RATE;
    });

    const x = new Float32Array(frames * DIM);
    let f = 0;
    for (let i = 0; i < T && f < frames; i++) {
      const row = enc.subarray(i * DIM, (i + 1) * DIM);
      for (let k = 0; k < dur[i] && f < frames; k++, f++) x.set(row, f * DIM);
    }
    const r2 = await this.back.run({ x: new this.ort.Tensor('float32', x, [1, frames, DIM]) });
    const re = r2[this.back.outputNames[0]].data as Float32Array;
    const im = r2[this.back.outputNames[1]].data as Float32Array;
    return { audio: this.istft(re, im, frames), marks };
  }

  // ---- Spectrum to sound ----

  /** Inverse STFT ("same" padding): re/im are [BINS][frames], row-major. */
  private istft(re: Float32Array, im: Float32Array, frames: number): Float32Array {
    const len = (frames - 1) * HOP + NFFT, pad = (NFFT - HOP) / 2;
    const y = new Float64Array(len), envl = new Float64Array(len);
    const zr = new Float64Array(NFFT), zi = new Float64Array(NFFT), or = new Float64Array(NFFT), oi = new Float64Array(NFFT);
    const window = this.window;
    // Two real frames per complex transform: ifft(A + iB) = a + ib
    for (let t = 0; t < frames; t += 2) {
      const two = t + 1 < frames;
      zr.fill(0);
      zi.fill(0);
      for (let k = 0; k < BINS; k++) {
        const edge = k === 0 || k === NFFT / 2;
        const ar = re[k * frames + t], ai = edge ? 0 : im[k * frames + t];
        const br = two ? re[k * frames + t + 1] : 0, bi = two && !edge ? im[k * frames + t + 1] : 0;
        // Hermitian completion of each spectrum, then Z = A + iB
        zr[k] += ar - bi;
        zi[k] += ai + br;
        if (!edge) {
          const j = NFFT - k;
          zr[j] += ar + bi;
          zi[j] += -ai + br;
        }
      }
      this.fftRec(zr, zi, 0, 1, or, oi, 0, NFFT, 0);
      for (let n = 0; n < NFFT; n++) {
        const w = window[n];
        y[t * HOP + n] += or[n] / NFFT * w;
        envl[t * HOP + n] += w * w;
        if (two) {
          y[(t + 1) * HOP + n] += oi[n] / NFFT * w;
          envl[(t + 1) * HOP + n] += w * w;
        }
      }
    }
    const out = new Float32Array(len - 2 * pad);
    for (let i = 0; i < out.length; i++) {
      const e = envl[i + pad];
      out[i] = e > 1e-11 ? y[i + pad] / e : 0;
    }
    return out;
  }

  private tr = new Float64Array(5);
  private ti = new Float64Array(5);

  /** Inverse DFT of length 2400 (mixed radix 5·5·3·2⁵), unscaled. */
  private fftRec(inR: Float64Array, inI: Float64Array, inOff: number, stride: number, outR: Float64Array, outI: Float64Array, outOff: number, n: number, fi: number) {
    if (n === 1) {
      outR[outOff] = inR[inOff];
      outI[outOff] = inI[inOff];
      return;
    }
    const p = FACTORS[fi], m = n / p;
    for (let q = 0; q < p; q++) this.fftRec(inR, inI, inOff + q * stride, stride * p, outR, outI, outOff + q * m, m, fi + 1);
    const step = NFFT / n;
    const { tr, ti, cosT, sinT } = this;
    for (let k = 0; k < m; k++) {
      for (let q = 0; q < p; q++) {
        // Twiddle W_n^(q·k), inverse direction (+)
        const e = (q * k * step) % NFFT;
        const c = cosT[e], s = sinT[e];
        const xr = outR[outOff + q * m + k], xi = outI[outOff + q * m + k];
        tr[q] = xr * c - xi * s;
        ti[q] = xr * s + xi * c;
      }
      for (let s2 = 0; s2 < p; s2++) {
        let sr = 0, si = 0;
        for (let q = 0; q < p; q++) {
          const e = (q * s2 * m * step) % NFFT;
          const c = cosT[e], s = sinT[e];
          sr += tr[q] * c - ti[q] * s;
          si += tr[q] * s + ti[q] * c;
        }
        outR[outOff + k + s2 * m] = sr;
        outI[outOff + k + s2 * m] = si;
      }
    }
  }
}

function mlp(layers: Layer[], x: Float32Array): Float32Array {
  layers.forEach((L, l) => {
    const y = new Float32Array(L.out);
    for (let o = 0; o < L.out; o++) {
      let s = L.b[o];
      const row = o * L.inn;
      for (let i = 0; i < L.inn; i++) s = f32(s + f32(L.w[row + i] * x[i]));
      y[o] = l < layers.length - 1 ? Math.max(0, s) : s;
    }
    x = y;
  });
  return x;
}

function softmax(x: Float32Array): Float32Array {
  let m = -Infinity;
  for (const v of x) m = Math.max(m, v);
  let s = 0;
  const r = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) { r[i] = Math.exp(f32(x[i] - m)); s += r[i]; }
  for (let i = 0; i < x.length; i++) r[i] = r[i] / s;
  return r;
}

function argmax(x: Float32Array): number {
  let b = 0;
  for (let i = 1; i < x.length; i++) if (x[i] > x[b]) b = i;
  return b;
}

function exception(rawWord: string, exc: [number, number], haveStress: boolean): string {
  const [stress, yo] = exc;
  const withYo = (w: string) => (yo !== -1 && yo < w.length ? w.slice(0, yo) + (isLower(w[yo]) ? 'ё' : 'Ё') + w.slice(yo + 1) : w);
  if (haveStress) {
    const marks: number[] = [];
    for (let i = 0; i < rawWord.length; i++) if (rawWord[i] === '+') marks.push(i);
    let w = rawWord.replace(/\+/g, '');
    if (marks.includes(yo + 1)) w = withYo(w);
    for (const pos of marks) w = w.slice(0, Math.min(pos, w.length)) + '+' + w.slice(Math.min(pos, w.length));
    return w;
  }
  const w = withYo(rawWord);
  const s = Math.min(stress, w.length);
  return w.slice(0, s) + '+' + w.slice(s);
}
