// The lists Movies and TV Shows show as chips: TMDB's browse lists for the kind (Trending, Popular, Top rated, and Now
// playing or On the air), then My list (the household's own, kept on this TV: data/store.ts). When TMDB accounts
// are shared (M3) the signed-in lists join them here.
import type { Kind } from '@hometv/core/types.ts';
import { listsFor } from '../live/tmdb';

export interface ShownList {
  /** 'my', or a TMDB list id from live/tmdb.ts. */
  id: string;
  name: string;
}

export const MY_LIST = 'my';
/** The chip the page opens on. */
export const FIRST_LIST = 'trending';

export const lists = {
  /** TMDB's lists that exist for the kind, then My list. */
  all: (kind: Kind): ShownList[] => listsFor(kind).map((l) => ({ id: l.id, name: l.name })).concat([{ id: MY_LIST, name: 'My list' }]),
  byId: (kind: Kind, id: string): ShownList | undefined => lists.all(kind).filter((l) => l.id === id)[0],
};
