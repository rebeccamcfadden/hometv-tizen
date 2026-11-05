// Settings › Privacy's saved state: the year the person picked, which switches they ticked (and when), and what the TV
// looked like at the last tick, so the re-check can show what changed since. Kept apart from the launcher's Prefs, in
// its own key; pure apart from the storage it's given.

import type { KeyValueStore } from '../homeRow';
import { YEAR_GROUPS, type YearGroup } from './switches';

export const PRIVACY_KEY = 'hometv-privacy-v1';

export interface AppSeen {
  id: string;
  name: string;
}

/** What HomeTV could read about the TV at one moment. */
export interface Readout {
  /** The apps HomeTV could list, or null when it couldn't list any. */
  apps: AppSeen[] | null;
  /** True when that is the TV's whole app list (with Samsung's hidden parts), false when only the visible apps. */
  full: boolean;
  osVersion: string;
  model: string;
}

export interface Snapshot extends Readout {
  at: number;
}

export interface PrivacyState {
  /** The year group the person picked; null to use what the TV says. */
  year: YearGroup | null;
  /** Switch id → when it was ticked (ms). */
  ticks: Record<string, number>;
  /** The TV at the last tick. */
  snapshot: Snapshot | null;
}

const empty = (): PrivacyState => ({ year: null, ticks: {}, snapshot: null });

function readApps(v: unknown): AppSeen[] | null {
  if (!Array.isArray(v)) return null;
  const out: AppSeen[] = [];
  for (const a of v) {
    if (a && typeof a.id === 'string' && a.id) out.push({ id: a.id, name: typeof a.name === 'string' ? a.name : a.id });
  }
  return out;
}

function readSnapshot(v: unknown): Snapshot | null {
  const s = v as Record<string, unknown> | null;
  if (!s || typeof s !== 'object' || typeof s.at !== 'number') return null;
  return {
    at: s.at,
    apps: readApps(s.apps),
    full: s.full === true,
    osVersion: typeof s.osVersion === 'string' ? s.osVersion : '',
    model: typeof s.model === 'string' ? s.model : '',
  };
}

/** The saved state, or an empty one when nothing is saved or it can't be read. */
export function loadPrivacy(storage: KeyValueStore | null): PrivacyState {
  const out = empty();
  try {
    const raw = storage && storage.getItem(PRIVACY_KEY);
    if (!raw) return out;
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return out;
    if (YEAR_GROUPS.indexOf(v.year) >= 0) out.year = v.year;
    if (v.ticks && typeof v.ticks === 'object') {
      for (const k of Object.keys(v.ticks)) if (typeof v.ticks[k] === 'number') out.ticks[k] = v.ticks[k];
    }
    out.snapshot = readSnapshot(v.snapshot);
  } catch (e) {
    return empty();
  }
  return out;
}

export function savePrivacy(storage: KeyValueStore | null, s: PrivacyState): void {
  try {
    if (storage) storage.setItem(PRIVACY_KEY, JSON.stringify(s));
  } catch (e) {
    // Full or blocked storage: the ticks last until HomeTV closes.
  }
}

/** The live state: read once, saved at every change, with listeners. */
export function createPrivacy(storage: KeyValueStore | null) {
  let data = loadPrivacy(storage);
  let listeners: (() => void)[] = [];
  const commit = (next: PrivacyState) => {
    data = next;
    savePrivacy(storage, data);
    listeners.slice().forEach((fn) => fn());
  };
  return {
    get: (): Readonly<PrivacyState> => data,
    setYear(year: YearGroup | null) {
      commit({ year, ticks: data.ticks, snapshot: data.snapshot });
    },
    isTicked: (id: string): boolean => typeof data.ticks[id] === 'number',
    /** Ticks or unticks a switch; a tick also records `readout` as what the TV looked like then. */
    toggle(id: string, now: number, readout: Readout | null) {
      const ticks: Record<string, number> = {};
      for (const k of Object.keys(data.ticks)) ticks[k] = data.ticks[k];
      const ticking = typeof ticks[id] !== 'number';
      if (ticking) ticks[id] = now;
      else delete ticks[id];
      const snapshot = ticking && readout ? { at: now, apps: readout.apps, full: readout.full, osVersion: readout.osVersion, model: readout.model } : data.snapshot;
      commit({ year: data.year, ticks, snapshot });
    },
    /** Calls `fn` on every change; returns a function that stops it. */
    on(fn: () => void): () => void {
      listeners.push(fn);
      return () => {
        listeners = listeners.filter((x) => x !== fn);
      };
    },
  };
}

export type PrivacyStore = ReturnType<typeof createPrivacy>;
