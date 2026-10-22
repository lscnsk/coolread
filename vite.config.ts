import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

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

export default defineConfig({
  base: './',
  plugins: [react(), woff2Only(), flavorHtml()],
  resolve: {
    alias: {
      util: path.resolve(__dirname, './utils/util-polyfill.ts'),
      events: path.resolve(__dirname, './utils/events-polyfill.ts'),
    },
  },
  build: {
    outDir: 'dist',
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