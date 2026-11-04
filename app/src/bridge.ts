// Talks to the module's service (service/service.js), which holds the TV's `tizen` functions: under TizenBrew this
// page has none. With no service (a plain browser preview), a stand-in answers so the page still works, and says
// so on screen.

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
const previewLog: Result[] = [];

export const bridge = {
  mode: () => mode,
  addresses: () => (ping && ping.addresses) || [],

  /** Finds the service; retries briefly, since TizenBrew may start it just after the page. */
  async connect(tries = 4): Promise<Mode> {
    for (let i = 0; i < tries; i++) {
      try {
        ping = await request<Ping>('GET', '/ping', undefined, 1500);
        mode = ping.fake ? 'fake-tv' : ping.tizen ? 'tv' : 'preview';
        return mode;
      } catch (e) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    mode = 'preview';
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

  /** Opens an app; the answer says which id worked. */
  async launch(app: string): Promise<{ ok: boolean; id: string | null; error?: string }> {
    if (mode === 'preview') return { ok: true, id: null, error: 'preview: nothing to open' };
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
