import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

// Files opened with CoolRead ("Open with") or shared to it, copied to the
// cache by the native IncomingFiles plugin (android/.../IncomingFilesPlugin.java).

interface IncomingFile {
  path: string;
  name: string;
  mimeType: string;
}

interface IncomingFilesPlugin {
  addListener(event: 'filesReceived', cb: (e: { files: IncomingFile[] }) => void): Promise<PluginListenerHandle>;
  remove(options: { paths: string[] }): Promise<void>;
}

const IncomingFiles = registerPlugin<IncomingFilesPlugin>('IncomingFiles');

/** A short message for the user; `sticky` keeps it on screen until the next one. */
export type IncomingNotice = (text: string | null, sticky?: boolean) => void;

const SUPPORTED = /\.(fb2|epub|pdf|cbz|cbr|mp3|m4b|m4a|mp4)$/i;

const MIME_EXT: Record<string, string> = {
  'application/x-fictionbook+xml': 'fb2',
  'application/x-fictionbook': 'fb2',
  'text/fb2+xml': 'fb2',
  'application/epub+zip': 'epub',
  'application/pdf': 'pdf',
  'application/vnd.comicbook+zip': 'cbz',
  'application/x-cbz': 'cbz',
  'application/vnd.comicbook-rar': 'cbr',
  'application/x-cbr': 'cbr',
  'audio/mpeg': 'mp3',
  'audio/x-m4b': 'm4b',
  'audio/m4b': 'm4b',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
};

/** Turns one received file into files the library can import (zips such as .fb2.zip are unpacked). */
async function toImportable(f: IncomingFile, notice: IncomingNotice): Promise<File[]> {
  const blob = await (await fetch(Capacitor.convertFileSrc(f.path))).blob();
  let name = f.name;
  // A page of az.lib.ru or Wikisource saved with 📥 in the built-in browser: build the fb2 from it
  if (/\.coolread-page$/i.test(name)) {
    const url = (await blob.text()).trim();
    const { webPageToFb2 } = await import('./webBook');
    notice('📥 Building the book…', true);
    try {
      return [await webPageToFb2(url, (done, total) => notice(`📥 Building the book… ${done}/${total}`, true))];
    } catch (e) {
      notice(`📥 ${(e as Error).message || 'Could not build the book'}`);
      throw e;
    }
  }
  if (!SUPPORTED.test(name) && !/\.zip$/i.test(name) && MIME_EXT[f.mimeType]) {
    name = `${name}.${MIME_EXT[f.mimeType]}`;
  }
  if (SUPPORTED.test(name)) return [new File([blob], name, { type: f.mimeType, lastModified: Date.now() })];

  // A zip (e.g. book.fb2.zip): take the supported files inside
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(blob);
    const inner = Object.values(zip.files).filter(z => !z.dir && SUPPORTED.test(z.name));
    // A zip of images is a comic
    if (inner.length === 0 && Object.values(zip.files).some(z => /\.(jpe?g|png|webp|gif)$/i.test(z.name))) {
      return [new File([blob], name.replace(/\.(zip|bin)$/i, '') + '.cbz', { type: 'application/x-cbz' })];
    }
    const out: File[] = [];
    for (const z of inner) {
      out.push(new File([await z.async('blob')], z.name.split('/').pop() || z.name, { lastModified: Date.now() }));
    }
    return out;
  }
  return [];
}

/**
 * Listens for incoming files and hands them to `onFiles`. Returns a cleanup function.
 * Events received before the listener exists are kept by the native side.
 */
export function listenForIncomingFiles(onFiles: (files: File[]) => Promise<void> | void, notice: IncomingNotice): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;
  IncomingFiles.addListener('filesReceived', async ({ files }) => {
    const paths = files.map(f => f.path);
    try {
      const importable: File[] = [];
      let failedPage = false;
      for (const f of files) {
        try {
          importable.push(...(await toImportable(f, notice)));
        } catch (e) {
          if (/\.coolread-page$/i.test(f.name)) failedPage = true;
          console.error('Incoming file failed', e);
        }
      }
      if (importable.length > 0) {
        if (!failedPage) notice(null);
        await onFiles(importable);
      } else if (!failedPage) notice('Unsupported file');
    } finally {
      IncomingFiles.remove({ paths }).catch(() => {});
    }
  }).then(h => {
    if (cancelled) h.remove();
    else handle = h;
  });
  return () => {
    cancelled = true;
    handle?.remove();
  };
}
