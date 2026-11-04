// Home: the app row (the TV's apps, opened through the bridge) and, for the spike, the way to the Checks screen.
// Ported screens (Movies, TV Shows, Search, the title preview) join through the shell's tabs and the nav.

import { HOME_APPS } from '../apps';
import { bridge, type AppInfo } from '../bridge';
import { h } from '../shell/dom';
import { focusable } from '../shell/focus';
import { shell, type Screen } from '../shell/app';
import { showChecks } from './checks';

const MODE_TEXT = {
  app: 'Samsung app',
  tv: 'On the TV (TizenBrew)',
  'fake-tv': 'Fake TV on this PC',
  preview: 'Preview: no TV, apps don’t open',
};

export function topBar(title: string): HTMLElement {
  const bar = h('div.topbar', h('div.brand', title));
  const right = h('div.topright', h('span.pill.' + bridge.mode(), MODE_TEXT[bridge.mode()]));
  if (bridge.problem()) bar.appendChild(h('div.problem', 'TV: ' + bridge.problem()));
  const clock = h('span.clock');
  const tick = () => {
    const d = new Date();
    clock.textContent = `${d.getHours()}:${('0' + d.getMinutes()).slice(-2)}`;
  };
  tick();
  window.setInterval(tick, 15000);
  right.appendChild(clock);
  bar.appendChild(right);
  return bar;
}

function tile(app: (typeof HOME_APPS)[number], info: AppInfo | null): HTMLElement {
  const missing = !!info && info.installed === false;
  const el = h('button.tile' + (missing ? '.missing' : ''), { style: `background:${app.bg}` });
  el.appendChild(h('span.mark', { style: `font-weight:${app.weight}` }, app.mark));
  // The TV's own artwork for the app when it has some (Samsung's icon cache); the wordmark stays underneath.
  const art = bridge.artwork(app.key);
  if (art.length) {
    const img = h('img.art') as HTMLImageElement;
    let next = 0;
    img.onerror = () => {
      next++;
      if (next < art.length) img.src = art[next];
      else if (img.parentNode) img.parentNode.removeChild(img);
    };
    img.onload = () => el.classList.add('has-art');
    img.src = art[0];
    el.appendChild(img);
  }
  el.appendChild(h('span.name', missing ? `${app.name} · not on this TV` : app.name));
  return focusable(el, {
    group: 'apps',
    key: 'app-' + app.key,
    onOk: async () => {
      if (missing) return shell.toast(`${app.name} isn’t on this TV. Samsung’s Apps can add it.`, true);
      shell.toast(`Opening ${app.name}…`);
      const r = await bridge.launch(app.key);
      if (r.ok && r.id) shell.toast(`Opening ${app.name} (${r.id}).`);
      else if (r.ok) shell.toast(`Preview: on the TV this opens ${app.name}.`);
      else shell.toast(`${app.name} didn’t open: ${r.error}`, true);
    },
  });
}

export function homeScreen(): Screen & { setApps(apps: AppInfo[] | null): void } {
  const el = h('div.screen.home');
  const screen = {
    label: 'Home',
    el,
    setApps(apps: AppInfo[] | null) {
      while (el.firstChild) el.removeChild(el.firstChild);
      el.appendChild(topBar('HomeTV'));
      el.appendChild(h('h2.rowtitle', 'Apps'));
      const row = h('div.approw');
      for (const app of HOME_APPS) row.appendChild(tile(app, apps ? apps.filter((a) => a.key === app.key)[0] || null : null));
      el.appendChild(row);
      const checks = focusable(h('button.button', 'Checks for the TV call'), { key: 'checks', onOk: showChecks });
      el.appendChild(h('div.lowerrow', checks, h('span.hint', 'Blue key or Info: Checks · the remote’s Home key leaves HomeTV')));
      shell.refocus();
    },
  };
  screen.setApps(null);
  return screen;
}
