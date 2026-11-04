# Backlog

Decisions and deferred work for HomeTV on Samsung. The research is in [docs/](docs/).

## Decisions (Rebecca)

| When | Decision |
|---|---|
| 2026-11-04 18:04 | This repo: `rebeccamcfadden/hometv-tizen`, private until it works. |
| 2026-11-04 18:22 | Nothing on npm yet. The first TV call checks TizenBrew and the TV's basics only. The family has a Windows laptop. |
| 2026-11-04 18:35 | After the first call, HomeTV becomes **its own app** (works offline; [research.md › Working without the internet](docs/research.md#working-without-the-internet)), the TizenBrew module as a fallback. A public release only once it works. |
| 2026-11-04 18:38 | Build on **AeroTizen** ([helalaou/AeroTizen](https://github.com/helalaou/AeroTizen)): HomeTV's screens on its base (install tool, certificate, Home helper), keeping its MIT licence and a clear credit. Plus a Tizen-only item: Continue watching (below). |
| 2026-11-04 18:42 | The emulator's Samsung certificate: Rebecca's existing Samsung account; she signs in once on this PC herself (replaces 18:40's new account). |

## Next

1. **First TV call** ([checklist](docs/tv-call-checklist.md)): TizenBrew, the TV's model and Tizen version, a module's
   speed, a phone reaching a module, power-on behaviour.
2. **HomeTV on AeroTizen's base:** read AeroTizen's launcher (`launcher/`), its watcher service and its CLI; decide
   fork or upstream contributions; keep `LICENSE` and a credit in the README and About screen. Move the spike's
   page, service checks and fake TV over.
3. **The shared package** with `design_preview/` ([plan](docs/shared-package.md)), once the lead agrees.
4. **The emulator:** running with a Samsung certificate (Rebecca's sign-in, 18:52). Open: the service's local port is
   silent there ([research.md › On Samsung's TV emulator](docs/research.md#on-samsungs-tv-emulator-2026-11-04)).

## Tizen-only items (Rebecca sets when)

- **Continue watching** (Rebecca, 18:38): redesign the Figma UI a little to include an optional Continue watching
  feature. AeroTizen reads Samsung's shared Continue Watching data from installed apps (YouTube and Prime Video
  filled it on a 2024 Frame).

## Later
- Privacy: a guided checklist screen in HomeTV and a read-only network check ([privacy.md](docs/privacy.md#what-can-be-scripted)).
- Native Home (AeroTizen's, experimental): only if the family's exact model is confirmed working
  ([launcher-replacement.md](docs/launcher-replacement.md)).
- Opening a title rather than the app's home: depends on the second call's checks.
- A row in upstream's SHOWCASE.md once it works and is public.
