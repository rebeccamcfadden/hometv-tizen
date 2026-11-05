# The platform layer

HomeTV's screens and shell are the same on every TV. Only the **platform files** talk to the TV's own software, so a
port to another TV (LG's webOS: hometv-webos) copies the screens and the shell unchanged and swaps these files:

| File | What it is on Samsung |
|---|---|
| `app/src/bridge.ts` | The app list, artwork, opening apps and titles, the TV-call checks, and how HomeTV runs (own app, TizenBrew module, fake TV, preview). Exposes `bridge.platform`. |
| `app/src/platform.ts` | `bridge.platform`: key codes, buttons, names, online state, the loader hook and the key page's TV side. |
| `app/src/pageChecks.ts` | The TV-call checks the page runs itself (title links by app control, the TV's model). |
| `app/aero-glue.js`, `vendor/aerotizen/` | AeroTizen's scripts (installed apps, artwork, launching, the Home watcher). |
| `service/`, `tizen/`, `app/loader/` | Background services, packaging, and the signed-update loader. |

`tests/platform-boundary.test.mjs` fails if any other file under `app/src/` uses `tizen`, `webapis`, `AeroTizen`,
`webOS`, `PalmSystem`, `navigator.onLine` or the loader's hook, or if the shell holds Samsung key codes.

## `bridge`

| Call | Returns | Samsung |
|---|---|---|
| `connect(tries?)` | the mode: `'app'`, `'tv'`, `'fake-tv'` or `'preview'` | `tizen` + AeroTizen in the page = own app; else the TizenBrew module's service on 127.0.0.1:8766 |
| `mode()`, `problem()` | the mode; why the TV isn't reachable, or `''` | |
| `apps()` | Home's apps with `installed` true/false/null | AeroTizen's inventory, or the service |
| `installedApps()` | every app a person would open (`TvApp[]`), or null | AeroTizen's inventory, or the service's `/apps/all` |
| `appCount()` | how many apps the TV lists | |
| `artwork(key)` | image URLs for an app's tile, best first | Samsung's icon cache, through AeroTizen |
| `launch(key, name?)` | `{ ok, id, error? }` | AeroTizen's launcher, or the service's `/launch` |
| `openTitle(plan)` | `{ ok, id, linked, error? }` | an app control with the title's link, else the app's home |
| `check(name, params)`, `results()` | the TV-call checks and their saved results | `pageChecks.ts` in the own app; the service under TizenBrew |
| `setToast(fn)` | | AeroTizen's own messages go to HomeTV's toast |
| `addresses()` | the TV's addresses the service reported | |

## `bridge.platform`

| Member | What | Samsung |
|---|---|---|
| `brand`, `os` | Names shown to people: "Samsung app", "Tizen 6.5" | `'Samsung'`, `'Tizen'` |
| `credits` | Who the platform side is built on, for Settings › About | AeroTizen, by its author (MIT) |
| `keys` | keyCode → `'left' \| 'right' \| 'up' \| 'down' \| 'ok' \| 'back'` (main.ts gives it to the shell) | arrows, Enter, Return 10009, Esc, Backspace |
| `buttons` | keyCodes for `red`, `green`, `yellow`, `blue`, `info` | 403-406, 457 |
| `registerButtons(names)` | asks the TV to send these buttons (`'digits'` for 0-9) | `tizen.tvinputdevice.registerKey` |
| `online()` | false only when the TV says it's offline | `navigator.onLine` |
| `osVersion()` | the TV software's version ("5.0") for the problem report, or "" | `tizen.systeminfo.getCapability('…/platform.version')` |
| `network()` | how the TV is connected: `{ kind: 'wifi' \| 'ethernet' \| 'none' \| 'unknown', signal, name, online }` (the nav's Wi-Fi) | `systeminfo` NETWORK, then WIFI_NETWORK (name, signal), as AeroTizen's `network.js`; 'unknown' without `tizen` |
| `onNetworkChange(fn)` | calls `fn` when the connection changes; returns a stop function | NETWORK's change listener, and the page's `online`/`offline` |
| `inputs.list()` | the TV's inputs (`TvInput[]`: port, device name, connected, showing), or null | `systeminfo` VIDEOSOURCE and `tvwindow.getSource`, as AeroTizen's `inputs.js`; null without `tizen` (TizenBrew too) |
| `inputs.show(input)` | `''` when up, `'left'` (Live TV handed over), `'preview'`, or why not | HDMI and the rest: `tvwindow.setSource` + `show` full screen (privilege `tv.window`); Live TV: AeroTizen's `openNativeLiveTV` |
| `inputs.leave()`, `inputs.onChange(fn)` | hides a shown input; calls `fn` when something is plugged in | `tvwindow.hide`; VIDEOSOURCE's change listener |
| `openTvSettings(page)` | true when the TV's settings opened | Samsung's Settings app by `application.launch`, only when `getAppsInfo` lists `org.tizen.settings` or `com.samsung.tv.settings` (unchecked on a real TV); no known way to open a given page |
| `settingsWhere(page)` | where a settings page is in the TV's menus, in plain words, when it can't be opened | Samsung's menus, 2018 on |
| `started()` | tells the loader the page works (updates may then run) | `HomeTVBoot.started()` (`app/loader/boot.js`) |
| `clock()` | the TV's wall clock (date, time, weekday) and whether it shows 24 hours (`null`: can't say), for Home's top bar | `tizen.time.getCurrentDateTime()` and `getTimeFormat()`, since the page's `Date` may not follow the TV's time zone; else `Date` |
| `pageUpdates()` | the app's and page's versions, whether updates are on, a newer page ready for the next start, the last check; `null` without the loader | `HomeTVBoot.status()` (`app/loader/boot.js`) |
| `keyPages.onTv()` | a real TV (only the TV's port is tried) | `tizen` is there |
| `keyPages.start()` | starts the key page's background service | an app control to `HmTvSpike0.HomeTVPages` |
| `keyPages.token()` | the screen's token for the service's TV-only routes | read from the app's private folder (`tizen.filesystem`) |
| `keyPages.priceKeys()` | the Watchmode and Movie of the Night keys saved on the key page (v1 prices) | read from the app's private folder (`hometv-keys-v1.json`), same file as the TMDB key |
| `keyPages.address()` | the TV's own address, when the service can't say | `tizen.systeminfo` (Wi-Fi, then Ethernet) |

Keep this small: a screen that needs something new from the TV adds one member here, with its Samsung line in this
table, rather than calling the TV itself.
