// Where the Silero voice lives in the web and Telegram versions. As on Android it is not part
// of the app: it is downloaded once, from the same address, and kept in the browser's storage
// (Cache Storage). The ONNX runtime the voice runs on (a WebAssembly file of the site itself)
// is kept with it, so the voice also works offline.

export const VOICE_ID = 'silero-eugene';
export const VOICE_NAME = 'Eugene';

// The same files, sizes and checksums as android/.../VoiceStore.java
const BASE = 'https://raw.githubusercontent.com/lscnsk/coolread/3df975934cb512de29b55a925893e466c1ee3e34/android/app/src/main/assets/voices/silero-eugene/';
const PARTS: { name: string; size: number; sha256: string }[] = [
  { name: 'front.onnx', size: 14809783, sha256: 'c460886f350d70425fbf5a7ace4469b02843c5c29affca4c9ca06f9b78ae2a36' },
  { name: 'back.onnx', size: 35038415, sha256: '9ad20ede1d0449dd82e13dcaae7cbf3c37068f700096d2b3291fb3945ac50308' },
  { name: 'homo.onnx', size: 32402793, sha256: 'f1b8ae6ec4aaf0a27966fb8fbaa873fdc01eb4589b1a5a40b33e73ba874fa6ea' },
  { name: 'accentor.bin', size: 2170180, sha256: '874a241509b112d0e88efccfbba327203150c86fa35829598e9a388846774be3' },
  { name: 'exceptions.txt', size: 444305, sha256: 'fae88ef2ffc2cb22494b94367d4f5d92f4972944694f2f9f2900fadcd2c0fc22' },
  { name: 'homodict.txt', size: 85927, sha256: '1cce43a685413d00dde123e1e2fbc9582833e27d419303a4fac62cb8b2710cb5' },
  { name: 'ngrams.txt', size: 1087501, sha256: 'dc298d0c05a79d4f7d6f013e5093e23d26d154b82409ce274a080c1d448f702b' },
  { name: 'vocab.txt', size: 1080681, sha256: '851c34d3ef9ced9b227ff748198b95a34d5197091450c6f075741a6fb643ba3a' },
];
// The runtime: built into the site next to the app (see vite.config.ts)
export const RUNTIME = 'ort-wasm-simd-threaded.wasm';
const RUNTIME_SIZE = 11_200_000;

export const VOICE_SIZE = PARTS.reduce((a, p) => a + p.size, 0) + RUNTIME_SIZE;

// Not "coolread-…": the web app's service worker clears those when the app is updated
const CACHE = 'voice-' + VOICE_ID;
const key = (name: string) => `/__voice/${VOICE_ID}/${name}`;
const NAMES = [...PARTS.map(p => p.name), RUNTIME];

export const storeSupported = typeof caches !== 'undefined' && typeof WebAssembly !== 'undefined' && typeof Worker !== 'undefined';

/** Every file is in place. */
export async function installed(): Promise<boolean> {
  if (!storeSupported) return false;
  try {
    const cache = await caches.open(CACHE);
    const have = new Set((await cache.keys()).map(r => new URL(r.url).pathname));
    return NAMES.every(n => have.has(key(n)));
  } catch {
    return false;
  }
}

/** A stored file, for the worker that runs the voice. */
export async function read(name: string): Promise<ArrayBuffer> {
  const hit = await (await caches.open(CACHE)).match(key(name));
  if (!hit) throw new Error('voice not downloaded');
  return hit.arrayBuffer();
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

async function fetchPart(url: string, signal: AbortSignal, onBytes: (n: number) => void): Promise<Blob> {
  const res = await fetch(url, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  if (!res.body) {
    const blob = await res.blob();
    onBytes(blob.size);
    return blob;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    onBytes(value.length);
  }
  return new Blob(chunks as BlobPart[]);
}

/**
 * Downloads what is missing. Files already stored are kept, so a download that was cut short
 * goes on from the last whole file. Every voice file is checked against its checksum.
 */
export async function download(runtimeUrl: string, onProgress: (part: number) => void, signal: AbortSignal): Promise<void> {
  const cache = await caches.open(CACHE);
  const have = new Set((await cache.keys()).map(r => new URL(r.url).pathname));
  // Ask the browser not to throw the voice away when space runs low
  try { (navigator as any).storage?.persist?.()?.catch?.(() => {}); } catch {}
  const all = [...PARTS.map(p => ({ ...p, url: BASE + p.name })), { name: RUNTIME, size: RUNTIME_SIZE, sha256: '', url: runtimeUrl }];
  let done = 0;
  for (const p of all) {
    if (!have.has(key(p.name))) {
      let blob: Blob | null = null;
      // One more try when the file arrived damaged
      for (let attempt = 0; attempt < 2 && !blob; attempt++) {
        let got = 0;
        const b = await fetchPart(p.url, signal, n => {
          got += n;
          onProgress(Math.min(1, (done + Math.min(got, p.size)) / VOICE_SIZE));
        });
        if (!p.sha256 || (b.size === p.size && hex(await crypto.subtle.digest('SHA-256', await b.arrayBuffer())) === p.sha256)) blob = b;
      }
      if (!blob) throw new Error('checksum');
      await cache.put(key(p.name), new Response(blob, { headers: { 'Content-Type': 'application/octet-stream' } }));
    }
    done += p.size;
    onProgress(Math.min(1, done / VOICE_SIZE));
  }
}

export async function remove(): Promise<void> {
  try { await caches.delete(CACHE); } catch {}
}
