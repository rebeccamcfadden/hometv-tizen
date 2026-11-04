# Samsung (Tizen) spike: what we know so far

Written 2026-11-04 by builder-4, without the TV. Each answer says how sure it is and where it comes from. What
only the real TV can answer is in [tv-call-checklist.md](tv-call-checklist.md).

## The short version

- **It can work, as an app the family opens.** It can't replace Samsung's Home (Smart Hub), and it can't start by
  itself at power-on. Samsung's own "Autorun Last App" setting may bring it back at power-on if it was the last app
  used.
- **Opening Netflix, YouTube and the rest: yes, very likely.** Not from the page itself, but from a small background
  part of the module (its "service"), which TizenBrew runs and which keeps the TV's app-opening powers.
- **Opening one film or show inside Netflix and the others: probably not.** No known way works for Netflix, Prime
  Video, Disney+, HBO Max, Apple TV or Hulu. Three candidates are worth one try each on the TV. Plan for "Watch on
  Netflix" opening Netflix's home screen.
- **Keys without ADB: a QR to a page on the phone, as on Android.** The module's service can run a small web server
  on the home network; TizenTube's does exactly that. To be checked once on the TV.
- **The cost on the family's TV:** Developer Mode stays on for good (with "Host PC IP" set to the TV itself), and
  TizenBrew is installed once from a PC. No root, nothing flashed, and all of it can be undone from the TV's menus.
- **The biggest risks:** as a TizenBrew module it needs the internet to open at all (HomeTV as its own app, installed
  the same way as TizenBrew, fixes that: see [Working without the internet](#working-without-the-internet));
  Developer Mode may switch itself off after a Samsung update; and on 2023 and newer TVs a certificate tied to that
  TV, whose lifetime we don't know yet.

## 1. Can a module open Netflix and the rest?

**Opening the app: yes, very likely.** How sure: high for the mechanism, medium until seen on the TV.

- TizenBrew shows an app module by sending its own window to the module's page, served from
  `http://127.0.0.1:8081/module/...` (TizenBrew source, `WebSocketClient.js` and `moduleLoader.js`).
- **That page loses the TV's `tizen` functions.** The Jellyfin module had to stub them out for that reason
  ([jellyfin-tizen-npm-publish](https://github.com/GlenLowland/jellyfin-tizen-npm-publish), README and
  `tizen-adapter.js`). So the page can't call `tizen.application.launch` itself.
- **The module's service keeps them.** TizenBrew runs a module's service file inside its own background service and
  hands it the real `tizen` object (`serviceLauncher.js`: `sandbox['tizen'] = global.tizen`). TizenTube's service
  opens apps that way (`tizen.application.launchAppControl` in `service/service.js`).
- TizenBrew is installed with the `application.launch` permission, a public one (Samsung's privilege list). It
  does **not** list `application.info`, which Samsung's docs ask for to list installed apps (`getAppsInfo`). Whether
  that list works from TizenBrew is a TV question.
- So the design is: the Home tile asks the module's service over `http://127.0.0.1:<port>`, and the service calls
  `tizen.application.launch(<app id>)`.

**App ids** (from Home Assistant, homebridge and `samsung-tv-ws-api` app lists, which agree; some apps changed id in
2020, so the service tries the newer one, then the older):

| App | Ids to try (newer first) | Sure? |
|---|---|---|
| Netflix | `3201907018807`, `11101200001` | high |
| YouTube | `111299001912` | high |
| Prime Video | `3201910019365`, `3201512006785` | high |
| Disney+ | `3202204027038`, `3202009021709`, `3201901017640` | high |
| HBO Max | `3202301029760`, `3201601007230` | medium (renamed twice) |
| Apple TV | `3201807016597` | high |
| Hulu | `3201601007625` | medium |
| Peacock | `3202006020991` | medium |
| Paramount+ | `3202110025305`, `3201710014981` | medium |
| Spotify | `3201606009684` | high |
| Plex | `3201512006963` | high |
| Tubi | `3201504001965` | medium |
| Pluto TV | `3201808016802` | medium |
| The Roku Channel, Crunchyroll | none found | - |

**Opening one title inside the app: probably not.** No documented way works for Netflix, Prime Video, Disney+,
HBO Max, Apple TV or Hulu on Tizen. Three candidates, each one button on the test screen during the TV call:

1. An app control with the title's web link (`operation/view`, the same `https://www.netflix.com/title/...` links
   the Android launcher builds in `DeepLinks.java`). Unknown; cheap to try.
2. Samsung's own remote-control connection on the TV (`ws://127.0.0.1:8001`, the one phone remote apps use) with
   its "deep link" launch and the link as data. Reported to work for Netflix and Disney+ on older TVs and to be
   ignored on the newest (Tizen 9). The TV asks once to allow the connection.
3. YouTube only: DIAL, the protocol phones use to cast YouTube, with `v=<video id>`. A detailed write-up says
   today's YouTube opens a "connect your phone" pane instead of the video
   ([YTCAST.md](https://github.com/radubirsan/remotetvprogam/blob/main/YTCAST.md)).

So for now **Watch on** opens the service's app, and whether to look further or accept that is Rebecca's decision
(feedback.md, Tizen 19:32). If a candidate opens titles on the family's TV, it's a bonus for that service.

## 2. How do the household's keys get on without ADB?

**The same way as on Android: a QR on the TV opens a page on the phone.** How sure: medium until seen on the TV.

- The Android launcher serves its key page from the TV (`KeyInbox.java`, port 8766). On Tizen, the module's
  service can do the same: TizenTube's service runs a web server on all of the TV's network addresses (port 8085,
  for phones casting YouTube), so a service can be reached from a phone.
- The QR opens `http://<tv address>:8766/keys#<code>`; the page sends each key to the service, which checks it and
  keeps it in its own file on the TV. The page and the code rules can be shared with `design_preview/keys.html`.
- **Keys don't go in the page's storage:** every TizenBrew app module shares the same web address
  (`127.0.0.1:8081`), so any other module the household adds could read it. The service's file is safer, though
  services also share one process. So: no other modules on that TV unless Rebecca adds them.
- To check on the TV: that a phone on the same Wi-Fi reaches the port (the TV could block it).
- Fallback if it can't: type the keys on the TV with the remote. TMDB's short API key (32 letters and digits, not the
  long token) and Watchmode's key make that slow but possible.
- **Built (2026-11-04), in the own app, not yet tried on a TV:** a second background service, `HomeTVPages`
  (`service/pages.js`, a port of the launcher's `KeyInbox`, `KeyRules` and `ApiKeys`), serves the page on port 8766
  and keeps the keys in `hometv-keys-v1.json` in the app's `wgt-private` folder (only this app's user can read it,
  mode 0600; AeroTizen keeps its own settings there the same way). The TV's API keys screen (Home's lower row) holds
  the page open while it shows. To learn on the TV: that a second service in one package starts, that it can listen
  on all addresses and a phone reaches it, that the TV's Node checks TMDB's and the others' HTTPS certificates (an
  old Node's certificate list may not know theirs: the key is then kept as "not checked"), and the Origin the
  packaged page sends (the TV's routes trust "null" and `file://`, as AeroTizen's watcher does, and want a loopback
  Host, against DNS rebinding). A web page that hides in a sandboxed frame sends "null" too, so every `/tv/` route
  also wants a token the service writes to `wgt-private` at each start (`hometv-pages-tv-token`, 0600), which the
  screen reads with `tizen.filesystem` (`openFile`, or the older `resolve` before Tizen 5.0). To learn on the TV: that
  the page can read what the service wrote there.

## 3. What TizenBrew needs on the TV

How sure: high (TizenBrew's guide and source), except where marked.

- **Developer Mode, on for good.** In Apps, type `12345` on the remote, switch Developer mode on, enter a "Host PC IP",
  restart the TV. During the install that's the PC's address; afterwards it must be `127.0.0.1` (the TV itself).
  Each time TizenBrew opens it restarts itself in debug mode through that local connection; without it, TizenBrew
  shows an error and no module runs (`index.js`, `CanLaunchInDebug`).
- **What Developer Mode changes:** it lets the computer at the "Host PC IP" install and debug apps on the TV. With
  `127.0.0.1`, only the TV itself can. It doesn't unlock anything else or change the TV's software; it's Samsung's
  own switch for app developers. **Undo:** Apps, `12345`, Developer mode Off, restart.
- **A PC, once.** "TizenBrew Installer" (one program for Windows) on the same Wi-Fi installs TizenBrew. No Tizen
  Studio needed.
- **2023 and newer TVs (Tizen 7+):** the installer asks for a Samsung account sign-in, to make a certificate for that
  one TV. Older TVs don't need it. How long that certificate lasts, and whether TizenBrew stops opening when it
  ends, is **unknown**: an open question.
- **What TizenBrew changes:** one app, "TizenBrew", in the TV's apps; its settings file on the TV. **Undo:** remove it
  from Apps (or Settings › Support › Device Care › Manage Storage), then Developer Mode off.
- **How often it must be redone:** after the install, never, as far as anyone reports. **Unknown:** whether a Samsung
  software update or a long unplug turns Developer Mode off. If it does, it's switched on again from the remote in two
  minutes, no PC needed. A reinstall (with the PC) only if TizenBrew is removed or the certificate stops working.
- TizenBrew is free software (GPL-3.0) by one developer (reisxd), active, with a Discord and a Reddit. Our module is a
  separate web page that TizenBrew loads; it's not built from TizenBrew's code.

## 4. Can it start at power-on, or only be opened?

**Only opened, plus two helpers.** How sure: high.

- No app can replace Smart Hub or catch the remote's Home key (Samsung's key docs; no counter-example anywhere).
- **TizenBrew's "auto-launch module"** makes opening TizenBrew go straight to HomeTV (`autoLaunchModule` in its
  settings; pressing Up while it opens skips it).
- **Samsung's "Autorun Last App"** (2017-2021: Settings › General › Smart Features; 2022-2024: General & Privacy ›
  Start Screen Options) reopens the last app at power-on. If HomeTV was open last, it comes back. Samsung says some
  apps don't support it: a TV question.
- **"Start with Smart Hub Home"** (same place) can be turned off, so the TV opens on the last source instead of the
  Smart Hub bar.
- TizenBrew can also be moved to the front of the Smart Hub row, so it's one press from Home.
- **Unknown:** where Back from inside Netflix lands (HomeTV, or Smart Hub). TV question.

## 5. Memory and speed

- **The web engine is old on older TVs** (Samsung's Web Engine Specifications): 2018 Chromium 56, 2019 63, 2020 69,
  2021 76, 2022 85, 2023 94, 2024 108. So the module is built for Chromium 56 (`es2017`), with no CSS `gap` in
  flexbox before 84 (TizenBrew itself ships a polyfill for it), no `:focus-visible`, no optional chaining in the
  output. The build checks this.
- **Services may run on Node 4.4.3** (TizenBrew picks an old WebSocket library for it). So the service is written in
  plain ES5 with only Node's built-in modules, and checked with an ES5 parser.
- **Memory:** Samsung doesn't publish a figure. Its memory guide asks web apps to keep images small and DOM short. The
  design's rule for 1 GB Android TVs (no blur, no autoplaying video, short animations) fits as it is.
- **Unknown:** start time and scrolling on the family's TV. The checklist times both.

## 6. How updates reach the TV

- TizenBrew fetches the module from npm through jsDelivr's CDN **every time it opens** (`moduleLoader.js`,
  `index.js` proxy), with no copy kept on the TV. So `npm publish` is the release.
- jsDelivr may keep serving the old version **up to 7 days**; one request to its purge page makes it immediate.
- A TV can also pin a version (`npm/<name>@1.2.0`); then updating means changing it on the TV. Recommended: don't
  pin, purge after each publish, and roll back by publishing the previous version again.
- Publishing needs an npm account and a package name: a question for Rebecca later (it's public: anything on npm is
  readable by anyone, whatever the GitHub repo's visibility).

## Working without the internet

The fork's rule is that Home works offline. As a TizenBrew module it can't, and the module can't fix that by itself:

- When TizenBrew's background service starts, it asks jsDelivr for each module's `package.json`. Offline, the module
  comes back as "Unknown Module" with no page to open, so it can't be chosen or auto-launched (`moduleLoader.js`).
- Its page is fetched through TizenBrew's proxy on every open (`index.js`, `/module/...`), with no copy on the TV.

What helps, from least to most:

1. **A cached copy inside TizenBrew (partial).** The page can keep itself with a service worker: its address,
   `127.0.0.1`, counts as secure, and Chromium 56 has service workers. That brings HomeTV back offline only while
   TizenBrew's service is still running from an earlier, online start (it keeps its module list in memory). After a
   full restart with no internet it still can't open. Whether service workers work inside TizenBrew at all is a TV
   question. Cheap to add; doesn't solve it.
2. **HomeTV as its own app, installed by TizenBrew Installer (full).** The same installer that puts TizenBrew on the
   TV installs any app from a GitHub repository's latest release (`.wgt`), and on 2023+ TVs signs it with the same
   per-TV certificate it made for TizenBrew (TizenBrewInstaller `index.js`: `fetchLatestRelease`, `resignOrInstall`).
   So it costs the household nothing more than TizenBrew does: Developer Mode, the laptop once. Then:
   - **It opens offline:** its page is inside the app. When online it can fetch a newer page, keep it on the TV and
     use it next time, falling back to the copy inside the app. That's the "cached module".
   - **It doesn't need TizenBrew at all,** or its restart-in-debug-mode trick, or Host PC IP `127.0.0.1`.
   - **It keeps the TV's own functions in the page:** apps open directly, no background service needed for that.
     Its own web address, so keys in its storage are its own.
   - **Its own tile** in Samsung's app row, and Autorun Last App reopens it directly.
   - **The costs:** a new version of the app itself (not of its page) means the laptop again; the GitHub repo (or
     another public place for the release) must be public for the installer to fetch it; and on 2023+ TVs the
     certificate's lifetime is the same open question as TizenBrew's.

   This is close to what `docs/rework.md` ruled out ("an own `.wgt` through Tizen Studio"), but the reason it was
   ruled out (Tizen Studio and a certificate per TV) is handled by TizenBrew Installer here, as it is for TizenBrew.
   The three Samsung home screens in upstream's SHOWCASE (Skylight, Clean TV Home, Blocky Cabin) are all their own
   apps like this. The spike's `tizen/` folder is already that app, for the emulator.
3. **Decided** (Rebecca, 18:35): after the first TV call, HomeTV becomes its own app with the cached page, the
   TizenBrew module as a fallback; a public release only once it works. Built on AeroTizen's base
   ([launcher-replacement.md](launcher-replacement.md)).

## Risks, in order

1. **No internet, no HomeTV** (as a TizenBrew module). TizenBrew fetches the module each time it opens. Offline, it
   can't open; Smart Hub and the apps on the TV still work. See [Working without the internet](#working-without-the-internet)
   for the way around it.
2. **Developer Mode switched off** by an update or a reset: HomeTV stops opening until it's switched on again.
3. **The certificate on 2023+ TVs** may expire; renewing means the PC again.
4. **TizenBrew is one person's project.** If it stops being maintained, a newer Samsung firmware may break it.
5. **Shared space:** other TizenBrew modules can see the module page's storage; keys stay in the service's file.
6. **Opening titles** probably doesn't work, so "Watch on" opens the app's home screen.
7. **Developer Mode is a way in:** a February 2026 report (Bishop Fox, SVE-2025-50109, not yet fixed then) showed
   that whatever can reach Developer Mode's connection can run its own code on the TV. With Host PC IP set to
   `127.0.0.1` (as TizenBrew needs anyway) only the TV itself can; never leave it pointing at a laptop. See
   [jailbreak.md](jailbreak.md).

## Plan for the module

- **The page:** TypeScript and Vite, as `design_preview/`, built for Chromium 56. Home's app row first.
- **The service:** one ES5 file, Node built-ins only: opens apps, lists them if the TV allows, serves the phone key
  page, keeps the keys. Talks to the page over `http://127.0.0.1:8766`.
- **Off the TV:** the same service runs on a PC's Node with a fake `tizen` that records what it was asked to open,
  so the browser and the PC test the whole path. The Tizen TV emulator runs the page and the service as a normal
  app, to check the old engine and the real `tizen` calls (it has no Netflix, so opening apps there only shows the
  call is made).
- **The test screen** for the TV call: one button per check, each result written on screen and on a page the phone
  can open, so Rebecca reads it out or copies it instead of describing it.
- **Shared logic** with `design_preview/`: a plan in [shared-package.md](shared-package.md).

## On Samsung's TV emulator (2026-11-04)

Tizen 10 emulator, the spike as its own app (`tizen/`), signed with a Samsung certificate made with Rebecca's
account:

- **Works:** installs and opens; Home draws as designed on Samsung's web engine; the remote's keys reach the page
  (D-pad moves focus, OK presses); the page's own `tizen` calls work: it starts its background service, lists running
  apps, and `tizen.application.launch` runs (the emulator has no Netflix, so it answers "No matched application
  found", which the page shows).
- **Doesn't work on the emulator:** the background service is listed as running, but nothing answers on its local
  port, not even a status server started as the service file loads. TizenBrew, AeroTizen and Skylight all rely on
  exactly this on real TVs, so it's most likely the emulator; the first TV call checks it with TizenTube's service
  (Part C2). HomeTV as its own app doesn't need the service to open apps.
- Only Samsung-signed apps install; Tizen's own sample certificates are refused.
- How to repeat: `npm run build`, `node tools/package-tizen.mjs --profile <Samsung profile>`, `tizen install`, then
  `tools/emulator-shot.ps1` for a picture and `ecp-cli keycode` for remote keys (28 OK, 103/108/105/106 arrows).
- **On AeroTizen's base** (later the same day): the app now loads AeroTizen's ES5 platform scripts unmodified and
  runs its Home watcher as the background service. On the emulator HomeTV opens in "Samsung app" mode, AeroTizen's
  inventory lists the TV's apps (none of the streaming apps there, correctly: it lists 0 user apps), and Home draws
  in about 20 ms after the scripts load. The watcher's return-after-Home can only be seen on a real TV.
- **Background services on the emulator (evening):** starting one of the app's background services (AeroTizen's
  watcher, or the key page's service) puts a blank white window in front of HomeTV, and the service never answers on
  its port. The watcher's window goes away after a while; the key page's stays. Neither the web inspector nor the
  device log works on this emulator, so it can't be looked into further here. AeroTizen and Skylight run background
  services on real Tizen 6.5-9 TVs, so this is most likely the emulator; **it must be checked on a real TV before the
  key page is relied on** (the API keys screen starts the service the first time it opens).

**YouTube can open a video** (from AeroTizen's source, device-tested by its author): an app control to YouTube with
`operation/view` and `PAYLOAD` = `{"values":"v=<video id>"}` (its fireplace tile). That's the fourth title-link
candidate, the most likely to work; the second call's checks use it.

## Open questions for the TV (in the checklist)

1. The TV's model, year and Tizen version.
2. Does an app open from the module's service? Which id per app?
3. Does any of the three title-link candidates open a title?
4. Does `getAppsInfo` list installed apps from TizenBrew?
5. Can a phone on the Wi-Fi reach the service's port?
6. Does Autorun Last App bring HomeTV back at power-on? Where does Back from Netflix land?
7. Start time and smoothness.
8. On 2023+ TVs: the certificate's end date (the installer shows it).

## Sources

- TizenBrew: [repo](https://github.com/reisxd/TizenBrew) (read at `14760a3`, 2026-05-18), its
  [guide](https://github.com/reisxd/TizenBrew/blob/main/docs/README.md) and
  [modules guide](https://github.com/reisxd/TizenBrew/blob/main/docs/MODULES.md);
  [TizenBrew Installer](https://github.com/reisxd/TizenBrewInstaller); [TizenTube](https://github.com/reisxd/TizenTube).
- App ids: [samsung-tv-ws-api APPLICATIONS.md](https://github.com/xchwarze/samsung-tv-ws-api/blob/master/APPLICATIONS.md),
  [homebridge-samsung-tizen #26](https://github.com/tavicu/homebridge-samsung-tizen/issues/26),
  [samsung-tv-control apps.ts](https://github.com/Toxblh/samsung-tv-control/blob/master/src/apps.ts).
- Title links: [samsungctl #75](https://github.com/Ape/samsungctl/issues/75),
  [smartest-tv #8](https://github.com/Hybirdss/smartest-tv/issues/8), YTCAST.md above.
- Samsung: [Web Engine Specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html),
  [TVInputDevice](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/tvinputdevice-api.html),
  [Application API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/application-api.html),
  [privileges](https://github.com/Samsung/tizen-docs/blob/master/docs/application/web/reference/security-privileges.md),
  [Autorun Start Screen Options](https://www.samsung.com/ae/support/tv-audio-video/use-autorun-start-screen-options-on-your-samsung-tv/).
- jsDelivr: [purge](https://www.jsdelivr.com/tools/purge) ("otherwise they might wait up to 7 days").
