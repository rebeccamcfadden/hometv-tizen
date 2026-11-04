import './styles.css';
import { actionOf, type Action } from './keys';
import { bridge, type AppInfo, type Result } from './bridge';
import { HOME_APPS } from './apps';

// Spike: Home's app row, and the Checks screen used on the TV call (docs/tv-call-checklist.md). Each focusable
// thing is a button in a list of rows; arrows move within and between rows, OK presses, Back goes back.

const t0 = Date.now();
const stage = document.getElementById('stage') as HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Scales the 1920×1080 design to the window (a TV's web view is 1920 wide; a PC window may not be). */
function fit() {
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `scale(${s})`;
}
window.addEventListener('resize', fit);
fit();

// ------------------------------------------------------------ focus: rows of buttons

interface Screen {
  root: HTMLElement;
  rows: HTMLElement[][];
  row: number;
  col: number;
  /** The column each row had focused last, so Up and Down come back to it (design_preview's data-group). */
  memory?: number[];
  onBack?: () => void;
}

let screen: Screen | null = null;

function focus(s: Screen) {
  const prev = stage.querySelector('.focused');
  if (prev) prev.classList.remove('focused');
  const row = s.rows[s.row] || [];
  const target = row[Math.min(s.col, row.length - 1)];
  if (target) target.classList.add('focused');
}

function show(s: Screen) {
  if (screen) stage.removeChild(screen.root);
  screen = s;
  stage.appendChild(s.root);
  focus(s);
}

function move(a: Action) {
  const s = screen;
  if (!s) return;
  const memory = s.memory || (s.memory = s.rows.map(() => 0));
  if (a === 'left') s.col = Math.max(0, s.col - 1);
  if (a === 'right') s.col = Math.min(s.rows[s.row].length - 1, s.col + 1);
  const to = a === 'up' ? s.row - 1 : a === 'down' ? s.row + 1 : s.row;
  if (to !== s.row && to >= 0 && to < s.rows.length) {
    memory[s.row] = s.col;
    s.row = to;
    s.col = Math.min(memory[to], s.rows[to].length - 1);
  }
  focus(s);
}

document.addEventListener('keydown', (e) => {
  const a = actionOf(e);
  if (!a || !screen) return;
  e.preventDefault();
  if (a === 'ok') {
    const f = stage.querySelector('.focused') as HTMLElement | null;
    if (f) f.click();
  } else if (a === 'back') {
    if (screen.onBack) screen.onBack();
  } else if (a === 'checks') {
    if (screen.root.id !== 'checks') showChecks();
  } else if (a === 'left' || a === 'right' || a === 'up' || a === 'down') {
    move(a);
  }
});

// ------------------------------------------------------------ toast

let toastTimer = 0;
function toast(text: string, bad = false) {
  let last = stage.querySelector('.lastaction') as HTMLElement | null;
  if (!last) {
    last = el('div', 'lastaction');
    stage.appendChild(last);
  }
  last.textContent = 'Last: ' + text;
  let t = stage.querySelector('.toast') as HTMLElement | null;
  if (!t) {
    t = el('div', 'toast');
    stage.appendChild(t);
  }
  t.textContent = text;
  t.className = 'toast show' + (bad ? ' bad' : '');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t && (t.className = 'toast'), 3500);
}

// ------------------------------------------------------------ Home

const MODE_TEXT = {
  tv: 'On the TV',
  'fake-tv': 'Fake TV on this PC',
  preview: 'Preview: no service, apps don’t open',
};

function topBar(title: string): HTMLElement {
  const bar = el('div', 'topbar');
  bar.appendChild(el('div', 'brand', title));
  const right = el('div', 'topright');
  right.appendChild(el('span', 'pill ' + bridge.mode(), MODE_TEXT[bridge.mode()]));
  if (bridge.problem()) bar.appendChild(el('div', 'problem', 'Service: ' + bridge.problem()));
  const clock = el('span', 'clock');
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

function showHome(installed: AppInfo[] | null) {
  const root = el('div', 'screen home');
  root.id = 'home';
  root.appendChild(topBar('HomeTV'));
  root.appendChild(el('h2', 'rowtitle', 'Apps'));

  const row = el('div', 'approw');
  const tiles: HTMLElement[] = [];
  for (const app of HOME_APPS) {
    const info = installed ? installed.filter((a) => a.key === app.key)[0] : null;
    const missing = !!info && info.installed === false;
    const tile = el('button', 'tile' + (missing ? ' missing' : ''));
    tile.style.background = app.bg;
    const mark = el('span', 'mark', app.mark);
    mark.style.fontWeight = String(app.weight);
    tile.appendChild(mark);
    tile.appendChild(el('span', 'name', missing ? `${app.name} · not on this TV` : app.name));
    tile.addEventListener('click', async () => {
      if (missing) return toast(`${app.name} isn’t on this TV. Samsung’s Apps can add it.`, true);
      toast(`Opening ${app.name}…`);
      const r = await bridge.launch(app.key);
      if (r.ok && r.id) toast(`Opened ${app.name} (id ${r.id}).`);
      else if (r.ok) toast(`Preview: on the TV this opens ${app.name}.`);
      else toast(`${app.name} didn’t open: ${r.error}`, true);
    });
    row.appendChild(tile);
    tiles.push(tile);
  }
  root.appendChild(row);

  const checks = el('button', 'button', 'Checks for the TV call');
  checks.addEventListener('click', () => showChecks());
  const lower = el('div', 'lowerrow');
  lower.appendChild(checks);
  lower.appendChild(el('span', 'hint', 'Blue key or Info: Checks · Back here does nothing: the remote’s Home key leaves'));
  root.appendChild(lower);

  show({ root, rows: [tiles, [checks]], row: 0, col: 0 });
}

// ------------------------------------------------------------ Checks

interface CheckDef {
  label: string;
  name: string;
  params?: Record<string, unknown>;
  /** Leaves HomeTV (an app opens): say so before running. */
  leaves?: boolean;
}

const CHECKS: CheckDef[] = [
  { label: '1. About this TV', name: 'info' },
  { label: '2. Which apps the TV lists', name: 'apps' },
  { label: '3. Phone reached the TV?', name: 'phone' },
  { label: '4. Netflix title: app control', name: 'linkAppControl', params: { app: 'netflix' }, leaves: true },
  { label: '5. Netflix title: remote socket', name: 'linkRemote', params: { app: 'netflix' }, leaves: true },
  { label: '6. YouTube video: DIAL', name: 'linkDial', params: { app: 'youtube' }, leaves: true },
  { label: '7. YouTube video: app control', name: 'linkAppControl', params: { app: 'youtube' }, leaves: true },
  { label: '8. Prime Video title: app control', name: 'linkAppControl', params: { app: 'prime' }, leaves: true },
  { label: '9. Prime Video title: remote socket', name: 'linkRemote', params: { app: 'prime' }, leaves: true },
];

function summary(r: Result): string {
  const d = r.detail as Record<string, unknown>;
  if (r.check === 'info' && d) return `${d.model || '?'} · Tizen ${d.tizen || '?'} · Node ${d.node} · up ${d.serviceUpMinutes} min`;
  if (r.check === 'apps' && d) return r.ok ? `${d.count} apps listed; known: ${Object.keys((d.known as object) || {}).join(', ') || 'none'}` : `not listed: ${d.error}`;
  if (r.check === 'phone' && d) return r.ok ? `yes, ${d.visits} visit(s)` : 'not yet: open the link on the phone first';
  if (r.check === 'timing' && d) return `Home in ${d.homeShownMs} ms · Chromium ${d.chromium || '?'} · ${d.screen}`;
  if (d && d.error) return String(d.error);
  if (d && d.note) return String(d.note);
  return r.ok ? 'done' : 'failed';
}

function showChecks() {
  const root = el('div', 'screen checks');
  root.id = 'checks';
  root.appendChild(topBar('Checks for the TV call'));

  const addr = bridge.addresses();
  const link = addr.length ? `http://${addr[0]}:8766/report` : 'http://<the TV’s address>:8766/report';
  root.appendChild(el('p', 'phonelink', `On a phone on the same Wi-Fi, open ${link}`));

  const cols = el('div', 'cols');
  const list = el('div', 'checklist');
  const log = el('div', 'log');
  cols.appendChild(list);
  cols.appendChild(log);
  root.appendChild(cols);

  const renderLog = async () => {
    const results = await bridge.results();
    log.innerHTML = '';
    log.appendChild(el('h3', '', 'Results (newest first)'));
    results
      .slice(-12)
      .reverse()
      .forEach((r) => {
        const line = el('div', 'result ' + (r.ok ? 'ok' : 'bad'));
        line.appendChild(el('span', 'rcheck', `${new Date(r.at).toTimeString().slice(0, 8)} ${r.check}`));
        line.appendChild(el('span', 'rtext', summary(r)));
        log.appendChild(line);
      });
  };

  const rows: HTMLElement[][] = [];
  for (const c of CHECKS) {
    const b = el('button', 'button wide', c.label + (c.leaves ? '  ↗' : ''));
    b.addEventListener('click', async () => {
      if (c.leaves) toast('This may open another app. Come back to HomeTV afterwards (open TizenBrew again).');
      else toast('Checking…');
      const r = await bridge.check(c.name, c.params);
      toast(`${r.ok ? 'Done' : 'Didn’t work'}: ${summary(r)}`, !r.ok);
      renderLog();
    });
    list.appendChild(b);
    rows.push([b]);
  }
  root.appendChild(el('p', 'hint', '↗ opens another app. Back: Home.'));

  show({ root, rows, row: 0, col: 0, onBack: () => start(false) });
  renderLog();
}

// ------------------------------------------------------------ start

async function start(first: boolean) {
  if (first) {
    await bridge.connect();
    const serviceFoundMs = Date.now() - t0;
    showHome(null);
    const homeShownMs = Date.now() - t0;
    if (bridge.mode() !== 'preview') {
      bridge.check('timing', {
        homeShownMs,
        serviceFoundMs,
        userAgent: navigator.userAgent,
        screen: `${window.innerWidth}x${window.innerHeight}`,
      });
    }
  }
  const apps = await bridge.apps();
  showHome(apps);
}

start(true);
