# F48: AeroTizen's features, as candidates for HomeTV

For Rebecca to pick from (F48, 2026-11-04). Every feature of [AeroTizen](https://github.com/helalaou/AeroTizen)
(MIT, read at `093c2d5`), what it does, and how it fits **HomeTV on Android TV** (this fork's `launcher/`, checked
against `docs/rework.md` and `BACKLOG.md`) and **HomeTV on Samsung** (built on AeroTizen's base, Rebecca 18:38).
Nothing here is decided. Costs are rough: **S** about a day or less, **M** a few days, **L** a week or more.

**Licence for all of them:** AeroTizen is MIT. Copying its code means keeping its copyright notice; taking only the
idea needs nothing, though a credit is kind. Its own credits (LTvLauncher's layout, Apps2Samsung and tizen-sdb for
the install tool, samsung-tizen-tv-debloat's list, Simple Icons' logos, Open-Meteo and ipapi for weather) carry over
with any part that uses them.

## On the TV

| # | Feature | What it does | Android HomeTV | Samsung HomeTV | Cost (Android / Samsung) | Notes |
|---|---|---|---|---|---|---|
| 1 | **App cards from the TV's own artwork** | Each app's banner from the TV's cache; a logo and name when there's none | Already there (`AppArt`, banners from the apps) | Comes with the base | - / - | Samsung: art read from Samsung's cache, nothing bundled |
| 2 | **Cards per row, square or wide** | 3, 4 or 5 apps a row; square or rectangular cards | New. Home's row is 7 tiles; All Apps has `columns` in `config.xml` (7) | Comes with the base | S / - | A Theme or Home row apps setting; off by default |
| 3 | **Home and All apps tabs** | Favourites on Home, every app under All apps | Already there (Home row + All Apps page) | Comes with the base; HomeTV's own layout replaces it | - / S | |
| 4 | **Hold OK: Move, Add to Home, Remove from Home** | Reorder and pick Home's apps on the tile | Already there (tile menu, `tile_menu`; Home row apps pane) | Comes with the base | - / - | Android's design for the menu is still to do (BACKLOG › Tile menu) |
| 5 | **Opens at power-on, back after Home** | A background helper reopens it after Home; optional Native Home | Already there (it *is* Home on Android, plus the Home-key helpers) | Comes with the base (watcher); Native Home is experimental | - / - | Native Home changes a TV setting: [jailbreak.md](jailbreak.md) option 3 |
| 6 | **HbbTV apps** (broadcasters' red-button apps, like BBC iPlayer) | Opens them from the app list | Not applicable (no HbbTV on these Android sets) | Comes with the base; mostly a European thing | - / - | US family: little use |
| 7 | **Inputs: every HDMI port with the device's name, rename, hide** | Inputs show what's plugged in (via HDMI-CEC), can be renamed, empty ports and Live TV hidden | Partly there: Inputs list with HDMI first, CEC device names on their port, hidden inputs left out. **New:** renaming an input, hiding empty ports | Comes with the base | S-M / - | Android: names stored on the TV; off until set |
| 8 | **Still and animated backgrounds** (Snowfall, Lava, waves), speed slider, preview | Moving wallpapers drawn on the TV | Partly there: Seasonal pictures, snow or rain over them by the weather (F31), Motion settings. **New:** other animated scenes, a speed slider | Comes with the base; HomeTV's themes replace its look | M / - | Android targets 1 GB TVs: animation is benched (`tools/bench.py`); Motion Off must stop it |
| 9 | **Dynamic weather wallpapers** | Nine AI-generated scenes chosen by weather, day/night and sunset | Partly there: daylight cycle, Seasonal periods, weather snow/rain. **New:** scenes per weather | Base has it, off by default | M / - | Its scenes are AI-generated; their redistribution terms are in its `CREDITS.md`, to check before reusing the pictures |
| 10 | **Clock, date, weather in the top bar; formats; hide each** | 12/24 h and date formats from the TV, °C/°F from the region, each item can be hidden | Mostly there (clock and units follow the TV; `temperature_unit`). **New:** choosing formats, hiding each item | Comes with the base | S / - | |
| 11 | **Weather place by search, or rough location from the internet address** | Search a town, or guess from the IP (ipapi); hide the place name | Partly there: search a city (Weather pane, F-series). **New:** the IP guess, hiding the name | Comes with the base | S / - | The IP guess sends the home's address to ipapi.co: a privacy point; off by default would fit the fork's rules |
| 12 | **Network indicator: Ethernet or Wi-Fi** | Shows how the TV is connected | Already there (the Wi-Fi pill and dropdown, Ethernet when no Wi-Fi) | Comes with the base | - / - | |
| 13 | **Fireplace tile** | A tile that plays a fireplace video, with volume | New | Base has it | S-M / - | Autoplaying video is against the fork's 1 GB-TV rule unless it's only on request (a tile you open), which it is |
| 14 | **Art Mode aware (The Frame)** | Stays out of the way while The Frame shows art | Not applicable | Comes with the base | - / - | Only matters if a household has a Frame |
| 15 | **Settings: which apps show, open the app store, back to Samsung's home** | A way out to the stock home and the store | Partly there (Home row apps, All Apps). **New:** an "open the TV's own home" row | Comes with the base | S / - | Android: the stock launcher may be disabled; the row would open TV settings instead |
| 16 | **Continue Watching** (experimental) | A row of what you were watching, read from apps' own shared data; picks which apps | Planned: the Watch Next row (`docs/rework.md` "Later"; Android's own Watch Next data) | Base has it; Rebecca's Tizen-only Figma item (BACKLOG) | M-L / M | Android reads Watch Next through a system provider (a permission to check); Samsung's works on 2024 models, not every app fills it |
| 17 | **Themes: Classic and Glass; 2 languages** | Two looks; English and Russian | Already there (themes; Minimal glass logos F43); Android launcher is English | Base; HomeTV's themes replace it | - / - | |
| 18 | **Diagnostics with privacy rules** | Events kept on the TV, exported as a redacted report on request; names, addresses and titles left out | New. The fork bans analytics; this sends nothing by itself, so it fits as an on-request report | Comes with the base | M / - | A "Send a report" a family member can use during a call |
| 19 | **About shows the version and any update** | The TV says when a newer version exists | Planned: in-app updates (Family install step 5) | Comes with the base | - / - | Samsung updates still need the PC tool |

## On the PC (AeroTizen's tool)

| # | Feature | What it does | Android HomeTV | Samsung HomeTV | Cost | Notes |
|---|---|---|---|---|---|---|
| 20 | **Find the TV on the network** | Lists TVs answering on the home network | Partly there: the family installer reads the TV over ADB; finding it is new | Use the tool as it is | S / - | |
| 21 | **Certificate, sign, install, update** | One sign-in makes the per-TV certificate; installs and updates the app | Not needed (Android installs an APK; releases are signed by `tools/release.ps1`) | **Use the tool as it is** (the family installer calls it) | - / S | On this PC the standalone `.exe` is blocked by the PC's app policy; the Python install works |
| 22 | **Open an app and check it came up** | `aerotizen launch` | Already there (`tools/tv.py`) | Use as is | - / - | |
| 23 | **Restart an app with DevTools** | Debugging on the TV | Not needed (Android Studio, `adb`) | Use as is | - / - | |
| 24 | **Native Home backup, apply, restore** | Experimental Home reassignment with a saved original | Not applicable (Android's Home setting) | Optional, per model | - / - | [jailbreak.md](jailbreak.md) option 3 |
| 25 | **List apps, flag bloat, remove** | Classifies installed apps; removes on Tizen 5.5 and older | Already there in spirit (`tools/disable.sh`, `examples/` lists: disable, never uninstall) | Use as is, if ever | - / - | Removal is permanent on Samsung (no disable): against the fork's "disable, never uninstall" rule unless Rebecca says otherwise |
| 26 | **Optional untethered root** | Re-roots the TV at each start | Not applicable | **Not for family TVs** | - / - | [jailbreak.md](jailbreak.md) option 4 |
| 27 | **Redacted diagnostic export** | A ZIP of PC and TV logs, identifiers removed | New (pairs with #18) | Use as is | M / - | |

## Guides

| # | Guide | Android HomeTV | Samsung HomeTV | Notes |
|---|---|---|---|---|
| 28 | **Settings worth turning off** (ads, viewing data, autorun) | Upstream covers Android TV's own switches | Folded into [privacy.md](privacy.md) | |
| 29 | **DNS lists** (safe and aggressive tiers) | Fits PROMPT.md's DNS extra as a router option | In [privacy.md](privacy.md) | The aggressive tier stops updates: not for a family |

## Already in HomeTV, not in AeroTizen

For balance: the catalogue (Movies, TV Shows, Search, Pick for me), where to watch and prices, title previews,
TMDB lists and sign-in, phone notes, the phone remote, the API key page, Seasonal themes, the clock screensaver.
That's HomeTV's own part on Samsung too.
