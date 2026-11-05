# The check tool for Samsung TVs

> ⚠ Work in progress, not tested on a real TV yet.

Before HomeTV goes on a Samsung TV, the person at that TV runs a **check**, once, from a Windows laptop: it learns
whether HomeTV will install and work there, and answers [research.md › Open questions for the TV](research.md#open-questions-for-the-tv)
on that TV. The person's instructions are one web page, [`site/check/index.html`](../site/check/index.html), published
with GitHub Pages at `https://rebeccamcfadden.github.io/hometv-tizen/check/`.

## What it does

1. **The laptop** (`tools/check/hometv_check.py`): checks Windows and the network, finds the TV (AeroTizen's
   `discover`), guides the person through Developer Mode (showing the address to type as Host PC IP), reads the TV's
   model and software over the Developer Mode connection, and lists which known streaming apps are installed.
2. **The certificate**: AeroTizen's `certs` step (the person signs in with their own Samsung account in the
   browser). The files stay in AeroTizen's folder for that TV (`~/.config/aerotizen/certs/<TV>/`). At the end the tool
   opens that folder and asks the person to keep `author.p12`, `distributor.p12` and `password.txt` (a USB stick, or
   sent to the person who sent the link), like a password: a later HomeTV update must be signed with the same author
   certificate.
3. **The check app** ("HomeTV Check", `HmTvCheck0.HomeTVCheck`): HomeTV's page in check mode, with HomeTV's two
   background services, under its own id so it never meets HomeTV. The tool signs it with AeroTizen's signer (no Tizen
   Studio) and installs it the way AeroTizen installs apps (`vd_appinstall`), then starts it.
4. **On the TV** (`app/src/check/`): the page opens straight on the checks and walks the person through them in plain
   words: the TV's model, Tizen and web engine versions; the app list (count, and which known streaming apps by our
   keys); whether AeroTizen's watcher (47791) and the key page's service (8766) answer on their ports; the remote's
   colour keys, Info and digits; a phone opening the key page (optional); opening YouTube and coming back; Home inside
   an app (does the watcher bring the check app back?); and the title-link checks of `app/src/pageChecks.ts`. It keeps
   its place in its own storage, so it carries on after the TV closes and reopens it.
5. **The report**: the laptop reads the TV's results (below), removes the check app, and writes
   `HomeTV-check-report-<date>.txt` and `.json` on the Desktop.

Only the fields in [`app/src/check/report-schema.json`](../app/src/check/report-schema.json) can be in the report:
each has a rule (yes/no, a number in a range, one of a list, or a pattern), and anything else is dropped twice, on the
TV (`report.ts`) and on the laptop (`check_report.py`). No serials, device ids, addresses, account names, Wi-Fi names
or app lists; app ids are only compared with the known apps' ids, never written. An error leaves the TV as its name
only (`NotFoundError`). The page lists the fields in plain words.

## Getting the results off the TV

Three ways, all built; the laptop uses the first that works:

1. **The watcher's slot** (tried first, every 10 seconds while the person follows the TV). The check page leaves its
   report with AeroTizen's watcher in the slot its own launcher uses for a start-up trace (`/startup?data=`, up to
   4096 characters: the largest report fits, `tests/check.test.mjs` checks), and the laptop reads it back with
   AeroTizen's `tcp_request` over the Developer Mode connection (`GET /state` on the TV's 127.0.0.1:47791). It needs
   no restart and shows the laptop which step the TV is on. It depends on background services answering on a real TV,
   the big open question: on the emulator they are silent.
2. **The web inspector** (when 1 didn't get a finished report). AeroTizen's `inspect` path: restart the check app
   with its inspector (`0 debug`), forward the port, and ask the page `HomeTVCheck.report()` (Chrome DevTools,
   `Runtime.evaluate`). It doesn't need background services, which is why it's there; the results survive the
   restart because the page keeps them. On the emulator the inspector timed out.
3. **A photo**. The check app's last screen lists the results in short lines and as a square code; when neither of
   the above worked, the tool asks the person to photograph it and send it with the report file.

Why this order: 1 is quick, can't disturb the TV and is also the "does a background service answer" check, so trying
it costs nothing; 2 is the most likely to work on any TV (it's how apps are debugged in Developer Mode) but restarts
the app; 3 always works but needs a person.

## Why a bundled Python

The tool is Python on AeroTizen's own package (unmodified, `vendor/aerotizen/cli/src/aerotizen`), shipped with
python.org's **embeddable Python for Windows** and AeroTizen's two dependencies (cryptography, websocket-client) in
one zip, all pinned by SHA-256 (`tools/check/bundle-lock.json`). For a person who isn't technical:

- nothing to install: no Python, no PATH, no pip; the folder can be deleted afterwards;
- one paste: the page's command downloads the zip, checks its SHA-256, unpacks it and starts the tool (no browser
  download, so no "unblock", and `python.exe` is signed by the Python Software Foundation);
- the tool can do what AeroTizen's own commands don't: read the report (both routes above), allowlist it, and guide
  the person step by step.

AeroTizen's standalone Windows executable (its own release) would need our logic outside it anyway (PowerShell
parsing its human output, a second tool for the inspector), and it's unsigned, so SmartScreen would stop it. The zip's
`Start HomeTV Check.cmd` is the fallback for a person who'd rather not paste a command (SmartScreen may ask: More info,
Run anyway).

## Building and releasing

```sh
node tools/check/build-assets.mjs              # HOMETV_CHECK=1 npm run build, then release/check-samsung-v1/
node tools/check/build-assets.mjs --write-page # the same, and the SHA-256s into site/check/index.html
npm run build                                  # afterwards: dist/ back to HomeTV
```

It prints each asset's name and SHA-256 and the `gh release create check-samsung-v1 … --prerelease --latest=false`
command. **It doesn't create the release**: that is done with the project lead's OK, and then the page's SHA-256s are
committed (`--write-page`) so the page's command matches the zip. The zip is deterministic (fixed dates and order,
text files with LF), so a rebuild from the same commit gives the same SHA-256.

The page goes live through `.github/workflows/pages.yml` (pushes to main touching `site/**`), once Pages is switched on
in the repo's settings (Source: GitHub Actions).

Pieces: `HOMETV_CHECK=1 npm run build` (the check-mode page), `node tools/check/package-check.mjs` (the unsigned
`HomeTV-Check-App.wgt` alone), `tools/check/hometv_check.py --dry-run` (every step with made-up answers; signs the
check app with a throwaway certificate to try the signing path; no TV, no network).

## On the emulator

```powershell
$env:HOMETV_CHECK='1'; npm run build; Remove-Item Env:HOMETV_CHECK
node tools/check/package-check.mjs
D:\dev\tizen-tools\aerotizen-venv\Scripts\python.exe tools\check\hometv_check.py --host 127.0.0.1 --sdb-port 26101 --cert-dir <AeroTizen-format certificate folder for the emulator> --keep-app
```

`--cert-dir` takes a folder with `author.p12`, `distributor.p12`, `password.txt` and `device-profile.xml` (AeroTizen's
layout; without it the tool runs the Samsung sign-in for the emulator's DUID). `--keep-app` leaves the check app
installed; `--wait-minutes 5` shortens the wait; `--out <folder>` writes the report there instead of the Desktop.

## What only a real TV can tell

Whether background services answer (way 1, both service checks, the phone check, the Home helper), whether the
inspector works on a retail TV (way 2), whether `vd_appinstall` takes the check app signed this way, whether the
remote's keys reach the page after `registerKey`, what Back and Home do after another app opens, and whether any title
link opens a title.
