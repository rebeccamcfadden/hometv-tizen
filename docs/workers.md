# Workers on HomeTV for Samsung: the shared brief

You are a worker for **builder-4** (the Samsung/Tizen lead, project session `5126fd9b-23b7-4a98-a5ec-e171c994ba90`),
in the HomeTV project. Rebecca (@rebeccamcfadden) owns the project. Report only to builder-4 with
`send_session_message`; never ask Rebecca directly and never assume an answer she hasn't written down.

## The repo

- **rebeccamcfadden/hometv-tizen**, private. Your session has its own worktree and branch; work only there.
- Read first: `README.md`, `BACKLOG.md` (Rebecca's decisions), `docs/research.md`, `docs/aerotizen-plan.md`.
- HomeTV on Samsung is **its own Samsung app** (Rebecca, 18:35) on **AeroTizen's base** (MIT, unmodified in
  `vendor/aerotizen/`; never edit that folder). `app/` is the page (TypeScript, Vite, built for **Chromium 56**:
  no grid, no flex `gap`, no built-ins newer than Chromium 56; `npm run build` checks). `service/service.js` is the
  TizenBrew module's service (ES5, Node 4). `tizen/` + `tools/package-tizen.mjs` make the app. `tools/` has a fake
  TV for the PC (`npm run dev`).
- Logic shared with the Android launcher's prototype will come from `packages/core` (hometv-launcher PR #158, open):
  don't copy design_preview code into this repo except where your brief says so, marked as temporary.

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
6. **Commits:** `area: what changed` titles; author Rebecca McFadden <rebecca.mcfadden16@gmail.com> (already the repo's
   config); end each message with `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`. Commit
   at least every 30 minutes. Push your branch to origin with
   `$env:GH_TOKEN=(gh auth token --user rebeccamcfadden)` and a one-off credential helper; don't switch gh's
   account; never push to `main` (builder-4 merges).
7. **Report** when done or blocked: branch, head commit, what changed, what you checked, open questions. Keep it short.
