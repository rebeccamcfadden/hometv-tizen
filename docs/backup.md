# Backup and restore

> ⚠ Work in progress, not tested on a real TV yet.

What HomeTV keeps before it changes anything, and how to go back. There are two parts: the laptop backs up the TV
before anything is installed, and HomeTV on the TV keeps its own settings from before each change.

## On the laptop: before anything is installed

The check tool backs up the TV first, in every normal run, and `hometv_check.py --backup-only` does only that. The
folder is new each time (`HomeTV-Backup-<date>`, then `-2`, `-3`…), and nothing in it is ever overwritten. Details are
in [check-tool.md › The backup](check-tool.md#the-backup-before-anything-is-installed). It holds:

- the TV's description from `/api/v2/` (model, software, screen, network type), with no name, id, address or Wi-Fi
  name;
- the list of installed apps (ids, names, versions), read over the Developer Mode connection without changing
  anything;
- `RESTORE.txt`, which says in plain words what is kept, what isn't, and how to go back;
- `SHA256SUMS`, so you can tell later that the files haven't changed.

A read that failed or came back empty is marked "not captured". It is never kept as if it were the TV's state.

## On the TV: Restore previous settings

HomeTV keeps a copy of its own settings from before the last change. Its settings are the region, the weather place,
units, motion, the screensaver, Home's row of apps, the TV Utilities order, and whether first run is done (code:
`app/src/settingsBackup.ts`).

- A **change** is one visit to Settings, or to first run. What was there when the screen opened is kept when it
  closes, but only if something changed. A visit that changes nothing doesn't replace the copy.
- **Settings › First run › Restore previous settings** puts that copy back, and says when it was taken.
- Restore keeps the settings it replaced, so pressing it again undoes the restore.
- A copy taken before first run puts first run back.
- If the TV's storage can't be read, no copy is kept and Restore changes nothing.

There is one copy, not a history, kept in the page's storage (`hometv-settings-previous`). It never leaves the TV.

## What can't be backed up

No root, no exploits, and nothing writes Samsung's settings. These are out of reach, so they are written down in
`RESTORE.txt` instead:

- Samsung's picture, sound, channel, account, network, accessibility and power settings: no read or export is open to
  a laptop or an app in Developer Mode.
- Other apps' data and sign-ins.

Uninstalling HomeTV or the check app doesn't touch any of these.

## How to go back

1. **HomeTV's settings:** Settings › First run › Restore previous settings.
2. **HomeTV itself, or the check app:** remove it with the same tool that installed it, or on the TV in Apps ›
   Settings, by choosing the app and pressing Delete. The TV is then as it was, apart from Developer Mode.
3. **Developer Mode:** Apps, press 1 2 3 4 5, switch it off, then restart the TV fully. Hold the power button for about
   5 seconds.
4. **Samsung's settings:** these were never changed, so there is nothing to restore. If someone changed them by hand,
   set them back by hand using the list in `RESTORE.txt`.
