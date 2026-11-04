// Talks to the module's service (service/service.js), which holds the TV's `tizen` functions: under TizenBrew this
// page has none. With no service (a plain browser preview), a stand-in answers so the page still works, and says
// so on screen.

import { APP_IDS } from './apps';

export const SERVICE = 'http://127.0.0.1:8766';

export type Mode = 'tv' | 'fake-tv' | 'preview';

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

interface TizenLike {
  ApplicationControl: new (operation: string) => unknown;
  application: {
    getCurrentApplication(): { appInfo: { packageId: string } };
    launchAppControl(c: unknown, id: string, ok: () => void, err: (e: { message: string }) => void): void;
  };
}

/** Running as its own app (not under TizenBrew), the page has `tizen` and can start the service itself. */
function startServiceHere(): Promise<string> {
  const tz = (window as unknown as { tizen?: TizenLike }).tizen;
  if (!tz || !tz.application) return Promise.resolve('no tizen in the page');
  return new Promise((resolve) => {
    try {
      const pkg = tz.application.getCurrentApplication().appInfo.packageId;
      tz.application.launchAppControl(
        new tz.ApplicationControl('http://tizen.org/appcontrol/operation/service'),
        pkg + '.HomeTVService',
        () => resolve('service start requested'),
        (e) => resolve('service start refused: ' + e.message),
      );
    } catch (e) {
      resolve('service start threw: ' + (e as Error).message);
    }
  });
}

/** Emulator wrapper only: tizen/service-host.js answers on 8767 with why the service didn't start. */
function serviceProblem(): Promise<string> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'http://127.0.0.1:8767/');
    xhr.timeout = 1500;
    xhr.onload = () => resolve('host says: ' + xhr.responseText.slice(0, 300));
    xhr.onerror = () => resolve('host silent');
    xhr.ontimeout = () => resolve('host silent');
    xhr.send();
  });
}

/** Whether the TV lists the service as running. */
function serviceRunning(): Promise<string> {
  const tz = (window as unknown as { tizen?: { application: { getAppsContext(ok: (l: { appId: string }[]) => void, err: (e: { message: string }) => void): void } } }).tizen;
  if (!tz) return Promise.resolve('');
  return new Promise((resolve) => {
    try {
      tz.application.getAppsContext(
        (list) => resolve(list.some((c) => /HomeTVService$/.test(c.appId)) ? 'service running' : 'service not running'),
        (e) => resolve('contexts: ' + e.message),
      );
    } catch (e) {
      resolve('contexts threw: ' + (e as Error).message);
    }
  });
}

/** Opens an app with the page's own `tizen` (HomeTV as its own app), trying each id. */
async function launchHere(app: string): Promise<{ ok: boolean; id: string | null; error?: string }> {
  const tz = (window as unknown as { tizen?: { application: { launch(id: string, ok: () => void, err: (e: { name: string; message: string }) => void): void } } }).tizen;
  if (!tz || !tz.application) return { ok: true, id: null, error: 'preview: nothing to open' };
  let error = 'unknown app';
  for (const id of APP_IDS[app] || []) {
    error = await new Promise<string>((resolve) => {
      try {
        tz.application.launch(id, () => resolve(''), (e) => resolve(`${e.name}: ${e.message}`));
      } catch (e) {
        resolve((e as Error).message);
      }
    });
    if (!error) return { ok: true, id };
  }
  return { ok: false, id: null, error };
}

export const bridge = {
  mode: () => mode,
  /** Why the service wasn't found, for the screen (empty when it was). */
  problem: () => problem,
  addresses: () => (ping && ping.addresses) || [],

  /** Finds the service; retries briefly, since TizenBrew may start it just after the page. */
  async connect(tries = 4): Promise<Mode> {
    let lastError = '';
    let started = '';
    for (let i = 0; i < tries + 4; i++) {
      try {
        ping = await request<Ping>('GET', '/ping', undefined, 1500);
        mode = ping.fake ? 'fake-tv' : ping.tizen ? 'tv' : 'preview';
        problem = '';
        return mode;
      } catch (e) {
        lastError = (e as Error).message;
        if (i === tries - 1 && !started) started = await startServiceHere();
        if (i >= tries && started.indexOf('requested') < 0) break;
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    mode = 'preview';
    problem = `${lastError}${started ? '; ' + started : ''}`;
    if (started) problem += '; ' + (await serviceRunning()) + '; ' + (await serviceProblem());
    return mode;
  },

  async apps(): Promise<AppInfo[] | null> {
    if (mode === 'preview') return null;
    try {
      const r = await request<{ apps: AppInfo[] }>('GET', '/apps');
      return r.apps;
    } catch (e) {
      return null;
    }
  },

  /** Opens an app; the answer says which id worked. As its own app, the page opens it itself. */
  async launch(app: string): Promise<{ ok: boolean; id: string | null; error?: string }> {
    if (mode === 'preview') return launchHere(app);
    try {
      const r = await request<{ ok: boolean; id: string | null; tried: { error: string | null }[] }>('POST', '/launch', { app });
      const last = r.tried[r.tried.length - 1];
      return { ok: r.ok, id: r.id, error: r.ok ? undefined : (last && last.error) || 'not opened' };
    } catch (e) {
      return { ok: false, id: null, error: (e as Error).message };
    }
  },

  async check(name: string, params: Record<string, unknown> = {}): Promise<Result> {
    if (mode === 'preview') {
      const r = { at: new Date().toISOString(), check: name, ok: false, detail: { error: 'preview: no service' } };
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
    if (mode === 'preview') return previewLog.slice();
    try {
      return await request<Result[]>('GET', '/results');
    } catch (e) {
      return [];
    }
  },
};
