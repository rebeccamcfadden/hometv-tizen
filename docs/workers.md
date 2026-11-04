# Workers on HomeTV for Samsung: the shared brief

You are a worker for **builder-4** (the Samsung/Tizen lead),
in the HomeTV project. Rebecca (@rebeccamcfadden) owns the project. Report only to builder-4 with
`send_session_message`; never ask Rebecca directly and never assume an answer she hasn't written down.

## The repo

- **rebeccamcfadden/hometv-tizen**, private. Your session has its own worktree and branch; work only there.
- Read first: `README.md`, `BACKLOG.md` (Rebecca's decisions), `docs/research.md`, `docs/aerotizen-plan.md`.
- HomeTV on Samsung is **its own Samsung app** (Rebecca, 18:35) on **AeroTizen's base** (MIT, unmodified in
  `vendor/aerotizen/`; never edit that folder). `app/` is the page (TypeScript, Vite, built for **Chromium 56**:
  no grid, no flex `gap`, no built-ins newer than Chromium 56; `npm run build` checks). `service/` holds the background
    services (ES5, Node 4): the key page (`pages.js`); AeroTizen's watcher is packaged from `vendor/`. `app/loader/`
    is the signed-update shell (`docs/page-updates.md`). `tizen/` + `tools/package-tizen.mjs` make the app. `tools/`
    has a fake TV for the PC (`npm run dev`).
- Logic shared with the Android launcher's prototype comes from `@hometv/core` (hometv-launcher's `packages/core`, the
  submodule `vendor/hometv-launcher`; never edit it here, and run `git submodule update --init --depth 1` in a new
  worktree): don't copy design_preview code into this repo except where your brief says so, marked as temporary.

## Rules (not negotiable)

1. **Rebecca's Tizen rule:** if a feature you're building may not work well on Samsung, stop and tell builder-4
   (what fails or is doubtful, the evidence, what more research would cost). Never drop, weaken or swap a feature
   on your own.
2. **Nothing public, nothing on a TV:** no npm publish, no public repos, no GitHub releases, no real TV. Don't touch
   the Tizen emulator either: builder-4 runs every change on it.
3. **No secrets in git:** no API keys, certificates, passwords, IP addresses, Wi-Fi names. Use `192.168.1.50` in docs.
4. **Plain words** in anything a person reads (UI text, docs). Short sentences.
5. **Checks before you report:** `npm run build` (includes the old-engine check) and `npm test` pass; new logic has
   tests against the fake TV; run a background `code-review` agent on your diff (`git diff main...HEAD`) and fix what's
   real.
6. **Commits:** `area: what changed` titles; the author is already the repo's config;
   end each message with `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`. Commit
   at least every 30 minutes, on your own branch in your own git worktree (builder-4 gives you both). **Don't push**:
   builder-4 reviews your commits, runs them on the emulator, merges into `main` and pushes.
7. **Report** when done or blocked: branch, head commit, what changed, what you checked, open questions. Keep it short.

## Screen ports (W3, W4): start after hometv-launcher #158 merges

Both port screens from hometv-launcher's `design_preview/src/screens/` onto this repo's screen stack
(`app/src/shell/`, see `app/src/screens/home.ts` and `checks.ts` for the pattern). design_preview is the design
reference; the Android launcher's Java is the behaviour reference. Shared logic (types, services, search matching,
key words, tokens) comes from `@hometv/core`, never copied. Rebecca's decisions that apply: **one region** on Samsung
(19:30: no region switch, no two-region offers); the phone remote is on the back burner (19:36). Everything else in
the screen is ported, or raised under rule 1.

- **W3: Search and the title page.** `screens/search.ts` (with `dropdown.ts`, `filters.ts`, `filterDefs.ts` as Search
  needs them) and `screens/preview.ts` (title page: details, where to watch, prices, cast, the open-in-app button
  through `app/src/pageChecks.ts`'s title links). Remote: the on-screen keyboard and Samsung's keys (`shell/app.ts`).
- **W4: Movies / TV Shows and All apps.** `screens/library.ts` and `librarySort.ts` (the poster grid, filters, sort),
  `screens/allApps.ts` (the TV's apps from AeroTizen's inventory, `app/src/bridge.ts`), `screens/person.ts`.

For both: posters and catalogue data stay mock until the TMDB client is shared; take `design_preview/src/data/*` as a
**marked temporary copy** only where the screen can't run without it, and say which files in the report. Grids and
rows are built with inline-block or floats, not grid or flex `gap`. Keep each screen under ~150 ms to draw on the
emulator with 40 posters (builder-4 measures).
