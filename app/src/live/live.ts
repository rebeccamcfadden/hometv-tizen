// The live catalogue as the screens use it: the source (live/source.ts) wired to the page's network, storage, region and
// the household's TMDB key. The key is read from the key page's private file (bridge.platform.keyPages.tmdbKey) when the
// screens start and again whenever one of them comes back to the front, so a key sent from the phone shows at once.
// Only v1 builds import this (features.ts): v0 has no screen that reads it.
import { bridge } from '../bridge';
import { pageStorage, prefs } from '../launcherSettings';
import { getText } from '../net';
import { createCache } from './cache';
import { createClient, MAX_CHARS, TIMEOUT } from './client';
import { createSource } from './source';
import { regionCode } from './tmdb';

let key = '';
let read = false;
let region = regionCode(prefs.get().region);

const client = createClient({
  get: (url, headers) => getText(url, TIMEOUT, MAX_CHARS, headers),
  key: () => key,
  region: () => region,
  online: () => bridge.platform.online(),
  now: () => Date.now(),
  cache: createCache(pageStorage(), () => Date.now()),
});

const source = createSource(client, () => key);

/** Reads the key and the region again; a changed one sends every screen back for its data. */
function checkKey(): void {
  const r = regionCode(prefs.get().region);
  if (r !== region) {
    region = r;
    source.setKey(key);
  }
  bridge.platform.keyPages
    .tmdbKey()
    .then((k) => {
      const first = !read;
      read = true;
      if (k === key && !first) return;
      key = k;
      source.setKey(k);
    })
    .catch(() => undefined);
}

checkKey();
window.addEventListener('online', () => source.retry());

export const live = {
  ...source,
  /** True until the key has been read, so a screen doesn't flash "Add a TMDB key" while it is. */
  hasKey: () => !read || !!key,
  checkKey,
};
