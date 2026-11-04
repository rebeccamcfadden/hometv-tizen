// Prepares the release assets for the Samsung check (tag check-samsung-v1). It does NOT create the release: that is
// done by hand, with the project lead's OK, with the command it prints. docs/check-tool.md says how.
//
// Usage: node tools/check/build-assets.mjs [--no-build] [--write-page] [--offline]
//   --no-build    use dist/ as it is (it must be a check-mode build) instead of running HOMETV_CHECK=1 npm run build
//   --write-page  put the assets' SHA-256 into site/check/index.html (between its sha markers)
//   --offline     use only what is already in .cache/check/ (no downloads)
//
// Writes release/check-samsung-v1/ (gitignored):
//   HomeTV-Check-Windows.zip  the tool for the laptop: Python (python.org's embeddable build), AeroTizen's CLI package
//                             (vendor/, unmodified) and its two dependencies, tools/check/*.py, the report's
//                             allowlist, and the unsigned check app
//   HomeTV-Check-App.wgt      the unsigned check app on its own (the same file as inside the zip)
//   SHA256SUMS.txt            both files' SHA-256
//   release-notes.md          the release's text, with the work-in-progress warning
// Every file in the zip has a fixed date and order, so the same inputs give the same SHA-256.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkAppWgt, root, WGT_NAME } from './package-check.mjs';
import { readZip, writeZip } from './zip.mjs';

export const TAG = 'check-samsung-v1';
export const ZIP_NAME = 'HomeTV-Check-Windows.zip';
export const SUMS_NAME = 'SHA256SUMS.txt';
export const ASSET_NAMES = [ZIP_NAME, WGT_NAME, SUMS_NAME];
export const REPO = 'rebeccamcfadden/hometv-tizen';
export const DOWNLOAD_BASE = `https://github.com/${REPO}/releases/download/${TAG}/`;
/** The folder the zip unpacks to. */
export const BUNDLE_DIR = 'HomeTV-Check';
const PAGE = path.join(root, 'site', 'check', 'index.html');
const CACHE = path.join(root, '.cache', 'check');
const OUT = path.join(root, 'release', TAG);

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function sumsText(files) {
  return files.map((f) => `${sha256(f.data)}  ${f.name}\n`).join('');
}

/** The release's text: the warning first, then what each asset is and its SHA-256. */
export function releaseNotes(hashes) {
  return `> ⚠ **Work in progress, not tested on a real TV yet.** Only use this if you were sent the link to the
> instructions: https://rebeccamcfadden.github.io/hometv-tizen/check/

The HomeTV check for Samsung TVs: a Windows tool that installs a small check app on the TV (in Developer Mode),
learns whether HomeTV will install and work there, removes the check app again and writes a report.

| File | What it is | SHA-256 |
|---|---|---|
| \`${ZIP_NAME}\` | The tool for a Windows laptop (Python from python.org, AeroTizen's CLI, the check app) | \`${hashes[ZIP_NAME]}\` |
| \`${WGT_NAME}\` | The check app on its own, unsigned (the tool signs it with the TV's certificate) | \`${hashes[WGT_NAME]}\` |
| \`${SUMS_NAME}\` | Both SHA-256s | |

Built from this repo with \`node tools/check/build-assets.mjs\`; the same commit gives the same files.
Built on [AeroTizen](https://github.com/helalaou/AeroTizen) (MIT).
`;
}

/** The page with each asset's SHA-256 put between its markers: <!--sha:zip-->…<!--/sha:zip--> (and wgt). */
export function pageWithHashes(html, hashes) {
  const put = (text, key, value) => {
    const re = new RegExp(`(<!--sha:${key}-->)[^<]*(<!--/sha:${key}-->)`, 'g');
    if (!re.test(text)) throw new Error(`site/check/index.html has no <!--sha:${key}--> marker`);
    return text.replace(re, `$1${value}$2`);
  };
  return put(put(html, 'zip', hashes[ZIP_NAME]), 'wgt', hashes[WGT_NAME]);
}

async function fetchPinned(url, file, want, offline) {
  const cached = path.join(CACHE, file);
  if (fs.existsSync(cached) && sha256(fs.readFileSync(cached)) === want) return fs.readFileSync(cached);
  if (offline) throw new Error(`${file} isn't in .cache/check/ (run without --offline once)`);
  const u = typeof url === 'function' ? await url() : url;
  const res = await fetch(u);
  if (!res.ok) throw new Error(`${u}: HTTP ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  if (sha256(data) !== want) throw new Error(`${file}: SHA-256 ${sha256(data)}, expected ${want}`);
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(cached, data);
  return data;
}

async function wheelUrl(w) {
  const res = await fetch(`https://pypi.org/pypi/${w.name}/${w.version}/json`);
  if (!res.ok) throw new Error(`PyPI ${w.name} ${w.version}: HTTP ${res.status}`);
  const entry = (await res.json()).urls.find((u) => u.filename === w.file);
  if (!entry) throw new Error(`PyPI has no ${w.file}`);
  return entry.url;
}

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === '__pycache__' ? [] : walk(p, base);
    return [path.relative(base, p).split(path.sep).join('/')];
  });
}

const START_CMD = `@echo off
rem HomeTV Check for Samsung TVs: double-click this file, or follow the instructions page.
cd /d "%~dp0"
"%~dp0python\\python.exe" "%~dp0app\\hometv_check.py" %*
if errorlevel 1 pause
`;

const README = `HomeTV Check for Samsung TVs
Work in progress: not tested on a real TV yet.

The instructions: https://rebeccamcfadden.github.io/hometv-tizen/check/

To start: double-click "Start HomeTV Check.cmd" (if Windows shows a blue box, choose "More info", then
"Run anyway"), or paste the command from the instructions page into PowerShell.

What's in this folder:
  Start HomeTV Check.cmd   starts the tool
  app\\                     the tool (hometv_check.py) and the report's list of allowed fields
  HomeTV-Check-App.wgt     the small check app it installs on the TV, and removes again
  python\\                  Python ${'{PY}'}, the official embeddable build from python.org (its licence: python\\LICENSE.txt)
  lib\\                     AeroTizen's CLI (MIT, by Hamza El Alaoui: LICENSES\\AeroTizen.txt) and the libraries it
                           uses: cryptography, cffi, pycparser, websocket-client (each licence in its *.dist-info)
  LICENSES\\                HomeTV's and AeroTizen's licences

Nothing is installed on the laptop: delete this folder when you're done. Keep the TV's certificate files, as the
tool says at the end.
`;

/** The Windows bundle's files, [{ name, data }], all under HomeTV-Check/. */
export async function bundleFiles({ wgt, offline = false }) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'check', 'bundle-lock.json'), 'utf8'));
  const files = [];
  const add = (name, data) => files.push({ name: `${BUNDLE_DIR}/${name}`, data: Buffer.isBuffer(data) ? data : Buffer.from(data) });

  const py = await fetchPinned(lock.python.url, path.basename(lock.python.url), lock.python.sha256, offline);
  for (const f of readZip(py)) {
    if (f.name === lock.python.pth) {
      // The bundle's own folders on Python's path; nothing from the laptop's own Python or environment.
      add('python/' + f.name, `${path.basename(lock.python.pth, '._pth')}.zip\r\n.\r\n..\\app\r\n..\\lib\r\n`);
    } else add('python/' + f.name, f.data);
  }
  for (const w of lock.wheels) {
    const data = await fetchPinned(() => wheelUrl(w), w.file, w.sha256, offline);
    for (const f of readZip(data)) add('lib/' + f.name, f.data);
  }
  const aero = path.join(root, 'vendor', 'aerotizen', 'cli', 'src', 'aerotizen');
  for (const rel of walk(aero)) add('lib/aerotizen/' + rel, fs.readFileSync(path.join(aero, rel)));
  for (const f of ['hometv_check.py', 'check_report.py']) add('app/' + f, fs.readFileSync(path.join(root, 'tools', 'check', f)));
  add('app/report-schema.json', fs.readFileSync(path.join(root, 'app', 'src', 'check', 'report-schema.json')));
  add(WGT_NAME, wgt);
  add('Start HomeTV Check.cmd', START_CMD.replace(/\n/g, '\r\n'));
  add('README.txt', README.replace('{PY}', lock.python.version).replace(/\n/g, '\r\n'));
  add('LICENSES/HomeTV.txt', fs.readFileSync(path.join(root, 'LICENSE')));
  add('LICENSES/AeroTizen.txt', fs.readFileSync(path.join(root, 'vendor', 'aerotizen', 'LICENSE')));
  return files;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--no-build')) {
    console.log('build-assets: HOMETV_CHECK=1 npm run build');
    execSync('npm run build', { cwd: root, stdio: 'inherit', env: { ...process.env, HOMETV_CHECK: '1', HOMETV_V1: '' } });
  }
  const wgt = checkAppWgt();
  const zip = writeZip(await bundleFiles({ wgt, offline: args.includes('--offline') }));
  fs.mkdirSync(OUT, { recursive: true });
  const assets = [
    { name: ZIP_NAME, data: zip },
    { name: WGT_NAME, data: wgt },
  ];
  const hashes = {};
  for (const a of assets) {
    fs.writeFileSync(path.join(OUT, a.name), a.data);
    hashes[a.name] = sha256(a.data);
  }
  fs.writeFileSync(path.join(OUT, SUMS_NAME), sumsText(assets));
  fs.writeFileSync(path.join(OUT, 'release-notes.md'), releaseNotes(hashes));
  if (args.includes('--write-page')) {
    fs.writeFileSync(PAGE, pageWithHashes(fs.readFileSync(PAGE, 'utf8'), hashes));
    console.log('build-assets: site/check/index.html has the new SHA-256s (commit it with the release).');
  }
  const rel = (n) => path.relative(root, path.join(OUT, n)).split(path.sep).join('/');
  console.log(`\nbuild-assets: ${path.relative(root, OUT)}`);
  for (const a of assets) console.log(`  ${a.name}  ${(a.data.length / 1048576).toFixed(1)} MB  sha256 ${hashes[a.name]}`);
  console.log(`  ${SUMS_NAME}\n  release-notes.md (not an asset)`);
  console.log('\nNot released. With the project lead\'s OK only:');
  console.log(
    `  gh release create ${TAG} --repo ${REPO} --prerelease --latest=false --title "HomeTV Check for Samsung (v1, work in progress)" ` +
      `--notes-file ${rel('release-notes.md')} ${ASSET_NAMES.map(rel).join(' ')}`,
  );
  if (!args.includes('--no-build')) console.log('\ndist/ now holds the check app. Run `npm run build` to get HomeTV back.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('build-assets: ' + e.message);
    process.exit(1);
  });
}
