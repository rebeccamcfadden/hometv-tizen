// The pages service (service/pages.js): the API keys page a phone opens from the TV's QR, over loopback, with fake
// key-check services (tools/fake-keys.mjs: "good" in a key works, "offline" can't be reached, the rest are refused).
// The caller's address is set with X-Test-Remote (the service's testAddresses option). All keys here are fakes.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { startDevPages } from '../tools/dev-service.mjs';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hometv-pages-'));
let clock = Date.now();
const dev = await startDevPages({ port: 0, dataDir, now: () => clock, testAddresses: true, requestDeadlineMs: 400 });
const { rules } = dev.pages;
test.after(() => {
  dev.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const PHONE = '192.168.1.50';
/** Every answer the service gave, to check no key ever comes back. */
const answers = [];

/** One request: { status, headers, text, json }. `from` is the caller's address; `raw` a body sent as it is. */
function call(method, url, { from = '127.0.0.1', code, body, raw, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const h = { 'X-Test-Remote': from, ...headers };
    if (code !== undefined) h.Authorization = 'Bearer ' + code;
    let data = raw;
    if (body !== undefined) {
      data = JSON.stringify(body);
      h['Content-Type'] = 'application/json';
    }
    if (data !== undefined && h['Content-Length'] === undefined && h['Transfer-Encoding'] === undefined) h['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ host: '127.0.0.1', port: dev.port, method, path: url, headers: h }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        answers.push(text);
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          // The page is HTML.
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}

const tv = (url, body) => call(body === undefined && !/hold|release|code|recheck/.test(url) ? 'GET' : 'POST', url, { body });
const hold = () => tv('/tv/keys/hold', {});
const code = async () => (await tv('/tv/keys')).json.code;
const send = (id, key, c) => call('POST', '/keys', { from: PHONE, code: c, body: { id, key } });

const GOOD_TMDB = 'fake.good-tmdb-token.ABCD';
const GOOD_WATCHMODE = 'fake-good-watchmode-WXYZ';

test('the TV screen finds the service and its code', async () => {
  const ping = await tv('/ping');
  assert.equal(ping.json.service, 'hometv-pages');
  const s = (await tv('/tv/keys')).json;
  assert.match(s.code, /^[23456789A-HJKMNP-Z]{4}-[23456789A-HJKMNP-Z]{4}$/);
  assert.equal(s.saving, true);
  assert.equal(s.open, false);
  assert.deepEqual(s.keys.tmdb, { state: 'unset', last4: '' });
});

test('the phone page holds nothing secret and runs only its own script', async () => {
  const c = await code();
  const r = await call('GET', '/keys', { from: PHONE });
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /^text\/html/);
  assert.match(r.headers['content-security-policy'], /default-src 'none'/);
  assert.match(r.text, /Keys for your TV/);
  assert.ok(!r.text.includes(c) && !r.text.includes(c.replace('-', '')));
});

test('only the home network: a public address is refused', async () => {
  for (const from of ['8.8.8.8', '100.64.0.1', '2001:db8::1', '172.32.0.1']) {
    const r = await call('GET', '/keys', { from });
    assert.equal(r.status, 403, from);
  }
  for (const from of ['10.0.0.2', '172.16.5.4', '192.168.0.9', '169.254.1.1', 'fe80::1', 'fd12:3456::1', '::ffff:192.168.1.7']) {
    const r = await call('GET', '/keys', { from });
    assert.equal(r.status, 200, from);
  }
});

test('the TV’s routes answer the TV only: loopback, and not a web page', async () => {
  assert.equal((await call('GET', '/tv/keys', { from: PHONE })).status, 403);
  assert.equal((await call('GET', '/ping', { from: PHONE })).status, 403);
  assert.equal((await call('POST', '/tv/keys/hold', { from: PHONE })).status, 403);
  assert.equal((await call('GET', '/tv/keys', { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await call('GET', '/tv/keys', { headers: { Origin: 'http://192.168.1.50:8080' } })).status, 403);
  const app = await call('GET', '/tv/keys', { headers: { Origin: 'null' } });
  assert.equal(app.status, 200);
  assert.equal(app.headers['access-control-allow-origin'], 'null');
  // On the TV (no dev flag) only the packaged page's origins; a TizenBrew module's http://127.0.0.1:8081 is refused.
  assert.equal(rules.trustedOrigin('null', false), true);
  assert.equal(rules.trustedOrigin('file://', false), true);
  assert.equal(rules.trustedOrigin(undefined, false), true);
  assert.equal(rules.trustedOrigin('http://127.0.0.1:8081', false), false);
  assert.equal(rules.trustedOrigin('http://localhost:5180', false), false);
  assert.equal(rules.trustedOrigin('http://localhost:5180', true), true);
  assert.equal(rules.trustedOrigin('http://localhost.example.com', true), false);
});

test('key routes are closed until the TV’s screen holds them, and close when it lets go', async () => {
  const c = await code();
  assert.equal((await call('GET', '/keys/state', { from: PHONE, code: c })).status, 503);
  assert.equal((await send('tmdb', GOOD_TMDB, c)).status, 503);
  await hold();
  assert.equal((await call('GET', '/keys/state', { from: PHONE, code: c })).status, 200);
  await tv('/tv/keys/release', {});
  assert.equal((await call('GET', '/keys/state', { from: PHONE, code: c })).status, 503);
  await hold();
  clock += rules.HOLD_MS + 1;
  assert.equal((await call('GET', '/keys/state', { from: PHONE, code: c })).status, 503);
});

test('the code is needed, typed any way', async () => {
  await hold();
  const c = await code();
  assert.equal((await call('GET', '/keys/state', { from: PHONE })).status, 401);
  assert.equal((await call('GET', '/keys/state', { from: PHONE, code: 'AAAA-AAAA' })).status, 401);
  const lower = await call('GET', '/keys/state', { from: PHONE, code: c.replace('-', ' ').toLowerCase() });
  assert.equal(lower.status, 200);
  assert.deepEqual(Object.keys(lower.json.keys), ['tmdb', 'watchmode', 'motn']);
});

test('a key is checked with its service, in the header, and kept; only its last four come back', async () => {
  await hold();
  const c = await code();
  const r = await send('tmdb', '  ' + GOOD_TMDB + '\n', c);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.keys.tmdb, { state: 'ok', last4: 'ABCD' });
  const asked = dev.checks.received.filter((x) => x.id === 'tmdb').at(-1);
  assert.equal(asked.headers.authorization, 'Bearer ' + GOOD_TMDB);
  assert.equal(asked.url, '/tmdb/3/authentication');
  assert.ok(!asked.url.includes(GOOD_TMDB));

  const w = await send('watchmode', GOOD_WATCHMODE, c);
  assert.deepEqual(w.json.keys.watchmode, { state: 'ok', last4: 'WXYZ' });
  assert.equal(dev.checks.received.at(-1).headers['x-api-key'], GOOD_WATCHMODE);

  const s = (await tv('/tv/keys')).json;
  assert.equal(s.keys.tmdb.state, 'ok');
  assert.equal(s.keys.watchmode.last4, 'WXYZ');
});

test('a refused key, one the TV can’t check, and one that can’t be a key', async () => {
  await hold();
  const c = await code();
  const bad = await send('motn', 'fake-refused-motn-1111', c);
  assert.deepEqual(bad.json.keys.motn, { state: 'bad', last4: '1111' });
  const off = await send('motn', 'fake-offline-motn-2222', c);
  assert.deepEqual(off.json.keys.motn, { state: 'unreachable', last4: '2222' });
  const asked = dev.checks.received.length;
  const odd = await send('motn', 'has a space 3333', c);
  assert.deepEqual(odd.json.keys.motn, { state: 'bad', last4: '3333' });
  assert.equal(dev.checks.received.length, asked, 'not asked of the service');
  assert.equal((await send('tmdb', 'not/a+jwt', c)).json.keys.tmdb.state, 'bad');
  assert.equal((await send('tmdb', GOOD_TMDB, c)).json.keys.tmdb.state, 'ok');
});

test('a key kept but not reached is checked again as the screen opens, and on OK', async () => {
  const c = await code();
  await hold();
  await send('motn', 'fake-offline-motn-4444', c);
  assert.equal((await tv('/tv/keys')).json.keys.motn.state, 'unreachable');
  // OK on its row: checked again (still unreachable, it says "offline").
  const before = dev.checks.received.length;
  const r = await tv('/tv/keys/recheck', { id: 'motn' });
  assert.equal(r.json.keys.motn.state, 'checking');
  await new Promise((res) => setTimeout(res, 150));
  assert.equal(dev.checks.received.length, before + 1);
  assert.equal((await tv('/tv/keys')).json.keys.motn.state, 'unreachable');
  // The screen opens again later: unreached keys are tried again.
  await tv('/tv/keys/release', {});
  await hold();
  await new Promise((res) => setTimeout(res, 150));
  assert.equal(dev.checks.received.length, before + 2);
});

test('a key that once worked stays working when its service can’t be reached', () => {
  assert.equal(rules.afterCheck('ok', 'unreachable'), 'ok');
  assert.equal(rules.afterCheck('ok', 'bad'), 'bad');
  assert.equal(rules.afterCheck('unreachable', 'unreachable'), 'unreachable');
  assert.equal(rules.fromStatus(204), 'ok');
  assert.equal(rules.fromStatus(403), 'bad');
  assert.equal(rules.fromStatus(429), 'unreachable');
});

test('requests the TV can’t read are refused', async () => {
  await hold();
  const c = await code();
  const post = (opts) => call('POST', '/keys', { from: PHONE, code: c, ...opts });
  assert.equal((await post({ raw: 'x'.repeat(rules.MAX_BODY + 1), headers: { 'Content-Type': 'application/json' } })).status, 413);
  assert.equal((await post({ raw: '{"id":"tmdb"', headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await post({ raw: JSON.stringify({ id: 'tmdb', key: GOOD_TMDB }), headers: { 'Content-Type': 'text/plain' } })).status, 400);
  assert.equal((await post({ raw: '[[[[[[[[[[[]]]]]]]]]]]', headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await post({ body: { id: 'netflix', key: 'fake-good-1' } })).status, 400);
  assert.equal((await post({ body: { id: 'tmdb', key: '   ' } })).status, 400);
  assert.equal((await post({ body: { id: 'tmdb', key: 'g'.repeat(rules.MAX_KEY + 1) } })).status, 413);
  const chunked = await post({ raw: '{}', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } });
  assert.equal(chunked.status, 400);
  assert.equal((await call('DELETE', '/keys', { from: PHONE, code: c })).status, 404);
});

test('a request that trickles in is cut at the deadline', async () => {
  const started = Date.now();
  const closed = await new Promise((resolve) => {
    const s = net.connect(dev.port, '127.0.0.1', () => s.write('GET /keys HTTP/1.1\r\nHost: tv\r\n'));
    s.on('data', () => {});
    s.on('close', () => resolve(Date.now() - started));
    s.on('error', () => {});
  });
  assert.ok(closed < 3000, `closed after ${closed} ms`);
});

test('a name pointed at the TV (DNS rebinding) is refused; the address itself is not', async () => {
  assert.equal((await call('GET', '/tv/keys', { headers: { Host: `attacker.example:${dev.port}` } })).status, 403);
  assert.equal((await call('GET', '/ping', { headers: { Host: `127.0.0.1:${dev.port + 1}` } })).status, 403);
  assert.equal((await call('GET', '/tv/keys', { headers: { Host: `localhost:${dev.port}` } })).status, 200);
  assert.equal((await call('GET', '/keys', { from: PHONE, headers: { Host: `tv.attacker.example:${dev.port}` } })).status, 403);
  assert.equal((await call('GET', '/keys', { from: PHONE, headers: { Host: `192.168.1.40:${dev.port}` } })).status, 200);
  // The TV's routes want loopback in the Host too, not the TV's home address.
  assert.equal((await call('GET', '/tv/keys', { headers: { Host: `192.168.1.40:${dev.port}` } })).status, 403);
  assert.equal(rules.isAddressHost('[fe80::1]:8766'), true);
  assert.equal(rules.isAddressHost('hometv.local:8766'), false);
  assert.equal(rules.isLoopbackHost('[::1]:8766', 8766), true);
  assert.equal(rules.isLoopbackHost('127.0.0.1', 8766), false);
});

test('a port another service holds is reported, so the service can try again', async () => {
  const blocker = http.createServer();
  await new Promise((r) => blocker.listen(0, r));
  const taken = blocker.address().port;
  const inst = dev.pages.create({ port: taken, dataDir });
  const err = await new Promise((r) => inst.start(r));
  assert.equal(err && err.code, 'EADDRINUSE');
  inst.stop();
  await new Promise((r) => blocker.close(r));
  const again = dev.pages.create({ port: taken, dataDir });
  assert.equal(await new Promise((r) => again.start(r)), null);
  again.stop();
});

test('a new code: the old one stops working', async () => {
  await hold();
  const old = await code();
  const fresh = (await tv('/tv/keys/code', {})).json.code;
  assert.notEqual(fresh, old);
  assert.equal((await call('GET', '/keys/state', { from: PHONE, code: old })).status, 401);
  assert.equal((await call('GET', '/keys/state', { from: PHONE, code: fresh })).status, 200);
});

test('the keys and the code survive a restart, in the private file', async () => {
  const c = await code();
  const file = path.join(dataDir, 'hometv-keys-v1.json');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.code, c);
  assert.equal(saved.keys.tmdb.key, GOOD_TMDB);
  assert.equal(saved.keys.tmdb.state, 'ok');
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const again = dev.pages.create({ port: 0, dataDir });
  await new Promise((resolve, reject) => again.start((e) => (e ? reject(e) : resolve())));
  try {
    const s = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: again.port(), path: '/tv/keys' }, (res) => {
        let t = '';
        res.on('data', (d) => (t += d));
        res.on('end', () => resolve(JSON.parse(t)));
      }).on('error', reject);
    });
    assert.equal(s.code, c);
    assert.deepEqual(s.keys.tmdb, { state: 'ok', last4: 'ABCD' });
  } finally {
    again.stop();
  }
});

test('five wrong codes lock the page for five minutes', async () => {
  await hold();
  const c = await code();
  for (let i = 0; i < rules.MAX_WRONG; i++) assert.equal((await call('GET', '/keys/state', { from: PHONE, code: 'WRONG' })).status, 401);
  assert.equal((await call('GET', '/keys/state', { from: PHONE, code: c })).status, 429);
  assert.equal((await send('tmdb', GOOD_TMDB, c)).status, 429);
  assert.equal((await call('GET', '/keys', { from: PHONE })).status, 429);
  clock += rules.LOCKOUT_MS + 1;
  await hold();
  assert.equal((await call('GET', '/keys/state', { from: PHONE, code: c })).status, 200);
});

test('no answer ever held a whole key', () => {
  const keys = [GOOD_TMDB, GOOD_WATCHMODE, 'fake-refused-motn-1111', 'fake-offline-motn-2222', 'fake-offline-motn-4444'];
  assert.ok(answers.length > 20);
  for (const a of answers) for (const k of keys) assert.ok(!a.includes(k), `an answer held ${k}`);
});
