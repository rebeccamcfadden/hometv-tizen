import './styles.css';
import { bridge } from './bridge';
import { shell } from './shell/app';
import { homeScreen } from './screens/home';
import { showChecks } from './screens/checks';
import { libraryScreen } from './screens/library';
// Fills routes.person, so Cast & crew and Search's People results open the person page.
import './screens/person';
import { searchScreen } from './screens/search';

// HomeTV for Samsung: the shell (screen stack, focus, keys) and its screens. Home first; Movies, TV Shows and Search are
// its tabs, ported from design_preview.

const t0 = Date.now();
const stage = document.getElementById('stage') as HTMLElement;

const home = homeScreen();

shell.extraKeys = {
  406: showChecks, // Blue
  457: showChecks, // Info
  67: showChecks, // C on a PC keyboard
};

async function start() {
  bridge.setToast((text) => shell.toast(text, /didn’t|refused|failed/i.test(text)));
  await bridge.connect();
  const serviceFoundMs = Date.now() - t0;
  home.setApps(null);
  shell.init(stage, {
    home: () => home,
    movies: () => libraryScreen('movie'),
    tv: () => libraryScreen('show'),
    search: searchScreen,
  });
  const homeShownMs = Date.now() - t0;
  // Tells the installed app's loader (app/loader/boot.js) this page works; its updater may then look for a newer one.
  const boot = (window as unknown as { HomeTVBoot?: { started(): void } }).HomeTVBoot;
  if (boot) boot.started();
  if (bridge.mode() === 'app') shell.toast(`Home in ${homeShownMs} ms · ${(/Chrome\/(\d+)/.exec(navigator.userAgent) || ['', '?'])[1]}`);
  if (bridge.mode() === 'tv' || bridge.mode() === 'fake-tv') {
    bridge.check('timing', {
      homeShownMs,
      serviceFoundMs,
      userAgent: navigator.userAgent,
      screen: `${window.innerWidth}x${window.innerHeight}`,
    });
  }
  home.setApps(await bridge.apps());
  if (bridge.mode() === 'app') shell.toast(`${bridge.appCount()} apps on this TV`);
}

start();
