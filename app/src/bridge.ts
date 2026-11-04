// Where the TV's functions come from, in three set-ups:
// - **app**: HomeTV as its own Samsung app (the plan, decided 2026-11-04). The page has `tizen`, and AeroTizen's ES5
//   scripts (vendor/aerotizen, loaded before this one) list the installed apps, read their artwork and open them;
//   AeroTizen's background watcher brings HomeTV back after Home.
// - **tv / fake-tv**: HomeTV as a TizenBrew module. The page has no `tizen`, so it asks the module's service
//   (service/service.js) on 127.0.0.1:8766: on the TV, or on a PC with the fake TV (`npm run dev`).
// - **preview**: neither; the page still works and says so.

import { HOME_APPS, keyForName } from './apps';
import { recordError } from './errors';
import { appControl, pageChecks } from './pageChecks';
import type { OpenPlan } from './titleLinks';
import { platform } from './platform';

export const SERVICE = 'http://127.0.0.1:8766';

export type Mode = 'app' | 'tv' | 'fake-tv' | 'preview';

export interface AppInfo {
  key: string;
  name: string;
  /** null when the TV won't list its apps. */
  installed: boolean | null;
}

/** A key for any installed app, not only Home's known ones: "app:" and the TV's own app id. */
export const APP_PREFIX = 'app:';

/** An app on the TV, for All apps. */
export interface TvApp {
  /** The TV's own app id. */
  id: string;
  name: string;
  /** The Home tile it is (apps.ts), when it is one of those. */
  key: string | null;
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

const w = window as unknown as {
  tizen?: unknown;
  AeroTizen?: Aero;
  hometvToast?: (text: string) => void;
  /** aero-glue.js calls this when AeroTizen reports an app or Live TV that didn't open. */
  hometvFailed?: (what: string, values: { name?: string; reason?: string }) => void;
};

/** A request to the service failed (not the first look for it, which fails on a PC without one): for the error log. */
const serviceFailed = (e: unknown) => recordError('fetch_failed', { what: 'service', reason: e instanceof Error ? e.message : '', mode });

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

/**
 * The installed app for a Home tile, by name (AeroTizen's catalogue keys differ from ours), or "app:" and its id (All
 * apps, Home's row). An app that isn't on Home's row (a store's, or Viaplay's from the title page) is found by `name`.
 */
function installedFor(key: string, name?: string): AeroApp | null {
  const aero = w.AeroTizen;
  if (!aero) return null;
  if (key.indexOf(APP_PREFIX) === 0) {
    const id = key.slice(APP_PREFIX.length);
    return aero.apps.all.filter((a) => a.id === id)[0] || null;
  }
  const tile = HOME_APPS.filter((a) => a.key === key)[0];
  if (tile) {
    // The app that is this tile by name; else, as before, the first whose name starts with the tile's.
    const want = tile.name.toLowerCase();
    return (
      aero.apps.all.filter((a) => keyForName(a.name) === key)[0] ||
      aero.apps.all.filter((a) => a.name.toLowerCase().indexOf(want) === 0)[0] ||
      null
    );
  }
  if (!name) return null;
  const want = name.toLowerCase();
  return aero.apps.all.filter((a) => a.name.toLowerCase().indexOf(want) === 0)[0] || null;
}

async function launchApp(key: string, name?: string): Promise<{ ok: boolean; id: string | null; error?: string }> {
  if (mode === 'app') {
    const app = installedFor(key, name);
    if (!app) return { ok: false, id: null, error: 'not on this TV' };
    w.AeroTizen!.apps.launch(app);
    return { ok: true, id: app.id };
  }
  if (mode === 'preview') return { ok: true, id: null };
  try {
    const body = key.indexOf(APP_PREFIX) === 0 ? { id: key.slice(APP_PREFIX.length) } : { app: key };
    const r = await request<{ ok: boolean; id: string | null; tried: { error: string | null }[] }>('POST', '/launch', body);
    const last = r.tried[r.tried.length - 1];
    return { ok: r.ok, id: r.id, error: r.ok ? undefined : (last && last.error) || 'not opened' };
  } catch (e) {
    return { ok: false, id: null, error: (e as Error).message };
  }
}

export const bridge = {
  /** Keys, buttons, names, online state and the key page's TV side (platform.ts, docs/platform.md). */
  platform,
  mode: () => mode,
  /** Why the TV's functions weren't found, for the screen (empty when they were). */
  problem: () => problem,
  addresses: () => (ping && ping.addresses) || [],
  /** How many apps the TV listed (own-app mode). */
  appCount: () => (w.AeroTizen && w.AeroTizen.apps ? w.AeroTizen.apps.all.length : 0),

  /** Lets AeroTizen's scripts show their messages in HomeTV's toast. */
  setToast(fn: (text: string) => void) {
    w.hometvToast = fn;
    w.hometvFailed = (what, values) => {
      if (what === 'live-tv') recordError('input_failed', { input: 'tv', reason: values.reason });
      else recordError('launch_failed', { app: keyForName(values.name || '') || 'other', reason: values.reason || 'it failed to start', mode });
    };
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
      serviceFailed(e);
      return null;
    }
  },

  /** The TV's own id for a Home row entry (App info): "app:" entries carry it; Home's tiles have it in the own app. */
  appId(key: string): string | null {
    if (key.indexOf(APP_PREFIX) === 0) return key.slice(APP_PREFIX.length);
    const app = mode === 'app' ? installedFor(key) : null;
    return app ? app.id : null;
  },

  /** The TV's own artwork for a Home tile, when it has some (AeroTizen reads Samsung's icon cache). */
  artwork(key: string): string[] {
    const app = mode === 'app' ? installedFor(key) : null;
    return app && w.AeroTizen ? w.AeroTizen.tiles.describe(app).artwork : [];
  },

  /**
   * Every app a person would open on the TV, by name, for All apps: AeroTizen's inventory in the own app (its sample
   * list in a preview), the service's list under TizenBrew and on the fake TV. null when the TV won't list them.
   */
  async installedApps(): Promise<TvApp[] | null> {
    const aero = w.AeroTizen;
    const toTvApp = (a: { id: string; name: string }): TvApp => ({ id: a.id, name: a.name, key: keyForName(a.name) });
    if (mode === 'app' || (mode === 'preview' && aero && aero.apps)) {
      if (!aero || !aero.apps) return null;
      if (!aero.apps.ready) {
        const ok = await new Promise<boolean>((resolve) => aero.apps.load(resolve));
        if (!ok) return null;
      }
      return aero.apps.all.map(toTvApp);
    }
    if (mode === 'preview') return null;
    try {
      const r = await request<{ apps: { id: string; name: string }[]; listed: boolean }>('GET', '/apps/all');
      return r.listed ? r.apps.map(toTvApp) : null;
    } catch (e) {
      serviceFailed(e);
      return null;
    }
  },

  /**
   * Opens an app. As its own app, AeroTizen's launcher opens it and reports failures through the toast. `name` finds
   * an app that isn't on Home's row in the TV's list (own-app mode); under TizenBrew the service knows apps by key, or
   * by "app:" and the TV's id for any app All apps lists.
   */
  async launch(key: string, name?: string): Promise<{ ok: boolean; id: string | null; error?: string }> {
    const r = await launchApp(key, name);
    if (!r.ok) recordError('launch_failed', { app: key, reason: r.error, mode });
    return r;
  },

  /**
   * Opens a title (titleLinks.ts, openPlan): as its own app, a title link goes as an app control, as the TV-call
   * checks send it (pageChecks.ts); if the TV refuses it, or under TizenBrew (the service has no title links yet), the
   * app opens on its home. `linked` says whether the link went.
   */
  async openTitle(plan: OpenPlan): Promise<{ ok: boolean; id: string | null; linked: boolean; error?: string }> {
    if (plan.how === 'link' && mode === 'app') {
      const app = installedFor(plan.app.key, plan.app.name);
      if (!app) return { ok: false, id: null, linked: false, error: 'not on this TV' };
      const error = await appControl(app.id, plan.url, plan.payload);
      if (!error) return { ok: true, id: app.id, linked: true };
    }
    const r = await launchApp(plan.app.key, plan.app.name);
    if (!r.ok) recordError('title_failed', { app: plan.app.key, reason: r.error, mode });
    return { ok: r.ok, id: r.id, linked: false, error: r.error };
  },

  async check(name: string, params: Record<string, unknown> = {}): Promise<Result> {
    if (mode === 'app') return pageChecks.run(name, params, (key) => (installedFor(key) || { id: null }).id);
    if (mode === 'preview') {
      const r = { at: new Date().toISOString(), check: name, ok: false, detail: { error: 'preview: no TV' } };
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
    if (mode === 'app') return pageChecks.results();
    if (mode === 'preview') return previewLog.slice();
    try {
      return await request<Result[]>('GET', '/results');
    } catch (e) {
      serviceFailed(e);
      return [];
    }
  },
};
