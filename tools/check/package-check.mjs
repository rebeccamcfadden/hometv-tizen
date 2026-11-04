// Builds the HomeTV check app, unsigned: release/check-samsung-v1/HomeTV-Check-App.wgt. The laptop tool signs it
// with the TV's own certificate (AeroTizen's signer) as it installs it, so no Tizen Studio is needed anywhere.
// Usage: HOMETV_CHECK=1 npm run build && node tools/check/package-check.mjs [--out <file>]
//
// The package is HomeTV's (tools/package-tizen.mjs) under the check app's id: the check-mode page (dist/, with
// AeroTizen's ES5 scripts), AeroTizen's Home watcher (vendor/aerotizen/launcher/service/ and the three js/ files it
// requires) with only its app id and port changed, and HomeTV's pages service (service/pages.js, keys-page.html).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from './zip.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CHECK_APP_ID = 'HmTvCheck0.HomeTVCheck';
export const CHECK_PACKAGE = 'HmTvCheck0';
/** HomeTV's own ids in the page and glue, which the check app replaces. */
const HOMETV_APP_ID = 'HmTvSpike0.HomeTVSpike';
const HOMETV_PACKAGE = 'HmTvSpike0';
const WATCHER_PORT = '47791';
export const WGT_NAME = 'HomeTV-Check-App.wgt';

/** HomeTV's ids in the page and glue → the check app's. */
export const toCheckIds = (text) => text.split(HOMETV_APP_ID).join(CHECK_APP_ID).split(HOMETV_PACKAGE).join(CHECK_PACKAGE);

/** AeroTizen's watcher with the check app's id and HomeTV's watcher port in place of its own. */
const retarget = (text) => text.split('DclHome001.Home').join(CHECK_APP_ID).split('47790').join(WATCHER_PORT);

/** The sample catalogue's titles (app/src/data/catalog.ts), never in a TV package. */
const sampleIn = (js) => /Knives Out|Past Lives|Severance/.test(js);

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

/** The check app's files, [{ name, data }], from a check-mode dist/. Throws if dist/ isn't one. */
export function checkAppFiles(dist = path.join(root, 'dist')) {
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('No dist/: run `HOMETV_CHECK=1 npm run build` first.');
  const app = fs.readFileSync(path.join(dist, 'assets', 'app.js'), 'utf8');
  if (!/HomeTVCheck/.test(app)) throw new Error('dist/ is HomeTV, not the check app: run `HOMETV_CHECK=1 npm run build` first.');
  if (sampleIn(app)) throw new Error('dist/ has the sample catalogue: the check app is built from v0 (leave HOMETV_V1 unset).');
  const files = [];
  for (const rel of walk(dist)) {
    const data = fs.readFileSync(path.join(dist, rel));
    const text = /\.(js|html|css|json)$/.test(rel);
    files.push({ name: 'dist/' + rel, data: text ? Buffer.from(toCheckIds(data.toString('utf8'))) : data });
  }
  const aero = path.join(root, 'vendor', 'aerotizen', 'launcher');
  for (const f of fs.readdirSync(path.join(aero, 'service')).filter((n) => n.endsWith('.js'))) {
    files.push({ name: 'aero/service/' + f, data: Buffer.from(retarget(fs.readFileSync(path.join(aero, 'service', f), 'utf8'))) });
  }
  for (const f of ['diagnostics.js', 'diagnostics-privacy.js', 'build-info.js']) {
    files.push({ name: 'aero/js/' + f, data: Buffer.from(retarget(fs.readFileSync(path.join(aero, 'js', f), 'utf8'))) });
  }
  files.push({ name: 'aero/LICENSE', data: fs.readFileSync(path.join(root, 'vendor', 'aerotizen', 'LICENSE')) });
  for (const f of ['pages.js', 'keys-page.html']) files.push({ name: 'pages/' + f, data: Buffer.from(toCheckIds(fs.readFileSync(path.join(root, 'service', f), 'utf8'))) });
  files.push({ name: 'config.xml', data: fs.readFileSync(path.join(root, 'tools', 'check', 'config.xml')) });
  for (const f of files) {
    if (/\.(js|html|xml)$/.test(f.name) && f.data.toString('utf8').indexOf(HOMETV_PACKAGE) >= 0) throw new Error(`${f.name} still has HomeTV's id`);
  }
  return files;
}

/** The unsigned .wgt (a ZIP), deterministic: the same files give the same bytes. */
export function checkAppWgt(dist) {
  return writeZip(checkAppFiles(dist));
}

function main() {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? path.resolve(process.argv[i + 1]) : path.join(root, 'release', 'check-samsung-v1', WGT_NAME);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, checkAppWgt());
  console.log(`package-check: ${path.relative(root, out)} (unsigned; the laptop tool signs it for the TV).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
