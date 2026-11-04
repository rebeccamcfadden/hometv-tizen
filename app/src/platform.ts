// The Samsung side of the bridge (docs/platform.md): what differs between TV platforms and isn't the app list or
// opening apps. Screens and the shell never call `tizen` or AeroTizen themselves; they use `bridge.platform`.
// An LG copy replaces this file (and bridge.ts, pageChecks.ts) and keeps the same shape.

import type { Key } from './shell/app';

/** What systeminfo's properties hold, as far as HomeTV reads them (NETWORK, WIFI_NETWORK, ETHERNET_NETWORK, VIDEOSOURCE). */
interface SysValue {
  ipAddress?: string;
  networkType?: string;
  ssid?: string;
  signalStrength?: number;
  connected?: VideoSource[];
  disconnected?: VideoSource[];
}

/** One of the TV's inputs as Samsung's VIDEOSOURCE lists it. */
interface VideoSource {
  type: string;
  number: number;
  signal?: boolean;
  /** The name the TV shows for the port: a device's name from HDMI-CEC, or one the household gave it. */
  editName?: string;
}

type Tz = {
  ApplicationControl: new (operation: string) => unknown;
  application: {
    launchAppControl(c: unknown, id: string, ok: null, err: null): void;
    launch?(id: string, ok: (() => void) | null, err: ((e?: unknown) => void) | null): void;
    getAppsInfo?(ok: (apps: { id: string; name: string }[]) => void, err?: () => void): void;
  };
  tvinputdevice?: { registerKey(name: string): void };
  time?: {
    getCurrentDateTime(): { getFullYear(): number; getMonth(): number; getDate(): number; getDay(): number; getHours(): number; getMinutes(): number };
    /** "h:m:s ap" on a 12-hour TV, "H:m:s" on a 24-hour one. */
    getTimeFormat(): string;
  };
  systeminfo?: {
    getPropertyValue(p: string, ok: (v: SysValue) => void, err?: () => void): void;
    addPropertyValueChangeListener?(p: string, fn: () => void): number;
    getCapability?(key: string): unknown;
    removePropertyValueChangeListener?(id: number): void;
  };
  tvwindow?: {
    getSource?(win: 'MAIN'): VideoSource;
    setSource(src: VideoSource, ok: () => void, err: (e?: unknown) => void, win: 'MAIN'): void;
    show(ok: () => void, err: (e?: unknown) => void, rect: string[], win: 'MAIN'): void;
    hide(ok: () => void, err: () => void, win: 'MAIN'): void;
  };
  filesystem?: {
    /** Tizen 5.0 and newer. */
    openFile?(path: string, mode: 'r'): { readString(): string; close(): void };
    /** Older, and deprecated from Tizen 5.0. */
    resolve?(path: string, ok: (f: { readAsText(ok: (text: string) => void, err: () => void, encoding: string): void }) => void, err: () => void, mode: 'r'): void;
  };
};

const tz = (): Tz | null => (window as unknown as { tizen?: Tz }).tizen || null;

/** The TV's wall clock (platform.clock()): month 0-11, weekday 0 (Sunday) to 6, as Date has them. */
export interface WallClock {
  year: number;
  month: number;
  date: number;
  weekday: number;
  hours: number;
  minutes: number;
  /** The TV shows a 24-hour clock; null when it can't say. */
  hour24: boolean | null;
}

/** Page updates as Settings › About shows them (platform.pageUpdates()). */
export interface PageUpdates {
  /** The app's version (tizen/config.xml), "0.0.2". */
  app: string;
  /** The page shown, "0.0.3". */
  page: string;
  /** The app was built with an update address and keys, so it checks. */
  on: boolean;
  /** A newer page downloaded and checked: it shows at the next start. */
  next: string | null;
  /** The last check this start, epoch ms; null before the first (ten seconds after Home). */
  checkedAt: number | null;
  failed: boolean;
}

/** app/loader/boot.js's HomeTVBoot.status(). */
interface BootStatus {
  page?: string;
  shell?: string;
  updates?: string;
  next?: string | null;
  lastCheck?: { at: string; result: string } | null;
}

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

/** How the TV is connected: Wi-Fi, a cable, not at all, or it won't say (a PC, TizenBrew's page). */
export type NetKind = 'wifi' | 'ethernet' | 'none' | 'unknown';

export interface NetState {
  kind: NetKind;
  /** Wi-Fi signal from 0 to 1, when the TV says. */
  signal: number | null;
  /** The Wi-Fi network's name, when the TV says. Shown on the TV only: never logged or reported. */
  name: string;
  /** false only when the TV says it's offline. */
  online: boolean;
}

/** One of the TV's inputs, for the nav's Inputs menu. */
export interface TvInput {
  /** "HDMI:2", "TV:1": stable for a port. */
  id: string;
  kind: 'hdmi' | 'av' | 'tv';
  /** The port: "HDMI 2", "AV 1", "Live TV". */
  port: string;
  /** The device's name when the TV knows it (HDMI-CEC, or a name the household gave the port), else "". */
  device: string;
  connected: boolean;
  /** What the TV shows now. */
  active: boolean;
  /** The TV's own record, handed back to show(). */
  raw: unknown;
}

/** The TV's own settings pages the nav's menus point to. */
export type TvPage = 'main' | 'network' | 'picture' | 'sound' | 'inputs';

/** Where each page is in Samsung's menus, for when HomeTV can't open it (2018-2024 menus; newer ones in brackets). */
const SETTINGS_WHERE: Record<TvPage, string> = {
  main: 'Press the remote’s Home button, then Settings.',
  network: 'Press Home, then Settings › General › Network (Settings › Connection › Network on newer TVs).',
  picture: 'Press Home, then Settings › Picture.',
  sound: 'Press Home, then Settings › Sound.',
  inputs: 'Press Source on the remote, or Home › Source (Connected Devices on newer TVs).',
};

/**
 * Samsung's own Settings app, opened only when the TV lists it (getAppsInfo). Unchecked on a real TV: the ids are the
 * ones seen in Samsung app lists; the TV's menus may not be an app a page can open at all (docs/platform.md).
 */
const SETTINGS_APP_IDS = ['org.tizen.settings', 'com.samsung.tv.settings'];

const PORT_NAMES: Record<string, string> = { COMP: 'Component', SVIDEO: 'S-Video', SCART: 'SCART', PC: 'PC', DVI: 'DVI', AV: 'AV' };

/**
 * A device's name in `editName`, or "" for the TV's placeholders ("HDMI 2", "Unknown device", their Italian forms).
 * The placeholder filter is AeroTizen's (vendor/aerotizen/launcher/js/inputs.js, hasRecognizedDevice; MIT).
 */
export function deviceName(s: { type: string; editName?: unknown }): string {
  if (!s || s.type !== 'HDMI' || typeof s.editName !== 'string') return '';
  const name = s.editName.replace(/\s+/g, ' ').trim();
  if (!name) return '';
  const ordinary = name.toLowerCase().replace(/[_.-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (
    /^(?:hdmi(?: \d+)?|ingresso(?: hdmi)?(?: \d+)?|source(?: hdmi)?(?: \d+)?|input(?: hdmi)?(?: \d+)?|sorgente(?: hdmi)?(?: \d+)?|unknown(?: device)?|unrecognized(?: device)?|unrecognised(?: device)?|dispositivo sconosciuto|sconosciuto|non riconosciuto|nessun dispositivo|no device|not connected|non collegato|disconnected)$/i.test(
      ordinary,
    )
  )
    return '';
  return name.slice(0, 40);
}

/**
 * The Inputs menu's list from VIDEOSOURCE: one entry per port (a port in both of Samsung's lists counts once, as
 * connected, keeping a device name either list had), media players left out; HDMI and the other ports, connected
 * first, then Live TV. As AeroTizen's inputs.js builds it.
 */
export function inputsFrom(info: { connected?: VideoSource[]; disconnected?: VideoSource[] } | null, current: VideoSource | null): TvInput[] {
  const byId: Record<string, TvInput> = {};
  const order: string[] = [];
  const add = (list: VideoSource[] | undefined, connected: boolean) => {
    for (const s of list || []) {
      if (!s || typeof s.type !== 'string' || s.type === 'MEDIA') continue;
      const num = Number(s.number) || 1;
      const id = `${s.type}:${num}`;
      const kind: TvInput['kind'] = s.type === 'TV' ? 'tv' : s.type === 'HDMI' ? 'hdmi' : 'av';
      const entry: TvInput = {
        id,
        kind,
        port: kind === 'tv' ? 'Live TV' : `${kind === 'hdmi' ? 'HDMI' : PORT_NAMES[s.type] || s.type} ${num}`,
        device: deviceName(s),
        connected: connected || s.signal === true,
        active: !!current && current.type === s.type && Number(current.number) === num,
        raw: s,
      };
      const prior = byId[id];
      if (!prior) {
        byId[id] = entry;
        order.push(id);
        continue;
      }
      const keep = !prior.connected && entry.connected ? entry : prior;
      const other = keep === entry ? prior : entry;
      if (!keep.device) keep.device = other.device;
      byId[id] = keep;
    }
  };
  add((info && info.connected) || undefined, true);
  add((info && info.disconnected) || undefined, false);
  const rank = (i: TvInput) => (i.kind === 'hdmi' ? 0 : i.kind === 'av' ? 1 : 2);
  const type = (i: TvInput) => i.id.split(':')[0];
  const num = (i: TvInput) => Number(i.id.split(':')[1]);
  return order
    .map((id) => byId[id])
    .sort((a, b) => rank(a) - rank(b) || Number(b.connected) - Number(a.connected) || (type(a) < type(b) ? -1 : type(a) > type(b) ? 1 : num(a) - num(b)));
}

/** AeroTizen's native Live TV handoff (vendor/aerotizen/launcher/js/native-navigation.js), when it is loaded. */
const aeroLiveTv = (): ((src: unknown) => boolean) | null => {
  const a = (window as unknown as { AeroTizen?: { homewatch?: { openNativeLiveTV?: (src: unknown) => boolean } } }).AeroTizen;
  return a && a.homewatch && typeof a.homewatch.openNativeLiveTV === 'function' ? a.homewatch.openNativeLiveTV : null;
};

/** Calls `fn` with the first answer; `fallback` after `ms` if none came. */
function answer<T>(ms: number, fallback: T, ask: (done: (v: T) => void) => void): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: T) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    setTimeout(() => done(fallback), ms);
    try {
      ask(done);
    } catch (e) {
      done(fallback);
    }
  });
}

export const platform = {
  /** Shown to people: "Samsung", in "Samsung app", the checks and reports. */
  brand: 'Samsung',
  /** The TV's software, for the checks screen: "Tizen 6.5". */
  os: 'Tizen',
  /** Who this platform's side is built on, for Settings › About. */
  credits: 'Built on AeroTizen by Hamza El Alaoui (MIT), which lists and opens the TV’s apps.',
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

  /** The TV software's version ("5.0"), for the problem report; "" when unknown. */
  osVersion(): string {
    const t = tz();
    try {
      const v = t && t.systeminfo && t.systeminfo.getCapability ? t.systeminfo.getCapability('http://tizen.org/feature/platform.version') : '';
      return typeof v === 'string' && /^\d{1,2}(\.\d{1,2}){0,3}$/.test(v) ? v : '';
    } catch (e) {
      return '';
    }
  },

  /**
   * How the TV is connected (the nav's Wi-Fi icon and menu): systeminfo's NETWORK, then WIFI_NETWORK for the name and
   * signal, as AeroTizen's network.js reads them. Without `tizen` (a PC, TizenBrew's page): 'unknown', or 'none' when
   * the browser says it's offline.
   */
  network(): Promise<NetState> {
    const online = navigator.onLine !== false;
    const fallback: NetState = { kind: online ? 'unknown' : 'none', signal: null, name: '', online };
    const t = tz();
    const sys = t && t.systeminfo;
    if (!sys) return Promise.resolve(fallback);
    return answer(2500, fallback, (done) =>
      sys.getPropertyValue(
        'NETWORK',
        (n) => {
          const type = n && n.networkType;
          if (type === 'ETHERNET') return done({ kind: 'ethernet', signal: null, name: '', online });
          if (type === 'NONE') return done({ kind: 'none', signal: null, name: '', online: false });
          if (type !== 'WIFI') return done(fallback);
          const plain: NetState = { kind: 'wifi', signal: null, name: '', online };
          try {
            sys.getPropertyValue(
              'WIFI_NETWORK',
              (w) => {
                const s = w && w.signalStrength;
                done({
                  kind: 'wifi',
                  signal: typeof s === 'number' && isFinite(s) && s >= 0 && s <= 1 ? s : null,
                  name: w && typeof w.ssid === 'string' ? w.ssid.slice(0, 64) : '',
                  online,
                });
              },
              () => done(plain),
            );
          } catch (e) {
            done(plain);
          }
        },
        () => done(fallback),
      ),
    );
  },

  /** Calls `fn` when the connection changes (the TV's NETWORK listener, and the browser's online and offline). */
  onNetworkChange(fn: () => void): () => void {
    window.addEventListener('online', fn);
    window.addEventListener('offline', fn);
    const t = tz();
    let id: number | null = null;
    if (t && t.systeminfo && t.systeminfo.addPropertyValueChangeListener) {
      try {
        id = t.systeminfo.addPropertyValueChangeListener('NETWORK', fn);
      } catch (e) {
        id = null;
      }
    }
    return () => {
      window.removeEventListener('online', fn);
      window.removeEventListener('offline', fn);
      if (id !== null && t && t.systeminfo && t.systeminfo.removePropertyValueChangeListener) {
        try {
          t.systeminfo.removePropertyValueChangeListener(id);
        } catch (e) {
          // Already gone.
        }
      }
    };
  },

  /**
   * The TV's inputs (the nav's Inputs menu): systeminfo's VIDEOSOURCE with the device names the TV knows, and
   * tvwindow to show one inside HomeTV, as AeroTizen's inputs.js does. Live TV goes to Samsung's own viewer through
   * AeroTizen's handoff (native-navigation.js), so the remote's channel keys work.
   */
  inputs: {
    /** The inputs, or null when the TV won't list them (a PC, TizenBrew's page). */
    list(): Promise<TvInput[] | null> {
      const t = tz();
      const sys = t && t.systeminfo;
      if (!sys) return Promise.resolve(null);
      return answer<TvInput[] | null>(2500, null, (done) =>
        sys.getPropertyValue(
          'VIDEOSOURCE',
          (info) => {
            let current: VideoSource | null = null;
            try {
              if (t!.tvwindow && t!.tvwindow.getSource) current = t!.tvwindow.getSource('MAIN');
            } catch (e) {
              // Some firmware refuses this while no video window is up.
            }
            done(inputsFrom(info, current));
          },
          () => done(null),
        ),
      );
    },
    /**
     * Shows an input: '' when it is up (HDMI and the others inside HomeTV, full screen: the caller covers the page and
     * calls leave() on Back), 'left' when Samsung's Live TV took over, 'preview' without the TV, else why it failed.
     */
    show(input: TvInput): Promise<string> {
      const t = tz();
      if (!t) return Promise.resolve('preview');
      if (input.kind === 'tv') {
        const live = aeroLiveTv();
        if (live && live(input.raw) !== false) return Promise.resolve('left');
      }
      const win = t.tvwindow;
      if (!win) return Promise.resolve('this TV doesn’t let apps show its inputs');
      return answer(6000, 'the TV didn’t answer', (done) =>
        win.setSource(
          input.raw as VideoSource,
          () => win.show(() => done(''), () => done('the TV couldn’t show it'), ['0px', '0px', '1920px', '1080px'], 'MAIN'),
          () => done('the TV couldn’t switch to it'),
          'MAIN',
        ),
      );
    },
    /** Hides an input shown by show(). */
    leave(): void {
      const t = tz();
      if (!t || !t.tvwindow) return;
      try {
        t.tvwindow.hide(() => {}, () => {}, 'MAIN');
      } catch (e) {
        // Already hidden.
      }
    },
    /** Calls `fn` when something is plugged in or out; returns a function that stops it. */
    onChange(fn: () => void): () => void {
      const t = tz();
      if (!t || !t.systeminfo || !t.systeminfo.addPropertyValueChangeListener) return () => {};
      let id: number | null = null;
      try {
        id = t.systeminfo.addPropertyValueChangeListener('VIDEOSOURCE', fn);
      } catch (e) {
        return () => {};
      }
      return () => {
        try {
          if (id !== null && t.systeminfo && t.systeminfo.removePropertyValueChangeListener) t.systeminfo.removePropertyValueChangeListener(id);
        } catch (e) {
          // Already gone.
        }
      };
    },
  },

  /**
   * Opens the TV's own settings: true when it opened (Samsung's Settings app, when the TV lists one; its main page,
   * since no way to open a given page is known). false: say where the page is instead (settingsWhere).
   */
  openTvSettings(page: TvPage): Promise<boolean> {
    void page;
    const t = tz();
    const app = t && t.application;
    if (!app || !app.getAppsInfo || !app.launch) return Promise.resolve(false);
    return answer(4000, false, (done) =>
      app.getAppsInfo!(
        (apps) => {
          const ids = apps.map((a) => a.id);
          const id = SETTINGS_APP_IDS.filter((x) => ids.indexOf(x) >= 0)[0];
          if (!id) return done(false);
          app.launch!(id, () => done(true), () => done(false));
        },
        () => done(false),
      ),
    );
  },

  /** Where a settings page is on this TV, in plain words, for when openTvSettings can't open it. */
  settingsWhere: (page: TvPage): string => SETTINGS_WHERE[page],

  /** Tells the installed app's loader (app/loader/boot.js) the page works; its updater may then look for a newer one. */
  started(): void {
    const boot = (window as unknown as { HomeTVBoot?: { started(): void } }).HomeTVBoot;
    if (boot) boot.started();
  },

  /**
   * The TV's own clock: the date and time on its wall clock, and whether it shows a 24-hour clock (null: unknown). On
   * the TV from `tizen.time` (its time zone and format, set in the TV's menu), since the page's `Date` may not follow
   * the TV's time zone on every model; elsewhere, and if that fails, from `Date`.
   */
  clock(): WallClock {
    const t = tz();
    if (t && t.time) {
      try {
        const d = t.time.getCurrentDateTime();
        let hour24: boolean | null = null;
        try {
          hour24 = !/a/i.test(t.time.getTimeFormat());
        } catch (e) {
          // Older TVs: unknown.
        }
        return { year: d.getFullYear(), month: d.getMonth(), date: d.getDate(), weekday: d.getDay(), hours: d.getHours(), minutes: d.getMinutes(), hour24 };
      } catch (e) {
        // Fall through to the page's clock.
      }
    }
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth(), date: d.getDate(), weekday: d.getDay(), hours: d.getHours(), minutes: d.getMinutes(), hour24: null };
  },

  /**
   * Page updates (docs/page-updates.md), for Settings › About: the app's and the page's versions and what the loader's
   * last check found. Null outside the installed app (no loader: TizenBrew, the fake TV, a preview).
   */
  pageUpdates(): PageUpdates | null {
    const boot = (window as unknown as { HomeTVBoot?: { status?(): BootStatus } }).HomeTVBoot;
    if (!boot || !boot.status) return null;
    try {
      const s = boot.status();
      return {
        app: String(s.shell || ''),
        page: String(s.page || ''),
        on: !!s.updates && s.updates !== 'off',
        next: s.next || null,
        checkedAt: s.lastCheck ? Date.parse(s.lastCheck.at) || null : null,
        failed: !!s.lastCheck && /^failed/.test(s.lastCheck.result || ''),
      };
    } catch (e) {
      return null;
    }
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
