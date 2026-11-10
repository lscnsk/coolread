// The Silero voice in the web and Telegram versions: the page's side of it. The voice itself
// runs in a worker (silero/worker.ts); this file starts it, hands it sentences and looks
// after the download.

import { VOICE_ID, VOICE_NAME, VOICE_SIZE, RUNTIME, download as fetchVoice, installed, storeSupported } from './store';
import type { Reply, Request } from './worker';

export { VOICE_ID, VOICE_NAME, VOICE_SIZE, installed };
export const supported = storeSupported;

export interface Spoken { url: string; duration: number; marks: number[]; }

// Where the site keeps the voice's runtime (see vite.config.ts)
const runtimeDir = () => new URL('./ort/', document.baseURI).href;

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, { resolve: (r: Reply) => void; reject: (e: Error) => void }>();
let idle: ReturnType<typeof setTimeout> | undefined;

function start(): Worker {
  clearTimeout(idle);
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.postMessage({ runtime: runtimeDir() } satisfies Request);
  worker.onmessage = (e: MessageEvent<Reply>) => {
    const w = waiting.get(e.data.id);
    waiting.delete(e.data.id);
    if (!w) return;
    if (e.data.error) w.reject(new Error(e.data.error));
    else w.resolve(e.data);
  };
  worker.onerror = () => close();
  return worker;
}

function ask(req: Request & { id: number }): Promise<Reply> {
  const w = start();
  return new Promise((resolve, reject) => {
    waiting.set(req.id, { resolve, reject });
    w.postMessage(req);
  });
}

/** Loads the voice ahead of the first sentence. */
export function warm(): void {
  ask({ id: nextId++, warm: true }).catch(() => {});
}

/** A sentence as sound: a WAV address for an <audio> element, and when each word starts. */
export async function speak(text: string): Promise<Spoken> {
  const r = await ask({ id: nextId++, text });
  return { url: URL.createObjectURL(new Blob([r.wav!], { type: 'audio/wav' })), duration: r.duration!, marks: r.marks! };
}

/** Sentences asked for so far are no longer wanted. */
export function cancel(): void {
  if (worker && waiting.size) worker.postMessage({ cancel: nextId - 1 } satisfies Request);
}

/** Frees the memory the voice takes (a few hundred MB). */
export function close(): void {
  clearTimeout(idle);
  worker?.terminate();
  worker = null;
  for (const w of waiting.values()) w.reject(new Error('closed'));
  waiting.clear();
}

/** Read aloud was closed: the voice is kept for a while in case it is opened again. */
export function rest(): void {
  clearTimeout(idle);
  idle = setTimeout(close, 120_000);
}

let abort: AbortController | null = null;

/** Downloads the voice; rejects with "cancelled" when stopped by cancelDownload. */
export async function download(onProgress: (part: number) => void): Promise<void> {
  abort = new AbortController();
  const signal = abort.signal;
  try {
    await fetchVoice(runtimeDir() + RUNTIME, onProgress, signal);
  } catch (e) {
    throw signal.aborted ? new Error('cancelled') : e;
  } finally {
    abort = null;
  }
}

export function cancelDownload(): void {
  abort?.abort();
}
