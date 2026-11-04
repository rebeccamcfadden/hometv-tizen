// `npm run dev`: the service with the fake TV on 8766, and the page on http://localhost:5180 with live reload.
// Open the page in a browser; the keyboard stands in for the remote (see app/src/keys.ts).
// `npm run dev -- --no-service` leaves the service out, to see the page's preview mode.

import { createServer } from 'vite';
import { startDevService } from './dev-service.mjs';

if (!process.argv.includes('--no-service')) {
  const dev = await startDevService({ log: (s) => console.log(`[fake TV] ${s}`) });
  console.log(`service (fake TV): http://127.0.0.1:${dev.port}/report`);
}
const vite = await createServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
await vite.listen();
vite.printUrls();
