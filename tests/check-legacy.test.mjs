// tools/check-legacy.mjs must refuse what the oldest TVs can't run, not only pass what they can.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Copies the checker into a scratch project with the given files, runs it, and returns [exit code, output]. */
function runOn(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-'));
  fs.mkdirSync(path.join(dir, 'tools'));
  fs.copyFileSync(path.join(root, 'tools', 'check-legacy.mjs'), path.join(dir, 'tools', 'check-legacy.mjs'));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  try {
    const out = execFileSync(process.execPath, [path.join(dir, 'tools', 'check-legacy.mjs')], { stdio: 'pipe' });
    return [0, out.toString()];
  } catch (e) {
    return [e.status, e.stderr.toString()];
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const ok = {
  'service/service.js': 'var a = 1; function f() { return a; }',
  'dist/index.html': '<script defer src="./assets/app.js"></script>',
  'dist/assets/app.js': '(function () { const x = async () => 1; x(); })();',
  'dist/assets/style.css': '.a { display: flex; margin-right: 8px; }',
};

test('passes code the oldest TVs run', () => {
  const [code] = runOn(ok);
  assert.equal(code, 0);
});

for (const [what, patch, expect] of [
  ['let in the service', { 'service/service.js': 'let a = 1;' }, /service\.js: not ES5/],
  ['optional chaining in the page', { 'dist/assets/app.js': 'var a = {}; a?.b;' }, /app\.js: not ES2017/],
  ['object spread in the page', { 'dist/assets/app.js': 'var a = { ...{} };' }, /app\.js: not ES2017/],
  ['an ES module page', { 'dist/index.html': '<script type="module" src="x.js"></script>' }, /type="module"/],
  ['flexbox gap', { 'dist/assets/style.css': '.a { display: flex; gap: 8px; }' }, /gap/],
  ['CSS grid', { 'dist/assets/style.css': '.a { display: grid; }' }, /grid/],
  [':focus-visible', { 'dist/assets/style.css': '.a:focus-visible { color: red; }' }, /focus-visible/],
  ['matchAll in the page', { 'dist/assets/app.js': 'var a = "x".matchAll(/x/g);' }, /matchAll/],
  ['replaceChildren in the page', { 'dist/assets/app.js': 'document.body.replaceChildren();' }, /replaceChildren/],
  ['an arrow in the pages service', { 'service/pages.js': 'var f = () => 1;' }, /pages\.js: not ES5/],
  ['const in the phone page', { 'service/keys-page.html': '<p></p><script>const a = 1;</script>' }, /keys-page\.html: script not ES5/],
]) {
  test(`refuses ${what}`, () => {
    const [code, out] = runOn({ ...ok, ...patch });
    assert.equal(code, 1);
    assert.match(out, expect);
  });
}
