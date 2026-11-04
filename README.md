# HomeTV for Samsung TVs (spike)

HomeTV's launcher, for Samsung TVs. Samsung TVs run Tizen, not Android, so the
[Android launcher](https://github.com/rebeccamcfadden/hometv-launcher) can't go on them. This is a
[TizenBrew](https://github.com/reisxd/TizenBrew) application module: a web page TizenBrew loads from npm, plus a small
"service" that TizenBrew runs in the background and that keeps the TV's own functions (opening apps).

**Built on [AeroTizen](https://github.com/helalaou/AeroTizen) by Hamza El Alaoui** (MIT), kept unmodified in
`vendor/aerotizen/`: its install tool, certificate step and Home helper are what HomeTV uses on Samsung
([docs/aerotizen-plan.md](docs/aerotizen-plan.md)). Its licence is in [LICENSE](LICENSE) and `vendor/aerotizen/LICENSE`.

**Status: a spike.** It answers whether this can work before anything is built for real. What we know so far:
[docs/research.md](docs/research.md). The first call with a real TV: [docs/tv-call-checklist.md](docs/tv-call-checklist.md).
Sharing logic with the Android launcher's prototype: [docs/shared-package.md](docs/shared-package.md).
Beyond HomeTV: [docs/privacy.md](docs/privacy.md) (tracking and ads off), [docs/launcher-replacement.md](docs/launcher-replacement.md)
(how far a home screen can replace Samsung's), [docs/jailbreak.md](docs/jailbreak.md) (the options, safest first).

## What's here

| Path | What it is |
|---|---|
| `package.json` | The module as TizenBrew reads it: `packageType: app`, `appPath`, `serviceFile`, the remote keys to register. |
| `app/` | The page: Home's app row, Movies and TV Shows (the poster grid with filters and sort), All apps, a person's page, and the Checks screen for the TV call. The mock catalogue and posters in `app/src/data/` are temporary copies from design_preview. TypeScript and Vite, built for Chromium 56 (2018 Samsungs). `app/aero-glue.js` connects AeroTizen's scripts to it. `app/loader/` is the installed app's shell: it shows the newest signed page the TV has and fetches newer ones ([docs/page-updates.md](docs/page-updates.md)). |
| `service/service.js` | The service: opens apps (`tizen.application.launch`), lists them (`/apps`, and every app for All apps on `/apps/all`), runs the spike's checks, serves `/report` to a phone. Plain ES5 for Node 4.4.3. |
| `service/pages.js` | The own app's second service: the API keys page (`keys-page.html`) a phone opens from the QR on HomeTV's API keys screen, on port 8766, home network only. It checks each key with one free request and keeps it in the app's private folder. Plain ES5. |
| `tools/` | The fake TV for a PC (`mock-tizen.mjs`, `fake-samsung.mjs`, `fake-keys.mjs`, `dev-service.mjs`), the dev runner, the old-engine check, the emulator packaging, and page updates (`page-build`, `page-key`, `page-release`, `page-serve`). |
| `tizen/` | HomeTV as its own Samsung app: `config.xml`, and `page-keys.txt` (the public keys a downloaded page must be signed with); `tools/package-tizen.mjs` adds the page, AeroTizen's Home watcher (its app id and port changed) and the pages service, and signs it. |
| `vendor/aerotizen/` | AeroTizen, unmodified (`git subtree`, squashed, from `093c2d5`). Update: `git subtree pull --prefix vendor/aerotizen https://github.com/helalaou/AeroTizen.git main --squash`. |
| `tests/` | `npm test`: the service against the fake TV, the old-engine check, and page updates on a fake TV page (`fake-browser.mjs`). |

## Try it on a PC

Node 20 or newer. The shared logic (`@hometv/core`) is a submodule of hometv-launcher, `vendor/hometv-launcher`,
pinned to a commit; only its `packages/core/` is needed.

```sh
git submodule update --init --depth 1 vendor/hometv-launcher   # once, after cloning
git -C vendor/hometv-launcher sparse-checkout set --no-cone /packages/core/   # optional: only that folder on disk
npm install
npm run dev      # the service with a fake 2019 Samsung on :8766, the key page's service on :8767, the page on http://localhost:5180
npm run build    # type-checks, builds dist/, then checks it runs on the oldest TVs
npm test
```

The keyboard stands in for the remote: arrows, Enter for OK (held down: the hold-OK menu, as in All apps), Esc or
Backspace for Back, C (the Blue or Info key on
the remote) for the Checks screen. The pill at the top says where it runs: **On the TV**, **Fake TV on this PC**,
or **Preview** (no service: `npm run dev -- --no-service`).

The fake TV has Netflix and Prime Video only under their pre-2020 ids and no Hulu, so the service's fallback and
"not on this TV" show; a few Samsung apps (made-up ids) fill All apps and its TV Utilities folder. `/report` on port 8766, opened from a phone on the same Wi-Fi, lists every check's result.

**API keys** (Home's lower row) shows the QR for the key page. In `npm run dev` its service is on 8767 and checks keys fake services: a key with `good` in it works, one with `offline` can't be reached, any other is refused.

## Emulator

Tizen Studio's CLI with Samsung's TV extension (`TV-SAMSUNG-Public-Emulator`, `TV-SAMSUNG-Public-WebAppDevelopment`).
The emulator is Tizen 10, so it checks the `tizen` calls, not the old engine (`npm run build` does that). It has no
Netflix: opening apps there only shows the call is made.

**It only installs apps signed with a Samsung certificate** (Tizen's bundled sample certificates are refused with
"Invalid certificate chain"). Make one with a Samsung account sign-in (AeroTizen's `certs` module does it in a
browser; Tizen's Java signer needs the `.p12` files re-saved with the older 3DES encryption). Keep certificates
outside git. Results so far: [research.md › On Samsung's TV emulator](docs/research.md#on-samsungs-tv-emulator-2026-11-04).

```sh
tizen certificate -a hometv -p <password> -f hometv-emulator           # once, a local author certificate
tizen security-profiles add -n hometv-emulator -a <path>/hometv-emulator.p12 -p <password> -d <Samsung distributor .p12> -dp <its password>
npm run build && node tools/package-tizen.mjs
tizen install -n tizen/<name>.wgt -t <emulator>
```

Certificates stay in Tizen Studio's data folder, never in git.

## How it reaches a TV

TizenBrew fetches the module from npm (through jsDelivr) each time it opens, so publishing to npm is the release.
Nothing is published yet; the package name and account are still to be decided.
