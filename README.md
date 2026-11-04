# HomeTV for Samsung TVs (spike)

HomeTV's launcher, for Samsung TVs. Samsung TVs run Tizen, not Android, so the
[Android launcher](https://github.com/rebeccamcfadden/hometv-launcher) can't go on them. This is a
[TizenBrew](https://github.com/reisxd/TizenBrew) application module: a web page TizenBrew loads from npm, plus a small
"service" that TizenBrew runs in the background and that keeps the TV's own functions (opening apps).

**Status: a spike.** It answers whether this can work before anything is built for real. What we know so far:
[docs/research.md](docs/research.md). The first call with a real TV: [docs/tv-call-checklist.md](docs/tv-call-checklist.md).
Sharing logic with the Android launcher's prototype: [docs/shared-package.md](docs/shared-package.md).
Beyond HomeTV: [docs/privacy.md](docs/privacy.md) (tracking and ads off), [docs/launcher-replacement.md](docs/launcher-replacement.md)
(how far a home screen can replace Samsung's), [docs/jailbreak.md](docs/jailbreak.md) (the options, safest first).

## What's here

| Path | What it is |
|---|---|
| `package.json` | The module as TizenBrew reads it: `packageType: app`, `appPath`, `serviceFile`, the remote keys to register. |
| `app/` | The page: Home's app row and the Checks screen for the TV call. TypeScript and Vite, built for Chromium 56 (2018 Samsungs). |
| `service/service.js` | The service: opens apps (`tizen.application.launch`), lists them, runs the spike's checks, serves `/report` to a phone. Plain ES5 for Node 4.4.3. |
| `tools/` | The fake TV for a PC (`mock-tizen.mjs`, `fake-samsung.mjs`, `dev-service.mjs`), the dev runner, the old-engine check, the emulator packaging. |
| `tizen/` | The emulator wrapper: the same page and service as a normal app. Never for a family TV. |
| `tests/` | `npm test`: the service against the fake TV, and the old-engine check. |

## Try it on a PC

Node 20 or newer.

```sh
npm install
npm run dev      # the service with a fake 2019 Samsung on :8766, and the page on http://localhost:5180
npm run build    # type-checks, builds dist/, then checks it runs on the oldest TVs
npm test
```

The keyboard stands in for the remote: arrows, Enter for OK, Esc or Backspace for Back, C (the Blue or Info key on
the remote) for the Checks screen. The pill at the top says where it runs: **On the TV**, **Fake TV on this PC**,
or **Preview** (no service: `npm run dev -- --no-service`).

The fake TV has Netflix and Prime Video only under their pre-2020 ids and no Hulu, so the service's fallback and
"not on this TV" show. `/report` on port 8766, opened from a phone on the same Wi-Fi, lists every check's result.

## Emulator

Tizen Studio's CLI with Samsung's TV extension (`TV-SAMSUNG-Public-Emulator`, `TV-SAMSUNG-Public-WebAppDevelopment`).
The emulator is Tizen 10, so it checks the `tizen` calls, not the old engine (`npm run build` does that). It has no
Netflix: opening apps there only shows the call is made.

```sh
tizen certificate -a hometv -p <password> -f hometv-emulator           # once, a local author certificate
tizen security-profiles add -n hometv-emulator -a <path>/hometv-emulator.p12 -p <password>
npm run build && node tools/package-tizen.mjs
tizen install -n tizen/<name>.wgt -t <emulator>
```

Certificates stay in Tizen Studio's data folder, never in git.

## How it reaches a TV

TizenBrew fetches the module from npm (through jsDelivr) each time it opens, so publishing to npm is the release.
Nothing is published yet; the package name and account are still to be decided.
