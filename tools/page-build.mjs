// After `vite build`: turns dist/index.html into the app's small fixed shell, and copies the loader in.
// Run by `npm run build`. docs/page-updates.md explains the parts.
//
// dist/index.html      the shell: shell-config.js, then boot.js, nothing else
// dist/shell-config.js window.HOMETV_SHELL: the app (shell) version from tizen/config.xml; the bundled page (its
//                      version from package.json, and the CSS, JS and body Vite wrote into index.html); the update
//                      address (env HOMETV_UPDATE_URL; empty means updates are off); the public keys a page must be
//                      signed with (tizen/page-keys.txt plus env HOMETV_PAGE_KEYS)
// dist/boot.js         app/loader/boot.js: shows the newest trusted page the TV has
// dist/update.js       app/loader/update.js: fetches and checks newer pages after Home shows
// dist/nacl-fast.min.js TweetNaCl, unmodified (vendor/tweetnacl), loaded by update.js only
//
// Everything else in dist/ is "the page": what tools/page-release.mjs signs and a TV may download.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Files of the app itself, never part of a downloadable page. */
export const SHELL_FILES = ['index.html', 'shell-config.js', 'boot.js', 'update.js', 'nacl-fast.min.js'];

const strip = (p) => p.replace(/^\.\//, '');

/** The CSS, JS (in order) and body that Vite's index.html loads. */
export function entryFromIndex(html) {
  const js = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)].map((m) => strip(m[1]));
  const css = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)].map((m) => strip(/\bhref="([^"]+)"/.exec(m[0])[1]));
  const body = (/<body[^>]*>([\s\S]*)<\/body>/.exec(html) || ['', ''])[1].replace(/<script\b[\s\S]*?<\/script>/g, '').trim();
  for (const f of [...js, ...css]) {
    if (/^[a-z]+:|^\//i.test(f)) throw new Error(`index.html loads ${f}: only files inside dist/ can be part of a page`);
  }
  return { css, js, body };
}

/** The shell's index.html: Vite's head without its scripts and styles, then shell-config.js and boot.js. */
export function shellIndex(html) {
  const head = (/<head>([\s\S]*)<\/head>/.exec(html) || ['', ''])[1]
    .replace(/<script\b[\s\S]*?<\/script>\s*/g, '')
    .replace(/<link\b[^>]*\brel="stylesheet"[^>]*>\s*/g, '')
    .trim();
  return `<!doctype html>
<html lang="en">
  <head>
    ${head}
    <script src="./shell-config.js"></script>
    <script src="./boot.js"></script>
  </head>
  <body></body>
</html>
`;
}

/** Public keys: raw 32-byte Ed25519 keys in base64, one per line ("#" starts a comment). */
export function parseKeys(text) {
  const keys = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    for (const k of line.replace(/#.*/, '').split(/[\s,]+/)) {
      if (!k) continue;
      if (!/^[A-Za-z0-9+/]{43}=$/.test(k) || Buffer.from(k, 'base64').length !== 32) {
        throw new Error(`not an Ed25519 public key (base64 of 32 bytes): ${k}`);
      }
      if (!keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

export function shellVersion() {
  const xml = fs.readFileSync(path.join(root, 'tizen', 'config.xml'), 'utf8');
  const m = /<widget\b[^>]*\sversion="(\d+\.\d+\.\d+)"/.exec(xml);
  if (!m) throw new Error('tizen/config.xml: no x.y.z version on <widget>');
  return m[1];
}

export function pageVersion() {
  const v = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`package.json: version ${v} is not x.y.z`);
  return v;
}

export function shellConfig({ entry, shell, page, updateUrl = '', keys = [] }) {
  if (updateUrl && !/^https?:\/\/[^\s]+$/.test(updateUrl)) throw new Error(`HOMETV_UPDATE_URL is not an http(s) address: ${updateUrl}`);
  return { shellVersion: shell, page: { version: page, entry }, updateUrl, keys };
}

/** Reads window.HOMETV_SHELL back from a built dist/. */
export function readShellConfig(dist) {
  const text = fs.readFileSync(path.join(dist, 'shell-config.js'), 'utf8');
  return JSON.parse(text.slice(text.indexOf('=') + 1).trim().replace(/;$/, ''));
}

function main() {
  const dist = path.join(root, 'dist');
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  if (html.includes('shell-config.js')) throw new Error('dist/index.html is already a shell: run `npm run build`');
  const keysFile = path.join(root, 'tizen', 'page-keys.txt');
  const keys = parseKeys((fs.existsSync(keysFile) ? fs.readFileSync(keysFile, 'utf8') : '') + '\n' + (process.env.HOMETV_PAGE_KEYS || ''));
  const config = shellConfig({
    entry: entryFromIndex(html),
    shell: shellVersion(),
    page: pageVersion(),
    updateUrl: (process.env.HOMETV_UPDATE_URL || '').trim(),
    keys,
  });
  fs.writeFileSync(path.join(dist, 'shell-config.js'), `window.HOMETV_SHELL = ${JSON.stringify(config, null, 2)};\n`);
  fs.writeFileSync(path.join(dist, 'index.html'), shellIndex(html));
  fs.copyFileSync(path.join(root, 'app', 'loader', 'boot.js'), path.join(dist, 'boot.js'));
  fs.copyFileSync(path.join(root, 'app', 'loader', 'update.js'), path.join(dist, 'update.js'));
  fs.copyFileSync(path.join(root, 'vendor', 'tweetnacl', 'nacl-fast.min.js'), path.join(dist, 'nacl-fast.min.js'));
  const updates = config.updateUrl && keys.length ? `from ${config.updateUrl}` : `off (${config.updateUrl ? 'no public key' : 'no HOMETV_UPDATE_URL'})`;
  console.log(`page-build: app ${config.shellVersion}, page ${config.page.version}; updates ${updates}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
