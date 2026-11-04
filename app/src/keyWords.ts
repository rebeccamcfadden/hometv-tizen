// TEMPORARY: replaced by `@hometv/core/keys` when the shared package (hometv-launcher PR #158, packages/core) lands as
// this repo's submodule. Copied from hometv-launcher's design_preview/src/core/keys.ts (at 6016b87): the keys, their
// states and the words the TV and the phone page show. Only the words and rules are here; the prototype's
// localStorage store stays behind (on Samsung the keys live in service/pages.js's private file). Change the words
// there, not here.

export type KeyId = 'tmdb' | 'watchmode' | 'motn';
/**
 * unset: no key; checking: the TV is asking the service; ok: it answered; bad: it refused the key; unreachable: the TV
 * couldn't reach it, so the key has never been checked (kept and tried again later, but not counted as working until
 * a check passes); built: the build's own key (tv.properties), which a key entered here replaces, and which Remove
 * takes away too. A key that once worked and then can't be reached stays ok.
 */
export type KeyState = 'unset' | 'checking' | 'ok' | 'bad' | 'unreachable' | 'built';

export interface KeyInfo {
  id: KeyId;
  name: string;
  /** What it is for, in a few words. */
  use: string;
  /** Whether the TV needs it: TMDB for titles; Watchmode for prices; Movie of the Night only backs Watchmode up. */
  need: 'titles' | 'prices' | 'optional';
  /** The free plan, as the key page says it. */
  plan: string;
}

export const KEY_INFO: KeyInfo[] = [
  { id: 'tmdb', name: 'TMDB', use: 'Movies, TV Shows and Search', need: 'titles', plan: 'Free for personal use' },
  { id: 'watchmode', name: 'Watchmode', use: 'Rent and buy prices', need: 'prices', plan: 'Free: 2,500 credits a month' },
  {
    id: 'motn',
    name: 'Movie of the Night',
    use: 'More prices, when Watchmode has none',
    need: 'optional',
    plan: 'Free: 1,000 requests a month',
  },
];

export interface KeyEntry {
  state: KeyState;
  /** The key's last four characters, the only part ever shown again. */
  last4: string;
}

const infoOf = (id: KeyId): KeyInfo => KEY_INFO.filter((k) => k.id === id)[0];

/** Line under a key's name on the TV and on the phone page. */
export function keyStatus(id: KeyId, e: KeyEntry): { text: string; tone: 'good' | 'warn' | 'bad' | 'dim' } {
  const info = infoOf(id);
  switch (e.state) {
    case 'ok':
      return { text: `Works · ends ${e.last4}`, tone: 'good' };
    case 'built':
      return { text: 'Works · from this TV’s build', tone: 'good' };
    case 'checking':
      return { text: `Checking with ${info.name}…`, tone: 'dim' };
    case 'unreachable':
      return { text: `Kept, not checked yet: the TV couldn’t reach ${info.name}. It tries again later, or OK tries now.`, tone: 'warn' };
    case 'bad':
      return {
        text:
          id === 'tmdb'
            ? 'TMDB refused it. Copy the API Read Access Token (the long one), all of it.'
            : `${info.name} refused it. Copy the key again, all of it.`,
        tone: 'bad',
      };
    default:
      return { text: info.need === 'optional' ? 'Not set · optional' : 'Not set', tone: 'dim' };
  }
}

/** The section's value: "3 working", "Not set", "1 of 3 set", "1 not checked", "1 refused". */
export function keysValue(keys: Record<KeyId, KeyEntry>, only?: KeyId[]): { text: string; warn?: boolean } {
  const ids = only || KEY_INFO.map((k) => k.id);
  const states = ids.map((id) => keys[id].state);
  const refused = states.filter((s) => s === 'bad').length;
  if (refused) return { text: `${refused} refused`, warn: true };
  if (states.indexOf('checking') >= 0) return { text: 'Checking…' };
  const working = states.filter((s) => s === 'ok' || s === 'built').length;
  const unchecked = states.filter((s) => s === 'unreachable').length;
  const needed = ids.filter((id) => infoOf(id).need !== 'optional');
  const missing = needed.filter((id) => keys[id].state === 'unset');
  if (missing.length) {
    return { text: missing.length === needed.length ? 'Not set' : `${working + unchecked} of ${ids.length} set`, warn: false };
  }
  if (unchecked) return { text: `${unchecked} not checked`, warn: true };
  return { text: `${working} working` };
}
