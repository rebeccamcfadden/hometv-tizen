// The page's app-id table (app/src/apps.ts, used when HomeTV runs as its own app) must match the service's
// (service/service.js, used under TizenBrew).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('page and service list the same Samsung app ids', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hometv-ids-'));
  const { startDevService } = await import('../tools/dev-service.mjs');
  const dev = await startDevService({ port: 0, dataDir });
  dev.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  const service = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(dev.service.APPS).map(([k, v]) => [k, v.ids]))));
  const src = fs.readFileSync(path.join(root, 'app', 'src', 'apps.ts'), 'utf8');
  const block = src.slice(src.indexOf('APP_IDS'), src.indexOf('};', src.indexOf('APP_IDS')));
  const page = {};
  for (const m of block.matchAll(/(\w+): \[([^\]]*)\]/g)) page[m[1]] = [...m[2].matchAll(/'(\d+)'/g)].map((x) => x[1]);
  assert.deepEqual(page, service);
});
