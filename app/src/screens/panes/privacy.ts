// Settings › Privacy (v0): Samsung's privacy switches as a checklist, the TV's apps sorted by what they are, and a
// re-check. HomeTV can't turn Samsung's switches or disable its apps (Developer Mode gives apps no way to;
// docs/privacy.md, "What can be scripted"), so the person turns each switch in Samsung's menu and ticks it here; the
// report and re-check only read. The data is in app/src/privacy/.
import './privacy.css';
import { bridge, type TvApp } from '../../bridge';
import { pageStorage } from '../../launcherSettings';
import { BUCKET_ORDER, BUCKETS, bucketApps, type BucketId, type Report } from '../../privacy/apps';
import { AFTER_UPDATE_NOTE, recheck, type Recheck } from '../../privacy/recheck';
import { createPrivacy, type Readout } from '../../privacy/store';
import {
  guessYear,
  nameFor,
  SECTIONS,
  switchesFor,
  YEAR_GROUP_LABELS,
  YEAR_GROUPS,
  yearToShow,
  type Switch,
  type YearGroup,
} from '../../privacy/switches';
import { shell, type Key } from '../../shell/app';
import { h } from '../../shell/dom';
import { focusable } from '../../shell/focus';
import { icon } from '../../ui/icons';
import { segmented } from '../../ui/segmented';
import { button } from '../../ui/widgets';
import { leftInControl, rightInControl } from './look';
import type { Pane, PaneHost } from './pane';

/** The ticks and the picked year, in their own saved key (privacy/store.ts). */
export const privacy = createPrivacy(pageStorage());

const tvGuess = () => guessYear({ osVersion: bridge.platform.osVersion(), model: bridge.platform.model() });

/** Settings' value for the section: ticks done out of the year's list. */
export function privacyValue(): string {
  const year = yearToShow(privacy.get().year, tvGuess());
  if (!year) return 'Pick the year';
  const list = switchesFor(year);
  const done = list.filter((s) => privacy.isTicked(s.id)).length;
  return `${done} of ${list.length}`;
}

const MAX_NAMES = 12;

export function privacyPane(host: PaneHost): Pane {
  let readout: Readout | null = null;
  let apps: TvApp[] = [];
  let reading = false;
  let readOnce = false;
  let checked: Recheck | null = null;

  function read(): Promise<void> {
    reading = true;
    return bridge
      .appInventory()
      .then((inv) => {
        apps = inv ? inv.apps : [];
        readout = {
          apps: inv ? inv.apps.map((a) => ({ id: a.id, name: a.name })) : null,
          full: !!(inv && inv.full),
          osVersion: bridge.platform.osVersion(),
          model: bridge.platform.model(),
        };
      })
      .catch(() => {
        readout = { apps: null, full: false, osVersion: bridge.platform.osVersion(), model: bridge.platform.model() };
      })
      .then(() => {
        reading = false;
      });
  }

  function ensureRead() {
    if (readOnce) return;
    readOnce = true;
    read().then(() => host.rerender());
  }

  function checkAgain() {
    if (reading) return;
    checked = null;
    read().then(() => {
      checked = recheck(privacy.get().snapshot, readout);
      host.rerender();
      host.focusKey('pv-recheck');
      // The result and the note under it sit below the button, which has focus: bring them into view.
      const tail = document.querySelector('.pv-result + .pane-note') || document.querySelector('.pv-result');
      if (tail) tail.scrollIntoView(false);
    });
    host.rerender();
  }

  function openSamsung() {
    bridge.platform.openTvSettings('main').then((opened) => {
      if (!opened) shell.toast(bridge.platform.settingsWhere('main'), false, 8000);
    });
  }

  function yearRow(year: YearGroup | null) {
    const guess = tvGuess();
    const how =
      guess.from === 'software'
        ? `From its software (${bridge.platform.os} ${bridge.platform.osVersion()}): ${guess.year}’s menus.`
        : guess.from === 'model'
          ? `From its model code: ${guess.year}.`
          : 'HomeTV can’t tell: pick it from the sticker on the back, or Settings › Support › About This TV.';
    return h(
      'div.perf-row',
      h('div.perf-text', h('div.perf-title', 'The TV’s year'), h('div.perf-sub', how)),
      h(
        'div.perf-ctl',
        segmented<YearGroup>({
          options: YEAR_GROUPS.map((g): [YearGroup, string] => [g, YEAR_GROUP_LABELS[g]]),
          get: () => year,
          set: (y) => {
            privacy.setYear(y);
            host.rerender();
          },
          group: 'pv-year',
          small: true,
          entry: true,
        }),
      ),
    );
  }

  function switchRow(s: Switch, year: YearGroup) {
    const ticked = privacy.isTicked(s.id);
    const line = (label: string, text: string) => h('div.pv-line', h('span.pv-k', label), h('span.pv-v', text));
    return focusable(
      h(
        'div.pv-row' + (ticked ? '.is-done' : '') + (s.leave ? '.is-leave' : ''),
        h('span.pv-box', { html: ticked ? icon('check', 26) : '' }),
        h(
          'div.pv-main',
          h('div.pv-title', nameFor(s, year), s.when ? h('span.pv-when', ` · ${s.when}`) : null),
          line(s.leave ? 'Leave it' : 'Do', s.turn),
          line('Stops', s.stops),
          line('Can break', s.breaks),
          line('Undo', s.undo),
        ),
      ),
      {
        group: 'pv-list',
        key: `pv-${s.id}`,
        onOk: () => {
          privacy.toggle(s.id, Date.now(), readout);
          host.rerender();
        },
      },
    );
  }

  function checklist(year: YearGroup) {
    const list = switchesFor(year);
    return SECTIONS.map((sec) => {
      const items = list.filter((s) => s.section === sec.id);
      if (!items.length) return null;
      return [h('div.grp-h', sec.title), h('div.pv-where', sec.where[year]), items.map((s) => switchRow(s, year))];
    });
  }

  function bucketRow(id: BucketId, report: Report) {
    const list = report[id];
    const names = list.slice(0, MAX_NAMES).map((a) => (a.what && a.what !== a.name ? `${a.name} (${a.what})` : a.name));
    const more = list.length > MAX_NAMES ? ` and ${list.length - MAX_NAMES} more` : '';
    return focusable(
      h(
        'div.pv-row.pv-bucket',
        h('span.pv-count', String(list.length)),
        h(
          'div.pv-main',
          h('div.pv-title', BUCKETS[id].title),
          h('div.pv-sub', BUCKETS[id].note),
          h('div.pv-apps', list.length ? names.join(', ') + more : 'None of the ones HomeTV knows.'),
        ),
      ),
      { group: 'pv-report', key: `pv-b-${id}` },
    );
  }

  function report() {
    const head = h('div.grp-h', 'The TV’s apps');
    if (!readout) return [head, h('div.pane-note', 'Asking the TV for its apps…')];
    if (!readout.apps) return [head, h('div.pane-note', 'This TV won’t list its apps to HomeTV here.')];
    const homeIds = apps.filter((a) => a.key).map((a) => a.id);
    const r = bucketApps(readout.apps, bridge.platform.knownApps, homeIds);
    return [
      head,
      h(
        'div.pv-where',
        `${readout.apps.length} apps${readout.full ? ', Samsung’s hidden parts included' : ' (the ones a person opens; Samsung’s hidden parts aren’t listed here)'}. Read only: HomeTV never removes or disables an app.`,
      ),
      BUCKET_ORDER.map((b) => bucketRow(b, r)),
    ];
  }

  function recheckPart() {
    const snap = privacy.get().snapshot;
    const since = snap ? `Last ticked ${new Date(snap.at).toLocaleDateString()}.` : 'Nothing ticked yet.';
    return [
      h('div.grp-h', 'Check again'),
      h(
        'div.pv-where',
        `HomeTV can’t read Samsung’s switches, only the app list and the software version. ${since}`,
      ),
      h(
        'div.pane-actions',
        button(reading && readOnce && !checked ? 'Checking…' : 'Check again', { icon: 'sync', key: 'pv-recheck', onOk: checkAgain }),
      ),
      checked ? h('div.pv-result', checked.lines.map((l) => h('div', l))) : null,
      h('div.pane-note', AFTER_UPDATE_NOTE),
    ];
  }

  return {
    onKey(key: Key, focused: HTMLElement) {
      if (key === 'left') return leftInControl(focused, 'privacy');
      if (key === 'right') return rightInControl(host, focused);
      return false;
    },
    render() {
      ensureRead();
      const year = yearToShow(privacy.get().year, tvGuess());
      return [
        h('div.eyebrow', 'Privacy'),
        h('div.pane-title', 'Samsung’s privacy switches'),
        h(
          'div.pane-sub',
          'HomeTV can’t change Samsung’s settings. Turn each switch in Samsung’s menu, then press OK on it here to tick it. Photograph each Samsung settings screen first, so you can set it back.',
        ),
        h('div.perf-rows', yearRow(year)),
        h('div.pane-actions', button('Open Samsung’s Settings', { icon: 'settings', key: 'pv-open', onOk: openSamsung })),
        year ? checklist(year) : h('div.pane-note', 'Pick the TV’s year above to see its switches.'),
        report(),
        recheckPart(),
      ];
    },
  };
}
