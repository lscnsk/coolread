// CoolRead lite: the web version opened as a Telegram Mini App (npm run build:telegram).
// No read aloud and no built-in browser. Telegram's own script (telegram-web-app.js,
// added to index.html by the build) gives the back button, colours and links.

export const isLite = import.meta.env.VITE_TARGET === 'telegram';

interface TgBackButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string };
  platform?: string;
  version: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast(v: string): boolean;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  openLink(url: string): void;
  addToHomeScreen?(): void;
  checkHomeScreenStatus?(cb: (status: string) => void): void;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  BackButton: TgBackButton;
}

// The app object, only when the page really runs inside Telegram
export const tg = (): TgWebApp | null => {
  if (!isLite) return null;
  const app = (window as any).Telegram?.WebApp as TgWebApp | undefined;
  return app && app.initData ? app : null;
};

const safe = (f: () => void) => { try { f(); } catch (e) { /* older Telegram */ } };

// Called once before the app is drawn
export function initTelegram(): void {
  const app = tg();
  if (!app) return;
  safe(() => app.ready());
  safe(() => app.expand());
  // A swipe down would close the app instead of scrolling the book
  if (app.isVersionAtLeast('7.7')) safe(() => app.disableVerticalSwipes?.());
  // A link t.me/<bot>/<app>?startapp=book_jk opens that lscnsk book, like "#book=jk" on the site
  const start = app.initDataUnsafe?.start_param || '';
  const m = /^book_([A-Za-z0-9_-]+)$/.exec(start);
  if (m) window.location.hash = 'book=' + m[1];
}

// Telegram's top bar and background in the colours of the app style
export function setTelegramColors(background: string): void {
  const app = tg();
  if (!app || !app.isVersionAtLeast('6.1')) return;
  safe(() => app.setHeaderColor?.(background));
  safe(() => app.setBackgroundColor?.(background));
  if (app.isVersionAtLeast('7.10')) safe(() => app.setBottomBarColor?.(background));
}

// Telegram's "Back" button in its top bar, shown while there is something to close
let backHandler: (() => void) | null = null;
export function setTelegramBack(visible: boolean, onBack: () => void): void {
  const app = tg();
  if (!app || !app.isVersionAtLeast('6.1')) return;
  if (backHandler) safe(() => app.BackButton.offClick(backHandler!));
  backHandler = onBack;
  safe(() => app.BackButton.onClick(onBack));
  safe(() => (visible ? app.BackButton.show() : app.BackButton.hide()));
}

// Sites open in Telegram's browser
export function openTelegramLink(url: string): boolean {
  const app = tg();
  if (!app) return false;
  safe(() => app.openLink(url));
  return true;
}

// An icon on the phone's home screen that opens the app (Telegram 8.0+, Android and iOS).
// The status is "added", "missed" (not added yet), "unknown" or "unsupported".
export function watchHomeScreen(onStatus: (status: string) => void): () => void {
  const app = tg();
  if (!app || !app.isVersionAtLeast('8.0') || !app.checkHomeScreenStatus) { onStatus('unsupported'); return () => {}; }
  safe(() => app.checkHomeScreenStatus!(onStatus));
  const added = () => onStatus('added');
  safe(() => app.onEvent('homeScreenAdded', added));
  return () => safe(() => app.offEvent('homeScreenAdded', added));
}

export function addToHomeScreen(): void {
  const app = tg();
  if (app?.addToHomeScreen) safe(() => app.addToHomeScreen!());
}

// The full version (read aloud, az.lib.ru, built-in browser) is an Android app in RuStore
export const RUSTORE_URL = 'https://www.rustore.ru/catalog/app/com.coolread.app';
// The APK attached as CoolRead.apk to the latest GitHub release of this repository
export const APK_URL = 'https://github.com/lscnsk/coolread/releases/latest/download/CoolRead.apk';
// Offered everywhere except iPhone, iPad and Mac, where it cannot be installed
export const offerFullVersion = (): boolean => isLite && !['ios', 'macos'].includes(tg()?.platform || '');
