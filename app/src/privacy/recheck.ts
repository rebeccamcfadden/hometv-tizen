// Settings › Privacy's re-check: what HomeTV can read now against what it read at the last tick. It can only see the
// app list, the software version and the model, never the switches themselves (Samsung gives apps no way to read
// them), so it says what changed and when to go through the list again. No network traffic is looked at. Pure.

import type { AppSeen, Readout, Snapshot } from './store';

export const AFTER_UPDATE_NOTE =
  'Check again after a Samsung software update or a factory reset: either can turn the switches back on.';

export interface Recheck {
  /** False when there's nothing to compare with yet (nothing ticked), or the TV can't list its apps. */
  comparable: boolean;
  added: AppSeen[];
  removed: AppSeen[];
  countBefore: number | null;
  countNow: number | null;
  softwareChanged: boolean;
  /** Plain-language lines for the screen. */
  lines: string[];
}

export function recheck(before: Snapshot | null, now: Readout | null): Recheck {
  const out: Recheck = { comparable: false, added: [], removed: [], countBefore: null, countNow: null, softwareChanged: false, lines: [] };
  if (now && now.apps) out.countNow = now.apps.length;
  if (!before) {
    out.lines.push('Nothing to compare yet: tick a switch first, and HomeTV notes what the TV looks like then.');
    return out;
  }
  if (before.apps) out.countBefore = before.apps.length;
  out.softwareChanged = !!(now && before.osVersion && now.osVersion && before.osVersion !== now.osVersion);
  if (out.softwareChanged && now) {
    out.lines.push(`The TV’s software changed (${before.osVersion} → ${now.osVersion}): go through the list again.`);
  }
  if (!now || !now.apps || !before.apps) {
    out.lines.push('HomeTV can’t list the TV’s apps here, so it can’t say what changed.');
    return out;
  }
  if (now.full !== before.full) {
    out.lines.push(`Apps: ${now.apps.length} now. Last time HomeTV saw a different kind of list, so it can’t compare them.`);
    return out;
  }
  out.comparable = true;
  const had: Record<string, true> = {};
  const has: Record<string, true> = {};
  for (const a of before.apps) had[a.id] = true;
  for (const a of now.apps) has[a.id] = true;
  out.added = now.apps.filter((a) => !had[a.id]);
  out.removed = before.apps.filter((a) => !has[a.id]);
  const names = (list: AppSeen[]) => list.slice(0, 5).map((a) => a.name || a.id).join(', ') + (list.length > 5 ? ` and ${list.length - 5} more` : '');
  out.lines.push(`Apps: ${out.countBefore} then, ${out.countNow} now.`);
  if (out.added.length) out.lines.push(`New since then: ${names(out.added)}.`);
  if (out.removed.length) out.lines.push(`Gone since then: ${names(out.removed)}.`);
  if (!out.added.length && !out.removed.length && !out.softwareChanged) out.lines.push('Nothing HomeTV can see has changed.');
  return out;
}
