// Checks that what goes to the TV runs on the oldest engine we aim for: 2018 Samsungs (Tizen 4.0, Chromium 56) and
// TizenBrew's service on Node 4.4.3 (Tizen 3). Run by `npm run build`; exits 1 with the reasons.
//
// - service/service.js, service/pages.js, the phone page's script in service/keys-page.html and the app's shell
//   (dist/shell-config.js, boot.js, update.js) must parse as ES5 (no let/const, arrows, template strings, classes).
// - dist/**/*.js must parse as an ES2017 classic script (no modules: <script type="module"> is Chromium 61; no
//   object spread, optional chaining, ?? or class fields: Chromium 60-84).
// - dist/**/*.css must avoid CSS that Chromium 56 lacks: grid (57), gap (flex 84), :focus-visible (86),
//   :is()/:where() (88), aspect-ratio (88), inset (87).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

function parseAs(file, ecmaVersion, sourceType) {
  try {
    parse(fs.readFileSync(file, 'utf8'), { ecmaVersion, sourceType, allowHashBang: true });
  } catch (e) {
    problems.push(`${path.relative(root, file)}: not ES${ecmaVersion === 5 ? 5 : ecmaVersion}: ${e.message}`);
  }
}

function walk(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : [];
  });
}

const CSS_RULES = [
  [/display\s*:\s*(inline-)?grid/, 'CSS grid (Chromium 57)'],
  [/(^|[;{\s])(row-|column-)?gap\s*:/, 'gap (flexbox gap is Chromium 84)'],
  [/:focus-visible/, ':focus-visible (Chromium 86)'],
  [/:(is|where)\(/, ':is() / :where() (Chromium 88)'],
  [/aspect-ratio\s*:/, 'aspect-ratio (Chromium 88)'],
  [/(^|[;{\s])inset\s*:/, 'inset (Chromium 87)'],
];

/**
 * Built-ins newer than Chromium 56 that a bundler doesn't lower (syntax it does lower). Method names survive
 * minifying, so the built page is scanned. AeroTizen's ES5 scripts in dist/aero are its own and skipped.
 */
const JS_BUILTINS = [
  [/\.matchAll\(/, 'String.prototype.matchAll (Chromium 73)'],
  [/\.padStart\(|\.padEnd\(/, 'padStart/padEnd (Chromium 57)'],
  [/Object\.fromEntries\(/, 'Object.fromEntries (Chromium 73)'],
  [/\.flatMap\(|\.flat\(\)/, 'Array.prototype.flat/flatMap (Chromium 69)'],
  [/\.replaceAll\(/, 'String.prototype.replaceAll (Chromium 85)'],
  [/\.replaceChildren\(/, 'replaceChildren (Chromium 86)'],
  [/structuredClone\(/, 'structuredClone (Chromium 98)'],
  [/\.trimStart\(|\.trimEnd\(/, 'trimStart/trimEnd (Chromium 66)'],
  [/Object\.hasOwn\(/, 'Object.hasOwn (Chromium 93)'],
  [/\bglobalThis\b/, 'globalThis (Chromium 71)'],
  [/new AbortController\(/, 'AbortController (Chromium 66)'],
];

parseAs(path.join(root, 'service', 'service.js'), 5, 'script');
if (fs.existsSync(path.join(root, 'tizen', 'service-host.js'))) parseAs(path.join(root, 'tizen', 'service-host.js'), 5, 'script');
// The app's pages service (Node 4 on the oldest TVs) and the phone page's own script (older phones).
if (fs.existsSync(path.join(root, 'service', 'pages.js'))) parseAs(path.join(root, 'service', 'pages.js'), 5, 'script');
const keysPage = path.join(root, 'service', 'keys-page.html');
if (fs.existsSync(keysPage)) {
  const scripts = /<script>([\s\S]*?)<\/script>/g;
  const html = fs.readFileSync(keysPage, 'utf8');
  for (let m = scripts.exec(html); m; m = scripts.exec(html)) {
    try {
      parse(m[1], { ecmaVersion: 5, sourceType: 'script' });
    } catch (e) {
      problems.push(`service/keys-page.html: script not ES5: ${e.message}`);
    }
  }
}

const dist = path.join(root, 'dist');
if (!fs.existsSync(dist)) problems.push('dist/ is missing: run `npm run build` first');
// The app's shell (tools/page-build.mjs) runs before anything else, also on 2018 TVs: ES5.
const SHELL_ES5 = ['shell-config.js', 'boot.js', 'update.js'];
for (const name of SHELL_ES5) if (fs.existsSync(path.join(dist, name))) parseAs(path.join(dist, name), 5, 'script');
for (const file of walk(dist, '.js')) {
  parseAs(file, 2017, 'script');
  if (file.includes(`${path.sep}aero${path.sep}`) || path.basename(file) === 'nacl-fast.min.js') continue;
  const js = fs.readFileSync(file, 'utf8');
  for (const [re, what] of JS_BUILTINS) if (re.test(js)) problems.push(`${path.relative(root, file)}: uses ${what}`);
}
for (const file of walk(dist, '.html')) {
  const html = fs.readFileSync(file, 'utf8');
  if (/type=["']?module/.test(html)) problems.push(`${path.relative(root, file)}: <script type="module"> (Chromium 61)`);
  if (/rel=["']?modulepreload/.test(html)) problems.push(`${path.relative(root, file)}: modulepreload (Chromium 66)`);
}
for (const file of walk(dist, '.css')) {
  const css = fs.readFileSync(file, 'utf8');
  for (const [re, what] of CSS_RULES) if (re.test(css)) problems.push(`${path.relative(root, file)}: uses ${what}`);
}

if (problems.length) {
  console.error('Not safe for the oldest TVs:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('check-legacy: service is ES5; page JS is ES2017; CSS fits Chromium 56.');
