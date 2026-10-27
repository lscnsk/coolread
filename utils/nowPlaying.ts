import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

// The player notification (android/.../PlaybackService.java), shared by audiobooks and
// reading aloud: cover, title, back / play-pause / forward, also on the lock screen.

export interface NowPlayingInfo {
  title: string;
  subtitle: string;
  /** Small JPEG data URL. */
  cover?: string;
  color?: string;
}

interface NowPlayingPlugin {
  update(o: NowPlayingInfo & { playing: boolean; loading?: boolean; position?: number; duration?: number; speed?: number }): Promise<void>;
  clear(): Promise<void>;
  addListener(event: 'action', cb: (e: { action: 'play' | 'pause' | 'back' | 'forward' | 'seek' | 'stop' | 'slower' | 'faster'; position: number }) => void): Promise<PluginListenerHandle>;
}

export const isNativePlayer = Capacitor.isNativePlatform();
export const NowPlaying = registerPlugin<NowPlayingPlugin>('NowPlaying');

/** Accent of each app style, for the notification. */
export function accentOf(appStyle?: string): string {
  switch (appStyle) {
    case 'Marcel': return '#544372';
    case 'Bimbo': return '#BE123C';
    case 'Surf': return '#0EA5E9';
    case 'Dragon': return '#EA580C';
    case 'Final':
    case 'Final Fantasy': return '#CCA972';
    default: return '#57534E';
  }
}

const covers = new Map<string, Promise<string | undefined>>();

/** The book cover, scaled down to a data URL the native side can read. */
export function coverData(url?: string): Promise<string | undefined> {
  if (!url) return Promise.resolve(undefined);
  let p = covers.get(url);
  if (!p) {
    p = new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try {
          const size = 320, scale = size / Math.max(img.naturalWidth, img.naturalHeight);
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * scale));
          c.height = Math.max(1, Math.round(img.naturalHeight * scale));
          c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.85));
        } catch {
          resolve(undefined);
        }
      };
      img.onerror = () => resolve(undefined);
      img.src = url;
    });
    if (covers.size > 8) covers.clear();
    covers.set(url, p);
  }
  return p;
}
