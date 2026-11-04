// The platform's new members (app/src/platform.ts, docs/platform.md) on a pretend Samsung and with no TV at all: the
// connection for the nav's Wi-Fi, the inputs for its Inputs menu, opening the TV's settings, and their safe fallbacks.
// `npm test`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './ts-module.mjs';

const { platform, inputsFrom, deviceName } = await loadTs('platform.ts');

/** A window with `tizen` (or none), and the browser's online state. */
function setTv(tizen, { onLine = true, aero } = {}) {
  const win = new EventTarget();
  if (tizen) win.tizen = tizen;
  if (aero) win.AeroTizen = aero;
  globalThis.window = win;
  Object.defineProperty(globalThis, 'navigator', { value: { onLine, userAgent: 'test' }, configurable: true, writable: true });
}

/** systeminfo answering from a table; a property missing from it answers with the error callback. */
function sysinfo(values, extra = {}) {
  return {
    getPropertyValue(p, ok, err) {
      setTimeout(() => (p in values ? ok(values[p]) : err && err()), 1);
    },
    addPropertyValueChangeListener: () => 7,
    removePropertyValueChangeListener() {},
    ...extra,
  };
}

test('no TV (a PC, TizenBrew’s page): every member answers safely', async () => {
  setTv(null);
  assert.deepEqual(await platform.network(), { kind: 'unknown', signal: null, name: '', online: true });
  setTv(null, { onLine: false });
  assert.deepEqual(await platform.network(), { kind: 'none', signal: null, name: '', online: false });
  assert.equal(await platform.inputs.list(), null);
  assert.equal(await platform.inputs.show({ id: 'HDMI:1', kind: 'hdmi', port: 'HDMI 1', device: '', connected: true, active: false, raw: {} }), 'preview');
  assert.doesNotThrow(() => platform.inputs.leave());
  assert.equal(typeof platform.inputs.onChange(() => {}), 'function');
  const stop = platform.onNetworkChange(() => {});
  assert.doesNotThrow(stop);
  assert.equal(await platform.openTvSettings('network'), false);
  for (const page of ['main', 'network', 'picture', 'sound', 'inputs']) assert.match(platform.settingsWhere(page), /Settings|Source/);
  assert.equal(platform.osVersion(), '');
});

test('the connection: Wi-Fi with its name and signal, a cable, none, and a TV that won’t say', async () => {
  setTv({ systeminfo: sysinfo({ NETWORK: { networkType: 'WIFI' }, WIFI_NETWORK: { ssid: 'Living room', signalStrength: 0.8 } }) });
  assert.deepEqual(await platform.network(), { kind: 'wifi', signal: 0.8, name: 'Living room', online: true });
  setTv({ systeminfo: sysinfo({ NETWORK: { networkType: 'WIFI' }, WIFI_NETWORK: { signalStrength: 7 } }) });
  assert.deepEqual(await platform.network(), { kind: 'wifi', signal: null, name: '', online: true }, 'an odd signal is left out');
  setTv({ systeminfo: sysinfo({ NETWORK: { networkType: 'WIFI' } }) });
  assert.equal((await platform.network()).kind, 'wifi', 'WIFI_NETWORK refused');
  setTv({ systeminfo: sysinfo({ NETWORK: { networkType: 'ETHERNET' } }) }, { onLine: false });
  assert.deepEqual(await platform.network(), { kind: 'ethernet', signal: null, name: '', online: false });
  setTv({ systeminfo: sysinfo({ NETWORK: { networkType: 'NONE' } }) });
  assert.deepEqual(await platform.network(), { kind: 'none', signal: null, name: '', online: false });
  setTv({ systeminfo: sysinfo({}) });
  assert.equal((await platform.network()).kind, 'unknown', 'NETWORK refused');
  setTv({
    systeminfo: {
      getPropertyValue() {
        throw new Error('not supported');
      },
    },
  });
  assert.equal((await platform.network()).kind, 'unknown', 'a throwing TV');
});

test('a TV that never answers: the fallback after a moment, not a hang', async () => {
  setTv({ systeminfo: { getPropertyValue() {} } });
  const t0 = Date.now();
  assert.equal((await platform.network()).kind, 'unknown');
  assert.equal(await platform.inputs.list(), null);
  assert.ok(Date.now() - t0 < 7000);
});

test('device names: the TV’s placeholders aren’t names (AeroTizen’s filter)', () => {
  assert.equal(deviceName({ type: 'HDMI', editName: 'PlayStation 5' }), 'PlayStation 5');
  assert.equal(deviceName({ type: 'HDMI', editName: '  Apple   TV ' }), 'Apple TV');
  for (const n of ['HDMI 2', 'HDMI-1', 'hdmi_3', 'Unknown device', 'No device', 'Disconnected', 'Ingresso HDMI 1', '', '   ']) {
    assert.equal(deviceName({ type: 'HDMI', editName: n }), '', n);
  }
  assert.equal(deviceName({ type: 'AV', editName: 'VCR' }), '', 'names only for HDMI, as the TV gives them');
  assert.equal(deviceName({ type: 'HDMI' }), '');
});

test('the inputs list: one per port, names kept, media left out, HDMI connected first, Live TV last', () => {
  const list = inputsFrom(
    {
      connected: [
        { type: 'TV', number: 1 },
        { type: 'HDMI', number: 2, editName: 'PlayStation 5' },
      ],
      disconnected: [
        { type: 'HDMI', number: 1, editName: 'HDMI 1' },
        { type: 'HDMI', number: 2, editName: 'HDMI 2' },
        { type: 'HDMI', number: 3, editName: 'Soundbar', signal: true },
        { type: 'MEDIA', number: 1 },
        { type: 'AV', number: 1 },
      ],
    },
    { type: 'HDMI', number: 2 },
  );
  assert.deepEqual(
    list.map((i) => [i.port, i.device, i.connected, i.active]),
    [
      ['HDMI 2', 'PlayStation 5', true, true],
      ['HDMI 3', 'Soundbar', true, false],
      ['HDMI 1', '', false, false],
      ['AV 1', '', false, false],
      ['Live TV', '', true, false],
    ],
  );
  assert.deepEqual(inputsFrom(null, null), []);
});

test('showing an input: HDMI in a full-screen TV window, Live TV through AeroTizen’s handoff, failures in words', async () => {
  const calls = [];
  const tvwindow = {
    getSource: () => ({ type: 'TV', number: 1 }),
    setSource(src, ok, err) {
      calls.push(['setSource', src.type, src.number]);
      setTimeout(src.number === 9 ? err : ok, 1);
    },
    show(ok, err, rect) {
      calls.push(['show', rect.join(' ')]);
      setTimeout(ok, 1);
    },
    hide(ok) {
      calls.push(['hide']);
      ok();
    },
  };
  let live = null;
  setTv(
    { systeminfo: sysinfo({ VIDEOSOURCE: { connected: [{ type: 'HDMI', number: 2, editName: 'Xbox' }, { type: 'TV', number: 1 }] } }), tvwindow },
    { aero: { homewatch: { openNativeLiveTV: (src) => ((live = src), true) } } },
  );
  const list = await platform.inputs.list();
  assert.deepEqual(list.map((i) => [i.port, i.device, i.active]), [
    ['HDMI 2', 'Xbox', false],
    ['Live TV', '', true],
  ]);
  assert.equal(await platform.inputs.show(list[0]), '');
  assert.deepEqual(calls, [
    ['setSource', 'HDMI', 2],
    ['show', '0px 0px 1920px 1080px'],
  ]);
  platform.inputs.leave();
  assert.deepEqual(calls[2], ['hide']);
  assert.equal(await platform.inputs.show(list[1]), 'left');
  assert.deepEqual(live, { type: 'TV', number: 1 });
  const bad = { ...list[0], raw: { type: 'HDMI', number: 9 } };
  assert.equal(await platform.inputs.show(bad), 'the TV couldn’t switch to it');
  setTv({ systeminfo: sysinfo({}) });
  assert.equal(await platform.inputs.show(list[0]), 'this TV doesn’t let apps show its inputs');
});

test('the TV’s settings open only when the TV lists Samsung’s Settings app', async () => {
  const launched = [];
  const application = (apps) => ({
    launchAppControl() {},
    getAppsInfo: (ok) => setTimeout(() => ok(apps), 1),
    launch: (id, ok) => {
      launched.push(id);
      setTimeout(ok, 1);
    },
  });
  setTv({ application: application([{ id: 'org.tizen.netflix-app', name: 'Netflix' }]) });
  assert.equal(await platform.openTvSettings('network'), false);
  assert.deepEqual(launched, [], 'nothing launched blind');
  setTv({ application: application([{ id: 'org.tizen.settings', name: 'Settings' }]) });
  assert.equal(await platform.openTvSettings('network'), true);
  assert.deepEqual(launched, ['org.tizen.settings']);
});

test('the TV software’s version, only when it looks like one', () => {
  setTv({ systeminfo: { getCapability: () => '6.5' } });
  assert.equal(platform.osVersion(), '6.5');
  setTv({ systeminfo: { getCapability: () => 'T-KTMAKUC-1234.5' } });
  assert.equal(platform.osVersion(), '');
  setTv({
    systeminfo: {
      getCapability() {
        throw new Error('no');
      },
    },
  });
  assert.equal(platform.osVersion(), '');
});
