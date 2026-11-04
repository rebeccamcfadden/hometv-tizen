// The service end to end, run as TizenBrew runs it, against the fake TV (tools/mock-tizen.mjs, a 2019 Samsung) and
// fake Samsung servers. `npm test`.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startDevService } from '../tools/dev-service.mjs';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hometv-tizen-'));
const dev = await startDevService({ port: 0, dataDir });
const base = `http://127.0.0.1:${dev.port}`;
test.after(() => {
  dev.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const get = (p) => fetch(base + p).then((r) => r.json());
const post = (p, body) =>
  fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

test('ping says the TV functions are there', async () => {
  const r = await get('/ping');
  assert.equal(r.ok, true);
  assert.equal(r.tizen, true);
});

test('apps marks what the TV has installed', async () => {
  const r = await get('/apps');
  const by = Object.fromEntries(r.apps.map((a) => [a.key, a.installed]));
  assert.equal(r.listed, true);
  assert.equal(by.netflix, true);
  assert.equal(by.hulu, false);
});

test('launch falls back to the older id on an older TV, and records it', async () => {
  const r = await post('/launch', { app: 'netflix' });
  assert.equal(r.ok, true);
  assert.equal(r.id, '11101200001');
  assert.equal(r.tried.length, 2);
  assert.match(r.tried[0].error, /NotFoundError/);
  const launches = dev.calls.filter((c) => c.fn === 'launch').map((c) => c.id);
  assert.deepEqual(launches.slice(-2), ['3201907018807', '11101200001']);
  const results = await get('/results');
  assert.equal(results.at(-1).check, 'launch:netflix');
});

test('launch says when no id works', async () => {
  const r = await post('/launch', { app: 'hulu' });
  assert.equal(r.ok, false);
  assert.equal(r.id, null);
});

test('apps/all lists the apps a person would open, by name, without the firmware’s own parts', async () => {
  const r = await get('/apps/all');
  assert.equal(r.listed, true);
  const names = r.apps.map((a) => a.name);
  assert.deepEqual(names, names.slice().sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1)));
  for (const want of ['Netflix', 'YouTube', 'TizenBrew', 'Samsung TV Plus', 'SmartThings', 'Twitch']) assert.ok(names.includes(want), want);
  assert.ok(!names.includes('Settings'), 'not a store app');
  assert.ok(!names.includes('Fake background service'), 'a service');
  assert.equal(r.apps.filter((a) => a.name === 'Netflix')[0].id, '11101200001');
});

test('apps/all keeps the streaming apps a Samsung comes with under firmware-style ids', () => {
  const apps = dev.service.realApps([
    { id: 'org.tizen.netflix-app', packageId: 'org.tizen.netflix-app', name: 'Netflix' },
    { id: 'org.tizen.primevideo', packageId: 'org.tizen.primevideo', name: 'Prime Video' },
    { id: 'com.samsung.tv.aria-video', packageId: 'com.samsung.tv.aria-video', name: 'Apple TV' },
    { id: '9Ur5IzDKqV.TizenYouTube', packageId: '9Ur5IzDKqV', name: 'YouTube' },
    { id: 'org.tizen.browser', packageId: 'org.tizen.browser', name: 'Internet' },
    { id: 'AbCdEfGhIj.Hidden', packageId: 'AbCdEfGhIj', name: 'Hidden', show: false },
  ]);
  // The service runs in its own VM context: compare as plain JSON.
  assert.deepEqual(JSON.parse(JSON.stringify(apps.map((a) => a.name))), ['Apple TV', 'Netflix', 'Prime Video', 'YouTube']);
});

test('launch by id opens an app All apps lists, and nothing else', async () => {
  const r = await post('/launch', { id: 'FakeTwtch1.Twitch' });
  assert.equal(r.ok, true);
  assert.equal(r.id, 'FakeTwtch1.Twitch');
  assert.equal(dev.calls.filter((c) => c.fn === 'launch').at(-1).id, 'FakeTwtch1.Twitch');
  const before = dev.calls.length;
  const refused = await post('/launch', { id: 'org.tizen.settings' });
  assert.equal(refused.ok, false);
  assert.match(refused.tried[0].error, /not an app this TV lists/);
  assert.equal(dev.calls.filter((c, i) => i >= before && c.fn === 'launch').length, 0);
});

test('info reports model, Tizen and Node versions', async () => {
  const r = await post('/check/info', {});
  assert.equal(r.ok, true);
  assert.equal(r.detail.tizen, '5.0');
  assert.match(r.detail.node, /^v\d+/);
});

test('title link by app control sends the web link to the app', async () => {
  const r = await post('/check/linkAppControl', { app: 'netflix' });
  assert.equal(r.ok, true);
  const call = dev.calls.filter((c) => c.fn === 'launchAppControl').at(-1);
  assert.equal(call.uri, 'https://www.netflix.com/title/80057281');
  assert.equal(call.operation, 'http://tizen.org/appcontrol/operation/view');
});

test('title link by the remote socket sends a DEEP_LINK launch, and keeps the token out', async () => {
  const r = await post('/check/linkRemote', { app: 'netflix' });
  assert.equal(r.ok, true, JSON.stringify(r.detail));
  const msg = dev.remote.received.at(-1);
  assert.equal(msg.params.event, 'ed.apps.launch');
  assert.equal(msg.params.data.action_type, 'DEEP_LINK');
  assert.equal(msg.params.data.metaTag, 'm=80057281');
  assert.ok(!JSON.stringify(r).includes('secret-token'));
});

test('YouTube by DIAL posts v=<id>', async () => {
  const r = await post('/check/linkDial', { app: 'youtube' });
  assert.equal(r.ok, true);
  assert.equal(r.detail.status, 201);
  assert.equal(dev.dial.received.at(-1).body, 'v=aqz-KE-bpKQ');
});

test('timing reads the Chromium version from the user agent', async () => {
  const r = await post('/check/timing', { homeShownMs: 420, userAgent: 'Mozilla/5.0 (SMART-TV; Tizen 5.0) Chrome/63.0.3239.84 TV Safari/537.36' });
  assert.equal(r.detail.chromium, 63);
  assert.equal(r.detail.homeShownMs, 420);
});

test('the report is plain HTML and text, and results survive in the data file', async () => {
  const html = await fetch(base + '/report').then((r) => r.text());
  assert.match(html, /HomeTV checks/);
  const text = await fetch(base + '/report.txt').then((r) => r.text());
  assert.match(text, /launch:netflix yes/);
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'results.json'), 'utf8'));
  assert.ok(saved.length >= 5);
});

test('unknown checks are refused', async () => {
  const r = await fetch(base + '/check/nope', { method: 'POST' });
  assert.equal(r.status, 404);
});
