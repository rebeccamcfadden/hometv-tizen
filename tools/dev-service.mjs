// Runs service/service.js the way TizenBrew does (its serviceLauncher.js: a vm context holding Node's globals,
// `require`, `module` and `tizen`), with the fake TV from mock-tizen.mjs and fake Samsung servers. Used by
// `npm run service`, `npm run dev` and the tests.

import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createMockTizen } from './mock-tizen.mjs';
import { startFakeDial, startFakeRemote } from './fake-samsung.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function startDevService({ port = 8766, dataDir = path.join(root, '.data'), listApps = true, log = () => {} } = {}) {
  const { tizen, calls } = createMockTizen({ listApps, log });
  const remote = await startFakeRemote({ log });
  const dial = await startFakeDial({ log });

  const sandbox = {};
  for (const prop of Object.getOwnPropertyNames(globalThis)) {
    if (['global', 'globalThis', 'module', 'localStorage', 'sessionStorage'].includes(prop)) continue;
    try {
      sandbox[prop] = globalThis[prop];
    } catch {
      // Some getters refuse to be read outside their context.
    }
  }
  sandbox.require = createRequire(path.join(root, 'service', 'service.js'));
  sandbox.tizen = tizen;
  sandbox.module = { exports: {} };
  sandbox.HOMETV_DEV = { port, remotePort: remote.port, dialPort: dial.port, dataDir };

  const script = fs.readFileSync(path.join(root, 'service', 'service.js'), 'utf8');
  vm.runInContext(script, vm.createContext(sandbox), { filename: 'service.js' });
  const service = sandbox.module.exports;
  await new Promise((resolve, reject) => {
    if (service.server.listening) return resolve();
    service.server.once('listening', resolve);
    service.server.once('error', reject);
  });

  return {
    port: service.server.address().port,
    calls,
    remote,
    dial,
    service,
    close() {
      service.server.close();
      remote.server.close();
      dial.server.close();
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dev = await startDevService({ log: (s) => console.log(`[fake TV] ${s}`) });
  console.log(`HomeTV service (fake TV) on http://127.0.0.1:${dev.port}  · report: http://127.0.0.1:${dev.port}/report`);
}
