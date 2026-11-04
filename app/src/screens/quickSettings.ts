// The nav's Settings menu, from hometv-launcher's design_preview/src/screens/quickSettings.ts at 2bf3c2d (V2 design
// final-quick-settings): the Wi-Fi and Inputs dropdown look, hung under the icon, in groups. TV settings and Launcher
// settings; the TV's own pages; then Motion, where OK steps the value in place, the menu stays open, and dots show
// where it is. The household rows that need v1 (TMDB account, Streaming services, Weather) come with v1's Settings.
// The TV's pages open through the platform (Samsung's Settings app when the TV lists one), or the menu says where they
// are in the TV's menus.

import { V1 } from '../features';
import { MOTION_LABELS, MOTIONS, prefs } from '../prefs';
import { shell, type Screen } from '../shell/app';
import { dropdown, type MenuRow } from './dropdown';
import { openTvPage } from './navMenus';

/**
 * Launcher settings. A stand-in until the Settings page (W6) is merged: builder-4 points this at it. `section` is the
 * page's section a row opens ('services', 'screensaver', 'report'…), for when it has them.
 */
export function showSettings(section?: string): void {
  void section;
  shell.toast('Settings: coming');
}

export function settingsMenu(anchor: HTMLElement | null): Screen {
  const rows: MenuRow[] = [
    { label: 'TV settings', icon: 'settings', onOk: () => openTvPage('main', 'The TV’s settings') },
    { label: 'Launcher settings', icon: 'apps', chevron: true, onOk: () => showSettings() },
    { label: 'Picture', icon: 'picture', divider: true, onOk: () => openTvPage('picture', 'Picture settings') },
    { label: 'Sound', icon: 'sound', onOk: () => openTvPage('sound', 'Sound settings') },
    { label: 'Network & Wi-Fi', icon: 'wifi', onOk: () => openTvPage('network', 'Network and Wi-Fi settings') },
    { label: 'Inputs', icon: 'input', onOk: () => openTvPage('inputs', 'The TV’s inputs') },
  ];
  // design_preview's household group: Streaming services always, TMDB account and Weather when their feature is on.
  if (V1) rows.push({ label: 'Streaming services', icon: 'apps', divider: true, chevron: true, onOk: () => showSettings('services') });
  rows.push({
    label: 'Motion',
    icon: 'motion',
    divider: true,
    status: () => MOTION_LABELS[prefs.get().motion],
    dots: () => [MOTIONS.length, MOTIONS.indexOf(prefs.get().motion)],
    cycle: () => prefs.set({ motion: MOTIONS[(MOTIONS.indexOf(prefs.get().motion) + 1) % MOTIONS.length] }),
  });
  return dropdown('Settings', anchor, rows, { className: 'menu--settings' });
}
