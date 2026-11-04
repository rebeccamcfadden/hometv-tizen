// Page updates: the loader (app/loader/boot.js), the updater (update.js) and the release tools, against the fake TV
// (tools/mock-tizen.mjs's filesystem, in both of Samsung's API shapes) and a fake network. Keys are made here, at
// test time; signatures by Node's own Ed25519, checked by the vendored TweetNaCl as on the TV.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createFakeTv, SHELL_SCRIPTS } from './fake-browser.mjs';
import { makeKeyPair, rawPublicKey } from '../tools/page-key.mjs';
import { makeRelease, writeRelease, readDist, loadPrivateKey } from '../tools/page-release.mjs';
import { entryFromIndex, shellIndex, parseKeys, shellConfig as makeShellConfig } from '../tools/page-build.mjs';
import { startPageServer } from '../tools/page-serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = 'http://192.168.1.50:8790/';
const MANIFEST = SERVER + 'manifest.json';
const ENTRY = { css: ['assets/style.css'], js: ['aero/glue.js', 'assets/app.js'], body: '<div id="stage"></div>' };

const keys = makeKeyPair();
const otherKeys = makeKeyPair();

function shellConfig({ updateUrl = MANIFEST, pubKeys = [keys.publicKey], shell = '1.0.0' } = {}) {
  return {
    shellVersion: shell,
    page: { version: '1.0.0', entry: { css: ['assets/style.css'], js: ['assets/app.js'], body: '<div id="stage"></div>' } },
    updateUrl,
    keys: pubKeys,
  };
}

const BUNDLED = {
  'assets/app.js': "window.shown = 'bundled'; if (!window.holdStart) HomeTVBoot.started();",
  'assets/style.css': 'body { color: white; }',
};

/** A page's files. `starts: false` makes a page that never reaches Home. */
function pageFiles(version, { starts = true } = {}) {
  return [
    { path: 'aero/glue.js', data: Buffer.from(`window.order = (window.order || []).concat('glue ${version}');`) },
    {
      path: 'assets/app.js',
      data: Buffer.from(
        `window.order = (window.order || []).concat('app ${version}'); window.shown = '${version}';` +
          (starts ? ' if (!window.holdStart) HomeTVBoot.started();' : ''),
      ),
    },
    { path: 'assets/style.css', data: Buffer.from('.hero { background: url(./hero.png); } .x { background: url("data:image/png;base64,AA"); }') },
    { path: 'assets/hero.png', data: crypto.randomBytes(300) },
  ];
}

function release(version, { minShell = '1.0.0', key = keys.privateKey, starts = true, files } = {}) {
  return makeRelease({ version, minShell, entry: ENTRY, files: files || pageFiles(version, { starts }), privateKey: key });
}

/** The update server: offers one release; `tamper` changes what it sends. */
function server() {
  const srv = { offer: null, online: true, tamper: {}, hits: [] };
  srv.routes = (url) => {
    srv.hits.push(url);
    if (!srv.online) return null;
    const r = srv.offer;
    if (!r) return { status: 404 };
    if (url === MANIFEST) return { body: srv.tamper.manifest || r.manifestBytes };
    if (url === MANIFEST + '.sig') return { body: srv.tamper.sig || r.signature };
    const prefix = SERVER + r.manifest.version + '/';
    if (url.startsWith(prefix)) {
      const p = decodeURIComponent(url.slice(prefix.length));
      if (srv.tamper[p]) return { body: srv.tamper[p] };
      const f = r.files.find((x) => x.path === p);
      return f ? { body: f.data } : { status: 404 };
    }
    return { status: 404 };
  };
  return srv;
}

function makeTv(api, opts = {}) {
  const srv = server();
  const tv = createFakeTv({ api, shellConfig: shellConfig(opts), bundled: BUNDLED, routes: srv.routes });
  return { tv, srv };
}

/** One start of the app: page shown, Home reached (or not), then `after` ms on the clock. */
async function start(tv, after = 0, opts) {
  const app = tv.start(opts);
  await app.ready;
  if (after) await app.tick(after);
  return app;
}

/** A value from the page's own world, as plain data (its arrays have another Array prototype). */
const plain = (x) => JSON.parse(JSON.stringify(x));
const files = (tv) => [...tv.store.files.keys()].sort();

// ---------------------------------------------------------------------------------------------------------------
// The manifest check, on its own (update.js + TweetNaCl in a page-like context)

function checker() {
  const ctx = vm.createContext({ atob: (s) => Buffer.from(s, 'base64').toString('latin1'), TextDecoder });
  vm.runInContext('var window = this; var self = this;', ctx);
  vm.runInContext(SHELL_SCRIPTS['nacl-fast.min.js'], ctx);
  vm.runInContext(SHELL_SCRIPTS['update.js'], ctx);
  vm.runInContext(SHELL_SCRIPTS['boot.js'].replace(/boot\(\);\s*\}\)\(window\);\s*$/, '})(window);'), Object.assign(ctx, {
    document: {},
    location: { href: 'file:///x/index.html' },
  }));
  return (bytes, sig, over = {}) =>
    ctx.HomeTVUpdate.check(ctx.nacl, new Uint8Array(bytes), sig, {
      keys: [keys.publicKey],
      shellVersion: '1.0.0',
      have: ['1.0.0'],
      skip: [],
      compareVersions: ctx.HomeTVBoot.compareVersions,
      ...over,
    });
}

/** Signs any manifest object as page-release does. */
function signed(manifest, key = keys.privateKey) {
  const bytes = Buffer.from(JSON.stringify(manifest));
  return [bytes, crypto.sign(null, bytes, key).toString('base64')];
}

test('manifest: a good one is accepted and parsed', () => {
  const check = checker();
  const r = release('1.1.0');
  const c = check(r.manifestBytes, r.signature);
  assert.equal(c.refused, undefined);
  assert.equal(c.manifest.version, '1.1.0');
  assert.deepEqual(plain(c.manifest.entry), ENTRY);
  assert.equal(c.manifest.files.length, 4);
  assert.match(c.manifest.files[0].sha512, /^[0-9a-f]{128}$/);
});

test('manifest: bad signatures are refused', () => {
  const check = checker();
  const r = release('1.1.0');
  const changed = Buffer.from(r.manifestBytes);
  changed[changed.indexOf('1.1.0')] = '2'.charCodeAt(0);
  assert.equal(check(changed, r.signature).refused, 'bad signature', 'one byte changed');
  assert.equal(check(r.manifestBytes, release('1.1.0', { key: otherKeys.privateKey }).signature).refused, 'bad signature', 'another key');
  assert.equal(check(r.manifestBytes, 'AAAA').refused, 'bad signature', 'too short');
  assert.equal(check(r.manifestBytes, '!!not base64!!').refused, 'bad signature', 'not base64');
  assert.equal(check(r.manifestBytes, r.signature, { keys: [] }).refused, 'bad signature', 'no keys');
  assert.equal(check(r.manifestBytes, r.signature, { keys: [otherKeys.publicKey, keys.publicKey] }).refused, undefined, 'second key');
  const [garbage, sig] = signed('not json'.split(''));
  assert.match(check(Buffer.from('{oops'), sig).refused, /bad signature/);
  assert.match(check(garbage, sig).refused, /not a manifest/);
});

test('manifest: version and app-version rules', () => {
  const check = checker();
  const of = (v, minShell = '1.0.0') => release(v, { minShell });
  const c = (r, over) => check(r.manifestBytes, r.signature, over).refused;
  assert.match(c(of('1.0.0')), /not newer than 1\.0\.0/, 'same as the bundled page');
  assert.match(c(of('0.9.9')), /not newer/, 'older');
  assert.match(c(of('1.2.0'), { have: ['1.0.0', '1.2.0'] }), /not newer than 1\.2\.0/, 'same as one on the TV');
  assert.match(c(of('1.1.0'), { have: ['1.0.0', '1.3.0'] }), /not newer/, 'older than one on the TV');
  assert.equal(c(of('1.10.0'), { have: ['1.0.0', '1.9.0'] }), undefined, 'numbers, not text');
  assert.match(c(of('1.1.0', '1.0.1')), /needs app 1\.0\.1 or newer/, 'needs a newer app');
  assert.equal(c(of('1.1.0', '0.9.0')), undefined, 'an older app is enough');
  assert.match(c(of('1.1.0'), { skip: ['1.1.0'] }), /failed to start before/, 'a skipped version');
});

test('manifest: bad contents are refused even when signed', () => {
  const check = checker();
  const good = release('1.1.0').manifest;
  const with_ = (change) => {
    const m = JSON.parse(JSON.stringify(good));
    change(m);
    return check(...signed(m)).refused;
  };
  assert.match(with_((m) => (m.format = 2)), /format/);
  assert.match(with_((m) => (m.app = 'other')), /another app/);
  assert.match(with_((m) => (m.version = '1.1')), /bad version/);
  assert.match(with_((m) => (m.minShell = 'x')), /bad minShell/);
  for (const bad of ['../evil.js', '/etc/passwd', 'a/../b.js', '.hidden', 'a//b.js', 'a\\b.js', 'C:/x.js', 'a/./b.js']) {
    assert.match(with_((m) => (m.files[0].path = bad)), /bad file path/, bad);
  }
  assert.match(with_((m) => m.files.push({ ...m.files[0] })), /listed twice/);
  assert.match(with_((m) => m.files.push({ ...m.files[0], path: m.files[0].path.toUpperCase() })), /listed twice/);
  assert.match(with_((m) => (m.files[0].size = -1)), /bad size/);
  assert.match(with_((m) => (m.files[0].size = 1.5)), /bad size/);
  assert.match(with_((m) => (m.files[0].sha512 = 'abc')), /bad SHA-512/);
  assert.match(with_((m) => (m.files = [])), /bad file list/);
  assert.match(with_((m) => (m.entry.js = ['missing.js'])), /entry file not in the list/);
  assert.match(with_((m) => (m.entry.js = ['assets/style.css'])), /entry file not in the list/);
  assert.match(with_((m) => (m.entry.js = [])), /bad entry/);
  assert.match(with_((m) => delete m.entry), /bad entry/);
  assert.match(with_((m) => (m.files[0].size = 40 * 1024 * 1024)), /bad size/);
});

test('versions compare as numbers', () => {
  const ctx = vm.createContext({ document: {}, location: { href: 'file:///x/index.html' } });
  vm.runInContext('var window = this;', ctx);
  vm.runInContext(SHELL_SCRIPTS['boot.js'].replace(/boot\(\);\s*\}\)\(window\);\s*$/, '})(window);'), ctx);
  const cmp = ctx.HomeTVBoot.compareVersions;
  assert.equal(cmp('1.10.0', '1.9.9'), 1);
  assert.equal(cmp('1.0.0', '1.0.0'), 0);
  assert.equal(cmp('0.0.1', '0.1.0'), -1);
  assert.equal(cmp('1.0', '1.0.0'), null);
  assert.equal(cmp('1.0.0-beta', '1.0.0'), null);
});

// ---------------------------------------------------------------------------------------------------------------
// The whole path on the fake TV, with both of Samsung's filesystem APIs

for (const api of ['openFile', 'resolve']) {
  test(`${api}: offline first start shows the bundled page and never asks the network before Home`, async () => {
    const { tv, srv } = makeTv(api);
    srv.online = false;
    const app = await start(tv, 0, { before: (ctx) => (ctx.holdStart = true) });
    assert.equal(app.win.shown, 'bundled');
    assert.deepEqual(app.links, ['file:///opt/usr/apps/HmTvSpike0/res/wgt/dist/assets/style.css']);
    await app.tick(120000);
    assert.equal(app.requests.length, 0, 'no request while Home has not shown');
    app.win.HomeTVBoot.started();
    await app.tick(9000);
    assert.equal(app.requests.length, 0, 'none in the first seconds after Home');
    await app.tick(2000);
    assert.equal(app.requests.length, 1);
    assert.match(app.status().lastCheck.result, /no connection/);
    assert.equal(app.status().fs, api);
    assert.deepEqual(app.errors, []);
  });

  test(`${api}: a signed newer page downloads, then shows at the next start`, async () => {
    const { tv, srv } = makeTv(api);
    srv.offer = release('1.1.0');
    const one = await start(tv, 11000);
    assert.equal(one.win.shown, 'bundled', 'the page shown now never changes');
    assert.equal(one.status().lastCheck.result, 'downloaded 1.1.0');
    assert.equal(one.state().next, '1.1.0');
    assert.deepEqual(files(tv), [
      'wgt-private/pages/1.1.0/aero/glue.js',
      'wgt-private/pages/1.1.0/assets/app.js',
      'wgt-private/pages/1.1.0/assets/hero.png',
      'wgt-private/pages/1.1.0/assets/style.css',
    ]);
    assert.deepEqual(tv.store.files.get('wgt-private/pages/1.1.0/assets/hero.png'), srv.offer.files[3].data);
    one.stop();

    srv.online = false; // the next start works offline
    const two = await start(tv);
    assert.equal(two.win.shown, '1.1.0');
    assert.deepEqual(plain(two.win.order), ['glue 1.1.0', 'app 1.1.0'], 'scripts in order');
    assert.equal(two.base, 'file:///opt/usr/home/owner/apps_rw/HmTvSpike0/data/pages/1.1.0/');
    assert.match(two.styles[0], /url\(assets\/hero\.png\)/, 'CSS images point at the CSS file’s folder');
    assert.match(two.styles[0], /url\("data:image/, 'data: URLs untouched');
    assert.equal(two.document.body.innerHTML, '<div id="stage"></div>');
    assert.equal(two.state().good, '1.1.0');
    assert.equal(two.state().next, null);
    assert.equal(two.status().source, 'downloaded');
    assert.deepEqual(two.links, [], 'nothing from the bundled page');
    await two.tick(11000);
    assert.match(two.status().lastCheck.result, /no connection/);
    two.stop();

    srv.online = true;
    const three = await start(tv, 11000);
    assert.equal(three.win.shown, '1.1.0');
    assert.equal(three.status().lastCheck.result, 'up to date');
    assert.equal(srv.hits.filter((u) => u.includes('/1.1.0/')).length, 4, 'files fetched once');
    assert.deepEqual(three.errors, []);
  });

  test(`${api}: a wrong hash or a bad signature is refused and leaves nothing behind`, async () => {
    const { tv, srv } = makeTv(api);
    srv.offer = release('1.1.0');
    srv.tamper['assets/app.js'] = Buffer.from(srv.offer.files[1].data.toString().replace('1.1.0', '6.6.6'));
    const one = await start(tv, 11000);
    assert.match(one.status().lastCheck.result, /assets\/app\.js: SHA-512 doesn't match/);
    assert.deepEqual(files(tv), [], 'the half download is deleted');
    assert.equal(one.state().next, null);
    assert.equal(one.state().partial, null);
    one.stop();

    srv.tamper = { 'assets/hero.png': Buffer.alloc(10) };
    const two = await start(tv, 11000);
    assert.match(two.status().lastCheck.result, /hero\.png: 10 bytes, the manifest says 300/);
    assert.deepEqual(files(tv), []);
    two.stop();

    srv.tamper = { sig: release('1.1.0', { key: otherKeys.privateKey }).signature };
    const three = await start(tv, 11000);
    assert.equal(three.status().lastCheck.result, 'refused: bad signature');
    assert.equal(srv.hits.filter((u) => u.includes('/1.1.0/') && three.requests.some((r) => r.url === u)).length, 0, 'no file fetched');
    three.stop();

    srv.tamper = {};
    srv.offer = release('1.1.0', { minShell: '2.0.0' });
    const four = await start(tv, 11000);
    assert.match(four.status().lastCheck.result, /refused: needs app 2\.0\.0 or newer/);
    four.stop();

    const five = await start(tv);
    assert.equal(five.win.shown, 'bundled');
  });

  test(`${api}: a page that never reaches Home is undone, skipped and not fetched again`, async () => {
    const { tv, srv } = makeTv(api);
    srv.offer = release('1.1.0');
    (await start(tv, 11000)).stop();
    (await start(tv, 11000)).stop(); // 1.1.0 shows and becomes the good page
    srv.offer = release('1.2.0', { starts: false });
    const one = await start(tv, 11000);
    assert.equal(one.state().next, '1.2.0');
    one.stop();

    const two = await start(tv);
    assert.equal(two.win.shown, '1.2.0');
    assert.equal(two.state().trying, '1.2.0');
    await two.tick(29000);
    assert.equal(two.reloaded, 0);
    await two.tick(1000);
    assert.equal(two.reloaded, 1, 'reloads after 30 s without Home');
    assert.deepEqual(two.state().skip, [], 'one failed start: not skipped yet');
    two.stop();

    const again = await start(tv, 30000);
    assert.equal(again.win.shown, '1.2.0', 'a second chance');
    assert.equal(again.reloaded, 1);
    assert.deepEqual(again.state().skip, ['1.2.0'], 'two failed starts in a row: skipped');
    again.stop();

    const three = await start(tv, 11000);
    assert.equal(three.win.shown, '1.1.0', 'back to the previous good page');
    assert.equal(three.status().lastCheck.result, 'refused: version 1.2.0 failed to start before');
    assert.ok(!files(tv).some((f) => f.includes('/1.2.0/')), 'its files are deleted');
    assert.deepEqual(three.errors, []);
  });

  test(`${api}: a new page that dies before Home twice (power off, crash) goes back at the next start`, async () => {
    const { tv, srv } = makeTv(api);
    srv.offer = release('1.1.0', { starts: false });
    (await start(tv, 11000)).stop();
    const crashed = await start(tv);
    assert.equal(crashed.win.shown, '1.1.0');
    crashed.stop(); // no timer, no started(): the TV went off
    const second = await start(tv);
    assert.equal(second.win.shown, '1.1.0', 'one strike: tried again');
    assert.equal(second.status().note, "page 1.1.0 didn't start last time");
    assert.deepEqual(second.state().skip, []);
    second.stop();
    const next = await start(tv);
    assert.equal(next.win.shown, 'bundled');
    assert.deepEqual(next.state().skip, ['1.1.0']);
  });

  test(`${api}: a new page switched off once in its first seconds still becomes the good page`, async () => {
    const { tv, srv } = makeTv(api);
    srv.offer = release('1.1.0');
    (await start(tv, 11000)).stop(); // downloaded
    const dies = { before: (ctx) => (ctx.holdStart = true) };
    const off = await start(tv, 0, dies);
    assert.equal(off.win.shown, '1.1.0');
    off.stop(); // the TV goes off before Home
    const on = await start(tv);
    assert.equal(on.win.shown, '1.1.0');
    assert.equal(on.state().good, '1.1.0');
    assert.deepEqual(on.state().skip, []);
    assert.deepEqual(plain(on.state().fails), { '1.1.0': 0 }, 'a good start clears the strike');
  });

  test(`${api}: a once-good page also gets a second chance, then is dropped`, async () => {
    const { tv, srv } = makeTv(api);
    srv.offer = release('1.1.0');
    (await start(tv, 11000)).stop();
    (await start(tv)).stop(); // 1.1.0 is good now
    srv.online = false;
    const dies = { before: (ctx) => (ctx.holdStart = true) };
    (await start(tv, 0, dies)).stop(); // shows 1.1.0, the TV goes off before Home
    const a = await start(tv, 0, dies);
    assert.equal(a.win.shown, '1.1.0', 'one strike: still the good page');
    a.stop();
    const b = await start(tv);
    assert.equal(b.win.shown, 'bundled', 'two strikes in a row');
    assert.deepEqual(b.state().skip, ['1.1.0']);
  });

  test(`${api}: one good start clears a once-good page's strike`, async () => {
    const { tv, srv } = makeTv(api);
    srv.offer = release('1.1.0');
    (await start(tv, 11000)).stop();
    (await start(tv)).stop();
    const dies = { before: (ctx) => (ctx.holdStart = true) };
    (await start(tv, 0, dies)).stop();
    (await start(tv)).stop(); // a strike, then a good start
    (await start(tv, 0, dies)).stop();
    const c = await start(tv);
    assert.equal(c.win.shown, '1.1.0');
  });

  test(`${api}: at most two pages are kept`, async () => {
    const { tv, srv } = makeTv(api);
    for (const v of ['1.1.0', '1.2.0', '1.3.0']) {
      srv.offer = release(v);
      (await start(tv, 11000)).stop(); // downloads v
      (await start(tv)).stop(); // shows v
    }
    const dirs = [...new Set(files(tv).map((f) => f.split('/')[2]))];
    assert.deepEqual(dirs, ['1.2.0', '1.3.0']);
    const s = JSON.parse(tv.storage.get('hometv.pages'));
    assert.deepEqual(Object.keys(s.pages).sort(), ['1.2.0', '1.3.0']);
    assert.equal(s.good, '1.3.0');
    assert.equal(s.prev, '1.2.0');

    srv.offer = release('1.4.0');
    const app = await start(tv, 11000); // shows 1.3.0, downloads 1.4.0
    assert.equal(app.win.shown, '1.3.0');
    assert.deepEqual([...new Set(files(tv).map((f) => f.split('/')[2]))], ['1.3.0', '1.4.0']);
  });

  test(`${api}: a damaged page on the TV falls back at once, in the same start`, async () => {
    const { tv, srv } = makeTv(api);
    srv.offer = release('1.1.0');
    (await start(tv, 11000)).stop();
    const p = 'wgt-private/pages/1.1.0/assets/app.js';
    tv.store.files.set(p, tv.store.files.get(p).subarray(0, 10));
    const app = await start(tv);
    assert.equal(app.win.shown, 'bundled');
    assert.match(app.status().note, /unreadable: assets\/app\.js is 10 bytes/);
    assert.deepEqual(app.state().skip, ['1.1.0']);
  });

  test(`${api}: a TV that blocks inline scripts keeps the bundled page and stops downloading`, async () => {
    const { tv, srv } = makeTv(api);
    srv.offer = release('1.1.0');
    (await start(tv, 11000)).stop();
    const app = tv.start({
      before: (ctx) => {
        // The probe script doesn't run, as under a strict content security policy.
        const head = ctx.document.head;
        const insert = head.insertBefore.bind(head);
        head.insertBefore = (el, ref) => (el.tagName === 'SCRIPT' && !el.src ? el : insert(el, ref));
      },
    });
    await app.ready;
    assert.equal(app.win.shown, 'bundled');
    assert.match(app.status().note, /inline scripts/);
    assert.equal(app.status().updates, 'off');
    await app.tick(60000);
    assert.equal(app.requests.length, 0);
  });

  test(`${api}: an app built without an update address or key never asks`, async () => {
    for (const opts of [{ updateUrl: '' }, { pubKeys: [] }]) {
      const { tv, srv } = makeTv(api, opts);
      srv.offer = release('1.1.0');
      const app = await start(tv, 60000);
      assert.equal(app.win.shown, 'bundled');
      assert.equal(app.requests.length, 0);
      assert.equal(app.status().updates, 'off');
    }
  });

  test(`${api}: a page needing a newer app than the one installed is not shown`, async () => {
    const { tv, srv } = makeTv(api);
    srv.offer = release('1.1.0');
    (await start(tv, 11000)).stop();
    // The app went back to an older version (reinstalled) while the page stayed.
    tv.shellConfig = shellConfig({ shell: '0.9.0' });
    const app = await start(tv);
    assert.equal(app.win.shown, 'bundled');
  });

  test(`${api}: after a reinstall with a new key, pages signed with the old one go`, async () => {
    const { tv, srv } = makeTv(api);
    srv.offer = release('1.1.0');
    (await start(tv, 11000)).stop();
    (await start(tv)).stop(); // 1.1.0 is good

    // A new app trusting a new key only (the old one lost or leaked): pages signed with the old key aren't shown,
    // and go from the TV once Home shows.
    tv.shellConfig = shellConfig({ pubKeys: [otherKeys.publicKey] });
    srv.online = false;
    const newKey = await start(tv);
    assert.equal(newKey.win.shown, 'bundled');
    await newKey.idle();
    assert.deepEqual(files(tv), []);
    assert.deepEqual(newKey.state().skip, [], 'not skipped: a trusted copy may come back');
    newKey.stop();
  });

  test(`${api}: after a reinstall with a newer own page, that page shows`, async () => {
    const { tv, srv } = makeTv(api);
    srv.offer = release('1.1.0');
    (await start(tv, 11000)).stop();
    (await start(tv)).stop(); // 1.1.0 is good
    srv.online = false;
    tv.shellConfig = shellConfig();
    tv.shellConfig.page.version = '1.1.0';
    const own = await start(tv);
    assert.equal(own.win.shown, 'bundled');
  });

  test(`${api}: after a key change, the same version signed with the new key downloads again`, async () => {
    const { tv, srv } = makeTv(api);
    srv.offer = release('1.1.0');
    (await start(tv, 11000)).stop();
    (await start(tv)).stop(); // 1.1.0 is good, signed with the old key
    tv.shellConfig = shellConfig({ pubKeys: [otherKeys.publicKey] });
    srv.offer = release('1.1.0', { key: otherKeys.privateKey });
    const a = await start(tv, 11000);
    assert.equal(a.win.shown, 'bundled');
    assert.equal(a.status().lastCheck.result, 'downloaded 1.1.0', 'not "up to date"');
    assert.deepEqual(a.state().skip, []);
    a.stop();
    const b = await start(tv);
    assert.equal(b.win.shown, '1.1.0');
    assert.equal(b.state().pages['1.1.0'].key, otherKeys.publicKey);
  });
}

test('a manifest query string is kept and the signature sits beside it', async () => {
  const srv = server();
  srv.offer = release('1.1.0');
  const seen = [];
  const tv = createFakeTv({
    shellConfig: shellConfig({ updateUrl: MANIFEST + '?channel=beta' }),
    bundled: BUNDLED,
    routes: (url, full) => (seen.push(full), srv.routes(url)),
  });
  const app = tv.start();
  await app.ready;
  await app.tick(11000);
  assert.equal(app.status().lastCheck.result, 'downloaded 1.1.0');
  assert.match(seen[0], /manifest\.json\?channel=beta&t=\d+$/);
  assert.match(seen[1], /manifest\.json\.sig\?channel=beta&t=\d+$/);
});

// ---------------------------------------------------------------------------------------------------------------
// The tools

test('page-build: the shell index and the bundled page entry', () => {
  const vite = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>HomeTV</title>
    <script src="./aero/config.js"></script>
    <script defer src="./assets/app.js"></script>
    <link rel="stylesheet" href="./assets/style.css">
  </head>
  <body>
    <div id="stage"></div>
  </body>
</html>`;
  assert.deepEqual(entryFromIndex(vite), { css: ['assets/style.css'], js: ['aero/config.js', 'assets/app.js'], body: '<div id="stage"></div>' });
  const shell = shellIndex(vite);
  assert.match(shell, /<title>HomeTV<\/title>/);
  assert.doesNotMatch(shell, /app\.js|style\.css/);
  assert.match(shell, /<script src="\.\/shell-config\.js"><\/script>\s*<script src="\.\/boot\.js"><\/script>/);
  assert.throws(() => entryFromIndex('<script src="https://x/y.js"></script>'), /only files inside dist/);
  assert.deepEqual(parseKeys(`# comment, with commas\n${keys.publicKey}\n\n${otherKeys.publicKey}, ${keys.publicKey}`), [keys.publicKey, otherKeys.publicKey]);
  assert.throws(() => parseKeys('abc'), /not an Ed25519 public key/);
  assert.throws(() => makeShellConfig({ entry: {}, shell: '1.0.0', page: '1.0.0', updateUrl: 'ftp://x' }), /not an http/);
});

test('page-key: never writes inside the repo; keys sign what TweetNaCl checks', () => {
  assert.throws(
    () => execFileSync(process.execPath, [path.join(root, 'tools', 'page-key.mjs'), '--out', path.join(root, 'x.pem')], { stdio: 'pipe' }),
    (e) => e.status === 1 && /inside the repo/.test(e.stderr.toString()),
  );
  assert.equal(fs.existsSync(path.join(root, 'x.pem')), false);
  assert.equal(rawPublicKey(keys.privateKey), keys.publicKey);
  assert.equal(Buffer.from(keys.publicKey, 'base64').length, 32);
  assert.throws(() => loadPrivateKey({ keyPath: path.join(root, 'tools', 'page-key.mjs') }), /inside the repo/);
  assert.throws(() => loadPrivateKey({}), /No key/);
  assert.equal(loadPrivateKey({ pem: keys.privatePem }).asymmetricKeyType, 'ed25519');
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  assert.throws(() => loadPrivateKey({ pem: rsa }), /Not an Ed25519 key/);
});

test('page-release and page-serve: a release folder a TV can fetch', async () => {
  const work = path.join(root, '.data', `test-release-${process.pid}`);
  try {
    const dist = path.join(work, 'dist');
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
    for (const f of ['index.html', 'boot.js', 'update.js', 'nacl-fast.min.js']) fs.writeFileSync(path.join(dist, f), 'shell');
    fs.writeFileSync(path.join(dist, 'shell-config.js'), `window.HOMETV_SHELL = ${JSON.stringify(shellConfig())};\n`);
    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), BUNDLED['assets/app.js']);
    fs.writeFileSync(path.join(dist, 'assets', 'style.css'), BUNDLED['assets/style.css']);
    const page = readDist(dist);
    assert.deepEqual(page.files.map((f) => f.path), ['assets/app.js', 'assets/style.css'], 'the shell is not part of a page');
    const r = makeRelease({ ...page, version: '1.1.0', minShell: page.shellVersion, privateKey: keys.privateKey });
    const out = path.join(work, 'out');
    writeRelease(out, r);
    const s = await startPageServer({ dir: out, port: 0 });
    try {
      const base = `http://127.0.0.1:${s.port}/`;
      const m = await fetch(base + 'manifest.json?t=1');
      assert.equal(m.headers.get('access-control-allow-origin'), '*');
      const bytes = Buffer.from(await m.arrayBuffer());
      const sig = (await (await fetch(base + 'manifest.json.sig')).text()).trim();
      assert.ok(crypto.verify(null, bytes, crypto.createPublicKey(keys.privateKey), Buffer.from(sig, 'base64')));
      assert.equal(JSON.parse(bytes).version, '1.1.0');
      assert.equal(await (await fetch(base + '1.1.0/assets/app.js')).text(), BUNDLED['assets/app.js']);
      assert.equal((await fetch(base + '..%2F..%2Fpackage.json')).status, 404);
      assert.equal((await fetch(base + '1.1.0/nope.js')).status, 404);
    } finally {
      await s.close();
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});
