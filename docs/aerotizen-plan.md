# HomeTV on AeroTizen's base: the plan

Rebecca's decision (2026-11-04 18:38): build HomeTV for Samsung on [AeroTizen](https://github.com/helalaou/AeroTizen)
(MIT), with its licence kept and a clear credit. This note says what that means in practice. Read at AeroTizen
`093c2d5` (2026-11-04).

## What AeroTizen gives us

| Part | What it does | We use it |
|---|---|---|
| **The CLI** (`aerotizen`, standalone `.exe` for Windows) | Finds the TV, makes the per-TV Samsung certificate (one sign-in), signs and installs any `.wgt` (`aerotizen install ./HomeTV.wgt`), updates it, backs up and restores Native Home, exports diagnostics | **As it is**, unmodified: the family installer calls it. No fork. |
| **The watcher service** (`launcher/service/`, Node, starts at boot, restarts itself) | Brings the home screen back after Home; knows Art Mode; serves the page on loopback | **Yes**, with our app id |
| **Platform layer** (`launcher/js/`: apps inventory and artwork from the TV's cache, inputs with HDMI names, Continue Watching, native navigation, diagnostics) | The TV-specific parts that took 20 models of testing | **Yes** |
| **Screens** (`launcher/src/`, Preact + TypeScript: Home, Settings, backgrounds, clock, weather) | AeroTizen's look | **Replaced** by HomeTV's screens (Home, Movies, TV Shows, Search, Pick for me, title preview, Launcher settings), from `design_preview/` |

## How the code is arranged

1. **hometv-tizen pulls AeroTizen in as a git subtree** at a pinned commit (`vendor/aerotizen/`, squashed: one
   commit that names the upstream commit), so its licence and authors stay intact and upstream fixes merge in with
   one command. GitHub forks of public repos are
   public, and this repo stays private until it works (Rebecca, 18:04), so a fork isn't the way for now.
2. **Our app** is AeroTizen's launcher with HomeTV's screens: its `js/` platform scripts and `service/` unchanged
   where possible, our screens in place of `src/home` and `src/settings`. Its own id (not `DclHome001`), so it
   never collides with an installed AeroTizen.
3. **The spike's pieces move over:** the fake TV (`tools/mock-tizen.mjs`) grows to cover AeroTizen's platform calls,
   the old-engine check stays, the Checks screen becomes a hidden diagnostics page.
4. **Shared logic** with `design_preview/` as planned ([shared-package.md](shared-package.md)): catalogue, offers,
   search matching, the services table.
5. **Fixes that help AeroTizen too** go upstream as pull requests from Rebecca's account, when she says so.

## Credit

- `LICENSE`: our MIT notice plus AeroTizen's, word for word ("Copyright (c) 2026 Hamza El Alaoui").
- README: "Built on AeroTizen by Hamza El Alaoui" near the top, with a link, and the parts we use.
- The TV: Launcher settings › About lists AeroTizen with its licence.
- AeroTizen's own credits (LTvLauncher, Apps2Samsung, tizen-sdb, samsung-tizen-tv-debloat, Simple Icons) carried
  over where their parts are used.

## Things to know before starting

- **Engine:** AeroTizen targets Chromium 69 and ES2018 (2020 and newer TVs, Tizen 5.5+). The spike targets
  Chromium 56 (2018). If the family's TV is 2018 or 2019, AeroTizen's base doesn't run there as it is. The first TV
  call tells us the year.
- **Models:** AeroTizen's Home return doesn't work yet on some 2020-2021 TVs (its table, issue #65). Again, the year
  decides.
- **Certificate:** AeroTizen's CLI asks for a Samsung account sign-in on every TV year (TizenBrew only on 2023+).
- **Size:** AeroTizen's launcher is larger than the spike (Preact, i18n, icons); still small for a TV app.
- **Updates:** a new HomeTV app means running the CLI again (`aerotizen install`). The cached-page idea
  ([research.md](research.md#working-without-the-internet)) keeps screen updates off the laptop: built, see
  [page-updates.md](page-updates.md).

## The first TV call, given this

The checklist installs TizenBrew (Rebecca, 18:22). With AeroTizen as the base, installing **AeroTizen itself**
instead tests what HomeTV will actually use: its certificate step, its install, its Home return on that model,
whether the TV lists apps, power-on, and the TV's year and engine. TizenBrew wouldn't be needed at all. The cost is
the same (Developer Mode, the laptop once), plus a Samsung account sign-in even on an older TV. A question for
Rebecca is in `work\feedback.md`; the checklist changes only if she says so.

## Order

Done so far (2026-11-04): AeroTizen is in `vendor/aerotizen/` (subtree from `093c2d5`, squashed, unmodified), with
the credit in `LICENSE` and the README. Its front end doesn't build on this PC yet: the PC's npm mirror has no
`lucide-preact@1.66.0` (its icon package). Its plain-ES5 parts (`launcher/js/`, `launcher/service/`) need no build.

1. After Rebecca's answer on the first call: adapt the checklist if needed.
2. ~~Subtree AeroTizen in~~; build its launcher unchanged in this repo (waits on the npm mirror); run its browser
   preview.
3. **Done (no build step, the lead's (a)):** HomeTV's page loads AeroTizen's ES5 platform scripts (`launcher/js/`:
   config, catalogue, artwork, inventory, launching, the watcher client) unmodified, through `app/aero-glue.js`;
   the app's background service is AeroTizen's watcher (`launcher/service/`, app id and port changed at packaging).
   Checked on the emulator. App id renamed (`HmTvSpike0`).
4. Port the screens one at a time, smallest first (Home, then Launcher settings, then the catalogue screens), each
   checked in the browser preview.
5. A real TV only on the weekly calls, batched.
