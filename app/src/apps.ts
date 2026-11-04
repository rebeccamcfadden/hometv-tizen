// Home's app row for a US household. The names, wordmarks and weights follow design_preview's HOME_APPS
// (src/data/services.ts) until they come from the shared package (docs/shared-package.md); the keys match the
// service's APPS table, which holds Samsung's app ids.

export interface HomeApp {
  key: string;
  name: string;
  /** The wordmark on its tile, until real logos are licensed. */
  mark: string;
  weight: number;
  /** Tile colour, a stand-in for the app's logo art. */
  bg: string;
}

/**
 * Samsung's app ids, newer first, for opening apps straight from the page when HomeTV runs as its own app. The same
 * table is in service/service.js (APPS), for the TizenBrew module; tests/app-ids.test.mjs keeps the two equal.
 */
export const APP_IDS: Record<string, string[]> = {
  netflix: ['3201907018807', '11101200001'],
  youtube: ['111299001912'],
  prime: ['3201910019365', '3201512006785'],
  disney: ['3202204027038', '3202009021709', '3201901017640'],
  max: ['3202301029760', '3201601007230'],
  appletv: ['3201807016597'],
  hulu: ['3201601007625'],
  peacock: ['3202006020991'],
  paramount: ['3202110025305', '3201710014981'],
  spotify: ['3201606009684'],
  plex: ['3201512006963'],
  tubi: ['3201504001965'],
  pluto: ['3201808016802'],
};

export const HOME_APPS: HomeApp[] = [
  { key: 'netflix', name: 'Netflix', mark: 'NETFLIX', weight: 700, bg: '#141414' },
  { key: 'youtube', name: 'YouTube', mark: '▶ YouTube', weight: 600, bg: '#212121' },
  { key: 'prime', name: 'Prime Video', mark: 'prime video', weight: 600, bg: '#0f171e' },
  { key: 'disney', name: 'Disney+', mark: 'Disney+', weight: 400, bg: '#0e1a4f' },
  { key: 'max', name: 'HBO Max', mark: 'HBO max', weight: 700, bg: '#002be7' },
  { key: 'appletv', name: 'Apple TV', mark: 'Apple TV', weight: 400, bg: '#1c1c1e' },
  { key: 'hulu', name: 'Hulu', mark: 'hulu', weight: 700, bg: '#0b2e1a' },
];
