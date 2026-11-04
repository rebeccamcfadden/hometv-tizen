// Household state that outlives a screen: My list, Seen and Favorites (what the title page's toggles change), recent
// searches and recently viewed titles. Ported from design_preview's core/store.ts; kept in localStorage under
// `hometv-household-v1`. Mock defaults until the TMDB account is shared: the catalogue's own My list.

import { TITLES } from './catalog';

interface Persisted {
  myList: string[];
  seen: string[];
  favorites: string[];
  recent: string[];
  viewed: string[];
}

const KEY = 'hometv-household-v1';
/** Recent searches kept, newest first: four fit the Search panel above the keyboard. */
const MAX_RECENT = 4;

const defaults = (): Persisted => ({
  myList: TITLES.filter((t) => t.lists.indexOf('my') >= 0).map((t) => t.id),
  seen: ['knives-out', 'budapest'],
  favorites: ['arrival'],
  recent: ['dune', 'amy adams', 'sci-fi', 'carnival row'],
  viewed: ['arrival', 'dune', 'past-lives', 'coda', 'moon', 'severance'],
});

function load(): Persisted {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Persisted>;
      return {
        myList: saved.myList || d.myList,
        seen: saved.seen || d.seen,
        favorites: saved.favorites || d.favorites,
        recent: saved.recent || d.recent,
        viewed: saved.viewed || d.viewed,
      };
    }
  } catch (e) {
    // Corrupt or blocked storage: start fresh.
  }
  return d;
}

const data = load();
data.recent = data.recent.slice(0, MAX_RECENT);
// Arrays kept in order (My list's order is "Recently added"), with a lookup beside each.
const sets = { myList: data.myList, seen: data.seen, favorites: data.favorites };

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    // Lasts until the page reloads.
  }
}

const listeners: (() => void)[] = [];

function toggle(list: string[], id: string): boolean {
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else list.push(id);
  save();
  listeners.slice().forEach((fn) => fn());
  return i < 0;
}

export const store = {
  inMyList: (id: string) => sets.myList.indexOf(id) >= 0,
  isSeen: (id: string) => sets.seen.indexOf(id) >= 0,
  isFavorite: (id: string) => sets.favorites.indexOf(id) >= 0,
  toggleMyList: (id: string) => toggle(sets.myList, id),
  toggleSeen: (id: string) => toggle(sets.seen, id),
  toggleFavorite: (id: string) => toggle(sets.favorites, id),
  /** My list, oldest added first. */
  myListIds: () => sets.myList.slice(),
  recent: () => data.recent,
  viewed: () => data.viewed,
  pushRecent(q: string) {
    const v = q.trim().toLowerCase();
    if (!v) return;
    data.recent = [v].concat(data.recent.filter((r) => r !== v)).slice(0, MAX_RECENT);
    save();
  },
  pushViewed(id: string) {
    data.viewed = [id].concat(data.viewed.filter((r) => r !== id)).slice(0, 10);
    save();
  },
  /** Calls `fn` after My list, Seen or Favorites changes; returns a function that stops it. */
  on(fn: () => void): () => void {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  },
};
