// The Samsung check (tools/check/, app/src/check/, site/check/): the report's allowlist on the TV and on the laptop,
// the check-mode build, the check app's package, the release assets' names, and the instructions page.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadTs } from './ts-module.mjs';
import { readZip, writeZip } from '../tools/check/zip.mjs';
import { checkAppFiles, CHECK_APP_ID, toCheckIds, WGT_NAME } from '../tools/check/package-check.mjs';
import { ASSET_NAMES, pageWithHashes, releaseNotes, sumsText, TAG, ZIP_NAME } from '../tools/check/build-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'app', 'src', 'check', 'report-schema.json'), 'utf8'));
const { report, flow } = await loadTs({ report: 'check/report.ts', flow: 'check/flow.ts' });

/** Things that must never leave the TV, planted everywhere a careless report could carry them. */
const SECRETS = ['192.168.1.50', 'AA:BB:CC:DD:EE:FF', 'someone@example.com', 'SERIAL0123456', 'Living room TV', 'HomeWiFi', '3201907018807'];

function dirtyDraft() {
  return {
    schema: 'hometv-check-1',
    checkApp: '1.0.0',
    finished: true,
    step: 'done',
    serial: SECRETS[3],
    duid: 'DUID-XYZ',
    tv: { model: 'UE43TU7000', osVersion: '5.5', chromium: 69, screen: '1920x1080', name: SECRETS[4], ip: SECRETS[0], mac: SECRETS[1] },
    apps: { listed: true, count: 40, known: { netflix: true, youtube: false, ids: [SECRETS[6]] }, all: ['Netflix', 'Secret App'] },
    services: { watcher: 'answers', watcherMs: 2100, pages: 'maybe', pagesMs: -4, address: SECRETS[0] },
    keys: { red: 'yes', green: 'no', yellow: true, blue: 'yes', info: 'no', digits: 'no-buttons', extra: 'yes' },
    phone: 'yes',
    youtube: { opened: 'yes', error: `NotFoundError: ${SECRETS[0]}`, back: 'running', answer: 'back-key', appId: SECRETS[6] },
    home: { app: 'youtube', opened: 'yes', back: 'restarted', seconds: 7, answer: 'by-itself', wifi: SECRETS[5] },
    links: {
      youtubeAppControl: { sent: 'yes', answer: 'title', url: 'https://www.youtube.com/watch?v=x' },
      netflixRemote: { sent: 'no', error: 'NotFoundError', answer: 'nothing' },
      other: { sent: 'yes' },
    },
    account: SECRETS[2],
    timing: { startMs: 1800.5 },
  };
}

const EXPECTED_TV = {
  schema: 'hometv-check-1',
  checkApp: '1.0.0',
  finished: true,
  step: 'done',
  tv: { model: 'UE43TU7000', osVersion: '5.5', chromium: 69, screen: '1920x1080' },
  apps: { listed: true, count: 40, known: { netflix: true, youtube: false } },
  services: { watcher: 'answers', watcherMs: 2100 },
  keys: { red: 'yes', green: 'no', blue: 'yes', info: 'no', digits: 'no-buttons' },
  phone: 'yes',
  youtube: { opened: 'yes', back: 'running', answer: 'back-key' },
  home: { app: 'youtube', opened: 'yes', back: 'restarted', seconds: 7, answer: 'by-itself' },
  links: { youtubeAppControl: { sent: 'yes', answer: 'title' }, netflixRemote: { sent: 'no', error: 'NotFoundError', answer: 'nothing' } },
};

test('the TV keeps only what the schema allows, each value checked', () => {
  const out = report.cleanTvReport(dirtyDraft());
  assert.deepEqual(out, EXPECTED_TV);
  const text = JSON.stringify(out);
  for (const s of SECRETS) assert.ok(!text.includes(s), `report holds ${s}`);
  assert.deepEqual(report.cleanTvReport(null), {});
  assert.deepEqual(report.cleanTvReport('x'), {});
  // An address or a bare hardware id never passes as a model or a version.
  for (const bad of [SECRETS[0], 'AABBCCDDEEFF', 'UE43TU7000\n', 'a b']) assert.deepEqual(report.cleanTvReport({ tv: { model: bad, osVersion: bad } }), {}, bad);
});

test('nothing outside the allowlist survives, whatever the draft holds', () => {
  // Random drafts: every key the schema has, plus others, with values of every kind.
  const values = [true, false, 0, 1, 70, -1, 1.5, 1e9, '', 'yes', 'no', 'answers', 'title', '5.5', 'UE43TU7000', SECRETS[0], SECRETS[2], null, [], {}, ['yes']];
  let seed = 7;
  const rnd = (n) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const fill = (spec, depth) => {
    const o = {};
    for (const k of Object.keys(spec).concat(['ip', 'name', 'serial'])) {
      const sub = spec[k];
      o[k] = sub && typeof sub === 'object' && depth < 4 && rnd(4) ? fill(sub, depth + 1) : values[rnd(values.length)];
    }
    return o;
  };
  const check = (value, spec, where) => {
    if (typeof spec === 'string') {
      const [kind, ...rest] = spec.split(':');
      if (kind === 'bool') assert.equal(typeof value, 'boolean', where);
      else if (kind === 'int') assert.ok(Number.isInteger(value) && value >= Number(rest[0]) && value <= Number(rest[1]), where);
      else if (kind === 'enum') assert.ok(rest.join(':').split('|').includes(value), where);
      else assert.match(value, new RegExp(schema.patterns[rest[0]]), where);
      return;
    }
    assert.equal(typeof value, 'object', where);
    for (const k of Object.keys(value)) {
      assert.ok(k in spec, `${where}.${k} isn't in the schema`);
      check(value[k], spec[k], `${where}.${k}`);
    }
  };
  for (let i = 0; i < 300; i++) {
    const out = report.cleanTvReport(fill(schema.tv, 0));
    check(out, schema.tv, 'tv');
    const text = JSON.stringify(out);
    for (const s of SECRETS) assert.ok(!text.includes(s));
  }
});

test('the largest report fits the watcher’s slot (4096 characters)', () => {
  const biggest = (spec) => {
    if (typeof spec !== 'string') return Object.fromEntries(Object.keys(spec).map((k) => [k, biggest(spec[k])]));
    const [kind, ...rest] = spec.split(':');
    if (kind === 'bool') return false;
    if (kind === 'int') return Number(rest[1]);
    if (kind === 'enum') return rest.join(':').split('|').sort((a, b) => b.length - a.length)[0];
    return { version: '1234.123456.123456.123456', model: 'A'.repeat(40), screen: '9999x9999', word: 'w'.repeat(24), errname: 'E'.repeat(40), date: '2026-11-04' }[rest[0]];
  };
  const full = report.cleanTvReport(biggest(schema.tv));
  const trace = JSON.stringify({ script_at: Date.now(), marks: [], hometvCheck: full });
  assert.ok(trace.length <= 4096, `report is ${trace.length} characters`);
});

test('an error leaves the TV as its name only', () => {
  assert.equal(report.errorName('NotFoundError: No matched application found'), 'NotFoundError');
  assert.equal(report.errorName(`timed out ${SECRETS[0]}`), 'Error');
  assert.equal(report.errorName('NotOpened'), 'NotOpened');
  assert.equal(report.errorName(`${SECRETS[0]} refused`), 'Error');
  assert.equal(report.errorName(''), undefined);
});

test('the laptop’s allowlist agrees with the TV’s, and drops the same things', (t) => {
  const python = findPython();
  if (!python) return t.skip('no Python here');
  const laptop = { tool: '1.0.0', date: '2026-11-04', windows: '10.0.22631', tvFound: 'one', hostPcIp: SECRETS[0], developerIp: SECRETS[0], duid: 'X', tv: { modelName: 'UE43TU7000', serial: SECRETS[3] } };
  const script = `import json,sys; sys.path.insert(0, ${JSON.stringify(path.join(root, 'tools', 'check'))}); import check_report as c
d=json.load(sys.stdin); r=c.clean_report(d['laptop'], d['tv']); print(json.dumps(r)); sys.stdout.write(c.render_text(r))`;
  const res = spawnSync(python, ['-c', script], { input: JSON.stringify({ laptop, tv: dirtyDraft() }), encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const [json, ...text] = res.stdout.split('\n');
  const out = JSON.parse(json);
  assert.deepEqual(out.tv, EXPECTED_TV);
  assert.deepEqual(out.laptop, { tool: '1.0.0', date: '2026-11-04', windows: '10.0.22631', tvFound: 'one', tv: { modelName: 'UE43TU7000' } });
  for (const s of SECRETS.concat(['DUID'])) assert.ok(!res.stdout.includes(s), `report holds ${s}`);
  assert.match(text.join('\n'), /Model: UE43TU7000/);
});

test('the check tool’s dry run writes a clean report', (t) => {
  const python = findPython(['cryptography', 'websocket']);
  if (!python) return t.skip('no Python with cryptography and websocket-client here (set HOMETV_PYTHON)');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hometv-check-'));
  try {
    const res = spawnSync(python, [path.join(root, 'tools', 'check', 'hometv_check.py'), '--dry-run', '--out', out, '--no-pause'], { encoding: 'utf8', timeout: 60000 });
    assert.equal(res.status, 0, res.stderr + res.stdout);
    const files = fs.readdirSync(out).sort();
    assert.equal(files.length, 2);
    assert.match(files[0], /^HomeTV-check-report-\d{4}-\d{2}-\d{2}\.json$/);
    assert.match(files[1], /^HomeTV-check-report-\d{4}-\d{2}-\d{2}\.txt$/);
    const text = files.map((f) => fs.readFileSync(path.join(out, f), 'utf8')).join('\n');
    for (const s of ['192.168.', 'dry-run-dropped', '"serial"', '"ip"']) assert.ok(!text.includes(s), `report holds ${s}`);
    const rep = JSON.parse(fs.readFileSync(path.join(out, files[0]), 'utf8'));
    assert.equal(rep.tv.finished, true);
    assert.equal(rep.laptop.install, 'ok');
    assert.match(res.stdout, /signed HomeTV-Check-App\.wgt/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('the laptop finds known apps by their store ids on newer TVs too', (t) => {
  const python = findPython(['cryptography', 'websocket']);
  if (!python) return t.skip('no Python with cryptography and websocket-client here (set HOMETV_PYTHON)');
  // AeroTizen's block format (Tizen 6+): the Tizen id is the app id, the store id is beside it.
  const script = `import sys; sys.path.insert(0, ${JSON.stringify(path.join(root, 'tools', 'check'))}); import hometv_check as h, check_report as c
def block(app_id, title, tizen_id):
    f = {"app_id": app_id, "app_title": title, "app_tizen_id": tizen_id, "app_package_name": tizen_id.split(".")[0], "is_removable": 1}
    return "-" * 93 + "\\n" + "".join(f"--------------{k:<36}={v}-------------\\n" for k, v in f.items())
text = "apps count: 2\\n" + block("111299001912", "YouTube", "9Ur5IzDKqV.TizenYouTube") + block("3201907018807", "Netflix", "org.tizen.netflix-app")
known = c.known_from_app_ids(h.app_ids(text, store_ids=True))
print(len(h.app_ids(text)), known["youtube"], known["netflix"], known["prime"])`;
  const res = spawnSync(python, ['-c', script], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout.trim(), '2 True True False');
});

test('the check remembers its step, and how the person came back', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const p = flow.load(storage, '1.0.0');
  assert.equal(p.step, 0);
  flow.put(p, 'youtube.opened', 'yes');
  p.pending = { step: 'youtube', at: 1000 };
  p.step = 3;
  flow.save(storage, p);
  const again = flow.load(storage, '1.0.0');
  assert.equal(again.step, 3);
  assert.equal(flow.get(again, 'youtube.opened'), 'yes');
  assert.equal(flow.cameBack(again, 'home', true, 5000), null);
  assert.deepEqual(flow.cameBack(again, 'youtube', true, 7600), { how: 'restarted', seconds: 7, part: undefined });
  assert.equal(again.pending, null);
  mem.set(flow.STORE, '{not json');
  assert.equal(flow.load(storage, '1.0.0').step, 0);
  assert.deepEqual(flow.STEPS.map((s) => s.id), ['auto', 'keys', 'phone', 'youtube', 'home', 'links', 'done']);
  // Every step and title link the screen records has its place in the schema.
  assert.deepEqual(schema.tv.step.slice(5).split('|'), flow.STEPS.map((s) => s.id));
  assert.deepEqual(flow.LINKS.map((l) => l.id).sort(), Object.keys(schema.tv.links).sort());
  assert.deepEqual([...flow.KEY_ORDER].sort(), Object.keys(schema.tv.keys).sort());
});

test('the streaming apps are found by their names on the TV', () => {
  const known = flow.knownIn(['Netflix', 'YouTube Kids', 'Max', 'Apple TV+', 'Spotify - Music and Podcasts', 'Prime Video'], report.KNOWN_APP_NAMES);
  assert.equal(known.netflix, true);
  assert.equal(known.youtube, false);
  assert.equal(known.max, true);
  assert.equal(known.appletv, true);
  assert.equal(known.spotify, true);
  assert.equal(known.prime, true);
  assert.equal(known.hulu, false);
  assert.deepEqual(Object.keys(known).sort(), Object.keys(schema.knownApps).sort());
});

test('the known apps’ Samsung ids are the service’s own (service/service.js APPS)', () => {
  const service = fs.readFileSync(path.join(root, 'service', 'service.js'), 'utf8');
  for (const [key, app] of Object.entries(schema.knownApps)) {
    const m = new RegExp(`\\b${key}: \\{ name: '[^']+', ids: \\[([^\\]]+)\\]`).exec(service);
    assert.ok(m, `service.js has no ${key}`);
    assert.deepEqual(JSON.parse(`[${m[1].replace(/'/g, '"')}]`), app.ids, key);
  }
});

test('the check-mode build opens on the checks; HomeTV’s build has none of it', async () => {
  const { build } = await import('vite');
  const built = async (check) => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hometv-build-'));
    const before = process.env.HOMETV_CHECK;
    process.env.HOMETV_CHECK = check ? '1' : '';
    try {
      await build({ configFile: path.join(root, 'vite.config.ts'), logLevel: 'silent', build: { outDir: out, emptyOutDir: true } });
      return { html: fs.readFileSync(path.join(out, 'index.html'), 'utf8'), js: fs.readFileSync(path.join(out, 'assets', 'app.js'), 'utf8') };
    } finally {
      if (before === undefined) delete process.env.HOMETV_CHECK;
      else process.env.HOMETV_CHECK = before;
      fs.rmSync(out, { recursive: true, force: true });
    }
  };
  const check = await built(true);
  assert.match(check.html, /<title>HomeTV Check<\/title>/);
  assert.match(check.js, /HomeTVCheck/);
  assert.match(check.js, /Checking this TV/);
  assert.doesNotMatch(check.js, /Preview: no TV, apps don’t open/, 'Home is not in the check app');
  const home = await built(false);
  assert.doesNotMatch(home.js, /HomeTVCheck|Checking this TV/);
  // The check page's only screen is the checks: it's the shell's first (home) screen.
  const main = fs.readFileSync(path.join(root, 'app', 'src', 'check', 'main.ts'), 'utf8');
  assert.match(main, /shell\.init\(stage, \{ home: checkScreen \}\)/);
});

test('the check app is HomeTV’s page under its own id', () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'hometv-dist-'));
  try {
    fs.mkdirSync(path.join(dist, 'assets'));
    fs.mkdirSync(path.join(dist, 'aero'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<title>HomeTV Check</title>');
    fs.writeFileSync(path.join(dist, 'aero', 'aero-glue.js'), 'A.config.APP_ID = "HmTvSpike0.HomeTVSpike"; A.config.SERVICE_ID = "HmTvSpike0.HomeTVWatcher";');
    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'window.HomeTVCheck={};var s="HmTvSpike0.HomeTVPages";');
    const files = checkAppFiles(dist);
    const byName = Object.fromEntries(files.map((f) => [f.name, f.data.toString('utf8')]));
    assert.match(byName['dist/aero/aero-glue.js'], /"HmTvCheck0\.HomeTVCheck".*"HmTvCheck0\.HomeTVWatcher"/);
    assert.match(byName['dist/assets/app.js'], /HmTvCheck0\.HomeTVPages/);
    assert.match(byName['config.xml'], new RegExp(`<tizen:application id="${CHECK_APP_ID.replace('.', '\\.')}" package="HmTvCheck0"`));
    assert.match(byName['aero/service/index.js'], /HmTvCheck0\.HomeTVCheck/);
    assert.match(byName['aero/service/index.js'], /47791/);
    for (const [name, text] of Object.entries(byName)) if (/\.(js|html|xml)$/.test(name)) assert.doesNotMatch(text, /HmTvSpike0|DclHome001/, name);
    assert.ok(byName['pages/pages.js'] && byName['pages/keys-page.html'] && byName['aero/LICENSE']);
    // HomeTV's own page is refused, and so is one with the sample catalogue.
    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'var x=1;');
    assert.throws(() => checkAppFiles(dist), /not the check app/);
    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'window.HomeTVCheck={};"Knives Out"');
    assert.throws(() => checkAppFiles(dist), /sample catalogue/);
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
  assert.equal(toCheckIds('HmTvSpike0.HomeTVSpike HmTvSpike0.HomeTVPages'), 'HmTvCheck0.HomeTVCheck HmTvCheck0.HomeTVPages');
});

test('zip files are deterministic and read back', () => {
  const files = [
    { name: 'b/two.txt', data: Buffer.from('two '.repeat(100)) },
    { name: 'a.txt', data: Buffer.from('one') },
  ];
  const zip = writeZip(files);
  assert.deepEqual(writeZip(files.slice().reverse()), zip);
  assert.deepEqual(
    readZip(zip).map((f) => [f.name, f.data.toString()]),
    [
      ['a.txt', 'one'],
      ['b/two.txt', 'two '.repeat(100)],
    ],
  );
  assert.throws(() => writeZip([{ name: '../x', data: Buffer.from('') }]), /bad zip entry/);
});

test('the release assets have fixed names, and the page and notes get their SHA-256s', () => {
  assert.equal(TAG, 'check-samsung-v1');
  assert.deepEqual(ASSET_NAMES, ['HomeTV-Check-Windows.zip', 'HomeTV-Check-App.wgt', 'SHA256SUMS.txt']);
  assert.equal(WGT_NAME, 'HomeTV-Check-App.wgt');
  const sums = sumsText([{ name: ZIP_NAME, data: Buffer.from('a') }]);
  assert.equal(sums, 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb  HomeTV-Check-Windows.zip\n');
  const hashes = { [ZIP_NAME]: '1'.repeat(64), [WGT_NAME]: '2'.repeat(64) };
  const notes = releaseNotes(hashes);
  assert.match(notes.split('\n')[0], /Work in progress, not tested on a real TV yet/);
  assert.ok(notes.includes('1'.repeat(64)) && notes.includes('2'.repeat(64)));
  const page = fs.readFileSync(path.join(root, 'site', 'check', 'index.html'), 'utf8');
  const updated = pageWithHashes(page, hashes);
  assert.equal(updated.split('1'.repeat(64)).length - 1, 2, 'the command and the table');
  assert.equal(updated.split('2'.repeat(64)).length - 1, 1);
  assert.equal(pageWithHashes(updated, hashes), updated);
  for (const name of ASSET_NAMES) assert.ok(page.includes(name), `the page names ${name}`);
});

test('the instructions page: the warning first, Copy buttons, nothing personal, nothing from elsewhere', () => {
  const page = fs.readFileSync(path.join(root, 'site', 'check', 'index.html'), 'utf8');
  const body = page.slice(page.indexOf('<main>'));
  const firstText = body.replace(/<[^>]+>/g, ' ').trim().split(/\s{2,}/)[0];
  assert.equal(firstText, '⚠ Work in progress, not tested on a real TV yet.');
  // Every command has its Copy button.
  const pres = [...page.matchAll(/<pre id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(pres.length >= 2);
  for (const id of pres) assert.match(page, new RegExp(`data-copy="${id}"`));
  // Nothing personal: no email, IP, MAC, serial-like ids; the only account-like name is the repo's own address.
  const text = page.replace(/rebeccamcfadden\.github\.io\/hometv-tizen|github\.com\/rebeccamcfadden\/hometv-tizen/g, 'REPO');
  assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, 'an email address');
  assert.doesNotMatch(text, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, 'an IP address');
  assert.doesNotMatch(text, /\b[0-9A-F]{2}([:-][0-9A-F]{2}){5}\b/i, 'a MAC address');
  assert.doesNotMatch(text, /rebecca|mcfadden/i, 'a name');
  assert.doesNotMatch(text, /\b(mum|mom|dad|grand(ma|pa|mother|father)|family)\b/i, 'family words');
  // Works offline once loaded: no scripts, styles, fonts or images from elsewhere.
  assert.doesNotMatch(page, /<(script|link|img|iframe)\b[^>]*\b(src|href)="(https?:)?\/\//i);
  assert.doesNotMatch(page, /@import|url\(/);
  // What the report holds is said, and the keep-the-files and send-the-report steps are there.
  assert.match(page, /What's in the report/);
  assert.match(page, /author\.p12<\/code>, <code>distributor\.p12<\/code> and <code>password\.txt/);
  assert.match(page, /Send the report file to the person who sent you this link/);
  assert.match(page, /More info<\/strong>, then <strong>Run anyway/);
});

test('the Pages workflow deploys site/ from main only', () => {
  const wf = fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
  assert.match(wf, /branches: \[main\]/);
  assert.match(wf, /paths: \['site\/\*\*'\]/);
  assert.match(wf, /actions\/upload-pages-artifact@v\d+[\s\S]*path: site/);
  assert.match(wf, /actions\/deploy-pages@v\d+/);
  assert.doesNotMatch(wf, /pull_request|schedule|workflow_dispatch/);
});

/** A Python that has the given modules, or null: HOMETV_PYTHON, then python, then py. */
function findPython(modules = []) {
  for (const exe of [process.env.HOMETV_PYTHON, 'python', 'python3', 'py'].filter(Boolean)) {
    const res = spawnSync(exe, ['-c', `import sys; assert sys.version_info >= (3, 10); ${modules.map((m) => `import ${m}`).join('; ')}`], { encoding: 'utf8' });
    if (res.status === 0) return exe;
  }
  return null;
}
