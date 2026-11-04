# HomeTV for Samsung TVs

> ⚠ **Work in progress, not tested on a real TV.** Don't install it unless you're helping test it.

HomeTV's launcher, for Samsung TVs. Samsung TVs run Tizen, not Android, so the
[Android launcher](https://github.com/rebeccamcfadden/hometv-launcher) can't go on them. This is HomeTV as **its own
Samsung app**: a web page (`app/`) with background services (`service/`), installed once from a laptop in the TV's
Developer Mode. A TizenBrew module is the fallback.

**Built on [AeroTizen](https://github.com/helalaou/AeroTizen) by Hamza El Alaoui** (MIT), kept unmodified in
`vendor/aerotizen/`: its install tool, certificate step and Home helper are what HomeTV uses on Samsung
([docs/aerotizen-plan.md](docs/aerotizen-plan.md)). Its licence is in [LICENSE](LICENSE) and `vendor/aerotizen/LICENSE`.
The shared logic comes from hometv-launcher's `packages/core` (MIT), a submodule.

**Status:** built and checked on Samsung's TV emulator and a PC with a fake TV; never run on a real TV yet. The plan
by version: [docs/versions.md](docs/versions.md). What we know so far: [docs/research.md](docs/research.md). The first
call with a real TV: [docs/tv-call-checklist.md](docs/tv-call-checklist.md). How another TV's port shares the screens:
[docs/platform.md](docs/platform.md). Beyond HomeTV: [docs/privacy.md](docs/privacy.md) (tracking and ads off),
[docs/launcher-replacement.md](docs/launcher-replacement.md) (how far a home screen can replace Samsung's),
[docs/jailbreak.md](docs/jailbreak.md) (the options, safest first).

## What's here

| Path | What it is |
|---|---|
| `app/` | The page: TypeScript, built for Chromium 56 (2018 Samsungs). `src/shell/` (screen stack, focus, keys), `src/screens/`, `src/bridge.ts` + `src/platform.ts` (every call to the TV: [docs/platform.md](docs/platform.md)), `loader/` (signed page updates, [docs/page-updates.md](docs/page-updates.md)), `aero-glue.js` (AeroTizen's scripts). |
| `service/service.js` | The TizenBrew module's service: opens apps, lists them, runs the TV-call checks. Plain ES5 (Node 4 on old TVs). |
| `service/pages.js` | The own app's second service: the API keys page (`keys-page.html`) a phone opens from the QR on HomeTV's API keys screen, on port 8766, home network only. It checks each key with one free request and keeps it in the app's private folder. Plain ES5. |
| `package.json` | The build, and the module as TizenBrew reads it: `packageType: app`, `appPath`, `serviceFile`, the remote keys to register. |
| `tools/` | The fake TV for a PC (`mock-tizen.mjs`, `fake-samsung.mjs`, `fake-keys.mjs`, `dev-service.mjs`), the dev runner, the old-engine check, the emulator packaging, and page updates (`page-build`, `page-key`, `page-release`, `page-serve`). |
| `tizen/` | HomeTV as its own Samsung app: `config.xml`, and `page-keys.txt` (the public keys a downloaded page must be signed with); `tools/package-tizen.mjs` adds the page, AeroTizen's Home watcher (its app id and port changed) and the pages service, and signs it. |
| `vendor/aerotizen/` | AeroTizen, unmodified (`git subtree`, squashed, from `093c2d5`). Update: `git subtree pull --prefix vendor/aerotizen https://github.com/helalaou/AeroTizen.git main --squash`. |
| `vendor/hometv-launcher/` | Submodule: hometv-launcher, for `packages/core` (`@hometv/core`). |
| `vendor/tweetnacl/` | TweetNaCl.js 1.0.3 (public domain), for checking page updates' signatures. |
| `tests/` | `npm test`: the service against the fake TV, the old-engine check, page updates on a fake TV page (`fake-browser.mjs`), the platform boundary, and the page's own rules bundled from TypeScript (`ts-module.mjs`). |

## Try it on a PC

Node 20 or newer. The shared logic (`@hometv/core`) is a submodule of hometv-launcher, `vendor/hometv-launcher`,
pinned to a commit; only its `packages/core/` is needed.

```sh
git submodule update --init --depth 1 vendor/hometv-launcher   # once, after cloning
git -C vendor/hometv-launcher sparse-checkout set --no-cone /packages/core/   # optional: only that folder on disk
npm install
npm run dev      # the service with a fake 2019 Samsung on :8766, the key page's service on :8767, the page on http://localhost:5180
npm run build    # v0: type-checks, builds dist/, then checks it runs on the oldest TVs
HOMETV_V1=1 npm run dev   # with v1's screens (Movies, TV Shows, Search: they need API keys) and the sample catalogue; never for a TV
npm test
```

The keyboard stands in for the remote: arrows, Enter for OK (held down: the hold-OK menu, as in All apps), Esc or
Backspace for Back, C (the Blue or Info key on the remote) for the Checks screen. On Search (the magnifier at the top
of Home, or in the nav) letters and digits type, as the on-screen keyboard does. The pill at the top says where it
runs: **On the TV**, **Fake TV on this PC**,
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

As its own app: installed from a laptop with AeroTizen's tool, once per TV, in Developer Mode; later versions arrive as
signed page updates (off for now). As a TizenBrew module (the fallback): TizenBrew fetches it from npm through
jsDelivr each time it opens. Nothing is published yet.
