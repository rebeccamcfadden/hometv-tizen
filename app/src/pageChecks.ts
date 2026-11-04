// The TV-call checks when HomeTV runs as its own Samsung app (bridge mode 'app'): the page has `tizen`, so it runs
// them itself; under TizenBrew the module's service runs the same checks (service/service.js, CHECKS). Results are
// kept in this app's own storage so the Checks screen lists them after an app opened and HomeTV came back.

import type { Result } from './bridge';

/** One well-known title per service, the Android launcher's link shapes (as service/service.js SAMPLE_TITLES). */
export const SAMPLE_TITLES: Record<string, { label: string; url: string; meta: string }> = {
  netflix: { label: 'Stranger Things', url: 'https://www.netflix.com/title/80057281', meta: 'm=80057281' },
  youtube: { label: 'a YouTube video', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', meta: 'v=aqz-KE-bpKQ' },
  prime: {
    label: 'The Boys',
    url: 'https://app.primevideo.com/detail?gti=amzn1.dv.gti.0eb1d3b1-28b0-ebdb-6c2d-2a1e3e9e1e1c',
    meta: 'gti=amzn1.dv.gti.0eb1d3b1-28b0-ebdb-6c2d-2a1e3e9e1e1c',
  },
};

interface TizenControl {
  new (operation: string, uri?: string | null, mime?: string | null, category?: string | null, data?: unknown[]): unknown;
}
interface Tizen {
  ApplicationControl: TizenControl;
  ApplicationControlData: new (key: string, value: string[]) => unknown;
  application: {
    launchAppControl(c: unknown, id: string, ok: () => void, err: (e: { name: string; message: string }) => void): void;
    getAppsInfo(ok: (l: { id: string }[]) => void, err: (e: { message: string }) => void): void;
  };
  systeminfo: { getCapability(key: string): string };
}

const STORE = 'hometv-checks-v1';
const tz = () => (window as unknown as { tizen?: Tizen }).tizen;

function load(): Result[] {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '[]') as Result[];
  } catch (e) {
    return [];
  }
}

function record(check: string, ok: boolean, detail: Record<string, unknown>): Result {
  const r = { at: new Date().toISOString(), check, ok, detail };
  const all = load();
  all.push(r);
  try {
    localStorage.setItem(STORE, JSON.stringify(all.slice(-100)));
  } catch (e) {
    // The screen still shows this one.
  }
  return r;
}

function capability(key: string): string | null {
  try {
    return tz()!.systeminfo.getCapability(key);
  } catch (e) {
    return null;
  }
}

/** Sends an app control and says whether the TV accepted it (not whether the title opened: that's for the eyes). */
function appControl(appId: string, uri: string | null, payload: string): Promise<string> {
  const t = tz()!;
  return new Promise((resolve) => {
    try {
      const data = [new t.ApplicationControlData('PAYLOAD', [JSON.stringify({ values: payload })])];
      const control = new t.ApplicationControl('http://tizen.org/appcontrol/operation/view', uri, null, null, data);
      t.application.launchAppControl(control, appId, () => resolve(''), (e) => resolve(`${e.name}: ${e.message}`));
    } catch (e) {
      resolve((e as Error).message);
    }
  });
}

/** Samsung's remote-control socket on the TV: a DEEP_LINK launch with the title as data. */
function remoteDeepLink(appId: string, meta: string): Promise<{ ok: boolean; events: string[]; error?: string }> {
  return new Promise((resolve) => {
    const events: string[] = [];
    let sent = false;
    let ws: WebSocket;
    const done = (ok: boolean, error?: string) => {
      try {
        ws.close();
      } catch (e) {
        // Already closed.
      }
      resolve({ ok, events, error });
    };
    const timer = window.setTimeout(() => done(sent, sent ? undefined : 'no answer after 12 s'), 12000);
    try {
      ws = new WebSocket('ws://127.0.0.1:8001/api/v2/channels/samsung.remote.control?name=' + btoa('HomeTV'));
    } catch (e) {
      window.clearTimeout(timer);
      resolve({ ok: false, events, error: (e as Error).message });
      return;
    }
    ws.onmessage = (m) => {
      let event: { event?: string } = {};
      try {
        event = JSON.parse(String(m.data));
      } catch (e) {
        // Not JSON: keep going.
      }
      events.push(event.event || '?');
      if (!sent && event.event === 'ms.channel.connect') {
        ws.send(
          JSON.stringify({
            method: 'ms.channel.emit',
            params: { event: 'ed.apps.launch', to: 'host', data: { appId, action_type: 'DEEP_LINK', metaTag: meta } },
          }),
        );
        sent = true;
        window.clearTimeout(timer);
        window.setTimeout(() => done(true), 3000);
      }
    };
    ws.onerror = () => {
      window.clearTimeout(timer);
      done(false, 'the TV refused the socket');
    };
  });
}

/** DIAL, as a phone casting YouTube does (the TV's DIAL server on 8080). */
function dialYouTube(meta: string): Promise<{ status: number; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'http://127.0.0.1:8080/ws/apps/YouTube');
    xhr.timeout = 8000;
    xhr.setRequestHeader('Content-Type', 'text/plain; charset=utf-8');
    xhr.onload = () => resolve({ status: xhr.status });
    // A refused cross-origin answer still means the request went out.
    xhr.onerror = () => resolve({ status: 0, error: 'no readable answer (it may still have been sent)' });
    xhr.ontimeout = () => resolve({ status: 0, error: 'timed out' });
    xhr.send(meta);
  });
}

export const pageChecks = {
  results: load,

  /** `appIdFor` gives the installed app's id for a Home key (AeroTizen's inventory), or null. */
  async run(name: string, params: Record<string, unknown>, appIdFor: (key: string) => string | null): Promise<Result> {
    const key = String(params.app || '');
    const label = name + (key ? ':' + key : '');
    if (!tz()) return record(label, false, { error: 'no tizen in the page' });
    if (name === 'info') {
      const chrome = /Chrome\/(\d+)/.exec(navigator.userAgent);
      return record(label, true, {
        model: capability('http://tizen.org/system/model_name'),
        tizen: capability('http://tizen.org/feature/platform.version'),
        chromium: chrome ? Number(chrome[1]) : null,
        mode: 'own app',
      });
    }
    if (name === 'apps') {
      const ids = await new Promise<string[] | string>((resolve) => {
        try {
          tz()!.application.getAppsInfo((l) => resolve(l.map((a) => a.id)), (e) => resolve(e.message));
        } catch (e) {
          resolve((e as Error).message);
        }
      });
      if (typeof ids === 'string') return record(label, false, { error: ids });
      const known: Record<string, string> = {};
      for (const k of Object.keys(SAMPLE_TITLES).concat(['disney', 'max', 'appletv', 'hulu'])) {
        const id = appIdFor(k);
        if (id) known[k] = id;
      }
      return record(label, true, { count: ids.length, known });
    }
    const title = SAMPLE_TITLES[key];
    const appId = appIdFor(key);
    if (!title) return record(label, false, { error: 'no sample title for ' + key });
    if (!appId && name !== 'linkDial') return record(label, false, { error: `${key} isn’t on this TV` });
    if (name === 'linkAppControl') {
      // YouTube takes the video as PAYLOAD with no link (AeroTizen's fireplace tile, device-tested); the others get
      // the title's web link.
      const error = await appControl(appId!, key === 'youtube' ? null : title.url, title.meta);
      return record(label, !error, error ? { error } : { sentTo: appId, note: 'Did the title open, or only the app?' });
    }
    if (name === 'linkRemote') {
      const r = await remoteDeepLink(appId!, title.meta);
      return record(label, r.ok, {
        events: r.events,
        error: r.error,
        note: r.ok ? 'Did the title open, or only the app? Did the TV ask to allow “HomeTV”?' : undefined,
      });
    }
    if (name === 'linkDial') {
      const r = await dialYouTube(title.meta);
      return record(label, r.status >= 200 && r.status < 300, { ...r, note: 'Did the video play, or a “connect” pane?' });
    }
    return record(label, false, { error: 'not a check in this mode: ' + name });
  },
};
