// `npm run dev`: the service with the fake TV on 8766, the pages service (the API keys page) on 8767, and the page on
// http://localhost:5180 with live reload.
// Open the page in a browser; the keyboard stands in for the remote (see app/src/keys.ts).
// `npm run dev -- --no-service` leaves the service out, to see the page's preview mode.

import { createServer } from 'vite';
import { pagesTokenPlugin, startDevPages, startDevService, priceKeysPlugin, tmdbKeyPlugin } from './dev-service.mjs';

const plugins = [];
if (!process.argv.includes('--no-service')) {
  const dev = await startDevService({ log: (s) => console.log(`[fake TV] ${s}`) });
  console.log(`service (fake TV): http://127.0.0.1:${dev.port}/report`);
  const pages = await startDevPages({ log: (s) => console.log(`[fake TV] ${s}`) });
  console.log(`pages service: http://127.0.0.1:${pages.port}/keys (keys with "good" in them work, "offline" can't be reached)`);
  plugins.push(pagesTokenPlugin(pages), tmdbKeyPlugin(pages), priceKeysPlugin(pages));
}
const vite = await createServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), plugins });
await vite.listen();
vite.printUrls();
