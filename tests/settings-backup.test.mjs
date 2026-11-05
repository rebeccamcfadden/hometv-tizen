// HomeTV's own settings backup on the TV (app/src/settingsBackup.ts): each change set in Settings or first run keeps
// the settings as they were, Restore puts them back and is itself undoable, and an unreadable storage is never a
// baseline. `npm test`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './ts-module.mjs';

const { b, ls } = await loadTs({ b: 'settingsBackup.ts', ls: 'launcherSettings.ts' });

const memory = (init = {}) => {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
};
const FIRST = { 'hometv-settings-v1': JSON.stringify({ region: 'se', motion: 'full' }), 'hometv-setup-done': '1', 'hometv-home-row': '[{"id":"netflix","name":"Netflix"}]' };

test('a change set keeps the settings as they were, only when something changed', () => {
  const s = memory(FIRST);
  const visit = b.changeSet(s, 'settings', () => 1000);
  assert.equal(visit.end(), false, 'nothing changed: nothing kept');
  assert.equal(s.getItem(b.PREVIOUS_KEY), null);
  const again = b.changeSet(s, 'settings', () => 2000);
  s.setItem('hometv-settings-v1', JSON.stringify({ region: 'us', motion: 'off' }));
  assert.equal(again.end(), true);
  const prev = b.readPrevious(s);
  assert.equal(prev.why, 'settings');
  assert.equal(prev.at, 2000);
  assert.equal(prev.values['hometv-settings-v1'], FIRST['hometv-settings-v1']);
  assert.equal(prev.values['hometv-utility-moves'], null);
});

test('restore round-trips the settings, and a second restore undoes it', () => {
  const s = memory(FIRST);
  const store = ls.createPrefs(s);
  const visit = b.changeSet(s, 'settings', () => 1);
  store.set({ region: 'us', motion: 'off', screensaverAfter: '15' });
  s.setItem('hometv-home-row', '[]');
  s.setItem('hometv-utility-moves', '{"app:x":"in"}');
  visit.end();
  const changed = new Map(s.map);

  assert.equal(b.restorePrevious(s, 5), true);
  for (const k of b.BACKED_UP_KEYS) assert.equal(s.getItem(k), FIRST[k] ?? null, k);
  store.reload();
  assert.equal(store.get().region, 'se');
  assert.equal(store.get().motion, 'full');
  assert.equal(store.get().screensaverAfter, 'off');

  assert.equal(b.restorePrevious(s, 6), true, 'restore again');
  for (const k of b.BACKED_UP_KEYS) assert.equal(s.getItem(k), changed.get(k) ?? null, k);
  assert.equal(b.readPrevious(s).why, 'restore');
});

test('before first run: restore empties the settings but first run stays done, and a second restore undoes it', () => {
  const s = memory();
  const setup = b.changeSet(s, 'setup', () => 1);
  ls.createPrefs(s).set({ region: 'us' });
  ls.markSetupDone(s);
  assert.equal(setup.end(), true);
  assert.equal(b.restorePrevious(s, 2), true);
  assert.equal(ls.setupDone(s), true, 'first run does not come back');
  assert.equal(ls.loadPrefs(s).region, null);
  for (const k of b.BACKED_UP_KEYS) assert.equal(s.map.has(k), false, k);
  assert.equal(b.restorePrevious(s, 3), true);
  assert.equal(ls.loadPrefs(s).region, 'us');
});

test('an unreadable storage or snapshot is never a baseline, and restore then changes nothing', () => {
  assert.equal(b.exportSettings(null, 1, 'settings'), null);
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => {}, removeItem: () => {} };
  assert.equal(b.exportSettings(broken, 1, 'settings'), null);
  assert.equal(b.changeSet(broken, 'settings').end(), false);
  assert.equal(b.restorePrevious(broken, 1), false);

  const s = memory(FIRST);
  assert.equal(b.restorePrevious(s, 1), false, 'nothing kept yet');
  for (const bad of ['{', '[]', '{"schema":"other","at":1,"why":"settings","values":{}}', '{"schema":"hometv-settings-1","at":1,"why":"settings","values":{"hometv-settings-v1":5}}', '{"schema":"hometv-settings-1","at":1,"why":"x","values":{}}']) {
    s.setItem(b.PREVIOUS_KEY, bad);
    assert.equal(b.readPrevious(s), null, bad);
    assert.equal(b.restorePrevious(s, 1), false, bad);
  }
  for (const k of Object.keys(FIRST)) assert.equal(s.getItem(k), FIRST[k]);
});

test('a failed write puts the settings back as they were', () => {
  const s = memory(FIRST);
  const visit = b.changeSet(s, 'settings', () => 1);
  s.setItem('hometv-settings-v1', '{"region":"us"}');
  visit.end();
  const now = new Map(s.map);
  let writes = 0;
  const flaky = { getItem: s.getItem, removeItem: s.removeItem, setItem: (k, v) => { if (++writes === 2) throw new Error('full'); s.setItem(k, v); } };
  assert.equal(b.restorePrevious(flaky, 2), false);
  for (const k of b.BACKED_UP_KEYS) assert.equal(s.getItem(k), now.get(k) ?? null, k);
});

test('only HomeTV’s own keys are kept', () => {
  const s = memory(Object.assign({ 'hometv-error-log': 'x', other: 'y' }, FIRST));
  const snap = b.exportSettings(s, 1, 'settings');
  assert.deepEqual(Object.keys(snap.values).sort(), ['hometv-home-row', 'hometv-settings-v1', 'hometv-utility-moves']);
  assert.deepEqual(b.BACKED_UP_KEYS.slice(0, 1), [ls.SETTINGS_KEY]);
  assert.ok(!b.BACKED_UP_KEYS.includes(ls.SETUP_KEY), 'a restore never brings first run back');
});
