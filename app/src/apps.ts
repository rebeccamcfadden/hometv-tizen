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

export const HOME_APPS: HomeApp[] = [
  { key: 'netflix', name: 'Netflix', mark: 'NETFLIX', weight: 700, bg: '#141414' },
  { key: 'youtube', name: 'YouTube', mark: '▶ YouTube', weight: 600, bg: '#212121' },
  { key: 'prime', name: 'Prime Video', mark: 'prime video', weight: 600, bg: '#0f171e' },
  { key: 'disney', name: 'Disney+', mark: 'Disney+', weight: 400, bg: '#0e1a4f' },
  { key: 'max', name: 'HBO Max', mark: 'HBO max', weight: 700, bg: '#002be7' },
  { key: 'appletv', name: 'Apple TV', mark: 'Apple TV', weight: 400, bg: '#1c1c1e' },
  { key: 'hulu', name: 'Hulu', mark: 'hulu', weight: 700, bg: '#0b2e1a' },
];
