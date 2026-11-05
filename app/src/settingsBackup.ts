// HomeTV's own settings, kept once more before each change set, so Settings › First run's "Restore previous settings"
// can undo it (docs/backup.md). A change set is one visit to Settings or to first run: what the page's storage held
// when the screen opened is kept under `hometv-settings-previous` when the screen closes, if anything changed. Restore
// puts those values back and keeps the ones it replaced, so a second Restore undoes the first. Only HomeTV's own keys
// (the settings, Home's row, the TV Utilities moves; not first run's flag, so a restore never brings first run back); Samsung's settings are out of a web app's reach.
// Pure apart from the storage passed in, so tests run it in Node.

import { HOME_ROW_KEY, type KeyValueStore } from './homeRow';
import { UTILITY_MOVES_KEY } from './tvUtilities';

export const PREVIOUS_KEY = 'hometv-settings-previous';
export const SNAPSHOT_SCHEMA = 'hometv-settings-1';
/** The keys a snapshot holds: launcherSettings.ts's SETTINGS_KEY, Home's row, the utility moves. */
export const BACKED_UP_KEYS = ['hometv-settings-v1', HOME_ROW_KEY, UTILITY_MOVES_KEY];

export type SnapshotWhy = 'settings' | 'setup' | 'restore';

export interface Snapshot {
  schema: string;
  /** When it was read (ms since 1970). */
  at: number;
  /** Which change set it was taken before. */
  why: SnapshotWhy;
  /** Each key's raw value, or null when the key wasn't set. */
  values: Record<string, string | null>;
}

export interface BackupStore extends KeyValueStore {
  removeItem(key: string): void;
}

const WHYS: SnapshotWhy[] = ['settings', 'setup', 'restore'];

/** HomeTV's settings as the storage holds them now, or null when the storage can't be read (never a baseline). */
export function exportSettings(storage: KeyValueStore | null, at: number, why: SnapshotWhy): Snapshot | null {
  if (!storage) return null;
  const values: Record<string, string | null> = {};
  try {
    for (const k of BACKED_UP_KEYS) {
      const v = storage.getItem(k);
      values[k] = typeof v === 'string' ? v : null;
    }
  } catch (e) {
    return null;
  }
  return { schema: SNAPSHOT_SCHEMA, at, why, values };
}

export function sameValues(a: Snapshot, b: Snapshot): boolean {
  return BACKED_UP_KEYS.every((k) => a.values[k] === b.values[k]);
}

/** The kept snapshot, or null when there is none or it can't be read. */
export function readPrevious(storage: KeyValueStore | null): Snapshot | null {
  try {
    const raw = storage && storage.getItem(PREVIOUS_KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Snapshot>) : null;
    if (!s || s.schema !== SNAPSHOT_SCHEMA || typeof s.at !== 'number' || WHYS.indexOf(s.why as SnapshotWhy) < 0) return null;
    if (!s.values || typeof s.values !== 'object') return null;
    const values: Record<string, string | null> = {};
    for (const k of BACKED_UP_KEYS) {
      const v = (s.values as Record<string, unknown>)[k];
      if (v !== null && typeof v !== 'string') return null;
      values[k] = v as string | null;
    }
    return { schema: SNAPSHOT_SCHEMA, at: s.at, why: s.why as SnapshotWhy, values };
  } catch (e) {
    return null;
  }
}

function writePrevious(storage: KeyValueStore, s: Snapshot): boolean {
  try {
    storage.setItem(PREVIOUS_KEY, JSON.stringify(s));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Keeps `before` as the previous settings when the storage now holds something else. Nothing is kept when `before`
 * couldn't be read, or when nothing changed (so an empty visit never replaces a useful snapshot).
 */
export function keepIfChanged(storage: KeyValueStore | null, before: Snapshot | null, now: number): boolean {
  if (!storage || !before) return false;
  const after = exportSettings(storage, now, before.why);
  if (!after || sameValues(before, after)) return false;
  return writePrevious(storage, before);
}

function apply(storage: BackupStore, values: Record<string, string | null>) {
  for (const k of BACKED_UP_KEYS) {
    const v = values[k];
    if (v === null || v === undefined) storage.removeItem(k);
    else storage.setItem(k, v);
  }
}

/**
 * Puts the previous settings back, and keeps the ones it replaced as the new previous (so Restore again undoes it).
 * False, with nothing changed, when there is no previous snapshot, the storage can't be read, or the write fails.
 */
export function restorePrevious(storage: BackupStore | null, now: number): boolean {
  if (!storage) return false;
  const prev = readPrevious(storage);
  const current = exportSettings(storage, now, 'restore');
  if (!prev || !current) return false;
  try {
    apply(storage, prev.values);
  } catch (e) {
    try {
      apply(storage, current.values);
    } catch (e2) {
      // The loaders fall back to defaults for anything half-written.
    }
    return false;
  }
  writePrevious(storage, current);
  return true;
}

/**
 * One change set: reads the settings as the screen opens; `end()` keeps them if the screen changed anything;
 * `rebase()` starts again from now (after a Restore, so closing the screen doesn't undo the Restore's own snapshot).
 */
export function changeSet(storage: KeyValueStore | null, why: SnapshotWhy, clock: () => number = Date.now) {
  let before = exportSettings(storage, clock(), why);
  return {
    end: () => keepIfChanged(storage, before, clock()),
    rebase() {
      before = exportSettings(storage, clock(), why);
    },
  };
}
