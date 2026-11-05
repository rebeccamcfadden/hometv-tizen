// The check's progress on the TV: which step it's on, the answers so far (shaped as the report, report-schema.json),
// and what it was waiting for when another app was opened. Kept in this app's storage, so the check goes on where it
// was if the TV closes and reopens the app (after Home, after another app). Pure: the screen gives it the storage.

export interface Pending {
  /** The step that opened another app. */
  step: string;
  /** Which of the step's parts (a title link's id), when it has several. */
  part?: string;
  /** When the app was opened (ms since 1970). */
  at: number;
}

export interface Progress {
  step: number;
  /** The report so far, in report-schema.json's "tv" shape (cleaned before it leaves: report.ts). */
  draft: Record<string, any>;
  pending: Pending | null;
  /** Each page load of this check, so a step knows the app was started again. */
  starts: number;
}

export const STORE = 'hometv-check-progress-v1';

/** The steps, in order. The screen draws each; `auto` ones run without the person. */
export const STEPS: { id: string; title: string; auto?: boolean }[] = [
  { id: 'auto', title: 'Checking this TV', auto: true },
  { id: 'keys', title: 'Remote buttons' },
  { id: 'phone', title: 'Phone (optional)' },
  { id: 'youtube', title: 'Open YouTube and come back' },
  { id: 'home', title: 'The Home button' },
  { id: 'links', title: 'Opening a film or video' },
  { id: 'done', title: 'Done' },
];

/** The title links tried, in order: the report's names, the check that sends each, and the app it needs. */
export const LINKS: { id: string; check: string; app: string; label: string }[] = [
  { id: 'youtubeAppControl', check: 'linkAppControl', app: 'youtube', label: 'a YouTube video' },
  { id: 'netflixAppControl', check: 'linkAppControl', app: 'netflix', label: 'a Netflix series (first way)' },
  { id: 'netflixRemote', check: 'linkRemote', app: 'netflix', label: 'a Netflix series (second way)' },
  { id: 'primeAppControl', check: 'linkAppControl', app: 'prime', label: 'a Prime Video series' },
  { id: 'youtubeDial', check: 'linkDial', app: 'youtube', label: 'a YouTube video (second way)' },
];

/** The remote's buttons asked for, in order. */
export const KEY_ORDER = ['red', 'green', 'yellow', 'blue', 'info', 'digits'] as const;

export function fresh(version: string): Progress {
  return { step: 0, draft: { schema: 'hometv-check-1', checkApp: version, finished: false }, pending: null, starts: 0 };
}

export function load(storage: Storage | null, version: string): Progress {
  try {
    const p = JSON.parse((storage && storage.getItem(STORE)) || 'null') as Progress | null;
    if (p && typeof p.step === 'number' && p.draft && typeof p.draft === 'object') return p;
  } catch (e) {
    // Unreadable: start again.
  }
  return fresh(version);
}

export function save(storage: Storage | null, p: Progress): void {
  try {
    if (storage) storage.setItem(STORE, JSON.stringify(p));
  } catch (e) {
    // The screen still has it.
  }
}

/** Sets draft[a][b]… = value, making the objects on the way. */
export function put(p: Progress, path: string, value: unknown): void {
  const keys = path.split('.');
  let o = p.draft;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!o[keys[i]] || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

export function get(p: Progress, path: string): unknown {
  let o: any = p.draft;
  for (const k of path.split('.')) {
    if (!o || typeof o !== 'object') return undefined;
    o = o[k];
  }
  return o;
}

/**
 * How the person came back after another app opened: the same page still running ('running'), or the app started
 * again ('restarted', the TV had closed it). Clears `pending`. Null when nothing was pending for this step.
 */
export function cameBack(p: Progress, step: string, restarted: boolean, now: number): { how: 'running' | 'restarted'; seconds: number; part?: string } | null {
  if (!p.pending || p.pending.step !== step) return null;
  const r = { how: restarted ? ('restarted' as const) : ('running' as const), seconds: Math.max(0, Math.round((now - p.pending.at) / 1000)), part: p.pending.part };
  p.pending = null;
  return r;
}

/** The streaming app keys a list of app names holds (the TV's own names, as AeroTizen lists them). */
export function knownIn(names: string[], known: Record<string, string>): Record<string, boolean> {
  const norm = (s: string) => s.toLowerCase().replace(/\s+-\s.*$/, '').replace(/\s+/g, ' ').trim();
  const have = names.map(norm);
  const out: Record<string, boolean> = {};
  for (const key of Object.keys(known)) {
    const want = norm(known[key]);
    out[key] = have.some((n) => n === want || (key === 'max' && n === 'max') || (key === 'appletv' && n === 'apple tv+'));
  }
  return out;
}
