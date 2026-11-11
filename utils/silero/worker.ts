// Runs the Silero voice off the main thread, so the page stays smooth while a sentence is
// being made. Loads the voice from the browser's storage (silero/store.ts) on the first request.

import * as ort from 'onnxruntime-web/wasm';
import { SAMPLE_RATE, Silero } from './engine';
import { RUNTIME, read } from './store';

export type Request = { id: number; text: string } | { id: number; warm: true } | { cancel: number } | { runtime: string };
export type Reply = { id: number; wav?: ArrayBuffer; duration?: number; marks?: number[]; error?: string };

let engine: Promise<Silero> | null = null;

async function load(): Promise<Silero> {
  // One thread: more need a specially set up site, which Telegram and GitHub Pages are not
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmBinary = await read(RUNTIME);
  // The small script that starts it is taken from the site
  ort.env.wasm.wasmPaths = { mjs: runtime + RUNTIME.replace('.wasm', '.mjs') };
  const session = async (name: string) =>
    ort.InferenceSession.create(new Uint8Array(await read(name)), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const text = async (name: string) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(await read(name));
  // One at a time: the files are big, and a phone has little memory to spare
  const front = await session('front.onnx');
  const back = await session('back.onnx');
  const homo = await session('homo.onnx');
  return new Silero(ort as any, front as any, back as any, homo as any, {
    ngrams: await text('ngrams.txt'),
    exceptions: await text('exceptions.txt'),
    homodict: await text('homodict.txt'),
    vocab: await text('vocab.txt'),
    accentor: await read('accentor.bin'),
  });
}

function wav(audio: Float32Array): ArrayBuffer {
  const n = audio.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, SAMPLE_RATE, true); v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  const pcm = new Int16Array(buf, 44, n);
  for (let i = 0; i < n; i++) pcm[i] = Math.max(-32767, Math.min(32767, Math.round(audio[i] * 32767)));
  return buf;
}

// Sentences are made one after another, in the order they were asked for
let queue: Promise<unknown> = Promise.resolve();
// Requests up to this one are no longer wanted (the reader skipped or stopped)
let cancelled = -1;
// Where the site keeps the runtime's files: the page says so first of all
let runtime = '';

self.onmessage = (e: MessageEvent<Request>) => {
  const req = e.data;
  if ('runtime' in req) {
    runtime = req.runtime;
    return;
  }
  if ('cancel' in req) {
    cancelled = req.cancel;
    return;
  }
  queue = queue.then(async () => {
    let reply: Reply;
    try {
      // Lets a "cancel" that arrived meanwhile be seen
      await new Promise(r => setTimeout(r));
      if (req.id <= cancelled) throw new Error('cancelled');
      if (!engine) {
        engine = load();
        engine.catch(() => { engine = null; });
      }
      const tts = await engine;
      if ('warm' in req) reply = { id: req.id };
      else {
        const r = await tts.synthesize(req.text);
        reply = { id: req.id, wav: wav(r.audio), duration: r.audio.length / SAMPLE_RATE, marks: r.marks };
      }
    } catch (err: any) {
      reply = { id: req.id, error: String(err?.message || err) };
    }
    (self as any).postMessage(reply, reply.wav ? [reply.wav] : []);
  });
};
