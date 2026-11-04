// Where the TV's functions come from, in three set-ups:
// - **app**: HomeTV as its own Samsung app (the plan, Rebecca 18:35). The page has `tizen`, and AeroTizen's ES5
//   scripts (vendor/aerotizen, loaded before this one) list the installed apps, read their artwork and open them;
//   AeroTizen's background watcher brings HomeTV back after Home.
// - **tv / fake-tv**: HomeTV as a TizenBrew module. The page has no `tizen`, so it asks the module's service
//   (service/service.js) on 127.0.0.1:8766: on the TV, or on a PC with the fake TV (`npm run dev`).
// - **preview**: neither; the page still works and says so.

import { HOME_APPS } from './apps';

export const SERVICE = 'http://127.0.0.1:8766';

export type Mode = 'app' | 'tv' | 'fake-tv' | 'preview';

export interface AppInfo {
  key: string;
  name: string;
  /** null when the TV won't list its apps. */
  installed: boolean | null;
}

export interface Result {
  at: string;
  check: string;
  ok: boolean;
  detail: unknown;
}

interface Ping {
  ok: boolean;
  version: string;
  tizen: boolean;
  /** The service runs on a PC with the fake TV (tools/dev-service.mjs). */
  fake?: boolean;
  startedAt: string;
  addresses?: string[];
}

/** The parts of AeroTizen's scripts HomeTV uses (vendor/aerotizen/launcher/js). */
interface AeroApp {
  id: string;
  name: string;
  icon: string;
}
interface Aero {
  apps: { all: AeroApp[]; ready: boolean; load(done: (ok: boolean) => void): void; launch(app: AeroApp): void };
  tiles: { describe(app: AeroApp): { artwork: string[]; title: string } };
  homewatch: { start(): void };
  toast: { flush?: () => void };
}

const w = window as unknown as { tizen?: unknown; AeroTizen?: Aero; hometvToast?: (text: string) => void };

/** XMLHttpRequest with a timeout: Chromium 56 has fetch but no AbortController. */
function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, SERVICE + path);
    xhr.timeout = timeoutMs;
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText) as T);
      } catch (e) {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('no service'));
    xhr.ontimeout = () => reject(new Error('timed out'));
    if (body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(body === undefined ? null : JSON.stringify(body));
  });
}

let mode: Mode = 'preview';
let ping: Ping | null = null;
let problem = '';
const previewLog: Result[] = [];

/** The installed app for a Home tile, by name (AeroTizen's catalogue keys differ from ours). */
function installedFor(key: string): AeroApp | null {
  const aero = w.AeroTizen;
  const tile = HOME_APPS.filter((a) => a.key === key)[0];
  if (!aero || !tile) return null;
  const want = tile.name.toLowerCase();
  return (
    aero.apps.all.filter((a) => {
      const n = a.name.toLowerCase();
      return n.indexOf(want) === 0 || (key === 'max' && n === 'max');
    })[0] || null
  );
}

export const bridge = {
  mode: () => mode,
  /** Why the TV's functions weren't found, for the screen (empty when they were). */
  problem: () => problem,
  addresses: () => (ping && ping.addresses) || [],
  /** How many apps the TV listed (own-app mode). */
  appCount: () => (w.AeroTizen && w.AeroTizen.apps ? w.AeroTizen.apps.all.length : 0),

  /** Lets AeroTizen's scripts show their messages in HomeTV's toast. */
  setToast(fn: (text: string) => void) {
    w.hometvToast = fn;
    if (w.AeroTizen && w.AeroTizen.toast && w.AeroTizen.toast.flush) w.AeroTizen.toast.flush();
  },

  async connect(tries = 4): Promise<Mode> {
    if (w.tizen && w.AeroTizen && w.AeroTizen.apps) {
      mode = 'app';
      try {
        w.AeroTizen.homewatch.start();
      } catch (e) {
        problem = 'watcher: ' + (e as Error).message;
      }
      return mode;
    }
    let lastError = '';
    for (let i = 0; i < tries; i++) {
      try {
        ping = await request<Ping>('GET', '/ping', undefined, 1500);
        mode = ping.fake ? 'fake-tv' : ping.tizen ? 'tv' : 'preview';
        problem = '';
        return mode;
      } catch (e) {
        lastError = (e as Error).message;
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    mode = 'preview';
    problem = w.tizen ? lastError : '';
    return mode;
  },

  async apps(): Promise<AppInfo[] | null> {
    if (mode === 'app') {
      const aero = w.AeroTizen!;
      const ok = await new Promise<boolean>((resolve) => aero.apps.load(resolve));
      if (!ok) {
        problem = 'the TV didn’t list its apps';
        return null;
      }
      return HOME_APPS.map((t) => ({ key: t.key, name: t.name, installed: !!installedFor(t.key) }));
    }
    if (mode === 'preview') return null;
    try {
      const r = await request<{ apps: AppInfo[] }>('GET', '/apps');
      return r.apps;
    } catch (e) {
      return null;
    }
  },

  /** The TV's own artwork for a Home tile, when it has some (AeroTizen reads Samsung's icon cache). */
  artwork(key: string): string[] {
    const app = mode === 'app' ? installedFor(key) : null;
    return app && w.AeroTizen ? w.AeroTizen.tiles.describe(app).artwork : [];
  },

  /** Opens an app. As its own app, AeroTizen's launcher opens it and reports failures through the toast. */
  async launch(key: string): Promise<{ ok: boolean; id: string | null; error?: string }> {
    if (mode === 'app') {
      const app = installedFor(key);
      if (!app) return { ok: false, id: null, error: 'not on this TV' };
      w.AeroTizen!.apps.launch(app);
      return { ok: true, id: app.id };
    }
    if (mode === 'preview') return { ok: true, id: null };
    try {
      const r = await request<{ ok: boolean; id: string | null; tried: { error: string | null }[] }>('POST', '/launch', { app: key });
      const last = r.tried[r.tried.length - 1];
      return { ok: r.ok, id: r.id, error: r.ok ? undefined : (last && last.error) || 'not opened' };
    } catch (e) {
      return { ok: false, id: null, error: (e as Error).message };
    }
  },

  async check(name: string, params: Record<string, unknown> = {}): Promise<Result> {
    if (mode === 'preview' || mode === 'app') {
      const r = { at: new Date().toISOString(), check: name, ok: false, detail: { error: 'checks run under TizenBrew only' } };
      previewLog.push(r);
      return r;
    }
    try {
      return await request<Result>('POST', `/check/${name}`, params, 20000);
    } catch (e) {
      return { at: new Date().toISOString(), check: name, ok: false, detail: { error: (e as Error).message } };
    }
  },

  async results(): Promise<Result[]> {
    if (mode === 'preview' || mode === 'app') return previewLog.slice();
    try {
      return await request<Result[]>('GET', '/results');
    } catch (e) {
      return [];
    }
  },
};
