// Home's app row: design_preview's default row and brand colours, from the shared package (@hometv/core, the
// submodule vendor/hometv-launcher, docs/shared-package.md). `key` is the name service/service.js and AeroTizen's
// glue know the app by on Samsung; it differs only where the shared package tells two services apart that are one app
// on a Samsung (the Apple TV app and Apple's store).
import { APP_BRAND, HOME_APPS as SHARED_HOME_APPS } from '@hometv/core/services.ts';

export const SAMSUNG_KEY: Record<string, string> = { appletvplus: 'appletv' };

export interface HomeApp {
  /** The app's name on Samsung (service.js's APPS table). */
  key: string;
  /** The shared package's id. */
  id: string;
  name: string;
  /** The wordmark on its tile, until real logos are licensed. */
  mark: string;
  weight: number;
  /** Tile and wordmark colours, a stand-in for the app's logo art. */
  bg: string;
  fg: string;
}

export const HOME_APPS: HomeApp[] = SHARED_HOME_APPS.map((a) => {
  const brand = APP_BRAND[a.id];
  return {
    key: SAMSUNG_KEY[a.id] || a.id,
    id: a.id,
    name: a.name,
    mark: a.mark,
    weight: a.weight,
    bg: brand ? brand.bg : '#1c1c1e',
    fg: brand ? brand.fg : '#ffffff',
  };
});