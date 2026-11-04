import './styles.css';
import { bridge } from './bridge';
import { shell, type Screen } from './shell/app';
import { h } from './shell/dom';
import { homeScreen } from './screens/home';
import { showChecks } from './screens/checks';

// HomeTV for Samsung: the shell (screen stack, focus, keys) and its screens. Home first; the other tabs are filled
// as screens are ported from design_preview.

const t0 = Date.now();
const stage = document.getElementById('stage') as HTMLElement;

const placeholder = (label: string): Screen => ({ label, el: h('div.screen', h('h2.rowtitle', `${label}: not ported yet`)) });
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
    movies: () => placeholder('Movies'),
    tv: () => placeholder('TV Shows'),
    search: () => placeholder('Search'),
  });
  const homeShownMs = Date.now() - t0;
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
