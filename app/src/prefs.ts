// The launcher's own choices that v0 has: Motion and the screensaver, with design_preview's values and defaults
// (hometv-launcher's design_preview/src/core/settings.ts at 2bf3c2d: `motion`, F36's `screensaverAfter` and
// `screensaverBack`). Kept in the page's localStorage under `hometv-prefs`. The Settings page (W6) shows and changes
// them; the nav's Settings menu steps Motion. Pure apart from the storage passed in, so tests run it in Node.

export type Motion = 'full' | 'reduced' | 'off';
/** F36: minutes Home sits untouched before the clock screensaver, or off. */
export type ScreensaverAfter = 'off' | '5' | '15' | '30';
/**
 * What the clock floats over. design_preview also has 'picture' (the theme's picture dimmed): Midnight, v0's only theme,
 * has no picture, so v0 has the glow and black.
 */
export type ScreensaverBack = 'glow' | 'black';

export interface Prefs {
  motion: Motion;
  screensaverAfter: ScreensaverAfter;
  screensaverBack: ScreensaverBack;
}

export const PREFS_KEY = 'hometv-prefs';
export const MOTIONS: Motion[] = ['full', 'reduced', 'off'];
export const MOTION_LABELS: Record<Motion, string> = { full: 'Full', reduced: 'Reduced', off: 'Off' };
export const SCREENSAVER_AFTER: ScreensaverAfter[] = ['off', '5', '15', '30'];
export const SCREENSAVER_AFTER_LABELS: Record<ScreensaverAfter, string> = { off: 'Off', '5': '5 min', '15': '15 min', '30': '30 min' };
export const SCREENSAVER_BACKS: ScreensaverBack[] = ['glow', 'black'];
export const SCREENSAVER_BACK_LABELS: Record<ScreensaverBack, string> = { glow: 'Glow', black: 'Black' };

/** design_preview's first-run values: the screensaver is off until the household picks a time. */
export const DEFAULT_PREFS: Prefs = { motion: 'full', screensaverAfter: 'off', screensaverBack: 'glow' };

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const oneOf = <T extends string>(list: T[], v: unknown, fallback: T): T => (list.indexOf(v as T) >= 0 ? (v as T) : fallback);

/** What was saved, each value checked; anything odd or missing is its default. */
export function loadPrefs(storage: KeyValueStore | null): Prefs {
  let saved: Partial<Record<keyof Prefs, unknown>> = {};
  try {
    const raw = storage && storage.getItem(PREFS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed as typeof saved;
  } catch (e) {
    // Blocked or corrupt storage: the defaults.
  }
  return {
    motion: oneOf(MOTIONS, saved.motion, DEFAULT_PREFS.motion),
    screensaverAfter: oneOf(SCREENSAVER_AFTER, saved.screensaverAfter, DEFAULT_PREFS.screensaverAfter),
    screensaverBack: oneOf(SCREENSAVER_BACKS, saved.screensaverBack, DEFAULT_PREFS.screensaverBack),
  };
}

export function savePrefs(storage: KeyValueStore | null, p: Prefs): void {
  try {
    if (storage) storage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch (e) {
    // The choice lasts until the page reloads.
  }
}

function pageStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
}

let current: Prefs | null = null;
const listeners: (() => void)[] = [];

/** The page's prefs: read once, changed with `set`, which saves and tells the listeners. */
export const prefs = {
  get(): Readonly<Prefs> {
    if (!current) current = loadPrefs(pageStorage());
    return current;
  },
  set(patch: Partial<Prefs>) {
    const next = loadPrefs(null);
    const now = prefs.get();
    next.motion = oneOf(MOTIONS, patch.motion, now.motion);
    next.screensaverAfter = oneOf(SCREENSAVER_AFTER, patch.screensaverAfter, now.screensaverAfter);
    next.screensaverBack = oneOf(SCREENSAVER_BACKS, patch.screensaverBack, now.screensaverBack);
    current = next;
    savePrefs(pageStorage(), next);
    listeners.slice().forEach((fn) => fn());
  },
  /** Calls `fn` after a change; returns a function that stops it. */
  on(fn: () => void): () => void {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  },
};
