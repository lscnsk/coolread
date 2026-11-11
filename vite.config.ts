import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Fontsource CSS lists a .woff fallback next to every .woff2. Android WebView
// reads woff2, so drop the fallback and keep the duplicates out of the APK.
const woff2Only = (): Plugin => ({
  name: 'woff2-only',
  enforce: 'pre',
  transform(code, id) {
    if (!/@fontsource[\\/].*\.css$/.test(id)) return null;
    return code.replace(/,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g, '');
  },
});

// BimboRead: same app with a pink first screen and its own name.
const isBimbo = process.env.VITE_FLAVOR === 'bimbo';
const flavorHtml = (): Plugin => ({
  name: 'flavor-html',
  transformIndexHtml(html) {
    if (!isBimbo) return html;
    return html
      .replace('<title>CoolRead</title>', '<title>BimboRead</title>')
      .replace('content="#23211f"', 'content="#FFF0F5"')
      .replace('<body class="text-[#fffff0]', '<body style="background-color:#FFF0F5" class="text-[#fffff0]');
  },
});

// Web version (PWA), built with `npm run build:web` into dist-web/. The site files from
// web-pwa/public are added only here, so the APK stays as it was. The service worker
// gets the list of every built file, so the installed app works offline.
const isWeb = process.env.VITE_TARGET === 'web';
const webPwa = (): Plugin => ({
  name: 'web-pwa',
  apply: 'build',
  transformIndexHtml(html) {
    if (!isWeb) return html;
    return html.replace('<meta name="theme-color" content="#23211f" />', `<meta name="theme-color" content="#23211f" />
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="icon" type="image/png" sizes="32x32" href="./icons/favicon-32.png" />
    <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="CoolRead" />`);
  },
  closeBundle() {
    if (!isWeb) return;
    const out = path.resolve(__dirname, 'dist-web');
    fs.cpSync(path.resolve(__dirname, 'web-pwa/public'), out, { recursive: true });
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else files.push(path.relative(out, full).split(path.sep).join('/'));
      }
    };
    walk(out);
    const precache = files.filter(f => f !== 'sw.js' && !f.startsWith('_') && !(f.startsWith('ort/') && f.endsWith('.wasm')) && !f.endsWith('.map')).sort();
    const version = crypto.createHash('sha1').update(precache.join('|') + precache.map(f => fs.statSync(path.join(out, f)).size).join('|')).digest('hex').slice(0, 10);
    const sw = fs.readFileSync(path.resolve(__dirname, 'web-pwa/sw.template.js'), 'utf8')
      .replace('__VERSION__', version)
      .replace('__FILES__', JSON.stringify(['./', ...precache.map(f => './' + f)], null, 1));
    fs.writeFileSync(path.join(out, 'sw.js'), sw);
  },
});

// Lite version for Telegram (Mini App), built with `npm run build:telegram` into dist-telegram/.
// The web version with fewer book sites; Telegram's script gives the back button and colours.
// No service worker: Telegram needs the internet to open the app anyway.
const isTelegram = process.env.VITE_TARGET === 'telegram';
const telegramLite = (): Plugin => ({
  name: 'telegram-lite',
  apply: 'build',
  transformIndexHtml(html) {
    if (!isTelegram) return html;
    return html
      .replace('<title>CoolRead</title>', '<title>CoolRead lite</title>')
      .replace('<meta name="theme-color" content="#23211f" />', `<meta name="theme-color" content="#23211f" />
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <link rel="icon" type="image/png" sizes="32x32" href="./icons/favicon-32.png" />`);
  },
  closeBundle() {
    if (!isTelegram) return;
    fs.cpSync(path.resolve(__dirname, 'web-pwa/public/icons'), path.resolve(__dirname, 'dist-telegram/icons'), { recursive: true });
  },
});

// The Silero voice of the web and Telegram versions runs on ONNX Runtime, whose WebAssembly
// file (11 MB) and the small script that starts it are put next to the app in ort/. The big
// file is fetched once, together with the voice (utils/silero/store.ts). The Android build
// has its own runtime and does not get them.
const ORT_FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];
const ortFile = (name: string) => path.resolve(__dirname, 'node_modules/onnxruntime-web/dist', name);
const voiceRuntime = (): Plugin => ({
  name: 'voice-runtime',
  // Before web-pwa lists the files for the service worker (which leaves the big one out)
  enforce: 'pre',
  configureServer(server) {
    for (const name of ORT_FILES) {
      server.middlewares.use('/ort/' + name, (_req, res) => {
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        fs.createReadStream(ortFile(name)).pipe(res);
      });
    }
  },
  closeBundle() {
    if (!isWeb && !isTelegram) return;
    const dir = path.resolve(__dirname, isWeb ? 'dist-web' : 'dist-telegram', 'ort');
    fs.mkdirSync(dir, { recursive: true });
    for (const name of ORT_FILES) fs.copyFileSync(ortFile(name), path.join(dir, name));
  },
});

export default defineConfig({
  base: './',
  plugins: [react(), woff2Only(), flavorHtml(), voiceRuntime(), webPwa(), telegramLite()],
  worker: { format: 'es' },
  resolve: {
    alias: {
      util: path.resolve(__dirname, './utils/util-polyfill.ts'),
      events: path.resolve(__dirname, './utils/events-polyfill.ts'),
    },
  },
  build: {
    outDir: isWeb ? 'dist-web' : isTelegram ? 'dist-telegram' : 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'pdf-vendor': ['pdfjs-dist/legacy/build/pdf.mjs'],
          'capacitor-vendor': ['@capacitor/core', '@capacitor/app', '@capacitor/preferences', '@capacitor/splash-screen'],
          'archive-vendor': ['jszip', 'libarchive.js']
        }
      }
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  }
});