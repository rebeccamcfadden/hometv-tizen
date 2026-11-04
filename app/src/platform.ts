// The Samsung side of the bridge (docs/platform.md): what differs between TV platforms and isn't the app list or
// opening apps. Screens and the shell never call `tizen` or AeroTizen themselves; they use `bridge.platform`.
// An LG copy replaces this file (and bridge.ts, pageChecks.ts) and keeps the same shape.

import type { Key } from './shell/app';

type Tz = {
  ApplicationControl: new (operation: string) => unknown;
  application: { launchAppControl(c: unknown, id: string, ok: null, err: null): void };
  tvinputdevice?: { registerKey(name: string): void };
  systeminfo?: {
    getPropertyValue(p: string, ok: (v: { ipAddress?: string }) => void, err?: () => void): void;
  };
  filesystem?: {
    /** Tizen 5.0 and newer. */
    openFile?(path: string, mode: 'r'): { readString(): string; close(): void };
    /** Older, and deprecated from Tizen 5.0. */
    resolve?(path: string, ok: (f: { readAsText(ok: (text: string) => void, err: () => void, encoding: string): void }) => void, err: () => void, mode: 'r'): void;
  };
};

const tz = (): Tz | null => (window as unknown as { tizen?: Tz }).tizen || null;

/** The remote's keys the shell understands, by keyCode: Samsung's remote (TVInputDevice docs) and a PC keyboard. */
const KEYS: Record<number, Key> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'ok',
  10009: 'back', // Return on the Samsung remote
  27: 'back', // Esc
  8: 'back', // Backspace
};

/** The remote's other buttons by name, as keyCodes (Samsung's TVInputDevice names in comments). */
const BUTTONS = {
  red: 403, // ColorF0Red
  green: 404, // ColorF1Green
  yellow: 405, // ColorF2Yellow
  blue: 406, // ColorF3Blue
  info: 457, // Info
};
export type Button = keyof typeof BUTTONS;

/** Samsung's names for the buttons that reach a page only once registered. */
const TIZEN_NAMES: Record<Button | 'digits', string[]> = {
  red: ['ColorF0Red'],
  green: ['ColorF1Green'],
  yellow: ['ColorF2Yellow'],
  blue: ['ColorF3Blue'],
  info: ['Info'],
  digits: '0123456789'.split(''),
};
const registered: Record<string, boolean> = {};

/** The key pages service (service/pages.js), the own app's second background service. */
const PAGES_SERVICE_ID = 'HmTvSpike0.HomeTVPages';
/** The service's TOKEN_FILE, in the app's private folder (service/pages.js). */
const TOKEN_FILE = 'wgt-private/hometv-pages-tv-token';

export const platform = {
  /** Shown to people: "Samsung", in "Samsung app", the checks and reports. */
  brand: 'Samsung',
  /** The TV's software, for the checks screen: "Tizen 6.5". */
  os: 'Tizen',
  keys: KEYS,
  buttons: BUTTONS,

  /** Asks the TV to send these buttons to the page (Samsung sends most only once registered). Safe to call again. */
  registerButtons(names: (Button | 'digits')[]): void {
    const t = tz();
    if (!t || !t.tvinputdevice) return;
    for (const n of names) {
      for (const k of TIZEN_NAMES[n]) {
        if (registered[k]) continue;
        registered[k] = true;
        try {
          t.tvinputdevice.registerKey(k);
        } catch (e) {
          // This remote has no such button; the screens have another way.
        }
      }
    }
  },

  /** false only when the TV says it's offline. */
  online: (): boolean => navigator.onLine !== false,

  /** Tells the installed app's loader (app/loader/boot.js) the page works; its updater may then look for a newer one. */
  started(): void {
    const boot = (window as unknown as { HomeTVBoot?: { started(): void } }).HomeTVBoot;
    if (boot) boot.started();
  },

  /** The key page's TV side (screens/keys.ts): where its service runs and how the screen talks to it. */
  keyPages: {
    /** On a real TV (only the TV's port is tried), or a PC. */
    onTv: (): boolean => !!tz(),
    /** Starts the service if it isn't running yet (as AeroTizen starts its watcher). */
    start(): void {
      const t = tz();
      if (!t) return;
      try {
        t.application.launchAppControl(new t.ApplicationControl('http://tizen.org/appcontrol/operation/service'), PAGES_SERVICE_ID, null, null);
      } catch (e) {
        // Not this app's package (TizenBrew): the module has no pages service.
      }
    },
    /**
     * The screen's token: on the TV from the app's private folder, which only HomeTV can read; on a PC (`npm run dev`)
     * from the dev server, which has it from the service it started. "" when it can't be read.
     */
    token(): Promise<string> {
      const t = tz();
      const fsys = t && t.filesystem;
      if (!fsys) {
        return new Promise((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', '/__hometv/pages-token');
          xhr.timeout = 1500;
          xhr.onload = () => resolve(xhr.status === 200 ? xhr.responseText.trim() : '');
          xhr.onerror = xhr.ontimeout = () => resolve('');
          xhr.send();
        });
      }
      if (fsys.openFile) {
        try {
          const file = fsys.openFile(TOKEN_FILE, 'r');
          try {
            return Promise.resolve(file.readString().trim());
          } finally {
            file.close();
          }
        } catch (e) {
          // Not there yet, or this TV only has the older calls below.
        }
      }
      return new Promise((resolve) => {
        if (!fsys.resolve) return resolve('');
        try {
          fsys.resolve(TOKEN_FILE, (f) => f.readAsText((text) => resolve(String(text || '').trim()), () => resolve(''), 'UTF-8'), () => resolve(''), 'r');
        } catch (e) {
          resolve('');
        }
        setTimeout(() => resolve(''), 2000);
      });
    },
    /** The TV's own address on the home network, when the service can't list its own. "" when unknown. */
    address(): Promise<string> {
      const t = tz();
      if (!t || !t.systeminfo) return Promise.resolve('');
      const read = (prop: string) =>
        new Promise<string>((resolve) => {
          try {
            t.systeminfo!.getPropertyValue(prop, (v) => resolve((v && v.ipAddress) || ''), () => resolve(''));
          } catch (e) {
            resolve('');
          }
          setTimeout(() => resolve(''), 1500);
        });
      return read('WIFI_NETWORK').then((ip) => ip || read('ETHERNET_NETWORK'));
    },
  },
};
