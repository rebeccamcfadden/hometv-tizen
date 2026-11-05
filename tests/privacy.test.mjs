// Settings › Privacy's data (app/src/privacy/): the switches from docs/privacy.md, the TV's year, the ticks and their
// saved state, the apps report (never offering removal) and the re-check. Plus the platform members it reads.
// `npm test`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTs } from './ts-module.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { switches, store, apps, rc } = await loadTs({
  switches: 'privacy/switches.ts',
  store: 'privacy/store.ts',
  apps: 'privacy/apps.ts',
  rc: 'privacy/recheck.ts',
});
const { platform } = await loadTs('platform.ts');

function memory(initial = {}) {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => (data[k] = String(v)) };
}

test('every switch says what to do, what it stops, what it can break and how to undo it', () => {
  const ids = new Set();
  for (const s of switches.SWITCHES) {
    assert.ok(!ids.has(s.id), `${s.id} twice`);
    ids.add(s.id);
    for (const f of ['name', 'turn', 'stops', 'breaks', 'undo']) assert.ok(typeof s[f] === 'string' && s[f].trim().length > 2, `${s.id}.${f}`);
    assert.ok(switches.SECTIONS.some((sec) => sec.id === s.section), `${s.id}: section ${s.section}`);
    for (const y of s.years || []) assert.ok(switches.YEAR_GROUPS.includes(y));
  }
  for (const sec of switches.SECTIONS) for (const y of switches.YEAR_GROUPS) assert.ok(sec.where[y] && sec.where[y].length > 5, `${sec.id} ${y}`);
});

test('the switches docs/privacy.md names are all there, and Smart Hub’s terms are a "leave agreed"', () => {
  const doc = fs.readFileSync(path.join(root, 'docs', 'privacy.md'), 'utf8');
  for (const name of ['Viewing Information Services', 'Interest-Based Advertisement', 'Voice Recognition Services', 'Start with Smart Hub Home', 'Autorun Samsung TV Plus', 'Autorun Last App']) {
    assert.ok(doc.includes(name), `privacy.md names ${name}`);
    assert.ok(switches.SWITCHES.some((s) => s.name === name), `checklist has ${name}`);
  }
  const terms = switches.SWITCHES.find((s) => s.id === 'smart-hub-terms');
  assert.equal(terms.leave, true);
  assert.match(terms.turn, /Leave agreed/);
  assert.match(terms.breaks, /every app/);
});

test('each year gets its own list and names', () => {
  const ids = (y) => switches.switchesFor(y).map((s) => s.id);
  assert.ok(!ids('y2017').includes('vision-ai'));
  assert.ok(!ids('y2022').includes('vision-ai'));
  assert.ok(ids('y2025').includes('vision-ai'));
  for (const y of switches.YEAR_GROUPS) assert.ok(ids(y).includes('acr') && ids(y).includes('smart-hub-terms') && ids(y).includes('dns'));
  const ads = switches.SWITCHES.find((s) => s.id === 'interest-ads');
  assert.equal(switches.nameFor(ads, 'y2025'), 'Personalized ads');
  assert.equal(switches.nameFor(ads, 'y2022'), 'Interest-Based Advertisement');
  const start = switches.SWITCHES.find((s) => s.id === 'start-smart-hub');
  assert.equal(switches.nameFor(start, 'y2017'), 'Autorun Smart Hub');
});

test('the year from a model code', () => {
  const cases = {
    UN55TU7000: 2020,
    GU65TU7179UXZG: 2020,
    UE65AU7172UXXH: 2021,
    QE75Q60BAUXXC: 2022,
    QE50LS01BAUXXH: 2022,
    QE65S90CATXZT: 2023,
    GU85DU7179UXZG: 2024,
    UN65U8000F: 2025,
    QE32LS03TCUXZT: 2020,
  };
  for (const [m, y] of Object.entries(cases)) assert.equal(switches.yearFromModel(m), y, m);
  for (const m of ['', 'UE55NU7400', 'Samsung TV', 'TIZEN']) assert.equal(switches.yearFromModel(m), null, m);
});

test('the year from the software, the model, or the person', () => {
  assert.equal(switches.yearFromSoftware('6.5'), 2022);
  assert.equal(switches.yearFromSoftware('6.0'), 2021);
  assert.equal(switches.yearFromSoftware('9.0'), 2025);
  assert.equal(switches.yearFromSoftware('10.0'), 2025);
  assert.equal(switches.yearFromSoftware(''), null);
  assert.equal(switches.yearFromSoftware('2.4'), null);
  assert.equal(switches.groupForYear(2016), 'y2017');
  assert.equal(switches.groupForYear(2021), 'y2017');
  assert.equal(switches.groupForYear(2022), 'y2022');
  assert.equal(switches.groupForYear(2024), 'y2022');
  assert.equal(switches.groupForYear(2026), 'y2025');

  // The software wins: the menus follow it on an updated older TV.
  assert.deepEqual(switches.guessYear({ osVersion: '7.0', model: 'UE65AU7172UXXH' }), { group: 'y2022', from: 'software', year: 2023 });
  assert.deepEqual(switches.guessYear({ osVersion: '', model: 'UE65AU7172UXXH' }), { group: 'y2017', from: 'model', year: 2021 });
  const none = switches.guessYear({ osVersion: '', model: '' });
  assert.deepEqual(none, { group: null, from: null, year: null });
  assert.equal(switches.yearToShow(null, none), null, 'unknown until the person picks');
  assert.equal(switches.yearToShow('y2025', none), 'y2025');
  assert.equal(switches.yearToShow('y2017', switches.guessYear({ osVersion: '9.0', model: '' })), 'y2017', 'the pick overrides');
});

test('ticks persist, with the picked year and what the TV looked like', () => {
  const mem = memory();
  const readout = { apps: [{ id: 'a', name: 'A' }], full: true, osVersion: '6.5', model: 'QE55Q60BAUXXU' };
  const p = store.createPrivacy(mem);
  let calls = 0;
  p.on(() => calls++);
  p.setYear('y2022');
  p.toggle('acr', 1000, readout);
  p.toggle('voice', 2000, null);
  assert.equal(calls, 3);
  assert.ok(p.isTicked('acr') && p.isTicked('voice'));

  const again = store.createPrivacy(mem);
  assert.equal(again.get().year, 'y2022');
  assert.deepEqual(again.get().ticks, { acr: 1000, voice: 2000 });
  assert.deepEqual(again.get().snapshot, { at: 1000, ...readout }, 'a tick without a readout keeps the last one');

  again.toggle('acr', 3000, readout);
  assert.equal(store.createPrivacy(mem).isTicked('acr'), false, 'untick persists');
  assert.ok(mem.data[store.PRIVACY_KEY]);
});

test('bad or missing saved state reads as empty', () => {
  const empty = { year: null, ticks: {}, snapshot: null };
  assert.deepEqual(store.loadPrivacy(null), empty);
  assert.deepEqual(store.loadPrivacy(memory()), empty);
  assert.deepEqual(store.loadPrivacy(memory({ [store.PRIVACY_KEY]: '{oops' })), empty);
  assert.deepEqual(store.loadPrivacy(memory({ [store.PRIVACY_KEY]: JSON.stringify({ year: 'y1999', ticks: { a: 'x', b: 5 }, snapshot: { at: 'no' } }) })), {
    year: null,
    ticks: { b: 5 },
    snapshot: null,
  });
  const broken = { getItem: () => null, setItem: () => { throw new Error('full'); } };
  assert.doesNotThrow(() => store.createPrivacy(broken).toggle('acr', 1, null));
});

test('the apps report: known ids in their bucket, the rest unknown, nothing ever removable', () => {
  const tv = [
    { id: 'org.tizen.acr-service-app', name: 'ACR' },
    { id: 'org.tizen.ADPlayer', name: 'ADPlayer' },
    { id: 'org.tizen.netflix-app', name: 'Netflix' },
    { id: 'ZODRT12q2l.SamsungAccount', name: 'Account' },
    { id: 'HmTvSpike0.HomeTV', name: 'HomeTV' },
    { id: 'abc123.SomeGame', name: 'Some game' },
    { id: 'abc456.Disney', name: 'Disney+' },
    { id: 'org.tizen.ADPlayerX', name: 'Lookalike' },
    { id: 'org.tizen.netflix-app', name: 'Netflix again' },
  ];
  const r = apps.bucketApps(tv, platform.knownApps, ['abc456.Disney']);
  assert.deepEqual(r.tracking.map((a) => a.id), ['org.tizen.acr-service-app']);
  assert.deepEqual(r.ads.map((a) => a.id), ['org.tizen.ADPlayer']);
  assert.deepEqual(r.keep.map((a) => a.id), ['org.tizen.netflix-app', 'ZODRT12q2l.SamsungAccount', 'HmTvSpike0.HomeTV', 'abc456.Disney']);
  assert.deepEqual(r.unknown.map((a) => a.id), ['abc123.SomeGame', 'org.tizen.ADPlayerX'], 'a lookalike id is not a known one');
  assert.deepEqual(r.voice, []);
  assert.deepEqual(r.extras, []);
  assert.equal(apps.reportCount(r), 8, 'duplicates once');
  for (const b of apps.BUCKET_ORDER) for (const a of r[b]) assert.equal(a.removable, false, `${a.id} removable`);
  for (const b of apps.BUCKET_ORDER) assert.ok(!/uninstall|disable it|remove it/i.test(apps.BUCKETS[b].note), b);
});

test('the known ids are ones this repo documents elsewhere', () => {
  for (const k of platform.knownApps) {
    const id = k.match.replace(/\.$/, '');
    let found = '';
    try {
      found = execFileSync('git', ['grep', '-l', '-F', id, '--', '.', ':!app/src/platform.ts', ':!tests/privacy.test.mjs', ':!tests/service.test.mjs'], { cwd: root, encoding: 'utf8' });
    } catch (e) {
      found = '';
    }
    assert.ok(found.trim(), `${id} documented outside platform.ts`);
    assert.ok(apps.BUCKET_ORDER.includes(k.bucket) && k.bucket !== 'unknown');
  }
});

test('the re-check: what changed since the last tick', () => {
  const before = { at: 1, apps: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], full: true, osVersion: '6.5', model: 'M' };
  const same = rc.recheck(before, { apps: [{ id: 'b', name: 'B' }, { id: 'a', name: 'A' }], full: true, osVersion: '6.5', model: 'M' });
  assert.equal(same.comparable, true);
  assert.deepEqual([same.added, same.removed], [[], []]);
  assert.match(same.lines.join(' '), /Nothing HomeTV can see has changed/);

  const changed = rc.recheck(before, { apps: [{ id: 'a', name: 'A' }, { id: 'c', name: 'TV Plus' }, { id: 'd', name: 'D' }], full: true, osVersion: '7.0', model: 'M' });
  assert.deepEqual(changed.added.map((a) => a.id), ['c', 'd']);
  assert.deepEqual(changed.removed.map((a) => a.id), ['b']);
  assert.equal(changed.countBefore, 2);
  assert.equal(changed.countNow, 3);
  assert.equal(changed.softwareChanged, true);
  assert.match(changed.lines.join(' '), /6\.5 → 7\.0/);
  assert.match(changed.lines.join(' '), /New since then: TV Plus, D/);

  const nothing = rc.recheck(null, { apps: [], full: true, osVersion: '', model: '' });
  assert.equal(nothing.comparable, false);
  assert.match(nothing.lines[0], /tick a switch first/);

  const kinds = rc.recheck(before, { apps: [{ id: 'a', name: 'A' }], full: false, osVersion: '6.5', model: 'M' });
  assert.equal(kinds.comparable, false, 'a visible-only list isn’t compared with a full one');
  assert.deepEqual(kinds.removed, []);

  const unreadable = rc.recheck(before, { apps: null, full: false, osVersion: '', model: '' });
  assert.equal(unreadable.comparable, false);
  assert.match(rc.AFTER_UPDATE_NOTE, /update|factory reset/);
});

test('the TV’s model code and app list, and their fallbacks', async () => {
  globalThis.window = new EventTarget();
  assert.equal(platform.model(), '');
  assert.equal(await platform.appList(), null);
  globalThis.window.tizen = {
    systeminfo: { getCapability: (k) => (k === 'http://tizen.org/system/model_name' ? 'QE55Q60BAUXXU' : '6.5') },
    application: { getAppsInfo: (ok) => setTimeout(() => ok([{ id: 'org.tizen.ADPlayer', name: 'ADPlayer', show: false }, { id: 'x.Y' }, null]), 1) },
  };
  assert.equal(platform.model(), 'QE55Q60BAUXXU');
  assert.deepEqual(await platform.appList(), [{ id: 'org.tizen.ADPlayer', name: 'ADPlayer' }, { id: 'x.Y', name: 'x.Y' }]);
  globalThis.window.tizen = { systeminfo: { getCapability: () => '<script>' }, application: { getAppsInfo: (ok, err) => err() } };
  assert.equal(platform.model(), '');
  assert.equal(await platform.appList(), null);
});
