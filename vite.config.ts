import { defineConfig, type Plugin } from 'vite';

// The page TizenBrew loads (dist/index.html, the module's appPath). 2018 Samsungs run Chromium 56, which has no
// ES modules, so the build is one classic script (iife) with plain <script defer>; tools/check-legacy.mjs checks it.
const classicScript = (): Plugin => ({
  name: 'classic-script',
  apply: 'build',
  enforce: 'post',
  transformIndexHtml(html) {
    return html
      .replace(/<script type="module" crossorigin src=/g, '<script defer src=')
      .replace(/<link rel="stylesheet" crossorigin href=/g, '<link rel="stylesheet" href=');
  },
});

export default defineConfig({
  root: 'app',
  base: './',
  plugins: [classicScript()],
  server: { port: 5180, strictPort: true },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'chrome56',
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: { format: 'iife', entryFileNames: 'assets/app.js', assetFileNames: 'assets/[name][extname]' },
    },
  },
});
