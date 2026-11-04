import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

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

/**
 * AeroTizen's plain-ES5 platform scripts (installed apps, artwork, launching, the Home watcher's client), loaded
 * unmodified from vendor/aerotizen before HomeTV's script, then app/aero-glue.js. Served in dev, copied into
 * dist/aero/ in a build. No build step of AeroTizen's own is needed.
 */
export const AERO_SCRIPTS = [
  'config.js',
  'app-catalog.js',
  'app-lookup.js',
  'dom.js',
  'artwork.js',
  'brands.js',
  'homewatch.js',
  'native-navigation.js',
  'apps.js',
];
const AERO_JS = path.resolve(__dirname, 'vendor/aerotizen/launcher/js');
const GLUE = path.resolve(__dirname, 'app/aero-glue.js');
const V1 = process.env.HOMETV_V1 === '1';

const aeroScripts = (): Plugin => ({
  name: 'aero-scripts',
  configureServer(server) {
    server.middlewares.use('/aero/', (req, res, next) => {
      const name = (req.url || '').replace(/^\//, '').split('?')[0];
      const file = name === 'aero-glue.js' ? GLUE : AERO_SCRIPTS.includes(name) ? path.join(AERO_JS, name) : null;
      if (!file) return next();
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(fs.readFileSync(file));
    });
  },
  generateBundle() {
    for (const name of AERO_SCRIPTS) {
      this.emitFile({ type: 'asset', fileName: `aero/${name}`, source: fs.readFileSync(path.join(AERO_JS, name)) });
    }
    this.emitFile({ type: 'asset', fileName: 'aero/aero-glue.js', source: fs.readFileSync(GLUE) });
  },
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      const tags = [...AERO_SCRIPTS, 'aero-glue.js'].map((n) => `<script src="./aero/${n}"></script>`).join('\n    ');
      return html.replace('</head>', `    ${tags}\n  </head>`);
    },
  },
});

export default defineConfig({
  root: 'app',
  base: './',
  plugins: [aeroScripts(), classicScript()],
  // The shared package (docs/shared-package.md), a submodule pinned to a hometv-launcher commit.
  resolve: {
    alias: {
      '@hometv/core': path.resolve(__dirname, 'vendor/hometv-launcher/packages/core/src'),
      // v1's screens only with HOMETV_V1=1 (app/src/features.ts).
      '@v1': path.resolve(__dirname, V1 ? 'app/src/v1.ts' : 'app/src/v1-off.ts'),
    },
  },
  define: { __HOMETV_V1__: JSON.stringify(V1) },
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
