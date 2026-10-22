import { Capacitor, registerPlugin } from '@capacitor/core';

// The built-in browser (android/.../BrowserActivity.java). Files a site offers
// for download are saved in the app and arrive through the IncomingFiles events.

interface WebBrowserPlugin {
  open(options: { url: string; background?: string; foreground?: string }): Promise<void>;
}

const WebBrowser = registerPlugin<WebBrowserPlugin>('WebBrowser');

// Colors of the browser's top bar, matching the app header of each style
const barColors = (appStyle: string) => {
  switch (appStyle) {
    case 'Bimbo': return { background: '#FFF0F5', foreground: '#881337' };
    case 'Surf': return { background: '#F0F9FF', foreground: '#0C4A6E' };
    case 'Marcel': return { background: '#F3EFFB', foreground: '#2F2440' };
    case 'Dragon': return { background: '#271c19', foreground: '#fcd34d' };
    case 'Final':
    case 'Final Fantasy': return { background: '#0b1d3a', foreground: '#f0deba' };
    default: return { background: '#23211f', foreground: '#fffff0' };
  }
};

export async function openSite(url: string, appStyle: string): Promise<void> {
  if (Capacitor.isNativePlatform()) await WebBrowser.open({ url, ...barColors(appStyle) });
  else window.open(url, '_blank', 'noopener');
}
