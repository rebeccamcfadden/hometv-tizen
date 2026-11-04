// The check app's one screen (check mode: HOMETV_CHECK=1 npm run build). It opens straight on the checks, runs the
// automatic ones, then walks the person at the TV through the rest in plain words: remote buttons, a phone, opening
// an app and coming back, the Home button, and opening a title. What it learns goes into the report (report.ts, only
// what report-schema.json allows), which the laptop reads (tools/check/hometv_check.py).

import { bridge } from '../bridge';
import { encodeQr, dark } from '../qr';
import { h, replace } from '../shell/dom';
import { focusable } from '../shell/focus';
import { shell, type Screen } from '../shell/app';
import { cleanTvReport, errorName, KNOWN_APP_NAMES } from './report';
import { cameBack, get, KEY_ORDER, knownIn, LINKS, load, put, save, STEPS, type Progress } from './flow';

export const CHECK_VERSION = '1.0.0';
const APP_NAME = 'HomeTV Check';

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
};

const KEY_WORDS: Record<string, { name: string; colour: string }> = {
  red: { name: 'RED', colour: '#e5484d' },
  green: { name: 'GREEN', colour: '#30a46c' },
  yellow: { name: 'YELLOW', colour: '#f5d90a' },
  blue: { name: 'BLUE', colour: '#3e63dd' },
  info: { name: 'INFO (i)', colour: '#8b8d98' },
  digits: { name: 'number 5', colour: '#8b8d98' },
};

let progress: Progress;
let panel: HTMLElement;
let steps: HTMLElement;
let restartedThisLoad = false;
let onButton: ((keyCode: number) => void) | null = null;
let hiddenAt = 0;

function store() {
  save(storage(), progress);
  bridge.publishReport(cleanTvReport(progress.draft));
}

/** The report as it leaves the TV (the laptop reads this through the web inspector: route 1). */
export function report(): Record<string, unknown> {
  return progress ? cleanTvReport(progress.draft) : {};
}

/** How long the page took to show the checks, at this start. */
export function noteStart(ms: number) {
  if (!progress) return;
  put(progress, 'timing.startMs', ms);
  store();
}

function button(label: string, key: string, onOk: () => void): HTMLElement {
  return focusable(h('button.button.wide', label), { key, group: 'check', onOk });
}

function show(title: string, ...body: (HTMLElement | string)[]) {
  replace(panel, h('h2.checktitle', title), ...body.filter((b) => b).map((b) => (typeof b === 'string' ? h('p.checktext', b) : b)));
  drawSteps();
  const first = panel.querySelector('[data-focus]') as HTMLElement | null;
  if (first) shell.focus(first);
}

function drawSteps() {
  replace(
    steps,
    STEPS.map((s, i) => h('div.checkstep' + (i < progress.step ? '.is-done' : i === progress.step ? '.is-now' : ''), (i < progress.step ? '✓ ' : `${i + 1}. `) + s.title)),
  );
}

function next() {
  progress.step = Math.min(progress.step + 1, STEPS.length - 1);
  store();
  run();
}

function run() {
  const id = STEPS[progress.step].id;
  onButton = null;
  if (progress.draft.step !== id) {
    progress.draft.step = id;
    store();
  }
  if (id === 'auto') return runAuto();
  if (id === 'keys') return runKeys();
  if (id === 'phone') return runPhone();
  if (id === 'youtube') return runYouTube();
  if (id === 'home') return runHome();
  if (id === 'links') return runLinks();
  return runDone();
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

async function runAuto() {
  show('Checking this TV', 'This takes up to a minute. You don’t need to press anything.');
  const status = h('p.checktext');
  panel.appendChild(status);
  status.textContent = 'Reading the TV’s model and software…';
  const info = await bridge.check('info');
  const d = (info.detail || {}) as Record<string, unknown>;
  put(progress, 'tv.model', d.model);
  put(progress, 'tv.tizen', d.osVersion);
  put(progress, 'tv.chromium', d.chromium);
  put(progress, 'tv.screen', `${window.screen.width}x${window.screen.height}`);
  status.textContent = 'Looking at which apps are on the TV…';
  const list = await bridge.installedApps();
  put(progress, 'apps.listed', !!list);
  if (list) {
    put(progress, 'apps.count', list.length);
    put(progress, 'apps.known', knownIn(list.map((a) => a.name), KNOWN_APP_NAMES));
  }
  store();
  status.textContent = 'Checking HomeTV’s background helpers (up to 30 seconds)…';
  bridge.platform.keyPages.start();
  const t0 = Date.now();
  const found: Record<string, number> = {};
  while (Date.now() - t0 < 30000 && Object.keys(found).length < 2) {
    for (const which of ['watcher', 'pages']) {
      if (!(which in found) && (await bridge.serviceAnswers(which))) found[which] = Date.now() - t0;
    }
    if (Object.keys(found).length < 2) await wait(2000);
  }
  for (const which of ['watcher', 'pages']) {
    put(progress, `services.${which}`, which in found ? 'answers' : 'silent');
    if (which in found) put(progress, `services.${which}Ms`, found[which]);
  }
  next();
}

function runKeys() {
  const answered = KEY_ORDER.filter((k) => get(progress, 'keys.' + k));
  const key = KEY_ORDER[answered.length];
  if (!key) return next();
  const w = KEY_WORDS[key];
  const answer = (value: string) => {
    put(progress, 'keys.' + key, value);
    store();
    runKeys();
  };
  const extra = key === 'digits' ? [button('My remote has no number buttons', 'keys-none', () => answer('no-buttons'))] : [];
  show(
    `Press the ${w.name} button`,
    h('div.keyswatch', { style: `background:${w.colour}` }),
    key === 'digits'
      ? 'Press the number 5 on the remote. On a remote without numbers, press the 123 button first and pick 5 on the screen.'
      : key === 'info'
        ? 'Press the INFO button (“i”) on the remote. Some remotes have it under the 123 or colour button.'
        : `Press the ${w.name.toLowerCase()} button on the remote. On a remote without colour buttons, press the colour button (four coloured dots) first, then pick ${w.name.toLowerCase()} on the screen.`,
    'If nothing happens, choose the button below.',
    h('div.checkbuttons', button('Nothing happens when I press it', 'keys-no', () => answer('no')), extra),
  );
  const { buttons } = bridge.platform;
  onButton = (code) => {
    const hit = key === 'digits' ? code >= 48 && code <= 57 : code === (buttons as Record<string, number>)[key];
    if (hit) {
      shell.toast(`${w.name}: received`);
      answer('yes');
    }
  };
}

async function runPhone() {
  const addr = await bridge.platform.keyPages.address();
  const url = addr ? `http://${addr}:8766/keys` : '';
  const answer = (value: string) => {
    put(progress, 'phone', value);
    next();
  };
  show(
    'Can a phone reach the TV? (optional)',
    'If a phone on the same Wi-Fi as the TV is to hand: point its camera at the square code, or type the address into its web browser.',
    url ? h('div.phonebox', qrCanvas(url, 6), h('p.address', url)) : h('p.checktext', 'The TV didn’t say its address. Choose “I don’t have a phone to hand”.'),
    'Does the phone show a page called “Keys for your TV”? It may say the page isn’t open: that’s fine. Don’t type anything into it.',
    h(
      'div.checkbuttons',
      button('Yes, the phone shows that page', 'phone-yes', () => answer('yes')),
      button('No, the phone can’t open it', 'phone-no', () => answer('no')),
      button('I don’t have a phone to hand', 'phone-none', () => answer('no-phone')),
    ),
  );
}

/** Whether a known streaming app is on the TV (from the automatic step). */
const hasApp = (key: string) => get(progress, 'apps.known.' + key) === true;

/** Opens an app for a step and watches the page go into the background; `opened(yes)` once it did (or didn't). */
function leaveFor(step: string, part: string | undefined, open: () => Promise<{ ok: boolean; error?: string }>, opened: (ok: boolean, error?: string) => void) {
  progress.pending = { step, part, at: Date.now() };
  store();
  let left = false;
  open().then((r) => {
    if (!r.ok) {
      left = true;
      document.removeEventListener('visibilitychange', check);
      progress.pending = null;
      opened(false, r.error);
      return;
    }
    // AeroTizen's launcher reports a refusal itself; the page going into the background means the app came up.
    window.setTimeout(() => {
      if (!left && progress.pending && progress.pending.step === step && !document.hidden) {
        left = true;
        document.removeEventListener('visibilitychange', check);
        progress.pending = null;
        opened(false, 'NotOpened');
      }
    }, 15000);
  });
  function check() {
    if (document.hidden && !left) {
      left = true;
      document.removeEventListener('visibilitychange', check);
      opened(true);
    }
  }
  document.addEventListener('visibilitychange', check);
}

function runYouTube() {
  if (!hasApp('youtube')) {
    put(progress, 'youtube.opened', 'not-on-tv');
    store();
    return show('Open YouTube and come back', 'YouTube isn’t on this TV, so this step is skipped.', h('div.checkbuttons', button('Next', 'yt-next', next)));
  }
  const back = cameBack(progress, 'youtube', restartedThisLoad, Date.now());
  if (back || get(progress, 'youtube.back')) {
    if (back) put(progress, 'youtube.back', back.how);
    if (!get(progress, 'youtube.opened')) put(progress, 'youtube.opened', 'yes');
    store();
    const answer = (value: string) => {
      put(progress, 'youtube.answer', value);
      next();
    };
    return show(
      'You’re back. How did you get here?',
      h(
        'div.checkbuttons',
        button('With the Back button', 'yt-back', () => answer('back-key')),
        button(`I opened ${APP_NAME} from Apps`, 'yt-apps', () => answer('reopened')),
        button('Something else', 'yt-other', () => answer('other')),
      ),
    );
  }
  show(
    'Open YouTube and come back',
    'Press OK to open YouTube. When YouTube shows, press the remote’s Back button (↩) until you’re back on this screen.',
    `If you end up somewhere else, open ${APP_NAME} from Apps (Home, then Apps).`,
    h(
      'div.checkbuttons',
      button('Open YouTube', 'yt-open', () =>
        leaveFor('youtube', undefined, () => bridge.launch('youtube', 'YouTube'), (ok, error) => {
          put(progress, 'youtube.opened', ok ? 'yes' : 'no');
          if (!ok) put(progress, 'youtube.error', errorName(error));
          store();
          if (!ok) show('YouTube didn’t open', 'That’s noted in the report.', h('div.checkbuttons', button('Next', 'yt-next', next)));
        }),
      ),
      button('Skip this step', 'yt-skip', next),
    ),
  );
}

function runHome() {
  const app = ['youtube', 'netflix', 'prime', 'disney', 'max', 'appletv', 'hulu', 'spotify', 'peacock', 'paramount', 'plex', 'tubi', 'pluto'].filter(hasApp)[0];
  if (!app) {
    put(progress, 'home.opened', 'not-on-tv');
    store();
    return show('The Home button', 'None of the apps this check knows is on this TV, so this step is skipped.', h('div.checkbuttons', button('Next', 'home-next', next)));
  }
  const name = KNOWN_APP_NAMES[app];
  const back = cameBack(progress, 'home', restartedThisLoad, Date.now());
  if (back || get(progress, 'home.back')) {
    if (back) {
      put(progress, 'home.back', back.how);
      put(progress, 'home.seconds', back.seconds);
    }
    if (!get(progress, 'home.opened')) put(progress, 'home.opened', 'yes');
    store();
    const answer = (value: string) => {
      put(progress, 'home.answer', value);
      next();
    };
    return show(
      'You’re back. Did this screen come back by itself?',
      h(
        'div.checkbuttons',
        button('Yes, by itself', 'home-self', () => answer('by-itself')),
        button(`No, I opened ${APP_NAME} from Apps`, 'home-apps', () => answer('reopened')),
        button('Something else', 'home-other', () => answer('other')),
      ),
    );
  }
  put(progress, 'home.app', app);
  show(
    'The Home button',
    `Press OK to open ${name}. When ${name} shows, press the remote’s Home button (the house) once.`,
    'Then wait 20 seconds without pressing anything: this screen should come back by itself.',
    `If it hasn’t come back after 20 seconds, open ${APP_NAME} from Apps.`,
    h(
      'div.checkbuttons',
      button(`Open ${name}`, 'home-open', () =>
        leaveFor('home', undefined, () => bridge.launch(app, name), (ok, error) => {
          put(progress, 'home.opened', ok ? 'yes' : 'no');
          if (!ok) put(progress, 'home.error', errorName(error));
          store();
          if (!ok) show(`${name} didn’t open`, 'That’s noted in the report.', h('div.checkbuttons', button('Next', 'home-next', next)));
        }),
      ),
      button('Skip this step', 'home-skip', next),
    ),
  );
}

async function runLinks() {
  const back = cameBack(progress, 'links', restartedThisLoad, Date.now());
  if (back && back.part) {
    const link = LINKS.filter((l) => l.id === back.part)[0];
    // The app was closed while the check waited for the TV's answer: take the answer it saved.
    if (link && !get(progress, `links.${link.id}.sent`)) {
      const label = `${link.check}:${link.app}`;
      const last = (await bridge.results()).filter((r) => r.check === label).pop();
      if (last) setSent(link.id, last.ok, last.detail);
    }
    store();
    if (link) return askWhatOpened(link.id);
  }
  const link = LINKS.filter((l) => !get(progress, `links.${l.id}.answer`) && get(progress, `links.${l.id}.sent`) !== 'not-on-tv')[0];
  if (!link) return next();
  if (!hasApp(link.app)) {
    put(progress, `links.${link.id}.sent`, 'not-on-tv');
    store();
    return runLinks();
  }
  if (get(progress, `links.${link.id}.sent`)) return askWhatOpened(link.id);
  const name = KNOWN_APP_NAMES[link.app];
  show(
    `Opening ${link.label}`,
    `Press OK and HomeTV asks ${name} to open ${link.label} straight away. Look at what the TV shows.`,
    link.check === 'linkRemote' ? 'The TV may ask whether to allow “HomeTV”: choose Allow. The instructions say how to remove it afterwards.' : '',
    `Then come back here: press Back, or Home, or open ${APP_NAME} from Apps.`,
    h(
      'div.checkbuttons',
      button(`Open ${link.label}`, 'link-open', () => {
        progress.pending = { step: 'links', part: link.id, at: Date.now() };
        store();
        bridge.check(link.check, { app: link.app }).then((r) => {
          setSent(link.id, r.ok, r.detail);
          store();
          if (!r.ok) {
            progress.pending = null;
            store();
            show(`${name} didn’t take it`, 'That’s noted in the report.', h('div.checkbuttons', button('Next', 'link-next', () => askWhatOpened(link.id))));
          }
        });
      }),
      button('Skip this one', 'link-skip', () => {
        put(progress, `links.${link.id}.answer`, 'skipped');
        store();
        runLinks();
      }),
    ),
  );
}

function setSent(id: string, ok: boolean, detail: unknown) {
  const d = (detail || {}) as Record<string, unknown>;
  const notHere = typeof d.error === 'string' && /isn’t on this TV/.test(d.error);
  put(progress, `links.${id}.sent`, ok ? 'yes' : notHere ? 'not-on-tv' : 'no');
  if (!ok && !notHere) put(progress, `links.${id}.error`, errorName(typeof d.error === 'string' ? d.error : 'Error'));
}

function askWhatOpened(id: string) {
  const answer = (value: string) => {
    put(progress, `links.${id}.answer`, value);
    store();
    runLinks();
  };
  show(
    'What opened?',
    h(
      'div.checkbuttons',
      button('The film, series or video itself', 'what-title', () => answer('title')),
      button('Only the app’s start screen', 'what-app', () => answer('app')),
      button('Nothing opened', 'what-nothing', () => answer('nothing')),
    ),
  );
}

function runDone() {
  put(progress, 'finished', true);
  store();
  const r = report();
  const lines = summaryLines(r);
  let qr: HTMLElement;
  try {
    qr = qrCanvas(JSON.stringify(r), 3);
  } catch (e) {
    qr = h('p.checktext', '(The results are too long for a square code.)');
  }
  show(
    'All done. Thank you!',
    'Now look at the laptop: it reads these results from the TV by itself, then removes this check app.',
    'If the laptop asks for a photo, take one of this screen with your phone.',
    h('div.donebox', h('div.summary', lines.map((l) => h('p.sumline', l))), qr),
  );
}

/** The results in short lines, for the screen and a photo of it. */
export function summaryLines(r: Record<string, any>): string[] {
  const out: string[] = [];
  const tv = r.tv || {};
  out.push(`TV: ${tv.model || '?'} · Tizen ${tv.tizen || '?'} · Chromium ${tv.chromium || '?'}`);
  const apps = r.apps || {};
  const known = Object.keys(apps.known || {}).filter((k) => apps.known[k]);
  out.push(apps.listed ? `Apps: ${apps.count} · ${known.map((k) => KNOWN_APP_NAMES[k]).join(', ') || 'none of the known ones'}` : 'Apps: the TV didn’t list them');
  const s = r.services || {};
  out.push(`Helpers: watcher ${s.watcher || '?'} · pages ${s.pages || '?'}`);
  const k = r.keys || {};
  out.push(`Buttons: ${KEY_ORDER.map((key) => `${key} ${k[key] || '?'}`).join(' · ')}`);
  out.push(`Phone: ${r.phone || '?'}`);
  const y = r.youtube || {};
  out.push(`YouTube: opened ${y.opened || '?'} · back ${y.answer || '?'}`);
  const hm = r.home || {};
  out.push(`Home button: ${hm.answer || hm.opened || '?'}${hm.seconds !== undefined ? ` (${hm.seconds} s)` : ''}`);
  const links = r.links || {};
  out.push('Titles: ' + LINKS.map((l) => `${l.id} ${(links[l.id] && (links[l.id].answer || links[l.id].sent)) || '?'}`).join(' · '));
  return out;
}

/** A QR as a canvas: black modules on white, with the standard light border of 4. */
function qrCanvas(text: string, scale: number): HTMLElement {
  const qr = encodeQr(text, 'L');
  const modules = qr.size + 8;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = modules * scale;
  canvas.className = 'qr';
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) if (dark(qr, x, y)) ctx.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale);
  }
  return canvas;
}

export function checkScreen(): Screen {
  progress = load(storage(), CHECK_VERSION);
  restartedThisLoad = !!progress.pending;
  progress.starts++;
  save(storage(), progress);
  const el = h('div.screen.checkmode');
  el.appendChild(
    h(
      'div.topbar',
      h('div.brand', APP_NAME),
      h('div.topright', h('span.pill.wip', 'Work in progress: not tested on a real TV yet')),
    ),
  );
  steps = h('div.checksteps');
  panel = h('div.checkpanel');
  el.appendChild(h('div.checkcols', steps, panel));
  // The remote's buttons for the buttons step; everything else goes to the shell as usual.
  window.addEventListener(
    'keydown',
    (e) => {
      if (onButton) onButton(e.keyCode);
    },
    true,
  );
  // Back from another app with this page still running.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (progress.pending) hiddenAt = Date.now();
    } else if (progress.pending && hiddenAt) {
      hiddenAt = 0;
      restartedThisLoad = false;
      run();
    }
  });
  window.setTimeout(run, 0);
  return { label: APP_NAME, el, defaultFocus: () => panel.querySelector('[data-focus]') as HTMLElement | null };
}
